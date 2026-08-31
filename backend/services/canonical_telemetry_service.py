"""Canonical telemetry ingest + latest-read + time-window query. Never coerce missing to 0."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, Union

from backend.services.hvac_safety_contract import (
    STALE_SECONDS,
    classify_telemetry,
    ingest_quality,
    is_demo_source,
    normalize_telemetry_source,
    accepts_telemetry_source,
)
from backend.services.timeseries_buffer import covers as buffer_covers
from backend.services.timeseries_buffer import parse_time
from backend.services.timeseries_buffer import push as buffer_push
from backend.services.timeseries_buffer import window_many as buffer_window_many
from backend.services.ttl_cache import cache_clear, cache_get, cache_set

_LATEST_TTL = float(os.getenv("HVAC_LATEST_POINTS_TTL", "2.5"))
_CACHE_PREFIX = "latest_points"
_WINDOW_LIMIT_CAP = 5000

LIVE_SOURCES = {"LIVE_BMS", "BMS"}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_reading(
    point_id: str,
    value: Optional[float],
    unit: Optional[str],
    source: str,
    quality: str,
    building_id: Optional[str],
    asset_id: Optional[str],
    equipment_id: Optional[str],
    timestamp: Optional[datetime],
):
    """Shared quality/age derivation for both the single and batch ingest paths."""
    from database.models_platform import CanonicalTelemetryDB

    ts = timestamp or _now()
    age = max(0.0, (_now() - ts).total_seconds())
    src = normalize_telemetry_source(source)
    q = ingest_quality(value, quality)
    if is_demo_source(src) and q == "LIVE":
        q = "GOOD"
    if age > STALE_SECONDS and q == "GOOD" and src in LIVE_SOURCES:
        q = "STALE"
    row = CanonicalTelemetryDB(
        point_id=point_id,
        building_id=building_id,
        asset_id=asset_id or equipment_id,
        equipment_id=equipment_id or asset_id,
        timestamp=ts,
        value=value,
        unit=unit,
        source=src,
        quality=q,
        age_seconds=age,
    )
    return row, ts, age, src, q


def record_points(readings: Sequence[Dict[str, Any]]) -> int:
    """Ingest many readings in one transaction.

    The simulation feeder publishes ~160 points per tick; committing each one
    separately dominated request time, so callers with a full tick use this.
    """
    if not readings:
        return 0
    from database.session import SessionLocal

    prepared = [
        _normalize_reading(
            point_id=r["point_id"],
            value=r.get("value"),
            unit=r.get("unit"),
            source=r.get("source") or "SIMULATION",
            quality=r.get("quality") or "GOOD",
            building_id=r.get("building_id"),
            asset_id=r.get("asset_id"),
            equipment_id=r.get("equipment_id"),
            timestamp=r.get("timestamp"),
        )
        for r in readings
    ]
    db = SessionLocal()
    try:
        db.add_all([p[0] for p in prepared])
        db.commit()
        payloads = [as_contract(p[0]) for p in prepared]
    except Exception:
        db.rollback()
        return 0
    finally:
        db.close()
    cache_clear(_CACHE_PREFIX)
    for payload in payloads:
        try:
            buffer_push(payload["point_id"], payload)
        except Exception:
            pass
    return len(payloads)


def record_point(
    point_id: str,
    value: Optional[float],
    unit: Optional[str],
    source: str,
    quality: str,
    building_id: Optional[str] = None,
    asset_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    from database.session import SessionLocal

    row, ts, age, src, q = _normalize_reading(
        point_id, value, unit, source, quality, building_id, asset_id, equipment_id, timestamp
    )
    db = SessionLocal()
    committed = False
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        payload = as_contract(row)
        cache_clear(_CACHE_PREFIX)
        committed = True
    except Exception:
        db.rollback()
        payload = {
            "point_id": point_id,
            "building_id": building_id,
            "asset_id": asset_id or equipment_id,
            "equipment_id": equipment_id or asset_id,
            "timestamp": ts.isoformat() if ts else None,
            "value": value,
            "unit": unit,
            "source": src,
            "quality": q,
            "age_seconds": age,
            "classified": classify_telemetry(
                {"quality": q, "age_seconds": age, "value": value, "raw": q, "source": src}, src
            )["status"],
        }
    finally:
        db.close()
    if committed:
        try:
            buffer_push(point_id, payload)
        except Exception:
            pass
    return payload


def as_contract(row: Any) -> Dict[str, Any]:
    age = getattr(row, "age_seconds", None)
    payload = {
        "point_id": row.point_id,
        "building_id": row.building_id,
        "asset_id": row.asset_id,
        "equipment_id": getattr(row, "equipment_id", None) or row.asset_id,
        "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        "value": row.value,
        "unit": row.unit,
        "source": row.source,
        "quality": row.quality,
        "age_seconds": age,
    }
    classified = classify_telemetry(
        {"quality": row.quality, "age_seconds": age, "value": row.value, "raw": row.quality, "source": row.source},
        row.source,
    )
    payload["classified"] = classified["status"]
    return payload


def latest_points(building_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    from database.session import SessionLocal
    from database.models_platform import CanonicalTelemetryDB
    from sqlalchemy import or_

    key = (_CACHE_PREFIX, building_id or "", int(limit))
    cached = cache_get(key)
    if cached is not None:
        return cached

    db = SessionLocal()
    try:
        q = db.query(CanonicalTelemetryDB)
        if building_id:
            q = q.filter(
                or_(
                    CanonicalTelemetryDB.building_id == building_id,
                    CanonicalTelemetryDB.building_id.is_(None),
                )
            )
        fetch = max(int(limit) * 6, 80)
        rows = q.order_by(CanonicalTelemetryDB.timestamp.desc(), CanonicalTelemetryDB.id.desc()).limit(fetch).all()
        payload: List[Dict[str, Any]] = []
        seen = set()
        for r in rows:
            if not accepts_telemetry_source(r.source):
                continue
            pid = r.point_id
            if pid in seen:
                continue
            seen.add(pid)
            payload.append(as_contract(r))
            if len(payload) >= limit:
                break
        cache_set(key, payload, _LATEST_TTL)
        return payload
    except Exception:
        return []
    finally:
        db.close()


def find_point_by_suffix(points: List[Dict[str, Any]]) -> Callable[..., Optional[Dict[str, Any]]]:
    """Index latest points once, then look up by equipment_id + point_id substring."""
    indexed: Dict[Any, List[Tuple[str, Dict[str, Any]]]] = {}
    for row in points:
        pid = (row.get("point_id") or "").lower()
        indexed.setdefault(row.get("equipment_id"), []).append((pid, row))

    def find(equipment_id: Any, *suffixes: str) -> Optional[Dict[str, Any]]:
        rows = indexed.get(equipment_id) or []
        for suffix in suffixes:
            needle = suffix.lower()
            for pid, row in rows:
                if needle in pid:
                    return row
        return None

    return find


def _normalize_point_ids(
    point_id: Optional[str] = None,
    point_ids: Optional[Sequence[str]] = None,
) -> List[str]:
    out: List[str] = []
    if point_ids:
        for p in point_ids:
            if p is None:
                continue
            for part in str(p).split(","):
                s = part.strip()
                if s and s not in out:
                    out.append(s)
    if point_id:
        for part in str(point_id).split(","):
            s = part.strip()
            if s and s not in out:
                out.append(s)
    return out


def query_telemetry(
    building_id: Optional[str] = None,
    point_id: Optional[str] = None,
    point_ids: Optional[Sequence[str]] = None,
    asset_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    t0: Optional[Union[datetime, str, float]] = None,
    t1: Optional[Union[datetime, str, float]] = None,
    limit: int = 200,
    prefer_buffer: bool = True,
) -> List[Dict[str, Any]]:
    """Time-ordered telemetry window. Prefer in-memory ring buffer when it covers [t0, t1]."""
    del opportunity_id  # reserved for join to opportunity point maps
    pids = _normalize_point_ids(point_id, point_ids)
    start = parse_time(t0)
    end = parse_time(t1)
    lim = max(1, min(int(limit or 200), _WINDOW_LIMIT_CAP))

    if prefer_buffer and pids and (start is not None or end is not None) and buffer_covers(pids, start, end):
        merged: List[Dict[str, Any]] = []
        for _pid, rows in buffer_window_many(pids, start, end).items():
            for r in rows:
                if not accepts_telemetry_source(r.get("source")):
                    continue
                if asset_id and (r.get("asset_id") or r.get("equipment_id")) not in (asset_id,):
                    continue
                if building_id and r.get("building_id") not in (None, building_id):
                    continue
                merged.append(dict(r))
        merged.sort(key=lambda r: parse_time(r.get("timestamp")) or datetime.min)
        return merged[:lim]

    from database.session import SessionLocal
    from database.models_platform import CanonicalTelemetryDB
    from sqlalchemy import or_

    db = SessionLocal()
    try:
        q = db.query(CanonicalTelemetryDB)
        if building_id:
            q = q.filter(
                or_(
                    CanonicalTelemetryDB.building_id == building_id,
                    CanonicalTelemetryDB.building_id.is_(None),
                )
            )
        if len(pids) == 1:
            q = q.filter(CanonicalTelemetryDB.point_id == pids[0])
        elif len(pids) > 1:
            q = q.filter(CanonicalTelemetryDB.point_id.in_(pids))
        if asset_id:
            q = q.filter(CanonicalTelemetryDB.asset_id == asset_id)
        if start is not None:
            q = q.filter(CanonicalTelemetryDB.timestamp >= start)
        if end is not None:
            q = q.filter(CanonicalTelemetryDB.timestamp <= end)
        if start is not None or end is not None or pids:
            rows = q.order_by(CanonicalTelemetryDB.timestamp.asc(), CanonicalTelemetryDB.id.asc()).limit(lim).all()
        else:
            rows = q.order_by(CanonicalTelemetryDB.timestamp.desc()).limit(lim).all()
        out: List[Dict[str, Any]] = []
        for r in rows:
            if not accepts_telemetry_source(r.source):
                continue
            out.append(as_contract(r))
        return out
    finally:
        db.close()
