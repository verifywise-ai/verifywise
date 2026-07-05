# MRM simulator v2a — real compute + config-driven fleet — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the simulator's scripted metric values with real metrics (PSI/AUC/gini/KS/fairness) computed in Python from four bundled datasets, and replace the hardcoded fleet with a `config.yaml`.

**Architecture:** A new Python `compute/` module (pandas/numpy/sklearn) reads a bundled CSV, slices a fixed reference window vs. a target period, and returns metric JSON on stdout. The existing TS engine shells out to it per model/period and pushes the real values via the unchanged ingest client. A `config.yaml` + loader replaces `scenarios/fleet.ts` and `scenarios/storylines.ts`.

**Tech Stack:** Python 3.11 (pandas, numpy, scikit-learn, scipy, pytest) for compute; existing TypeScript (tsx, vitest) for orchestration; YAML config.

## Global Constraints

- All work stays under `tools/mrm-simulator/`. No changes to `Servers/`, `Clients/`, or the MRM feature.
- The Python compute module is a pure, stateless subprocess: no web server, no persistence, no network. It reads a CSV and prints JSON.
- Metrics are exactly five: `psi`, `auc`, `gini`, `ks`, and `fairness` (segment-wise gini). No others.
- The reference window is each dataset's first 7 days (min-date to min-date + 7 days) unless an explicit `--reference` is passed.
- Datasets are committed CSVs generated deterministically (seeded numpy); the generator is kept but not run at simulate-time.
- Compute output must be finite numbers; the TS side already guards against non-finite values and must keep doing so.
- The existing TS files `cli.ts`, `jwtClient.ts`, `ingestClient.ts`, `setup.ts`, `verify.ts`, `report.ts`, `config.ts` (safety guard) are reused; only `engine.ts` changes and `cli.ts` swaps its fleet source. `scenarios/storylines.ts` and `scenarios/fleet.ts` are removed.
- Localhost safety guard, idempotency, and the `FleetModel`/`MetricPoint` types are unchanged except `FleetModel` gains `dataset` and `segmentCol`.

---

## File structure

```
tools/mrm-simulator/
  compute/
    requirements.txt        # pandas, numpy, scikit-learn, scipy, pytest
    metrics.py              # pure metric functions: psi, auc, gini, ks, fairness
    __main__.py             # CLI: parse args, load CSV, slice, compute, print JSON
    test_metrics.py         # pytest unit tests for the metric functions
  datasets/
    generate.py             # deterministic generator (run once, committed output)
    credit-scoring.csv
    fraud-detection.csv
    loan-approval.csv
    churn.csv
    test_datasets.py        # asserts computed metrics cross thresholds per dataset
  config.yaml               # the fleet definition
  src/
    types.ts                # FleetModel gains dataset + segmentCol
    configLoader.ts         # parse + validate config.yaml -> FleetModel[]
    configLoader.test.ts
    computeClient.ts        # TS wrapper that shells out to the Python compute module
    engine.ts               # rewired to use computeClient instead of storylines
    engine.test.ts          # updated: stub computeClient
    cli.ts                  # swap FLEET import for loadConfig()
  scenarios/                # REMOVED (storylines.ts, fleet.ts)
```

---

### Task 1: Python compute engine — metric functions (TDD)

**Files:**
- Create: `tools/mrm-simulator/compute/requirements.txt`
- Create: `tools/mrm-simulator/compute/metrics.py`
- Test: `tools/mrm-simulator/compute/test_metrics.py`

**Interfaces:**
- Produces: `psi(reference: pd.Series, current: pd.Series, bins: int = 10) -> float`, `auc(labels: pd.Series, scores: pd.Series) -> float`, `gini(labels, scores) -> float`, `ks(labels, scores) -> float`, `fairness(df: pd.DataFrame, segment_col: str, metric: str) -> dict[str, dict[str, float]]`.

- [ ] **Step 1: Create requirements.txt**

```
pandas>=2.1,<3
numpy>=1.26,<3
scikit-learn>=1.3,<2
scipy>=1.11,<2
pytest>=8,<9
```

(Ranges, not exact pins — the local machine runs Python 3.11, and these lower
bounds all support 3.11. If a resolver picks incompatible wheels, let pip choose
compatible versions within the ranges.)

