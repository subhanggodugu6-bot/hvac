"""Public Ventilation module contract: O10 / O11 / O12 / O13."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.services.official_catalog import OFFICIAL_VENT_IDS
from backend.services.ventilation_opportunity_service import (
    _saving_kw,
    _tel_ui,
    evaluate_opportunity,
    ventilation_historian,
)
from backend.services.hvac_safety_contract import evaluate_dispatch, classify_telemetry, production_bms_connected

MODULE_IDS = OFFICIAL_VENT_IDS  # O10, O11, O12, O13
ROUTES = {
    "O10": "/agents/ventilation-airflow/economy-cycle",
    "O11": "/agents/ventilation-airflow/night-purge",
    "O12": "/agents/ventilation-airflow/demand-ventilation",
    "O13": "/agents/ventilation-airflow/dcv-co",
}


def canonical_oid(raw: str) -> Optional[str]:
    s = (raw or "").strip().upper().replace("-", "").replace("_", "")
    table = {
        "O10": "O10",
        "010": "O10",
        "10": "O10",
        "O11": "O11",
        "011": "O11",
        "11": "O11",
        "O12": "O12",
        "012": "O12",
        "12": "O12",
        "O13": "O13",
        "013": "O13",
        "13": "O13",
    }
    return table.get(s)


def _num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return n


def _is_demo(src: Any) -> bool:
    u = (str(src or "")).upper()
    return u in ("DEMO", "TEST TELEMETRY", "TEST", "SIMULATION", "DEMO / SIMULATION") or "SIMUL" in u


def _o10_metrics(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten O10 engine + telemetry so the Economy Cycle studio can bind KPIs."""
    metrics: Dict[str, Any] = {
        k: v for k, v in raw.items() if k not in ("candidates", "current_state", "optimized_state")
    }
    bags: List[Any] = [raw.get("current_state"), raw.get("optimized_state")]
    current = raw.get("current")
    if isinstance(current, dict):
        bags.append(current)
        bags.append(current.get("values"))
    for bag in bags:
        if not isinstance(bag, dict):
            continue
        for k, v in bag.items():
            if k in ("values",) or v is None or v == "":
                continue
            metrics.setdefault(k, v)
    return metrics


def dispatch_gate(body: Dict[str, Any]) -> tuple[bool, str, Dict[str, Any]]:
    """Dispatch is allowed only for live, safe, OPTIMIZE candidates — never demo/stale/missing."""
    oid = body.get("id") or body.get("opportunityId")
    cur = body.get("current") or {}
    opt = body.get("optimized") or {}
    if oid == "O10":
        current_value, target_value = cur.get("damperPct"), opt.get("damperPct")
    else:
        current_value, target_value = cur.get("airflowCfm"), opt.get("airflowCfm")
    ok, reason, classified = evaluate_dispatch(
        {
            **body,
            "opportunity_id": oid,
            "current_value": current_value,
            "target_value": target_value,
        }
    )
    return ok, reason, classified


