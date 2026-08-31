"""Probe a deployed UI: page routes, the /api proxy, and the response headers."""
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
PATHS = ["/overview", "/api/platform/status", "/api/platform/dashboard/home"]
TIMEOUT = 35

for path in PATHS:
    start = time.perf_counter()
    try:
        req = urllib.request.Request(BASE + path, headers={"User-Agent": "probe"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read()
            ms = (time.perf_counter() - start) * 1000
            print(f"{path}\n  {resp.status}  {ms:.0f} ms  {len(body)} B")
            for h in ("x-vercel-id", "x-vercel-error", "x-matched-path", "content-type", "cache-control"):
                if resp.headers.get(h):
                    print(f"    {h}: {resp.headers.get(h)}")
            if "json" in (resp.headers.get("content-type") or ""):
                print(f"    body: {body[:220].decode('utf-8', 'replace')}")
    except urllib.error.HTTPError as exc:
        ms = (time.perf_counter() - start) * 1000
        print(f"{path}\n  HTTP {exc.code}  {ms:.0f} ms")
        for h in ("x-vercel-id", "x-vercel-error", "x-matched-path"):
            if exc.headers.get(h):
                print(f"    {h}: {exc.headers.get(h)}")
        print(f"    body: {exc.read()[:220].decode('utf-8', 'replace')}")
    except Exception as exc:  # noqa: BLE001 - probe reports rather than raises
        ms = (time.perf_counter() - start) * 1000
        print(f"{path}\n  FAILED after {ms:.0f} ms: {exc!r}")
    print()
