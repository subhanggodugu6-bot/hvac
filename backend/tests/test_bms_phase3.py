"""Phase 3: agents consume canonical telemetry; writes stay disabled."""
from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

os.environ["HVAC_ENV"] = "development"
os.environ["HVAC_START_CONTROL_WORKER"] = "0"
os.environ["HVAC_ALLOW_CREATE_ALL"] = "1"
os.environ["HVAC_SAFE_MODE"] = "0"
os.environ["HVAC_BMS_MODE"] = "simulation"
os.environ["HVAC_BMS_WRITE_ENABLED"] = "0"
os.environ["HVAC_DEPLOYMENT_MODE"] = "local"

from backend.services.opportunity_feature_catalog import CATALOG, all_opportunity_ids


@pytest.fixture()
def client():
    from database.session import init_db, SessionLocal
    from database.models_platform import CanonicalTelemetryDB

    init_db()
    db = SessionLocal()
    try:
        db.query(CanonicalTelemetryDB).delete()
        db.commit()
    finally:
        db.close()
    from backend.main import app

    with TestClient(app) as c:
        yield c
    db = SessionLocal()
    try:
        db.query(CanonicalTelemetryDB).delete()
        db.commit()
    finally:
        db.close()


def _seed(oid: str, *, source="LIVE_BMS", quality="GOOD", value=12.5, skip=None):
    from backend.services.canonical_telemetry_service import record_point
    from backend.bms.point_mapper import resolve_canonical_name

    skip = skip or set()
    spec = CATALOG[oid]
    for req in spec["required"]:
        if req["name"] in skip:
            continue
        pid = f"{req['equipment_id']}.{resolve_canonical_name(req['canonical_point'])}"
        val = 0.0 if req["name"] == "occupancy" else value
        record_point(pid, val, "unit", source, quality, equipment_id=req["equipment_id"])


def test_missing_required_waiting(client: TestClient):
    from backend.services.agent_telemetry_service import get_agent_context

    ctx = get_agent_context("O3")
    assert ctx["status"] == "WAITING_FOR_TELEMETRY"
    assert "supply_air_temperature" in ctx["missing_features"]
    assert ctx["features"]["supply_air_temperature"]["value"] is None


def test_o13_does_not_use_co2_as_co(client: TestClient):
    from backend.services.canonical_telemetry_service import record_point
    from backend.services.agent_telemetry_service import get_agent_context

    record_point("AHU-01.co2", 800, "ppm", "LIVE_BMS", "GOOD", equipment_id="AHU-01")
    record_point("ZONE-01.occupancy", 1, None, "LIVE_BMS", "GOOD", equipment_id="ZONE-01")
    record_point("AHU-01.oa_damper", 40, "%", "LIVE_BMS", "GOOD", equipment_id="AHU-01")
    ctx = get_agent_context("O13")
    assert "co_ppm" in ctx["missing_features"]
    assert ctx["status"] == "WAITING_FOR_TELEMETRY"


@pytest.mark.parametrize("oid", all_opportunity_ids())
def test_context_endpoint_every_opportunity(client: TestClient, oid: str):
    res = client.get(f"/api/agents/{oid}/context")
    assert res.status_code == 200
    body = res.json()
    assert body["opportunity"] == oid
    assert body["control"] == "WRITE_DISABLED"
    assert "features" in body


def test_live_bms_recommendation_write_disabled(client: TestClient):
    _seed("O3", source="LIVE_BMS", quality="GOOD", value=13.8)
    rec = client.get("/api/agents/O3/recommendation").json()
    assert rec["source"] == "ENGINE"
    assert rec["energy_impact"] is None
    assert rec["dispatch"]["allowed"] is False
    assert rec["dispatch"]["code"] in ("WRITE_DISABLED", "BMS_OFFLINE", "NOT_LIVE", "STALE", "SIMULATION_BLOCKED")
    assert rec["writes_attempted"] == 0
    assert rec["label"] == "Engineering recommendation"
    assert rec["current"]["value"] == 13.8


def test_simulated_never_live(client: TestClient):
    _seed("O2", source="SIMULATED", quality="GOOD", value=22.0)
    ctx = client.get("/api/agents/O2/context").json()
    src = str(ctx["telemetry"]["source"] or "").upper()
    assert "LIVE" not in src or src == "SIMULATED" or "SIMUL" in src or src == "DEMO" or src == "SIMULATION"
    rec = client.get("/api/agents/O2/recommendation").json()
    assert rec["dispatch"]["allowed"] is False
    assert rec["dispatch"]["code"] != "DISPATCH_OK"


def test_kaggle_and_ml_cannot_write(client: TestClient):
    _seed("O7", source="KAGGLE", quality="GOOD", value=7.0)
    rec = client.get("/api/agents/O7/recommendation").json()
    assert rec["dispatch"]["allowed"] is False
    assert rec["dispatch"]["code"] in ("ML_SOURCE_BLOCKED", "SIMULATION_BLOCKED", "WRITE_DISABLED", "BMS_OFFLINE", "NOT_LIVE")
    _seed("O7", source="ML_MODEL", quality="GOOD", value=7.2)
    rec2 = client.get("/api/agents/O7/recommendation").json()
    assert rec2["dispatch"]["allowed"] is False
    assert rec2["ml"]["source"] == "MODEL_PREDICTION"


def test_stale_and_bad(client: TestClient):
    _seed("O5", source="LIVE_BMS", quality="STALE", value=1.5)
    ctx = client.get("/api/agents/O5/context").json()
    assert ctx["status"] in ("STALE", "WAITING_FOR_TELEMETRY", "BAD_TELEMETRY", "BMS_OFFLINE")
    _seed("O5", source="LIVE_BMS", quality="BAD", value=1.5)
    ctx2 = client.get("/api/agents/O5/context").json()
    assert ctx2["status"] in ("BAD_TELEMETRY", "STALE", "BMS_OFFLINE")


def test_o18_o19_o20_no_command(client: TestClient):
    for oid in ("O18", "O19", "O20"):
        _seed(oid, source="LIVE_BMS", quality="GOOD", value=1.0)
        rec = client.get(f"/api/agents/{oid}/recommendation").json()
        assert rec["recommended"]["point"] is None
        assert rec["kind"] in ("ADVISORY", "MAINTENANCE", "REVIEW")
        assert rec["dispatch"]["allowed"] is False
        assert rec["dispatch"]["code"] in ("ADVISORY", "MAINTENANCE_ONLY", "REVIEW_REQUIRED", "WRITE_DISABLED", "BMS_OFFLINE", "SIMULATION_BLOCKED")
        assert rec["writes_attempted"] == 0


def test_o10_no_ml_model(client: TestClient):
    rec = client.get("/api/agents/O10/recommendation").json()
    assert rec["ml"]["status"] == "MODEL_NOT_TRAINABLE"


def test_groups_write_disabled(client: TestClient):
    res = client.get("/api/agents")
    assert res.status_code == 200
    groups = res.json()["groups"]
    assert len(groups) == 5
    for g in groups:
        assert g["controlAvailability"] == "WRITE DISABLED"
        assert g.get("cards")
        for card in g["cards"]:
            if card.get("kind") in ("ADVISORY", "MAINTENANCE", "REVIEW"):
                assert card["control"] == card["kind"]
            else:
                assert card["control"] == "WRITE DISABLED"
            assert isinstance(card.get("model"), str)
