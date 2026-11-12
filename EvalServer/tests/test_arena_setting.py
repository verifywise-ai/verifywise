"""
Arena organization setting.

Covers the effective-value rule (stored value wins; with nothing stored, Arena
is on only for organizations that already have comparisons), the 403 every
Arena endpoint returns while Arena is off, and the admin-only write on
/settings/arena. No database: the CRUD layer and controllers are mocked.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

ORG_HEADERS = {"x-internal-key": "test-internal-key", "x-organization-id": "7", "x-user-id": "5"}


# --------------------------------------------------------------------------- #
# Effective value                                                             #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "stored, has_comparisons, expected",
    [
        (None, False, False),  # never set, never used: off by default
        (None, True, True),  # never set, already used: stays on
        (True, False, True),  # stored on wins over no data
        (False, True, False),  # stored off wins over existing data
        (True, True, True),
        (False, False, False),
    ],
)
def test_resolve_arena_enabled(stored: Optional[bool], has_comparisons: bool, expected: bool):
    from controllers.org_settings import resolve_arena_enabled

    assert resolve_arena_enabled(stored, has_comparisons) is expected


def _patch_db(monkeypatch: pytest.MonkeyPatch, stored: Optional[bool], has_comparisons: bool):
    from controllers import org_settings

    @asynccontextmanager
    async def fake_get_db():
        yield MagicMock()

    stored_mock = AsyncMock(return_value=stored)
    has_mock = AsyncMock(return_value=has_comparisons)
    insert_mock = AsyncMock()
    monkeypatch.setattr(org_settings, "get_db", fake_get_db)
    monkeypatch.setattr(org_settings, "get_stored_arena_enabled", stored_mock)
    monkeypatch.setattr(org_settings, "org_has_arena_comparisons", has_mock)
    monkeypatch.setattr(org_settings, "insert_arena_enabled_if_unset", insert_mock)
    return stored_mock, has_mock, insert_mock


@pytest.mark.asyncio
async def test_no_stored_value_and_no_comparisons_is_off(monkeypatch):
    from controllers.org_settings import get_arena_setting

    _, _, insert_mock = _patch_db(monkeypatch, stored=None, has_comparisons=False)
    assert await get_arena_setting(7) == {"enabled": False, "configured": False}
    insert_mock.assert_not_awaited()  # nothing is saved for orgs that never used Arena


@pytest.mark.asyncio
async def test_no_stored_value_with_comparisons_is_on(monkeypatch):
    from controllers.org_settings import get_arena_setting

    _, has_mock, insert_mock = _patch_db(monkeypatch, stored=None, has_comparisons=True)
    assert await get_arena_setting(7) == {"enabled": True, "configured": True}
    assert has_mock.await_args.args[0] == 7
    # Saved as on, so deleting the last comparison later can't turn Arena off.
    assert insert_mock.await_args.args[:2] == (7, True)


@pytest.mark.asyncio
async def test_stored_off_wins_over_existing_comparisons(monkeypatch):
    from controllers.org_settings import get_arena_setting

    _, has_mock, insert_mock = _patch_db(monkeypatch, stored=False, has_comparisons=True)
    assert await get_arena_setting(7) == {"enabled": False, "configured": True}
    has_mock.assert_not_awaited()
    insert_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_stored_on_wins_without_comparisons(monkeypatch):
    from controllers.org_settings import get_arena_setting

    _patch_db(monkeypatch, stored=True, has_comparisons=False)
    assert await get_arena_setting(7) == {"enabled": True, "configured": True}


@pytest.mark.asyncio
async def test_set_arena_setting_upserts_for_the_org(monkeypatch):
    from controllers import org_settings

    @asynccontextmanager
    async def fake_get_db():
        yield "db-session"

    upsert = AsyncMock()
    monkeypatch.setattr(org_settings, "get_db", fake_get_db)
    monkeypatch.setattr(org_settings, "upsert_arena_enabled", upsert)

    assert await org_settings.set_arena_setting(7, False, "5") == {
        "enabled": False,
        "configured": True,
    }
    upsert.assert_awaited_once_with(7, False, "5", "db-session")


# --------------------------------------------------------------------------- #
# HTTP: Arena endpoints refuse while off                                      #
# --------------------------------------------------------------------------- #


def _build_app(*routers):
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import JSONResponse
    from middlewares.middleware import TenantMiddleware

    app = FastAPI()

    @app.exception_handler(HTTPException)
    async def _http_handler(_request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.add_middleware(TenantMiddleware)
    for router in routers:
        app.include_router(router, prefix="/deepeval")
    return app


@pytest.fixture
def arena_client(monkeypatch: pytest.MonkeyPatch):
    from fastapi.responses import JSONResponse
    from fastapi.testclient import TestClient

    from controllers import org_settings
    from routers import deepeval_arena

    ok = AsyncMock(return_value=JSONResponse(status_code=200, content={"ok": True}))
    for name in (
        "create_arena_comparison_controller",
        "list_arena_comparisons_controller",
        "get_arena_comparison_status_controller",
        "get_arena_comparison_results_controller",
        "delete_arena_comparison_controller",
    ):
        monkeypatch.setattr(deepeval_arena, name, ok)

    enabled = AsyncMock(return_value=False)
    monkeypatch.setattr(org_settings, "is_arena_enabled", enabled)
    return TestClient(_build_app(deepeval_arena.router)), enabled, ok


ARENA_REQUESTS = [
    ("post", "/deepeval/arena/compare", {"name": "x", "contestants": []}),
    ("get", "/deepeval/arena/comparisons", None),
    ("get", "/deepeval/arena/comparisons/arena_1", None),
    ("get", "/deepeval/arena/comparisons/arena_1/results", None),
    ("delete", "/deepeval/arena/comparisons/arena_1", None),
]


@pytest.mark.parametrize("method, path, body", ARENA_REQUESTS)
def test_arena_endpoints_return_403_when_off(arena_client, method, path, body):
    from controllers.org_settings import ARENA_DISABLED_MESSAGE

    client, enabled, controller = arena_client
    kwargs = {"headers": ORG_HEADERS}
    if body is not None:
        kwargs["json"] = body
    res = client.request(method.upper(), path, **kwargs)

    assert res.status_code == 403
    assert res.json() == {"detail": ARENA_DISABLED_MESSAGE}
    enabled.assert_awaited_with(7)
    controller.assert_not_awaited()


@pytest.mark.parametrize("method, path, body", ARENA_REQUESTS)
def test_arena_endpoints_pass_through_when_on(arena_client, method, path, body):
    client, enabled, controller = arena_client
    enabled.return_value = True
    kwargs = {"headers": ORG_HEADERS}
    if body is not None:
        kwargs["json"] = body
    res = client.request(method.upper(), path, **kwargs)

    assert res.status_code == 200
    controller.assert_awaited()


# --------------------------------------------------------------------------- #
# HTTP: /settings/arena                                                       #
# --------------------------------------------------------------------------- #


@pytest.fixture
def settings_client(monkeypatch: pytest.MonkeyPatch):
    from fastapi.testclient import TestClient

    from routers import deepeval_settings

    get_mock = AsyncMock(return_value={"enabled": True, "configured": False})
    set_mock = AsyncMock(return_value={"enabled": False, "configured": True})
    monkeypatch.setattr(deepeval_settings, "get_arena_setting", get_mock)
    monkeypatch.setattr(deepeval_settings, "set_arena_setting", set_mock)
    return TestClient(_build_app(deepeval_settings.router)), get_mock, set_mock


def test_get_arena_setting_is_open_to_members(settings_client):
    client, get_mock, _ = settings_client
    res = client.get("/deepeval/settings/arena", headers=ORG_HEADERS)
    assert res.status_code == 200
    assert res.json() == {"enabled": True, "configured": False}
    get_mock.assert_awaited_once_with(7)


def test_put_arena_setting_requires_the_admin_header(settings_client):
    from controllers.org_settings import SETTINGS_FORBIDDEN_MESSAGE

    client, _, set_mock = settings_client
    for header_value in (None, "false", "1"):
        headers = dict(ORG_HEADERS)
        if header_value is not None:
            headers["x-can-manage-org-settings"] = header_value
        res = client.put("/deepeval/settings/arena", json={"enabled": False}, headers=headers)
        assert res.status_code == 403
        assert res.json() == {"detail": SETTINGS_FORBIDDEN_MESSAGE}
    set_mock.assert_not_awaited()


def test_put_arena_setting_saves_for_admins(settings_client):
    client, _, set_mock = settings_client
    res = client.put(
        "/deepeval/settings/arena",
        json={"enabled": False},
        headers={**ORG_HEADERS, "x-can-manage-org-settings": "true"},
    )
    assert res.status_code == 200
    assert res.json() == {"enabled": False, "configured": True}
    set_mock.assert_awaited_once_with(7, False, "5")


@pytest.mark.parametrize("body", [{"enabled": "yes"}, {"enabled": 1}, {}, {"enabled": True, "x": 1}])
def test_put_arena_setting_rejects_bad_bodies(settings_client, body):
    client, _, set_mock = settings_client
    res = client.put(
        "/deepeval/settings/arena",
        json=body,
        headers={**ORG_HEADERS, "x-can-manage-org-settings": "true"},
    )
    assert res.status_code == 422
    set_mock.assert_not_awaited()
