"""Tests for scripts/run_pipeline.py"""
import sys
from pathlib import Path
import pytest

# Allow importing from scripts/
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from run_pipeline import load_run_config, build_stage_args, copy_run_config


# ---------------------------------------------------------------------------
# load_run_config
# ---------------------------------------------------------------------------

def test_load_run_config_returns_dict(tmp_path):
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    (configs_dir / "run_config.yaml").write_text(
        "version: grs_scenarios_v0.1\n"
        "stages:\n"
        "  render:\n"
        "    seed: 42\n"
        "    per_obligation: 2\n"
        "  perturb:\n"
        "    k_per_base: 3\n"
        "    coverage: per_family\n"
    )
    config = load_run_config(configs_dir)
    assert isinstance(config, dict)
    assert config["version"] == "grs_scenarios_v0.1"


def test_load_run_config_raises_if_missing(tmp_path):
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    with pytest.raises(FileNotFoundError):
        load_run_config(configs_dir)


def test_load_run_config_stages_present(tmp_path):
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    (configs_dir / "run_config.yaml").write_text(
        "version: grs_scenarios_v0.1\n"
        "stages:\n"
        "  render:\n"
        "    seed: 42\n"
        "    per_obligation: 2\n"
        "  perturb:\n"
        "    k_per_base: 3\n"
        "    coverage: per_family\n"
    )
    config = load_run_config(configs_dir)
    assert "render" in config["stages"]
    assert "perturb" in config["stages"]


# ---------------------------------------------------------------------------
# build_stage_args — stages with no config entry
# ---------------------------------------------------------------------------

def test_build_stage_args_seeds_returns_empty():
    config = {
        "version": "grs_scenarios_v0.1",
        "stages": {
            "render": {"seed": 42, "per_obligation": 2},
            "perturb": {"k_per_base": 3, "coverage": "per_family"},
        },
    }
    assert build_stage_args("seeds", config) == []


def test_build_stage_args_validate_returns_empty():
    config = {
        "version": "grs_scenarios_v0.1",
        "stages": {
            "render": {"seed": 42, "per_obligation": 2},
            "perturb": {"k_per_base": 3, "coverage": "per_family"},
        },
    }
    assert build_stage_args("validate", config) == []


# ---------------------------------------------------------------------------
# build_stage_args — render stage
# ---------------------------------------------------------------------------

def test_build_stage_args_render_seed():
    config = {
        "stages": {
            "render": {"seed": 42, "per_obligation": 2},
        }
    }
    args = build_stage_args("render", config)
    assert "--seed" in args
    idx = args.index("--seed")
    assert args[idx + 1] == "42"


def test_build_stage_args_render_per_obligation():
    config = {
        "stages": {
            "render": {"seed": 42, "per_obligation": 2},
        }
    }
    args = build_stage_args("render", config)
    assert "--per-obligation" in args
    idx = args.index("--per-obligation")
    assert args[idx + 1] == "2"


def test_build_stage_args_render_full():
    config = {
        "stages": {
            "render": {"seed": 42, "per_obligation": 2},
        }
    }
    args = build_stage_args("render", config)
    assert args == ["--seed", "42", "--per-obligation", "2"]


# ---------------------------------------------------------------------------
# build_stage_args — perturb stage
# ---------------------------------------------------------------------------

def test_build_stage_args_perturb_k_per_base():
    config = {
        "stages": {
            "perturb": {"k_per_base": 3, "coverage": "per_family"},
        }
    }
    args = build_stage_args("perturb", config)
    assert "--k-per-base" in args
    idx = args.index("--k-per-base")
    assert args[idx + 1] == "3"


def test_build_stage_args_perturb_coverage():
    config = {
        "stages": {
            "perturb": {"k_per_base": 3, "coverage": "per_family"},
        }
    }
    args = build_stage_args("perturb", config)
    assert "--coverage" in args
    idx = args.index("--coverage")
    assert args[idx + 1] == "per_family"


def test_build_stage_args_perturb_full():
    config = {
        "stages": {
            "perturb": {"k_per_base": 3, "coverage": "per_family"},
        }
    }
    args = build_stage_args("perturb", config)
    assert args == ["--k-per-base", "3", "--coverage", "per_family"]


# ---------------------------------------------------------------------------
# build_stage_args — unknown stage
# ---------------------------------------------------------------------------

def test_build_stage_args_unknown_stage_returns_empty():
    config = {"stages": {}}
    assert build_stage_args("infer", config) == []


# ---------------------------------------------------------------------------
# copy_run_config
# ---------------------------------------------------------------------------

def test_copy_run_config_creates_dataset_dir(tmp_path):
    """dataset_dir is created if it does not exist."""
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    (configs_dir / "run_config.yaml").write_text("version: v0.1\n")

    dataset_dir = tmp_path / "datasets" / "grs_scenarios_v0.1"
    assert not dataset_dir.exists()

    copy_run_config(configs_dir, dataset_dir)

    assert dataset_dir.exists()


def test_copy_run_config_writes_file(tmp_path):
    """run_config.yaml is copied into dataset_dir."""
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    content = "version: v0.1\nstages:\n  render:\n    seed: 42\n"
    (configs_dir / "run_config.yaml").write_text(content)

    dataset_dir = tmp_path / "datasets" / "grs_scenarios_v0.1"
    copy_run_config(configs_dir, dataset_dir)

    dest = dataset_dir / "run_config.yaml"
    assert dest.exists()
    assert dest.read_text() == content


def test_copy_run_config_overwrites_existing(tmp_path):
    """Calling copy_run_config again overwrites with latest content."""
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    dataset_dir = tmp_path / "datasets" / "v0.1"
    dataset_dir.mkdir(parents=True)

    # Write an old version in dataset_dir
    (dataset_dir / "run_config.yaml").write_text("version: old\n")

    # New content in configs_dir
    new_content = "version: new\n"
    (configs_dir / "run_config.yaml").write_text(new_content)

    copy_run_config(configs_dir, dataset_dir)

    assert (dataset_dir / "run_config.yaml").read_text() == new_content
