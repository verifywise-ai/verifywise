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
