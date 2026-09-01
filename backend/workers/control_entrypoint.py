"""Standalone control-loop process (NB2 AI pipeline or legacy scheduling worker)."""
from __future__ import annotations

import os
import time

from database.session import init_db
from backend.services.logging_service import log_event


def main() -> None:
    init_db()
    use_pipeline = os.getenv("HVAC_USE_AI_PIPELINE", "1").strip() in ("1", "true", "TRUE", "yes")
    if use_pipeline:
        from backend.workers.ai_pipeline_worker import AiPipelineWorker, _interval

        worker = AiPipelineWorker(interval_seconds=_interval())
        worker.start()
        log_event("INFO", "control-worker", "AI_PIPELINE_STARTED")
        try:
            while True:
                time.sleep(30)
        except KeyboardInterrupt:
            worker.stop()
        return

    from backend.agents.scheduling_supervisory.worker import control_worker

    control_worker.start()
    log_event("INFO", "control-worker", "SCHEDULING_STARTED")
    try:
        while True:
            time.sleep(30)
    except KeyboardInterrupt:
        control_worker.stop()


if __name__ == "__main__":
    main()
