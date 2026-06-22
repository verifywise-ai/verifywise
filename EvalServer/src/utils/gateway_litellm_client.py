"""
Call AI Gateway internal LiteLLM completion API (same path Express uses).

Env:
  AI_GATEWAY_URL — default http://127.0.0.1:8100
  AI_GATEWAY_INTERNAL_KEY — required for cloud completions via gateway
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("uvicorn")

DEFAULT_GATEWAY_URL = "http://127.0.0.1:8100"


def gateway_mode_enabled() -> bool:
    key = os.getenv("AI_GATEWAY_INTERNAL_KEY", "").strip()
    return bool(key) and key.lower() not in ("changeme", "change-me", "your-secret-key", "secret")


def _gateway_url() -> str:
    return os.getenv("AI_GATEWAY_URL", DEFAULT_GATEWAY_URL).rstrip("/")


def _internal_key() -> str:
    return os.getenv("AI_GATEWAY_INTERNAL_KEY", "").strip()


def to_litellm_model(provider: str, model: str) -> str:
    """
    Map eval provider + UI model id to a LiteLLM model string.

    OpenRouter models must be resolved first because their names typically contain
    a "/" (e.g. "meta-llama/llama-3.1-70b-instruct") which would otherwise trigger
    the early-return and skip the required "openrouter/" prefix.
    """
    p = (provider or "").lower().strip()
    m = (model or "").strip()
    if not m:
        raise ValueError("model name is required")

    # OpenRouter — must come before the "/" shortcut because OpenRouter slugs
    # (e.g. "meta-llama/llama-3.1-70b-instruct") contain "/" but still need the
    # "openrouter/" LiteLLM prefix to be routed correctly.
    if p == "openrouter":
        return m if m.startswith("openrouter/") else f"openrouter/{m}"

    # For all other providers, a "/" means the caller already supplied a fully-
    # qualified LiteLLM model string — pass it through unchanged.
    if "/" in m:
        return m

    if p in ("google", "gemini"):
        return m if m.startswith("gemini/") or m.startswith("google/") else f"gemini/{m}"

    if p == "mistral" and not m.startswith("mistral/"):
        return f"mistral/{m}"

    if p == "xai" and not m.startswith("xai/"):
        return f"xai/{m}"

    if p == "anthropic" and not m.startswith("anthropic/"):
        return f"anthropic/{m}"

    if p == "huggingface" and not m.startswith("huggingface/"):
        return f"huggingface/{m}"

    return m


def _extract_assistant_text(payload: Dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""
    msg = (choices[0] or {}).get("message") or {}
    content = msg.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts).strip()
    return ""


def gateway_chat_completion_sync(
    litellm_model: str,
    messages: List[Dict[str, str]],
    api_key: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    timeout: float = 120.0,
) -> str:
    """Synchronous chat completion via AI Gateway."""
    if not gateway_mode_enabled():
        raise RuntimeError("AI_GATEWAY_INTERNAL_KEY is not set — cannot use gateway completions")
    url = f"{_gateway_url()}/internal/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "x-internal-key": _internal_key(),
        "x-provider-key": api_key,
    }
    body = {
        "model": litellm_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, headers=headers, json=body)
    if resp.status_code >= 400:
        logger.error("Gateway completion failed: %s %s", resp.status_code, resp.text[:500])
        resp.raise_for_status()
    data = resp.json()
    return _extract_assistant_text(data)


async def gateway_chat_completion_async(
    litellm_model: str,
    messages: List[Dict[str, str]],
    api_key: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    timeout: float = 120.0,
) -> str:
    """Async chat completion via AI Gateway."""
    if not gateway_mode_enabled():
        raise RuntimeError("AI_GATEWAY_INTERNAL_KEY is not set — cannot use gateway completions")
    url = f"{_gateway_url()}/internal/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "x-internal-key": _internal_key(),
        "x-provider-key": api_key,
    }
    body = {
        "model": litellm_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=body)
    if resp.status_code >= 400:
        logger.error("Gateway completion failed: %s %s", resp.status_code, (resp.text or "")[:500])
        resp.raise_for_status()
    data = resp.json()
    return _extract_assistant_text(data)
