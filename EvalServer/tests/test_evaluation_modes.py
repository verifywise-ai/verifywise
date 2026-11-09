"""
Tests for the three evaluation modes the runner accepts:

  - "standard" (default): DeepEval metrics only, no custom LLM scorers
  - "scorer":   custom LLM scorers only, no DeepEval metrics
  - "both":     run both, merge into metric_scores

Plus selectedScorers filtering and the default-when-absent behaviour.
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _async_return(value):
    async def _coro(*args, **kwargs):
        return value

    return _coro


@pytest.fixture
def evaluator_mock(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace DeepEvalEvaluator.run_evaluation with a counter that returns a single result."""
    from deepeval_engine import deepeval_evaluator as evaluator_module

    canned = [
        {
            "input": "What is 2+2?",
            "actual_output": "stub response",
            "expected_output": "4",
            "metric_scores": {
                "Answer Relevancy": {"score": 0.9, "passed": True, "threshold": 0.5}
            },
        },
        {
            "input": "Capital of France?",
            "actual_output": "stub response",
            "expected_output": "Paris",
            "metric_scores": {
                "Answer Relevancy": {"score": 0.85, "passed": True, "threshold": 0.5}
            },
        },
    ]
    eval_mock = MagicMock(return_value=canned)
    monkeypatch.setattr(evaluator_module.DeepEvalEvaluator, "run_evaluation", eval_mock)
    return eval_mock


@pytest.fixture
def custom_scorer_mock(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Replace run_custom_scorer with a stub that returns a PASS result."""
    from utils import run_evaluation as run_eval_module
    from utils.run_custom_scorer import ScorerResult

    canned = ScorerResult(
        scorer_id="scorer-llm-1",
        scorer_name="Helpfulness Judge",
        label="PASS",
        score=1.0,
        raw_response="PASS",
        passed=True,
    )

    async def _stub(*args, **kwargs):
        return canned

    mock = AsyncMock(side_effect=_stub)
    monkeypatch.setattr(run_eval_module, "run_custom_scorer", mock)
    return mock


@pytest.fixture
def patched_crud(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """
    run_evaluation imports `crud as ...` and `from crud.deepeval_scorers import list_scorers, ...`
    at module load time, so we must patch the references inside run_evaluation, not at the
    source modules.
    """
    from utils import run_evaluation as run_eval_module
    from crud import evaluation_logs as crud_module

    log_create = AsyncMock(return_value={"id": "log-1"})
    # `crud` is imported as `from crud import evaluation_logs as crud` so functions are
    # accessed via `crud.create_log` etc. at call time. Patching the source module works
    # because it's the same object.
    monkeypatch.setattr(crud_module, "create_log", log_create)
    monkeypatch.setattr(crud_module, "update_experiment_status", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_metric", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "update_log_metadata", AsyncMock(return_value=None))

    # The scorer crud helpers are imported by NAME in run_evaluation, so patch the names there.
    monkeypatch.setattr(run_eval_module, "create_scorer", AsyncMock(return_value={"id": "s1"}))
    monkeypatch.setattr(run_eval_module, "update_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", AsyncMock(return_value=None))
    return {"create_log": log_create, "module": run_eval_module}


def _patch_list_scorers(monkeypatch: pytest.MonkeyPatch, rows: List[Dict[str, Any]]) -> None:
    """list_scorers is imported by name into run_evaluation, so patch it there."""
    from utils import run_evaluation as run_eval_module

    monkeypatch.setattr(run_eval_module, "list_scorers", AsyncMock(return_value=rows))


@pytest.mark.asyncio
async def test_standard_mode_runs_deepeval_only(
    standard_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_list_scorers(monkeypatch, [])
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-std",
        config=standard_mode_config,
        organization_id=1,
    )

    assert "error" not in result
    evaluator_mock.assert_called_once()
    custom_scorer_mock.assert_not_called()


@pytest.mark.asyncio
async def test_scorer_mode_runs_custom_scorers_only(
    scorer_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    fake_llm_scorer_rows: List[Dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_list_scorers(monkeypatch, fake_llm_scorer_rows)
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-scorer",
        config=scorer_mode_config,
        organization_id=1,
    )

    assert "error" not in result
    evaluator_mock.assert_not_called()
    # 2 enabled LLM scorers x 2 prompts = 4 calls
    assert custom_scorer_mock.call_count == 4


@pytest.mark.asyncio
async def test_both_mode_runs_both_paths(
    both_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    fake_llm_scorer_rows: List[Dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_list_scorers(monkeypatch, fake_llm_scorer_rows)
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-both",
        config=both_mode_config,
        organization_id=1,
    )

    assert "error" not in result
    evaluator_mock.assert_called_once()
    # 2 enabled scorers x 2 prompts = 4 calls
    assert custom_scorer_mock.call_count == 4


@pytest.mark.asyncio
async def test_default_mode_is_standard(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If evaluationMode is absent, the runner defaults to 'standard'."""
    _patch_list_scorers(monkeypatch, [])

    cfg = dict(inline_prompts_config)
    cfg.pop("evaluationMode", None)

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-default",
        config=cfg,
        organization_id=1,
    )

    assert "error" not in result
    evaluator_mock.assert_called_once()
    custom_scorer_mock.assert_not_called()


