"""Smoke-test every UI route plus the API proxy against a running frontend."""
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"

ROUTES = [
    "/",
    "/overview",
    "/agents",
    "/agents/scheduling",
    "/agents/scheduling/chiller-staging",
    "/agents/scheduling/master-ahu-sat",
    "/agents/scheduling/optimum-start-stop",
    "/agents/scheduling/space-temperature",
    "/agents/plant-control",
    "/agents/plant-control/duct-static-pressure",
    "/agents/plant-control/electronic-expansion-valve",
    "/agents/plant-control/temperature-reset",
    "/agents/ventilation-airflow",
    "/agents/ventilation-airflow/dcv-co",
    "/agents/ventilation-airflow/demand-ventilation",
    "/agents/ventilation-airflow/economy-cycle",
    "/agents/ventilation-airflow/night-purge",
    "/agents/variable-speed",
    "/agents/variable-speed/air-cooled-head-pressure",
    "/agents/variable-speed/chilled-water-pump",
    "/agents/variable-speed/water-cooled-head-pressure",
    "/agents/operations-maintenance",
    "/agents/operations-maintenance/control-software",
    "/agents/operations-maintenance/energy-management-planning",
    "/agents/operations-maintenance/equipment-maintenance",
    "/agents/operations-maintenance/training-awareness",
    "/ml",
    "/platform/bms",
    "/platform/telemetry",
    "/api/platform/status",
    "/api/platform/dashboard/home",
]

class _KeepRedirects(urllib.request.HTTPRedirectHandler):
    """A redirect is a valid route response here, so surface it instead of following."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(_KeepRedirects)

failures = []
slow = []
for route in ROUTES:
    start = time.perf_counter()
    try:
        req = urllib.request.Request(BASE + route, headers={"User-Agent": "smoke"})
        with opener.open(req, timeout=90) as resp:
            body = resp.read()
            code = resp.status
        ms = (time.perf_counter() - start) * 1000
        flag = ""
        if code >= 400:
            failures.append((route, code))
            flag = "  <-- FAIL"
        elif ms > 2000:
            slow.append((route, ms))
            flag = "  <-- SLOW"
        print(f"{route:<58} {code}  {ms:7.0f} ms  {len(body):>7} B{flag}")
    except urllib.error.HTTPError as exc:
        ms = (time.perf_counter() - start) * 1000
        if 300 <= exc.code < 400:
            print(f"{route:<58} {exc.code}  {ms:7.0f} ms  -> {exc.headers.get('Location')}")
        else:
            failures.append((route, exc.code))
            print(f"{route:<58} {exc.code}  {ms:7.0f} ms  <-- FAIL")
    except Exception as exc:  # noqa: BLE001 - smoke test reports rather than raises
        ms = (time.perf_counter() - start) * 1000
        failures.append((route, repr(exc)))
        print(f"{route:<58} ERR {ms:7.0f} ms  {exc!r}  <-- FAIL")

print()
print(f"{len(ROUTES) - len(failures)}/{len(ROUTES)} routes OK")
if slow:
    print("slow (>2s): " + ", ".join(f"{r} {m:.0f}ms" for r, m in slow))
if failures:
    print("FAILURES: " + ", ".join(f"{r} {c}" for r, c in failures))
    sys.exit(1)
