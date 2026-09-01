"""Process isolation + per-AI service heartbeats (Stage H5)."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_HEARTBEAT_PATH = os.getenv(
    "HVAC_WATCHDOG_FILE",
    os.path.join(os.path.dirname(__file__), "..", "..", "database", "worker_heartbeat.txt"),
)
STALE_S = float(os.getenv("HVAC_WATCHDOG_STALE_SECONDS", "0")) or None
AI_STALE_S = float(os.getenv("HVAC_AI_WATCHDOG_STALE_SECONDS", "600"))


def _pipeline_interval_seconds() -> float:
    try:
        return max(5.0, float(os.getenv("HVAC_AI_PIPELINE_INTERVAL_SECONDS", "60")))
    except (TypeError, ValueError):
        return 60.0


def _control_stale_seconds() -> float:
    """Control/ai_pipeline beat once per pipeline cycle — stale must exceed interval."""
    if STALE_S is not None and STALE_S > 0:
        return STALE_S
    interval = _pipeline_interval_seconds()
    return max(90.0, interval * 2.0 + 15.0)

_SERVICES = ("control", "ai_pipeline", "rls", "lstm", "safe_rl", "rules")
_beats: Dict[str, Dict[str, Any]] = {s: {"ts": None, "note": "not-started"} for s in _SERVICES}
# Legacy single-slot for control (also mirrored into _beats["control"])
_last = {"ts": None, "alive": False, "note": "not-started"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def beat(note: str = "ok", service: str = "control") -> None:
    """Record heartbeat for a named service. Default service=control (write gate)."""
    svc = (service or "control").strip() or "control"
    if svc not in _beats:
        _beats[svc] = {"ts": None, "note": "not-started"}
    ts = _now_iso()
    _beats[svc] = {"ts": ts, "note": note}
    if svc == "control":
        _last["ts"] = ts
        _last["alive"] = True
        _last["note"] = note
        try:
            with open(_HEARTBEAT_PATH, "w", encoding="utf-8") as f:
                f.write(ts + "\n" + note)
        except Exception:
            pass


def _age_seconds(ts: Optional[str]) -> Optional[float]:
    if not ts:
        return None
    try:
        then = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if then.tzinfo:
            then = then.replace(tzinfo=None)
        return (datetime.now(timezone.utc).replace(tzinfo=None) - then).total_seconds()
    except Exception:
        return None


def watchdog_status() -> Dict[str, Any]:
    ts = _last.get("ts") or (_beats.get("control") or {}).get("ts")
    age = _age_seconds(ts)
    stale_limit = _control_stale_seconds()
    alive = bool(age is not None and age <= stale_limit)
    return {
        "alive": alive,
        "ageSeconds": age,
        "note": _last.get("note") or (_beats.get("control") or {}).get("note"),
        "lastBeat": ts,
        "holdWrites": not alive,
        "services": ai_watchdog_status(),
    }


def ai_watchdog_status() -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for svc in _SERVICES:
        slot = _beats.get(svc) or {}
        age = _age_seconds(slot.get("ts"))
        stale_limit = _control_stale_seconds() if svc in ("control", "ai_pipeline") else AI_STALE_S
        ok = bool(age is not None and age <= stale_limit)
        out[svc] = {
            "ok": ok,
            "status": "OK" if ok else ("STALE" if age is not None else "NEVER"),
            "ageSeconds": age,
            "note": slot.get("note"),
            "lastBeat": slot.get("ts"),
            "stale_seconds": stale_limit,
        }
    return out


def allow_autonomous_writes() -> bool:
    st = watchdog_status()
    return bool(st.get("alive")) and os.getenv("HVAC_SAFE_MODE", "0") not in ("1", "true", "TRUE")


def reset_beats_for_tests() -> None:
    for s in list(_beats.keys()):
        _beats[s] = {"ts": None, "note": "not-started"}
    _last["ts"] = None
    _last["alive"] = False
    _last["note"] = "not-started"
