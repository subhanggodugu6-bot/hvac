"""Check whether the deployed API allows a browser Origin (CORS preflight + GET)."""
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
ORIGIN = sys.argv[2] if len(sys.argv) > 2 else "https://hvac.vercel.app"
PATH = "/api/platform/status"

print(f"origin: {ORIGIN}\n")

req = urllib.request.Request(
    BASE + PATH,
    method="OPTIONS",
    headers={
        "Origin": ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-request-id",
    },
)
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        print(f"preflight OPTIONS -> {resp.status}")
        for h in ("Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Access-Control-Allow-Methods"):
            print(f"  {h}: {resp.headers.get(h)}")
except urllib.error.HTTPError as exc:
    print(f"preflight OPTIONS -> {exc.code}")
    for h in ("Access-Control-Allow-Origin",):
        print(f"  {h}: {exc.headers.get(h)}")

req = urllib.request.Request(BASE + PATH, headers={"Origin": ORIGIN})
with urllib.request.urlopen(req, timeout=120) as resp:
    allow = resp.headers.get("Access-Control-Allow-Origin")
    print(f"\nactual GET       -> {resp.status}")
    print(f"  Access-Control-Allow-Origin: {allow}")
    print(f"\nbrowser would {'ALLOW' if allow else 'BLOCK'} this cross-origin call")
