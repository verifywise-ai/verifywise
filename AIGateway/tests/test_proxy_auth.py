"""Virtual-key authentication tests for the public proxy (/v1/*).

Self-contained: no live gateway, backend or database. The real
``_extract_virtual_key`` (routers/proxy.py) and the real
``authenticate_virtual_key`` (services/proxy_service.py) — prefix check,
SHA-256 hashing and the DB lookup — run unmocked; only the DB seam
(``services.proxy_service.get_db``) and the downstream pipeline (endpoint
resolution, rate limits, budget, guardrails, provider call, spend logging)
are replaced. These tests fail if the auth check is bypassed.
"""

import hashlib
import os
import sys
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import routers.proxy as proxy_router  # noqa: E402
import services.proxy_service as proxy_service  # noqa: E402

VALID_KEY = "sk-vw-" + "a" * 48
UNKNOWN_KEY = "sk-vw-" + "b" * 48

KEY_ROW = {
    "id": 7,
    "organization_id": 1,
    "name": "org-1-key",
    "allowed_endpoint_ids": None,
    "allowed_models": None,
    "blocked_models": None,
    "allowed_providers": None,
    "blocked_providers": None,
    "max_budget_usd": None,
    "current_spend_usd": 0,
    "rate_limit_rpm": None,
    "is_active": True,
    "revoked_at": None,
    "expires_at": None,
}

ENDPOINT = {
    "id": 5,
    "slug": "org-1-endpoint",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": None,
    "max_tokens": None,
    "system_prompt": None,
    "cache_enabled": False,
    "fallback_endpoint_id": None,
    "decrypted_key": "sk-provider-key",
}

CHAT_BODY = {"model": "org-1-endpoint", "messages": [{"role": "user", "content": "hi"}]}


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def fetchone(self):
        return self._row


class _FakeDB:
    """Records execute() calls and returns one canned row (or None)."""

    def __init__(self, row):
        self.row = row
        self.executed = []

    async def execute(self, _sql, params):
        self.executed.append(params)
        return _FakeResult(self.row)


@pytest.fixture
def db(monkeypatch):
    """Point the real authenticate_virtual_key at a fake DB seam."""
    fake = _FakeDB(KEY_ROW)

    @asynccontextmanager
    async def fake_get_db():
        yield fake

    monkeypatch.setattr(proxy_service, "get_db", fake_get_db)
    return fake


@pytest.fixture
def client(db, monkeypatch):
    """Gateway app with the downstream pipeline mocked, auth fully real."""
    resolve = AsyncMock(return_value=dict(ENDPOINT))
    completion = AsyncMock(
        return_value={
            "choices": [{"message": {"content": "hello"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            "cost_usd": 0.0,
            "model": "gpt-4o-mini",
        }
    )
    monkeypatch.setattr(proxy_router, "get_guardrail_config", AsyncMock(return_value=([], {})))
    monkeypatch.setattr(proxy_router, "resolve_endpoint_for_key", resolve)
    monkeypatch.setattr(proxy_router, "enforce_rate_limits", AsyncMock())
    monkeypatch.setattr(proxy_router, "check_org_budget", AsyncMock(return_value=True))
    monkeypatch.setattr(
        proxy_router, "run_guardrails", AsyncMock(side_effect=lambda org, msgs, eid, config=None: msgs)
    )
    monkeypatch.setattr(proxy_router, "chat_completion", completion)
    monkeypatch.setattr(proxy_router, "log_spend", AsyncMock())
    monkeypatch.setattr(proxy_router, "reconcile_budget", AsyncMock())

    app = FastAPI()
    app.include_router(proxy_router.router)
    return TestClient(app), resolve, completion


def test_missing_authorization_header_gets_401(client):
    response, _, completion = client
    r = response.post("/v1/chat/completions", json=CHAT_BODY)

    assert r.status_code == 401
    assert r.json() == {"detail": "Missing Authorization: Bearer <virtual-key>"}
    completion.assert_not_awaited()


def test_wrong_authorization_scheme_gets_401(client):
    response, _, completion = client
    r = response.post(
        "/v1/chat/completions", json=CHAT_BODY, headers={"Authorization": "Token abc"}
    )

    assert r.status_code == 401
    assert r.json() == {"detail": "Missing Authorization: Bearer <virtual-key>"}
    completion.assert_not_awaited()


def test_malformed_virtual_key_gets_401_without_a_db_lookup(client):
    response, resolve, completion = client
    r = response.post(
        "/v1/chat/completions", json=CHAT_BODY, headers={"Authorization": "Bearer not-a-vw-key"}
    )

    assert r.status_code == 401
    assert r.json() == {"detail": "Invalid virtual key format"}
    resolve.assert_not_awaited()
    completion.assert_not_awaited()


def test_well_formed_but_unknown_virtual_key_gets_401(client, db):
    response, resolve, completion = client
    db.row = None  # DB lookup finds no key row

    r = response.post(
        "/v1/chat/completions", json=CHAT_BODY, headers={"Authorization": f"Bearer {UNKNOWN_KEY}"}
    )

    assert r.status_code == 401
    assert r.json() == {"detail": "Virtual key not found"}
    # The real hash + lookup ran: the query received the SHA-256 of the presented key.
    assert db.executed == [{"key_hash": hashlib.sha256(UNKNOWN_KEY.encode()).hexdigest()}]
    resolve.assert_not_awaited()
    completion.assert_not_awaited()


def test_valid_virtual_key_proceeds_with_the_keys_organization(client, db):
    response, resolve, completion = client

    r = response.post(
        "/v1/chat/completions", json=CHAT_BODY, headers={"Authorization": f"Bearer {VALID_KEY}"}
    )

    assert r.status_code == 200
    assert db.executed == [{"key_hash": hashlib.sha256(VALID_KEY.encode()).hexdigest()}]
    # Endpoint resolution is scoped by the key's organization (1), not the request.
    assert resolve.await_args.args[0] == 1
    assert resolve.await_args.args[1] == "org-1-endpoint"
    completion.assert_awaited_once()


def test_org_a_key_cannot_resolve_an_endpoint_registered_only_for_org_b(client):
    """Cross-tenant: resolution is org-scoped, so another org's slug is a 404."""
    response, resolve, completion = client
    resolve.side_effect = ValueError("Endpoint not found: org-b-endpoint")

    r = response.post(
        "/v1/chat/completions",
        json={"model": "org-b-endpoint", "messages": [{"role": "user", "content": "hi"}]},
        headers={"Authorization": f"Bearer {VALID_KEY}"},
    )

    assert r.status_code == 404
    assert r.json() == {"detail": "Endpoint not found: org-b-endpoint"}
    # The key's org (1) scoped the lookup — nothing from the request can widen it.
    assert resolve.await_args.args[0] == 1
    assert resolve.await_args.args[1] == "org-b-endpoint"
    completion.assert_not_awaited()
