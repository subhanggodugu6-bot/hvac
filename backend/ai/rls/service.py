"""Persist and update RLS model state. Never writes BMS setpoints."""
from __future__ import annotations

import os
import threading
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

from backend.ai.rls.engine import RlsEngine
from backend.ai.rls.features import (
    MODEL_HVAC_POWER,
    MODEL_KEYS,
    MODEL_ZONE_THERMAL,
    feature_dim,
    hvac_power_xy,
    zone_thermal_xy,
)
from backend.services.hvac_safety_contract import is_demo_source

_LOCK = threading.RLock()
_ERROR_RING: Dict[str, Deque[Dict[str, Any]]] = defaultdict(lambda: deque(maxlen=60))
_ERROR_RING_LOADED = False
_ERROR_RING_SETTINGS_KEY = "RLS_ERROR_RINGS"

_MIN_UPDATES = int(os.getenv("HVAC_RLS_MIN_UPDATES", "20") or "20")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _source_mode(source: Any) -> str:
    s = str(source or "").upper().strip()
    if is_demo_source(source) or s in ("SIMULATION", "DEMO", "DATASET"):
        return "SIMULATION"
    if s in ("UNKNOWN", "NONE", "WEATHER", ""):
        try:
            from backend.bms.connection_manager import is_simulation_mode

            if is_simulation_mode():
                return "SIMULATION"
        except Exception:
            return "SIMULATION"
    return "LIVE_BMS"


def consolidate_demo_rls_rows(zone_id: str = "ZONE-01") -> int:
    """Merge stray LIVE_BMS RLS rows into SIMULATION when running in demo/sim."""
    try:
        from backend.bms.connection_manager import is_simulation_mode

        if not is_simulation_mode():
            return 0
    except Exception:
        return 0

    from database.session import SessionLocal
    from database.models_platform import RlsModelStateDB

    db = SessionLocal()
    changed = 0
    try:
        rows = db.query(RlsModelStateDB).filter(RlsModelStateDB.zone_id == zone_id).all()
        by_key: Dict[str, List[Any]] = {}
        for row in rows:
            by_key.setdefault(row.model_key, []).append(row)
        for _key, group in by_key.items():
            sim = [r for r in group if r.source_mode == "SIMULATION"]
            live = [r for r in group if r.source_mode == "LIVE_BMS"]
            if not live:
                continue
            if sim:
                for r in live:
                    db.delete(r)
                    changed += 1
            else:
                for r in live:
                    r.source_mode = "SIMULATION"
                    changed += 1
        if changed:
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    return changed


def _ring_key(model_key: str, zone_id: str, source_mode: str) -> str:
    return f"{source_mode}:{zone_id}:{model_key}"


def _ensure_error_rings_loaded() -> None:
    """Hydrate in-memory rings from PlatformSettingDB once per process."""
    global _ERROR_RING_LOADED
    if _ERROR_RING_LOADED:
        return
    with _LOCK:
        if _ERROR_RING_LOADED:
            return
        try:
            from database.session import SessionLocal
            from database.models_platform import PlatformSettingDB

            db = SessionLocal()
            try:
                row = db.query(PlatformSettingDB).filter_by(key=_ERROR_RING_SETTINGS_KEY).first()
                if row and row.value:
                    import json

                    data = json.loads(row.value)
                    if isinstance(data, dict):
                        for key, items in data.items():
                            if not isinstance(items, list):
                                continue
                            dq: Deque[Dict[str, Any]] = deque(maxlen=60)
                            for it in items[-60:]:
                                if isinstance(it, dict):
                                    dq.append(it)
                            _ERROR_RING[key] = dq
            finally:
                db.close()
        except Exception:
            pass
        _ERROR_RING_LOADED = True


def _persist_error_rings() -> None:
    """Write clipped rings to platform_settings (best-effort)."""
    try:
        import json
        from database.session import SessionLocal
        from database.models_platform import PlatformSettingDB

        with _LOCK:
            payload = {k: list(v) for k, v in _ERROR_RING.items() if v}
        raw = json.dumps(payload)
        db = SessionLocal()
        try:
            row = db.query(PlatformSettingDB).filter_by(key=_ERROR_RING_SETTINGS_KEY).first()
            now = _now()
            if row:
                row.value = raw
                row.updated_at = now
            else:
                db.add(PlatformSettingDB(key=_ERROR_RING_SETTINGS_KEY, value=raw, updated_at=now))
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
    except Exception:
        pass


def _status_for(n_updates: int) -> str:
    return "READY" if int(n_updates) >= max(1, _MIN_UPDATES) else "WARMING"


