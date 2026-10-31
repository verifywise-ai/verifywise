"""Bearer tokens for MCP servers that authenticate with OAuth or AWS IAM.

Turns a stored ``auth_config`` into a cached access token:
  oauth   -> OAuth 2.0 client-credentials grant against the stored token URL
  aws_iam -> AWS Sign-In ``CreateOAuth2TokenWithIAM`` with the stored access key

Tokens are cached in memory per config fingerprint, so an edited credential
never reuses a token fetched for the old one. Concurrent cold calls share one
fetch. Every ``TokenError`` message is admin-readable and free of secrets.
"""

import asyncio
import base64
import logging
import math
import re
import time
from typing import Optional
from urllib.parse import quote_plus

import boto3
import httpx
from botocore.config import Config
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    ConnectTimeoutError,
    EndpointConnectionError,
    ReadTimeoutError,
)

import crud.mcp_servers as mcp_servers_crud
from utils.mcp_credentials import (
    DEFAULT_AWS_MCP_RESOURCE,
    TOKEN_AUTH_TYPES,
    build_auth_headers,
    config_fingerprint,
    token_secret,
)
from utils.safe_outbound_url import UnsafeOutboundUrlError, assert_safe_outbound_url

logger = logging.getLogger("uvicorn")

TOKEN_TIMEOUT_SECONDS = 10
DEFAULT_EXPIRES_IN = 3600
# A token is reused until this many seconds before it expires; one that
# expires sooner than this is used once and not cached.
EXPIRY_MARGIN_SECONDS = 60

_AWS_KEY_REJECTED = ("InvalidClientTokenId", "UnrecognizedClientException", "SignatureDoesNotMatch")
_ERROR_CODE = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")

# fingerprint -> (token, expires_at on the monotonic clock)
_cache: dict[str, tuple[str, float]] = {}
_locks: dict[str, asyncio.Lock] = {}
# fingerprint -> (TokenError message, failure expires_at on the monotonic clock).
# While set, callers fail fast instead of each waiting out their own fetch
# during an identity-provider outage.
_failures: dict[str, tuple[str, float]] = {}
FAILURE_COOLDOWN_SECONDS = 10


UPSTREAM_REJECTED_MESSAGE = (
    "The MCP server rejected the access token (HTTP 401). Check the scope or resource."
)
# Every TokenError message starts with one of these fixed prefixes. Keep this
# next to the messages: discovery errors never start with them, so the proxy can
# tell a token error from an unrelated stored discovery error.
TOKEN_ERROR_PREFIXES = (
    "The stored credentials can't be read",
    "Auth type ",
    "The token URL is not allowed",
    "Could not connect to the token endpoint",
    "The token endpoint ",
    "Couldn't get an access token",
    "AWS rejected the access key",
    "AWS Sign-In ",
    "Could not connect to AWS Sign-In",
    "The IAM user is missing permission",
    "The MCP server rejected the access token",
)


def is_token_error_message(message: Optional[str]) -> bool:
    """True when ``message`` is one a TokenError can carry."""
    return isinstance(message, str) and message.startswith(TOKEN_ERROR_PREFIXES)


class TokenError(Exception):
    """A token could not be fetched; ``str(error)`` is safe to show an admin."""


def _reset_cache() -> None:
    _cache.clear()
    _locks.clear()
    _failures.clear()


def invalidate(auth_type: str, cfg: dict) -> None:
    """Forget the cached token for this config, e.g. after the server rejected it."""
    key = config_fingerprint(auth_type, cfg)
    _cache.pop(key, None)
    _failures.pop(key, None)


def _prune() -> None:
    """Drop expired tokens and failures, and the locks nothing refers to.

    Called on writes so fingerprints of edited or deleted servers don't pile up.
    A lock that is held (someone is fetching or waiting) is always kept."""
    now = time.monotonic()
    for key in [k for k, (_, exp) in _cache.items() if now >= exp - EXPIRY_MARGIN_SECONDS]:
        del _cache[key]
    for key in [k for k, (_, exp) in _failures.items() if now >= exp]:
        del _failures[key]
    for key in [k for k, lock in _locks.items() if k not in _cache and k not in _failures and not lock.locked()]:
        del _locks[key]


