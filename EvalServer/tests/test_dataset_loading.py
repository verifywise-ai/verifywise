"""
Tests for the dataset-loading branches inside EvalServer.run_evaluation.

Covers all 5 production dataset source types:
  1. Inline single-turn `dataset.prompts`
  2. Inline multi-turn `prompts[0].turns`
  3. Built-in preset (chatbot / rag / agent JSON files on disk)
  4. Custom JSON path (`dataset.path`)
  5. Simulated mode (`simulatedMode=True` + `scenarios=[...]`)

We patch every external dependency:
  - ``ModelRunner`` (replace ``generate`` with a stub)
  - ``DeepEvalEvaluator.run_evaluation`` (returns canned [])
  - ``crud.*`` (no-op coroutines)
  - ``list_scorers`` / scorer crud helpers (return [])

The assertions verify that the loader populated either ``prompts`` (single-turn)
or ``conversations`` (multi-turn) correctly, and that ``ModelRunner.generate``
was called the expected number of times.
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _async_noop(*args: Any, **kwargs: Any) -> Any:
    return None


def _async_return(value: Any):
    async def _coro(*args: Any, **kwargs: Any):
        return value

    return _coro


@pytest.fixture
def patched_dependencies(monkeypatch: pytest.MonkeyPatch, stub_model_runner: MagicMock):
    """
    Wire every external dependency of run_evaluation to a safe stub.
    Returns the generate_mock for assertions.
    """
    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module
    from utils import run_evaluation as run_eval_module

    monkeypatch.setattr(crud_module, "create_log", _async_return({"id": "log-1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", _async_return(None))
    monkeypatch.setattr(crud_module, "create_metric", _async_return(None))
    monkeypatch.setattr(crud_module, "update_log_metadata", _async_return(None))

    # The scorer crud helpers are imported by NAME into run_evaluation, so patch
    # the names where they are *used*, not where they are defined.
    monkeypatch.setattr(run_eval_module, "list_scorers", _async_return([]))
    monkeypatch.setattr(run_eval_module, "create_scorer", _async_return({"id": "s1"}))
    monkeypatch.setattr(run_eval_module, "update_scorer", _async_return(None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", _async_return(None))

    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator,
        "run_evaluation",
        lambda self, **kwargs: [],
    )

    return stub_model_runner


@pytest.mark.asyncio
async def test_dataset_loading_inline_single_turn(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-001",
        config=inline_prompts_config,
        organization_id=1,
    )

    assert "error" not in result
    # 2 inline prompts -> 2 generate calls
    assert patched_dependencies.call_count == 2
    first_call = patched_dependencies.call_args_list[0]
    assert first_call.kwargs.get("prompt") == "What is 2+2?"


@pytest.mark.asyncio
async def test_dataset_loading_inline_multi_turn(
    multiturn_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-002",
        config=multiturn_config,
        organization_id=1,
    )

    assert "error" not in result
    # multiturn config has 2 user turns; assistant turn is regenerated, not consumed
    assert patched_dependencies.call_count == 2


@pytest.mark.asyncio
async def test_dataset_loading_builtin_chatbot_preset(
    builtin_chatbot_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-003",
        config=builtin_chatbot_config,
        organization_id=1,
    )

    assert "error" not in result
    # chatbot_basic.json contains 12 prompts at the time of writing.  We assert
    # >= 1 to keep the test resilient to dataset additions while still
    # exercising the preset-loading branch.
    assert patched_dependencies.call_count >= 1


@pytest.mark.asyncio
async def test_dataset_loading_builtin_rag_preset(
    builtin_rag_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-004",
        config=builtin_rag_config,
        organization_id=1,
    )

    assert "error" not in result
    assert patched_dependencies.call_count >= 1
    # RAG dataset has retrieval_context fields — we just verify it loaded
    first_call = patched_dependencies.call_args_list[0]
    assert isinstance(first_call.kwargs.get("prompt"), str)


@pytest.mark.asyncio
async def test_dataset_loading_builtin_agent_preset(
    builtin_agent_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-005",
        config=builtin_agent_config,
        organization_id=1,
    )

    # agent preset is multi-turn; regenerates assistant for each user turn
    assert "error" not in result
    assert patched_dependencies.call_count >= 1


@pytest.mark.asyncio
async def test_dataset_loading_custom_path(
    custom_path_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-006",
        config=custom_path_config,
        organization_id=1,
    )

    assert "error" not in result
    # 3 prompts in the temp file
    assert patched_dependencies.call_count == 3


@pytest.mark.asyncio
async def test_dataset_loading_simulated_mode(
    simulated_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    stub_model_runner: MagicMock,
) -> None:
    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module
    from utils import run_evaluation as run_eval_module

    monkeypatch.setattr(crud_module, "create_log", _async_return({"id": "log-1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", _async_return(None))
    monkeypatch.setattr(crud_module, "create_metric", _async_return(None))
    monkeypatch.setattr(crud_module, "update_log_metadata", _async_return(None))
    monkeypatch.setattr(run_eval_module, "list_scorers", _async_return([]))
    monkeypatch.setattr(run_eval_module, "create_scorer", _async_return({"id": "s1"}))
    monkeypatch.setattr(run_eval_module, "update_scorer", _async_return(None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", _async_return(None))
    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator,
        "run_evaluation",
        lambda self, **kwargs: [],
    )

    # Inject fake deepeval.conversation_simulator module — the version of
    # DeepEval used in CI may not ship it yet, so we provide a stub that the
    # `from deepeval.conversation_simulator import ConversationSimulator`
    # import inside run_evaluation() will resolve to.
    import sys
    import types

    fake_simulator_calls: List[Any] = []

    class FakeConvTestCase:
        def __init__(self):
            self.scenario = "simulated"
            self.turns = []

    class FakeSimulator:
        def __init__(self, model_callback):
            self.model_callback = model_callback

        def simulate(self, goldens, max_turns):
            fake_simulator_calls.append({"goldens": goldens, "max_turns": max_turns})
            return [FakeConvTestCase()]

    class FakeGolden:
        def __init__(self, scenario, expected_outcome, user_description):
            self.scenario = scenario
            self.expected_outcome = expected_outcome
            self.user_description = user_description

    fake_conv_sim = types.ModuleType("deepeval.conversation_simulator")
    fake_conv_sim.ConversationSimulator = FakeSimulator
    monkeypatch.setitem(sys.modules, "deepeval.conversation_simulator", fake_conv_sim)

    import deepeval.dataset as ds_module

    monkeypatch.setattr(ds_module, "ConversationalGolden", FakeGolden, raising=False)

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-007",
        config=simulated_config,
        organization_id=1,
    )

    assert "error" not in result
    assert len(fake_simulator_calls) == 1
    assert fake_simulator_calls[0]["max_turns"] == 4


@pytest.mark.asyncio
async def test_dataset_loading_missing_prompts_returns_error(
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    cfg = {
        "project_id": "p1",
        "model": {"name": "m", "provider": "ollama"},
        "judgeLlm": {},
        "dataset": {},
        "metrics": {},
        "evaluationMode": "standard",
    }

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-008",
        config=cfg,
        organization_id=1,
    )
    assert result.get("error") == "No prompts or conversations in dataset"


@pytest.mark.asyncio
async def test_dataset_loading_custom_path_missing_file(
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    from utils.run_evaluation import run_evaluation

    cfg = {
        "project_id": "p1",
        "model": {"name": "m", "provider": "ollama"},
        "judgeLlm": {},
        "dataset": {"path": "/nonexistent/path/never.json"},
        "metrics": {},
        "evaluationMode": "standard",
    }

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-009",
        config=cfg,
        organization_id=1,
    )
    assert "Dataset file not found" in (result.get("error") or "")


@pytest.mark.asyncio
async def test_dataset_loading_unknown_builtin_does_not_load(
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
) -> None:
    """Unknown builtin name falls through; if no other prompts provided -> error."""
    from utils.run_evaluation import run_evaluation

    cfg = {
        "project_id": "p1",
        "model": {"name": "m", "provider": "ollama"},
        "judgeLlm": {},
        "dataset": {"useBuiltin": "definitely-not-a-real-preset"},
        "metrics": {},
        "evaluationMode": "standard",
    }

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-010",
        config=cfg,
        organization_id=1,
    )
    assert result.get("error") == "No prompts or conversations in dataset"
