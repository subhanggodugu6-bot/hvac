"""Embedded NB2 AI pipeline worker (RLS → LSTM → Safe RL → Rules → BMS)."""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime
from typing import Any, Dict, Optional

from backend.services.logging_service import log_event

_worker: Optional["AiPipelineWorker"] = None


class AiPipelineWorker:
    def __init__(self, interval_seconds: int = 60):
        self.interval_seconds = max(5, int(interval_seconds))
        self.is_running = False
        self.worker_thread: Optional[threading.Thread] = None
        self.cycle_count = 0
        self.last_cycle_timestamp: Optional[datetime] = None
        self.last_result: Dict[str, Any] = {}
        self.last_summary = "AI pipeline worker initialized"

    def start(self) -> None:
        if self.is_running:
            return
        self.is_running = True
        self.worker_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.worker_thread.start()
        log_event("INFO", "ai-pipeline-worker", "STARTED", extra={"interval_seconds": self.interval_seconds})

    def stop(self) -> None:
        self.is_running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=2.0)
        log_event("INFO", "ai-pipeline-worker", "STOPPED")

    def _run_loop(self) -> None:
        while self.is_running:
            try:
                self.execute_cycle()
            except Exception as exc:
                log_event("ERROR", "ai-pipeline-worker", "CYCLE_FAIL", extra={"error": type(exc).__name__})
                self.last_summary = f"Cycle error: {type(exc).__name__}"
            time.sleep(self.interval_seconds)

    def execute_cycle(self) -> Dict[str, Any]:
        from backend.ai.pipeline.orchestrator import run_all_zones
        from backend.services.hvac_safety_contract import is_safe_mode
        from backend.workers.watchdog import allow_autonomous_writes, beat

        self.cycle_count += 1
        self.last_cycle_timestamp = datetime.utcnow()
        beat(f"cycle-{self.cycle_count}", service="ai_pipeline")
        beat(f"cycle-{self.cycle_count}", service="control")

        if is_safe_mode() or not allow_autonomous_writes():
            self.last_summary = f"Cycle #{self.cycle_count} held (SAFE_MODE or watchdog)"
            self.last_result = {"held": True, "wrote_setpoints": False}
            return self.last_result

        retrain = self.cycle_count == 1 or (
            self.cycle_count % max(1, int(os.getenv("HVAC_LSTM_RETRAIN_EVERY_CYCLES", "144") or "144")) == 0
        )
        result = run_all_zones(retrain_lstm=retrain)
        self.last_result = result
        wrote = result.get("wrote_setpoints")
        zones = result.get("zones") or []
        codes = [z.get("code") for z in zones]
        self.last_summary = (
            f"Cycle #{self.cycle_count}: {len(zones)} zone(s), codes={codes}, wrote={wrote}"
        )
        log_event(
            "INFO",
            "ai-pipeline-worker",
            "CYCLE_OK",
            extra={"cycle": self.cycle_count, "wrote_setpoints": wrote, "codes": codes},
        )
        return result

    def get_status(self) -> Dict[str, Any]:
        return {
            "worker_running": self.is_running,
            "interval_seconds": self.interval_seconds,
            "cycle_count": self.cycle_count,
            "last_cycle_time": self.last_cycle_timestamp.isoformat() if self.last_cycle_timestamp else None,
            "last_summary": self.last_summary,
            "last_result": self.last_result,
            "pipeline": "RLS→LSTM→SafeRL→Rules→BMS",
        }


def _interval() -> int:
    try:
        return max(5, int(os.getenv("HVAC_AI_PIPELINE_INTERVAL_SECONDS", "60") or "60"))
    except (TypeError, ValueError):
        return 60


def start() -> None:
    global _worker
    if _worker is None:
        _worker = AiPipelineWorker(interval_seconds=_interval())
    _worker.start()


def stop() -> None:
    global _worker
    if _worker:
        _worker.stop()


def get_worker() -> Optional[AiPipelineWorker]:
    return _worker
