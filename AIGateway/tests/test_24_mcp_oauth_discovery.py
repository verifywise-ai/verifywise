"""OAuth token URL discovery (RFC 9728 -> RFC 8414 / OIDC) and its route.

No network: httpx.MockTransport answers every request."""

import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx
import pytest
from fastapi import HTTPException

import routers.mcp_servers as router
from services import mcp_oauth_discovery as disco
from services.mcp_oauth_discovery import OAuthDiscoveryError, discover_token_endpoint

pytestmark = pytest.mark.asyncio

SERVER = "https://mcp.example.com/mcp"
NOT_FOUND = "Couldn't find the token URL from this server address. Enter it by hand."


def _transport(routes, seen=None):
    """routes: {(METHOD, url): httpx.Response | dict}. Anything else is 404."""

    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append((request.method, str(request.url)))
        hit = routes.get((request.method, str(request.url)))
        if hit is None:
            return httpx.Response(404)
        return hit if isinstance(hit, httpx.Response) else httpx.Response(200, json=hit)

    return httpx.MockTransport(handler)


async def test_resource_metadata_from_www_authenticate():
    prm = "https://mcp.example.com/.well-known/oauth-protected-resource/mcp"
    transport = _transport({
        ("POST", SERVER): httpx.Response(401, headers={"WWW-Authenticate": f'Bearer resource_metadata="{prm}"'}),
        ("GET", prm): {"authorization_servers": ["https://auth.example.com"]},
        ("GET", "https://auth.example.com/.well-known/oauth-authorization-server"): {
            "issuer": "https://auth.example.com",
            "token_endpoint": "https://auth.example.com/oauth/token",
        },
    })
    result = await discover_token_endpoint(SERVER, transport=transport)
    assert result == {
        "token_url": "https://auth.example.com/oauth/token",
        "auth_method": "client_secret_basic",
        "issuer": "https://auth.example.com",
    }


async def test_well_known_fallback_paths():
    transport = _transport({
        ("POST", SERVER): httpx.Response(200, json={}),
        ("GET", "https://mcp.example.com/.well-known/oauth-protected-resource"): {
            "authorization_servers": ["https://auth.example.com"]
        },
        ("GET", "https://auth.example.com/.well-known/oauth-authorization-server"): {
            "token_endpoint": "https://auth.example.com/token"
        },
    })
    result = await discover_token_endpoint(SERVER, transport=transport)
    assert result["token_url"] == "https://auth.example.com/token"


async def test_oidc_fallback_for_cognito():
    issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc"
    seen = []
    transport = _transport({
        ("GET", "https://mcp.example.com/.well-known/oauth-protected-resource/mcp"): {"authorization_servers": [issuer]},
        ("GET", f"{issuer}/.well-known/openid-configuration"): {
            "token_endpoint": "https://pool.auth.us-east-1.amazoncognito.com/oauth2/token"
        },
    }, seen)
    result = await discover_token_endpoint(SERVER, transport=transport)
    assert result["token_url"] == "https://pool.auth.us-east-1.amazoncognito.com/oauth2/token"
    assert result["issuer"] == issuer
    urls = [u for _, u in seen]
    path_insertion = "https://cognito-idp.us-east-1.amazonaws.com/.well-known/oauth-authorization-server/us-east-1_abc"
    assert urls.index(path_insertion) < urls.index(f"{issuer}/.well-known/openid-configuration")


async def test_auth_method_post_when_basic_unsupported():
    def routes(methods):
        meta = {"token_endpoint": "https://auth.example.com/token"}
        if methods is not None:
            meta["token_endpoint_auth_methods_supported"] = methods
        return _transport({
            ("GET", "https://mcp.example.com/.well-known/oauth-protected-resource/mcp"): {
                "authorization_servers": ["https://auth.example.com"]
            },
            ("GET", "https://auth.example.com/.well-known/oauth-authorization-server"): meta,
        })

    assert (await discover_token_endpoint(SERVER, transport=routes(["client_secret_post"])))["auth_method"] == "client_secret_post"
    assert (await discover_token_endpoint(SERVER, transport=routes(["client_secret_basic", "client_secret_post"])))["auth_method"] == "client_secret_basic"
    assert (await discover_token_endpoint(SERVER, transport=routes(None)))["auth_method"] == "client_secret_basic"


