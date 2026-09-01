"""Free LLM narrative hook tests."""
from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

os.environ.setdefault("HVAC_LLM_ENABLED", "1")


def test_template_explain_always_works():
    from backend.ai.llm.providers import generate_explanation

    ctx = {
        "winner": {
            "action_id": "zone_sp_down_0.5",
            "mapped_opportunity": "O2",
            "point_id": "ZONE-01.cooling_setpoint",
            "old_value": 22.0,
            "new_value": 21.5,
            "score": 0.42,
        },
    }
    out = generate_explanation("explain this", ctx, provider="template")
    assert out.get("text")
    assert out.get("provider") == "template"


def test_hook_disabled():
    import backend.ai.llm.hook as hook

    old = os.environ.get("HVAC_LLM_ENABLED")
    os.environ["HVAC_LLM_ENABLED"] = "0"
    assert hook.explain_decision({"winner": {}}) is None
    if old is not None:
        os.environ["HVAC_LLM_ENABLED"] = old
    else:
        os.environ.pop("HVAC_LLM_ENABLED", None)


def test_list_free_providers():
    from backend.ai.llm.providers import list_free_providers

    info = list_free_providers()
    ids = [p["id"] for p in info.get("providers") or []]
    assert "template" in ids
    assert "ollama" in ids
    assert "groq" in ids
