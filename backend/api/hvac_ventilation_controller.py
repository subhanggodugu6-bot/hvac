"""Public HVAC Ventilation API for O10–O13."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from backend.services.hvac_ventilation_module import canonical_oid, get_opportunity, get_opportunities, dispatch_gate
from backend.services.ventilation_command_service import ventilation_command_service
from backend.services.ventilation_verification_service import ventilation_verification_service
from backend.services.ventilation_opportunity_service import ventilation_audit_events
from backend.services.platform_ops_service import record_control_audit

router = APIRouter(prefix="/api/hvac/ventilation", tags=["HVAC Ventilation O10–O13"])
SUPPORTED = "O10, O11, O12, O13."


class DispatchRequest(BaseModel):
    target_value: Optional[float] = None
    context: Optional[Dict[str, Any]] = None


def _setpoints(code: str, body: Dict[str, Any]) -> tuple[Any, Any]:
    cur = body.get("current") or {}
    opt = body.get("optimized") or {}
    if code == "O10":
        return cur.get("damperPct"), opt.get("damperPct")
    return cur.get("airflowCfm"), opt.get("airflowCfm")


@router.get("/opportunities")
async def list_opportunities():
    return get_opportunities()


@router.get("/{oid}")
async def get_one(oid: str):
    code = canonical_oid(oid)
    if not code:
        raise HTTPException(status_code=404, detail=f"Unknown ventilation opportunity. Supported: {SUPPORTED}")
    try:
        return get_opportunity(code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{oid}/audit")
async def audit_log(oid: str):
    code = canonical_oid(oid)
    if not code:
        raise HTTPException(status_code=404, detail=f"Unknown ventilation opportunity. Supported: {SUPPORTED}")
    return {"events": ventilation_audit_events(code)}


@router.post("/{oid}/dispatch")
async def dispatch(oid: str, req: DispatchRequest):
    code = canonical_oid(oid)
    if not code:
        raise HTTPException(status_code=404, detail=f"Unknown ventilation opportunity. Supported: {SUPPORTED}")
    body = get_opportunity(code)
    ok, reason, classified = dispatch_gate(body)
    if not ok:
        record_control_audit(user=None, action="DISPATCH_BLOCKED", opportunity_id=code, reason=reason)
        raise HTTPException(
            status_code=409,
            detail={
                "code": classified.get("code") or "DISPATCH_BLOCKED",
                "message": reason,
                "reason": reason,
                "dispatchable": False,
            },
        )
    current, recommended = _setpoints(code, body)
    target = req.target_value
    if target is None:
        target = recommended
    if target is None:
        raise HTTPException(status_code=400, detail="No dispatch target available.")
    ctx = dict(req.context or {})
    ctx.setdefault("bms_online", False)
    ctx.setdefault("current_value", current)
    ctx.setdefault("source", body.get("source") or (body.get("telemetry") or {}).get("source"))
    ctx.setdefault("telemetry", body.get("telemetry") or {})
    try:
        rec = ventilation_command_service.execute_command(code, float(target), ctx)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "DISPATCH_BLOCKED", "message": str(exc), "reason": str(exc), "dispatchable": False},
        ) from exc
    if rec.get("status") == "BLOCKED_BY_SAFETY_GUARDRAIL":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "SAFETY",
                "message": "; ".join(rec.get("violations") or ["Safety guardrails did not pass."]),
                "reason": rec.get("status"),
                "dispatchable": False,
            },
        )
    record_control_audit(user=None, action="DISPATCH", opportunity_id=code, requested_value=target)
    return rec


@router.post("/{oid}/rollback")
async def rollback(oid: str):
    code = canonical_oid(oid)
    if not code:
        raise HTTPException(status_code=404, detail=f"Unknown ventilation opportunity. Supported: {SUPPORTED}")
    body = get_opportunity(code)
    previous, _recommended = _setpoints(code, body)
    result = ventilation_verification_service.rollback_opportunity(
        code, "Operator Manual Rollback", previous_value=previous
    )
    result["previous_state"] = previous
    result["rollback_state"] = result.get("reverted_value")
    result["source"] = "OPERATOR"
    result["verification_status"] = "PENDING"
    result["failSafe"] = body.get("failSafe")
    record_control_audit(user=None, action="ROLLBACK", opportunity_id=code, previous_value=previous)
    return result


@router.post("/{oid}/verify")
async def verify(oid: str):
    code = canonical_oid(oid)
    if not code:
        raise HTTPException(status_code=404, detail=f"Unknown ventilation opportunity. Supported: {SUPPORTED}")
    rec = ventilation_verification_service.verify_opportunity(code)
    record_control_audit(user=None, action="VERIFY", opportunity_id=code)
    return rec
