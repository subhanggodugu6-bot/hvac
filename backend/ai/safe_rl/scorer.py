"""Deterministic Safe-RL scoring for discrete HVAC actions."""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from backend.ai.safe_rl.constraints import check_candidate


def _weights() -> Dict[str, float]:
    try:
        from backend.ai.safe_rl.offline import load_offline_blob

        blob = load_offline_blob()
        w = blob.get("weights") or {}
        return {
            "energy": float(w.get("energy", os.getenv("HVAC_SAFE_RL_SCORE_W_ENERGY", "1.0") or "1.0")),
            "comfort": float(w.get("comfort", os.getenv("HVAC_SAFE_RL_SCORE_W_COMFORT", "2.0") or "2.0")),
            "limit": float(w.get("limit", os.getenv("HVAC_SAFE_RL_SCORE_W_LIMIT", "0.5") or "0.5")),
            "forecast": float(w.get("forecast", os.getenv("HVAC_SAFE_RL_SCORE_W_FORECAST", "0.3") or "0.3")),
        }
    except Exception:
        return {
            "energy": float(os.getenv("HVAC_SAFE_RL_SCORE_W_ENERGY", "1.0") or "1.0"),
            "comfort": float(os.getenv("HVAC_SAFE_RL_SCORE_W_COMFORT", "2.0") or "2.0"),
            "limit": float(os.getenv("HVAC_SAFE_RL_SCORE_W_LIMIT", "0.5") or "0.5"),
            "forecast": float(os.getenv("HVAC_SAFE_RL_SCORE_W_FORECAST", "0.3") or "0.3"),
        }


def _lstm_power_delta_kwh(
    state: Dict[str, Any],
    candidate: Optional[Dict[str, Any]] = None,
    horizon_min: int = 60,
) -> Optional[float]:
    lstm = state.get("lstm") or {}
    series = (lstm.get("series") or {}).get("hvac_power")
    if not series:
        return None
    lookback = series.get("actual_lookback") or []
    baseline = lookback[-1]["y"] if lookback else None
    points = series.get("points") or []
    target = next((p for p in points if int(p.get("horizon_min") or 0) == horizon_min), None)
    if baseline is None or target is None or target.get("yhat") is None:
        return None
    energy_delta = float(baseline) - float(target["yhat"])

    # Action-conditioned adjustment from setpoint delta (LSTM is plant-level; blend per candidate)
    if candidate:
        old_v = candidate.get("old_value")
        new_v = candidate.get("new_value")
        point = str(candidate.get("point_id") or "")
        if old_v is not None and new_v is not None:
            sp_delta = float(new_v) - float(old_v)
            if "cooling_setpoint" in point or candidate.get("mapped_opportunity") == "O2":
                energy_delta += -0.2 * sp_delta
            elif "SAT" in point.upper() or candidate.get("mapped_opportunity") == "O3":
                energy_delta += 0.15 * sp_delta
            elif candidate.get("mapped_opportunity") in ("O5", "O14", "O16"):
                energy_delta += 0.05 * abs(sp_delta)

    return energy_delta


def _action_energy_prior(action_id: str) -> float:
    """Heuristic kWh-equivalent savings prior when LSTM unavailable (+ offline EMA)."""
    priors = {
        "hold": 0.0,
        "zone_sp_up_0.5": -0.3,
        "zone_sp_down_0.5": 0.2,
        "sat_warmer_0.5": 0.8,
        "sat_cooler_0.5": -0.5,
        "static_down_0.1": 0.5,
        "chws_up_0.3": 0.6,
        "schw_pump_down_5": 0.7,
        "cw_pump_down_5": 0.65,
    }
    base = float(priors.get(action_id, 0.0))
    try:
        from backend.ai.safe_rl.offline import load_offline_blob

        learned = (load_offline_blob().get("action_priors") or {}).get(action_id)
        if learned is not None:
            # Blend static prior with offline EMA (offline is reward-scale; scale down)
            return 0.7 * base + 0.3 * float(learned)
    except Exception:
        pass
    return base


def score_candidate(state: Dict[str, Any], candidate: Dict[str, Any]) -> Dict[str, Any]:
    check = check_candidate(state, candidate)
    action_id = candidate.get("action_id") or ""
    w = _weights()
    tariff = float(state.get("tariff_usd_kwh") or 0.14)

    if not check["feasible"]:
        return {
            **candidate,
            "score": -999.0,
            "feasible": False,
            "reason": check["reason"],
            "constraints": check.get("constraints") or [],
            "comfort_risk": check.get("comfort_risk", 1.0),
            "components": {},
        }

    if action_id == "hold":
        return {
            **candidate,
            "score": 0.0,
            "feasible": True,
            "reason": "HOLD",
            "constraints": [],
            "comfort_risk": 0.0,
            "components": {"energy_kwh": 0.0, "cost_usd": 0.0},
        }

    energy_delta = _lstm_power_delta_kwh(state, candidate=candidate)
    if energy_delta is None:
        energy_delta = _action_energy_prior(action_id)

    # Adjust prior by action direction vs RLS hvac_power theta hint
    rls = state.get("rls") or {}
    hp = rls.get("hvac_power") or {}
    theta = hp.get("theta")
    if isinstance(theta, list) and len(theta) > 1:
        energy_delta += 0.05 * float(theta[1])

    comfort_risk = float(check.get("comfort_risk") or 0.0)
    limit_penalty = 0.05 * len(check.get("constraints") or [])
    forecast_bonus = 0.1 if energy_delta > 0 else 0.0

    score = (
        w["energy"] * energy_delta
        - w["comfort"] * comfort_risk
        - w["limit"] * limit_penalty
        + w["forecast"] * forecast_bonus
    )
    cost_usd = energy_delta * tariff

    return {
        **candidate,
        "score": float(score),
        "feasible": True,
        "reason": "OK",
        "constraints": check.get("constraints") or [],
        "comfort_risk": comfort_risk,
        "components": {
            "energy_kwh": energy_delta,
            "cost_usd": cost_usd,
            "comfort_risk": comfort_risk,
            "limit_penalty": limit_penalty,
            "forecast_bonus": forecast_bonus,
        },
    }


def rank_candidates(state: Dict[str, Any]) -> Dict[str, Any]:
    scored: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    for cand in state.get("candidates") or []:
        result = score_candidate(state, cand)
        if result.get("feasible"):
            scored.append(result)
        else:
            rejected.append(
                {
                    "action_id": result.get("action_id"),
                    "score": result.get("score"),
                    "reason": result.get("reason"),
                    "constraints": result.get("constraints") or [],
                    "mapped_opportunity": result.get("mapped_opportunity"),
                }
            )

    scored.sort(key=lambda x: float(x.get("score") or -1e9), reverse=True)
    winner = scored[0] if scored else None
    all_rejected = not scored
    active_constraints: List[str] = []
    for r in rejected:
        active_constraints.extend(r.get("constraints") or [])
    if winner:
        active_constraints.extend(winner.get("constraints") or [])

    min_conf = float(os.getenv("HVAC_SAFE_RL_MIN_CONFIDENCE", "0.65") or "0.65")
    confidence = 0.5
    if winner and winner.get("action_id") != "hold":
        gap = 0.0
        if len(scored) > 1:
            gap = float(winner.get("score") or 0) - float(scored[1].get("score") or 0)
        confidence = min(0.99, max(min_conf, 0.55 + 0.1 * gap))

    return {
        "winner": winner,
        "scored": scored,
        "rejected_actions": rejected,
        "all_rejected": all_rejected,
        "constraints": sorted(set(active_constraints)),
        "confidence": confidence,
    }
