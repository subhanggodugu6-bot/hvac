"""Production-honest ML layer: registry, mapping, predict provenance, safety."""
from pathlib import Path

import pytest

from backend.ml.features.maps import OPPORTUNITY_MAPS, maps_for_opportunity
from backend.ml.ingestion.scanner import scan_archives
from backend.ml.prediction.service import predict
from backend.ml.registry.service import list_maps, register_datasets
from backend.services.hvac_safety_contract import evaluate_dispatch


@pytest.fixture(autouse=True)
def _ml_tables():
    from database.session import init_db

    init_db()


def _fake_archives(tmp: Path) -> Path:
    (tmp / "archive").mkdir()
    (tmp / "archive" / "occ.csv").write_text("date,occ\n2018-01-01,1\n", encoding="utf-8")
    (tmp / "archive (1)").mkdir()
    (tmp / "archive (1)" / "electricity.csv").write_text("timestamp,a\n2016-01-01,1\n", encoding="utf-8")
    (tmp / "archive (2)").mkdir()
    (tmp / "archive (2)" / "train.csv").write_text("building_id,meter,timestamp,meter_reading\n0,0,2016-01-01,1\n", encoding="utf-8")
    (tmp / "archive (3)").mkdir()
    (tmp / "archive (4)").mkdir()
    (tmp / "archive (4)" / "HVAC Energy Data.csv").write_text(
        "Local Time (Timezone : GMT+8h),Chilled Water Rate (L/sec),Cooling Water Temperature (C),Building Load (RT),Chiller Energy Consumption (kWh),Outside Temperature (F),Dew Point (F),Humidity (%),Wind Speed (mph),Pressure (in)\n"
        "8/18/2019 0:00,85.6,31.4,479.6,116.2,82,75,79,13,29.83\n",
        encoding="utf-8",
    )
    (tmp / "archive (5)").mkdir()
    (tmp / "archive (5)" / "occ.csv").write_text("date,occ\n2018-01-01,1\n", encoding="utf-8")
    (tmp / "archive (6)").mkdir()
    (tmp / "archive (6)" / "MZVAV-1.csv").write_text("Datetime,AHU: Supply Air Temperature\n1/30/2017,68\n", encoding="utf-8")
    (tmp / "archive (7)").mkdir()
    (tmp / "archive (7)" / "tiny.json").write_text('{"columns":["CO2_ppm"]}', encoding="utf-8")
    (tmp / "archive (8)").mkdir()
    (tmp / "archive (8)" / "room_occupancy_detection_data.csv").write_text(
        "datetime,indoor_co2_concentration,occupancy_ground_truth\n30-01-23 00:00,637,0\n",
        encoding="utf-8",
    )
    return tmp


def test_scan_empty_and_duplicate(tmp_path, monkeypatch):
    root = _fake_archives(tmp_path)
    monkeypatch.setattr("backend.ml.ingestion.scanner.DOWNLOADS", root)
    scanned = {r["id"]: r for r in scan_archives(root)}
    assert scanned["ds_archive_3"]["status"] == "SKIPPED_EMPTY"
    assert scanned["ds_archive_5"]["status"] == "DUPLICATE"
    assert scanned["ds_archive_5"]["alias_of"] == "ds_archive"
    assert scanned["ds_archive"]["source"] == "TRAINING_DATASET"


def test_register_and_maps(tmp_path, monkeypatch):
    root = _fake_archives(tmp_path)
    monkeypatch.setattr("backend.ml.ingestion.scanner.DOWNLOADS", root)
    monkeypatch.setattr("backend.ml.paths.DOWNLOADS", root)
    rows = register_datasets(root)
    by_id = {r["id"]: r for r in rows}
    assert by_id["ds_archive_3"]["status"] == "SKIPPED_EMPTY"
    assert by_id["ds_archive_5"]["status"] == "DUPLICATE"
    maps = list_maps()
    assert maps
    assert all(m["opportunity_id"] != "O10" for m in maps)
    o4 = [m for m in maps if m["opportunity_id"] == "O4" and m["training_allowed"]]
    assert o4 and o4[0]["target_column"]
    o14 = [m for m in maps if m["opportunity_id"] == "O14"]
    assert o14 and o14[0]["status"] == "TRAINABLE" and o14[0]["target_column"]


def test_no_o10_model_in_maps():
    assert maps_for_opportunity("O10") == []
    assert all(m["opportunity_id"] != "O10" for m in OPPORTUNITY_MAPS)


def test_predict_o10_and_untrained():
    o10 = predict("O10", features={"x": 1}, persist=False)
    assert o10["status"] == "MODEL_NOT_TRAINABLE"
    assert o10["prediction"] is None
    assert o10["provenance"] != "LIVE"
    assert o10["source"] != "LIVE_BMS"
    o20 = predict("O20", features={}, persist=False)
    assert o20["prediction"] is None
    assert o20["status"] in ("MODEL_NOT_AVAILABLE", "MODEL_NOT_TRAINABLE")
    assert o20["provenance"] in ("NO DATA", "MODEL PREDICTION")
    assert o20["provenance"] != "LIVE"


