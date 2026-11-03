"""Unit tests for services.llm_service and the proxy router's error mapping.

LiteLLM calls are monkeypatched; the router-level tests pin the stable HTTP
error shape (502 for provider failures regardless of the LiteLLM error type).
"""

import json
import os
import sys
import time
from types import SimpleNamespace

import litellm
import pytest
from fastapi import HTTPException
from fastapi.responses import JSONResponse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import services.llm_service as llm_service  # noqa: E402
import routers.proxy as proxy_router  # noqa: E402
from conftest import FakeResult, FakeSession, make_get_db  # noqa: E402


class FakeModelResponse:
    """Stand-in for litellm's OpenAI-format response object."""

    def __init__(self, hidden_cost=None):
        self.usage = SimpleNamespace(prompt_tokens=10, completion_tokens=20, total_tokens=30)
        self._hidden_params = {} if hidden_cost is None else {"response_cost": hidden_cost}

    def model_dump(self):
        return {
            "id": "chatcmpl-1",
            "model": "gpt-4o",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "hi"}}],
        }


# ─── llm_service.chat_completion ─────────────────────────────────────────────

async def test_chat_completion_success(monkeypatch):
    async def fake_acompletion(**_kwargs):
        return FakeModelResponse()

    monkeypatch.setattr(llm_service.litellm, "acompletion", fake_acompletion)
    monkeypatch.setattr(llm_service.litellm, "completion_cost", lambda **_: 0.00042)

    result = await llm_service.chat_completion("gpt-4o", [{"role": "user", "content": "hi"}], "key")
    assert result["cost_usd"] == 0.00042
    assert result["usage"] == {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
    assert result["choices"][0]["message"]["content"] == "hi"


async def test_chat_completion_falls_back_to_hidden_cost(monkeypatch):
    async def fake_acompletion(**_kwargs):
        return FakeModelResponse(hidden_cost=0.007)

    def boom(**_kwargs):
        raise Exception("model not in cost db")

    monkeypatch.setattr(llm_service.litellm, "acompletion", fake_acompletion)
    monkeypatch.setattr(llm_service.litellm, "completion_cost", boom)

    result = await llm_service.chat_completion("openrouter/x", [], "key")
    assert result["cost_usd"] == 0.007


async def test_chat_completion_nan_cost_becomes_zero(monkeypatch):
    async def fake_acompletion(**_kwargs):
        return FakeModelResponse()

    monkeypatch.setattr(llm_service.litellm, "acompletion", fake_acompletion)
    monkeypatch.setattr(llm_service.litellm, "completion_cost", lambda **_: float("nan"))

    result = await llm_service.chat_completion("unpriced", [], "key")
    assert result["cost_usd"] == 0.0


async def test_chat_completion_passes_fallbacks(monkeypatch):
    captured = {}

    async def fake_acompletion(**kwargs):
        captured.update(kwargs)
        return FakeModelResponse()

    monkeypatch.setattr(llm_service.litellm, "acompletion", fake_acompletion)
    monkeypatch.setattr(llm_service.litellm, "completion_cost", lambda **_: 0.0)

    await llm_service.chat_completion("gpt-4o", [], "key", num_retries=2, fallback_models=["claude-3"], temperature=0.5)
    assert captured["num_retries"] == 2
    assert captured["drop_params"] is True
    assert captured["fallbacks"] == [{"model": "claude-3", "api_key": "key"}]


async def test_chat_completion_provider_errors_propagate(monkeypatch):
    """The service does not swallow provider errors: it wraps them, keeping the original."""

    async def raise_rate_limit(**_kwargs):
        raise litellm.RateLimitError("slow down", llm_provider="openai", model="gpt-4o")

    monkeypatch.setattr(llm_service.litellm, "acompletion", raise_rate_limit)
    with pytest.raises(llm_service.ProviderCallError) as excinfo:
        await llm_service.chat_completion("gpt-4o", [], "key")
    assert isinstance(excinfo.value.cause, litellm.RateLimitError)
    assert excinfo.value.__cause__ is excinfo.value.cause


# ─── Router error mapping: stable shape for provider failures ────────────────

VK = {"id": 1, "organization_id": 7}
ENDPOINT = {"id": 3, "slug": "assist", "provider": "openai", "model": "gpt-4o", "decrypted_key": "k"}


def _patch_common(monkeypatch, session_results=None):
    session = FakeSession(session_results or [])
    monkeypatch.setattr(proxy_router, "log_spend", _noop_coro())
    monkeypatch.setattr(proxy_router, "reconcile_budget", _noop_coro())
    return session


def _noop_coro():
    async def _noop(*_a, **_kw):
        return None
    return _noop


@pytest.mark.parametrize(
    "provider_error",
    [
        litellm.AuthenticationError("bad key", llm_provider="openai", model="gpt-4o"),
        litellm.RateLimitError("slow down", llm_provider="openai", model="gpt-4o"),
        litellm.APIError(500, "provider 500", llm_provider="openai", model="gpt-4o"),
        RuntimeError("connection reset"),
    ],
)
async def test_handle_completion_maps_any_provider_error_to_stable_502(monkeypatch, provider_error):
    """Whatever LiteLLM raises, the client sees one stable error shape."""
    async def failing_completion(**_kwargs):
        raise provider_error

    _patch_common(monkeypatch)
    monkeypatch.setattr(proxy_router, "chat_completion", failing_completion)

    with pytest.raises(HTTPException) as exc_info:
        await proxy_router._handle_completion(
            org_id=7, vk=VK, endpoint=ENDPOINT,
            messages=[{"role": "user", "content": "hi"}], kwargs={},
            estimated_cost=0.0, start_time=time.time(),
        )
    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "LLM provider request failed"


async def test_handle_completion_success_shape(monkeypatch):
    async def ok_completion(**_kwargs):
        return {
            "choices": [{"message": {"role": "assistant", "content": "hi"}}],
            "model": "gpt-4o",
            "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
            "cost_usd": 0.001,
        }

    _patch_common(monkeypatch)
    monkeypatch.setattr(proxy_router, "chat_completion", ok_completion)
    monkeypatch.setattr(proxy_router, "store_in_cache", _noop_coro())

    response = await proxy_router._handle_completion(
        org_id=7, vk=VK, endpoint=ENDPOINT,
        messages=[{"role": "user", "content": "hi"}], kwargs={},
        estimated_cost=0.0, start_time=time.time(), _prompt_hash="abc123",
    )
    assert isinstance(response, JSONResponse)
    assert response.headers["x-vw-cache"] == "MISS"
    body = json.loads(response.body)
    assert body["cost_usd"] == 0.001


async def test_handle_completion_falls_back_and_recovers(monkeypatch):
    calls = {"n": 0}

    async def flaky_completion(model=None, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise litellm.APIConnectionError("down", llm_provider="openai")
        return {
            "choices": [{"message": {"content": "from fallback"}}],
            "model": "claude-3",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            "cost_usd": 0.0,
        }

    _patch_common(monkeypatch)
    fallback_endpoint = {"id": 4, "slug": "backup", "provider": "anthropic", "model": "claude-3", "decrypted_key": "k2"}

    async def resolve_fallback(org_id, endpoint_id):
        return fallback_endpoint

    monkeypatch.setattr(proxy_router, "chat_completion", flaky_completion)
    monkeypatch.setattr(proxy_router, "resolve_endpoint_by_id", resolve_fallback)
    monkeypatch.setattr(proxy_router, "store_in_cache", _noop_coro())

    endpoint_with_fallback = {**ENDPOINT, "fallback_endpoint_id": 4}
    response = await proxy_router._handle_completion(
        org_id=7, vk=VK, endpoint=endpoint_with_fallback,
        messages=[{"role": "user", "content": "hi"}], kwargs={},
        estimated_cost=0.0, start_time=time.time(), _prompt_hash="abc",
    )
    body = json.loads(response.body)
    assert body["choices"][0]["message"]["content"] == "from fallback"
    # Fallback responses must not be cached against the original endpoint.
    assert response.headers["x-vw-cache"] == "DISABLED"


async def test_handle_completion_no_fallback_raises_502(monkeypatch):
    async def failing_completion(**_kwargs):
        raise litellm.APIError("down", llm_provider="openai", model="gpt-4o")

    _patch_common(monkeypatch)

    async def no_fallback(org_id, endpoint_id):
        return None

    monkeypatch.setattr(proxy_router, "chat_completion", failing_completion)
    monkeypatch.setattr(proxy_router, "resolve_endpoint_by_id", no_fallback)

    with pytest.raises(HTTPException) as exc_info:
        await proxy_router._handle_completion(
            org_id=7, vk=VK, endpoint={**ENDPOINT, "fallback_endpoint_id": 4},
            messages=[], kwargs={}, estimated_cost=0.0, start_time=time.time(),
        )
    assert exc_info.value.status_code == 502


# ─── Embeddings router error mapping ─────────────────────────────────────────

async def test_embeddings_maps_provider_error_to_stable_502(monkeypatch, fake_request):
    async def failing_embedding(**_kwargs):
        raise litellm.AuthenticationError("bad key", llm_provider="openai", model="text-embedding-3")

    _patch_common(monkeypatch)
    monkeypatch.setattr(proxy_router, "authenticate_virtual_key", lambda *_a, **_k: _vk())
    monkeypatch.setattr(proxy_router, "resolve_endpoint_for_key", lambda *_a, **_k: _endpoint())
    monkeypatch.setattr(proxy_router, "run_guardrails", lambda *_a, **_k: _messages())
    monkeypatch.setattr(proxy_router, "estimate_prompt_cost", lambda *_a, **_k: 0.0)
    monkeypatch.setattr(proxy_router, "check_org_budget", lambda *_a, **_k: _budget())
    monkeypatch.setattr(proxy_router, "embedding", failing_embedding)

    request = fake_request({"authorization": "Bearer sk-vw-x"})
    body = proxy_router.ProxyEmbeddingRequest(model="embed", input="hello")
    with pytest.raises(HTTPException) as exc_info:
        await proxy_router.proxy_embeddings(request, body)
    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Embedding request failed"


async def _vk():
    return {"id": 1, "organization_id": 7, "allowed_endpoint_ids": None}


async def _endpoint():
    return {"id": 3, "provider": "openai", "model": "text-embedding-3-small", "decrypted_key": "k", "rate_limit_rpm": None}


async def _messages():
    return [{"role": "user", "content": "hello"}]


async def _budget():
    return True