def _as_module_opportunity(raw: Dict[str, Any]) -> Dict[str, Any]:
    oid = raw.get("opportunityId") or raw.get("opportunity_id")
    tel = raw.get("telemetry") or {}
    damper_cur = _num(raw.get("current_damper_pct") or raw.get("oa_damper_pct"))
    damper_opt = _num(raw.get("optimized_damper_pct") or raw.get("recommended_damper_pct"))
    if oid == "O10":
        if damper_cur is None:
            damper_cur = _num(raw.get("current_value"))
        if damper_opt is None:
            damper_opt = _num(raw.get("optimized_value"))
        cur = _num(raw.get("current_airflow_cfm"))
        opt = _num(raw.get("optimized_airflow_cfm"))
        rec_cur, rec_opt = damper_cur, damper_opt
    else:
        cur = _num(raw.get("current_airflow_cfm"))
        if cur is None:
            cur = _num(raw.get("current_value"))
        opt = _num(raw.get("optimized_airflow_cfm"))
        if opt is None:
            opt = _num(raw.get("optimized_value"))
        rec_cur, rec_opt = cur, opt
    delta = _num(raw.get("airflow_delta_cfm"))
    if delta is None and cur is not None and opt is not None:
        delta = round(opt - cur, 0)
    reduction = round(cur - opt, 0) if cur is not None and opt is not None else None
    reduction_pct = round(100.0 * (cur - opt) / cur, 1) if cur and opt is not None and cur != 0 else None
    inst = _num((raw.get("energy") or {}).get("instantaneousKw"))
    if inst is None:
        inst = _num(raw.get("instantaneous_kw"))
    daily = _num((raw.get("energy") or {}).get("dailyKwh"))
    if daily is None:
        daily = _num(raw.get("daily_kwh"))
    saving = _saving_kw(inst)
    rec = raw.get("recommendation")
    rec_action = rec.get("action") if isinstance(rec, dict) else rec
    rec_text = rec.get("rationale") if isinstance(rec, dict) else raw.get("reason")
    safety = raw.get("safety_status")
    tel_raw = tel.get("state")
    tel_ui = _tel_ui(tel_raw)
    status = raw.get("status")
    if status == "UNAVAILABLE":
        status = "NO DATA"
    decision = raw.get("supervisory_decision")
    if not decision:
        if tel_raw in ("UNAVAILABLE", None) or status == "NO DATA":
            decision = "WAIT_FOR_TELEMETRY"
        elif safety in ("FAIL", "BLOCKED"):
            decision = "BLOCK"
        elif status in ("ACTIVE", "OPTIMAL") and saving is not None:
            decision = "OPTIMIZE"
        else:
            decision = "HOLD"
    if tel_raw == "STALE":
        decision = "SAFE_HOLD"
    elif tel_raw in ("UNAVAILABLE", None) or status == "NO DATA":
        decision = "WAIT_FOR_TELEMETRY"
    quality = tel.get("quality") or raw.get("quality")
    src = tel.get("source")
    demo = _is_demo(src)
    classified = classify_telemetry(
        {"source": src, "quality": quality, "raw": tel_raw, "ageSeconds": tel.get("ageSeconds")},
        src,
    )
    connected = production_bms_connected()
    if demo:
        tel_ui = "SIMULATED"
    elif classified.get("status") == "STALE":
        tel_ui = "STALE"
    elif not connected:
        tel_ui = "BMS OFFLINE" if tel_raw not in ("UNAVAILABLE", None, "ERROR") else "NO DATA"
    elif classified.get("status") == "LIVE" and connected:
        tel_ui = "LIVE"
    else:
        tel_ui = classified.get("status") or _tel_ui(tel_raw)
        if tel_ui == "LIVE":
            tel_ui = "NO DATA"
    current_kw = _num(raw.get("current_fan_kw"))
    optimized_kw = _num(raw.get("optimized_fan_kw"))
    body: Dict[str, Any] = {
        "id": oid,
        "opportunityId": oid,
        "name": raw.get("name"),
        "description": raw.get("description"),
        "route": ROUTES.get(str(oid)),
        "status": status,
        "telemetryStatus": tel_ui,
        "telemetry": {
            "state": tel_ui,
            "raw": tel_raw,
            "lastUpdated": tel.get("lastUpdated"),
            "ageSeconds": tel.get("ageSeconds"),
            "source": "DEMO / SIMULATION" if demo else src,
            "quality": quality,
            "label": "SIMULATED" if demo else tel.get("label"),
        },
        "current": {
            "airflowCfm": cur,
            "damperPct": damper_cur,
            "fanKw": current_kw,
            "co2Ppm": _num(raw.get("current_co2_ppm")),
            "coPpm": _num(raw.get("co_ppm")),
            "occupancy": raw.get("occupant_count"),
        },
        "optimized": {
            "airflowCfm": opt,
            "damperPct": damper_opt,
            "fanKw": optimized_kw,
            "co2Ppm": _num(raw.get("predicted_co2_ppm")),
        },
        "energy": {
            "currentKw": current_kw,
            "optimizedKw": optimized_kw,
            "instantaneousKw": inst,
            "savingKw": saving,
            "dailyKwh": daily,
        },
        "delta": {"airflowCfm": delta, "reductionCfm": reduction, "reductionPct": reduction_pct},
        "confidence": _num(raw.get("confidence")),
        "safety": {
            "status": safety,
            "passed": raw.get("guardrails", {}).get("passed") if isinstance(raw.get("guardrails"), dict) else raw.get("guardrail_pass"),
        },
        "recommendation": {
            "action": rec_action,
            "rationale": rec_text,
            "current": rec_cur,
            "recommended": rec_opt,
            "expectedImpactKw": saving if saving is not None else inst,
            "confidence": _num(raw.get("confidence")),
            "safety": safety,
            "timestamp": tel.get("lastUpdated"),
        },
        "supervisory": {
            "decision": decision,
            "reason": rec_text,
            "current": rec_cur,
            "recommended": rec_opt,
            "delta": (None if rec_cur is None or rec_opt is None else round(rec_opt - rec_cur, 1)),
            "confidence": _num(raw.get("confidence")),
            "safety": safety,
        },
        "metrics": _o10_metrics(raw) if oid == "O10" else {k: v for k, v in raw.items() if k not in ("candidates", "current_state", "optimized_state")},
        "timestamp": tel.get("lastUpdated") or raw.get("timestamp"),
        "source": "DEMO / SIMULATION" if demo else src,
        "bmsConnected": connected,
        "classified": classified.get("status"),
        "live": bool(classified.get("status") == "LIVE" and connected and not demo),
    }
    ok, reason, classified_dispatch = dispatch_gate(body)
    body["dispatch"] = {
        "eligible": ok,
        "status": "READY" if ok else ("SAFE_HOLD" if decision == "SAFE_HOLD" else "HELD"),
        "rollbackAvailable": True,
        "command": rec_action,
        "target": rec_opt,
        "timestamp": tel.get("lastUpdated"),
        "source": "OPERATOR" if ok else "SYSTEM",
        "verification": "PENDING",
        "blockReason": None if ok else reason,
        "blockCode": None if ok else classified_dispatch.get("code"),
    }
    body["failSafe"] = {
        "previous": rec_cur,
        "recommended": rec_opt,
        "dispatch": "READY" if ok else "HELD",
        "rollback": rec_cur,
        "available": True,
        "policy": "SAFE_HOLD" if tel_raw == "STALE" else ("ROLLBACK" if safety == "FAIL" else "HOLD"),
    }
    if oid == "O10":
        body["historian"] = raw.get("historian") or ventilation_historian("O10")
        body["diagnostics"] = raw.get("diagnostics") or {}
    return body


