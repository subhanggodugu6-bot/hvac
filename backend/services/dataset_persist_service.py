"""Copy synthetic plant points into every dataset table (never LIVE_BMS)."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_LAST_PERSIST = 0.0

_PC_POINTS = (
    ("O5", "AHU1.DuctStaticPressure", "AHU-01", "in.w.c."),
    ("O5", "AHU1.StaticPressureSetpoint", "AHU-01", "in.w.c."),
    ("O5", "AHU1.SupplyFanPower", "AHU-01", "kW"),
    ("O5", "AHU1.SupplyAirflow", "AHU-01", "CFM"),
    ("O5", "VAV101.DamperPosition", "VAV-101", "%"),
    ("O6", "HHW.SupplyTemp", "HHW-01", "°C"),
    ("O6", "HHW.ReturnTemp", "HHW-01", "°C"),
    ("O6", "HHW.SupplySetpoint", "HHW-01", "°C"),
    ("O6", "HHW.PumpPower", "P-01", "kW"),
    ("O6", "WEATHER.OutdoorAirTemp", "SITE", "°C"),
    ("O7", "CHW.SupplyTemp", "CH-01", "°C"),
    ("O7", "CHW.ReturnTemp", "CH-01", "°C"),
    ("O7", "CHW.SupplySetpoint", "CH-01", "°C"),
    ("O7", "CHW.PlantFlow", "CH-01", "GPM"),
    ("O7", "CHILLER1.CompressorPower", "CH-01", "kW"),
    ("O7", "CHW.SecondaryPumpPower", "P-01", "kW"),
    ("O8", "CWS.SupplyTemp", "CW-01", "°C"),
    ("O8", "CWR.ReturnTemp", "CW-01", "°C"),
    ("O8", "CWS.SupplySetpoint", "CW-01", "°C"),
    ("O8", "WEATHER.WetBulbTemp", "SITE", "°C"),
    ("O8", "CT1.FanPower", "CW-01", "kW"),
    ("O8", "CWP1.PumpPower", "P-01", "kW"),
    ("O9", "REF.SuctionPressure", "CH-01", "psig"),
    ("O9", "REF.SuctionTemp", "CH-01", "°C"),
    ("O9", "REF.EvaporatorSuperheat", "CH-01", "°C"),
    ("O9", "REF.EvapTemp", "CH-01", "°C"),
)


DATASET_ZONES = [
    {"id": "VAV-101", "name": "Open Office North", "temp": 22.8, "setpoint": 22.5, "occupied": True, "cooling_demand": 42.0, "heating_demand": 0.0, "damper_pos": 58.0, "cooling_valve": 32.0, "reheat_valve": 0.0, "airflow_cfm": 1240.0},
    {"id": "VAV-102", "name": "Executive Suite", "temp": 22.4, "setpoint": 22.5, "occupied": True, "cooling_demand": 35.0, "heating_demand": 0.0, "damper_pos": 48.0, "cooling_valve": 25.0, "reheat_valve": 0.0, "airflow_cfm": 980.0},
    {"id": "VAV-103", "name": "Conference Room B", "temp": 24.1, "setpoint": 22.5, "occupied": False, "cooling_demand": 10.0, "heating_demand": 0.0, "damper_pos": 18.0, "cooling_valve": 5.0, "reheat_valve": 0.0, "airflow_cfm": 450.0},
    {"id": "VAV-104", "name": "Finance Department", "temp": 22.9, "setpoint": 22.5, "occupied": True, "cooling_demand": 38.0, "heating_demand": 0.0, "damper_pos": 52.0, "cooling_valve": 28.0, "reheat_valve": 0.0, "airflow_cfm": 1120.0},
    {"id": "VAV-105", "name": "Engineering Wing", "temp": 23.1, "setpoint": 22.5, "occupied": True, "cooling_demand": 45.0, "heating_demand": 0.0, "damper_pos": 62.0, "cooling_valve": 35.0, "reheat_valve": 0.0, "airflow_cfm": 1380.0},
    {"id": "VAV-106", "name": "Training Room (Empty)", "temp": 24.3, "setpoint": 22.5, "occupied": False, "cooling_demand": 8.0, "heating_demand": 0.0, "damper_pos": 15.0, "cooling_valve": 0.0, "reheat_valve": 0.0, "airflow_cfm": 380.0},
    {"id": "VAV-107", "name": "Server Lab (Isolated)", "temp": 21.0, "setpoint": 21.0, "occupied": True, "cooling_demand": 92.0, "heating_demand": 0.0, "damper_pos": 95.0, "cooling_valve": 88.0, "reheat_valve": 0.0, "airflow_cfm": 2100.0},
    {"id": "VAV-108", "name": "Open Office South", "temp": 22.7, "setpoint": 22.5, "occupied": True, "cooling_demand": 40.0, "heating_demand": 0.0, "damper_pos": 55.0, "cooling_valve": 30.0, "reheat_valve": 0.0, "airflow_cfm": 1190.0},
]


def _dewpoint_c(temp_c: Optional[float], rh: Optional[float]) -> Optional[float]:
    if temp_c is None or rh is None:
        return None
    import math

    rh = min(100.0, max(0.01, float(rh)))
    a, b = 17.27, 237.7
    gamma = (a * float(temp_c)) / (b + float(temp_c)) + math.log(rh / 100.0)
    denom = a - gamma
    if abs(denom) < 1e-6:
        return None
    return round(b * gamma / denom, 2)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _num(by_id: Dict[str, Dict[str, Any]], *keys: str) -> Optional[float]:
    for key in keys:
        row = by_id.get(key)
        if not row or row.get("value") is None:
            continue
        try:
            return float(row["value"])
        except (TypeError, ValueError):
            continue
    return None


def persist_dataset_modules(force: bool = False, at: Optional[datetime] = None) -> int:
    """Write latest SIMULATION points into scheduling/plant/vent/OM/VS/energy tables.

    When ``at`` is set (history backfill), throttle is skipped and module rows
    stamp that timestamp so O14–O16 / energy / zone charts get a real series.
    """
    global _LAST_PERSIST
    now = time.time()
    if at is None and not force and now - _LAST_PERSIST < 8.0:
        return 0
    from backend.services.canonical_telemetry_service import latest_points

    points = latest_points(limit=400)
    by_id = {str(p.get("point_id") or ""): p for p in points if p.get("point_id")}
    if not by_id:
        return 0
    ts = at or _now()
    written = 0
    written += _persist_plant_control(by_id, ts=ts)
    written += _persist_ventilation(by_id, ts=ts)
    written += _persist_om(by_id, ts=ts)
    written += _persist_zones(by_id, ts=ts)
    written += _persist_variable_speed(by_id, ts=ts)
    written += _persist_energy(by_id, ts=ts)
    written += _persist_o1()
    if at is None:
        _LAST_PERSIST = now
    return written


def _persist_plant_control(by_id: Dict[str, Dict[str, Any]], ts: Optional[datetime] = None) -> int:
    from database.models import PlantControlTelemetryDB
    from database.session import SessionLocal
    from backend.services.plant_control_telemetry_service import plant_control_telemetry_service

    stamp = ts or _now()
    n = 0
    db = SessionLocal()
    try:
        for opp, pid, eq, unit in _PC_POINTS:
            val = _num(by_id, pid)
            if val is None:
                continue
            db.add(
                PlantControlTelemetryDB(
                    timestamp=stamp,
                    opportunity_code=opp,
                    equipment_id=eq,
                    point_name=pid,
                    value=val,
                    unit=unit,
                    quality="GOOD",
                    source="SIMULATION",
                )
            )
            plant_control_telemetry_service.record_point(
                pid, eq, val, unit, quality="GOOD", source="SIMULATION"
            )
            n += 1
        # Append one history tick per persist so /o5–/o9/history has a series.
        time_label = stamp.strftime("%H:%M") if hasattr(stamp, "strftime") else str(stamp)
        sp = _num(by_id, "AHU1.DuctStaticPressure") or 1.45
        sp_sp = _num(by_id, "AHU1.StaticPressureSetpoint") or 1.4
        plant_control_telemetry_service.buffer_history_entry(
            "O5",
            {"time": time_label, "static_pressure": round(sp, 3), "setpoint": round(sp_sp, 3)},
        )
        for opp, supply_key, sp_key in (
            ("O6", "HHW.SupplyTemp", "HHW.SupplySetpoint"),
            ("O7", "CHW.SupplyTemp", "CHW.SupplySetpoint"),
            ("O8", "CWS.SupplyTemp", "CWS.SupplySetpoint"),
        ):
            supply = _num(by_id, supply_key)
            setpoint = _num(by_id, sp_key)
            if supply is None and setpoint is None:
                continue
            plant_control_telemetry_service.buffer_history_entry(
                opp,
                {
                    "time": time_label,
                    "supply_temp": None if supply is None else round(supply, 2),
                    "setpoint": None if setpoint is None else round(setpoint, 2),
                },
            )
        sh = _num(by_id, "REF.EvaporatorSuperheat") or 6.2
        plant_control_telemetry_service.buffer_history_entry(
            "O9",
            {
                "time": time_label,
                "txv": round(sh, 2),
                "exv": 3.0,
                "txv_superheat": round(sh, 2),
                "setpoint": 3.0,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        n = 0
    finally:
        db.close()
    return n


def _persist_ventilation(by_id: Dict[str, Dict[str, Any]], ts: Optional[datetime] = None) -> int:
    from database.models_ventilation import HvacTelemetryDB
    from database.session import SessionLocal

    oat = _num(by_id, "WEATHER.OutdoorDryBulb", "SITE.outdoor_air_temperature", "ACC.OAT")
    rh = _num(by_id, "WEATHER.OutdoorRH", "ACC.RH")
    sat = _num(by_id, "AHU-01.SupplyAirTemp", "AHU-01.supply_air_temperature")
    rat = _num(by_id, "AHU-01.ReturnAirTemp", "AHU-01.return_air_temperature")
    ra_rh = _num(by_id, "AHU-01.ReturnAirRH", "ZONE.AvgRH")
    mat = _num(by_id, "AHU-01.MixedAirTemp")
    cfm = _num(by_id, "AHU-01.SupplyAirflow")
    ret_cfm = _num(by_id, "AHU-01.ReturnAirflow")
    damper = _num(by_id, "AHU-01.OutdoorAirDamper", "AHU-01.oa_damper")
    co2 = _num(by_id, "ZONE.AvgCO2", "ZONE-01.co2")
    co = _num(by_id, "PARK.CO", "ZONE-01.co_ppm")
    occ = _num(by_id, "ZONE.OccupantCount", "ZONE-01.occupancy")
    fan_kw = _num(by_id, "AHU-01.SupplyFanPower")
    ch_kw = _num(by_id, "CHILLER1.CompressorPower", "CH-01.energy")
    if ra_rh is None and rat is not None:
        ra_rh = 48.0
    from backend.agents.ventilation_airflow.o10_o13_engines import moist_enthalpy_kjkg

    oa_h = moist_enthalpy_kjkg(oat, rh)
    ra_h = moist_enthalpy_kjkg(rat, ra_rh)
    stamp = ts or _now()
    db = SessionLocal()
    try:
        db.add(
            HvacTelemetryDB(
                timestamp=stamp,
                site_id="SKYLINE-BLR",
                ahu_id="AHU-01",
                zone_id="ZONE-01",
                outdoor_temp_c=oat,
                outdoor_rh_percent=rh,
                outdoor_enthalpy_kjkg=oa_h,
                return_temp_c=rat,
                return_rh_percent=ra_rh,
                return_enthalpy_kjkg=ra_h,
                supply_air_temp_c=sat,
                supply_airflow_cfm=cfm,
                mixed_air_temp_c=mat,
                damper_percent=damper,
                co2_ppm=co2,
                co_ppm=co,
                fan_power_kw=fan_kw,
                chiller_power_kw=ch_kw,
                total_hvac_power_kw=(fan_kw or 0) + (ch_kw or 0) if fan_kw or ch_kw else None,
                occupancy=occ,
                occupied=bool(occ and occ > 0),
                schedule_state="OCCUPIED" if occ and occ > 0 else "UNOCCUPIED",
                return_airflow_cfm=ret_cfm,
                quality="GOOD",
                source="SIMULATION",
                site_name="Senatria Corporation",
                site_location="Bengaluru, Karnataka, India",
                plant_label="240T",
            )
        )
        db.commit()
        return 1
    except Exception:
        db.rollback()
        return 0
    finally:
        db.close()


def _persist_om(by_id: Dict[str, Dict[str, Any]], ts: Optional[datetime] = None) -> int:
    from database.models_om import OmTelemetryDB
    from database.session import SessionLocal
    from backend.services.operations_maintenance_opportunity_service import (
        OFFICIAL_OM_IDS,
        O20_SIM_PAYLOAD,
        _ensure_om_catalog,
        _ensure_om_side_tables,
    )

    hvac_kw = _num(by_id, "CHILLER1.CompressorPower", "AHU-01.SupplyFanPower") or 428.5
    oat = _num(by_id, "WEATHER.OutdoorDryBulb", "SITE.outdoor_air_temperature")
    occ = _num(by_id, "ZONE.OccupantCount")
    stamp = ts or _now()
    db = SessionLocal()
    try:
        _ensure_om_catalog(db)
        _ensure_om_side_tables(db)
        for oid in OFFICIAL_OM_IDS:
            db.add(
                OmTelemetryDB(
                    opportunity_id=oid,
                    timestamp=stamp,
                    source="SIMULATION",
                    quality="GOOD",
                    electrical_power_kw=512.0 if oid == "O17" else None,
                    hvac_power_kw=hvac_kw if oid == "O17" else None,
                    daily_energy_kwh=5120.0 if oid == "O17" else None,
                    occupancy=occ if oid == "O17" else None,
                    outdoor_temp_c=oat if oid == "O17" else None,
                    payload_json=json.dumps({"baseline_kw": 462.0, "peak_demand_kw": 540.0, "target_kw": 410.0})
                    if oid == "O17"
                    else json.dumps({"manual_override_count": 3, "affected_users": 14, "energy_impact_kwh_day": 8.4})
                    if oid == "O18"
                    else json.dumps({"filter_dp_rise_pct": 34.0, "fan_power_kw": 14.1, "equipment_health_pct": 87.0, "equipment_id": "AHU-02"})
                    if oid == "O19"
                    else json.dumps(O20_SIM_PAYLOAD),
                )
            )
        db.commit()
        return len(OFFICIAL_OM_IDS)
    except Exception:
        db.rollback()
        return 0
    finally:
        db.close()


def _persist_zones(by_id: Dict[str, Dict[str, Any]], ts: Optional[datetime] = None) -> int:
    from database.models import ZoneTelemetryDB
    from database.session import SessionLocal

    drift = (_num(by_id, "ZONE-01.zone_temperature", "ZONE.AvgTemp") or 22.8) - 22.8
    stamp = ts or _now()
    db = SessionLocal()
    n = 0
    try:
        for z in DATASET_ZONES:
            db.add(
                ZoneTelemetryDB(
                    timestamp=stamp,
                    zone_id=z["id"],
                    actual_temperature=round(z["temp"] + drift, 2),
                    current_setpoint=z["setpoint"],
                    optimized_setpoint=round(z["setpoint"] + (0.8 if z["occupied"] else 2.0), 1),
                    deadband=2.0 if z["occupied"] else 4.0,
                    occupancy=z["occupied"],
                    cooling_demand=z["cooling_demand"],
                    heating_demand=z["heating_demand"],
                    damper_position=z["damper_pos"],
                    cooling_valve=z["cooling_valve"],
                    reheat_valve=z["reheat_valve"],
                    airflow_cfm=z["airflow_cfm"],
                    sensor_quality="GOOD",
                )
            )
            n += 1
        db.commit()
    except Exception:
        db.rollback()
        n = 0
    finally:
        db.close()
    return n


def _persist_variable_speed(by_id: Dict[str, Dict[str, Any]], ts: Optional[datetime] = None) -> int:
    from database.models_vs import VariableSpeedTelemetryDB
    from database.session import SessionLocal

    stamp = ts or _now()
    rows = [
        ("P-01", "SCHW.Speed", "speed", _num(by_id, "SCHW.Speed", "P-01.speed"), "%", "O14"),
        ("P-01", "SCHW.Flow", "flow", _num(by_id, "SCHW.Flow", "P-01.flow"), "L/s", "O14"),
        ("P-01", "SCHW.Power", "power", _num(by_id, "SCHW.Power"), "kW", "O14"),
        ("CH-01", "ACC.HeadPressure", "head_pressure", _num(by_id, "ACC.HeadPressure"), "kPa", "O15"),
        ("CH-01", "CW.HeadPressure", "head_pressure", _num(by_id, "CW.HeadPressure"), "kPa", "O16"),
        ("VFD-01", "VFD-01.speed", "speed", _num(by_id, "VFD-01.speed"), "%", "O14"),
    ]
    db = SessionLocal()
    n = 0
    try:
        for eq, pid, name, val, unit, oid in rows:
            if val is None:
                continue
            db.add(
                VariableSpeedTelemetryDB(
                    timestamp=stamp,
                    equipment_id=eq,
                    point_id=pid,
                    point_name=name,
                    value=val,
                    unit=unit,
                    quality="GOOD",
                    source="SIMULATION",
                    opportunity_id=oid,
                )
            )
            n += 1
        db.commit()
    except Exception:
        db.rollback()
        n = 0
    finally:
        db.close()
    return n


def _persist_energy(by_id: Dict[str, Dict[str, Any]], ts: Optional[datetime] = None) -> int:
    from database.models_energy_ops import EnergyTelemetryDB
    from database.session import SessionLocal

    ch = _num(by_id, "CHILLER1.CompressorPower") or 40.8
    fans = _num(by_id, "AHU-01.SupplyFanPower") or 8.4
    pumps = _num(by_id, "SCHW.Power") or 11.0
    stamp = ts or _now()
    db = SessionLocal()
    try:
        for meter, cat, kw in (
            ("CHILLER-PLANT-METER", "CHILLERS", ch),
            ("AHU-SUBMETER", "FANS", fans),
            ("PUMP-SUBMETER", "PUMPS", pumps),
            ("MAIN-ELEC-METER", "TOTAL_HVAC", ch + fans + pumps),
        ):
            db.add(
                EnergyTelemetryDB(
                    timestamp=stamp,
                    meter_id=meter,
                    category=cat,
                    power_kw=kw,
                    quality="GOOD",
                    source="SIMULATION",
                )
            )
        db.commit()
        return 4
    except Exception:
        db.rollback()
        return 0
    finally:
        db.close()


def _persist_o1() -> int:
    try:
        from backend.services.o1_pipeline import ingest_from_dataset_catalog

        return int(ingest_from_dataset_catalog(source="SIMULATION") or 0)
    except Exception:
        return 0
