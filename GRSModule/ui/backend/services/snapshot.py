from __future__ import annotations
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .path_utils import resolve_dataset_path, assert_within


def write_snapshot(grs_root: Path, dataset_version: str, run_request: dict) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_dir = resolve_dataset_path(
        grs_root, dataset_version, "configs_snapshot", f"run_{timestamp}"
    )
    snapshot_dir = assert_within(grs_root, snapshot_dir)
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    configs_dir = assert_within(grs_root, grs_root / "configs")
    for name in ["obligations.yaml", "mutations.yaml", "judge_rubric.yaml",
                 "models.yaml", "run_config.yaml"]:
        src = assert_within(grs_root, configs_dir / name)
        dst = assert_within(grs_root, snapshot_dir / name)
        if src.exists():
            shutil.copy2(src, dst)

    for sub in ["templates", "catalogs"]:
        src = assert_within(grs_root, configs_dir / sub)
        dst = assert_within(grs_root, snapshot_dir / sub)
        if src.exists():
            shutil.copytree(src, dst, dirs_exist_ok=True)

    result_path = assert_within(grs_root, snapshot_dir / "run_config.json")
    result_path.write_text(
        json.dumps(run_request, indent=2, ensure_ascii=False)
    )
    return snapshot_dir


def write_result(snapshot_dir: Path, status: str, error_message: Optional[str] = None):
    result = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "error_message": error_message,
    }
    # snapshot_dir is produced internally by write_snapshot, which already
    # validates containment; re-assert here for defense in depth.
    target = assert_within(snapshot_dir.parent, snapshot_dir / "run_result.json")
    target.write_text(json.dumps(result, indent=2))
