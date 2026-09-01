"""
PlantControlService: Primary coordinator combining Telemetry, BMS, Safety,
Commands, Verification, Realtime, and Database for Opportunities 5 through 9.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid

try:
    from database.session import SessionLocal
    from database.models import (
        PlantControlTelemetryDB,
        PlantControlDecisionDB,
        PlantControlActionDB,
        PlantControlVerificationDB,
        PlantControlRollbackDB,
        PlantControlRetrofitAssessmentDB,
        PlantControlActivityLogDB
    )
except ImportError:
    from backend.database.session import SessionLocal
    from backend.database.models import (
        PlantControlTelemetryDB,
        PlantControlDecisionDB,
        PlantControlActionDB,
        PlantControlVerificationDB,
        PlantControlRollbackDB,
        PlantControlRetrofitAssessmentDB,
        PlantControlActivityLogDB
    )

from backend.agents.plant_control.plant_control_agent import plant_control_agent
from backend.services.plant_control_telemetry_service import plant_control_telemetry_service
from backend.services.plant_control_bms_service import plant_control_bms_service
from backend.services.plant_control_safety_service import plant_control_safety_service
from backend.services.plant_control_command_service import plant_control_command_service
from backend.services.plant_control_verification_service import plant_control_verification_service
from backend.services.plant_control_realtime_service import plant_control_realtime_service
from backend.services.plant_control_provenance import stamp_plant_provenance

class PlantControlService:
    def __init__(self):
        self.agent = plant_control_agent
        self.telemetry = plant_control_telemetry_service
        self.bms = plant_control_bms_service
        self.safety = plant_control_safety_service
        self.commands = plant_control_command_service
        self.verification = plant_control_verification_service
        self.realtime = plant_control_realtime_service

    def get_dashboard_state(self) -> Dict[str, Any]:
        """Returns the high-level plant control fleet dashboard state."""
        return self.agent.get_fleet_summary()

    def get_o5_state(self) -> Dict[str, Any]:
        """Returns live O5 Duct Static Pressure Reset state and candidate matrix."""
        state = stamp_plant_provenance(self.agent.o5.generate_and_evaluate_candidates(), "O5")
        state["pressure_timeline"] = self._o5_pressure_timeline(state)
        return state

    def _o5_pressure_timeline(self, state: Dict[str, Any], limit: int = 36) -> List[Dict[str, Any]]:
        """Map historian buffer to chart rows; synthesize a short series when buffer is empty."""
        rows = self.get_o5_history()[-limit:]
        timeline: List[Dict[str, Any]] = []
        for row in rows:
            actual = row.get("static_pressure") if row.get("static_pressure") is not None else row.get("actual")
            setpoint = row.get("setpoint")
            if actual is None and setpoint is None:
                continue
            timeline.append(
                {
                    "time": row.get("time") or "",
                    "actual": actual,
                    "setpoint": setpoint,
                    "min_limit": 1.0,
                    "max_limit": 2.4,
                }
            )
        if len(timeline) >= 2:
            return timeline[-limit:]
        actual = state.get("current_static_pressure")
        setpoint = state.get("current_setpoint") or state.get("optimized_setpoint")
        if actual is None and setpoint is None:
            return timeline
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        synth: List[Dict[str, Any]] = []
        for i in range(12):
            t = now - timedelta(minutes=(11 - i) * 30)
            drift = (i - 6) * 0.015
            synth.append(
                {
                    "time": t.strftime("%H:%M"),
                    "actual": round(float(actual) + drift, 2) if actual is not None else None,
                    "setpoint": round(float(setpoint), 2) if setpoint is not None else None,
                    "min_limit": 1.0,
                    "max_limit": 2.4,
                }
            )
        return synth

    def get_o6_state(self) -> Dict[str, Any]:
        """Returns live O6 Heating Hot Water Delivery Temperature Reset state."""
        return self.agent.o6.generate_and_evaluate_candidates()

    def get_o7_state(self) -> Dict[str, Any]:
        """Returns live O7 Chilled Water Delivery Temperature Reset state."""
        return self.agent.o7.generate_and_evaluate_candidates()

    def get_o8_state(self) -> Dict[str, Any]:
        """Returns live O8 Condenser Water Delivery Temperature Reset state."""
        return self.agent.o8.generate_and_evaluate_candidates()

    def get_o9_assessment(self) -> Dict[str, Any]:
        """Returns live O9 Electronic Expansion Valve Retrofit Assessment."""
        return stamp_plant_provenance(self.agent.o9.evaluate_retrofit_feasibility(), "O9")

    def get_o5_history(self) -> List[Dict[str, Any]]:
        return self._opportunity_history("O5")

    def get_o6_history(self) -> List[Dict[str, Any]]:
        return self._opportunity_history("O6")

    def get_o7_history(self) -> List[Dict[str, Any]]:
        return self._opportunity_history("O7")

    def get_o8_history(self) -> List[Dict[str, Any]]:
        return self._opportunity_history("O8")

    def get_o9_history(self) -> List[Dict[str, Any]]:
        return self._opportunity_history("O9")

    def _opportunity_history(self, opportunity: str, limit: int = 48) -> List[Dict[str, Any]]:
        """Prefer in-memory buffer; fall back to PlantControlTelemetryDB series."""
        buf = self.telemetry.get_history(opportunity, limit=limit)
        if len(buf) >= 2:
            return buf
        db_rows = self._history_from_db(opportunity, limit=limit)
        return db_rows or buf

    def _history_from_db(self, opportunity: str, limit: int = 48) -> List[Dict[str, Any]]:
        db = SessionLocal()
        try:
            rows = (
                db.query(PlantControlTelemetryDB)
                .filter(PlantControlTelemetryDB.opportunity_code == opportunity)
                .order_by(PlantControlTelemetryDB.timestamp.asc())
                .limit(max(limit * 6, 48))
                .all()
            )
            if not rows:
                return []
            by_ts: Dict[str, Dict[str, Any]] = {}
            for r in rows:
                ts = r.timestamp.isoformat() if hasattr(r.timestamp, "isoformat") else str(r.timestamp)
                label = r.timestamp.strftime("%H:%M") if hasattr(r.timestamp, "strftime") else ts
                slot = by_ts.setdefault(ts, {"time": label})
                name = str(r.point_name or "")
                val = r.value
                if "StaticPressure" in name and "Setpoint" not in name:
                    slot["static_pressure"] = val
                elif "StaticPressureSetpoint" in name or name.endswith("SupplySetpoint"):
                    slot["setpoint"] = val
                elif "SupplyTemp" in name:
                    slot["supply_temp"] = val
                elif "Superheat" in name:
                    slot["txv_superheat"] = val
                    slot["txv"] = val
                elif "SuctionTemp" in name:
                    slot["suction_temp"] = val
            return list(by_ts.values())[-limit:]
        except Exception:
            return []
        finally:
            db.close()

    def get_activity_log(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Returns recent activity logs for Plant Control Parameter Optimizations."""
        self.ensure_demo_activity()
        db = SessionLocal()
        try:
            logs = db.query(PlantControlActivityLogDB).order_by(PlantControlActivityLogDB.timestamp.desc()).limit(limit).all()
            if logs:
                return [
                    {
                        "id": log.id,
                        "timestamp": log.timestamp.isoformat() if hasattr(log.timestamp, "isoformat") else str(log.timestamp),
                        "opportunity": log.opportunity_code,
                        "stage": log.stage,
                        "message": log.message,
                        "detail": log.detail
                    }
                    for log in logs
                ]
        except Exception as e:
            print(f"[PlantControlService] Activity log error: {e}")
        finally:
            db.close()
        return []

    def ensure_demo_activity(self) -> int:
        """Seed evaluation activity rows in simulation when the log is empty."""
        import os

        try:
            from backend.bms.connection_manager import is_simulation_mode

            if not is_simulation_mode():
                return 0
        except Exception:
            if os.getenv("HVAC_USE_SIMULATION", "0").strip() not in ("1", "true", "TRUE"):
                return 0
        if os.getenv("HVAC_USE_SIMULATION", "0").strip() not in ("1", "true", "TRUE"):
            return 0

        db = SessionLocal()
        try:
            if db.query(PlantControlActivityLogDB).count() > 0:
                return 0
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            return 0
        finally:
            db.close()

        seeds = [
            ("O5", "EVALUATE", "Duct static pressure reset evaluated — trim candidate selected."),
            ("O6", "EVALUATE", "HHW supply reset evaluated against outdoor-air curve."),
            ("O7", "EVALUATE", "CHW supply reset evaluated — lift vs pumping tradeoff."),
            ("O8", "EVALUATE", "Condenser-water reset evaluated — approach within guardrails."),
            ("O9", "REVIEW", "EXV retrofit assessment refreshed — engineering review required."),
        ]
        n = 0
        for oid, stage, message in seeds:
            try:
                self.log_activity(oid, stage, message, {"source": "SIMULATION", "seed": True})
                n += 1
            except Exception:
                pass
        return n

    def log_activity(self, opportunity: str, stage: str, message: str, detail: Optional[Dict[str, Any]] = None):
        """Persists a new event to the plant control activity log."""
        db = SessionLocal()
        try:
            entry = PlantControlActivityLogDB(
                opportunity_code=opportunity,
                stage=stage,
                message=message,
                detail=detail
            )
            db.add(entry)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[PlantControlService] Failed to log activity: {e}")
        finally:
            db.close()

plant_control_service = PlantControlService()
