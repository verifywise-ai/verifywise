import asyncio
import inspect
import os
import re
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# Add src to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import crud.guardrails as guardrails_crud
import routers.spend as spend_router
from crud.spend import get_spend_by_day

PASSED_PARAMS = {"org_id", "start_date", "end_date"}


def _compiled_params(sql) -> set[str]:
    return set(sql.compile(dialect=postgresql.dialect()).params)


# Regression: the hourly ("1d") query built its "HH:00" labels with a literal
# ':00'. SQLAlchemy text() parses ":00" as a bind parameter, so every
# GET /spend?period=1d failed with "A value is required for bind parameter
# '00'" and the dashboard's 1-day view returned 500.
async def _captured_sql(period: str, rows=None):
    result = MagicMock()
    result.fetchall.return_value = rows or []
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    out = await get_spend_by_day(db, 1, "2026-09-22", "2026-09-23", period)
    return db.execute.await_args.args[0], out


@pytest.mark.parametrize("period", ["1d", "7d", "30d", "90d"])
async def test_only_passed_bind_params(period):
    sql, _ = await _captured_sql(period)
    params = _compiled_params(sql)
    assert params, "query should bind org_id at least"
    assert params <= PASSED_PARAMS


async def test_hourly_labels_formatted_in_python():
    bucket = datetime(2026, 9, 23, 7, 0, tzinfo=timezone.utc)
    row = {"period": bucket, "total_cost": 0, "total_requests": 0, "total_tokens": 0}
    _, out = await _captured_sql("1d", rows=[row])
    assert out[0]["period"] == "07:00"


# Same bug class: `INTERVAL ':retention_days days'` put the bind parameter
# inside a string literal, so the guardrail log purge could never run.
def test_purge_sql_has_no_bind_param_inside_a_literal():
    source = inspect.getsource(guardrails_crud.purge_guardrail_logs)
    sql = text(re.findall(r'"""(.*?)"""', source, re.S)[1])
    compiled = str(sql.compile(dialect=postgresql.dialect()))
    assert _compiled_params(sql) == {"org_id", "retention_days", "batch_size"}
    assert not re.search(r"'[^']*%\(\w+\)s[^']*'", compiled)


# Regression: the summary route ran its sub-queries with asyncio.gather on one
# AsyncSession, which SQLAlchemy forbids ("concurrent operations are not
# permitted"). The fake session fails if two operations overlap.
async def test_spend_summary_never_overlaps_session_operations(monkeypatch):
    in_flight = 0

    async def execute(*_args, **_kwargs):
        nonlocal in_flight
        in_flight += 1
        try:
            assert in_flight == 1, "concurrent operations on one session"
            await asyncio.sleep(0)
            result = MagicMock()
            result.fetchall.return_value = []
            result.fetchone.return_value = None
            result.mappings.return_value.first.return_value = None
            result.mappings.return_value.all.return_value = []
            return result
        finally:
            in_flight -= 1

    db = MagicMock()
    db.execute = execute

    @asynccontextmanager
    async def fake_get_db():
        yield db

    monkeypatch.setattr(spend_router, "get_db", fake_get_db)
    monkeypatch.setattr(spend_router, "verify_internal_key", lambda _request: None)
    monkeypatch.setattr(spend_router, "get_org_id", lambda _request: 1)

    for name in (
        "get_spend_summary",
        "get_spend_by_day",
        "get_spend_by_model",
        "get_spend_by_provider",
        "get_error_rate_by_day",
        "get_tokens_per_request_by_endpoint",
    ):
        async def call(session, *_args, **_kwargs):
            await session.execute(None)
            return []

        monkeypatch.setattr(spend_router.spend_crud, name, call)

    response = await spend_router.spend_summary(MagicMock(), period="1d")
    assert response["period"] == "1d"


# The dashboard's first-time check must not count every log: EXISTS stops at
# the first row, COUNT(*) scans the organisation's whole history.
@pytest.mark.parametrize("found", [True, False])
async def test_has_spend_logs_uses_exists(found):
    from crud.spend import has_spend_logs

    result = MagicMock()
    result.scalar.return_value = found
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)

    assert await has_spend_logs(db, 7) is found
    sql, params = db.execute.await_args.args
    assert "EXISTS" in str(sql) and "COUNT" not in str(sql).upper()
    assert params == {"org_id": 7}
