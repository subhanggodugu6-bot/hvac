"""One BMS connection per building. Never falls back to the simulator."""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Type

from backend.bms.bacnet_gateway import BacnetGateway
from backend.bms.base import BMSGateway, BmsAdapterError, BmsHealth, CONNECTION_FAILED, DiscoveredDevice, DiscoveredPoint
from backend.bms.modbus_gateway import ModbusGateway
from backend.bms.mqtt_gateway import MqttGateway
from backend.bms.rest_gateway import RestGateway

ADAPTERS: Dict[str, Type[BMSGateway]] = {
    "bacnet": BacnetGateway,
    "bacnet/ip": BacnetGateway,
    "bacnet-ip": BacnetGateway,
    "modbus": ModbusGateway,
    "modbus-tcp": ModbusGateway,
    "mqtt": MqttGateway,
    "rest": RestGateway,
    "http": RestGateway,
}

_FACTORY_OVERRIDES: Dict[str, Callable[[], BMSGateway]] = {}
_MANAGER: Optional["ConnectionManager"] = None


def register_adapter_factory(protocol: str, factory: Callable[[], BMSGateway]) -> None:
    _FACTORY_OVERRIDES[protocol.lower()] = factory


def reset_connection_manager() -> None:
    global _MANAGER
    _MANAGER = None
    _FACTORY_OVERRIDES.clear()


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _mode() -> str:
    return (os.getenv("HVAC_BMS_MODE") or "simulation").strip().lower()


def is_simulation_mode() -> bool:
    """DATASET plant is simulation. LIVE_BMS never treats the simulator as production."""
    try:
        from backend.services.platform_ops_service import PLANT_DATASET, get_plant_mode

        return get_plant_mode() == PLANT_DATASET
    except Exception:
        return _mode() in ("simulation", "simulator", "sim")


def lab_mode_enabled() -> bool:
    """Stage A in-repo lab BACnet. Never used as a dataset/sim fallback."""
    return (os.getenv("HVAC_BMS_LAB") or "").strip().lower() in ("1", "true", "yes")


def make_adapter(protocol: str) -> BMSGateway:
    key = (protocol or "bacnet").strip().lower()
    if key in _FACTORY_OVERRIDES:
        factory = _FACTORY_OVERRIDES[key]
        inst = factory() if callable(factory) else factory
        return inst
    # Lab gateway only on LIVE_BMS path (connect already blocks DATASET).
    if lab_mode_enabled() and not is_simulation_mode() and key in ("bacnet", "bacnet/ip", "bacnet-ip"):
        from backend.bms.lab_bacnet_gateway import LabBacnetGateway

        return LabBacnetGateway()
    cls = ADAPTERS.get(key)
    if cls is None:
        raise BmsAdapterError(CONNECTION_FAILED, f"Unsupported BMS protocol: {protocol}")
    return cls()


# health() is consulted once per telemetry point while building the dashboard
# payload (hundreds of times per request), and each call re-read the connection
# row from SQLite. The row only changes through this manager's own writers, which
# invalidate the memo; the TTL bounds staleness if anything mutates it elsewhere.
_ROW_CACHE_TTL_S = 1.5


