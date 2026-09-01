"""Debounced RLS update tick from normalized AI records. Never writes setpoints."""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

_LOCK = threading.Lock()
_LAST_TICK = 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def tick(
    zone_id: str = "ZONE-01",
    *,
    building_id: Optional[str] = None,
    lookback_minutes: int = 30,
    step_seconds: int = 60,
) -> Dict[str, Any]:
    """Run one RLS learning pass. Read-only — does not call command_writer."""
    from backend.ai.rls.service import update_from_records
    from backend.services.ai_normalized_telemetry import build_ai_records

    end = _now()
    start = end - timedelta(minutes=max(5, int(lookback_minutes)))
    payload = build_ai_records(
        zone_id=zone_id or "ZONE-01",
        t0=start.isoformat(),
        t1=end.isoformat(),
        step_seconds=max(15, int(step_seconds)),
        building_id=building_id,
    )
    records = payload.get("records") or []
    # Prefer GOOD; allow STALE already handled in features.row_ok
    result = update_from_records(records, zone_id=zone_id or "ZONE-01", building_id=building_id)
    try:
        from backend.workers.watchdog import beat

        beat(note=f"tick-{int(result.get('updated') or 0)}", service="rls")
    except Exception:
        pass
    return {
        **result,
        "records_used": len(records),
        "t0": payload.get("t0"),
        "t1": payload.get("t1"),
        "wrote_setpoints": False,
    }


def tick_debounced(
    zone_id: str = "ZONE-01",
    *,
    building_id: Optional[str] = None,
    force: bool = False,
) -> Optional[Dict[str, Any]]:
    global _LAST_TICK
    interval = float(os.getenv("HVAC_RLS_TICK_SECONDS", "60") or "60")
    interval = max(5.0, interval)
    now = time.monotonic()
    with _LOCK:
        if not force and (now - _LAST_TICK) < interval:
            return None
        _LAST_TICK = now
    try:
        return tick(zone_id=zone_id, building_id=building_id)
    except Exception as exc:
        return {"updated": 0, "error": type(exc).__name__, "wrote_setpoints": False}


def reset_debounce() -> None:
    global _LAST_TICK
    with _LOCK:
        _LAST_TICK = 0.0