def record_upstream_rejection(auth_type: str, cfg: dict) -> TokenError:
    """The MCP server refused a freshly fetched token.

    Starts the failure cooldown, so calls in the next few seconds fail fast
    without hitting the identity provider, and returns the error to raise."""
    key = config_fingerprint(auth_type, cfg)
    _cache.pop(key, None)
    _failures[key] = (UPSTREAM_REJECTED_MESSAGE, time.monotonic() + FAILURE_COOLDOWN_SECONDS)
    _prune()
    return _fail(UPSTREAM_REJECTED_MESSAGE)


def _cached(key: str) -> Optional[str]:
    entry = _cache.get(key)
    if entry and time.monotonic() < entry[1] - EXPIRY_MARGIN_SECONDS:
        return entry[0]
    return None


def _raise_if_cooling_down(key: str) -> None:
    entry = _failures.get(key)
    if not entry:
        return
    if time.monotonic() < entry[1]:
        raise TokenError(entry[0])
    _failures.pop(key, None)


def _expires_in(value) -> float:
    """Seconds until expiry; a missing or unusable value counts as an hour."""
    if isinstance(value, bool):
        return DEFAULT_EXPIRES_IN
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return DEFAULT_EXPIRES_IN
    return seconds if math.isfinite(seconds) else DEFAULT_EXPIRES_IN


def _stored_secret(auth_type: str, cfg: dict) -> str:
    try:
        return token_secret(auth_type, cfg)
    except Exception:
        raise _fail("The stored credentials can't be read. Enter them again.") from None


def _fail(message: str) -> TokenError:
    logger.warning("MCP upstream sign-in failed: %s", message)
    return TokenError(message)


async def get_access_token(
    auth_type: str, cfg: dict, *, transport: Optional[httpx.AsyncBaseTransport] = None
) -> str:
    """A valid access token for the stored config, fetched at most once while cached."""
    if auth_type not in TOKEN_AUTH_TYPES:
        raise _fail(f"Auth type {auth_type} does not use access tokens")
    key = config_fingerprint(auth_type, cfg)
    token = _cached(key)
    if token:
        return token
    _raise_if_cooling_down(key)
    async with _locks.setdefault(key, asyncio.Lock()):
        token = _cached(key)
        if token:
            return token
        _raise_if_cooling_down(key)
        try:
            if auth_type == "oauth":
                token, expires_in = await _fetch_oauth(cfg, transport)
            else:
                token, expires_in = await _fetch_aws(cfg)
        except TokenError as exc:
            _failures[key] = (str(exc), time.monotonic() + FAILURE_COOLDOWN_SECONDS)
            _prune()
            raise
        if expires_in > EXPIRY_MARGIN_SECONDS:
            _cache[key] = (token, time.monotonic() + expires_in)
        _prune()
        return token


async def auth_headers_for(auth_type: str, cfg: dict, *, transport=None) -> dict:
    """Request headers for the MCP server: static secrets, or a freshly cached bearer token."""
    if auth_type not in TOKEN_AUTH_TYPES:
        return build_auth_headers(auth_type, cfg)
    token = await get_access_token(auth_type, cfg, transport=transport)
    return {"Authorization": f"Bearer {token}"}


async def _fetch_oauth(cfg: dict, transport) -> tuple[str, float]:
    try:
        token_url = assert_safe_outbound_url(cfg.get("token_url") or "")
    except UnsafeOutboundUrlError as exc:
        raise _fail(f"The token URL is not allowed: {exc}") from exc

    form = {"grant_type": "client_credentials"}
    for optional in ("scope", "resource"):
        if cfg.get(optional):
            form[optional] = cfg[optional]
    headers = None
    client_id, secret = cfg.get("client_id", ""), _stored_secret("oauth", cfg)
    if cfg.get("auth_method") == "client_secret_post":
        form.update(client_id=client_id, client_secret=secret)
    else:
        # RFC 6749 2.3.1: form-urlencode each value before the Basic encoding.
        pair = f"{quote_plus(client_id)}:{quote_plus(secret)}"
        headers = {"Authorization": "Basic " + base64.b64encode(pair.encode("utf-8")).decode("ascii")}

    try:
        async with httpx.AsyncClient(timeout=TOKEN_TIMEOUT_SECONDS, transport=transport) as client:
            response = await client.post(token_url, data=form, headers=headers)
    except httpx.HTTPError:
        raise _fail("Could not connect to the token endpoint") from None

    body = _json_object(response)
    if response.status_code >= 400:
        raise _fail(_oauth_error_message(response.status_code, body))
    access_token = body.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise _fail("The token endpoint did not return an access token")
    return access_token, _expires_in(body.get("expires_in"))


