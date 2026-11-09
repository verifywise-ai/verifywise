"""
Shared helpers for the self-contained unit suite (tests/unit/).

Everything here mocks the database, Redis, and LiteLLM — no live services.
"""

import os
import sys
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))


class FakeResult:
    """Mimics sqlalchemy.Result: .mappings() returns self, then fetchone/fetchall."""

    def __init__(self, row=None, rows=None):
        self._row = row
        self._rows = list(rows) if rows is not None else []

    def mappings(self):
        return self

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class FakeSession:
    """Records queries and replays queued FakeResults."""

    def __init__(self, results=None):
        self._results = list(results or [])
        self.queries = []  # [(statement, params)] in call order
        self.commits = 0

    async def execute(self, statement, params=None):
        self.queries.append((str(statement), params))
        if not self._results:
            return FakeResult()
        result = self._results.pop(0)
        return result() if callable(result) else result

    async def commit(self):
        self.commits += 1


def make_get_db(session):
    """A drop-in replacement for database.db.get_db yielding the fake session."""

    @asynccontextmanager
    async def fake_get_db():
        yield session

    return fake_get_db


class FakeRedisPipeline:
    """In-memory sorted-set sliding window, same contract as redis.asyncio pipeline.

    check_rate_limit issues zremrangebyscore/zcard/zadd/expire for ONE key per
    pipeline, so the key is captured from the first op. `count_index` mirrors
    the real check: results[1] (zcard) is compared against rpm.
    """

    def __init__(self, store):
        self._store = store
        self._key = None
        self._ops = []

    def _remember(self, key):
        if self._key is None:
            self._key = key
        return self

    def zremrangebyscore(self, key, min_, max_):
        self._remember(key)
        self._ops.append(("zremrangebyscore", max_))
        return self

    def zcard(self, key):
        self._remember(key)
        self._ops.append(("zcard",))
        return self

    def zadd(self, key, mapping):
        self._remember(key)
        # Requests in the same microsecond would collide on str(time.time());
        # a member suffix keeps every request a distinct sorted-set member.
        unique = {f"{m}#{len(self._store.get(self._key, {}))}": score for m, score in mapping.items()}
        self._ops.append(("zadd", unique))
        return self

    def expire(self, key, seconds):
        self._remember(key)
        self._ops.append(("expire",))
        return self

    async def execute(self):
        import time

        members = self._store.setdefault(self._key, {})
        results = []
        for op in self._ops:
            if op[0] == "zremrangebyscore":
                cutoff = op[1]
                for m in [m for m, s in list(members.items()) if s <= cutoff]:
                    del members[m]
                results.append(0)
            elif op[0] == "zcard":
                results.append(len(members))
            elif op[0] == "zadd":
                for m, score in op[1].items():
                    members[m] = score
                results.append(1)
            elif op[0] == "expire":
                results.append(True)
        return results


class FakeRedis:
    """Minimal redis.asyncio stand-in backed by a dict of sorted sets."""

    def __init__(self):
        self._store = {}

    def pipeline(self):
        return FakeRedisPipeline(self._store)

    def window_count(self, key):
        return len(self._store.get(key, {}))


@pytest.fixture
def fake_request():
    """Minimal stand-in for fastapi.Request (headers only)."""

    def _make(headers=None):
        return SimpleNamespace(headers=headers or {})

    return _make
