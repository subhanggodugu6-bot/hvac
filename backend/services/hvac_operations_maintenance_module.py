"""Public Operations & Maintenance contract: O17–O20 only. O10 is never exposed."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from backend.services.hvac_safety_contract import (
    classify_telemetry,
    conflict_body,
    evaluate_dispatch,
    production_bms_connected,
)
from backend.services.official_catalog import OFFICIAL_OM_IDS
from backend.services.operations_maintenance_opportunity_service import (
    evaluate_opportunity,
    list_audit,
    refresh_om_sim_telemetry,
)

MODULE_IDS = OFFICIAL_OM_IDS
ROUTES = {
    "O17": "/agents/operations-maintenance/energy-management-planning",
    "O18": "/agents/operations-maintenance/training-awareness",
    "O19": "/agents/operations-maintenance/equipment-maintenance",
    "O20": "/agents/operations-maintenance/control-software",
}
CONFIDENCE_MIN = 0.65


def canonical_oid(raw: str) -> Optional[str]:
    s = (raw or "").strip().upper().replace("-", "").replace("_", "")
    table = {
        "O17": "O17", "017": "O17", "17": "O17",
        "O18": "O18", "018": "O18", "18": "O18",
        "O19": "O19", "019": "O19", "19": "O19",
        "O20": "O20", "020": "O20", "20": "O20",
    }
    return table.get(s)


def _num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n or n in (float("inf"), float("-inf")):
        return None
    return n


def _int(v: Any) -> Optional[int]:
    n = _num(v)
    return int(n) if n is not None else None


def _is_demo(src: Any) -> bool:
    return str(src or "").upper() in ("DEMO", "TEST TELEMETRY", "TEST", "SIMULATION", "DEMO / SIMULATION")


def _quality_ui(raw: Any) -> Optional[str]:
    q = str(raw or "").upper()
    if not q:
        return None
    if q in ("GOOD", "OK", "HEALTHY"):
        return "GOOD"
    if q in ("DEGRADED", "POOR", "FAIR", "WARNING"):
        return "DEGRADED"
    if q in ("UNKNOWN",):
        return "UNKNOWN"
    return q


def dispatch_gate(body: Dict[str, Any]) -> Tuple[bool, str]:
    ok, reason, _classified = evaluate_dispatch({**body, "opportunity_id": body.get("id")})
    return ok, reason


def dispatch_conflict(body: Dict[str, Any]) -> Dict[str, Any]:
    ok, reason, classified = evaluate_dispatch({**body, "opportunity_id": body.get("id")})
    out = conflict_body(body, reason, classified)
    out["dispatchable"] = bool(ok)
    return out


def _as_module_opportunity(raw: Dict[str, Any]) -> Dict[str, Any]:
    oid = raw.get("opportunityId") or raw.get("opportunity_id")
    tel = raw.get("telemetry") or {}
    tel_raw = tel.get("state")
    src = tel.get("source")
    demo = _is_demo(src)
    quality = _quality_ui(tel.get("quality"))
    classified = classify_telemetry(
        {
            "source": src,
            "quality": quality,
            "raw": tel_raw,
            "state": tel_raw,
            "ageSeconds": tel.get("ageSeconds"),
        },
        src,
    )
    connected = bool(production_bms_connected()) and not demo and not classified.get("demo")
    if demo:
        tel_ui = "SIMULATED"
    elif classified.get("status") == "STALE":
        tel_ui = "STALE"
    elif not connected:
        tel_ui = "BMS OFFLINE" if tel_raw not in ("UNAVAILABLE", "MISSING", None, "ERROR") else "NO DATA"
    elif classified.get("status") == "LIVE" and connected:
        tel_ui = "LIVE"
    else:
        tel_ui = classified.get("status") or "NO DATA"
        if tel_ui == "LIVE":
            tel_ui = "NO DATA"
        if tel_ui in ("MISSING", "BAD"):
            tel_ui = "NO DATA"
    status = raw.get("status")
    if status == "UNAVAILABLE" or status == "NO LIVE DATA":
        status = "NO DATA"
    decision = raw.get("supervisory_decision")
    if tel_raw == "STALE" or classified.get("status") == "STALE":
        decision = "SAFE_HOLD"
    elif tel_raw in ("UNAVAILABLE", "MISSING", None) or status == "NO DATA":
        decision = "WAIT_FOR_TELEMETRY"
    if oid == "O20" and decision == "OPTIMIZE":
        decision = "REVIEW_REQUIRED"
    if demo and quality is None:
        quality = "UNKNOWN"
    live = bool(classified.get("status") == "LIVE" and connected and not demo)
    body: Dict[str, Any] = {
        "id": oid,
        "opportunityId": oid,
        "name": raw.get("name"),
        "description": raw.get("description"),
        "route": ROUTES.get(str(oid)),
        "status": status,
        "telemetryStatus": tel_ui,
        "telemetry": {
            "status": tel_ui,
            "state": tel_ui,
            "raw": tel_raw,
            "timestamp": tel.get("lastUpdated"),
            "lastUpdated": tel.get("lastUpdated"),
            "ageSeconds": tel.get("ageSeconds"),
            "source": "DEMO / SIMULATION" if demo else src,
            "quality": quality,
            "label": "SIMULATED" if demo else tel_ui,
        },
        "current": {
            "kw": _num(raw.get("current_kw")),
            "baselineKw": _num(raw.get("baseline_kw")),
            "targetKw": _num(raw.get("target_kw")),
            "trainingCoveragePct": _num(raw.get("training_coverage_pct")),
            "trainingItems": _int(raw.get("training_items") if raw.get("training_items") is not None else raw.get("knowledge_gap_count")),
            "affectedUsers": _int(raw.get("affected_users")),
            "operatorReadiness": raw.get("operator_readiness"),
            "equipmentHealthPct": _num(raw.get("equipment_health_pct")),
            "assetsAtRisk": _int(raw.get("assets_at_risk")),
            "maintenanceAlerts": _int(raw.get("maintenance_alerts") if raw.get("maintenance_alerts") is not None else raw.get("issues_detected")),
            "maintenanceRisk": raw.get("maintenance_risk"),
            "controllerHealth": raw.get("controller_health"),
            "softwareVersion": raw.get("software_version"),
            "controlPoints": _int(raw.get("point_count")),
            "healthyPoints": _int(raw.get("healthy_points")),
            "degradedPoints": _int(raw.get("degraded_points")),
            "overrides": _int(raw.get("override_count")),
            "driftCount": _int(raw.get("drift_count")),
            "criticalIssues": _int(raw.get("critical_issues")),
            "controlHealthPct": _num(raw.get("control_health_pct")),
            "occupancy": raw.get("occupancy"),
        },
        "optimized": {
            "kw": _num(raw.get("target_kw")),
            "savingsKw": _num(raw.get("savings_kw")),
        },
        "delta": {"kw": _num(raw.get("delta_kw")), "savingsKw": _num(raw.get("savings_kw"))},
        "energy": {
            "currentKw": _num(raw.get("current_kw")),
            "baselineKw": _num(raw.get("baseline_kw")),
            "targetKw": _num(raw.get("target_kw")),
            "savingKw": _num(raw.get("savings_kw")),
            "dailyKwh": _num(raw.get("daily_kwh")),
            "monthlyKwh": _num(raw.get("monthly_kwh")),
            "peakDemandKw": _num(raw.get("peak_demand_kw")),
            "impactKw": _num(raw.get("estimated_energy_impact_kw")),
            "impactKwhDay": _num(raw.get("energy_impact_kwh_day")),
        },
        "safety": {"status": raw.get("safety_status"), "passed": raw.get("guardrail_pass")},
        "recommendation": {
            "action": raw.get("recommendation"),
            "rationale": raw.get("rationale") or raw.get("reason"),
            "confidence": _num(raw.get("confidence")),
            "priority": raw.get("priority"),
            "expectedImpactKw": _num(raw.get("savings_kw") if oid == "O17" else raw.get("estimated_energy_impact_kw") or raw.get("energy_impact_kwh_day")),
            "safety": raw.get("safety_status"),
            "timestamp": tel.get("lastUpdated"),
            "evidence": [e for e in (raw.get("evidence") or []) if e],
        },
        "supervisory": {
            "decision": decision,
            "reason": raw.get("rationale") or raw.get("reason"),
            "confidence": _num(raw.get("confidence")),
            "safety": raw.get("safety_status"),
            "currentState": status,
            "recommendedState": raw.get("recommendation"),
        },
        "confidence": _num(raw.get("confidence")),
        "priority": raw.get("priority"),
        "metrics": {k: v for k, v in raw.items() if k not in ("telemetry",)},
        "timestamp": tel.get("lastUpdated"),
        "source": "DEMO / SIMULATION" if demo else src,
        "bmsConnected": connected,
        "classified": classified.get("status"),
        "classified_telemetry": classified,
        "live": live,
        "audit": [],
        "charts": {
            "currentKw": _num(raw.get("current_kw")),
            "baselineKw": _num(raw.get("baseline_kw")),
            "targetKw": _num(raw.get("target_kw")),
            "trainingCompletion": _num(raw.get("training_coverage_pct")),
            "trainingItems": _int(raw.get("training_items")),
            "equipmentHealthPct": _num(raw.get("equipment_health_pct")),
            "maintenanceAlerts": _int(raw.get("maintenance_alerts") if raw.get("maintenance_alerts") is not None else raw.get("issues_detected")),
            "energyLossKw": _num(raw.get("estimated_energy_impact_kw")),
            "healthyPoints": _int(raw.get("healthy_points")),
            "degradedPoints": _int(raw.get("degraded_points")),
            "overrides": _int(raw.get("override_count")),
            "driftCount": _int(raw.get("drift_count")),
            "criticalIssues": _int(raw.get("critical_issues")),
        },
        "metadata": {
            "agent": "ACTIVE" if raw.get("available") else "WAITING",
            "dataQuality": quality or "UNKNOWN",
            "opportunityId": oid,
        },
    }
    ok, reason, classified_dispatch = evaluate_dispatch({**body, "opportunity_id": body.get("id")})
    body["dispatch"] = {
        "eligible": ok,
        "status": "READY" if ok else ("SAFE_HOLD" if decision == "SAFE_HOLD" else "HELD"),
        "rollbackAvailable": oid in ("O17", "O19"),
        "blockReason": None if ok else reason,
        "blockCode": None if ok else classified_dispatch.get("code"),
        "actionType": "PLAN_DISPATCH" if oid == "O17" else ("MAINTENANCE_ACTION" if oid == "O19" else ("TRAINING_ACTION" if oid == "O18" else "CHANGE_REQUEST")),
    }
    body["failSafe"] = {
        "available": oid in ("O17", "O19"),
        "policy": "SAFE_HOLD" if tel_raw == "STALE" else "HOLD",
        "previousState": None,
        "requestedState": raw.get("target_kw"),
        "rollbackState": raw.get("baseline_kw") if oid == "O17" else None,
    }
    try:
        body["audit"] = list_audit(str(oid), 10)
    except Exception:
        body["audit"] = []
    return body


def get_opportunity(oid: str) -> Dict[str, Any]:
    code = canonical_oid(oid)
    if not code:
        raise ValueError("UNKNOWN_OPPORTUNITY")
    return _as_module_opportunity(evaluate_opportunity(code, persist=True))


def _priority_rank(p: Any) -> int:
    s = str(p or "").upper()
    return {"CRITICAL": 4, "P1": 4, "HIGH": 3, "P2": 3, "MEDIUM": 2, "P3": 2, "LOW": 1}.get(s, 0)


def get_opportunities() -> Dict[str, Any]:
    opps = [get_opportunity(oid) for oid in MODULE_IDS]
    states = [o["telemetry"]["raw"] for o in opps]
    live_n = sum(1 for o in opps if o.get("live"))
    sim_active = sum(
        1
        for o in opps
        if o.get("status") not in (None, "UNAVAILABLE", "NO DATA", "NO LIVE DATA", "ERROR")
        and (o.get("metadata") or {}).get("agent") == "ACTIVE"
    )
    src = opps[0]["source"] if opps else None
    demo = _is_demo(src) or any(o.get("telemetryStatus") == "SIMULATED" for o in opps)
    connected = bool(production_bms_connected()) and not demo
    if "ERROR" in states:
        fleet = "ERROR"
    elif all(s in ("UNAVAILABLE", "MISSING", None) for s in states):
        fleet = "UNAVAILABLE"
    elif any(o.get("telemetryStatus") == "STALE" for o in opps):
        fleet = "STALE"
    elif live_n:
        fleet = "LIVE"
    else:
        fleet = "UNAVAILABLE"
    if demo:
        tel_ui = "SIMULATED"
        bms, bms_detail = "OFFLINE", "DEMO / SIMULATION"
        agent, mode = "SIMULATED", "SUPERVISORY"
    elif not connected:
        tel_ui = "BMS OFFLINE" if fleet not in ("UNAVAILABLE", "ERROR") else "NO DATA"
        bms, bms_detail = "OFFLINE", "Production BMS is not connected"
        agent, mode = tel_ui, "SUPERVISORY"
    elif fleet == "LIVE":
        tel_ui = "LIVE"
        bms, bms_detail, agent, mode = "CONNECTED", "BMS heartbeat healthy", "ONLINE", "SUPERVISORY"
    elif fleet == "STALE":
        tel_ui = "STALE"
        bms, bms_detail, agent, mode = "DEGRADED", "Stale O&M telemetry", "STALE", "SUPERVISORY"
    else:
        tel_ui = "NO DATA"
        bms, bms_detail, agent, mode = "OFFLINE", None, tel_ui, "SUPERVISORY"
    agent_label = None
    if demo or connected:
        active_agents = sum(1 for o in opps if (o.get("metadata") or {}).get("agent") == "ACTIVE")
        agent_label = f"{active_agents}/4 ACTIVE"
    safety_vals = [o.get("safety", {}).get("status") for o in opps]
    if any(s in ("FAIL", "BLOCKED") for s in safety_vals):
        safety_fleet = "FAIL"
    elif any(s == "WARNING" for s in safety_vals):
        safety_fleet = "WARNING"
    elif any(s == "PASS" for s in safety_vals):
        safety_fleet = "PASS"
    else:
        safety_fleet = None
    recs = [
        o for o in opps
        if o.get("status") not in (None, "UNAVAILABLE", "NO LIVE DATA", "NO DATA", "ERROR")
        and (o.get("recommendation") or {}).get("action")
        and (o.get("supervisory") or {}).get("decision") not in ("WAIT_FOR_TELEMETRY",)
    ]
    savings_kw = [_num(o.get("energy", {}).get("savingKw")) for o in opps]
    savings_day = [_num(o.get("energy", {}).get("dailyKwh") or o.get("energy", {}).get("impactKwhDay")) for o in opps]
    energy_kw = round(sum(v for v in savings_kw if v is not None), 2) if any(v is not None for v in savings_kw) else None
    energy_day = round(sum(v for v in savings_day if v is not None), 1) if any(v is not None for v in savings_day) else None
    savings_month = [_num(o.get("energy", {}).get("monthlyKwh")) for o in opps]
    energy_month = round(sum(v for v in savings_month if v is not None), 1) if any(v is not None for v in savings_month) else None
    ranks = [_priority_rank((o.get("priority") or (o.get("current") or {}).get("maintenanceRisk"))) for o in opps]
    maint = None
    if any(r > 0 for r in ranks):
        top = max(ranks)
        maint = {4: "Critical", 3: "High", 2: "Medium", 1: "Low"}.get(top)
    o20 = next((o for o in opps if o.get("id") == "O20"), None)
    control_pct = _num((o20 or {}).get("current", {}).get("controlHealthPct"))
    ages = [o["telemetry"]["ageSeconds"] for o in opps if o["telemetry"].get("ageSeconds") is not None]
    age = min(ages) if ages else None
    last = next((o["telemetry"]["lastUpdated"] for o in opps if o["telemetry"].get("lastUpdated")), None)
    qualities = [(o.get("telemetry") or {}).get("quality") for o in opps]
    if any(q == "DEGRADED" for q in qualities):
        dq = "DEGRADED"
    elif any(q == "GOOD" for q in qualities):
        dq = "GOOD"
    else:
        dq = "UNKNOWN"
    o17, o18, o19 = opps[0], opps[1], opps[2]
    return {
        "module": {
            "name": "Operations & Maintenance",
            "subtitle": "Energy planning, workforce awareness, maintenance efficiency, and HVAC control-system governance.",
            "ids": list(MODULE_IDS),
            "bms": {"status": bms, "detail": bms_detail},
            "bmsConnected": connected,
            "telemetry": {
                "status": tel_ui,
                "state": tel_ui,
                "raw": fleet,
                "ageSeconds": age,
                "lastUpdated": last,
                "timestamp": last,
                "source": src,
                "quality": dq,
                "label": tel_ui if age is None else f"{tel_ui} · {int(round(age))}s",
            },
            "agentStatus": agent,
            "agentLabel": agent_label or agent,
            "mode": mode,
            "safetyStatus": safety_fleet,
            "kpis": {
                "opportunities": 4,
                "activeRecommendations": len(recs),
                "energySavingsKw": energy_kw,
                "energySavingsKwhDay": energy_day,
                "energySavingsKwhMonth": energy_month,
                "maintenancePriority": maint,
                "controlHealthPct": control_pct,
                "telemetry": tel_ui,
                "activeOptimizations": len(recs),
                "energyOpportunityKw": energy_kw,
                "maintenanceRisk": maint,
                "safety": safety_fleet,
                "dataQuality": dq,
                "liveCount": live_n,
                "simActiveCount": sim_active,
            },
        },
        "opportunities": opps,
        "charts": {
            "energyPlanning": {
                "currentKw": (o17.get("charts") or {}).get("currentKw"),
                "baselineKw": (o17.get("charts") or {}).get("baselineKw"),
                "targetKw": (o17.get("charts") or {}).get("targetKw"),
                "savingsKw": (o17.get("energy") or {}).get("savingKw"),
            },
            "training": {
                "completion": (o18.get("charts") or {}).get("trainingCompletion"),
                "items": (o18.get("charts") or {}).get("trainingItems"),
                "affectedUsers": (o18.get("current") or {}).get("affectedUsers"),
            },
            "maintenance": {
                "health": (o19.get("charts") or {}).get("equipmentHealthPct"),
                "alerts": (o19.get("charts") or {}).get("maintenanceAlerts"),
                "energyLossKw": (o19.get("charts") or {}).get("energyLossKw"),
                "priority": o19.get("priority"),
            },
            "control": {
                "healthy": (o20 or {}).get("charts", {}).get("healthyPoints") if o20 else None,
                "degraded": (o20 or {}).get("charts", {}).get("degradedPoints") if o20 else None,
                "overrides": (o20 or {}).get("charts", {}).get("overrides") if o20 else None,
                "drift": (o20 or {}).get("charts", {}).get("driftCount") if o20 else None,
                "critical": (o20 or {}).get("charts", {}).get("criticalIssues") if o20 else None,
                "healthPct": control_pct,
            },
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def get_dashboard() -> Dict[str, Any]:
    refresh_om_sim_telemetry()
    return get_opportunities()
