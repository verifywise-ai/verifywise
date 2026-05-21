from __future__ import annotations
import os
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import yaml

from ..models import RunRequest, RunStatus
from ..state import run_state
from .snapshot import write_snapshot, write_result

# Path to the grs-scenarios entry point inside the project venv
_GRS_BIN = Path(__file__).parent.parent.parent.parent / ".venv" / "bin" / "grs-scenarios"


def build_command(stage: str, dataset_version: str, params: dict) -> List[str]:
    """Build a grs-scenarios CLI command for the given stage and parameters."""
    base = [str(_GRS_BIN), "generate", "--stage", stage,
            "--dataset-version", dataset_version, "--out-dir", "datasets"]

    def _add(flag: str, value):
        """Add a flag and value if value is not None."""
        if value is None:
            return
        base.extend([flag, str(value)])

    def _flag(flag: str, condition: bool):
        """Add a flag if condition is True."""
        if condition:
            base.append(flag)

    if stage == "render":
        _add("--seed", params.get("seed", 42))
        _add("--per-obligation", params.get("per_obligation", 2))

    elif stage == "perturb":
        _add("--k-per-base", params.get("k_per_base", 3))
        _add("--coverage", params.get("coverage", "per_family"))

    elif stage == "validate":
        _add("--provider", params.get("provider", "openrouter"))
        _add("--validator-model-id", params.get("validator_model_id", "openai/gpt-4o-mini"))

    elif stage == "infer":
        _add("--provider", params.get("infer_provider", "openrouter"))
        _add("--temperature", params.get("temperature", 0.2))
        _add("--max-tokens", params.get("max_tokens", 500))
        _add("--limit", params.get("limit"))
        _flag("--resume", params.get("resume", False))

    elif stage == "judge":
        _add("--judge-temperature", params.get("judge_temperature", 0.0))
        _add("--judge-limit", params.get("limit"))
        _flag("--judge-resume", params.get("resume", False))

    return base


def write_run_config(grs_root: Path, request: RunRequest):
    """Write run_config.yaml with all stage parameters from the RunRequest."""
    p = request.params
    config = {
        "version": request.dataset_version,
        "stages": {
            "render": {
                "seed": p.get("seed", 42),
                "per_obligation": p.get("per_obligation", 2),
            },
            "perturb": {
                "k_per_base": p.get("k_per_base", 3),
                "coverage": p.get("coverage", "per_family"),
            },
            "validate": {
                "provider": p.get("provider", "openrouter"),
                "validator_model_id": p.get("validator_model_id", "openai/gpt-4o-mini"),
            },
            "infer": {
                "provider": p.get("infer_provider", "openrouter"),
                "temperature": p.get("temperature", 0.2),
                "max_tokens": p.get("max_tokens", 500),
                "limit": p.get("limit"),
                "resume": p.get("resume", False),
            },
            "judge": {
                "judge_temperature": p.get("judge_temperature", 0.0),
                "limit": p.get("limit"),
                "resume": p.get("resume", False),
            },
        },
    }
    path = grs_root / "configs" / "run_config.yaml"
    path.write_text(yaml.dump(config, default_flow_style=False, allow_unicode=True))


def _needs_api_key(stages: List[str], params: dict) -> bool:
    """Return True if any stage will make real API calls."""
    for stage in stages:
        if stage == "infer" and params.get("infer_provider", "openrouter") != "mock":
            return True
        if stage == "validate" and params.get("provider", "openrouter") != "mock":
            return True
        if stage == "judge":
            return True
    return False


def start_run(request: RunRequest, grs_root: Path) -> Optional[str]:
    """
    Validate, write-back config, write snapshot, then start background thread.
    Returns an error string if validation fails, None on success.
    """
    if run_state.state == "running":
        return "A run is already in progress"

    if _needs_api_key(request.stages, request.params):
        if not os.environ.get("OPENROUTER_API_KEY"):
            return "OPENROUTER_API_KEY is not set in the environment"

    write_run_config(grs_root, request)
    snapshot_dir = write_snapshot(grs_root, request.dataset_version, request.model_dump())

    run_state.state = "running"
    run_state.started_at = datetime.now(timezone.utc).isoformat()
    run_state.completed_at = None
    run_state.error = None
    run_state.snapshot_dir = snapshot_dir

    thread = threading.Thread(
        target=_execute_stages,
        args=(request, grs_root, snapshot_dir),
        daemon=True,
    )
    thread.start()
    return None


def _execute_stages(request: RunRequest, grs_root: Path, snapshot_dir: Path):
    stages_to_run = list(request.stages)

    for stage in stages_to_run:
        run_state.active_stage = stage
        cmd = build_command(stage, request.dataset_version, request.params)

        proc = subprocess.Popen(
            cmd,
            cwd=str(grs_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        run_state.process = proc
        _, stderr = proc.communicate()

        if proc.returncode != 0:
            run_state.state = "failed"
            run_state.active_stage = None
            run_state.completed_at = datetime.now(timezone.utc).isoformat()
            run_state.error = stderr.strip() or f"Stage '{stage}' exited with code {proc.returncode}"
            run_state.process = None
            write_result(snapshot_dir, "failed", error_message=run_state.error)
            return

    # Auto-run leaderboard after judge if judge was included
    if "judge" in stages_to_run:
        run_state.active_stage = "leaderboard"
        cmd = build_command("leaderboard", request.dataset_version, request.params)
        proc = subprocess.Popen(cmd, cwd=str(grs_root),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        run_state.process = proc
        proc.communicate()  # best-effort; leaderboard failure is non-fatal

    run_state.state = "done"
    run_state.active_stage = None
    run_state.completed_at = datetime.now(timezone.utc).isoformat()
    run_state.process = None
    write_result(snapshot_dir, "done")


def stop_run():
    if run_state.state != "running":
        return
    if run_state.process and run_state.process.poll() is None:
        run_state.process.terminate()
