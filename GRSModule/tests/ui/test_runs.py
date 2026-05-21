import pytest
from unittest.mock import patch


def test_get_run_status_idle(client):
    resp = client.get("/api/run/status")
    assert resp.status_code == 200
    assert resp.json()["state"] == "idle"


def test_post_run_already_running_returns_409(client):
    from ui.backend.state import run_state
    run_state.state = "running"
    resp = client.post("/api/run", json={
        "dataset_version": "v0.1", "stages": ["seeds"], "params": {}
    })
    assert resp.status_code == 409
    run_state.state = "idle"


def test_post_run_missing_api_key_returns_400(client, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    resp = client.post("/api/run", json={
        "dataset_version": "v0.1",
        "stages": ["infer"],
        "params": {"infer_provider": "openrouter"}
    })
    assert resp.status_code == 400
    assert "OPENROUTER_API_KEY" in resp.json()["detail"]


def test_post_run_mock_provider_skips_api_key_check(client, grs_root, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with patch("ui.backend.services.runner._execute_stages"):
        resp = client.post("/api/run", json={
            "dataset_version": "v0.1",
            "stages": ["infer"],
            "params": {"infer_provider": "mock"}
        })
    assert resp.status_code == 202
    from ui.backend.state import run_state
    run_state.state = "idle"


def test_delete_run_when_idle_returns_409(client):
    resp = client.delete("/api/run")
    assert resp.status_code == 409


def test_get_runs_empty(client, grs_root):
    resp = client.get("/api/runs")
    assert resp.status_code == 200
    assert resp.json()["runs"] == []