def _json_object(response: httpx.Response) -> dict:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _oauth_error_message(status: int, body: dict) -> str:
    code = body.get("error")
    code = code if isinstance(code, str) and _ERROR_CODE.match(code) else None
    if status == 401 or code == "invalid_client":
        suffix = f" ({code})" if code else ""
        return f"The token endpoint rejected the client ID or secret{suffix}"
    if status < 500 and code:
        return f"The token endpoint rejected the request ({code})"
    return f"Couldn't get an access token (HTTP {status})"


def _aws_client_factory(region: str, access_key_id: str, secret_access_key: str):
    """A Sign-In client using only the stored key; never the default credential chain."""
    session = boto3.session.Session(
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=region,
    )
    return session.client(
        "signin",
        config=Config(
            connect_timeout=TOKEN_TIMEOUT_SECONDS,
            read_timeout=TOKEN_TIMEOUT_SECONDS,
            retries={"max_attempts": 1},
        ),
    )


def _aws_sign_in(region: str, access_key_id: str, secret: str, resource: str) -> dict:
    """Blocking: boto3 loads its service model when the client is built."""
    client = _aws_client_factory(region, access_key_id, secret)
    return client.create_oauth2_token_with_iam(grantType="client_credentials", resource=resource)


async def _fetch_aws(cfg: dict) -> tuple[str, float]:
    secret = _stored_secret("aws_iam", cfg)
    try:
        result = await asyncio.to_thread(
            _aws_sign_in,
            cfg.get("region", ""),
            cfg.get("access_key_id", ""),
            secret,
            cfg.get("resource") or DEFAULT_AWS_MCP_RESOURCE,
        )
    except ClientError as exc:
        raise _fail(_aws_error_message(exc)) from None
    except (EndpointConnectionError, ConnectTimeoutError, ReadTimeoutError):
        raise _fail("Could not connect to AWS Sign-In") from None
    except BotoCoreError:
        raise _fail("AWS Sign-In rejected the request settings (check the region)") from None
    access_token = result.get("accessToken")
    if not isinstance(access_token, str) or not access_token:
        raise _fail("AWS Sign-In did not return an access token")
    return access_token, _expires_in(result.get("expiresIn"))


def _aws_error_message(exc: ClientError) -> str:
    code = str(exc.response.get("Error", {}).get("Code", ""))
    code = code if _ERROR_CODE.match(code) else "unknown"
    if code in _AWS_KEY_REJECTED:
        return f"AWS rejected the access key ({code})"
    if code == "AccessDeniedException":
        return "The IAM user is missing permission signin:CreateOAuth2Token"
    return f"AWS Sign-In returned an error ({code})"


async def note_token_outcome(
    org_id: int,
    server_id: int,
    error: Optional[str],
    stored: Optional[tuple] = None,
) -> None:
    """Record server health after a token-authenticated call, only when it changes.

    ``error`` is None for a working token. ``stored`` is the row's
    ``(health_status, last_discovery_error)`` as read when the call was resolved,
    so every worker compares against what is actually in the database. Without
    it the outcome is always written. Database failures are logged (message
    only) and swallowed so they never fail the tool call; the next call retries.
    """
    if stored is not None:
        status, last_error = stored
        if error is None and status == "healthy":
            return
        if error is not None and status == "unhealthy" and last_error == error:
            return
    try:
        await mcp_servers_crud.record_discovery_result(org_id, server_id, error)
    except Exception as exc:  # noqa: BLE001 — health bookkeeping must not break the call
        logger.warning("Could not record MCP server health for server %s: %s", server_id, type(exc).__name__)