def get_opportunity(oid: str) -> Dict[str, Any]:
    code = canonical_oid(oid)
    if not code:
        raise ValueError("UNKNOWN_OPPORTUNITY")
    raw = evaluate_opportunity(code, persist=True)
    return _as_module_opportunity(raw)


def get_opportunities() -> Dict[str, Any]:
    opps = [get_opportunity(oid) for oid in MODULE_IDS]
    states = [o["telemetry"]["raw"] for o in opps]
    live_n = sum(1 for o in opps if o.get("live"))
    if "ERROR" in states:
        fleet = "ERROR"
    elif all(s == "UNAVAILABLE" for s in states):
        fleet = "UNAVAILABLE"
    elif any(o.get("telemetryStatus") == "STALE" for o in opps):
        fleet = "STALE"
    elif live_n:
        fleet = "LIVE"
    else:
        fleet = "UNAVAILABLE"
    tel_ui = _tel_ui(fleet)
    ages = [o["telemetry"]["ageSeconds"] for o in opps if o["telemetry"].get("ageSeconds") is not None]
    age = min(ages) if ages else None
    src = opps[0]["source"] if opps else None
    demo = src == "DEMO / SIMULATION" or (opps and "DEMO" in str(opps[0].get("source") or "").upper()) or (
        opps and opps[0].get("telemetryStatus") == "SIMULATED"
    )
    connected = production_bms_connected()
    if demo:
        tel_ui = "SIMULATED"
        bms, bms_detail = "OFFLINE", "DEMO / SIMULATION"
    elif not connected:
        tel_ui = "BMS OFFLINE" if fleet not in ("UNAVAILABLE", "ERROR") else "NO DATA"
        bms, bms_detail = "OFFLINE", "Production BMS is not connected"
    elif fleet == "LIVE":
        bms, bms_detail = "ONLINE", "BMS heartbeat healthy"
    elif fleet == "STALE":
        bms, bms_detail = "DEGRADED", "Stale BMS telemetry"
    else:
        bms, bms_detail = "OFFLINE", None
    active = sum(1 for o in opps if o.get("status") in ("ACTIVE", "OPTIMAL", "READY") or o.get("supervisory", {}).get("decision") == "OPTIMIZE")
    safety_vals = [o.get("safety", {}).get("status") for o in opps]
    if any(s in ("FAIL", "BLOCKED") for s in safety_vals):
        safety_fleet = "FAIL"
    elif any(s == "WARNING" for s in safety_vals):
        safety_fleet = "WARNING"
    elif any(s == "PASS" for s in safety_vals):
        safety_fleet = "PASS"
    else:
        safety_fleet = None
    cur_cfm = [_num(o["current"]["airflowCfm"]) for o in opps]
    opt_cfm = [_num(o["optimized"]["airflowCfm"]) for o in opps]
    cur_sum = round(sum(v for v in cur_cfm if v is not None), 0) if any(v is not None for v in cur_cfm) else None
    opt_sum = round(sum(v for v in opt_cfm if v is not None), 0) if any(v is not None for v in opt_cfm) else None
    cur_kw = [_num(o["energy"]["currentKw"]) for o in opps]
    opt_kw = [_num(o["energy"]["optimizedKw"]) for o in opps]
    sav = [_num(o["energy"]["savingKw"]) for o in opps]
    current_kw = round(sum(v for v in cur_kw if v is not None), 2) if any(v is not None for v in cur_kw) else None
    optimized_kw = round(sum(v for v in opt_kw if v is not None), 2) if any(v is not None for v in opt_kw) else None
    savings_kw = round(sum(v for v in sav if v is not None), 2) if any(v is not None for v in sav) else None
    last = next((o["telemetry"]["lastUpdated"] for o in opps if o["telemetry"].get("lastUpdated")), None)
    agent = "SIMULATED" if demo else ("ONLINE" if fleet == "LIVE" else tel_ui)
    return {
        "module": {
            "name": "Ventilation & Air Flow Optimizations",
            "subtitle": "Economy-cycle free cooling, demand-controlled ventilation, and night-time thermal purge.",
            "ids": list(MODULE_IDS),
            "bms": {"status": bms, "detail": bms_detail},
            "telemetry": {
                "state": tel_ui,
                "raw": fleet,
                "ageSeconds": age,
                "lastUpdated": last,
                "source": src,
                "label": tel_ui if age is None else f"{tel_ui} · {int(round(age))}s",
            },
            "agentStatus": agent,
            "mode": "AUTO_CLOSED_LOOP",
            "safetyStatus": safety_fleet,
            "kpis": {
                "telemetry": tel_ui,
                "activeOptimizations": active,
                "currentAirflowCfm": cur_sum,
                "optimizedAirflowCfm": opt_sum,
                "currentKw": current_kw,
                "optimizedKw": optimized_kw,
                "savingsKw": savings_kw,
                "safety": safety_fleet,
                "liveCount": live_n,
            },
        },
        "opportunities": opps,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
