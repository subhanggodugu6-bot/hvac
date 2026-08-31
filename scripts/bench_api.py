"""Warm-latency probe for the platform API. Run against a already-running server."""
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
PATHS = [
    "/healthz",
    "/api/platform/status",
    "/api/platform/dashboard/home",
    "/api/platform/telemetry",
]
RUNS = 4

for path in PATHS:
    timings = []
    size = 0
    err = None
    for _ in range(RUNS):
        start = time.perf_counter()
        try:
            with urllib.request.urlopen(BASE + path, timeout=120) as resp:
                size = len(resp.read())
        except Exception as exc:  # noqa: BLE001 - probe reports, never fails the run
            err = repr(exc)
            break
        timings.append((time.perf_counter() - start) * 1000)
    if err:
        print(f"{path:<34} ERROR {err}")
    else:
        cold = timings[0]
        warm = sum(timings[1:]) / max(1, len(timings) - 1)
        print(f"{path:<34} cold {cold:8.0f} ms   warm {warm:8.0f} ms   {size:>7} B")