- [ ] **Step 2: Create the venv and install**

Run:
```bash
cd tools/mrm-simulator/compute && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
```
Expected: install succeeds.

- [ ] **Step 3: Write the failing tests**

Create `test_metrics.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd tools/mrm-simulator/compute && ./venv/bin/pytest test_metrics.py -q`
Expected: FAIL (`metrics` module / functions not defined).

- [ ] **Step 5: Implement metrics.py**

```python
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd tools/mrm-simulator/compute && ./venv/bin/pytest test_metrics.py -q`
Expected: PASS (7 tests).

- [ ] **Step 7: Add a .gitignore for the venv**

Append to `tools/mrm-simulator/.gitignore`:
```
compute/venv/
compute/__pycache__/
datasets/__pycache__/
.pytest_cache/
```

- [ ] **Step 8: Commit**

```bash
git add tools/mrm-simulator/compute/requirements.txt tools/mrm-simulator/compute/metrics.py tools/mrm-simulator/compute/test_metrics.py tools/mrm-simulator/.gitignore
git commit -m "feat(mrm-sim): python metric functions (psi/auc/gini/ks/fairness)"
```

---

### Task 2: Python compute CLI (`__main__.py`)

**Files:**
- Create: `tools/mrm-simulator/compute/__main__.py`
- Test: extend `tools/mrm-simulator/compute/test_metrics.py` with a CLI test (or a new `test_cli.py`)

**Interfaces:**
- Consumes: `metrics.py`.
- Produces: `python -m compute --dataset <path> --reference <start:end> --period <date> --metrics psi,auc,gini,ks --segment-col segment` prints a JSON object `{ "psi": float, "auc": float, ..., "fairness": {seg: {metric: float}} }` to stdout. Exit non-zero with a stderr message on any error.

- [ ] **Step 1: Write the failing CLI test**

Create `tools/mrm-simulator/compute/test_cli.py`:

```python
import json
import subprocess
import sys
import textwrap
from pathlib import Path


def _write_csv(tmp_path: Path) -> Path:
    # 14 days: first 7 = reference (mean 0), last 7 = shifted (mean 2)
    rows = ["date,feature,prediction,label,segment"]
    import numpy as np
    rng = np.random.default_rng(0)
    for day in range(14):
        shift = 0 if day < 7 else 2
        for _ in range(300):
            f = rng.normal(shift, 1)
            label = int(rng.integers(0, 2))
            pred = 0.5 + 0.3 * label + rng.normal(0, 0.1)
            seg = "subprime" if rng.random() < 0.3 else "prime"
            rows.append(f"2026-06-{day+1:02d},{f:.4f},{pred:.4f},{label},{seg}")
    p = tmp_path / "d.csv"
    p.write_text("\n".join(rows))
    return p


def test_cli_outputs_metric_json(tmp_path):
    csv = _write_csv(tmp_path)
    here = Path(__file__).parent
    result = subprocess.run(
        [sys.executable, "-m", "compute",
         "--dataset", str(csv),
         "--period", "2026-06-13",
         "--metrics", "psi,auc,gini,ks",
         "--feature-col", "feature",
         "--segment-col", "segment"],
        cwd=here, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    out = json.loads(result.stdout)
    assert "psi" in out and out["psi"] > 0.25  # day 13 is in the shifted window
    assert 0.0 <= out["auc"] <= 1.0
    assert "fairness" in out and "overall" in out["fairness"]


def test_cli_errors_on_missing_dataset(tmp_path):
    here = Path(__file__).parent
    result = subprocess.run(
        [sys.executable, "-m", "compute", "--dataset", "/nope.csv",
         "--period", "2026-06-13", "--metrics", "psi"],
        cwd=here, capture_output=True, text=True,
    )
    assert result.returncode != 0
    assert "not found" in result.stderr.lower() or "no such" in result.stderr.lower()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tools/mrm-simulator/compute && ./venv/bin/pytest test_cli.py -q`
Expected: FAIL (no `__main__.py`).

- [ ] **Step 3: Implement `__main__.py`**

