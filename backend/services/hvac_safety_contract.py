"""Shared O1–O20 safety / dispatch contract. No BMS write unless this gate passes.

Phase 0 — frozen rules:
- Simulation is never labeled LIVE_BMS.
- Missing sensor → None / MISSING / NO DATA, never coerced to 0.
- Physical writes stay off until HVAC_BMS_WRITE_ENABLED=1, mapping exists, and write-enable after safety review.
- Dataset mode and SAFE MODE never write.
- Production BMS never falls back to the simulator.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional, Tuple

CONFIDENCE_MIN = float(os.getenv("HVAC_DISPATCH_CONFIDENCE_MIN", "0.65"))
STALE_SECONDS = float(os.getenv("HVAC_TELEMETRY_STALE_SECONDS", "90"))

DEMO_SOURCES = {
    "DEMO",
    "SIMULATION",
    "SIMULATOR",
    "TEST",
    "TEST TELEMETRY",
    "DEMO / SIMULATION",
    "SIMULATION / DEMO",
    "ML_MODEL",
    "TRAINING_DATA",
    "TRAINING_DATASET",
    "MODEL PREDICTION",
    "KAGGLE",
}
LIVE_SOURCES = {"LIVE_BMS", "BMS", "LIVE"}


def _num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n or n in (float("inf"), float("-inf")):
        return None
    return n


def _upper(v: Any) -> str:
    return str(v or "").strip().upper()


def is_demo_source(src: Any) -> bool:
    return _upper(src) in DEMO_SOURCES or "SIMUL" in _upper(src) or _upper(src).startswith("DEMO")


def default_ingest_source() -> str:
    """Omitted source: SIMULATION in sim mode; LIVE_BMS only after a production handshake."""
    from backend.bms.connection_manager import is_simulation_mode

    if is_simulation_mode():
        return "SIMULATION"
    if production_bms_connected():
        return "LIVE_BMS"
    return "UNKNOWN"


def normalize_telemetry_source(source: Any) -> str:
    """Never persist LIVE_BMS for simulation/demo. Never upgrade simulation to live."""
    from backend.bms.connection_manager import is_simulation_mode

    provided = source is not None and str(source).strip() != ""
    raw = str(source).strip() if provided else default_ingest_source()
    up = _upper(raw)
    if is_simulation_mode() or is_demo_source(raw):
        if up in LIVE_SOURCES:
            return "SIMULATION"
        if not provided:
            return "SIMULATION"
        if "SIMUL" in up:
            return "SIMULATION"
        if up.startswith("DEMO") or up in ("TEST", "TEST TELEMETRY"):
            return "DEMO"
        return raw
    return raw


def ingest_quality(value: Any, quality: Any = None) -> str:
    """Missing value is MISSING, not GOOD with a zero."""
    q = _upper(quality)
    if _num(value) is None:
        if q in ("BAD", "STALE", "MISSING"):
            return q
        return "MISSING"
    return q or "GOOD"


def accepts_telemetry_source(source: Any) -> bool:
    """Live BMS never consumes Dataset/simulation rows."""
    if is_demo_source(source):
        try:
            from backend.bms.connection_manager import is_simulation_mode

            return is_simulation_mode()
        except Exception:
            return False
    return True


def is_safe_mode() -> bool:
    if os.getenv("HVAC_SAFE_MODE", "").strip() in ("1", "true", "TRUE", "yes"):
        return True
    try:
        from database.session import SessionLocal
        from database.models_platform import PlatformSettingDB

        db = SessionLocal()
        try:
            row = db.query(PlatformSettingDB).filter_by(key="SAFE_MODE").first()
            return bool(row and str(row.value).upper() in ("1", "TRUE", "ON", "SAFE_MODE"))
        finally:
            db.close()
    except Exception:
        return False


def production_bms_connected() -> bool:
    try:
        from backend.bms.connection_manager import get_connection_manager

        return bool(get_connection_manager().is_production_connected())
    except Exception:
        return False


def classify_telemetry(tel: Dict[str, Any], source: Any = None) -> Dict[str, Any]:
    src = source or tel.get("source")
    quality = _upper(tel.get("quality") or tel.get("state") or tel.get("status"))
    raw = _upper(tel.get("raw") or tel.get("state"))
    age = _num(tel.get("ageSeconds") or tel.get("age_seconds"))
    demo = is_demo_source(src)
    if demo:
        status = "SIMULATED"
        usable = False
        decision_hint = "BLOCK"
    elif quality in ("BAD",):
        status = "BAD"
        usable = False
        decision_hint = "BLOCK"
    elif quality in ("STALE",) or raw in ("STALE", "DEGRADED") or (age is not None and age > STALE_SECONDS and not demo):
        status = "STALE"
        usable = False
        decision_hint = "SAFE_HOLD"
    elif quality in ("MISSING",) or raw in ("UNAVAILABLE", "MISSING", "NO DATA"):
        status = "MISSING"
        usable = False
        decision_hint = "WAIT_FOR_TELEMETRY"
    elif (not demo) and (raw in ("LIVE",) or quality in ("GOOD", "LIVE")) and (age is None or age <= STALE_SECONDS):
        status = "LIVE"
        usable = production_bms_connected()
        decision_hint = None if usable else "BLOCK"
    else:
        status = "MISSING"
        usable = False
        decision_hint = "WAIT_FOR_TELEMETRY"
    return {
        "status": status,
        "usable": usable,
        "decision_hint": decision_hint,
        "demo": demo,
        "bms_connected": production_bms_connected() and not demo,
        "age_seconds": age,
        "source": "DEMO / SIMULATION" if demo else src,
        "quality": quality or None,
    }


def evaluate_dispatch(context: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Production BMS write is allowed only when LIVE_BMS + GOOD + fresh + connected
    + safety PASS + OPTIMIZE + confidence + not SAFE_MODE.
    O18/O19/O20 never write HVAC equipment.
    """
    tel = context.get("telemetry") or {}
    src = context.get("source") or tel.get("source")
    classified = classify_telemetry(tel, src)
    decision = _upper((context.get("supervisory") or {}).get("decision") or context.get("decision"))
    safety = context.get("safety") or {}
    safety_status = _upper(safety.get("status") or context.get("safety_status"))
    conf = _num(context.get("confidence") if context.get("confidence") is not None else (context.get("supervisory") or {}).get("confidence"))
    current = context.get("current_value")
    target = context.get("target_value")
    if current is None:
        current = (context.get("current") or {}).get("kw") or (context.get("current") or {}).get("airflowCfm")
    if target is None:
        target = (context.get("optimized") or {}).get("kw") or (context.get("optimized") or {}).get("airflowCfm")
    role = _upper((context.get("user") or {}).get("role"))
    approved = context.get("approval_status")
    oid = context.get("opportunity_id") or context.get("id")

    action = _upper(context.get("action") or "APPLY")
    if is_safe_mode():
        return False, "SAFE_MODE blocks all automatic BMS writes.", {**classified, "code": "SAFE_MODE"}
    if oid in ("O18",):
        return False, "O18 is advisory only and cannot dispatch HVAC equipment.", {**classified, "code": "ADVISORY"}
    if oid in ("O19",):
        return False, "O19 records maintenance actions only; no HVAC control writes.", {**classified, "code": "MAINTENANCE_ONLY"}
    if oid in ("O20",):
        return False, "O20 requires change-request review; no automatic software deploy.", {**classified, "code": "REVIEW_REQUIRED"}
    from backend.bms.command_writer import physical_writes_allowed, simulated_writes_allowed, write_enabled_flag

    if classified["demo"] or is_demo_source(src):
        code = "ML_SOURCE_BLOCKED" if _upper(src) in ("ML_MODEL", "TRAINING_DATA", "TRAINING_DATASET", "MODEL PREDICTION", "KAGGLE") else "SIMULATION_BLOCKED"
        if code == "ML_SOURCE_BLOCKED" or not simulated_writes_allowed():
            reason = (
                "ML/training sources cannot dispatch to BMS."
                if code == "ML_SOURCE_BLOCKED"
                else "Demo/simulation telemetry cannot dispatch to BMS."
            )
            return False, reason, {**classified, "code": code}
        if classified["status"] in ("MISSING", "BAD"):
            return False, "Telemetry is missing or bad.", {**classified, "code": "WAIT_FOR_TELEMETRY" if classified["status"] == "MISSING" else "BAD_TELEMETRY"}
        if classified["status"] == "STALE":
            return False, "Stale telemetry requires SAFE_HOLD.", {**classified, "code": "STALE"}
        if action == "VERIFY":
            return True, "OK (simulator)", {**classified, "code": "SIM_DISPATCH_OK"}
        if action != "ROLLBACK" and decision != "OPTIMIZE":
            return False, "Supervisory decision is not OPTIMIZE.", {**classified, "code": "DECISION"}
        if safety_status != "PASS" or safety.get("passed") is False:
            return False, "Safety guardrails did not pass.", {**classified, "code": "SAFETY"}
        if action != "ROLLBACK" and (conf is None or conf < CONFIDENCE_MIN):
            return False, "Confidence is below the dispatch threshold.", {**classified, "code": "CONFIDENCE"}
        if action != "ROLLBACK" and (_num(current) is None or _num(target) is None):
            return False, "Required current/target engineering values are missing.", {**classified, "code": "MISSING_VALUES"}
        return True, "OK (simulator only)", {**classified, "code": "SIM_DISPATCH_OK"}
    if classified["status"] == "STALE":
        return False, "Stale telemetry requires SAFE_HOLD.", {**classified, "code": "STALE"}
    if classified["status"] == "BMS_OFFLINE":
        return False, "Production BMS gateway is not connected.", {**classified, "code": "BMS_OFFLINE"}
    if classified["status"] in ("MISSING", "BAD"):
        return False, "Telemetry is missing or bad.", {**classified, "code": "WAIT_FOR_TELEMETRY" if classified["status"] == "MISSING" else "BAD_TELEMETRY"}
    if classified["status"] != "LIVE":
        return False, "Telemetry is not LIVE BMS.", {**classified, "code": "NOT_LIVE"}
    if not production_bms_connected():
        return False, "Production BMS gateway is not connected.", {**classified, "code": "BMS_OFFLINE"}
    if action == "VERIFY":
        return True, "OK", {**classified, "code": "DISPATCH_OK"}
    if action != "ROLLBACK" and decision != "OPTIMIZE":
        return False, "Supervisory decision is not OPTIMIZE.", {**classified, "code": "DECISION"}
    if safety_status != "PASS" or safety.get("passed") is False:
        return False, "Safety guardrails did not pass.", {**classified, "code": "SAFETY"}
    if action != "ROLLBACK" and (conf is None or conf < CONFIDENCE_MIN):
        return False, "Confidence is below the dispatch threshold.", {**classified, "code": "CONFIDENCE"}
    if action != "ROLLBACK" and (_num(current) is None or _num(target) is None):
        return False, "Required current/target engineering values are missing.", {**classified, "code": "MISSING_VALUES"}
    if role == "VIEWER":
        return False, "Viewer role cannot dispatch.", {**classified, "code": "UNAUTHORIZED"}
    if action != "ROLLBACK" and approved not in (None, "APPROVED", "NOT_REQUIRED"):
        if _upper(os.getenv("HVAC_REQUIRE_APPROVAL", "1")) in ("1", "TRUE") and approved != "APPROVED":
            return False, "Dispatch requires completed approval.", {**classified, "code": "APPROVAL_REQUIRED"}
    from backend.bms.command_writer import physical_writes_allowed, write_enabled_flag

    if action != "ROLLBACK" and (not write_enabled_flag() or not physical_writes_allowed()):
        return False, "Supervised writes are not enabled.", {**classified, "code": "WRITE_DISABLED"}
    if action == "ROLLBACK":
        return True, "OK", {**classified, "code": "DISPATCH_OK"}
    return True, "OK", {**classified, "code": "DISPATCH_OK"}


