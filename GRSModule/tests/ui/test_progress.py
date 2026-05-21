import pytest


def test_get_progress_infer_empty(client, grs_root):
    resp = client.get("/api/progress/infer?dataset_version=v0.1")
    assert resp.status_code == 200
    assert resp.json()["models"] == []


def test_get_progress_unsupported_stage_returns_400(client):
    resp = client.get("/api/progress/seeds?dataset_version=v0.1")
    assert resp.status_code == 400


def test_get_progress_returns_model_counts(client, grs_root):
    final = grs_root / "datasets" / "v0.1" / "final"
    (final / "responses").mkdir(parents=True)
    (final / "scenarios.jsonl").write_text('{"id":"s1"}\n{"id":"s2"}\n')
    (final / "responses" / "m1.jsonl").write_text('{"id":"r1"}\n')
    (final / "responses" / "m1.jsonl.failures.jsonl").write_text("")
    resp = client.get("/api/progress/infer?dataset_version=v0.1")
    assert resp.status_code == 200
    models = resp.json()["models"]
    assert len(models) == 1
    assert models[0]["model_id"] == "m1"
    assert models[0]["completed"] == 1
    assert models[0]["total"] == 2
