"""Unit tests for services.cache_service (CRUD and Redis/DB mocked).

Covers tenant/request cache-key isolation, expiry, hit counting, store
guardrails (size + max entries), and cost sanitization at the write boundary.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import services.cache_service as cache_service  # noqa: E402

MESSAGES = [{"role": "user", "content": "hello"}]


# ─── Cache-key isolation (tenants / requests must never share entries) ───────

def test_key_differs_across_models_messages_params():
    base = cache_service.generate_cache_key("gpt-4o", MESSAGES, 0.7, 1000)
    assert cache_service.generate_cache_key("claude-sonnet-4", MESSAGES, 0.7, 1000) != base
    assert cache_service.generate_cache_key("gpt-4o", [{"role": "user", "content": "hellO"}], 0.7, 1000) != base
    assert cache_service.generate_cache_key("gpt-4o", MESSAGES, 0.8, 1000) != base
    assert cache_service.generate_cache_key("gpt-4o", MESSAGES, 0.7, 1001) != base


def test_key_includes_tool_params_and_user_message_name():
    base = cache_service.generate_cache_key("gpt-4o", MESSAGES, 0.7, 1000)
    with_tools = cache_service.generate_cache_key(
        "gpt-4o", MESSAGES, 0.7, 1000,
        tool_params={"tools": [{"type": "function", "function": {"name": "f"}}]},
    )
    assert with_tools != base
    # A tool result's `name` is part of the canonical message, a user message's is not.
    tool_msg = [{"role": "tool", "content": "result", "tool_call_id": "call_1", "name": "get_a"}]
    tool_msg_b = [{"role": "tool", "content": "result", "tool_call_id": "call_1", "name": "get_b"}]
    assert cache_service.generate_cache_key("gpt-4o", tool_msg, None, None) != \
        cache_service.generate_cache_key("gpt-4o", tool_msg_b, None, None)
    user_named = [{"role": "user", "name": "alice", "content": "hi"}]
    user_plain = [{"role": "user", "content": "hi"}]
    assert cache_service.generate_cache_key("gpt-4o", user_named, None, None) == \
        cache_service.generate_cache_key("gpt-4o", user_plain, None, None)


async def test_check_cache_scopes_lookup_to_tenant_and_endpoint(monkeypatch):
    """Same prompt hash, different org/endpoint → separate cache entries."""
    calls = []

    async def fake_get_cached_response(organization_id, endpoint_id, prompt_hash):
        calls.append((organization_id, endpoint_id, prompt_hash))
        return None

    monkeypatch.setattr(cache_service, "get_cached_response", fake_get_cached_response)
    monkeypatch.setattr(cache_service, "increment_hit_count", lambda *_a, **_k: pytest.fail("no hit on miss"))

    prompt_hash = cache_service.generate_cache_key("gpt-4o", MESSAGES, 0.7, 1000)
    assert await cache_service.check_cache(org_a := 1, ep := 10, prompt_hash) is None
    assert await cache_service.check_cache(org_b := 2, ep, prompt_hash) is None
    assert await cache_service.check_cache(org_a, 11, prompt_hash) is None
    assert calls == [(org_a, ep, prompt_hash), (org_b, ep, prompt_hash), (org_a, 11, prompt_hash)]


async def test_check_cache_returns_none_for_expired_entry(monkeypatch):
    expired = {
        "id": 5,
        "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
        "hit_count": 0,
    }

    async def fake_get_cached_response(*_a, **_k):
        return expired

    monkeypatch.setattr(cache_service, "get_cached_response", fake_get_cached_response)
    monkeypatch.setattr(cache_service, "increment_hit_count", lambda *_a, **_k: pytest.fail("expired entry must not count a hit"))

    assert await cache_service.check_cache(1, 10, "abc") is None


async def test_check_cache_hit_returns_entry_and_increments(monkeypatch):
    entry = {
        "id": 7,
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=60),
        "hit_count": 2,
        "response_body": "{}",
    }
    incremented = []

    async def fake_get_cached_response(*_a, **_k):
        return entry

    async def fake_increment(entry_id):
        incremented.append(entry_id)

    monkeypatch.setattr(cache_service, "get_cached_response", fake_get_cached_response)
    monkeypatch.setattr(cache_service, "increment_hit_count", fake_increment)

    result = await cache_service.check_cache(1, 10, "abc")
    assert result is entry
    assert incremented == [7]


# ─── store_in_cache guardrails ────────────────────────────────────────────────

async def _store(monkeypatch, *, response_body="{}", org=1, endpoint=10, cost=0.01, max_entries=50000, count=0):
    stored = []

    async def fake_settings(organization_id):
        return {"cache_global_enabled": True, "cache_max_entries_per_org": max_entries}

    async def fake_count(organization_id):
        return count

    async def fake_store(**kwargs):
        stored.append(kwargs)

    monkeypatch.setattr(cache_service, "get_global_cache_settings", fake_settings)
    monkeypatch.setattr(cache_service, "get_cache_entry_count", fake_count)
    monkeypatch.setattr(cache_service, "store_cached_response", fake_store)

    await cache_service.store_in_cache(
        organization_id=org, endpoint_id=endpoint, prompt_hash="h",
        model="gpt-4o", messages=MESSAGES, response_body=response_body,
        prompt_tokens=1, completion_tokens=1, total_tokens=2,
        cost_usd=cost, ttl_seconds=300,
    )
    return stored


async def test_store_skips_oversized_response(monkeypatch):
    assert await _store(monkeypatch, response_body="x" * 500_001) == []


async def test_store_skips_when_max_entries_reached(monkeypatch):
    assert await _store(monkeypatch, count=50000) == []
    assert len(await _store(monkeypatch, count=49999)) == 1


async def test_store_sanitizes_non_finite_cost(monkeypatch):
    stored_nan = await _store(monkeypatch, cost=float("nan"))
    stored_inf = await _store(monkeypatch, cost=float("inf"))
    stored_neg = await _store(monkeypatch, cost=-5.0)
    assert stored_nan[0]["cost_usd"] == 0.0
    assert stored_inf[0]["cost_usd"] == 0.0
    assert stored_neg[0]["cost_usd"] == 0.0


async def test_store_passes_ttl_and_expiry(monkeypatch):
    stored = await _store(monkeypatch, cost=0.02)
    assert stored[0]["cost_usd"] == 0.02
    assert stored[0]["ttl_seconds"] == 300
    assert stored[0]["expires_at"] > datetime.now(timezone.utc)


async def test_store_failure_is_not_fatal(monkeypatch):
    async def boom(**_kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(cache_service, "get_global_cache_settings", lambda *_a, **_k: _settings())
    monkeypatch.setattr(cache_service, "get_cache_entry_count", lambda *_a, **_k: _count())
    monkeypatch.setattr(cache_service, "store_cached_response", boom)

    async def _settings():
        return {"cache_global_enabled": True, "cache_max_entries_per_org": 50000}

    async def _count():
        return 0

    # Must not raise.
    await cache_service.store_in_cache(
        organization_id=1, endpoint_id=10, prompt_hash="h", model="m",
        messages=MESSAGES, response_body="{}", prompt_tokens=1,
        completion_tokens=1, total_tokens=2, cost_usd=0.01, ttl_seconds=60,
    )