```python
"""Compute monitoring metrics for one model/period and print JSON.

Reference window: first 7 days of the dataset (min date .. min date + 7d)
unless --reference start:end is given. The period is a single date; its rows
are the "current" slice compared against the reference.
"""
from __future__ import annotations
import argparse
import json
import sys
from datetime import timedelta
import pandas as pd

from metrics import psi as psi_fn, auc as auc_fn, gini as gini_fn, ks as ks_fn, fairness


def main() -> int:
    ap = argparse.ArgumentParser(prog="compute")
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--period", required=True, help="ISO date of the current slice")
    ap.add_argument("--reference", help="start:end ISO dates; default = first 7 days")
    ap.add_argument("--metrics", required=True, help="comma list: psi,auc,gini,ks")
    ap.add_argument("--feature-col", default="feature")
    ap.add_argument("--segment-col")
    args = ap.parse_args()

    try:
        df = pd.read_csv(args.dataset, parse_dates=["date"])
    except FileNotFoundError:
        print(f"dataset not found: {args.dataset}", file=sys.stderr)
        return 2

    if args.reference:
        rstart, rend = args.reference.split(":")
        ref_mask = (df["date"] >= rstart) & (df["date"] <= rend)
    else:
        rmin = df["date"].min()
        ref_mask = (df["date"] >= rmin) & (df["date"] <= rmin + timedelta(days=7))
    ref = df[ref_mask]
    cur = df[df["date"] == args.period]

    if cur.empty:
        print(f"no rows for period {args.period}", file=sys.stderr)
        return 3

    wanted = [m.strip() for m in args.metrics.split(",") if m.strip()]
    out: dict = {}
    if "psi" in wanted:
        out["psi"] = round(psi_fn(ref[args.feature_col], cur[args.feature_col]), 4)
    if "auc" in wanted:
        out["auc"] = round(auc_fn(cur["label"], cur["prediction"]), 4)
    if "gini" in wanted:
        out["gini"] = round(gini_fn(cur["label"], cur["prediction"]), 4)
    if "ks" in wanted:
        out["ks"] = round(ks_fn(cur["label"], cur["prediction"]), 4)
    if args.segment_col:
        fair = fairness(cur, args.segment_col, "gini")
        out["fairness"] = {
            seg: {k: round(v, 4) for k, v in vals.items()} for seg, vals in fair.items()
        }

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd tools/mrm-simulator/compute && ./venv/bin/pytest test_cli.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/mrm-simulator/compute/__main__.py tools/mrm-simulator/compute/test_cli.py
git commit -m "feat(mrm-sim): compute CLI emits metric JSON for a model/period"
```

---

### Task 3: Bundled datasets + generator

**Files:**
- Create: `tools/mrm-simulator/datasets/generate.py`
- Create (generated, committed): `tools/mrm-simulator/datasets/{credit-scoring,fraud-detection,loan-approval,churn}.csv`
- Test: `tools/mrm-simulator/datasets/test_datasets.py`

**Interfaces:**
- Produces: four CSVs with columns `date,feature,prediction,label,segment`, 30 days each, deterministic. Behaviors: credit-scoring PSI rises past 0.20 late; fraud stays stable; loan subprime gini drops below 0.45; churn PSI breaches then recovers.

- [ ] **Step 1: Write generate.py**

```python
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
```

- [ ] **Step 2: Generate the CSVs**

Run: `cd tools/mrm-simulator/datasets && ../compute/venv/bin/python generate.py`
Expected: prints four "wrote ..." lines; four CSVs exist.

- [ ] **Step 3: Write the dataset behavior test**

Create `tools/mrm-simulator/datasets/test_datasets.py`:

```python
import subprocess, sys, json
from pathlib import Path

COMPUTE = Path(__file__).parent.parent / "compute"
DATA = Path(__file__).parent


def _run(dataset, period, metrics, segment=None):
    args = [sys.executable, "-m", "compute", "--dataset", str(DATA / dataset),
            "--period", period, "--metrics", metrics, "--feature-col", "feature"]
    if segment:
        args += ["--segment-col", segment]
    r = subprocess.run(args, cwd=COMPUTE, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_credit_scoring_psi_breaches_late():
    out = _run("credit-scoring.csv", "2026-06-28", "psi")
    assert out["psi"] > 0.20


def test_fraud_psi_stays_low():
    out = _run("fraud-detection.csv", "2026-06-28", "psi")
    assert out["psi"] < 0.25


def test_loan_subprime_gini_drops():
    out = _run("loan-approval.csv", "2026-06-28", "gini", segment="segment")
    assert out["fairness"]["subprime"]["gini"] < out["fairness"]["prime"]["gini"]


def test_churn_psi_breaches_then_recovers():
    mid = _run("churn.csv", "2026-06-11", "psi")
    late = _run("churn.csv", "2026-06-28", "psi")
    assert mid["psi"] > late["psi"]  # recovered
```

