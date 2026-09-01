"""Export RLS model parameters as LSTM feature columns (Stage C → Stage D)."""
from __future__ import annotations

from typing import Any, Dict, List, Sequence

RLS_FEATURE_COLS = (
    "RLS_ZT_TH0",
    "RLS_ZT_TH1",
    "RLS_HP_TH0",
    "RLS_HP_TH1",
    "RLS_ZT_READY",
    "RLS_HP_READY",
)


def rls_feature_vector(zone_id: str = "ZONE-01") -> Dict[str, float]:
    """Current RLS θ and readiness flags for one zone."""
    out: Dict[str, float] = {c: 0.0 for c in RLS_FEATURE_COLS}
    try:
        from backend.ai.rls.service import params_for

        zt = params_for("zone_thermal", zone_id=zone_id) or {}
        hp = params_for("hvac_power", zone_id=zone_id) or {}
        zt_th: Sequence[float] = zt.get("theta") or [0.0, 0.0]
        hp_th: Sequence[float] = hp.get("theta") or [0.0, 0.0]
        out["RLS_ZT_TH0"] = float(zt_th[0] if len(zt_th) > 0 else 0.0)
        out["RLS_ZT_TH1"] = float(zt_th[1] if len(zt_th) > 1 else 0.0)
        out["RLS_HP_TH0"] = float(hp_th[0] if len(hp_th) > 0 else 0.0)
        out["RLS_HP_TH1"] = float(hp_th[1] if len(hp_th) > 1 else 0.0)
        out["RLS_ZT_READY"] = 1.0 if str(zt.get("status") or "").upper() == "READY" else 0.0
        out["RLS_HP_READY"] = 1.0 if str(hp.get("status") or "").upper() == "READY" else 0.0
    except Exception:
        pass
    return out


def enrich_records_with_rls(
    records: Sequence[Dict[str, Any]],
    zone_id: str = "ZONE-01",
) -> List[Dict[str, Any]]:
    """Attach RLS features to each normalized telemetry row for LSTM training/infer."""
    rls = rls_feature_vector(zone_id)
    enriched: List[Dict[str, Any]] = []
    for row in records:
        merged = dict(row)
        merged.update(rls)
        enriched.append(merged)
    return enriched
