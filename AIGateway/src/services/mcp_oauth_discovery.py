"""Find an MCP server's OAuth token URL.

Runs only from the server form, never on save: the Admin sees the token URL
before any client secret is sent to it. Steps (see the design spec):

1. Protected-resource metadata (RFC 9728): the ``resource_metadata`` URL from a
   401 ``WWW-Authenticate`` header, else the ``/.well-known`` paths.
2. ``authorization_servers[0]`` from that document.
3. Authorization-server metadata (RFC 8414, path insertion), then OIDC
   ``openid-configuration`` (what Cognito publishes).
4. ``token_endpoint`` and, if only ``client_secret_post`` is offered, that method.

Every URL, including those named by remote documents, passes
``assert_safe_outbound_url`` before it is requested. Redirects are not followed.
No secret is sent or handled here.
"""

import asyncio
import logging
import re
from typing import Any, Optional
from urllib.parse import urlsplit

import httpx

from services.mcp_proxy_service import ON_SAVE_DISCOVERY_SECONDS
from utils.safe_outbound_url import UnsafeOutboundUrlError, assert_safe_outbound_url

logger = logging.getLogger(__name__)

NOT_FOUND_MESSAGE = "Couldn't find the token URL from this server address. Enter it by hand."
_RESOURCE_METADATA = re.compile(r'resource_metadata\s*=\s*"([^"]+)"', re.IGNORECASE)


class OAuthDiscoveryError(Exception):
    """Discovery failed. The message is safe to show the Admin."""


def _safe(url: str) -> str:
    try:
        return assert_safe_outbound_url(url)
    except UnsafeOutboundUrlError as e:
        raise OAuthDiscoveryError(str(e)) from None


async def _get_json(client: httpx.AsyncClient, url: str) -> Optional[dict]:
    """The JSON object at ``url``, or None if it is missing, not JSON or unreachable."""
    try:
        resp = await client.get(_safe(url), headers={"Accept": "application/json"})
        if resp.status_code != 200:
            return None
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return None
    return data if isinstance(data, dict) else None


async def _resource_metadata_from_challenge(client: httpx.AsyncClient, server_url: str) -> Optional[str]:
    try:
        resp = await client.post(server_url, json={}, headers={"Accept": "application/json, text/event-stream"})
    except httpx.HTTPError:
        return None
    if resp.status_code != 401:
        return None
    match = _RESOURCE_METADATA.search(resp.headers.get("WWW-Authenticate", ""))
    return match.group(1) if match else None


async def _find_protected_resource(client: httpx.AsyncClient, server_url: str) -> Optional[dict]:
    parts = urlsplit(server_url)
    origin = f"{parts.scheme}://{parts.netloc}"
    path = parts.path.rstrip("/")

    candidates = []
    advertised = await _resource_metadata_from_challenge(client, server_url)
    if advertised:
        candidates.append(advertised)
    if path:
        candidates.append(f"{origin}/.well-known/oauth-protected-resource{path}")
    candidates.append(f"{origin}/.well-known/oauth-protected-resource")

    for url in candidates:
        doc = await _get_json(client, url)
        if doc is not None:
            return doc
    return None


async def _find_auth_server_metadata(client: httpx.AsyncClient, issuer: str) -> Optional[dict]:
    parts = urlsplit(issuer)
    origin = f"{parts.scheme}://{parts.netloc}"
    path = parts.path.rstrip("/")
    for url in (
        f"{origin}/.well-known/oauth-authorization-server{path}",
        f"{issuer.rstrip('/')}/.well-known/openid-configuration",
    ):
        doc = await _get_json(client, url)
        if doc is not None and doc.get("token_endpoint"):
            return doc
    return None


async def _discover(client: httpx.AsyncClient, server_url: str) -> dict[str, Any]:
    server_url = _safe(server_url)
    resource = await _find_protected_resource(client, server_url)
    servers = resource.get("authorization_servers") if resource else None
    if not isinstance(servers, list) or not servers or not isinstance(servers[0], str):
        raise OAuthDiscoveryError(NOT_FOUND_MESSAGE)

    issuer = _safe(servers[0])
    metadata = await _find_auth_server_metadata(client, issuer)
    if metadata is None or not isinstance(metadata["token_endpoint"], str):
        raise OAuthDiscoveryError(NOT_FOUND_MESSAGE)

    methods = metadata.get("token_endpoint_auth_methods_supported")
    use_post = (
        isinstance(methods, list)
        and "client_secret_basic" not in methods
        and "client_secret_post" in methods
    )
    return {
        "token_url": _safe(metadata["token_endpoint"]),
        "auth_method": "client_secret_post" if use_post else "client_secret_basic",
        "issuer": issuer,
    }


async def discover_token_endpoint(
    server_url: str,
    *,
    transport: Optional[httpx.AsyncBaseTransport] = None,
    budget_seconds: float = ON_SAVE_DISCOVERY_SECONDS,
) -> dict[str, Any]:
    """Return ``{"token_url", "auth_method", "issuer"}`` or raise OAuthDiscoveryError."""
    async with httpx.AsyncClient(transport=transport, timeout=budget_seconds, follow_redirects=False) as client:
        try:
            return await asyncio.wait_for(_discover(client, server_url), timeout=budget_seconds)
        except asyncio.TimeoutError:
            raise OAuthDiscoveryError(f"The server did not respond within {budget_seconds:g} seconds") from None