async def test_discovered_internal_url_rejected():
    seen = []
    transport = _transport({
        ("GET", "https://mcp.example.com/.well-known/oauth-protected-resource/mcp"): {
            "authorization_servers": ["http://169.254.169.254"]
        },
    }, seen)
    with pytest.raises(OAuthDiscoveryError):
        await discover_token_endpoint(SERVER, transport=transport)
    assert not any("169.254.169.254" in u for _, u in seen)


async def test_unsafe_token_endpoint_rejected():
    transport = _transport({
        ("GET", "https://mcp.example.com/.well-known/oauth-protected-resource/mcp"): {
            "authorization_servers": ["https://auth.example.com"]
        },
        ("GET", "https://auth.example.com/.well-known/oauth-authorization-server"): {
            "token_endpoint": "http://169.254.169.254/token"
        },
    })
    with pytest.raises(OAuthDiscoveryError):
        await discover_token_endpoint(SERVER, transport=transport)


async def test_nothing_found_message():
    with pytest.raises(OAuthDiscoveryError) as exc:
        await discover_token_endpoint(SERVER, transport=_transport({}))
    assert str(exc.value) == NOT_FOUND


async def test_redirects_are_not_followed():
    seen = []
    transport = _transport({
        ("GET", "https://mcp.example.com/.well-known/oauth-protected-resource/mcp"): httpx.Response(
            302, headers={"Location": "http://169.254.169.254/x"}
        ),
    }, seen)
    with pytest.raises(OAuthDiscoveryError):
        await discover_token_endpoint(SERVER, transport=transport)
    assert not any("169.254.169.254" in u for _, u in seen)


async def test_timeout_message():
    import asyncio

    async def slow(request):
        await asyncio.sleep(1)
        return httpx.Response(200, json={})

    with pytest.raises(OAuthDiscoveryError) as exc:
        await discover_token_endpoint(SERVER, transport=httpx.MockTransport(slow), budget_seconds=0.05)
    assert str(exc.value) == "The server did not respond within 0.05 seconds"


async def test_unsafe_server_url_rejected():
    with pytest.raises(OAuthDiscoveryError):
        await discover_token_endpoint("http://169.254.169.254/mcp", transport=_transport({}))


def _request(body=None, role="Admin"):
    return SimpleNamespace(
        state=SimpleNamespace(organization_id=1, user_id=7, role=role),
        json=AsyncMock(return_value=body or {}),
    )


async def test_route_requires_admin(monkeypatch):
    monkeypatch.setattr(router, "discover_token_endpoint", AsyncMock())
    with pytest.raises(HTTPException) as exc:
        await router.discover_oauth(_request({"url": SERVER}, role="Editor"))
    assert exc.value.status_code == 403
    router.discover_token_endpoint.assert_not_called()


async def test_route_success(monkeypatch):
    found = {"token_url": "https://a/t", "auth_method": "client_secret_basic", "issuer": "https://a"}
    fake = AsyncMock(return_value=found)
    monkeypatch.setattr(router, "discover_token_endpoint", fake)
    assert await router.discover_oauth(_request({"url": SERVER})) == found
    assert fake.call_args.args[0] == SERVER


async def test_route_failure_is_400(monkeypatch):
    monkeypatch.setattr(router, "discover_token_endpoint", AsyncMock(side_effect=OAuthDiscoveryError(NOT_FOUND)))
    with pytest.raises(HTTPException) as exc:
        await router.discover_oauth(_request({"url": SERVER}))
    assert exc.value.status_code == 400
    assert exc.value.detail == NOT_FOUND


async def test_route_missing_url_is_400(monkeypatch):
    monkeypatch.setattr(router, "discover_token_endpoint", AsyncMock())
    with pytest.raises(HTTPException) as exc:
        await router.discover_oauth(_request({}))
    assert exc.value.status_code == 400


async def test_route_declared_before_server_id_routes():
    paths = [r.path for r in router.router.routes]
    assert paths.index("/mcp/servers/discover-oauth") < paths.index("/mcp/servers/{server_id}")
