def test_get_config_obligations(client, grs_root):
    (grs_root / "configs" / "obligations.yaml").write_text("version: 1\n")
    resp = client.get("/api/configs/obligations")
    assert resp.status_code == 200
    assert resp.json()["content"] == "version: 1\n"


def test_get_config_unknown_returns_404(client):
    resp = client.get("/api/configs/nonexistent")
    assert resp.status_code == 404


def test_put_config_writes_file(client, grs_root):
    resp = client.put("/api/configs/models", json={"content": "new: content\n"})
    assert resp.status_code == 200
    assert (grs_root / "configs" / "models.yaml").read_text() == "new: content\n"


def test_put_config_unknown_returns_404(client):
    resp = client.put("/api/configs/nonexistent", json={"content": ""})
    assert resp.status_code == 404


def test_get_config_templates(client, grs_root):
    (grs_root / "configs" / "templates" / "base_scenarios.yaml").write_text("t: 1\n")
    resp = client.get("/api/configs/templates")
    assert resp.status_code == 200
    assert "t: 1" in resp.json()["content"]
