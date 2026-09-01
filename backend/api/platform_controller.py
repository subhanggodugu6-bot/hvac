from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional

from backend.services.ai_normalized_telemetry import build_ai_records
from backend.services.canonical_telemetry_service import latest_points, query_telemetry
from backend.services.platform_bms_service import platform_snapshot
from backend.services.platform_ops_service import (
    get_plant_mode,
    get_safe_mode,
    record_control_audit,
    set_plant_mode,
    set_safe_mode,
)
from backend.services.dashboard_home_service import dashboard_home

router = APIRouter(prefix="/api/platform", tags=["Platform"])


@router.get("/dashboard/home")
async def get_dashboard_home():
    return dashboard_home()


@router.get("/opportunities")
async def get_platform_opportunities():
    home = dashboard_home()
    rows = []
    for chapter in home.get("chapters") or []:
        rows.extend(chapter.get("opportunities") or [])
    return {"opportunities": rows, "chapters": home.get("chapters") or []}

class SafeModeRequest(BaseModel):
    enabled: bool
    reason: Optional[str] = None


class PlantModeRequest(BaseModel):
    mode: str
    reason: Optional[str] = None


class LstmTrainRequest(BaseModel):
    zone_id: str = "ZONE-01"
    t0: Optional[str] = None
    t1: Optional[str] = None
    targets: Optional[List[str]] = None
    lookback_min: Optional[int] = None


class SafeRlRecommendRequest(BaseModel):
    zone_id: str = "ZONE-01"
    building_id: Optional[str] = None


class RulesEvaluateRequest(BaseModel):
    point_id: Optional[str] = None
    old_value: Optional[float] = None
    new_value: Optional[float] = None
    opportunity_id: Optional[str] = None
    zone_id: str = "ZONE-01"
    building_id: Optional[str] = None
    action: str = "EVALUATE"
    schedule_hour: Optional[int] = None
    compressor_runtime_minutes: Optional[float] = None
    compressor_offtime_minutes: Optional[float] = None


@router.get("/status")
async def platform_status():
    return platform_snapshot()


@router.post("/safe-mode")
async def post_safe_mode(req: SafeModeRequest):
    set_safe_mode(req.enabled)
    record_control_audit(user=None, action="SAFE_MODE", reason=req.reason, requested_value=req.enabled)
    return {"safeMode": get_safe_mode()}


@router.post("/plant-mode")
async def post_plant_mode(req: PlantModeRequest):
    mode = set_plant_mode(req.mode)
    record_control_audit(user=None, action="PLANT_MODE", reason=req.reason, requested_value=mode)
    return platform_snapshot()


@router.get("/telemetry")
async def telemetry_latest(building_id: Optional[str] = Query(default=None)):
    return {"points": latest_points(building_id, limit=400)}


@router.get("/timeseries/window")
async def timeseries_window(
    point_id: Optional[List[str]] = Query(default=None),
    t0: Optional[str] = Query(default=None),
    t1: Optional[str] = Query(default=None),
    building_id: Optional[str] = Query(default=None),
    limit: int = Query(default=2000, ge=1, le=5000),
):
    """Return ordered canonical samples for point_id(s) between t0 and t1."""
    rows = query_telemetry(
        building_id=building_id,
        point_ids=point_id,
        t0=t0,
        t1=t1,
        limit=limit,
        prefer_buffer=True,
    )
    return {
        "points": rows,
        "count": len(rows),
        "t0": t0,
        "t1": t1,
        "point_ids": point_id or [],
    }


@router.get("/ai/normalized")
async def ai_normalized(
    zone_id: str = Query(default="ZONE-01"),
    t0: Optional[str] = Query(default=None),
    t1: Optional[str] = Query(default=None),
    step_seconds: int = Query(default=60, ge=15, le=3600),
    building_id: Optional[str] = Query(default=None),
):
    """NB2-shaped AI records aligned on a time grid (null + MISSING, never invent 0)."""
    return build_ai_records(
        zone_id=zone_id,
        t0=t0,
        t1=t1,
        step_seconds=step_seconds,
        building_id=building_id,
    )


@router.get("/ai/rls/status")
async def rls_status(zone_id: Optional[str] = Query(default=None)):
    from backend.ai.rls.service import snapshot_all

    return snapshot_all(zone_id)


@router.get("/ai/rls/params")
async def rls_params(
    model_key: str = Query(...),
    zone_id: str = Query(default="ZONE-01"),
    source_mode: Optional[str] = Query(default=None),
):
    from backend.ai.rls.service import params_for

    return params_for(model_key, zone_id=zone_id, source_mode=source_mode)


@router.get("/ai/rls/errors")
async def rls_errors(
    model_key: str = Query(...),
    zone_id: str = Query(default="ZONE-01"),
    source_mode: Optional[str] = Query(default=None),
    limit: int = Query(default=60, ge=1, le=60),
):
    from backend.ai.rls.service import error_trend

    return error_trend(model_key, zone_id=zone_id, source_mode=source_mode, limit=limit)


@router.get("/ai/lstm/sequence")
async def lstm_sequence(
    zone_id: str = Query(default="ZONE-01"),
    lookback_min: int = Query(default=60, ge=30, le=120),
    horizon_min: int = Query(default=60, ge=15, le=60),
    target: str = Query(default="zone_temp"),
):
    from backend.ai.lstm.sequences import sequence_summary

    return sequence_summary(zone_id, lookback_min=lookback_min, horizon_min=horizon_min, target=target)


