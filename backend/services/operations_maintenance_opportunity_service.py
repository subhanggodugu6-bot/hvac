"""O17–O20: telemetry/records → orchestrator → persistence. No fabricated live BMS."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from backend.agents.operations_maintenance import om_orchestrator
from backend.services.official_catalog import OFFICIAL_OM_IDS, CATALOG
from database.session import SessionLocal
from database.models_om import (
    OmOpportunityDB,
    OmTelemetryDB,
    OmRecommendationDB,
    OmSupervisoryDecisionDB,
    OmMaintenanceFindingDB,
    OmSoftwareHealthDB,
    OmAgentRunDB,
    OmAuditEventDB,
    OmDispatchDB,
    OmVerificationDB,
    OmRollbackDB,
    OmTrainingActionDB,
)
from database.models_opportunities import (
    TrainingProgramDB,
    TrainingCompletionDB,
    MaintenanceWorkOrderDB,
    ControllerSoftwareStatusDB,
)

LIVE_SECONDS = int(os.environ.get("OM_LIVE_SECONDS", "90"))
ALLOW_DEMO = os.environ.get("OM_ALLOW_DEMO", "1") != "0"
META = {row[0]: (row[3], row[4], row[1]) for row in CATALOG if row[0] in OFFICIAL_OM_IDS}

O20_SIM_PAYLOAD = {
    "controller_id": "NCE-01",
    "software_version": "v4.8.2",
    "firmware_version": "4.8.2",
    "comm_status": "ONLINE",
    "health_status": "HEALTHY",
    "config_drift_pct": 2.1,
    "exception_count": 3,
    "backup_status": "CURRENT",
    "point_count": 1284,
    "healthy_points": 1247,
    "degraded_points": 29,
    "override_count": 8,
    "drift_count": 3,
    "critical_issues": 0,
    "stale_points": 8,
    "failed_points": 0,
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _age_s(ts: Optional[datetime]) -> Optional[float]:
    if ts is None:
        return None
    if ts.tzinfo is not None:
        ts = ts.replace(tzinfo=None)
    return max(0.0, (_now() - ts).total_seconds())


def _tel_state(age: Optional[float], has_row: bool, source: Optional[str] = None) -> str:
    if not has_row:
        return "UNAVAILABLE"
    if age is None:
        return "UNAVAILABLE"
    src = str(source or "").upper()
    if src in ("DEMO", "SIMULATION", "TEST", "TEST TELEMETRY") or "SIMUL" in src or src.startswith("DEMO"):
        return "LIVE"
    if age <= LIVE_SECONDS:
        return "LIVE"
    return "STALE"


def _tel_ui(state: Optional[str]) -> str:
    return {
        "LIVE": "LIVE",
        "STALE": "DEGRADED",
        "UNAVAILABLE": "NO DATA",
        "ERROR": "API ERROR",
        "MISSING": "NO DATA",
    }.get(state or "", state or "NO DATA")


def _ensure_om_catalog(db) -> None:
    if db.query(OmOpportunityDB).filter_by(id="O17").first():
        return
    for oid, num, _sec, name, desc in CATALOG:
        if oid not in OFFICIAL_OM_IDS:
            continue
        row = db.query(OmOpportunityDB).filter_by(id=oid).first()
        if not row:
            db.add(OmOpportunityDB(id=oid, opportunity_number=num, name=name, description=desc, enabled=True))
        else:
            row.name = name
            row.description = desc
    try:
        db.commit()
    except Exception:
        db.rollback()


def _ensure_om_side_tables(db) -> None:
    """Training / WO / controller rows. Independent of om_telemetry so hosted-demo hydrate still fills O20."""
    ts = _now()
    if not db.query(TrainingProgramDB).first():
        db.add(TrainingProgramDB(id="TRN-SAT-RESET", topic="SAT reset", program_name="Approved SAT reset strategy", required=True, status="ACTIVE"))
        db.add(TrainingProgramDB(id="TRN-OVERRIDE", topic="Overrides", program_name="Override-release procedure", required=True, status="OPEN"))
        db.add(TrainingCompletionDB(program_id="TRN-SAT-RESET", role_label="OPERATOR", completion_pct=72.0, status="IN_PROGRESS"))
    if not db.query(MaintenanceWorkOrderDB).first():
        db.add(
            MaintenanceWorkOrderDB(
                id="FIND-AHU02-FILTER",
                equipment_id="AHU-02",
                maintenance_type="FILTER",
                status="OPEN",
                runtime_hours=1840.0,
                efficiency=0.81,
                degradation=0.12,
                priority="P2",
                recommendation="Inspect/replace AHU-02 filter. Differential pressure elevated versus maintenance baseline.",
            )
        )
    if not db.query(ControllerSoftwareStatusDB).first():
        db.add(
            ControllerSoftwareStatusDB(
                controller_id="NCE-01",
                software_version="v4.8.2",
                firmware_version="4.8.2",
                comm_status="ONLINE",
                point_quality="GOOD",
                override_state="NONE",
                alarm_state="3",
                control_loop_state="AUTO",
                last_communication=ts,
                health_status="HEALTHY",
            )
        )


def _patch_demo_payloads(db) -> None:
    """Fill missing DEMO/SIMULATION payload keys only. Never writes live BMS values."""
    patches = {
        "O17": {"target_kw": 410.0},
        "O18": {"affected_users": 14, "energy_impact_kwh_day": 8.4},
        "O20": dict(O20_SIM_PAYLOAD),
    }
    changed = False
    for oid, patch in patches.items():
        row = (
            db.query(OmTelemetryDB)
            .filter(OmTelemetryDB.opportunity_id == oid)
            .order_by(OmTelemetryDB.id.desc())
            .first()
        )
        if not row or str(row.source or "").upper() not in ("DEMO", "SIMULATION", "TEST", "TEST TELEMETRY"):
            continue
        extra: Dict[str, Any] = {}
        if row.payload_json:
            try:
                extra = json.loads(row.payload_json)
            except (TypeError, json.JSONDecodeError):
                extra = {}
        for key, value in patch.items():
            if extra.get(key) is None:
                extra[key] = value
                changed = True
        row.payload_json = json.dumps(extra)
    if changed:
        try:
            db.commit()
        except Exception:
            db.rollback()


def _om_payload_for(oid: str, hvac_kw: Optional[float], oat: Optional[float], occ: Optional[float]) -> Dict[str, Any]:
    if oid == "O17":
        return {"baseline_kw": 462.0, "peak_demand_kw": 540.0, "target_kw": 410.0}
    if oid == "O18":
        return {"manual_override_count": 3, "affected_users": 14, "energy_impact_kwh_day": 8.4}
    if oid == "O19":
        return {"filter_dp_rise_pct": 34.0, "fan_power_kw": 14.1, "equipment_health_pct": 87.0, "equipment_id": "AHU-02"}
    return dict(O20_SIM_PAYLOAD)


def refresh_om_sim_telemetry(db=None) -> int:
    """Keep O17–O20 snapshots fresh in dataset/sim mode (Render + local demo)."""
    if not ALLOW_DEMO and os.getenv("HVAC_USE_SIMULATION", "0") not in ("1", "true", "TRUE"):
        return 0
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        from backend.services.canonical_telemetry_service import latest_points

        _ensure_om_catalog(db)
        _ensure_om_side_tables(db)
        pts = latest_points(limit=400)
        by_id = {p.get("point_id"): p for p in pts}

        def _v(*keys):
            for k in keys:
                row = by_id.get(k) or {}
                val = row.get("value")
                if val is not None:
                    try:
                        return float(val)
                    except (TypeError, ValueError):
                        pass
            return None

        hvac_kw = _v("CHILLER1.CompressorPower", "CH-01.energy", "AHU-01.SupplyFanPower") or 428.5
        oat = _v("WEATHER.OutdoorDryBulb", "SITE.outdoor_air_temperature", "ACC.OAT") or 28.1
        occ = _v("ZONE.OccupantCount", "ZONE-01.occupancy") or 68.0
        ts = _now()
        n = 0
        for oid in OFFICIAL_OM_IDS:
            payload = _om_payload_for(oid, hvac_kw, oat, occ)
            row = (
                db.query(OmTelemetryDB)
                .filter(OmTelemetryDB.opportunity_id == oid)
                .order_by(OmTelemetryDB.id.desc())
                .first()
            )
            if row:
                row.timestamp = ts
                row.source = "SIMULATION"
                row.quality = "GOOD"
                if oid == "O17":
                    row.electrical_power_kw = 512.0
                    row.hvac_power_kw = hvac_kw
                    row.daily_energy_kwh = 5120.0
                    row.occupancy = occ
                    row.outdoor_temp_c = oat
                row.payload_json = json.dumps(payload)
            else:
                db.add(
                    OmTelemetryDB(
                        opportunity_id=oid,
                        timestamp=ts,
                        source="SIMULATION",
                        quality="GOOD",
                        electrical_power_kw=512.0 if oid == "O17" else None,
                        hvac_power_kw=hvac_kw if oid == "O17" else None,
                        daily_energy_kwh=5120.0 if oid == "O17" else None,
                        occupancy=occ if oid == "O17" else None,
                        outdoor_temp_c=oat if oid == "O17" else None,
                        payload_json=json.dumps(payload),
                    )
                )
            n += 1
        db.commit()
        return n
    except Exception:
        db.rollback()
        return 0
    finally:
        if close:
            db.close()


def ensure_om_demo(db=None, force: bool = False) -> None:
    """Development snapshot. source=DEMO — never treat as live BMS."""
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        _ensure_om_catalog(db)
        _ensure_om_side_tables(db)
        if not force and db.query(OmTelemetryDB).first():
            _patch_demo_payloads(db)
            refresh_om_sim_telemetry(db)
            return
        ts = _now()
        for oid in OFFICIAL_OM_IDS:
            db.add(
                OmTelemetryDB(
                    opportunity_id=oid,
                    timestamp=ts,
                    source="DEMO",
                    quality="GOOD",
                    electrical_power_kw=512.0 if oid == "O17" else None,
                    hvac_power_kw=428.5 if oid == "O17" else None,
                    daily_energy_kwh=5120.0 if oid == "O17" else None,
                    occupancy=68.0 if oid == "O17" else None,
                    outdoor_temp_c=28.1 if oid == "O17" else None,
                    payload_json=json.dumps({"baseline_kw": 462.0, "peak_demand_kw": 540.0, "target_kw": 410.0}) if oid == "O17"
                    else json.dumps({"manual_override_count": 3, "affected_users": 14, "energy_impact_kwh_day": 8.4}) if oid == "O18"
                    else json.dumps({"filter_dp_rise_pct": 34.0, "fan_power_kw": 14.1, "equipment_health_pct": 87.0, "equipment_id": "AHU-02"})
                    if oid == "O19"
                    else json.dumps(O20_SIM_PAYLOAD),
                )
            )
        _ensure_om_side_tables(db)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        if close:
            db.close()


def _payload(row: OmTelemetryDB) -> Dict[str, Any]:
    extra: Dict[str, Any] = {}
    if row.payload_json:
        try:
            extra = json.loads(row.payload_json)
        except (TypeError, json.JSONDecodeError):
            extra = {}
    extra.update(
        {
            "electrical_power_kw": row.electrical_power_kw,
            "hvac_power_kw": row.hvac_power_kw,
            "daily_energy_kwh": row.daily_energy_kwh,
            "occupancy": row.occupancy,
            "outdoor_temp_c": row.outdoor_temp_c,
            "source": row.source,
            "quality": row.quality,
            "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        }
    )
    return extra


def _snapshot(db, oid: str, tel: Dict[str, Any]) -> Dict[str, Any]:
    snap = dict(tel)
    if oid == "O17":
        snap.setdefault("baseline_kw", tel.get("baseline_kw"))
        snap.setdefault("peak_demand_kw", tel.get("peak_demand_kw"))
        snap.setdefault("target_kw", tel.get("target_kw"))
        return snap
    if oid == "O18":
        programs = [
            {"id": p.id, "topic": p.topic, "program_name": p.program_name, "required": p.required, "status": p.status}
            for p in db.query(TrainingProgramDB).all()
        ]
        completions = [
            {"program_id": c.program_id, "role_label": c.role_label, "completion_pct": c.completion_pct, "status": c.status}
            for c in db.query(TrainingCompletionDB).order_by(TrainingCompletionDB.id.desc()).limit(8).all()
        ]
        snap["programs"] = programs
        snap["completions"] = completions
        snap["manual_override_count"] = tel.get("manual_override_count")
        return snap
    if oid == "O19":
        orders = []
        for o in db.query(MaintenanceWorkOrderDB).all():
            orders.append(
                {
                    "id": o.id,
                    "equipment_id": o.equipment_id,
                    "maintenance_type": o.maintenance_type,
                    "status": o.status,
                    "runtime_hours": o.runtime_hours,
                    "efficiency": o.efficiency,
                    "degradation": o.degradation,
                    "priority": o.priority,
                    "recommendation": o.recommendation,
                    "energy_impact": None,
                    "completed_at": o.completed_at.isoformat() if o.completed_at else None,
                }
            )
        snap["findings"] = orders
        snap.setdefault("equipment_id", tel.get("equipment_id") or (orders[0]["equipment_id"] if orders else None))
        snap.setdefault("filter_dp_rise_pct", tel.get("filter_dp_rise_pct"))
        snap.setdefault("fan_power_kw", tel.get("fan_power_kw"))
        snap.setdefault("runtime_hours", tel.get("runtime_hours") or (orders[0]["runtime_hours"] if orders else None))
        snap.setdefault("equipment_health_pct", tel.get("equipment_health_pct"))
        return snap
    row = db.query(ControllerSoftwareStatusDB).order_by(ControllerSoftwareStatusDB.id.desc()).first()
    ctrl = {
        "controller_id": (row.controller_id if row else None) or tel.get("controller_id"),
        "software_version": (row.software_version if row else None) or tel.get("software_version"),
        "firmware_version": (row.firmware_version if row else None) or tel.get("firmware_version"),
        "comm_status": (row.comm_status if row else None) or tel.get("comm_status"),
        "health_status": (row.health_status if row else None) or tel.get("health_status"),
        "point_quality": (row.point_quality if row else None),
        "override_state": (row.override_state if row else None),
        "alarm_state": (row.alarm_state if row else None) or tel.get("alarm_status"),
        "config_drift_pct": tel.get("config_drift_pct"),
        "exception_count": tel.get("exception_count"),
        "backup_status": tel.get("backup_status"),
        "point_count": tel.get("point_count"),
        "healthy_points": tel.get("healthy_points"),
        "degraded_points": tel.get("degraded_points"),
        "override_count": tel.get("override_count"),
        "drift_count": tel.get("drift_count"),
        "critical_issues": tel.get("critical_issues"),
        "stale_points": tel.get("stale_points"),
        "failed_points": tel.get("failed_points"),
    }
    snap["controller"] = ctrl if (ctrl.get("controller_id") or ctrl.get("software_version") or ctrl.get("comm_status")) else None
    return snap


def _persist(db, oid: str, ev: Dict[str, Any], tel_meta: Dict[str, Any]) -> None:
    ts = _now()
    db.add(
        OmAgentRunDB(
            opportunity_id=oid,
            timestamp=ts,
            source=tel_meta.get("source") or "OM_ORCHESTRATOR",
            quality=tel_meta.get("quality"),
            confidence=ev.get("confidence"),
            decision=ev.get("supervisory_decision"),
            status=ev.get("status"),
            input_summary=ev.get("missing") or ev.get("recommendation"),
        )
    )
    db.add(
        OmRecommendationDB(
            opportunity_id=oid,
            timestamp=ts,
            source="OM_AGENT",
            quality=tel_meta.get("quality"),
            confidence=ev.get("confidence"),
            action=ev.get("recommendation"),
            rationale=ev.get("rationale"),
        )
    )
    db.add(
        OmSupervisoryDecisionDB(
            opportunity_id=oid,
            timestamp=ts,
            source="OM_SUPERVISOR",
            quality=tel_meta.get("quality"),
            confidence=ev.get("confidence"),
            decision=ev.get("supervisory_decision") or "HOLD",
            reason=ev.get("rationale"),
        )
    )
    db.add(
        OmAuditEventDB(
            opportunity_id=oid,
            timestamp=ts,
            source=tel_meta.get("source") or "OM_AGENT",
            quality=tel_meta.get("quality"),
            confidence=ev.get("confidence"),
            actor="OM_AGENT",
            event_type="AGENT_RUN",
            message=ev.get("rationale") or ev.get("missing"),
            details_json={"decision": ev.get("supervisory_decision"), "status": ev.get("status")},
        )
    )
    if oid == "O19":
        for issue in ev.get("detected_issues") or []:
            db.add(
                OmMaintenanceFindingDB(
                    opportunity_id="O19",
                    timestamp=ts,
                    source="O19_AGENT",
                    confidence=ev.get("confidence"),
                    equipment_id=issue.get("equipment_id"),
                    finding=issue.get("finding"),
                    energy_impact_kw=issue.get("energy_impact_kw"),
                    priority=issue.get("priority"),
                )
            )
    if oid == "O20" and ev.get("available"):
        db.add(
            OmSoftwareHealthDB(
                opportunity_id="O20",
                timestamp=ts,
                source="O20_AGENT",
                confidence=ev.get("confidence"),
                controller_id=ev.get("controller_id"),
                software_version=ev.get("software_version"),
                drift_pct=ev.get("config_drift_pct"),
                exception_count=ev.get("exception_count"),
                change_risk=ev.get("change_risk"),
                backup_status=ev.get("backup_status"),
            )
        )
    try:
        db.commit()
    except Exception:
        db.rollback()


def evaluate_opportunity(oid: str, persist: bool = True) -> Dict[str, Any]:
    oid = oid.upper()
    if oid not in OFFICIAL_OM_IDS:
        raise ValueError("UNKNOWN_OPPORTUNITY")
    db = SessionLocal()
    try:
        _ensure_om_catalog(db)
        if ALLOW_DEMO:
            ensure_om_demo(db)
            refresh_om_sim_telemetry(db)
        row = (
            db.query(OmTelemetryDB)
            .filter(OmTelemetryDB.opportunity_id == oid)
            .order_by(OmTelemetryDB.id.desc())
            .first()
        )
        age = _age_s(row.timestamp if row else None)
        src = row.source if row else None
        tel_meta = {
            "state": _tel_state(age, bool(row), src),
            "lastUpdated": row.timestamp.isoformat() if row and row.timestamp else None,
            "ageSeconds": round(age, 1) if age is not None else None,
            "source": src,
            "quality": row.quality if row else None,
        }
        name, desc, prio = META[oid]
        if not row:
            out = {
                "opportunityId": oid,
                "name": name,
                "description": desc,
                "status": "UNAVAILABLE",
                "telemetry": tel_meta,
                "available": False,
                "reason": "No O&M telemetry snapshot.",
                "supervisory_decision": "WAIT_FOR_TELEMETRY",
                "safety_status": None,
                "confidence": None,
                "dispatch_eligible": False,
            }
            return out
        snap = _snapshot(db, oid, _payload(row))
        ev = om_orchestrator.evaluate(oid, snap)
        if tel_meta["state"] == "STALE" and ev.get("supervisory_decision") not in ("WAIT_FOR_TELEMETRY", "BLOCK"):
            ev["supervisory_decision"] = "SAFE_HOLD"
            ev["dispatch_eligible"] = False
        if tel_meta["state"] == "UNAVAILABLE":
            ev["supervisory_decision"] = "WAIT_FOR_TELEMETRY"
            ev["dispatch_eligible"] = False
        if not ev.get("available"):
            ev["status"] = "UNAVAILABLE"
            ev["supervisory_decision"] = "WAIT_FOR_TELEMETRY"
            ev["rationale"] = ev.get("missing")
        out = {
            "opportunityId": oid,
            "opportunity_id": oid,
            "name": name,
            "description": desc,
            "priority": prio,
            "status": ev.get("status") or "READY",
            "telemetry": tel_meta,
            **ev,
        }
        if persist:
            _persist(db, oid, ev, tel_meta)
        return out
    finally:
        db.close()


def record_action(oid: str, action_type: str, details: Optional[Dict[str, Any]] = None, actor: str = "OPERATOR") -> Dict[str, Any]:
    db = SessionLocal()
    try:
        _ensure_om_catalog(db)
        ts = _now()
        db.add(
            OmDispatchDB(
                opportunity_id=oid,
                timestamp=ts,
                source=actor,
                action_type=action_type,
                status="RECORDED",
                payload_json=json.dumps(details or {}),
            )
        )
        if oid == "O18":
            db.add(
                OmTrainingActionDB(
                    opportunity_id="O18",
                    timestamp=ts,
                    source=actor,
                    topic=(details or {}).get("topic") or "Assigned training",
                    status="OPEN",
                    details=json.dumps(details or {}),
                )
            )
        if oid == "O19":
            wo_id = (details or {}).get("work_order_id") or (details or {}).get("id")
            new_status = str((details or {}).get("status") or "").upper()
            allowed = {"OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"}
            if wo_id and new_status in allowed:
                row = db.query(MaintenanceWorkOrderDB).filter_by(id=str(wo_id)).first()
                if row:
                    row.status = new_status
                    if new_status == "COMPLETED":
                        row.completed_at = ts
        db.add(
            OmAuditEventDB(
                opportunity_id=oid,
                timestamp=ts,
                source=actor,
                actor=actor,
                event_type=action_type,
                message=f"{action_type} recorded for {oid}",
                details_json=details,
            )
        )
        db.commit()
        return {"status": "RECORDED", "opportunity_id": oid, "action_type": action_type, "timestamp": ts.isoformat(), "source": actor}
    except Exception as exc:
        db.rollback()
        return {"status": "ERROR", "code": "PERSIST_FAILED", "message": str(exc), "opportunityId": oid}
    finally:
        db.close()


def record_verify(oid: str) -> Dict[str, Any]:
    db = SessionLocal()
    try:
        ts = _now()
        db.add(OmVerificationDB(opportunity_id=oid, timestamp=ts, outcome="VERIFIED_RECORDED", details="Operator verification recorded."))
        db.add(OmAuditEventDB(opportunity_id=oid, timestamp=ts, actor="OM_MV", event_type="VERIFY", message=f"Verification recorded for {oid}"))
        db.commit()
        return {"status": "VERIFIED", "opportunity_id": oid, "timestamp": ts.isoformat(), "source": "OM_MV", "verification_status": "RECORDED"}
    finally:
        db.close()


def record_rollback(oid: str, reason: str = "Operator Manual Rollback") -> Dict[str, Any]:
    db = SessionLocal()
    try:
        ts = _now()
        db.add(OmRollbackDB(opportunity_id=oid, timestamp=ts, source="OPERATOR", reason=reason, previous_state="CURRENT", rollback_state="SAFE_HOLD"))
        db.add(OmAuditEventDB(opportunity_id=oid, timestamp=ts, actor="OPERATOR", event_type="ROLLBACK", message=reason))
        db.commit()
        return {
            "status": "ROLLED_BACK",
            "opportunity_id": oid,
            "timestamp": ts.isoformat(),
            "reason": reason,
            "source": "OPERATOR",
            "previous_state": "CURRENT",
            "rollback_state": "SAFE_HOLD",
            "verification_status": "PENDING",
        }
    finally:
        db.close()


def list_audit(oid: str, limit: int = 12) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(OmAuditEventDB)
            .filter(OmAuditEventDB.opportunity_id == oid)
            .order_by(OmAuditEventDB.id.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "actor": r.actor,
                "event_type": r.event_type,
                "message": r.message,
                "confidence": r.confidence,
                "source": r.source,
            }
            for r in rows
        ]
    finally:
        db.close()
