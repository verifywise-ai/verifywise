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
    BotoCoreError,
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
        svc.invalidate("oauth", cfg)  # or wait out the failure cooldown
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
        assert len(calls) == 1
        svc.invalidate("oauth", cfg)
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
        # RFC 6749 2.3.1: form-urlencode first (UTF-8 percent-escapes), then Basic.
        expected = base64.b64encode(b"app:s%C3%A9cret%E2%98%83").decode()
        assert ep.requests[0].headers["Authorization"] == f"Basic {expected}"

    async def test_basic_credentials_are_form_urlencoded(self):
        cfg = oauth_cfg(client_id="a b", client_secret="p+w%d:x")
        ep = Endpoint()
        assert await svc.get_access_token("oauth", cfg, transport=ep.transport) == "tok"
        expected = base64.b64encode(b"a+b:p%2Bw%25d%3Ax").decode()
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


class TestFailureCooldown:
    async def test_concurrent_cold_calls_share_one_failed_fetch(self):
        ep = Endpoint(httpx.Response(401, json={"error": "invalid_client"}))
        cfg = oauth_cfg()

        results = await asyncio.gather(
            *[svc.get_access_token("oauth", cfg, transport=ep.transport) for _ in range(5)],
            return_exceptions=True,
        )

        assert len(ep.requests) == 1
        assert all(isinstance(r, TokenError) for r in results)
        assert len({str(r) for r in results}) == 1

    async def test_new_request_after_cooldown(self, monkeypatch):
        ep = Endpoint(httpx.Response(401, json={"error": "invalid_client"}))
        cfg = oauth_cfg()
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", cfg, transport=ep.transport)
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 1

        real = time.monotonic()
        monkeypatch.setattr(svc.time, "monotonic", lambda: real + svc.FAILURE_COOLDOWN_SECONDS + 1)
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", cfg, transport=ep.transport)
        assert len(ep.requests) == 2

    async def test_invalidate_clears_the_failure(self):
        ep = Endpoint(httpx.Response(500), httpx.Response(200, json={"access_token": "tok"}))
        cfg = oauth_cfg()
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", cfg, transport=ep.transport)
        svc.invalidate("oauth", cfg)
        assert await svc.get_access_token("oauth", cfg, transport=ep.transport) == "tok"


class TestTokenErrorMessages:
    async def test_recognises_token_errors_only(self):
        assert svc.is_token_error_message("AWS rejected the access key (InvalidClientTokenId)")
        assert svc.is_token_error_message(
            "The MCP server rejected the access token (HTTP 401). Check the scope or resource."
        )
        assert not svc.is_token_error_message("The server returned an error: x")
        assert not svc.is_token_error_message("Could not connect to the server address")
        assert not svc.is_token_error_message("The server rejected the credentials (HTTP 401)")
        assert not svc.is_token_error_message(None)
        assert not svc.is_token_error_message("")

    async def test_every_message_fail_can_produce_matches(self, monkeypatch):
        produced = []
        real_fail = svc._fail

        def spy(message):
            produced.append(message)
            return real_fail(message)

        monkeypatch.setattr(svc, "_fail", spy)

        oauth_responses = [
            httpx.Response(401, json={"error": "invalid_client"}),
            httpx.Response(400, json={"error": "invalid_scope"}),
            httpx.Response(500),
            httpx.Response(200, json={"token_type": "bearer"}),
            httpx.ConnectError("down"),
        ]
        for response in oauth_responses:
            svc._reset_cache()
            with pytest.raises(TokenError):
                await svc.get_access_token("oauth", oauth_cfg(), transport=Endpoint(response).transport)
        svc._reset_cache()
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", {**oauth_cfg(), "token_url": "file:///etc/passwd"})
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", {"client_id": "x", "client_secret_enc": "garbage"})
        with pytest.raises(TokenError):
            await svc.get_access_token("bearer", {})

        for code in ("InvalidClientTokenId", "AccessDeniedException", "Other"):
            svc._reset_cache()
            install(
                monkeypatch,
                lambda s, code=code: s.add_client_error(
                    "create_oauth2_token_with_iam", service_error_code=code, http_status_code=400
                ),
            )
            with pytest.raises(TokenError):
                await svc.get_access_token("aws_iam", aws_cfg())
        for error in (
            EndpointConnectionError(endpoint_url="https://x"),
            BotoCoreError(),
        ):
            svc._reset_cache()
            monkeypatch.setattr(svc, "_aws_client_factory", _raising_factory(error))
            with pytest.raises(TokenError):
                await svc.get_access_token("aws_iam", aws_cfg())
        svc._reset_cache()

        class Empty:
            def create_oauth2_token_with_iam(self, **_):
                return {"tokenType": "Bearer"}

        monkeypatch.setattr(svc, "_aws_client_factory", lambda *a: Empty())
        with pytest.raises(TokenError):
            await svc.get_access_token("aws_iam", aws_cfg())
        produced.append(svc.UPSTREAM_REJECTED_MESSAGE)

        assert len(produced) >= 12
        unmatched = [m for m in produced if not svc.is_token_error_message(m)]
        assert unmatched == []


def _raising_factory(error):
    def factory(region, access_key_id, secret_access_key):
        raise error

    return factory


class TestCachePruning:
    async def test_expired_entries_and_locks_are_dropped_on_write(self, monkeypatch):
        ep = Endpoint(httpx.Response(200, json={"access_token": "tok", "expires_in": 120}))
        old = oauth_cfg(client_id="old")
        await svc.get_access_token("oauth", old, transport=ep.transport)
        old_key = svc.config_fingerprint("oauth", old)
        assert old_key in svc._cache and old_key in svc._locks

        real = time.monotonic()
        monkeypatch.setattr(svc.time, "monotonic", lambda: real + 3600)
        await svc.get_access_token("oauth", oauth_cfg(client_id="new"), transport=ep.transport)

        assert old_key not in svc._cache
        assert old_key not in svc._locks
        assert len(svc._cache) == 1

    async def test_expired_failures_are_dropped_on_write(self, monkeypatch):
        bad = Endpoint(httpx.Response(401, json={"error": "invalid_client"}))
        stale = oauth_cfg(client_id="stale")
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", stale, transport=bad.transport)
        stale_key = svc.config_fingerprint("oauth", stale)
        assert stale_key in svc._failures

        real = time.monotonic()
        monkeypatch.setattr(svc.time, "monotonic", lambda: real + svc.FAILURE_COOLDOWN_SECONDS + 1)
        with pytest.raises(TokenError):
            await svc.get_access_token("oauth", oauth_cfg(client_id="other"), transport=bad.transport)

        assert stale_key not in svc._failures
        assert stale_key not in svc._locks

    async def test_a_held_lock_is_kept(self):
        key = "held"
        lock = svc._locks.setdefault(key, asyncio.Lock())
        async with lock:
            svc._prune()
            assert svc._locks[key] is lock


class TestAwsOffLoop:
    async def test_client_is_built_off_the_event_loop(self, monkeypatch):
        import threading

        built_on = []

        class Client:
            def create_oauth2_token_with_iam(self, **kwargs):
                return {"accessToken": "tok", "expiresIn": 3600}

        def factory(region, access_key_id, secret_access_key):
            built_on.append(threading.current_thread())
            return Client()

        monkeypatch.setattr(svc, "_aws_client_factory", factory)
        assert await svc.get_access_token("aws_iam", aws_cfg()) == "tok"
        assert built_on and built_on[0] is not threading.main_thread()
