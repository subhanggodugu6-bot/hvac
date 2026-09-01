"""Startup fixes for NB2 pipeline gaps in demo/production."""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict


def bootstrap_pipeline(*, delay_seconds: float = 25.0) -> None:
    """Run after sim telemetry has seeded — consolidates RLS rows and runs one pipeline cycle."""
    if os.getenv("HVAC_SKIP_PIPELINE_BOOTSTRAP", "0").strip() in ("1", "true", "TRUE"):
        return

    def _run() -> None:
        time.sleep(max(5.0, delay_seconds))
        summary: Dict[str, Any] = {"rls_consolidated": 0, "pipeline": None}
        try:
            from backend.ai.rls.service import consolidate_demo_rls_rows

            summary["rls_consolidated"] = consolidate_demo_rls_rows("ZONE-01")
        except Exception as exc:
            summary["rls_error"] = type(exc).__name__
        try:
            from backend.ai.pipeline.orchestrator import run_pipeline_cycle

            summary["pipeline"] = run_pipeline_cycle(
                "ZONE-01",
                force_rls=True,
                retrain_lstm=False,
                auto_dispatch=False,
            )
        except Exception as exc:
            summary["pipeline_error"] = type(exc).__name__
        try:
            from backend.services.logging_service import log_event

            log_event("INFO", "ai-pipeline", "BOOTSTRAP_DONE", extra=summary)
        except Exception:
            pass

    threading.Thread(target=_run, name="nb2-pipeline-bootstrap", daemon=True).start()
