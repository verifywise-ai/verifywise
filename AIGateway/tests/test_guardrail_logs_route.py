"""Self-contained tests for GET /guardrails/logs (the Logs page's guardrail tab).
The page builds its pagination from `total`; without it the page saw only the
rows on screen and never offered a second page. No live services."""

import os
import sys

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import routers.guardrails_crud as crud_router  # noqa: E402


def _client(monkeypatch, rows, total):
    seen = {}

    async def fake_logs(org_id, limit=50, offset=0):
        seen.update(org_id=org_id, limit=limit, offset=offset)
        return rows

    async def fake_count(org_id):
        seen["count_org_id"] = org_id
        return total

    monkeypatch.setattr(crud_router, "get_guardrail_logs", fake_logs)
    monkeypatch.setattr(crud_router, "count_guardrail_logs", fake_count)
    app = FastAPI()

    @app.middleware("http")
    async def org(request: Request, call_next):
        request.state.organization_id = 7
        return await call_next(request)

    app.include_router(crud_router.router)
    c = TestClient(app)
    c.seen = seen
    return c


def test_returns_the_orgs_total_beyond_the_page(monkeypatch):
    rows = [{"id": i, "action_taken": "blocked"} for i in range(25)]
    client = _client(monkeypatch, rows, total=1400)

    r = client.get("/guardrails/logs?limit=25&offset=50")

    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1400
    assert len(body["logs"]) == 25
    assert (body["limit"], body["offset"]) == (25, 50)
    assert client.seen == {"org_id": 7, "limit": 25, "offset": 50, "count_org_id": 7}


def test_total_is_zero_for_an_org_with_no_logs(monkeypatch):
    client = _client(monkeypatch, [], total=0)

    body = client.get("/guardrails/logs").json()

    assert body["total"] == 0
    assert body["logs"] == []
