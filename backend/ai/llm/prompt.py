"""Build operator prompts from NB2 / Safe RL context."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _fmt(v: Any) -> str:
    if v is None:
        return "—"
    return str(v)


def build_explanation_prompt(
    context: Dict[str, Any],
    *,
    zone_id: str = "ZONE-01",
) -> str:
    winner = context.get("winner") or context.get("chosen_action") or {}
    if not winner and context.get("last_decision"):
        ld = context["last_decision"]
        winner = ld.get("chosen_action") or {}

    constraints = context.get("constraints") or []
    if not constraints and context.get("last_decision"):
        constraints = context["last_decision"].get("constraints") or []

    rejected: List[Dict[str, Any]] = context.get("rejected_actions") or []
    if not rejected and context.get("last_decision"):
        rejected = context["last_decision"].get("rejected_actions") or []

    telemetry = context.get("telemetry") or context.get("normalized") or {}
    rls = context.get("rls") or {}
    lstm = context.get("lstm") or {}

    lines = [
        "You are an HVAC building operations assistant.",
        "Explain the supervisory decision below in 3–5 short sentences for a facility operator.",
        "Use plain language. Do not invent sensor values. If data is missing, say so.",
        "This is ADVISORY — mention that the plant only moves after operator approval and rule checks.",
        "",
        f"Zone: {zone_id}",
        f"Action: {_fmt(winner.get('action_id') or winner.get('label'))}",
        f"Opportunity: {_fmt(winner.get('mapped_opportunity'))}",
        f"Point: {_fmt(winner.get('point_id'))}",
        f"Setpoint change: {_fmt(winner.get('old_value'))} → {_fmt(winner.get('new_value'))}",
        f"Score: {_fmt(winner.get('score'))}",
        f"Confidence: {_fmt(context.get('confidence') or winner.get('confidence'))}",
        f"Constraints: {', '.join(str(c) for c in constraints[:6]) or 'none'}",
        f"Rejected alternatives: {len(rejected)}",
        f"Telemetry quality: {_fmt(telemetry.get('quality'))}",
        f"RLS ready: {_fmt(rls.get('ready'))}",
        f"LSTM forecast available: {'yes' if lstm.get('series') or lstm.get('status') else 'no'}",
        f"Decision status: {_fmt(context.get('status') or (context.get('last_decision') or {}).get('status'))}",
    ]
    return "\n".join(lines)
