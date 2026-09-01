"""Poll an API's health endpoint until it answers, reporting each attempt.

Useful while a free-tier instance cold starts or recovers from a restart.
"""
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
BUDGET_S = float(sys.argv[2]) if len(sys.argv) > 2 else 600.0
ATTEMPT_TIMEOUT_S = 15
GAP_S = 10

deadline = time.time() + BUDGET_S
attempt = 0
while time.time() < deadline:
    attempt += 1
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(f"{BASE}/healthz", timeout=ATTEMPT_TIMEOUT_S) as resp:
            ms = (time.perf_counter() - start) * 1000
            print(f"attempt {attempt:>3}  UP  {resp.status}  {ms:.0f} ms  {resp.read()[:80].decode('utf-8','replace')}")
            sys.exit(0)
    except urllib.error.HTTPError as exc:
        ms = (time.perf_counter() - start) * 1000
        print(f"attempt {attempt:>3}  HTTP {exc.code}  {ms:.0f} ms", flush=True)
    except Exception as exc:  # noqa: BLE001 - keep polling through transport errors
        ms = (time.perf_counter() - start) * 1000
        print(f"attempt {attempt:>3}  down  {ms:.0f} ms  {type(exc).__name__}", flush=True)
    time.sleep(GAP_S)

print(f"still down after {BUDGET_S:.0f}s")
sys.exit(1)
