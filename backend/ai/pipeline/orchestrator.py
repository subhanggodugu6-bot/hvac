"""NB2 pipeline: RLS → LSTM → Safe RL → Rule Engine → BMS Control."""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from backend.services.logging_service import log_event


def _zones() -> List[str]:
    raw = os.getenv("HVAC_AI_PIPELINE_ZONES", "ZONE-01")
    return [z.strip() for z in raw.split(",") if z.strip()] or ["ZONE-01"]


def auto_dispatch_enabled() -> bool:
    explicit = os.getenv("HVAC_AI_PIPELINE_AUTO_DISPATCH")
    if explicit is not None:
        return explicit.strip() in ("1", "true", "TRUE", "yes")
    sim_mode = os.getenv("HVAC_BMS_MODE", "simulation").strip().lower() in (
        "simulation",
        "sim",
        "simulator",
    )
    return sim_mode and os.getenv("HVAC_ALLOW_SIM_WRITES", "0").strip() in ("1", "true", "TRUE")


def run_rls_stage(
    zone_id: str = "ZONE-01",
    *,
    building_id: Optional[str] = None,
    force: bool = False,
) -> Dict[str, Any]:
    from backend.ai.rls.runner import tick_debounced, tick

    if force:
        return tick(zone_id=zone_id, building_id=building_id)
    result = tick_debounced(zone_id=zone_id, building_id=building_id, force=force)
    return result or {"updated": 0, "skipped": True, "wrote_setpoints": False}


def run_lstm_stage(
    zone_id: str = "ZONE-01",
    *,
    retrain: bool = False,
) -> Dict[str, Any]:
    """Forecast after RLS enrichment; optionally retrain on historian."""
    out: Dict[str, Any] = {"retrain": None, "forecast": None, "wrote_setpoints": False}
    if retrain:
        from backend.ai.lstm.train import maybe_retrain_lstm

        out["retrain"] = maybe_retrain_lstm(zone_id=zone_id)
    from backend.ai.lstm.infer import forecast

    out["forecast"] = forecast(zone_id=zone_id, lookback_min=60, targets=["zone_temp", "hvac_power"])
    try:
        from backend.workers.watchdog import beat

        beat(note="forecast", service="lstm")
    except Exception:
        pass
    return out


def run_safe_rl_stage(
    zone_id: str = "ZONE-01",
    *,
    building_id: Optional[str] = None,
) -> Dict[str, Any]:
    from backend.ai.safe_rl.service import recommend

    return recommend(zone_id=zone_id, building_id=building_id)


def dispatch_proposed_commands(
    safe_rl_result: Dict[str, Any],
    *,
    approved_by: str = "ai_pipeline",
) -> List[Dict[str, Any]]:
    """Stage G: approve → apply (Rule Engine inside apply) → verify."""
    from backend.agents.runtime.approval import approve_command
    from backend.agents.runtime.apply import apply_setpoint
    from backend.agents.runtime.command import get_command
    from backend.agents.runtime.verification import verify_command
    from backend.bms.stage_g import point_allowed, prerequisites_ok
    from backend.services.platform_bms_service import platform_snapshot

    if safe_rl_result.get("code") not in (None, "OK"):
        return []
    if safe_rl_result.get("status") not in (None, "PROPOSED"):
        return []
    mapped = safe_rl_result.get("mapped_commands") or []
    outcomes: List[Dict[str, Any]] = []
    snap = platform_snapshot()
    tel = snap.get("telemetry") or {}

    for cmd in mapped:
        cmd_id = str(cmd.get("command_id") or "")
        if not cmd_id:
            continue
        point_id = str(cmd.get("point_id") or "")
        new_value = cmd.get("new_value")
        if new_value is None:
            outcomes.append({"command_id": cmd_id, "stage": "dispatch", "ok": False, "reason": "MISSING_VALUES"})
            continue
        if not point_allowed(point_id):
            outcomes.append(
                {
                    "command_id": cmd_id,
                    "stage": "dispatch",
                    "ok": False,
                    "reason": "STAGE_G_POINT_NOT_ALLOWED",
                    "point_id": point_id,
                }
            )
            continue
        gate = prerequisites_ok(point_id)
        if not gate.get("ok"):
            outcomes.append(
                {
                    "command_id": cmd_id,
                    "stage": "dispatch",
                    "ok": False,
                    "reason": "STAGE_G_PREREQS",
                    "prerequisites": gate,
                }
            )
            continue

        ok, reason, approved = approve_command(cmd_id, approved_by=approved_by)
        if not ok and reason != "ALREADY_APPROVED":
            outcomes.append({"command_id": cmd_id, "stage": "approve", "ok": False, "reason": reason})
            continue

        full = get_command(cmd_id) or approved or cmd
        context = {
            "action": "APPLY",
            "opportunity_id": full.get("opportunity"),
            "point_id": point_id,
            "old_value": full.get("old_value"),
            "current_value": full.get("old_value"),
            "new_value": float(new_value),
            "target_value": float(new_value),
            "approval_status": "APPROVED",
            "mode": "SUPERVISED",
            "source": tel.get("source"),
            "telemetry": {
                "source": tel.get("source"),
                "quality": tel.get("quality"),
                "age_seconds": tel.get("ageSeconds"),
            },
            "supervisory": {"decision": "OPTIMIZE", "confidence": safe_rl_result.get("confidence") or 0.9},
            "safety": {"status": snap.get("safety"), "passed": snap.get("safety") == "PASS"},
            "decision_id": safe_rl_result.get("decision_id"),
        }
        applied, apply_reason = apply_setpoint(cmd_id, point_id, float(new_value), context)
        if not applied:
            outcomes.append({"command_id": cmd_id, "stage": "apply", "ok": False, "reason": apply_reason})
            continue
        verified, verify_reason = verify_command(cmd_id)
        outcomes.append(
            {
                "command_id": cmd_id,
                "stage": "verify",
                "ok": verified,
                "reason": verify_reason,
                "point_id": point_id,
                "new_value": float(new_value),
            }
        )
    return outcomes


