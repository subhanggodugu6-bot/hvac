"""Phase 4: supervised writes after mapping + safety review. Dataset and SAFE MODE stay blocked."""
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
os.environ["HVAC_USE_SIMULATION"] = "0"


def _fake_gateway():
    from backend.bms.base import (
        BMSGateway,
        BmsHealth,
        DiscoveredDevice,
        DiscoveredPoint,
        PointReading,
        WriteOutcome,
        utc_now,
    )
    from backend.bms.command_writer import write_point as gated

    class FakeGw(BMSGateway):
        protocol = "bacnet"

        def __init__(self):
            self._ok = False
            self._values = {}
            self.last_write = None

        def connect(self, host, port=47808, **kwargs):
            self._ok = True
            return BmsHealth(
                connected=True,
                protocol="bacnet",
                host=host,
                port=port,
                last_connected_at=utc_now().isoformat(),
            )

        def disconnect(self):
            self._ok = False
            return BmsHealth(connected=False, protocol="bacnet")

        def health(self):
            return BmsHealth(
                connected=self._ok,
                protocol="bacnet",
                last_connected_at=utc_now().isoformat() if self._ok else None,
            )

        def discover_devices(self):
            return [DiscoveredDevice(device_identifier="lab-ahu", name="LAB-AHU", device_type="AHU")]

        def discover_points(self, device_id):
            return [
                DiscoveredPoint(
                    point_identifier="sat-sp-1",
                    name="SAT-SP",
                    object_type="analog-value",
                    object_instance="25",
                    unit="degC",
                    writable=True,
                )
            ]

        def read_point(self, point_id):
            value = self._values.get(point_id, self.last_write if self.last_write is not None else 14.2)
            return PointReading(
                point_id=point_id,
                value=value,
                unit="degC",
                quality="GOOD",
                timestamp=utc_now().isoformat(),
            )

        def read_points(self, point_ids):
            return [self.read_point(p) for p in point_ids]

        def execute_write(self, point_id, value, priority=10):
            self._values[point_id] = float(value)
            self.last_write = float(value)
            return WriteOutcome(success=True, code="OK", message="WRITTEN", point_id=point_id, value=float(value))

        def write_point(self, point_id, value, priority=10):
            return gated(point_id, value, priority)

        def write_points(self, writes):
            return [self.write_point(w["point_id"], w["value"]) for w in writes]

    return FakeGw()


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("HVAC_PLANT_MODE_PERSIST", "1")
    monkeypatch.setenv("HVAC_BMS_MODE", "simulation")
    monkeypatch.setenv("HVAC_BMS_WRITE_ENABLED", "1")
    from backend.agents.scheduling_supervisory.gateway import reset_bms_gateway
    from backend.bms.connection_manager import reset_connection_manager
    from database.session import init_db

    init_db()
    from database.session import SessionLocal
    from database.models_bms import BmsConnectionDB, BmsDeviceDB, BmsPointDB, EquipmentPointMappingDB
    from database.models_platform import CanonicalTelemetryDB, PlatformSettingDB

    db = SessionLocal()
    try:
        db.query(EquipmentPointMappingDB).delete()
        db.query(BmsPointDB).delete()
        db.query(BmsDeviceDB).delete()
        db.query(BmsConnectionDB).delete()
        db.query(CanonicalTelemetryDB).delete()
        db.query(PlatformSettingDB).filter_by(key="PLANT_MODE").delete()
        db.commit()
    finally:
        db.close()
    reset_connection_manager()
    reset_bms_gateway()
    from backend.services.platform_ops_service import set_plant_mode

    set_plant_mode("DATASET")
    from backend.main import app

    return TestClient(app)


def _commission(client: TestClient, monkeypatch):
    from backend.agents.scheduling_supervisory.gateway import reset_bms_gateway
    from backend.bms.connection_manager import register_adapter_factory, reset_connection_manager
    from backend.services.platform_ops_service import set_plant_mode

    adapter = _fake_gateway()
    set_plant_mode("LIVE_BMS")
    reset_connection_manager()
    reset_bms_gateway()
    register_adapter_factory("bacnet", lambda: adapter)
    assert client.post("/api/platform/bms/connect", json={"protocol": "bacnet", "host": "10.0.0.9", "port": 47808}).json().get("connected")
    assert client.post("/api/platform/bms/discover").json()["devices"] >= 1
    devices = client.get("/api/platform/bms/devices").json()["devices"]
    pts = client.get(f"/api/platform/bms/devices/{devices[0]['id']}/points").json()["points"]
    mapped = client.put(
        "/api/platform/bms/mappings",
        json={
            "equipment_id": "AHU-01",
            "canonical_point": "sat_setpoint",
            "bms_point_id": pts[0]["id"],
            "direction": "READ_WRITE",
        },
    )
    assert mapped.status_code == 200, mapped.text
    return adapter


