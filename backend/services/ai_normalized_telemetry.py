"""NB2-shaped normalized AI records from canonical point windows + weather.

Never invents numbers: missing contributors stay null with MISSING quality.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.services.canonical_telemetry_service import query_telemetry
from backend.services.hvac_safety_contract import STALE_SECONDS, is_demo_source
from backend.services.timeseries_buffer import parse_time

_QUALITY_RANK = {"GOOD": 0, "STALE": 1, "BAD": 2, "MISSING": 3, "UNCERTAIN": 1}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _worst_quality(qualities: List[str]) -> str:
    worst = "GOOD"
    worst_rank = -1
    for q in qualities:
        key = (q or "MISSING").upper()
        rank = _QUALITY_RANK.get(key, 3)
        if rank > worst_rank:
            worst_rank = rank
            worst = key
    return worst if worst_rank >= 0 else "MISSING"


def _dominant_source(sources: List[str]) -> str:
    cleaned = [(s or "").upper() for s in sources if s and str(s).upper() not in ("UNKNOWN", "NONE", "WEATHER")]
    if not cleaned:
        try:
            from backend.bms.connection_manager import is_simulation_mode

            return "SIMULATION" if is_simulation_mode() else "UNKNOWN"
        except Exception:
            return "UNKNOWN"
    if any(is_demo_source(s) for s in cleaned):
        # Honest: if any demo/sim contributor, do not claim LIVE_BMS for the row.
        demo = next((s for s in cleaned if is_demo_source(s)), "SIMULATION")
        return demo
    for prefer in ("LIVE_BMS", "BMS", "HISTORIAN"):
        if prefer in cleaned:
            return prefer
    return cleaned[0]


def point_map_for_zone(zone_id: str) -> Dict[str, str]:
    z = (zone_id or "ZONE-01").strip() or "ZONE-01"
    return {
        "Outdoor_Temp": "SITE.outdoor_air_temperature",
        "Indoor_Temp": f"{z}.zone_temperature",
        "Occupancy": f"{z}.occupancy",
        "Setpoint": f"{z}.cooling_setpoint",
        "Fan_Speed": "AHU-01.fan_speed",
        "HVAC_Power": "CH-01.power",
        "Equipment_Status": "AHU-01.enable",
        "Chiller_Status": "CH-01.status",
    }


def _series_index(rows: List[Dict[str, Any]]) -> List[Tuple[datetime, Dict[str, Any]]]:
    out: List[Tuple[datetime, Dict[str, Any]]] = []
    for r in rows:
        ts = parse_time(r.get("timestamp"))
        if ts is not None:
            out.append((ts, r))
    out.sort(key=lambda x: x[0])
    return out


def _value_at(
    series: List[Tuple[datetime, Dict[str, Any]]],
    when: datetime,
    *,
    max_age_seconds: float,
) -> Tuple[Optional[float], str, Optional[str]]:
    """Forward-fill last sample at or before `when` within max_age; else MISSING."""
    if not series:
        return None, "MISSING", None
    chosen: Optional[Dict[str, Any]] = None
    chosen_ts: Optional[datetime] = None
    for ts, row in series:
        if ts <= when:
            chosen = row
            chosen_ts = ts
        else:
            break
    if chosen is None or chosen_ts is None:
        return None, "MISSING", None
    age = (when - chosen_ts).total_seconds()
    if age > max_age_seconds:
        return None, "MISSING", chosen.get("source")
    val = chosen.get("value")
    q = (chosen.get("quality") or "MISSING").upper()
    if val is None:
        return None, "MISSING" if q not in ("BAD", "STALE") else q, chosen.get("source")
    try:
        fval = float(val)
    except (TypeError, ValueError):
        return None, "MISSING", chosen.get("source")
    if age > STALE_SECONDS and q == "GOOD":
        q = "STALE"
    return fval, q, chosen.get("source")


def build_ai_records(
    zone_id: str = "ZONE-01",
    t0: Optional[Any] = None,
    t1: Optional[Any] = None,
    step_seconds: int = 60,
    building_id: Optional[str] = None,
    limit: int = 5000,
) -> Dict[str, Any]:
    start = parse_time(t0) or (_now() - timedelta(hours=1))
    end = parse_time(t1) or _now()
    if end < start:
        start, end = end, start
    step = max(15, int(step_seconds or 60))
    mapping = point_map_for_zone(zone_id)
    point_ids = list(dict.fromkeys(mapping.values()))

    by_point: Dict[str, List[Tuple[datetime, Dict[str, Any]]]] = {}
    for pid in point_ids:
        rows = query_telemetry(
            building_id=building_id,
            point_id=pid,
            t0=start,
            t1=end,
            limit=limit,
            prefer_buffer=True,
        )
        by_point[pid] = _series_index(rows)

    weather: Dict[str, Any] = {}
    try:
        from backend.services.weather_service import weather_service

        weather = weather_service.snapshot() or {}
    except Exception:
        weather = {}

    weather_oat = weather.get("oat")
    weather_hum = weather.get("humidity")
    try:
        weather_oat_f = float(weather_oat) if weather_oat is not None else None
    except (TypeError, ValueError):
        weather_oat_f = None
    try:
        weather_hum_f = float(weather_hum) if weather_hum is not None else None
    except (TypeError, ValueError):
        weather_hum_f = None

    first_samples = [series[0][0] for series in by_point.values() if series]
    grid_start = max(start, min(first_samples)) if first_samples else start

    records: List[Dict[str, Any]] = []
    cursor = grid_start
    max_age = float(max(STALE_SECONDS, step * 2))
    while cursor <= end:
        qualities: List[str] = []
        sources: List[str] = []

        outdoor, oq, osrc = _value_at(by_point.get(mapping["Outdoor_Temp"], []), cursor, max_age_seconds=max_age)
        if outdoor is None and weather_oat_f is not None:
            outdoor, oq, osrc = weather_oat_f, "GOOD", weather.get("source") or "WEATHER"
        qualities.append(oq)
        if osrc:
            sources.append(str(osrc))

        indoor, iq, isrc = _value_at(by_point.get(mapping["Indoor_Temp"], []), cursor, max_age_seconds=max_age)
        qualities.append(iq)
        if isrc:
            sources.append(str(isrc))

        occ, ocq, ocsrc = _value_at(by_point.get(mapping["Occupancy"], []), cursor, max_age_seconds=max_age)
        qualities.append(ocq)
        if ocsrc:
            sources.append(str(ocsrc))

        sp, spq, spsrc = _value_at(by_point.get(mapping["Setpoint"], []), cursor, max_age_seconds=max_age)
        qualities.append(spq)
        if spsrc:
            sources.append(str(spsrc))

        fan, fq, fsrc = _value_at(by_point.get(mapping["Fan_Speed"], []), cursor, max_age_seconds=max_age)
        qualities.append(fq)
        if fsrc:
            sources.append(str(fsrc))

        power, pq, psrc = _value_at(by_point.get(mapping["HVAC_Power"], []), cursor, max_age_seconds=max_age)
        qualities.append(pq)
        if psrc:
            sources.append(str(psrc))

        ahu_en, aq, asrc = _value_at(by_point.get(mapping["Equipment_Status"], []), cursor, max_age_seconds=max_age)
        ch_st, cq, csrc = _value_at(by_point.get(mapping["Chiller_Status"], []), cursor, max_age_seconds=max_age)
        qualities.extend([aq, cq])
        if asrc:
            sources.append(str(asrc))
        if csrc:
            sources.append(str(csrc))
        equip = ahu_en if ahu_en is not None else ch_st

        humidity = weather_hum_f
        # Humidity is optional (weather-only); never let missing RH mark the whole row MISSING.
        if humidity is not None:
            qualities.append("GOOD")

        records.append(
            {
                "Timestamp": cursor.isoformat(),
                "Zone_ID": zone_id or "ZONE-01",
                "Outdoor_Temp": outdoor,
                "Indoor_Temp": indoor,
                "Humidity": humidity,
                "Occupancy": occ,
                "Setpoint": sp,
                "Fan_Speed": fan,
                "HVAC_Power": power,
                "Equipment_Status": equip,
                "quality": _worst_quality(qualities),
                "source": _dominant_source(sources),
                "weather": {
                    "oat": weather_oat_f,
                    "humidity": weather_hum_f,
                    "condition": weather.get("condition"),
                    "source": weather.get("source"),
                },
            }
        )
        cursor = cursor + timedelta(seconds=step)

    return {
        "zone_id": zone_id or "ZONE-01",
        "t0": start.isoformat(),
        "t1": end.isoformat(),
        "step_seconds": step,
        "count": len(records),
        "records": records,
        "point_map": mapping,
    }
