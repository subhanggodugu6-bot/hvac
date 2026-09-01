"""Free / low-cost LLM providers for operator narrative (not NB2 optimizer)."""
from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, Optional, Tuple

import httpx

DEFAULT_TIMEOUT = float(os.getenv("HVAC_LLM_TIMEOUT_SECONDS", "45") or "45")

# Free-tier friendly defaults (user supplies API keys where noted).
PROVIDER_DEFAULTS: Dict[str, Dict[str, str]] = {
    "ollama": {
        "base_url": "http://127.0.0.1:11434",
        "model": "llama3.2",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.1-8b-instant",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "model": "gemini-flash-latest",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "model": "meta-llama/llama-3.1-8b-instruct:free",
    },
}


def _provider() -> str:
    return (os.getenv("HVAC_LLM_PROVIDER") or "auto").strip().lower()


def _model(provider: str) -> str:
    custom = (os.getenv("HVAC_LLM_MODEL") or "").strip()
    if custom:
        return custom
    return PROVIDER_DEFAULTS.get(provider, {}).get("model", "llama3.2")


def _api_key(provider: Optional[str] = None) -> str:
    prov = (provider or _provider()).strip().lower()
    if prov == "gemini":
        return (os.getenv("GEMINI_API_KEY") or os.getenv("HVAC_LLM_API_KEY") or "").strip()
    return (os.getenv("HVAC_LLM_API_KEY") or os.getenv("GROQ_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()


def _base_url(provider: str) -> str:
    custom = (os.getenv("HVAC_LLM_BASE_URL") or "").strip()
    if custom:
        return custom.rstrip("/")
    return PROVIDER_DEFAULTS.get(provider, {}).get("base_url", "").rstrip("/")


def template_explain(prompt: str, context: Dict[str, Any]) -> str:
    """Zero-config deterministic narrative — always free."""
    winner = context.get("winner") or context.get("chosen_action") or {}
    if not winner and context.get("last_decision"):
        winner = context["last_decision"].get("chosen_action") or {}
    action = winner.get("action_id") or "hold"
    if action == "hold":
        return (
            "The NB2 optimizer recommends **holding** current setpoints. "
            "Telemetry and models were evaluated; no energy-saving move beat hold within comfort and safety limits. "
            "This is advisory only — no BMS write occurred."
        )
    opp = winner.get("mapped_opportunity") or "SAFE_RL"
    point = winner.get("point_id") or "—"
    old_v = winner.get("old_value")
    new_v = winner.get("new_value")
    score = winner.get("score")
    return (
        f"**NB2 recommendation ({opp})** — action `{action}` on `{point}`: "
        f"adjust from {old_v} to {new_v}. "
        f"Score {score} combines LSTM power forecast, RLS hints, comfort risk, and tariff. "
        "Rule Engine must APPROVE before apply; Stage G allowlist and operator approval still apply on live plant."
    )


def _openai_chat(base_url: str, model: str, prompt: str, api_key: str) -> Tuple[Optional[str], Optional[str]]:
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You explain HVAC supervisory control decisions concisely."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 400,
    }
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                return None, f"{resp.status_code}:{resp.text[:200]}"
            data = resp.json()
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content")
            return (str(text).strip() if text else None), None
    except Exception as exc:
        return None, type(exc).__name__


def _ollama_chat(base_url: str, model: str, prompt: str) -> Tuple[Optional[str], Optional[str]]:
    url = f"{base_url}/api/chat"
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.3},
    }
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
            resp = client.post(url, json=body)
            if resp.status_code >= 400:
                return None, f"{resp.status_code}:{resp.text[:200]}"
            data = resp.json()
            text = (data.get("message") or {}).get("content")
            return (str(text).strip() if text else None), None
    except Exception as exc:
        return None, type(exc).__name__


GEMINI_MODEL_FALLBACKS = ("gemini-flash-latest",)


