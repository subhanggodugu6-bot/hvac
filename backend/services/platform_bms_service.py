"""Platform BMS status, discovery, mapping, and telemetry views."""
from __future__ import annotations

import os
import re
import threading
import time
from typing import Any, Dict, List, Optional

from backend.bms.command_writer import (
    control_writes_status,
    physical_writes_allowed,
    simulated_writes_allowed,
    write_enabled_flag,
)
from backend.bms.connection_manager import get_connection_manager, is_simulation_mode, lab_mode_enabled
from backend.bms.point_mapper import canonical_catalog, mapping_to_dict
from backend.services.canonical_telemetry_service import latest_points
from backend.services.hvac_safety_contract import STALE_SECONDS, classify_telemetry, is_demo_source, is_safe_mode


def _format_registry_model_label(raw: Optional[str]) -> str:
    """Display-only spacing for registry algorithm strings. Never invents a model name."""
    if raw is None:
        return "—"
    s = str(raw).strip()
    if not s:
        return "—"
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
    spaced = spaced.replace("_", " ").replace("-", " ")
    return " ".join(spaced.split()) or "—"


def _agent_centre_model(opportunity_id: str, *, engine: Optional[str] = None) -> str:
    """ML registry algorithm when ready; otherwise the agent ENGINE label (no empty dash)."""
    try:
        from backend.ml.prediction.service import model_status

        st = model_status(opportunity_id)
    except Exception:
        st = {"status": "MODEL_NOT_AVAILABLE"}
    if st.get("status") == "MODEL_READY":
        model = st.get("model") or {}
        label = _format_registry_model_label(model.get("model_type"))
        if label != "—":
            return label
    eng = (engine or "").strip()
    return eng if eng else "—"


def _agent_centre_control(*, catalog_control: bool, kind: Optional[str] = None) -> str:
    """Honest write / posture badge for Agent Centre cards.

    ADVISORY / MAINTENANCE / REVIEW never claim plant writes are armed.
    Sim vs live physical writes use distinct labels.
    """
    k = (kind or ("CONTROL" if catalog_control else "ADVISORY")).strip().upper()
    if k in ("ADVISORY", "MAINTENANCE", "REVIEW"):
        return k
    from backend.bms.command_writer import control_writes_status

    return control_writes_status()


def _building() -> Optional[Dict[str, Any]]:
    try:
        from database.session import SessionLocal
        from database.models import Building

        db = SessionLocal()
        try:
            b = db.query(Building).first()
            if b:
                return {"id": b.id, "name": b.name, "location": b.location}
        finally:
            db.close()
    except Exception:
        return None
    return None


def _sync_building(site: Dict[str, Any]) -> Dict[str, Any]:
    building = _building() or {}
    name = site.get("name") or building.get("name") or "Senatria Corporation"
    location = site.get("location") or building.get("location")
    try:
        from database.session import SessionLocal
        from database.models import Building

        db = SessionLocal()
        try:
            row = db.query(Building).first()
            if row and (row.location != location or row.name != name):
                row.name = name
                row.location = location
                db.commit()
            if row:
                building = {"id": row.id, "name": row.name, "location": row.location}
        finally:
            db.close()
    except Exception:
        building = {**building, "name": name, "location": location}
    return {**building, "name": name, "location": location}


def _facility_and_weather() -> Dict[str, Any]:
    from backend.services.weather_service import weather_service

    site = weather_service.facility()
    building = _sync_building(site)
    weather = weather_service.snapshot()
    weather["location"] = site.get("location")
    name = building.get("name")
    location = building.get("location")
    return {
        "building": {
            "id": building.get("id"),
            "name": name,
            "location": location,
            "timezone": site.get("timezone"),
            "city": site.get("city"),
        },
        "facility": {
            "name": name,
            "location": location,
            "timezone": site.get("timezone"),
            "city": site.get("city"),
            "lat": site.get("lat"),
            "lon": site.get("lon"),
        },
        "weather": weather,
    }


