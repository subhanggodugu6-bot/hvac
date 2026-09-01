"""F1 checklist implementations (R01–R10)."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.agents.official_opportunities._common import check
from backend.agents.scheduling_supervisory.safety.guardrails import SafetyGuardrails
from backend.agents.scheduling_supervisory.safety.rate_limiter import SetpointRateLimiter
from backend.agents.runtime.safety import envelope_ok
from backend.services.hvac_safety_contract import is_safe_mode

_GUARD = SafetyGuardrails()
_RATE = SetpointRateLimiter()


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


def _pass(name: str, reason: str, **kwargs) -> Dict[str, Any]:
    return check(name, True, reason, **kwargs)


def _fail(name: str, reason: str, **kwargs) -> Dict[str, Any]:
    return check(name, False, reason, **kwargs)


def check_safe_mode(ctx: Dict[str, Any]) -> Dict[str, Any]:
    if is_safe_mode() or ctx.get("safe_mode"):
        return _fail("R01_SAFE_MODE", "HVAC_SAFE_MODE / platform SAFE_MODE blocks control.")
    return _pass("R01_SAFE_MODE", "SAFE_MODE off")


def check_emergency(ctx: Dict[str, Any]) -> Dict[str, Any]:
    if os.getenv("HVAC_EMERGENCY_STOP", "0").strip() in ("1", "true", "TRUE", "yes"):
        return _fail("R02_EMERGENCY", "HVAC_EMERGENCY_STOP is active.")
    if ctx.get("emergency") or ctx.get("critical_alarm"):
        return _fail("R02_EMERGENCY", "Critical / emergency alarm active.")
    alarms = ctx.get("critical_alarms") or []
    if alarms:
        return _fail("R02_EMERGENCY", f"Critical alarms present: {alarms}")
    return _pass("R02_EMERGENCY", "No emergency stop")


def check_manual_override(ctx: Dict[str, Any]) -> Dict[str, Any]:
    if os.getenv("HVAC_MANUAL_OVERRIDE", "0").strip() in ("1", "true", "TRUE", "yes"):
        return _fail("R03_MANUAL_OVERRIDE", "HVAC_MANUAL_OVERRIDE is active.")
    row = ctx.get("point_row") or {}
    q = str(row.get("quality") or "").upper()
    if q in ("OVERRIDDEN", "OVERRIDE", "MANUAL"):
        return _fail("R03_MANUAL_OVERRIDE", f"Point quality is {q}.", actual=None)
    if ctx.get("manual_override"):
        return _fail("R03_MANUAL_OVERRIDE", "Operator manual override flagged in context.")
    return _pass("R03_MANUAL_OVERRIDE", "No manual override")


def check_comfort_range(ctx: Dict[str, Any]) -> Dict[str, Any]:
    lo = float(os.getenv("HVAC_COMFORT_MIN_C", "21") or "21")
    hi = float(os.getenv("HVAC_COMFORT_MAX_C", "24") or "24")
    norm = ctx.get("normalized") or {}
    tin = _num(norm.get("Indoor_Temp"))
    point_id = str(ctx.get("point_id") or "")
    new_v = _num(ctx.get("new_value"))
    old_v = _num(ctx.get("old_value"))
    is_zone_sp = "cooling_setpoint" in point_id or "zone" in point_id.lower() and "setpoint" in point_id.lower()

    if tin is None:
        if ctx.get("strict") and is_zone_sp:
            return _fail("R04_COMFORT_RANGE", "Indoor_Temp missing for zone setpoint change.")
        return _pass("R04_COMFORT_RANGE", "Comfort check skipped (no Indoor_Temp)", minimum=lo, maximum=hi)

    if not is_zone_sp or new_v is None or old_v is None:
        if tin < lo or tin > hi:
            return _pass(
                "R04_COMFORT_RANGE",
                f"Zone temp {tin:.2f}°C outside band but action is not a zone SP move.",
                actual=tin,
                minimum=lo,
                maximum=hi,
            )
        return _pass("R04_COMFORT_RANGE", f"Indoor_Temp {tin:.2f}°C within band", actual=tin, minimum=lo, maximum=hi)

    # Block zone SP moves that worsen comfort violation
    if tin > hi and new_v > old_v:
        return _fail(
            "R04_COMFORT_RANGE",
            f"Zone warm ({tin:.2f}°C > {hi}); raising SP worsens comfort.",
            actual=tin,
            minimum=lo,
            maximum=hi,
        )
    if tin < lo and new_v < old_v:
        return _fail(
            "R04_COMFORT_RANGE",
            f"Zone cold ({tin:.2f}°C < {lo}); lowering SP worsens comfort.",
            actual=tin,
            minimum=lo,
            maximum=hi,
        )
    return _pass("R04_COMFORT_RANGE", f"Comfort OK (Indoor_Temp={tin:.2f}°C)", actual=tin, minimum=lo, maximum=hi)


def check_occupancy(ctx: Dict[str, Any]) -> Dict[str, Any]:
    norm = ctx.get("normalized") or {}
    occ = _num(norm.get("Occupancy"))
    if occ is None:
        if ctx.get("strict") and str(ctx.get("action") or "").upper() in ("WRITE", "APPLY"):
            return _fail("R05_OCCUPANCY", "Occupancy missing.")
        return _pass("R05_OCCUPANCY", "Occupancy check skipped (missing)")

    point_id = str(ctx.get("point_id") or "")
    new_v = _num(ctx.get("new_value"))
    old_v = _num(ctx.get("old_value"))
    occupied = occ >= 0.3
    # When occupied, block aggressive energy-up moves that risk comfort (SAT warmer, zone SP up)
    if occupied and new_v is not None and old_v is not None and new_v > old_v:
        if "SAT" in point_id.upper() or "sat" in point_id:
            tin = _num(norm.get("Indoor_Temp"))
            hi = float(os.getenv("HVAC_COMFORT_MAX_C", "24") or "24")
            if tin is not None and tin >= hi - 0.3:
                return _fail(
                    "R05_OCCUPANCY",
                    f"Occupied ({occ:.2f}) and near comfort max — SAT warmer blocked.",
                    actual=occ,
                )
        if "cooling_setpoint" in point_id:
            tin = _num(norm.get("Indoor_Temp"))
            hi = float(os.getenv("HVAC_COMFORT_MAX_C", "24") or "24")
            if tin is not None and tin >= hi - 0.3:
                return _fail(
                    "R05_OCCUPANCY",
                    f"Occupied ({occ:.2f}) — raising cooling SP near comfort max blocked.",
                    actual=occ,
                )
    return _pass("R05_OCCUPANCY", f"Occupancy OK ({occ:.2f})", actual=occ)


def check_equipment_limits(ctx: Dict[str, Any]) -> Dict[str, Any]:
    new_v = _num(ctx.get("new_value"))
    point_id = str(ctx.get("point_id") or "")
    if new_v is None:
        if str(ctx.get("action") or "").upper() in ("WRITE", "APPLY") and point_id:
            return _fail("R06_EQUIPMENT_LIMITS", "new_value missing.")
        return _pass("R06_EQUIPMENT_LIMITS", "No setpoint value to envelope-check")

    limits = _GUARD.HARD_LIMITS
    oid = str(ctx.get("opportunity_id") or "")
    pid_u = point_id.upper()

    lo = hi = None
    if "COOLING_SETPOINT" in pid_u or "CLG-SP" in pid_u or oid == "O2":
        lo, hi = limits["ZONE_COOL_SP_MIN"], limits["ZONE_COOL_SP_MAX"]
    elif "SAT" in pid_u or oid == "O3":
        lo, hi = limits["AHU_SAT_MIN"], limits["AHU_SAT_MAX"]
    elif "CHWS" in pid_u or oid in ("O4", "O7"):
        lo, hi = limits["CHWS_MIN"], limits["CHWS_MAX"]

    cfg = get_limits_config_safe(ctx)
    if lo is None and cfg:
        building = cfg.building
        ahu = cfg.ahu
        plant = cfg.chiller_plant
        if "COOLING_SETPOINT" in pid_u:
            lo, hi = building.min_cooling_setpoint_c, building.max_cooling_setpoint_c
        elif "SAT" in pid_u:
            lo, hi = ahu.min_sat_c, ahu.max_sat_c
        elif "CHWS" in pid_u:
            lo, hi = plant.min_chws_temp_c, plant.max_chws_temp_c

    if lo is not None and new_v < lo:
        return _fail("R06_EQUIPMENT_LIMITS", f"Value {new_v} below min {lo}", actual=new_v, minimum=lo, maximum=hi)
    if hi is not None and new_v > hi:
        return _fail("R06_EQUIPMENT_LIMITS", f"Value {new_v} above max {hi}", actual=new_v, minimum=lo, maximum=hi)

    eng_db = ctx.get("engineering_limits_db") or {}
    ok, code = envelope_ok(point_id, new_v, eng_db)
    if not ok:
        return _fail("R06_EQUIPMENT_LIMITS", f"Engineering envelope: {code}", actual=new_v)

    return _pass("R06_EQUIPMENT_LIMITS", "Within equipment limits", actual=new_v, minimum=lo, maximum=hi)


def get_limits_config_safe(ctx: Dict[str, Any]):
    return ctx.get("engineering_config")


def check_schedule(ctx: Dict[str, Any]) -> Dict[str, Any]:
    start_h = int(os.getenv("HVAC_SCHEDULE_START_HOUR", "8") or "8")
    end_h = int(os.getenv("HVAC_SCHEDULE_END_HOUR", "18") or "18")
    hour = datetime.now(timezone.utc).hour
    # Allow override via context for tests
    if ctx.get("schedule_hour") is not None:
        hour = int(ctx["schedule_hour"])

    in_window = start_h <= hour < end_h
    new_v = _num(ctx.get("new_value"))
    old_v = _num(ctx.get("old_value"))
    is_change = new_v is not None and old_v is not None and abs(new_v - old_v) > 1e-9
    if not is_change:
        return _pass("R07_SCHEDULE", "No setpoint change", actual=float(hour), minimum=float(start_h), maximum=float(end_h))

    if in_window:
        return _pass("R07_SCHEDULE", f"Within occupied hours ({start_h}-{end_h})", actual=float(hour))

    norm = ctx.get("normalized") or {}
    occ = _num(norm.get("Occupancy")) or 0.0
    if occ >= 0.3:
        return _pass("R07_SCHEDULE", f"Outside schedule but occupied ({occ:.2f})", actual=float(hour))

    return _fail(
        "R07_SCHEDULE",
        f"Outside occupied hours ({start_h}-{end_h} UTC); hour={hour}, occupancy={occ:.2f}",
        actual=float(hour),
        minimum=float(start_h),
        maximum=float(end_h),
    )


def check_compressor_min_on_off(ctx: Dict[str, Any]) -> Dict[str, Any]:
    point_id = str(ctx.get("point_id") or "")
    pid_u = point_id.upper()
    is_enable = "ENABLE" in pid_u or point_id.endswith(".status") and "CH-" in pid_u
    if not is_enable and str(ctx.get("opportunity_id") or "") not in ("O4",):
        return _pass("R08_COMPRESSOR_MIN_ON_OFF", "Not a compressor enable/status command")

    new_v = _num(ctx.get("new_value"))
    old_v = _num(ctx.get("old_value"))
    if new_v is None or old_v is None:
        if ctx.get("strict"):
            return _fail("R08_COMPRESSOR_MIN_ON_OFF", "COMPRESSOR_STATE_UNKNOWN — missing on/off values")
        return _pass("R08_COMPRESSOR_MIN_ON_OFF", "Compressor state unknown; non-strict skip")

    if abs(new_v - old_v) < 1e-9:
        return _pass("R08_COMPRESSOR_MIN_ON_OFF", "No on/off transition")

    cfg = get_limits_config_safe(ctx)
    min_run = float(cfg.chiller_plant.min_runtime_minutes) if cfg else 15.0
    min_off = float(cfg.chiller_plant.min_off_time_minutes) if cfg else 15.0

    runtime = _num(ctx.get("compressor_runtime_minutes"))
    offtime = _num(ctx.get("compressor_offtime_minutes"))
    # Turning OFF requires min runtime; turning ON requires min off time
    turning_off = new_v < 0.5 and old_v >= 0.5
    turning_on = new_v >= 0.5 and old_v < 0.5

    if turning_off:
        if runtime is None:
            if ctx.get("strict"):
                return _fail("R08_COMPRESSOR_MIN_ON_OFF", "COMPRESSOR_STATE_UNKNOWN — runtime missing for OFF")
            return _pass("R08_COMPRESSOR_MIN_ON_OFF", "Runtime unknown; non-strict skip")
        if runtime < min_run:
            return _fail(
                "R08_COMPRESSOR_MIN_ON_OFF",
                f"Runtime {runtime}m < min {min_run}m",
                actual=runtime,
                minimum=min_run,
            )
    if turning_on:
        if offtime is None:
            if ctx.get("strict"):
                return _fail("R08_COMPRESSOR_MIN_ON_OFF", "COMPRESSOR_STATE_UNKNOWN — off-time missing for ON")
            return _pass("R08_COMPRESSOR_MIN_ON_OFF", "Off-time unknown; non-strict skip")
        if offtime < min_off:
            return _fail(
                "R08_COMPRESSOR_MIN_ON_OFF",
                f"Off-time {offtime}m < min {min_off}m",
                actual=offtime,
                minimum=min_off,
            )
    return _pass("R08_COMPRESSOR_MIN_ON_OFF", "Compressor timers OK")


def _point_category(point_id: str) -> str:
    u = (point_id or "").upper()
    if "PUMP" in u or "CW." in u or "SCHW" in u:
        return "PUMP_SPEED"
    if "DUCT" in u and "STATIC" in u:
        return "DUCT_STATIC"
    if "SAT" in u:
        return "AHU_SAT_SP"
    if "CHWS" in u:
        return "CHWS_SP"
    if "COOLING_SETPOINT" in u or "CLG-SP" in u or "ZONE" in u and "SETPOINT" in u:
        return "ZONE_TEMP_SP"
    return "ZONE_TEMP_SP"


def check_rate_limit(ctx: Dict[str, Any]) -> Dict[str, Any]:
    new_v = _num(ctx.get("new_value"))
    old_v = _num(ctx.get("old_value"))
    point_id = str(ctx.get("point_id") or "")
    if new_v is None or old_v is None:
        return _pass("R09_RATE_LIMIT", "No delta to rate-limit")

    cat = _point_category(point_id)
    max_delta = _RATE.MAX_RATE_PER_CYCLE.get(cat, 0.5)
    # Prefer engineering config when available
    cfg = get_limits_config_safe(ctx)
    if cfg:
        if cat == "ZONE_TEMP_SP":
            max_delta = cfg.building.max_zone_setpoint_step_c
        elif cat == "AHU_SAT_SP":
            max_delta = cfg.ahu.max_sat_step_c
        elif cat == "CHWS_SP":
            max_delta = cfg.chiller_plant.max_chws_step_c

    delta = abs(new_v - old_v)
    if delta > max_delta + 1e-9:
        return _fail(
            "R09_RATE_LIMIT",
            f"{cat} delta {delta:.3f} > max {max_delta}",
            actual=delta,
            maximum=max_delta,
        )
    return _pass("R09_RATE_LIMIT", f"Rate OK (delta={delta:.3f} ≤ {max_delta})", actual=delta, maximum=max_delta)


def check_dispatch_contract(ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """R10: wrap evaluate_dispatch / evaluate_safety. Recommend path skips physical write gates."""
    action = str(ctx.get("action") or "EVALUATE").upper()
    write_actions = {"WRITE", "APPLY", "ROLLBACK", "VERIFY"}

    if action not in write_actions:
        # Recommend / dry-evaluate: envelope already covered by R06; still block advisory OIDs
        oid = str(ctx.get("opportunity_id") or "")
        if oid in ("O18", "O19", "O20"):
            return _fail("R10_DISPATCH_CONTRACT", f"{oid} cannot dispatch HVAC."), {"code": "ADVISORY"}
        return _pass("R10_DISPATCH_CONTRACT", "Recommend/evaluate path — write gates deferred"), {"code": "RECOMMEND_OK"}

    from backend.agents.runtime.safety import evaluate_safety

    ok, reason, classified = evaluate_safety(ctx)
    if not ok:
        return _fail("R10_DISPATCH_CONTRACT", reason or classified.get("code") or "DISPATCH_BLOCKED"), classified
    return _pass("R10_DISPATCH_CONTRACT", reason or "DISPATCH_OK"), classified


CHECKLIST = [
    ("R01_SAFE_MODE", check_safe_mode),
    ("R02_EMERGENCY", check_emergency),
    ("R03_MANUAL_OVERRIDE", check_manual_override),
    ("R04_COMFORT_RANGE", check_comfort_range),
    ("R05_OCCUPANCY", check_occupancy),
    ("R06_EQUIPMENT_LIMITS", check_equipment_limits),
    ("R07_SCHEDULE", check_schedule),
    ("R08_COMPRESSOR_MIN_ON_OFF", check_compressor_min_on_off),
    ("R09_RATE_LIMIT", check_rate_limit),
]
