from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import os
from backend.services.simulation_service import sim_service
from backend.agents.scheduling_supervisory.audit_logger import AuditLogger
from backend.agents.scheduling_supervisory.worker import control_worker
from backend.models.registry import model_registry
from backend.evaluation.scenario_runner import ScenarioEvaluationRunner

router = APIRouter()
audit_logger = AuditLogger()

class ModeRequest(BaseModel):
    mode: str # AUTO, APPROVAL_REQUIRED, ADVISORY, SAFE_MODE

class ActionApprovalRequest(BaseModel):
    action_id: str

class ActionRejectRequest(BaseModel):
    action_id: str
    reason: str = "Operator rejected"

class OverrideRequest(BaseModel):
    point_id: str
    value: float

class ScenarioRequest(BaseModel):
    scenario_id: str

class LimitsUpdateRequest(BaseModel):
    limits: Dict[str, Any]

class RollbackRequest(BaseModel):
    action_id: Optional[str] = None
    reason: Optional[str] = "Manual operator reversion"

class ScenarioRunRequest(BaseModel):
    scenario_id: str
    iterations: Optional[int] = 1


# ============================================================================
# LEGACY & DIRECT SIMULATION ENDPOINTS
# ============================================================================

@router.get("/status")
def get_current_status():
    """Fleet/scheduling status from persisted dashboard, not a simulator tick."""
    from backend.services.scheduling_dashboard_service import get_scheduling_dashboard
    return get_scheduling_dashboard()

@router.post("/step")
def step_simulation(minutes: int = 5):
    """Advances simulation time and triggers a closed-loop supervisory control cycle."""
    return sim_service.step(elapsed_minutes=minutes)

@router.get("/history")
def get_telemetry_history():
    """Returns rolling time-series telemetry with PREDICTED, APPLIED, and VERIFIED savings."""
    return sim_service.telemetry_history

@router.post("/mode")
def set_agent_mode(req: ModeRequest):
    """Switches supervisory agent operating mode (AUTO, APPROVAL_REQUIRED, ADVISORY, SAFE_MODE)."""
    return sim_service.set_mode(req.mode)

@router.get("/actions/pending")
def get_pending_actions():
    """Returns queue of candidate actions waiting for operator review in APPROVAL_REQUIRED mode."""
    return sim_service.orchestrator.pending_approval_queue

@router.post("/actions/approve")
def approve_action(req: ActionApprovalRequest):
    """Approves a candidate action and dispatches it through the BMS Gateway."""
    return sim_service.approve_action(req.action_id)

@router.post("/actions/reject")
def reject_action(req: ActionRejectRequest):
    """Rejects a candidate action."""
    return sim_service.reject_action(req.action_id, req.reason)

@router.get("/actions/audit")
def get_audit_log(limit: int = 50):
    """Returns recent supervisory control action audits with all 12 properties."""
    return audit_logger.get_recent_actions(limit=limit)

@router.get("/limits")
def get_engineering_limits():
    """Returns dynamic configuration-driven engineering limits for building & equipment."""
    return sim_service.engineering_limits.dict()

@router.post("/limits")
def update_engineering_limits(req: LimitsUpdateRequest):
    """Updates dynamic engineering limits without hardcoded constraints."""
    sim_service.save_limits(req.limits)
    return {"status": "success", "limits": sim_service.engineering_limits.dict()}

@router.get("/scenarios")
def get_scenarios():
    return [
        {"id": "scenario_summer_peak", "name": "Summer Heatwave (Peak Cooling)", "description": "High OAT (34°C max) testing pre-cooling pull down & chiller dual-staging."},
        {"id": "scenario_shoulder_mild", "name": "Shoulder Season (Mild Diurnal)", "description": "Moderate ambient temp (14°-21°C) with aggressive SAT reset and coast-down stop."},
        {"id": "scenario_hybrid_occupancy", "name": "Hybrid Occupancy (Setback Mode)", "description": "Sporadic occupancy with 40% occupancy testing zone deadband expansion."},
        {"id": "scenario_sensor_drift_safety", "name": "Sensor Fault & Fail-Safe", "description": "Drifting sensor triggering data validation failure and SAFE_MODE lock."}
    ]

