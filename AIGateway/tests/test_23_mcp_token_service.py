"""MCP token service: OAuth client credentials and AWS IAM tokens, cached.

No live services: httpx.MockTransport for OAuth, botocore Stubber for AWS."""

import asyncio
import base64
import os
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import boto3
import httpx
import pytest
from botocore.exceptions import (
    ConnectTimeoutError,
    EndpointConnectionError,
    InvalidRegionError,
    NoRegionError,
)
from botocore.stub import Stubber

from services import mcp_token_service as svc
from services.mcp_token_service import TokenError
from utils.mcp_credentials import normalize_auth_config

pytestmark = pytest.mark.asyncio

TOKEN_URL = "https://auth.example.com/oauth/token"


@pytest.fixture(autouse=True)
def _clean_cache():
    svc._reset_cache()
    yield
    svc._reset_cache()


def oauth_cfg(**overrides):
    incoming = {
        "client_id": "app",
        "client_secret": "s3cret",
        "token_url": TOKEN_URL,
        "scope": "mcp",
    }
    incoming.update(overrides)
    return normalize_auth_config("oauth", incoming, None)


def aws_cfg():
    return normalize_auth_config(
        "aws_iam",
        {"region": "us-east-1", "access_key_id": "AKIAEXAMPLE", "secret_access_key": "awssecret"},
        None,
    )


class Endpoint:
    """A MockTransport that records requests and answers from a script."""

    def __init__(self, *responses):
        self.requests = []
        self._responses = list(responses) or [
            httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        ]

    def __call__(self, request):
        self.requests.append(request)
        index = min(len(self.requests) - 1, len(self._responses) - 1)
        response = self._responses[index]
        if isinstance(response, Exception):
            raise response
        return response

    @property
    def transport(self):
        return httpx.MockTransport(self)

    def form(self, index=0):
        return {k: v[0] for k, v in parse_qs(self.requests[index].content.decode()).items()}


