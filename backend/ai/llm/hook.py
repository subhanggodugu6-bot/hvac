"""LLM operator narrative (separate from NB2 optimizer)."""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from backend.ai.llm.prompt import build_explanation_prompt
from backend.ai.llm.providers import generate_explanation, list_free_providers


def is_enabled() -> bool:
    return os.getenv("HVAC_LLM_ENABLED", "0").strip() in ("1", "true", "TRUE", "yes")


def status() -> Dict[str, Any]:
    return {
        "enabled": is_enabled(),
        "provider": os.getenv("HVAC_LLM_PROVIDER", "auto"),
        "model": os.getenv("HVAC_LLM_MODEL", ""),
        "free_options": list_free_providers(),
        "wrote_setpoints": False,
        "note": "Narrative only — does not change NB2 optimizer scores or BMS writes.",
    }


def explain_decision(
    context: Dict[str, Any],
    *,
    zone_id: str = "ZONE-01",
) -> Optional[Dict[str, Any]]:
    """Return explanation payload. None when HVAC_LLM_ENABLED=0."""
    if not is_enabled():
        return None
    prompt = build_explanation_prompt(context, zone_id=zone_id)
    result = generate_explanation(prompt, context)
    return {
        "zone_id": zone_id,
        "explanation": result.get("text"),
        "provider": result.get("provider"),
        "model": result.get("model"),
        "fallback": result.get("fallback"),
        "errors": result.get("errors") or [],
        "wrote_setpoints": False,
    }


def explain_safe_rl_decision(
    decision_id: Optional[str] = None,
    *,
    zone_id: str = "ZONE-01",
) -> Dict[str, Any]:
    """Explain a Safe RL decision by id or latest for zone."""
    from backend.ai.safe_rl.status import get_decision, readiness_status

    if decision_id:
        row = get_decision(decision_id)
        if not row:
            return {"code": "NOT_FOUND", "decision_id": decision_id, "wrote_setpoints": False}
        context = {
            "status": row.get("status"),
            "confidence": row.get("confidence"),
            "chosen_action": row.get("chosen_action"),
            "winner": row.get("chosen_action"),
            "rejected_actions": row.get("rejected_actions"),
            "constraints": row.get("constraints"),
            "last_decision": row,
            "state_snapshot": row.get("state_snapshot"),
        }
        snap = row.get("state_snapshot") or {}
        if isinstance(snap, dict):
            context.update({k: snap.get(k) for k in ("rls", "lstm", "normalized", "telemetry_ok") if k in snap})
    else:
        st = readiness_status(zone_id)
        ld = st.get("last_decision") or {}
        context = {
            **st,
            "last_decision": ld,
            "winner": ld.get("chosen_action"),
            "chosen_action": ld.get("chosen_action"),
        }

    if not is_enabled():
        return {
            "code": "LLM_DISABLED",
            "message": "Set HVAC_LLM_ENABLED=1 to use free LLM narrative.",
            "free_options": list_free_providers(),
            "wrote_setpoints": False,
        }

    out = explain_decision(context, zone_id=zone_id) or {}
    return {"code": "OK", **out, "decision_id": decision_id or (context.get("last_decision") or {}).get("decision_id")}
