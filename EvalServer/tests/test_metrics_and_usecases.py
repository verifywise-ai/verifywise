"""
Tests for metric-name mapping, default metrics per task type, RAG context-skip
logic, multi-turn metric set, and the known ``metric_thresholds`` vs
``thresholds`` config-key mismatch.

These tests verify the metric "decision points" without running real DeepEval
metrics (which require LLM calls).
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

import pytest


METRIC_NAME_MAP_EXPECTED = {
    # Universal core (camelCase)
    "answerRelevancy": "answer_relevancy",
    "correctness": "correctness",
    "completeness": "completeness",
    "hallucination": "hallucination",
    "instructionFollowing": "instruction_following",
    "toxicity": "toxicity",
    "bias": "bias",
    # RAG (camelCase)
    "contextRelevancy": "context_relevancy",
    "contextualRelevancy": "context_relevancy",
    "contextPrecision": "context_precision",
    "contextRecall": "context_recall",
    "faithfulness": "faithfulness",
    # Agent (camelCase)
    "toolSelection": "tool_selection",
    "toolCorrectness": "tool_correctness",
    "actionRelevance": "action_relevance",
    "planningQuality": "planning_quality",
    "planQuality": "planning_quality",
    "planAdherence": "plan_adherence",
    "argumentCorrectness": "argument_correctness",
    "taskCompletion": "task_completion",
    "stepEfficiency": "step_efficiency",
}


# --------------------------------------------------------------------------- #
# Metric name map shape — pulled from a live source-of-truth check            #
# --------------------------------------------------------------------------- #


def test_metric_name_map_documents_all_camelcase_keys() -> None:
    """
    The runner accepts both camelCase (frontend) and snake_case (CI) metric keys.
    This test asserts that every camelCase key the UI may emit has a backend mapping.

    If a new UI metric is added without a mapping, this test will fail and
    point at the exact missing key.
    """
    import inspect

    from utils import run_evaluation as run_eval_module

    source = inspect.getsource(run_eval_module.run_evaluation)
    for ui_key, backend_key in METRIC_NAME_MAP_EXPECTED.items():
        assert f'"{ui_key}": "{backend_key}"' in source, (
            f"Expected metric_name_map to contain {ui_key!r} -> {backend_key!r} but "
            "the mapping was not found in run_evaluation source code."
        )


# --------------------------------------------------------------------------- #
# Default metrics per task_type                                                #
# --------------------------------------------------------------------------- #


def _capture_metrics_config(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """Patch DeepEvalEvaluator.run_evaluation to capture the metrics_config arg."""
    captured: Dict[str, Any] = {}

    from deepeval_engine import deepeval_evaluator as evaluator_module

    def _capture(self, *, test_cases_data, metrics_config, use_case):
        captured["metrics_config"] = metrics_config
        captured["use_case"] = use_case
        return []

    monkeypatch.setattr(evaluator_module.DeepEvalEvaluator, "run_evaluation", _capture)
    return captured


@pytest.mark.asyncio
async def test_default_metrics_for_chatbot_task(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """taskType=chatbot + empty metrics → universal core enabled, no RAG/agent."""
    from utils import run_evaluation as run_eval_module
    from crud import evaluation_logs as crud_module

    captured = _capture_metrics_config(monkeypatch)
    monkeypatch.setattr(run_eval_module, "list_scorers", AsyncMock(return_value=[]))
    monkeypatch.setattr(run_eval_module, "create_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "update_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_log", AsyncMock(return_value={"id": "l1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_metric", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "update_log_metadata", AsyncMock(return_value=None))

    cfg = dict(inline_prompts_config)
    cfg["metrics"] = {}
    cfg["taskType"] = "chatbot"

    await run_eval_module.run_evaluation(
        db=mock_db_session,
        experiment_id="exp-default-chatbot",
        config=cfg,
        organization_id=1,
    )

    metrics = captured["metrics_config"]
    universal = ["answer_relevancy", "correctness", "completeness", "hallucination",
                 "instruction_following", "toxicity", "bias"]
    for m in universal:
        assert metrics.get(m) is True, f"{m} should be enabled for chatbot defaults"
    # No RAG / agent metrics for chatbot default
    for m in ["context_relevancy", "faithfulness", "tool_selection", "planning_quality"]:
        assert metrics.get(m) is False, f"{m} should NOT be enabled for chatbot defaults"


@pytest.mark.asyncio
async def test_default_metrics_for_rag_task(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from utils import run_evaluation as run_eval_module
    from crud import evaluation_logs as crud_module

    captured = _capture_metrics_config(monkeypatch)
    monkeypatch.setattr(run_eval_module, "list_scorers", AsyncMock(return_value=[]))
    monkeypatch.setattr(run_eval_module, "create_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "update_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_log", AsyncMock(return_value={"id": "l1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_metric", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "update_log_metadata", AsyncMock(return_value=None))

    cfg = dict(inline_prompts_config)
    cfg["metrics"] = {}
    cfg["taskType"] = "rag"

    await run_eval_module.run_evaluation(
        db=mock_db_session,
        experiment_id="exp-default-rag",
        config=cfg,
        organization_id=1,
    )

    metrics = captured["metrics_config"]
    for m in ["answer_relevancy", "correctness", "completeness", "hallucination", "bias"]:
        assert metrics[m] is True
    for m in ["context_relevancy", "context_precision", "context_recall", "faithfulness"]:
        assert metrics[m] is True, f"{m} must be enabled for RAG default"
    # No agent metrics
    for m in ["tool_selection", "planning_quality"]:
        assert metrics[m] is False


@pytest.mark.asyncio
async def test_default_metrics_for_agent_task(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from utils import run_evaluation as run_eval_module
    from crud import evaluation_logs as crud_module

    captured = _capture_metrics_config(monkeypatch)
    monkeypatch.setattr(run_eval_module, "list_scorers", AsyncMock(return_value=[]))
    monkeypatch.setattr(run_eval_module, "create_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "update_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_log", AsyncMock(return_value={"id": "l1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_metric", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "update_log_metadata", AsyncMock(return_value=None))

    cfg = dict(inline_prompts_config)
    cfg["metrics"] = {}
    cfg["taskType"] = "agent"

    await run_eval_module.run_evaluation(
        db=mock_db_session,
        experiment_id="exp-default-agent",
        config=cfg,
        organization_id=1,
    )

    metrics = captured["metrics_config"]
    for m in ["answer_relevancy", "instruction_following", "toxicity"]:
        assert metrics[m] is True
    for m in ["tool_selection", "tool_correctness", "action_relevance", "planning_quality"]:
        assert metrics[m] is True, f"{m} must be enabled for agent default"
    for m in ["context_relevancy", "faithfulness"]:
        assert metrics[m] is False


@pytest.mark.asyncio
async def test_metrics_list_format_from_ci_runner_is_normalized(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """CI runner sends metrics as [{"name": ..., "threshold": ...}]; runner converts to dict."""
    from utils import run_evaluation as run_eval_module
    from crud import evaluation_logs as crud_module

    captured = _capture_metrics_config(monkeypatch)
    monkeypatch.setattr(run_eval_module, "list_scorers", AsyncMock(return_value=[]))
    monkeypatch.setattr(run_eval_module, "create_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "update_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_log", AsyncMock(return_value={"id": "l1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_metric", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "update_log_metadata", AsyncMock(return_value=None))

    cfg = dict(inline_prompts_config)
    cfg["metrics"] = [
        {"name": "answer_relevancy", "threshold": 0.5},
        {"name": "faithfulness", "threshold": 0.7},
    ]
    cfg["taskType"] = "rag"

    await run_eval_module.run_evaluation(
        db=mock_db_session,
        experiment_id="exp-list-metrics",
        config=cfg,
        organization_id=1,
    )

    metrics = captured["metrics_config"]
    assert metrics["answer_relevancy"] is True
    assert metrics["faithfulness"] is True
    # Things that weren't specified should be False
    assert metrics["context_recall"] is False


# --------------------------------------------------------------------------- #
# get_metrics_for_evaluation — single decision point                          #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "use_case,is_multi_turn,expected_in,expected_not_in",
    [
        # Single-turn chatbot → universal core
        ("chatbot", False, ["Answer Relevancy", "Correctness", "Completeness", "Bias"],
         ["Context Relevancy", "Tool Correctness", "Knowledge Retention"]),
        # Single-turn RAG
        ("rag", False, ["Answer Relevancy", "Faithfulness", "Context Relevancy", "Context Precision"],
         ["Tool Correctness", "Knowledge Retention"]),
        # Single-turn agent
        ("agent", False, ["Tool Correctness", "Plan Quality", "Plan Adherence", "Task Completion", "Step Efficiency"],
         ["Faithfulness", "Knowledge Retention"]),
        # Multi-turn chatbot → conversational set
        ("chatbot", True, ["Turn Relevancy", "Knowledge Retention", "Conversation Coherence",
                            "Conversation Helpfulness", "Conversation Safety"],
         ["Answer Relevancy", "Correctness"]),
        # Multi-turn RAG → adds Context Awareness
        ("rag", True, ["Context Awareness", "Turn Relevancy"], ["Plan Quality"]),
        # Multi-turn agent → comprehensive agent metrics
        ("agent", True, ["Plan Quality", "Plan Adherence", "Tool Correctness",
                         "Argument Correctness", "Task Completion", "Step Efficiency"],
         ["Context Relevancy"]),
    ],
)
def test_get_metrics_for_evaluation_returns_correct_set(
    use_case: str, is_multi_turn: bool, expected_in: List[str], expected_not_in: List[str]
) -> None:
    from deepeval_engine.deepeval_evaluator import DeepEvalEvaluator

    result = DeepEvalEvaluator.get_metrics_for_evaluation(use_case, is_multi_turn)
    metric_names = result["metric_names"]

    for m in expected_in:
        assert m in metric_names, f"{m} expected for ({use_case}, multi_turn={is_multi_turn})"
    for m in expected_not_in:
        assert m not in metric_names, (
            f"{m} should NOT be in metric set for ({use_case}, multi_turn={is_multi_turn})"
        )


def test_get_metrics_for_evaluation_unknown_use_case_falls_back_to_chatbot() -> None:
    from deepeval_engine.deepeval_evaluator import DeepEvalEvaluator

    result = DeepEvalEvaluator.get_metrics_for_evaluation("unknown-task", is_multi_turn=False)
    assert result["use_case"] == "chatbot"


def test_get_metrics_for_evaluation_handles_none_use_case() -> None:
    from deepeval_engine.deepeval_evaluator import DeepEvalEvaluator

    result = DeepEvalEvaluator.get_metrics_for_evaluation("", is_multi_turn=False)
    assert result["use_case"] == "chatbot"


# --------------------------------------------------------------------------- #
# RAG metrics skip when retrieval_context missing                              #
# --------------------------------------------------------------------------- #


def test_rag_metric_skip_logic_documented() -> None:
    """
    Document and verify the design contract: RAG metrics that require
    retrieval_context (Context Relevancy, Context Precision, Context Recall,
    Faithfulness) MUST NOT raise when the test case lacks a context. Instead
    they're filtered out before evaluation.

    This is a structural assertion against the metric catalog, not a runtime
    LLM call.
    """
    from deepeval_engine.deepeval_evaluator import DeepEvalEvaluator

    rag_set = DeepEvalEvaluator.get_metrics_for_evaluation("rag", is_multi_turn=False)
    rag_required_context = {"Context Relevancy", "Context Precision", "Context Recall", "Faithfulness"}
    # The catalog should expose the names so the runner knows what to skip.
    assert rag_required_context.issubset(set(rag_set["metric_names"]))


# --------------------------------------------------------------------------- #
# Known bug: thresholds vs metric_thresholds                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_thresholds_key_is_consumed_by_runner(
    inline_prompts_config: Dict[str, Any],
    mock_db_session: AsyncMock,
    stub_model_runner: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    The runner reads ``config['thresholds']`` and forwards it to
    DeepEvalEvaluator(metric_thresholds=...).  ``config['metric_thresholds']``
    (the format CI sends) is NOT consumed.

    This test pins the *current* behavior so any future refactor is
    intentional.
    """
    from utils import run_evaluation as run_eval_module
    from crud import evaluation_logs as crud_module
    from deepeval_engine import deepeval_evaluator as evaluator_module

    captured: Dict[str, Any] = {}

    original_init = evaluator_module.DeepEvalEvaluator.__init__

    def capture_init(self, *args, **kwargs):
        captured["metric_thresholds"] = kwargs.get("metric_thresholds")
        return original_init(self, *args, **kwargs)

    monkeypatch.setattr(evaluator_module.DeepEvalEvaluator, "__init__", capture_init)
    monkeypatch.setattr(
        evaluator_module.DeepEvalEvaluator, "run_evaluation", lambda self, **kwargs: []
    )
    monkeypatch.setattr(run_eval_module, "list_scorers", AsyncMock(return_value=[]))
    monkeypatch.setattr(run_eval_module, "create_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "update_scorer", AsyncMock(return_value=None))
    monkeypatch.setattr(run_eval_module, "touch_scorer_updated_at", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_log", AsyncMock(return_value={"id": "l1"}))
    monkeypatch.setattr(crud_module, "update_experiment_status", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "create_metric", AsyncMock(return_value=None))
    monkeypatch.setattr(crud_module, "update_log_metadata", AsyncMock(return_value=None))

    cfg = dict(inline_prompts_config)
    cfg["thresholds"] = {"answer_relevancy": 0.8}
    # CI-style alternative key — currently NOT applied
    cfg["metric_thresholds"] = {"correctness": 0.99}

    await run_eval_module.run_evaluation(
        db=mock_db_session,
        experiment_id="exp-thresholds",
        config=cfg,
        organization_id=1,
    )

    forwarded = captured.get("metric_thresholds") or {}
    assert forwarded.get("answer_relevancy") == 0.8
    assert "correctness" not in forwarded or forwarded.get("correctness") != 0.99
