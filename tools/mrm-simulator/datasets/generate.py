"""Deterministic generator for the four bundled monitoring datasets.

Run once; commit the CSVs. Not run at simulate-time.
    ./venv/bin/python generate.py
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from pathlib import Path

HERE = Path(__file__).parent
DAYS = 30
ROWS_PER_DAY = 400
START = pd.Timestamp("2026-06-01")


def _rows(day_shift_fn, seg_gini_fn, rng):
    frames = []
    for d in range(DAYS):
        date = (START + pd.Timedelta(days=d)).strftime("%Y-%m-%d")
        shift = day_shift_fn(d)
        feature = rng.normal(shift, 1, ROWS_PER_DAY)
        label = rng.integers(0, 2, ROWS_PER_DAY)
        segment = np.where(rng.random(ROWS_PER_DAY) < 0.3, "subprime", "prime")
        # prediction quality depends on the day/segment via seg_gini_fn
        sep = seg_gini_fn(d, segment)
        pred = 0.5 + sep * (label - 0.5) + rng.normal(0, 0.1, ROWS_PER_DAY)
        pred = np.clip(pred, 0, 1)
        frames.append(pd.DataFrame({
            "date": date, "feature": feature, "prediction": pred,
            "label": label, "segment": segment,
        }))
    return pd.concat(frames, ignore_index=True)


def credit_scoring(rng):
    # feature mean ramps 0 -> 2.5 across the month => PSI rises past 0.20 late.
    return _rows(lambda d: 2.5 * d / DAYS, lambda d, seg: 0.9, rng)


def fraud(rng):
    # stable feature, strong separation => healthy control.
    return _rows(lambda d: 0.0, lambda d, seg: 1.4, rng)


def loan(rng):
    # feature stable overall; subprime separation degrades over time.
    def seg_gini(d, seg):
        base = np.full(len(seg), 1.2)
        base[seg == "subprime"] = 1.2 - 1.0 * (d / DAYS)  # subprime sep collapses
        return base
    return _rows(lambda d: 0.0, seg_gini, rng)


def churn(rng):
    # feature drifts up then returns (recovery around day 22).
    def shift(d):
        return 2.0 * (d / 12) if d < 12 else max(0.0, 2.0 * (1 - (d - 12) / 12))
    return _rows(shift, lambda d, seg: 0.9, rng)


def main():
    builders = {
        "credit-scoring.csv": credit_scoring,
        "fraud-detection.csv": fraud,
        "loan-approval.csv": loan,
        "churn.csv": churn,
    }
    for name, fn in builders.items():
        rng = np.random.default_rng(abs(hash(name)) % (2**32))
        df = fn(rng)
        df.to_csv(HERE / name, index=False)
        print(f"wrote {name}: {len(df)} rows")


if __name__ == "__main__":
    main()
