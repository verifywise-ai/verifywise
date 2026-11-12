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


def _install_fake_simulator(monkeypatch: pytest.MonkeyPatch):
    """
    Stub the runner's dependencies and replace only the simulator class inside the
    real deepeval.simulator module. Returns (calls, judge_sentinel).

    The fake takes the real constructor and simulate() arguments, and drives the
    callback through DeepEval's own generate_turn_from_callback, which passes
    input/turns/thread_id by keyword: a misnamed callback parameter fails here.
    """
    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module
    from utils import run_evaluation as run_eval_module

    monkeypatch.setattr(crud_module, "create_log", _async_return({"id": "log-1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", _async_return(None))
    monkeypatch.setattr(crud_module, "create_metric", _async_return(None))
    monkeypatch.setattr(crud_module, "update_log_metadata", _async_return(None))
    monkeypatch.setattr(run_eval_module, "list_scorers", _async_return([]))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", _async_return(None))
    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator,
        "run_evaluation",
        lambda self, **kwargs: [],
    )

    import deepeval.simulator as simulator_module
    from deepeval.test_case import ConversationalTestCase, Turn

    real_simulator = simulator_module.ConversationSimulator
    judge_sentinel = object()
    monkeypatch.setattr(evaluator_module, "get_judge_llm", lambda **_: judge_sentinel)

    fake_simulator_calls: List[Any] = []

    class FakeSimulator:
        def __init__(self, model_callback, simulator_model=None, async_mode=True):
            self.model_callback = model_callback
            self.simulator_model = simulator_model
            self.async_mode = async_mode

        def simulate(self, conversational_goldens, max_user_simulations=10):
            reply = real_simulator.generate_turn_from_callback(
                self,
                input="Hi, I need help",
                turns=[Turn(role="user", content="Earlier question")],
                thread_id="thread-1",
                model_callback=self.model_callback,
            )
            fake_simulator_calls.append(
                {
                    "goldens": conversational_goldens,
                    "max_user_simulations": max_user_simulations,
                    "simulator_model": self.simulator_model,
                    "async_mode": self.async_mode,
                    "reply": reply,
                }
            )
            return [
                ConversationalTestCase(
                    scenario=golden.scenario,
                    turns=[Turn(role="user", content="Hi, I need help"), reply],
                )
                for golden in conversational_goldens
            ]

    monkeypatch.setattr(simulator_module, "ConversationSimulator", FakeSimulator)
    return fake_simulator_calls, judge_sentinel


@pytest.mark.asyncio
async def test_dataset_loading_simulated_mode(
    simulated_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    stub_model_runner: MagicMock,
) -> None:
    from deepeval.dataset import ConversationalGolden
    from deepeval.test_case import Turn

    fake_simulator_calls, judge_sentinel = _install_fake_simulator(monkeypatch)

    from utils.run_evaluation import run_evaluation

    result = await run_evaluation(
        db=mock_db_session,
        experiment_id="exp-007",
        config=simulated_config,
        organization_id=1,
    )

    assert "error" not in result
    assert len(fake_simulator_calls) == 1
    call = fake_simulator_calls[0]
    assert call["max_user_simulations"] == 4
    assert all(isinstance(g, ConversationalGolden) for g in call["goldens"])
    # The judge plays the simulated user, and sync mode avoids nesting event loops.
    assert call["simulator_model"] is judge_sentinel
    assert call["async_mode"] is False
    # The callback got the user's input and history and returned the model's turn.
    assert call["reply"] == Turn(role="assistant", content="stub response")
    prompt = stub_model_runner.call_args.kwargs["prompt"]
    assert "User: Earlier question" in prompt
    assert prompt.endswith("User: Hi, I need help\n\nAssistant:")


def _scenario_config(dataset: Dict[str, Any]) -> Dict[str, Any]:
    from tests.conftest import _base_config

    cfg = _base_config(taskType="chatbot")
    cfg["dataset"] = dataset
    return cfg


@pytest.mark.asyncio
async def test_scenario_rows_run_simulated_without_wizard_flags(
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    stub_model_runner: MagicMock,
) -> None:
    """API/MCP callers send the dataset rows only; scenario rows still simulate."""
    calls, _ = _install_fake_simulator(monkeypatch)
    from utils.run_evaluation import run_evaluation

    config = _scenario_config(
        {"prompts": [{"scenario": "Book a flight", "expected_outcome": "Options are listed"}]}
    )
    result = await run_evaluation(
        db=mock_db_session, experiment_id="exp-sim-1", config=config, organization_id=1
    )

    assert "error" not in result
    assert len(calls) == 1
    assert [g.scenario for g in calls[0]["goldens"]] == ["Book a flight"]
    assert calls[0]["max_user_simulations"] == 6


@pytest.mark.asyncio
async def test_scenarios_alone_pass_the_empty_dataset_check(
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    stub_model_runner: MagicMock,
) -> None:
    """The wizard sends scenarios without duplicating them as prompts."""
    calls, _ = _install_fake_simulator(monkeypatch)
    from utils.run_evaluation import run_evaluation

    config = _scenario_config(
        {
            "prompts": [],
            "simulatedMode": True,
            "scenarios": [{"scenario": "Cancel an order", "expected_outcome": "  "}],
        }
    )
    result = await run_evaluation(
        db=mock_db_session, experiment_id="exp-sim-2", config=config, organization_id=1
    )

    assert "error" not in result
    # A blank outcome falls back to the default instead of an empty goal
    assert calls[0]["goldens"][0].expected_outcome == "Helpful response"


@pytest.mark.asyncio
async def test_each_scenario_keeps_its_own_turn_limit(
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    stub_model_runner: MagicMock,
) -> None:
    calls, _ = _install_fake_simulator(monkeypatch)
    from utils.run_evaluation import run_evaluation

    config = _scenario_config(
        {
            "simulatedMode": True,
            "maxTurns": 3,
            "scenarios": [
                {"scenario": "a", "expected_outcome": "x", "max_turns": 2},
                {"scenario": "b", "expected_outcome": "x"},
                {"scenario": "c", "expected_outcome": "x", "max_turns": 2},
                {"scenario": "d", "expected_outcome": "x", "max_turns": 20},
            ],
        }
    )
    result = await run_evaluation(
        db=mock_db_session, experiment_id="exp-sim-3", config=config, organization_id=1
    )

    assert "error" not in result
    by_limit = {c["max_user_simulations"]: [g.scenario for g in c["goldens"]] for c in calls}
    assert by_limit == {2: ["a", "c"], 3: ["b"], 20: ["d"]}


@pytest.mark.asyncio
async def test_scenario_file_from_path_runs_simulated(
    mock_db_session: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    stub_model_runner: MagicMock,
    tmp_path,
) -> None:
    """A rerun built from dataset.path reads the scenario file and simulates."""
    import json

    calls, _ = _install_fake_simulator(monkeypatch)
    from utils.run_evaluation import run_evaluation

    dataset_file = tmp_path / "scenarios.json"
    dataset_file.write_text(
        json.dumps([{"scenario": "Reset a password", "expected_outcome": "Steps given"}])
    )
    config = _scenario_config({"path": str(dataset_file)})
    result = await run_evaluation(
        db=mock_db_session, experiment_id="exp-sim-4", config=config, organization_id=1
    )

    assert "error" not in result
    assert [g.scenario for g in calls[0]["goldens"]] == ["Reset a password"]


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


# --------------------------------------------------------------------------- #
# RAG: retrieved passages reach the model under test and the test case         #
# --------------------------------------------------------------------------- #


@pytest.fixture
def captured_test_cases(monkeypatch: pytest.MonkeyPatch, patched_dependencies: MagicMock):
    """Record the test cases run_evaluation hands to the evaluator."""
    from deepeval_engine import deepeval_evaluator as evaluator_module

    captured: List[Dict[str, Any]] = []

    def _capture(self: Any, **kwargs: Any) -> List[Any]:
        captured.extend(kwargs.get("test_cases_data") or [])
        return []

    monkeypatch.setattr(evaluator_module.DeepEvalEvaluator, "run_evaluation", _capture)
    return captured


@pytest.mark.asyncio
async def test_single_turn_rag_passages_reach_model_and_test_case(
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
    captured_test_cases: List[Dict[str, Any]],
) -> None:
    from utils.run_evaluation import run_evaluation

    cfg = {
        "project_id": "p1",
        "model": {"name": "m", "provider": "ollama"},
        "judgeLlm": {},
        "dataset": {
            "prompts": [
                {
                    "prompt": "How long do we keep audit logs?",
                    "expected_output": "7 years.",
                    "retrieval_context": ["Audit logs are retained for 7 years.", "  ", 42],
                },
                {"prompt": "What is 2+2?", "expected_output": "4"},
            ]
        },
        "metrics": {"faithfulness": True},
        "evaluationMode": "standard",
    }

    result = await run_evaluation(
        db=mock_db_session, experiment_id="exp-rag-1", config=cfg, organization_id=1
    )

    assert "error" not in result
    rag_prompt = patched_dependencies.call_args_list[0].kwargs["prompt"]
    assert "Context:\n[1] Audit logs are retained for 7 years." in rag_prompt
    assert rag_prompt.endswith("Question: How long do we keep audit logs?")
    assert "[2]" not in rag_prompt  # blank and non-string passages dropped
    # A prompt without passages is sent as-is.
    assert patched_dependencies.call_args_list[1].kwargs["prompt"] == "What is 2+2?"

    cases = [c["test_case"] for c in captured_test_cases]
    assert cases[0].input == "How long do we keep audit logs?"
    assert cases[0].retrieval_context == ["Audit logs are retained for 7 years."]
    assert not cases[1].retrieval_context


@pytest.mark.asyncio
async def test_multi_turn_conversation_context_reaches_model(
    mock_db_session: AsyncMock,
    patched_dependencies: MagicMock,
    captured_test_cases: List[Dict[str, Any]],
) -> None:
    from utils.run_evaluation import run_evaluation

    cfg = {
        "project_id": "p1",
        "model": {"name": "m", "provider": "ollama"},
        "judgeLlm": {},
        "dataset": {
            "prompts": [
                {
                    "scenario": "Employee handbook",
                    "context": ["PTO: 15 days a year."],
                    "turns": [
                        {"role": "user", "content": "How many PTO days do I get?"},
                        {"role": "assistant", "content": "15."},
                        {"role": "user", "content": "Do they roll over?"},
                    ],
                }
            ]
        },
        "metrics": {},
        "evaluationMode": "standard",
    }

    result = await run_evaluation(
        db=mock_db_session, experiment_id="exp-rag-2", config=cfg, organization_id=1
    )

    assert "error" not in result
    prompts = [c.kwargs["prompt"] for c in patched_dependencies.call_args_list]
    assert len(prompts) == 2
    for p in prompts:
        assert "Context:\n[1] PTO: 15 days a year." in p
    # The conversational test case keeps the passages for the judge.
    assert captured_test_cases[0]["test_case"].context == ["PTO: 15 days a year."]


def test_passages_accept_structured_entries_and_single_strings() -> None:
    from utils import run_evaluation as run_eval_module

    norm = run_eval_module._normalize_passages
    assert norm("One passage.") == ["One passage."]
    assert norm([{"text": "From text.", "source": "a.pdf"}, {"content": "From content."}, {"id": 1}]) == [
        "From text.",
        "From content.",
    ]
    assert norm(None) == []


def test_single_turn_prompt_may_use_context_key() -> None:
    from utils import run_evaluation as run_eval_module

    assert run_eval_module._prompt_passages({"prompt": "q", "context": ["C."]}) == ["C."]
    # retrieval_context wins when both are present.
    assert run_eval_module._prompt_passages(
        {"prompt": "q", "retrieval_context": ["R."], "context": ["C."]}
    ) == ["R."]

# --------------------------------------------------------------------------- #
# Relative dataset paths resolve like the dataset read endpoint                #
# --------------------------------------------------------------------------- #


def test_relative_dataset_path_resolves_under_datasets_folder() -> None:
    """A dataset record path ("demo/...") is relative to data/datasets, not EvaluationModule/."""
    from utils import run_evaluation as run_eval_module

    resolved = run_eval_module._resolve_relative_dataset_path(
        __import__("pathlib").Path("demo/knowledge_base_golden_set.json")
    )
    assert resolved.exists()
    assert resolved.parent.name == "demo"
    assert resolved.parent.parent.name == "datasets"


def test_relative_dataset_path_keeps_legacy_module_relative_paths() -> None:
    """Older configs stored paths relative to EvaluationModule/; those still load."""
    from pathlib import Path

    from utils import run_evaluation as run_eval_module

    resolved = run_eval_module._resolve_relative_dataset_path(
        Path("data/datasets/chatbot/chatbot_customer_support.json")
    )
    assert resolved.exists()
    assert resolved.name == "chatbot_customer_support.json"


def test_relative_dataset_path_rejects_traversal() -> None:
    from pathlib import Path

    from utils import run_evaluation as run_eval_module

    with pytest.raises(ValueError):
        run_eval_module._resolve_relative_dataset_path(Path("../../../../../../etc/passwd"))