@pytest.mark.asyncio
async def test_selected_scorers_filters_to_subset(
    scorer_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    fake_llm_scorer_rows: List[Dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_list_scorers(monkeypatch, fake_llm_scorer_rows)

    cfg = dict(scorer_mode_config)
    cfg["selectedScorers"] = ["scorer-llm-1"]

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-sel",
        config=cfg,
        organization_id=1,
    )

    assert "error" not in result
    # Only 1 selected scorer x 2 prompts = 2 calls
    assert custom_scorer_mock.call_count == 2


@pytest.mark.asyncio
async def test_selected_scorers_excludes_disabled_even_if_listed(
    scorer_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    fake_llm_scorer_rows: List[Dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_list_scorers(monkeypatch, fake_llm_scorer_rows)

    cfg = dict(scorer_mode_config)
    # scorer-llm-3 is in the rows but enabled=False
    cfg["selectedScorers"] = ["scorer-llm-3"]

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-sel-disabled",
        config=cfg,
        organization_id=1,
    )

    assert "error" not in result
    custom_scorer_mock.assert_not_called()


@pytest.mark.asyncio
async def test_scorer_mode_with_no_scorers_completes_without_error(
    scorer_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_list_scorers(monkeypatch, [])
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-sc-empty",
        config=scorer_mode_config,
        organization_id=1,
    )

    assert "error" not in result
    evaluator_mock.assert_not_called()
    custom_scorer_mock.assert_not_called()


@pytest.mark.asyncio
async def test_scorer_mode_skeleton_results_are_built_for_each_test_case(
    scorer_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    custom_scorer_mock: AsyncMock,
    patched_crud: Dict[str, Any],
    fake_llm_scorer_row: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """In scorer-only mode, results must still contain entries with metric_scores per test case."""
    _patch_list_scorers(monkeypatch, [fake_llm_scorer_row])

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-skel",
        config=scorer_mode_config,
        organization_id=1,
    )

    assert "error" not in result
    assert result.get("total_prompts") == 2
    assert custom_scorer_mock.call_count == 2


@pytest.mark.asyncio
async def test_custom_scorer_entries_store_the_threshold_used(
    scorer_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    patched_crud: Dict[str, Any],
    fake_llm_scorer_row: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The dashboard colours a scorer's average against the threshold stored per entry."""
    from crud import evaluation_logs as crud_module
    from utils import run_evaluation as run_eval_module
    from utils.run_custom_scorer import ScorerResult

    _patch_list_scorers(monkeypatch, [fake_llm_scorer_row])

    async def _stub(*args, **kwargs):
        return ScorerResult(
            scorer_id="scorer-llm-1",
            scorer_name="Helpfulness Judge",
            label="FAIL",
            score=0.0,
            raw_response="FAIL",
            passed=False,
            threshold=0.8,
        )

    monkeypatch.setattr(run_eval_module, "run_custom_scorer", AsyncMock(side_effect=_stub))

    await run_eval_module.run_evaluation(
        db=mock_db_session,
        experiment_id="exp-threshold",
        config=scorer_mode_config,
        organization_id=1,
    )

    stored = [
        call.kwargs["metadata"]["metric_scores"]["Helpfulness Judge"]
        for call in crud_module.update_log_metadata.call_args_list
    ]
    assert stored, "no metric scores were saved"
    assert all(entry["threshold"] == 0.8 for entry in stored)


def test_threshold_keys_follow_the_metric_each_name_enables():
    from utils.run_evaluation import route_threshold_keys

    # planQuality enables planning_quality; contextualRelevancy enables context_relevancy.
    assert route_threshold_keys({"planQuality": 0.8, "contextualRelevancy": 0.6}) == {
        "planning_quality": 0.8,
        "context_relevancy": 0.6,
    }
    # The UI sends both names; the one naming the metric directly wins, in either order.
    assert route_threshold_keys({"planQuality": 0.8, "planningQuality": 0.7}) == {
        "planning_quality": 0.7
    }
    assert route_threshold_keys({"planningQuality": 0.7, "planQuality": 0.8}) == {
        "planning_quality": 0.7
    }
    # Unknown names pass through for the evaluator to normalise.
    assert route_threshold_keys({"answerCorrectness": 0.9}) == {"answerCorrectness": 0.9}
    assert route_threshold_keys(None) == {}
    assert route_threshold_keys(["bias"]) == {}


@pytest.mark.asyncio
async def test_results_count_attempted_prompts_and_average_task_completion(
    standard_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    patched_crud: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One prompt gets no response: it is attempted but not scored. Task Completion,
    an agent metric, gets an average like the core metrics."""
    from deepeval_engine import deepeval_evaluator as evaluator_module

    _patch_list_scorers(monkeypatch, [])
    config = dict(standard_mode_config)
    config["dataset"] = {
        "prompts": [
            {"id": "t1", "prompt": "What is 2+2?", "expected_output": "4"},
            {"id": "t2", "prompt": "Say nothing", "expected_output": ""},
            {"id": "t3", "prompt": "Capital of France?", "expected_output": "Paris"},
        ]
    }
    config["metrics"] = {"taskCompletion": True}
    stub_model_runner.side_effect = lambda prompt, **kwargs: (
        "" if prompt == "Say nothing" else "stub response"
    )
    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator,
        "run_evaluation",
        MagicMock(
            return_value=[
                {"input": "What is 2+2?", "metric_scores": {"Task Completion": {"score": 1.0}}},
                {"input": "Capital of France?", "metric_scores": {"Task Completion": {"score": 0.5}}},
            ]
        ),
    )

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-counts",
        config=config,
        organization_id=1,
    )

    assert "error" not in result
    assert result["prompts_attempted"] == 3
    assert result["total_prompts"] == 2
    assert result["avg_scores"]["taskCompletion"] == pytest.approx(0.75)


def _scorer_error_result(*args, **kwargs):
    """What run_custom_scorer returns when the judge call fails: it catches, never raises."""
    from utils.run_custom_scorer import ScorerResult

    return ScorerResult(
        scorer_id="scorer-llm-1",
        scorer_name="Helpfulness Judge",
        label="ERROR",
        score=0.0,
        raw_response="Error calling judge model (gemini): 404 model not found",
        passed=False,
        error="Error calling judge model (gemini): 404 model not found",
    )


async def _scorer_raises(*args, **kwargs):
    raise RuntimeError("Error calling judge model (gemini): 404 model not found")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scorer_side_effect",
    [_scorer_error_result, _scorer_raises],
    ids=["error-result", "raises"],
)
async def test_scorer_errors_fail_the_run_with_the_error_and_save_no_metric(
    scorer_side_effect,
    scorer_mode_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    evaluator_mock: MagicMock,
    patched_crud: Dict[str, Any],
    fake_llm_scorer_rows: List[Dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A scorer judge that fails every call: the run fails with that error, no 0.0 quality rows."""
    from crud import evaluation_logs as crud_module
    from utils import run_evaluation as run_eval_module

    _patch_list_scorers(monkeypatch, fake_llm_scorer_rows)
    monkeypatch.setattr(
        run_eval_module, "run_custom_scorer", AsyncMock(side_effect=scorer_side_effect)
    )

    result = await run_eval_module.run_evaluation(
        db=mock_db_session,
        experiment_id="exp-scorer-dead",
        config=scorer_mode_config,
        organization_id=1,
    )

    assert result["error"] == (
        "No scores recorded: no metric scored any of the 2 prompts. "
        "First error: Error calling judge model (gemini): 404 model not found"
    )
    quality = [
        c for c in crud_module.create_metric.call_args_list
        if c.kwargs.get("metric_type") == "quality"
    ]
    assert quality == []


def test_scorer_summary_counts_errored_calls_as_failed_but_not_in_the_average() -> None:
    from utils.run_evaluation import _scorer_summary

    calls = [{"score": 1.0, "passed": True}] + [{"score": None, "passed": False}] * 9

    assert _scorer_summary(calls) == (1.0, 0.1)
    assert _scorer_summary([{"score": None, "passed": False}]) is None


def test_generation_usage_prefers_the_gateway_counts() -> None:
    from types import SimpleNamespace

    from utils.gateway_litellm_client import GatewayCompletion
    from utils.run_evaluation import _generation_usage

    runner = SimpleNamespace(last_completion=GatewayCompletion(text="a b", total_tokens=40, cost_usd=0.002))
    assert _generation_usage(runner, "a b") == (40, 0.002)


def test_generation_usage_falls_back_to_a_word_count_without_gateway_usage() -> None:
    from types import SimpleNamespace

    from utils.gateway_litellm_client import GatewayCompletion
    from utils.run_evaluation import _generation_usage

    assert _generation_usage(SimpleNamespace(last_completion=None), "one two", "three") == (3, None)
    no_usage = SimpleNamespace(last_completion=GatewayCompletion(text="x"))
    assert _generation_usage(no_usage, "one two") == (2, None)
    cost_only = SimpleNamespace(last_completion=GatewayCompletion(text="x", cost_usd=0.01))
    assert _generation_usage(cost_only, "one two") == (2, 0.01)
    assert _generation_usage(object(), "one") == (1, None)


def test_add_cost_stays_none_until_a_call_reports_one() -> None:
    from utils.run_evaluation import _add_cost

    assert _add_cost(None, None) is None
    assert _add_cost(None, 0.5) == 0.5
    assert _add_cost(0.5, None) == 0.5
    assert _add_cost(0.5, 0.25) == 0.75
