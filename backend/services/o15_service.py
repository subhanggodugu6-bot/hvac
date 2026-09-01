"""O15 domain service: telemetry → state → optimize → safety → command lifecycle."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.agents.official_opportunities.o15_air_cooled_hp import ENGINE_VERSION, evaluate_air_cooled_hp
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
from backend.services.opportunity_persist_service import audit, persist_execution, persist_optimization
from backend.services.platform_ops_service import get_safe_mode, set_safe_mode
from sqlalchemy import or_
from database.models import Building, Equipment, VariableSpeedEquipmentDB
from database.models_o15 import O15ConfigDB, O15RecommendationDB, O15SystemSnapshotDB
from database.models_platform import AgentRunDB
from database.session import SessionLocal

POINT_ALIASES = {
    "OAT": ("ACC.OAT", "O15.OAT", "WEATHER.OutdoorDryBulb", "SITE.outdoor_air_temperature"),
    "HEAD_PRESSURE": ("ACC.HeadPressure", "O15.HEAD_PRESSURE", "CH-01.head_pressure"),
    "HP_SETPOINT": ("ACC.HeadPressureSetpoint", "O15.HP_SETPOINT"),
    "COND_TEMP": ("ACC.CondTemp", "O15.COND_TEMP", "CH-01.condenser_water_temperature"),
    "FAN_SPEED": ("ACC.FanSpeed", "O15.FAN_SPEED", "AHU-01.fan_speed"),
    "FAN_STATE": ("ACC.FanState", "O15.FAN_STATE", "CH-01.status"),
    "FAN_POWER_KW": ("ACC.FanPower", "O15.FAN_POWER_KW", "CH-01.fan_power", "AHU-01.SupplyFanPower"),
    "FANS_RUNNING": ("ACC.FansRunning", "O15.FANS_RUNNING"),
    "COMPRESSOR_STATE": ("ACC.CompressorState", "O15.COMPRESSOR_STATE", "CH-01.status"),
    "COMPRESSOR_POWER_KW": ("ACC.CompressorPower", "O15.COMPRESSOR_POWER_KW"),
    "LOAD": ("ACC.Load", "O15.LOAD", "CH-01.load"),
    "POWER": ("ACC.Power", "O15.POWER"),
    "RH": ("ACC.RH", "O15.RH", "WEATHER.OutdoorRH"),
    "ALARM": ("ACC.Alarm", "O15.ALARM", "CH-01.alarms"),
}

DEFAULT_CONFIG = {
    "approach_c": 10.0,
    "approach_min_c": 8.0,
    "approach_max_c": 12.0,
    "min_head_pressure": None,
    "max_head_pressure": None,
    "min_condensing_temp_c": None,
    "max_condensing_temp_c": None,
    "min_fan_speed_pct": None,
    "max_fan_speed_pct": None,
    "fan_trim_pct": 2.0,
    "tcond_deadband_c": 0.5,
    "max_fan_step_pct": 25.0,
    "verify_tolerance": 0.5,
    "refrigerant": None,
    "saturation_curve_json": [
        {"t_c": 25, "hp": 850},
        {"t_c": 30, "hp": 950},
        {"t_c": 35, "hp": 1100},
        {"t_c": 40, "hp": 1250},
        {"t_c": 45, "hp": 1400},
    ],
    "control_mode": "ADVISORY",
    "config_version": "1.0",
    "labels": {
        "approach_c": "SOURCE-GUIDE range 8–12°C; CONFIGURABLE within range",
        "approach_min_c": "SOURCE-GUIDE",
        "approach_max_c": "SOURCE-GUIDE",
        "min_head_pressure": "CONFIGURABLE",
        "max_head_pressure": "CONFIGURABLE",
        "min_condensing_temp_c": "CONFIGURABLE",
        "max_condensing_temp_c": "CONFIGURABLE",
        "min_fan_speed_pct": "CONFIGURABLE",
        "max_fan_speed_pct": "CONFIGURABLE",
        "fan_trim_pct": "CONFIGURABLE_DEFAULT",
        "tcond_deadband_c": "CONFIGURABLE_DEFAULT",
        "max_fan_step_pct": "CONFIGURABLE_DEFAULT",
        "verify_tolerance": "CONFIGURABLE_DEFAULT",
        "refrigerant": "CONFIGURABLE",
        "saturation_curve_json": "CONFIGURABLE",
        "control_mode": "IMPLEMENTATION",
    },
}

CONFIG_KEYS = (
    "approach_c",
    "approach_min_c",
    "approach_max_c",
    "min_head_pressure",
    "max_head_pressure",
    "min_condensing_temp_c",
    "max_condensing_temp_c",
    "min_fan_speed_pct",
    "max_fan_speed_pct",
    "fan_trim_pct",
    "tcond_deadband_c",
    "max_fan_step_pct",
    "verify_tolerance",
    "refrigerant",
    "saturation_curve_json",
    "control_mode",
    "enabled",
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
        row = db.query(O15ConfigDB).filter_by(building_id=bid).first()
        if not row:
            return {**DEFAULT_CONFIG, "building_id": bid, "persisted": False}
        data = {c.name: getattr(row, c.name) for c in O15ConfigDB.__table__.columns}
        data["labels"] = DEFAULT_CONFIG["labels"]
        data["persisted"] = True
        return data
    finally:
        db.close()


def save_config(payload: Dict[str, Any], building_id: Optional[str] = None) -> Dict[str, Any]:
    bid = building_id or payload.get("building_id") or _building_id() or "default"
    db = SessionLocal()
    try:
        row = db.query(O15ConfigDB).filter_by(building_id=bid).first()
        if not row:
            row = O15ConfigDB(building_id=bid, approach_c=10.0, approach_min_c=8.0, approach_max_c=12.0, control_mode="ADVISORY")
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


def sample_o15(building_id: Optional[str] = None) -> Dict[str, Any]:
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


def _is_acc(typ: str, name: str) -> bool:
    blob = f"{typ} {name}"
    return any(k in blob for k in ("AIR_COOLED", "ACC", "CONDENSER", "COND_FAN", "HEAD_PRESSURE"))


def list_equipment(building_id: Optional[str] = None, role: str = "condenser") -> List[Dict[str, Any]]:
    bid = building_id or _building_id()
    cached = cache_get(("o15_eq", bid or "", role))
    if cached is not None:
        return cached
    db = SessionLocal()
    out: List[Dict[str, Any]] = []
    try:
        vs = db.query(VariableSpeedEquipmentDB)
        if bid:
            vs = vs.filter(VariableSpeedEquipmentDB.building_id == bid)
        acc = or_(
            VariableSpeedEquipmentDB.equipment_type.ilike("%AIR_COOLED%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%ACC%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%CONDENSER%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%COND_FAN%"),
            VariableSpeedEquipmentDB.equipment_type.ilike("%HEAD_PRESSURE%"),
            VariableSpeedEquipmentDB.name.ilike("%AIR_COOLED%"),
            VariableSpeedEquipmentDB.name.ilike("%ACC%"),
            VariableSpeedEquipmentDB.name.ilike("%CONDENSER%"),
            VariableSpeedEquipmentDB.name.ilike("%HEAD_PRESSURE%"),
        )
        rows = list(vs.filter(acc).all())
        seen = {r.id for r in rows}
        eq_q = db.query(Equipment)
        if bid:
            eq_q = eq_q.filter(Equipment.building_id == bid)
        extra = eq_q.filter(
            or_(
                Equipment.type.ilike("%AIR_COOLED%"),
                Equipment.type.ilike("%ACC%"),
                Equipment.type.ilike("%CONDENSER%"),
                Equipment.type.ilike("%HEAD_PRESSURE%"),
                Equipment.name.ilike("%AIR_COOLED%"),
                Equipment.name.ilike("%ACC%"),
                Equipment.name.ilike("%CONDENSER%"),
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
            typ = (getattr(p, "equipment_type", None) or getattr(p, "type", "") or "").upper()
            if role == "fan" and "FAN" not in typ and "FAN" not in (getattr(p, "name", "") or "").upper():
                continue
            if role == "condenser" and "FAN" in typ and "CONDENSER" not in typ:
                continue

            speed = find(pid, "speed", "fan")
            press = find(pid, "pressure", "head")
            temp = find(pid, "temp", "cond")
            power = find(pid, "power")
            status_row = find(pid, "status", "run")
            fault = find(pid, "fault", "alarm")
            src = speed or press or temp or power or {}
            out.append(
                {
                    "equipment_id": pid,
                    "name": getattr(p, "name", pid),
                    "status": None if status_row is None else status_row.get("value"),
                    "command": None,
                    "speed": None if speed is None else speed.get("value"),
                    "pressure": None if press is None else press.get("value"),
                    "temperature": None if temp is None else temp.get("value"),
                    "power": None if power is None else power.get("value"),
                    "runtime": None,
                    "fault": None if fault is None else fault.get("value"),
                    "data_quality": src.get("quality") or src.get("classified"),
                    "source": src.get("source"),
                    "last_seen": src.get("timestamp"),
                }
            )
        cache_set(("o15_eq", bid or "", role), out, 2.5)
        return out
    except Exception:
        return []
    finally:
        db.close()


def list_condensers(building_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return list_equipment(building_id, "condenser")


def list_fans(building_id: Optional[str] = None) -> List[Dict[str, Any]]:
    fans = list_equipment(building_id, "fan")
    if fans:
        return fans
    return list_equipment(building_id, "condenser")


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
            O15SystemSnapshotDB(
                timestamp=_now(),
                building_id=sampled.get("building_id"),
                outdoor_air_temperature=cs.get("outdoor_temperature_c"),
                head_pressure=cs.get("head_pressure"),
                head_pressure_setpoint=cs.get("head_pressure_setpoint"),
                condensing_temperature=cs.get("condenser_temperature_c"),
                fan_speed=cs.get("fan_speed_pct"),
                fan_power=cs.get("fan_power_kw"),
                compressor_load=cs.get("load"),
                compressor_power=cs.get("compressor_power_kw"),
                cooling_load=cs.get("load"),
                fans_running=int(cs["fans_running"]) if cs.get("fans_running") is not None else None,
                status=result.get("status"),
                quality=sampled.get("quality"),
                source=sampled.get("source"),
                payload_json={"recommendation": result.get("recommendation"), "reason": result.get("reason")},
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _persist_run(sampled: Dict[str, Any], result: Dict[str, Any]) -> str:
    run_id = f"o15_{uuid.uuid4().hex[:12]}"
    db = SessionLocal()
    try:
        db.add(
            AgentRunDB(
                id=run_id,
                opportunity="O15",
                building_id=sampled.get("building_id"),
                engine_version=ENGINE_VERSION,
                status=result.get("status") or result.get("recommendation"),
                started_at=_now(),
                finished_at=_now(),
                input_json={k: sampled[k] for k in sampled if not str(k).startswith("_") and "__" not in str(k)},
                output_json={
                    "recommendation": result.get("recommendation"),
                    "optimized_state": result.get("optimized_state"),
                    "safety_status": result.get("safety_status"),
                },
            )
        )
        rec_id = f"rec_o15_{uuid.uuid4().hex[:10]}"
        db.add(
            O15RecommendationDB(
                recommendation_id=rec_id,
                run_id=run_id,
                building_id=sampled.get("building_id"),
                point_id="ACC.FanSpeed",
                current_value=result.get("current_value"),
                recommended_value=result.get("optimized_value"),
                unit=result.get("unit"),
                reason=result.get("reason"),
                confidence=result.get("confidence"),
                safety_result=result.get("safety_status"),
                status=result.get("recommendation_state") or result.get("status"),
                created_at=_now(),
                payload_json=result.get("why"),
            )
        )
        db.commit()
        result["run_id"] = run_id
        result["recommendation_id"] = rec_id
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


def evaluate_o15(persist: bool = True, building_id: Optional[str] = None) -> Dict[str, Any]:
    sampled = sample_o15(building_id)
    _normalize_load_pct(sampled)
    cfg = get_config(sampled.get("building_id"))
    result = evaluate_air_cooled_hp(sampled, cfg)
    result["config"] = {k: cfg[k] for k in cfg if k != "labels"}
    result["config_labels"] = cfg.get("labels")
    conds = list_condensers(sampled.get("building_id"))
    fans = list_equipment(sampled.get("building_id"), "fan")
    result["condensers"] = conds
    result["fans"] = fans or conds
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
            persist_execution("O15", "O15_AIR_COOLED_HP", confidence=result.get("confidence"))
            persist_optimization(
                "O15",
                {
                    "current_value": result.get("current_value"),
                    "optimized_value": result.get("optimized_value"),
                    "energy_impact": result.get("energy_impact"),
                    "confidence": result.get("confidence"),
                    "reason": result.get("reason"),
                    "status": result.get("recommendation_state") or result.get("status") or "PROPOSED",
                },
            )
            audit("O15", "OPTIMIZE", result.get("recommendation") or "HOLD", details={"run_id": result.get("run_id")})
    return result


def kpis(state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    s = state or evaluate_o15(persist=False)
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
            "trend": None,
        }

    return {
        "items": [
            card("Outdoor Air Temperature", cs.get("outdoor_temperature_c"), "°C"),
            card("Condensing Temperature", cs.get("condenser_temperature_c"), "°C"),
            card("Head Pressure", cs.get("head_pressure"), None),
            card("Head Pressure Target", cs.get("head_pressure_setpoint"), None),
            card("Optimized Head Pressure Target", os_.get("recommended_head_pressure"), None),
            card("Condenser Fan Speed", cs.get("fan_speed_pct"), "%"),
            card("Number of Condenser Fans Running", cs.get("fans_running"), None),
            card("Compressor Load", cs.get("load"), None),
            card("Compressor Power", cs.get("compressor_power_kw"), "kW"),
            card("Condenser Fan Power", cs.get("fan_power_kw"), "kW"),
            card("Total Cooling Power", cs.get("power_kw"), "kW"),
            card("Optimization Potential", os_.get("recommended_condensing_temp_c"), "°C", s.get("recommendation")),
        ]
    }


def history(hours: int = 24, building_id: Optional[str] = None) -> Dict[str, Any]:
    since = _now() - timedelta(hours=hours)
    db = SessionLocal()
    try:
        q = db.query(O15SystemSnapshotDB).filter(O15SystemSnapshotDB.timestamp >= since)
        if building_id:
            q = q.filter(O15SystemSnapshotDB.building_id == building_id)
        rows = q.order_by(O15SystemSnapshotDB.timestamp.asc()).all()
        points = [
            {
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "head_pressure": r.head_pressure,
                "head_pressure_setpoint": r.head_pressure_setpoint,
                "condensing_temperature": r.condensing_temperature,
                "outdoor_air_temperature": r.outdoor_air_temperature,
                "fan_speed": r.fan_speed,
                "fan_power": r.fan_power,
                "compressor_power": r.compressor_power,
                "power": r.compressor_power,
                "load": r.cooling_load,
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
    state = evaluate_o15(persist=True)
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
                "head_pressure_setpoint": cs.get("head_pressure_setpoint"),
                "condensing_temperature": cs.get("condenser_temperature_c"),
                "outdoor_air_temperature": cs.get("outdoor_temperature_c"),
                "fan_speed": cs.get("fan_speed_pct"),
                "fan_power": cs.get("fan_power_kw"),
                "compressor_power": cs.get("compressor_power_kw"),
                "power": cs.get("compressor_power_kw"),
                "load": cs.get("load"),
                "quality": (state.get("classified_telemetry") or {}).get("quality"),
                "source": (state.get("classified_telemetry") or {}).get("source") or "SIMULATION",
            },
        )
    return {"period_hours": hours, "points": synth, "fabricated": True}


def safety_view(state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    s = state or evaluate_o15(persist=False)
    return {
        "overall": s.get("overall_safety"),
        "safety_status": s.get("safety_status"),
        "checks": s.get("safety_checks") or [],
        "safe_mode": is_safe_mode(),
        "bms_connected": production_bms_connected(),
        "authoritative": "SafetyEngine",
    }


def ingest_points(points: List[Dict[str, Any]], building_id: Optional[str] = None) -> int:
    n = 0
    bid = building_id or _building_id()
    for p in points:
        record_point(
            point_id=p["point_id"],
            value=p.get("value"),
            unit=p.get("unit"),
            source=normalize_telemetry_source(p.get("source")),
            quality=ingest_quality(p.get("value"), p.get("quality")),
            building_id=bid,
            equipment_id=p.get("equipment_id"),
        )
        n += 1
    return n


def _ensure_command(state: Dict[str, Any], command_id: Optional[str] = None) -> Dict[str, Any]:
    os_ = state.get("optimized_state") or {}
    cs = state.get("current_state") or {}
    point = "ACC.FanSpeed"
    existing = get_command(command_id) if command_id else active_for_point(point)
    if existing and existing.get("status") in ("PROPOSED", "APPROVAL_REQUIRED", "APPROVED", "APPLYING", "APPLIED", "VERIFYING"):
        return existing
    cid = command_id or f"cmd_o15_{uuid.uuid4().hex[:12]}"
    if get_command(cid):
        return get_command(cid)
    eqs = list_condensers() or list_fans()
    contract = CommandContract(
        opportunity="O15",
        building=(state.get("config") or {}).get("building_id") if isinstance(state.get("config"), dict) else _building_id(),
        equipment=(eqs[0].get("equipment_id") if eqs else None),
        point=point,
        old_value=cs.get("fan_speed_pct"),
        new_value=os_.get("recommended_fan_speed_pct"),
        reason=state.get("reason") or "O15 floating head pressure via condenser fan speed",
        engine_version=ENGINE_VERSION,
        config_version=str((state.get("config") or {}).get("config_version") or "1.0"),
        safety_gates=state.get("safety_checks") or [],
        command_id=cid,
    )
    status = "PROPOSED"
    if state.get("recommendation_state") == "APPROVAL_REQUIRED":
        status = "APPROVAL_REQUIRED"
    row = propose(contract, status=status)
    audit("O15", "COMMAND_PROPOSED", status, details={"command_id": cid})
    return row


def optimize() -> Dict[str, Any]:
    state = evaluate_o15(persist=True)
    if state.get("recommendation") == "FLOAT_HEAD_PRESSURE" and state.get("optimized_value") is not None:
        state["command"] = _ensure_command(state)
    return state


def create_command(body: Dict[str, Any]) -> Dict[str, Any]:
    state = evaluate_o15(persist=True)
    return _ensure_command(state, body.get("command_id"))


def apply_command(command_id: str, confirm: bool = False) -> Dict[str, Any]:
    cmd = get_command(command_id)
    if not cmd:
        raise KeyError("NOT_FOUND")
    if cmd.get("status") in ("APPLIED", "APPLYING", "VERIFYING", "VERIFIED"):
        return cmd
    state = evaluate_o15(persist=False)
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
            "opportunity_id": "O15",
            "id": "O15",
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
        audit("O15", "COMMAND_REJECTED", verdict.get("code") or "REJECTED", details={"command_id": command_id, "reason": reason})
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
        audit("O15", "BMS_COMMAND_FAILED", "FAILED", details={"command_id": command_id})
        raise ValueError("BMS write refused")
    applied = set_status(command_id, "APPLIED")
    audit_command(None, "O15_APPLY", applied or cmd, reason)
    audit("O15", "BMS_COMMAND_APPLIED", "APPLIED", details={"command_id": command_id})
    return applied or cmd


def verify(command_id: str) -> Dict[str, Any]:
    cfg = get_config()
    tol = float(cfg.get("verify_tolerance") or 0.5)
    ok, code = verify_command(command_id, tolerance=tol)
    audit("O15", "VERIFY", code, details={"command_id": command_id, "ok": ok})
    if not ok:
        rollback_command(command_id)
        audit("O15", "ROLLBACK", "AUTO", details={"command_id": command_id})
        return {"ok": False, "verification": code, "command": get_command(command_id)}
    return {"ok": True, "verification": code, "command": get_command(command_id)}


def rollback(command_id: str) -> Dict[str, Any]:
    ok, code = rollback_command(command_id)
    audit("O15", "ROLLBACK", code, details={"command_id": command_id})
    return {"ok": ok, "rollback": code, "command": get_command(command_id)}


def command_list(building_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return [r for r in list_commands(building_id=building_id, limit=80) if r.get("opportunity") == "O15"]


def runs(limit: int = 40) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = db.query(AgentRunDB).filter_by(opportunity="O15").order_by(AgentRunDB.started_at.desc()).limit(limit).all()
        return [
            {
                "run_id": r.id,
                "opportunity": r.opportunity,
                "building_id": r.building_id,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.finished_at.isoformat() if r.finished_at else None,
                "engine_version": r.engine_version,
                "config_version": None,
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
            .filter_by(opportunity_id="O15")
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
    state = evaluate_o15(persist=True)
    opt = (state.get("recommendation_state") or state.get("status") or "IDLE").upper()
    if opt in ("AWAITING_TELEMETRY", "NO_DATA", "MISSING"):
        opt_ui = "IDLE"
    elif opt in ("REJECTED", "ERROR"):
        opt_ui = "ERROR"
    elif opt in ("HOLD", "STALE", "SIMULATION"):
        opt_ui = "HOLD"
    else:
        opt_ui = "ACTIVE" if state.get("recommendation") == "FLOAT_HEAD_PRESSURE" else "IDLE"
    return {
        **state,
        "kpis": kpis(state)["items"],
        "safety": safety_view(state),
        "commands": command_list(),
        "audit": audit_events(),
        "config_labels": state.get("config_labels") or DEFAULT_CONFIG["labels"],
        "header": {
            "opportunity": "O15",
            "title": "Variable Head Pressure Control — Air-Cooled Condensers",
            "bms": "LIVE" if production_bms_connected() else "OFFLINE",
            "telemetry": (state.get("classified_telemetry") or {}).get("status") or "MISSING",
            "control_mode": (state.get("config") or {}).get("control_mode"),
            "safety": state.get("safety_status"),
            "optimization": opt_ui,
            "last_telemetry": state.get("evaluated_at"),
            "last_optimization": state.get("evaluated_at"),
            "safe_mode": is_safe_mode(),
            "ui_state": state.get("ui_state"),
        },
    }


def enter_safe_mode(reason: Optional[str] = None) -> Dict[str, Any]:
    set_safe_mode(True)
    audit("O15", "SAFE_MODE", "ON", details={"reason": reason})
    return {"safeMode": get_safe_mode()}
