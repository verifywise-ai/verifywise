"""
FastAPI TestClient tests for the experiments CRUD endpoints.

These exercise the routing + middleware contract without spinning up Postgres
or the background evaluation subprocess. Controllers are mocked, and the
``run_evaluation_task`` background coroutine is replaced with a no-op so the
real subprocess is never spawned.

Important: we deliberately avoid patching ``asyncio.create_task`` directly --
TestClient uses anyio internally, which relies on ``asyncio.create_task``,
and patching it globally hangs the event loop.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Dict
from unittest.mock import AsyncMock

import pytest


def _build_test_app():
    """
    Build a minimal FastAPI app that mounts only the evaluation_logs router and
    the TenantMiddleware. We avoid loading the full ``app.py`` because it
    triggers startup migrations and Redis init.

    We register an explicit HTTPException handler — Starlette's
    ``BaseHTTPMiddleware`` re-raises HTTPException through ``collapse_excgroups``,
    and the FastAPI default handler is sometimes bypassed in this code path.
    Registering it explicitly makes the contract deterministic across versions.
    """
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import JSONResponse
    from middlewares.middleware import TenantMiddleware
    from routers.evaluation_logs import router as evaluation_logs

    app = FastAPI()

    @app.exception_handler(HTTPException)
    async def _http_handler(_request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.add_middleware(TenantMiddleware)
    app.include_router(evaluation_logs)
    return app


@pytest.fixture
def patched_controllers(monkeypatch: pytest.MonkeyPatch) -> Dict[str, AsyncMock]:
    """Patch every controller used by the experiments routes."""
    from controllers import evaluation_logs as controller_module

    create_mock = AsyncMock(return_value={"experiment": {"id": "exp-1", "name": "test"}})
    get_list_mock = AsyncMock(return_value={"experiments": [], "total": 0})
    get_one_mock = AsyncMock(return_value={"experiment": {"id": "exp-1"}})
    update_mock = AsyncMock(return_value={"experiment": {"id": "exp-1", "name": "renamed"}})
    delete_mock = AsyncMock(return_value={"deleted": True})

    monkeypatch.setattr(controller_module, "create_experiment_controller", create_mock)
    monkeypatch.setattr(controller_module, "get_experiments_controller", get_list_mock)
    monkeypatch.setattr(controller_module, "get_experiment_by_id_controller", get_one_mock)
    monkeypatch.setattr(controller_module, "update_experiment_controller", update_mock)
    monkeypatch.setattr(controller_module, "delete_experiment_controller", delete_mock)

    return {
        "create": create_mock,
        "list": get_list_mock,
        "get_one": get_one_mock,
        "update": update_mock,
        "delete": delete_mock,
    }


@pytest.fixture
def no_background_task(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """
    Replace ``run_evaluation_task`` (the awaitable that gets passed to
    ``asyncio.create_task``) with a no-op AsyncMock. The mock returns a coroutine
    that finishes immediately, so the create_task call succeeds without launching
    a subprocess.
    """
    from routers import evaluation_logs as router_module

    no_op = AsyncMock(return_value=None)
    monkeypatch.setattr(router_module, "run_evaluation_task", no_op)
    return no_op


@pytest.fixture
def fake_get_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    PATCH/DELETE/POST handlers may open their own DB session via ``get_db``.
    Replace it with an async context manager that yields a mocked session.
    """
    from database import db as db_module
    from routers import evaluation_logs as router_module

    @asynccontextmanager
    async def _fake():
        yield AsyncMock()

    monkeypatch.setattr(db_module, "get_db", _fake)
    monkeypatch.setattr(router_module, "get_db", _fake, raising=False)


@pytest.fixture
def client(patched_controllers, no_background_task, fake_get_db):
    from fastapi.testclient import TestClient

    app = _build_test_app()
    return TestClient(app)


def _headers(org_id: int = 7) -> Dict[str, str]:
    return {
        "x-organization-id": str(org_id),
        "x-user-id": "42",
        "x-role": "Editor",
    }


# --------------------------------------------------------------------------- #
# Middleware: organization id resolution                                       #
# --------------------------------------------------------------------------- #


def test_legacy_tenant_id_header_is_accepted_by_middleware(client) -> None:
    """
    With only x-tenant-id (no x-organization-id), middleware passes but
    `_get_organization_id` raises 400 from inside the route. Confirms middleware
    accepts the legacy tenant header without raising.
    """
    res = client.get("/deepeval/experiments", headers={"x-tenant-id": "legacy-tenant-hash"})
    assert res.status_code == 400


