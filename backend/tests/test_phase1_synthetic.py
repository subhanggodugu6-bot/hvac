"""Phase 1: Dataset plant is readable as SIMULATION; writes stay blocked; never LIVE."""
from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

os.environ.setdefault("HVAC_ENV", "development")
os.environ.setdefault("HVAC_START_CONTROL_WORKER", "0")
os.environ.setdefault("HVAC_BMS_MODE", "simulation")
os.environ["HVAC_BMS_WRITE_ENABLED"] = "0"
os.environ["HVAC_USE_SIMULATION"] = "0"
os.environ["HVAC_PLANT_MODE_PERSIST"] = "0"


@pytest.fixture()
def client():
    from database.session import init_db

    init_db()
    from backend.main import app

    with TestClient(app) as c:
        yield c


def test_dataset_status_never_live(client: TestClient):
    body = client.get("/api/platform/status").json()
    assert body["plantMode"] == "DATASET"
    assert body["bms"]["status"] == "DISCONNECTED"
    assert body["controlEnabled"] is False
    assert body["telemetry"]["status"] != "LIVE"
    assert "LIVE" not in str(body["bms"]["status"])


def test_feeder_stamps_simulation_not_live():
    from database.session import init_db
    from backend.bms.simulation_telemetry import publish_once
    from backend.services.canonical_telemetry_service import latest_points

    init_db()
    n = publish_once()
    assert n > 20
    pts = latest_points(limit=400)
    assert pts
    assert all(str(p.get("source") or "").upper() != "LIVE_BMS" for p in pts)
    assert any(str(p.get("source") or "").upper() == "SIMULATION" for p in pts)
    assert any(
        p.get("point_id") in ("ZONE-01.co_ppm", "PARK.CO") and p.get("value") is not None for p in pts
    )


def test_o11_o13_read_simulation():
    from backend.services.official_opportunity_runtime import evaluate_o11, evaluate_o13, sample_o11, sample_o13

    s11 = sample_o11()
    assert s11.get("OAT") is not None
    out11 = evaluate_o11(persist=False)
    assert out11.get("live") is False
    assert out11.get("current_state") or out11.get("current_value") is not None
    assert out11.get("bms_status") != "CONNECTED"

    s13 = sample_o13()
    assert s13.get("CO_PPM") is not None
    out13 = evaluate_o13(persist=False)
    assert out13.get("live") is False
    assert (out13.get("co") or {}).get("co_ppm") is not None or s13.get("CO_PPM") is not None


def test_all_agents_synthetic_ready_for_centre():
    from database.session import init_db
    from backend.bms.simulation_telemetry import publish_once
    from backend.services.agent_recommendation_service import build_recommendation
    from backend.services.agent_telemetry_service import get_agent_context
    from backend.services.opportunity_feature_catalog import all_opportunity_ids
    from backend.services.platform_bms_service import agent_groups

    init_db()
    publish_once()
    for oid in all_opportunity_ids():
        ctx = get_agent_context(oid)
        assert ctx["missing_features"] == [], oid
        assert ctx["status"] == "READY", oid
        assert str(ctx["telemetry"].get("classified") or "") != "LIVE"
        rec = build_recommendation(oid)
        assert rec["recommendation_status"] == "AVAILABLE", oid
        assert rec["dispatch"]["allowed"] is False
    groups = agent_groups()
    vent = next(g for g in groups if g["id"] == "ventilation")
    assert vent["opportunities"] == ["O10", "O11", "O12", "O13"]
    ids = [c["id"] for g in groups for c in g["cards"]]
    assert ids == [
        "O1", "O2", "O3", "O4",
        "O5", "O6", "O7", "O8", "O9",
        "O10", "O11", "O12", "O13",
        "O14", "O15", "O16",
        "O17", "O18", "O19", "O20",
    ]
    for card in (c for g in groups for c in g["cards"]):
        assert card["telemetry"] == "SIMULATED"
        assert card["status"] == "READY"
        assert card["recommendation"] == "AVAILABLE"
        if card["id"] in ("O9", "O17", "O18", "O19", "O20"):
            assert card["control"] in ("ADVISORY", "MAINTENANCE", "REVIEW"), card["id"]
        else:
            assert card["control"] == "WRITE DISABLED"
        assert isinstance(card.get("model"), str)
        assert card["model"]  # registry label or em dash
        assert isinstance(card.get("engine"), str) and card["engine"]
    assert all(g["controlAvailability"] == "WRITE DISABLED" for g in groups)


