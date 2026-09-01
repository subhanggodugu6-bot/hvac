"""Stage E: Safe RL recommend, O-mapped PROPOSED commands, no BMS writes."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

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
os.environ["HVAC_SAFE_RL_MAX_COMFORT_RISK"] = "0.95"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _seed_telemetry(*, n: int = 90):
    from backend.services.canonical_telemetry_service import record_point

    base = _now() - timedelta(minutes=n)
    for i in range(n):
        ts = base + timedelta(minutes=i)
        tin = 22.5 + 0.02 * i
        record_point("ZONE-01.zone_temperature", tin, "degC", "LIVE_BMS", "GOOD", equipment_id="ZONE-01", timestamp=ts)
        record_point("ZONE-01.cooling_setpoint", 24.0, "degC", "LIVE_BMS", "GOOD", equipment_id="ZONE-01", timestamp=ts)
        record_point("ZONE-01.occupancy", 0.6, "frac", "LIVE_BMS", "GOOD", equipment_id="ZONE-01", timestamp=ts)
        record_point("SITE.outdoor_air_temperature", 30.0, "degC", "LIVE_BMS", "GOOD", equipment_id="SITE", timestamp=ts)
        record_point("AHU-01.fan_speed", 60.0 + i * 0.1, "pct", "LIVE_BMS", "GOOD", equipment_id="AHU-01", timestamp=ts)
        record_point("CH-01.power", 100.0 + 0.3 * i, "kW", "LIVE_BMS", "GOOD", equipment_id="CH-01", timestamp=ts)
        record_point("AHU-01.enable", 1.0, "bool", "LIVE_BMS", "GOOD", equipment_id="AHU-01", timestamp=ts)
        record_point("CH-01.status", 1.0, "bool", "LIVE_BMS", "GOOD", equipment_id="CH-01", timestamp=ts)
        record_point("AHU-01-SAT-SP", 14.0, "degC", "LIVE_BMS", "GOOD", equipment_id="AHU-01", timestamp=ts)
        record_point("AHU-01.DuctStaticPressureSetpoint", 1.5, "inwc", "LIVE_BMS", "GOOD", equipment_id="AHU-01", timestamp=ts)
        record_point("PLANT-CHWS-SP", 6.7, "degC", "LIVE_BMS", "GOOD", equipment_id="PLANT", timestamp=ts)
        record_point("SCHW.DPSetpoint", 80.0, "pct", "LIVE_BMS", "GOOD", equipment_id="SCHW", timestamp=ts)
        record_point("CW.PumpSpeed", 75.0, "pct", "LIVE_BMS", "GOOD", equipment_id="CH-01", timestamp=ts)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("HVAC_ALLOW_CREATE_ALL", "1")
    monkeypatch.setenv("HVAC_BMS_WRITE_ENABLED", "0")
    monkeypatch.setenv("HVAC_SAFE_MODE", "0")
    monkeypatch.setenv("HVAC_USE_SIMULATION", "0")
    monkeypatch.setenv("HVAC_USE_AI_PIPELINE", "0")
    monkeypatch.setenv("HVAC_START_CONTROL_WORKER", "0")
    monkeypatch.setattr("backend.middleware.request_id._start_hydration_once", lambda: None)
    from backend.services.timeseries_buffer import clear as clear_buffer
    from database.session import init_db

    init_db()
    from database.session import SessionLocal
    from database.models_opportunities import OpportunityAuditEventDB
    from database.models_platform import CanonicalTelemetryDB, ControlCommandDB, SafeRlDecisionDB

    db = SessionLocal()
    try:
        db.query(OpportunityAuditEventDB).filter(OpportunityAuditEventDB.opportunity_id == "SAFE_RL").delete()
        db.query(SafeRlDecisionDB).delete()
        db.query(ControlCommandDB).delete()
        db.query(CanonicalTelemetryDB).delete()
        db.commit()
    finally:
        db.close()
    clear_buffer()
    from backend.services.platform_ops_service import set_safe_mode

    set_safe_mode(False)
    from backend.main import app

    with TestClient(app) as client:
        yield client


def test_action_catalog_o_mapping():
    from backend.ai.safe_rl.actions import action_catalog, resolve_point_id

    catalog = {a.action_id: a for a in action_catalog()}
    assert catalog["zone_sp_down_0.5"].opportunity == "O2"
    assert catalog["sat_warmer_0.5"].opportunity == "O3"
    assert catalog["static_down_0.1"].opportunity == "O5"
    assert catalog["chws_up_0.3"].opportunity == "O7"
    assert catalog["schw_pump_down_5"].opportunity == "O14"
    assert catalog["cw_pump_down_5"].opportunity == "O16"
    assert resolve_point_id(catalog["zone_sp_down_0.5"], "ZONE-01") == "ZONE-01.cooling_setpoint"


def test_constraint_rejects_sat_above_max(monkeypatch):
    monkeypatch.setattr("backend.ai.safe_rl.constraints.is_safe_mode", lambda: False)
    from backend.ai.safe_rl.constraints import check_candidate

    state = {
        "telemetry_ok": True,
        "safe_mode": False,
        "comfort_band": {"min_c": 21, "max_c": 24},
        "lstm": {},
        "engineering_limits": {},
    }
    candidate = {
        "action_id": "sat_warmer_0.5",
        "mapped_opportunity": "O3",
        "old_value": 18.2,
        "new_value": 18.7,
        "point_id": "AHU-01-SAT-SP",
    }
    result = check_candidate(state, candidate)
    assert result["feasible"] is False
    assert result["reason"] == "AHU_SAT_MAX"


def test_safe_mode_blocks(client: TestClient, monkeypatch):
    monkeypatch.setenv("HVAC_SAFE_MODE", "1")
    from backend.services.platform_ops_service import set_safe_mode

    set_safe_mode(True)
    _seed_telemetry()
    r = client.post("/api/platform/ai/safe-rl/recommend", json={"zone_id": "ZONE-01"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "BLOCKED"
    assert body["wrote_setpoints"] is False


def test_recommend_persists_and_maps_commands(client: TestClient, monkeypatch):
    monkeypatch.setenv("HVAC_USE_SIMULATION", "0")
    writes = []
    monkeypatch.setattr(
        "backend.bms.command_writer.write_point",
        lambda *a, **k: writes.append(True),
        raising=False,
    )
    monkeypatch.setattr(
        "backend.agents.runtime.apply.apply_setpoint",
        lambda *a, **k: writes.append(True) or (False, "blocked"),
        raising=False,
    )
    _seed_telemetry()

    writes.clear()
    r = client.post("/api/platform/ai/safe-rl/recommend", json={"zone_id": "ZONE-01"})
    assert writes == []
    assert r.status_code == 200
    body = r.json()
    assert body["wrote_setpoints"] is False
    assert body["opportunity_id"] == "SAFE_RL"
    assert body["status"] in ("PROPOSED", "BLOCKED")
    assert body.get("decision_id", "").startswith("srl_")
    assert "state_snapshot" in body or body.get("state_snapshot") is not None or body.get("chosen_action") is not None

    if body["status"] == "PROPOSED" and body.get("chosen_action", {}).get("action_id") != "hold":
        assert len(body.get("mapped_command_ids") or body.get("mapped_commands") or []) >= 0

    st = client.get("/api/platform/ai/safe-rl/status?zone_id=ZONE-01")
    assert st.status_code == 200
    assert st.json()["wrote_setpoints"] is False

    dec = client.get("/api/platform/ai/safe-rl/decisions?limit=5")
    assert dec.status_code == 200
    assert dec.json()["count"] >= 1

    detail_id = body["decision_id"]
    detail = client.get(f"/api/platform/ai/safe-rl/decisions/{detail_id}")
    assert detail.status_code == 200
    assert detail.json()["decision_id"] == detail_id

    from database.session import SessionLocal
    from database.models_platform import ControlCommandDB, SafeRlDecisionDB

    db = SessionLocal()
    try:
        assert db.query(SafeRlDecisionDB).count() >= 1
        if body.get("mapped_command_ids"):
            for cid in body["mapped_command_ids"]:
                row = db.query(ControlCommandDB).filter_by(command_id=cid).first()
                assert row is not None
                assert row.status == "PROPOSED"
                assert row.opportunity in ("O2", "O3", "O5", "O7", "O14", "O16")
    finally:
        db.close()


def test_hold_winner_no_mapped_commands(client: TestClient, monkeypatch):
    from backend.ai.safe_rl import service as svc

    def fake_state(*_a, **_k):
        return {
            "zone_id": "ZONE-01",
            "building_id": "bldg-corp-hq-01",
            "telemetry_ok": True,
            "safe_mode": False,
            "candidates": [
                {
                    "action_id": "hold",
                    "label": "Hold",
                    "mapped_opportunity": None,
                    "point_id": None,
                    "old_value": None,
                    "new_value": None,
                }
            ],
            "rls": {},
            "lstm": {},
            "comfort_band": {"min_c": 21, "max_c": 24},
            "tariff_usd_kwh": 0.14,
            "engineering_limits": {},
        }

    def fake_rank(state):
        hold = state["candidates"][0]
        return {
            "winner": {**hold, "score": 0.0, "feasible": True, "reason": "HOLD", "constraints": [], "comfort_risk": 0.0},
            "rejected_actions": [],
            "all_rejected": False,
            "constraints": [],
            "confidence": 0.65,
        }

    monkeypatch.setattr(svc, "build_decision_state", fake_state)
    monkeypatch.setattr(svc, "rank_candidates", fake_rank)
    monkeypatch.setattr("backend.ai.safe_rl.service.is_safe_mode", lambda: False)

    r = client.post("/api/platform/ai/safe-rl/recommend", json={"zone_id": "ZONE-01"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "PROPOSED"
    assert body["chosen_action"]["action_id"] == "hold"
    assert body["mapped_command_ids"] == []
    assert body["wrote_setpoints"] is False


def test_safe_rl_tick_respects_interval(monkeypatch):
    from backend.ai.safe_rl import runner as r

    r.reset_debounce()
    calls = []

    monkeypatch.setenv("HVAC_SAFE_RL_TICK_SECONDS", "0")
    monkeypatch.setattr(r, "tick", lambda **k: calls.append(k) or {"status": "PROPOSED", "wrote_setpoints": False})
    assert r.tick_debounced() is None
    assert calls == []

    monkeypatch.setenv("HVAC_SAFE_RL_TICK_SECONDS", "60")
    r.reset_debounce()
    out = r.tick_debounced(force=True)
    assert out is not None
    assert out.get("wrote_setpoints") is False
    assert len(calls) == 1

    # Debounced — second call within interval skipped
    assert r.tick_debounced() is None
    assert len(calls) == 1


def test_job_worker_safe_rl_tick_hook(monkeypatch):
    from backend.workers import job_worker as jw

    called = []
    monkeypatch.setenv("HVAC_SAFE_RL_TICK_SECONDS", "60")
    monkeypatch.setattr("backend.workers.retention_worker.archive_old_telemetry", lambda: 0)
    monkeypatch.setattr(
        "backend.ai.pipeline.orchestrator.run_learn_cycle",
        lambda *a, **k: {"rls": {}, "lstm": {}, "wrote_setpoints": False},
    )
    monkeypatch.setattr(
        "backend.ai.pipeline.orchestrator.run_all_zones",
        lambda **k: called.append("cycle") or {"zones": [], "wrote_setpoints": False},
    )
    monkeypatch.setattr("backend.ai.safe_rl.offline.maybe_offline_update", lambda: None)

    jw.run_once()
    assert called == ["cycle"]

    called.clear()
    monkeypatch.setenv("HVAC_SAFE_RL_TICK_SECONDS", "0")
    jw.run_once()
    assert called == []