def test_x_organization_id_is_propagated_to_request_state(
    client, patched_controllers
) -> None:
    """The middleware stashes organization_id on request.state so route handlers
    pick it up via _get_organization_id()."""
    res = client.get("/deepeval/experiments?project_id=p1", headers=_headers(org_id=99))
    assert res.status_code == 200
    call_args = patched_controllers["list"].await_args
    assert call_args.kwargs["organization_id"] == 99


# --------------------------------------------------------------------------- #
# POST /deepeval/experiments                                                   #
# --------------------------------------------------------------------------- #


def test_create_experiment_success(client, patched_controllers, no_background_task) -> None:
    body = {
        "project_id": "p1",
        "name": "Exp 1",
        "description": "test",
        "config": {"model": {"name": "m"}, "dataset": {}, "metrics": {}},
    }
    res = client.post("/deepeval/experiments", json=body, headers=_headers())
    assert res.status_code == 200
    assert res.json()["experiment"]["id"] == "exp-1"
    patched_controllers["create"].assert_awaited_once()
    # And the background task got scheduled
    assert no_background_task.call_count == 1
    bg_kwargs = no_background_task.call_args.kwargs
    assert bg_kwargs["experiment_id"] == "exp-1"
    assert bg_kwargs["organization_id"] == 7


def test_create_experiment_missing_name_422(client) -> None:
    body = {"project_id": "p1", "config": {}}  # missing required name
    res = client.post("/deepeval/experiments", json=body, headers=_headers())
    assert res.status_code == 422  # Pydantic validation


# --------------------------------------------------------------------------- #
# GET /deepeval/experiments                                                    #
# --------------------------------------------------------------------------- #


def test_list_experiments(client, patched_controllers) -> None:
    res = client.get("/deepeval/experiments?project_id=p1", headers=_headers())
    assert res.status_code == 200
    assert res.json() == {"experiments": [], "total": 0}
    patched_controllers["list"].assert_awaited_once()
    call_args = patched_controllers["list"].await_args
    assert call_args.kwargs["project_id"] == "p1"
    assert call_args.kwargs["organization_id"] == 7


def test_list_experiments_with_pagination(client, patched_controllers) -> None:
    res = client.get(
        "/deepeval/experiments?project_id=p1&limit=50&offset=10",
        headers=_headers(),
    )
    assert res.status_code == 200
    call_args = patched_controllers["list"].await_args
    assert call_args.kwargs["limit"] == 50
    assert call_args.kwargs["offset"] == 10


def test_list_experiments_invalid_limit_422(client) -> None:
    res = client.get("/deepeval/experiments?limit=99999", headers=_headers())
    assert res.status_code == 422  # limit max is 1000


# --------------------------------------------------------------------------- #
# GET /deepeval/experiments/{id}                                               #
# --------------------------------------------------------------------------- #


def test_get_experiment_by_id(client, patched_controllers) -> None:
    res = client.get("/deepeval/experiments/exp-1", headers=_headers())
    assert res.status_code == 200
    assert res.json()["experiment"]["id"] == "exp-1"
    patched_controllers["get_one"].assert_awaited_once()


# --------------------------------------------------------------------------- #
# Model API key validation endpoint                                            #
# --------------------------------------------------------------------------- #


def test_validate_model_with_valid_provider(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setenv("OPENAI_API_KEY", "sk-x")
    monkeypatch.setattr(
        router_module, "check_db_api_key_available", AsyncMock(return_value=False)
    )
    monkeypatch.setattr(
        router_module, "check_db_openrouter_available", AsyncMock(return_value=False)
    )

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gpt-4o-mini", "provider": "openai"},
        headers=_headers(),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is True
    assert body["provider"] == "openai"
    assert body["has_api_key"] is True


def test_validate_model_auto_detects_provider(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(
        router_module, "check_db_api_key_available", AsyncMock(return_value=False)
    )
    monkeypatch.setattr(
        router_module, "check_db_openrouter_available", AsyncMock(return_value=False)
    )

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "claude-3-opus"},
        headers=_headers(),
    )
    assert res.status_code == 200
    assert res.json()["provider"] == "anthropic"


def test_validate_model_returns_error_when_no_key(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(
        router_module, "check_db_api_key_available", AsyncMock(return_value=False)
    )
    monkeypatch.setattr(
        router_module, "check_db_openrouter_available", AsyncMock(return_value=False)
    )

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "claude-3-opus", "provider": "anthropic"},
        headers=_headers(),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is False
    assert "ANTHROPIC_API_KEY" in (body["error_message"] or "")
