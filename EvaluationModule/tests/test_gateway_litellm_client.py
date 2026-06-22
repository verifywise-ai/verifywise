"""
Tests for the EvaluationModule copy of gateway_litellm_client.

EvaluationModule has its own gateway client (mirrors EvalServer's). The
parametrized matrix below MUST match the EvalServer table to keep the two
copies in lock-step; if a future contributor changes one, this duplicate
breaks immediately.
"""

from __future__ import annotations

from typing import Any, Dict

import httpx
import pytest
import respx

from deepeval_engine.gateway_litellm_client import (
    _extract_assistant_text,
    gateway_chat_completion_sync,
    gateway_mode_enabled,
    to_litellm_model,
)


@pytest.mark.parametrize(
    "provider,model,expected",
    [
        ("openrouter", "meta-llama/llama-3.1-70b-instruct", "openrouter/meta-llama/llama-3.1-70b-instruct"),
        ("openrouter", "openrouter/meta-llama/llama-3.1-70b-instruct", "openrouter/meta-llama/llama-3.1-70b-instruct"),
        ("openrouter", "anthropic/claude-3-opus", "openrouter/anthropic/claude-3-opus"),
        ("openrouter", "gpt-4o", "openrouter/gpt-4o"),
        ("google", "gemini-1.5-pro", "gemini/gemini-1.5-pro"),
        ("google", "gemini/gemini-1.5-pro", "gemini/gemini-1.5-pro"),
        ("google", "google/gemini-1.5-pro", "google/gemini-1.5-pro"),
        ("gemini", "gemini-flash", "gemini/gemini-flash"),
        ("anthropic", "claude-3-5-sonnet", "anthropic/claude-3-5-sonnet"),
        ("anthropic", "anthropic/claude-3-5-sonnet", "anthropic/claude-3-5-sonnet"),
        ("mistral", "mistral-large", "mistral/mistral-large"),
        ("mistral", "mistral/mistral-medium", "mistral/mistral-medium"),
        ("xai", "grok-beta", "xai/grok-beta"),
        ("xai", "xai/grok-2", "xai/grok-2"),
        ("huggingface", "TinyLlama/TinyLlama-1.1B", "TinyLlama/TinyLlama-1.1B"),
        ("huggingface", "tinyllama-1.1b", "huggingface/tinyllama-1.1b"),
        ("openai", "gpt-4o", "gpt-4o"),
        ("openai", "ft:gpt-4/my-fine-tune", "ft:gpt-4/my-fine-tune"),
        ("OpenRouter", "  meta-llama/x  ", "openrouter/meta-llama/x"),
        ("  ANTHROPIC  ", "claude-3", "anthropic/claude-3"),
    ],
    ids=lambda p: str(p)[:60],
)
def test_to_litellm_model_full_matrix(provider: str, model: str, expected: str) -> None:
    assert to_litellm_model(provider, model) == expected


@pytest.mark.parametrize("model", ["", "   ", None])
def test_to_litellm_model_rejects_empty(model: Any) -> None:
    with pytest.raises(ValueError, match="model name is required"):
        to_litellm_model("openai", model)


@pytest.mark.parametrize(
    "value,expected",
    [
        (None, False),
        ("", False),
        ("changeme", False),
        ("change-me", False),
        ("your-secret-key", False),
        ("secret", False),
        ("sk-real-key-12345", True),
    ],
)
def test_gateway_mode_enabled(monkeypatch: pytest.MonkeyPatch, value: Any, expected: bool) -> None:
    if value is None:
        monkeypatch.delenv("AI_GATEWAY_INTERNAL_KEY", raising=False)
    else:
        monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", value)
    assert gateway_mode_enabled() is expected


GATEWAY_URL = "http://gateway.test:8100"
COMPLETIONS_URL = f"{GATEWAY_URL}/internal/v1/chat/completions"


@respx.mock
def test_gateway_chat_completion_sync_forwards_headers_and_model(
    gateway_env: str,
    mock_gateway_response_factory,
) -> None:
    route = respx.post(COMPLETIONS_URL).mock(
        return_value=httpx.Response(200, json=mock_gateway_response_factory("ok")),
    )
    result = gateway_chat_completion_sync(
        litellm_model="openrouter/meta-llama/llama-3.1-70b-instruct",
        messages=[{"role": "user", "content": "hi"}],
        api_key="sk-or-v1-fake",
    )
    assert result == "ok"
    request = route.calls.last.request
    assert request.headers["x-internal-key"] == gateway_env
    assert request.headers["x-provider-key"] == "sk-or-v1-fake"
    assert b"openrouter/meta-llama/llama-3.1-70b-instruct" in request.read()


@respx.mock
def test_gateway_chat_completion_sync_non_200_raises(gateway_env: str) -> None:
    respx.post(COMPLETIONS_URL).mock(return_value=httpx.Response(429, json={"error": "rate"}))
    with pytest.raises(httpx.HTTPStatusError):
        gateway_chat_completion_sync(
            litellm_model="gpt-4o",
            messages=[{"role": "user", "content": "x"}],
            api_key="sk",
        )


def test_gateway_chat_completion_sync_requires_internal_key(disable_gateway_env: None) -> None:
    with pytest.raises(RuntimeError, match="AI_GATEWAY_INTERNAL_KEY is not set"):
        gateway_chat_completion_sync(
            litellm_model="gpt-4o",
            messages=[{"role": "user", "content": "x"}],
            api_key="sk",
        )


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({}, ""),
        ({"choices": []}, ""),
        ({"choices": [{"message": {"content": "  hi  "}}]}, "hi"),
        ({"choices": [{"message": {"content": [{"type": "text", "text": "ab"}]}}]}, "ab"),
    ],
)
def test_extract_assistant_text(payload: Dict[str, Any], expected: str) -> None:
    assert _extract_assistant_text(payload) == expected
