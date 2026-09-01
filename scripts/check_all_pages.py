"""Verify every UI page's backing API returns data via Vercel proxy + Render API."""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# (page label, path, must_have_keys or None for any JSON object/list)
PAGE_APIS: list[tuple[str, str, list[str] | None]] = [
    # Core shell
    ("Overview", "/api/platform/dashboard/home", ["chapters", "building"]),
    ("Agents centre", "/api/agents", ["groups"]),
    ("Platform status", "/api/platform/status", ["plantMode", "telemetry"]),
    ("Platform BMS devices", "/api/platform/bms/devices", None),
    ("Platform telemetry", "/api/platform/telemetry", ["points"]),
    # ML / NB2
    ("ML models", "/api/ml/models", ["models"]),
    ("ML health", "/api/ml/health", None),
    ("RLS status", "/api/platform/ai/rls/status?zone_id=ZONE-01", None),
    ("LSTM forecast", "/api/platform/ai/lstm/forecast?zone_id=ZONE-01", None),
    ("Safe-RL status", "/api/platform/ai/safe-rl/status?zone_id=ZONE-01", None),
    ("NB2 pipeline", "/api/platform/ai/pipeline/status", ["pipeline"]),
    # Section dashboards
    ("Scheduling section", "/api/agents/scheduling/dashboard", None),
    ("Plant control section", "/api/agents/plant-control/state", None),
    ("Ventilation section", "/api/hvac/ventilation/opportunities", None),
    ("Variable speed section", "/api/variable-speed/dashboard", None),
    ("Operations section", "/api/hvac/operations-maintenance/dashboard", None),
    # O1–O20 studio
    ("O1 Optimum start/stop", "/api/agents/scheduling/o1/state", None),
    ("O2 Space temperature", "/api/agents/scheduling/o2/state", None),
    ("O3 Master AHU SAT", "/api/agents/scheduling/o3/state", None),
    ("O4 Chiller staging", "/api/agents/scheduling/o4/state", None),
    ("O5 Duct static", "/api/agents/plant-control/o5/state", None),
    ("O6 EEV", "/api/agents/plant-control/o6/state", None),
    ("O7 Temp reset", "/api/agents/plant-control/o7/state", None),
    ("O8 Condenser opt", "/api/agents/plant-control/o8/state", None),
    ("O9 Chiller assess", "/api/agents/plant-control/o9/assessment", None),
    ("O10 Economy cycle", "/api/hvac/ventilation/O10", None),
    ("O11 Demand vent", "/api/hvac/ventilation/O11", None),
    ("O12 Night purge", "/api/hvac/ventilation/O12", None),
    ("O13 DCV CO", "/api/hvac/ventilation/O13", None),
    ("O14 CHW pump", "/api/agents/variable-speed/o14/dashboard", None),
    ("O15 Water-cooled HP", "/api/agents/variable-speed/o15/dashboard", None),
    ("O16 Air-cooled HP", "/api/agents/variable-speed/o16/dashboard", None),
    ("O17 Energy planning", "/api/hvac/operations-maintenance/O17", None),
    ("O18 Training", "/api/hvac/operations-maintenance/O18", None),
    ("O19 Maintenance", "/api/hvac/operations-maintenance/O19", None),
    ("O20 Control software", "/api/hvac/operations-maintenance/O20", None),
    # Context samples (universal agent panel)
    ("O1 context", "/api/agents/O1/context", ["status"]),
    ("O5 context", "/api/agents/O5/context", ["status"]),
]


def fetch(base: str, path: str, timeout: int = 90) -> tuple[int, Any, int]:
    url = f"{base.rstrip('/')}{path}"
    start = time.time()
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8", "replace")
            ms = int((time.time() - start) * 1000)
            try:
                return res.status, json.loads(raw), ms
            except json.JSONDecodeError:
                return res.status, raw[:120], ms
    except urllib.error.HTTPError as exc:
        ms = int((time.time() - start) * 1000)
        body = exc.read().decode("utf-8", "replace")[:120]
        return exc.code, body, ms
    except Exception as exc:
        ms = int((time.time() - start) * 1000)
        return 0, str(exc), ms


def has_data(body: Any, keys: list[str] | None) -> bool:
    if not isinstance(body, dict):
        return isinstance(body, list) and len(body) > 0
    if keys:
        return all(k in body for k in keys)
    return len(body) > 0


def check_origin(label: str, base: str) -> tuple[int, int, list[str]]:
    ok = fail = 0
    failures: list[str] = []
    print(f"\n=== {label}: {base} ===\n")
    for page, path, keys in PAGE_APIS:
        status, body, ms = fetch(base, path)
        data_ok = status == 200 and has_data(body, keys)
        if status == 200 and isinstance(body, dict):
            hint = ""
            if page == "Overview":
                hint = f" building={((body.get('building') or {}).get('name'))} chapters={len(body.get('chapters') or [])}"
            elif page == "Agents centre":
                hint = f" groups={len(body.get('groups') or [])}"
            elif page.startswith("O") and "context" not in page:
                hint = f" status={body.get('status') or body.get('agent_status') or body.get('telemetryStatus') or '—'}"
        elif status == 200 and isinstance(body, list):
            hint = f" rows={len(body)}"
        else:
            hint = ""
        mark = "OK" if data_ok else "FAIL"
        if data_ok:
            ok += 1
        else:
            fail += 1
            failures.append(f"{page} ({path}) -> {status}")
        print(f"{mark:4} {status:3} {ms:5}ms  {page:<28}{hint}")
    print(f"\n{label}: {ok}/{ok + fail} connected")
    return ok, fail, failures


def main() -> int:
    vercel = "https://hvac-seven-topaz.vercel.app"
    render = "https://hvac-api-elin.onrender.com"
    if len(sys.argv) > 1:
        render = sys.argv[1].rstrip("/")

    v_ok, v_fail, v_bad = check_origin("VERCEL UI PROXY", vercel)
    r_ok, r_fail, r_bad = check_origin("RENDER API DIRECT", render)

    print("\n--- Summary ---")
    print(f"Vercel proxy: {v_ok} OK, {v_fail} failed")
    print(f"Render API:   {r_ok} OK, {r_fail} failed")
    if v_bad:
        print("\nVercel failures:")
        for line in v_bad:
            print(f"  - {line}")
    if r_bad:
        print("\nRender failures:")
        for line in r_bad:
            print(f"  - {line}")
    return 0 if v_fail == 0 and r_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
