"""Verify the deployed API's dashboard payload shape and provenance honesty."""
import json
import sys
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")


def get(path):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=180) as resp:
        return json.loads(resp.read())


home = get("/api/platform/dashboard/home")
chapters = home.get("chapters") or []
opps = [o for c in chapters for o in (c.get("opportunities") or [])]

print(f"provenance     : {home.get('provenance')}")
print(f"plantMode      : {home.get('plantMode')}")
print(f"chapters       : {len(chapters)}")
print(f"opportunities  : {len(opps)}  ids ok: {[o['id'] for o in opps] == [f'O{i}' for i in range(1, 21)]}")
print(f"alertCount     : {(home.get('kpis') or {}).get('alertCount')}")
print(f"layers         : {{{', '.join(f'{k}:{len(v)}' for k, v in (home.get('layers') or {}).items())}}}")

applic = {}
for o in opps:
    applic[o.get("applicability")] = applic.get(o.get("applicability"), 0) + 1
print(f"applicability  : {applic}")

bad = [o["id"] for o in opps if str(o.get("telemetry", "")).upper() == "LIVE"]
print(f"falsely LIVE   : {bad or 'none'}")

# Find keys that collide only by case; these break naive case-insensitive consumers.
def collisions(obj, path="$"):
    out = []
    if isinstance(obj, dict):
        seen = {}
        for k in obj:
            seen.setdefault(k.lower(), []).append(k)
        for low, keys in seen.items():
            if len(keys) > 1:
                out.append(f"{path}.{{{'/'.join(keys)}}}")
        for k, v in obj.items():
            out += collisions(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:5]):
            out += collisions(v, f"{path}[{i}]")
    return out


hits = collisions(home)
print(f"case-collisions: {hits[:5] if hits else 'none'}")