def _get_or_create_row(
    db,
    *,
    building_id: Optional[str],
    zone_id: str,
    model_key: str,
    source_mode: str,
):
    from database.models_platform import RlsModelStateDB

    bid = building_id or os.getenv("HVAC_DEFAULT_BUILDING_ID") or "bldg-corp-hq-01"
    row = (
        db.query(RlsModelStateDB)
        .filter(
            RlsModelStateDB.building_id == bid,
            RlsModelStateDB.zone_id == zone_id,
            RlsModelStateDB.model_key == model_key,
            RlsModelStateDB.source_mode == source_mode,
        )
        .first()
    )
    if row is None:
        n = feature_dim(model_key)
        eng = RlsEngine(n)
        now = _now()
        row = RlsModelStateDB(
            id=f"rls_{uuid.uuid4().hex[:12]}",
            building_id=bid,
            zone_id=zone_id,
            model_key=model_key,
            source_mode=source_mode,
            theta_json=eng.theta.tolist(),
            p_json=eng.P.tolist(),
            lambda_=eng.lam,
            n_updates=0,
            last_error=None,
            rmse_ewma=None,
            last_predicted=None,
            last_actual=None,
            last_sample_ts=None,
            updated_at=now,
            status="WARMING",
            version=0,
        )
        db.add(row)
        db.flush()
    return row


def _engine_from_row(row) -> RlsEngine:
    return RlsEngine(
        feature_dim(row.model_key),
        lam=row.lambda_,
        theta=row.theta_json,
        p=row.p_json,
    )


def _apply_update(row, eng: RlsEngine, result: Dict[str, Any], sample_ts: Optional[str]) -> None:
    if not result.get("updated"):
        row.last_predicted = result.get("predicted")
        row.last_actual = result.get("actual")
        row.last_error = result.get("error")
        row.updated_at = _now()
        return
    err = float(result["error"])
    row.theta_json = eng.theta.tolist()
    row.p_json = eng.P.tolist()
    row.lambda_ = eng.lam
    row.n_updates = int(row.n_updates or 0) + 1
    row.last_error = err
    row.last_predicted = result.get("predicted")
    row.last_actual = result.get("actual")
    row.last_sample_ts = sample_ts
    row.updated_at = _now()
    row.version = int(row.version or 0) + 1
    prev = row.rmse_ewma
    row.rmse_ewma = (0.9 * float(prev) + 0.1 * abs(err)) if prev is not None else abs(err)
    row.status = _status_for(row.n_updates)
    _ensure_error_rings_loaded()
    with _LOCK:
        _ERROR_RING[_ring_key(row.model_key, row.zone_id, row.source_mode)].append(
            {
                "timestamp": sample_ts or _now().isoformat(),
                "model_key": row.model_key,
                "zone_id": row.zone_id,
                "source_mode": row.source_mode,
                "predicted": result.get("predicted"),
                "actual": result.get("actual"),
                "error": err,
            }
        )


