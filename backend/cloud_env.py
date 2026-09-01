"""Hosted-demo defaults for Render (API) and Vercel (UI)."""
from __future__ import annotations

import os

DEMO_CORS_ORIGIN_REGEX = r"https://.*\.(vercel\.app|onrender\.com)"


def is_hosted_demo() -> bool:
    return any(os.getenv(k) for k in ("RENDER", "VERCEL"))


def apply_cloud_demo_env() -> None:
    if not is_hosted_demo():
        return
    os.environ.setdefault("HVAC_START_CONTROL_WORKER", "1")
    os.environ.setdefault("HVAC_BMS_MODE", "simulation")
    os.environ.setdefault("HVAC_USE_SIMULATION", "1")
    os.environ.setdefault("HVAC_BMS_WRITE_ENABLED", "0")
    os.environ.setdefault("HVAC_ALLOW_SIM_WRITES", "1")
    os.environ.setdefault("HVAC_ALLOW_CREATE_ALL", "1")
    os.environ.setdefault("HVAC_DEPLOYMENT_MODE", "demo")
    os.environ.setdefault("HVAC_PLANT_MODE_PERSIST", "1")
    os.environ.setdefault("HVAC_CORS_ORIGIN_REGEX", DEMO_CORS_ORIGIN_REGEX)
    os.environ.setdefault("HVAC_USE_AI_PIPELINE", "1")
    os.environ.setdefault("HVAC_AI_PIPELINE_INTERVAL_SECONDS", "60")
    os.environ.setdefault("HVAC_SAFE_RL_TICK_SECONDS", "60")
    os.environ.setdefault("HVAC_LLM_ENABLED", "1")
    os.environ.setdefault("HVAC_LLM_PROVIDER", "gemini")
    os.environ.setdefault("HVAC_LLM_MODEL", "gemini-flash-latest")
