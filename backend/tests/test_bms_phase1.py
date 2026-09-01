"""Phase 1 read-only BMS layer: handshake, discovery, mapping, LIVE rules, WRITE_DISABLED."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

os.environ["HVAC_ENV"] = "development"
os.environ["HVAC_START_CONTROL_WORKER"] = "0"
os.environ["HVAC_ALLOW_CREATE_ALL"] = "1"
os.environ["HVAC_SAFE_MODE"] = "0"
os.environ["HVAC_BMS_MODE"] = "simulation"
os.environ["HVAC_BMS_CONNECTED"] = "1"
os.environ["HVAC_BMS_WRITE_ENABLED"] = "0"
os.environ["HVAC_DEPLOYMENT_MODE"] = "local"


@pytest.fixture()
def client():
    from backend.agents.scheduling_supervisory.gateway import reset_bms_gateway
    from backend.bms.connection_manager import reset_connection_manager
    from database.session import init_db

    init_db()
    from database.session import SessionLocal
    from database.models_bms import BmsConnectionDB, BmsDeviceDB, BmsPointDB, EquipmentPointMappingDB

    db = SessionLocal()
    try:
        db.query(EquipmentPointMappingDB).delete()
        db.query(BmsPointDB).delete()
        db.query(BmsDeviceDB).delete()
        db.query(BmsConnectionDB).delete()
        db.commit()
    finally:
        db.close()
    reset_connection_manager()
    reset_bms_gateway()
    from backend.main import app

    return TestClient(app)


def test_env_connected_flag_is_not_live(client: TestClient):
    res = client.get("/api/platform/status")
    assert res.status_code == 200
    body = res.json()
    assert body["bms"]["status"] == "DISCONNECTED"
    assert body["bmsConnected"] is False
    assert body["controlEnabled"] is False
    assert "LIVE" not in str(body["bms"]["status"])


def test_no_bms_discovery_empty(client: TestClient):
    res = client.get("/api/platform/bms/devices")
    assert res.status_code == 200
    assert res.json()["count"] == 0
    disc = client.post("/api/platform/bms/discover")
    assert disc.json()["devices"] == 0
    assert disc.json()["points"] == 0


def test_connect_failure_no_simulator_fallback(client: TestClient, monkeypatch):
    monkeypatch.setenv("HVAC_BMS_MODE", "production")
    monkeypatch.setenv("HVAC_PLANT_MODE_PERSIST", "0")
    monkeypatch.setenv("HVAC_BMS_LAB", "0")
    monkeypatch.setenv("HVAC_BMS_PROTOCOL", "bacnet")
    from backend.agents.scheduling_supervisory.gateway import reset_bms_gateway, get_bms_gateway, SimulatorBMSGateway
    from backend.bms.connection_manager import reset_connection_manager
    from backend.services.platform_ops_service import set_plant_mode

    set_plant_mode("LIVE_BMS")
    reset_connection_manager()
    reset_bms_gateway()
    res = client.post("/api/platform/bms/connect", json={"protocol": "bacnet", "host": "127.0.0.1", "port": 47808})
    body = res.json()
    assert body.get("connected") is False
    assert body.get("status") == "DISCONNECTED"
    assert body.get("code") in ("BMS_ADAPTER_UNAVAILABLE", "BMS_CONNECTION_FAILED")
    gw = get_bms_gateway()
    assert not isinstance(gw, SimulatorBMSGateway) or os.getenv("HVAC_BMS_MODE") == "simulation"


def test_successful_handshake(monkeypatch, client: TestClient):
    from backend.bms.base import BMSGateway, BmsHealth, DiscoveredDevice, DiscoveredPoint, PointReading, WriteOutcome, utc_now
    from backend.bms.command_writer import write_point as reject
    from backend.bms.connection_manager import register_adapter_factory, reset_connection_manager
    from backend.agents.scheduling_supervisory.gateway import reset_bms_gateway

    class FakeGw(BMSGateway):
        protocol = "bacnet"

        def __init__(self):
            self._ok = False

        def connect(self, host, port=47808, **kwargs):
            self._ok = True
            return BmsHealth(connected=True, protocol="bacnet", host=host, port=port, last_connected_at=utc_now().isoformat())

        def disconnect(self):
            self._ok = False
            return BmsHealth(connected=False, protocol="bacnet")

        def health(self):
            return BmsHealth(connected=self._ok, protocol="bacnet", last_connected_at=utc_now().isoformat() if self._ok else None)

        def discover_devices(self):
            return [DiscoveredDevice(device_identifier="lab-ahu", name="LAB-AHU", device_type="AHU")]

        def discover_points(self, device_id):
            return [
                DiscoveredPoint(point_identifier="sat-1", name="SAT", object_type="analog-input", object_instance="1", unit="degC", writable=False)
            ]

        def read_point(self, point_id):
            return PointReading(point_id=point_id, value=14.2, unit="degC", quality="GOOD", timestamp=utc_now().isoformat())

        def read_points(self, point_ids):
            return [self.read_point(p) for p in point_ids]

        def write_point(self, point_id, value, priority=10):
            return reject(point_id, value, priority)

        def write_points(self, writes):
            return [self.write_point(w["point_id"], w["value"]) for w in writes]

    monkeypatch.setenv("HVAC_BMS_MODE", "production")
    reset_connection_manager()
    reset_bms_gateway()
    register_adapter_factory("bacnet", lambda: FakeGw())
    res = client.post("/api/platform/bms/connect", json={"protocol": "bacnet", "host": "10.0.0.9", "port": 47808})
    body = res.json()
    assert body.get("connected") is True, body
    st = client.get("/api/platform/status").json()
    assert st["bms"]["status"] == "CONNECTED"
    disc = client.post("/api/platform/bms/discover").json()
    assert disc["devices"] >= 1
    devices = client.get("/api/platform/bms/devices").json()["devices"]
    assert devices[0]["device_identifier"] == "lab-ahu"
    pts = client.get(f"/api/platform/bms/devices/{devices[0]['id']}/points").json()["points"]
    assert pts[0]["object_instance"] == "1"
    mapped = client.put(
        "/api/platform/bms/mappings",
        json={"equipment_id": "AHU-01", "canonical_point": "supply_air_temperature", "bms_point_id": pts[0]["id"], "direction": "READ"},
    )
    assert mapped.status_code == 200
    maps = client.get("/api/platform/bms/mappings").json()["mappings"]
    assert maps[0]["canonical_point"] == "supply_air_temperature"


def test_missing_telemetry_null_not_zero():
    from backend.services.canonical_telemetry_service import record_point

    row = record_point("AHU-01.supply_air_temperature", None, "degC", "LIVE_BMS", "MISSING", equipment_id="AHU-01")
    assert row["value"] is None
    assert row["value"] != 0
    assert row["quality"] == "MISSING"


def test_live_requires_connected_good_fresh(monkeypatch):
    from backend.services.hvac_safety_contract import classify_telemetry

    monkeypatch.setattr("backend.services.hvac_safety_contract.production_bms_connected", lambda: False)
    c = classify_telemetry({"quality": "GOOD", "age_seconds": 1, "source": "LIVE_BMS", "raw": "LIVE"}, "LIVE_BMS")
    assert c["usable"] is False

    monkeypatch.setattr("backend.services.hvac_safety_contract.production_bms_connected", lambda: True)
    c = classify_telemetry({"quality": "GOOD", "age_seconds": 1, "source": "LIVE_BMS", "raw": "LIVE"}, "LIVE_BMS")
    assert c["status"] == "LIVE"

    c = classify_telemetry({"quality": "STALE", "age_seconds": 140, "source": "LIVE_BMS", "raw": "STALE"}, "LIVE_BMS")
    assert c["status"] == "STALE"

    c = classify_telemetry({"quality": "BAD", "age_seconds": 1, "source": "LIVE_BMS"}, "LIVE_BMS")
    assert c["status"] == "BAD"


def test_simulator_and_ml_never_live():
    from backend.services.hvac_safety_contract import classify_telemetry

    assert classify_telemetry({"quality": "GOOD", "age_seconds": 1, "source": "SIMULATION"}, "SIMULATION")["status"] == "SIMULATED"
    assert classify_telemetry({"quality": "GOOD", "age_seconds": 1, "source": "ML_MODEL"}, "ML_MODEL")["demo"] is True


def test_write_disabled(client: TestClient, monkeypatch):
    from backend.bms.command_writer import write_point
    from backend.agents.scheduling_supervisory.gateway import SimulatorBMSGateway, ProductionBMSGateway
    from backend.services.hvac_safety_contract import evaluate_dispatch

    out = write_point("AHU-01.sat_setpoint", 13.0)
    assert out.success is False
    assert out.code in ("WRITE_DISABLED", "SIMULATION_BLOCKED")
    assert SimulatorBMSGateway().write_point("x", 1).success is False
    assert ProductionBMSGateway().write_point("x", 1).success is False
    res = client.post("/api/platform/bms/write-enable")
    assert res.status_code == 409
    assert res.json()["code"] in ("WRITE_DISABLED", "SIMULATION_MODE")

    monkeypatch.setattr("backend.services.hvac_safety_contract.production_bms_connected", lambda: True)
    ok, _, classified = evaluate_dispatch(
        {
            "opportunity_id": "O3",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "GOOD", "age_seconds": 1, "raw": "LIVE"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS", "passed": True},
            "current_value": 14.2,
            "target_value": 13.0,
        }
    )
    assert ok is False
    assert classified.get("code") in ("WRITE_DISABLED", "SIMULATION_BLOCKED")


def test_safe_mode_still_first():
    from backend.services.hvac_safety_contract import evaluate_dispatch

    os.environ["HVAC_SAFE_MODE"] = "1"
    try:
        ok, _, classified = evaluate_dispatch(
            {
                "opportunity_id": "O3",
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
    finally:
        os.environ["HVAC_SAFE_MODE"] = "0"


def test_mapping_rejects_unknown_point(client: TestClient):
    res = client.put(
        "/api/platform/bms/mappings",
        json={"equipment_id": "AHU-01", "canonical_point": "supply_air_temperature", "bms_point_id": "does-not-exist", "direction": "READ"},
    )
    assert res.status_code == 400


def test_websocket_payload_has_bms(client: TestClient):
    with client.websocket_connect("/api/ws/telemetry") as ws:
        data = ws.receive_json()
    assert "bms" in data
    assert data["controlEnabled"] is False
    assert "events" in data
    bms = data["bms"]
    assert bms.get("status") != "LIVE"
    assert "lastError" in bms or "last_error" in bms


def test_agents_endpoint(client: TestClient):
    res = client.get("/api/agents")
    assert res.status_code == 200
    groups = res.json()["groups"]
    assert len(groups) == 5
    assert groups[0]["status"] in ("BMS OFFLINE", "WAITING FOR TELEMETRY", "HOLD", "READY", "SAFE MODE", "WRITE DISABLED")
    assert groups[0]["controlAvailability"] == "WRITE DISABLED"


def test_no_fake_seed_points():
    from pathlib import Path
    from database.models_bms import BmsPointDB
    from database.session import SessionLocal

    seed = Path(ROOT) / "database" / "seed" / "seed_data.py"
    text = seed.read_text(encoding="utf-8") if seed.exists() else ""
    assert "AI:102" not in text
    assert "AV:25" not in text
    db = SessionLocal()
    try:
        invented = db.query(BmsPointDB).filter(BmsPointDB.object_instance.in_(["102", "AI:102", "25"])).count()
        assert invented == 0
    finally:
        db.close()
