"""Self-contained tests for POST /guardrails/test (the "Test guardrails" dialog):
the org's active rules and settings run on sample text. No live services."""

import os
import sys
import threading

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import routers.guardrails as guardrails_router  # noqa: E402
import services.guardrail_service as gs  # noqa: E402

BLOCK_CODENAME = {
    "id": 1, "guardrail_type": "content_filter", "name": "Project codename",
    "config": {"type": "keyword", "pattern": "bluebird"}, "scope": "input", "action": "block", "is_active": True,
}
MASK_TICKET = {
    "id": 2, "guardrail_type": "content_filter", "name": "Ticket ids",
    "config": {"type": "regex", "pattern": r"TCK-\d+"}, "scope": "input", "action": "mask", "is_active": True,
}


def _client(monkeypatch, rules, settings=None):
    seen = {}

    async def fake_config(org_id):
        seen["org_id"] = org_id
        return rules, settings or {}

    monkeypatch.setattr(guardrails_router, "get_guardrail_config", fake_config)
    app = FastAPI()

    @app.middleware("http")
    async def org(request: Request, call_next):
        request.state.organization_id = 7
        return await call_next(request)

    app.include_router(guardrails_router.router)
    c = TestClient(app)
    c.seen = seen
    return c


@pytest.fixture
def client(monkeypatch):
    return _client(monkeypatch, [BLOCK_CODENAME])


def test_runs_the_orgs_active_rules(client):
    r = client.post("/guardrails/test", json={"text": "Ship bluebird on Friday"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert client.seen["org_id"] == 7
    assert data["would_block"] is True
    assert [d["guardrail_type"] for d in data["detections"]] == ["content_filter"]


def test_masking_uses_the_orgs_replacement_setting(monkeypatch):
    client = _client(monkeypatch, [MASK_TICKET], {"content_filter_replacement": "[ticket]"})
    data = client.post("/guardrails/test", json={"text": "See TCK-4471 and TCK-9"}).json()["data"]
    assert data["would_block"] is False
    assert data["masked_preview"] == "See [ticket] and [ticket]"
    assert [d["action"] for d in data["detections"]] == ["mask", "mask"]


def test_clean_text_is_not_blocked(client):
    data = client.post("/guardrails/test", json={"text": "Nothing to see here"}).json()["data"]
    assert data["would_block"] is False
    assert data["detections"] == []


@pytest.mark.parametrize("body", [{}, {"text": ""}, {"text": "   "}, {"text": 42}, ["text"]])
def test_sample_text_is_required(client, body):
    r = client.post("/guardrails/test", json=body)
    assert r.status_code == 400


def test_sample_text_has_a_length_limit(client):
    r = client.post("/guardrails/test", json={"text": "a" * (guardrails_router.MAX_TEST_TEXT + 1)})
    assert r.status_code == 400


def test_non_json_body_is_rejected(client):
    r = client.post("/guardrails/test", content=b"not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400


def test_text_the_response_cannot_encode_is_rejected(client):
    # JSON can carry a lone UTF-16 surrogate; echoing it back as UTF-8 would 500.
    r = client.post("/guardrails/test", content=b'{"text": "half an emoji \\ud83d"}',
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 400


def test_scans_on_the_scan_thread_not_the_event_loop(monkeypatch):
    # The preview can scan 20k characters with Presidio; on the event loop it
    # would stall every other request, as the live proxy and MCP scans would.
    seen = {}
    real_scan = gs.scan_text

    def recording_scan(*args, **kwargs):
        seen["thread"] = threading.current_thread().name
        return real_scan(*args, **kwargs)

    monkeypatch.setattr(gs, "scan_text", recording_scan)
    r = _client(monkeypatch, [BLOCK_CODENAME]).post("/guardrails/test", json={"text": "Ship bluebird"})
    assert r.status_code == 200
    assert r.json()["data"]["would_block"] is True
    assert "thread" in seen, "the route did not scan through scan_text_async (sync scan on the event loop?)"
    assert seen["thread"].startswith(gs.SCAN_THREAD_PREFIX)