@router.post("/ai/lstm/train")
async def lstm_train(req: LstmTrainRequest):
    from backend.ai.lstm.train import train_targets

    return train_targets(
        zone_id=req.zone_id,
        targets=req.targets,
        t0=req.t0,
        t1=req.t1,
        lookback_min=req.lookback_min,
    )


@router.get("/ai/lstm/forecast")
async def lstm_forecast(
    zone_id: str = Query(default="ZONE-01"),
    lookback_min: int = Query(default=60, ge=30, le=120),
):
    from backend.ai.lstm.infer import forecast

    return forecast(zone_id=zone_id, lookback_min=lookback_min)


@router.get("/ai/lstm/status")
async def lstm_status():
    from backend.ai.lstm.status import list_status

    return list_status()


@router.get("/ai/lstm/models")
async def lstm_models(limit: int = Query(default=20, ge=1, le=100)):
    from backend.ai.lstm.status import list_versions

    return list_versions(limit)


@router.get("/edge/status")
async def edge_status_api():
    from backend.services.edge_mode import edge_status
    from backend.workers.watchdog import ai_watchdog_status

    return {**edge_status(), "ai_watchdogs": ai_watchdog_status(), "wrote_setpoints": False}


@router.post("/ai/safe-rl/recommend")
async def safe_rl_recommend(req: SafeRlRecommendRequest):
    from backend.ai.safe_rl.service import recommend

    return recommend(zone_id=req.zone_id, building_id=req.building_id)


@router.get("/ai/safe-rl/status")
async def safe_rl_status(
    zone_id: str = Query(default="ZONE-01"),
    building_id: Optional[str] = Query(default=None),
):
    from backend.ai.safe_rl.status import readiness_status

    return readiness_status(zone_id, building_id=building_id)


@router.get("/ai/safe-rl/decisions")
async def safe_rl_decisions(limit: int = Query(default=20, ge=1, le=100)):
    from backend.ai.safe_rl.status import list_decisions

    return list_decisions(limit)


@router.get("/ai/safe-rl/decisions/{decision_id}")
async def safe_rl_decision_detail(decision_id: str):
    from backend.ai.safe_rl.status import get_decision
    from fastapi import HTTPException

    row = get_decision(decision_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Decision not found")
    return row


@router.get("/ai/pipeline/status")
async def pipeline_status(zone_id: str = Query(default="ZONE-01")):
    from backend.ai.pipeline.orchestrator import auto_dispatch_enabled
    from backend.ai.pipeline.stage_summary import pipeline_stages_summary
    from backend.workers.ai_pipeline_worker import get_worker
    from backend.workers.watchdog import ai_watchdog_status

    worker = get_worker()
    stages = pipeline_stages_summary(zone_id)
    return {
        "pipeline": "RLS → LSTM → Safe RL → Rule Engine → BMS Control",
        "stages": stages,
        "use_ai_pipeline": __import__("os").getenv("HVAC_USE_AI_PIPELINE", "1"),
        "auto_dispatch": auto_dispatch_enabled(),
        "worker": worker.get_status() if worker else None,
        "ai_watchdogs": ai_watchdog_status(),
        "wrote_setpoints": False,
    }


@router.post("/ai/pipeline/run")
async def pipeline_run(
    zone_id: str = Query(default="ZONE-01"),
    building_id: Optional[str] = Query(default=None),
    retrain_lstm: bool = Query(default=False),
    auto_dispatch: Optional[bool] = Query(default=None),
):
    from backend.ai.pipeline.orchestrator import run_pipeline_cycle

    return run_pipeline_cycle(
        zone_id,
        building_id=building_id,
        force_rls=True,
        retrain_lstm=retrain_lstm,
        auto_dispatch=auto_dispatch,
    )


@router.get("/ai/llm/status")
async def llm_status():
    from backend.ai.llm.hook import status

    return status()


class LlmExplainRequest(BaseModel):
    zone_id: str = "ZONE-01"
    decision_id: Optional[str] = None


@router.post("/ai/llm/explain")
async def llm_explain(req: LlmExplainRequest):
    """Free-tier LLM narrative for last Safe RL decision (does not change optimizer)."""
    from backend.ai.llm.hook import explain_safe_rl_decision

    return explain_safe_rl_decision(req.decision_id, zone_id=req.zone_id or "ZONE-01")


@router.post("/rules/evaluate")
async def rules_evaluate(req: RulesEvaluateRequest):
    """Dry-run Rule Engine checklist — no BMS write."""
    from backend.rules.engine import evaluate

    return evaluate(
        {
            "point_id": req.point_id,
            "old_value": req.old_value,
            "new_value": req.new_value,
            "target_value": req.new_value,
            "opportunity_id": req.opportunity_id,
            "zone_id": req.zone_id,
            "building_id": req.building_id,
            "action": req.action or "EVALUATE",
            "schedule_hour": req.schedule_hour,
            "compressor_runtime_minutes": req.compressor_runtime_minutes,
            "compressor_offtime_minutes": req.compressor_offtime_minutes,
            "decision": "OPTIMIZE",
            "safety": {"status": "PASS", "passed": True},
            "confidence": 0.9,
        }
    )


@router.get("/rules/audit")
async def rules_audit(limit: int = Query(default=20, ge=1, le=100)):
    from backend.rules.audit import list_rule_audits

    rows = list_rule_audits(limit)
    return {"audits": rows, "count": len(rows)}