def update_from_records(
    records: List[Dict[str, Any]],
    *,
    zone_id: str = "ZONE-01",
    building_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Update both RLS models from aligned normalized AI records. No BMS writes."""
    if not records:
        return {"updated": 0, "models": []}

    from database.session import SessionLocal

    db = SessionLocal()
    stats = {MODEL_ZONE_THERMAL: 0, MODEL_HVAC_POWER: 0}
    ring_dirty = False
    try:
        # Group by source_mode; never mix LIVE and SIM in one row.
        by_mode: Dict[str, List[Dict[str, Any]]] = {}
        for r in records:
            mode = _source_mode(r.get("source"))
            by_mode.setdefault(mode, []).append(r)

        for mode, rows in by_mode.items():
            # HVAC power: each row
            power_row = _get_or_create_row(
                db, building_id=building_id, zone_id=zone_id, model_key=MODEL_HVAC_POWER, source_mode=mode
            )
            power_eng = _engine_from_row(power_row)
            for r in rows:
                xy = hvac_power_xy(r)
                if xy is None:
                    continue
                x, y = xy
                result = power_eng.update(x, y)
                _apply_update(power_row, power_eng, result, r.get("Timestamp"))
                if result.get("updated"):
                    stats[MODEL_HVAC_POWER] += 1
                    ring_dirty = True

            # Zone thermal: consecutive pairs
            thermal_row = _get_or_create_row(
                db, building_id=building_id, zone_id=zone_id, model_key=MODEL_ZONE_THERMAL, source_mode=mode
            )
            thermal_eng = _engine_from_row(thermal_row)
            for i in range(len(rows) - 1):
                xy = zone_thermal_xy(rows[i], rows[i + 1])
                if xy is None:
                    continue
                x, y = xy
                result = thermal_eng.update(x, y)
                _apply_update(thermal_row, thermal_eng, result, rows[i + 1].get("Timestamp"))
                if result.get("updated"):
                    stats[MODEL_ZONE_THERMAL] += 1
                    ring_dirty = True

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # Persist after main session closed (SQLite cannot nest writers).
    if ring_dirty:
        _persist_error_rings()

    return {
        "updated": sum(stats.values()),
        "models": [{"model_key": k, "updates": v} for k, v in stats.items()],
        "zone_id": zone_id,
    }


def _row_to_status(row) -> Dict[str, Any]:
    return {
        "id": row.id,
        "building_id": row.building_id,
        "zone_id": row.zone_id,
        "model_key": row.model_key,
        "source_mode": row.source_mode,
        "status": row.status,
        "n_updates": int(row.n_updates or 0),
        "last_error": row.last_error,
        "rmse_ewma": row.rmse_ewma,
        "last_predicted": row.last_predicted,
        "last_actual": row.last_actual,
        "last_sample_ts": row.last_sample_ts.isoformat() if hasattr(row.last_sample_ts, "isoformat") else row.last_sample_ts,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "version": int(row.version or 0),
        "lambda": row.lambda_,
    }


def list_status(zone_id: Optional[str] = None) -> List[Dict[str, Any]]:
    from database.session import SessionLocal
    from database.models_platform import RlsModelStateDB

    db = SessionLocal()
    try:
        q = db.query(RlsModelStateDB)
        if zone_id:
            q = q.filter(RlsModelStateDB.zone_id == zone_id)
        rows = q.order_by(RlsModelStateDB.model_key.asc(), RlsModelStateDB.source_mode.asc()).all()
        return [_row_to_status(r) for r in rows]
    finally:
        db.close()


def snapshot_all(zone_id: Optional[str] = None) -> Dict[str, Any]:
    rows = list_status(zone_id)
    return {
        "models": rows,
        "count": len(rows),
        "keys": list(MODEL_KEYS),
        "min_updates_ready": max(1, _MIN_UPDATES),
    }


def params_for(model_key: str, zone_id: str = "ZONE-01", source_mode: Optional[str] = None) -> Dict[str, Any]:
    from database.session import SessionLocal
    from database.models_platform import RlsModelStateDB

    db = SessionLocal()
    try:
        q = db.query(RlsModelStateDB).filter(
            RlsModelStateDB.model_key == model_key,
            RlsModelStateDB.zone_id == zone_id,
        )
        if source_mode:
            q = q.filter(RlsModelStateDB.source_mode == source_mode)
        row = q.order_by(RlsModelStateDB.updated_at.desc()).first()
        if row is None:
            return {"model_key": model_key, "zone_id": zone_id, "found": False}
        eng = _engine_from_row(row)
        payload = eng.to_dict()
        return {
            "found": True,
            **_row_to_status(row),
            "theta": payload["theta"],
            "lambda": payload["lambda"],
            "p_diag": payload["p_diag"],
            "n_features": payload["n_features"],
        }
    finally:
        db.close()


def error_trend(model_key: str, zone_id: str = "ZONE-01", source_mode: Optional[str] = None, limit: int = 60) -> Dict[str, Any]:
    _ensure_error_rings_loaded()
    with _LOCK:
        if source_mode:
            key = _ring_key(model_key, zone_id, source_mode)
            items = list(_ERROR_RING.get(key, []))
        else:
            items = []
            for mode in ("LIVE_BMS", "SIMULATION"):
                items.extend(list(_ERROR_RING.get(_ring_key(model_key, zone_id, mode), [])))
            items.sort(key=lambda r: r.get("timestamp") or "")
    return {
        "model_key": model_key,
        "zone_id": zone_id,
        "source_mode": source_mode,
        "errors": items[-max(1, min(int(limit), 60)) :],
        "count": len(items),
    }


def clear_error_rings() -> None:
    global _ERROR_RING_LOADED
    with _LOCK:
        _ERROR_RING.clear()
        _ERROR_RING_LOADED = False
    try:
        from database.session import SessionLocal
        from database.models_platform import PlatformSettingDB

        db = SessionLocal()
        try:
            db.query(PlatformSettingDB).filter_by(key=_ERROR_RING_SETTINGS_KEY).delete()
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
    except Exception:
        pass


def unload_error_rings_memory() -> None:
    """Test helper: drop in-memory rings but keep DB so reload hydrates."""
    global _ERROR_RING_LOADED
    with _LOCK:
        _ERROR_RING.clear()
        _ERROR_RING_LOADED = False
