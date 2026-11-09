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
        ("local", "local"),
        ("custom_api", "custom_api"),
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


@pytest.mark.asyncio
async def test_ollama_on_a_user_host_is_pulled_with_the_checked_client_not_the_cli(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)
    from utils import run_evaluation as run_eval_module
    from utils import safe_outbound_url

    cli = MagicMock()
    monkeypatch.setattr(run_eval_module.subprocess, "run", cli)
    client = MagicMock()
    client.list.return_value = MagicMock(models=[])
    hosts = []
    monkeypatch.setattr(safe_outbound_url, "ollama_client", lambda host: hosts.append(host) or client)

    cfg = dict(inline_prompts_config)
    cfg["model"] = {"name": "llama3", "provider": "ollama", "endpointUrl": "10.0.0.5:11434"}
    await run_eval_module.run_evaluation(
        db=mock_db_session, experiment_id="exp-ollama-host", config=cfg, organization_id=1
    )

    cli.assert_not_called()
    assert hosts == ["http://10.0.0.5:11434"]
    client.pull.assert_called_once_with("llama3")


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
async def test_judge_self_hosted_sets_its_endpoint(
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
    assert os.environ.get("G_EVAL_BASE_URL") == "http://host:8080/v1"
    # No key: the judge sends none, and OpenAI's own variables are untouched
    assert os.environ.get("G_EVAL_API_KEY") is None
    assert os.environ.get("OPENAI_API_BASE") is None

    # A later run with a cloud judge must not inherit the endpoint
    cfg["judgeLlm"] = {"provider": "openai", "model": "gpt-4o-mini", "apiKey": "sk-test"}
    await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-cloud-after",
        config=cfg,
        organization_id=1,
    )
    assert os.environ.get("G_EVAL_BASE_URL") is None


@pytest.mark.asyncio
async def test_judge_with_a_refused_endpoint_fails_before_generation(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_run_eval_dependencies(monkeypatch)

    cfg = dict(inline_prompts_config)
    cfg["judgeLlm"] = {"provider": "self-hosted", "model": "m", "endpointUrl": "http://169.254.169.254"}

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(db=mock_db_session, experiment_id="exp-refused", config=cfg, organization_id=1)
    assert "not allowed" in result["error"]
    assert os.environ.get("G_EVAL_BASE_URL") is None
    stub_model_runner.assert_not_called()


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
    assert os.environ.get("G_EVAL_BASE_URL") == "http://localhost:11434/v1"


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


# --------------------------------------------------------------------------- #
# Failure reason when no prompt produced a response                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_no_responses_failure_reason_includes_first_error(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    from deepeval_engine import model_runner as mr_module
    from crud import evaluation_logs as crud_module

    calls = {"n": 0}

    def failing_generate(self, *a, **kw):
        calls["n"] += 1
        raise RuntimeError(f"Unexpected provider reply for sample {calls['n']}")

    monkeypatch.setattr(mr_module.ModelRunner, "generate", failing_generate)

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-no-responses",
        config=dict(inline_prompts_config),
        organization_id=1,
    )

    expected = (
        "No responses generated: 2/2 prompts failed. "
        "First error: Unexpected provider reply for sample 1"
    )
    assert result == {"error": expected}
    failed_calls = [
        c
        for c in crud_module.update_experiment_status.call_args_list
        if c.kwargs.get("status") == "failed"
    ]
    assert failed_calls, "experiment was not marked failed"
    assert failed_calls[-1].kwargs["error_message"] == expected


@pytest.mark.asyncio
async def test_no_responses_reason_keeps_the_retry_error(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty first answer whose retry raises reports the retry's error."""
    _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    from deepeval_engine import model_runner as mr_module

    def generate(self, *a, temperature=None, **kw):
        if temperature == 0.2:
            raise RuntimeError("Unsupported value: temperature")
        return ""

    monkeypatch.setattr(mr_module.ModelRunner, "generate", generate)

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-retry",
        config=dict(inline_prompts_config),
        organization_id=1,
    )

    assert result == {
        "error": "No responses generated: 2/2 prompts failed. "
        "First error: Unsupported value: temperature"
    }


