"""Sequence windows from Stage B normalized AI records for LSTM."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from backend.ai.rls.features_export import RLS_FEATURE_COLS, enrich_records_with_rls
from backend.services.ai_normalized_telemetry import build_ai_records

FEATURE_COLS = (
    "Indoor_Temp",
    "Outdoor_Temp",
    "Setpoint",
    "Fan_Speed",
    "Occupancy",
    "HVAC_Power",
    "Equipment_Status",
)

ALL_FEATURE_COLS = FEATURE_COLS + RLS_FEATURE_COLS

TARGET_FIELD = {
    "zone_temp": "Indoor_Temp",
    "hvac_power": "HVAC_Power",
    "energy": "HVAC_Power",
    "occupancy": "Occupancy",
}

HORIZONS_MIN = (15, 30, 45, 60)
MODEL_IDS = {
    "zone_temp": "mdl-lstm-zone-temp-v1",
    "hvac_power": "mdl-lstm-hvac-power-v1",
    "energy": "mdl-lstm-energy-v1",
    "occupancy": "mdl-lstm-occupancy-v1",
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def clamp_lookback(minutes: Optional[int]) -> int:
    raw = minutes if minutes is not None else int(os.getenv("HVAC_LSTM_LOOKBACK_MIN", "60") or "60")
    return max(30, min(120, int(raw)))


def _row_ok(row: Dict[str, Any]) -> bool:
    q = str(row.get("quality") or "").upper()
    if q not in ("GOOD", "STALE"):
        return False
    for col in FEATURE_COLS:
        if row.get(col) is None:
            return False
    return True


def build_feature_matrix(
    records: Sequence[Dict[str, Any]],
    *,
    zone_id: str = "ZONE-01",
    feature_cols: Optional[Sequence[str]] = None,
) -> Tuple[np.ndarray, List[str]]:
    """Return (N, F) float matrix and ISO timestamps for usable rows only."""
    cols = tuple(feature_cols or ALL_FEATURE_COLS)
    enriched = enrich_records_with_rls(list(records), zone_id=zone_id)
    rows: List[List[float]] = []
    stamps: List[str] = []
    for r in enriched:
        if not _row_ok(r):
            continue
        rows.append([float(r.get(c) or 0.0) for c in cols])
        stamps.append(str(r.get("Timestamp") or ""))
    if not rows:
        return np.zeros((0, len(cols)), dtype=float), []
    return np.asarray(rows, dtype=float), stamps


def iter_windows(
    matrix: np.ndarray,
    lookback: int,
    horizon: int,
    target_col: int,
) -> Tuple[np.ndarray, np.ndarray]:
    """Sliding windows: X (N, L, F), y (N, H) for target column index."""
    n, f = matrix.shape
    xs: List[np.ndarray] = []
    ys: List[np.ndarray] = []
    need = lookback + horizon
    if n < need or lookback < 1 or horizon < 1:
        return np.zeros((0, lookback, f), dtype=float), np.zeros((0, horizon), dtype=float)
    for i in range(0, n - need + 1):
        xs.append(matrix[i : i + lookback])
        ys.append(matrix[i + lookback : i + lookback + horizon, target_col])
    return np.stack(xs, axis=0), np.stack(ys, axis=0)


def build_dataset(
    zone_id: str = "ZONE-01",
    *,
    t0: Optional[Any] = None,
    t1: Optional[Any] = None,
    lookback_min: Optional[int] = None,
    horizons_min: Sequence[int] = HORIZONS_MIN,
    target: str = "zone_temp",
    step_seconds: int = 60,
    building_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build train/infer windows for one target. Never invents values."""
    if target not in TARGET_FIELD:
        return {"code": "UNKNOWN_TARGET", "target": target, "n_windows": 0}
    lookback_min = clamp_lookback(lookback_min)
    step = max(15, int(step_seconds))
    end_dt = _now()
    span = lookback_min + max(int(h) for h in horizons_min) + 60
    start_dt = end_dt - timedelta(minutes=span)
    if t1 is not None:
        end = t1.isoformat() if hasattr(t1, "isoformat") else str(t1)
    else:
        end = end_dt.isoformat()
    if t0 is not None:
        start = t0.isoformat() if hasattr(t0, "isoformat") else str(t0)
    else:
        start = start_dt.isoformat()

    payload = build_ai_records(
        zone_id=zone_id or "ZONE-01",
        t0=start,
        t1=end,
        step_seconds=step,
        building_id=building_id,
    )
    records = payload.get("records") or []
    feature_cols = list(ALL_FEATURE_COLS)
    matrix, stamps = build_feature_matrix(records, zone_id=zone_id or "ZONE-01", feature_cols=feature_cols)
    L = max(1, int(round(lookback_min * 60 / step)))
    target_col = feature_cols.index(TARGET_FIELD[target])
    by_h: Dict[str, Any] = {}
    min_windows = None
    for h_min in horizons_min:
        H = max(1, int(round(int(h_min) * 60 / step)))
        X, y = iter_windows(matrix, L, H, target_col)
        by_h[str(h_min)] = {"X_shape": list(X.shape), "y_shape": list(y.shape), "n_windows": int(X.shape[0])}
        min_windows = int(X.shape[0]) if min_windows is None else min(min_windows, int(X.shape[0]))

    # Primary dataset uses max horizon (60) for multi-step head training
    H_max = max(1, int(round(max(horizons_min) * 60 / step)))
    X, y = iter_windows(matrix, L, H_max, target_col)
    if X.shape[0] < 1:
        return {
            "code": "INSUFFICIENT_SEQUENCE",
            "zone_id": zone_id,
            "target": target,
            "lookback_min": lookback_min,
            "step_seconds": step,
            "n_rows": int(matrix.shape[0]),
            "n_windows": 0,
            "horizons": by_h,
            "feature_cols": feature_cols,
            "rls_wired": True,
            "timestamps": stamps[-min(5, len(stamps)) :],
        }
    return {
        "code": "OK",
        "zone_id": zone_id,
        "target": target,
        "lookback_min": lookback_min,
        "step_seconds": step,
        "n_rows": int(matrix.shape[0]),
        "n_windows": int(X.shape[0]),
        "horizons": by_h,
        "feature_cols": feature_cols,
        "rls_wired": True,
        "X": X,
        "y": y,
        "matrix": matrix,
        "timestamps": stamps,
        "L": L,
        "H": H_max,
        "target_col": target_col,
        "t0": payload.get("t0"),
        "t1": payload.get("t1"),
    }


def sequence_summary(
    zone_id: str = "ZONE-01",
    *,
    lookback_min: Optional[int] = None,
    horizon_min: int = 60,
    target: str = "zone_temp",
) -> Dict[str, Any]:
    ds = build_dataset(
        zone_id,
        lookback_min=lookback_min,
        horizons_min=(horizon_min,),
        target=target,
    )
    out = {k: v for k, v in ds.items() if k not in ("X", "y", "matrix")}
    return out
