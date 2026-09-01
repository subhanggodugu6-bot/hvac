"""Single source of truth for O10–O13: telemetry DB → engines → normalized API."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from database.session import SessionLocal
from database.models_ventilation import (
    HvacTelemetryDB,
    HvacOptimizationResultDB,
    HvacOptimizationCandidateDB,
)
from backend.agents.ventilation_airflow.o10_o13_engines import (
    META,
    ROUTES,
    evaluate_o10,
    evaluate_o11,
    evaluate_o12,
    evaluate_o13,
    moist_enthalpy_kjkg,
    LIVE_S,
)
from backend.services.ventilation_formatters import as_percent_number
from backend.services.official_catalog import CATALOG, OFFICIAL_VENT_IDS
from backend.services.logging_service import log_event

DEMO_SOURCE = "DEMO"
LIVE_SECONDS = int(os.environ.get("VENTILATION_LIVE_SECONDS", str(int(LIVE_S))))
ALLOW_DEMO = os.environ.get("HVAC_ALLOW_DEMO_TELEMETRY", "1") != "0"

EVALUATORS = {
    "O10": evaluate_o10,
    "O11": evaluate_o11,
    "O12": evaluate_o12,
    "O13": evaluate_o13,
}

def _saving_kw(delta_kw: Any) -> Optional[float]:
    """Power reduction as a positive kW saving. Positive deltas (extra load) are not savings."""
    if delta_kw is None:
        return None
    try:
        n = float(delta_kw)
    except (TypeError, ValueError):
        return None
    if n < 0:
        return round(abs(n), 2)
    return None


def _tel_ui(state: Optional[str]) -> str:
    return {
        "LIVE": "LIVE",
        "STALE": "DEGRADED",
        "UNAVAILABLE": "NO DATA",
        "ERROR": "API ERROR",
    }.get(state or "", state or "NO DATA")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _age_s(ts: Optional[datetime]) -> Optional[float]:
    if ts is None:
        return None
    if ts.tzinfo is not None:
        ts = ts.replace(tzinfo=None)
    return max(0.0, (_now() - ts).total_seconds())


def _tel_state(age: Optional[float], has_row: bool, error: Optional[str] = None) -> str:
    if error:
        return "ERROR"
    if not has_row:
        return "UNAVAILABLE"
    if age is None:
        return "UNAVAILABLE"
    if age <= LIVE_SECONDS:
        return "LIVE"
    return "STALE"


def _ensure_catalog(db) -> None:
    from database.models_opportunities import HvacOpportunityDB

    if db.query(HvacOpportunityDB).filter_by(id="O10").first():
        return
    try:
        for oid, num, section, name, desc in CATALOG:
            if oid not in ("O10", "O11", "O12", "O13"):
                continue
            row = db.query(HvacOpportunityDB).filter_by(id=oid).first()
            if not row:
                db.add(
                    HvacOpportunityDB(
                        id=oid,
                        opportunity_number=num,
                        section=section,
                        name=name,
                        description=desc,
                        status="ACTIVE",
                        enabled=True,
                    )
                )
            else:
                if hasattr(row, "agent"):
                    row.agent = "ventilation_airflow"
                if hasattr(row, "priority"):
                    row.priority = num
        db.commit()
    except Exception as exc:
        db.rollback()
        log_event("ERROR", "ventilation", "CATALOG_ENSURE_FAILED", extra={"error": type(exc).__name__})


def ensure_demo_telemetry(db=None, force: bool = False) -> Optional[int]:
    """Skyline Corporate Center (Bengaluru) development snapshot. source=DEMO."""
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        _ensure_catalog(db)
        latest = db.query(HvacTelemetryDB).order_by(HvacTelemetryDB.id.desc()).first()
        if latest and not force:
            return latest.id
        oat, oa_rh, rat, ra_rh = 17.5, 52.0, 24.0, 48.0
        row = HvacTelemetryDB(
            timestamp=_now(),
            site_id="SKYLINE-BLR",
            ahu_id="AHU-01",
            zone_id="ZONE-OPEN-OFFICE",
            outdoor_temp_c=oat,
            outdoor_rh_percent=oa_rh,
            outdoor_enthalpy_kjkg=moist_enthalpy_kjkg(oat, oa_rh),
            return_temp_c=rat,
            return_rh_percent=ra_rh,
            return_enthalpy_kjkg=moist_enthalpy_kjkg(rat, ra_rh),
            supply_air_temp_c=13.8,
            supply_airflow_cfm=7800.0,
            mixed_air_temp_c=18.2,
            damper_percent=82.0,
            co2_ppm=560.0,
            co_ppm=12.5,
            fan_power_kw=8.4,
            chiller_power_kw=42.0,
            total_hvac_power_kw=50.4,
            occupancy=68.0,
            occupied=True,
            schedule_state="OCCUPIED",
            return_airflow_cfm=7350.0,
            quality="GOOD",
            source=DEMO_SOURCE,
            site_name="Senatria Corporation",
            site_location="Bengaluru, Karnataka, India",
            plant_label="240T",
            building_area_sqft=75000.0,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id
    finally:
        if close:
            db.close()


def _row_to_dict(row: Optional[HvacTelemetryDB]) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        "id": row.id,
        "timestamp": row.timestamp,
        "site_id": row.site_id,
        "ahu_id": row.ahu_id,
        "zone_id": row.zone_id,
        "outdoor_temp_c": row.outdoor_temp_c,
        "outdoor_rh_percent": row.outdoor_rh_percent,
        "outdoor_enthalpy_kjkg": row.outdoor_enthalpy_kjkg,
        "return_temp_c": row.return_temp_c,
        "return_rh_percent": row.return_rh_percent,
        "return_enthalpy_kjkg": row.return_enthalpy_kjkg,
        "supply_air_temp_c": row.supply_air_temp_c,
        "supply_airflow_cfm": row.supply_airflow_cfm,
        "mixed_air_temp_c": row.mixed_air_temp_c,
        "damper_percent": row.damper_percent,
        "co2_ppm": row.co2_ppm,
        "co_ppm": row.co_ppm,
        "fan_power_kw": row.fan_power_kw,
        "chiller_power_kw": row.chiller_power_kw,
        "total_hvac_power_kw": row.total_hvac_power_kw,
        "occupancy": row.occupancy,
        "occupied": row.occupied,
        "schedule_state": row.schedule_state,
        "return_airflow_cfm": row.return_airflow_cfm,
        "quality": row.quality,
        "source": row.source,
        "building_area_sqft": row.building_area_sqft,
    }


def _usable(row: Optional[HvacTelemetryDB]) -> bool:
    if not row:
        return False
    src = (row.source or "").upper()
    if src in ("DEMO", "TEST TELEMETRY", "TEST"):
        return ALLOW_DEMO
    if src == "SIMULATION" or "SIMUL" in src:
        return (row.quality or "GOOD").upper() == "GOOD"
    return (row.quality or "GOOD").upper() == "GOOD"


def _empty_result(oid: str, tel_meta: Dict[str, Any], reason: str, status: str = "UNAVAILABLE") -> Dict[str, Any]:
    name, desc, prio = META[oid]
    return {
        "opportunityId": oid,
        "opportunity_id": oid,
        "code": oid,
        "name": name,
        "opportunity_name": name,
        "description": desc,
        "status": status,
        "priority": prio,
        "telemetry": tel_meta,
        "current": {"values": {}},
        "optimized": {"values": {}},
        "energy": {"instantaneousKw": None, "dailyKwh": None},
        "confidence": None,
        "guardrails": {"passed": None, "score": None, "violations": []},
        "recommendation": {"action": None, "rationale": reason},
        "current_value": None,
        "optimized_value": None,
        "recommended_value": None,
        "energy_impact": None,
        "expected_power_saving_kw": None,
        "expected_energy_saving_kwh_day": None,
        "enthalpy_advantage_kj_kg": None,
        "outdoor_enthalpy_kj_kg": None,
        "return_enthalpy_kj_kg": None,
        "optimized_airflow_cfm": None,
        "current_airflow_cfm": None,
        "candidates": [],
        "live": False,
        "source": tel_meta.get("source"),
        "reason": reason,
        "route": ROUTES[oid],
        "dataState": tel_meta.get("state"),
    }


def _persist(db, oid: str, tel_id: Optional[int], ev: Dict[str, Any], payload: Dict[str, Any]) -> None:
    try:
        row = HvacOptimizationResultDB(
            opportunity_id=oid,
            telemetry_id=tel_id,
            current_value=ev.get("current_value"),
            optimized_value=ev.get("optimized_value"),
            energy_savings_kw=ev.get("instantaneous_kw"),
            daily_savings_kwh=ev.get("daily_kwh"),
            confidence=ev.get("confidence"),
            guardrail_pass=ev.get("guardrail_pass"),
            recommendation=ev.get("recommendation"),
            rationale=ev.get("rationale"),
            status=ev.get("status"),
            payload_json=json.dumps({k: v for k, v in payload.items() if k != "candidates"}, default=str)[:8000],
        )
        db.add(row)
        db.flush()
        for c in ev.get("candidates") or []:
            db.add(
                HvacOptimizationCandidateDB(
                    optimization_result_id=row.id,
                    candidate_id=c.get("candidate_id"),
                    damper_position_percent=c.get("damper_position_pct"),
                    mixed_air_temp_c=c.get("mixed_air_temp_c"),
                    chiller_power_kw=c.get("chiller_power_kw"),
                    free_cooling_kw=c.get("free_cooling_kw"),
                    economizer_mode=c.get("economizer_mode"),
                    outdoor_air_cfm=c.get("outdoor_air_cfm"),
                    decision=c.get("decision"),
                    rejection_reason=c.get("rejection_reason"),
                )
            )
        db.commit()
    except Exception as exc:
        db.rollback()
        log_event("ERROR", "ventilation", "OPTIMIZATION_PERSIST_FAILED", extra={"error": type(exc).__name__})


def _normalize(oid: str, ev: Dict[str, Any], tel_meta: Dict[str, Any], tel: Dict[str, Any]) -> Dict[str, Any]:
    name, desc, prio = META[oid]
    status = ev.get("status") or "READY"
    if tel_meta.get("state") == "STALE" and status not in ("UNAVAILABLE", "ERROR"):
        pass
    if tel_meta.get("state") == "UNAVAILABLE":
        status = "UNAVAILABLE"
    conf = ev.get("confidence")
    current_values = {
        "damper_percent": tel.get("damper_percent"),
        "airflow_cfm": ev.get("current_airflow_cfm") or tel.get("supply_airflow_cfm"),
        "co2_ppm": tel.get("co2_ppm"),
        "co_ppm": tel.get("co_ppm"),
        "outdoor_temp_c": tel.get("outdoor_temp_c"),
        "return_temp_c": tel.get("return_temp_c"),
        "outdoor_rh_percent": tel.get("outdoor_rh_percent"),
        "return_rh_percent": tel.get("return_rh_percent"),
        "mixed_air_temp_c": tel.get("mixed_air_temp_c"),
        "supply_air_temp_c": tel.get("supply_air_temp_c"),
        "schedule_state": tel.get("schedule_state"),
        "chiller_power_kw": tel.get("chiller_power_kw"),
        "fan_power_kw": tel.get("fan_power_kw"),
    }
    optimized_values = {
        "damper_percent": ev.get("optimized_value") if oid == "O10" else ev.get("optimized_damper_pct") or ev.get("recommended_damper_pct"),
        "airflow_cfm": ev.get("optimized_airflow_cfm"),
    }
    body = {
        "opportunityId": oid,
        "opportunity_id": oid,
        "code": oid,
        "name": name,
        "opportunity_name": name,
        "description": desc,
        "status": status,
        "priority": prio,
        "telemetry": tel_meta,
        "current": {"values": current_values},
        "optimized": {"values": optimized_values},
        "energy": {
            "instantaneousKw": ev.get("instantaneous_kw"),
            "dailyKwh": ev.get("daily_kwh"),
        },
        "energySavingKw": _saving_kw(ev.get("instantaneous_kw")),
        "energySavingKwhDay": ev.get("daily_kwh"),
        "confidence": conf,
        "guardrails": {
            "passed": ev.get("guardrail_pass"),
            "score": None,
            "violations": [] if ev.get("guardrail_pass") else ["guardrail"],
        },
        "recommendation": {"action": ev.get("recommendation"), "rationale": ev.get("rationale")},
        "current_value": ev.get("current_value"),
        "optimized_value": ev.get("optimized_value"),
        "recommended_value": ev.get("recommended_value") or ev.get("optimized_value"),
        "unit": ev.get("unit"),
        "energy_impact": ev.get("instantaneous_kw"),
        "expected_power_saving_kw": ev.get("expected_power_saving_kw"),
        "expected_energy_saving_kwh_day": ev.get("expected_energy_saving_kwh_day"),
        "live": tel_meta.get("state") == "LIVE",
        "source": tel_meta.get("source"),
        "reason": ev.get("rationale"),
        "route": ROUTES[oid],
        "dataState": tel_meta.get("state"),
        "safety_status": ev.get("safety_status"),
        "candidates": ev.get("candidates") or [],
        "current_state": {},
        "optimized_state": {},
        "timestamp": tel_meta.get("lastUpdated"),
    }
    skip = {"available", "missing", "candidates"}
    for k, v in ev.items():
        if k not in skip and k not in body:
            body[k] = v
    # studio compatibility
    if oid == "O10":
        body["current_state"] = {
            "economizer_status": ev.get("economizer_status"),
            "oa_damper_pct": ev.get("current_value"),
            "outdoor_drybulb_c": ev.get("outdoor_drybulb_c"),
            "return_drybulb_c": ev.get("return_drybulb_c"),
            "outdoor_enthalpy_kj_kg": ev.get("outdoor_enthalpy_kj_kg"),
            "return_enthalpy_kj_kg": ev.get("return_enthalpy_kj_kg"),
            "enthalpy_advantage_kj_kg": ev.get("enthalpy_advantage_kj_kg"),
            "current_airflow_cfm": ev.get("current_airflow_cfm"),
            "free_cooling_kw": ev.get("free_cooling_kw"),
            "mixed_air_temp_c": tel.get("mixed_air_temp_c"),
            "supply_air_temp_c": tel.get("supply_air_temp_c"),
            "outdoor_rh_pct": ev.get("outdoor_rh_pct") or tel.get("outdoor_rh_percent"),
            "return_rh_pct": ev.get("return_rh_pct") or tel.get("return_rh_percent"),
            "schedule_state": tel.get("schedule_state"),
            "outdoor_dew_point_c": ev.get("outdoor_dew_point_c"),
            "return_dew_point_c": ev.get("return_dew_point_c"),
            "zone_cooling_setpoint_c": ev.get("zone_cooling_setpoint_c"),
            "return_air_damper_pct": ev.get("return_air_damper_pct"),
            "relief_damper_pct": ev.get("relief_damper_pct"),
            "fan_status": ev.get("fan_status"),
            "fan_command": ev.get("fan_command"),
            "fire_mode": ev.get("fire_mode"),
            "cooling_call": ev.get("cooling_call"),
            "cooling_valve_pct": ev.get("cooling_valve_pct"),
        }
        body["optimized_state"] = {
            "recommended_damper_pct": ev.get("optimized_value"),
            "optimized_airflow_cfm": ev.get("optimized_airflow_cfm"),
            "economizer_status": ev.get("economizer_status"),
        }
        from backend.services.dataset_persist_service import _dewpoint_c

        oat = tel.get("outdoor_temp_c")
        oa_rh = tel.get("outdoor_rh_percent")
        rat = tel.get("return_temp_c")
        ra_rh = tel.get("return_rh_percent")
        extras = {
            "outdoor_dew_point_c": _dewpoint_c(oat, oa_rh),
            "oa_dew_point_c": _dewpoint_c(oat, oa_rh),
            "return_dew_point_c": _dewpoint_c(rat, ra_rh),
            "ra_dew_point_c": _dewpoint_c(rat, ra_rh),
            "zone_cooling_setpoint_c": 24.0,
            "cooling_setpoint_c": 24.0,
            "return_air_damper_pct": 80.0,
            "return_air_damper": 80.0,
            "relief_damper_pct": 18.0,
            "fan_status": "ON" if tel.get("occupied") is not False else "OFF",
            "fan_command": "ON",
            "fire_mode": "NORMAL",
            "fire_alarm": "NORMAL",
            "cooling_call": "ACTIVE",
            "cooling_valve": 12.0,
            "occupancy_state": tel.get("schedule_state") or "OCCUPIED",
            "schedule_state": tel.get("schedule_state") or "OCCUPIED",
            "telemetry_quality": tel_meta.get("state") or "GOOD",
            "telemetry_age": tel_meta.get("ageSeconds"),
        }
        body.update(extras)
        body["current_state"].update(extras)
        body["historian"] = ventilation_historian("O10", hours=24)
        body["diagnostics"] = _o10_diagnostics(ev, tel, tel_meta)
    if oid == "O11":
        body["current_state"] = {
            "night_purge_status": ev.get("night_purge_status"),
            "outdoor_temperature_c": ev.get("outdoor_temperature_c"),
            "zone_temperature_c": ev.get("zone_temperature_c"),
            "temperature_differential_k": ev.get("temperature_differential_k"),
            "occupancy_state": ev.get("occupancy_state"),
            "ahu_availability": "AVAILABLE",
            "economizer_availability": "AVAILABLE",
            "oa_damper_pct": ev.get("oa_damper_pct"),
            "supply_air_temperature_c": tel.get("supply_air_temp_c"),
            "return_air_temperature_c": tel.get("return_temp_c"),
            "fan_state": "ON",
            "fan_speed": None,
            "current_airflow_cfm": ev.get("current_airflow_cfm"),
            "optimized_airflow_cfm": ev.get("optimized_airflow_cfm"),
            "occupant_count": tel.get("occupancy"),
            "co2_ppm": tel.get("co2_ppm"),
        }
        body["optimized_state"] = {
            "recommended_purge": ev.get("recommended_purge"),
            "recommended_start": ev.get("recommended_start"),
            "recommended_stop": ev.get("recommended_stop"),
            "recommended_damper_pct": ev.get("recommended_damper_pct"),
            "estimated_cooling_benefit_kwh": ev.get("estimated_cooling_benefit_kwh"),
            "estimated_energy_impact_kwh": ev.get("daily_kwh"),
        }
    if oid == "O13":
        body["current_state"] = {
            "co_ppm": ev.get("co_ppm"),
            "co_trend": "STABLE",
            "zone": tel.get("zone_id") or "PARK",
            "ventilation_status": ev.get("ventilation_status"),
            "fan_speed": ev.get("current_ventilation_pct"),
            "damper_pct": ev.get("current_damper_pct"),
            "airflow_cfm": ev.get("current_airflow_cfm"),
            "current_ventilation_pct": ev.get("current_ventilation_pct"),
            "co_limit_ppm": ev.get("co_limit_ppm"),
        }
        body["optimized_state"] = {
            "recommended_ventilation_pct": ev.get("recommended_ventilation_pct"),
            "recommended_fan_speed_pct": ev.get("recommended_fan_speed_pct"),
            "recommended_damper_pct": ev.get("recommended_damper_pct"),
        }
    return body


def evaluate_opportunity(oid: str, persist: bool = True, db=None) -> Dict[str, Any]:
    oid = oid.upper()
    if oid not in EVALUATORS:
        raise ValueError(f"Unknown opportunity ID: {oid}")
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        if ALLOW_DEMO:
            ensure_demo_telemetry(db)
        row = db.query(HvacTelemetryDB).order_by(HvacTelemetryDB.id.desc()).first()
        age = _age_s(row.timestamp if row else None)
        src = row.source if row else None
        tel_meta = {
            "state": _tel_state(age, bool(row and _usable(row))),
            "lastUpdated": row.timestamp.isoformat() if row and row.timestamp else None,
            "ageSeconds": round(age, 1) if age is not None else None,
            "source": src,
            "label": "DEMO / TEST TELEMETRY" if src and str(src).upper() in ("DEMO", "TEST TELEMETRY", "TEST") else src,
        }
        if not row or not _usable(row):
            return _empty_result(oid, {**tel_meta, "state": "UNAVAILABLE"}, "No usable telemetry snapshot.")
        tel = _row_to_dict(row)
        ev = EVALUATORS[oid](tel)
        if not ev.get("available"):
            out = _empty_result(oid, tel_meta, ev.get("missing") or "Required measurements unavailable.")
            out["telemetry"] = tel_meta
            return out
        out = _normalize(oid, ev, tel_meta, tel)
        if persist:
            _persist(db, oid, row.id, ev, out)
        return out
    finally:
        if close:
            db.close()


def _card(result: Dict[str, Any]) -> Dict[str, Any]:
    oid = result["opportunityId"]
    cur = result.get("current_value")
    opt = result.get("optimized_value")
    unavailable = result.get("status") == "UNAVAILABLE"
    if oid == "O10":
        current_s = None if cur is None else (f"{as_percent_number(cur):.1f}%" if as_percent_number(cur) is not None else None)
        optimized_s = None if opt is None else (f"{as_percent_number(opt):.1f}%" if as_percent_number(opt) is not None else None)
    else:
        from backend.services.ventilation_formatters import format_cfm
        current_s = format_cfm(cur) if cur is not None else None
        optimized_s = format_cfm(opt) if opt is not None else None
        if current_s == "—":
            current_s = None
        if optimized_s == "—":
            optimized_s = None
    energy = result.get("energy") or {}
    kw = energy.get("instantaneousKw")
    daily = energy.get("dailyKwh")
    saving = _saving_kw(kw)
    conf = result.get("confidence")
    tel = result.get("telemetry") or {}
    extra: Dict[str, Any] = {}
    if oid == "O10":
        extra["co2_ppm"] = None
        extra["safety"] = result.get("safety_status")
    if oid == "O11":
        extra["safety"] = result.get("safety_status")
    if oid == "O12":
        extra["co2_ppm"] = result.get("current_co2_ppm")
        extra["occupancy"] = result.get("occupant_count")
        extra["safety"] = result.get("safety_status")
        extra["current_damper"] = result.get("current_damper_pct")
        extra["optimized_damper"] = result.get("optimized_damper_pct")
    if oid == "O13":
        extra["co_ppm"] = result.get("co_ppm")
        extra["safety"] = result.get("safety_status")
        extra["return_airflow_cfm"] = result.get("return_airflow_cfm")
    return {
        "opportunity_id": oid,
        "opportunityId": oid,
        "opportunity_name": result.get("name"),
        "name": result.get("name"),
        "route": result.get("route"),
        "status": result.get("status"),
        "current_value": None if unavailable else current_s,
        "optimized_value": None if unavailable else optimized_s,
        "energy_impact": None if saving is None else f"{saving:.2f} kW",
        "daily_savings": None if daily is None else f"{daily:.1f} kWh/day",
        "confidence": None if conf is None else (f"{as_percent_number(conf):.0f}%" if as_percent_number(conf) is not None else None),
        "telemetry_state": _tel_ui(tel.get("state")),
        "telemetry_age_seconds": tel.get("ageSeconds"),
        "potential_kw_savings": saving,
        "potential_kwh_day_savings": daily,
        "energySavingKw": saving,
        "energySavingKwhDay": daily,
        "live": tel.get("state") == "LIVE",
        "source": tel.get("source"),
        "dataState": tel.get("state"),
        "safetyStatus": result.get("safety_status"),
        **extra,
    }


def get_dashboard() -> Dict[str, Any]:
    db = SessionLocal()
    try:
        opps = [evaluate_opportunity(oid, persist=False, db=db) for oid in OFFICIAL_VENT_IDS]
        cards = [_card(o) for o in opps]
        states = [(o.get("telemetry") or {}).get("state") for o in opps]
        if "ERROR" in states:
            fleet_tel = "ERROR"
        elif all(s == "UNAVAILABLE" for s in states):
            fleet_tel = "UNAVAILABLE"
        elif any(s == "STALE" for s in states):
            fleet_tel = "STALE"
        elif any(s == "LIVE" for s in states):
            fleet_tel = "LIVE"
        else:
            fleet_tel = "UNAVAILABLE"
        ages = [o.get("telemetry", {}).get("ageSeconds") for o in opps if o.get("telemetry", {}).get("ageSeconds") is not None]
        age = min(ages) if ages else None
        statuses = [o.get("status") for o in opps]
        kw_vals = [o.get("energy", {}).get("instantaneousKw") for o in opps]
        kwh_vals = [o.get("energy", {}).get("dailyKwh") for o in opps]
        energy_sum = round(sum(v for v in kw_vals if v is not None), 2) if any(v is not None for v in kw_vals) else None
        daily_sum = round(sum(v for v in kwh_vals if v is not None), 1) if any(v is not None for v in kwh_vals) else None
        o10 = next(o for o in opps if o["opportunityId"] == "O10")
        o11 = next(o for o in opps if o["opportunityId"] == "O11")
        o12 = next(o for o in opps if o["opportunityId"] == "O12")
        o13 = next(o for o in opps if o["opportunityId"] == "O13")
        iaq_bits = []
        if o12.get("iaq_compliance"):
            iaq_bits.append(o12["iaq_compliance"] == "PASS")
        if o13.get("iaq_compliance"):
            iaq_bits.append(o13["iaq_compliance"] == "PASS")
        iaq = round(100.0 * sum(1 for x in iaq_bits if x) / len(iaq_bits), 0) if iaq_bits else None
        dcv_parts = [_saving_kw((o12.get("energy") or {}).get("instantaneousKw")), _saving_kw((o13.get("energy") or {}).get("instantaneousKw"))]
        dcv_known = [v for v in dcv_parts if v is not None]
        dcv_kw = round(sum(dcv_known), 2) if dcv_known else None
        o10_save = _saving_kw((o10.get("energy") or {}).get("instantaneousKw"))
        o11_save = _saving_kw((o11.get("energy") or {}).get("instantaneousKw"))
        total_parts = [v for v in (o10_save, o11_save, *dcv_parts) if v is not None]
        total_vent = round(sum(total_parts), 2) if total_parts else None
        src = (o11.get("telemetry") or {}).get("source")
        demo = (src or "").upper() in ("DEMO", "TEST TELEMETRY", "TEST", "SIMULATION")
        if demo:
            bms_status = "OFFLINE"
            bms_detail = "DEMO / TEST TELEMETRY"
        elif fleet_tel == "LIVE":
            bms_status = "ONLINE"
            bms_detail = "BMS heartbeat healthy"
        elif fleet_tel in ("STALE",):
            bms_status = "DEGRADED"
            bms_detail = "Stale BMS telemetry"
        else:
            bms_status = "OFFLINE"
            bms_detail = None
        tel_ui = _tel_ui(fleet_tel)
        active = sum(1 for s in statuses if s not in (None, "UNAVAILABLE", "ERROR"))
        summary = {
            "total": len(OFFICIAL_VENT_IDS),
            "active": active,
            "optimal": sum(1 for s in statuses if s == "OPTIMAL"),
            "ready": sum(1 for s in statuses if s == "READY"),
            "warning": sum(1 for s in statuses if s in ("WARNING", "HOLD", "BLOCKED")),
            "unavailable": sum(1 for s in statuses if s == "UNAVAILABLE"),
            "energySavingsKw": total_vent,
            "dailySavingsKwh": daily_sum,
            "iaqCompliancePercent": iaq,
            "dcvKw": dcv_kw,
            "economyKw": o10_save,
        }
        tel_label = tel_ui if age is None else f"{tel_ui} · {int(round(age))}s"
        return {
            "agent": "ventilation_airflow",
            "module": {
                "name": "Ventilation & Air Flow Optimizations",
                "telemetry": {
                    "state": tel_ui,
                    "raw": fleet_tel,
                    "ageSeconds": age,
                    "label": tel_label,
                    "source": "DEMO / TEST TELEMETRY" if demo else src,
                },
                "bms": {"status": bms_status, "detail": bms_detail, "source": src},
                "iaqCompliance": iaq,
                "dcvKw": dcv_kw,
                "economyKw": o10_save,
            },
            "agent_health": "ONLINE" if fleet_tel == "LIVE" and not demo else tel_ui,
            "bms_status": bms_status,
            "bms_detail": bms_detail,
            "mode": "AUTO_CLOSED_LOOP",
            "telemetry": {
                "state": tel_ui,
                "raw": fleet_tel,
                "lastUpdated": next((o.get("telemetry", {}).get("lastUpdated") for o in opps if o.get("telemetry", {}).get("lastUpdated")), None),
                "ageSeconds": age,
                "label": tel_label,
                "source": "DEMO / TEST TELEMETRY" if demo else src,
            },
            "summary": summary,
            "opportunities": opps,
            "cards": cards,
            "iaq_comfort_compliance_pct": iaq,
            "telemetry_heartbeat": age,
            "live": fleet_tel == "LIVE",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()


def _o10_diagnostics(ev: Dict[str, Any], tel: Dict[str, Any], tel_meta: Dict[str, Any]) -> Dict[str, str]:
    def stat(ok: bool) -> str:
        return "PASS" if ok else "FAIL"

    quality = (tel.get("quality") or tel_meta.get("state") or "").upper()
    return {
        "Humidity Sensor": stat(tel.get("outdoor_rh_percent") is not None and tel.get("return_rh_percent") is not None),
        "Temperature Sensor": stat(tel.get("outdoor_temp_c") is not None and tel.get("return_temp_c") is not None),
        "Enthalpy Calculation": stat(ev.get("outdoor_enthalpy_kj_kg") is not None and ev.get("return_enthalpy_kj_kg") is not None),
        "OA Damper": stat(tel.get("damper_percent") is not None),
        "Return Damper": stat(ev.get("return_air_damper_pct") is not None or tel.get("return_air_damper_pct") is not None),
        "Relief Damper": stat(ev.get("relief_damper_pct") is not None),
        "Actuator": stat(tel.get("damper_percent") is not None),
        "Fan": stat(tel.get("fan_power_kw") is not None),
        "Pressurization": "UNKNOWN",
        "Filter Condition": "UNKNOWN",
        "BMS Communication": "OFFLINE" if tel_meta.get("state") == "UNAVAILABLE" else ("SIMULATED" if "SIM" in str(tel.get("source") or "").upper() else "PASS"),
        "Telemetry Quality": quality if quality else "MISSING",
    }


def ventilation_historian(oid: str, hours: int = 24) -> List[Dict[str, Any]]:
    since = _now() - timedelta(hours=hours)
    db = SessionLocal()
    try:
        rows = (
            db.query(HvacTelemetryDB)
            .filter(HvacTelemetryDB.timestamp >= since)
            .order_by(HvacTelemetryDB.timestamp.asc())
            .limit(max(hours * 8, 48))
            .all()
        )
        return [
            {
                "time": r.timestamp.strftime("%H:%M") if r.timestamp and hasattr(r.timestamp, "strftime") else str(r.timestamp),
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "outdoor_temp_c": r.outdoor_temp_c,
                "return_temp_c": r.return_temp_c,
                "outdoor_enthalpy_kjkg": r.outdoor_enthalpy_kjkg,
                "return_enthalpy_kjkg": r.return_enthalpy_kjkg,
                "damper_percent": r.damper_percent,
                "chiller_power_kw": r.chiller_power_kw,
                "fan_power_kw": r.fan_power_kw,
            }
            for r in rows
        ]
    finally:
        db.close()


def ventilation_audit_events(oid: str, limit: int = 50) -> List[Dict[str, Any]]:
    oid = oid.upper()
    events: List[Dict[str, Any]] = []
    db = SessionLocal()
    try:
        from database.models_platform import ControlAuditLogDB
        from database.models_opportunities import OpportunityAuditEventDB

        ctrl = (
            db.query(ControlAuditLogDB)
            .filter(ControlAuditLogDB.opportunity_id == oid)
            .order_by(ControlAuditLogDB.timestamp.desc())
            .limit(limit)
            .all()
        )
        for r in ctrl:
            events.append(
                {
                    "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                    "opportunity_id": r.opportunity_id,
                    "action": r.action,
                    "decision": r.decision,
                    "result": r.approval_status or r.action,
                    "safety_status": r.safety_status,
                    "reason": r.reason,
                }
            )
        audit_rows = (
            db.query(OpportunityAuditEventDB)
            .filter_by(opportunity_id=oid)
            .order_by(OpportunityAuditEventDB.timestamp.desc())
            .limit(limit)
            .all()
        )
        for r in audit_rows:
            events.append(
                {
                    "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                    "opportunity_id": r.opportunity_id,
                    "action": r.action,
                    "decision": r.result,
                    "result": r.result,
                    "reason": (r.details or {}).get("reason") if isinstance(r.details, dict) else None,
                }
            )
        opt_rows = (
            db.query(HvacOptimizationResultDB)
            .filter_by(opportunity_id=oid)
            .order_by(HvacOptimizationResultDB.id.desc())
            .limit(min(limit, 20))
            .all()
        )
        for r in opt_rows:
            events.append(
                {
                    "timestamp": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
                    "opportunity_id": oid,
                    "action": "OPTIMIZE",
                    "decision": r.recommendation,
                    "result": r.status,
                    "reason": r.rationale,
                }
            )
    finally:
        db.close()
    events.sort(key=lambda e: e.get("timestamp") or "", reverse=True)
    return events[:limit]