def test_demo_ml_models_fill_agent_centre(monkeypatch):
    """Simulation demo seeds Random Forest for trainable O's; not-trainable stay em dash."""
    monkeypatch.setenv("HVAC_BMS_MODE", "simulation")
    monkeypatch.setenv("HVAC_USE_SIMULATION", "1")
    from database.session import init_db
    from backend.ml.registry.demo_seed import ensure_demo_ml_models
    from backend.services.platform_bms_service import agent_groups

    init_db()
    ensure_demo_ml_models(force=True)
    cards = {c["id"]: c for g in agent_groups() for c in g["cards"]}
    trainable = {
        "O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8", "O9",
        "O11", "O12", "O14", "O15", "O16", "O17", "O19",
    }
    not_trainable = {"O10", "O13", "O18", "O20"}
    for oid in trainable:
        assert cards[oid]["model"] == "Random Forest", oid
        assert cards[oid]["engine"] == "Random Forest", oid
    assert cards["O10"]["engine"] == "Enthalpy rules"
    assert cards["O13"]["engine"] == "CO thresholds"
    assert cards["O18"]["engine"] == "Training records"
    assert cards["O20"]["engine"] == "Controls review"
    for oid in not_trainable:
        assert cards[oid]["model"] == cards[oid]["engine"], oid
    # Idempotent when registry already covered
    assert ensure_demo_ml_models(force=True) == 0


def test_sim_writes_enable_agent_centre_control(monkeypatch):
    monkeypatch.setenv("HVAC_BMS_MODE", "simulation")
    monkeypatch.setenv("HVAC_USE_SIMULATION", "1")
    monkeypatch.setenv("HVAC_ALLOW_SIM_WRITES", "1")
    monkeypatch.setenv("HVAC_SAFE_MODE", "0")
    monkeypatch.setenv("HVAC_RULE_ENGINE_STRICT", "0")
    monkeypatch.setenv("HVAC_SCHEDULE_START_HOUR", "0")
    monkeypatch.setenv("HVAC_SCHEDULE_END_HOUR", "24")
    monkeypatch.setenv("HVAC_STAGE_G_WRITABLE_POINTS", "AHU-01.sat_setpoint")
    from database.session import init_db
    from backend.bms.command_writer import simulated_writes_allowed, write_point
    from backend.bms.simulation_telemetry import publish_once
    from backend.services.hvac_safety_contract import evaluate_dispatch
    from backend.services.opportunity_feature_catalog import catalog_for
    from backend.services.platform_bms_service import agent_groups, platform_snapshot

    init_db()
    publish_once()
    assert simulated_writes_allowed() is True
    snap = platform_snapshot()
    assert snap["controlEnabled"] is True
    assert snap["writeEnabled"] is True
    out = write_point("AHU-01.sat_setpoint", 13.1)
    assert out.success is True
    assert out.code == "SIM_WRITE"
    ok, _, classified = evaluate_dispatch(
        {
            "telemetry": {"quality": "GOOD", "age_seconds": 1, "source": "SIMULATION", "raw": "GOOD"},
            "source": "SIMULATION",
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 13.0,
            "target_value": 13.1,
            "opportunity_id": "O3",
        }
    )
    assert ok is True
    assert classified.get("code") == "SIM_DISPATCH_OK"
    groups = agent_groups()
    cards = [c for g in groups for c in g["cards"]]
    assert all(c["control"] == "SIM WRITE ENABLED" for c in cards if c["id"] not in ("O9", "O17", "O18", "O19", "O20"))
    cards_by_id = {c["id"]: c for c in cards}
    assert cards_by_id["O9"]["control"] == "REVIEW"
    assert cards_by_id["O17"]["control"] == "ADVISORY"
    assert cards_by_id["O18"]["control"] == "ADVISORY"
    assert cards_by_id["O19"]["control"] == "MAINTENANCE"
    assert cards_by_id["O20"]["control"] == "REVIEW"
    assert all(isinstance(c.get("model"), str) and c["model"] for c in cards)
    assert all(g["controlAvailability"] == "SIM WRITE ENABLED" for g in groups)
    # Ops / review kinds still never dispatch plant writes
    from backend.services.agent_recommendation_service import build_recommendation

    for oid in ("O9", "O17", "O18", "O19", "O20"):
        rec = build_recommendation(oid)
        assert rec["dispatch"]["allowed"] is False, oid
        assert catalog_for(oid).get("kind") in ("ADVISORY", "MAINTENANCE", "REVIEW")


def test_o15_o16_read_simulation_catalog():
    from database.session import init_db
    from backend.bms.simulation_telemetry import publish_once
    from backend.services.o15_service import sample_o15
    from backend.services.o16_service import sample_o16
    from backend.services.agent_telemetry_service import get_agent_context

    init_db()
    publish_once()
    s15 = sample_o15()
    assert s15.get("HEAD_PRESSURE") is not None
    assert str(s15.get("source") or "").upper() != "LIVE_BMS"
    s16 = sample_o16()
    assert s16.get("CEWT") is not None or s16.get("COND_TEMP") is not None
    for oid in ("O11", "O13", "O15", "O16"):
        ctx = get_agent_context(oid)
        assert ctx["missing_features"] == []
        assert ctx["telemetry"]["source"] != "LIVE_BMS"
        assert str(ctx["telemetry"].get("classified") or "") != "LIVE"