- [ ] **Step 4: Run the dataset tests**

Run: `cd tools/mrm-simulator/datasets && ../compute/venv/bin/pytest test_datasets.py -q`
Expected: PASS (4). If any assertion fails, adjust the drift constants in `generate.py` (the ramp slope / separation), regenerate, and re-run — do NOT weaken the assertions.

- [ ] **Step 5: Commit (CSVs included)**

```bash
git add tools/mrm-simulator/datasets/generate.py tools/mrm-simulator/datasets/test_datasets.py tools/mrm-simulator/datasets/credit-scoring.csv tools/mrm-simulator/datasets/fraud-detection.csv tools/mrm-simulator/datasets/loan-approval.csv tools/mrm-simulator/datasets/churn.csv
git commit -m "feat(mrm-sim): bundled monitoring datasets with embedded drift + generator"
```

---

### Task 4: Config schema + loader (TS, TDD)

**Files:**
- Modify: `tools/mrm-simulator/src/types.ts`
- Create: `tools/mrm-simulator/config.yaml`
- Create: `tools/mrm-simulator/src/configLoader.ts`
- Test: `tools/mrm-simulator/src/configLoader.test.ts`
- Modify: `tools/mrm-simulator/package.json` (add a YAML parser dep)

**Interfaces:**
- Consumes: `FleetModel` (extended).
- Produces: `loadConfig(path?: string): FleetModel[]` — reads `config.yaml`, validates, returns the fleet. Throws a clear Error on invalid config.

- [ ] **Step 1: Extend FleetModel in types.ts**

Add two fields to `FleetModel`:

```typescript
export interface FleetModel {
  externalKey: string;
  name: string;
  provider: string;
  tier: "1" | "2" | "3";
  materialityDrivers: string;
  dataset: string; // bundled CSV filename, e.g. "credit-scoring.csv"
  segmentCol?: string; // column name for fairness segmentation
  metricKeys: string[];
  thresholds: ThresholdSpec[];
}
```

- [ ] **Step 2: Add a YAML parser dependency**

Run: `cd tools/mrm-simulator && npm install yaml@2.6.1`
Expected: `yaml` added to dependencies.

- [ ] **Step 3: Write config.yaml**

```yaml
models:
  - external_key: credit-scoring-v3
    name: Credit scoring v3
    provider: in-house
    tier: "1"
    materiality_drivers: capital impact, regulatory reporting, customer exposure
    dataset: credit-scoring.csv
    segment_col: segment
    metrics: [psi, auc, gini, ks]
    thresholds:
      - { metric: psi, op: gt, value_num: 0.20, severity: high, breach_action: notify_flag_revalidation }
      - { metric: auc, op: lt, value_num: 0.80, severity: warn, breach_action: notify }

  - external_key: fraud-detector-v2
    name: Fraud detector v2
    provider: in-house
    tier: "1"
    materiality_drivers: fraud loss exposure, real-time decisioning
    dataset: fraud-detection.csv
    metrics: [psi, auc, gini, ks]
    thresholds:
      - { metric: psi, op: gt, value_num: 0.25, severity: high, breach_action: notify }

  - external_key: loan-approval-v1
    name: Loan approval v1
    provider: in-house
    tier: "2"
    materiality_drivers: lending decisions, fair-lending risk
    dataset: loan-approval.csv
    segment_col: segment
    metrics: [psi, auc, gini, ks]
    thresholds:
      - { metric: gini, op: outside, value_lo: 0.45, value_hi: 0.75, severity: high, breach_action: notify_flag_revalidation, segment: subprime }

  - external_key: churn-propensity-v1
    name: Churn propensity v1
    provider: in-house
    tier: "3"
    materiality_drivers: retention spend allocation
    dataset: churn.csv
    metrics: [psi, auc, gini, ks]
    thresholds:
      - { metric: psi, op: gt, value_num: 0.15, severity: warn, breach_action: notify }
```

