"""
Tests for the router-level internal-key dependency.

``verify_internal_key_dependency`` is the ``Depends()`` form of the middleware
check: it must reject unauthenticated requests even when TenantMiddleware is
not in the stack, and every router mounted in ``app.py`` must carry it.
"""

from __future__ import annotations

import pytest


def _build_test_app():
    """Minimal app with the dependency applied at router level, no middleware."""
    from fastapi import APIRouter, Depends, FastAPI
    from middlewares.auth import verify_internal_key_dependency

    app = FastAPI()
    router = APIRouter(dependencies=[Depends(verify_internal_key_dependency)])

    @router.get("/deepeval/probe")
    async def _probe():
        return {"ok": True}

    app.include_router(router)
    return app


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    return TestClient(_build_test_app())


def test_missing_key_returns_401(client) -> None:
    res = client.get("/deepeval/probe")
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid internal key"


def test_wrong_key_returns_401(client) -> None:
    res = client.get("/deepeval/probe", headers={"x-internal-key": "wrong-key"})
    assert res.status_code == 401


def test_unconfigured_key_returns_503(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EVAL_SERVER_INTERNAL_KEY")
    res = client.get("/deepeval/probe", headers={"x-internal-key": "anything"})
    assert res.status_code == 503
    assert res.json()["detail"] == "Internal key not configured"


def test_correct_key_returns_200(client) -> None:
    res = client.get("/deepeval/probe", headers={"x-internal-key": "test-internal-key"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}


# --------------------------------------------------------------------------- #
# Wiring: every router in the real app must carry the dependency               #
# --------------------------------------------------------------------------- #


def test_all_app_routes_enforce_internal_key() -> None:
    """Import-only wiring check — startup events (migrations, Redis) do not run."""
    from fastapi.routing import APIRoute
    from app import app
    from middlewares.auth import verify_internal_key_dependency

    api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
    assert api_routes, "expected the real app to expose API routes"

    for route in api_routes:
        if route.path == "/":  # liveness root stays exempt
            continue
        dependency_calls = [d.call for d in route.dependencies]
        assert verify_internal_key_dependency in dependency_calls, (
            f"{route.path} is missing the internal-key dependency"
        )
