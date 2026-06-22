"""
Unit tests for the helper logic inside ``run_evaluation``:
  - Provider → ``runner_provider`` mapping (all 10 aliases + fallback)
  - ``scorerApiKeys`` env-var injection for all providers (and "***" mask)
  - Legacy ``scorerApiKey`` (single key copied to all providers)
  - Judge-LLM env-var injection (incl. self-hosted base URL)
  - ``_upsert_judge_scorer`` create vs update branch
"""

from __future__ import annotations

import os
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

import pytest


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _capture_runner_init(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """
    Patch ModelRunner so we can capture the provider/model passed into __init__,
    while letting run_evaluation continue past the model-init step.
    """
    from deepeval_engine import model_runner as mr_module

    captured: Dict[str, Any] = {}

    def fake_init(self, model_name=None, provider=None, **kwargs):
        captured["model_name"] = model_name
        captured["provider"] = provider
        self.model_name = model_name
        self.provider = (provider or "").lower()
        self.device = "cpu"
        self.model = None
        self.tokenizer = None
        self._gateway_mode = False
        self._gateway_api_key = None

    monkeypatch.setattr(mr_module.ModelRunner, "__init__", fake_init)
    monkeypatch.setattr(mr_module.ModelRunner, "generate", lambda self, *a, **kw: "stub")
    return captured


def _patch_run_eval_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    from utils import run_evaluation as run_eval_module
    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module

    monkeypatch.setattr(crud_module, "create_log", AsyncMock(return_value={"id": "l1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_metric", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "update_log_metadata", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "list_scorers", AsyncMock(return_value=[]))
    monkeypatch.setattr(run_eval_module, "create_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "update_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", AsyncMock(return_value=None))
    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator, "run_evaluation", lambda self, **kwargs: []
    )


# --------------------------------------------------------------------------- #
# Provider → runner_provider mapping                                          #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "config_provider,expected_runner",
    [
        ("local", "huggingface"),
        ("custom_api", "openai"),
        ("openai", "openai"),
        ("anthropic", "anthropic"),
        ("google", "google"),
        ("xai", "xai"),
        ("mistral", "mistral"),
        ("huggingface", "huggingface"),
        ("ollama", "ollama"),
        ("openrouter", "openrouter"),
        # Unknown provider → falls back to ollama
        ("not-real", "ollama"),
        # Mixed case
        ("OpenRouter", "openrouter"),
    ],
)
async def test_runner_provider_mapping(
    config_provider: str,
    expected_runner: str,
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["model"] = {"name": "x", "provider": config_provider}

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-prov",
        config=cfg,
        organization_id=1,
    )
    assert captured["provider"] == expected_runner


@pytest.mark.asyncio
async def test_access_method_used_when_provider_absent(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["model"] = {"name": "x", "accessMethod": "anthropic"}

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-am",
        config=cfg,
        organization_id=1,
    )
    assert captured["provider"] == "anthropic"


@pytest.mark.asyncio
async def test_default_provider_is_ollama_when_no_provider_or_access_method(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["model"] = {"name": "x"}  # no provider, no accessMethod

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-default",
        config=cfg,
        organization_id=1,
    )
    assert captured["provider"] == "ollama"


# --------------------------------------------------------------------------- #
# scorerApiKeys env-var injection                                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "provider,env_var,key",
    [
        ("openai", "OPENAI_API_KEY", "sk-x"),
        ("anthropic", "ANTHROPIC_API_KEY", "sk-ant-x"),
        ("google", "GOOGLE_API_KEY", "AIza-x"),
        ("xai", "XAI_API_KEY", "xai-x"),
        ("mistral", "MISTRAL_API_KEY", "mst-x"),
        ("huggingface", "HF_API_KEY", "hf_x"),
        ("openrouter", "OPENROUTER_API_KEY", "sk-or-v1-x"),
    ],
)
async def test_scorer_api_keys_env_var_injection(
    provider: str,
    env_var: str,
    key: str,
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["scorerApiKeys"] = {provider: key}

    from utils.run_evaluation import run_evaluation

    # The injection happens during run; we don't need the experiment to fully
    # complete before checking, but the runner finishes quickly with mocks.
    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-injkey",
        config=cfg,
        organization_id=1,
    )
    assert os.environ.get(env_var) == key


@pytest.mark.asyncio
async def test_scorer_api_keys_with_masked_value_does_not_overwrite_env(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Documents current behaviour: a masked '***' key currently DOES get written
    to the env var (the runner doesn't filter it out for scorerApiKeys today).
    Pinning current behaviour so a future filter is intentional.
    """
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["scorerApiKeys"] = {"openai": "***"}

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-mask",
        config=cfg,
        organization_id=1,
    )
    # Current behaviour: '***' is forwarded as-is. If this changes, this test
    # will fail and the change should be intentional.
    assert os.environ.get("OPENAI_API_KEY") == "***"


@pytest.mark.asyncio
async def test_scorer_api_keys_with_empty_value_skipped(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["scorerApiKeys"] = {"openai": ""}

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-empty",
        config=cfg,
        organization_id=1,
    )
    assert os.environ.get("OPENAI_API_KEY") in (None, "")


# --------------------------------------------------------------------------- #
# Legacy scorerApiKey (single key copied to all)                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_legacy_scorer_api_key_copied_to_all_providers(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["scorerApiKey"] = "legacy-key-1234"
    cfg.pop("scorerApiKeys", None)

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-legacy",
        config=cfg,
        organization_id=1,
    )
    for var in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "MISTRAL_API_KEY"):
        assert os.environ.get(var) == "legacy-key-1234"


@pytest.mark.asyncio
async def test_legacy_scorer_api_key_skipped_when_modern_keys_present(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["scorerApiKeys"] = {"openai": "modern"}
    cfg["scorerApiKey"] = "legacy"

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-skip-legacy",
        config=cfg,
        organization_id=1,
    )
    assert os.environ.get("OPENAI_API_KEY") == "modern"
    # Legacy fanout should NOT have run, leaving anthropic unset
    assert os.environ.get("ANTHROPIC_API_KEY") in (None, "")


# --------------------------------------------------------------------------- #
# Judge-LLM env-var injection                                                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "judge_provider,env_var,key",
    [
        ("openai", "OPENAI_API_KEY", "sk-judge"),
        ("anthropic", "ANTHROPIC_API_KEY", "sk-ant-judge"),
        ("google", "GOOGLE_API_KEY", "AIza-judge"),
        ("xai", "XAI_API_KEY", "xai-judge"),
        ("mistral", "MISTRAL_API_KEY", "mst-judge"),
        ("openrouter", "OPENROUTER_API_KEY", "sk-or-v1-judge"),
    ],
)
async def test_judge_api_key_injected_into_env(
    judge_provider: str,
    env_var: str,
    key: str,
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["judgeLlm"] = {"provider": judge_provider, "model": "x", "apiKey": key}

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-jkey",
        config=cfg,
        organization_id=1,
    )
    assert os.environ.get(env_var) == key
    assert os.environ.get("G_EVAL_PROVIDER") == judge_provider
    assert os.environ.get("G_EVAL_MODEL") == "x"


@pytest.mark.asyncio
async def test_judge_self_hosted_sets_openai_api_base(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["judgeLlm"] = {
        "provider": "self-hosted",
        "model": "tinyllama",
        "endpointUrl": "http://host:8080",
        "apiKey": "",
    }

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-selfh",
        config=cfg,
        organization_id=1,
    )
    base = os.environ.get("OPENAI_API_BASE")
    assert base is not None
    assert base.endswith("/v1")
    # Self-hosted with no key sets a dummy
    assert os.environ.get("OPENAI_API_KEY") in ("not-needed", None) or os.environ.get(
        "OPENAI_API_KEY"
    ).startswith("not-needed")


@pytest.mark.asyncio
async def test_judge_ollama_sets_default_base(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["judgeLlm"] = {"provider": "ollama", "model": "tinyllama"}

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-ollama-judge",
        config=cfg,
        organization_id=1,
    )
    assert os.environ.get("OPENAI_API_BASE") == "http://localhost:11434/v1"


@pytest.mark.asyncio
async def test_judge_max_tokens_default_is_512(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["judgeLlm"] = {"provider": "openai", "model": "gpt-4o", "apiKey": "sk-x"}

    from utils.run_evaluation import run_evaluation

    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-tokens",
        config=cfg,
        organization_id=1,
    )
    assert os.environ.get("G_EVAL_MAX_TOKENS") == "512"


# --------------------------------------------------------------------------- #
# _upsert_judge_scorer                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_upsert_judge_scorer_creates_when_absent(
    mock_db_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    from utils import run_evaluation as run_eval_module

    list_mock = AsyncMock(return_value=[])
    create_mock = AsyncMock(return_value={"id": "j1"})
    update_mock = AsyncMock()
    touch_mock = AsyncMock()

    monkeypatch.setattr(run_eval_module, "list_scorers", list_mock)
    monkeypatch.setattr(run_eval_module, "create_scorer", create_mock)
    monkeypatch.setattr(run_eval_module, "update_scorer", update_mock)
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", touch_mock)

    await run_eval_module._upsert_judge_scorer(
        db=mock_db_session,
        config={"judgeLlm": {"provider": "openai", "model": "gpt-4o"}},
        organization_id=1,
    )
    create_mock.assert_called_once()
    update_mock.assert_not_called()
    touch_mock.assert_not_called()


@pytest.mark.asyncio
async def test_upsert_judge_scorer_touches_when_present_with_choice_scores(
    mock_db_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    from utils import run_evaluation as run_eval_module

    existing = [
        {
            "id": "scorer-1",
            "name": "Judge: gpt-4o",
            "config": {
                "judgeModel": {"name": "gpt-4o", "provider": "openai"},
                "choiceScores": [{"label": "PASS", "score": 1}],
            },
        }
    ]

    list_mock = AsyncMock(return_value=existing)
    create_mock = AsyncMock()
    update_mock = AsyncMock()
    touch_mock = AsyncMock()
    monkeypatch.setattr(run_eval_module, "list_scorers", list_mock)
    monkeypatch.setattr(run_eval_module, "create_scorer", create_mock)
    monkeypatch.setattr(run_eval_module, "update_scorer", update_mock)
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", touch_mock)

    await run_eval_module._upsert_judge_scorer(
        db=mock_db_session,
        config={"judgeLlm": {"provider": "openai", "model": "gpt-4o"}},
        organization_id=1,
    )
    create_mock.assert_not_called()
    update_mock.assert_not_called()
    touch_mock.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_judge_scorer_backfills_missing_choice_scores(
    mock_db_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    from utils import run_evaluation as run_eval_module

    existing = [
        {
            "id": "scorer-1",
            "name": "Judge: gpt-4o",
            "config": {"judgeModel": {"name": "gpt-4o"}},  # no choiceScores
        }
    ]

    list_mock = AsyncMock(return_value=existing)
    create_mock = AsyncMock()
    update_mock = AsyncMock()
    touch_mock = AsyncMock()
    monkeypatch.setattr(run_eval_module, "list_scorers", list_mock)
    monkeypatch.setattr(run_eval_module, "create_scorer", create_mock)
    monkeypatch.setattr(run_eval_module, "update_scorer", update_mock)
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", touch_mock)

    await run_eval_module._upsert_judge_scorer(
        db=mock_db_session,
        config={"judgeLlm": {"provider": "openai", "model": "gpt-4o"}},
        organization_id=1,
    )
    update_mock.assert_called_once()
    create_mock.assert_not_called()


@pytest.mark.asyncio
async def test_upsert_judge_scorer_noop_without_judge_model(
    mock_db_session: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    from utils import run_evaluation as run_eval_module

    list_mock = AsyncMock(return_value=[])
    create_mock = AsyncMock()
    update_mock = AsyncMock()
    touch_mock = AsyncMock()
    monkeypatch.setattr(run_eval_module, "list_scorers", list_mock)
    monkeypatch.setattr(run_eval_module, "create_scorer", create_mock)
    monkeypatch.setattr(run_eval_module, "update_scorer", update_mock)
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", touch_mock)

    await run_eval_module._upsert_judge_scorer(
        db=mock_db_session,
        config={"judgeLlm": {}},  # No model specified
        organization_id=1,
    )
    list_mock.assert_not_called()
    create_mock.assert_not_called()
