import sys
import os

# Add src to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from services.cost_service import _safe_cost


# Regression: LiteLLM's cost_per_token can return NaN (not raise) for a model
# whose pricing it doesn't recognize. A NaN persisted to
# ai_gateway_spend_logs.cost_usd breaks every spend-dashboard SUM/AVG
# (COALESCE does not catch NaN) and 500s the summary endpoint. _safe_cost must
# never let a non-finite or negative cost through.
def test_nan_becomes_zero():
    assert _safe_cost(float("nan")) == 0.0


def test_inf_becomes_zero():
    assert _safe_cost(float("inf")) == 0.0
    assert _safe_cost(float("-inf")) == 0.0


def test_negative_becomes_zero():
    assert _safe_cost(-1.0) == 0.0


def test_none_becomes_zero():
    assert _safe_cost(None) == 0.0


def test_valid_cost_passes_through():
    assert _safe_cost(0.0055) == 0.0055
    assert _safe_cost(0.0) == 0.0
