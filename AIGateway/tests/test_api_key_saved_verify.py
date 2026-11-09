"""API keys router: live verification of a saved key and Gemini's 400 for a bad key.

No live services: the key row and the provider's models endpoint are fakes."""

import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import urlparse

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx
import pytest
from fastapi import HTTPException

import routers.api_keys as router
from utils.encryption import encrypt

pytestmark = pytest.mark.asyncio

GEMINI_BAD_KEY = (
    '{"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", '
    '"status": "INVALID_ARGUMENT", "details": [{"reason": "API_KEY_INVALID"}]}}'
)


def _request(role="Editor"):
    return SimpleNamespace(state=SimpleNamespace(organization_id=1, user_id=7, role=role))


def _provider_replies(monkeypatch, status, body="{}"):
    """Route every outbound provider call to a fixed reply; return the URLs called."""
    seen = []

    def handler(req):
        seen.append(str(req.url))
        return httpx.Response(status, text=body)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        router.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    return seen


def _saved_key(monkeypatch, row):
    lookup = AsyncMock(return_value=row)
    monkeypatch.setattr(router, "get_api_key_by_id", lookup)
    return lookup


async def test_gemini_400_api_key_invalid_is_a_rejected_key(monkeypatch):
    _provider_replies(monkeypatch, 400, GEMINI_BAD_KEY)
    result = await router._check_provider_key("gemini", "AIza-dead")
    assert result["valid"] is False


async def test_other_provider_400_is_not_read_as_a_rejected_key(monkeypatch):
    _provider_replies(monkeypatch, 400, '{"error": "bad request"}')
    result = await router._check_provider_key("openai", "sk-test")
    assert result["valid"] is True


async def test_gemini_200_is_valid(monkeypatch):
    _provider_replies(monkeypatch, 200)
    assert (await router._check_provider_key("gemini", "AIza-good"))["valid"] is True


async def test_saved_key_is_checked_with_the_decrypted_secret(monkeypatch):
    seen = _provider_replies(monkeypatch, 400, GEMINI_BAD_KEY)
    lookup = _saved_key(
        monkeypatch, {"id": 6, "provider": "gemini", "encrypted_key": encrypt("AIza-dead")}
    )

    res = await router.verify_saved_api_key(6, _request())

    lookup.assert_awaited_once_with(1, 6)
    assert seen and "key=AIza-dead" in seen[0]
    assert res == {"data": {"valid": False, "message": "Invalid API key — authentication failed"}}
    assert "AIza" not in str(res)


async def test_saved_key_of_another_org_is_not_found(monkeypatch):
    _saved_key(monkeypatch, None)
    with pytest.raises(HTTPException) as exc:
        await router.verify_saved_api_key(99, _request())
    assert exc.value.status_code == 404


async def test_saved_key_check_is_closed_to_read_only_roles(monkeypatch):
    lookup = _saved_key(monkeypatch, {"id": 6, "provider": "gemini", "encrypted_key": "x"})
    with pytest.raises(HTTPException) as exc:
        await router.verify_saved_api_key(6, _request(role="Auditor"))
    assert exc.value.status_code == 403
    lookup.assert_not_awaited()


async def test_saved_key_403_is_not_read_as_a_rejected_key(monkeypatch):
    # e.g. an OpenAI restricted key that can call chat but not list models
    _provider_replies(monkeypatch, 403, '{"error": "insufficient permissions"}')
    _saved_key(monkeypatch, {"id": 3, "provider": "openai", "encrypted_key": encrypt("sk-restricted")})
    res = await router.verify_saved_api_key(3, _request())
    assert res["data"]["valid"] is True


@pytest.mark.parametrize(
    "body",
    [
        '{"error": {"message": "Your API key was reported as leaked. Please use another API key.", '
        '"status": "PERMISSION_DENIED"}}',
        '{"error": {"status": "PERMISSION_DENIED", "details": [{"reason": "SERVICE_DISABLED"}]}}',
        '{"error": {"status": "PERMISSION_DENIED", "details": [{"reason": "API_KEY_SERVICE_BLOCKED"}]}}',
        '{"error": {"status": "PERMISSION_DENIED", "details": 5}}',
    ],
    ids=["leaked", "api-disabled", "blocked", "malformed-details"],
)
async def test_saved_gemini_key_403_is_a_rejected_key(monkeypatch, body):
    # Gemini answers a leaked, blocked or API-disabled key with 403
    _provider_replies(monkeypatch, 403, body)
    _saved_key(monkeypatch, {"id": 6, "provider": "gemini", "encrypted_key": encrypt("AIza-blocked")})
    res = await router.verify_saved_api_key(6, _request())
    assert res["data"]["valid"] is False


@pytest.mark.parametrize(
    "body",
    ["<html><body>403 Forbidden</body></html>", '{"error": "PERMISSION_DENIED by egress policy"}'],
    ids=["html-page", "proxy-json"],
)
async def test_saved_gemini_key_403_from_a_proxy_is_not_a_rejected_key(monkeypatch, body):
    # An egress proxy or firewall in front of Google answers with its own body
    _provider_replies(monkeypatch, 403, body)
    _saved_key(monkeypatch, {"id": 6, "provider": "gemini", "encrypted_key": encrypt("AIza-ok")})
    res = await router.verify_saved_api_key(6, _request())
    assert res["data"]["valid"] is True


async def test_saved_key_403_for_permissions_is_not_a_rejected_key(monkeypatch):
    _provider_replies(monkeypatch, 403, '{"type": "error", "error": {"type": "permission_error"}}')
    _saved_key(monkeypatch, {"id": 4, "provider": "anthropic", "encrypted_key": encrypt("sk-ant")})
    res = await router.verify_saved_api_key(4, _request())
    assert res["data"]["valid"] is True


async def test_saved_key_401_is_a_rejected_key(monkeypatch):
    _provider_replies(monkeypatch, 401)
    _saved_key(monkeypatch, {"id": 3, "provider": "openai", "encrypted_key": encrypt("sk-dead")})
    res = await router.verify_saved_api_key(3, _request())
    assert res["data"]["valid"] is False


async def test_manual_check_still_reads_403_as_rejected(monkeypatch):
    _provider_replies(monkeypatch, 403)
    assert (await router._check_provider_key("openai", "sk-test"))["valid"] is False


async def test_saved_key_that_cannot_be_decrypted_is_not_valid(monkeypatch):
    seen = _provider_replies(monkeypatch, 200)
    _saved_key(monkeypatch, {"id": 6, "provider": "gemini", "encrypted_key": "not:encrypted:text"})
    res = await router.verify_saved_api_key(6, _request())
    assert res == {"data": {"valid": False, "message": "Stored key cannot be read"}}
    assert seen == []


async def test_saved_key_provider_name_is_normalised(monkeypatch):
    seen = _provider_replies(monkeypatch, 400, GEMINI_BAD_KEY)
    _saved_key(monkeypatch, {"id": 6, "provider": "Google", "encrypted_key": encrypt("AIza-dead")})
    res = await router.verify_saved_api_key(6, _request())
    assert seen and urlparse(seen[0]).hostname == "generativelanguage.googleapis.com"
    assert res["data"]["valid"] is False
