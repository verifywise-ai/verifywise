"""
Tests for EvalServer's gateway_litellm_client.

This is the highest-priority test file in the suite: a single parametrized run of
to_litellm_model would have caught the OpenRouter "/" prefix bug that broke the
cyberpros experiment. Every entry in the table below corresponds to a real
production case the runner has to handle.
"""

from __future__ import annotations

from typing import Any, Dict
from unittest.mock import patch

import httpx
import pytest
import respx

from utils.gateway_litellm_client import (
    _extract_assistant_text,
    gateway_chat_completion_async,
    gateway_chat_completion_sync,
    gateway_mode_enabled,
    to_litellm_model,
)


# --------------------------------------------------------------------------- #
# to_litellm_model — full provider × model-shape matrix                       #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "provider,model,expected",
    [
        # OpenRouter — the bug we just fixed (must come BEFORE the "/" shortcut)
        ("openrouter", "meta-llama/llama-3.1-70b-instruct", "openrouter/meta-llama/llama-3.1-70b-instruct"),
        ("openrouter", "openrouter/meta-llama/llama-3.1-70b-instruct", "openrouter/meta-llama/llama-3.1-70b-instruct"),
        ("openrouter", "anthropic/claude-3-opus", "openrouter/anthropic/claude-3-opus"),
        ("openrouter", "gpt-4o", "openrouter/gpt-4o"),
        # Google / Gemini alias — both provider names accepted
        ("google", "gemini-1.5-pro", "gemini/gemini-1.5-pro"),
        ("google", "gemini/gemini-1.5-pro", "gemini/gemini-1.5-pro"),
        ("google", "google/gemini-1.5-pro", "google/gemini-1.5-pro"),
        ("gemini", "gemini-flash", "gemini/gemini-flash"),
        # Anthropic
        ("anthropic", "claude-3-5-sonnet", "anthropic/claude-3-5-sonnet"),
        ("anthropic", "anthropic/claude-3-5-sonnet", "anthropic/claude-3-5-sonnet"),
        # Mistral
        ("mistral", "mistral-large", "mistral/mistral-large"),
        ("mistral", "mistral/mistral-medium", "mistral/mistral-medium"),
        # xAI
        ("xai", "grok-beta", "xai/grok-beta"),
        ("xai", "xai/grok-2", "xai/grok-2"),
        # HuggingFace — namespaced models go through the "/" shortcut UNLESS prefix missing
        # NOTE: production code returns the model unchanged here (the "/" shortcut
        # fires before the huggingface branch). This documents the actual behaviour.
        ("huggingface", "TinyLlama/TinyLlama-1.1B", "TinyLlama/TinyLlama-1.1B"),
        ("huggingface", "tinyllama-1.1b", "huggingface/tinyllama-1.1b"),
        # OpenAI — never gets a prefix; "/"-containing strings are passed through
        ("openai", "gpt-4o", "gpt-4o"),
        ("openai", "ft:gpt-4/my-fine-tune", "ft:gpt-4/my-fine-tune"),
        # Provider casing / whitespace
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


def test_to_litellm_model_unknown_provider_passes_through() -> None:
    """Unknown providers fall through to the default branch and return the model unchanged."""
    assert to_litellm_model("not-a-real-provider", "some-model") == "some-model"


def test_to_litellm_model_empty_provider_passes_through() -> None:
    assert to_litellm_model("", "gpt-4o") == "gpt-4o"


# --------------------------------------------------------------------------- #
# gateway_mode_enabled                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "value,expected",
    [
        (None, False),  # absent
        ("", False),
        ("   ", False),
        ("changeme", False),
        ("CHANGEME", False),
        ("change-me", False),
        ("your-secret-key", False),
        ("secret", False),
        ("sk-real-key-12345", True),
        ("anything-else", True),
    ],
)
def test_gateway_mode_enabled(monkeypatch: pytest.MonkeyPatch, value: Any, expected: bool) -> None:
    if value is None:
        monkeypatch.delenv("AI_GATEWAY_INTERNAL_KEY", raising=False)
    else:
        monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", value)
    assert gateway_mode_enabled() is expected


# --------------------------------------------------------------------------- #
# gateway_chat_completion_sync / async                                         #
# --------------------------------------------------------------------------- #


GATEWAY_URL = "http://gateway.test:8100"
COMPLETIONS_URL = f"{GATEWAY_URL}/internal/v1/chat/completions"


@respx.mock
def test_gateway_chat_completion_sync_happy_path(
    gateway_env: str,
    mock_gateway_response_factory,
) -> None:
    route = respx.post(COMPLETIONS_URL).mock(
        return_value=httpx.Response(200, json=mock_gateway_response_factory("hello")),
    )

    result = gateway_chat_completion_sync(
        litellm_model="openrouter/meta-llama/llama-3.1-70b-instruct",
        messages=[{"role": "user", "content": "hi"}],
        api_key="sk-provider-x",
        max_tokens=42,
        temperature=0.1,
    )

    assert result == "hello"
    assert route.called
    request = route.calls.last.request
    assert request.headers["x-internal-key"] == gateway_env
    assert request.headers["x-provider-key"] == "sk-provider-x"
    body = request.read()
    assert b"openrouter/meta-llama/llama-3.1-70b-instruct" in body
    assert b'"max_tokens":42' in body or b'"max_tokens": 42' in body


@respx.mock
def test_gateway_chat_completion_sync_non_200_raises(gateway_env: str) -> None:
    respx.post(COMPLETIONS_URL).mock(
        return_value=httpx.Response(500, json={"error": "boom"}),
    )
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


@pytest.mark.asyncio
@respx.mock
async def test_gateway_chat_completion_async_happy_path(
    gateway_env: str,
    mock_gateway_response_factory,
) -> None:
    respx.post(COMPLETIONS_URL).mock(
        return_value=httpx.Response(200, json=mock_gateway_response_factory("async ok")),
    )
    out = await gateway_chat_completion_async(
        litellm_model="anthropic/claude-3",
        messages=[{"role": "user", "content": "hi"}],
        api_key="sk-anth",
    )
    assert out == "async ok"


# --------------------------------------------------------------------------- #
# _extract_assistant_text — robust to multiple shapes                          #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({}, ""),
        ({"choices": []}, ""),
        ({"choices": [{}]}, ""),
        ({"choices": [{"message": {"content": "  hi  "}}]}, "hi"),
        ({"choices": [{"message": {"content": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]}}]}, "ab"),
        ({"choices": [{"message": {"content": ["x", "y"]}}]}, "xy"),
        ({"choices": [{"message": {"content": None}}]}, ""),
    ],
)
def test_extract_assistant_text_shapes(payload: Dict[str, Any], expected: str) -> None:
    assert _extract_assistant_text(payload) == expected
