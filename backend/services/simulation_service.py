import json
import os
from typing import Any, Dict, List, Optional

from backend.agents.scheduling_supervisory.orchestrator import SupervisoryOrchestrator
from backend.agents.scheduling_supervisory.state import AgentMode
from backend.config.engineering_limits import EngineeringLimitsConfig, DEFAULT_ENGINEERING_LIMITS
from database.session import SessionLocal
from database.models import EngineeringLimitDB
from backend.services.logging_service import log_event


def _simulation_enabled() -> bool:
    return os.getenv("HVAC_USE_SIMULATION", "0").strip() in ("1", "true", "TRUE")


class SimulationService:
    """Manages the continuous simulation runtime, mode switches, approvals, and telemetry history."""

    def __init__(self):
        self.orchestrator = SupervisoryOrchestrator()
        self.engineering_limits: EngineeringLimitsConfig = self._load_limits()
        self.telemetry_history: List[Dict[str, Any]] = []
        self._last_status: Optional[Dict[str, Any]] = None
        self._init_history()

    def _load_limits(self) -> EngineeringLimitsConfig:
        db = SessionLocal()
        try:
            db_lim = db.query(EngineeringLimitDB).filter(EngineeringLimitDB.id == "bldg-corp-hq-01").first()
            if db_lim and db_lim.config_json:
                return EngineeringLimitsConfig(**db_lim.config_json)
        except Exception as exc:
            log_event("ERROR", "simulation", "LOAD_LIMITS_FAILED", extra={"error": type(exc).__name__})
        finally:
            db.close()
        return DEFAULT_ENGINEERING_LIMITS

    def save_limits(self, new_limits: Dict[str, Any]):
        self.engineering_limits = EngineeringLimitsConfig(**new_limits)
        self.orchestrator.safety_engine.limits = self.engineering_limits
        db = SessionLocal()
        try:
            db_lim = db.query(EngineeringLimitDB).filter(EngineeringLimitDB.id == "bldg-corp-hq-01").first()
            if not db_lim:
                db_lim = EngineeringLimitDB(id="bldg-corp-hq-01", config_json=new_limits)
                db.add(db_lim)
            else:
                db_lim.config_json = new_limits
            db.commit()
        finally:
            db.close()

    def _run_cycle(self, elapsed_minutes: int) -> Dict[str, Any]:
        result = self.orchestrator.run_supervisory_cycle(elapsed_minutes=elapsed_minutes)
        self._last_status = result
        return result

    def get_latest_status(self) -> Dict[str, Any]:
        if self._last_status is None:
            self._last_status = self._run_cycle(0)
        return self._last_status

    def _init_history(self):
        if not _simulation_enabled():
            return
        try:
            for _ in range(6):
                self.step(elapsed_minutes=5)
        except Exception as exc:
            log_event("ERROR", "simulation", "INIT_HISTORY_FAILED", extra={"error": type(exc).__name__})

    def step(self, elapsed_minutes: int = 5, minutes: int = None, **kwargs) -> Dict[str, Any]:
        dt = minutes if minutes is not None else elapsed_minutes
        if dt == 0:
            return self.get_latest_status()
        result = self._run_cycle(dt)
        self._record_history(result)
        return result

    def _record_history(self, result: Dict[str, Any]):
        weather = result.get("weather", {})
        plant = result.get("plant", {})
        savings = result.get("savings_summary", {})
        ahus = result.get("ahus", [])
        ahu1 = ahus[0] if ahus else {}

        entry = {
            "time": result.get("simulation_time", "08:00"),
            "oat": weather.get("oat", 22.0),
            "solar": weather.get("solar_irradiance", 400.0),
            "total_plant_tons": plant.get("total_tons", 75.0),
            "ahu1_sat": ahu1.get("sat_actual", 13.0),
            "ahu1_sat_sp": ahu1.get("sat_setpoint", 13.0),
            "ahu1_fan_kw": ahu1.get("fan_power_kw", 10.0),
            "baseline_kw": savings.get("baseline_kw", 65.0),
            "chws_temp": plant.get("chws_temp", 6.8),
            "chws_sp": plant.get("chws_setpoint", 6.7),
            "chwr_temp": plant.get("chwr_temp", 12.2),
            "total_plant_kw": plant.get("total_power_kw", 42.0),
            "optimized_kw": savings.get("actual_kw", 47.0),
            "predicted_kw": savings.get("predicted_kw", 18.5),
            "applied_kw": savings.get("applied_kw", 18.5),
            "verified_kw": savings.get("verified_kw", 18.0),
            "comfort_pct": savings.get("comfort_compliance_pct", 99.8),
        }
        self.telemetry_history.append(entry)
        if len(self.telemetry_history) > 60:
            self.telemetry_history.pop(0)

    def switch_scenario(self, scenario_id: str):
        self.orchestrator = SupervisoryOrchestrator()
        self.orchestrator.safety_engine.limits = self.engineering_limits
        self.telemetry_history.clear()
        self._last_status = None
        self._init_history()

    def set_mode(self, mode_str: str) -> Dict[str, Any]:
        try:
            mode = AgentMode(mode_str) if isinstance(mode_str, str) else mode_str
            if hasattr(self.orchestrator, "set_mode"):
                return self.orchestrator.set_mode(mode)
            elif hasattr(self.orchestrator, "switch_mode"):
                return self.orchestrator.switch_mode(mode)
            self.orchestrator.mode = mode
            return {"success": True, "mode": str(mode)}
        except ValueError:
            return {"success": False, "message": f"Invalid mode {mode_str}"}

    def approve_action(self, action_id: str) -> Dict[str, Any]:
        return self.orchestrator.approve_action(action_id)

    def reject_action(self, action_id: str, reason: str = "Operator rejected") -> Dict[str, Any]:
        return self.orchestrator.reject_action(action_id, reason)


_sim_service: Optional[SimulationService] = None


def get_simulation_service() -> SimulationService:
    global _sim_service
    if _sim_service is None:
        _sim_service = SimulationService()
    return _sim_service


def reset_simulation_service() -> None:
    global _sim_service
    _sim_service = None


class _LazySimulationService:
    """Defer orchestrator startup until simulation is actually used."""

    def __getattr__(self, name: str):
        return getattr(get_simulation_service(), name)


sim_service = _LazySimulationService()
sim_manager = sim_service
