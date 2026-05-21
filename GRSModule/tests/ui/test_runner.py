import yaml
from pathlib import Path
from ui.backend.services.runner import build_command, write_run_config
from ui.backend.models import RunRequest


def test_build_command_seeds():
    cmd = build_command("seeds", "v0.1", {})
    assert cmd[0].endswith("grs-scenarios") or "grs-scenarios" in " ".join(cmd)
    assert "--stage" in cmd
    assert cmd[cmd.index("--stage") + 1] == "seeds"
    assert "--dataset-version" in cmd
    assert "v0.1" in cmd


def test_build_command_render_params():
    params = {"seed": 99, "per_obligation": 3}
    cmd = build_command("render", "v0.1", params)
    assert "--seed" in cmd and cmd[cmd.index("--seed") + 1] == "99"
    assert "--per-obligation" in cmd and cmd[cmd.index("--per-obligation") + 1] == "3"


def test_build_command_infer_resume_flag():
    params = {"infer_provider": "mock", "temperature": 0.3, "max_tokens": 100,
              "limit": 5, "resume": True}
    cmd = build_command("infer", "v0.1", params)
    assert "--resume" in cmd
    assert "--limit" in cmd and cmd[cmd.index("--limit") + 1] == "5"
    assert "--provider" in cmd and cmd[cmd.index("--provider") + 1] == "mock"


def test_build_command_infer_no_resume_when_false():
    params = {"infer_provider": "openrouter", "resume": False}
    cmd = build_command("infer", "v0.1", params)
    assert "--resume" not in cmd


def test_build_command_judge_uses_judge_flags():
    params = {"judge_temperature": 0.1, "limit": 10, "resume": True}
    cmd = build_command("judge", "v0.1", params)
    assert "--judge-temperature" in cmd
    assert "--judge-resume" in cmd
    assert "--judge-limit" in cmd


def test_write_run_config_writes_all_stages(grs_root):
    req = RunRequest(
        dataset_version="v0.1",
        stages=["seeds"],
        params={
            "seed": 10, "per_obligation": 1,
            "k_per_base": 2, "coverage": "random",
            "provider": "mock", "validator_model_id": "openai/gpt-4o-mini",
            "infer_provider": "openrouter", "temperature": 0.5,
            "max_tokens": 256, "limit": None, "resume": False,
            "judge_temperature": 0.1,
        }
    )
    write_run_config(grs_root, req)
    data = yaml.safe_load((grs_root / "configs" / "run_config.yaml").read_text())
    assert data["version"] == "v0.1"
    assert data["stages"]["render"]["seed"] == 10
    assert data["stages"]["infer"]["temperature"] == 0.5
    assert data["stages"]["judge"]["judge_temperature"] == 0.1