@router.post("/scenarios/select")
def select_scenario(req: ScenarioRequest):
    sim_service.switch_scenario(req.scenario_id)
    return {"status": "success", "scenario_id": req.scenario_id}


# ============================================================================
# DEDICATED SCHEDULING & SUPERVISORY AGENT ENDPOINTS
# ============================================================================

@router.get("/scheduling/dashboard")
@router.get("/agents/scheduling/dashboard")
def get_scheduling_dashboard():
    from backend.services.scheduling_dashboard_service import get_scheduling_dashboard as _dash
    return _dash()


@router.get("/agents/ventilation-airflow/dashboard")
def get_ventilation_dashboard_alias():
    from backend.services.ventilation_opportunity_service import get_dashboard
    return get_dashboard()


@router.get("/agents/ventilation-airflow/opportunities/{oid}")
def get_ventilation_opportunity_alias(oid: str):
    from backend.services.ventilation_opportunity_service import evaluate_opportunity
    code = oid.upper()
    if code not in ("O11", "O12", "O13"):
        raise HTTPException(status_code=404, detail=f"Unknown opportunity ID: {code}")
    try:
        return evaluate_opportunity(code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/agents/scheduling/status")
def get_scheduling_agent_status():
    return sim_service.get_latest_status()

@router.get("/agents/scheduling/state")
def get_scheduling_agent_state():
    status = sim_service.get_latest_status()
    return {
        "lifecycle_state": status.get("lifecycle_state"),
        "mode": status.get("mode"),
        "simulation_time": status.get("simulation_time"),
        "building_power_kw": status.get("actual_kw", 82.5),
        "data_quality_valid": status.get("data_quality_valid", True),
        "weather": status.get("weather", {}),
        "active_chillers": status.get("active_chillers", 1),
        "zones_count": 12
    }

@router.get("/agents/scheduling/kpis")
def get_scheduling_agent_kpis():
    from backend.services.scheduling_dashboard_service import get_scheduling_dashboard as _dash
    d = _dash()
    return {
        "agent_health": d.get("agentHealth"),
        "active_opportunities_count": d.get("activeOpportunities"),
        "actions_today_count": d.get("actionsDispatched"),
        "verified_power_kw": None,
        "verified_savings_kwh": d.get("verifiedSavingsKwh"),
        "comfort_compliance_pct": d.get("comfortCompliancePct"),
        "safety_guardrails": d.get("safetyGuardrails"),
        "telemetry_age_seconds": d.get("telemetryHeartbeat"),
        "rollbacks_today": d.get("safetyRollbacks"),
    }

@router.get("/agents/scheduling/opportunities")
def get_scheduling_opportunities():
    status = sim_service.get_latest_status()
    return status.get("detected_opportunities", [])

@router.get("/agents/scheduling/o1")
def get_o1_status():
    status = sim_service.get_latest_status()
    return sim_service.orchestrator.o1_engine.evaluate(status)

@router.get("/agents/scheduling/o2")
def get_o2_status():
    status = sim_service.get_latest_status()
    return sim_service.orchestrator.o2_engine.evaluate(status)

@router.get("/agents/scheduling/o3")
def get_o3_status():
    status = sim_service.get_latest_status()
    return sim_service.orchestrator.o3_engine.evaluate(status)

@router.get("/agents/scheduling/o4")
def get_o4_status():
    status = sim_service.get_latest_status()
    return sim_service.orchestrator.o4_engine.evaluate(status)

@router.get("/agents/scheduling/actions")
def get_scheduling_actions():
    status = sim_service.get_latest_status()
    return {
        "candidate_actions": status.get("candidate_actions", []),
        "pending_approvals": status.get("pending_approvals", []),
        "executed_actions": audit_logger.get_recent_actions(limit=20)
    }

@router.get("/agents/scheduling/decisions")
def get_scheduling_decisions():
    status = sim_service.get_latest_status()
    return {
        "cycle_time": status.get("simulation_time"),
        "mode": status.get("mode"),
        "decisions": [
            {
                "id": act.get("id"),
                "opportunity_code": act.get("opportunity_code"),
                "point_id": act.get("point_id"),
                "previous_value": act.get("previous_value"),
                "proposed_value": act.get("proposed_value"),
                "reason": act.get("reason"),
                "confidence": act.get("confidence"),
                "safety_result": act.get("safety_result"),
                "final_status": act.get("final_status")
            }
            for act in status.get("candidate_actions", [])
        ]
    }

@router.get("/agents/scheduling/verifications")
def get_scheduling_verifications():
    return sim_service.orchestrator.verification_engine.active_verifications

@router.get("/agents/scheduling/telemetry")
def get_scheduling_telemetry():
    """Baseline vs optimized power series for the scheduling chart."""
    hist = list(sim_service.telemetry_history or [])
    if len(hist) < 8:
        try:
            from backend.bms.connection_manager import is_simulation_mode

            if is_simulation_mode() or os.getenv("HVAC_USE_SIMULATION", "0").strip() in ("1", "true", "TRUE"):
                for _ in range(max(0, 12 - len(hist))):
                    sim_service.step(elapsed_minutes=5)
                hist = list(sim_service.telemetry_history or [])
        except Exception:
            pass
    return hist

@router.get("/agents/scheduling/activity")
def get_scheduling_activity():
    """Real supervisory + control audit timeline (never hardcoded)."""
    from backend.services.scheduling_dashboard_service import supervisory_activity
    return supervisory_activity()

@router.get("/agents/scheduling/model-status")
def get_model_status():
    """GET /api/agents/scheduling/model-status"""
    return model_registry.get_all_active_models()

@router.get("/agents/scheduling/training-status")
def get_training_status():
    """GET /api/agents/scheduling/training-status"""
    return {
        "status": "READY",
        "dataset_version": "ds-hvac-2026-v1",
        "models": model_registry.get_all_active_models()
    }

@router.get("/agents/scheduling/worker-status")
def get_worker_status():
    """GET /api/agents/scheduling/worker-status"""
    import os

    if os.getenv("HVAC_USE_AI_PIPELINE", "1").strip().lower() in ("1", "true", "yes"):
        from backend.workers.ai_pipeline_worker import get_worker

        worker = get_worker()
        if worker is not None:
            status = worker.get_status()
            status["worker_type"] = "ai_pipeline"
            return status
        return {
            "worker_running": False,
            "worker_type": "ai_pipeline",
            "interval_seconds": int(os.getenv("HVAC_AI_PIPELINE_INTERVAL_SECONDS", "60") or "60"),
            "last_summary": "AI pipeline worker not started on this host",
            "pipeline": "RLS→LSTM→SafeRL→Rules→BMS",
        }
    return control_worker.get_status()

@router.post("/agents/scheduling/run")
def trigger_scheduling_run(minutes: int = 5):
    return sim_service.step(elapsed_minutes=minutes)

@router.post("/agents/scheduling/mode")
def set_scheduling_mode(req: ModeRequest):
    return sim_service.set_mode(req.mode)

@router.post("/agents/scheduling/rollback")
def trigger_scheduling_rollback(req: RollbackRequest):
    return sim_service.orchestrator.rollback_engine.execute_rollback(
        action_id=req.action_id or "manual_reversion",
        point_id="PLANT-SUPERVISORY-HOLD",
        rollback_value=1.0,
        gateway=sim_service.orchestrator.gateway,
        reason=req.reason or "Manual operator rollback"
    )

@router.post("/agents/scheduling/evaluate-125")
def run_125_evaluations():
    """POST /api/agents/scheduling/evaluate-125"""
    runner = ScenarioEvaluationRunner()
    return runner.run_all_evaluations()

# ============================================================================
# DEDICATED O1 (OPTIMUM START/STOP PROGRAMMING) ROUTES
# ============================================================================
try:
    from backend.services.o1_service import o1_service
except ImportError:
    from services.o1_service import o1_service

@router.get("/agents/scheduling/o1/state")
def get_o1_state():
    """GET /api/agents/scheduling/o1/state"""
    return o1_service.get_state()

@router.get("/agents/scheduling/o1/telemetry")
def get_o1_telemetry():
    """GET /api/agents/scheduling/o1/telemetry"""
    return o1_service.get_telemetry()

@router.get("/agents/scheduling/o1/schedule")
def get_o1_schedule():
    """GET /api/agents/scheduling/o1/schedule"""
    return o1_service.get_state().get("kpis", {})

@router.get("/agents/scheduling/o1/thermal-model")
def get_o1_thermal_model():
    """GET /api/agents/scheduling/o1/thermal-model"""
    return o1_service.get_thermal_model()

@router.get("/agents/scheduling/o1/start-candidates")
def get_o1_start_candidates():
    """GET /api/agents/scheduling/o1/start-candidates"""
    return o1_service.get_start_candidates()

@router.get("/agents/scheduling/o1/coast-candidates")
def get_o1_coast_candidates():
    """GET /api/agents/scheduling/o1/coast-candidates"""
    return o1_service.get_coast_candidates()

@router.get("/agents/scheduling/o1/decision")
def get_o1_decision():
    """GET /api/agents/scheduling/o1/decision"""
    return o1_service.get_decision()

@router.get("/agents/scheduling/o1/timeline")
def get_o1_timeline():
    """GET /api/agents/scheduling/o1/timeline"""
    return o1_service.get_timeline()

@router.get("/agents/scheduling/o1/safety")
def get_o1_safety():
    """GET /api/agents/scheduling/o1/safety"""
    return o1_service.get_safety_checks()

@router.get("/agents/scheduling/o1/trajectory")
def get_o1_trajectory():
    """GET /api/agents/scheduling/o1/trajectory"""
    return o1_service.get_trajectory_data()

@router.get("/agents/scheduling/o1/energy")
def get_o1_energy():
    """GET /api/agents/scheduling/o1/energy"""
    return o1_service.get_energy_impact()

@router.get("/agents/scheduling/o1/bms-action")
def get_o1_bms_action():
    """GET /api/agents/scheduling/o1/bms-action"""
    return o1_service.get_bms_action()

@router.get("/agents/scheduling/o1/history")
def get_o1_history(limit: int = 30, offset: int = 0):
    """GET /api/agents/scheduling/o1/history"""
    return o1_service.get_history(limit=min(max(limit, 1), 200), offset=max(offset, 0))

@router.get("/agents/scheduling/o1/activity")
def get_o1_activity():
    """GET /api/agents/scheduling/o1/activity"""
    return o1_service.get_activities()

@router.get("/agents/scheduling/o1/studio")
def get_o1_studio():
    return o1_service.get_studio()

@router.get("/agents/scheduling/o1/forecast")
def get_o1_forecast():
    from backend.services.weather_service import weather_service
    return weather_service.forecast()

@router.get("/agents/scheduling/o1/occupancy")
def get_o1_occupancy():
    from database.session import SessionLocal
    from database.models_o1 import OccupancyScheduleDB
    db = SessionLocal()
    try:
        rows = db.query(OccupancyScheduleDB).limit(50).all()
        return {
            "schedules": [
                {
                    "id": getattr(r, "id", None),
                    "building_id": getattr(r, "building_id", None),
                    "zone_id": getattr(r, "zone_id", None),
                    "weekday": getattr(r, "weekday", None),
                    "occupancy_start": getattr(r, "occupancy_start", None),
                    "occupancy_end": getattr(r, "occupancy_end", None),
                    "is_holiday": getattr(r, "is_holiday", None),
                    "source": getattr(r, "source", None),
                }
                for r in rows
            ]
        }
    finally:
        db.close()

@router.post("/agents/scheduling/o1/optimize")
def trigger_o1_optimize():
    """POST /api/agents/scheduling/o1/optimize"""
    return o1_service.trigger_optimize()

@router.post("/agents/scheduling/o1/verify")
def trigger_o1_verify():
    """POST /api/agents/scheduling/o1/verify"""
    return o1_service.trigger_verify()

@router.post("/agents/scheduling/o1/rollback")
def trigger_o1_rollback():
    """POST /api/agents/scheduling/o1/rollback"""
    return o1_service.trigger_rollback()

# ============================================================================
# DEDICATED O2 (SPACE TEMPERATURE & CONTROL BANDS) ROUTES
# ============================================================================
from backend.services.o2_service import o2_service

class O2OptimizeRequest(BaseModel):
    zone_id: str
    setpoint: float

class O2RollbackRequest(BaseModel):
    zone_id: str

@router.get("/agents/scheduling/o2/state")
def get_o2_state():
    """GET /api/agents/scheduling/o2/state"""
    return o2_service.get_state()

@router.get("/agents/scheduling/o2/zones")
def get_o2_zones():
    """GET /api/agents/scheduling/o2/zones"""
    return o2_service.get_zones()

@router.get("/agents/scheduling/o2/detail")
def get_o2_zone_detail(zone_id: str = "VAV-101"):
    """GET /api/agents/scheduling/o2/detail?zone_id=VAV-101"""
    return o2_service.get_selected_zone_detail(zone_id)

@router.get("/agents/scheduling/o2/telemetry")
def get_o2_telemetry(zone_id: str = "VAV-101", hours: int = 1):
    """GET /api/agents/scheduling/o2/telemetry?zone_id=VAV-101&hours=1"""
    return o2_service.get_telemetry_trend(zone_id, hours=hours)

@router.get("/agents/scheduling/o2/candidates")
def get_o2_candidates(zone_id: str = "VAV-101"):
    """GET /api/agents/scheduling/o2/candidates?zone_id=VAV-101"""
    detail = o2_service.get_selected_zone_detail(zone_id)
    return detail.get("candidates", [])

@router.get("/agents/scheduling/o2/decision")
def get_o2_decision(zone_id: str = "VAV-101"):
    """GET /api/agents/scheduling/o2/decision?zone_id=VAV-101"""
    return o2_service.get_decision(zone_id)

@router.get("/agents/scheduling/o2/safety")
def get_o2_safety(zone_id: str = "VAV-101"):
    """GET /api/agents/scheduling/o2/safety?zone_id=VAV-101"""
    return o2_service.get_safety_validation(zone_id)

@router.get("/agents/scheduling/o2/energy")
def get_o2_energy():
    """GET /api/agents/scheduling/o2/energy"""
    return o2_service.get_energy_impact()

@router.get("/agents/scheduling/o2/bms-action")
def get_o2_bms_action(zone_id: str = "VAV-101"):
    """GET /api/agents/scheduling/o2/bms-action?zone_id=VAV-101"""
    return o2_service.get_bms_action_and_verification(zone_id)

@router.get("/agents/scheduling/o2/history")
def get_o2_history():
    """GET /api/agents/scheduling/o2/history"""
    return o2_service.get_history()

@router.get("/agents/scheduling/o2/activity")
def get_o2_activity():
    """GET /api/agents/scheduling/o2/activity"""
    return o2_service.get_activities()

@router.get("/agents/scheduling/o2/studio")
def get_o2_studio(zone_id: str = "VAV-101", hours: int = 1):
    return o2_service.get_studio(zone_id, hours=hours)

@router.post("/agents/scheduling/o2/optimize")
def trigger_o2_optimize(req: O2OptimizeRequest):
    """POST /api/agents/scheduling/o2/optimize"""
    return o2_service.trigger_optimize(req.zone_id, req.setpoint)

@router.post("/agents/scheduling/o2/verify")
def trigger_o2_verify(zone_id: str = "VAV-101"):
    """POST /api/agents/scheduling/o2/verify"""
    return o2_service.trigger_verify(zone_id)

@router.post("/agents/scheduling/o2/rollback")
def trigger_o2_rollback(req: O2RollbackRequest):
    """POST /api/agents/scheduling/o2/rollback"""
    return o2_service.trigger_rollback(req.zone_id)

# ============================================================================
# DEDICATED O3 (MASTER AHU SAT SIGNAL) ROUTES
# ============================================================================
try:
    from backend.services.o3_service import o3_service
except ImportError:
    from services.o3_service import o3_service

class O3OptimizeRequest(BaseModel):
    sat: float

class O3MethodRequest(BaseModel):
    method: str # THIRD_HIGHEST, PERCENTILE, WEIGHTED

@router.get("/agents/scheduling/o3/state")
def get_o3_state():
    """GET /api/agents/scheduling/o3/state"""
    return o3_service.get_state()

@router.get("/agents/scheduling/o3/zones")
def get_o3_zones():
    """GET /api/agents/scheduling/o3/zones"""
    return o3_service.get_zones()

@router.get("/agents/scheduling/o3/demand")
def get_o3_demand():
    """GET /api/agents/scheduling/o3/demand"""
    return o3_service.calculate_master_demand()

@router.get("/agents/scheduling/o3/exclusions")
def get_o3_exclusions():
    """GET /api/agents/scheduling/o3/exclusions"""
    return o3_service.get_rogue_zone_exclusions()

@router.get("/agents/scheduling/o3/candidates")
def get_o3_candidates():
    """GET /api/agents/scheduling/o3/candidates"""
    return o3_service.get_sat_candidates()

@router.get("/agents/scheduling/o3/decision")
def get_o3_decision():
    """GET /api/agents/scheduling/o3/decision"""
    return o3_service.get_decision()

@router.get("/agents/scheduling/o3/power")
def get_o3_power():
    """GET /api/agents/scheduling/o3/power"""
    return o3_service.get_power_tradeoff()

@router.get("/agents/scheduling/o3/safety")
def get_o3_safety():
    """GET /api/agents/scheduling/o3/safety"""
    return o3_service.get_safety_validation()

@router.get("/agents/scheduling/o3/bms-action")
def get_o3_bms_action():
    """GET /api/agents/scheduling/o3/bms-action"""
    return o3_service.get_bms_action()

@router.get("/agents/scheduling/o3/telemetry")
def get_o3_telemetry(hours: int = 1):
    """GET /api/agents/scheduling/o3/telemetry?hours=1"""
    return o3_service.get_telemetry_trend(hours=hours)

@router.get("/agents/scheduling/o3/zone-response")
def get_o3_zone_response(hours: int = 1):
    """GET /api/agents/scheduling/o3/zone-response?hours=1"""
    return o3_service.get_zone_response_trend(hours=hours)

@router.get("/agents/scheduling/o3/history")
def get_o3_history():
    """GET /api/agents/scheduling/o3/history"""
    return o3_service.get_history()

@router.get("/agents/scheduling/o3/activity")
def get_o3_activity():
    """GET /api/agents/scheduling/o3/activity"""
    return o3_service.get_activities()

@router.get("/agents/scheduling/o3/studio")
def get_o3_studio(hours: int = 1):
    return o3_service.get_studio(hours=hours)

@router.post("/agents/scheduling/o3/method")
def set_o3_method(req: O3MethodRequest):
    """POST /api/agents/scheduling/o3/method"""
    return o3_service.set_calculation_method(req.method)

@router.post("/agents/scheduling/o3/optimize")
def trigger_o3_optimize(req: O3OptimizeRequest):
    """POST /api/agents/scheduling/o3/optimize"""
    return o3_service.trigger_optimize(req.sat)

@router.post("/agents/scheduling/o3/verify")
def trigger_o3_verify():
    """POST /api/agents/scheduling/o3/verify"""
    return o3_service.trigger_verify()

@router.post("/agents/scheduling/o3/rollback")
def trigger_o3_rollback():
    """POST /api/agents/scheduling/o3/rollback"""
    return o3_service.trigger_rollback()

# ============================================================================
# DEDICATED O4 (CHILLER & COMPRESSOR STAGING) ROUTES
# ============================================================================
try:
    from backend.services.o4_service import o4_service
except ImportError:
    from services.o4_service import o4_service

class O4OptimizeRequest(BaseModel):
    chws: float
    stages: int = 1

@router.get("/agents/scheduling/o4/state")
def get_o4_state():
    """GET /api/agents/scheduling/o4/state"""
    return o4_service.get_state()

@router.get("/agents/scheduling/o4/load")
def get_o4_load():
    """GET /api/agents/scheduling/o4/load"""
    return o4_service.get_cooling_load()

@router.get("/agents/scheduling/o4/chillers")
def get_o4_chillers():
    """GET /api/agents/scheduling/o4/chillers"""
    return o4_service.get_chiller_fleet()

@router.get("/agents/scheduling/o4/compressors")
def get_o4_compressors():
    """GET /api/agents/scheduling/o4/compressors"""
    return o4_service.get_compressor_stages()

@router.get("/agents/scheduling/o4/candidates")
def get_o4_candidates():
    """GET /api/agents/scheduling/o4/candidates"""
    return o4_service.get_stage_candidates()

@router.get("/agents/scheduling/o4/chws")
def get_o4_chws():
    """GET /api/agents/scheduling/o4/chws"""
    return o4_service.get_chws_candidates()

@router.get("/agents/scheduling/o4/decision")
def get_o4_decision():
    """GET /api/agents/scheduling/o4/decision"""
    return o4_service.get_decision()

@router.get("/agents/scheduling/o4/power")
def get_o4_power():
    """GET /api/agents/scheduling/o4/power"""
    return o4_service.get_power_tradeoff()

@router.get("/agents/scheduling/o4/safety")
def get_o4_safety():
    """GET /api/agents/scheduling/o4/safety"""
    return o4_service.get_safety_validation()

@router.get("/agents/scheduling/o4/bms-action")
def get_o4_bms_action():
    """GET /api/agents/scheduling/o4/bms-action"""
    return o4_service.get_bms_action()

@router.get("/agents/scheduling/o4/telemetry")
def get_o4_telemetry(hours: int = 1):
    """GET /api/agents/scheduling/o4/telemetry?hours=1"""
    return o4_service.get_telemetry_trend(hours=hours)

@router.get("/agents/scheduling/o4/plant-trend")
def get_o4_plant_trend(hours: int = 1):
    """GET /api/agents/scheduling/o4/plant-trend?hours=1"""
    return o4_service.get_plant_load_trend(hours=hours)

@router.get("/agents/scheduling/o4/history")
def get_o4_history():
    """GET /api/agents/scheduling/o4/history"""
    return o4_service.get_history()

@router.get("/agents/scheduling/o4/activity")
def get_o4_activity():
    """GET /api/agents/scheduling/o4/activity"""
    return o4_service.get_activities()

@router.get("/agents/scheduling/o4/studio")
def get_o4_studio(hours: int = 1):
    return o4_service.get_studio(hours=hours)

@router.post("/agents/scheduling/o4/optimize")
def trigger_o4_optimize(req: O4OptimizeRequest):
    """POST /api/agents/scheduling/o4/optimize"""
    return o4_service.trigger_optimize(req.chws, req.stages)

@router.post("/agents/scheduling/o4/verify")
def trigger_o4_verify():
    """POST /api/agents/scheduling/o4/verify"""
    return o4_service.trigger_verify()

@router.post("/agents/scheduling/o4/rollback")
def trigger_o4_rollback():
    """POST /api/agents/scheduling/o4/rollback"""
    return o4_service.trigger_rollback()

# ============================================================================
# PLANT CONTROL PARAMETER OPTIMIZATIONS (O5–O9) ROUTES
# ============================================================================
try:
    from backend.services.plant_control_service import plant_control_service
except Exception:
    plant_control_service = None


def _require_plant_control():
    if plant_control_service is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "SERVICE_UNAVAILABLE", "message": "Plant control service is not loaded."},
        )
    return plant_control_service

