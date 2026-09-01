"""Publish SIMULATION-sourced canonical points when HVAC_BMS_MODE=simulation.

Never stamps LIVE_BMS. Header TEL stays SIMULATED by design.
"""
from __future__ import annotations

import math
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from backend.bms.connection_manager import is_simulation_mode
from backend.services.canonical_telemetry_service import record_point, record_points
from backend.services.opportunity_feature_catalog import CATALOG

_STOP = threading.Event()
_THREAD: Optional[threading.Thread] = None
_HISTORY_SEEDED = False
_HYDRATED = False
_HYDRATE_LOCK = threading.Lock()
_OVERRIDES: Dict[str, float] = {}

_UNITS: Dict[str, Optional[str]] = {
    "zone_temperature": "°C",
    "outdoor_air_temperature": "°C",
    "supply_air_temperature": "°C",
    "return_air_temperature": "°C",
    "sat_setpoint": "°C",
    "cooling_setpoint": "°C",
    "heating_setpoint": "°C",
    "chw_supply_temperature": "°C",
    "chw_return_temperature": "°C",
    "chw_supply_setpoint": "°C",
    "hhw_supply_temperature": "°C",
    "hhw_return_temperature": "°C",
    "hhw_setpoint": "°C",
    "cw_supply_temperature": "°C",
    "cw_return_temperature": "°C",
    "cw_setpoint": "°C",
    "suction_temperature": "°C",
    "condenser_water_temperature": "°C",
    "fan_speed": "%",
    "oa_damper": "%",
    "speed": "%",
    "heating_demand": "%",
    "occupancy": None,
    "enable": None,
    "status": None,
    "load": "tons",
    "cooling_load": "tons",
    "duct_static_pressure": "in.w.c.",
    "static_setpoint": "in.w.c.",
    "differential_pressure": "kPa",
    "flow": "L/s",
    "co2": "ppm",
    "co_ppm": "ppm",
    "head_pressure": "kPa",
    "discharge_pressure": "kPa",
    "energy": "kWh",
    "runtime": "h",
    "alarms": None,
}

_BASE: Dict[str, float] = {
    "zone_temperature": 24.2,
    "outdoor_air_temperature": 26.1,
    "supply_air_temperature": 13.8,
    "return_air_temperature": 24.0,
    "sat_setpoint": 13.0,
    "cooling_setpoint": 24.0,
    "heating_setpoint": 21.0,
    "chw_supply_temperature": 7.2,
    "chw_return_temperature": 12.4,
    "chw_supply_setpoint": 7.0,
    "hhw_supply_temperature": 52.0,
    "hhw_return_temperature": 42.0,
    "hhw_setpoint": 50.0,
    "cw_supply_temperature": 29.0,
    "cw_return_temperature": 34.0,
    "cw_setpoint": 29.5,
    "suction_temperature": 4.5,
    "condenser_water_temperature": 31.0,
    "fan_speed": 68.0,
    "oa_damper": 42.0,
    "speed": 62.0,
    "heating_demand": 18.0,
    "occupancy": 1.0,
    "enable": 1.0,
    "status": 1.0,
    "load": 183.0,
    "cooling_load": 183.0,
    "duct_static_pressure": 1.35,
    "static_setpoint": 1.40,
    "differential_pressure": 85.0,
    "flow": 28.0,
    "co2": 780.0,
    "co_ppm": 4.0,
    "head_pressure": 1180.0,
    "discharge_pressure": 1450.0,
    "energy": 412.0,
    "runtime": 6.4,
    "alarms": 0.0,
}