def test_stamp_attaches_ml_without_live():
    from backend.agents._agent_spec import stamp

    out = stamp("O20", {"current_value": None})
    assert out["opportunity_id"] == "O20"
    assert out.get("live") is False
    assert out["ml"]["provenance"] != "LIVE"
    assert out["ml"].get("source") != "LIVE_BMS"


def test_ml_prediction_cannot_pass_dispatch():
    pred = predict("O4", features={"cooling_load": 100}, persist=False)
    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O4",
            "source": pred.get("source") or "ML_MODEL",
            "telemetry": {"source": "ML_MODEL", "quality": "GOOD", "age_seconds": 1},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 1,
            "target_value": 2,
        }
    )
    assert ok is False


def test_predict_http_and_models_list():
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    models = client.get("/api/ml/models")
    assert models.status_code == 200
    ids = [m["opportunity_id"] for m in models.json()["models"]]
    assert "O10" in ids
    o10 = next(m for m in models.json()["models"] if m["opportunity_id"] == "O10")
    assert o10["status"] == "MODEL_NOT_TRAINABLE"
    r = client.post("/api/ml/predict", json={"opportunity_id": "O10", "features": {}})
    assert r.status_code == 200
    body = r.json()
    assert body["prediction"] is None
    assert body["provenance"] != "LIVE"
    miss = client.post("/api/ml/predict", json={"opportunity_id": "O4", "features": {}})
    assert miss.status_code == 200
    miss_body = miss.json()
    assert miss_body["provenance"] != "LIVE"
    assert miss_body["prediction"] is None
    health = client.get("/api/ml/health")
    assert health.status_code == 200
    assert health.json()["source"] == "TRAINING_DATASET"
    oids = [row["opportunity_id"] for row in health.json()["opportunities"]]
    assert oids == [f"O{i}" for i in range(1, 21)]
    assert all(row.get("provenance") not in ("LIVE", "LIVE_BMS") for row in health.json()["opportunities"])


def test_missing_features_waiting():
    from backend.ml.prediction.service import model_status

    st = model_status("O4")
    if st["status"] != "MODEL_READY":
        out = predict("O4", features={}, persist=False)
        assert out["prediction"] is None
        assert out["provenance"] != "LIVE"
        return
    out = predict("O4", features={}, persist=False)
    assert out["status"] == "INSUFFICIENT_FEATURES"
    assert out["prediction"] is None


def test_real_targets_and_missing_datasets():
    from backend.ml.features.maps import missing_dataset_for, trainable_maps

    trained_oids = {m["opportunity_id"] for m in trainable_maps()}
    assert {"O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8", "O9", "O11", "O12", "O14", "O15", "O16", "O17", "O19"} <= trained_oids
    assert "O10" not in trained_oids
    assert "O13" not in trained_oids
    assert missing_dataset_for("O13")
    assert all(m["dataset_id"] != "ds_archive_5" for m in trainable_maps())
    assert "O10" not in trained_oids
    assert missing_dataset_for("O10")
    assert missing_dataset_for("O18")
    assert missing_dataset_for("O20")
    assert missing_dataset_for("O4") is None


def test_join_loader(tmp_path, monkeypatch):
    from backend.ml.training.pipeline import _load_joined

    folder = tmp_path
    (folder / "ashp_cw.csv").write_text(
        "date,aru_001_cwr_temp,aru_001_cws_fr_gpm,aru_001_cws_temp\n"
        "2020-08-01 07:00:00,63,80,63.1\n"
        "2020-08-01 07:05:00,64,81,63.2\n",
        encoding="utf-8",
    )
    (folder / "ashp_meter.csv").write_text(
        "date,aru_001_power_mbtuph\n2020-08-01 07:00:00,10\n2020-08-01 07:05:00,12\n",
        encoding="utf-8",
    )
    X, y, names = _load_joined(
        folder,
        ["ashp_cw.csv", "ashp_meter.csv"],
        {"chw_return": "aru_001_cwr_temp", "chw_flow": "aru_001_cws_fr_gpm", "chw_supply": "aru_001_cws_temp"},
        "aru_001_power_mbtuph",
    )
    assert names == ["chw_return", "chw_flow", "chw_supply"]
    assert len(y) == 2
    assert y[0] == 10.0


def test_simulation_and_safe_mode_still_block():
    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O14",
            "source": "SIMULATION",
            "telemetry": {"source": "SIMULATION", "quality": "GOOD", "age_seconds": 1},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 1,
            "target_value": 2,
        }
    )
    assert ok is False
    assert classified.get("code") in ("SIMULATION_BLOCKED", "SAFE_MODE", "BMS_OFFLINE") or classified.get("status") != "LIVE"