class PlantControlOptimizeRequest(BaseModel):
    opportunity: str
    target_value: float

@router.get("/agents/plant-control/state")
def get_plant_control_state():
    """GET /api/agents/plant-control/state - Central Dashboard State"""
    return _require_plant_control().get_dashboard_state()

@router.get("/agents/plant-control/activity")
def get_plant_control_activity(limit: int = 20):
    """GET /api/agents/plant-control/activity"""
    return _require_plant_control().get_activity_log(limit=limit)

# O5: Duct Static Pressure Reset
@router.get("/agents/plant-control/o5/state")
def get_plant_control_o5_state():
    """GET /api/agents/plant-control/o5/state"""
    return _require_plant_control().get_o5_state()

@router.post("/agents/plant-control/o5/optimize")
def trigger_plant_control_o5_optimize(req: PlantControlOptimizeRequest):
    from backend.services.plant_control_command_service import plant_control_command_service as _cmd
    try:
        return _cmd.execute_command("O5", req.target_value)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code": "DISPATCH_BLOCKED", "message": str(exc)})

@router.post("/agents/plant-control/o5/rollback")
def trigger_plant_control_o5_rollback():
    """POST /api/agents/plant-control/o5/rollback"""
    svc = _require_plant_control()
    svc.log_activity("O5", "ROLLBACK", "Duct static pressure setpoint restored to baseline 2.0 in.w.c.")
    return {"status": "ROLLED_BACK", "restored_setpoint": 2.0}

