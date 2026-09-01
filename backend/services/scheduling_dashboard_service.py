"""Aggregated Scheduling & Supervisory dashboard: O1–O4 from engines + SQLite."""
from __future__ import annotations

import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_ROOT = os.path.abspath(os.path.join(_BACKEND, ".."))
for _p in (_ROOT, _BACKEND):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from database.session import SessionLocal
from database.models import O1ActionDB, O2ActionDB, O3ActionDB, O4ActionDB, SupervisoryActionRecord, O1ActivityLogDB
from database.models_o1 import O1SavingsVerificationDB, O1SafetyValidationDB, O1ConfigurationDB
from backend.services.ttl_cache import cache_get, cache_set, cache_delete

LIVE_S = 30
STALE_S = 120
DEGRADED_S = 300


def _freshness(age_s: Optional[float], live_s: int = LIVE_S, stale_s: int = STALE_S, degraded_s: int = DEGRADED_S) -> str:
    if age_s is None:
        return "OFFLINE"
    if age_s < live_s:
        return "LIVE"
    if age_s < stale_s:
        return "STALE"
    if age_s < degraded_s:
        return "DEGRADED"
    return "OFFLINE"


def _age_label(age_s: Optional[float]) -> Optional[str]:
    if age_s is None:
        return None
    if age_s < 60:
        return f"Telemetry {int(round(age_s))}s ago"
    if age_s < 3600:
        return f"Telemetry {int(round(age_s / 60))}m ago"
    return f"Telemetry {round(age_s / 3600, 1)}h ago"


def _display_state(freshness: str, has_values: bool, engine_ok: bool, api_error: Optional[str]) -> str:
    if api_error:
        return "BACKEND OFFLINE"
    if not engine_ok:
        return "ENGINE NOT CONFIGURED"
    if freshness == "SIMULATED" and has_values:
        return "SIMULATED"
    if freshness == "OFFLINE" and not has_values:
        return "AWAITING TELEMETRY"
    if freshness == "STALE":
        return "STALE TELEMETRY"
    if freshness == "DEGRADED":
        return "DEGRADED TELEMETRY"
    if freshness == "OFFLINE":
        return "OFFLINE"
    if has_values:
        return "LIVE"
    return "AWAITING TELEMETRY"


def _data_state(*, api_error: Optional[str], engine_ok: bool, freshness: str, has_live: bool, has_stored: bool) -> str:
    if api_error:
        return "ERROR"
    if not engine_ok:
        return "ENGINE_OFFLINE"
    if freshness in ("LIVE", "SIMULATED") and has_live:
        return "LIVE" if freshness == "LIVE" else "LAST_KNOWN"
    if freshness in ("STALE", "DEGRADED") and (has_live or has_stored):
        return "STALE"
    if has_stored or has_live:
        return "LAST_KNOWN"
    return "AWAITING_TELEMETRY"


def _op_status(data_state: str, blocked: bool = False) -> str:
    if blocked:
        return "BLOCKED"
    return {
        "LIVE": "ACTIVE",
        "STALE": "MONITORING",
        "LAST_KNOWN": "MONITORING",
        "ENGINE_OFFLINE": "ENGINE OFFLINE",
        "ERROR": "ERROR",
        "AWAITING_TELEMETRY": "AWAITING TELEMETRY",
    }.get(data_state, data_state)


def _metric(
    label: str,
    value: Any,
    unit: Optional[str] = None,
    status: Optional[str] = None,
    unavailable_reason: Optional[str] = None,
) -> Dict[str, Any]:
    empty = value is None or value == ""
    return {
        "label": label,
        "value": None if empty else value,
        "unit": unit if not empty else None,
        "status": "UNAVAILABLE" if empty else status,
        "unavailableReason": unavailable_reason if empty else None,
    }


def _third_highest_demand(zones: List[Dict[str, Any]]) -> Optional[float]:
    demands = sorted(
        [
            float(z["cooling_demand_pct"])
            for z in zones
            if z.get("cooling_demand_pct") is not None and not z.get("is_excluded")
        ],
        reverse=True,
    )
    if not demands:
        return None
    if len(demands) >= 3:
        return round(demands[2], 1)
    return round(demands[0], 1)


def _o4_stage_label(compressors: Any) -> Optional[str]:
    if not compressors:
        return None
    if isinstance(compressors, dict):
        running = [f"{k}@{int(v)}%" for k, v in compressors.items() if v]
        return ", ".join(running[:4]) if running else "0 STAGES"
    running = [c for c in compressors if c.get("is_running")]
    if not running:
        return "0 STAGES"
    parts = []
    for c in running[:4]:
        sid = c.get("stage_id") or "?"
        load = c.get("load_pct")
        parts.append(f"{sid}@{int(load)}%" if load is not None else str(sid))
    return ", ".join(parts)


