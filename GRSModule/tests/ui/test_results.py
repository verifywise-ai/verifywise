import json
import pytest


def test_leaderboard_not_found(client):
    resp = client.get("/api/results/leaderboard?dataset_version=missing")
    assert resp.status_code == 404


def test_leaderboard_returns_data(client, grs_root):
    final = grs_root / "datasets" / "v0.1" / "final"
    final.mkdir(parents=True)
    payload = {
        "score_max": 4.0,
        "dimensions": ["boundary_management", "constraint_adherence"],
        "rows": [{"candidate_model_id": "m1", "mean_grs": 2.0, "grs_score_100": 50.0}]
    }
    (final / "leaderboard.json").write_text(json.dumps(payload))
    resp = client.get("/api/results/leaderboard?dataset_version=v0.1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dimensions"] == ["boundary_management", "constraint_adherence"]
    assert len(data["rows"]) == 1


def test_summary_returns_null_for_missing_files(client, grs_root):
    resp = client.get("/api/results/summary?dataset_version=v0.1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["scenarios"] is None
    assert data["responses"] is None


def test_summary_returns_counts(client, grs_root):
    final = grs_root / "datasets" / "v0.1" / "final"
    responses = final / "responses"
    responses.mkdir(parents=True)
    (final / "scenarios.jsonl").write_text('{"id":"s1"}\n{"id":"s2"}\n')
    (responses / "m1.jsonl").write_text('{"id":"r1"}\n')
    (responses / "m1.jsonl.failures.jsonl").write_text("")
    resp = client.get("/api/results/summary?dataset_version=v0.1")
    data = resp.json()
    assert data["scenarios"] == 2
    assert data["responses"] == 1
