"""Template LSTM forecast from recent normalized telemetry (no torch required)."""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional

from backend.ai.lstm.sequences import HORIZONS_MIN, TARGET_FIELD, build_dataset, clamp_lookback


def heuristic_forecast_target(
    target: str,
    zone_id: str = "ZONE-01",
    *,
    lookback_min: Optional[int] = None,
    now=None,
) -> Optional[Dict[str, Any]]:
    """Flat + mild drift forecast from lookback tail. Returns series dict or None."""
    from datetime import datetime, timezone

    if target not in TARGET_FIELD:
        return None
    lookback_min = clamp_lookback(lookback_min)
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    ds = build_dataset(zone_id, lookback_min=lookback_min, horizons_min=HORIZONS_MIN, target=target)
    if ds.get("code") != "OK" or ds.get("matrix") is None or ds["matrix"].shape[0] < 3:
        return None

    matrix = ds["matrix"]
    target_col = int(ds["target_col"])
    L = min(int(ds.get("L") or lookback_min), matrix.shape[0])
    tail = matrix[-L:, target_col]
    baseline = float(tail[-1])
    drift = float(tail[-1] - tail[0]) / max(1, len(tail) - 1)

    stamps = ds.get("timestamps") or []
    actual_tail = [{"t": stamps[-L + i], "y": float(tail[i])} for i in range(len(tail)) if stamps]
    points: List[Dict[str, Any]] = []
    for h in HORIZONS_MIN:
        yhat = baseline + drift * (h * 60 / max(15, int(ds.get("step_seconds") or 60)))
        points.append(
            {
                "horizon_min": h,
                "t": (now + timedelta(minutes=h)).isoformat(),
                "yhat": float(yhat),
            }
        )
    return {
        "points": points,
        "actual_lookback": actual_tail,
        "field": TARGET_FIELD[target],
    }


def heuristic_status_for_targets(
    zone_id: str = "ZONE-01",
    targets: Optional[List[str]] = None,
) -> Dict[str, Dict[str, Any]]:
    keys = targets or list(TARGET_FIELD.keys())
    out: Dict[str, Dict[str, Any]] = {}
    for target in keys:
        series = heuristic_forecast_target(target, zone_id)
        if series:
            out[target] = {
                "status": "MODEL_READY",
                "model_id": f"heuristic-{target}",
                "model_version": "heuristic-v1",
                "mode": "HEURISTIC",
            }
    return out
