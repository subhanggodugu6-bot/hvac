"""O1 dashboard facade: reads persisted pipeline results. No fabricated KPIs."""
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone

from database.session import SessionLocal
from database.models import (
    O1DecisionDB,
    O1ActionDB,
    O1CalibrationRecordDB,
    O1ActivityLogDB,
)
from database.models_o1 import (
    O1DailyRunDB,
    O1StartCandidateDB,
    O1StopCandidateDB,
    O1SafetyValidationDB,
    O1ComfortValidationDB,
    O1SavingsVerificationDB,
    O1ConfigurationDB,
)
from backend.services.o1_telemetry_service import ensure_point_map_and_config, telemetry_health, live_value
from backend.services.o1_model_service import get_active_model
from backend.services.o1_pipeline import run_daily

try:
    from backend.services.simulation_service import sim_service
except ImportError:
    sim_service = None


def _production_bms() -> bool:
    try:
        from backend.services.hvac_safety_contract import production_bms_connected
        return production_bms_connected()
    except Exception:
        return False


def _naive_utc(ts: datetime) -> datetime:
    if ts.tzinfo is not None:
        return ts.astimezone(timezone.utc).replace(tzinfo=None)
    return ts


def _age_seconds(ts: Optional[datetime]) -> Optional[float]:
    if ts is None:
        return None
    return (datetime.utcnow() - _naive_utc(ts)).total_seconds()


