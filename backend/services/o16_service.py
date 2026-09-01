"""O16 domain service: telemetry → state → optimize → safety → command lifecycle."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.agents.official_opportunities.o16_water_cooled_hp import ENGINE_VERSION, evaluate_water_cooled_hp
from backend.agents.runtime.command import active_for_point, get_command, list_commands, propose, set_status
from backend.agents.runtime.contracts import CommandContract
from backend.agents.runtime.verification import rollback_command, verify_command
from backend.agents.runtime.audit import audit_command
from backend.agents.scheduling_supervisory.gateway import get_bms_gateway
from backend.services.canonical_telemetry_service import find_point_by_suffix, latest_points, record_point
from backend.services.ttl_cache import cache_get, cache_set
from backend.services.hvac_safety_contract import (
    classify_ui_state,
    evaluate_dispatch,
    ingest_quality,
    is_demo_source,
    is_safe_mode,
    normalize_telemetry_source,
    production_bms_connected,
)
from backend.services.logging_service import log_event
from backend.services.opportunity_persist_service import audit, persist_execution, persist_optimization
from backend.services.platform_ops_service import get_safe_mode, set_safe_mode
from sqlalchemy import or_
from database.models import Building, Equipment, VariableSpeedEquipmentDB
from database.models_o16 import (
    O16ConfigDB,
    O16RecommendationDB,
    O16SavingsDB,
    O16StateDB,
    O16TelemetryDB,
    O16VerificationDB,
)
from database.models_platform import AgentRunDB
from database.session import SessionLocal

POINT_ALIASES = {
    "CEWT": ("CW.SupplyTemp", "O16.CEWT", "WCC.CEWT", "CW-01.cw_supply_temperature", "CH-01.condenser_water_temperature"),
    "CLWT": ("CW.ReturnTemp", "O16.CLWT", "WCC.CLWT", "CW-01.cw_return_temperature"),
    "HEAD_PRESSURE": ("CW.HeadPressure", "O16.HEAD_PRESSURE", "WCC.HeadPressure", "CH-01.head_pressure"),
    "HP_SETPOINT": ("CW.HeadPressureSetpoint", "O16.HP_SETPOINT"),
    "COND_TEMP": ("CW.CondTemp", "O16.COND_TEMP", "CH-01.condenser_water_temperature"),
    "CW_FLOW": ("CW.Flow", "O16.CW_FLOW", "P-01.flow"),
    "PUMP_SPEED": ("CW.PumpSpeed", "O16.PUMP_SPEED", "P-01.speed"),
    "PUMP_STATE": ("CW.PumpState", "O16.PUMP_STATE", "P-01.status"),
    "PUMP_POWER_KW": ("CW.PumpPower", "O16.PUMP_POWER_KW", "P-01.power", "VFD-01.power"),
    "VALVE_POSITION": ("CW.ValvePosition", "O16.VALVE_POSITION"),
    "LOAD": ("CW.Load", "O16.LOAD", "CH-01.load"),
    "COMPRESSOR_STATE": ("CW.CompressorState", "O16.COMPRESSOR_STATE", "CH-01.status"),
    "COOLING_CALL": ("CW.CoolingCall", "O16.COOLING_CALL"),
    "OAT": ("CW.OAT", "O16.OAT", "SITE.outdoor_air_temperature"),
    "OAWB": ("CW.WetBulb", "O16.OAWB"),
    "ALARM": ("CW.Alarm", "O16.ALARM", "CH-01.alarms"),
    "ACTIVE_CONDENSERS": ("CW.ActiveCondensers", "O16.ACTIVE_CONDENSERS"),
}

DEFAULT_CONFIG = {
    "enabled": True,
    "control_mode": "ADVISORY",
    "control_strategy": "VSD_PUMP",
    "shared_pump": False,
    "target_head_pressure": 1120.0,
    "target_condensing_temp_c": 30.0,
    "min_head_pressure": None,
    "max_head_pressure": None,
    "min_condensing_temp_c": None,
    "max_condensing_temp_c": None,
    "min_pump_speed_pct": None,
    "max_pump_speed_pct": None,
    "min_cw_flow": None,
    "max_cw_flow": None,
    "min_valve_pct": None,
    "max_valve_pct": None,
    "pump_trim_pct": 2.0,
    "valve_trim_pct": 2.0,
    "hp_deadband": 2.0,
    "max_pump_step_pct": 25.0,
    "high_load_pct": 90.0,
    "isolate_valve_pct": 0.0,
    "verify_tolerance": 0.5,
    "refrigerant": None,
    "config_version": "1.0",
    "labels": {
        "control_strategy": "SOURCE-GUIDE (VSD pump / modulating valve / coordinated)",
        "shared_pump": "SOURCE-GUIDE (multiple units on one pump)",
        "target_head_pressure": "CONFIGURABLE (guide: determine optimal/floating HP; no formula given)",
        "target_condensing_temp_c": "CONFIGURABLE",
        "min_head_pressure": "CONFIGURABLE",
        "max_head_pressure": "CONFIGURABLE",
        "min_pump_speed_pct": "CONFIGURABLE",
        "max_pump_speed_pct": "CONFIGURABLE",
        "min_cw_flow": "CONFIGURABLE",
        "pump_trim_pct": "CONFIGURABLE_DEFAULT",
        "valve_trim_pct": "CONFIGURABLE_DEFAULT",
        "hp_deadband": "CONFIGURABLE_DEFAULT",
        "max_pump_step_pct": "CONFIGURABLE_DEFAULT",
        "high_load_pct": "CONFIGURABLE_DEFAULT",
        "control_mode": "IMPLEMENTATION",
        "enabled": "IMPLEMENTATION",
    },
}

CONFIG_KEYS = (
    "enabled",
    "control_mode",
    "control_strategy",
    "shared_pump",
    "target_head_pressure",
    "target_condensing_temp_c",
    "min_head_pressure",
    "max_head_pressure",
    "min_condensing_temp_c",
    "max_condensing_temp_c",
    "min_pump_speed_pct",
    "max_pump_speed_pct",
    "min_cw_flow",
    "max_cw_flow",
    "min_valve_pct",
    "max_valve_pct",
    "pump_trim_pct",
    "valve_trim_pct",
    "hp_deadband",
    "max_pump_step_pct",
    "high_load_pct",
    "isolate_valve_pct",
    "verify_tolerance",
    "refrigerant",
    "config_version",
)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _building_id() -> Optional[str]:
    db = SessionLocal()
    try:
        b = db.query(Building).first()
        return b.id if b else None
    except Exception:
        return None
    finally:
        db.close()


def get_config(building_id: Optional[str] = None) -> Dict[str, Any]:
    bid = building_id or _building_id() or "default"
    db = SessionLocal()
    try:
        row = db.query(O16ConfigDB).filter_by(building_id=bid).first()
        if not row:
            return {**DEFAULT_CONFIG, "building_id": bid, "persisted": False}
        data = {c.name: getattr(row, c.name) for c in O16ConfigDB.__table__.columns}
        data["labels"] = DEFAULT_CONFIG["labels"]
        data["persisted"] = True
        return data
    finally:
        db.close()


def save_config(payload: Dict[str, Any], building_id: Optional[str] = None) -> Dict[str, Any]:
    bid = building_id or payload.get("building_id") or _building_id() or "default"
    db = SessionLocal()
    try:
        row = db.query(O16ConfigDB).filter_by(building_id=bid).first()
        if not row:
            row = O16ConfigDB(building_id=bid, control_mode="ADVISORY", control_strategy="VSD_PUMP")
            db.add(row)
        for key in CONFIG_KEYS:
            if key in payload and payload[key] is not None:
                setattr(row, key, payload[key])
        row.updated_at = _now()
        db.commit()
        return get_config(bid)
    finally:
        db.close()


def _latest_named(points: List[Dict[str, Any]], names: tuple) -> Optional[Dict[str, Any]]:
    by_id = {p.get("point_id"): p for p in points}
    for name in names:
        if name in by_id:
            return by_id[name]
    return None


def sample_o16(building_id: Optional[str] = None) -> Dict[str, Any]:
    pts = latest_points(building_id, limit=400)
    sampled: Dict[str, Any] = {"_points": pts}
    sources, ages, qualities = [], [], []
    for key, aliases in POINT_ALIASES.items():
        row = _latest_named(pts, aliases)
        if not row:
            sampled[key] = None
            continue
        sampled[key] = row.get("value")
        sampled[f"{key}__meta"] = row
        sources.append(row.get("source"))
        qualities.append(row.get("quality") or row.get("classified"))
        if row.get("age_seconds") is not None:
            ages.append(row["age_seconds"])
        if row.get("timestamp"):
            sampled["timestamp"] = sampled.get("timestamp") or row["timestamp"]
    sampled["source"] = sources[0] if sources else None
    sampled["quality"] = qualities[0] if qualities else "MISSING"
    sampled["age_seconds"] = max(ages) if ages else None
    sampled["building_id"] = building_id or _building_id()
    return sampled


def _is_o16_eq(typ: str, name: str) -> bool:
    blob = f"{typ} {name}".upper()
    return any(k in blob for k in ("WATER_COOLED", "WCC", "CW_PUMP", "CONDENSER_WATER", "CW VALVE", "COOLING_TOWER", "HEAD_PRESSURE", "CW-"))


def list_equipment(building_id: Optional[str] = None) -> List[Dict[str, Any]]:
    bid = building_id or _building_id()
    cached = cache_get(("o16_eq", bid or ""))
    if cached is not None:
        return cached
    db = SessionLocal()
    out: List[Dict[str, Any]] = []
    try:
        vs = db.query(VariableSpeedEquipmentDB)
        if bid:
            vs = vs.filter(VariableSpeedEquipmentDB.building_id == bid)
        o16_match = or_(
            VariableSpeedEquipmentDB.equipment_type.ilike("%WATER_COOLED%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%WCC%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%CW_PUMP%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%CONDENSER_WATER%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%COOLING_TOWER%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%HEAD_PRESSURE%"),
            VariableSpeedEquipmentDB.name.ilike("%WATER_COOLED%"),
            VariableSpeedEquipmentDB.name.ilike("%CW VALVE%"),
            VariableSpeedEquipmentDB.name.ilike("%CW-%"),
            VariableSpeedEquipmentDB.name.ilike("%COOLING_TOWER%"),
            VariableSpeedEquipmentDB.name.ilike("%HEAD_PRESSURE%"),
        )
        rows = list(vs.filter(o16_match).all())
        seen = {r.id for r in rows}
        eq_q = db.query(Equipment)
        if bid:
            eq_q = eq_q.filter(Equipment.building_id == bid)
        extra = eq_q.filter(
            or_(
                Equipment.type.ilike("%WATER_COOLED%"),
                Equipment.type.ilike("%WCC%"),
                Equipment.type.ilike("%CW_PUMP%"),
                Equipment.type.ilike("%CONDENSER_WATER%"),
                Equipment.type.ilike("%COOLING_TOWER%"),
                Equipment.type.ilike("%HEAD_PRESSURE%"),
                Equipment.name.ilike("%WATER_COOLED%"),
                Equipment.name.ilike("%CW VALVE%"),
                Equipment.name.ilike("%CW-%"),
                Equipment.name.ilike("%COOLING_TOWER%"),
                Equipment.name.ilike("%HEAD_PRESSURE%"),
            )
        ).all()
        for e in extra:
            if e.id not in seen:
                rows.append(e)
                seen.add(e.id)
        pts = latest_points(bid, limit=400)
        find = find_point_by_suffix(pts)
        for p in rows:
            pid = getattr(p, "id", None)
            src = find(pid, "speed", "pressure", "temp", "flow", "valve", "power") or {}
            out.append(
                {
                    "equipment_id": pid,
                    "name": getattr(p, "name", pid),
                    "type": getattr(p, "equipment_type", None) or getattr(p, "type", None),
                    "status": None if find(pid, "status") is None else find(pid, "status").get("value"),
                    "current_value": src.get("value") if src else None,
                    "target": None,
                    "alarms": None if find(pid, "alarm") is None else find(pid, "alarm").get("value"),
                    "data_quality": src.get("quality") or src.get("classified"),
                    "source": src.get("source"),
                    "last_seen": src.get("timestamp"),
                }
            )
        cache_set(("o16_eq", bid or ""), out, 2.5)
        return out
    except Exception:
        return []
    finally:
        db.close()


def _should_persist_snapshot(result: Dict[str, Any], sampled: Dict[str, Any]) -> bool:
    if result.get("live"):
        return True
    src = sampled.get("source") or (result.get("classified_telemetry") or {}).get("source")
    return is_demo_source(src) or "SIM" in str(src or "").upper()


def _persist_snapshot(sampled: Dict[str, Any], result: Dict[str, Any]) -> None:
    if not _should_persist_snapshot(result, sampled):
        return
    cs = result.get("current_state") or {}
    db = SessionLocal()
    try:
        db.add(
            O16StateDB(
                timestamp=_now(),
                building_id=sampled.get("building_id"),
                load_ratio=cs.get("load_ratio"),
                condensing_pressure=cs.get("head_pressure"),
                condensing_temperature=cs.get("condensing_temperature_c"),
                cw_supply_temperature=cs.get("cewt_c"),
                cw_return_temperature=cs.get("clwt_c"),
                cw_flow=cs.get("cw_flow"),
                pump_speed=cs.get("pump_speed_pct"),
                pump_power=cs.get("pump_power_kw"),
                valve_position=cs.get("valve_position_pct"),
                head_pressure_margin=cs.get("head_pressure_margin"),
                quality=sampled.get("quality"),
                source=sampled.get("source"),
                state_json={"recommendation": result.get("recommendation"), "reason": result.get("reason")},
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _persist_run(sampled: Dict[str, Any], result: Dict[str, Any]) -> str:
    run_id = f"o16_{uuid.uuid4().hex[:12]}"
    rec_id = f"rec_o16_{uuid.uuid4().hex[:10]}"
    os_ = result.get("optimized_state") or {}
    db = SessionLocal()
    try:
        db.add(
            AgentRunDB(
                id=run_id,
                opportunity="O16",
                building_id=sampled.get("building_id"),
                engine_version=ENGINE_VERSION,
                status=result.get("status") or result.get("recommendation"),
                started_at=_now(),
                finished_at=_now(),
                input_json={k: sampled[k] for k in sampled if not str(k).startswith("_") and "__" not in str(k)},
                output_json={
                    "recommendation": result.get("recommendation"),
                    "optimized_state": os_,
                    "safety_status": result.get("safety_status"),
                },
            )
        )
        db.add(
            O16RecommendationDB(
                id=rec_id,
                run_id=run_id,
                building_id=sampled.get("building_id"),
                target_condensing_pressure=os_.get("recommended_head_pressure"),
                target_condensing_temperature=os_.get("recommended_condensing_temp_c"),
                recommended_pump_speed=os_.get("recommended_pump_speed_pct"),
                recommended_valve_position=os_.get("recommended_valve_position_pct"),
                predicted_power=result.get("predicted_pump_power_kw"),
                predicted_savings=result.get("predicted_power_delta_kw"),
                confidence=result.get("confidence"),
                reason=result.get("reason"),
                engine_version=ENGINE_VERSION,
                config_version=str((result.get("config") or {}).get("config_version") or "1.0"),
                status=result.get("recommendation_state") or result.get("status"),
                created_at=_now(),
                payload_json=result.get("why"),
            )
        )
        if result.get("predicted_pump_power_kw") is not None:
            db.add(
                O16SavingsDB(
                    building_id=sampled.get("building_id"),
                    baseline_kw=(result.get("current_state") or {}).get("pump_power_kw"),
                    predicted_kw=result.get("predicted_pump_power_kw"),
                    methodology="PREDICTED affinity-law pump power (Appendix D); not verified",
                    created_at=_now(),
                )
            )
        db.commit()
        result["run_id"] = run_id
        result["recommendation_id"] = rec_id
        log_event("INFO", "o16", "recommendation_created", opportunity="O16", building_id=sampled.get("building_id"), extra={"run_id": run_id})
        return run_id
    except Exception:
        db.rollback()
        return run_id
    finally:
        db.close()


def _normalize_load_pct(sampled: Dict[str, Any]) -> None:
    load = sampled.get("LOAD")
    if load is None:
        return
    try:
        val = float(load)
    except (TypeError, ValueError):
        return
    if val > 100:
        sampled["LOAD"] = round(min(100.0, val / 2.4), 1)


def evaluate_o16(persist: bool = True, building_id: Optional[str] = None) -> Dict[str, Any]:
    log_event("INFO", "o16", "optimization_started", opportunity="O16", building_id=building_id)
    sampled = sample_o16(building_id)
    _normalize_load_pct(sampled)
    cfg = get_config(sampled.get("building_id"))
    hp = sampled.get("HEAD_PRESSURE")
    if cfg.get("target_head_pressure") is not None:
        try:
            if float(cfg["target_head_pressure"]) < 500:
                cfg = {**cfg, "target_head_pressure": None}
        except (TypeError, ValueError):
            cfg = {**cfg, "target_head_pressure": None}
    if cfg.get("target_head_pressure") is None and hp is not None:
        cfg = {**cfg, "target_head_pressure": round(float(hp) * 0.97, 1)}
    result = evaluate_water_cooled_hp(sampled, cfg)
    result["config"] = {k: cfg[k] for k in cfg if k != "labels"}
    result["config_labels"] = cfg.get("labels")
    result["equipment"] = list_equipment(sampled.get("building_id"))
    result["sampled"] = {k: sampled[k] for k in sampled if not str(k).startswith("_") and "__" not in str(k)}
    result["safe_mode"] = is_safe_mode()
    result["bms_connected"] = production_bms_connected()
    result["bms_status"] = "LIVE" if production_bms_connected() else "OFFLINE"
    result["ui_state"] = classify_ui_state(
        live=bool(result.get("live")),
        source=sampled.get("source") or (result.get("classified_telemetry") or {}).get("source"),
        classified_status=(result.get("classified_telemetry") or {}).get("status"),
        status=result.get("status"),
    )
    if persist and result.get("current_state"):
        _persist_snapshot(sampled, result)
        if result.get("live") or result.get("recommendation"):
            _persist_run(sampled, result)
            persist_execution("O16", "O16_WATER_COOLED_HP", confidence=result.get("confidence"))
            persist_optimization(
                "O16",
                {
                    "current_value": result.get("current_value"),
                    "optimized_value": result.get("optimized_value"),
                    "energy_impact": result.get("energy_impact"),
                    "confidence": result.get("confidence"),
                    "reason": result.get("reason"),
                    "status": result.get("recommendation_state") or result.get("status") or "PROPOSED",
                },
            )
            audit("O16", "OPTIMIZE", result.get("recommendation") or "HOLD", details={"run_id": result.get("run_id")})
    if result.get("safety_status") in ("HOLD", "REJECT") or result.get("recommendation") == "BLOCKED":
        log_event("WARN", "o16", "safety_blocked", opportunity="O16", extra={"reason": result.get("reason")})
    return result


def kpis(state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    s = state or evaluate_o16(persist=False)
    cs = s.get("current_state") or {}
    os_ = s.get("optimized_state") or {}
    meta = s.get("classified_telemetry") or {}
    ts = s.get("evaluated_at")
    src = meta.get("source")
    q = meta.get("quality") or meta.get("status")

    def card(label, value, unit, status=None):
        return {
            "label": label,
            "value": value,
            "unit": unit,
            "status": status or s.get("ui_state"),
            "timestamp": ts,
            "data_quality": q,
            "source": src if s.get("live") else (src or "UNAVAILABLE"),
        }

    return {
        "items": [
            card("Current Condensing Pressure", cs.get("head_pressure"), None),
            card("Target Condensing Pressure", os_.get("recommended_head_pressure"), None),
            card("Current Condenser Water Flow", cs.get("cw_flow"), None),
            card("Target Condenser Water Flow", os_.get("recommended_cw_flow"), None),
            card("Condenser Water Supply Temperature", cs.get("cewt_c"), "°C"),
            card("Condenser Water Return Temperature", cs.get("clwt_c"), "°C"),
            card("CW Pump Speed", cs.get("pump_speed_pct"), "%"),
            card("CW Pump Power", cs.get("pump_power_kw"), "kW"),
            card("Current Pump kW", cs.get("pump_power_kw"), "kW"),
            card("Predicted Pump kW", s.get("predicted_pump_power_kw"), "kW", "PREDICTED"),
            card("Predicted Energy Saving", s.get("predicted_power_delta_kw"), "kW", "PREDICTED"),
            card("Verified Energy Saving", s.get("verified_savings_kw"), "kW", "VERIFIED"),
            card("Approach Temperature", cs.get("approach_c"), "°C"),
            card("Cooling Load", cs.get("load_pct"), "%"),
            card("Head Pressure Margin", cs.get("head_pressure_margin"), None),
            card("Control Valve Position", cs.get("valve_position_pct"), "%"),
            card("Pump Status", cs.get("pump_status"), None),
            card("Number of Active Condensers", cs.get("active_condensers"), None),
        ]
    }


def history(hours: int = 24, building_id: Optional[str] = None) -> Dict[str, Any]:
    since = _now() - timedelta(hours=hours)
    db = SessionLocal()
    try:
        q = db.query(O16StateDB).filter(O16StateDB.timestamp >= since)
        if building_id:
            q = q.filter(O16StateDB.building_id == building_id)
        rows = q.order_by(O16StateDB.timestamp.asc()).all()
        points = [
            {
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "head_pressure": r.condensing_pressure,
                "condensing_temperature": r.condensing_temperature,
                "cw_supply": r.cw_supply_temperature,
                "cw_return": r.cw_return_temperature,
                "cw_flow": r.cw_flow,
                "pump_speed": r.pump_speed,
                "pump_power": r.pump_power,
                "load": r.load_ratio,
                "quality": r.quality,
                "source": r.source,
            }
            for r in rows
            if (r.source or "").upper() not in ("ML_MODEL", "KAGGLE", "TRAINING_DATA")
        ]
        if points:
            return {"period_hours": hours, "points": points, "fabricated": False}
    finally:
        db.close()
    state = evaluate_o16(persist=True)
    cs = state.get("current_state") or {}
    if not cs:
        return {"period_hours": hours, "points": [], "fabricated": False}
    now = _now()
    synth = []
    for i in range(min(24, hours * 4)):
        t = now - timedelta(minutes=i * 15)
        synth.insert(
            0,
            {
                "timestamp": t.isoformat(),
                "head_pressure": cs.get("head_pressure"),
                "condensing_temperature": cs.get("condensing_temperature_c"),
                "cw_supply": cs.get("cewt_c"),
                "cw_return": cs.get("clwt_c"),
                "cw_flow": cs.get("cw_flow"),
                "pump_speed": cs.get("pump_speed_pct"),
                "pump_power": cs.get("pump_power_kw"),
                "load": cs.get("load_ratio"),
                "quality": (state.get("classified_telemetry") or {}).get("quality"),
                "source": (state.get("classified_telemetry") or {}).get("source") or "SIMULATION",
            },
        )
    return {"period_hours": hours, "points": synth, "fabricated": True}


def safety_view(state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    s = state or evaluate_o16(persist=False)
    return {
        "overall": s.get("overall_safety"),
        "status": s.get("safety_status"),
        "safety_status": s.get("safety_status"),
        "gates": s.get("safety_checks") or [],
        "checks": s.get("safety_checks") or [],
        "safe_mode": is_safe_mode(),
        "bms_connected": production_bms_connected(),
        "authoritative": "SafetyEngine",
    }


def ingest_points(points: List[Dict[str, Any]], building_id: Optional[str] = None) -> int:
    n = 0
    bid = building_id or _building_id()
    db = SessionLocal()
    try:
        for p in points:
            src = normalize_telemetry_source(p.get("source"))
            q = ingest_quality(p.get("value"), p.get("quality"))
            record_point(
                point_id=p["point_id"],
                value=p.get("value"),
                unit=p.get("unit"),
                source=src,
                quality=q,
                building_id=bid,
                equipment_id=p.get("equipment_id"),
            )
            db.add(
                O16TelemetryDB(
                    building_id=bid,
                    equipment_id=p.get("equipment_id"),
                    point_id=p["point_id"],
                    timestamp=_now(),
                    value=p.get("value"),
                    unit=p.get("unit"),
                    quality=q,
                    source=src,
                    created_at=_now(),
                )
            )
            n += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return n


def _ensure_command(state: Dict[str, Any], command_id: Optional[str] = None) -> Dict[str, Any]:
    os_ = state.get("optimized_state") or {}
    cs = state.get("current_state") or {}
    point = os_.get("command_point") or "CW.PumpSpeed"
    existing = get_command(command_id) if command_id else active_for_point(point)
    if existing and existing.get("status") in ("PROPOSED", "APPROVAL_REQUIRED", "APPROVED", "APPLYING", "APPLIED", "VERIFYING"):
        return existing
    cid = command_id or f"cmd_o16_{uuid.uuid4().hex[:12]}"
    if get_command(cid):
        return get_command(cid)
    eqs = list_equipment()
    old = cs.get("pump_speed_pct") if point == "CW.PumpSpeed" else cs.get("valve_position_pct")
    new = os_.get("recommended_pump_speed_pct") if point == "CW.PumpSpeed" else os_.get("recommended_valve_position_pct")
    contract = CommandContract(
        opportunity="O16",
        building=(state.get("config") or {}).get("building_id") if isinstance(state.get("config"), dict) else _building_id(),
        equipment=(eqs[0].get("equipment_id") if eqs else None),
        point=point,
        old_value=old,
        new_value=new,
        reason=state.get("reason") or "O16 water-cooled head pressure",
        engine_version=ENGINE_VERSION,
        config_version=str((state.get("config") or {}).get("config_version") or "1.0"),
        safety_gates=state.get("safety_checks") or [],
        command_id=cid,
    )
    status = "PROPOSED"
    if state.get("recommendation_state") == "APPROVAL_REQUIRED":
        status = "APPROVAL_REQUIRED"
    row = propose(contract, status=status)
    log_event("INFO", "o16", "command_created", opportunity="O16", command_id=cid)
    audit("O16", "COMMAND_PROPOSED", status, details={"command_id": cid})
    return row


def optimize() -> Dict[str, Any]:
    state = evaluate_o16(persist=True)
    if state.get("recommendation") in ("OPTIMIZE_HP", "ISOLATE_UNIT") and state.get("optimized_value") is not None:
        state["command"] = _ensure_command(state)
    return state


def create_command(body: Dict[str, Any]) -> Dict[str, Any]:
    state = evaluate_o16(persist=True)
    return _ensure_command(state, body.get("command_id"))


def approve_command(command_id: str) -> Dict[str, Any]:
    cmd = get_command(command_id)
    if not cmd:
        raise KeyError("NOT_FOUND")
    updated = set_status(command_id, "APPROVED")
    audit("O16", "COMMAND_APPROVED", "APPROVED", details={"command_id": command_id})
    return updated or cmd


def apply_command(command_id: str, confirm: bool = False) -> Dict[str, Any]:
    cmd = get_command(command_id)
    if not cmd:
        raise KeyError("NOT_FOUND")
    if cmd.get("status") in ("APPLIED", "APPLYING", "VERIFYING", "VERIFIED"):
        return cmd
    state = evaluate_o16(persist=False)
    mode = str((state.get("config") or {}).get("control_mode") or "ADVISORY").upper()
    if mode == "ADVISORY":
        raise PermissionError("ADVISORY_ONLY")
    if mode == "APPROVAL_REQUIRED" and cmd.get("status") != "APPROVED":
        set_status(command_id, "APPROVAL_REQUIRED")
        raise PermissionError("APPROVAL_REQUIRED")
    if not confirm and mode == "AUTO":
        raise PermissionError("CONFIRMATION_REQUIRED")
    classified = state.get("classified_telemetry") or {}
    from backend.rules.engine import evaluate as rule_engine_evaluate

    verdict = rule_engine_evaluate(
        {
            "opportunity_id": "O16",
            "id": "O16",
            "action": "APPLY",
            "point_id": cmd.get("point_id"),
            "old_value": cmd.get("old_value"),
            "new_value": cmd.get("new_value"),
            "target_value": cmd.get("new_value"),
            "current_value": cmd.get("old_value"),
            "source": classified.get("source"),
            "telemetry": {
                "source": classified.get("source"),
                "quality": classified.get("quality") or classified.get("status"),
                "age_seconds": classified.get("age_seconds"),
                "raw": classified.get("status"),
            },
            "supervisory": {"decision": "OPTIMIZE"},
            "decision": "OPTIMIZE",
            "safety": {"status": "PASS" if state.get("safety_status") == "PASS" else state.get("safety_status"), "passed": state.get("safety_status") == "PASS"},
            "confidence": state.get("confidence"),
            "approval_status": "APPROVED" if cmd.get("status") == "APPROVED" else "NOT_REQUIRED",
        }
    )
    if verdict.get("verdict") != "APPROVED":
        set_status(command_id, "REJECTED")
        reason = verdict.get("reason") or "Rule Engine REJECTED"
        log_event("WARN", "o16", "safety_blocked", opportunity="O16", command_id=command_id, extra={"reason": reason})
        audit("O16", "COMMAND_REJECTED", verdict.get("code") or "REJECTED", details={"command_id": command_id, "reason": reason})
        raise ValueError(reason)
    reason = verdict.get("reason") or "APPROVED"
    conflict = active_for_point(cmd.get("point_id"))
    if conflict and conflict.get("command_id") != command_id and conflict.get("status") in ("APPLYING", "APPLIED", "VERIFYING"):
        raise ValueError("CONFLICTING_COMMAND")
    set_status(command_id, "APPLYING")
    gw = get_bms_gateway()
    res = gw.write_point(cmd["point_id"], float(cmd["new_value"]))
    if not getattr(res, "success", False):
        set_status(command_id, "FAILED")
        log_event("ERROR", "o16", "command_applied", opportunity="O16", command_id=command_id, extra={"ok": False})
        audit("O16", "BMS_COMMAND_FAILED", "FAILED", details={"command_id": command_id})
        raise ValueError("BMS write refused")
    applied = set_status(command_id, "APPLIED")
    log_event("INFO", "o16", "command_applied", opportunity="O16", command_id=command_id)
    audit_command(None, "O16_APPLY", applied or cmd, reason)
    audit("O16", "BMS_COMMAND_APPLIED", "APPLIED", details={"command_id": command_id})
    return applied or cmd


def verify(command_id: str) -> Dict[str, Any]:
    started = time.time()
    log_event("INFO", "o16", "verification_started", opportunity="O16", command_id=command_id)
    cfg = get_config()
    tol = float(cfg.get("verify_tolerance") or 0.5)
    ok, code = verify_command(command_id, tolerance=tol)
    elapsed = int((time.time() - started) * 1000)
    cmd = get_command(command_id)
    db = SessionLocal()
    try:
        db.add(
            O16VerificationDB(
                command_id=command_id,
                timestamp=_now(),
                expected_value=None if not cmd else cmd.get("new_value"),
                actual_value=None,
                tolerance=tol,
                verification_status=code,
                response_time_ms=elapsed,
                details_json={"ok": ok},
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    audit("O16", "VERIFY", code, details={"command_id": command_id, "ok": ok})
    if ok:
        log_event("INFO", "o16", "verification_passed", opportunity="O16", command_id=command_id)
        return {"ok": True, "verification": code, "command": get_command(command_id)}
    log_event("WARN", "o16", "verification_failed", opportunity="O16", command_id=command_id, extra={"code": code})
    try:
        rb = rollback(command_id)
        return {"ok": False, "verification": code, "rollback": rb, "command": get_command(command_id)}
    except PermissionError as exc:
        set_status(command_id, "ROLLBACK_REQUIRED")
        audit("O16", "ROLLBACK", "BLOCKED", details={"command_id": command_id, "reason": str(exc)})
        return {"ok": False, "verification": code, "rollback": str(exc), "command": get_command(command_id)}


def rollback(command_id: str) -> Dict[str, Any]:
    log_event("INFO", "o16", "rollback_started", opportunity="O16", command_id=command_id)
    if is_safe_mode():
        raise PermissionError("SAFE_MODE")
    if not production_bms_connected():
        raise PermissionError("BMS_OFFLINE")
    ok, code = rollback_command(command_id)
    log_event("INFO", "o16", "rollback_completed", opportunity="O16", command_id=command_id, extra={"ok": ok, "code": code})
    audit("O16", "ROLLBACK", code, details={"command_id": command_id})
    return {"ok": ok, "rollback": code, "command": get_command(command_id)}


def command_list(building_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return [r for r in list_commands(building_id=building_id, limit=80) if r.get("opportunity") == "O16"]


def health() -> Dict[str, Any]:
    s = evaluate_o16(persist=False)
    classified = s.get("classified_telemetry") or {}
    return {
        "opportunity": "O16",
        "bms": "LIVE" if production_bms_connected() else "OFFLINE",
        "telemetry": classified.get("status") or "MISSING",
        "safe_mode": is_safe_mode(),
        "ui_state": s.get("ui_state"),
        "optimization_enabled": (s.get("config") or {}).get("enabled", True),
        "live": s.get("live"),
    }


def savings_view() -> Dict[str, Any]:
    s = evaluate_o16(persist=False)
    db = SessionLocal()
    try:
        row = db.query(O16SavingsDB).order_by(O16SavingsDB.created_at.desc()).first()
        verified = row.verified_kw if row else None
        applied = row.applied_kw if row else None
    finally:
        db.close()
    return {
        "predicted_kw": s.get("predicted_power_delta_kw"),
        "predicted_kwh": None,
        "applied_kwh": applied,
        "verified_kwh": verified,
        "predicted": s.get("predicted_power_delta_kw"),
        "applied": applied,
        "verified": s.get("verified_savings_kw") if s.get("verified_savings_kw") is not None else verified,
        "guide_potential_note": s.get("guide_potential_note"),
        "classes": {"predicted": "PREDICTED", "applied": "APPLIED", "verified": "VERIFIED"},
    }


def runs(limit: int = 40) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = db.query(AgentRunDB).filter_by(opportunity="O16").order_by(AgentRunDB.started_at.desc()).limit(limit).all()
        return [
            {
                "run_id": r.id,
                "opportunity": r.opportunity,
                "building_id": r.building_id,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.finished_at.isoformat() if r.finished_at else None,
                "engine_version": r.engine_version,
                "status": r.status,
                "input_snapshot": r.input_json,
                "output_snapshot": r.output_json,
            }
            for r in rows
        ]
    finally:
        db.close()


def audit_events(limit: int = 50) -> List[Dict[str, Any]]:
    from database.models_opportunities import OpportunityAuditEventDB

    db = SessionLocal()
    try:
        rows = (
            db.query(OpportunityAuditEventDB)
            .filter_by(opportunity_id="O16")
            .order_by(OpportunityAuditEventDB.timestamp.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "actor": r.actor,
                "opportunity": r.opportunity_id,
                "equipment": r.equipment_id,
                "action": r.action,
                "result": r.result,
                "details": r.details,
            }
            for r in rows
        ]
    finally:
        db.close()


def dashboard() -> Dict[str, Any]:
    state = evaluate_o16(persist=True)
    cmds = command_list()
    last_cmd = cmds[0] if cmds else None
    opt = (state.get("recommendation_state") or state.get("status") or "IDLE").upper()
    enabled = (state.get("config") or {}).get("enabled", True)
    if not enabled:
        opt_ui = "DISABLED"
    elif opt in ("AWAITING_TELEMETRY", "NO_DATA", "MISSING"):
        opt_ui = "IDLE"
    elif opt in ("REJECTED", "ERROR"):
        opt_ui = "ERROR"
    elif opt in ("HOLD", "STALE", "SIMULATION"):
        opt_ui = "HOLD"
    else:
        opt_ui = "ACTIVE" if state.get("recommendation") in ("OPTIMIZE_HP", "ISOLATE_UNIT") else "IDLE"
    cs = state.get("current_state") or {}
    os_ = state.get("optimized_state") or {}
    classified = state.get("classified_telemetry") or {}
    return {
        **state,
        "opportunity": "O16",
        "name": "Variable Head Pressure Control — Water-Cooled Condensers",
        "mode": (state.get("config") or {}).get("control_mode"),
        "source": classified.get("source"),
        "telemetry_quality": classified.get("status") or classified.get("quality"),
        "last_seen": state.get("evaluated_at"),
        "current": {
            "condensing_pressure": cs.get("head_pressure"),
            "condensing_temperature": cs.get("condensing_temperature_c"),
            "cw_supply_temperature": cs.get("cewt_c"),
            "cw_return_temperature": cs.get("clwt_c"),
            "cw_flow": cs.get("cw_flow"),
            "pump_speed": cs.get("pump_speed_pct"),
            "pump_power": cs.get("pump_power_kw"),
        },
        "recommendation": {
            "target_condensing_pressure": os_.get("recommended_head_pressure"),
            "target_condensing_temperature": os_.get("recommended_condensing_temp_c"),
            "recommended_pump_speed": os_.get("recommended_pump_speed_pct"),
            "recommended_valve_position": os_.get("recommended_valve_position_pct"),
            "reason": state.get("reason"),
            "confidence": state.get("confidence"),
        },
        "kpis": kpis(state)["items"],
        "safety": safety_view(state),
        "savings": savings_view(),
        "commands": cmds,
        "audit": audit_events(),
        "config_labels": state.get("config_labels") or DEFAULT_CONFIG["labels"],
        "header": {
            "opportunity": "O16",
            "title": "Variable Head Pressure Control — Water-Cooled Condensers",
            "subtitle": "Optimize condenser-water head pressure and pumping energy during part-load operation while maintaining safe refrigeration-system operation.",
            "bms": "LIVE" if production_bms_connected() else "OFFLINE",
            "telemetry": classified.get("status") or "MISSING",
            "control_mode": (state.get("config") or {}).get("control_mode"),
            "optimization": opt_ui,
            "optimization_enabled": enabled,
            "safety": state.get("safety_status"),
            "last_telemetry": state.get("evaluated_at"),
            "last_optimization": state.get("evaluated_at"),
            "last_command": None if not last_cmd else last_cmd.get("created_at"),
            "last_verification": None if not last_cmd else last_cmd.get("verified_at"),
            "safe_mode": is_safe_mode(),
            "ui_state": state.get("ui_state"),
            "equipment": [e.get("name") or e.get("equipment_id") for e in (state.get("equipment") or [])],
        },
    }


def enter_safe_mode(reason: Optional[str] = None) -> Dict[str, Any]:
    set_safe_mode(True)
    audit("O16", "SAFE_MODE", "ON", details={"reason": reason})
    return {"safeMode": get_safe_mode()}
