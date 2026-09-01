"""Operator home payload: OEH Table 1 + live plant. GUIDE_POTENTIAL is never measured kW."""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict, List, Optional

from backend.knowledge.hvac_guide_catalog import GUIDE_PAGES, GUIDE_SECTIONS, catalog_record
from backend.services.oeh_guide_catalog import GUIDE_META, ROUTES
from backend.services.platform_bms_service import agent_groups, plant_overview, platform_snapshot
from backend.services.canonical_telemetry_service import latest_points, query_telemetry
from backend.services.opportunity_feature_catalog import catalog_for

OID_BUCKETS: Dict[str, List[str]] = {
    "O1": ["zones"],
    "O2": ["zones"],
    "O3": ["ahus"],
    "O4": ["chillers"],
    "O5": ["ahus", "vavs"],
    "O6": ["hot_water"],
    "O7": ["chillers"],
    "O8": ["condenser_water", "chillers"],
    "O9": ["chillers"],
    "O10": ["ahus"],
    "O11": ["ahus", "zones"],
    "O12": ["ahus", "zones"],
    "O13": ["co"],
    "O14": ["pumps"],
    "O15": ["chillers"],
    "O16": ["condenser_water", "chillers"],
    "O17": ["chillers"],
    "O18": ["zones"],
    "O19": ["chillers"],
    "O20": ["chillers"],
}

CHAPTER_META = [
    {
        "id": "scheduling",
        "title": "Scheduling",
        "section": "Section 2 – System supervisory control optimisations",
        "href": "/agents/scheduling",
        "opportunities": ["O1", "O2", "O3", "O4"],
    },
    {
        "id": "plant-control",
        "title": "Plant Control",
        "section": "Section 3 – Plant control parameter optimisations",
        "href": "/agents/plant-control",
        "opportunities": ["O5", "O6", "O7", "O8", "O9"],
    },
    {
        "id": "ventilation",
        "title": "Ventilation",
        "section": "Section 4 – Ventilation and air flow optimisations",
        "href": "/agents/ventilation-airflow",
        "opportunities": ["O10", "O11", "O12", "O13"],
    },
    {
        "id": "variable-speed",
        "title": "Variable Speed",
        "section": "Section 5 – Variable speed based optimisations",
        "href": "/agents/variable-speed",
        "opportunities": ["O14", "O15", "O16"],
    },
    {
        "id": "operations",
        "title": "Operations & Maintenance",
        "section": "Section 6 – Best practice HVAC operation and maintenance",
        "href": "/agents/operations-maintenance",
        "opportunities": ["O17", "O18", "O19", "O20"],
    },
]


def _is_co_point_id(pid: str, name: str = "", equipment_id: str = "") -> bool:
    p = str(pid or "").upper().replace("-", "_")
    n = str(name or "").upper().replace("-", "_")
    e = str(equipment_id or "").upper()
    if "CO2" in p or "CO2" in n:
        return False
    if e.startswith("PARK"):
        return n in ("CO", "CO_PPM") or p.endswith(".CO") or p.endswith("CO_PPM")
    return n in ("CO", "CO_PPM") or p.endswith(".CO_PPM") or p.endswith(".CO")


def _has_co_points(points: List[Dict[str, Any]], plant: Dict[str, List[Dict[str, Any]]]) -> bool:
    for p in points:
        pid = str(p.get("point_id") or "")
        name = str(p.get("point") or (pid.split(".", 1)[1] if "." in pid else pid))
        eid = str(p.get("equipment_id") or "")
        if _is_co_point_id(pid, name, eid):
            return True
    for row in plant.get("zones") or []:
        pts = row.get("points") or {}
        eid = str(row.get("equipment_id") or "")
        for key in pts:
            if _is_co_point_id(f"{eid}.{key}", str(key), eid):
                return True
    return False


def _plant_empty(plant: Dict[str, List[Dict[str, Any]]]) -> bool:
    return all(not (plant.get(k) or []) for k in plant)


def _bucket_present(oid: str, plant: Dict[str, List[Dict[str, Any]]], has_co: bool) -> bool:
    if oid == "O13":
        return has_co
    for bucket in OID_BUCKETS.get(oid, []):
        if plant.get(bucket):
            return True
    return False


def _applicability(oid: str, missing: List[str], plant: Dict[str, List[Dict[str, Any]]], has_co: bool) -> str:
    if oid == "O13" and not has_co:
        return "N/A"
    empty = _plant_empty(plant)
    present = _bucket_present(oid, plant, has_co)
    if empty or not present:
        return "Unmapped"
    if missing:
        return "Limited"
    return "Y"