def classify_platform_telemetry(points: List[Dict[str, Any]], bms_connected: bool) -> Dict[str, Any]:
    if not points:
        status = "SIMULATED" if is_simulation_mode() else "NO_DATA"
        return {"status": status, "ageSeconds": None, "quality": None, "source": None}
    newest = points[0]
    src = newest.get("source")
    classified = classify_telemetry(
        {
            "quality": newest.get("quality"),
            "age_seconds": newest.get("age_seconds"),
            "source": src,
            "raw": newest.get("quality"),
        },
        src,
    )
    age = classified.get("age_seconds")
    if is_demo_source(src) or classified.get("demo"):
        tel = "SIMULATED"
    elif classified["status"] == "STALE":
        tel = "STALE"
    elif classified["status"] == "BAD":
        tel = "BAD"
    elif classified["status"] in ("MISSING",):
        tel = "NO_DATA"
    elif bms_connected and classified["status"] == "LIVE" and str(src or "").upper() in ("LIVE_BMS", "BMS") and str(newest.get("quality") or "").upper() == "GOOD":
        if age is None or age <= STALE_SECONDS:
            tel = "LIVE"
        else:
            tel = "STALE"
    else:
        tel = "NO_DATA" if bms_connected else ("SIMULATED" if is_simulation_mode() else "NO_DATA")
    return {
        "status": tel,
        "ageSeconds": age,
        "quality": newest.get("quality"),
        "source": src,
        "classified": classified["status"],
    }


def platform_snapshot() -> Dict[str, Any]:
    from backend.services.platform_ops_service import get_plant_mode
    from backend.workers.watchdog import watchdog_status

    mgr = get_connection_manager()
    health = mgr.health()
    connected = bool(health.connected)
    points = latest_points(limit=40)
    tel = classify_platform_telemetry(points, connected)
    safe = is_safe_mode()
    plant = get_plant_mode()
    dataset = plant == "DATASET"
    mode_s = "ADVISORY"
    if os.getenv("HVAC_USE_SIMULATION", "0").strip() in ("1", "true", "TRUE"):
        try:
            from backend.services.simulation_service import sim_service

            mode = getattr(getattr(sim_service, "orchestrator", None), "mode", None)
            mode_s = getattr(mode, "value", None) or str(mode or "ADVISORY")
        except Exception:
            mode_s = "ADVISORY"
    control = physical_writes_allowed() or simulated_writes_allowed()
    bms_status = "CONNECTED" if connected else "DISCONNECTED"
    if dataset:
        bms_status = "DISCONNECTED"
        tel = {**tel, "status": "SIMULATED"}
        connected = False
    elif str(tel.get("status") or "").upper() == "SIMULATED":
        tel = {**tel, "status": "NO_DATA"}
    site = _facility_and_weather()
    try:
        from backend.services.edge_mode import edge_status

        edge = edge_status()
    except Exception:
        edge = {"edge_mode": False, "local_loop_ok": True}
    return {
        "safeMode": safe,
        "bmsConnected": connected,
        "plantMode": plant,
        "edge": edge,
        "bms": {
            "status": bms_status,
            "protocol": health.protocol,
            "host": health.host,
            "port": health.port,
            "last_connected_at": health.last_connected_at,
            "last_error": health.message,
            "lastError": health.message,
            "code": health.code,
        },
        "bmsStatus": bms_status,
        "telemetry": tel,
        "telemetryAgeSeconds": tel.get("ageSeconds"),
        "controlEnabled": control,
        "controlLabel": control_writes_status(),
        "writeEnabled": (write_enabled_flag() and physical_writes_allowed()) or simulated_writes_allowed(),
        "mode": mode_s,
        "safety": "SAFE_HOLD" if safe else "PASS",
        "deploymentMode": os.getenv("HVAC_DEPLOYMENT_MODE", "local"),
        "bmsMode": "simulation" if is_simulation_mode() else health.protocol,
        "watchdog": watchdog_status(),
        "building": site["building"],
        "facility": site["facility"],
        "weather": site["weather"],
        "commissioning": "SUPERVISED" if physical_writes_allowed() else "READ_ONLY",
        "labMode": lab_mode_enabled(),
    }


