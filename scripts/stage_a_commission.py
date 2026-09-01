#!/usr/bin/env python3
"""Stage A commission: LIVE_BMS + lab BACnet → discover → map minimum points → poll.

Usage (from repo root, PYTHONPATH=.):

  set HVAC_BMS_LAB=1
  set HVAC_BMS_WRITE_ENABLED=0
  python scripts/stage_a_commission.py

Does not enable writes. Lab path stamps LIVE_BMS (not dataset simulation).
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

os.environ.setdefault("HVAC_BMS_LAB", "1")
os.environ.setdefault("HVAC_BMS_PROTOCOL", "bacnet")
os.environ.setdefault("HVAC_BMS_WRITE_ENABLED", "0")
os.environ.setdefault("HVAC_ALLOW_CREATE_ALL", "1")
os.environ.setdefault("HVAC_START_CONTROL_WORKER", "0")
os.environ.setdefault("HVAC_USE_SIMULATION", "0")
os.environ.setdefault("HVAC_PLANT_MODE_PERSIST", "1")


def main() -> int:
    from database.session import init_db

    init_db()

    from backend.bms.connection_manager import get_connection_manager, lab_mode_enabled, reset_connection_manager
    from backend.bms.lab_bacnet_gateway import stage_a_mapping_targets
    from backend.bms.telemetry_reader import poll_once
    from backend.services import platform_bms_service as bms
    from backend.services.platform_ops_service import set_plant_mode
    from database.models_bms import BmsPointDB
    from database.session import SessionLocal

    if not lab_mode_enabled():
        print("HVAC_BMS_LAB must be 1 for Stage A lab commission.")
        return 2

    reset_connection_manager()
    set_plant_mode("LIVE_BMS")

    host = os.getenv("HVAC_BACNET_HOST") or "127.0.0.1"
    port = int(os.getenv("HVAC_BACNET_PORT") or "47808")
    mgr = get_connection_manager()
    conn = mgr.connect("bacnet", host, port)
    if not conn.get("connected"):
        print("CONNECT_FAILED", conn)
        return 1
    print("CONNECTED", conn)

    disc = mgr.discover()
    print("DISCOVER", disc)
    if int(disc.get("devices") or 0) < 1 or int(disc.get("points") or 0) < 1:
        print("DISCOVER_EMPTY")
        return 1

    mapped = 0
    db = SessionLocal()
    try:
        for target in stage_a_mapping_targets():
            pt = (
                db.query(BmsPointDB)
                .filter(BmsPointDB.point_identifier == target["point_identifier"])
                .first()
            )
            if pt is None:
                print("MISSING_POINT", target["point_identifier"])
                continue
            row = bms.put_mapping(
                {
                    "equipment_id": target["equipment_id"],
                    "canonical_point": target["canonical_point"],
                    "bms_point_id": pt.id,
                    "direction": "READ",
                    "safety_enabled": True,
                }
            )
            mapped += 1
            print("MAPPED", row.get("qualified"), "->", target["point_identifier"])
    finally:
        db.close()

    rows = poll_once(include_unmapped=False)
    print("POLLED", len(rows))

    try:
        from backend.bms.lab_bacnet_gateway import seed_lab_history

        seeded = seed_lab_history(hours=3.0, step_minutes=1.0)
        print("SEEDED_HISTORY", seeded)
        rows = poll_once(include_unmapped=False)
        print("POLLED_AFTER_SEED", len(rows))
    except Exception as exc:
        print("SEED_HISTORY_SKIP", type(exc).__name__)

    snap = bms.platform_snapshot()
    tel = snap.get("telemetry") or {}
    print(
        "SNAPSHOT",
        {
            "plantMode": snap.get("plantMode"),
            "bms": (snap.get("bms") or {}).get("status"),
            "telemetry": tel.get("status"),
            "source": tel.get("source"),
            "writeEnabled": snap.get("writeEnabled"),
            "labMode": lab_mode_enabled(),
            "mappings": mapped,
        },
    )
    if tel.get("status") != "LIVE":
        print("TELEMETRY_NOT_LIVE")
        return 1
    if snap.get("writeEnabled"):
        print("WRITES_UNEXPECTEDLY_ENABLED")
        return 1
    print("STAGE_A_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
