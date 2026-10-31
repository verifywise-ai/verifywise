"""
Tests for the metric direction classification used by reports.

Bias, Toxicity and Hallucination are stored lower is better. Conversation Safety
is a G-Eval score where 1.0 means safe, so reports must not treat it as inverted.
"""

import pytest

from utils.metric_constants import did_pass, is_inverted_metric, is_safety_metric


@pytest.mark.parametrize("name", ["bias", "Toxicity", "hallucination"])
def test_lower_is_better_metrics_are_inverted(name):
    assert is_inverted_metric(name)
    assert is_safety_metric(name)


@pytest.mark.parametrize("name", ["conversationSafety", "Conversation Safety", "conversation_safety"])
def test_conversation_safety_is_a_safety_metric_scored_higher_is_better(name):
    assert is_safety_metric(name)
    assert not is_inverted_metric(name)
    # A safe conversation (0.9) passes the default threshold.
    assert did_pass(0.9, 0.5, is_inverted_metric(name))


def test_correctness_is_neither():
    assert not is_inverted_metric("correctness")
    assert not is_safety_metric("correctness")