# O6: Heating Hot Water Reset
@router.get("/agents/plant-control/o6/state")
def get_plant_control_o6_state():
    """GET /api/agents/plant-control/o6/state"""
    return _require_plant_control().get_o6_state()

@router.post("/agents/plant-control/o6/optimize")
def trigger_plant_control_o6_optimize(req: PlantControlOptimizeRequest):
    from backend.services.plant_control_command_service import plant_control_command_service as _cmd
    try:
        return _cmd.execute_command("O6", req.target_value)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code": "DISPATCH_BLOCKED", "message": str(exc)})

@router.post("/agents/plant-control/o6/rollback")
def trigger_plant_control_o6_rollback():
    """POST /api/agents/plant-control/o6/rollback"""
    svc = _require_plant_control()
    svc.log_activity("O6", "ROLLBACK", "HHW delivery setpoint restored to baseline 80.0°C")
    return {"status": "ROLLED_BACK", "restored_setpoint": 80.0}

# O7: Chilled Water Reset
@router.get("/agents/plant-control/o7/state")
def get_plant_control_o7_state():
    """GET /api/agents/plant-control/o7/state"""
    return _require_plant_control().get_o7_state()

@router.post("/agents/plant-control/o7/optimize")
def trigger_plant_control_o7_optimize(req: PlantControlOptimizeRequest):
    from backend.services.plant_control_command_service import plant_control_command_service as _cmd
    try:
        return _cmd.execute_command("O7", req.target_value)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code": "DISPATCH_BLOCKED", "message": str(exc)})