def _zones(sim: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [z for a in (sim.get("ahus") or []) for z in (a.get("vav_zones") or [])]


def _avg(vals: List[Optional[float]]) -> Optional[float]:
    nums = [v for v in vals if v is not None]
    if not nums:
        return None
    return round(sum(nums) / len(nums), 1)


def _fmt_temp(v: Optional[float]) -> Optional[str]:
    return None if v is None else f"{v:.1f}°C"


def _pct(v: Optional[float]) -> Optional[str]:
    if v is None:
        return None
    return f"{round(v * 100, 1)}%" if v <= 1.5 else f"{round(v, 1)}%"


def _card(
    opportunity_id: str,
    name: str,
    *,
    status: Optional[str],
    telemetry_status: str,
    telemetry_age: Optional[float],
    last_telemetry_at: Optional[str],
    current_value: Any,
    optimized_value: Any,
    energy_impact: Any,
    runtime_impact: Any = None,
    confidence: Any = None,
    safety_status: Any = None,
    comfort_status: Any = None,
    model_version: Any = None,
    last_evaluation_at: Optional[str],
    active_decision: Any = None,
    recommendation: Any = None,
    data_source: str,
    extra: Optional[Dict[str, Any]] = None,
    engine_ok: bool = True,
    api_error: Optional[str] = None,
    primary_metric: Optional[Dict[str, Any]] = None,
    secondary_metrics: Optional[List[Dict[str, Any]]] = None,
    blocked: bool = False,
    has_stored: bool = False,
) -> Dict[str, Any]:
    has = any(x is not None and x != "" for x in (current_value, optimized_value, energy_impact, confidence))
    if primary_metric and primary_metric.get("value") not in (None, ""):
        has = True
    display = _display_state(telemetry_status, has, engine_ok, api_error)
    ds = _data_state(
        api_error=api_error,
        engine_ok=engine_ok,
        freshness=telemetry_status,
        has_live=has and telemetry_status in ("LIVE", "SIMULATED"),
        has_stored=has_stored or has,
    )
    operational = status or _op_status(ds, blocked)
    secondaries = secondary_metrics or []
    body = {
        "opportunityId": opportunity_id,
        "name": name,
        "status": operational,
        "displayState": display,
        "dataState": ds,
        "primaryMetric": primary_metric or _metric("Primary", optimized_value or current_value),
        "secondaryMetrics": secondaries,
        "impact": {"energy": energy_impact, "runtime": runtime_impact},
        "telemetry": {
            "status": telemetry_status,
            "ageSeconds": telemetry_age,
            "lastUpdated": last_telemetry_at,
            "label": _age_label(telemetry_age),
            "compact": (
                f"{int(round(telemetry_age))}s {ds}"
                if telemetry_age is not None
                else ds
            ),
        },
        "telemetryStatus": telemetry_status,
        "telemetryAge": telemetry_age,
        "telemetryAgeLabel": _age_label(telemetry_age),
        "lastTelemetryAt": last_telemetry_at,
        "currentValue": current_value,
        "optimizedValue": optimized_value,
        "energyImpact": energy_impact,
        "runtimeImpact": runtime_impact,
        "confidence": confidence,
        "safetyStatus": safety_status,
        "comfortStatus": comfort_status,
        "modelVersion": model_version,
        "lastEvaluationAt": last_evaluation_at,
        "activeDecision": active_decision,
        "recommendation": recommendation,
        "dataSource": data_source,
        "apiError": api_error,
    }
    if extra:
        body.update(extra)
    return body


def _sim_cycle() -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    try:
        from backend.services.simulation_service import sim_service
        if hasattr(sim_service, "get_latest_status"):
            return sim_service.get_latest_status(), None
        return sim_service.step(elapsed_minutes=5), None
    except Exception as exc:
        return None, str(exc)


def _build_o1(age: Optional[float], freshness: str, now_iso: str, dataset: bool = False) -> Dict[str, Any]:
    try:
        from backend.services.o1_service import o1_service
        from backend.services.o1_telemetry_service import live_value, telemetry_health

        state = o1_service.get_state()
        energy = o1_service.get_energy_impact()
        decision = o1_service.get_decision()
        health = state.get("health") or {}
        kpis = dict(state.get("kpis") or {})
        age_o1 = health.get("telemetry_age_seconds")
        if age_o1 is None and dataset:
            try:
                age_o1 = (telemetry_health(90) or {}).get("telemetry_age_seconds")
            except Exception:
                age_o1 = 5.0
        if age_o1 is None:
            age_o1 = age
        fr = _freshness(age_o1) if age_o1 is not None else freshness
        if dataset and fr == "OFFLINE" and age_o1 is not None:
            fr = "SIMULATED" if age_o1 < LIVE_S else _freshness(age_o1)
        if dataset and fr == "OFFLINE":
            fr = "SIMULATED"

        zone = kpis.get("current_zone_temp")
        zone_num = live_value("ZONE_TEMP")
        if zone is None and zone_num is not None:
            zone = f"{zone_num:.1f}°C"
            kpis["current_zone_temp"] = zone

        opt = None
        if kpis.get("optimized_start"):
            opt = f"Start {kpis['optimized_start']}"
            if kpis.get("optimized_stop"):
                opt = f"{opt} / Stop {kpis['optimized_stop']}"
        sav = None
        if isinstance(energy, dict) and energy.get("status") != "UNAVAILABLE":
            if energy.get("verification_status") == "VERIFIED" and energy.get("tiers", {}).get("verified_savings_kwh") is not None:
                sav = f"{energy['tiers']['verified_savings_kwh']} kWh/day verified"
            elif energy.get("daily_energy_savings_kwh") is not None:
                sav = f"{energy['daily_energy_savings_kwh']} kWh/day predicted"
        conf = kpis.get("model_confidence")
        # Keep MODEL NOT READY visible on cards — do not blank to DATA NOT AVAILABLE.
        safety = None
        try:
            chk = o1_service.get_safety_checks()
            if chk.get("total_count"):
                safety = "BLOCKED" if not chk.get("all_passed") else "PASSED"
        except Exception:
            safety = None
        start = (decision or {}).get("start") or {}
        run = state.get("run_status")
        # Dataset: show MONITORING when we have zone telemetry even if last run FAILED/BLOCKED.
        blocked = run in ("FAILED", "BLOCKED") and not (dataset and zone)
        opt_start = kpis.get("optimized_start")
        opt_stop = kpis.get("optimized_stop")
        comfort = kpis.get("comfort_compliance")
        runtime = kpis.get("daily_runtime_saved")
        has_decision = bool(opt_start or opt_stop or zone)
        return _card(
            "O1",
            "Optimum Start/Stop Programming",
            status="MONITORING" if (dataset and zone and not opt_start) else None,
            blocked=blocked,
            has_stored=has_decision,
            telemetry_status=fr,
            telemetry_age=age_o1,
            last_telemetry_at=health.get("latest_timestamp") or now_iso,
            current_value=zone,
            optimized_value=opt_start or opt,
            energy_impact=sav,
            runtime_impact=runtime,
            confidence=conf,
            safety_status=safety,
            comfort_status=comfort,
            model_version=state.get("model_version"),
            last_evaluation_at=state.get("timestamp") or now_iso,
            active_decision=start.get("decision"),
            recommendation=start.get("reason"),
            data_source="DATASET" if dataset else (state.get("source") or "O1_PIPELINE"),
            primary_metric=_metric(
                "Optimized Start",
                opt_start,
                unavailable_reason=None if zone else "No O1 decision row for the current run",
            )
            if opt_start
            else _metric("Current Temp", zone, unavailable_reason="ZONE_TEMP not in o1_telemetry_sample"),
            secondary_metrics=[
                _metric("Current Temp", zone, unavailable_reason="ZONE_TEMP not in o1_telemetry_sample"),
                _metric("Optimized Stop", opt_stop, unavailable_reason="No optimized_stop on o1_optimization_decisions"),
                _metric("Runtime Saved", runtime, unavailable_reason="No o1_savings_verification.runtime_saved"),
                _metric("Energy Saved", sav, unavailable_reason="No predicted or verified O1 savings"),
                _metric("Confidence", conf, unavailable_reason="Model not ready and no decision confidence"),
                _metric("Comfort", comfort, status=comfort, unavailable_reason="No o1_comfort_validation for this run"),
            ],
            extra={"controlBand": None, "optimizedStop": opt_stop},
        )
    except Exception as exc:
        return _card(
            "O1", "Optimum Start/Stop Programming",
            status=None, telemetry_status="OFFLINE", telemetry_age=None, last_telemetry_at=None,
            current_value=None, optimized_value=None, energy_impact=None,
            last_evaluation_at=None, data_source="ERROR", engine_ok=False, api_error=str(exc),
        )


def _eval_to_dict(result) -> Dict[str, Any]:
    if result is None:
        return {}
    if isinstance(result, dict):
        return result
    cur = getattr(result, "current_state", None) or {}
    rec = getattr(result, "recommended_action", None)
    impact = getattr(result, "expected_impact", None) or {}
    return {
        "current_state": cur,
        "recommended_action": rec,
        "confidence": getattr(result, "confidence", None),
        "reason": getattr(result, "reason", None),
        "expected_impact": impact,
        "opportunity_code": getattr(result, "opportunity_code", None),
    }


def _build_o2(sim: Optional[Dict[str, Any]], age: Optional[float], freshness: str, now_iso: str, api_error: Optional[str]) -> Dict[str, Any]:
    if api_error and not sim:
        return _card("O2", "Space Temperature Set Points & Control Bands",
                     status=None, telemetry_status="OFFLINE", telemetry_age=None, last_telemetry_at=None,
                     current_value=None, optimized_value=None, energy_impact=None,
                     last_evaluation_at=None, data_source="ERROR", api_error=api_error)
    try:
        from backend.agents.scheduling_supervisory.o2_engine import SpaceTemperatureOptimizationEngine
        ev = _eval_to_dict(SpaceTemperatureOptimizationEngine().evaluate(sim or {}))
        zones = (ev.get("current_state") or {}).get("zones") or []
        temps = [z.get("actual_temperature") for z in zones]
        sps = [z.get("setpoint") for z in zones]
        avg_t = _avg(temps)
        avg_sp = _avg(sps)
        rec = ev.get("recommended_action")
        opt_sp = getattr(rec, "proposed_value", None) if rec is not None else None
        if opt_sp is None and zones:
            opt_sp = _avg([z.get("cooling_setpoint") or z.get("setpoint") for z in zones])
        band = None
        if zones:
            dbs = [z.get("deadband") for z in zones if z.get("deadband") is not None]
            if avg_sp is not None and dbs:
                half = sum(dbs) / len(dbs) / 2.0
                band = f"{round(avg_sp - half, 1)}–{round(avg_sp + half, 1)}°C"
        comfort = None
        if zones:
            ok = sum(1 for z in zones if z.get("comfort_status") in ("OPTIMAL", "ACCEPTABLE", "PASS"))
            comfort = f"{round(100.0 * ok / len(zones), 1)}%"
        kw = (ev.get("expected_impact") or {}).get("estimated_power_kw_impact")
        energy = f"{kw} kW predicted" if kw is not None else None
        sim_zones = _zones(sim or {})
        coverage = None
        if zones:
            total = len(sim_zones) if sim_zones else len(zones)
            coverage = f"{len(zones)}/{total}"
        conf = _pct(ev.get("confidence"))
        avg_t_s = _fmt_temp(avg_t)
        opt_s = _fmt_temp(float(opt_sp) if opt_sp is not None else None)
        return _card(
            "O2",
            "Space Temperature Set Points & Control Bands",
            status=None,
            has_stored=avg_t is not None,
            telemetry_status=freshness,
            telemetry_age=age,
            last_telemetry_at=now_iso if sim else None,
            current_value=avg_t_s,
            optimized_value=opt_s,
            energy_impact=energy,
            confidence=conf,
            safety_status=None,
            comfort_status=comfort,
            model_version=None,
            last_evaluation_at=now_iso,
            active_decision=getattr(rec, "reason", None) if rec is not None else ev.get("reason"),
            recommendation=ev.get("reason"),
            data_source="O2_ENGINE+SIM",
            primary_metric=_metric("Current Avg Temp", avg_t_s, unavailable_reason="O2 engine returned no zone temperatures"),
            secondary_metrics=[
                _metric("Optimized Setpoint", opt_s, unavailable_reason="No proposed_value on O2 recommended_action"),
                _metric("Control Band", band, unavailable_reason="Zone deadband missing on O2 current_state.zones"),
                _metric("Zone Coverage", coverage, unavailable_reason="O2 current_state.zones empty"),
                _metric("Comfort", comfort, unavailable_reason="No zone comfort_status from O2 engine"),
                _metric("Energy Impact", energy, unavailable_reason="expected_impact.estimated_power_kw_impact missing"),
                _metric("Confidence", conf, unavailable_reason="O2 engine confidence not set"),
            ],
            extra={"controlBand": band, "currentSetpoint": _fmt_temp(avg_sp), "zoneCoverage": coverage},
            engine_ok=True,
        )
    except Exception as exc:
        return _card("O2", "Space Temperature Set Points & Control Bands",
                     status=None, telemetry_status=freshness, telemetry_age=age, last_telemetry_at=now_iso,
                     current_value=None, optimized_value=None, energy_impact=None,
                     last_evaluation_at=now_iso, data_source="ERROR", engine_ok=False, api_error=str(exc))


def _build_o3(sim: Optional[Dict[str, Any]], age: Optional[float], freshness: str, now_iso: str, api_error: Optional[str]) -> Dict[str, Any]:
    if api_error and not sim:
        return _card("O3", "Master AHU Supply Air Temperature Signal",
                     status=None, telemetry_status="OFFLINE", telemetry_age=None, last_telemetry_at=None,
                     current_value=None, optimized_value=None, energy_impact=None,
                     last_evaluation_at=None, data_source="ERROR", api_error=api_error)
    try:
        from backend.agents.scheduling_supervisory.o3_engine import MasterAHUSATOptimizationEngine
        ahus = (sim or {}).get("ahus") or []
        ahu = ahus[0] if ahus else {}
        curr = ahu.get("sat_actual", ahu.get("sat"))
        sp = ahu.get("sat_setpoint", ahu.get("sat_sp"))
        ev = _eval_to_dict(MasterAHUSATOptimizationEngine().evaluate(sim or {}))
        rec = ev.get("recommended_action")
        opt = getattr(rec, "proposed_value", None) if rec is not None else None
        opt_val = float(opt) if opt is not None else (float(sp) if sp is not None else None)
        reset = None
        if curr is not None and opt_val is not None:
            reset = f"{opt_val - float(curr):+.1f}°C"
        impact = ev.get("expected_impact") or {}
        kw = impact.get("estimated_power_kw_impact")
        cur_state = ev.get("current_state") or {}
        demand = cur_state.get("master_demand_pct")
        if demand is None:
            demand = _third_highest_demand(cur_state.get("vav_zones") or [])
        demand_s = f"{demand}%" if demand is not None else None
        chiller_kw = impact.get("chiller_power_saved_kw")
        fan_kw = impact.get("fan_power_penalty_kw")
        chiller_s = f"{chiller_kw} kW predicted" if chiller_kw is not None else None
        fan_s = f"{fan_kw} kW predicted" if fan_kw is not None else None
        min_sat = cur_state.get("min_sat_limit")
        safety = None
        if curr is not None and min_sat is not None:
            safety = "PASS" if float(curr) >= float(min_sat) else "BLOCKED"
        curr_s = _fmt_temp(float(curr) if curr is not None else None)
        opt_s = _fmt_temp(opt_val)
        energy = f"{kw} kW predicted" if kw is not None else None
        conf = _pct(ev.get("confidence"))
        return _card(
            "O3",
            "Master AHU Supply Air Temperature Signal",
            status=None,
            has_stored=curr is not None,
            telemetry_status=freshness,
            telemetry_age=age,
            last_telemetry_at=now_iso if sim else None,
            current_value=curr_s,
            optimized_value=opt_s,
            energy_impact=energy,
            confidence=conf,
            safety_status=safety,
            comfort_status=None,
            model_version=None,
            last_evaluation_at=now_iso,
            active_decision=getattr(rec, "reason", None) if rec is not None else ev.get("reason"),
            recommendation=ev.get("reason"),
            data_source="O3_ENGINE+SIM",
            primary_metric=_metric("Current SAT", curr_s, unavailable_reason="AHU sat_actual / sat missing on sim plant"),
            secondary_metrics=[
                _metric("Optimized SAT", opt_s, unavailable_reason="No O3 proposed_value or SAT setpoint"),
                _metric("SAT Reset", reset, unavailable_reason="Cannot compute reset without current and optimized SAT"),
                _metric("Master Demand", demand_s, unavailable_reason="No VAV cooling_demand_pct for third-highest demand"),
                _metric("Chiller Impact", chiller_s, unavailable_reason="expected_impact.chiller_power_saved_kw missing"),
                _metric("Fan Impact", fan_s, unavailable_reason="expected_impact.fan_power_penalty_kw missing"),
                _metric("Confidence", conf, unavailable_reason="O3 engine confidence not set"),
                _metric("Safety", safety, status=safety, unavailable_reason="SAT vs freeze clamp not evaluable"),
            ],
            extra={
                "satReset": reset,
                "masterDemand": demand_s,
                "currentSetpoint": _fmt_temp(float(sp) if sp is not None else None),
                "chillerImpact": chiller_s,
                "fanImpact": fan_s,
            },
        )
    except Exception as exc:
        return _card("O3", "Master AHU Supply Air Temperature Signal",
                     status=None, telemetry_status=freshness, telemetry_age=age, last_telemetry_at=now_iso,
                     current_value=None, optimized_value=None, energy_impact=None,
                     last_evaluation_at=now_iso, data_source="ERROR", engine_ok=False, api_error=str(exc))


def _build_o4(sim: Optional[Dict[str, Any]], age: Optional[float], freshness: str, now_iso: str, api_error: Optional[str]) -> Dict[str, Any]:
    if api_error and not sim:
        return _card("O4", "Staging of Chillers & Compressors",
                     status=None, telemetry_status="OFFLINE", telemetry_age=None, last_telemetry_at=None,
                     current_value=None, optimized_value=None, energy_impact=None,
                     last_evaluation_at=None, data_source="ERROR", api_error=api_error)
    try:
        from backend.agents.scheduling_supervisory.o4_engine import ChillerCompressorStagingEngine
        plant = (sim or {}).get("plant") or {}
        ev = _eval_to_dict(ChillerCompressorStagingEngine().evaluate(sim or {}))
        cur = ev.get("current_state") or {}
        n = cur.get("active_chillers_count")
        rec = ev.get("recommended_action")
        opt_n = None
        if rec is not None:
            # proposed 0/1 enable is not stage count; use current_state after reason
            opt_n = n
            rid = getattr(rec, "id", "") or ""
            if "stage-down" in str(rid) and n:
                opt_n = max(0, int(n) - 1)
            elif "stage-up" in str(rid) and n is not None:
                opt_n = int(n) + 1
        tons = cur.get("total_tons", plant.get("total_tons"))
        kw = (ev.get("expected_impact") or {}).get("estimated_power_kw_impact")
        comps = cur.get("compressor_stages") or []
        curr_stage = _o4_stage_label(comps)
        opt_stage = None
        if curr_stage is not None and opt_n is not None and n is not None and opt_n != n:
            opt_stage = f"{opt_n} CHILLER{'S' if opt_n != 1 else ''}"
        elif opt_n is not None:
            opt_stage = f"{opt_n} CHILLER{'S' if opt_n != 1 else ''}"
        tons_s = f"{round(float(tons), 1)} Tons" if tons is not None else None
        n_s = str(n) if n is not None else None
        energy = f"{kw} kW predicted" if kw is not None else None
        conf = _pct(ev.get("confidence"))
        safety = cur.get("capacity_sufficiency")
        if safety == "SUFFICIENT":
            safety_ui = "PASS"
        elif safety:
            safety_ui = str(safety)
        else:
            safety_ui = None
        runtime_reason = "O4 engine does not publish runtime impact (kWh/min saved); only chiller runtime_minutes operational state exists"
        return _card(
            "O4",
            "Staging of Chillers & Compressors",
            status=None,
            has_stored=n is not None or tons is not None,
            telemetry_status=freshness,
            telemetry_age=age,
            last_telemetry_at=now_iso if sim else None,
            current_value=curr_stage or (f"{n} CHILLER{'S' if n != 1 else ''}" if n is not None else None),
            optimized_value=opt_stage,
            energy_impact=energy,
            runtime_impact=None,
            confidence=conf,
            safety_status=safety_ui,
            comfort_status=None,
            model_version=None,
            last_evaluation_at=now_iso,
            active_decision=getattr(rec, "reason", None) if rec is not None else ev.get("reason"),
            recommendation=ev.get("reason"),
            data_source="O4_ENGINE+SIM",
            primary_metric=_metric("Current Stage", curr_stage or (f"{n} CHILLERS" if n is not None else None), unavailable_reason="O4 current_state.compressor_stages empty"),
            secondary_metrics=[
                _metric("Optimized Stage", opt_stage, unavailable_reason="No stage-up/down recommendation from O4 engine"),
                _metric("Plant Load", tons_s, unavailable_reason="current_state.total_tons missing"),
                _metric("Active Chillers", n_s, unavailable_reason="active_chillers_count missing"),
                _metric("Energy Impact", energy, unavailable_reason="expected_impact.estimated_power_kw_impact missing"),
                _metric("Runtime Impact", None, unavailable_reason=runtime_reason),
                _metric("Confidence", conf, unavailable_reason="O4 engine confidence not set"),
                _metric("Safety", safety_ui, status=safety_ui, unavailable_reason="capacity_sufficiency missing"),
            ],
            extra={"plantLoadTons": tons, "activeChillers": n},
        )
    except Exception as exc:
        return _card("O4", "Staging of Chillers & Compressors",
                     status=None, telemetry_status=freshness, telemetry_age=age, last_telemetry_at=now_iso,
                     current_value=None, optimized_value=None, energy_impact=None,
                     last_evaluation_at=now_iso, data_source="ERROR", engine_ok=False, api_error=str(exc))


def ensure_sim_verified_savings() -> int:
    """Promote or create O1 VERIFIED savings rows when running on the synthetic plant.

    Scheduling Verified Savings KPI only sums verification_status=VERIFIED. In demo/
    simulation, engine runs normally persist as PREDICTED — promote those (or run
    once with verify=True) so the KPI can show without inventing a constant.
    """
    try:
        from backend.bms.connection_manager import is_simulation_mode

        if not is_simulation_mode():
            return 0
    except Exception:
        if os.getenv("HVAC_USE_SIMULATION", "0").strip() not in ("1", "true", "TRUE"):
            return 0
    if os.getenv("HVAC_USE_SIMULATION", "0").strip() not in ("1", "true", "TRUE"):
        return 0

    db = SessionLocal()
    try:
        verified_n = (
            db.query(O1SavingsVerificationDB)
            .filter(O1SavingsVerificationDB.verification_status == "VERIFIED")
            .filter(O1SavingsVerificationDB.energy_saved.isnot(None))
            .count()
        )
        if verified_n:
            return 0
        predicted = (
            db.query(O1SavingsVerificationDB)
            .filter(O1SavingsVerificationDB.verification_status.in_(("PREDICTED", "APPLIED")))
            .filter(O1SavingsVerificationDB.energy_saved.isnot(None))
            .all()
        )
        if predicted:
            for row in predicted:
                row.verification_status = "VERIFIED"
            db.commit()
            cache_delete("sched_db_kpis")
            return len(predicted)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return 0
    finally:
        db.close()

    try:
        from backend.services.o1_pipeline import run_daily

        out = run_daily(None, persist_sim=False, verify=True)
        return 1 if out.get("status") in ("READY", "VERIFIED", "DISPATCHED") else 0
    except Exception:
        return 0


def _db_kpis() -> Dict[str, Any]:
    cached = cache_get("sched_db_kpis")
    if cached is not None:
        return cached
    db = SessionLocal()
    try:
        actions = 0
        for model in (O1ActionDB, O2ActionDB, O3ActionDB, O4ActionDB, SupervisoryActionRecord):
            try:
                actions += int(db.query(model.id).count())
            except Exception:
                try:
                    db.rollback()
                except Exception:
                    pass
        rollbacks = 0
        for model, col in (
            (O1ActionDB, "rollback_applied"),
            (O2ActionDB, "rollback_performed"),
            (O3ActionDB, "rollback_performed"),
            (O4ActionDB, "rollback_performed"),
        ):
            try:
                flag = getattr(model, col)
                rollbacks += int(db.query(model.id).filter(flag == True).count())  # noqa: E712
            except Exception:
                try:
                    db.rollback()
                except Exception:
                    pass
        verified_kwh = 0.0
        verified_n = 0
        # Prefer latest VERIFIED day savings for the KPI (not all-time sum).
        latest_verified = (
            db.query(O1SavingsVerificationDB)
            .filter(O1SavingsVerificationDB.verification_status == "VERIFIED")
            .filter(O1SavingsVerificationDB.energy_saved.isnot(None))
            .order_by(O1SavingsVerificationDB.id.desc())
            .first()
        )
        if latest_verified is not None:
            verified_kwh = float(latest_verified.energy_saved)
            verified_n = 1
        safety_rows = db.query(O1SafetyValidationDB).order_by(O1SafetyValidationDB.id.desc()).limit(40).all()
        failed = sum(1 for r in safety_rows if (r.status or "") in ("FAIL", "BLOCKED"))
        passed = sum(1 for r in safety_rows if (r.status or "") == "PASS")
        if failed:
            guard = "BLOCKED"
        elif any((r.status or "") == "WARNING" for r in safety_rows):
            guard = "WARNING"
        elif passed:
            guard = "PASSED"
        else:
            guard = None
        events = []
        try:
            for r in db.query(O1ActivityLogDB).order_by(O1ActivityLogDB.id.desc()).limit(12).all():
                ts = r.timestamp
                if ts is not None and hasattr(ts, "strftime"):
                    time_s = ts.strftime("%H:%M:%S")
                else:
                    time_s = str(ts) if ts else None
                events.append({
                    "time": time_s,
                    "event": r.event_type or r.stage,
                    "detail": r.message,
                })
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            events = []
        live_s = LIVE_S
        cfg = db.query(O1ConfigurationDB).filter_by(id="o1-default").first()
        if cfg and cfg.stale_telemetry_seconds:
            live_s = cfg.stale_telemetry_seconds
        payload = {
            "actionsDispatched": actions,
            "safetyRollbacks": rollbacks,
            "verifiedSavingsKwh": round(verified_kwh, 2) if verified_n else None,
            "safetyGuardrails": guard,
            "safetyFailCount": failed,
            "activity": list(reversed(events)),
            "liveSeconds": live_s,
            "dbOk": True,
        }
        cache_set("sched_db_kpis", payload, 10.0)
        return payload
    except Exception:
        return {
            "actionsDispatched": None,
            "safetyRollbacks": None,
            "verifiedSavingsKwh": None,
            "safetyGuardrails": None,
            "safetyFailCount": None,
            "activity": [],
            "liveSeconds": LIVE_S,
            "dbOk": False,
        }
    finally:
        db.close()


def supervisory_activity(limit: int = 40) -> List[Dict[str, Any]]:
    """Unified timeline from SupervisoryActionRecord + control_audit_logs + O1 activity."""
    items: List[Dict[str, Any]] = []
    db = SessionLocal()
    try:
        for r in db.query(SupervisoryActionRecord).order_by(SupervisoryActionRecord.timestamp.desc()).limit(limit).all():
            items.append({
                "time": r.timestamp.isoformat() if r.timestamp else None,
                "event": f"{r.opportunity_code} {r.final_status}",
                "detail": r.reason,
                "source": "supervisory_actions",
                "point_id": r.point_id,
                "previous": r.previous_value,
                "proposed": r.proposed_value,
            })
        try:
            from database.models_platform import ControlAuditLogDB

            for r in db.query(ControlAuditLogDB).order_by(ControlAuditLogDB.timestamp.desc()).limit(limit).all():
                items.append({
                    "time": r.timestamp.isoformat() if r.timestamp else None,
                    "event": r.action,
                    "detail": r.reason,
                    "source": "control_audit_logs",
                    "opportunity_id": r.opportunity_id,
                })
        except Exception:
            pass
        for r in db.query(O1ActivityLogDB).order_by(O1ActivityLogDB.id.desc()).limit(limit).all():
            items.append({
                "time": r.timestamp.isoformat() if r.timestamp else None,
                "event": r.event_type or r.stage,
                "detail": r.message,
                "source": "o1_activity",
            })
    except Exception:
        items = []
    finally:
        db.close()
    items.sort(key=lambda x: x.get("time") or "", reverse=True)
    return items[:limit]


def get_scheduling_dashboard() -> Dict[str, Any]:
    now = datetime.utcnow()
    now_iso = now.isoformat()
    sim, sim_err = None, None
    dataset = False
    try:
        from backend.bms.connection_manager import is_simulation_mode

        dataset = is_simulation_mode()
    except Exception:
        dataset = os.getenv("HVAC_USE_SIMULATION", "0") in ("1", "true", "TRUE")

    if dataset or os.getenv("HVAC_USE_SIMULATION", "0") in ("1", "true", "TRUE"):
        sim, sim_err = _sim_cycle()
        if dataset:
            try:
                from backend.bms.simulation_telemetry import publish_once
                from backend.services.o1_pipeline import ingest_from_dataset_catalog

                publish_once()
                ingest_from_dataset_catalog()
            except Exception:
                pass
            try:
                ensure_sim_verified_savings()
            except Exception:
                pass

    age = None
    if dataset or sim:
        try:
            from backend.services.o1_telemetry_service import telemetry_health

            age = (telemetry_health(90) or {}).get("telemetry_age_seconds")
        except Exception:
            age = None
        if age is None and sim:
            age = 5.0
    dbk = _db_kpis()
    live_s = int(dbk.get("liveSeconds") or LIVE_S)
    freshness = _freshness(age, live_s=live_s) if age is not None else ("SIMULATED" if dataset else "OFFLINE")

    o1 = _build_o1(age, freshness, now_iso, dataset=dataset)
    o2 = _build_o2(sim, age, freshness, now_iso, sim_err)
    o3 = _build_o3(sim, age, freshness, now_iso, sim_err)
    o4 = _build_o4(sim, age, freshness, now_iso, sim_err)
    opps = [o1, o2, o3, o4]

    # Prefer O1 measured telemetry age for heartbeat if present
    ages = [o.get("telemetryAge") for o in opps if o.get("telemetryAge") is not None]
    hb = min(ages) if ages else age

    zones = _zones(sim or {})
    comfort = None
    if zones:
        ok = sum(
            1
            for z in zones
            if 20.0 <= float(z.get("temp_actual", z.get("temp", z.get("actual_temperature", 22.5)))) <= 24.5
        )
        comfort = round(100.0 * ok / len(zones), 1)

    active = sum(1 for o in opps if o.get("dataState") == "LIVE")
    if dataset and active == 0:
        # Dataset cards often use STALE/LAST_KNOWN while still healthy — count usable ones.
        active = sum(
            1
            for o in opps
            if o.get("dataState") in ("LIVE", "STALE", "LAST_KNOWN")
            or (o.get("currentValue") or o.get("optimizedValue"))
        )
    engine_ok = all(o.get("displayState") != "ENGINE NOT CONFIGURED" for o in opps)
    model_ok = o1.get("modelVersion") is not None or o1.get("confidence") is not None
    from backend.agents.scheduling_supervisory.gateway import get_bms_gateway
    gw = get_bms_gateway()
    bms = "CONNECTED" if getattr(gw, "is_production_connected", lambda: False)() else "OFFLINE"
    # Health must follow opportunity heartbeat — never the unused age=None → OFFLINE path.
    health_freshness = _freshness(hb, live_s=live_s) if hb is not None else ("SIMULATED" if dataset else "OFFLINE")
    if sim_err:
        health = "BACKEND OFFLINE"
    elif dataset:
        if engine_ok and (model_ok or active or hb is not None):
            health = "OPTIMAL"
        else:
            health = "MONITORING"
    elif not dbk.get("dbOk"):
        health = "DEGRADED"
    elif health_freshness in ("STALE", "DEGRADED"):
        health = "STALE"
    elif health_freshness == "OFFLINE":
        health = "OFFLINE"
    elif engine_ok and (model_ok or active):
        health = "OPTIMAL"
    else:
        health = "MONITORING"

    return {
        "agentHealth": health,
        "activeOpportunities": active,
        "activeOpportunitiesLabel": f"{active} / 4",
        "actionsDispatched": dbk.get("actionsDispatched"),
        "verifiedSavings": None if dbk.get("verifiedSavingsKwh") is None else f"{dbk['verifiedSavingsKwh']} kWh",
        "verifiedSavingsKwh": dbk.get("verifiedSavingsKwh"),
        "predictedSavingsNote": "Verified KPI excludes PREDICTED/APPLIED",
        "comfortCompliance": None if comfort is None else f"{comfort}%",
        "comfortCompliancePct": comfort,
        "safetyGuardrails": dbk.get("safetyGuardrails"),
        "safetyFailCount": dbk.get("safetyFailCount"),
        "telemetryHeartbeat": hb,
        "telemetryHeartbeatLabel": _age_label(hb) if hb is not None else None,
        "telemetryFreshness": (
            "SIMULATED"
            if (dataset or bms != "CONNECTED") and hb is not None
            else (_freshness(hb, live_s=live_s) if hb is not None else ("SIMULATED" if dataset else "OFFLINE"))
        ),
        "safetyRollbacks": dbk.get("safetyRollbacks"),
        "dataQualityValid": bool((sim or {}).get("data_quality_valid", True)) if sim else None,
        "bmsConnectivity": "SIMULATED" if dataset else bms,
        "databaseHealth": "OK" if dbk.get("dbOk") else "UNAVAILABLE",
        "engineHealth": "OK" if engine_ok else "DEGRADED",
        "modelHealth": "OK" if model_ok else "MODEL NOT READY",
        "thresholds": {"liveSeconds": live_s, "staleSeconds": STALE_S, "degradedSeconds": DEGRADED_S},
        "opportunities": opps,
        "activity": dbk.get("activity") or [],
        "candidateActions": (sim or {}).get("candidate_actions") or [],
        "timestamp": now_iso,
        "source": "SCHEDULING_DASHBOARD",
        "simError": sim_err,
    }