- [ ] **Step 4: Write the failing loader test**

Create `src/configLoader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadConfig, parseConfig } from "./configLoader";

const VALID = `
models:
  - external_key: m1
    name: M1
    provider: in-house
    tier: "1"
    materiality_drivers: x
    dataset: credit-scoring.csv
    segment_col: segment
    metrics: [psi, auc]
    thresholds:
      - { metric: psi, op: gt, value_num: 0.2, severity: high, breach_action: notify }
`;

describe("configLoader", () => {
  it("parses a valid config into FleetModel[]", () => {
    const fleet = parseConfig(VALID);
    expect(fleet).toHaveLength(1);
    expect(fleet[0].externalKey).toBe("m1");
    expect(fleet[0].dataset).toBe("credit-scoring.csv");
    expect(fleet[0].segmentCol).toBe("segment");
    expect(fleet[0].metricKeys).toEqual(["psi", "auc"]);
    expect(fleet[0].thresholds[0].op).toBe("gt");
  });

  it("rejects a model missing dataset", () => {
    const bad = VALID.replace("    dataset: credit-scoring.csv\n", "");
    expect(() => parseConfig(bad)).toThrow(/dataset/i);
  });

  it("rejects a bad threshold op", () => {
    const bad = VALID.replace("op: gt", "op: bogus");
    expect(() => parseConfig(bad)).toThrow(/op/i);
  });

  it("rejects an unknown metric", () => {
    const bad = VALID.replace("metrics: [psi, auc]", "metrics: [psi, wat]");
    expect(() => parseConfig(bad)).toThrow(/metric/i);
  });

  it("loadConfig reads the real config.yaml and returns 4 models", () => {
    const fleet = loadConfig();
    expect(fleet.length).toBe(4);
    expect(fleet.map((m) => m.externalKey)).toContain("credit-scoring-v3");
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `cd tools/mrm-simulator && npx vitest run src/configLoader.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 6: Implement configLoader.ts**

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { FleetModel, ThresholdSpec } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = join(HERE, "..", "config.yaml");

const VALID_METRICS = new Set(["psi", "auc", "gini", "ks"]);
const VALID_OPS = new Set(["gt", "gte", "lt", "lte", "outside"]);
const VALID_SEV = new Set(["warn", "high", "critical"]);
const VALID_ACTIONS = new Set(["notify", "notify_flag_revalidation"]);

interface RawThreshold {
  metric: string;
  op: string;
  value_num?: number;
  value_lo?: number;
  value_hi?: number;
  severity: string;
  breach_action: string;
  segment?: string;
  window?: string;
}
interface RawModel {
  external_key: string;
  name: string;
  provider: string;
  tier: string;
  materiality_drivers: string;
  dataset: string;
  segment_col?: string;
  metrics: string[];
  thresholds: RawThreshold[];
}

const fail = (msg: string): never => {
  throw new Error(`invalid config: ${msg}`);
};

export const parseConfig = (yamlText: string): FleetModel[] => {
  const doc = parse(yamlText) as { models?: RawModel[] };
  if (!doc || !Array.isArray(doc.models)) fail("top-level 'models' array is required");
  return doc.models!.map((m, i) => {
    const at = `models[${i}]`;
    if (!m.external_key) fail(`${at}: external_key is required`);
    if (!m.dataset) fail(`${at} (${m.external_key}): dataset is required`);
    if (!["1", "2", "3"].includes(String(m.tier))) fail(`${at}: tier must be "1"|"2"|"3"`);
    if (!Array.isArray(m.metrics) || m.metrics.length === 0) fail(`${at}: metrics is required`);
    for (const mk of m.metrics) if (!VALID_METRICS.has(mk)) fail(`${at}: unknown metric '${mk}'`);
    const thresholds: ThresholdSpec[] = (m.thresholds ?? []).map((t, j) => {
      const tat = `${at}.thresholds[${j}]`;
      if (!VALID_OPS.has(t.op)) fail(`${tat}: unknown op '${t.op}'`);
      if (!VALID_SEV.has(t.severity)) fail(`${tat}: unknown severity '${t.severity}'`);
      if (!VALID_ACTIONS.has(t.breach_action)) fail(`${tat}: unknown breach_action '${t.breach_action}'`);
      return {
        metric: t.metric,
        op: t.op as ThresholdSpec["op"],
        value_num: t.value_num ?? null,
        value_lo: t.value_lo ?? null,
        value_hi: t.value_hi ?? null,
        severity: t.severity as ThresholdSpec["severity"],
        breach_action: t.breach_action as ThresholdSpec["breach_action"],
        segment: t.segment ?? null,
        window: t.window ?? null,
      };
    });
    return {
      externalKey: m.external_key,
      name: m.name,
      provider: m.provider,
      tier: String(m.tier) as FleetModel["tier"],
      materialityDrivers: m.materiality_drivers,
      dataset: m.dataset,
      segmentCol: m.segment_col,
      metricKeys: m.metrics,
      thresholds,
    };
  });
};