def test_dataset_blocks_write_enable_even_when_env_on(client: TestClient):
    res = client.post("/api/platform/bms/write-enable", json={"confirm": True})
    assert res.status_code == 409
    assert res.json()["code"] == "SIMULATION_MODE"


def test_live_requires_confirm_and_mapping(client: TestClient):
    from backend.services.platform_ops_service import set_plant_mode

    set_plant_mode("LIVE_BMS")
    res = client.post("/api/platform/bms/write-enable", json={"confirm": True})
    assert res.status_code == 409
    assert res.json()["code"] in ("BMS_OFFLINE", "MAPPING_REQUIRED")


def test_supervised_apply_verify_rollback(client: TestClient, monkeypatch):
    monkeypatch.setenv("HVAC_RULE_ENGINE_STRICT", "0")
    monkeypatch.setenv("HVAC_SCHEDULE_START_HOUR", "0")
    monkeypatch.setenv("HVAC_SCHEDULE_END_HOUR", "24")
    monkeypatch.setenv("HVAC_STAGE_G_WRITABLE_POINTS", "AHU-01.sat_setpoint")
    from backend.services.hvac_safety_contract import evaluate_dispatch

    adapter = _commission(client, monkeypatch)
    armed = client.post("/api/platform/bms/write-enable", json={"confirm": True})
    assert armed.status_code == 200, armed.text
    assert armed.json()["enabled"] is True

    st = client.get("/api/platform/status").json()
    assert st["writeEnabled"] is True
    assert st["controlEnabled"] is True

    ok, reason, classified = evaluate_dispatch(
        {
            "action": "APPLY",
            "opportunity_id": "O3",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "GOOD", "age_seconds": 1, "raw": "LIVE"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS", "passed": True},
            "current_value": 14.2,
            "target_value": 13.8,
        }
    )
    assert ok is True, (reason, classified)

    applied = client.post(
        "/api/platform/commands/apply",
        json={
            "opportunity_id": "O3",
            "point_id": "AHU-01.sat_setpoint",
            "current_value": 14.2,
            "target_value": 13.8,
            "confidence": 0.99,
            "decision": "OPTIMIZE",
        },
    )
    assert applied.status_code == 200, applied.text
    body = applied.json()
    assert body["allowed"] is True
    assert adapter.last_write == 13.8
    cid = body["command"]["command_id"]

    verified = client.post(f"/api/platform/commands/{cid}/verify")
    assert verified.status_code == 200, verified.text

    rolled = client.post(f"/api/platform/commands/{cid}/rollback")
    assert rolled.status_code == 200, rolled.text
    assert adapter.last_write == 14.2


def test_safe_mode_blocks_armed_writes(client: TestClient, monkeypatch):
    _commission(client, monkeypatch)
    assert client.post("/api/platform/bms/write-enable", json={"confirm": True}).status_code == 200
    monkeypatch.setenv("HVAC_SAFE_MODE", "1")
    from backend.services.hvac_safety_contract import evaluate_dispatch

    ok, _, classified = evaluate_dispatch(
        {
            "action": "APPLY",
            "opportunity_id": "O3",
            "source": "LIVE_BMS",
            "telemetry": {"source": "LIVE_BMS", "quality": "GOOD", "age_seconds": 1, "raw": "LIVE"},
            "supervisory": {"decision": "OPTIMIZE", "confidence": 0.99},
            "safety": {"status": "PASS", "passed": True},
            "current_value": 14.2,
            "target_value": 13.8,
        }
    )
    assert ok is False
    assert classified.get("code") == "SAFE_MODE"
    blocked = client.post(
        "/api/platform/commands/apply",
        json={
            "opportunity_id": "O3",
            "point_id": "AHU-01.sat_setpoint",
            "current_value": 14.2,
            "target_value": 13.0,
            "confidence": 0.99,
        },
    )
    assert blocked.status_code == 409


def test_dataset_switch_disarms_writes(client: TestClient, monkeypatch):
    _commission(client, monkeypatch)
    assert client.post("/api/platform/bms/write-enable", json={"confirm": True}).status_code == 200
    back = client.post("/api/platform/plant-mode", json={"mode": "DATASET"}).json()
    assert back["plantMode"] == "DATASET"
    assert back["writeEnabled"] is False
    assert back["controlEnabled"] is False
    res = client.post(
        "/api/platform/commands/apply",
        json={
            "opportunity_id": "O3",
            "point_id": "AHU-01.sat_setpoint",
            "current_value": 14.2,
            "target_value": 13.0,
            "confidence": 0.99,
        },
    )
    assert res.status_code == 409
    assert res.json()["code"] == "SIMULATION_BLOCKED"
