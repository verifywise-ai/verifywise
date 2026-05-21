from __future__ import annotations
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def write_snapshot(grs_root: Path, dataset_version: str, run_request: dict) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_dir = (
        grs_root / "datasets" / dataset_version / "configs_snapshot" / f"run_{timestamp}"
    )
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    configs_dir = grs_root / "configs"
    for name in ["obligations.yaml", "mutations.yaml", "judge_rubric.yaml",
                 "models.yaml", "run_config.yaml"]:
        src = configs_dir / name
        if src.exists():
            shutil.copy2(src, snapshot_dir / name)

    for sub in ["templates", "catalogs"]:
        src = configs_dir / sub
        if src.exists():
            shutil.copytree(src, snapshot_dir / sub, dirs_exist_ok=True)

    (snapshot_dir / "run_config.json").write_text(
        json.dumps(run_request, indent=2, ensure_ascii=False)
    )
    return snapshot_dir


def write_result(snapshot_dir: Path, status: str, error_message: Optional[str] = None):
    result = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "error_message": error_message,
    }
    (snapshot_dir / "run_result.json").write_text(json.dumps(result, indent=2))
