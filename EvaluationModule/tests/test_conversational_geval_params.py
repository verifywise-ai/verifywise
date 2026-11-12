"""
Multi-turn GEval metrics must name the turn fields they read.

DeepEval 4.3 made ConversationalGEval's `evaluation_params` optional at construction
but required at evaluation: a metric built without it fails every test case with
"GEval requires evaluation_params". Conversation Coherence, Helpfulness, Safety and
Task Completion were all built that way, so every simulated or multi-turn run
reported them as errors.
"""

from __future__ import annotations

import pytest
from deepeval.metrics import ConversationalGEval
from deepeval.models import DeepEvalBaseLLM


class _StubJudge(DeepEvalBaseLLM):
    def __init__(self):
        self.model = "stub-judge"

    def load_model(self):
        return self

    def generate(self, prompt, schema=None, **kwargs):
        raise AssertionError("the judge must not be called while building metrics")

    async def a_generate(self, prompt, schema=None, **kwargs):
        raise AssertionError("the judge must not be called while building metrics")

    def get_model_name(self):
        return "stub-judge"


@pytest.fixture
def conversational_metrics(monkeypatch):
    from deepeval_engine import deepeval_evaluator

    monkeypatch.setattr(deepeval_evaluator, "get_judge_llm", lambda **_: _StubJudge())
    evaluator = deepeval_evaluator.DeepEvalEvaluator.__new__(deepeval_evaluator.DeepEvalEvaluator)
    return evaluator._initialize_conversational_metrics(
        metrics_config={}, expected_outcome="The user learns how to reset a password."
    )


def test_every_conversational_geval_names_role_and_content(conversational_metrics):
    from deepeval_engine.deepeval_evaluator import MULTI_TURN_PARAMS

    gevals = {name: m for name, m in conversational_metrics if isinstance(m, ConversationalGEval)}
    assert set(gevals) == {
        "Conversation Coherence",
        "Conversation Helpfulness",
        "Task Completion",
        "Conversation Safety",
    }
    for name, metric in gevals.items():
        assert metric.evaluation_params, f"{name} has no evaluation_params"
        assert MULTI_TURN_PARAMS.ROLE in metric.evaluation_params, name
        assert MULTI_TURN_PARAMS.CONTENT in metric.evaluation_params, name


def test_metrics_do_not_share_one_params_list(conversational_metrics):
    """ConversationalGEval appends to the list it is given; a shared list would leak."""
    lists = [m.evaluation_params for _, m in conversational_metrics if isinstance(m, ConversationalGEval)]
    assert len({id(lst) for lst in lists}) == len(lists)