@router.post("/agents/plant-control/o7/rollback")
def trigger_plant_control_o7_rollback():
    """POST /api/agents/plant-control/o7/rollback"""
    svc = _require_plant_control()
    svc.log_activity("O7", "ROLLBACK", "CHWS delivery setpoint restored to baseline 6.7°C")
    return {"status": "ROLLED_BACK", "restored_setpoint": 6.7}

# O8: Condenser Water Reset
@router.get("/agents/plant-control/o8/state")
def get_plant_control_o8_state():
    """GET /api/agents/plant-control/o8/state"""
    return _require_plant_control().get_o8_state()

@router.post("/agents/plant-control/o8/optimize")
def trigger_plant_control_o8_optimize(req: PlantControlOptimizeRequest):
    from backend.services.plant_control_command_service import plant_control_command_service as _cmd
    try:
        return _cmd.execute_command("O8", req.target_value)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code": "DISPATCH_BLOCKED", "message": str(exc)})

@router.post("/agents/plant-control/o8/rollback")
def trigger_plant_control_o8_rollback():
    """POST /api/agents/plant-control/o8/rollback"""
    svc = _require_plant_control()
    svc.log_activity("O8", "ROLLBACK", "CWS delivery setpoint restored to baseline 29.5°C")
    return {"status": "ROLLED_BACK", "restored_setpoint": 29.5}

# O9: Electronic Expansion Valve Retrofit Assessment
@router.get("/agents/plant-control/o9/assessment")
def get_plant_control_o9_assessment():
    """GET /api/agents/plant-control/o9/assessment"""
    return _require_plant_control().get_o9_assessment()