_EXTRA: Dict[str, Tuple[str, Optional[str], float]] = {
    "WEATHER.OutdoorDryBulb": ("SITE", "°C", 26.1),
    "WEATHER.OutdoorRH": ("SITE", "%", 55.0),
    "ZONE.AvgTemp": ("ZONE-01", "°C", 24.2),
    "ZONE.OccupantCount": ("ZONE-01", None, 1.0),
    "AHU-01.OutdoorAirDamper": ("AHU-01", "%", 42.0),
    "AHU-01.SupplyAirTemp": ("AHU-01", "°C", 13.8),
    "AHU-01.ReturnAirTemp": ("AHU-01", "°C", 24.0),
    "AHU-01.SupplyFanState": ("AHU-01", None, 1.0),
    "AHU-01.SupplyFanSpeed": ("AHU-01", "%", 68.0),
    "AHU-01.EconomizerEnable": ("AHU-01", None, 1.0),
    "AHU-01.PurgeState": ("AHU-01", None, 0.0),
    "AHU-01.SupplyAirflow": ("AHU-01", "CFM", 7800.0),
    "PARK.CO": ("ZONE-01", "ppm", 4.0),
    "PARK.FanState": ("AHU-01", None, 1.0),
    "PARK.FanSpeed": ("AHU-01", "%", 35.0),
    "PARK.Damper": ("AHU-01", "%", 30.0),
    "PARK.Airflow": ("AHU-01", "CFM", 4200.0),
    "SCHW.IndexDP": ("P-01", "kPa", 85.0),
    "SCHW.DPSetpoint": ("P-01", "kPa", 90.0),
    "SCHW.MostOpenValve": ("P-01", "%", 88.0),
    "SCHW.Flow": ("P-01", "L/s", 28.0),
    "SCHW.Speed": ("P-01", "%", 62.0),
    "SCHW.Power": ("P-01", "kW", 11.0),
    "SCHW.SupplyTemp": ("CH-01", "°C", 7.2),
    "SCHW.ReturnTemp": ("CH-01", "°C", 12.4),
    "SCHW.CoolingCall": ("P-01", None, 1.0),
    "ACC.OAT": ("SITE", "°C", 26.1),
    "ACC.HeadPressure": ("CH-01", "kPa", 1180.0),
    "ACC.HeadPressureSetpoint": ("CH-01", "kPa", 1200.0),
    "ACC.CondTemp": ("CH-01", "°C", 38.0),
    "ACC.FanSpeed": ("AHU-01", "%", 68.0),
    "ACC.FanState": ("CH-01", None, 1.0),
    "ACC.Load": ("CH-01", "tons", 183.0),
    "ACC.CompressorState": ("CH-01", None, 1.0),
    "ACC.RH": ("SITE", "%", 55.0),
    "CW.SupplyTemp": ("CW-01", "°C", 29.0),
    "CW.ReturnTemp": ("CW-01", "°C", 34.0),
    "CW.HeadPressure": ("CH-01", "kPa", 1180.0),
    "CW.CondTemp": ("CH-01", "°C", 31.0),
    "CW.Flow": ("P-01", "L/s", 28.0),
    "CW.PumpSpeed": ("P-01", "%", 62.0),
    "CW.PumpState": ("P-01", None, 1.0),
    "CW.Load": ("CH-01", "tons", 183.0),
    "CW.OAT": ("SITE", "°C", 26.1),
    "CW.WetBulb": ("SITE", "°C", 22.0),
    "CW.CompressorState": ("CH-01", None, 1.0),
    "CW.CoolingCall": ("CH-01", None, 1.0),
    "AHU-01.ReturnAirflow": ("AHU-01", "CFM", 7350.0),
    "AHU-01.OutdoorAirflow": ("AHU-01", "CFM", 2400.0),
    "AHU-01.ExhaustAirflow": ("AHU-01", "CFM", 850.0),
    "AHU-01.SupplyFanVFD": ("AHU-01", "Hz", 54.0),
    "AHU-01.SupplyFanPower": ("AHU-01", "kW", 8.4),
    "AHU-01.ReturnFanPower": ("AHU-01", "kW", 4.2),
    "AHU-01.DuctStaticPressure": ("AHU-01", "in.w.c.", 1.45),
    "AHU-01.BuildingDiffPressure": ("AHU-01", "in.w.c.", 0.012),
    "AHU-01.ReturnAirDamper": ("AHU-01", "%", 80.0),
    "AHU-01.MixedAirTemp": ("AHU-01", "°C", 22.7),
    "ZONE.AvgCO2": ("ZONE-01", "ppm", 560.0),
    "ZONE.MaxCO2": ("ZONE-01", "ppm", 640.0),
    "ZONE.OutdoorCO2": ("ZONE-01", "ppm", 415.0),
    "SCHW.ValveAvg": ("P-01", "%", 62.0),
    "SCHW.Load": ("CH-01", "%", 68.0),
    "SCHW.PumpsRunning": ("P-01", None, 1.0),
    "VFD-01.speed": ("VFD-01", "%", 62.0),
    "VFD-01.frequency": ("VFD-01", "Hz", 42.0),
    "VFD-01.power": ("VFD-01", "kW", 9.2),
    "AHU1.DuctStaticPressure": ("AHU-01", "in.w.c.", 1.45),
    "AHU1.StaticPressureSetpoint": ("AHU-01", "in.w.c.", 1.40),
    "AHU1.SupplyFanPower": ("AHU-01", "kW", 8.4),
    "AHU1.SupplyAirflow": ("AHU-01", "CFM", 7800.0),
    "VAV-101.DamperPosition": ("VAV-101", "%", 58.0),
    "VAV-102.DamperPosition": ("VAV-102", "%", 48.0),
    "VAV-103.DamperPosition": ("VAV-103", "%", 65.0),
    "VAV-104.DamperPosition": ("VAV-104", "%", 52.0),
    "VAV-105.DamperPosition": ("VAV-105", "%", 62.0),
    "VAV-106.DamperPosition": ("VAV-106", "%", 15.0),
    "VAV-107.DamperPosition": ("VAV-107", "%", 95.0),
    "VAV-108.DamperPosition": ("VAV-108", "%", 55.0),
    "VAV101.DamperPosition": ("VAV-101", "%", 58.0),
    "HHW.SupplyTemp": ("HHW-01", "°C", 52.0),
    "HHW.ReturnTemp": ("HHW-01", "°C", 42.0),
    "HHW.SupplySetpoint": ("HHW-01", "°C", 50.0),
    "HHW.PumpPower": ("P-01", "kW", 4.2),
    "WEATHER.OutdoorAirTemp": ("SITE", "°C", 26.1),
    "CHW.SupplyTemp": ("CH-01", "°C", 7.2),
    "CHW.ReturnTemp": ("CH-01", "°C", 12.4),
    "CHW.SupplySetpoint": ("CH-01", "°C", 7.0),
    "CHW.PlantFlow": ("CH-01", "GPM", 338.0),
    "CHILLER1.CompressorPower": ("CH-01", "kW", 40.8),
    "CH-01.power": ("CH-01", "kW", 105.0),
    "CHW.SecondaryPumpPower": ("P-01", "kW", 8.5),
    "CWS.SupplyTemp": ("CW-01", "°C", 29.0),
    "CWR.ReturnTemp": ("CW-01", "°C", 34.0),
    "CWS.SupplySetpoint": ("CW-01", "°C", 29.5),
    "WEATHER.WetBulbTemp": ("SITE", "°C", 22.0),
    "CT1.FanPower": ("CW-01", "kW", 10.5),
    "CWP1.PumpPower": ("P-01", "kW", 5.5),
    "REF.SuctionPressure": ("CH-01", "psig", 64.2),
    "REF.SuctionTemp": ("CH-01", "°C", 4.5),
    "REF.EvaporatorSuperheat": ("CH-01", "°C", 6.2),
    "REF.EvapTemp": ("CH-01", "°C", 4.2),
}


