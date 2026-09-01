"""Stage D: LSTM sequences, train/infer, APIs, no BMS writes."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

os.environ["HVAC_ENV"] = "development"
os.environ["HVAC_START_CONTROL_WORKER"] = "0"
os.environ["HVAC_ALLOW_CREATE_ALL"] = "1"
os.environ["HVAC_SAFE_MODE"] = "0"
os.environ["HVAC_BMS_WRITE_ENABLED"] = "0"
os.environ["HVAC_USE_SIMULATION"] = "0"
os.environ["HVAC_PLANT_MODE_PERSIST"] = "0"
os.environ["HVAC_LSTM_EPOCHS"] = "25"
os.environ["HVAC_LSTM_MAE_READY_TEMP"] = "2.0"
os.environ["HVAC_LSTM_MAE_READY_POWER"] = "50"
os.environ["HVAC_LSTM_MAE_READY_OCC"] = "0.5"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("HVAC_ALLOW_CREATE_ALL", "1")
    monkeypatch.setenv("HVAC_BMS_WRITE_ENABLED", "0")
    from backend.services.timeseries_buffer import clear as clear_buffer
    from database.session import init_db

    init_db()
    from database.session import SessionLocal
    from database.models_ml import MLModelMetricsDB, MLModelRegistryDB, MLPredictionDB, MLTrainingRunDB
    from database.models_platform import CanonicalTelemetryDB

    db = SessionLocal()
    try:
        db.query(MLPredictionDB).filter(MLPredictionDB.opportunity_id == "LSTM").delete()
        db.query(MLTrainingRunDB).filter(MLTrainingRunDB.opportunity_id == "LSTM").delete()
        for mid in (
            "mdl-lstm-zone-temp-v1",
            "mdl-lstm-hvac-power-v1",
            "mdl-lstm-energy-v1",
            "mdl-lstm-occupancy-v1",
        ):
            db.query(MLModelMetricsDB).filter_by(model_id=mid).delete()
            db.query(MLModelRegistryDB).filter_by(id=mid).delete()
        db.query(CanonicalTelemetryDB).delete()
        db.commit()
    finally:
        db.close()
    clear_buffer()
    from backend.main import app

    with TestClient(app) as client:
        yield client


def test_iter_windows_shapes():
    from backend.ai.lstm.sequences import FEATURE_COLS, iter_windows

    n, f = 200, len(FEATURE_COLS)
    matrix = np.random.randn(n, f)
    for L, H in ((30, 15), (60, 60)):
        X, y = iter_windows(matrix, L, H, target_col=0)
        assert X.shape == (n - L - H + 1, L, f)
        assert y.shape == (n - L - H + 1, H)


def test_insufficient_sequence_code():
    from backend.ai.lstm.sequences import ALL_FEATURE_COLS, build_feature_matrix, iter_windows, FEATURE_COLS

    matrix = np.zeros((10, len(FEATURE_COLS)))
    X, y = iter_windows(matrix, lookback=60, horizon=60, target_col=0)
    assert X.shape[0] == 0
    assert y.shape[0] == 0
    empty, stamps = build_feature_matrix([])
    assert empty.shape == (0, len(ALL_FEATURE_COLS))
    assert stamps == []


def test_sequence_api_and_status(client: TestClient):
    r = client.get("/api/platform/ai/lstm/status")
    assert r.status_code == 200
    body = r.json()
    assert body["opportunity_id"] == "LSTM"
    assert body["wrote_setpoints"] is False
    assert len(body["models"]) == 4

    r2 = client.get("/api/platform/ai/lstm/sequence?zone_id=ZONE-01&lookback_min=60&horizon_min=60")
    assert r2.status_code == 200
    seq = r2.json()
    assert seq["code"] in ("OK", "INSUFFICIENT_SEQUENCE")
    assert "X" not in seq
    assert "matrix" not in seq


def test_forecast_no_write_side_effects(client: TestClient, monkeypatch):
    monkeypatch.setenv("HVAC_BMS_WRITE_ENABLED", "0")
    writes = []

    def _deny(*_a, **_k):
        writes.append(True)
        raise AssertionError("command_writer must not be called")

    monkeypatch.setattr("backend.bms.command_writer.write_point", _deny, raising=False)
    r = client.get("/api/platform/ai/lstm/forecast?zone_id=ZONE-01&lookback_min=60")
    assert r.status_code == 200
    body = r.json()
    assert body["wrote_setpoints"] is False
    assert body["horizons_min"] == [15, 30, 45, 60]
    assert body["provenance"] == "MODEL PREDICTION"
    assert writes == []


def _synthetic_dataset(target: str = "zone_temp", L: int = 30, H: int = 60, n_win: int = 80):
    from backend.ai.lstm.sequences import FEATURE_COLS, TARGET_FIELD

    f = len(FEATURE_COLS)
    tcol = FEATURE_COLS.index(TARGET_FIELD[target])
    rng = np.random.default_rng(42)
    # smooth sinusoid so LSTM can fit under MAE gate
    t = np.linspace(0, 8 * np.pi, n_win + L + H)
    base = 22.0 + 1.2 * np.sin(t)
    matrix = np.zeros((n_win + L + H, f))
    for j in range(f):
        matrix[:, j] = base + 0.05 * j + 0.01 * rng.normal(size=matrix.shape[0])
    matrix[:, tcol] = base + 0.005 * rng.normal(size=matrix.shape[0])
    xs = []
    ys = []
    for i in range(n_win):
        xs.append(matrix[i : i + L])
        ys.append(matrix[i + L : i + L + H, tcol])
    X = np.stack(xs)
    y = np.stack(ys)
    stamps = [(_now() - timedelta(minutes=n_win + L + H - i)).isoformat() for i in range(matrix.shape[0])]
    return {
        "code": "OK",
        "zone_id": "ZONE-01",
        "target": target,
        "lookback_min": 30,
        "step_seconds": 60,
        "n_rows": int(matrix.shape[0]),
        "n_windows": n_win,
        "horizons": {str(h): {"n_windows": n_win} for h in (15, 30, 45, 60)},
        "feature_cols": list(FEATURE_COLS),
        "X": X,
        "y": y,
        "matrix": matrix,
        "timestamps": stamps,
        "L": L,
        "H": H,
        "target_col": tcol,
    }


@pytest.mark.skipif(
    __import__("importlib").util.find_spec("torch") is None,
    reason="torch optional — install backend/requirements-lstm.txt",
)
def test_train_ready_and_forecast_horizons(client: TestClient, monkeypatch, tmp_path):
    pytest.importorskip("torch")
    from backend.ai.lstm import train as train_mod

    art = Path(tmp_path) / "lstm"
    art.mkdir(parents=True)
    monkeypatch.setattr(train_mod, "_artifact_dir", lambda *_a, **_k: art)

    def fake_build(*_a, **kwargs):
        return _synthetic_dataset(target=kwargs.get("target", "zone_temp"))

    monkeypatch.setattr(train_mod, "build_dataset", fake_build)
    monkeypatch.setattr("backend.ai.lstm.infer.build_dataset", fake_build)

    r = client.post(
        "/api/platform/ai/lstm/train",
        json={"zone_id": "ZONE-01", "targets": ["zone_temp"], "lookback_min": 30},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["wrote_setpoints"] is False
    assert body["torch"] is True
    one = body["results"][0]
    assert one["code"] == "OK"
    assert one["status"] == "MODEL_READY"
    assert str(one["model_id"]).startswith("mdl-lstm-zone-temp-v1")
    assert any(art.rglob("*.pkl"))

    st = client.get("/api/platform/ai/lstm/status").json()
    zt = next(m for m in st["models"] if m["target"] == "zone_temp")
    assert zt["status"] == "MODEL_READY"
    assert zt["model_type"] == "LSTM"

    fc = client.get("/api/platform/ai/lstm/forecast?zone_id=ZONE-01&lookback_min=30").json()
    assert fc["wrote_setpoints"] is False
    series = fc["series"]["zone_temp"]
    assert series is not None
    assert [p["horizon_min"] for p in series["points"]] == [15, 30, 45, 60]


def test_train_torch_required_when_missing(client: TestClient, monkeypatch):
    monkeypatch.setattr("backend.ai.lstm.train.torch_available", lambda: False)
    r = client.post("/api/platform/ai/lstm/train", json={"zone_id": "ZONE-01", "targets": ["zone_temp"]})
    assert r.status_code == 200
    body = r.json()
    assert body["results"][0]["code"] == "TORCH_REQUIRED"
    assert body["wrote_setpoints"] is False
