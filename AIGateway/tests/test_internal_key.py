"""Self-contained tests for the internal key checks and the observability
config fetch: no live services."""

import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import httpx
import observability
from config import settings
from middlewares import auth


def _request(key=None):
    headers = {} if key is None else {"x-internal-key": key}
    return SimpleNamespace(
        headers=headers, method="GET", url=SimpleNamespace(path="/internal/x")
    )


@pytest.mark.parametrize(
    "provided, expected, match",
    [("k", "k", True), ("k", "j", False), ("clé-ü", "k", False), ("", "k", False)],
)
def test_keys_match_compares_bytes(provided, expected, match):
    assert auth.keys_match(provided, expected) is match


async def test_verify_internal_key_rejects_a_non_ascii_header_with_401(monkeypatch):
    """Comparing two str with non-ASCII characters raised TypeError (500)."""
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    with pytest.raises(HTTPException) as exc:
        await auth.verify_internal_key(_request("clé-ü"))
    assert exc.value.status_code == 401


async def test_verify_internal_key_accepts_the_right_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    assert await auth.verify_internal_key(_request("right-key")) is None


@pytest.mark.parametrize("configured", ["", "   "])
async def test_verify_internal_key_refuses_every_request_when_no_key_is_configured(
    monkeypatch, configured
):
    """Fail closed: without a configured key nothing is served (503 + code)."""
    import config

    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", configured)
    monkeypatch.setattr(settings, "ai_gateway_internal_key", config.Settings().ai_gateway_internal_key)
    with pytest.raises(HTTPException) as exc:
        await auth.verify_internal_key(_request("anything"))
    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "internal_key_not_configured"


@pytest.mark.parametrize("key", [None, "", "wrong-key", "clé-ü"])
async def test_verify_internal_key_rejects_a_missing_or_wrong_key_with_a_code(monkeypatch, key):
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    with pytest.raises(HTTPException) as exc:
        await auth.verify_internal_key(_request(key))
    assert exc.value.status_code == 401
    assert exc.value.detail["code"] == "internal_key_rejected"


def test_there_is_one_internal_key_check():
    assert not hasattr(auth, "require_internal_key")


# ---------------------------------------------------------------------------
# A non-retention internal route, end to end over HTTP
# ---------------------------------------------------------------------------


