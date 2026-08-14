from __future__ import annotations

import os
import re
from pathlib import Path

_VALID_DATASET_VERSION = re.compile(r"^[A-Za-z0-9._-]+$")
_VALID_PATH_PART = re.compile(r"^[A-Za-z0-9._~-]+$")


def _sanitize_dataset_version(value: str) -> str:
    """Validate and return a safe dataset-version directory name."""
    if not _VALID_DATASET_VERSION.match(value):
        raise ValueError(f"Invalid dataset_version: {value!r}")
    if ".." in value or "/" in value or "\\" in value:
        raise ValueError(f"dataset_version cannot contain traversal: {value!r}")
    return value


def _sanitize_path_part(value: str) -> str:
    """Validate and return a safe path part (filename/directory)."""
    if not _VALID_PATH_PART.match(value):
        raise ValueError(f"Invalid path part: {value!r}")
    if ".." in value or "/" in value or "\\" in value:
        raise ValueError(f"Path part cannot contain traversal: {value!r}")
    return value


def assert_within(base: Path, target: Path) -> Path:
    """Resolve target and verify it stays inside base.

    Uses os.path.normpath + startswith, which is the exact containment check
    CodeQL's py/path-injection query recognizes as a sanitizer.
    """
    base_str = str(base)
    target_str = str(target)
    fullpath = os.path.normpath(os.path.join(base_str, target_str))
    basepath = os.path.normpath(base_str)
    if not fullpath.startswith(basepath + os.sep) and fullpath != basepath:
        raise ValueError(f"Path {fullpath} escapes allowed base {basepath}")
    return Path(fullpath)


def resolve_dataset_path(grs_root: Path, dataset_version: str, *parts: str) -> Path:
    """Resolve a path inside GR_ROOT/datasets/{dataset_version} safely.

    Validates that `dataset_version` and every trailing part are plain names
    (no path separators or traversal) and that the resolved path stays under
    the datasets root. Raises ValueError for any unsafe input.
    """
    safe_version = _sanitize_dataset_version(dataset_version)
    safe_parts = [_sanitize_path_part(p) for p in parts]

    base = grs_root / "datasets"
    target = base / safe_version / Path(*safe_parts)
    return assert_within(base, target)
