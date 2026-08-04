from __future__ import annotations

import re
from pathlib import Path

_VALID_DATASET_VERSION = re.compile(r"^[A-Za-z0-9._-]+$")


def resolve_dataset_path(grs_root: Path, dataset_version: str, *parts: str) -> Path:
    """Resolve a path inside GR_ROOT/datasets/{dataset_version} safely.

    Validates that `dataset_version` is a plain directory name (no path
    separators or traversal) and that the resolved path stays under the
    datasets root. Raises ValueError for any unsafe input.
    """
    if not _VALID_DATASET_VERSION.match(dataset_version):
        raise ValueError(f"Invalid dataset_version: {dataset_version!r}")
    if ".." in dataset_version or "/" in dataset_version or "\\" in dataset_version:
        raise ValueError(f"dataset_version cannot contain traversal: {dataset_version!r}")

    base = (grs_root / "datasets").resolve()
    target = (base / dataset_version / Path(*parts)).resolve()

    try:
        target.relative_to(base)
    except ValueError as exc:
        raise ValueError(f"dataset_version escapes datasets root: {dataset_version!r}") from exc

    return target
