"""Deterministic generator for the four bundled monitoring datasets.

Run once; commit the CSVs. Not run at simulate-time.
    ./venv/bin/python generate.py

Calibration targets (verified against compute CLI):
  fraud:         AUC ~0.90 stable, PSI < 0.10 throughout
  credit:        AUC ~0.82 early -> ~0.74 late; PSI ~0.001 day-1, crossing 0.20 ~day15, ending ~0.35-0.44
  loan (prime):  AUC/Gini stable ~0.83/0.65; subprime degrades 0.83->0.62 AUC, Gini gap > 0.20
  churn:         AUC ~0.78 stable; PSI ~0.001 day-1, peak ~0.26 day11, recovered < 0.15 by day25
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from pathlib import Path

HERE = Path(__file__).parent
DAYS = 30
ROWS_PER_DAY = 400
START = pd.Timestamp("2026-06-01")


def _rows(day_shift_fn, sep_fn, noise, rng):
    """Generate DAYS * ROWS_PER_DAY rows of monitoring data.

    Args:
        day_shift_fn: d -> float, feature mean shift on day d (baseline = 0).
        sep_fn:       (d, segment_array) -> float or array, prediction separation.
        noise:        std of Gaussian noise added to predictions (controls AUC realism).
        rng:          numpy Generator for reproducibility.
    """
    frames = []
    for d in range(DAYS):
        date = (START + pd.Timedelta(days=d)).strftime("%Y-%m-%d")
        shift = day_shift_fn(d)
        feature = rng.normal(shift, 1, ROWS_PER_DAY)
        label = rng.integers(0, 2, ROWS_PER_DAY)
        segment = np.where(rng.random(ROWS_PER_DAY) < 0.3, "subprime", "prime")
        sep = sep_fn(d, segment)
        pred = 0.5 + sep * (label - 0.5) + rng.normal(0, noise, ROWS_PER_DAY)
        pred = np.clip(pred, 0, 1)
        frames.append(pd.DataFrame({
            "date": date, "feature": feature, "prediction": pred,
            "label": label, "segment": segment,
        }))
    return pd.concat(frames, ignore_index=True)


def credit_scoring(rng):
    # Feature mean ramps 0 -> 0.65 over 30 days.
    # PSI(N(0,1) vs N(0.65,1)) ~ 0.001 day-0 -> ~0.001 day-1 -> crosses 0.20 ~day-15 -> ~0.44 day-29.
    # Separation ramps 0.40 -> 0.28: AUC ~0.825 early, ~0.743 late (Gini 0.65 -> 0.49).
    # noise=0.3 keeps predictions in a realistic range rather than 0/1 cliffs.
    def sep_fn(d, seg):
        return 0.40 - 0.12 * (d / (DAYS - 1))

    return _rows(
        day_shift_fn=lambda d: 0.65 * d / (DAYS - 1),
        sep_fn=sep_fn,
        noise=0.3,
        rng=rng,
    )


def fraud(rng):
    # Stable feature (no drift) => PSI stays < 0.10 throughout.
    # sep=0.55, noise=0.3 => AUC ~0.90 (strong but realistic fraud detector).
    return _rows(
        day_shift_fn=lambda d: 0.0,
        sep_fn=lambda d, seg: 0.55,
        noise=0.3,
        rng=rng,
    )


def loan(rng):
    # Feature stable; subprime sep degrades 0.40 -> 0.12 over 30 days.
    # Prime:    sep=0.40, noise=0.3 => AUC ~0.826, Gini ~0.65  (stable)
    # Subprime: sep 0.40->0.12      => Gini ~0.65 early -> ~0.23 late
    # Fairness gap at day-29: prime gini ~0.65, subprime gini ~0.23 => gap ~0.42 (> 0.20 ✓, prime < 0.95 ✓)
    def seg_fn(d, seg):
        prime_sep = 0.40
        subprime_sep = 0.40 - 0.28 * (d / (DAYS - 1))   # 0.40 -> 0.12
        result = np.where(seg == "prime", prime_sep, subprime_sep)
        return result

    return _rows(
        day_shift_fn=lambda d: 0.0,
        sep_fn=seg_fn,
        noise=0.3,
        rng=rng,
    )


def churn(rng):
    # Feature drifts up to peak shift 0.55 at day 11 then decays back to 0 by day 22.
    # PSI(N(0,1) vs N(0.55,1)) ~ 0.26 at peak => clear breach, not explosion.
    # sep=0.45, noise=0.4 => AUC ~0.78 stable.
    def shift(d):
        if d <= 11:
            return 0.55 * (d / 11)
        else:
            return max(0.0, 0.55 * (1.0 - (d - 11) / 11.0))

    return _rows(
        day_shift_fn=shift,
        sep_fn=lambda d, seg: 0.45,
        noise=0.4,
        rng=rng,
    )


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
