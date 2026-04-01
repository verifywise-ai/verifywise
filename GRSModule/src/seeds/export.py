from __future__ import annotations

from pathlib import Path
from typing import List

from models.obligation import Obligation
from io_utils.jsonl import write_jsonl


def export_obligations_jsonl(out_path: Path, obligations: List[Obligation]) -> None:
    write_jsonl(out_path, (o.model_dump(exclude_none=True) for o in obligations))