export const loadConfig = (path: string = DEFAULT_CONFIG): FleetModel[] =>
  parseConfig(readFileSync(path, "utf8"));
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd tools/mrm-simulator && npx vitest run src/configLoader.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add tools/mrm-simulator/src/types.ts tools/mrm-simulator/config.yaml tools/mrm-simulator/src/configLoader.ts tools/mrm-simulator/src/configLoader.test.ts tools/mrm-simulator/package.json tools/mrm-simulator/package-lock.json
git commit -m "feat(mrm-sim): config.yaml fleet definition + validating loader"
```

---

### Task 5: computeClient + rewire engine, swap cli to config, remove scenarios

**Files:**
- Create: `tools/mrm-simulator/src/computeClient.ts`
- Modify: `tools/mrm-simulator/src/engine.ts`
- Modify: `tools/mrm-simulator/src/engine.test.ts`
- Modify: `tools/mrm-simulator/src/cli.ts`
- Delete: `tools/mrm-simulator/scenarios/storylines.ts`, `scenarios/fleet.ts`, `scenarios/storylines.test.ts`
- Modify: `tools/mrm-simulator/README.md`

**Interfaces:**
- Consumes: `FleetModel`, `MetricPoint`, the Python compute CLI.
- Produces: `computeMetrics(dataset, period, metrics, segmentCol?): Promise<Record<string, number> & { fairness?: Record<string, Record<string, number>> }>`; `engine.generatePoints`/`generateRange` keep their signatures but derive values from compute; `cli.ts` uses `loadConfig()`.

- [ ] **Step 1: Write computeClient.ts**

```typescript
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPUTE_DIR = join(HERE, "..", "compute");
const PY = join(COMPUTE_DIR, "venv", "bin", "python");
const DATASETS = join(HERE, "..", "datasets");

export interface ComputeResult {
  psi?: number;
  auc?: number;
  gini?: number;
  ks?: number;
  fairness?: Record<string, Record<string, number>>;
}

// Runs the Python compute module for one dataset/period. Throws a clear error
// naming the dataset/period if the subprocess fails or returns non-JSON.
export const computeMetrics = (
  dataset: string,
  period: string,
  metrics: string[],
  segmentCol?: string,
): ComputeResult => {
  const args = [
    "-m", "compute",
    "--dataset", join(DATASETS, dataset),
    "--period", period,
    "--metrics", metrics.join(","),
    "--feature-col", "feature",
  ];
  if (segmentCol) args.push("--segment-col", segmentCol);
  let stdout: string;
  try {
    stdout = execFileSync(PY, args, { cwd: COMPUTE_DIR, encoding: "utf8" });
  } catch (e) {
    const err = e as { stderr?: string };
    throw new Error(
      `compute failed for ${dataset} period ${period}: ${err.stderr?.trim() ?? String(e)}`,
    );
  }
  try {
    return JSON.parse(stdout) as ComputeResult;
  } catch {
    throw new Error(`compute returned non-JSON for ${dataset} period ${period}: ${stdout}`);
  }
};
```

- [ ] **Step 2: Rewrite engine.ts to use compute**

```typescript
import { FleetModel, MetricPoint } from "./types.js";
import { computeMetrics } from "./computeClient.js";