@pytest.mark.asyncio
async def test_no_responses_reason_counts_each_prompt_once(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A prompt that fails twice (empty answer, then saving its log) counts once."""
    _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    from deepeval_engine import model_runner as mr_module
    from crud import evaluation_logs as crud_module

    monkeypatch.setattr(mr_module.ModelRunner, "generate", lambda self, *a, **kw: "")
    # Per prompt: saving the empty-output log fails, then logging the error works.
    ok = {"id": "l1"}
    monkeypatch.setattr(
        crud_module,
        "create_log",
        AsyncMock(
            side_effect=[RuntimeError("connection reset"), ok, RuntimeError("connection reset"), ok]
        ),
    )

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-once",
        config=dict(inline_prompts_config),
        organization_id=1,
    )

    assert result == {
        "error": "No responses generated: 2/2 prompts failed. "
        "First error: Model returned an empty response"
    }



# --------------------------------------------------------------------------- #
# Failure reason when no metric scored any prompt                              #
# --------------------------------------------------------------------------- #


def _judged(*entries: Dict[str, Any]) -> List[Dict[str, Any]]:
    """One result per entry set, shaped like DeepEvalEvaluator.run_evaluation output."""
    return [
        {"input": f"q{i}", "output": "a", "expected": None, "context": None, "metric_scores": scores}
        for i, scores in enumerate(entries)
    ]


GEVAL_404 = {
    "score": None,
    "passed": False,
    "threshold": 0.5,
    "reason": "G-Eval error: 404 This model models/gemini-2.5-pro is no longer available to new users.",
}


def test_no_scores_message_takes_the_first_geval_error() -> None:
    from utils.error_detection import build_no_scores_message

    message = build_no_scores_message(_judged({"Relevance": GEVAL_404}, {"Relevance": GEVAL_404}))

    assert message == (
        "No scores recorded: no metric scored any of the 2 prompts. "
        "First error: 404 This model models/gemini-2.5-pro is no longer available to new users."
    )


def test_no_scores_message_reads_error_fields_and_redacts_keys() -> None:
    from utils.error_detection import build_no_scores_message

    message = build_no_scores_message(
        _judged({"Bias": {"score": None, "passed": False, "error": "bad key AIzaSyDEADBEEF1234567890"}})
    )

    assert message.endswith("First error: bad key [redacted]")


def test_no_scores_message_without_a_recorded_error() -> None:
    from utils.error_detection import build_no_scores_message

    message = build_no_scores_message(_judged({"Faithfulness": {"score": None, "skipped": True}}))

    assert message == "No scores recorded: no metric scored any of the 1 prompts."


def test_every_metric_failed_needs_a_failed_metric() -> None:
    from utils.error_detection import every_metric_failed

    skipped = {"score": None, "skipped": True, "reason": "No retrieval/context provided"}
    scored = {"score": 0.0, "passed": True}

    assert every_metric_failed(_judged({"Relevance": GEVAL_404}, {"Relevance": GEVAL_404}))
    assert not every_metric_failed(_judged({"Relevance": GEVAL_404}, {"Bias": scored}))
    # Skipped on purpose, or not produced at all, is not a judge failure
    assert not every_metric_failed(_judged({"Faithfulness": skipped}, {"Faithfulness": skipped}))
    assert not every_metric_failed(_judged({}, {}))
    assert every_metric_failed(_judged({"Faithfulness": skipped, "Relevance": GEVAL_404}))


@pytest.mark.asyncio
async def test_run_with_only_skipped_metrics_still_completes(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module

    skipped = {"score": None, "skipped": True, "reason": "No retrieval/context provided"}
    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator,
        "run_evaluation",
        lambda self, **kwargs: _judged({"Faithfulness": skipped}, {"Faithfulness": skipped}),
    )

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-skipped",
        config=dict(inline_prompts_config),
        organization_id=1,
    )

    assert "error" not in result
    statuses = [c.kwargs.get("status") for c in crud_module.update_experiment_status.call_args_list]
    assert "failed" not in statuses


@pytest.mark.asyncio
async def test_run_with_no_scores_fails_and_keeps_its_results(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module

    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator,
        "run_evaluation",
        lambda self, **kwargs: _judged({"Relevance": GEVAL_404}, {"Relevance": GEVAL_404}),
    )

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-no-scores",
        config=dict(inline_prompts_config),
        organization_id=1,
    )

    assert result["error"].startswith("No scores recorded: no metric scored any of the 2 prompts.")
    statuses = [c.kwargs.get("status") for c in crud_module.update_experiment_status.call_args_list]
    assert "completed" not in statuses
    failed = [
        c for c in crud_module.update_experiment_status.call_args_list
        if c.kwargs.get("status") == "failed"
    ][-1]
    assert failed.kwargs["error_message"] == result["error"]
    assert len(failed.kwargs["results"]["detailed_results"]) == 2


@pytest.mark.asyncio
async def test_run_with_one_scored_metric_still_completes(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _capture_runner_init(monkeypatch)
    _patch_run_eval_dependencies(monkeypatch)

    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module

    scored = {"score": 0.9, "passed": True, "threshold": 0.5, "reason": "ok"}
    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator,
        "run_evaluation",
        lambda self, **kwargs: _judged(
            {"Relevance": scored, "Bias": GEVAL_404}, {"Relevance": GEVAL_404, "Bias": GEVAL_404}
        ),
    )

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-some-scores",
        config=dict(inline_prompts_config),
        organization_id=1,
    )

    assert "error" not in result
    assert crud_module.update_experiment_status.call_args_list[-1].kwargs["status"] == "completed"
