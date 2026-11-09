"""
Tests for the score scale of G-Eval style metrics and for threshold key normalisation.

Bias, Toxicity and Hallucination are lower is better (0 = none found). The G-Eval
rubric asks the judge for 1.0 on a clean answer, so GEvalLikeMetric(lower_is_better=True)
stores 1 - that and passes at or below the threshold, the same scale as DeepEval's
native BiasMetric and ToxicityMetric.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest


class _StubRunner:
    def __init__(self, reply):
        self.reply = reply

    def generate(self, prompt, max_tokens=None, temperature=None):
        return self.reply


def _measure(*, judge_score, threshold, lower_is_better, reply=None):
    from deepeval_engine.deepeval_evaluator import GEvalLikeMetric

    metric = GEvalLikeMetric(
        threshold=threshold, model_name="judge", provider="anthropic", lower_is_better=lower_is_better
    )
    metric._runner = _StubRunner(
        reply if reply is not None else json.dumps({"score": judge_score, "reason": "r"})
    )
    metric.measure(SimpleNamespace(input="q", actual_output="a", expected_output=None))
    return metric


def test_clean_answer_is_stored_as_zero_and_passes():
    metric = _measure(judge_score=1.0, threshold=0.5, lower_is_better=True)
    assert metric.score == 0.0
    assert metric.is_successful()


def test_threshold_applies_to_the_stored_score():
    # Judge says 0.7 clean, so 0.3 bias. A 0.2 bias threshold must fail it,
    # as DeepEval's native BiasMetric would.
    metric = _measure(judge_score=0.7, threshold=0.2, lower_is_better=True)
    assert metric.score == pytest.approx(0.3)
    assert not metric.is_successful()

    metric = _measure(judge_score=0.9, threshold=0.2, lower_is_better=True)
    assert metric.score == pytest.approx(0.1)
    assert metric.is_successful()


def test_higher_is_better_metric_is_unchanged():
    metric = _measure(judge_score=0.7, threshold=0.5, lower_is_better=False)
    assert metric.score == pytest.approx(0.7)
    assert metric.is_successful()
    assert not _measure(judge_score=0.3, threshold=0.5, lower_is_better=False).is_successful()


@pytest.mark.parametrize("lower_is_better", [True, False])
def test_unparseable_reply_has_no_score_and_fails(lower_is_better):
    metric = _measure(judge_score=None, threshold=0.5, lower_is_better=lower_is_better, reply="no idea")
    assert metric.score is None
    assert not metric.is_successful()


def test_evaluator_marks_the_three_safety_metrics_lower_is_better(monkeypatch):
    from deepeval_engine import deepeval_evaluator
    from deepeval_engine.deepeval_evaluator import DeepEvalEvaluator, GEvalLikeMetric

    # A non-OpenAI judge takes the G-Eval path; the judge is never called here.
    monkeypatch.setenv("G_EVAL_PROVIDER", "ollama")
    monkeypatch.setattr(deepeval_evaluator, "get_judge_llm", lambda *_, **__: None)
    evaluator = DeepEvalEvaluator.__new__(DeepEvalEvaluator)
    evaluator.metric_thresholds = {}

    metrics = evaluator._initialize_metrics(
        {"hallucination": True, "toxicity": True, "bias": True, "correctness": True}
    )
    flags = {
        name: metric.lower_is_better
        for name, metric in metrics
        if isinstance(metric, GEvalLikeMetric)
    }
    assert {name for name, lower in flags.items() if lower} == {"Hallucination", "Toxicity", "Bias"}
    assert flags["Correctness"] is False


def test_threshold_keys_are_normalised_to_snake_case():
    from deepeval_engine.deepeval_evaluator import normalize_metric_thresholds

    assert normalize_metric_thresholds(
        {"answerRelevancy": 0.7, "instruction_following": 0.6, "bias": 0.2}
    ) == {"answer_relevancy": 0.7, "instruction_following": 0.6, "bias": 0.2}


def test_threshold_normalisation_changes_only_the_case():
    from deepeval_engine.deepeval_evaluator import normalize_metric_thresholds

    # EvalServer routes planQuality; here plan_quality is a metric of its own.
    assert normalize_metric_thresholds({"planQuality": 0.8, "planningQuality": 0.7}) == {
        "plan_quality": 0.8,
        "planning_quality": 0.7,
    }
    assert normalize_metric_thresholds({"BIAS": 0.2, "Answer Relevancy": 0.8}) == {
        "bias": 0.2,
        "answer_relevancy": 0.8,
    }
    # No metric reads contextual_relevancy, so it goes to context_relevancy.
    assert normalize_metric_thresholds({"contextualRelevancy": 0.6}) == {"context_relevancy": 0.6}


def test_threshold_normalisation_accepts_numeric_strings():
    from deepeval_engine.deepeval_evaluator import normalize_metric_thresholds

    assert normalize_metric_thresholds({"bias": "0.2"}) == {"bias": 0.2}


def test_threshold_normalisation_drops_non_numeric_values():
    from deepeval_engine.deepeval_evaluator import normalize_metric_thresholds

    assert (
        normalize_metric_thresholds(
            {
                "bias": None,
                "toxicity": "high",
                "hallucination": True,
                "correctness": float("nan"),
                "completeness": "inf",
                "faithfulness": 50,
                "answer_relevancy": -0.1,
                "tool_selection": 10**400,
            }
        )
        == {}
    )
    assert normalize_metric_thresholds(None) == {}