def _gemini_generate(model: str, prompt: str, api_key: str) -> Tuple[Optional[str], Optional[str]]:
    models: list[str] = []
    for m in (model, *GEMINI_MODEL_FALLBACKS):
        if m and m not in models:
            models.append(m)
    last_err: Optional[str] = None
    for mid in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{mid}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "X-goog-api-key": api_key,
        }
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 512},
        }
        try:
            with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
                for attempt in range(2):
                    resp = client.post(url, headers=headers, json=body)
                    if resp.status_code >= 400:
                        resp2 = client.post(url, params={"key": api_key}, json=body)
                        if resp2.status_code >= 400:
                            if resp2.status_code == 503 and attempt == 0:
                                time.sleep(2.0)
                                continue
                            last_err = f"{mid}:{resp2.status_code}:{resp2.text[:120]}"
                            break
                        resp = resp2
                    data = resp.json()
                    parts = (
                        (data.get("candidates") or [{}])[0].get("content", {}).get("parts") or []
                    )
                    text = parts[0].get("text") if parts else None
                    if text:
                        return str(text).strip(), None
                    last_err = f"{mid}:EMPTY_RESPONSE"
                    break
        except Exception as exc:
            last_err = f"{mid}:{type(exc).__name__}"
    return None, last_err


def _probe_ollama(base_url: str) -> bool:
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{base_url}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


def list_free_providers() -> Dict[str, Any]:
    key = _api_key()
    gemini_key = _api_key("gemini")
    ollama_url = _base_url("ollama")
    return {
        "providers": [
            {
                "id": "template",
                "label": "Template (zero config)",
                "free": True,
                "needs_key": False,
                "available": True,
            },
            {
                "id": "ollama",
                "label": "Ollama (local, free)",
                "free": True,
                "needs_key": False,
                "available": _probe_ollama(ollama_url),
                "base_url": ollama_url,
                "model": _model("ollama"),
                "hint": "Install Ollama and run: ollama pull llama3.2",
            },
            {
                "id": "groq",
                "label": "Groq (free API tier)",
                "free": True,
                "needs_key": True,
                "available": bool(key),
                "model": _model("groq"),
                "hint": "Free key at https://console.groq.com",
            },
            {
                "id": "gemini",
                "label": "Google Gemini (free API tier)",
                "free": True,
                "needs_key": True,
                "available": bool(gemini_key),
                "model": _model("gemini"),
                "hint": "Free key at https://aistudio.google.com/apikey",
            },
            {
                "id": "openrouter",
                "label": "OpenRouter (free models)",
                "free": True,
                "needs_key": True,
                "available": bool(key),
                "model": _model("openrouter"),
                "hint": "Free key at https://openrouter.ai — use :free model slugs",
            },
        ],
        "active_provider": _provider(),
        "model": _model(_provider()) if _provider() != "auto" else None,
    }


def generate_explanation(
    prompt: str,
    context: Dict[str, Any],
    *,
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Call configured provider; fall back to template on failure."""
    prov = (provider or _provider()).strip().lower()
    key = _api_key()
    gemini_key = _api_key("gemini")

    chain: list[str]
    if prov == "auto":
        chain = []
        if _probe_ollama(_base_url("ollama")):
            chain.append("ollama")
        if key:
            chain.append("groq")
        if gemini_key:
            chain.append("gemini")
        if key:
            chain.append("openrouter")
        chain.append("template")
    elif prov == "template":
        chain = ["template"]
    else:
        chain = [prov, "template"]

    errors: list[str] = []
    for name in chain:
        if name == "template":
            return {
                "text": template_explain(prompt, context),
                "provider": "template",
                "model": "deterministic",
                "fallback": bool(errors),
                "errors": errors,
            }

        if name == "ollama":
            text, err = _ollama_chat(_base_url("ollama"), _model("ollama"), prompt)
        elif name == "groq" and key:
            text, err = _openai_chat(_base_url("groq"), _model("groq"), prompt, key)
        elif name == "gemini" and gemini_key:
            text, err = _gemini_generate(_model("gemini"), prompt, gemini_key)
        elif name == "openrouter" and key:
            text, err = _openai_chat(_base_url("openrouter"), _model("openrouter"), prompt, key)
        else:
            err = "MISSING_API_KEY"
            text = None

        if text:
            return {
                "text": text,
                "provider": name,
                "model": _model(name),
                "fallback": bool(errors),
                "errors": errors,
            }
        if err:
            errors.append(f"{name}:{err}")

    return {
        "text": template_explain(prompt, context),
        "provider": "template",
        "model": "deterministic",
        "fallback": True,
        "errors": errors,
    }
