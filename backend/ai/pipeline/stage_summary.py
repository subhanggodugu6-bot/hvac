"""Summarize NB2 pipeline stages for operator UI."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _tone(status: str) -> str:
    s = str(status or "").upper()
    if s in ("READY", "OK", "LIVE", "MODEL_READY", "VERIFIED", "ENABLED", "SIM WRITE ENABLED"):
        return "good"
    if s in ("WARMING", "SIMULATED", "STALE", "ADVISORY", "PROPOSED", "INPUTS_MISSING"):
        return "warn"
    if s in ("BLOCKED", "REJECTED", "BAD", "OFFLINE", "ERROR", "NEVER", "NO DATA", "MODEL_NOT_AVAILABLE"):
        return "bad"
    return "muted"


def pipeline_stages_summary(zone_id: str = "ZONE-01") -> List[Dict[str, Any]]:
    from backend.workers.watchdog import ai_watchdog_status

    wd = ai_watchdog_status() or {}

    # — RLS —
    rls_status = "NO DATA"
    rls_detail = "Online learning — no setpoint writes"
    try:
        from backend.ai.rls.service import list_status

        rows = list_status(zone_id)
        ready_n = sum(1 for r in rows if str(r.get("status") or "").upper() == "READY")
        warm_n = sum(1 for r in rows if str(r.get("status") or "").upper() == "WARMING")
        if ready_n >= 2:
            rls_status = "READY"
            rls_detail = f"{ready_n} models ready"
        elif warm_n or rows:
            rls_status = "WARMING"
            rls_detail = f"{warm_n or len(rows)} models warming"
    except Exception:
        pass
    rls_wd = wd.get("rls") or {}
    if rls_wd.get("status") == "OK" and rls_status == "NO DATA":
        rls_status = "WARMING"

    # — LSTM —
    lstm_status = "NO DATA"
    lstm_detail = "Advisory forecast — no setpoint writes"
    try:
        from backend.ai.lstm.status import list_status as lstm_list_status

        payload = lstm_list_status()
        models = payload.get("models") or []
        ready = [m for m in models if str(m.get("status") or "") == "MODEL_READY"]
        if ready:
            lstm_status = "READY"
            lstm_detail = f"{len(ready)} target(s) MODEL_READY"
        elif not payload.get("torch"):
            lstm_status = "ADVISORY"
            lstm_detail = "Template/heuristic (torch optional)"
        elif models:
            lstm_status = "WARMING"
            lstm_detail = "Train on historian to reach MODEL_READY"
    except Exception:
        pass

    # — Safe RL —
    safe_status = "NO DATA"
    safe_detail = "Recommend only — no direct writes"
    try:
        from backend.ai.safe_rl.status import readiness_status

        safe = readiness_status(zone_id)
        safe_status = str(safe.get("readiness") or "NO DATA").upper()
        last = safe.get("last_decision") or {}
        if last.get("status"):
            safe_detail = f"Last: {last.get('status')}"
        elif safe.get("rls_ready") and safe.get("lstm_ready"):
            safe_detail = "RLS + LSTM inputs ready"
    except Exception:
        pass

    # — Rule Engine —
    rules_status = str((wd.get("rules") or {}).get("status") or "NEVER").upper()
    rules_detail = "R01–R10 checklist gate"
    if rules_status == "OK":
        rules_status = "READY"
        rules_detail = "Checklist gate active"
    elif rules_status == "NEVER":
        rules_detail = "Awaiting first evaluate cycle"

    # — BMS Control —
    bms_status = "ADVISORY"
    bms_detail = "Stage G allowlist + operator approve"
    try:
        from backend.bms.stage_g import stage_g_status
        from backend.services.platform_bms_service import control_writes_status

        sg = stage_g_status()
        ctrl = str(control_writes_status() or "").upper()
        if "SIM WRITE" in ctrl or "LIVE WRITE" in ctrl:
            bms_status = ctrl.replace("_", " ")
            bms_detail = f"Allowlist: {len(sg.get('allowlist') or [])} point(s)"
        elif sg.get("ok"):
            bms_status = "GATED"
            bms_detail = "Prerequisites OK — writes gated"
        else:
            bms_status = "DISABLED"
            bms_detail = str(sg.get("reason") or "Write prerequisites not met")[:80]
    except Exception:
        pass
    ctrl_wd = wd.get("control") or {}
    if ctrl_wd.get("status") == "STALE":
        bms_status = "STALE"
        bms_detail = "Control heartbeat stale"

    stages = [
        {
            "id": "rls",
            "label": "RLS",
            "title": "Online Learning",
            "status": rls_status,
            "detail": rls_detail,
            "tone": _tone(rls_status),
            "href": "/ml",
        },
        {
            "id": "lstm",
            "label": "LSTM",
            "title": "Forecast",
            "status": lstm_status,
            "detail": lstm_detail,
            "tone": _tone(lstm_status),
            "href": "/ml",
        },
        {
            "id": "safe_rl",
            "label": "Safe RL",
            "title": "Optimizer",
            "status": safe_status,
            "detail": safe_detail,
            "tone": _tone(safe_status),
            "href": "/ml",
        },
        {
            "id": "rules",
            "label": "Rule Engine",
            "title": "Safety Gate",
            "status": rules_status,
            "detail": rules_detail,
            "tone": _tone(rules_status),
            "href": "/ml",
        },
        {
            "id": "bms",
            "label": "BMS Control",
            "title": "Stage G Writes",
            "status": bms_status,
            "detail": bms_detail,
            "tone": _tone(bms_status),
            "href": "/platform/bms",
        },
    ]
    return stages
