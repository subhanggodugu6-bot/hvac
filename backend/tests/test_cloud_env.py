"""Hosted-demo env defaults for Render / Vercel."""
from __future__ import annotations

import os

from backend.cloud_env import DEMO_CORS_ORIGIN_REGEX, apply_cloud_demo_env, is_hosted_demo

_DEMO_KEYS = (
    "HVAC_CORS_ORIGIN_REGEX",
    "HVAC_START_CONTROL_WORKER",
    "HVAC_BMS_MODE",
    "HVAC_USE_SIMULATION",
    "HVAC_BMS_WRITE_ENABLED",
    "HVAC_ALLOW_SIM_WRITES",
    "HVAC_ALLOW_CREATE_ALL",
    "HVAC_DEPLOYMENT_MODE",
    "HVAC_PLANT_MODE_PERSIST",
    "DATABASE_URL",
)


def test_not_hosted_by_default(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert is_hosted_demo() is False


def test_render_demo_defaults(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    for key in _DEMO_KEYS:
        monkeypatch.delenv(key, raising=False)
    apply_cloud_demo_env()
    assert os.environ["HVAC_DEPLOYMENT_MODE"] == "demo"
    assert os.environ["HVAC_BMS_WRITE_ENABLED"] == "0"
    assert os.environ["HVAC_START_CONTROL_WORKER"] == "1"
    assert os.environ["HVAC_CORS_ORIGIN_REGEX"] == DEMO_CORS_ORIGIN_REGEX
