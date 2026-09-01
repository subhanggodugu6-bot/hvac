"""Start embedded control loops: NB2 AI pipeline (default) or legacy scheduling worker."""
from __future__ import annotations

import os


def _use_ai_pipeline() -> bool:
    return os.getenv("HVAC_USE_AI_PIPELINE", "1").strip() in ("1", "true", "TRUE", "yes")


def start() -> None:
    if _use_ai_pipeline():
        from backend.workers.ai_pipeline_worker import start as start_pipeline

        start_pipeline()
        return
    from backend.agents.scheduling_supervisory.worker import control_worker

    control_worker.start()


def stop() -> None:
    if _use_ai_pipeline():
        from backend.workers.ai_pipeline_worker import stop as stop_pipeline

        stop_pipeline()
        return
    from backend.agents.scheduling_supervisory.worker import control_worker

    control_worker.stop()
