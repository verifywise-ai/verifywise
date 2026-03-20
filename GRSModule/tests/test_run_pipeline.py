"""Tests for scripts/run_pipeline.py"""
import sys
from pathlib import Path
import pytest

# Allow importing from scripts/
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from run_pipeline import load_run_config, build_stage_args


# ---------------------------------------------------------------------------
# load_run_config
# ---------------------------------------------------------------------------

def test_load_run_config_returns_dict(tmp_path):
    cfg_file = tmp_path / "run_config.yaml"
    cfg_file.write_text(
        "version: grs_scenarios_v0.1\n"
        "stages:\n"
        "  render:\n"
        "    seed: 42\n"
        "    per_obligation: 2\n"
        "  perturb:\n"
        "    k_per_base: 3\n"
        "    coverage: per_family\n"
    )
    config = load_run_config(tmp_path)
    assert isinstance(config, dict)
    assert config["version"] == "grs_scenarios_v0.1"


def test_load_run_config_raises_if_missing(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_run_config(tmp_path)


def test_load_run_config_stages_present(tmp_path):
    cfg_file = tmp_path / "run_config.yaml"
    cfg_file.write_text(
        "version: grs_scenarios_v0.1\n"
        "stages:\n"
        "  render:\n"
        "    seed: 42\n"
        "    per_obligation: 2\n"
        "  perturb:\n"
        "    k_per_base: 3\n"
        "    coverage: per_family\n"
    )
    config = load_run_config(tmp_path)
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
