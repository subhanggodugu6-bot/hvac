"""OEH teaching curves for guide evaluate. Always SIMULATED — not BMS."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple


def clamp(v: float, a: float, b: float) -> float:
    return max(a, min(b, v))


def avg(arr: List[float]) -> float:
    return sum(arr) / len(arr) if arr else 0.0


def oat(hour: float, mean: float, amp: float) -> float:
    return mean + amp * math.cos((hour - 15) * (math.pi / 12))


def load_curve(hour: float) -> float:
    return clamp(math.sin(((hour - 6) / 14) * math.pi), 0.05, 1)


def occupancy_curve(hour: float) -> float:
    return clamp(math.sin(((hour - 8) / 10) * math.pi), 0.03, 1)


def _f(v: Dict[str, float], key: str, default: float) -> float:
    try:
        return float(v.get(key, default))
    except (TypeError, ValueError):
        return default


def point_at(oid: str, x: float, v: Dict[str, float]) -> Tuple[float, float]:
    if oid == "O1":
        occ = _f(v, "occStart", 8.5)
        sev = _f(v, "severity", 50)
        base_start, base_stop = occ - 2.5, 17.5
        opt_start = occ - (0.5 + (sev / 100) * 2)
        opt_stop = 17.5 - (0.1 + ((100 - sev) / 100) * 0.4)
        return (100.0 if base_start <= x < base_stop else 0.0, 100.0 if opt_start <= x < opt_stop else 0.0)
    if oid == "O2":
        db = _f(v, "deadBand", 1)
        pb = _f(v, "propBand", 1)
        dev = clamp(3 * math.sin(((x - 9) / 14) * math.pi), -3, 3)

        def out(d: float, band: float, p: float) -> float:
            half = band / 2
            if abs(d) <= half:
                return 0.0
            return clamp(((abs(d) - half) / max(p, 0.01)) * 100, 0, 100)

        return out(dev, 1, 1), out(dev, db, pb)
    if oid == "O3":
        phases = [0, 1.2, 2.4, 3.6, 4.8]
        devs = [max(0.0, 2.5 * math.sin(((x - 8 + ph) / 12) * math.pi)) for ph in phases]
        devs[4] += _f(v, "faultBias", 1.5)
        baseline = max(devs)
        n = min(int(_f(v, "numAvg", 3)), 5)
        sorted_d = sorted(devs, reverse=True)
        optimized = sum(sorted_d[:n]) / n
        return baseline, optimized
    if oid == "O4":
        load = (_f(v, "peakLoad", 75) / 100) * load_curve(x)
        delay = _f(v, "stageDelay", 10)
        baseline = clamp(math.ceil(load * 3 + 0.45), 0, 3)
        optimized = clamp(math.ceil(load * 3 - ((delay - 5) / 15) * 0.3), 0, 3)
        return float(baseline), float(optimized)
    if oid == "O5":
        demand = (_f(v, "demandAmp", 80) / 100) * load_curve(x)
        open_needed = 40 + demand * 60
        opt_speed = clamp(100 * (open_needed / max(_f(v, "targetOpen", 92), 1)), 25, 100)
        return 100.0, (opt_speed / 100) ** 3 * 100
    if oid == "O6":
        demand = (_f(v, "heatSeverity", 60) / 100) * (1 - load_curve(x))
        floor = 40 if _f(v, "boilerType", 1) else 55
        return 82.0, floor + demand * (82 - floor)
    if oid == "O7":
        load = (_f(v, "loadSeverity", 80) / 100) * load_curve(x)
        return 6.5, 6.5 + (1 - load) * 5.5
    if oid == "O8":
        wb = oat(x, _f(v, "wetBulbMean", 20), 4)
        return _f(v, "wetBulbMean", 20) + 11.5, wb + _f(v, "approach", 3.5)
    if oid == "O9":
        load = 100 * load_curve(x) * (_f(v, "loadVar", 60) / 100) + (1 - _f(v, "loadVar", 60) / 100) * 70
        baseline = 5 + (100 - load) * 0.08
        optimized = 2 + (100 - load) * 0.02 if _f(v, "valveType", 0) else baseline
        return baseline, optimized
    if oid == "O10":
        temp = oat(x, _f(v, "oatMean", 18), 6)
        active = temp < 21 and _f(v, "dewPoint", 10) < 12
        demand = 100 * load_curve(x)
        return demand, demand * 0.15 if active else demand
    if oid == "O11":
        residual = _f(v, "residual", 27)
        low = _f(v, "overnightLow", 16)
        if x < 4:
            return residual - 1, residual - 1
        if x < 7.5:
            pf = clamp((x - 4) / 2.5, 0, 1)
            return residual, residual - pf * max(0.0, residual - 2 - low)
        return 23.0, 23.0
    if oid == "O12":
        occ = _f(v, "peakOcc", 80) * occupancy_curve(x)
        return 100.0, clamp(30 + occ * 0.7, 30, 100)
    if oid == "O13":
        density = _f(v, "peakDensity", 55) * occupancy_curve(x)
        speed = clamp(25 + density * 0.75, 25, 100)
        return 100.0, (speed / 100) ** 3 * 100
    if oid == "O14":
        load = (_f(v, "loadAmp", 75) / 100) * load_curve(x)
        speed = clamp(100 * ((40 + load * 60) / 95), 30, 100)
        return 100.0, (speed / 100) ** 3 * 100
    if oid == "O15":
        return 95.0, clamp((oat(x, _f(v, "ambientMean", 20), 6) - 2) * 2.8, 25, 100)
    if oid == "O16":
        load = (_f(v, "loadAmp", 75) / 100) * load_curve(x)
        return 100.0, clamp(100 * (1 - _f(v, "idlePct", 20) / 100) * (0.4 + 0.6 * load), 20, 100)
    if oid == "O17":
        return 100 + x * 1.6, 100 - (_f(v, "coordScore", 55) / 100) * x * 3.2
    if oid == "O18":
        return 100 + x * 0.3, 100 - (_f(v, "coverage", 50) / 100) * x * 0.9
    if oid == "O19":
        base = 100 + x * 1.2
        return base, base * (1 - clamp(_f(v, "freq", 4) / 12, 0, 1))
    if oid == "O20":
        baseline = clamp(100 - x * 4, 40, 100)
        factor = _f(v, "accessCtrl", 1) * 0.5 + clamp(_f(v, "backupFreq", 4) / 12, 0, 1) * 0.5
        return baseline, clamp(100 - x * 4 * (1 - factor), 40, 100)
    return 100.0, 100.0


def metrics_for(oid: str, pts: List[Dict[str, float]], v: Dict[str, float]) -> List[Dict[str, str]]:
    ab = avg([p["baseline"] for p in pts])
    ao = avg([p["optimized"] for p in pts])
    last = pts[-1] if pts else {"baseline": 0.0, "optimized": 0.0}

    def pct(n: float) -> str:
        return f"{n:.0f}%"

    if oid == "O1":
        bh = sum(1 for p in pts if p["baseline"] > 0)
        oh = sum(1 for p in pts if p["optimized"] > 0)
        red = ((bh - oh) / bh) * 100 if bh else 0
        return [
            {"label": "Baseline runtime", "value": f"{bh} h/day"},
            {"label": "Optimized runtime", "value": f"{oh} h/day"},
            {"label": "Operating hours cut", "value": pct(red)},
        ]
    if oid == "O2":
        red = ((ab - ao) / ab) * 100 if ab else 0
        return [
            {"label": "Baseline avg output", "value": f"{ab:.0f}%"},
            {"label": "Optimized avg output", "value": f"{ao:.0f}%"},
            {"label": "Est. HVAC energy cut", "value": pct(red)},
        ]
    if oid == "O3":
        red = ((ab - ao) / ab) * 100 if ab else 0
        return [
            {"label": "Baseline signal (high-select)", "value": f"{ab:.1f}°C"},
            {"label": "Optimized signal (weighted)", "value": f"{ao:.1f}°C"},
            {"label": "Over-cooling reduced", "value": pct(red)},
        ]
    if oid == "O4":
        red = clamp(((ab - ao) / ab) * 100, 0, 10) if ab else 0
        return [
            {"label": "Avg stages — baseline", "value": f"{ab:.1f}"},
            {"label": "Avg stages — optimized", "value": f"{ao:.1f}"},
            {"label": "Chiller-hours saved", "value": pct(red)},
        ]
    if oid == "O5":
        return [
            {"label": "Baseline fan power", "value": "100%"},
            {"label": "Optimized fan power", "value": f"{ao:.0f}%"},
            {"label": "Fan energy saved", "value": pct(clamp(100 - ao, 0, 30))},
        ]
    if oid == "O6":
        return [
            {"label": "Baseline flow temp", "value": "82°C"},
            {"label": "Optimized avg flow temp", "value": f"{ao:.0f}°C"},
            {"label": "Boiler efficiency gain", "value": f"{clamp((82 - ao) * 0.15, 0, 5):.1f}%"},
        ]
    if oid == "O7":
        per = 4.5 if _f(v, "compType", 0) else 2.5
        return [
            {"label": "Baseline CHW temp", "value": "6.5°C"},
            {"label": "Optimized avg CHW temp", "value": f"{ao:.1f}°C"},
            {"label": "Chiller energy saved", "value": pct(clamp((ao - 6.5) * per, 0, 15))},
        ]
    if oid == "O8":
        sav = clamp((ab - ao) * 2.5, 0, 15)
        return [
            {"label": "Baseline CW temp", "value": f"{ab:.1f}°C"},
            {"label": "Optimized avg CW temp", "value": f"{ao:.1f}°C"},
            {"label": "Chiller energy saved", "value": pct(sav)},
        ]
    if oid == "O9":
        sav = clamp((ab - ao) * 3, 0, 15)
        return [
            {"label": "Baseline efficiency loss", "value": f"{ab:.1f}%"},
            {"label": "Optimized efficiency loss", "value": f"{ao:.1f}%"},
            {"label": "Compressor energy saved", "value": pct(sav)},
        ]
    if oid == "O10":
        hours = sum(1 for p in pts if p["optimized"] < p["baseline"] * 0.9)
        sav = clamp(((ab - ao) / ab) * 100, 0, 20) if ab else 0
        return [
            {"label": "Economy cycle active", "value": f"{hours} h/day"},
            {"label": "Optimized avg compressor load", "value": f"{ao:.0f}%"},
            {"label": "Compressor energy saved", "value": pct(sav)},
        ]
    if oid == "O11":
        window = [p for p in pts if 4 <= p["x"] < 7.5]
        min_opt = min((p["optimized"] for p in window), default=_f(v, "residual", 27))
        residual = _f(v, "residual", 27)
        return [
            {"label": "Residual temp", "value": f"{residual:.1f}°C"},
            {"label": "Purged down to", "value": f"{min_opt:.1f}°C"},
            {"label": "Start-up energy saved", "value": pct(clamp((residual - min_opt) * 4, 0, 20))},
        ]
    if oid == "O12":
        est = round(400 + (_f(v, "peakOcc", 80) / 100) * (_f(v, "co2SP", 800) - 400))
        return [
            {"label": "Optimized avg OA flow", "value": f"{ao:.0f}%"},
            {"label": "Peak CO₂ estimate", "value": f"{est} ppm"},
            {"label": "Ventilation energy saved", "value": pct(clamp(100 - ao, 0, 20))},
        ]
    if oid == "O13":
        return [
            {"label": "Baseline fan power", "value": "100%"},
            {"label": "Optimized avg fan power", "value": f"{ao:.0f}%"},
            {"label": "Fan energy saved", "value": pct(clamp(100 - ao, 0, 80))},
        ]
    if oid == "O14":
        return [
            {"label": "Baseline pump power", "value": "100%"},
            {"label": "Optimized avg pump power", "value": f"{ao:.0f}%"},
            {"label": "Pumping energy saved", "value": pct(clamp(100 - ao, 0, 30))},
        ]
    if oid == "O15":
        sav = clamp(((ab - ao) / ab) * 100, 0, 30) if ab else 0
        return [
            {"label": "Baseline fan power", "value": f"{ab:.0f}%"},
            {"label": "Optimized avg fan power", "value": f"{ao:.0f}%"},
            {"label": "Condenser fan energy saved", "value": pct(sav)},
        ]
    if oid == "O16":
        return [
            {"label": "Baseline pump power", "value": "100%"},
            {"label": "Optimized avg pump power", "value": f"{ao:.0f}%"},
            {"label": "CW pump energy saved", "value": pct(clamp(100 - ao, 0, 30))},
        ]
    if oid == "O17":
        sav = clamp(((last["baseline"] - last["optimized"]) / last["baseline"]) * 100, 0, 50) if last["baseline"] else 0
        return [
            {"label": "Year-end index — no plan", "value": f"{last['baseline']:.0f}"},
            {"label": "Year-end index — with plan", "value": f"{last['optimized']:.0f}"},
            {"label": "Total energy saved", "value": pct(sav)},
        ]
    if oid == "O18":
        cov = _f(v, "coverage", 50)
        sav = clamp(((last["baseline"] - last["optimized"]) / last["baseline"]) * 100, 0, 10) if last["baseline"] else 0
        return [
            {"label": "Total energy saved", "value": pct(sav)},
            {"label": "Est. NABERS star gain", "value": f"+{(cov / 100) * 0.5:.1f} stars"},
            {"label": "Training coverage", "value": f"{cov:.0f}%"},
        ]
    if oid == "O19":
        sav = clamp(((last["baseline"] - last["optimized"]) / last["baseline"]) * 100, 0, 20) if last["baseline"] else 0
        return [
            {"label": "Year-end index — reactive", "value": f"{last['baseline']:.0f}"},
            {"label": "Year-end index — maintained", "value": f"{last['optimized']:.0f}"},
            {"label": "HVAC energy saved", "value": pct(sav)},
        ]
    if oid == "O20":
        sav = clamp((last["optimized"] - last["baseline"]) * 0.2, 0, 10)
        return [
            {"label": "Settings retained — baseline", "value": f"{last['baseline']:.0f}%"},
            {"label": "Settings retained — managed", "value": f"{last['optimized']:.0f}%"},
            {"label": "HVAC energy saved", "value": pct(sav)},
        ]
    sav = clamp(((ab - ao) / ab) * 100, 0, 80) if ab else 0
    return [
        {"label": "Baseline avg", "value": f"{ab:.1f}"},
        {"label": "Optimized avg", "value": f"{ao:.1f}"},
        {"label": "Guide reduction", "value": pct(sav)},
    ]


def series_for(oid: str, sliders: Dict[str, float], x_type: str) -> List[Dict[str, float]]:
    n = 12 if x_type == "month" else 24
    out = []
    for x in range(n):
        b, o = point_at(oid, float(x), sliders)
        out.append({"x": x, "baseline": round(b, 3), "optimized": round(o, 3)})
    return out
