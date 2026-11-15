"""
Tests for LowerIsBetterNativeMetric, which keeps DeepEval's native BiasMetric and
ToxicityMetric on VerifyWise's scale (0 = none found, threshold is the maximum).

DeepEval 4.2.0 inverted both metrics: the score is the share of clean verdicts and
`threshold` is the minimum passing score. Stored results, saved thresholds, the
reports and the CI gate all use the old direction, so the wrapper converts both ways.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.fixture(autouse=True)
def _clean_share_scale(request, monkeypatch):
    """Stub tests exercise the 4.2.0+ conversion whatever DeepEval is installed.

    The guard test reads the real decision, and the older-DeepEval test sets its own.
    """
    if request.node.name == "test_version_check_matches_how_installed_deepeval_scores":
        return
    from deepeval_engine import deepeval_evaluator

    monkeypatch.setattr(deepeval_evaluator, "NATIVE_BIAS_SCORES_CLEAN_SHARE", True)


class _StubNativeMetric:
    """Behaves like DeepEval >= 4.2: score = share of clean verdicts, threshold = minimum."""

    def __init__(self, *, threshold, model=None, native_score=None, error=None, reason_template=None):
        self.threshold = threshold
        self.model = model
        self._native_score = native_score
        self.error = error
        self._reason_template = reason_template or "The score is {score:.2f} because one opinion was biased."
        self.score = None
        self.reason = None

    async def a_measure(self, test_case):
        return self.measure(test_case)

    def measure(self, test_case):
        self.score = self._native_score
        if self.score is not None:
            self.reason = self._reason_template.format(score=self.score)
        return self.score


def _wrapped(*, threshold, native_score, error=None, reason_template=None):
    from deepeval_engine.deepeval_evaluator import LowerIsBetterNativeMetric

    metric = LowerIsBetterNativeMetric(
        _StubNativeMetric,
        threshold=threshold,
        model="judge",
        native_score=native_score,
        error=error,
        reason_template=reason_template,
    )
    metric.measure(SimpleNamespace(input="q", actual_output="a"))
    return metric


def test_native_metric_gets_the_inverted_threshold():
    metric = _wrapped(threshold=0.2, native_score=1.0)
    assert metric.threshold == 0.2
    assert metric._metric.threshold == pytest.approx(0.8)


def test_clean_answer_is_stored_as_zero_and_passes():
    metric = _wrapped(threshold=0.5, native_score=1.0)
    assert metric.score == 0.0
    assert metric.is_successful()


def test_threshold_is_the_maximum_on_the_stored_score():
    # Native 0.7 clean means 0.3 biased: fails a 0.2 limit, passes a 0.3 limit.
    failing = _wrapped(threshold=0.2, native_score=0.7)
    assert failing.score == pytest.approx(0.3)
    assert not failing.is_successful()

    at_limit = _wrapped(threshold=0.3, native_score=0.7)
    assert at_limit.is_successful()


def test_missing_score_or_error_fails():
    assert _wrapped(threshold=0.5, native_score=None).score is None
    assert not _wrapped(threshold=0.5, native_score=None).is_successful()
    assert not _wrapped(threshold=0.5, native_score=1.0, error="judge timed out").is_successful()


def test_reason_quotes_the_stored_score():
    # DeepEval writes its own (clean-share) score into the reason.
    metric = _wrapped(threshold=0.5, native_score=0.75)
    assert metric.score == pytest.approx(0.25)
    assert metric.reason == "The score is 0.25 because one opinion was biased."


@pytest.mark.parametrize(
    "template, expected",
    [
        ("The score is {score:.1f} because no bias.", "The score is 0.00 because no bias."),
        ("It gets a score of {score:.3f} since it is neutral.", "It gets a score of 0.00 since it is neutral."),
        ("The score is 0.50 overall.", "The score is 0.50 overall."),  # not the native score: untouched
    ],
)
def test_reason_rewrite_handles_other_phrasings(template, expected):
    assert _wrapped(threshold=0.5, native_score=1.0, reason_template=template).reason == expected


def test_pass_fail_uses_the_exact_score_at_the_limit():
    # 7 of 10 verdicts clean is 0.3 found, exactly the limit.
    assert _wrapped(threshold=0.3, native_score=0.7).is_successful()


def test_async_measure_converts_too():
    import asyncio

    from deepeval_engine.deepeval_evaluator import LowerIsBetterNativeMetric

    metric = LowerIsBetterNativeMetric(_StubNativeMetric, threshold=0.5, native_score=0.75)
    assert asyncio.run(metric.a_measure(SimpleNamespace(input="q", actual_output="a"))) == pytest.approx(0.25)
    assert metric.is_successful()


def test_wrapper_can_be_copied_without_recursion():
    import copy

    metric = _wrapped(threshold=0.5, native_score=0.9)
    clone = copy.deepcopy(metric)
    assert clone.score == pytest.approx(0.1)
    assert clone.threshold == 0.5


def test_other_attributes_come_from_the_native_metric():
    assert _wrapped(threshold=0.5, native_score=0.9).model == "judge"


def test_openai_judge_wraps_native_bias_and_toxicity(monkeypatch):
    from deepeval.metrics import BiasMetric, ToxicityMetric

    from deepeval_engine import deepeval_evaluator
    from deepeval_engine.deepeval_evaluator import DeepEvalEvaluator, LowerIsBetterNativeMetric

    built = []

    def _fake(cls):
        def factory(*, threshold, model=None):
            built.append(cls.__name__)
            return _StubNativeMetric(threshold=threshold, model=model)

        return factory

    monkeypatch.setenv("G_EVAL_PROVIDER", "openai")
    monkeypatch.setattr(deepeval_evaluator, "get_judge_llm", lambda *_, **__: None)
    monkeypatch.setattr(deepeval_evaluator, "BiasMetric", _fake(BiasMetric))
    monkeypatch.setattr(deepeval_evaluator, "ToxicityMetric", _fake(ToxicityMetric))
    evaluator = DeepEvalEvaluator.__new__(DeepEvalEvaluator)
    evaluator.metric_thresholds = {"bias": 0.2, "toxicity": 0.4}

    metrics = dict(evaluator._initialize_metrics({"bias": True, "toxicity": True}))
    assert sorted(built) == ["BiasMetric", "ToxicityMetric"]
    for name, limit in (("Bias", 0.2), ("Toxicity", 0.4)):
        assert isinstance(metrics[name], LowerIsBetterNativeMetric)
        assert metrics[name].threshold == limit
        assert metrics[name]._metric.threshold == pytest.approx(1 - limit)


def test_version_check_matches_how_installed_deepeval_scores():
    """
    Guards the wrapper: the version decision must match what the installed BiasMetric
    and ToxicityMetric do, on 4.1.3 and 4.3.4 alike. If DeepEval flips these metrics
    again under the same version range, this fails loudly.
    """
    from deepeval_engine.deepeval_evaluator import NATIVE_BIAS_SCORES_CLEAN_SHARE
    from deepeval.metrics import BiasMetric, ToxicityMetric
    from deepeval.metrics.bias.schema import BiasVerdict
    from deepeval.metrics.toxicity.schema import ToxicityVerdict
    from deepeval.models import DeepEvalBaseLLM

    class _NoCallJudge(DeepEvalBaseLLM):
        def __init__(self):
            pass

        def load_model(self):
            return None

        def generate(self, *args, **kwargs):
            raise AssertionError("the judge must not be called")

        async def a_generate(self, *args, **kwargs):
            raise AssertionError("the judge must not be called")

        def get_model_name(self):
            return "no-call"

    for metric_cls, verdict_cls in ((BiasMetric, BiasVerdict), (ToxicityMetric, ToxicityVerdict)):
        metric = metric_cls(threshold=0.5, model=_NoCallJudge())
        metric.verdicts = [verdict_cls(verdict="yes", reason="r")] + [
            verdict_cls(verdict="no") for _ in range(3)
        ]
        # One biased/toxic verdict out of four: 0.75 on the clean-share scale (4.2.0+),
        # 0.25 on the found scale (older). VerifyWise stores 0.25 either way.
        expected_native = 0.75 if NATIVE_BIAS_SCORES_CLEAN_SHARE else 0.25
        assert metric._calculate_score() == pytest.approx(expected_native)


def test_older_deepeval_passes_scores_through(monkeypatch):
    """With DeepEval < 4.2.0 still installed, scores are already 'found' and must not flip."""
    from deepeval_engine import deepeval_evaluator

    monkeypatch.setattr(deepeval_evaluator, "NATIVE_BIAS_SCORES_CLEAN_SHARE", False)
    metric = _wrapped(threshold=0.2, native_score=0.25)
    assert metric._metric.threshold == 0.2
    assert metric.score == pytest.approx(0.25)
    assert not metric.is_successful()
    # The reason already quotes the stored scale; it is left alone.
    assert metric.reason == "The score is 0.25 because one opinion was biased."

    clean = _wrapped(threshold=0.2, native_score=0.0)
    assert clean.score == 0.0
    assert clean.is_successful()

