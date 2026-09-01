"""O14 domain service: telemetry → state → optimize → safety → command lifecycle."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.agents.official_opportunities.o14_secondary_chw import ENGINE_VERSION, evaluate_secondary_chw
from backend.agents.runtime.command import active_for_point, get_command, list_commands, propose, set_status
from backend.agents.runtime.contracts import CommandContract
from backend.agents.runtime.verification import rollback_command, verify_command
from backend.agents.runtime.audit import audit_command
from backend.agents.scheduling_supervisory.gateway import get_bms_gateway
from backend.services.canonical_telemetry_service import find_point_by_suffix, latest_points, record_point
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
from database.models_o14 import O14ConfigDB, O14RecommendationDB, O14SystemSnapshotDB
from database.models_platform import AgentRunDB
from database.session import SessionLocal

POINT_ALIASES = {
    "INDEX_DP": ("SCHW.IndexDP", "SCHW.DP", "O14.INDEX_DP", "P-01.differential_pressure"),
    "DP_SETPOINT": ("SCHW.DPSetpoint", "O14.DP_SETPOINT"),
    "MOST_OPEN_VALVE_PCT": ("SCHW.MostOpenValve", "O14.MOST_OPEN_VALVE_PCT"),
    "VALVE_AVG_PCT": ("SCHW.ValveAvg", "O14.VALVE_AVG_PCT"),
    "FLOW": ("SCHW.Flow", "O14.FLOW", "P-01.flow"),
    "SPEED_PCT": ("SCHW.Speed", "O14.SPEED_PCT", "P-01.speed"),
    "POWER_KW": ("SCHW.Power", "O14.POWER_KW"),
    "CHWST": ("SCHW.SupplyTemp", "O14.CHWST", "CH-01.chw_supply_temperature"),
    "CHWRT": ("SCHW.ReturnTemp", "O14.CHWRT", "CH-01.chw_return_temperature"),
    "LOAD_PCT": ("SCHW.Load", "O14.LOAD_PCT", "CH-01.load"),
    "COOLING_CALL": ("SCHW.CoolingCall", "O14.COOLING_CALL", "P-01.status"),
    "PUMPS_RUNNING": ("SCHW.PumpsRunning", "O14.PUMPS_RUNNING"),
}

DEFAULT_CONFIG = {
    "most_open_valve_target_pct": 95.0,
    "dp_setpoint_trim": 0.5,
    "dp_setpoint_trim_unit": "psi",
    "speed_trim_pct": 2.0,
    "min_pump_speed_pct": None,
    "max_pump_speed_pct": None,
    "min_dp": None,
    "max_dp": None,
    "min_flow": None,
    "max_flow": None,
    "max_speed_step_pct": 25.0,
    "verify_tolerance": 0.5,
    "control_mode": "ADVISORY",
    "config_version": "1.0",
    "labels": {
        "most_open_valve_target_pct": "SOURCE-GUIDE",
        "dp_setpoint_trim": "CONFIGURABLE_DEFAULT",
        "speed_trim_pct": "CONFIGURABLE_DEFAULT",
        "min_pump_speed_pct": "CONFIGURABLE",
        "max_pump_speed_pct": "CONFIGURABLE",
        "min_dp": "CONFIGURABLE",
        "max_dp": "CONFIGURABLE",
        "min_flow": "CONFIGURABLE",
        "max_flow": "CONFIGURABLE",
        "max_speed_step_pct": "CONFIGURABLE_DEFAULT",
        "verify_tolerance": "CONFIGURABLE_DEFAULT",
        "control_mode": "IMPLEMENTATION",
    },
}


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
        row = db.query(O14ConfigDB).filter_by(building_id=bid).first()
        if not row:
            return {**DEFAULT_CONFIG, "building_id": bid, "persisted": False}
        data = {c.name: getattr(row, c.name) for c in O14ConfigDB.__table__.columns}
        data["labels"] = DEFAULT_CONFIG["labels"]
        data["persisted"] = True
        return data
    finally:
        db.close()


def save_config(payload: Dict[str, Any], building_id: Optional[str] = None) -> Dict[str, Any]:
    bid = building_id or payload.get("building_id") or _building_id() or "default"
    db = SessionLocal()
    try:
        row = db.query(O14ConfigDB).filter_by(building_id=bid).first()
        if not row:
            row = O14ConfigDB(building_id=bid, most_open_valve_target_pct=95.0, control_mode="ADVISORY")
            db.add(row)
        for key in (
            "most_open_valve_target_pct",
            "dp_setpoint_trim",
            "dp_setpoint_trim_unit",
            "speed_trim_pct",
            "min_pump_speed_pct",
            "max_pump_speed_pct",
            "min_dp",
            "max_dp",
            "min_flow",
            "max_flow",
            "max_speed_step_pct",
            "verify_tolerance",
            "control_mode",
            "enabled",
            "config_version",
        ):
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


def sample_o14(building_id: Optional[str] = None) -> Dict[str, Any]:
    pts = latest_points(building_id, limit=400)
    sampled: Dict[str, Any] = {"_points": pts}
    sources = []
    ages = []
    qualities = []
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


def list_pumps(building_id: Optional[str] = None) -> List[Dict[str, Any]]:
    bid = building_id or _building_id()
    db = SessionLocal()
    out: List[Dict[str, Any]] = []
    try:
        vs = db.query(VariableSpeedEquipmentDB)
        if bid:
            vs = vs.filter(VariableSpeedEquipmentDB.building_id == bid)
        type_or_name = or_(
            VariableSpeedEquipmentDB.equipment_type.in_(("CHW_PUMP", "SECONDARY_PUMP")),
            VariableSpeedEquipmentDB.name.ilike("%CHW%"),
            VariableSpeedEquipmentDB.name.ilike("%SCHW%"),
            VariableSpeedEquipmentDB.name.ilike("%SECONDARY%"),
        )
        rows = vs.filter(type_or_name).all()
        eq_rows = db.query(Equipment)
        if bid:
            eq_rows = eq_rows.filter(Equipment.building_id == bid)
        pumps = list(rows)
        seen = {r.id for r in pumps}
        extra = eq_rows.filter(
            or_(
                Equipment.type.ilike("%CHW%PUMP%"),
                Equipment.type.ilike("%SECONDARY%"),
                Equipment.name.ilike("%CHW%"),
                Equipment.name.ilike("%SCHW%"),
            )
        ).all()
        for e in extra:
            if e.id not in seen:
                pumps.append(e)
                seen.add(e.id)
        pts = latest_points(bid, limit=400)
        find = find_point_by_suffix(pts)
        for p in pumps:
            pid = getattr(p, "id", None)
            speed = find(pid, "speed")
            flow = find(pid, "flow")
            power = find(pid, "power")
            status_row = find(pid, "status", "run")
            fault = find(pid, "fault")
            src = (speed or flow or power or {})
            out.append(
                {
                    "pump_id": pid,
                    "name": getattr(p, "name", pid),
                    "status": None if status_row is None else status_row.get("value"),
                    "command": None,
                    "speed": None if speed is None else speed.get("value"),
                    "flow": None if flow is None else flow.get("value"),
                    "power": None if power is None else power.get("value"),
                    "runtime": None,
                    "fault": None if fault is None else fault.get("value"),
                    "data_quality": src.get("quality") or src.get("classified"),
                    "source": src.get("source"),
                    "last_seen": src.get("timestamp"),
                    "unit_speed": "%",
                    "unit_power": "kW",
                }
            )
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
            O14SystemSnapshotDB(
                timestamp=_now(),
                building_id=sampled.get("building_id"),
                equipment_id=None,
                flow=cs.get("flow"),
                dp=cs.get("index_dp"),
                dp_setpoint=cs.get("dp_setpoint"),
                speed=cs.get("pump_speed_pct"),
                power=cs.get("pump_power_kw"),
                valve_position=cs.get("avg_valve_pct"),
                most_open_valve_pct=cs.get("most_open_valve_pct"),
                supply_temperature=cs.get("supply_temperature"),
                return_temperature=cs.get("return_temperature"),
                load=cs.get("load_pct"),
                pumps_running=int(cs["pumps_running"]) if cs.get("pumps_running") is not None else None,
                cooling_call=cs.get("cooling_call"),
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
    run_id = f"o14_{uuid.uuid4().hex[:12]}"
    db = SessionLocal()
    try:
        db.add(
            AgentRunDB(
                id=run_id,
                opportunity="O14",
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
        rec_id = f"rec_o14_{uuid.uuid4().hex[:10]}"
        db.add(
            O14RecommendationDB(
                recommendation_id=rec_id,
                run_id=run_id,
                building_id=sampled.get("building_id"),
                point_id="SCHW.DPSetpoint",
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


def evaluate_o14(persist: bool = True, building_id: Optional[str] = None) -> Dict[str, Any]:
    sampled = sample_o14(building_id)
    cfg = get_config(sampled.get("building_id"))
    result = evaluate_secondary_chw(sampled, cfg)
    result["config"] = {k: cfg[k] for k in cfg if k != "labels"}
    result["config_labels"] = cfg.get("labels")
    result["pumps"] = list_pumps(sampled.get("building_id"))
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
            persist_execution("O14", "O14_SCHW_DP_RESET", confidence=result.get("confidence"))
            persist_optimization(
                "O14",
                {
                    "current_value": result.get("current_value"),
                    "optimized_value": result.get("optimized_value"),
                    "energy_impact": result.get("energy_impact"),
                    "confidence": result.get("confidence"),
                    "reason": result.get("reason"),
                    "status": result.get("recommendation_state") or result.get("status") or "PROPOSED",
                },
            )
            audit("O14", "OPTIMIZE", result.get("recommendation") or "HOLD", details={"run_id": result.get("run_id")})
    return result


def kpis(state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    s = state or evaluate_o14(persist=False)
    cs = s.get("current_state") or {}
    os_ = s.get("optimized_state") or {}
    meta = s.get("classified_telemetry") or {}
    ts = s.get("evaluated_at")
    src = meta.get("source") or s.get("config", {}).get("source")
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
            card("Secondary CHW Flow", cs.get("flow"), None),
            card("Differential Pressure", cs.get("index_dp"), cs.get("dp_unit")),
            card("DP Setpoint", cs.get("dp_setpoint"), cs.get("dp_unit")),
            card("Average Pump Speed", cs.get("pump_speed_pct"), "%"),
            card("Pump Power", cs.get("pump_power_kw"), "kW"),
            card("Number of Running Pumps", cs.get("pumps_running"), None),
            card("System Load", cs.get("load_pct"), "%"),
            card("Valve Position (most open)", cs.get("most_open_valve_pct"), "%"),
            card("Current Efficiency", round(float(cs["pump_power_kw"]) / max(float(cs["flow"]), 0.1), 2) if cs.get("pump_power_kw") and cs.get("flow") else None, "kW/L/s"),
            card("Optimization Potential", os_.get("recommended_dp_setpoint"), cs.get("dp_unit"), s.get("recommendation")),
        ]
    }


def history(hours: int = 24, building_id: Optional[str] = None) -> Dict[str, Any]:
    since = _now() - timedelta(hours=hours)
    db = SessionLocal()
    try:
        q = db.query(O14SystemSnapshotDB).filter(O14SystemSnapshotDB.timestamp >= since)
        if building_id:
            q = q.filter(O14SystemSnapshotDB.building_id == building_id)
        rows = q.order_by(O14SystemSnapshotDB.timestamp.asc()).all()
        points = [
            {
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "dp": r.dp,
                "dp_setpoint": r.dp_setpoint,
                "speed": r.speed,
                "flow": r.flow,
                "power": r.power,
                "load": r.load,
                "valve_position": r.valve_position or r.most_open_valve_pct,
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
    state = evaluate_o14(persist=True)
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
                "dp": cs.get("index_dp"),
                "dp_setpoint": cs.get("dp_setpoint"),
                "speed": cs.get("pump_speed_pct"),
                "flow": cs.get("flow"),
                "power": cs.get("pump_power_kw"),
                "load": cs.get("load_pct"),
                "valve_position": cs.get("most_open_valve_pct"),
                "quality": (state.get("classified_telemetry") or {}).get("quality"),
                "source": (state.get("classified_telemetry") or {}).get("source") or "SIMULATION",
            },
        )
    return {"period_hours": hours, "points": synth, "fabricated": True}


def safety_view(state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    s = state or evaluate_o14(persist=False)
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
            timestamp=None,
        )
        n += 1
    return n


def _ensure_command(state: Dict[str, Any], command_id: Optional[str] = None) -> Dict[str, Any]:
    os_ = state.get("optimized_state") or {}
    cs = state.get("current_state") or {}
    point = "SCHW.DPSetpoint"
    existing = get_command(command_id) if command_id else active_for_point(point)
    if existing and existing.get("status") in ("PROPOSED", "APPROVAL_REQUIRED", "APPROVED", "APPLYING", "APPLIED", "VERIFYING"):
        return existing
    cid = command_id or f"cmd_o14_{uuid.uuid4().hex[:12]}"
    if get_command(cid):
        return get_command(cid)
    contract = CommandContract(
        opportunity="O14",
        building=state.get("config", {}).get("building_id") if isinstance(state.get("config"), dict) else _building_id(),
        equipment=(list_pumps() or [{}])[0].get("pump_id") if list_pumps() else None,
        point=point,
        old_value=cs.get("dp_setpoint"),
        new_value=os_.get("recommended_dp_setpoint"),
        reason=state.get("reason") or "O14 DP reset",
        engine_version=ENGINE_VERSION,
        config_version=str((state.get("config") or {}).get("config_version") or "1.0"),
        safety_gates=state.get("safety_checks") or [],
        command_id=cid,
    )
    status = "PROPOSED"
    if state.get("recommendation_state") == "APPROVAL_REQUIRED":
        status = "APPROVAL_REQUIRED"
    row = propose(contract, status=status)
    audit("O14", "COMMAND_PROPOSED", status, details={"command_id": cid})
    return row


def optimize() -> Dict[str, Any]:
    state = evaluate_o14(persist=True)
    cmd = None
    if state.get("recommendation") == "RESET_DP" and state.get("optimized_value") is not None:
        cmd = _ensure_command(state)
        state["command"] = cmd
    return state


def create_command(body: Dict[str, Any]) -> Dict[str, Any]:
    state = evaluate_o14(persist=True)
    return _ensure_command(state, body.get("command_id"))


def apply_command(command_id: str, confirm: bool = False) -> Dict[str, Any]:
    cmd = get_command(command_id)
    if not cmd:
        raise KeyError("NOT_FOUND")
    if cmd.get("status") in ("APPLIED", "APPLYING", "VERIFYING", "VERIFIED"):
        return cmd
    state = evaluate_o14(persist=False)
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
            "opportunity_id": "O14",
            "id": "O14",
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
        audit("O14", "COMMAND_REJECTED", verdict.get("code") or "REJECTED", details={"command_id": command_id, "reason": reason})
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
        audit("O14", "BMS_COMMAND_FAILED", "FAILED", details={"command_id": command_id})
        raise ValueError("BMS write refused")
    applied = set_status(command_id, "APPLIED")
    audit_command(None, "O14_APPLY", applied or cmd, reason)
    audit("O14", "BMS_COMMAND_APPLIED", "APPLIED", details={"command_id": command_id})
    return applied or cmd


def verify(command_id: str) -> Dict[str, Any]:
    cfg = get_config()
    tol = float(cfg.get("verify_tolerance") or 0.5)
    ok, code = verify_command(command_id, tolerance=tol)
    audit("O14", "VERIFY", code, details={"command_id": command_id, "ok": ok})
    if not ok:
        rb_ok, rb_code = rollback_command(command_id)
        audit("O14", "ROLLBACK", rb_code, details={"command_id": command_id, "auto": True})
        return {"ok": False, "verification": code, "rollback": rb_code, "command": get_command(command_id)}
    return {"ok": True, "verification": code, "command": get_command(command_id)}


def rollback(command_id: str) -> Dict[str, Any]:
    ok, code = rollback_command(command_id)
    audit("O14", "ROLLBACK", code, details={"command_id": command_id})
    return {"ok": ok, "rollback": code, "command": get_command(command_id)}


def command_list(building_id: Optional[str] = None) -> List[Dict[str, Any]]:
    rows = list_commands(building_id=building_id, limit=80)
    return [r for r in rows if r.get("opportunity") == "O14"]


def runs(limit: int = 40) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = db.query(AgentRunDB).filter_by(opportunity="O14").order_by(AgentRunDB.started_at.desc()).limit(limit).all()
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
            .filter_by(opportunity_id="O14")
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
    state = evaluate_o14(persist=True)
    return {
        **state,
        "kpis": kpis(state)["items"],
        "safety": safety_view(state),
        "commands": command_list(),
        "header": {
            "opportunity": "O14",
            "title": "Optimised Secondary Chilled Water Pumping",
            "bms": "LIVE" if production_bms_connected() else "OFFLINE",
            "telemetry": (state.get("classified_telemetry") or {}).get("status") or "MISSING",
            "control_mode": (state.get("config") or {}).get("control_mode"),
            "safety": state.get("safety_status"),
            "optimization": state.get("recommendation_state") or state.get("status"),
            "last_telemetry": sampled_ts(state),
            "last_optimization": state.get("evaluated_at"),
            "safe_mode": is_safe_mode(),
            "ui_state": state.get("ui_state"),
        },
    }


def sampled_ts(state: Dict[str, Any]) -> Optional[str]:
    return state.get("evaluated_at")


def enter_safe_mode(reason: Optional[str] = None) -> Dict[str, Any]:
    set_safe_mode(True)
    audit("O14", "SAFE_MODE", "ON", details={"reason": reason})
    return {"safeMode": get_safe_mode()}
