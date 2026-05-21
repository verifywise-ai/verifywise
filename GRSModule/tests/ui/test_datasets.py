def test_get_datasets_empty(client, grs_root):
    resp = client.get("/api/datasets")
    assert resp.status_code == 200
    assert resp.json()["versions"] == []


def test_get_datasets_lists_versions(client, grs_root):
    (grs_root / "datasets" / "alpha").mkdir(parents=True)
    (grs_root / "datasets" / "beta").mkdir(parents=True)
    resp = client.get("/api/datasets")
    assert resp.status_code == 200
    versions = resp.json()["versions"]
    assert set(versions) == {"alpha", "beta"}


def test_get_datasets_sorted_by_recency(client, grs_root, tmp_path):
    import time
    (grs_root / "datasets" / "older").mkdir(parents=True)
    time.sleep(0.01)
    (grs_root / "datasets" / "newer").mkdir(parents=True)
    resp = client.get("/api/datasets")
    versions = resp.json()["versions"]
    assert versions[0] == "newer"