// Segments a model reports for a metric, from its segmented thresholds.
const segmentsFor = (model: FleetModel, metric: string): string[] => {
  const segs = model.thresholds
    .filter((t) => t.metric === metric && t.segment)
    .map((t) => t.segment as string);
  return [...new Set(segs)];
};

const guardFinite = (v: number, model: string, metric: string, seg: string): number => {
  if (!Number.isFinite(v)) {
    throw new Error(`Non-finite computed value ${model}/${metric} (segment ${seg})`);
  }
  return Number(v.toFixed(4));
};

// Compute one model's points for a given period date (YYYY-MM-DD).
export const generatePoints = (model: FleetModel, _dayIndex: number, date: Date): MetricPoint[] => {
  const at = date.toISOString();
  const period = at.slice(0, 10); // YYYY-MM-DD
  const result = computeMetrics(model.dataset, period, model.metricKeys, model.segmentCol);
  const points: MetricPoint[] = [];

  for (const metric of model.metricKeys) {
    const overall = (result as Record<string, number>)[metric];
    if (overall === undefined) continue; // metric not returned (e.g. no data that period)
    points.push({
      metric,
      value: guardFinite(overall, model.externalKey, metric, "overall"),
      at,
      window: "daily",
      segment: "overall",
      context: { source_job: "nightly-monitor", period },
    });
    // Segmented points from the fairness block, where a threshold targets a segment.
    for (const seg of segmentsFor(model, metric)) {
      const segVal = result.fairness?.[seg]?.[metric];
      if (segVal === undefined) continue;
      points.push({
        metric,
        value: guardFinite(segVal, model.externalKey, metric, seg),
        at,
        window: "daily",
        segment: seg,
        context: { source_job: "nightly-monitor", period },
      });
    }
  }
  return points;
};

export const generateRange = (model: FleetModel, startDate: Date, days: number): MetricPoint[] => {
  const all: MetricPoint[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(startDate.getTime() + d * 86_400_000);
    all.push(...generatePoints(model, d, date));
  }
  return all;
};
```

- [ ] **Step 3: Update engine.test.ts to stub computeClient**

Replace `src/engine.test.ts` with:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("./computeClient", () => ({
  computeMetrics: vi.fn(() => ({
    psi: 0.22,
    auc: 0.81,
    gini: 0.62,
    ks: 0.4,
    fairness: { subprime: { gini: 0.41 }, prime: { gini: 0.64 }, overall: { gini: 0.62 } },
  })),
}));

import { generatePoints } from "./engine";
import { FleetModel } from "./types";

const model: FleetModel = {
  externalKey: "loan-approval-v1",
  name: "Loan",
  provider: "in-house",
  tier: "2",
  materialityDrivers: "x",
  dataset: "loan-approval.csv",
  segmentCol: "segment",
  metricKeys: ["psi", "auc", "gini", "ks"],
  thresholds: [
    { metric: "gini", op: "outside", value_lo: 0.45, value_hi: 0.75, severity: "high", breach_action: "notify_flag_revalidation", segment: "subprime", window: null, value_num: null },
  ],
};

describe("engine (compute-backed)", () => {
  it("emits an overall point per metric plus a segmented gini point", () => {
    const pts = generatePoints(model, 0, new Date("2026-06-28T00:00:00Z"));
    // 4 overall (psi/auc/gini/ks) + 1 segmented gini (subprime)
    expect(pts.filter((p) => p.segment === "overall").length).toBe(4);
    const seg = pts.find((p) => p.segment === "subprime");
    expect(seg?.metric).toBe("gini");
    expect(seg?.value).toBe(0.41);
  });

  it("stamps ISO 'at' and finite values", () => {
    const pts = generatePoints(model, 0, new Date("2026-06-28T00:00:00Z"));
    for (const p of pts) {
      expect(Number.isFinite(p.value)).toBe(true);
      expect(p.at).toBe("2026-06-28T00:00:00.000Z");
    }
  });
});
```

- [ ] **Step 4: Swap cli.ts fleet source**

In `src/cli.ts`, replace the import:

```typescript
import { loadConfig } from "./configLoader.js";
```
(remove `import { FLEET } from "../scenarios/fleet.js";`)

