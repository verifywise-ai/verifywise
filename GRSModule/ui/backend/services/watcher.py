from __future__ import annotations
from pathlib import Path
from typing import List

from .path_utils import resolve_dataset_path, assert_within
from ..models import ProgressCounts


def count_lines(path: Path, base: Path | None = None) -> int:
    """Count non-empty lines in a file. Returns 0 if file doesn't exist."""
    if base is not None:
        path = assert_within(base, path)
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8", errors="replace") as f:
        return sum(1 for line in f if line.strip())


def get_progress(stage: str, dataset_version: str, grs_root: Path) -> List[ProgressCounts]:
    """Get inference/judge progress for a dataset version.

    Args:
        stage: "infer" or "judge"
        dataset_version: e.g. "grs_scenarios_v0.1"
        grs_root: Root directory of GRS (containing datasets/)

    Returns:
        List of ProgressCounts per model_id, sorted by model_id.
    """
    if stage not in {"infer", "judge"}:
        raise ValueError(f"Invalid stage: {stage!r}; must be 'infer' or 'judge'")

    final_dir = resolve_dataset_path(grs_root, dataset_version, "final")
    total_per_model = count_lines(final_dir / "scenarios.jsonl", base=grs_root)

    # Determine output subdirectory based on stage
    sub_dir = "responses" if stage == "infer" else "judge_scores"
    output_dir = resolve_dataset_path(grs_root, dataset_version, "final", sub_dir)
    if not output_dir.exists():
        return []

    results = []
    for f in sorted(output_dir.glob("*.jsonl")):
        # Skip metadata files: .failures.jsonl and .patch_failures.jsonl
        if ".failures" in f.name or ".patch_failures" in f.name:
            continue

        model_id = f.stem
        failure_file = f.parent / f"{f.name}.failures.jsonl"
        successes = count_lines(f, base=grs_root)
        failures = count_lines(failure_file, base=grs_root) if failure_file.exists() else 0

        results.append(ProgressCounts(
            model_id=model_id,
            completed=successes + failures,
            total=total_per_model,
            failures=failures,
        ))

    return results
