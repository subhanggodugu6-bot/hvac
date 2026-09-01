"""Summarize NB2 pipeline stages for operator UI."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def _tone(status: str, *, data_ok: bool = True) -> str:
    if not data_ok:
        return "bad" if str(status or "").upper() in ("NO DATA", "NEVER", "DISABLED", "BLOCKED") else "warn"
    s = str(status or "").upper()
    if s in ("READY", "OK", "LIVE", "MODEL_READY", "VERIFIED", "ENABLED", "SIM WRITE ENABLED", "GATED"):
        return "good"
    if s in ("WARMING", "SIMULATED", "STALE", "ADVISORY", "PROPOSED", "INPUTS_MISSING"):
        return "warn"
    if s in ("BLOCKED", "REJECTED", "BAD", "OFFLINE", "ERROR", "NEVER", "NO DATA", "MODEL_NOT_AVAILABLE", "DISABLED"):
        return "bad"
    return "muted"


def _stage(
    *,
    id: str,
    label: str,
    title: str,
    status: str,
    detail: str,
    data_ok: bool,
    missing: List[str],
    href: str,
    metrics: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "id": id,
        "label": label,
        "title": title,
        "status": status,
        "detail": detail,
        "data_ok": data_ok,
        "missing": missing,
        "metrics": metrics or {},
        "tone": _tone(status, data_ok=data_ok),
        "href": href,
    }


def pipeline_stages_summary(zone_id: str = "ZONE-01") -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    from backend.workers.watchdog import ai_watchdog_status

    wd = ai_watchdog_status() or {}
    missing_all: List[str] = []

    # — RLS —
    rls_status = "NO DATA"
    rls_detail = "Online learning — no setpoint writes"
    rls_missing: List[str] = []
    rls_metrics: Dict[str, Any] = {"ready": 0, "warming": 0, "live_warning": 0}
    try:
        from backend.ai.rls.service import list_status

        rows = list_status(zone_id)
        ready_n = sum(1 for r in rows if str(r.get("status") or "").upper() == "READY")
        warm_n = sum(1 for r in rows if str(r.get("status") or "").upper() == "WARMING")
        live_warn = sum(
            1
            for r in rows
            if str(r.get("source_mode") or "").upper() == "LIVE_BMS"
            and str(r.get("status") or "").upper() != "READY"
        )
        rls_metrics = {"ready": ready_n, "warming": warm_n, "live_warning": live_warn, "total": len(rows)}
        if not rows:
            rls_missing.append("No RLS model rows — need normalized telemetry samples")
        if live_warn:
            rls_missing.append(f"LIVE_BMS models not ready ({live_warn}) — map live BMS or stay on SIM")
        if ready_n >= 2:
            rls_status = "READY"
            rls_detail = f"{ready_n}/{len(rows) or ready_n} models READY (SIM)"
        elif warm_n or rows:
            rls_status = "WARMING"
            rls_detail = f"{warm_n or len(rows)} model(s) warming — need {max(1, 20)} updates"
        if ready_n == 0 and rows:
            rls_missing.append("Zero READY models — run pipeline cycle or wait for RLS ticks")
    except Exception as exc:
        rls_missing.append(f"RLS status error: {type(exc).__name__}")

    rls_wd = wd.get("rls") or {}
    if rls_wd.get("status") == "OK" and rls_status == "NO DATA":
        rls_status = "WARMING"

    # — LSTM —
    lstm_status = "NO DATA"
    lstm_detail = "Advisory forecast — no setpoint writes"
    lstm_missing: List[str] = []
    lstm_metrics: Dict[str, Any] = {"ready": 0, "not_available": 0, "torch": False}
    try:
        from backend.ai.lstm.status import list_status as lstm_list_status

        payload = lstm_list_status()
        models = payload.get("models") or []
        ready = [m for m in models if str(m.get("status") or "") == "MODEL_READY"]
        na = [m for m in models if str(m.get("status") or "") == "MODEL_NOT_AVAILABLE"]
        lstm_metrics = {
            "ready": len(ready),
            "not_available": len(na),
            "torch": bool(payload.get("torch")),
            "targets": len(models),
        }
        if ready:
            lstm_status = "READY"
            lstm_detail = f"{len(ready)}/{len(models)} targets MODEL_READY"
        elif not payload.get("torch"):
            lstm_status = "ADVISORY"
            lstm_detail = "Heuristic mode — install torch + POST /ai/lstm/train"
            lstm_missing.append("PyTorch not installed — LSTM uses template/heuristic only")
        elif models:
            lstm_status = "WARMING"
            lstm_detail = "Train on historian — POST /api/platform/ai/lstm/train"
        if na:
            for m in na:
                lstm_missing.append(f"{m.get('target')}: MODEL_NOT_AVAILABLE")
        if not ready:
            lstm_missing.append("No LSTM forecast series — train when >=48h GOOD samples exist")
    except Exception as exc:
        lstm_missing.append(f"LSTM status error: {type(exc).__name__}")

    # — Safe RL —
    safe_status = "NO DATA"
    safe_detail = "Recommend only — no direct writes"
    safe_missing: List[str] = []
    safe_metrics: Dict[str, Any] = {}
    try:
        from backend.ai.safe_rl.status import readiness_status

        safe = readiness_status(zone_id)
        safe_status = str(safe.get("readiness") or "NO DATA").upper()
        safe_metrics = {
            "rls_ready": bool(safe.get("rls_ready")),
            "lstm_ready": bool(safe.get("lstm_ready")),
            "telemetry_ok": bool(safe.get("telemetry_ok")),
        }
        last = safe.get("last_decision") or {}
        if last.get("status"):
            safe_detail = f"Last decision: {last.get('status')}"
        if not safe.get("telemetry_ok"):
            safe_missing.append("Telemetry inputs missing for Safe RL state")
        if not safe.get("rls_ready"):
            safe_missing.append("RLS not ready — Safe RL uses degraded priors")
        if not safe.get("lstm_ready"):
            safe_missing.append("LSTM not MODEL_READY — forecast uses heuristics")
        if safe.get("safe_mode"):
            safe_missing.append("Safe mode ON — recommendations blocked")
        if str(last.get("status") or "").upper() == "BLOCKED":
            safe_missing.append("Last recommend BLOCKED — check inputs or rules")
    except Exception as exc:
        safe_missing.append(f"Safe RL status error: {type(exc).__name__}")

    # — Rule Engine —
    rules_wd = wd.get("rules") or {}
    rules_status = str(rules_wd.get("status") or "NEVER").upper()
    rules_detail = "R01–R10 checklist gate"
    rules_missing: List[str] = []
    try:
        from backend.rules.audit import list_rule_audits

        recent = list_rule_audits(5)
        rejected = sum(
            1
            for a in recent
            if "REJECTED" in str(a.get("action") or a.get("decision") or "").upper()
        )
        if rules_status == "OK":
            rules_status = "READY"
            rules_detail = "Checklist gate active"
        elif rules_status == "NEVER":
            rules_detail = "Run Evaluate on last Safe RL action"
            rules_missing.append("No Rule Engine heartbeat — run evaluate or pipeline cycle")
        if rejected and recent:
            rules_detail = f"Last {rejected}/{len(recent)} audits REJECTED"
            rules_missing.append("Recent rule checks REJECTED — review checklist on /ml")
    except Exception:
        if rules_status == "NEVER":
            rules_missing.append("Awaiting first evaluate cycle")

    # — BMS Control —
    bms_status = "ADVISORY"
    bms_detail = "Stage G allowlist + operator approve"
    bms_missing: List[str] = []
    bms_metrics: Dict[str, Any] = {}
    try:
        from backend.bms.stage_g import stage_g_status
        from backend.services.platform_bms_service import control_writes_status

        sg = stage_g_status()
        ctrl = str(control_writes_status() or "").upper()
        allowlist = sg.get("allowlist") or []
        bms_metrics = {"allowlist_points": len(allowlist), "prerequisites_ok": bool(sg.get("ok"))}
        if "SIM WRITE" in ctrl or "LIVE WRITE" in ctrl:
            bms_status = ctrl.replace("_", " ")
            bms_detail = f"Allowlist: {len(allowlist)} point(s)"
        elif sg.get("ok"):
            bms_status = "GATED"
            bms_detail = "Prerequisites OK — writes gated until APPROVED"
        else:
            bms_status = "DISABLED"
            reason = str(sg.get("reason") or "Write prerequisites not met")
            bms_detail = reason[:80]
            bms_missing.append(reason[:120])
        if not allowlist:
            bms_missing.append("Stage G allowlist empty — configure HVAC_STAGE_G_WRITABLE_POINTS")
    except Exception as exc:
        bms_missing.append(f"BMS status error: {type(exc).__name__}")

    ctrl_wd = wd.get("control") or {}
    if ctrl_wd.get("status") == "STALE":
        bms_status = "STALE"
        bms_detail = "Control worker heartbeat stale"
        bms_missing.append("Control heartbeat STALE — restart worker or check HVAC_START_CONTROL_WORKER")

    stages = [
        _stage(
            id="rls",
            label="RLS",
            title="Online Learning",
            status=rls_status,
            detail=rls_detail,
            data_ok=len(rls_missing) == 0 and rls_status in ("READY", "WARMING"),
            missing=rls_missing,
            href="/ml#stage-rls",
            metrics=rls_metrics,
        ),
        _stage(
            id="lstm",
            label="LSTM",
            title="Forecast",
            status=lstm_status,
            detail=lstm_detail,
            data_ok=lstm_status == "READY",
            missing=lstm_missing,
            href="/ml#stage-lstm",
            metrics=lstm_metrics,
        ),
        _stage(
            id="safe_rl",
            label="Safe RL",
            title="Optimizer",
            status=safe_status,
            detail=safe_detail,
            data_ok=safe_status == "READY" and len(safe_missing) == 0,
            missing=safe_missing,
            href="/ml#stage-safe-rl",
            metrics=safe_metrics,
        ),
        _stage(
            id="rules",
            label="Rule Engine",
            title="Safety Gate",
            status=rules_status,
            detail=rules_detail,
            data_ok=rules_status == "READY" and len(rules_missing) == 0,
            missing=rules_missing,
            href="/ml#stage-rules",
        ),
        _stage(
            id="bms",
            label="BMS Control",
            title="Stage G Writes",
            status=bms_status,
            detail=bms_detail,
            data_ok=bms_status not in ("DISABLED", "STALE", "NO DATA") and len(bms_missing) == 0,
            missing=bms_missing,
            href="/platform/bms#stage-g",
            metrics=bms_metrics,
        ),
    ]

    ready_n = sum(1 for s in stages if s.get("data_ok"))
    gaps = [f"{s['label']}: {m}" for s in stages for m in (s.get("missing") or [])]
    missing_all = gaps

    health = {
        "ready_stages": ready_n,
        "total_stages": len(stages),
        "all_ok": ready_n == len(stages) and not gaps,
        "gap_count": len(gaps),
        "missing_items": gaps[:12],
    }
    return stages, health
