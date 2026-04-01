"""
Run GRS pipeline stages from configs/run_config.yaml.

Reads configs/run_config.yaml and invokes
  uv run grs-scenarios generate --stage <stage> --dataset-version <version> [params]
for each requested stage, in the fixed pipeline order:
  seeds → render → perturb → validate

The config is automatically copied to datasets/<version>/run_config.yaml
for reproducibility before any stage runs.

Usage:
    uv run python scripts/run_pipeline.py --version grs_scenarios_v0.1
    uv run python scripts/run_pipeline.py --version grs_scenarios_v0.1 --stages render perturb
    uv run python scripts/run_pipeline.py --version grs_scenarios_v0.1 --base-dir datasets
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

import yaml


# Fixed execution order for the generation stages.
PIPELINE_ORDER: list[str] = ["seeds", "render", "perturb", "validate"]

# Maps YAML param keys to their CLI flag equivalents.
_RENDER_PARAM_MAP: dict[str, str] = {
    "seed": "--seed",
    "per_obligation": "--per-obligation",
}
_PERTURB_PARAM_MAP: dict[str, str] = {
    "k_per_base": "--k-per-base",
    "coverage": "--coverage",
}
_VALIDATE_PARAM_MAP: dict[str, str] = {
    "provider": "--provider",
    "validator_model_id": "--validator-model-id",
}
_STAGE_PARAM_MAPS: dict[str, dict[str, str]] = {
    "render": _RENDER_PARAM_MAP,
    "perturb": _PERTURB_PARAM_MAP,
    "validate": _VALIDATE_PARAM_MAP,
}


def load_run_config(configs_dir: Path) -> dict:
    """Load and return run_config.yaml from configs_dir.

    Args:
        configs_dir: Directory containing run_config.yaml (typically configs/).

    Raises:
        FileNotFoundError: If run_config.yaml does not exist in configs_dir.
    """
    config_path = configs_dir / "run_config.yaml"
    if not config_path.exists():
        raise FileNotFoundError(
            f"run_config.yaml not found at {config_path}. "
            "Create run_config.yaml in the configs directory before running the pipeline."
        )
    with config_path.open() as f:
        return yaml.safe_load(f)


def copy_run_config(configs_dir: Path, dataset_dir: Path) -> None:
    """Copy configs/run_config.yaml into dataset_dir for reproducibility.

    Creates dataset_dir if it does not exist. Overwrites any existing copy.

    Args:
        configs_dir: Source directory containing run_config.yaml.
        dataset_dir: Destination version folder (e.g. datasets/grs_scenarios_v0.1).
    """
    dataset_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(configs_dir / "run_config.yaml", dataset_dir / "run_config.yaml")


def build_stage_args(stage: str, config: dict) -> list[str]:
    """Build the CLI flag list for a single pipeline stage.

    Returns [] for stages with no params (seeds) or unknown stages.
    """
    param_map = _STAGE_PARAM_MAPS.get(stage)
    if param_map is None:
        return []

    stage_params: dict = config.get("stages", {}).get(stage, {})
    if not stage_params:
        return []

    args: list[str] = []
    for yaml_key, cli_flag in param_map.items():
        value = stage_params.get(yaml_key)
        if value is not None:
            args.extend([cli_flag, str(value)])
    return args


def run_pipeline(
    version: str,
    base_dir: Path,
    stages: list[str],
) -> None:
    """Run the requested pipeline stages in fixed order.

    Loads run_config.yaml from configs/ (sibling of scripts/), then copies it
    into datasets/<version>/ for reproducibility before running any stage.
    Raises FileNotFoundError immediately if configs/run_config.yaml is missing
    (fail-fast — no stages will run).
    """
    dataset_dir = base_dir / version

    # Resolve configs/ relative to this script file, not the cwd.
    configs_dir = Path(__file__).parent.parent / "configs"

    config = load_run_config(configs_dir)
    copy_run_config(configs_dir, dataset_dir)

    ordered = [s for s in PIPELINE_ORDER if s in stages]

    for stage in ordered:
        stage_args = build_stage_args(stage, config)
        cmd = [
            "uv", "run", "grs-scenarios", "generate",
            "--stage", stage,
            "--dataset-version", version,
            "--out-dir", str(base_dir),
            *stage_args,
        ]
        print(f"[run_pipeline] Running stage '{stage}': {' '.join(cmd)}")
        subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run GRS pipeline stages from configs/run_config.yaml."
    )
    parser.add_argument(
        "--version",
        required=True,
        help="Dataset version string, e.g. grs_scenarios_v0.1",
    )
    parser.add_argument(
        "--stages",
        nargs="*",
        default=None,
        help="Subset of stages to run (default: all four). E.g. --stages render perturb",
    )
    parser.add_argument(
        "--base-dir",
        default="datasets",
        help="Root directory containing version folders (default: datasets)",
    )
    args = parser.parse_args()

    stages = args.stages if args.stages is not None else list(PIPELINE_ORDER)
    run_pipeline(
        version=args.version,
        base_dir=Path(args.base_dir),
        stages=stages,
    )


if __name__ == "__main__":
    main()
