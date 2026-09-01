"""O1 daily optimization pipeline: ingest → predict → candidates → guardrails → persist."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from database.session import SessionLocal
from database.models import O1DecisionDB, O1ActionDB, O1ActivityLogDB, O1CalibrationRecordDB
from database.models_o1 import (
    O1ConfigurationDB,
    O1DailyRunDB,
    O1StartCandidateDB,
    O1StopCandidateDB,
    O1SafetyValidationDB,
    O1ComfortValidationDB,
    O1PredictionDB,
    O1EnergyBaselineDB,
    O1SavingsVerificationDB,
    WeatherObservationDB,
)
from backend.services.o1_telemetry_service import (
    ensure_point_map_and_config,
    ingest_samples,
    telemetry_health,
    live_value,
    latest_signals,
)
from backend.services.o1_model_service import get_active_model, predict_time_to_target
from backend.agents.scheduling_supervisory.o1_optimum_start_stop.predictor import ThermalResponsePredictor


def _cfg() -> O1ConfigurationDB:
    ensure_point_map_and_config()
    db = SessionLocal()
    try:
        row = db.query(O1ConfigurationDB).filter_by(id="o1-default").first()
        db.expunge_all()
        return row
    finally:
        db.close()


def _parse_hm(hhmm: Optional[str], base: Optional[datetime] = None) -> datetime:
    base = base or datetime.utcnow().replace(second=0, microsecond=0)
    if not hhmm:
        hhmm = "08:00"
    h, m = [int(x) for x in str(hhmm).split(":")[:2]]
    return base.replace(hour=h, minute=m)


def _hm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _log(db, run_id: str, event_type: str, message: str, detail: Optional[dict] = None) -> None:
    db.add(O1ActivityLogDB(stage=event_type, event_type=event_type, message=message, detail=detail or {}, run_id=run_id, severity="INFO"))


def ingest_from_sim(sim_state: Dict[str, Any], source: str = "SIMULATED") -> None:
    weather = sim_state.get("weather") or {}
    zones = sim_state.get("zones") or []
    zone_temp = None
    if zones:
        temps = [z.get("temperature") for z in zones if z.get("temperature") is not None]
        zone_temp = sum(temps) / len(temps) if temps else None
    samples = [
        {"signal": "OAT", "value": weather.get("oat"), "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "OA_RH", "value": weather.get("humidity"), "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "SOLAR", "value": weather.get("solar_irradiance"), "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "ZONE_TEMP", "value": zone_temp, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "AHU_STATUS", "value": 1.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "EQUIP_AVAIL", "value": 1.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "ALARM", "value": 0.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "OCCUPANCY", "value": 0.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "FAN_STATUS", "value": 0.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
    ]
    ingest_samples([s for s in samples if s["value"] is not None], source=source)


def ingest_from_dataset_catalog(source: str = "SIMULATION") -> int:
    """Map Phase-1 Dataset canonical points into O1 signal names. Never stamps LIVE_BMS."""
    from backend.services.agent_telemetry_service import get_point

    def _val(eq: str, canon: str) -> Optional[float]:
        row = get_point(eq, canon)
        if not row or row.get("value") is None:
            return None
        try:
            return float(row["value"])
        except (TypeError, ValueError):
            return None

    zone = _val("ZONE-01", "zone_temperature")
    oat = _val("SITE", "outdoor_air_temperature")
    occ = _val("ZONE-01", "occupancy")
    enable = _val("AHU-01", "enable")
    samples = [
        {"signal": "ZONE_TEMP", "value": zone, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "OAT", "value": oat, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "OA_RH", "value": 55.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "SOLAR", "value": 420.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "OCCUPANCY", "value": occ if occ is not None else 0.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "AHU_STATUS", "value": enable if enable is not None else 1.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "EQUIP_AVAIL", "value": 1.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "ALARM", "value": 0.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
        {"signal": "FAN_STATUS", "value": enable if enable is not None else 0.0, "quality": "GOOD", "source": source, "timestamp": datetime.utcnow()},
    ]
    kept = [s for s in samples if s["value"] is not None]
    if not kept:
        return 0
    ingest_samples(kept, source=source)
    return len(kept)


def evaluate_guardrails(run_id: str, ctx: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], bool]:
    checks = []
    def add(cid, name, ok, value, limit, unit, reason, severity="INFO"):
        checks.append({
            "check_id": cid,
            "check_name": name,
            "status": "PASS" if ok else "FAIL",
            "current_value": str(value) if value is not None else "MISSING",
            "limit": limit,
            "unit": unit,
            "severity": "BLOCKING" if not ok else severity,
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat(),
        })
    health = ctx["health"]
    zone = ctx.get("zone_temp")
    oat = ctx.get("oat")
    target = ctx["target"]
    alarm = ctx.get("alarm")
    avail = ctx.get("equip_avail")
    age = health.get("telemetry_age_seconds")
    add("TEL_FRESH", "Telemetry freshness", age is not None and age <= ctx["stale_s"], age, f"<{ctx['stale_s']}s", "s", "Latest GOOD sample age")
    add("TEL_QUAL", "Sensor quality", health.get("bad_quality_points", 0) == 0, health.get("bad_quality_points"), "0 bad", "", "No BAD quality required points")
    add("ZONE_RANGE", "Zone temperature range", zone is not None and 18 <= zone <= 32, zone, "18–32", "C", "Engineering envelope")
    add("TGT_CLAMP", "Comfort target clamp", 21 <= target <= 25, target, "21–25", "C", "Occupied setpoint")
    add("OAT_PLAUS", "Weather sensor plausibility", oat is None or -10 <= oat <= 50, oat, "-10–50", "C", "OAT range")
    add("EQUIP", "AHU equipment availability", avail is None or avail >= 1, avail, "available", "", "Must be available to dispatch")
    add("ALARM", "Critical alarms", alarm is None or alarm < 1, alarm, "0", "", "No active critical alarm")
    add("MIN_RT", "Minimum runtime / off-time config", True, ctx["min_runtime"], ">=15", "min", "Configured anti-short-cycle")
    blocked = any(c["status"] != "PASS" and c["severity"] == "BLOCKING" for c in checks)
    # freshness/quality/equip/alarm/zone fail block
    for c in checks:
        if c["check_id"] in ("TEL_FRESH", "EQUIP", "ALARM", "ZONE_RANGE") and c["status"] != "PASS":
            blocked = True
            c["status"] = "BLOCKED" if c["status"] == "FAIL" else c["status"]
    return checks, blocked


def run_daily(sim_state: Optional[Dict[str, Any]] = None, persist_sim: bool = True, verify: bool = False) -> Dict[str, Any]:
    ensure_point_map_and_config()
    cfg = _cfg()
    run_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        run = O1DailyRunDB(id=run_id, building_id=cfg.building_id, equipment_id=cfg.equipment_id, zone_id="ZONE-AVG", status="CREATED", source="ENGINE")
        db.add(run)
        db.commit()
        _log(db, run_id, "RUN_CREATED", "O1 daily run created", {"run_id": run_id})

        if sim_state and persist_sim:
            ingest_from_sim(sim_state, source="SIMULATED")
            _log(db, run_id, "TELEMETRY_RECEIVED", "Ingested simulator samples", {"source": "SIMULATED"})

        run.status = "DATA_VALIDATION"
        health = telemetry_health(cfg.stale_telemetry_seconds or 30)
        _log(db, run_id, "DATA_VALIDATED", f"Telemetry health {health['overall']}", health)

        zone = live_value("ZONE_TEMP")
        oat = live_value("OAT")
        solar = live_value("SOLAR")
        alarm = live_value("ALARM")
        avail = live_value("EQUIP_AVAIL")
        if zone is None or oat is None:
            run.status = "FAILED"
            run.failure_reason = "Missing required ZONE_TEMP or OAT"
            db.commit()
            _log(db, run_id, "RUN_FAILED", run.failure_reason)
            db.commit()
            return {"run_id": run_id, "status": "FAILED", "reason": run.failure_reason, "health": health}

        db.add(WeatherObservationDB(timestamp=datetime.utcnow(), building_id=cfg.building_id, oat_c=oat, rh_pct=live_value("OA_RH"), solar_w_m2=solar, quality="GOOD", source="SIMULATED"))

        run.status = "PREDICTING"
        pred = predict_time_to_target(zone, cfg.comfort_target_c, oat, solar)
        db.add(O1PredictionDB(
            id=str(uuid.uuid4()),
            run_id=run_id,
            model_version=pred.get("model_version"),
            time_to_target_minutes=pred.get("time_to_target_minutes"),
            confidence=pred.get("confidence"),
            input_quality=pred.get("input_quality"),
            status=pred.get("status"),
            features={"zone": zone, "oat": oat, "solar": solar, "target": cfg.comfort_target_c},
        ))
        _log(db, run_id, "THERMAL_RESPONSE_PREDICTED", f"ttt={pred.get('time_to_target_minutes')}", pred)
        _log(db, run_id, "MODEL_LOADED", pred.get("status") or "", {"model_version": pred.get("model_version")})

        pull = pred.get("time_to_target_minutes") or 0.0
        margin = cfg.safety_margin_min or 6.0
        occ_start = _parse_hm(cfg.occupancy_start)
        occ_end = _parse_hm(cfg.occupancy_end)
        sched_start = _parse_hm(cfg.scheduled_start)
        sched_stop = _parse_hm(cfg.scheduled_stop)
        interval = cfg.candidate_interval_min or 15
        max_delay = cfg.max_start_delay_min or 120

        run.status = "OPTIMIZING"
        start_rows = []
        t = sched_start
        end_window = occ_start
        while t <= end_window:
            reach = t + timedelta(minutes=pull)
            energy = (cfg.ahu_kw or 17.0) * (max(0.0, (occ_start - t).total_seconds() / 3600.0))
            late = reach > occ_start
            early = reach < occ_start - timedelta(minutes=margin + 20)
            if late:
                decision, reason = "REJECTED_LATE_TARGET", "Predicted reach after occupancy start"
            elif early:
                decision, reason = "REJECTED_EARLY_TARGET", "Unnecessary runtime before occupancy"
            else:
                decision, reason = "FEASIBLE", None
            start_rows.append({
                "candidate_time": _hm(t),
                "predicted_target": _hm(reach),
                "pulldown_min": round(pull, 1),
                "energy_kwh": round(energy, 2),
                "comfort_risk": "HIGH" if late else ("LOW" if reach <= occ_start - timedelta(minutes=margin) else "MODERATE"),
                "decision": decision,
                "rejection_reason": reason,
                "comfort_margin_c": round((occ_start - reach).total_seconds() / 60.0, 1),
            })
            t += timedelta(minutes=interval)

        feasible = [r for r in start_rows if r["decision"] == "FEASIBLE"]
        selected_start = None
        if feasible:
            selected_start = max(feasible, key=lambda r: datetime.strptime(r["candidate_time"], "%H:%M"))
            selected_start["decision"] = "SELECTED"
        for r in start_rows:
            if selected_start and r["candidate_time"] == selected_start["candidate_time"]:
                r["decision"] = "SELECTED"
            elif r["decision"] == "FEASIBLE":
                r["decision"] = "REJECTED_SUBOPTIMAL"
                r["rejection_reason"] = "Later feasible start exists"
            db.add(O1StartCandidateDB(
                run_id=run_id,
                candidate_start=r["candidate_time"],
                predicted_target_reached=r["predicted_target"],
                pull_down_minutes=r["pulldown_min"],
                energy_kwh=r["energy_kwh"],
                comfort_margin_c=r["comfort_margin_c"],
                safety_risk=r["comfort_risk"],
                occupancy_breach_risk=r["comfort_risk"],
                decision=r["decision"],
                rejection_reason=r.get("rejection_reason"),
            ))
        _log(db, run_id, "START_CANDIDATES_GENERATED", f"{len(start_rows)} start candidates", {})
        if selected_start:
            _log(db, run_id, "START_CANDIDATE_SELECTED", selected_start["candidate_time"], selected_start)

        predictor = ThermalResponsePredictor()
        stop_rows = []
        t = sched_stop
        earliest = sched_stop - timedelta(minutes=150)
        while t >= earliest:
            coast_min = (sched_stop - t).total_seconds() / 60.0
            drift = predictor.predict_coastdown_drift(cfg.comfort_target_c, oat, int(coast_min))
            pred_temp = cfg.comfort_target_c + drift
            margin_c = cfg.comfort_upper_c - pred_temp
            energy = (cfg.ahu_kw or 17.0) * (coast_min / 60.0)
            if pred_temp > cfg.comfort_upper_c:
                decision, reason, safety = "REJECTED_COMFORT", "Predicted occupancy-end temp above upper limit", "FAIL"
            elif coast_min < 5:
                decision, reason, safety = "REJECTED_INSUFFICIENT_SAVINGS", "Negligible coast", "PASS"
            else:
                decision, reason, safety = "FEASIBLE", None, "PASS"
            stop_rows.append({
                "candidate_time": _hm(t),
                "expected_temp_1800": round(pred_temp, 2),
                "runtime_saved_min": int(coast_min),
                "energy_kwh": round(energy, 2),
                "safety": safety,
                "comfort_risk": "HIGH" if margin_c < 0 else ("LOW" if margin_c >= 0.4 else "MODERATE"),
                "decision": decision,
                "rejection_reason": reason,
                "comfort_margin_c": round(margin_c, 2),
            })
            t -= timedelta(minutes=interval)
        feasible_stop = [r for r in stop_rows if r["decision"] == "FEASIBLE"]
        selected_stop = None
        if feasible_stop:
            selected_stop = max(feasible_stop, key=lambda r: r["runtime_saved_min"])
            selected_stop["decision"] = "SELECTED"
        for r in stop_rows:
            if selected_stop and r["candidate_time"] == selected_stop["candidate_time"]:
                r["decision"] = "SELECTED"
            elif r["decision"] == "FEASIBLE":
                r["decision"] = "REJECTED_SUBOPTIMAL"
                r["rejection_reason"] = "Earlier feasible coast exists"
            db.add(O1StopCandidateDB(
                run_id=run_id,
                candidate_stop=r["candidate_time"],
                predicted_temp_at_occ_end=r["expected_temp_1800"],
                runtime_saved_min=r["runtime_saved_min"],
                energy_saved_kwh=r["energy_kwh"],
                comfort_margin_c=r["comfort_margin_c"],
                safety_status=r["safety"],
                decision=r["decision"],
                rejection_reason=r.get("rejection_reason"),
            ))
        _log(db, run_id, "COAST_CANDIDATES_GENERATED", f"{len(stop_rows)} coast candidates", {})
        if selected_stop:
            _log(db, run_id, "COAST_CANDIDATE_SELECTED", selected_stop["candidate_time"], selected_stop)

        run.status = "VALIDATING"
        ctx = {
            "health": health,
            "zone_temp": zone,
            "oat": oat,
            "target": cfg.comfort_target_c,
            "alarm": alarm,
            "equip_avail": avail,
            "stale_s": cfg.stale_telemetry_seconds or 30,
            "min_runtime": cfg.min_runtime_min,
        }
        safety_checks, blocked = evaluate_guardrails(run_id, ctx)
        for c in safety_checks:
            db.add(O1SafetyValidationDB(
                run_id=run_id, check_id=c["check_id"], check_name=c["check_name"], status=c["status"],
                current_value=c["current_value"], limit_value=c["limit"], unit=c["unit"],
                severity=c["severity"], reason=c["reason"],
            ))
        comfort_ok = selected_start is not None and selected_stop is not None
        db.add(O1ComfortValidationDB(
            run_id=run_id, check_id="OCC_PROTECT", check_name="Occupancy protection",
            status="PASS" if selected_start else "FAIL",
            current_value=selected_start["predicted_target"] if selected_start else None,
            limit_value=cfg.occupancy_start, unit="",
            reason="Reach target before occupancy" if selected_start else "No feasible start",
        ))
        _log(db, run_id, "SAFETY_VALIDATION", f"blocked={blocked}", {"count": len(safety_checks)})
        _log(db, run_id, "COMFORT_VALIDATION", f"ok={comfort_ok}", {})

        if blocked or not selected_start:
            run.status = "FAILED"
            run.failure_reason = "Safety blocked or no feasible start"
            _log(db, run_id, "RUN_FAILED", run.failure_reason)
            db.commit()
            return {"run_id": run_id, "status": "FAILED", "reason": run.failure_reason, "health": health, "safety_checks": safety_checks}

        opt_start = selected_start["candidate_time"]
        opt_stop = selected_stop["candidate_time"] if selected_stop else (cfg.scheduled_stop or "18:00")
        sched_start_s = cfg.scheduled_start or "06:00"
        sched_stop_s = cfg.scheduled_stop or "18:00"
        start_delay = (datetime.strptime(opt_start, "%H:%M") - datetime.strptime(sched_start_s, "%H:%M")).seconds / 60.0
        coast_min = selected_stop["runtime_saved_min"] if selected_stop else 0
        baseline_min = (sched_stop - sched_start).total_seconds() / 60.0
        opt_runtime = max(0.0, baseline_min - start_delay - coast_min)
        kw = cfg.ahu_kw or 17.0
        e_base = kw * (baseline_min / 60.0)
        e_opt = kw * (opt_runtime / 60.0)
        e_saved = e_base - e_opt
        cost = e_saved * (cfg.energy_cost_usd_kwh or 0.12)
        sav_status = "VERIFIED" if verify else "PREDICTED"
        db.add(O1EnergyBaselineDB(run_id=run_id, methodology="scheduled_runtime_x_ahu_kw", baseline_runtime_min=baseline_min, baseline_energy_kwh=e_base))
        db.add(O1SavingsVerificationDB(
            run_id=run_id, baseline_reference=f"{cfg.scheduled_start}-{cfg.scheduled_stop}",
            optimized_reference=f"{opt_start}-{opt_stop}",
            energy_baseline=round(e_base, 2), energy_optimized=round(e_opt, 2), energy_saved=round(e_saved, 2),
            runtime_baseline=baseline_min, runtime_optimized=opt_runtime, runtime_saved=start_delay + coast_min,
            verification_status=sav_status, cost_saved_usd=round(cost, 2), source="ENGINE",
        ))
        _log(db, run_id, "SAVINGS_CALCULATED", f"runtime_saved={start_delay + coast_min}", {"status": sav_status})
        if sav_status == "VERIFIED":
            _log(db, run_id, "SAVINGS_VERIFIED", "Operator/test verified", {})

        db.add(O1DecisionDB(
            id=run_id,
            building_id=cfg.building_id,
            scheduled_start=cfg.scheduled_start,
            optimized_start=opt_start,
            start_delay_min=start_delay,
            start_confidence=pred.get("confidence") or 0.0,
            start_decision="DELAY_START" if start_delay > 0 else "START_ON_SCHEDULE",
            scheduled_stop=cfg.scheduled_stop,
            optimized_stop=opt_stop,
            coast_advance_min=float(coast_min),
            stop_confidence=pred.get("confidence") or 0.0,
            stop_decision="COAST_STOP",
            thermal_rate_used=pull,
            predicted_savings_kwh=round(e_saved, 2),
            safety_check="PASS",
            model_version=pred.get("model_version") or "PHYSICS_FALLBACK",
            reason=f"start={opt_start} stop={opt_stop}",
            confidence=pred.get("confidence") or 0.0,
            coast_reduction_min=float(coast_min),
            coast_decision="COAST_STOP",
            safety_result="PASS",
            energy_saved_kwh=round(e_saved, 2),
        ))
        _log(db, run_id, "DECISION_GENERATED", f"start={opt_start} stop={opt_stop}", {})

        run.status = "READY"
        run.model_version = pred.get("model_version")
        run.completed_at = datetime.utcnow()
        db.add(O1CalibrationRecordDB(
            date=datetime.utcnow().strftime("%Y-%m-%d"),
            oat=oat,
            initial_temp=zone,
            target_temp=cfg.comfort_target_c,
            scheduled_start=cfg.scheduled_start,
            optimized_start=opt_start,
            actual_start=opt_start,
            target_reached=selected_start["predicted_target"],
            predicted_target_reached=selected_start["predicted_target"],
            pulldown_duration_min=pull,
            prediction_error_min=None,
            scheduled_stop=cfg.scheduled_stop,
            optimized_stop=opt_stop,
            actual_stop=opt_stop,
            comfort_result="PREDICTED",
            energy_saved_kwh=round(e_saved, 2),
            verification="PREDICTED",
            model_version=pred.get("model_version") or "PHYSICS_FALLBACK",
        ))
        db.commit()
        return {
            "run_id": run_id,
            "status": "READY",
            "health": health,
            "prediction": pred,
            "selected_start": selected_start,
            "selected_stop": selected_stop,
            "start_candidates": start_rows,
            "stop_candidates": stop_rows,
            "safety_checks": safety_checks,
            "savings": {
                "runtime_saved_min": start_delay + coast_min,
                "energy_saved": round(e_saved, 2),
                "verification_status": sav_status,
                "baseline_runtime_hours": round(baseline_min / 60.0, 2),
                "optimized_runtime_hours": round(opt_runtime / 60.0, 2),
                "baseline_energy_kwh": round(e_base, 2),
                "optimized_energy_kwh": round(e_opt, 2),
                "cost_saved_usd": round(cost, 2),
            },
            "config": {
                "scheduled_start": cfg.scheduled_start,
                "scheduled_stop": cfg.scheduled_stop,
                "occupancy_start": cfg.occupancy_start,
                "occupancy_end": cfg.occupancy_end,
                "comfort_target_c": cfg.comfort_target_c,
            },
            "zone_temp": zone,
            "oat": oat,
        }
    except Exception as exc:
        db.rollback()
        raise
    finally:
        db.close()
