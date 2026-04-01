import json
from pathlib import Path
from typing import Iterable


def write_jsonl(path: Path, items: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)

def append_jsonl(path: Path, items: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        # If a previous run was interrupted mid-write, the file may not end with
        # a newline. Ensure we start on a fresh line before appending records.
        if path.stat().st_size > 0:
            with path.open("rb") as rb:
                rb.seek(-1, 2)
                if rb.read(1) != b"\n":
                    f.write("\n")
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

