"""Startup fixes for NB2 pipeline gaps and O1 scheduling dashboard in demo/production."""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict


def bootstrap_o1(*, delay_seconds: float = 20.0) -> None:
    """Seed O1 config/telemetry and run one daily optimization after sim feed starts."""
    if os.getenv("HVAC_SKIP_O1_BOOTSTRAP", "0").strip() in ("1", "true", "TRUE"):
        return

    def _run() -> None:
        time.sleep(max(8.0, delay_seconds))
        summary: Dict[str, Any] = {}
        try:
            from backend.services.o1_telemetry_service import ensure_point_map_and_config

            ensure_point_map_and_config()
            summary["o1_config"] = "ok"
        except Exception as exc:
            summary["o1_config_error"] = str(exc)[:200]
        try:
            from backend.bms.simulation_telemetry import publish_once
            from backend.services.o1_pipeline import ingest_from_dataset_catalog, run_daily

            publish_once()
            summary["o1_ingest"] = ingest_from_dataset_catalog()
            try:
                from backend.services.simulation_service import sim_service

                sim = sim_service.get_latest_status()
                from backend.services.o1_pipeline import ingest_from_sim

                ingest_from_sim(sim, source="SIMULATION")
            except Exception:
                pass
            out = run_daily(None, persist_sim=False, verify=True)
            summary["o1_run"] = out.get("status")
        except Exception as exc:
            summary["o1_run_error"] = type(exc).__name__
        try:
            from backend.services.scheduling_dashboard_service import ensure_sim_verified_savings

            summary["verified_savings"] = ensure_sim_verified_savings()
        except Exception as exc:
            summary["verified_savings_error"] = type(exc).__name__
        try:
            from backend.services.logging_service import log_event

            log_event("INFO", "o1-bootstrap", "DONE", extra=summary)
        except Exception:
            pass

    threading.Thread(target=_run, name="o1-bootstrap", daemon=True).start()


def bootstrap_pipeline(*, delay_seconds: float = 25.0) -> None:
    """Run after sim telemetry has seeded — consolidates RLS rows and runs one pipeline cycle."""
    if os.getenv("HVAC_SKIP_PIPELINE_BOOTSTRAP", "0").strip() in ("1", "true", "TRUE"):
        bootstrap_o1(delay_seconds=max(5.0, delay_seconds - 5.0))
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
        bootstrap_o1(delay_seconds=3.0)

    threading.Thread(target=_run, name="nb2-pipeline-bootstrap", daemon=True).start()
