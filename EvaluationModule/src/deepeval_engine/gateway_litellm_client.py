"""
AI Gateway internal LiteLLM completions. EvalServer re-exports this module
(EvalServer/src/utils/gateway_litellm_client.py), so there is one client.

Env:
  AI_GATEWAY_URL — default http://127.0.0.1:8100
  AI_GATEWAY_INTERNAL_KEY — required for cloud completions via gateway
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_GATEWAY_URL = "http://127.0.0.1:8100"


@dataclass
class GatewayCompletion:
    """One completion: the answer text plus the gateway's token counts and LiteLLM cost."""

    text: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    cost_usd: Optional[float] = None
    # Sampling settings LiteLLM left out for this model (a reasoning model takes no
    # temperature), so the run can record that they were not applied
    dropped_params: List[str] = field(default_factory=list)


class GatewayProviderError(RuntimeError):
    """
    The provider refused or failed the call. error_type is LiteLLM's exception class
    (AuthenticationError, NotFoundError, RateLimitError, ...), status_code the provider's.

    str() reads "<error_type> (<status_code>): <message>", which error_detection parses.
    """

    def __init__(self, error_type: str, status_code: Optional[int], message: str):
        self.error_type = error_type
        self.status_code = status_code
        self.message = message
        status = status_code if status_code is not None else "-"
        super().__init__(f"{error_type} ({status}): {message}")


# One rule for whether a rate limit recovers within a run, used by ModelRunner (retry or
# not) and EvalServer's error_detection (stop the run or not). Gemini words both its limits
# as "Quota exceeded ...": per minute adds "per minute. Please retry in 30s" (quotaId
# "...PerMinute..."), daily says "per day" ("...PerDay..."), and a model the key has no
# free-tier access to reads "limit: 0". OpenAI's daily cap is "requests per day (RPD)";
# its used-up quota is "insufficient_quota ... check your plan and billing details".
# Gemini's per-minute 429 also says "check your plan and billing details", so billing
# wording is only final when nothing says the limit is per minute.
_DAILY_LIMIT_WORDS = ("per day", "per_day", "perday")
_NO_ALLOWANCE = re.compile(r"\blimit:\s*0\b")
_USED_UP_WORDS = ("insufficient",)
BILLING_WORDS = ("billing", "credit")
_PER_MINUTE_WORDS = ("per min", "per_min", "permin")
_RETRY_HINT = re.compile(r"retry(?: in|delay\W*)\s*(\d+(?:\.\d+)?)\s*s", re.IGNORECASE)


def retry_hint_seconds(message: str) -> Optional[float]:
    """Seconds from a "retry in 30s" / "retryDelay": "30s" hint, if the provider sent one."""
    match = _RETRY_HINT.search(message)
    return float(match.group(1)) if match else None


def rate_limit_recovers(message: str) -> bool:
    """
    True when a rate-limit message describes a limit that lifts within a run (per minute,
    or the provider says when to retry). A daily limit, a zero allowance, a billing or
    credit limit, or any other quota does not.
    """
    text = message.lower()
    if any(w in text for w in _DAILY_LIMIT_WORDS) or _NO_ALLOWANCE.search(text):
        return False
    if any(w in text for w in _USED_UP_WORDS):
        return False
    if any(w in text for w in _PER_MINUTE_WORDS) or retry_hint_seconds(text) is not None:
        return True
    return not any(w in text for w in BILLING_WORDS) and "quota" not in text


def top_p_to_send(top_p: Optional[float]) -> Optional[float]:
    """top_p is sent only when it narrows sampling: 1 changes nothing (the scorer UI
    always saves 1), and some models refuse it beside temperature. None = don't send."""
    return top_p if top_p is not None and top_p < 1 else None


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


def _int_or_none(value: Any) -> Optional[int]:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _to_completion(payload: Dict[str, Any]) -> GatewayCompletion:
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    cost = payload.get("cost_usd")
    # The gateway reports 0.0 for a model LiteLLM cannot price, so 0 means "unknown"
    priced = isinstance(cost, (int, float)) and not isinstance(cost, bool) and cost > 0
    return GatewayCompletion(
        text=_extract_assistant_text(payload),
        prompt_tokens=_int_or_none(usage.get("prompt_tokens")),
        completion_tokens=_int_or_none(usage.get("completion_tokens")),
        total_tokens=_int_or_none(usage.get("total_tokens")),
        cost_usd=float(cost) if priced else None,
        dropped_params=_dropped_params(payload),
    )


def _dropped_params(payload: Dict[str, Any]) -> List[str]:
    dropped = payload.get("dropped_params")
    return [d for d in dropped if isinstance(d, str)] if isinstance(dropped, list) else []


def _raise_for_error(resp: httpx.Response) -> None:
    """Raise GatewayProviderError for the gateway's typed error, else the HTTP error."""
    if resp.status_code < 400:
        return
    logger.error("Gateway completion failed: %s %s", resp.status_code, (resp.text or "")[:500])
    try:
        error = resp.json().get("error")
    except (ValueError, AttributeError):
        error = None
    if isinstance(error, dict) and isinstance(error.get("type"), str):
        status = error.get("status_code")
        raise GatewayProviderError(
            error["type"],
            status if isinstance(status, int) else None,
            str(error.get("message") or ""),
        )
    resp.raise_for_status()


def _request(
    litellm_model: str,
    messages: List[Dict[str, str]],
    api_key: str,
    max_tokens: int,
    temperature: float,
    top_p: Optional[float] = None,
):
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
    # Anthropic refuses temperature and top_p together; as the direct SDK path did, top_p wins
    if top_p_to_send(top_p) is not None:
        body["top_p"] = top_p
        if litellm_model.startswith("anthropic/"):
            del body["temperature"]
    return url, headers, body


def gateway_completion_sync(
    litellm_model: str,
    messages: List[Dict[str, str]],
    api_key: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    top_p: Optional[float] = None,
    timeout: float = 120.0,
) -> GatewayCompletion:
    """Synchronous chat completion via AI Gateway, with usage and cost."""
    url, headers, body = _request(litellm_model, messages, api_key, max_tokens, temperature, top_p)
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, headers=headers, json=body)
    _raise_for_error(resp)
    return _to_completion(resp.json())


async def gateway_completion_async(
    litellm_model: str,
    messages: List[Dict[str, str]],
    api_key: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    top_p: Optional[float] = None,
    timeout: float = 120.0,
) -> GatewayCompletion:
    """Async chat completion via AI Gateway, with usage and cost."""
    url, headers, body = _request(litellm_model, messages, api_key, max_tokens, temperature, top_p)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=body)
    _raise_for_error(resp)
    return _to_completion(resp.json())


def gateway_chat_completion_sync(
    litellm_model: str,
    messages: List[Dict[str, str]],
    api_key: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    timeout: float = 120.0,
) -> str:
    """Synchronous chat completion via AI Gateway; the answer text only."""
    return gateway_completion_sync(
        litellm_model, messages, api_key, max_tokens=max_tokens, temperature=temperature, timeout=timeout
    ).text


async def gateway_chat_completion_async(
    litellm_model: str,
    messages: List[Dict[str, str]],
    api_key: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    timeout: float = 120.0,
) -> str:
    """Async chat completion via AI Gateway; the answer text only."""
    completion = await gateway_completion_async(
        litellm_model, messages, api_key, max_tokens=max_tokens, temperature=temperature, timeout=timeout
    )
    return completion.text
