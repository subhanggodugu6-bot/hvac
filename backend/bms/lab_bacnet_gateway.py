"""In-repo Lab BACnet gateway for Stage A LIVE_BMS commissioning.

Not the dataset simulator. Readings are stamped LIVE_BMS with GOOD quality.
Activated only when HVAC_BMS_LAB=1 and plant mode is LIVE_BMS (see connection_manager).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from backend.bms.base import (
    BMSGateway,
    BmsHealth,
    CONNECTION_FAILED,
    DiscoveredDevice,
    DiscoveredPoint,
    PointReading,
    WriteOutcome,
    utc_now,
)
from backend.bms.command_writer import write_point as reject_write
from backend.bms.command_writer import write_points as reject_writes

# (equipment_id, canonical_point, unit, default_value, writable)
STAGE_A_POINTS: Tuple[Tuple[str, str, str, float, bool], ...] = (
    ("ZONE-01", "zone_temperature", "degC", 24.1, False),
    ("AHU-01", "supply_air_temperature", "degC", 14.2, False),
    ("AHU-01", "return_air_temperature", "degC", 23.6, False),
    ("SITE", "outdoor_air_temperature", "degC", 32.0, False),
    ("AHU-01", "fan_speed", "pct", 68.0, False),
    ("AHU-01", "cooling_valve", "pct", 42.0, False),
    ("CH-01", "power", "kW", 118.5, False),
    ("ZONE-01", "occupancy", "frac", 0.7, False),
    ("SITE", "occupancy_schedule", "bool", 1.0, False),
    ("ZONE-01", "cooling_setpoint", "degC", 24.0, True),
    ("AHU-01", "sat_setpoint", "degC", 13.5, True),
    ("AHU-01", "enable", "bool", 1.0, False),
    ("CH-01", "status", "bool", 1.0, False),
)

_DEVICE_META: Dict[str, Tuple[str, str]] = {
    "AHU-01": ("LAB-AHU-01", "AHU"),
    "CH-01": ("LAB-CH-01", "CH"),
    "ZONE-01": ("LAB-ZONE-01", "ZONE"),
    "SITE": ("LAB-SITE", "SITE"),
}


def lab_point_identifier(equipment_id: str, canonical_point: str) -> str:
    return f"lab:{equipment_id}:{canonical_point}"


def stage_a_mapping_targets() -> List[Dict[str, str]]:
    """Canonical Stage A map targets for commission scripts/tests."""
    return [
        {
            "equipment_id": eq,
            "canonical_point": pt,
            "point_identifier": lab_point_identifier(eq, pt),
            "unit": unit,
        }
        for eq, pt, unit, _val, _w in STAGE_A_POINTS
    ]


class LabBacnetGateway(BMSGateway):
    """Stable lab device catalog for Stage A discover → map → poll."""

    protocol = "bacnet"

    def __init__(self) -> None:
        self._connected = False
        self.host: Optional[str] = None
        self.port: Optional[int] = None
        self._last_error: Optional[str] = None
        self._last_code: Optional[str] = None
        self._last_connected_at: Optional[str] = None
        self._values: Dict[str, float] = {
            lab_point_identifier(eq, pt): float(val) for eq, pt, _u, val, _w in STAGE_A_POINTS
        }
        self._meta: Dict[str, Tuple[str, bool]] = {
            lab_point_identifier(eq, pt): (unit, writable) for eq, pt, unit, _v, writable in STAGE_A_POINTS
        }

    def connect(self, host: str, port: int = 47808, **kwargs: Any) -> BmsHealth:
        del kwargs
        self.host = host or "127.0.0.1"
        self.port = int(port or 47808)
        self._connected = True
        self._last_error = None
        self._last_code = None
        self._last_connected_at = utc_now().isoformat()
        return self.health()

    def disconnect(self) -> BmsHealth:
        self._connected = False
        return self.health()

    def health(self) -> BmsHealth:
        return BmsHealth(
            connected=bool(self._connected and self._last_connected_at),
            protocol=self.protocol,
            code=None if self._connected else self._last_code,
            message=self._last_error or ("Stage A lab BACnet gateway" if self._connected else None),
            host=self.host,
            port=self.port,
            last_connected_at=self._last_connected_at if self._connected else None,
        )

    def discover_devices(self) -> List[DiscoveredDevice]:
        if not self._connected:
            return []
        out: List[DiscoveredDevice] = []
        for eq_id, (name, dtype) in _DEVICE_META.items():
            out.append(
                DiscoveredDevice(
                    device_identifier=f"lab:{eq_id}",
                    name=name,
                    device_type=dtype,
                    status="ONLINE",
                    metadata={"lab": True, "equipment_id": eq_id},
                )
            )
        return out

    def discover_points(self, device_id: str) -> List[DiscoveredPoint]:
        if not self._connected:
            return []
        key = (device_id or "").strip()
        # connection_manager tries DB id first; return [] so it retries device_identifier.
        if not key.startswith("lab:"):
            return []
        eq_id = key.split(":", 1)[1]
        if eq_id not in _DEVICE_META:
            return []
        out: List[DiscoveredPoint] = []
        for eq, pt, unit, _val, writable in STAGE_A_POINTS:
            if eq != eq_id:
                continue
            ident = lab_point_identifier(eq, pt)
            out.append(
                DiscoveredPoint(
                    point_identifier=ident,
                    name=pt,
                    object_type="analog-value" if writable else "analog-input",
                    object_instance=pt,
                    unit=unit,
                    data_type="float",
                    readable=True,
                    writable=writable,
                    metadata={"lab": True, "equipment_id": eq, "canonical_point": pt},
                )
            )
        return out

    def read_point(self, point_id: str) -> PointReading:
        ts = utc_now().isoformat()
        if not self._connected:
            return PointReading(
                point_id=point_id,
                value=None,
                unit=None,
                quality="MISSING",
                timestamp=ts,
                source="LIVE_BMS",
            )
        if point_id not in self._values:
            return PointReading(
                point_id=point_id,
                value=None,
                unit=None,
                quality="MISSING",
                timestamp=ts,
                source="LIVE_BMS",
            )
        unit, _w = self._meta.get(point_id, (None, False))
        return PointReading(
            point_id=point_id,
            value=float(self._values[point_id]),
            unit=unit,
            quality="GOOD",
            timestamp=ts,
            source="LIVE_BMS",
        )

    def read_points(self, point_ids: List[str]) -> List[PointReading]:
        return [self.read_point(pid) for pid in point_ids]

    def execute_write(self, point_id: str, value: float, priority: int = 10) -> WriteOutcome:
        del priority
        if not self._connected:
            return WriteOutcome(
                success=False,
                code=CONNECTION_FAILED,
                message="Lab BACnet gateway is not connected.",
                point_id=point_id,
                value=value,
            )
        if point_id not in self._values:
            return WriteOutcome(
                success=False,
                code=CONNECTION_FAILED,
                message="Unknown lab point.",
                point_id=point_id,
                value=value,
            )
        unit, writable = self._meta.get(point_id, (None, False))
        del unit
        if not writable:
            return WriteOutcome(
                success=False,
                code="WRITE_DISABLED",
                message="Lab point is read-only.",
                point_id=point_id,
                value=value,
            )
        # Stage A keeps command_writer gates; execute_write is only reachable after gates pass.
        self._values[point_id] = float(value)
        return WriteOutcome(success=True, code="OK", message="WRITTEN", point_id=point_id, value=float(value))

    def write_point(self, point_id: str, value: float, priority: int = 10) -> WriteOutcome:
        return reject_write(point_id, value, priority)

    def write_points(self, writes: List[Dict[str, Any]]) -> List[WriteOutcome]:
        return reject_writes(writes)


def seed_lab_history(hours: float = 3.0, step_minutes: float = 1.0) -> int:
    """Backfill LIVE_BMS lab historian so LSTM lookback works right after Stage A."""
    import math
    import time
    from datetime import datetime, timedelta, timezone

    from backend.services.canonical_telemetry_service import record_point

    span_h = max(0.5, float(hours))
    step = max(1.0, float(step_minutes))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    steps = max(2, int((span_h * 60.0) / step))
    total = 0
    for eq, pt, unit, base, _writable in STAGE_A_POINTS:
        pid = f"{eq}.{pt}"
        for i in range(steps, 0, -1):
            ts = now - timedelta(minutes=step * i)
            drift = math.sin((time.time() - step * 60.0 * i) / 40.0) * 0.04
            if pt in ("enable", "status", "occupancy_schedule"):
                val = float(base)
            elif pt == "occupancy":
                val = round(float(base), 3)
            else:
                val = round(float(base) * (1.0 + drift), 3)
            record_point(
                point_id=pid,
                value=val,
                unit=unit,
                source="LIVE_BMS",
                quality="GOOD",
                equipment_id=eq,
                timestamp=ts,
            )
            total += 1
    return total