def classify_ui_state(
    *,
    live: bool,
    source: Any,
    classified_status: Any,
    status: Any = None,
) -> str:
    """Studio/dashboard ui_state: LIVE only with production BMS + classified LIVE."""
    if is_demo_source(source) or _upper(status) in ("SIMULATION", "SIMULATED"):
        return "SIMULATION"
    st = _upper(classified_status)
    if st == "STALE":
        return "STALE"
    if st == "BAD":
        return "DEGRADED"
    connected = production_bms_connected()
    if live and connected and st == "LIVE":
        return "LIVE"
    # Relabeled LIVE_BMS while the gateway is down is still not live — never show LIVE.
    if not connected and (live or st == "LIVE" or _upper(source) in LIVE_SOURCES):
        return "SIMULATION" if is_demo_source(source) else "NO_DATA"
    return "NO_DATA"


def conflict_body(context: Dict[str, Any], reason: str, classified: Dict[str, Any]) -> Dict[str, Any]:
    tel = context.get("telemetry") or {}
    return {
        "code": classified.get("code") or "DISPATCH_BLOCKED",
        "message": reason,
        "reason": reason,
        "dispatchable": False,
        "telemetryStatus": classified.get("status") or tel.get("state"),
        "safetyStatus": (context.get("safety") or {}).get("status"),
        "decision": (context.get("supervisory") or {}).get("decision"),
    }