def _cache_client(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import routers.cache as cache_router

    stats = AsyncMock(return_value={"entries": 3})
    monkeypatch.setattr(cache_router, "get_cache_stats", stats)

    app = FastAPI()

    @app.middleware("http")
    async def tenant(request, call_next):  # stands in for TenantMiddleware
        request.state.organization_id = 7
        return await call_next(request)

    auth.include_internal_router(app, cache_router.router)
    return TestClient(app), stats


def test_internal_route_answers_503_with_code_when_no_key_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "")
    client, stats = _cache_client(monkeypatch)

    response = client.get("/internal/cache/stats", headers={"x-internal-key": "anything"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {"message": "Internal key not configured", "code": "internal_key_not_configured"}
    }
    stats.assert_not_awaited()


@pytest.mark.parametrize("headers", [{}, {"x-internal-key": "wrong-key"}])
def test_internal_route_answers_401_with_code_for_a_missing_or_wrong_key(monkeypatch, headers):
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client, stats = _cache_client(monkeypatch)

    response = client.get("/internal/cache/stats", headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "internal_key_rejected"
    stats.assert_not_awaited()


def test_internal_route_rejects_a_non_ascii_key_with_401_not_500(monkeypatch):
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client, _ = _cache_client(monkeypatch)

    # HTTP headers travel as latin-1; this is a non-ASCII key on the wire.
    response = client.get(
        "/internal/cache/stats", headers={"x-internal-key": "clé".encode("latin-1")}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "internal_key_rejected"


def test_internal_route_serves_the_right_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client, stats = _cache_client(monkeypatch)

    response = client.get("/internal/cache/stats", headers={"x-internal-key": "right-key"})

    assert response.status_code == 200
    stats.assert_awaited_once_with(7)


def test_observability_config_fetch_sends_the_trimmed_settings_key(monkeypatch):
    monkeypatch.setenv("BACKEND_URL", "http://backend:3000")
    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", "  raw-key\n")
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "raw-key")
    response = MagicMock()
    response.json.return_value = {"enabled": False}
    get = MagicMock(return_value=response)
    monkeypatch.setattr(httpx, "get", get)

    observability._fetch_config()

    assert get.call_args.kwargs["headers"] == {"x-internal-key": "raw-key"}


def test_observability_config_fetch_skips_the_call_without_a_key(monkeypatch):
    monkeypatch.setenv("BACKEND_URL", "http://backend:3000")
    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", "   ")
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "")
    get = MagicMock()
    monkeypatch.setattr(httpx, "get", get)

    observability._fetch_config()

    get.assert_not_called()


def test_observability_config_falls_back_to_env_when_settings_fail(monkeypatch):
    """A settings error must not block startup: the env config is used."""
    import types

    monkeypatch.setenv("BACKEND_URL", "http://backend:3000")
    monkeypatch.setenv("OTEL_ENABLED", "true")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel:4318")
    # A config module whose settings cannot be imported.
    monkeypatch.setitem(sys.modules, "config", types.ModuleType("config"))
    get = MagicMock()
    monkeypatch.setattr(httpx, "get", get)

    result = observability._fetch_config()

    get.assert_not_called()
    assert result["enabled"] is True
    assert result["otlp_endpoint"] == "http://otel:4318"


# ---------------------------------------------------------------------------
# The check is a router-level dependency
# ---------------------------------------------------------------------------


def _client_for(router):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    auth.include_internal_router(app, router)
    return TestClient(app)


@pytest.mark.parametrize(
    "body",
    [
        {"messages": "not-a-list"},  # wrong type
        {},  # required fields missing
    ],
)
def test_unauthenticated_invalid_chat_completion_gets_401_not_422(monkeypatch, body):
    """Auth runs before body validation: without the key the caller learns
    nothing about the request schema."""
    import routers.completions as completions

    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client = _client_for(completions.router)

    response = client.post("/internal/v1/chat/completions", json=body)

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "internal_key_rejected"


def test_authenticated_invalid_chat_completion_still_gets_422(monkeypatch):
    import routers.completions as completions

    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client = _client_for(completions.router)

    response = client.post(
        "/internal/v1/chat/completions", json={}, headers={"x-internal-key": "right-key"}
    )

    assert response.status_code == 422


def test_a_route_without_its_own_check_is_still_protected(monkeypatch):
    """A route added to an internal router never calls the check itself; the
    router dependency protects it anyway."""
    from fastapi import APIRouter

    router = APIRouter(prefix="/new-feature")

    @router.get("/thing")
    async def thing():
        return {"ok": True}

    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client = _client_for(router)

    assert client.get("/internal/new-feature/thing").status_code == 401
    served = client.get("/internal/new-feature/thing", headers={"x-internal-key": "right-key"})
    assert served.status_code == 200
    assert served.json() == {"ok": True}


def test_every_registered_internal_route_refuses_a_request_without_the_key(monkeypatch):
    """Every operation the real app exposes under /internal must refuse a
    request without the key with the gateway's 401 code.

    This checks behaviour rather than route objects: how included routers are
    stored differs between FastAPI versions (newer versions keep them as one
    lazily expanded entry in app.routes). The operations come from the app's
    OpenAPI schema; path parameters are filled with "1". The key is checked
    before body validation, so no body is needed."""
    import re

    from fastapi.testclient import TestClient

    import app as gateway_app

    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client = TestClient(gateway_app.app, raise_server_exceptions=False)
    operations = [
        (method.upper(), path)
        for path, item in gateway_app.app.openapi()["paths"].items()
        if path.startswith("/internal")
        for method in item
        if method in ("get", "post", "put", "patch", "delete")
    ]
    assert len(operations) > 100, f"expected the internal API, found {len(operations)} operations"

    not_refused = []
    for method, path in operations:
        response = client.request(method, re.sub(r"\{[^}]+\}", "1", path))
        try:
            code = response.json()["detail"]["code"]
        except (ValueError, KeyError, TypeError):
            code = None
        if response.status_code != 401 or code != "internal_key_rejected":
            not_refused.append(f"{method} {path} -> {response.status_code}")
    assert not_refused == [], f"internal routes served without the key: {not_refused}"


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def _rejected(route_template=None, path="/internal/x"):
    scope = {"route": SimpleNamespace(path=route_template)} if route_template else {}
    return SimpleNamespace(
        headers={"x-internal-key": "secret-wrong-key"},
        method="POST",
        url=SimpleNamespace(path=path),
        scope=scope,
    )


async def test_rejected_keys_are_logged_at_most_once_a_minute_per_route(monkeypatch, caplog):
    import logging

    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    monkeypatch.setattr(auth, "_rejected_log_state", {})
    clock = {"now": 1000.0}
    monkeypatch.setattr(auth.time, "monotonic", lambda: clock["now"])
    caplog.set_level(logging.WARNING, logger=auth.logger.name)

    async def reject(template, path):
        with pytest.raises(HTTPException):
            await auth.verify_internal_key(_rejected(template, path))

    await reject("/internal/keys/{key_id}", "/internal/keys/1")
    await reject("/internal/keys/{key_id}", "/internal/keys/2")  # same route: not logged
    await reject("/internal/budget", "/internal/budget")  # another route: logged
    clock["now"] += auth.REJECTED_KEY_LOG_INTERVAL_SECONDS
    await reject("/internal/keys/{key_id}", "/internal/keys/3")  # window passed: logged

    messages = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert messages == [
        "Rejected internal request POST /internal/keys/{key_id}: invalid internal key",
        "Rejected internal request POST /internal/budget: invalid internal key",
        # The one rejection suppressed inside the window is counted.
        "Rejected internal request POST /internal/keys/{key_id} (1 more since last log): "
        "invalid internal key",
    ]
    # Never the key, the header value or the raw path.
    assert all("secret-wrong-key" not in m and "/keys/1" not in m for m in messages)


async def test_unique_paths_do_not_grow_the_limiter(monkeypatch):
    """10,000 rejected requests with unique paths (unmatched, or one route with
    a path parameter) keep the limiter within its cap."""
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    monkeypatch.setattr(auth, "_rejected_log_state", {})

    for i in range(10_000):
        with pytest.raises(HTTPException):
            await auth.verify_internal_key(_rejected(None, f"/internal/{i}"))
        with pytest.raises(HTTPException):
            await auth.verify_internal_key(_rejected("/internal/keys/{key_id}", f"/internal/keys/{i}"))

    assert set(auth._rejected_log_state) == {"<unmatched>", "/internal/keys/{key_id}"}


async def test_the_limiter_is_capped_even_with_many_route_templates(monkeypatch):
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    monkeypatch.setattr(auth, "_rejected_log_state", {})

    for i in range(auth.REJECTED_KEY_LOG_MAX_ROUTES * 4):
        with pytest.raises(HTTPException):
            await auth.verify_internal_key(_rejected(f"/internal/route-{i}", f"/internal/route-{i}"))

    assert len(auth._rejected_log_state) == auth.REJECTED_KEY_LOG_MAX_ROUTES


def test_unknown_internal_paths_never_reach_the_check(monkeypatch):
    """Over HTTP an unknown /internal path is a 404 before the dependency runs."""
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    monkeypatch.setattr(auth, "_rejected_log_state", {})
    client, _ = _cache_client(monkeypatch)

    assert client.get("/internal/no-such-route-123").status_code == 404
    assert auth._rejected_log_state == {}

    assert client.get("/internal/cache/stats").status_code == 401
    # One entry for the matched template. Depending on the FastAPI version
    # the template is reported with or without the /internal prefix.
    (template,) = auth._rejected_log_state
    assert template in {"/internal/cache/stats", "/cache/stats"}


async def test_missing_key_is_logged_once_per_process(monkeypatch, caplog):
    import logging

    monkeypatch.setattr(settings, "ai_gateway_internal_key", "")
    monkeypatch.setattr(auth, "_missing_key_logged", False)
    caplog.set_level(logging.ERROR, logger=auth.logger.name)

    for _ in range(3):
        with pytest.raises(HTTPException) as exc:
            await auth.verify_internal_key(_request("anything"))
        assert exc.value.status_code == 503

    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    # One boolean, not a per-request or per-path structure.
    assert auth._missing_key_logged is True
    assert "AI_GATEWAY_INTERNAL_KEY is not configured" in errors[0].getMessage()


async def test_suppressed_rejections_are_counted_in_the_next_warning(monkeypatch, caplog):
    import logging

    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    monkeypatch.setattr(auth, "_rejected_log_state", {})
    clock = {"now": 50.0}
    monkeypatch.setattr(auth.time, "monotonic", lambda: clock["now"])
    caplog.set_level(logging.WARNING, logger=auth.logger.name)

    for _ in range(5):
        with pytest.raises(HTTPException):
            await auth.verify_internal_key(_rejected("/internal/budget", "/internal/budget"))
    clock["now"] += auth.REJECTED_KEY_LOG_INTERVAL_SECONDS
    with pytest.raises(HTTPException):
        await auth.verify_internal_key(_rejected("/internal/budget", "/internal/budget"))
    clock["now"] += auth.REJECTED_KEY_LOG_INTERVAL_SECONDS
    with pytest.raises(HTTPException):
        await auth.verify_internal_key(_rejected("/internal/budget", "/internal/budget"))

    messages = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert messages == [
        "Rejected internal request POST /internal/budget: invalid internal key",
        "Rejected internal request POST /internal/budget (4 more since last log): "
        "invalid internal key",
        "Rejected internal request POST /internal/budget: invalid internal key",
    ]


def test_include_internal_router_takes_an_extra_prefix(monkeypatch):
    from fastapi import APIRouter, FastAPI
    from fastapi.testclient import TestClient

    router = APIRouter()

    @router.get("/ping")
    async def ping():
        return {"ok": True}

    app = FastAPI()
    auth.include_internal_router(app, router, prefix="/extra", tags=["x"])
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client = TestClient(app)

    assert client.get("/internal/extra/ping").status_code == 401
    assert client.get("/internal/extra/ping", headers={"x-internal-key": "right-key"}).json() == {
        "ok": True
    }


def test_verify_internal_key_is_async():
    import inspect

    assert inspect.iscoroutinefunction(auth.verify_internal_key)


def test_include_internal_router_accepts_dependencies_none(monkeypatch):
    from fastapi import APIRouter, FastAPI
    from fastapi.testclient import TestClient

    router = APIRouter()

    @router.get("/ping")
    async def ping():
        return {"ok": True}

    app = FastAPI()
    auth.include_internal_router(app, router, dependencies=None)
    monkeypatch.setattr(settings, "ai_gateway_internal_key", "right-key")
    client = TestClient(app)

    assert client.get("/internal/ping").status_code == 401
    assert client.get("/internal/ping", headers={"x-internal-key": "right-key"}).status_code == 200