def _catalog_points() -> List[Tuple[str, str, str]]:
    seen = set()
    rows: List[Tuple[str, str, str]] = []
    for spec in CATALOG.values():
        for req in spec.get("required") or []:
            eq = req["equipment_id"]
            canon = req["canonical_point"]
            key = (eq, canon)
            if key in seen:
                continue
            seen.add(key)
            rows.append((eq, canon, f"{eq}.{canon}"))
    return rows


def _emit(
    point_id: str,
    value: float,
    unit: Optional[str],
    equipment_id: str,
    timestamp: Optional[datetime] = None,
) -> None:
    record_point(
        point_id=point_id,
        value=value,
        unit=unit,
        source="SIMULATION",
        quality="GOOD",
        equipment_id=equipment_id,
        timestamp=timestamp,
    )


def _value_for(canon: str, base: float, drift: float, oat: Optional[float]) -> float:
    if canon == "outdoor_air_temperature" and oat is not None:
        return float(oat)
    if canon in ("enable", "status", "occupancy", "alarms"):
        return float(base)
    return round(float(base) * (1.0 + drift), 3)


def _extra_value(pid: str, base: float, drift: float, oat: Optional[float], rh: Optional[float]) -> float:
    if "OAT" in pid or pid.endswith("OutdoorDryBulb"):
        return float(oat) if oat is not None else float(base)
    if pid.endswith("OutdoorRH") or pid.endswith(".RH"):
        return float(rh) if rh is not None else float(base)
    if float(base) in (0.0, 1.0) and (
        pid.endswith("State") or pid.endswith("Call") or pid.endswith("Count") or pid.endswith("Enable")
    ):
        return float(base)
    return round(float(base) * (1.0 + drift), 3)


