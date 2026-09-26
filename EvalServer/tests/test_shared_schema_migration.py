"""
Unit tests for the startup data migration safety net
(``scripts/migrate_to_shared_schema.py``) and the orphaned-experiment cleanup
in ``app.py``.

No real database: sessions/engines are mocks and the DB helper functions are
monkeypatched, following the rest of the suite.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, List, Optional, Set
from unittest.mock import AsyncMock, MagicMock

import pytest

from scripts import migrate_to_shared_schema as m
from scripts.migration_config import get_all_tables_in_order

ALL_SHARED = set(get_all_tables_in_order()) | {m.MIGRATION_STATUS_TABLE}
DB_URL = "postgresql+asyncpg://test:test@localhost/verifywise_test"


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _result(rows: Optional[List[tuple]] = None, rowcount: int = 0) -> MagicMock:
    res = MagicMock()
    rows = rows or []
    res.fetchall.return_value = rows
    res.fetchone.return_value = rows[0] if rows else None
    res.rowcount = rowcount
    return res


def _session(execute_results: Optional[List[Any]] = None) -> AsyncMock:
    session = AsyncMock()
    if execute_results is not None:
        session.execute = AsyncMock(side_effect=execute_results)
    return session


def _patch_engine(monkeypatch: pytest.MonkeyPatch, session: AsyncMock) -> None:
    """Replace the engine/sessionmaker used by both entry points with mocks."""

    @asynccontextmanager
    async def _connect():
        yield AsyncMock()  # advisory-lock connection

    engine = MagicMock()
    engine.connect = _connect
    engine.dispose = AsyncMock()

    @asynccontextmanager
    async def _session_ctx():
        yield session

    monkeypatch.setattr(m, "create_async_engine", lambda url: engine)
    monkeypatch.setattr(m, "async_sessionmaker", lambda *a, **kw: _session_ctx)


def _patch_status(
    monkeypatch: pytest.MonkeyPatch,
    tables: Set[str],
    status: Optional[dict],
    stranded: Optional[List[int]] = None,
) -> dict:
    """Patch plan_migration's inputs; return the mocks that must not be hit on skip paths."""
    monkeypatch.setattr(m, "get_tables_in_schema", AsyncMock(return_value=tables))
    monkeypatch.setattr(m, "get_migration_status", AsyncMock(return_value=status))
    monkeypatch.setattr(m, "find_stranded_organizations", AsyncMock(return_value=stranded or []))
    mocks = {
        "ensure": AsyncMock(),
        "update": AsyncMock(),
        "migrate_org": AsyncMock(return_value=(True, {}, None)),
    }
    monkeypatch.setattr(m, "ensure_migration_status_table", mocks["ensure"])
    monkeypatch.setattr(m, "update_migration_status", mocks["update"])
    monkeypatch.setattr(m, "migrate_organization", mocks["migrate_org"])
    return mocks


# --------------------------------------------------------------------------- #
# schema_not_ready                                                             #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_plan_reports_schema_not_ready_when_shared_tables_missing(monkeypatch):
    _patch_status(monkeypatch, tables={m.MIGRATION_STATUS_TABLE, "llm_evals_projects"}, status=None)

    early, org_filter = await m.plan_migration(_session())

    assert early is not None
    assert early.status == "schema_not_ready"
    assert early.success is False
    assert "llm_evals_experiments" in early.errors[0]
    assert "alembic upgrade head" in early.errors[0]
    assert org_filter is None


@pytest.mark.asyncio
async def test_startup_entry_point_does_not_mark_completed_when_tables_missing(monkeypatch):
    mocks = _patch_status(monkeypatch, tables=set(), status=None)
    _patch_engine(monkeypatch, _session())

    result = await m.check_and_run_migration(DB_URL)

    assert result.status == "schema_not_ready"
    mocks["ensure"].assert_not_awaited()
    mocks["update"].assert_not_awaited()
    mocks["migrate_org"].assert_not_awaited()


@pytest.mark.asyncio
async def test_cli_entry_point_does_not_mark_completed_when_tables_missing(monkeypatch):
    mocks = _patch_status(monkeypatch, tables={m.MIGRATION_STATUS_TABLE}, status={"status": "pending"})
    _patch_engine(monkeypatch, _session())

    result = await m.migrate_to_shared_schema(DB_URL, drop_schemas_after=True)

    assert result.status == "schema_not_ready"
    assert result.success is False
    mocks["ensure"].assert_not_awaited()
    mocks["update"].assert_not_awaited()
    mocks["migrate_org"].assert_not_awaited()


@pytest.mark.asyncio
async def test_migrate_table_raises_when_target_table_missing(monkeypatch):
    monkeypatch.setattr(m, "get_row_count", AsyncMock(return_value=3))
    monkeypatch.setattr(
        m, "get_table_columns", AsyncMock(side_effect=[["id", "name"], []])
    )

    with pytest.raises(RuntimeError, match="does not exist"):
        await m.migrate_table(
            _session(),
            org_id=1,
            tenant_hash="abc123",
            table_name="llm_evals_projects",
            available_tables={"llm_evals_projects"},
            id_mapping=m.IdMapping(),
        )