class ConnectionManager:
    def __init__(self) -> None:
        self._adapter: Optional[BMSGateway] = None
        self._row_cache: Dict[str, tuple] = {}

    def _session(self):
        from database.session import SessionLocal

        return SessionLocal()

    def _building_id(self, building_id: Optional[str] = None) -> str:
        return building_id or os.getenv("HVAC_DEFAULT_BUILDING_ID") or "bldg-corp-hq-01"

    def invalidate_row_cache(self) -> None:
        self._row_cache.clear()

    def current_row(self, building_id: Optional[str] = None):
        from database.models_bms import BmsConnectionDB

        bid = self._building_id(building_id)
        cached = self._row_cache.get(bid)
        if cached is not None and time.monotonic() - cached[0] < _ROW_CACHE_TTL_S:
            return cached[1]
        db = self._session()
        try:
            row = (
                db.query(BmsConnectionDB)
                .filter(BmsConnectionDB.building_id == bid)
                .order_by(BmsConnectionDB.updated_at.desc())
                .first()
            )
            if row is not None:
                # Detach so the row stays readable after the session closes.
                db.expunge(row)
            self._row_cache[bid] = (time.monotonic(), row)
            return row
        except Exception:
            return None
        finally:
            db.close()

    def adapter(self) -> Optional[BMSGateway]:
        return self._adapter

    def health(self, building_id: Optional[str] = None) -> BmsHealth:
        row = self.current_row(building_id)
        protocol = (row.protocol if row else os.getenv("HVAC_BMS_PROTOCOL") or "bacnet") or "bacnet"
        if is_simulation_mode():
            return BmsHealth(connected=False, protocol=protocol, code=None, message="simulation mode")
        if self._adapter is not None:
            h = self._adapter.health()
            if row is None:
                return h
            connected = bool(h.connected and row.connected and row.last_connected_at)
            return BmsHealth(
                connected=connected,
                protocol=row.protocol,
                code=None if connected else (h.code or row.last_error),
                message=h.message or row.last_error,
                host=row.host,
                port=row.port,
                last_connected_at=row.last_connected_at.isoformat() if row.last_connected_at and connected else None,
            )
        if row and row.connected and row.last_connected_at:
            # Process restart: do not claim connected without a live adapter handshake.
            return BmsHealth(
                connected=False,
                protocol=row.protocol,
                code=CONNECTION_FAILED,
                message=row.last_error or "Gateway adapter is not bound in this process.",
                host=row.host,
                port=row.port,
                last_connected_at=None,
            )
        return BmsHealth(
            connected=False,
            protocol=protocol,
            host=row.host if row else None,
            port=row.port if row else None,
            message=row.last_error if row else None,
        )

    def is_production_connected(self, building_id: Optional[str] = None) -> bool:
        if is_simulation_mode():
            return False
        return bool(self.health(building_id).connected)

    def upsert_config(self, *, protocol: str, host: str, port: int, building_id: Optional[str] = None):
        from database.models_bms import BmsConnectionDB

        db = self._session()
        try:
            bid = self._building_id(building_id)
            row = (
                db.query(BmsConnectionDB)
                .filter(BmsConnectionDB.building_id == bid, BmsConnectionDB.protocol == protocol)
                .first()
            )
            now = _now()
            if row is None:
                row = BmsConnectionDB(
                    id=f"bms_{uuid.uuid4().hex[:12]}",
                    building_id=bid,
                    protocol=protocol,
                    host=host,
                    port=port,
                    enabled=True,
                    connected=False,
                    write_enabled=False,
                    created_at=now,
                    updated_at=now,
                )
                db.add(row)
            else:
                row.host = host
                row.port = port
                row.enabled = True
                row.write_enabled = False
                row.updated_at = now
            db.commit()
            db.refresh(row)
            self.invalidate_row_cache()
            return {
                "id": row.id,
                "building_id": row.building_id,
                "protocol": row.protocol,
                "host": row.host,
                "port": row.port,
            }
        finally:
            db.close()

    def _set_state(self, *, connected: bool, error: Optional[str], connection_id: Optional[str] = None) -> None:
        from database.models_bms import BmsConnectionDB

        db = self._session()
        try:
            q = db.query(BmsConnectionDB)
            if connection_id:
                row = q.filter(BmsConnectionDB.id == connection_id).first()
            else:
                row = q.order_by(BmsConnectionDB.updated_at.desc()).first()
            if row is None:
                return
            row.connected = connected
            row.last_error = error
            row.updated_at = _now()
            if connected:
                row.last_connected_at = _now()
            else:
                row.write_enabled = False
            db.commit()
            self.invalidate_row_cache()
        finally:
            db.close()

    def connect(self, protocol: str, host: str, port: int, building_id: Optional[str] = None, test_only: bool = False) -> Dict[str, Any]:
        if is_simulation_mode() and not test_only:
            return {
                "status": "DISCONNECTED",
                "code": "SIMULATION_MODE",
                "message": "Dataset mode is selected. Switch the header to Live BMS before connecting a production gateway.",
                "connected": False,
            }
        cfg = self.upsert_config(protocol=protocol, host=host, port=int(port), building_id=building_id)
        adapter = make_adapter(protocol)
        try:
            health = adapter.connect(host=host, port=int(port), url=host)
        except BmsAdapterError as exc:
            self._adapter = None
            self._set_state(connected=False, error=f"{exc.code}: {exc.message}", connection_id=cfg["id"])
            return {
                "status": "DISCONNECTED",
                "code": exc.code,
                "message": exc.message,
                "connected": False,
                "protocol": protocol,
                "host": host,
                "port": int(port),
            }
        except Exception as exc:
            self._adapter = None
            self._set_state(connected=False, error=f"{CONNECTION_FAILED}: {exc}", connection_id=cfg["id"])
            return {
                "status": "DISCONNECTED",
                "code": CONNECTION_FAILED,
                "message": str(exc),
                "connected": False,
                "protocol": protocol,
                "host": host,
                "port": int(port),
            }
        if test_only:
            adapter.disconnect()
            self._adapter = None
            self._set_state(connected=False, error=None, connection_id=cfg["id"])
            return {
                "status": "OK" if health.connected else "DISCONNECTED",
                "test": True,
                "connected": False,
                "handshake": health.as_dict(),
                "protocol": protocol,
                "host": host,
                "port": int(port),
            }
        if not health.connected:
            self._adapter = None
            self._set_state(connected=False, error=health.message, connection_id=cfg["id"])
            return {"status": "DISCONNECTED", "connected": False, "code": health.code, "message": health.message}
        self._adapter = adapter
        self._set_state(connected=True, error=None, connection_id=cfg["id"])
        try:
            from backend.bms.telemetry_reader import poll_once, start_reader

            start_reader()
            poll_once(include_unmapped=False)
        except Exception:
            pass
        return {
            "status": "CONNECTED",
            "connected": True,
            "protocol": protocol,
            "host": host,
            "port": int(port),
            "last_connected_at": health.last_connected_at,
        }

    def set_write_enabled(self, enabled: bool, building_id: Optional[str] = None) -> None:
        from database.models_bms import BmsConnectionDB

        row = self.current_row(building_id)
        if row is None:
            return
        db = self._session()
        try:
            rec = db.query(BmsConnectionDB).filter(BmsConnectionDB.id == row.id).first()
            if rec is None:
                return
            rec.write_enabled = bool(enabled)
            rec.updated_at = _now()
            db.commit()
            self.invalidate_row_cache()
        finally:
            db.close()

    def disconnect(self, building_id: Optional[str] = None) -> Dict[str, Any]:
        if self._adapter:
            self._adapter.disconnect()
        self._adapter = None
        row = self.current_row(building_id)
        if row:
            self._set_state(connected=False, error=None, connection_id=row.id)
        return {"status": "DISCONNECTED", "connected": False}

    def discover(self, building_id: Optional[str] = None) -> Dict[str, Any]:
        from database.models_bms import BmsConnectionDB, BmsDeviceDB, BmsPointDB

        if not self.is_production_connected(building_id):
            return {"devices": 0, "points": 0, "status": "DISCONNECTED"}
        adapter = self._adapter
        if adapter is None:
            return {"devices": 0, "points": 0, "status": "DISCONNECTED"}
        devices: List[DiscoveredDevice] = adapter.discover_devices() or []
        row = self.current_row(building_id)
        db = self._session()
        point_count = 0
        try:
            conn = db.query(BmsConnectionDB).filter(BmsConnectionDB.id == row.id).first() if row else None
            if conn is None:
                return {"devices": 0, "points": 0, "status": "DISCONNECTED"}
            for dev in devices:
                existing = (
                    db.query(BmsDeviceDB)
                    .filter(BmsDeviceDB.connection_id == conn.id, BmsDeviceDB.device_identifier == dev.device_identifier)
                    .first()
                )
                if existing is None:
                    existing = BmsDeviceDB(
                        id=f"dev_{uuid.uuid4().hex[:12]}",
                        connection_id=conn.id,
                        device_identifier=dev.device_identifier,
                        name=dev.name or dev.device_identifier,
                        device_type=dev.device_type,
                        status=dev.status,
                        metadata_json=dev.metadata or None,
                        created_at=_now(),
                        updated_at=_now(),
                    )
                    db.add(existing)
                    db.flush()
                else:
                    existing.name = dev.name or existing.name
                    existing.device_type = dev.device_type or existing.device_type
                    existing.status = dev.status
                    existing.updated_at = _now()
                pts: List[DiscoveredPoint] = adapter.discover_points(existing.id) or adapter.discover_points(dev.device_identifier) or []
                for pt in pts:
                    prow = (
                        db.query(BmsPointDB)
                        .filter(BmsPointDB.device_id == existing.id, BmsPointDB.point_identifier == pt.point_identifier)
                        .first()
                    )
                    if prow is None:
                        prow = BmsPointDB(
                            id=f"pt_{uuid.uuid4().hex[:12]}",
                            device_id=existing.id,
                            point_identifier=pt.point_identifier,
                            name=pt.name,
                            object_type=pt.object_type,
                            object_instance=str(pt.object_instance) if pt.object_instance is not None else None,
                            register=pt.register,
                            unit=pt.unit,
                            data_type=pt.data_type,
                            readable=pt.readable,
                            writable=bool(pt.writable),
                            min_value=pt.min_value,
                            max_value=pt.max_value,
                            enabled=True,
                            metadata_json=pt.metadata or None,
                            created_at=_now(),
                            updated_at=_now(),
                        )
                        db.add(prow)
                    point_count += 1
            db.commit()
            n_dev = db.query(BmsDeviceDB).filter(BmsDeviceDB.connection_id == conn.id).count()
            n_pt = (
                db.query(BmsPointDB)
                .join(BmsDeviceDB, BmsPointDB.device_id == BmsDeviceDB.id)
                .filter(BmsDeviceDB.connection_id == conn.id)
                .count()
            )
            return {"devices": n_dev, "points": n_pt, "discovered_devices": len(devices), "discovered_points": point_count, "status": "CONNECTED"}
        finally:
            db.close()


def get_connection_manager() -> ConnectionManager:
    global _MANAGER
    if _MANAGER is None:
        _MANAGER = ConnectionManager()
    return _MANAGER
