"""O1 telemetry ingestion: map → validate → persist. Never coerce missing to 0."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from database.session import SessionLocal
from database.models_o1 import O1PointMapDB, O1TelemetrySampleDB, O1ConfigurationDB, OccupancyScheduleDB

RANGES = {
    "ZONE_TEMP": (-5, 45),
    "OAT": (-30, 55),
    "OA_RH": (0, 100),
    "ZONE_RH": (0, 100),
    "SOLAR": (0, 1400),
    "SAT": (5, 40),
    "RAT": (10, 40),
    "MAT": (5, 40),
    "FAN_SPEED": (0, 100),
    "POWER": (0, 500),
}

MAP_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "o1_point_map.json")


def load_point_map(db=None) -> List[Dict[str, Any]]:
    rows = []
    own = db is None
    if own:
        db = SessionLocal()
    try:
        mapped = db.query(O1PointMapDB).all()
        if mapped:
            return [
                {
                    "signal": r.signal,
                    "point_id": r.point_id,
                    "unit": r.unit,
                    "data_type": r.data_type,
                    "required": bool(r.required),
                    "quality_requirement": r.quality_requirement,
                    "freshness_seconds": r.freshness_seconds or 30,
                }
                for r in mapped
            ]
    finally:
        if own:
            db.close()
    with open(os.path.abspath(MAP_PATH), "r", encoding="utf-8") as f:
        return json.load(f)


def _ensure_o1_prerequisites(db) -> None:
    from database.models import Building, Equipment

    bid = "bldg-corp-hq-01"
    if db.query(Building).filter_by(id=bid).first() is None:
        db.add(
            Building(
                id=bid,
                name="Senatria Corporation",
                area_sqft=75000.0,
                floors=3,
                design_cooling_tonnage=240.0,
                location="Bengaluru, Karnataka, India",
            )
        )
    eid = "AHU-1"
    if db.query(Equipment).filter_by(id=eid).first() is None:
        db.add(
            Equipment(
                id=eid,
                building_id=bid,
                name="Floor 1-2 Air Handling Unit",
                type="AHU",
            )
        )


def ensure_point_map_and_config() -> None:
    db = SessionLocal()
    try:
        _ensure_o1_prerequisites(db)
        if db.query(O1PointMapDB).count() == 0:
            with open(os.path.abspath(MAP_PATH), "r", encoding="utf-8") as f:
                for row in json.load(f):
                    db.add(O1PointMapDB(**{k: row[k] for k in row if k in {
                        "signal", "point_id", "unit", "data_type", "required", "quality_requirement", "freshness_seconds"
                    }}))
        if db.query(O1ConfigurationDB).filter_by(id="o1-default").first() is None:
            db.add(O1ConfigurationDB(id="o1-default", building_id="bldg-corp-hq-01", equipment_id="AHU-1"))
        if db.query(OccupancyScheduleDB).count() == 0:
            for wd in range(7):
                db.add(OccupancyScheduleDB(
                    building_id="bldg-corp-hq-01",
                    zone_id="ZONE-AVG",
                    weekday=wd,
                    occupancy_start="08:00",
                    occupancy_end="18:00",
                    is_weekend=wd >= 5,
                    source="CONFIG",
                ))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def _parse_ts(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def ingest_samples(samples: List[Dict[str, Any]], source: str = "BACnet_IP") -> Dict[str, Any]:
    """samples: {signal or point_id, value, timestamp, quality, unit}"""
    ensure_point_map_and_config()
    mapping = {m["signal"]: m for m in load_point_map()}
    accepted = 0
    rejected = 0
    db = SessionLocal()
    now = datetime.utcnow()
    try:
        for s in samples:
            signal = s.get("signal")
            meta = mapping.get(signal) if signal else None
            ts = _parse_ts(s.get("timestamp")) or now
            if ts > now + timedelta(minutes=5) or ts < now - timedelta(days=30):
                rejected += 1
                continue
            val = s.get("value")
            if val is None:
                quality = "MISSING"
            else:
                try:
                    val = float(val)
                except (TypeError, ValueError):
                    rejected += 1
                    continue
                rng = RANGES.get(signal or "")
                if rng and (val < rng[0] or val > rng[1]):
                    quality = "BAD"
                else:
                    quality = (s.get("quality") or "GOOD").upper()
            if quality == "MISSING" and val is None:
                pass
            db.add(
                O1TelemetrySampleDB(
                    point_id=s.get("point_id") or (meta["point_id"] if meta else signal or "unknown"),
                    signal=signal or "UNKNOWN",
                    timestamp=ts,
                    value=val,
                    unit=s.get("unit") or (meta["unit"] if meta else None),
                    quality=quality,
                    source=s.get("source") or source,
                    raw_value=None if s.get("value") is None else str(s.get("value")),
                    ingested_at=now,
                    building_id=s.get("building_id", "bldg-corp-hq-01"),
                    equipment_id=s.get("equipment_id", "AHU-1"),
                    zone_id=s.get("zone_id"),
                )
            )
            accepted += 1
        db.commit()
    finally:
        db.close()
    return {"accepted": accepted, "rejected": rejected}


def latest_signals() -> Dict[str, Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = db.query(O1TelemetrySampleDB).order_by(O1TelemetrySampleDB.timestamp.desc()).limit(400).all()
        latest: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            if r.signal in latest:
                continue
            latest[r.signal] = {
                "value": r.value,
                "unit": r.unit,
                "quality": r.quality,
                "source": r.source,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
        return latest
    finally:
        db.close()


def telemetry_health(stale_seconds: int = 30) -> Dict[str, Any]:
    mapping = load_point_map()
    latest = latest_signals()
    now = datetime.utcnow()
    healthy = stale = missing = bad = 0
    ages = []
    for m in mapping:
        sig = m["signal"]
        row = latest.get(sig)
        if row is None or row.get("value") is None:
            missing += 1
            continue
        q = (row.get("quality") or "").upper()
        if q in ("BAD", "BAD_QUALITY"):
            bad += 1
            continue
        ts = _parse_ts(row.get("timestamp"))
        age = (now - ts).total_seconds() if ts else None
        if age is not None:
            ages.append(age)
        thresh = m.get("freshness_seconds") or stale_seconds
        if q != "GOOD" or (age is not None and age > thresh):
            stale += 1
        else:
            healthy += 1
    age = min(ages) if ages else None
    if not latest:
        overall = "MISSING"
    elif healthy == 0 and (stale or bad or missing):
        overall = "STALE" if stale else ("BAD_QUALITY" if bad else "MISSING")
    elif age is not None and age > stale_seconds:
        overall = "STALE"
    else:
        overall = "HEALTHY"
    return {
        "overall": overall,
        "telemetry_age_seconds": round(age, 1) if age is not None else None,
        "healthy_points": healthy,
        "stale_points": stale,
        "missing_points": missing,
        "bad_quality_points": bad,
        "latest_timestamp": min((v["timestamp"] for v in latest.values() if v.get("timestamp")), default=None),
        "signals": latest,
        "source": next((v.get("source") for v in latest.values() if v.get("source")), None),
    }


def live_value(signal: str) -> Optional[float]:
    row = latest_signals().get(signal)
    if not row:
        return None
    if (row.get("quality") or "").upper() != "GOOD":
        return None
    return row.get("value")
