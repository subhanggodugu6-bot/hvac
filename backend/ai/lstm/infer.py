"""LSTM inference / forecast. Advisory only — never writes setpoints."""
from __future__ import annotations

import os
import pickle
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import numpy as np

from backend.ai.lstm.model import (
    LstmForecastNet,
    standardize_apply,
    torch_available,
    torch_gate_message,
    torch_required_strict,
)
from backend.ai.lstm.sequences import (
    ALL_FEATURE_COLS,
    FEATURE_COLS,
    HORIZONS_MIN,
    MODEL_IDS,
    TARGET_FIELD,
    build_dataset,
    clamp_lookback,
)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _load_artifact(path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(path, "rb") as fh:
            return pickle.load(fh)
    except Exception:
        return None


def _registry_row(model_id: str):
    """Legacy helper — prefer latest READY for the target key."""
    from backend.ai.lstm.status import latest_ready_row
    from backend.ai.lstm.sequences import MODEL_IDS

    # model_id may be logical key
    for target, mid in MODEL_IDS.items():
        if model_id == mid or str(model_id).startswith(mid + "__"):
            return latest_ready_row(target)
    from database.session import SessionLocal
    from database.models_ml import MLModelRegistryDB

    db = SessionLocal()
    try:
        return (
            db.query(MLModelRegistryDB)
            .filter(MLModelRegistryDB.id == model_id, MLModelRegistryDB.status == "MODEL_READY")
            .order_by(MLModelRegistryDB.created_at.desc())
            .first()
        )
    finally:
        db.close()


def forecast(
    zone_id: str = "ZONE-01",
    *,
    lookback_min: Optional[int] = None,
    targets: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Multi-horizon forecast for configured targets. No BMS writes."""
    from backend.ai.lstm.status import latest_ready_row

    if not torch_available() and torch_required_strict():
        gate = torch_gate_message()
        return {
            **gate,
            "zone_id": zone_id,
            "series": {},
            "status": {},
            "wrote_setpoints": False,
            "provenance": "MODEL PREDICTION",
        }

    lookback_min = clamp_lookback(lookback_min)
    keys = targets or list(TARGET_FIELD.keys())
    series: Dict[str, Any] = {}
    statuses: Dict[str, Any] = {}
    now = _now()

    for target in keys:
        model_key = MODEL_IDS[target]
        row = latest_ready_row(target)
        if row is None or not row.artifact_path:
            from backend.ai.lstm.heuristic import heuristic_forecast_target

            h_series = heuristic_forecast_target(target, zone_id, lookback_min=lookback_min, now=now)
            if h_series:
                series[target] = h_series
                statuses[target] = {
                    "status": "MODEL_READY",
                    "model_id": f"heuristic-{target}",
                    "model_key": model_key,
                    "model_version": "heuristic-v1",
                    "mode": "HEURISTIC",
                }
                continue
            statuses[target] = {"status": "MODEL_NOT_AVAILABLE", "model_id": model_key}
            series[target] = None
            continue
        if not torch_available():
            from backend.ai.lstm.heuristic import heuristic_forecast_target

            h_series = heuristic_forecast_target(target, zone_id, lookback_min=lookback_min, now=now)
            if h_series:
                series[target] = h_series
                statuses[target] = {
                    "status": "MODEL_READY",
                    "model_id": row.id,
                    "model_key": model_key,
                    "model_version": row.model_version or "heuristic-v1",
                    "mode": "HEURISTIC",
                }
                continue
            statuses[target] = {"status": "TORCH_REQUIRED", "model_id": row.id}
            series[target] = None
            continue
        art = _load_artifact(row.artifact_path)
        if not art:
            statuses[target] = {"status": "ARTIFACT_MISSING", "model_id": row.id}
            series[target] = None
            continue

        ds = build_dataset(
            zone_id,
            lookback_min=lookback_min,
            horizons_min=HORIZONS_MIN,
            target=target,
        )
        if ds.get("code") != "OK" or ds["matrix"].shape[0] < art["lookback"]:
            statuses[target] = {"status": "INSUFFICIENT_SEQUENCE", "model_id": row.id}
            series[target] = None
            continue

        L = int(art["lookback"])
        feat_cols = list(art.get("feature_cols") or FEATURE_COLS)
        ds_cols = list(ds.get("feature_cols") or ALL_FEATURE_COLS)
        try:
            col_idx = [ds_cols.index(c) for c in feat_cols]
        except ValueError:
            col_idx = list(range(min(len(feat_cols), ds["matrix"].shape[1])))
        matrix = ds["matrix"][:, col_idx]
        window = matrix[-L:]
        target_col = ds_cols.index(TARGET_FIELD[target]) if TARGET_FIELD[target] in ds_cols else ds["target_col"]
        Xs = standardize_apply(window[np.newaxis, :, :], art["mean"], art["std"])
        net = LstmForecastNet(n_features=art["n_features"], horizon=art["horizon"], hidden=32)
        net.load_state_dict(art["state_dict"])
        yhat_s = net.predict(Xs)[0]
        yhat = yhat_s * float(art["y_std"]) + float(art["y_mean"])

        step = int(ds.get("step_seconds") or 60)
        points = []
        actual_tail = []
        stamps = ds.get("timestamps") or []
        for h in HORIZONS_MIN:
            idx = max(0, min(len(yhat) - 1, int(round(h * 60 / step)) - 1))
            points.append(
                {
                    "horizon_min": h,
                    "t": (now + timedelta(minutes=h)).isoformat(),
                    "yhat": float(yhat[idx]),
                }
            )
        for i, ts in enumerate(stamps[-L:]):
            actual_tail.append({"t": ts, "y": float(ds["matrix"][-L + i, target_col])})

        series[target] = {
            "points": points,
            "actual_lookback": actual_tail,
            "field": TARGET_FIELD[target],
        }
        statuses[target] = {
            "status": "MODEL_READY",
            "model_id": row.id,
            "model_key": model_key,
            "metrics": art.get("metrics"),
            "model_version": row.model_version,
        }
        _log_prediction(zone_id, row.id, target, points, actual_tail)

    return {
        "now": now.isoformat(),
        "zone_id": zone_id,
        "lookback_min": lookback_min,
        "horizons_min": list(HORIZONS_MIN),
        "series": series,
        "status": statuses,
        "wrote_setpoints": False,
        "provenance": "MODEL PREDICTION",
    }


def _log_prediction(
    zone_id: str,
    model_id: str,
    target: str,
    points: List[Dict[str, Any]],
    actual: List[Dict[str, Any]],
) -> None:
    from database.session import SessionLocal
    from database.models_ml import MLPredictionDB

    db = SessionLocal()
    try:
        db.add(
            MLPredictionDB(
                id=f"pred_lstm_{uuid.uuid4().hex[:12]}",
                opportunity_id="LSTM",
                equipment_id=zone_id,
                building_id=os.getenv("HVAC_DEFAULT_BUILDING_ID") or "bldg-corp-hq-01",
                model_id=model_id,
                input_json={"target": target, "zone_id": zone_id},
                prediction_json={"points": points, "actual_lookback": actual[-10:]},
                confidence=None,
                source="ML_MODEL",
                provenance="MODEL PREDICTION",
                status="OK",
                created_at=_now(),
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
