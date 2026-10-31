"""Deleting an endpoint must not widen a virtual key: an empty
allowed_endpoint_ids means "every endpoint" to the gateway, so a key's last
endpoint id is left in place (it then names nothing, and the key can call
nothing). No live services; the SQL itself was checked against Postgres."""

import os
import sys
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import crud.endpoints as endpoints_crud  # noqa: E402


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class FakeDb:
    def __init__(self):
        self.statements = []
        self.committed = False

    async def execute(self, stmt, params):
        self.statements.append(" ".join(str(stmt).split()))
        if "DELETE FROM ai_gateway_endpoints" in self.statements[-1]:
            return FakeResult([(params["id"],)])
        return FakeResult([])

    async def commit(self):
        self.committed = True


async def test_the_strip_never_empties_a_keys_endpoint_list(monkeypatch):
    db = FakeDb()

    @asynccontextmanager
    async def fake_get_db():
        yield db

    monkeypatch.setattr(endpoints_crud, "get_db", fake_get_db)
    assert await endpoints_crud.delete_endpoint(2, 9) is True

    strip = next(s for s in db.statements if s.startswith("UPDATE ai_gateway_virtual_keys"))
    assert "array_remove(allowed_endpoint_ids, :id)" in strip
    # what is left after removing every copy must be non-empty, so [9, 9] is kept too
    assert "cardinality(array_remove(allowed_endpoint_ids, :id)) > 0" in strip
    assert db.committed is True
