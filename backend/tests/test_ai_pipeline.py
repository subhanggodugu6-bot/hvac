"""NB2 pipeline orchestrator: RLS → LSTM → Safe RL → Rules → BMS."""
from __future__ import annotations

import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

os.environ.setdefault("HVAC_ENV", "development")
os.environ.setdefault("HVAC_START_CONTROL_WORKER", "0")
os.environ.setdefault("HVAC_ALLOW_CREATE_ALL", "1")
os.environ.setdefault("HVAC_SAFE_MODE", "0")
os.environ.setdefault("HVAC_USE_AI_PIPELINE", "1")


def test_rls_features_export_defaults():
    from backend.ai.rls.features_export import enrich_records_with_rls, rls_feature_vector

    vec = rls_feature_vector("ZONE-01")
    assert "RLS_ZT_TH0" in vec
    assert "RLS_HP_READY" in vec
    rows = enrich_records_with_rls([{"Timestamp": "t1", "Indoor_Temp": 22.0}], zone_id="ZONE-01")
    assert rows[0]["RLS_ZT_TH0"] == vec["RLS_ZT_TH0"]


def test_lstm_sequences_include_rls_cols():
    from backend.ai.lstm.sequences import ALL_FEATURE_COLS, FEATURE_COLS
    from backend.ai.rls.features_export import RLS_FEATURE_COLS

    assert len(ALL_FEATURE_COLS) == len(FEATURE_COLS) + len(RLS_FEATURE_COLS)
    assert "RLS_ZT_TH0" in ALL_FEATURE_COLS


def test_pipeline_orchestrator_stages(monkeypatch):
    from backend.ai.pipeline import orchestrator as orch

    monkeypatch.setattr(orch, "run_rls_stage", lambda *a, **k: {"updated": 1, "wrote_setpoints": False})
    monkeypatch.setattr(
        orch,
        "run_lstm_stage",
        lambda *a, **k: {"forecast": {"series": {}}, "wrote_setpoints": False},
    )
    monkeypatch.setattr(
        orch,
        "run_safe_rl_stage",
        lambda *a, **k: {"code": "OK", "status": "PROPOSED", "mapped_commands": [], "wrote_setpoints": False},
    )
    monkeypatch.setattr(orch, "auto_dispatch_enabled", lambda: False)

    out = orch.run_pipeline_cycle("ZONE-01", force_rls=True)
    assert out["pipeline"] == "RLS→LSTM→SafeRL→Rules→BMS"
    assert "rls" in out["stages"]
    assert "lstm" in out["stages"]
    assert "safe_rl" in out["stages"]
    assert out["wrote_setpoints"] is False


def test_control_worker_starts_ai_pipeline(monkeypatch):
    monkeypatch.setenv("HVAC_USE_AI_PIPELINE", "1")
    started = []

    def fake_start():
        started.append("pipeline")

    import backend.workers.ai_pipeline_worker as apw

    monkeypatch.setattr(apw, "start", fake_start)
    from backend.workers import control_worker

    control_worker.start()
    assert started == ["pipeline"]
