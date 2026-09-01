"""O17–O20 detail enrichment: time-series, control points (dataset/sim)."""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

RANGES = {"24H": 24, "7D": 168, "30D": 720, "90D": 2160}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _point_count(hours: int) -> int:
    if hours <= 24:
        return 24
    if hours <= 168:
        return 28
    if hours <= 720:
        return 30
    return 36


def _labels(hours: int, n: int) -> List[str]:
    now = _now()
    step_h = hours / max(1, n - 1)
    out: List[str] = []
    for i in range(n):
        ts = now - timedelta(hours=hours - step_h * i)
        out.append(ts.strftime("%H:%M") if hours <= 48 else ts.strftime("%m/%d"))
    return out


def _walk(base: float, n: int, spread: float, seed: int) -> List[float]:
    rng = random.Random(seed)
    cur = base
    vals: List[float] = []
    for _ in range(n):
        cur = base + (cur - base) * 0.82 + rng.uniform(-spread, spread) * max(abs(base), 1.0)
        vals.append(round(cur, 2))
    return vals


def _build_series(hours: int, fields: Dict[str, Optional[float]]) -> List[Dict[str, Any]]:
    active = {k: float(v) for k, v in fields.items() if v is not None}
    if not active:
        return []
    n = _point_count(hours)
    labels = _labels(hours, n)
    walks = {k: _walk(v, n, 0.035, seed=hash((k, hours)) % 9973) for k, v in active.items()}
    return [{**{"label": labels[i], "time": labels[i]}, **{k: walks[k][i] for k in walks}} for i in range(n)]


def attach_om_series(body: Dict[str, Any], oid: str) -> None:
    charts = body.get("charts") or {}
    current = body.get("current") or {}
    metrics = body.get("metrics") or {}
    out: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}

    if oid == "O17":
        fields = {
            "baseline": charts.get("baselineKw") or current.get("baselineKw") or metrics.get("baseline_kw"),
            "actual": charts.get("currentKw") or current.get("kw") or metrics.get("current_kw") or metrics.get("hvac_power_kw"),
            "target": charts.get("targetKw") or current.get("targetKw") or metrics.get("target_kw"),
        }
        key = "energyPlanning"
    elif oid == "O19":
        fields = {
            "health": charts.get("equipmentHealthPct") or current.get("equipmentHealthPct") or metrics.get("equipment_health_pct"),
            "filterDpRise": metrics.get("filter_dp_rise_pct"),
            "fanKw": metrics.get("fan_power_kw"),
        }
        key = "maintenanceTrend"
    elif oid == "O20":
        fields = {
            "health": current.get("controlHealthPct") or metrics.get("control_health_pct"),
            "overrides": current.get("overrides") or metrics.get("override_count"),
            "drift": current.get("driftCount") or metrics.get("drift_count"),
            "stale": metrics.get("stale_points"),
            "failed": metrics.get("failed_points"),
        }
        key = "controlHealth"
    else:
        return

    by_range: Dict[str, List[Dict[str, Any]]] = {}
    for label, hours in RANGES.items():
        rows = _build_series(hours, fields)
        if rows:
            by_range[label] = rows
    if by_range:
        out[key] = by_range
        body["series"] = out


def attach_control_points(body: Dict[str, Any]) -> None:
    current = body.get("current") or {}
    metrics = body.get("metrics") or {}
    healthy = int(current.get("healthyPoints") or metrics.get("healthy_points") or 1247)
    degraded = int(current.get("degradedPoints") or metrics.get("degraded_points") or 29)
    overrides = int(current.get("overrides") or metrics.get("override_count") or 8)
    drift_n = int(current.get("driftCount") or metrics.get("drift_count") or 3)
    stale_n = int(metrics.get("stale_points") or 2)
    failed_n = int(metrics.get("failed_points") or 1)

    templates = [
        ("ZONE-01.cooling_setpoint", "ZONE-01", "Setpoint", "24.0", "24.0", "GOOD"),
        ("ZONE-01.space_temp", "ZONE-01", "Analog Input", "24.2", "24.0", "GOOD"),
        ("AHU-01.supply_fan_speed", "AHU-01", "Analog Output", "68.0", "65.0", "GOOD"),
        ("AHU-01.duct_static_pressure", "AHU-01", "Analog Input", "1.82", "1.80", "GOOD"),
        ("AHU-01.oa_damper_position", "AHU-01", "Analog Output", "43.7", "40.0", "GOOD"),
        ("CH-01.chws_setpoint", "CH-01", "Setpoint", "7.2", "7.5", "GOOD"),
        ("CH-01.load_pct", "CH-01", "Analog Input", "79.3", "—", "GOOD"),
        ("VAV-103.damper_position", "VAV-103", "Analog Output", "82.0", "85.0", "DEGRADED"),
        ("VAV-103.airflow", "VAV-103", "Analog Input", "1420", "1380", "DEGRADED"),
        ("CW-01.pump_speed", "CW-01", "Analog Output", "64.5", "62.0", "GOOD"),
        ("NCE-01.alarm_count", "NCE-01", "Counter", "3", "0", "WARNING"),
        ("BOILER-01.hhw_setpoint", "BOILER-01", "Setpoint", "70.0", "80.0", "GOOD"),
    ]

    rows: List[Dict[str, Any]] = []
    now = _now().isoformat()
    for i, (pid, equip, ptype, val, ref, qual) in enumerate(templates):
        if i < healthy and i >= len(templates) - degraded:
            status, override, drift = "HEALTHY", False, False
        elif degraded and i >= len(templates) - degraded:
            status, override, drift = "DEGRADED", False, True
        elif overrides and i < overrides:
            status, override, drift = "OVERRIDE", True, False
        elif stale_n and i < stale_n + 2:
            status, override, drift = "STALE", False, False
        elif failed_n and i < failed_n:
            status, override, drift = "FAILED", False, False
        else:
            status, override, drift = "HEALTHY", False, False
        rows.append(
            {
                "point": pid,
                "equipment": equip,
                "pointType": ptype,
                "currentValue": val,
                "referenceValue": ref,
                "quality": qual if status != "STALE" else "STALE",
                "override": override,
                "drift": drift,
                "lastSeen": now,
                "status": status,
            }
        )
    body["controlPoints"] = rows


def o10_mv_impact(instantaneous_kw: Optional[float], chiller_kw: Optional[float], fan_kw: Optional[float]) -> Dict[str, Any]:
    """Measured / verified economizer impact from predicted savings (sim M&V)."""
    base = instantaneous_kw
    if base is None and chiller_kw is not None:
        base = max(0.0, float(chiller_kw) * 0.08)
    if base is None:
        return {}
    measured = round(float(base) * 0.94, 2)
    verified = round(float(base) * 0.88, 2)
    return {
        "measuredImpactKw": measured,
        "verifiedImpactKw": verified,
        "measuredDailyKwh": round(measured * 24, 1),
        "verifiedDailyKwh": round(verified * 24, 1),
        "status": "SIMULATED",
        "method": "COMPRESSOR_DELTA_M&V",
    }
