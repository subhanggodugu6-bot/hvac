"""Persist control-path audit and SAFE_MODE. Product alert/approval queues are not exposed."""
from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database.session import SessionLocal
from database.models_platform import ControlAuditLogDB, PlatformSettingDB


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def record_control_audit(
    *,
    user: Optional[Dict[str, Any]],
    action: str,
    opportunity_id: Optional[str] = None,
    previous_value: Any = None,
    requested_value: Any = None,
    decision: Optional[str] = None,
    safety_status: Optional[str] = None,
    telemetry_status: Optional[str] = None,
    approval_status: Optional[str] = None,
    reason: Optional[str] = None,
    request_id: Optional[str] = None,
    building_id: Optional[str] = None,
    payload_json: Any = None,
) -> str:
    rid = request_id or uuid.uuid4().hex
    user = user or {}
    db = SessionLocal()
    try:
        db.add(
            ControlAuditLogDB(
                request_id=rid,
                user_id=user.get("user_id"),
                role=user.get("role"),
                timestamp=_now(),
                building_id=building_id or user.get("building_id"),
                opportunity_id=opportunity_id,
                action=action,
                previous_value=None if previous_value is None else str(previous_value),
                requested_value=None if requested_value is None else str(requested_value),
                decision=decision,
                safety_status=safety_status,
                telemetry_status=telemetry_status,
                approval_status=approval_status,
                reason=reason,
                payload_json=payload_json,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    return rid


def get_safe_mode() -> bool:
    from backend.services.hvac_safety_contract import is_safe_mode

    return is_safe_mode()


def set_safe_mode(enabled: bool) -> None:
    db = SessionLocal()
    try:
        row = db.query(PlatformSettingDB).filter_by(key="SAFE_MODE").first()
        val = "1" if enabled else "0"
        if row:
            row.value = val
            row.updated_at = _now()
        else:
            db.add(PlatformSettingDB(key="SAFE_MODE", value=val, updated_at=_now()))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


PLANT_MODE_KEY = "PLANT_MODE"
PLANT_DATASET = "DATASET"
PLANT_LIVE = "LIVE_BMS"


def _normalize_plant_mode(raw: Any) -> Optional[str]:
    v = str(raw or "").strip().upper().replace(" ", "_")
    if v in ("DATASET", "SIMULATION", "SIM", "DEMO"):
        return PLANT_DATASET
    if v in ("LIVE_BMS", "LIVE", "PRODUCTION", "PROD", "BMS"):
        return PLANT_LIVE
    return None


def _plant_mode_persist() -> bool:
    import os

    return os.getenv("HVAC_PLANT_MODE_PERSIST", "1").strip() in ("1", "true", "TRUE")


def _env_plant_mode() -> str:
    import os

    explicit = _normalize_plant_mode(os.getenv("HVAC_PLANT_MODE"))
    if explicit:
        return explicit
    env = (os.getenv("HVAC_BMS_MODE") or "simulation").strip().lower()
    if env in ("production", "prod", "live"):
        return PLANT_LIVE
    return PLANT_DATASET


# Plant mode is read thousands of times per dashboard request (once per telemetry
# point, via accepts_telemetry_source). Each read was a SQLite round trip, which
# made the home payload take ~20s. Only the persisted row is memoised -- the env
# fallback stays live so tests and restarts can retarget the mode immediately.
_PLANT_MODE_TTL_S = 2.0
_plant_mode_lock = threading.Lock()
_persisted_plant_mode_cache: Optional[tuple[float, Optional[str]]] = None


def invalidate_plant_mode_cache() -> None:
    global _persisted_plant_mode_cache
    with _plant_mode_lock:
        _persisted_plant_mode_cache = None


def _read_persisted_plant_mode() -> Optional[str]:
    try:
        db = SessionLocal()
        try:
            row = db.query(PlatformSettingDB).filter_by(key=PLANT_MODE_KEY).first()
            if row:
                return _normalize_plant_mode(row.value)
        finally:
            db.close()
    except Exception:
        pass
    return None


def get_plant_mode() -> str:
    global _persisted_plant_mode_cache
    if _plant_mode_persist():
        now = time.monotonic()
        cached = _persisted_plant_mode_cache
        if cached is not None and now - cached[0] < _PLANT_MODE_TTL_S:
            persisted = cached[1]
        else:
            persisted = _read_persisted_plant_mode()
            with _plant_mode_lock:
                _persisted_plant_mode_cache = (now, persisted)
        if persisted:
            return persisted
    return _env_plant_mode()


def set_plant_mode(mode: str) -> str:
    parsed = _normalize_plant_mode(mode) or PLANT_DATASET
    invalidate_plant_mode_cache()
    db = SessionLocal()
    try:
        row = db.query(PlatformSettingDB).filter_by(key=PLANT_MODE_KEY).first()
        if row:
            row.value = parsed
            row.updated_at = _now()
        else:
            db.add(PlatformSettingDB(key=PLANT_MODE_KEY, value=parsed, updated_at=_now()))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    invalidate_plant_mode_cache()
    apply_plant_mode(parsed)
    return parsed


def apply_plant_mode(mode: Optional[str] = None) -> str:
    parsed = _normalize_plant_mode(mode) or get_plant_mode()
    from backend.agents.scheduling_supervisory.gateway import reset_bms_gateway
    from backend.bms.simulation_telemetry import start_simulation_telemetry, stop_simulation_telemetry

    reset_bms_gateway()
    if parsed == PLANT_DATASET:
        start_simulation_telemetry(force=True)
        try:
            from backend.bms.connection_manager import get_connection_manager

            get_connection_manager().set_write_enabled(False)
        except Exception:
            pass
    else:
        stop_simulation_telemetry()
        try:
            from backend.services.ttl_cache import cache_clear

            cache_clear("latest_points")
        except Exception:
            pass
        try:
            from backend.bms.telemetry_reader import poll_once, start_reader

            start_reader()
            poll_once(include_unmapped=False)
        except Exception:
            pass
    return parsed