def bms_status() -> Dict[str, Any]:
    snap = platform_snapshot()
    mgr = get_connection_manager()
    row = mgr.current_row()
    from database.session import SessionLocal
    from database.models_bms import BmsDeviceDB, BmsPointDB

    db = SessionLocal()
    try:
        n_dev = n_pt = 0
        if row:
            n_dev = db.query(BmsDeviceDB).filter(BmsDeviceDB.connection_id == row.id).count()
            n_pt = (
                db.query(BmsPointDB)
                .join(BmsDeviceDB, BmsPointDB.device_id == BmsDeviceDB.id)
                .filter(BmsDeviceDB.connection_id == row.id)
                .count()
            )
    finally:
        db.close()
    return {
        **snap["bms"],
        "devices": n_dev,
        "points": n_pt,
        "write_enabled": bool(snap.get("writeEnabled")),
        "commissioning": snap.get("commissioning") or "READ_ONLY",
        "connected": snap["bmsConnected"],
        "status": snap["bms"]["status"],
        "plantMode": snap.get("plantMode"),
        "telemetry": snap.get("telemetry"),
        "labMode": lab_mode_enabled(),
    }


def list_devices() -> List[Dict[str, Any]]:
    from database.session import SessionLocal
    from database.models_bms import BmsDeviceDB, BmsPointDB

    mgr = get_connection_manager()
    row = mgr.current_row()
    if row is None:
        return []
    db = SessionLocal()
    try:
        devices = db.query(BmsDeviceDB).filter(BmsDeviceDB.connection_id == row.id).all()
        out = []
        for d in devices:
            n = db.query(BmsPointDB).filter(BmsPointDB.device_id == d.id).count()
            out.append(
                {
                    "id": d.id,
                    "device_identifier": d.device_identifier,
                    "name": d.name,
                    "device_type": d.device_type,
                    "status": d.status,
                    "points": n,
                }
            )
        return out
    finally:
        db.close()


def list_points(device_id: str) -> List[Dict[str, Any]]:
    from database.session import SessionLocal
    from database.models_bms import BmsPointDB

    db = SessionLocal()
    try:
        pts = db.query(BmsPointDB).filter(BmsPointDB.device_id == device_id).all()
        latest = {p.get("point_id"): p for p in latest_points(limit=200)}
        out = []
        for p in pts:
            cur = latest.get(p.point_identifier) or {}
            out.append(
                {
                    "id": p.id,
                    "point_identifier": p.point_identifier,
                    "name": p.name,
                    "object_type": p.object_type,
                    "object_instance": p.object_instance,
                    "register": p.register,
                    "unit": p.unit,
                    "readable": bool(p.readable),
                    "writable": bool(p.writable),
                    "enabled": bool(p.enabled),
                    "min_value": p.min_value,
                    "max_value": p.max_value,
                    "current_value": cur.get("value"),
                    "quality": cur.get("quality"),
                    "source": cur.get("source"),
                }
            )
        return out
    finally:
        db.close()


def list_mappings() -> List[Dict[str, Any]]:
    from database.session import SessionLocal
    from database.models_bms import BmsPointDB, EquipmentPointMappingDB

    db = SessionLocal()
    try:
        rows = db.query(EquipmentPointMappingDB).all()
        latest = latest_points(limit=200)
        by_qual = {p.get("point_id"): p for p in latest}
        out = []
        for row in rows:
            pt = db.query(BmsPointDB).filter(BmsPointDB.id == row.bms_point_id).first()
            reading = by_qual.get(f"{row.equipment_id}.{row.canonical_point}")
            out.append(mapping_to_dict(row, pt, reading))
        return out
    finally:
        db.close()


