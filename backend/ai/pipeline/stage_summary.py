"""Summarize NB2 pipeline stages for operator UI."""
from __future__ import annotations

import os
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


def _is_demo() -> bool:
    if (os.getenv("HVAC_DEPLOYMENT_MODE") or "").strip().lower() == "demo":
        return True
    try:
        from backend.cloud_env import is_hosted_demo

        if is_hosted_demo():
            return True
    except Exception:
        pass
    try:
        from backend.bms.connection_manager import _mode, is_simulation_mode

        if is_simulation_mode() or _mode() in ("simulation", "simulator", "sim"):
            return True
    except Exception:
        pass
    return False


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
    advisory: Optional[List[str]] = None,
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
        "advisory": advisory or [],
        "metrics": metrics or {},
        "tone": _tone(status, data_ok=data_ok),
        "href": href,
    }


def pipeline_stages_summary(zone_id: str = "ZONE-01") -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    from backend.workers.watchdog import ai_watchdog_status

    wd = ai_watchdog_status() or {}
    demo = _is_demo()

    # — RLS —
    rls_status = "NO DATA"
    rls_detail = "Online learning — no setpoint writes"
    rls_missing: List[str] = []
    rls_advisory: List[str] = []
    rls_metrics: Dict[str, Any] = {"ready": 0, "warming": 0, "live_warning": 0}
    try:
        from backend.ai.rls.service import list_status

        rows = list_status(zone_id)
        sim_rows = [r for r in rows if str(r.get("source_mode") or "").upper() != "LIVE_BMS"]
        ready_n = sum(1 for r in rows if str(r.get("status") or "").upper() == "READY")
        sim_ready = sum(1 for r in sim_rows if str(r.get("status") or "").upper() == "READY")
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
        elif live_warn:
            msg = f"LIVE_BMS models not ready ({live_warn}) — map live BMS or stay on SIM"
            if demo:
                rls_advisory.append(msg)
            else:
                rls_missing.append(msg)
        if sim_ready >= 2 or (demo and sim_ready >= 1):
            rls_status = "READY"
            rls_detail = f"{sim_ready or ready_n}/{len(sim_rows) or len(rows)} SIM models READY"
        elif ready_n >= 2:
            rls_status = "READY"
            rls_detail = f"{ready_n}/{len(rows)} models READY"
        elif warm_n or rows:
            rls_status = "WARMING"
            rls_detail = f"{warm_n or len(rows)} model(s) warming — need {max(1, 20)} updates"
        if ready_n == 0 and sim_ready == 0 and rows:
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
    lstm_advisory: List[str] = []
    lstm_metrics: Dict[str, Any] = {"ready": 0, "not_available": 0, "torch": False}
    try:
        from backend.ai.lstm.status import list_status as lstm_list_status

        payload = lstm_list_status()
        models = payload.get("models") or []
        ready = [m for m in models if str(m.get("status") or "") == "MODEL_READY"]
        na = [m for m in models if str(m.get("status") or "") == "MODEL_NOT_AVAILABLE"]
        has_torch = bool(payload.get("torch"))
        lstm_metrics = {
            "ready": len(ready),
            "not_available": len(na),
            "torch": has_torch,
            "targets": len(models),
        }
        if ready:
            lstm_status = "READY"
            lstm_detail = f"{len(ready)}/{len(models)} targets MODEL_READY"
        elif not has_torch:
            lstm_status = "ADVISORY"
            lstm_detail = "Heuristic forecast — template mode (no PyTorch in image)"
            if demo:
                lstm_advisory.append("PyTorch not installed — LSTM uses template/heuristic only")
                if na:
                    lstm_advisory.append(
                        f"{len(na)} target(s) untrained — POST /api/platform/ai/lstm/train when historian ready"
                    )
            else:
                lstm_missing.append("PyTorch not installed — LSTM uses template/heuristic only")
        elif models:
            lstm_status = "WARMING"
            lstm_detail = "Train on historian — POST /api/platform/ai/lstm/train"
        if na and not demo:
            for m in na:
                lstm_missing.append(f"{m.get('target')}: MODEL_NOT_AVAILABLE")
        if not ready and has_torch and not demo:
            lstm_missing.append("No LSTM forecast series — train when >=48h GOOD samples exist")
    except Exception as exc:
        lstm_missing.append(f"LSTM status error: {type(exc).__name__}")

    # — Safe RL —
    safe_status = "NO DATA"
    safe_detail = "Recommend only — no direct writes"
    safe_missing: List[str] = []
    safe_advisory: List[str] = []
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
        last_st = str(last.get("status") or "").upper()
        if last.get("status"):
            safe_detail = f"Last decision: {last.get('status')}"
        if not safe.get("telemetry_ok"):
            safe_missing.append("Telemetry inputs missing for Safe RL state")
        if not safe.get("rls_ready"):
            if demo:
                safe_advisory.append("RLS warming — Safe RL uses degraded priors")
            else:
                safe_missing.append("RLS not ready — Safe RL uses degraded priors")
        if not safe.get("lstm_ready"):
            if demo:
                safe_advisory.append("LSTM advisory mode — forecast uses heuristics")
            else:
                safe_missing.append("LSTM not MODEL_READY — forecast uses heuristics")
        if safe.get("safe_mode"):
            safe_missing.append("Safe mode ON — recommendations blocked")
        if last_st == "BLOCKED":
            safe_advisory.append("Last recommend BLOCKED — rule gate or inputs (expected in demo)")
    except Exception as exc:
        safe_missing.append(f"Safe RL status error: {type(exc).__name__}")

    # — Rule Engine —
    rules_wd = wd.get("rules") or {}
    rules_status = str(rules_wd.get("status") or "NEVER").upper()
    rules_detail = "R01–R10 checklist gate"
    rules_missing: List[str] = []
    rules_advisory: List[str] = []
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
            if demo:
                rules_status = "READY"
                rules_detail = "Checklist gate ready — run pipeline cycle to exercise"
                rules_advisory.append("No Rule Engine heartbeat yet — run pipeline cycle")
            else:
                rules_detail = "Run Evaluate on last Safe RL action"
                rules_missing.append("No Rule Engine heartbeat — run evaluate or pipeline cycle")
        if rejected and recent:
            rules_detail = f"Last {rejected}/{len(recent)} audits REJECTED"
            rules_advisory.append("Recent rule checks REJECTED — safety gate working (review on /ml)")
    except Exception:
        if rules_status == "NEVER":
            rules_missing.append("Awaiting first evaluate cycle")

    # — BMS Control —
    bms_status = "ADVISORY"
    bms_detail = "Stage G allowlist + operator approve"
    bms_missing: List[str] = []
    bms_advisory: List[str] = []
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
            reason = str(sg.get("reason") or "Write prerequisites not met")
            if demo:
                bms_status = "SIM WRITE ENABLED" if "SIM" in ctrl else "GATED"
                bms_detail = "Demo mode — sim writes gated until APPROVED"
                bms_advisory.append(reason[:120])
            else:
                bms_status = "DISABLED"
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
    elif ctrl_wd.get("status") == "OK" and bms_status in ("GATED", "ADVISORY"):
        bms_status = "SIM WRITE ENABLED" if demo else bms_status

    stages = [
        _stage(
            id="rls",
            label="RLS",
            title="Online Learning",
            status=rls_status,
            detail=rls_detail,
            data_ok=len(rls_missing) == 0 and rls_status in ("READY", "WARMING"),
            missing=rls_missing,
            advisory=rls_advisory,
            href="/ml#stage-rls",
            metrics=rls_metrics,
        ),
        _stage(
            id="lstm",
            label="LSTM",
            title="Forecast",
            status=lstm_status,
            detail=lstm_detail,
            data_ok=len(lstm_missing) == 0 and lstm_status in ("READY", "ADVISORY", "WARMING"),
            missing=lstm_missing,
            advisory=lstm_advisory,
            href="/ml#stage-lstm",
            metrics=lstm_metrics,
        ),
        _stage(
            id="safe_rl",
            label="Safe RL",
            title="Optimizer",
            status=safe_status,
            detail=safe_detail,
            data_ok=len(safe_missing) == 0 and safe_status in ("READY", "ADVISORY", "PROPOSED", "BLOCKED"),
            missing=safe_missing,
            advisory=safe_advisory,
            href="/ml#stage-safe-rl",
            metrics=safe_metrics,
        ),
        _stage(
            id="rules",
            label="Rule Engine",
            title="Safety Gate",
            status=rules_status,
            detail=rules_detail,
            data_ok=rules_status in ("READY", "OK") and len(rules_missing) == 0,
            missing=rules_missing,
            advisory=rules_advisory,
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
            advisory=bms_advisory,
            href="/platform/bms#stage-g",
            metrics=bms_metrics,
        ),
    ]

    ready_n = sum(1 for s in stages if s.get("data_ok"))
    gaps = [f"{s['label']}: {m}" for s in stages for m in (s.get("missing") or [])]
    advisories = [f"{s['label']}: {a}" for s in stages for a in (s.get("advisory") or [])]

    health = {
        "ready_stages": ready_n,
        "total_stages": len(stages),
        "all_ok": ready_n == len(stages) and not gaps,
        "gap_count": len(gaps),
        "missing_items": gaps[:12],
        "advisory_count": len(advisories),
        "advisory_items": advisories[:12],
        "demo_mode": demo,
    }
    return stages, health
