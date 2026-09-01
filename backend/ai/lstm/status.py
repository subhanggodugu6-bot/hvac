"""LSTM model status for Stage D/H — latest ACTIVE/READY per target."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.ai.lstm.model import torch_available
from backend.ai.lstm.sequences import MODEL_IDS, TARGET_FIELD


def latest_ready_row(target: str):
    """Return newest MODEL_READY registry row for a target (versioned or legacy id)."""
    from database.session import SessionLocal
    from database.models_ml import MLModelRegistryDB

    model_key = MODEL_IDS.get(target)
    if not model_key:
        return None
    db = SessionLocal()
    try:
        rows = (
            db.query(MLModelRegistryDB)
            .filter(
                MLModelRegistryDB.opportunity_id == "LSTM",
                MLModelRegistryDB.model_type == "LSTM",
                MLModelRegistryDB.status == "MODEL_READY",
            )
            .order_by(MLModelRegistryDB.created_at.desc())
            .all()
        )
        for row in rows:
            tj = row.target_json if isinstance(row.target_json, dict) else {}
            fj = row.features_json if isinstance(row.features_json, dict) else {}
            if (
                row.id == model_key
                or str(row.id).startswith(model_key + "__")
                or tj.get("target") == target
                or fj.get("model_key") == model_key
                or tj.get("model_key") == model_key
            ):
                # Detach fields we need
                return row
        return None
    finally:
        db.close()


def list_status() -> Dict[str, Any]:
    from database.session import SessionLocal
    from database.models_ml import MLModelMetricsDB, MLModelRegistryDB

    db = SessionLocal()
    try:
        models: List[Dict[str, Any]] = []
        for target, mid in MODEL_IDS.items():
            row = latest_ready_row(target)
            metrics = None
            mode = None
            if row:
                m = db.query(MLModelMetricsDB).filter_by(model_id=row.id, split="validation").first()
                metrics = m.metrics_json if m else None
                status = row.status
                model_id = row.id
                model_version = row.model_version
                model_type = row.model_type
                artifact_path = row.artifact_path
                created_at = row.created_at.isoformat() if row.created_at else None
            else:
                from backend.ai.lstm.heuristic import heuristic_forecast_target

                h = heuristic_forecast_target(target, "ZONE-01")
                if h:
                    status = "MODEL_READY"
                    model_id = f"heuristic-{target}"
                    model_version = "heuristic-v1"
                    mode = "HEURISTIC"
                else:
                    status = "MODEL_NOT_AVAILABLE"
                    model_id = mid
                    model_version = None
                model_type = "LSTM"
                artifact_path = None
                created_at = None
            models.append(
                {
                    "target": target,
                    "field": TARGET_FIELD[target],
                    "model_id": model_id,
                    "model_key": mid,
                    "status": status,
                    "model_type": model_type,
                    "model_version": model_version,
                    "metrics": metrics,
                    "artifact_path": artifact_path,
                    "created_at": created_at,
                    "mode": mode,
                }
            )
        return {
            "models": models,
            "torch": torch_available(),
            "opportunity_id": "LSTM",
            "wrote_setpoints": False,
        }
    finally:
        db.close()


def list_versions(limit: int = 20) -> Dict[str, Any]:
    """Version history for Model Manager / GET /ai/lstm/models."""
    from database.session import SessionLocal
    from database.models_ml import MLModelRegistryDB

    db = SessionLocal()
    try:
        rows = (
            db.query(MLModelRegistryDB)
            .filter(MLModelRegistryDB.opportunity_id == "LSTM", MLModelRegistryDB.model_type == "LSTM")
            .order_by(MLModelRegistryDB.created_at.desc())
            .limit(max(1, min(100, int(limit))))
            .all()
        )
        out = []
        for r in rows:
            tj = r.target_json if isinstance(r.target_json, dict) else {}
            out.append(
                {
                    "model_id": r.id,
                    "model_version": r.model_version,
                    "status": r.status,
                    "target": tj.get("target"),
                    "artifact_path": r.artifact_path,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
            )
        return {"models": out, "count": len(out), "wrote_setpoints": False}
    finally:
        db.close()
