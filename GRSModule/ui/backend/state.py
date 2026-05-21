from __future__ import annotations
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class RunState:
    state: str = "idle"
    active_stage: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    process: Optional[subprocess.Popen] = None
    snapshot_dir: Optional[Path] = None


# Module-level singleton — imported by routers and services
run_state = RunState()
