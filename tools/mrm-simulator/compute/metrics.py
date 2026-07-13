"""Pure monitoring-metric functions. No I/O, no CLI here."""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from scipy.stats import ks_2samp


def psi(reference: pd.Series, current: pd.Series, bins: int = 10) -> float:
    """Population Stability Index between two distributions, quantile-binned."""
    ref = reference.dropna().to_numpy()
    cur = current.dropna().to_numpy()
    if ref.size == 0 or cur.size == 0:
        return 0.0
    # Quantile bin edges from the reference; widen the outer edges to catch tails.
    quantiles = np.linspace(0, 1, bins + 1)
    edges = np.unique(np.quantile(ref, quantiles))
    if edges.size < 2:
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf
    ref_pct = np.histogram(ref, bins=edges)[0] / ref.size
    cur_pct = np.histogram(cur, bins=edges)[0] / cur.size
    eps = 1e-6
    ref_pct = np.clip(ref_pct, eps, None)
    cur_pct = np.clip(cur_pct, eps, None)
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def auc(labels: pd.Series, scores: pd.Series) -> float:
    y = labels.to_numpy()
    s = scores.to_numpy()
    if len(np.unique(y)) < 2:
        return 0.5  # undefined with one class; report chance
    return float(roc_auc_score(y, s))


def gini(labels: pd.Series, scores: pd.Series) -> float:
    return float(2 * auc(labels, scores) - 1)


def ks(labels: pd.Series, scores: pd.Series) -> float:
    y = labels.to_numpy()
    s = scores.to_numpy()
    pos = s[y == 1]
    neg = s[y == 0]
    if pos.size == 0 or neg.size == 0:
        return 0.0
    return float(ks_2samp(pos, neg).statistic)


def fairness(df: pd.DataFrame, segment_col: str, metric: str) -> dict:
    """Compute a segment-sensitive metric per segment value plus 'overall'."""
    fn = {"gini": gini, "auc": auc, "ks": ks}[metric]
    out: dict[str, dict[str, float]] = {}
    for seg, group in df.groupby(segment_col):
        out[str(seg)] = {metric: fn(group["label"], group["prediction"])}
    out["overall"] = {metric: fn(df["label"], df["prediction"])}
    return out