class TestOAuth:
    async def test_basic_auth_request(self):
        ep = Endpoint()
        token = await svc.get_access_token("oauth", oauth_cfg(resource="https://mcp"), transport=ep.transport)
        assert token == "tok"
        req = ep.requests[0]
        assert req.method == "POST" and str(req.url) == TOKEN_URL
        expected = base64.b64encode(b"app:s3cret").decode()
        assert req.headers["Authorization"] == f"Basic {expected}"
        assert ep.form() == {
            "grant_type": "client_credentials",
            "scope": "mcp",
            "resource": "https://mcp",
        }

    async def test_resource_omitted_when_unset(self):
        ep = Endpoint()
        await svc.get_access_token("oauth", oauth_cfg(), transport=ep.transport)
        assert "resource" not in ep.form()

    async def test_post_auth_method(self):
        ep = Endpoint()
        cfg = oauth_cfg(auth_method="client_secret_post")
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert "Authorization" not in ep.requests[0].headers
        form = ep.form()
        assert form["client_id"] == "app" and form["client_secret"] == "s3cret"

    async def test_cache_reused_then_renewed(self, monkeypatch):
        ep = Endpoint()
        cfg = oauth_cfg()
        now = [1000.0]
        monkeypatch.setattr(time, "monotonic", lambda: now[0])
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 1
        now[0] += 3541
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 2

    async def test_missing_expires_in_defaults_to_an_hour(self, monkeypatch):
        ep = Endpoint(httpx.Response(200, json={"access_token": "tok"}))
        cfg = oauth_cfg()
        now = [0.0]
        monkeypatch.setattr(time, "monotonic", lambda: now[0])
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        now[0] = 3000
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 1

    async def test_short_expiry_not_cached(self):
        ep = Endpoint(httpx.Response(200, json={"access_token": "tok", "expires_in": 30}))
        cfg = oauth_cfg()
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 2

    async def test_fingerprint_change_refetches(self):
        ep = Endpoint()
        await svc.get_access_token("oauth", oauth_cfg(), transport=ep.transport)
        other = oauth_cfg(token_url="https://auth.example.com/v2/token")
        await svc.get_access_token("oauth", other, transport=ep.transport)
        assert len(ep.requests) == 2

    async def test_concurrent_cold_calls_fetch_once(self):
        calls = []

        async def slow(request):
            calls.append(request)
            await asyncio.sleep(0.05)
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})

        cfg = oauth_cfg()
        tokens = await asyncio.gather(
            *[svc.get_access_token("oauth", cfg, transport=httpx.MockTransport(slow)) for _ in range(10)]
        )
        assert tokens == ["tok"] * 10
        assert len(calls) == 1

    async def test_failed_fetch_recovers(self):
        cfg = oauth_cfg()
        failing = Endpoint(httpx.Response(500))
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", cfg, transport=failing.transport)
        assert svc._cache == {}
        assert await svc.get_access_token("oauth", cfg, transport=Endpoint().transport) == "tok"

    async def test_failed_leader_with_waiters_recovers(self):
        calls = []

        async def failing(request):
            calls.append(request)
            await asyncio.sleep(0.05)
            return httpx.Response(500)

        cfg = oauth_cfg()
        results = await asyncio.gather(
            *[svc.get_access_token("oauth", cfg, transport=httpx.MockTransport(failing)) for _ in range(5)],
            return_exceptions=True,
        )
        assert all(isinstance(r, TokenError) for r in results)
        assert svc._cache == {}
        ok = await asyncio.wait_for(
            svc.get_access_token("oauth", cfg, transport=Endpoint().transport), timeout=2
        )
        assert ok == "tok"

    @pytest.mark.parametrize("expires_in, cached", [("30", False), ("3600", True), (3600.0, True)])
    async def test_expires_in_string_is_parsed(self, expires_in, cached):
        ep = Endpoint(httpx.Response(200, json={"access_token": "tok", "expires_in": expires_in}))
        cfg = oauth_cfg()
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == (1 if cached else 2)

    @pytest.mark.parametrize("expires_in", ["soon", "nan", "inf", None, True])
    async def test_unusable_expires_in_defaults_to_an_hour(self, expires_in):
        ep = Endpoint(httpx.Response(200, json={"access_token": "tok", "expires_in": expires_in}))
        cfg = oauth_cfg()
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 1

    async def test_unreadable_stored_secret(self):
        cfg = oauth_cfg()
        cfg["client_secret_enc"] = "garbage"
        ep = Endpoint()
        with pytest.raises(TokenError) as caught:
            await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert str(caught.value) == "The stored credentials can't be read. Enter them again."
        assert ep.requests == []

    async def test_unreadable_stored_aws_secret(self):
        cfg = aws_cfg()
        cfg["secret_access_key_enc"] = "aa:bb:cc"
        with pytest.raises(TokenError, match="can't be read"):
            await svc.get_access_token("aws_iam", cfg)

    async def test_non_latin1_credentials_are_sent_as_utf8(self):
        # httpx 0.28 encodes Basic credentials as UTF-8, so this never raises.
        cfg = oauth_cfg(client_secret="s\u00e9cret\u2603")
        ep = Endpoint()
        assert await svc.get_access_token("oauth", cfg, transport=ep.transport) == "tok"
        expected = base64.b64encode("app:s\u00e9cret\u2603".encode("utf-8")).decode()
        assert ep.requests[0].headers["Authorization"] == f"Basic {expected}"

    @pytest.mark.parametrize(
        "response",
        [
            httpx.Response(200, json={"token_type": "bearer"}),
            httpx.Response(200, text="<html>login</html>", headers={"content-type": "text/html"}),
            httpx.Response(200, json=["not", "an", "object"]),
        ],
    )
    async def test_missing_access_token(self, response):
        ep = Endpoint(response)
        cfg = oauth_cfg()
        with pytest.raises(TokenError, match="The token endpoint did not return an access token"):
            await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert svc._cache == {}

    @pytest.mark.parametrize(
        "response, message",
        [
            (
                httpx.Response(401, json={"error": "invalid_client"}),
                "The token endpoint rejected the client ID or secret (invalid_client)",
            ),
            (
                httpx.Response(400, json={"error": "invalid_scope"}),
                "The token endpoint rejected the request (invalid_scope)",
            ),
            (httpx.Response(500, text="boom s3cret"), "Couldn't get an access token (HTTP 500)"),
            (httpx.ConnectError("refused"), "Could not connect to the token endpoint"),
            (httpx.ReadTimeout("slow"), "Could not connect to the token endpoint"),
        ],
    )
    async def test_error_mapping(self, response, message):
        ep = Endpoint(response)
        with pytest.raises(TokenError) as caught:
            await svc.get_access_token("oauth", oauth_cfg(), transport=ep.transport)
        assert str(caught.value) == message
        assert "s3cret" not in str(caught.value)

    async def test_token_error_is_not_a_value_error(self):
        assert not issubclass(TokenError, ValueError)

    async def test_token_url_rechecked_at_fetch(self):
        cfg = oauth_cfg()
        cfg["token_url"] = "http://169.254.169.254/token"  # bypasses normalize
        ep = Endpoint()
        with pytest.raises(TokenError, match="not allowed"):
            await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert ep.requests == []


class FakeFactory:
    def __init__(self, stubber_setup):
        self.calls = []
        self.client = boto3.client(
            "signin", region_name="us-east-1", aws_access_key_id="x", aws_secret_access_key="y"
        )
        self.stubber = Stubber(self.client)
        stubber_setup(self.stubber)
        self.stubber.activate()

    def __call__(self, region, access_key_id, secret_access_key):
        self.calls.append((region, access_key_id, secret_access_key))
        return self.client


def install(monkeypatch, setup):
    factory = FakeFactory(setup)
    monkeypatch.setattr(svc, "_aws_client_factory", factory)
    return factory


EXPECTED = {"grantType": "client_credentials", "resource": "aws-mcp.amazonaws.com"}


