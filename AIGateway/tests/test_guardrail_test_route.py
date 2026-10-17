"""Self-contained tests for POST /guardrails/test (the "Test guardrails" dialog):
the org's active rules run on sample text. No live services."""

import os
import sys

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import routers.guardrails_crud as guardrails_crud  # noqa: E402

BLOCK_SECRET = {
    "id": 1, "guardrail_type": "content_filter", "name": "Project codename",
    "config": {"type": "keyword", "pattern": "bluebird"}, "scope": "input", "action": "block", "is_active": True,
}


@pytest.fixture
def client(monkeypatch):
    seen = {}

    async def fake_config(org_id):
        seen["org_id"] = org_id
        return [BLOCK_SECRET], {}

    monkeypatch.setattr(guardrails_crud, "get_guardrail_config", fake_config)
    app = FastAPI()

    @app.middleware("http")
    async def org(request: Request, call_next):
        request.state.organization_id = 7
        return await call_next(request)

    app.include_router(guardrails_crud.router)
    c = TestClient(app)
    c.seen = seen
    return c


def test_runs_the_orgs_active_rules(client):
    r = client.post("/guardrails/test", json={"text": "Ship bluebird on Friday"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert client.seen["org_id"] == 7
    assert data["would_block"] is True
    assert [d["guardrail_type"] for d in data["detections"]] == ["content_filter"]


def test_clean_text_is_not_blocked(client):
    data = client.post("/guardrails/test", json={"text": "Nothing to see here"}).json()["data"]
    assert data["would_block"] is False
    assert data["detections"] == []


@pytest.mark.parametrize("body", [{}, {"text": ""}, {"text": "   "}, {"text": 42}, ["text"]])
def test_sample_text_is_required(client, body):
    r = client.post("/guardrails/test", json=body)
    assert r.status_code == 400


def test_sample_text_has_a_length_limit(client):
    r = client.post("/guardrails/test", json={"text": "a" * (guardrails_crud.MAX_TEST_TEXT + 1)})
    assert r.status_code == 400


def test_non_json_body_is_rejected(client):
    r = client.post("/guardrails/test", content=b"not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400