def put_mapping(body: Dict[str, Any]) -> Dict[str, Any]:
    from database.session import SessionLocal
    from database.models_bms import BmsPointDB, EquipmentPointMappingDB
    import uuid
    from datetime import datetime, timezone

    from backend.bms.point_mapper import CANONICAL_POINTS, resolve_canonical_name

    equipment_id = str(body.get("equipment_id") or "").strip()
    canonical_point = resolve_canonical_name(str(body.get("canonical_point") or "").strip())
    allowed = {name for names in CANONICAL_POINTS.values() for name in names}
    if canonical_point not in allowed:
        raise ValueError(f"Unknown canonical point: {canonical_point}")
    bms_point_id = str(body.get("bms_point_id") or "").strip()
    direction = str(body.get("direction") or "READ").strip().upper()
    safety_enabled = bool(body.get("safety_enabled", True))
    if not equipment_id or not canonical_point or not bms_point_id:
        raise ValueError("equipment_id, canonical_point, and bms_point_id are required")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db = SessionLocal()
    try:
        pt = db.query(BmsPointDB).filter(BmsPointDB.id == bms_point_id).first()
        if pt is None:
            raise ValueError("Only discovered BMS points can be mapped")
        if direction in ("READ_WRITE", "WRITE", "RW") and not pt.writable:
            raise ValueError("Writable mapping requires a writable discovered point")
        row = (
            db.query(EquipmentPointMappingDB)
            .filter(
                EquipmentPointMappingDB.equipment_id == equipment_id,
                EquipmentPointMappingDB.canonical_point == canonical_point,
            )
            .first()
        )
        if row is None:
            row = EquipmentPointMappingDB(
                id=f"map_{uuid.uuid4().hex[:12]}",
                equipment_id=equipment_id,
                canonical_point=canonical_point,
                bms_point_id=bms_point_id,
                direction=direction,
                safety_enabled=safety_enabled,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        else:
            row.bms_point_id = bms_point_id
            row.direction = direction
            row.safety_enabled = safety_enabled
            row.updated_at = now
        db.commit()
        db.refresh(row)
        payload = mapping_to_dict(row, pt)
    finally:
        db.close()
    try:
        from backend.bms.telemetry_reader import poll_once

        poll_once(include_unmapped=False)
    except Exception:
        pass
    return payload


def mapped_telemetry() -> List[Dict[str, Any]]:
    maps = list_mappings()
    latest = {p.get("point_id"): p for p in latest_points(limit=200)}
    bms_status_label = platform_snapshot()["bms"]["status"]
    out = []
    for m in maps:
        key = m.get("qualified")
        row = latest.get(key) or {}
        out.append(
            {
                "equipment_id": m["equipment_id"],
                "point": m["canonical_point"],
                "value": row.get("value"),
                "unit": m.get("unit") or row.get("unit"),
                "quality": row.get("quality") or "MISSING",
                "source": row.get("source"),
                "timestamp": row.get("timestamp"),
                "age_seconds": row.get("age_seconds"),
                "bms_status": bms_status_label,
            }
        )
    return out


def _synthetic_plant_rows() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for p in latest_points(limit=400):
        pid = str(p.get("point_id") or "")
        eid = p.get("equipment_id") or (pid.split(".", 1)[0] if "." in pid else "")
        point = pid.split(".", 1)[1] if "." in pid else pid
        rows.append(
            {
                "equipment_id": eid,
                "point": point,
                "value": p.get("value"),
                "unit": p.get("unit"),
                "quality": p.get("quality") or "GOOD",
                "source": p.get("source"),
                "timestamp": p.get("timestamp"),
                "age_seconds": p.get("age_seconds"),
                "bms_status": "DISCONNECTED",
            }
        )
    return rows


def plant_overview() -> Dict[str, List[Dict[str, Any]]]:
    from backend.bms.simulation_telemetry import _use_simulation_flag

    rows = _synthetic_plant_rows() if (_use_simulation_flag() and is_simulation_mode()) else mapped_telemetry()
    if not rows and is_simulation_mode():
        rows = _synthetic_plant_rows()
    groups: Dict[str, Dict[str, Dict[str, Any]]] = {
        "chillers": {},
        "ahus": {},
        "pumps": {},
        "vfds": {},
        "condenser_water": {},
        "hot_water": {},
        "zones": {},
        "vavs": {},
    }
    for r in rows:
        eid = str(r.get("equipment_id") or "")
        eu = eid.upper()
        if eu.startswith("CH") and not eu.startswith("CW"):
            bucket = "chillers"
        elif eu.startswith("AHU"):
            bucket = "ahus"
        elif eu.startswith("P") and not eu.startswith("PARK"):
            bucket = "pumps"
        elif eu.startswith("VFD"):
            bucket = "vfds"
        elif eu.startswith("CW") or eu.startswith("CT") or eu.startswith("CWP"):
            bucket = "condenser_water"
        elif eu.startswith("HHW") or eu.startswith("BOILER") or eu.startswith("HW"):
            bucket = "hot_water"
        elif eu.startswith("ZONE"):
            bucket = "zones"
        elif eu.startswith("VAV"):
            bucket = "vavs"
        else:
            continue
        groups[bucket].setdefault(eid, {"equipment_id": eid, "points": {}})
        val = r["value"]
        groups[bucket][eid]["points"][r["point"]] = {
            "value": val,
            "unit": r.get("unit"),
            "quality": r.get("quality"),
            "display": None if val is None else val,
        }
    return {k: list(v.values()) for k, v in groups.items()}


def _agent_groups_ttl() -> float:
    try:
        return max(0.0, float(os.getenv("HVAC_AGENT_GROUPS_CACHE_SECONDS", "60")))
    except ValueError:
        return 60.0


_AGENT_GROUPS_LOCK = threading.Lock()
_AGENT_GROUPS_CACHE: Dict[str, Any] = {"at": 0.0, "payload": None, "sig": None}


def control_state_signature() -> tuple:
    """Cheap fingerprint of everything that changes control/mode labels.

    Cached payloads must never outlive a plant-mode or write-enable change, so the
    fingerprint is part of the cache key instead of relying on the TTL alone.
    """
    return (
        control_writes_status(),
        write_enabled_flag(),
        physical_writes_allowed(),
        simulated_writes_allowed(),
        is_safe_mode(),
        is_simulation_mode(),
        os.getenv("HVAC_BMS_MODE", ""),
        os.getenv("HVAC_USE_SIMULATION", ""),
    )


def _agent_groups_telemetry_sig() -> tuple:
    """Invalidate agent card cache when simulation/live telemetry first arrives."""
    try:
        from backend.services.canonical_telemetry_service import latest_points

        pts = latest_points(limit=1)
        if not pts:
            return ("no-telemetry",)
        p = pts[0]
        return (p.get("point_id"), str(p.get("timestamp") or ""), p.get("source"))
    except Exception:
        return ("telemetry-sig-error",)


def agent_groups_cache_signature() -> tuple:
    return control_state_signature() + _agent_groups_telemetry_sig()


def invalidate_agent_groups_cache() -> None:
    with _AGENT_GROUPS_LOCK:
        _AGENT_GROUPS_CACHE["payload"] = None
        _AGENT_GROUPS_CACHE["sig"] = None
        _AGENT_GROUPS_CACHE["at"] = 0.0


def agent_groups() -> List[Dict[str, Any]]:
    """Cached briefly: this walks all 20 opportunities and their ML registry rows."""
    ttl = _agent_groups_ttl()
    if not ttl:
        return _build_agent_groups()
    sig = agent_groups_cache_signature()
    cached = _AGENT_GROUPS_CACHE.get("payload")
    fresh = (
        cached is not None
        and _AGENT_GROUPS_CACHE.get("sig") == sig
        and (time.monotonic() - float(_AGENT_GROUPS_CACHE["at"])) < ttl
    )
    if fresh:
        return cached
    with _AGENT_GROUPS_LOCK:
        cached = _AGENT_GROUPS_CACHE.get("payload")
        if (
            cached is not None
            and _AGENT_GROUPS_CACHE.get("sig") == sig
            and (time.monotonic() - float(_AGENT_GROUPS_CACHE["at"])) < ttl
        ):
            return cached
        payload = _build_agent_groups()
        _AGENT_GROUPS_CACHE["payload"] = payload
        _AGENT_GROUPS_CACHE["sig"] = sig
        _AGENT_GROUPS_CACHE["at"] = time.monotonic()
        return payload


def _build_agent_groups() -> List[Dict[str, Any]]:
    try:
        from backend.ml.registry.demo_seed import ensure_demo_ml_models

        ensure_demo_ml_models()
    except Exception:
        pass

    snap = platform_snapshot()
    from backend.services.agent_recommendation_service import build_recommendation
    from backend.services.agent_telemetry_service import get_agent_context
    from backend.services.opportunity_feature_catalog import catalog_for

    groups = [
        {"id": "scheduling", "title": "Scheduling", "opportunities": ["O1", "O2", "O3", "O4"], "href": "/agents/scheduling"},
        {"id": "plant-control", "title": "Plant Control", "opportunities": ["O5", "O6", "O7", "O8", "O9"], "href": "/agents/plant-control"},
        {"id": "ventilation", "title": "Ventilation", "opportunities": ["O10", "O11", "O12", "O13"], "href": "/agents/ventilation-airflow"},
        {"id": "variable-speed", "title": "Variable Speed", "opportunities": ["O14", "O15", "O16"], "href": "/agents/variable-speed"},
        {"id": "operations", "title": "Operations & Maintenance", "opportunities": ["O17", "O18", "O19", "O20"], "href": "/agents/operations-maintenance"},
    ]
    out: List[Dict[str, Any]] = []
    for g in groups:
        cards = []
        statuses = []
        recs = []
        sources = []
        for oid in g["opportunities"]:
            ctx = get_agent_context(oid)
            rec = build_recommendation(oid)
            st = ctx["status"]
            if st == "WAITING_FOR_TELEMETRY":
                agent_label = "WAITING FOR TELEMETRY"
            elif st == "BMS_OFFLINE":
                agent_label = "BMS OFFLINE"
            elif st in ("STALE", "BAD_TELEMETRY"):
                agent_label = "HOLD"
            elif st == "SAFE_MODE":
                agent_label = "SAFE MODE"
            else:
                agent_label = "READY"
            statuses.append(agent_label)
            recs.append(rec.get("recommendation_status"))
            src = (ctx.get("telemetry") or {}).get("source")
            classified = (ctx.get("telemetry") or {}).get("classified")
            if classified == "SIMULATED" or (src and "SIMUL" in str(src).upper()):
                tel_label = "SIMULATED"
            elif classified == "LIVE" and src and str(src).upper() in ("LIVE_BMS", "BMS"):
                tel_label = "LIVE"
            elif classified == "STALE" or st == "STALE":
                tel_label = "STALE"
            else:
                tel_label = "NO DATA"
            sources.append(tel_label)
            spec = catalog_for(oid)
            ctrl = _agent_centre_control(
                catalog_control=bool(spec.get("control")),
                kind=str(spec.get("kind") or "CONTROL"),
            )
            engine = spec.get("engine") or "—"
            cards.append(
                {
                    "id": oid,
                    "status": agent_label,
                    "telemetry": tel_label,
                    "recommendation": rec.get("recommendation_status"),
                    "control": ctrl,
                    "engine": engine,
                    "model": _agent_centre_model(oid, engine=engine),
                    "kind": spec.get("kind") or "CONTROL",
                    "missing_features": ctx.get("missing_features") or [],
                }
            )
        row = dict(g)
        if "BMS OFFLINE" in statuses:
            row["status"] = "BMS OFFLINE"
        elif all(s == "WAITING FOR TELEMETRY" for s in statuses):
            row["status"] = "WAITING FOR TELEMETRY"
        elif all(s == "READY" for s in statuses):
            row["status"] = "READY"
        else:
            row["status"] = "HOLD"
        row["controlAvailability"] = control_writes_status()

        row["bms"] = snap["bms"]["status"]
        row["telemetry"] = sources[0] if sources else "NO DATA"
        row["recommendation"] = "AVAILABLE" if any(r == "AVAILABLE" for r in recs) else "UNAVAILABLE"
        row["ml"] = "ADVISORY"
        row["cards"] = cards
        out.append(row)
    return out


def evaluate_safety(context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    from backend.services.hvac_safety_contract import evaluate_dispatch

    ctx = context or {}
    snap = platform_snapshot()
    tel = snap.get("telemetry") or {}
    merged = {
        "source": tel.get("source") or ctx.get("source"),
        "telemetry": {
            "source": tel.get("source"),
            "quality": tel.get("quality"),
            "age_seconds": tel.get("ageSeconds"),
            "raw": tel.get("status"),
        },
        "supervisory": {"decision": ctx.get("decision") or "OPTIMIZE", "confidence": ctx.get("confidence")},
        "safety": {"status": snap.get("safety"), "passed": snap.get("safety") == "PASS"},
        "current_value": ctx.get("current_value"),
        "target_value": ctx.get("target_value"),
        "opportunity_id": ctx.get("opportunity_id"),
        **ctx,
    }
    ok, reason, classified = evaluate_dispatch(merged)
    return {
        "allowed": ok,
        "reason": reason,
        "code": classified.get("code"),
        "bms": snap["bms"]["status"],
        "telemetry": tel.get("status"),
        "safeMode": snap["safeMode"],
        "safety": snap.get("safety"),
        "controlEnabled": bool(snap.get("controlEnabled")),
        "checks": {
            "bms_connected": snap["bmsConnected"],
            "telemetry_live": tel.get("status") == "LIVE",
            "quality_good": (tel.get("quality") or "").upper() == "GOOD",
            "fresh": tel.get("status") == "LIVE",
            "safe_mode": snap["safeMode"],
            "write_enabled": bool(snap.get("writeEnabled")),
        },
    }


def catalog() -> List[Dict[str, str]]:
    return canonical_catalog()