class TestAws:
    async def test_token(self, monkeypatch):
        factory = install(
            monkeypatch,
            lambda s: s.add_response(
                "create_oauth2_token_with_iam",
                {"accessToken": "tok", "tokenType": "Bearer", "expiresIn": 3600},
                EXPECTED,
            ),
        )
        cfg = aws_cfg()
        assert await svc.get_access_token("aws_iam", cfg) == "tok"
        assert factory.calls == [("us-east-1", "AKIAEXAMPLE", "awssecret")]
        # cached: the stubber would raise on a second call
        assert await svc.get_access_token("aws_iam", cfg) == "tok"

    async def test_ignores_env_credentials(self, monkeypatch):
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ENVKEY")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "ENVSECRET")
        factory = install(
            monkeypatch,
            lambda s: s.add_response(
                "create_oauth2_token_with_iam",
                {"accessToken": "tok", "tokenType": "Bearer", "expiresIn": 3600},
                EXPECTED,
            ),
        )
        await svc.get_access_token("aws_iam", aws_cfg())
        assert factory.calls[0][1] == "AKIAEXAMPLE"

    async def test_real_factory_uses_explicit_keys(self, monkeypatch):
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ENVKEY")
        client = svc._aws_client_factory("eu-west-1", "AKIAEXAMPLE", "awssecret")
        credentials = client._request_signer._credentials
        assert credentials.access_key == "AKIAEXAMPLE"
        assert client.meta.region_name == "eu-west-1"

    @pytest.mark.parametrize(
        "code, message",
        [
            ("InvalidClientTokenId", "AWS rejected the access key (InvalidClientTokenId)"),
            ("UnrecognizedClientException", "AWS rejected the access key (UnrecognizedClientException)"),
            ("AccessDeniedException", "The IAM user is missing permission signin:CreateOAuth2Token"),
            ("X", "AWS Sign-In returned an error (X)"),
        ],
    )
    async def test_error_mapping(self, monkeypatch, code, message):
        install(
            monkeypatch,
            lambda s: s.add_client_error(
                "create_oauth2_token_with_iam", service_error_code=code, http_status_code=400
            ),
        )
        with pytest.raises(TokenError) as caught:
            await svc.get_access_token("aws_iam", aws_cfg())
        assert str(caught.value) == message
        assert "awssecret" not in str(caught.value)

    async def test_concurrent_cold_calls_fetch_once(self, monkeypatch):
        calls = []

        class Slow:
            def create_oauth2_token_with_iam(self, **_):
                calls.append(1)
                time.sleep(0.05)
                return {"accessToken": "tok", "tokenType": "Bearer", "expiresIn": 3600}

        monkeypatch.setattr(svc, "_aws_client_factory", lambda *a: Slow())
        cfg = aws_cfg()
        tokens = await asyncio.gather(*[svc.get_access_token("aws_iam", cfg) for _ in range(10)])
        assert tokens == ["tok"] * 10
        assert len(calls) == 1

    @pytest.mark.parametrize(
        "error, message",
        [
            (EndpointConnectionError(endpoint_url="https://x"), "Could not connect to AWS Sign-In"),
            (ConnectTimeoutError(endpoint_url="https://x"), "Could not connect to AWS Sign-In"),
            (NoRegionError(), "AWS Sign-In rejected the request settings (check the region)"),
            (InvalidRegionError(region_name="x y"), "AWS Sign-In rejected the request settings (check the region)"),
        ],
    )
    async def test_botocore_error_mapping(self, monkeypatch, error, message):
        class Broken:
            def create_oauth2_token_with_iam(self, **_):
                raise error

        monkeypatch.setattr(svc, "_aws_client_factory", lambda *a: Broken())
        with pytest.raises(TokenError) as caught:
            await svc.get_access_token("aws_iam", aws_cfg())
        assert str(caught.value) == message

    async def test_missing_access_token(self, monkeypatch):
        class Empty:
            def create_oauth2_token_with_iam(self, **_):
                return {"tokenType": "Bearer"}

        monkeypatch.setattr(svc, "_aws_client_factory", lambda *a: Empty())
        with pytest.raises(TokenError, match="AWS Sign-In did not return an access token"):
            await svc.get_access_token("aws_iam", aws_cfg())


class TestHeadersAndInvalidate:
    async def test_auth_headers_for(self):
        bearer = normalize_auth_config("bearer", {"token": "static"}, None)
        assert await svc.auth_headers_for("bearer", bearer) == {"Authorization": "Bearer static"}
        ep = Endpoint()
        headers = await svc.auth_headers_for("oauth", oauth_cfg(), transport=ep.transport)
        assert headers == {"Authorization": "Bearer tok"}

    async def test_unsupported_type_is_a_token_error(self):
        with pytest.raises(TokenError):
            await svc.get_access_token("bearer", {})

    async def test_invalidate(self):
        ep = Endpoint()
        cfg = oauth_cfg()
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        svc.invalidate("oauth", cfg)
        await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 2
