import json
from pathlib import Path
from ui.backend.services.snapshot import write_snapshot, write_result


def test_write_snapshot_creates_timestamped_dir(tmp_path):
    _setup_configs(tmp_path)
    snapshot_dir = write_snapshot(tmp_path, "v0.1", {"stages": ["seeds"]})
    assert snapshot_dir.exists()
    assert "run_" in snapshot_dir.name
    assert (snapshot_dir.parent.name) == "configs_snapshot"


def test_write_snapshot_copies_yaml_files(tmp_path):
    _setup_configs(tmp_path)
    snapshot_dir = write_snapshot(tmp_path, "v0.1", {})
    assert (snapshot_dir / "obligations.yaml").exists()
    assert (snapshot_dir / "run_config.yaml").exists()


def test_write_snapshot_writes_run_config_json(tmp_path):
    _setup_configs(tmp_path)
    request = {"dataset_version": "v0.1", "stages": ["seeds"], "params": {"seed": 42}}
    snapshot_dir = write_snapshot(tmp_path, "v0.1", request)
    data = json.loads((snapshot_dir / "run_config.json").read_text())
    assert data["stages"] == ["seeds"]
    assert data["params"]["seed"] == 42


def test_write_result_success(tmp_path):
    snapshot_dir = tmp_path / "run_20260101T000000Z"
    snapshot_dir.mkdir(parents=True)
    write_result(snapshot_dir, "done")
    data = json.loads((snapshot_dir / "run_result.json").read_text())
    assert data["status"] == "done"
    assert data["error_message"] is None


def test_write_result_failure(tmp_path):
    snapshot_dir = tmp_path / "run_20260101T000000Z"
    snapshot_dir.mkdir(parents=True)
    write_result(snapshot_dir, "failed", error_message="subprocess exited 1")
    data = json.loads((snapshot_dir / "run_result.json").read_text())
    assert data["status"] == "failed"
    assert "subprocess" in data["error_message"]


def _setup_configs(root: Path):
    configs = root / "configs"
    configs.mkdir(exist_ok=True)
    for name in ["obligations.yaml", "mutations.yaml", "judge_rubric.yaml",
                 "models.yaml", "run_config.yaml"]:
        (configs / name).write_text(f"# {name}")
    (configs / "templates").mkdir(exist_ok=True)
    (configs / "templates" / "base_scenarios.yaml").write_text("# t")
    (configs / "catalogs").mkdir(exist_ok=True)