def _point_tone(points: Dict[str, Any]) -> str:
    if not points:
        return "unmapped"
    quals = [str((p or {}).get("quality") or "").upper() for p in points.values()]
    vals = [(p or {}).get("value") for p in points.values()]
    if any(q == "BAD" for q in quals):
        return "bad"
    if any(q == "STALE" for q in quals):
        return "stale"
    if all(v is None or q in ("MISSING", "") for v, q in zip(vals, quals)):
        return "missing"
    return "good"


def _decorate_layers(plant: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    for bucket, rows in plant.items():
        decorated = []
        for row in rows:
            pts = row.get("points") or {}
            decorated.append({**row, "tone": _point_tone(pts)})
        out[bucket] = decorated
    return out


def _tons_from_plant_layers(plant: Dict[str, List[Dict[str, Any]]]) -> Optional[float]:
    """Best-effort plant load from chiller Load / tons points."""
    loads: List[float] = []
    for row in plant.get("chillers") or []:
        for name, p in (row.get("points") or {}).items():
            key = str(name).lower()
            if key not in ("load", "coolingload", "plantload") and "load" not in key:
                continue
            val = (p or {}).get("value")
            if val is None:
                continue
            try:
                v = float(val)
            except (TypeError, ValueError):
                continue
            unit = str((p or {}).get("unit") or "").lower()
            if unit in ("ton", "tons", "t", "tonnage"):
                loads.append(v)
            elif unit in ("", "%") and 0 < v < 500:
                loads.append(v)
    return round(max(loads), 1) if loads else None


def _kw_from_plant_layers(plant: Dict[str, List[Dict[str, Any]]]) -> Optional[float]:
    """Sum chiller `power` points only — avoid double-counting compressor sub-meters."""
    total = 0.0
    found = False
    for row in plant.get("chillers") or []:
        pts = row.get("points") or {}
        for name, p in pts.items():
            if str(name).lower() != "power":
                continue
            val = (p or {}).get("value")
            if val is None:
                continue
            try:
                total += float(val)
                found = True
            except (TypeError, ValueError):
                continue
    if found:
        return round(total, 1)
    # Fallback: any equipment-level power/kW point
    for rows in plant.values():
        for row in rows:
            for name, p in (row.get("points") or {}).items():
                key = str(name).lower()
                if key not in ("power", "kw", "energy"):
                    continue
                unit = str((p or {}).get("unit") or "").lower()
                if unit and unit not in ("kw", "k w"):
                    continue
                val = (p or {}).get("value")
                if val is None:
                    continue
                try:
                    total += float(val)
                    found = True
                except (TypeError, ValueError):
                    continue
    return round(total, 1) if found else None


def _measured_kpis(plant_layers: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> Dict[str, Optional[float]]:
    cooling_tons: Optional[float] = None
    comfort_pct: Optional[float] = None
    verified_kw: Optional[float] = None
    try:
        from backend.services.scheduling_dashboard_service import get_scheduling_dashboard

        dash = get_scheduling_dashboard()
        comfort = dash.get("comfortCompliancePct")
        if comfort is not None:
            try:
                comfort_pct = float(comfort)
            except (TypeError, ValueError):
                comfort_pct = None
        plant = dash.get("plant") or {}
        tons = plant.get("total_tons") or dash.get("totalPlantTons")
        if tons is not None:
            try:
                cooling_tons = float(tons)
            except (TypeError, ValueError):
                cooling_tons = None
        if cooling_tons is None:
            for opp in dash.get("opportunities") or []:
                if str(opp.get("id") or "").upper() != "O4":
                    continue
                extra = opp.get("extra") or {}
                candidate = extra.get("plantLoadTons")
                if candidate is None:
                    for m in opp.get("secondaryMetrics") or opp.get("secondary_metrics") or []:
                        if str(m.get("label") or "").lower().startswith("plant load"):
                            raw = str(m.get("value") or "")
                            candidate = raw.replace(" Tons", "").replace(" tons", "").strip() or None
                            break
                if candidate is not None:
                    try:
                        cooling_tons = float(candidate)
                    except (TypeError, ValueError):
                        pass
                break
        # Do not convert guide % or unverified sim defaults into verified kW.
        raw = dash.get("verifiedPowerKw")
        if raw is not None:
            verified_kw = float(raw)
        if verified_kw is None:
            savings = dash.get("verifiedSavingsKwh")
            if savings is not None:
                try:
                    verified_kw = round(float(savings) / 24.0, 1)
                except (TypeError, ValueError):
                    pass
    except Exception:
        pass
    if plant_layers:
        if cooling_tons is None:
            cooling_tons = _tons_from_plant_layers(plant_layers)
        if verified_kw is None:
            verified_kw = _kw_from_plant_layers(plant_layers)
    return {"coolingTons": cooling_tons, "comfortPct": comfort_pct, "verifiedKw": verified_kw}


def _alerts(points: List[Dict[str, Any]], snap: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    last_error = (snap.get("bms") or {}).get("last_error") or (snap.get("bms") or {}).get("lastError")
    if last_error:
        out.append(
            {
                "severity": "BMS",
                "point_id": None,
                "equipment_id": None,
                "message": str(last_error),
                "age_seconds": None,
            }
        )
    for p in points:
        q = str(p.get("quality") or "").upper()
        if q not in ("BAD", "STALE"):
            continue
        pid = str(p.get("point_id") or "")
        eid = p.get("equipment_id") or (pid.split(".", 1)[0] if "." in pid else None)
        out.append(
            {
                "severity": q,
                "point_id": pid,
                "equipment_id": eid,
                "message": f"{pid} quality {q}",
                "age_seconds": p.get("age_seconds"),
            }
        )
    try:
        from database.session import SessionLocal
        from database.models_opportunities import MaintenanceWorkOrderDB

        db = SessionLocal()
        try:
            rows = (
                db.query(MaintenanceWorkOrderDB)
                .filter(MaintenanceWorkOrderDB.status.in_(("OPEN", "PENDING", "ACTIVE")))
                .order_by(MaintenanceWorkOrderDB.id.desc())
                .limit(20)
                .all()
            )
            for wo in rows:
                out.append(
                    {
                        "severity": "MAINTENANCE",
                        "point_id": None,
                        "equipment_id": wo.equipment_id,
                        "message": wo.recommendation or f"{wo.maintenance_type} {wo.status}",
                        "age_seconds": None,
                    }
                )
        finally:
            db.close()
    except Exception:
        pass
    return out[:40]


def _energy_series() -> Dict[str, Any]:
    try:
        points = latest_points(limit=120)
        ranked: List[str] = []
        seen: set = set()
        for p in points:
            pid = str(p.get("point_id") or "")
            low = pid.lower()
            if not pid or pid in seen:
                continue
            if ".power" in low or low.endswith(".power"):
                ranked.insert(0, pid)
                seen.add(pid)
            elif any(tok in low for tok in ("energy", "power", "kw")) and "compressor" not in low:
                ranked.append(pid)
                seen.add(pid)
        energy_ids = ranked[:1] or [
            str(p.get("point_id"))
            for p in points
            if p.get("point_id") and "power" in str(p.get("point_id") or "").lower()
        ][:1]
        if not energy_ids:
            return {"unit": "kW", "points": []}
        rows = query_telemetry(point_ids=energy_ids, limit=48, prefer_buffer=True)
        series = []
        for r in rows:
            if r.get("value") is None:
                continue
            series.append({"t": r.get("timestamp"), "v": r.get("value"), "point_id": r.get("point_id")})
        series.sort(key=lambda x: str(x.get("t") or ""))
        deduped: List[Dict[str, Any]] = []
        for item in series:
            if deduped and deduped[-1].get("v") == item.get("v") and deduped[-1].get("t") == item.get("t"):
                continue
            deduped.append(item)
        return {"unit": "kW", "points": deduped[-48:]}
    except Exception:
        return {"unit": "kW", "points": []}


def _cache_ttl() -> float:
    try:
        return max(0.0, float(os.getenv("HVAC_DASHBOARD_CACHE_SECONDS", "60")))
    except ValueError:
        return 60.0


_CACHE_LOCK = threading.Lock()
_CACHE: Dict[str, Any] = {"at": 0.0, "payload": None, "sig": None}
_REFRESHING = threading.Event()


def _signature() -> tuple:
    from backend.services.platform_bms_service import control_state_signature

    return control_state_signature()


def _refresh_locked() -> Dict[str, Any]:
    with _CACHE_LOCK:
        payload = _build_dashboard_home()
        _CACHE["payload"] = payload
        _CACHE["sig"] = _signature()
        _CACHE["at"] = time.monotonic()
        return payload


def _refresh_in_background() -> None:
    if _REFRESHING.is_set():
        return
    _REFRESHING.set()

    def _run() -> None:
        try:
            _refresh_locked()
        except Exception:
            pass
        finally:
            _REFRESHING.clear()

    threading.Thread(target=_run, name="hvac-dashboard-refresh", daemon=True).start()


def prime_dashboard_home() -> None:
    """Build the first snapshot at startup so no browser request pays for it."""
    _refresh_in_background()


def dashboard_home() -> Dict[str, Any]:
    """Serve the cached snapshot and refresh it off the request path.

    Building this payload walks the whole plant and all 20 opportunities, which a
    small instance cannot finish inside a browser's patience, so a stale snapshot
    is returned while a background thread refreshes it.
    """
    ttl = _cache_ttl()
    if not ttl:
        return _build_dashboard_home()
    cached = _CACHE.get("payload")
    if cached is None or _CACHE.get("sig") != _signature():
        return _refresh_locked()
    if (time.monotonic() - float(_CACHE["at"])) >= ttl:
        _refresh_in_background()
    return cached


def _build_dashboard_home() -> Dict[str, Any]:
    snap = platform_snapshot()
    plant = plant_overview()
    points = latest_points(limit=400)
    has_co = _has_co_points(points, plant)
    groups = agent_groups()
    cards_by_oid: Dict[str, Dict[str, Any]] = {}
    for g in groups:
        for c in g.get("cards") or []:
            cards_by_oid[str(c.get("id") or "").upper()] = c

    decorated = _decorate_layers(plant)
    kpis = _measured_kpis(decorated)
    alerts = _alerts(points, snap)
    kpis["alertCount"] = len(alerts)

    tel_status = str((snap.get("telemetry") or {}).get("status") or "")
    if str(snap.get("plantMode") or "").upper() == "DATASET":
        tel_status = "SIMULATED"
        telemetry = {**(snap.get("telemetry") or {}), "status": "SIMULATED"}
    else:
        telemetry = snap.get("telemetry") or {}

    chapters: List[Dict[str, Any]] = []
    for meta in CHAPTER_META:
        live_n = sim_n = await_n = 0
        opps = []
        for oid in meta["opportunities"]:
            card = cards_by_oid.get(oid) or {}
            missing = list(card.get("missing_features") or [])
            appl = _applicability(oid, missing, plant, has_co)
            rec = catalog_record(oid) or {}
            gmeta = GUIDE_META.get(oid) or {}
            tel = str(card.get("telemetry") or "NO DATA").upper()
            if tel == "LIVE":
                live_n += 1
            elif tel == "SIMULATED":
                sim_n += 1
            else:
                await_n += 1
            opps.append(
                {
                    "id": oid,
                    "title": rec.get("title") or catalog_for(oid).get("title"),
                    "href": ROUTES.get(oid),
                    "guide_page": GUIDE_PAGES.get(oid),
                    "section": GUIDE_SECTIONS.get(oid),
                    "guide_savings_potential": rec.get("guide_savings_potential"),
                    "energy_impact_class": rec.get("energy_impact_class") or "GUIDE_POTENTIAL",
                    "applicability": appl,
                    "practice": gmeta.get("practice"),
                    "telemetry": card.get("telemetry") or "NO DATA",
                    "kind": card.get("kind") or "CONTROL",
                    "control": card.get("control"),
                    "missing_features": missing,
                }
            )
        chapters.append(
            {
                "id": meta["id"],
                "title": meta["title"],
                "section": meta["section"],
                "href": meta["href"],
                "counts": {"live": live_n, "simulated": sim_n, "awaiting": await_n},
                "opportunities": opps,
            }
        )

    building = snap.get("building") or {}
    return {
        "plantMode": snap.get("plantMode"),
        "bms": snap.get("bms"),
        "telemetry": telemetry,
        "building": building,
        "kpis": kpis,
        "layers": decorated,
        "alerts": alerts,
        "chapters": chapters,
        "energy": _energy_series(),
        "guide": {
            "document": "150317hvacguide.pdf",
            "note": "guide_savings_potential is GUIDE_POTENTIAL, not measured savings",
        },
        "controlEnabled": snap.get("controlEnabled"),
        "controlLabel": snap.get("controlLabel"),
        "safeMode": snap.get("safeMode"),
        "bmsConnected": snap.get("bmsConnected"),
        "labMode": snap.get("labMode"),
        "hasCoPoints": has_co,
        "provenance": tel_status,
        "groups": groups,
    }