def run_pipeline_cycle(
    zone_id: str = "ZONE-01",
    *,
    building_id: Optional[str] = None,
    force_rls: bool = False,
    retrain_lstm: bool = False,
    auto_dispatch: Optional[bool] = None,
) -> Dict[str, Any]:
    """Full NB2 cycle for one zone."""
    building_id = building_id or os.getenv("HVAC_DEFAULT_BUILDING_ID") or "bldg-corp-hq-01"
    stages: Dict[str, Any] = {}

    try:
        stages["rls"] = run_rls_stage(zone_id, building_id=building_id, force=force_rls)
    except Exception as exc:
        stages["rls"] = {"error": type(exc).__name__, "wrote_setpoints": False}
        log_event("ERROR", "ai-pipeline", "RLS_FAIL", extra={"zone_id": zone_id, "error": type(exc).__name__})

    try:
        stages["lstm"] = run_lstm_stage(zone_id, retrain=retrain_lstm)
    except Exception as exc:
        stages["lstm"] = {"error": type(exc).__name__, "wrote_setpoints": False}
        log_event("ERROR", "ai-pipeline", "LSTM_FAIL", extra={"zone_id": zone_id, "error": type(exc).__name__})

    try:
        stages["safe_rl"] = run_safe_rl_stage(zone_id, building_id=building_id)
    except Exception as exc:
        stages["safe_rl"] = {"error": type(exc).__name__, "code": "ERROR", "wrote_setpoints": False}
        log_event("ERROR", "ai-pipeline", "SAFE_RL_FAIL", extra={"zone_id": zone_id, "error": type(exc).__name__})

    dispatch = auto_dispatch if auto_dispatch is not None else auto_dispatch_enabled()
    stages["dispatch"] = []
    wrote = False
    if dispatch and isinstance(stages.get("safe_rl"), dict):
        try:
            stages["dispatch"] = dispatch_proposed_commands(stages["safe_rl"])
            wrote = any(
                d.get("stage") == "verify" and d.get("ok")
                for d in stages["dispatch"]
            )
        except Exception as exc:
            stages["dispatch"] = [{"ok": False, "error": type(exc).__name__}]
            log_event("ERROR", "ai-pipeline", "DISPATCH_FAIL", extra={"zone_id": zone_id, "error": type(exc).__name__})

    code = stages.get("safe_rl", {}).get("code") if isinstance(stages.get("safe_rl"), dict) else None
    return {
        "zone_id": zone_id,
        "building_id": building_id,
        "pipeline": "RLS→LSTM→SafeRL→Rules→BMS",
        "code": code or "OK",
        "stages": stages,
        "auto_dispatch": dispatch,
        "wrote_setpoints": wrote,
    }


def run_learn_cycle(
    zone_id: str = "ZONE-01",
    *,
    building_id: Optional[str] = None,
    force_rls: bool = False,
) -> Dict[str, Any]:
    """Background learn pass: RLS tick + optional LSTM retrain (no Safe RL dispatch)."""
    rls = run_rls_stage(zone_id, building_id=building_id, force=force_rls)
    lstm = run_lstm_stage(zone_id, retrain=True)
    return {"zone_id": zone_id, "rls": rls, "lstm": lstm, "wrote_setpoints": False}


def run_all_zones(
    *,
    building_id: Optional[str] = None,
    force_rls: bool = False,
    retrain_lstm: bool = False,
    auto_dispatch: Optional[bool] = None,
) -> Dict[str, Any]:
    results = [
        run_pipeline_cycle(
            z,
            building_id=building_id,
            force_rls=force_rls,
            retrain_lstm=retrain_lstm,
            auto_dispatch=auto_dispatch,
        )
        for z in _zones()
    ]
    wrote = any(r.get("wrote_setpoints") for r in results)
    return {"zones": results, "wrote_setpoints": wrote}
