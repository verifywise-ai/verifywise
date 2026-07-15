import numpy as np
import pandas as pd
from metrics import psi, auc, gini, ks, fairness


def test_psi_zero_for_identical_distributions():
    rng = np.random.default_rng(0)
    ref = pd.Series(rng.normal(size=5000))
    cur = pd.Series(rng.normal(size=5000))
    assert psi(ref, cur) < 0.05


def test_psi_large_for_shifted_distribution():
    rng = np.random.default_rng(0)
    ref = pd.Series(rng.normal(0, 1, size=5000))
    cur = pd.Series(rng.normal(2, 1, size=5000))  # mean shifted +2
    assert psi(ref, cur) > 0.25


def test_auc_one_for_perfect_separation():
    labels = pd.Series([0, 0, 0, 1, 1, 1])
    scores = pd.Series([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
    assert auc(labels, scores) == 1.0


def test_auc_half_for_random():
    rng = np.random.default_rng(1)
    labels = pd.Series(rng.integers(0, 2, size=4000))
    scores = pd.Series(rng.random(size=4000))
    assert 0.45 < auc(labels, scores) < 0.55


def test_gini_is_two_auc_minus_one():
    labels = pd.Series([0, 0, 1, 1])
    scores = pd.Series([0.1, 0.4, 0.6, 0.9])
    assert abs(gini(labels, scores) - (2 * auc(labels, scores) - 1)) < 1e-9


def test_ks_in_range():
    labels = pd.Series([0, 0, 0, 1, 1, 1])
    scores = pd.Series([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
    v = ks(labels, scores)
    assert 0.0 <= v <= 1.0
    assert v > 0.9  # near-perfect separation


def test_fairness_returns_per_segment_and_overall():
    df = pd.DataFrame({
        "label": [0, 1, 0, 1, 0, 1],
        "prediction": [0.2, 0.8, 0.3, 0.7, 0.4, 0.6],
        "segment": ["a", "a", "a", "b", "b", "b"],
    })
    out = fairness(df, "segment", "gini")
    assert set(out.keys()) == {"a", "b", "overall"}
    assert "gini" in out["a"] and "gini" in out["overall"]