# --------------------------------------------------------------------------- #
# already_completed short-circuit                                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_completed_healthy_db_short_circuits_before_table_guard(monkeypatch):
    mocks = _patch_status(
        monkeypatch, tables=ALL_SHARED, status={"status": "completed", "organizations_migrated": 2}
    )
    missing_guard = MagicMock(return_value=[])
    monkeypatch.setattr(m, "get_missing_shared_tables", missing_guard)
    _patch_engine(monkeypatch, _session())

    result = await m.check_and_run_migration(DB_URL)

    assert result.status == "already_completed"
    assert result.success is True
    assert result.organizations_migrated == 2
    missing_guard.assert_not_called()
    m.get_tables_in_schema.assert_awaited_once()
    mocks["ensure"].assert_not_awaited()
    mocks["update"].assert_not_awaited()
    mocks["migrate_org"].assert_not_awaited()


@pytest.mark.asyncio
async def test_cli_completed_healthy_db_short_circuits(monkeypatch):
    mocks = _patch_status(monkeypatch, tables=ALL_SHARED, status={"status": "completed"})
    _patch_engine(monkeypatch, _session())

    result = await m.migrate_to_shared_schema(DB_URL)

    assert result.status == "already_completed"
    mocks["update"].assert_not_awaited()
    mocks["migrate_org"].assert_not_awaited()


# --------------------------------------------------------------------------- #
# Stranded-data recovery                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_find_stranded_only_when_shared_empty_and_legacy_has_rows(monkeypatch):
    session = _session([_result([(1,), (2,), (3,)])])
    shared = {1: True, 2: False, 3: False}
    legacy = {m.get_tenant_hash(2): True, m.get_tenant_hash(3): False}
    has_shared = AsyncMock(side_effect=lambda s, org_id, t: shared[org_id])
    has_legacy = AsyncMock(side_effect=lambda s, tenant_hash: legacy[tenant_hash])
    monkeypatch.setattr(m, "org_has_shared_rows", has_shared)
    monkeypatch.setattr(m, "tenant_has_legacy_rows", has_legacy)

    stranded = await m.find_stranded_organizations(session, ALL_SHARED)

    assert stranded == [2]
    # Org 1 already has shared rows: its legacy schema is never inspected.
    checked = [call.args[1] for call in has_legacy.await_args_list]
    assert m.get_tenant_hash(1) not in checked


@pytest.mark.asyncio
async def test_plan_triggers_recovery_for_stranded_orgs(monkeypatch, capsys):
    _patch_status(monkeypatch, tables=ALL_SHARED, status={"status": "completed"}, stranded=[2])

    early, org_filter = await m.plan_migration(_session())

    assert early is None
    assert org_filter == {2}
    assert "Re-running the data migration" in capsys.readouterr().out


@pytest.mark.asyncio
async def test_recovery_reruns_migration_only_for_stranded_orgs(monkeypatch):
    mocks = _patch_status(monkeypatch, tables=ALL_SHARED, status={"status": "completed"}, stranded=[2])
    monkeypatch.setattr(m, "schema_exists", AsyncMock(return_value=True))
    session = _session([_result([(1, "Org one"), (2, "Org two")])])
    _patch_engine(monkeypatch, session)

    result = await m.migrate_to_shared_schema(DB_URL, drop_schemas_after=False)

    assert result.status == "just_completed"
    migrated_orgs = [call.args[1] for call in mocks["migrate_org"].await_args_list]
    assert migrated_orgs == [2]
    final = mocks["update"].await_args_list[-1].kwargs
    assert final["status"] == "completed"


@pytest.mark.asyncio
async def test_org_has_shared_rows_skips_missing_tables():
    session = _session([_result([(False,)]), _result([(True,)])])
    tables = {"llm_evals_organizations", "llm_evals_projects"}

    assert await m.org_has_shared_rows(session, 7, tables) is True
    queried = [str(call.args[0]) for call in session.execute.await_args_list]
    assert len(queried) == 2
    assert all("organization_id = :org_id" in q for q in queried)


# --------------------------------------------------------------------------- #
# app.py orphaned-experiment cleanup                                           #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_cleanup_logs_tenant_schema_failure_instead_of_swallowing(monkeypatch):
    import app as app_module
    from database import db as db_module

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _result(rowcount=0),  # shared-schema UPDATE
            _result([("abc123",)]),  # tenant schemas with llm_evals_experiments
            Exception("boom"),  # tenant UPDATE fails
        ]
    )

    @asynccontextmanager
    async def _nested():
        yield

    db.begin_nested = MagicMock(side_effect=lambda: _nested())

    @asynccontextmanager
    async def _get_db():
        yield db

    monkeypatch.setattr(db_module, "get_db", _get_db)
    logger = MagicMock()
    monkeypatch.setattr(app_module, "logger", logger)

    await app_module.cleanup_orphaned_experiments()

    listing_sql = str(db.execute.await_args_list[1].args[0])
    assert "llm_evals_experiments" in listing_sql
    assert "verifywise" in listing_sql
    warnings = [str(call.args[0]) for call in logger.warning.call_args_list]
    assert any("abc123" in w and "boom" in w for w in warnings)
    db.commit.assert_awaited_once()