def publish_once(timestamp: Optional[datetime] = None, tick: Optional[float] = None) -> int:
    from backend.services.weather_service import weather_service

    weather = weather_service.snapshot()
    oat = weather.get("oat")
    rh = weather.get("humidity") or weather.get("oah")
    t = time.time() if tick is None else float(tick)
    drift = math.sin(t / 40.0) * 0.04
    readings = []
    for eq, canon, pid in _catalog_points():
        if pid in _OVERRIDES:
            value = float(_OVERRIDES[pid])
        else:
            base = _BASE.get(canon, 1.0)
            value = _value_for(canon, base, drift, oat)
        readings.append(
            {
                "point_id": pid,
                "value": value,
                "unit": _UNITS.get(canon),
                "equipment_id": eq,
                "source": "SIMULATION",
                "quality": "GOOD",
                "timestamp": timestamp,
            }
        )
    for pid, (eq, unit, base) in _EXTRA.items():
        if pid in _OVERRIDES:
            value = float(_OVERRIDES[pid])
        else:
            value = _extra_value(pid, float(base), drift, oat, rh)
        readings.append(
            {
                "point_id": pid,
                "value": value,
                "unit": unit,
                "equipment_id": eq,
                "source": "SIMULATION",
                "quality": "GOOD",
                "timestamp": timestamp,
            }
        )
    n = record_points(readings)
    if timestamp is None:
        try:
            from backend.services.dataset_persist_service import persist_dataset_modules

            persist_dataset_modules(force=False)
        except Exception:
            pass
    return n


def apply_simulated_write(point_id: str, value: float) -> None:
    """Hold a synthetic setpoint so the feeder does not immediately overwrite it."""
    pid = (point_id or "").strip()
    if not pid:
        return
    _OVERRIDES[pid] = float(value)
    eq, _, canon = pid.partition(".")
    _emit(pid, float(value), _UNITS.get(canon) if canon else None, eq or None)


def seed_synthetic_history(hours: float = 2.0, step_minutes: float = 15.0) -> int:
    global _HISTORY_SEEDED
    hours = max(0.25, float(hours))
    step = max(1.0, float(step_minutes))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    steps = max(2, int((hours * 60.0) / step))
    total = 0
    try:
        from backend.services.dataset_persist_service import persist_dataset_modules
    except Exception:
        persist_dataset_modules = None  # type: ignore
    for i in range(steps, 0, -1):
        ts = now - timedelta(minutes=step * i)
        tick = time.time() - (step * 60.0 * i)
        total += publish_once(timestamp=ts, tick=tick)
        if persist_dataset_modules is not None:
            try:
                persist_dataset_modules(force=True, at=ts)
            except Exception:
                pass
    total += publish_once(timestamp=now)
    if persist_dataset_modules is not None:
        try:
            persist_dataset_modules(force=True, at=now)
        except Exception:
            pass
    _HISTORY_SEEDED = True
    return total


def _dataset_has_simulation() -> bool:
    try:
        from backend.services.canonical_telemetry_service import latest_points

        pts = latest_points(limit=20)
        return any(str(p.get("source") or "").upper() == "SIMULATION" for p in pts)
    except Exception:
        return False


