"""The gateway's change-history writers must use the columns the tables have.

ai_gateway_endpoint_change_history and ai_gateway_guardrail_change_history
were created with changed_by_user_id (a0001), and the backend reads that
column. The writers inserted into a changed_by column that does not exist, so
every insert failed inside a try/except and both histories stayed empty.

No live services: the database session is replaced with a fake."""

import os
import sys
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import utils.change_history as change_history  # noqa: E402


class FakeDb:
    def __init__(self):
        self.statements = []

    async def execute(self, stmt, params):
        self.statements.append((" ".join(str(stmt).split()), params))

    async def commit(self):
        pass


def _fake(monkeypatch):
    db = FakeDb()

    @asynccontextmanager
    async def fake_get_db():
        yield db

    monkeypatch.setattr(change_history, "get_db", fake_get_db)
    return db


async def test_endpoint_history_writes_changed_by_user_id(monkeypatch):
    db = _fake(monkeypatch)
    await change_history.record_endpoint_change(
        organization_id=1, endpoint_id=2, changed_by=3, action="updated"
    )
    sql, params = db.statements[0]
    assert "changed_by_user_id" in sql
    assert " changed_by," not in sql
    assert 3 in params.values()


async def test_guardrail_history_writes_changed_by_user_id(monkeypatch):
    db = _fake(monkeypatch)
    await change_history.record_guardrail_change(
        organization_id=1, guardrail_id=2, changed_by=3, action="updated"
    )
    sql, params = db.statements[0]
    assert "changed_by_user_id" in sql
    assert " changed_by," not in sql
    assert 3 in params.values()
