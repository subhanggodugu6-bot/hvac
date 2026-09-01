"""Background jobs: weather, M&V, retention, NB2 pipeline learn cycle."""
from __future__ import annotations

import os
import time

from backend.services.logging_service import log_event
from backend.workers.retention_worker import archive_old_telemetry


def run_once() -> None:
    log_event("INFO", "job-worker", "JOB_CYCLE")
    try:
        n = archive_old_telemetry()
        log_event("INFO", "job-worker", "RETENTION", extra={"candidates": n})
    except Exception as exc:
        log_event("ERROR", "job-worker", "RETENTION_FAIL", extra={"error": type(exc).__name__})

    try:
        from backend.ai.pipeline.orchestrator import _zones, run_learn_cycle

        for zone_id in _zones():
            learn = run_learn_cycle(zone_id)
            log_event(
                "INFO",
                "job-worker",
                "PIPELINE_LEARN",
                extra={
                    "zone_id": zone_id,
                    "rls_updated": (learn.get("rls") or {}).get("updated"),
                    "wrote_setpoints": False,
                },
            )
    except Exception as exc:
        log_event("ERROR", "job-worker", "PIPELINE_LEARN_FAIL", extra={"error": type(exc).__name__})

    try:
        tick_seconds = float(os.getenv("HVAC_SAFE_RL_TICK_SECONDS", "60") or "0")
        if tick_seconds > 0:
            from backend.ai.pipeline.orchestrator import auto_dispatch_enabled, run_all_zones

            cycle = run_all_zones(retrain_lstm=False, auto_dispatch=auto_dispatch_enabled())
            log_event(
                "INFO",
                "job-worker",
                "PIPELINE_CYCLE",
                extra={
                    "wrote_setpoints": cycle.get("wrote_setpoints"),
                    "zones": len(cycle.get("zones") or []),
                },
            )
    except Exception as exc:
        log_event("ERROR", "job-worker", "PIPELINE_CYCLE_FAIL", extra={"error": type(exc).__name__})

    try:
        from backend.ai.safe_rl.offline import maybe_offline_update

        off = maybe_offline_update()
        if off and off.get("updated"):
            log_event("INFO", "job-worker", "SAFE_RL_OFFLINE", extra={"n": off.get("n"), "wrote_setpoints": False})
    except Exception as exc:
        log_event("ERROR", "job-worker", "SAFE_RL_OFFLINE_FAIL", extra={"error": type(exc).__name__})


if __name__ == "__main__":
    while True:
        run_once()
        time.sleep(int(__import__("os").getenv("HVAC_JOB_INTERVAL_SECONDS", "300")))