and near the top of `main`, after `assertSafeTarget(cfg)`, add:

```typescript
  const FLEET = loadConfig();
```
so the existing `for (const model of FLEET)` loops are unchanged.

- [ ] **Step 5: Delete the scenarios directory**

Run:
```bash
git rm tools/mrm-simulator/scenarios/storylines.ts tools/mrm-simulator/scenarios/fleet.ts tools/mrm-simulator/scenarios/storylines.test.ts
```
Expected: three files staged for deletion.

- [ ] **Step 6: Update README.md**

Replace the "Usage" prerequisites section to document: (a) the Python compute prerequisite (`cd compute && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt`), (b) that the fleet is defined in `config.yaml`, (c) that datasets live in `datasets/` and can be regenerated via `datasets/generate.py`. Keep the existing command docs (setup/backfill/live/verify).

- [ ] **Step 7: Typecheck + run the TS suite**

Run: `cd tools/mrm-simulator && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all TS tests pass (configLoader + engine + the untouched config/httpEnvelope/report suites). The removed storylines test is gone.

- [ ] **Step 8: Commit**

```bash
git add tools/mrm-simulator/src/computeClient.ts tools/mrm-simulator/src/engine.ts tools/mrm-simulator/src/engine.test.ts tools/mrm-simulator/src/cli.ts tools/mrm-simulator/README.md
git commit -m "feat(mrm-sim): compute-backed engine + config-driven fleet; remove scripted scenarios"
```

---

### Task 6: End-to-end run against the live backend

**Files:** none (execution + verification).

- [ ] **Step 1: Ensure backend is up and reset prior sim data**

Confirm `http://localhost:3000` responds. If the four sim models from earlier runs exist, that's fine (setup is idempotent by external_key).

- [ ] **Step 2: Setup + dry-run backfill**

Run:
```bash
cd tools/mrm-simulator && npm run sim setup && npm run sim backfill --days 30 --dry-run
```
Expected: setup creates/reuses the 4 models; dry-run prints point counts (now computed, not scripted).

- [ ] **Step 3: Real backfill**

Run: `npm run sim backfill --days 30`
Expected: each model prints pushed count; credit-scoring / loan-approval / churn report > 0 warn/breach from the COMPUTED values; fraud reports 0.

- [ ] **Step 4: Verify**

Run: `npm run sim verify && cat gaps-report.md`
Expected: contract checks pass (engineered breaches fired from real compute), workflow checks pass (revalidation events for the flagged models), report written.

- [ ] **Step 5: Note completion**

No commit (gaps-report.md is git-ignored). Record the run result (breach counts per model) in the PR description when the branch is PR'd.

---

## Self-review

**Spec coverage:**
- Python compute engine (PSI/AUC/gini/KS/fairness, subprocess JSON) → Tasks 1, 2 ✓
- Bundled datasets with embedded drift + committed generator → Task 3 ✓
- Reference window = first 7 days → Task 2 `__main__.py` (default branch) ✓
- Config-driven fleet (schema + validating loader) → Task 4 ✓
- Engine rewired to compute; cli uses config; scenarios removed → Task 5 ✓
- Reuse cli/clients/setup/verify/report unchanged → Task 5 only touches engine + cli import ✓
- Error handling (config fail-fast; compute failure names model/period) → Task 4 loader throws; Task 5 computeClient throws ✓
- End-to-end verify → Task 6 ✓

**Placeholder scan:** every code step has complete code; every run step has command + expected output. No TBD/TODO.

**Type consistency:** `FleetModel` gains `dataset` + `segmentCol` in Task 4 and is used with those fields in Task 5 (`model.dataset`, `model.segmentCol`). `computeMetrics(dataset, period, metrics, segmentCol?)` defined in Task 5 Step 1 and called identically in Step 2. `ComputeResult` shape matches the Python `__main__.py` JSON (Task 2). The engine keeps `generatePoints(model, dayIndex, date)` / `generateRange(model, startDate, days)` signatures so `cli.ts` loops are untouched.

**Known dataset-tuning note:** Task 3 Step 4 may require adjusting drift constants in `generate.py` so computed metrics cross thresholds; the plan instructs tuning the data, never weakening the assertions.