def test_simulation_cannot_pass_write_gate(client: TestClient):
    from backend.services.hvac_safety_contract import evaluate_dispatch

    ok, _, classified = evaluate_dispatch(
        {
            "telemetry": {"quality": "GOOD", "age_seconds": 1, "source": "SIMULATION", "raw": "GOOD"},
            "source": "SIMULATION",
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS"},
            "current_value": 22,
            "target_value": 23,
            "approval_status": "APPROVED",
            "opportunity_id": "O15",
        }
    )
    assert ok is False
    assert classified.get("code") in ("SIMULATION_BLOCKED", "WRITE_DISABLED", "NOT_LIVE")
    rec = client.get("/api/agents/O15/recommendation").json()
    assert rec["dispatch"]["allowed"] is False
    assert rec["dispatch"]["code"] != "DISPATCH_OK"


def test_live_bms_mode_no_simulator_fallback(monkeypatch):
    monkeypatch.setenv("HVAC_PLANT_MODE_PERSIST", "1")
    monkeypatch.setenv("HVAC_BMS_MODE", "simulation")
    from database.session import init_db
    from backend.agents.scheduling_supervisory.gateway import (
        SimulatorBMSGateway,
        get_bms_gateway,
        reset_bms_gateway,
    )
    from backend.bms.connection_manager import is_simulation_mode
    from backend.services.platform_ops_service import set_plant_mode

    init_db()
    set_plant_mode("LIVE_BMS")
    reset_bms_gateway()
    assert is_simulation_mode() is False
    gw = get_bms_gateway()
    assert not isinstance(gw, SimulatorBMSGateway)
    set_plant_mode("DATASET")
    reset_bms_gateway()
    assert is_simulation_mode() is True
    assert isinstance(get_bms_gateway(), SimulatorBMSGateway)
    set_plant_mode("DATASET")


def test_pages_hydrate_synthetic_dataset(monkeypatch):
    monkeypatch.setenv("HVAC_USE_SIMULATION", "1")
    monkeypatch.setenv("HVAC_ALLOW_SIM_WRITES", "1")
    from database.session import init_db
    from backend.bms.simulation_telemetry import hydrate_synthetic_dataset
    from backend.services.canonical_telemetry_service import latest_points
    from backend.services.hvac_operations_maintenance_module import get_dashboard as om_dashboard
    from backend.services.platform_bms_service import plant_overview
    from backend.services.ventilation_opportunity_service import get_dashboard as vent_dashboard

    init_db()
    n = hydrate_synthetic_dataset()
    assert n > 20
    pts = latest_points(limit=400)
    assert any(str(p.get("source") or "").upper() == "SIMULATION" for p in pts)
    plant = plant_overview()
    assert plant["chillers"]
    assert plant["ahus"]
    assert plant["pumps"]
    assert plant["vfds"]
    vent = vent_dashboard()
    assert vent.get("opportunities")
    om = om_dashboard()
    assert om.get("opportunities")
    from backend.services.o2_service import o2_service
    from backend.services.o3_service import o3_service
    from backend.services.o4_service import o4_service
    from backend.services.o14_service import sample_o14
    from backend.agents.plant_control.o5_duct_static_pressure.engine import o5_agent

    z = o2_service.get_zones()
    assert len(z) >= 8
    assert o2_service.get_state()["kpis"]["optimization_status"] != "WAIT_FOR_TELEMETRY"
    assert o3_service.get_zones()
    assert o3_service.get_state()["kpis"]["current_sat"]
    assert o4_service.get_cooling_load().get("current_load_tons") is not None
    sampled = sample_o14("any-building")
    assert sampled.get("INDEX_DP") is not None or sampled.get("FLOW") is not None
    o5 = o5_agent.generate_and_evaluate_candidates()
    assert o5.get("vav_zones")
    assert o5.get("ninety_pct_damper_pct") is not None
    assert o5.get("critical_zone_id")
    from database.session import SessionLocal
    from database.models import PlantControlTelemetryDB, ZoneTelemetryDB
    from database.models_ventilation import HvacTelemetryDB
    from database.models_om import OmTelemetryDB
    from database.models_vs import VariableSpeedTelemetryDB
    from database.models_energy_ops import EnergyTelemetryDB
    from database.models_o1 import O1TelemetrySampleDB

    db = SessionLocal()
    try:
        assert db.query(PlantControlTelemetryDB).filter_by(source="SIMULATION").count() > 0
        assert db.query(HvacTelemetryDB).filter_by(source="SIMULATION").count() > 0
        assert db.query(OmTelemetryDB).filter_by(source="SIMULATION").count() > 0
        assert db.query(ZoneTelemetryDB).count() > 0
        assert db.query(VariableSpeedTelemetryDB).filter_by(source="SIMULATION").count() > 0
        assert db.query(EnergyTelemetryDB).filter_by(source="SIMULATION").count() > 0
        assert db.query(O1TelemetrySampleDB).count() > 0
    finally:
        db.close()

