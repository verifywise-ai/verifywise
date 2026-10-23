"""Unit tests for services.proxy_service.

Database access goes through FakeSession (no Postgres); Redis/rate-limit and
the guardrail scanner are monkeypatched. No live services.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import services.proxy_service as proxy_service  # noqa: E402
import utils.rate_limit as rate_limit  # noqa: E402
from conftest import FakeResult, FakeSession, FakeRedis, make_get_db  # noqa: E402

VK_ROW = {
    "id": 1, "organization_id": 7, "name": "k",
    "allowed_endpoint_ids": None, "allowed_models": None, "blocked_models": None,
    "allowed_providers": None, "blocked_providers": None,
    "max_budget_usd": None, "current_spend_usd": 0.0, "rate_limit_rpm": None,
    "is_active": True, "revoked_at": None, "expires_at": None,
}


def _vk_session(row):
    return FakeSession([FakeResult(row=row)])


# ─── Virtual key authentication ───────────────────────────────────────────────

def test_hash_virtual_key_is_deterministic_sha256():
    assert proxy_service.hash_virtual_key("sk-vw-abc") == proxy_service.hash_virtual_key("sk-vw-abc")
    assert proxy_service.hash_virtual_key("sk-vw-abc") != proxy_service.hash_virtual_key("sk-vw-xyz")
    assert len(proxy_service.hash_virtual_key("sk-vw-abc")) == 64


async def test_authenticate_rejects_wrong_format():
    with pytest.raises(ValueError, match="format"):
        await proxy_service.authenticate_virtual_key("sk-other-123")


async def test_authenticate_not_found(monkeypatch):
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(_vk_session(None)))
    with pytest.raises(ValueError, match="not found"):
        await proxy_service.authenticate_virtual_key("sk-vw-missing")


async def test_authenticate_inactive(monkeypatch):
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(_vk_session({**VK_ROW, "is_active": False})))
    with pytest.raises(ValueError, match="inactive"):
        await proxy_service.authenticate_virtual_key("sk-vw-x")


async def test_authenticate_revoked(monkeypatch):
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(_vk_session({**VK_ROW, "revoked_at": datetime.now(timezone.utc)})))
    with pytest.raises(ValueError, match="revoked"):
        await proxy_service.authenticate_virtual_key("sk-vw-x")


async def test_authenticate_expired(monkeypatch):
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(_vk_session(
        {**VK_ROW, "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}
    )))
    with pytest.raises(ValueError, match="expired"):
        await proxy_service.authenticate_virtual_key("sk-vw-x")


async def test_authenticate_budget_exhausted_is_rejected(monkeypatch):
    """Limit hit → rejection: spend >= max_budget_usd must raise before any LLM call."""
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(_vk_session(
        {**VK_ROW, "max_budget_usd": 10.0, "current_spend_usd": 10.0}
    )))
    with pytest.raises(ValueError, match="budget exhausted"):
        await proxy_service.authenticate_virtual_key("sk-vw-x")


async def test_authenticate_budget_boundary_still_allows(monkeypatch):
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(_vk_session(
        {**VK_ROW, "max_budget_usd": 10.0, "current_spend_usd": 9.99}
    )))
    vk = await proxy_service.authenticate_virtual_key("sk-vw-x")
    assert vk["organization_id"] == 7


async def test_authenticate_happy_path(monkeypatch):
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(_vk_session(VK_ROW)))
    vk = await proxy_service.authenticate_virtual_key("sk-vw-x")
    assert vk["id"] == 1


# ─── Model / provider ACLs ────────────────────────────────────────────────────

ENDPOINT = {"provider": "openai", "model": "gpt-4o"}


def test_acls_no_restrictions_pass():
    proxy_service.enforce_model_provider_acls(VK_ROW, ENDPOINT)  # must not raise


def test_acls_blocked_model_rejected():
    vk = {**VK_ROW, "blocked_models": ["gpt-4o"]}
    with pytest.raises(ValueError, match="blocks model"):
        proxy_service.enforce_model_provider_acls(vk, ENDPOINT)


def test_acls_blocked_model_wildcard():
    vk = {**VK_ROW, "blocked_models": ["gpt-*"]}
    with pytest.raises(ValueError, match="blocks model"):
        proxy_service.enforce_model_provider_acls(vk, ENDPOINT)


def test_acls_allowed_model_excludes_other():
    vk = {**VK_ROW, "allowed_models": ["claude-sonnet-4"]}
    with pytest.raises(ValueError, match="does not allow model"):
        proxy_service.enforce_model_provider_acls(vk, ENDPOINT)


def test_acls_allowed_model_wildcard_passes():
    vk = {**VK_ROW, "allowed_models": ["gpt-*"]}
    proxy_service.enforce_model_provider_acls(vk, ENDPOINT)


def test_acls_blocked_provider_rejected():
    vk = {**VK_ROW, "blocked_providers": ["openai"]}
    with pytest.raises(ValueError, match="blocks provider"):
        proxy_service.enforce_model_provider_acls(vk, ENDPOINT)


def test_acls_allowed_provider_excludes_other():
    vk = {**VK_ROW, "allowed_providers": ["anthropic"]}
    with pytest.raises(ValueError, match="does not allow provider"):
        proxy_service.enforce_model_provider_acls(vk, ENDPOINT)


def test_acls_allowed_and_blocked_combine():
    vk = {**VK_ROW, "allowed_models": ["gpt-*"], "blocked_models": ["gpt-4o"]}
    with pytest.raises(ValueError, match="blocks model"):
        proxy_service.enforce_model_provider_acls(vk, ENDPOINT)


# ─── Org budget enforcement ───────────────────────────────────────────────────

async def test_org_budget_hard_limit_hit_rejects(monkeypatch):
    """UPDATE matches no row and the budget is a hard limit → False."""
    session = FakeSession([
        FakeResult(row=None),                              # UPDATE ... RETURNING id
        FakeResult(row={"is_hard_limit": True}),           # follow-up SELECT
    ])
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(session))
    assert await proxy_service.check_org_budget(7, 5.0) is False
    assert "UPDATE ai_gateway_budgets" in session.queries[0][0]


async def test_org_budget_soft_limit_allows(monkeypatch):
    session = FakeSession([
        FakeResult(row=None),
        FakeResult(row={"is_hard_limit": False}),
    ])
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(session))
    assert await proxy_service.check_org_budget(7, 5.0) is True


async def test_org_budget_update_success_allows(monkeypatch):
    session = FakeSession([FakeResult(row={"id": 99})])
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(session))
    assert await proxy_service.check_org_budget(7, 5.0) is True
    assert session.commits == 1


async def test_org_budget_non_finite_estimate_never_touches_db(monkeypatch):
    """A NaN estimate must not corrupt current_spend_usd (mirror reconcile_budget)."""
    session = FakeSession()
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(session))
    assert await proxy_service.check_org_budget(7, float("nan")) is True
    assert session.queries == []


async def test_org_budget_zero_estimate_short_circuits(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(session))
    assert await proxy_service.check_org_budget(7, 0.0) is True
    assert session.queries == []


async def test_reconcile_budget_ignores_non_finite(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(session))
    await proxy_service.reconcile_budget(7, float("nan"), float("inf"))
    await proxy_service.reconcile_budget(7, 0.0, 0.0)  # adjustment below epsilon
    assert session.queries == []


async def test_reconcile_budget_applies_adjustment(monkeypatch):
    session = FakeSession([FakeResult()])
    monkeypatch.setattr(proxy_service, "get_db", make_get_db(session))
    await proxy_service.reconcile_budget(7, 0.10, 0.05)
    assert len(session.queries) == 1
    assert session.queries[0][1]["adjustment"] == pytest.approx(-0.05)
    assert session.commits == 1


# ─── Rate limiting ────────────────────────────────────────────────────────────

async def test_rate_limit_endpoint_exceeded_raises_429(monkeypatch):
    async def deny(key, rpm):
        return False

    monkeypatch.setattr(proxy_service, "check_rate_limit", deny)
    endpoint = {"id": 3, "rate_limit_rpm": 60}
    with pytest.raises(HTTPException) as exc_info:
        await proxy_service.enforce_rate_limits(endpoint, VK_ROW)
    assert exc_info.value.status_code == 429
    assert "Endpoint rate limit" in exc_info.value.detail


async def test_rate_limit_virtual_key_exceeded_raises_429(monkeypatch):
    calls = []

    async def deny_vk(key, rpm):
        calls.append(key)
        return key != "vk:9"

    monkeypatch.setattr(proxy_service, "check_rate_limit", deny_vk)
    with pytest.raises(HTTPException) as exc_info:
        await proxy_service.enforce_rate_limits({"id": 3, "rate_limit_rpm": 60}, {**VK_ROW, "id": 9, "rate_limit_rpm": 10})
    assert exc_info.value.status_code == 429
    assert "Virtual key rate limit" in exc_info.value.detail


async def test_rate_limit_passes_when_under_limit(monkeypatch):
    async def allow(key, rpm):
        return True

    monkeypatch.setattr(proxy_service, "check_rate_limit", allow)
    await proxy_service.enforce_rate_limits(
        {"id": 3, "rate_limit_rpm": 60}, {**VK_ROW, "id": 9, "rate_limit_rpm": 10}
    )


async def test_rate_limit_unlimited_endpoint_skips_redis(monkeypatch):
    async def boom(key, rpm):
        raise AssertionError("Redis must not be consulted when no limit is set")

    monkeypatch.setattr(proxy_service, "check_rate_limit", boom)
    await proxy_service.enforce_rate_limits({"id": 3, "rate_limit_rpm": None}, VK_ROW)


async def test_check_rate_limit_window_blocks_after_rpm_requests(monkeypatch):
    fake_redis = FakeRedis()

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(rate_limit, "get_redis", fake_get_redis)

    for _ in range(3):
        assert await rate_limit.check_rate_limit("ep:1", 3) is True
    # Fourth request inside the same 60s window exceeds rpm=3.
    assert await rate_limit.check_rate_limit("ep:1", 3) is False


async def test_check_rate_limit_zero_or_negative_always_allows(monkeypatch):
    async def boom():
        raise AssertionError("Redis must not be consulted for rpm<=0")

    monkeypatch.setattr(rate_limit, "get_redis", boom)
    assert await rate_limit.check_rate_limit("ep:1", 0) is True
    assert await rate_limit.check_rate_limit("ep:1", -5) is True


async def test_check_rate_limit_fails_open_on_redis_error(monkeypatch):
    async def boom():
        raise ConnectionError("redis down")

    monkeypatch.setattr(rate_limit, "get_redis", boom)
    assert await rate_limit.check_rate_limit("ep:1", 10) is True


# ─── Guardrail orchestration (run_guardrails) ────────────────────────────────

RULES = [
    {"id": 1, "guardrail_type": "content_filter", "name": "codename",
     "config": {"type": "keyword", "pattern": "bluebird"}, "action": "block", "is_active": True},
]
SETTINGS = {}


async def test_run_guardrails_no_rules_returns_messages_unchanged(monkeypatch):
    monkeypatch.setattr(proxy_service, "_log_guardrail_detection", lambda **_k: pytest.fail("no rules, no logging"))
    messages = [{"role": "user", "content": "bluebird"}]
    assert await proxy_service.run_guardrails(7, messages, 3, config=([], {})) is messages


async def test_run_guardrails_block_raises_400(monkeypatch):
    from services.guardrail_service import ScanResult, Detection

    result = ScanResult(
        blocked=True,
        block_reason="content_filter: codename detected",
        detections=[Detection(guardrail_id=1, guardrail_type="content_filter",
                              entity_type="codename", action="block",
                              matched_text="bluebird", start=0, end=8)],
        execution_time_ms=3,
    )
    monkeypatch.setattr(proxy_service, "scan_text_async", lambda **_k: _result(result))
    logged = []
    monkeypatch.setattr(proxy_service, "_log_guardrail_detection", _logged(logged))

    with pytest.raises(HTTPException) as exc_info:
        await proxy_service.run_guardrails(7, [{"role": "user", "content": "bluebird"}], 3, config=(RULES, SETTINGS))
    assert exc_info.value.status_code == 400
    assert "guardrail" in exc_info.value.detail
    assert logged and logged[0]["action_taken"] == "blocked"


async def _result(value):
    return value


async def _noop(**_kw):
    return None


def _logged(bucket):
    async def _log(**kw):
        bucket.append(kw)
    return _log


async def test_run_guardrails_mask_rewrites_content(monkeypatch):
    from services.guardrail_service import ScanResult

    masked = ScanResult(blocked=False, masked_text="<REDACTED>")
    monkeypatch.setattr(proxy_service, "scan_text_async", lambda **_k: _result(masked))
    monkeypatch.setattr(proxy_service, "_log_guardrail_detection", _noop)

    messages = [
        {"role": "user", "content": "see TCK-1"},
        {"role": "assistant", "content": "ok"},  # assistant turns pass through
    ]
    updated = await proxy_service.run_guardrails(7, messages, 3, config=(RULES, SETTINGS))
    assert updated[0]["content"] == "<REDACTED>"
    assert updated[1]["content"] == "ok"
    assert messages[0]["content"] == "see TCK-1"  # original not mutated


async def test_run_guardrails_scans_text_parts_of_list_content(monkeypatch):
    from services.guardrail_service import ScanResult

    masked = ScanResult(blocked=False, masked_text="clean")
    monkeypatch.setattr(proxy_service, "scan_text_async", lambda **_k: _result(masked))
    monkeypatch.setattr(proxy_service, "_log_guardrail_detection", _noop)

    messages = [{"role": "user", "content": [
        {"type": "text", "text": "dirty"},
        {"type": "image_url", "image_url": {"url": "data:..."}},  # non-text part untouched
    ]}]
    updated = await proxy_service.run_guardrails(7, messages, 3, config=(RULES, SETTINGS))
    assert updated[0]["content"][0]["text"] == "clean"
    assert updated[0]["content"][1]["type"] == "image_url"


async def test_run_guardrails_clean_text_passes_through(monkeypatch):
    from services.guardrail_service import ScanResult

    monkeypatch.setattr(proxy_service, "scan_text_async", lambda **_k: _result(ScanResult()))
    monkeypatch.setattr(proxy_service, "_log_guardrail_detection", _noop)

    messages = [{"role": "user", "content": "totally fine"}]
    updated = await proxy_service.run_guardrails(7, messages, 3, config=(RULES, SETTINGS))
    assert updated[0]["content"] == "totally fine"