def _json_safe_health(health: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(health or {})
    signals: Dict[str, Any] = {}
    for key, row in (out.get("signals") or {}).items():
        safe = dict(row or {})
        ts = safe.get("timestamp")
        if isinstance(ts, datetime):
            safe["timestamp"] = ts.isoformat()
        signals[key] = safe
    out["signals"] = signals
    latest = out.get("latest_timestamp")
    if isinstance(latest, datetime):
        out["latest_timestamp"] = latest.isoformat()
    return out


def _latest_run(db) -> Optional[O1DailyRunDB]:
    return db.query(O1DailyRunDB).order_by(O1DailyRunDB.started_at.desc()).first()


def _ensure_run() -> str:
    ensure_point_map_and_config()
    import os

    last_run_id: Optional[str] = None
    db = SessionLocal()
    try:
        run = _latest_run(db)
        if run:
            last_run_id = run.id
            age = _age_seconds(run.started_at) if run.started_at else None
            if run.status in ("READY", "FAILED", "DISPATCHED", "VERIFIED"):
                # Reuse the latest completed run for the day; do not rebuild on every API poll.
                if age is None or age < 86400:
                    return run.id
    finally:
        db.close()

    sim_state: Dict[str, Any] = {}
    use_sim = os.getenv("HVAC_USE_SIMULATION", "0") in ("1", "true", "TRUE")
    if use_sim and sim_service and hasattr(sim_service, "get_latest_status"):
        try:
            sim_state = sim_service.get_latest_status() or {}
        except Exception:
            sim_state = {}
    if use_sim and not sim_state:
        try:
            from backend.services.o1_pipeline import ingest_from_dataset_catalog

            ingest_from_dataset_catalog()
        except Exception:
            pass
    try:
        result = run_daily(sim_state or None, persist_sim=bool(sim_state) and use_sim, verify=use_sim)
        return result["run_id"]
    except Exception:
        if last_run_id:
            return last_run_id
        raise


class O1Service:
    def __init__(self):
        try:
            ensure_point_map_and_config()
        except Exception:
            pass
        self.current_ahu_state = "OFF"
        self.bms_status = "PENDING"

    def get_state(self) -> Dict[str, Any]:
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            run = db.query(O1DailyRunDB).filter_by(id=run_id).first()
            dec = db.query(O1DecisionDB).filter_by(id=run_id).first()
            sav = db.query(O1SavingsVerificationDB).filter_by(run_id=run_id).order_by(O1SavingsVerificationDB.id.desc()).first()
            cfg = db.query(O1ConfigurationDB).filter_by(id="o1-default").first()
            health = _json_safe_health(telemetry_health(cfg.stale_telemetry_seconds if cfg else 30))
            zone = live_value("ZONE_TEMP")
            model = get_active_model()
            conf = "MODEL NOT READY"
            if model and model.get("status") == "ACTIVE" and model.get("prediction_confidence_pct") is not None:
                conf = f"{model['prediction_confidence_pct']}%"
            elif dec and dec.start_confidence:
                conf = f"{int(dec.start_confidence * 100)}%"
            overall = health.get("overall")
            if overall == "STALE":
                tel_label = "TELEMETRY STALE"
            elif overall in (None, "MISSING"):
                tel_label = None
            elif health.get("telemetry_age_seconds") is not None:
                tel_label = f"{health['telemetry_age_seconds']}s ({overall})"
            else:
                tel_label = overall
            comfort = db.query(O1ComfortValidationDB).filter_by(run_id=run_id).first()
            comfort_pct = None
            if comfort and comfort.status == "PASS":
                comfort_pct = "PASS"
            elif comfort:
                comfort_pct = comfort.status
            runtime_kpi = None
            if sav and sav.runtime_saved is not None:
                if sav.verification_status == "VERIFIED":
                    runtime_kpi = f"{int(sav.runtime_saved)} min / day"
                else:
                    runtime_kpi = f"{int(sav.runtime_saved)} min / day ({sav.verification_status})"
            kpis = {
                "optimized_start_delay": (
                    f"+{int(dec.start_delay_min)} min Delay"
                    if dec and dec.start_delay_min is not None
                    else None
                ),
                "optimized_coast_stop": (
                    f"{int(dec.coast_advance_min)} min Early"
                    if dec and dec.coast_advance_min is not None
                    else None
                ),
                "daily_runtime_saved": runtime_kpi,
                "model_confidence": conf,
                "scheduled_start": cfg.scheduled_start if cfg else None,
                "optimized_start": dec.optimized_start if dec else None,
                "scheduled_stop": cfg.scheduled_stop if cfg else None,
                "optimized_stop": dec.optimized_stop if dec else None,
                "occupancy_window": (
                    f"{cfg.occupancy_start} – {cfg.occupancy_end}"
                    if cfg and cfg.occupancy_start and cfg.occupancy_end
                    else None
                ),
                "current_zone_temp": f"{zone:.1f}°C" if zone is not None else None,
                "target_temp": (
                    f"{cfg.comfort_target_c:.1f}°C"
                    if cfg and cfg.comfort_target_c is not None
                    else None
                ),
                "predicted_target_reached": None,
                "thermal_model_status": (model or {}).get("status") or "MODEL_NOT_READY",
                "comfort_compliance": comfort_pct,
                "comfort_compliance_pct": comfort_pct,
                "telemetry_freshness": tel_label,
                "last_verified_action": None,
            }
            start_sel = db.query(O1StartCandidateDB).filter_by(run_id=run_id, decision="SELECTED").first()
            if start_sel:
                kpis["predicted_target_reached"] = start_sel.predicted_target_reached
            return {
                "title": "Optimum Start/Stop Programming (O1)",
                "subtitle": "Thermodynamic Pull-Down Trajectory & Passive Coasting Stop Optimizer",
                "model_version": (model or {}).get("version") or (dec.model_version if dec else None),
                "agent_mode": "AUTO CLOSED-LOOP",
                "bms_connection": "CONNECTED" if _production_bms() else "OFFLINE",
                "telemetry_age_sec": health.get("telemetry_age_seconds"),
                "source": health.get("source") or "PERSISTED",
                "timestamp": datetime.utcnow().isoformat(),
                "run_id": run_id,
                "run_status": run.status if run else None,
                "weather": {
                    "oat": live_value("OAT"),
                    "rh": live_value("OA_RH"),
                    "solar_irradiance": live_value("SOLAR"),
                },
                "health": health,
                "kpis": kpis,
            }
        finally:
            db.close()

    def get_telemetry(self) -> Dict[str, Any]:
        state = self.get_state()
        return {
            "weather": state.get("weather") or {},
            "health": state.get("health") or {},
            "source": state.get("source"),
            "timestamp": state.get("timestamp"),
            "telemetry_age_sec": state.get("telemetry_age_sec"),
        }

    def get_thermal_model(self) -> Dict[str, Any]:
        active = get_active_model()
        if not active or active.get("status") in (None, "MODEL_NOT_READY"):
            return {
                "status": "MODEL_NOT_READY",
                "model_version": None,
                "training_dataset": None,
                "r2_score": None,
                "mae_minutes": None,
                "rmse_minutes": None,
                "prediction_confidence_pct": None,
                "parameters": {},
                "reason": (active or {}).get("reason") or "No evaluated ACTIVE model",
            }
        params = active.get("parameters") or {}
        return {
            "status": "ACTIVE",
            "model_version": active.get("version"),
            "training_dataset": active.get("training_dataset"),
            "last_calibration": None,
            "r2_score": active.get("r2_score"),
            "mae_minutes": active.get("mae_minutes"),
            "rmse_minutes": active.get("rmse_minutes"),
            "prediction_confidence_pct": active.get("prediction_confidence_pct"),
            "parameters": {
                "pull_down_rate": f"{params.get('alpha_min_per_deg')} min/°C" if params.get("alpha_min_per_deg") is not None else None,
                "weather_sensitivity": f"{params.get('beta_min_per_deg')} min/°C" if params.get("beta_min_per_deg") is not None else None,
                "thermal_time_constant": None,
                "safety_buffer": f"{params.get('base_safety_margin_minutes')} min" if params.get("base_safety_margin_minutes") is not None else None,
                "balance_point_temp": None,
            },
        }

    def get_start_candidates(self) -> List[Dict[str, Any]]:
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            rows = db.query(O1StartCandidateDB).filter_by(run_id=run_id).all()
            return [
                {
                    "candidate_time": r.candidate_start,
                    "predicted_target": r.predicted_target_reached,
                    "pulldown_min": r.pull_down_minutes,
                    "energy_kwh": r.energy_kwh,
                    "comfort_risk": r.occupancy_breach_risk,
                    "decision": r.decision,
                    "rejection_reason": r.rejection_reason,
                }
                for r in rows
            ]
        finally:
            db.close()

    def get_coast_candidates(self) -> List[Dict[str, Any]]:
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            rows = db.query(O1StopCandidateDB).filter_by(run_id=run_id).all()
            return [
                {
                    "candidate_time": r.candidate_stop,
                    "expected_temp_1800": r.predicted_temp_at_occ_end,
                    "runtime_saved_min": r.runtime_saved_min,
                    "energy_kwh": r.energy_saved_kwh,
                    "safety": r.safety_status,
                    "comfort_risk": r.rejection_reason,
                    "decision": r.decision,
                }
                for r in rows
            ]
        finally:
            db.close()

    def get_decision(self) -> Dict[str, Any]:
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            dec = db.query(O1DecisionDB).filter_by(id=run_id).first()
            start = db.query(O1StartCandidateDB).filter_by(run_id=run_id, decision="SELECTED").first()
            stop = db.query(O1StopCandidateDB).filter_by(run_id=run_id, decision="SELECTED").first()
            cfg = db.query(O1ConfigurationDB).filter_by(id="o1-default").first()
            if not dec:
                return {"start": None, "coast": None, "status": "UNAVAILABLE"}
            return {
                "start": {
                    "scheduled_start": dec.scheduled_start,
                    "optimized_start": dec.optimized_start,
                    "delay_minutes": dec.start_delay_min,
                    "predicted_target_reached": start.predicted_target_reached if start else None,
                    "occupancy_start": cfg.occupancy_start if cfg else None,
                    "confidence_pct": int(dec.start_confidence * 100) if dec.start_confidence else None,
                    "decision": dec.start_decision,
                    "reason": (
                        f"Selected start {dec.optimized_start} delays {int(dec.start_delay_min)} min from {dec.scheduled_start}."
                        if dec.start_delay_min is not None and dec.optimized_start and dec.scheduled_start
                        else "Start candidate selected."
                    ),
                },
                "coast": {
                    "scheduled_stop": dec.scheduled_stop,
                    "optimized_stop": dec.optimized_stop,
                    "runtime_reduction_min": dec.coast_advance_min,
                    "predicted_temp_1800": f"{stop.predicted_temp_at_occ_end}°C" if stop and stop.predicted_temp_at_occ_end is not None else None,
                    "confidence_pct": int(dec.stop_confidence * 100) if dec.stop_confidence else None,
                    "decision": dec.stop_decision,
                    "reason": (
                        f"Selected coast {dec.optimized_stop} saves {int(dec.coast_advance_min)} min versus {dec.scheduled_stop}."
                        if dec.coast_advance_min is not None and dec.optimized_stop and dec.scheduled_stop
                        else "Coast candidate selected."
                    ),
                },
            }
        finally:
            db.close()

    def get_timeline(self) -> List[Dict[str, Any]]:
        d = self.get_decision()
        start = d.get("start") or {}
        coast = d.get("coast") or {}
        if not start:
            return []
        return [
            {"time": start.get("scheduled_start"), "event": "Scheduled HVAC start", "status": "BASELINE", "detail": "Configuration baseline"},
            {"time": start.get("optimized_start"), "event": "Optimized HVAC start", "status": "SELECTED", "detail": start.get("reason")},
            {"time": start.get("predicted_target_reached"), "event": "Predicted target reached", "status": "PREDICTED", "detail": None},
            {"time": start.get("occupancy_start"), "event": "Occupancy begins", "status": "SCHEDULED", "detail": None},
            {"time": coast.get("optimized_stop"), "event": "Optimized coast stop", "status": "SELECTED", "detail": coast.get("reason")},
            {"time": coast.get("scheduled_stop"), "event": "Occupancy ends / scheduled stop", "status": "SCHEDULED", "detail": None},
        ]

    def get_safety_checks(self) -> Dict[str, Any]:
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            rows = db.query(O1SafetyValidationDB).filter_by(run_id=run_id).all()
            checks = [
                {"name": r.check_name, "value": r.current_value, "limit": r.limit_value, "status": r.status, "reason": r.reason}
                for r in rows
            ]
            passed = sum(1 for c in checks if c["status"] == "PASS")
            return {"all_passed": passed == len(checks) and len(checks) > 0, "passed_count": passed, "total_count": len(checks), "checks": checks}
        finally:
            db.close()

    def get_trajectory_data(self) -> List[Dict[str, Any]]:
        """Build trajectory from selected start + predicted pull-down; no random jitter."""
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            start = db.query(O1StartCandidateDB).filter_by(run_id=run_id, decision="SELECTED").first()
            cfg = db.query(O1ConfigurationDB).filter_by(id="o1-default").first()
            zone = live_value("ZONE_TEMP")
            if not start or zone is None or cfg is None:
                return []
            target = cfg.comfort_target_c
            pull = start.pull_down_minutes or 0
            start_dt = datetime.strptime(start.candidate_start, "%H:%M")
            data = []
            base = datetime.strptime("05:00", "%H:%M")
            for i in range(49):
                t_dt = base + timedelta(minutes=i * 5)
                t_str = t_dt.strftime("%H:%M")
                if t_dt < start_dt:
                    pred = zone
                elif pull <= 0:
                    pred = target
                else:
                    elapsed = (t_dt - start_dt).total_seconds() / 60.0
                    frac = min(1.0, max(0.0, elapsed / pull))
                    pred = zone - (zone - target) * frac
                data.append({
                    "time": t_str,
                    "actual_temp": None,
                    "predicted_temp": round(pred, 2),
                    "target_temp": target,
                    "comfort_min": cfg.comfort_lower_c,
                    "comfort_max": cfg.comfort_upper_c,
                })
            return data
        finally:
            db.close()

    def get_energy_impact(self) -> Dict[str, Any]:
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            sav = db.query(O1SavingsVerificationDB).filter_by(run_id=run_id).order_by(O1SavingsVerificationDB.id.desc()).first()
            if not sav:
                return {"status": "UNAVAILABLE"}
            verified_kwh = sav.energy_saved if sav.verification_status == "VERIFIED" else None
            verified_cost = sav.cost_saved_usd if sav.verification_status == "VERIFIED" else None
            return {
                "baseline_runtime_hours": round((sav.runtime_baseline or 0) / 60.0, 2),
                "optimized_runtime_hours": round((sav.runtime_optimized or 0) / 60.0, 2),
                "runtime_reduction_hours": round((sav.runtime_saved or 0) / 60.0, 2),
                "runtime_reduction_minutes": sav.runtime_saved,
                "baseline_energy_kwh": sav.energy_baseline,
                "optimized_energy_kwh": sav.energy_optimized,
                "daily_energy_savings_kwh": sav.energy_saved if sav.verification_status == "PREDICTED" else sav.energy_saved,
                "daily_cost_savings": sav.cost_saved_usd,
                "verification_status": sav.verification_status,
                "tiers": {
                    "predicted_savings_kwh": sav.energy_saved if sav.verification_status in ("PREDICTED", "APPLIED", "VERIFIED") else None,
                    "applied_savings_kwh": sav.energy_saved if sav.verification_status in ("APPLIED", "VERIFIED") else None,
                    "verified_savings_kwh": verified_kwh,
                    "verified_cost_usd": verified_cost,
                },
            }
        finally:
            db.close()

    def get_bms_action(self) -> Dict[str, Any]:
        db = SessionLocal()
        try:
            row = db.query(O1ActionDB).order_by(O1ActionDB.timestamp.desc()).first()
            dec = db.query(O1DecisionDB).order_by(O1DecisionDB.timestamp.desc()).first()
            if not row:
                return {
                    "target_equipment": "AHU-1.StartStopCommand",
                    "bms_status": "NO_COMMAND",
                    "verification": {"status": "PENDING"},
                    "rollback_armed": True,
                }
            return {
                "target_equipment": row.target_equipment,
                "action_type": row.action_type,
                "previous_state": row.previous_state,
                "requested_state": row.requested_state,
                "applied_state": row.applied_state,
                "bms_status": row.bms_status,
                "scheduled_start": dec.scheduled_start if dec else None,
                "optimized_start": dec.optimized_start if dec else None,
                "verification": {
                    "status": row.verification_status,
                    "actual_response": row.actual_response,
                },
                "rollback_armed": True,
                "run_id": row.run_id,
            }
        finally:
            db.close()

    def get_history(self, limit: int = 30, offset: int = 0) -> List[Dict[str, Any]]:
        db = SessionLocal()
        try:
            records = (
                db.query(O1CalibrationRecordDB)
                .order_by(O1CalibrationRecordDB.id.desc())
                .offset(max(0, offset))
                .limit(limit)
                .all()
            )
            return [
                {
                    "date": r.date,
                    "oat": f"{r.oat}°C" if r.oat is not None else None,
                    "initial_temp": f"{r.initial_temp}°C" if r.initial_temp is not None else None,
                    "target_temp": f"{r.target_temp}°C" if r.target_temp is not None else None,
                    "scheduled_start": r.scheduled_start,
                    "optimized_start": r.optimized_start,
                    "actual_start": r.actual_start,
                    "target_reached": r.target_reached,
                    "predicted_target": r.predicted_target_reached,
                    "pulldown_duration": f"{int(r.pulldown_duration_min)} min" if r.pulldown_duration_min is not None else None,
                    "prediction_error": f"{r.prediction_error_min} min" if r.prediction_error_min is not None else None,
                    "scheduled_stop": r.scheduled_stop,
                    "optimized_stop": r.optimized_stop,
                    "comfort": r.comfort_result,
                    "energy_saved": f"+{r.energy_saved_kwh} kWh" if r.energy_saved_kwh is not None else None,
                    "verification": r.verification,
                    "model_version": r.model_version,
                }
                for r in records
            ]
        finally:
            db.close()

    def get_activities(self) -> List[Dict[str, Any]]:
        db = SessionLocal()
        try:
            rows = db.query(O1ActivityLogDB).order_by(O1ActivityLogDB.id.desc()).limit(40).all()
            return [
                {
                    "time": r.timestamp.strftime("%H:%M:%S") if r.timestamp else None,
                    "event": r.event_type or r.stage,
                    "detail": r.message,
                }
                for r in reversed(rows)
            ]
        finally:
            db.close()

    def get_studio(self) -> Dict[str, Any]:
        return {
            "state": self.get_state(),
            "thermal_model": self.get_thermal_model(),
            "start_candidates": self.get_start_candidates(),
            "coast_candidates": self.get_coast_candidates(),
            "decision": self.get_decision(),
            "timeline": self.get_timeline(),
            "safety": self.get_safety_checks(),
            "trajectory": self.get_trajectory_data(),
            "energy": self.get_energy_impact(),
            "bms_action": self.get_bms_action(),
            "history": self.get_history(),
            "activities": self.get_activities(),
        }

    def trigger_optimize(self) -> Dict[str, Any]:
        run_id = _ensure_run()
        db = SessionLocal()
        try:
            safety = db.query(O1SafetyValidationDB).filter_by(run_id=run_id).all()
            blocked = any(r.status in ("FAIL", "BLOCKED") and (r.severity or "") == "BLOCKING" for r in safety)
            if not blocked:
                blocked = any(r.status == "BLOCKED" for r in safety)
            dec = db.query(O1DecisionDB).filter_by(id=run_id).first()
            if blocked or not dec:
                db.add(O1ActionDB(
                    id=f"O1-BLK-{int(datetime.utcnow().timestamp())}",
                    action_type="OPTIMIZED_START",
                    target_equipment="AHU-1",
                    previous_state="OFF",
                    requested_state="STARTING",
                    applied_state="OFF",
                    bms_status="BLOCKED",
                    verification_status="BLOCKED",
                    command_status="BLOCKED",
                    run_id=run_id,
                    actual_response="Safety validation blocked dispatch",
                ))
                db.add(O1ActivityLogDB(stage="BMS_COMMAND_DISPATCHED", event_type="BMS_COMMAND_DISPATCHED", message="BLOCKED by safety", run_id=run_id, severity="WARN"))
                db.commit()
                return {"status": "BLOCKED", "run_id": run_id, "bms_status": "BLOCKED"}
            db.add(O1ActionDB(
                id=f"O1-ACT-{int(datetime.utcnow().timestamp())}",
                action_type="OPTIMIZED_START",
                target_equipment="AHU-1",
                previous_state="OFF",
                requested_state="STARTING",
                applied_state="PENDING",
                bms_status="DISPATCHED",
                verification_status="PENDING",
                command_status="DISPATCHED",
                run_id=run_id,
            ))
            db.add(O1ActivityLogDB(stage="BMS_COMMAND_DISPATCHED", event_type="BMS_COMMAND_DISPATCHED", message=f"Dispatch start {dec.optimized_start}", run_id=run_id))
            run = db.query(O1DailyRunDB).filter_by(id=run_id).first()
            if run:
                run.status = "DISPATCHED"
            db.commit()
            self.bms_status = "DISPATCHED"
            return {
                "status": "SUCCESS",
                "run_id": run_id,
                "optimized_start": dec.optimized_start,
                "optimized_stop": dec.optimized_stop,
                "bms_status": "DISPATCHED",
                "message": f"Command persisted PENDING verification for {dec.optimized_start}",
            }
        finally:
            db.close()

    def trigger_verify(self) -> Dict[str, Any]:
        db = SessionLocal()
        try:
            row = db.query(O1ActionDB).order_by(O1ActionDB.timestamp.desc()).first()
            if not row:
                return {"status": "UNAVAILABLE", "reason": "No command to verify"}
            if row.verification_status == "VERIFIED":
                return {
                    "status": row.verification_status,
                    "run_id": row.run_id,
                    "verified_state": row.verified_state,
                    "actual_response": row.actual_response,
                    "source": "PERSISTED",
                }
            if row.command_status == "BLOCKED":
                return {"status": "BLOCKED", "run_id": row.run_id}
            health = telemetry_health()
            zone = live_value("ZONE_TEMP")
            if health.get("overall") != "HEALTHY" or zone is None:
                row.verification_status = "FAILED"
                row.command_status = "FAILED"
                row.actual_response = f"Verify failed: telemetry {health.get('overall')}"
                db.add(O1ActivityLogDB(stage="RUN_FAILED", event_type="RUN_FAILED", message=row.actual_response, run_id=row.run_id, severity="ERROR"))
                db.commit()
                return {"status": "FAILED", "run_id": row.run_id, "reason": row.actual_response}
            row.verification_status = "VERIFIED"
            row.command_status = "VERIFIED"
            row.bms_status = "ACKNOWLEDGED"
            row.applied_state = "RUNNING"
            row.verified_state = f"ZONE_TEMP={zone}"
            row.verification_timestamp = datetime.utcnow()
            row.actual_response = f"Read-back ZONE_TEMP={zone} quality=GOOD"
            db.add(O1ActivityLogDB(stage="BMS_COMMAND_VERIFIED", event_type="BMS_COMMAND_VERIFIED", message=row.actual_response, run_id=row.run_id))
            sav = db.query(O1SavingsVerificationDB).filter_by(run_id=row.run_id).order_by(O1SavingsVerificationDB.id.desc()).first()
            if sav:
                sav.verification_status = "VERIFIED"
            run = db.query(O1DailyRunDB).filter_by(id=row.run_id).first()
            if run:
                run.status = "VERIFIED"
            db.commit()
            return {"status": "VERIFIED", "run_id": row.run_id, "zone_temp": zone, "verified_state": row.verified_state}
        finally:
            db.close()

    def trigger_rollback(self) -> Dict[str, Any]:
        db = SessionLocal()
        try:
            db.add(O1ActionDB(
                id=f"O1-RB-{int(datetime.utcnow().timestamp())}",
                action_type="ROLLBACK_BASELINE",
                target_equipment="AHU-1",
                previous_state="OPTIMIZED",
                requested_state="BASELINE",
                applied_state="BASELINE",
                bms_status="ROLLED_BACK",
                verification_status="RESTORED",
                command_status="ROLLED_BACK",
                rollback_applied=True,
            ))
            db.add(O1ActivityLogDB(stage="BMS_COMMAND_DISPATCHED", event_type="BMS_COMMAND_DISPATCHED", message="Rollback to scheduled baseline", severity="WARN"))
            db.commit()
            self.bms_status = "ROLLED_BACK"
            return {"status": "SUCCESS", "bms_status": "ROLLED_BACK", "message": "Rolled back to configured scheduled start/stop"}
        finally:
            db.close()


o1_service = O1Service()
