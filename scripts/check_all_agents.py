"""Check all O1-O20 agent endpoints on a deployed HVAC API."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

AGENTS: list[tuple[str, str, str]] = [
    # Scheduling O1-O4
    ("O1", "scheduling", "/api/agents/scheduling/o1/state"),
    ("O2", "scheduling", "/api/agents/scheduling/o2/state"),
    ("O3", "scheduling", "/api/agents/scheduling/o3/state"),
    ("O4", "scheduling", "/api/agents/scheduling/o4/state"),
    # Plant control O5-O9
    ("O5", "plant-control", "/api/agents/plant-control/o5/state"),
    ("O6", "plant-control", "/api/agents/plant-control/o6/state"),
    ("O7", "plant-control", "/api/agents/plant-control/o7/state"),
    ("O8", "plant-control", "/api/agents/plant-control/o8/state"),
    ("O9", "plant-control", "/api/agents/plant-control/o9/assessment"),
    # Ventilation O10-O13
    ("O10", "ventilation", "/api/hvac/ventilation/O10"),
    ("O11", "ventilation", "/api/hvac/ventilation/O11"),
    ("O12", "ventilation", "/api/hvac/ventilation/O12"),
    ("O13", "ventilation", "/api/hvac/ventilation/O13"),
    # Variable speed O14-O16
    ("O14", "variable-speed", "/api/agents/variable-speed/o14/dashboard"),
    ("O15", "variable-speed", "/api/agents/variable-speed/o15/dashboard"),
    ("O16", "variable-speed", "/api/agents/variable-speed/o16/dashboard"),
    # Operations O17-O20
    ("O17", "operations", "/api/hvac/operations-maintenance/O17"),
    ("O18", "operations", "/api/hvac/operations-maintenance/O18"),
    ("O19", "operations", "/api/hvac/operations-maintenance/O19"),
    ("O20", "operations", "/api/hvac/operations-maintenance/O20"),
]

SECTIONS = [
    ("scheduling", "/api/agents/scheduling/dashboard"),
    ("plant-control", "/api/agents/plant-control/state"),
    ("ventilation", "/api/hvac/ventilation/opportunities"),
    ("variable-speed", "/api/variable-speed/dashboard"),
    ("operations", "/api/hvac/operations-maintenance/dashboard"),
    ("agent-center", "/api/agents"),
]


def get(origin: str, path: str, timeout: int = 90) -> tuple[int, dict | str, int]:
    url = f"{origin.rstrip('/')}{path}"
    start = time.time()
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "hvac-agent-check"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read().decode("utf-8", "replace")
            ms = int((time.time() - start) * 1000)
            try:
                return res.status, json.loads(body), ms
            except json.JSONDecodeError:
                return res.status, body[:200], ms
    except urllib.error.HTTPError as exc:
        ms = int((time.time() - start) * 1000)
        return exc.code, exc.read().decode("utf-8", "replace")[:200], ms
    except Exception as exc:
        ms = int((time.time() - start) * 1000)
        return 0, f"{type(exc).__name__}: {exc}", ms


def agent_label(body: dict | str) -> str:
    if not isinstance(body, dict):
        return str(body)[:60]
    for key in ("status", "agent_status", "telemetryStatus", "agent_health", "agent_mode"):
        if body.get(key):
            return str(body[key])
    tel = body.get("telemetry")
    if isinstance(tel, dict) and tel.get("status"):
        return f"tel={tel['status']}"
    if body.get("live") is True:
        return "LIVE"
    if body.get("live") is False:
        return "SIM"
    return "OK"


def main() -> int:
    origin = (sys.argv[1] if len(sys.argv) > 1 else os.getenv("HVAC_API_ORIGIN") or "https://hvac-api-elin.onrender.com").rstrip("/")
    print(f"API: {origin}\n")

    code, health, ms = get(origin, "/healthz", 30)
    print(f"{'OK' if code == 200 else 'FAIL'} healthz {code} ({ms} ms)")
    if code != 200:
        return 1

    failed = 0
    print("\n--- Section dashboards ---")
    for name, path in SECTIONS:
        code, body, ms = get(origin, path)
        ok = code == 200
        note = ""
        if ok and isinstance(body, dict):
            if name == "agent-center":
                groups = body.get("groups") or []
                note = f"groups={len(groups)}"
            elif "opportunities" in body:
                opps = body.get("opportunities") or []
                note = f"opps={len(opps)}"
            else:
                note = agent_label(body)
        print(f"{'OK' if ok else 'FAIL':4} {code:3} {ms:>6} ms  {name:16} {path}  {note}")
        if not ok:
            failed += 1
            print(f"      {body}")

    print("\n--- O1-O20 studio endpoints ---")
    by_section: dict[str, list] = {}
    for oid, section, path in AGENTS:
        code, body, ms = get(origin, path)
        ok = code == 200
        label = agent_label(body) if ok else str(body)[:80]
        row = (oid, code, ms, path, label, ok)
        by_section.setdefault(section, []).append(row)
        if not ok:
            failed += 1

    for section in ("scheduling", "plant-control", "ventilation", "variable-speed", "operations"):
        print(f"\n[{section}]")
        for oid, code, ms, path, label, ok in by_section.get(section, []):
            print(f"{'OK' if ok else 'FAIL':4} {oid} {code:3} {ms:>6} ms  {label}")

    print("\n--- Universal context + recommendation (sample) ---")
    for oid in ("O1", "O5", "O10", "O14", "O17"):
        for suffix in ("context", "recommendation"):
            path = f"/api/agents/{oid}/{suffix}"
            code, body, ms = get(origin, path)
            ok = code == 200
            label = ""
            if ok and isinstance(body, dict):
                if suffix == "context":
                    label = f"status={body.get('status')} missing={len(body.get('missing_features') or [])}"
                else:
                    d = body.get("dispatch") or {}
                    label = f"rec={body.get('recommendation_status')} dispatch={d.get('allowed')}"
            print(f"{'OK' if ok else 'FAIL':4} {oid} {suffix:14} {code:3} {ms:>6} ms  {label}")
            if not ok:
                failed += 1

    total = len(AGENTS) + len(SECTIONS)
    print(f"\n{'PASS' if failed == 0 else 'FAIL'}: {total - failed}/{total + 10} checks ({failed} failed)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