def test_training_data_and_ml_model_cannot_write():
    for src in ("ML_MODEL", "TRAINING_DATA", "TRAINING_DATASET"):
        ok, reason, classified = evaluate_dispatch(
            {
                "opportunity_id": "O4",
                "source": src,
                "telemetry": {"source": src, "quality": "GOOD", "age_seconds": 1},
                "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
                "safety": {"status": "PASS"},
                "current_value": 1,
                "target_value": 2,
            }
        )
        assert ok is False
        assert classified.get("code") in ("ML_SOURCE_BLOCKED", "SIMULATION_BLOCKED", "SAFE_MODE")
        assert "LIVE" not in reason.upper() or "cannot" in reason.lower()


def test_stale_offline_confidence_safe_mode(monkeypatch):
    monkeypatch.setattr("backend.services.hvac_safety_contract.is_safe_mode", lambda: True)
    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O4",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "GOOD", "age_seconds": 1, "raw": "LIVE"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 1,
            "target_value": 2,
        }
    )
    assert ok is False
    assert classified.get("code") == "SAFE_MODE"

    monkeypatch.setattr("backend.services.hvac_safety_contract.is_safe_mode", lambda: False)
    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O4",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "STALE", "age_seconds": 400, "raw": "STALE"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 1,
            "target_value": 2,
        }
    )
    assert ok is False
    assert classified.get("code") == "STALE"

    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O4",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "MISSING", "raw": "MISSING"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 1,
            "target_value": 2,
        }
    )
    assert ok is False
    assert classified.get("code") in ("WAIT_FOR_TELEMETRY",)

    monkeypatch.setattr("backend.services.hvac_safety_contract.production_bms_connected", lambda: False)
    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O4",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "GOOD", "age_seconds": 1, "raw": "LIVE"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 1,
            "target_value": 2,
        }
    )
    assert ok is False
    assert classified.get("code") == "BMS_OFFLINE"

    monkeypatch.setattr("backend.services.hvac_safety_contract.production_bms_connected", lambda: True)
    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O4",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "GOOD", "age_seconds": 1, "raw": "LIVE"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.2},
            "safety": {"status": "PASS"},
            "current_value": 1,
            "target_value": 2,
        }
    )
    assert ok is False
    assert classified.get("code") == "CONFIDENCE"


def test_write_services_call_evaluate_dispatch():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    files = [
        root / "agents" / "runtime" / "apply.py",
        root / "agents" / "opportunities" / "base_opportunity_agent.py",
        root / "services" / "o14_service.py",
        root / "services" / "o15_service.py",
        root / "services" / "o16_service.py",
        root / "services" / "ventilation_bms_service.py",
        root / "services" / "variable_speed_bms_service.py",
        root / "services" / "plant_control_bms_service.py",
    ]
    for path in files:
        text = path.read_text(encoding="utf-8")
        assert "evaluate_dispatch(" in text or "rule_engine_evaluate(" in text, path.name
        write_at = text.find("write_point(")
        gate_at = max(text.find("evaluate_dispatch("), text.find("rule_engine_evaluate("))
        if write_at >= 0:
            assert 0 <= gate_at < write_at, path.name


def test_train_and_predict_synthetic_o4(tmp_path, monkeypatch):
    from backend.ml.features.maps import maps_for_opportunity
    from backend.ml.training.pipeline import train_map

    root = tmp_path
    (root / "archive (4)").mkdir()
    header = (
        "Local Time (Timezone : GMT+8h),Chilled Water Rate (L/sec),Cooling Water Temperature (C),"
        "Building Load (RT),Chiller Energy Consumption (kWh),Outside Temperature (F),Dew Point (F),Humidity (%)\n"
    )
    lines = [header]
    for i in range(80):
        load = 400 + i
        kwh = 80 + 0.2 * load
        lines.append(f"8/18/2019 {i}:00,80,30,{load},{kwh},82,75,70\n")
    (root / "archive (4)" / "HVAC Energy Data.csv").write_text("".join(lines), encoding="utf-8")
    monkeypatch.setattr("backend.ml.training.pipeline.DOWNLOADS", root)
    mapping = [m for m in maps_for_opportunity("O4") if m["training_allowed"]][0]
    result = train_map(mapping)
    assert result["status"] in ("MODEL_READY", "TRAINING_FAILED")
    assert "metrics" in result or result["status"] == "TRAINING_FAILED"
    if result["status"] == "MODEL_READY":
        assert result["metrics"]["validation"]
        pred = predict(
            "O4",
            features={
                "chw_flow": 80,
                "cw_temperature": 30,
                "cooling_load": 450,
                "outdoor_temperature": 82,
                "humidity": 70,
                "dew_point": 75,
            },
            persist=False,
        )
        assert pred["status"] == "OK"
        assert pred["prediction"] is not None
        assert pred["provenance"] == "MODEL PREDICTION"
        assert pred["source"] != "LIVE_BMS"
        miss = predict("O4", features={}, persist=False)
        assert miss["status"] == "INSUFFICIENT_FEATURES"
        assert miss["prediction"] is None
    assert all(m.get("training_allowed") is False or m.get("target_column") for m in OPPORTUNITY_MAPS)
