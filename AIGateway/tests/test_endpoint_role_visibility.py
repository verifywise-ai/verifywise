"""GET /endpoints/{id} applies role visibility as the gateway enforces it:
an empty or NULL allowed_role_ids is open to every role (tenant_proxy). It
shares role_visibility with the endpoints list, so the two agree.

No live services: the database session and the CRUD layer are replaced with
fakes, so these run in CI without Postgres."""

import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

import crud.endpoints as endpoints_crud
import routers.endpoints as router

pytestmark = pytest.mark.asyncio

ROLE_PREDICATE = endpoints_crud.role_visibility(3)[0]


def test_the_shared_rule_is_the_gateways():
    # Pinned here because ROLE_PREDICATE comes from the code under test:
    # NULL or empty allowed_role_ids is open to every role, else the role
    # must be listed (tenant_proxy.resolve_endpoint).
    for clause in (
        "e.allowed_role_ids IS NULL",
        "cardinality(e.allowed_role_ids) = 0",
        ":role_id = ANY(e.allowed_role_ids)",
    ):
        assert clause in ROLE_PREDICATE


def _request(role="Editor", body=None):
    return SimpleNamespace(
        state=SimpleNamespace(organization_id=1, user_id=7, role=role),
        json=AsyncMock(return_value=body or {}),
    )


def _row(**over):
    base = {
        "id": 5,
        "slug": "gpt",
        "display_name": "GPT",
        "allowed_role_ids": [1],
        "created_at": None,
        "updated_at": None,
    }
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# CRUD: the SQL that get_endpoint_by_id sends
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_db(monkeypatch):
    calls = []

    @asynccontextmanager
    async def get_db():
        result = MagicMock()
        result.mappings.return_value.first.return_value = _row()
        db = MagicMock()

        async def execute(sql, params):
            calls.append((sql, params))
            return result

        db.execute = execute
        yield db

    monkeypatch.setattr(endpoints_crud, "get_db", get_db)
    return calls


def _sql_text(sql) -> str:
    return " ".join(str(sql).split())


async def test_crud_role_is_required(fake_db):
    with pytest.raises(TypeError):
        await endpoints_crud.get_endpoint_by_id(1, 5)


async def test_crud_without_role_is_unfiltered(fake_db):
    row = await endpoints_crud.get_endpoint_by_id(1, 5, role_id=None)

    assert row["id"] == 5
    sql, params = fake_db[0]
    assert "allowed_role_ids IS NULL" not in _sql_text(sql)
    assert params == {"org_id": 1, "id": 5}


async def test_crud_with_role_adds_visibility_predicate(fake_db):
    await endpoints_crud.get_endpoint_by_id(1, 5, role_id=3)

    sql, params = fake_db[0]
    assert ROLE_PREDICATE in _sql_text(sql)
    assert params == {"org_id": 1, "id": 5, "role_id": 3}
    # Every bind parameter in the statement is supplied.
    bound = set(sql.compile(dialect=postgresql.dialect()).params)
    assert bound == set(params)


async def test_crud_role_zero_still_filters(fake_db):
    # get_role_id returns 0 for an unknown role; it must not mean "unfiltered".
    await endpoints_crud.get_endpoint_by_id(1, 5, role_id=0)

    sql, params = fake_db[0]
    assert ROLE_PREDICATE in _sql_text(sql)
    assert params["role_id"] == 0


# ---------------------------------------------------------------------------
# Router: which role each route passes
# ---------------------------------------------------------------------------


@pytest.fixture
def crud_calls(monkeypatch):
    state = {"calls": [], "row": _row()}

    async def get_endpoint_by_id(org_id, endpoint_id, *, role_id):
        state["calls"].append({"org_id": org_id, "id": endpoint_id, "role_id": role_id})
        return dict(state["row"]) if state["row"] else None

    monkeypatch.setattr(router.endpoints_crud, "get_endpoint_by_id", get_endpoint_by_id)
    monkeypatch.setattr(
        router.endpoints_crud, "update_endpoint", AsyncMock(return_value=_row())
    )
    monkeypatch.setattr(router.endpoints_crud, "delete_endpoint", AsyncMock(return_value=True))
    monkeypatch.setattr(router, "record_endpoint_change", AsyncMock())
    monkeypatch.setattr(router, "notify_config_change", AsyncMock())
    return state


@pytest.mark.parametrize(
    "role,role_id", [("Admin", 1), ("Reviewer", 2), ("Editor", 3), ("Auditor", 4)]
)
async def test_get_passes_callers_role(crud_calls, role, role_id):
    out = await router.get_endpoint(5, _request(role))

    assert out["endpoint"]["id"] == 5
    assert crud_calls["calls"] == [{"org_id": 1, "id": 5, "role_id": role_id}]


async def test_get_hidden_endpoint_is_404(crud_calls):
    crud_calls["row"] = None

    with pytest.raises(HTTPException) as exc:
        await router.get_endpoint(5, _request("Editor"))

    assert exc.value.status_code == 404
    assert exc.value.detail == "Endpoint not found"


async def test_update_reads_unfiltered(crud_calls):
    await router.update_endpoint(5, _request("Admin", {"display_name": "New"}))

    assert crud_calls["calls"][0]["role_id"] is None


async def test_delete_reads_unfiltered(crud_calls):
    await router.delete_endpoint(5, _request("Admin"))

    assert crud_calls["calls"][0]["role_id"] is None