def _module_series_thin() -> bool:
    """True when VS/energy historians lack a multi-point series (needs backfill)."""
    try:
        from database.session import SessionLocal
        from database.models_vs import VariableSpeedTelemetryDB

        db = SessionLocal()
        try:
            return db.query(VariableSpeedTelemetryDB).count() < 8
        finally:
            db.close()
    except Exception:
        return True


def ensure_synthetic_plant() -> int:
    """Keep the synthetic plant in SQLite. Reuse existing dataset rows when present."""
    global _HISTORY_SEEDED
    if _HISTORY_SEEDED:
        return publish_once()
    if _dataset_has_simulation() and not _module_series_thin():
        _HISTORY_SEEDED = True
        return publish_once()
    return seed_synthetic_history()


def reset_hydration_state() -> None:
    """Forget that this process seeded the demo tables.

    Called by init_db so a rebuilt schema (notably between tests) is re-seeded
    instead of being skipped by the once-per-process guard.
    """
    global _HYDRATED
    with _HYDRATE_LOCK:
        _HYDRATED = False


def hydrate_synthetic_dataset() -> int:
    """Fill canonical + DEMO tables so every page can run without LIVE BMS.

    Gated on HVAC_USE_SIMULATION so pytest (flag off) still sees empty plants.
    The demo seeders are idempotent but slow, so they run once per process and
    later calls only top up the plant; reset_hydration_state clears the guard.
    """
    global _HYDRATED
    if not _use_simulation_flag() or not is_simulation_mode():
        return 0
    with _HYDRATE_LOCK:
        if _HYDRATED:
            try:
                return ensure_synthetic_plant()
            except Exception:
                return 0
        n = _hydrate_synthetic_dataset_inner()
        _HYDRATED = True
        return n


def _hydrate_synthetic_dataset_inner() -> int:
    n = 0
    try:
        n = ensure_synthetic_plant()
    except Exception:
        try:
            n = publish_once()
        except Exception:
            n = 0
    try:
        from backend.services.dataset_persist_service import persist_dataset_modules

        persist_dataset_modules(force=True)
    except Exception:
        pass
    try:
        from backend.services.ventilation_opportunity_service import ensure_demo_telemetry

        ensure_demo_telemetry()
    except Exception:
        pass
    try:
        from backend.services.operations_maintenance_opportunity_service import ensure_om_demo

        ensure_om_demo()
    except Exception:
        pass
    try:
        from backend.ml.registry.demo_seed import ensure_demo_ml_models

        ensure_demo_ml_models()
    except Exception:
        pass
    try:
        from backend.services.plant_control_service import plant_control_service

        plant_control_service.ensure_demo_activity()
    except Exception:
        pass
    return n


def _loop(interval: float) -> None:
    while not _STOP.is_set():
        try:
            if is_simulation_mode():
                publish_once()
        except Exception:
            pass
        _STOP.wait(interval)


def _use_simulation_flag() -> bool:
    return os.getenv("HVAC_USE_SIMULATION", "0").strip() in ("1", "true", "TRUE")


def _simulation_feed_enabled() -> bool:
    from backend.services.platform_ops_service import PLANT_DATASET, get_plant_mode

    if not _use_simulation_flag():
        return False
    if get_plant_mode() == PLANT_DATASET:
        return True
    # Local BMS simulation still feeds Agent Centre even if plant mode was left LIVE in SQLite.
    return is_simulation_mode()


def start_simulation_telemetry(interval: float = 8.0, force: bool = False) -> None:
    global _THREAD
    if not is_simulation_mode():
        return
    if not force and not _simulation_feed_enabled():
        return
    if _THREAD and _THREAD.is_alive():
        return
    _STOP.clear()
    def _run_sim():
        try:
            hydrate_synthetic_dataset()
        except Exception:
            try:
                ensure_synthetic_plant()
            except Exception:
                try:
                    publish_once()
                except Exception:
                    pass
        _loop(max(5.0, interval))
        
    _THREAD = threading.Thread(target=_run_sim, name="sim-telemetry", daemon=True)
    _THREAD.start()


def stop_simulation_telemetry() -> None:
    global _THREAD
    _STOP.set()
    t = _THREAD
    _THREAD = None
    if t is not None and t.is_alive():
        t.join(timeout=1.0)
