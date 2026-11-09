"""
Every copy of the "lower is better" metric list must match metric_constants.py.

The CI runners and the SDK are standalone (installed or copied without EvalServer's
src), so each keeps its own copy. This test fails as soon as one drifts, which is how
Conversation Safety stayed inverted in the CI gate after the reports were fixed.
"""

import ast
import re
from pathlib import Path

import pytest

from utils.metric_constants import INVERTED_METRICS, is_inverted_metric

REPO_ROOT = Path(__file__).resolve().parents[2]

PYTHON_COPIES = [
    ".github/actions/eval/ci_eval_runner.py",
    "EvalServer/action/eval_runner.py",
    "EvalServer/scripts/ci_eval_runner.py",
    "EvalServer/sdk/src/verifywise/models.py",
]
FRONTEND_COPY = "Clients/src/presentation/pages/EvalsDashboard/metricScore.ts"


def _python_set(path: Path) -> set:
    tree = ast.parse(path.read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "INVERTED_METRICS" for t in node.targets
        ):
            return set(ast.literal_eval(node.value))
    raise AssertionError(f"{path} has no module-level INVERTED_METRICS")


@pytest.mark.parametrize("relative", PYTHON_COPIES)
def test_python_copy_matches_metric_constants(relative):
    assert _python_set(REPO_ROOT / relative) == INVERTED_METRICS


def test_frontend_copy_matches_metric_constants():
    source = (REPO_ROOT / FRONTEND_COPY).read_text()
    match = re.search(r"LOWER_IS_BETTER_METRICS = new Set\(\[([^\]]*)\]\)", source)
    assert match, f"{FRONTEND_COPY} has no LOWER_IS_BETTER_METRICS set"
    assert set(re.findall(r'"([^"]+)"', match.group(1))) == INVERTED_METRICS


def test_action_runner_copies_are_identical():
    first, second = (REPO_ROOT / p for p in PYTHON_COPIES[:2])
    assert first.read_text() == second.read_text()


@pytest.mark.parametrize("name", ["bias", "Toxicity", "hallucination", "Bias "])
def test_exact_names_are_inverted(name):
    assert is_inverted_metric(name)


@pytest.mark.parametrize("name", ["unbiasedTone", "hallucinationResistance", "conversationSafety"])
def test_names_that_only_contain_a_keyword_are_not_inverted(name):
    assert not is_inverted_metric(name)
