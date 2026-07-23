# MRM simulator v2a — real compute + config-driven fleet — design

> **Status:** Approved design, pre-implementation.
> **Date:** 2026-07-04
> **Builds on:** the merged `tools/mrm-simulator/` CLI (PR #4234).
> **Scope:** v2a only — compute engine + bundled datasets + config-driven fleet. The web dashboard is a separate later phase (v2b). The in-app "demo ingest" product feature is a separate future sweep.

## Purpose

v1 of the simulator emitted scripted metric values from TypeScript storyline
functions. v2a makes the numbers **real**: a Python compute engine calculates
genuine monitoring metrics (PSI, AUC, gini, KS, fairness) from bundled datasets,
and a config file (not hardcoded TypeScript) defines the fleet. The existing TS
orchestration — CLI, JWT/ingest clients, setup, verify, gap-finder, safety guard
— is reused unchanged.

This moves the tool from "convincing mock" toward a credible stand-in for a
push-based monitoring platform (Evidently / Arize style): it computes real
metrics on real data and pushes them to VerifyWise's MRM ingestion API.

## Non-goals (YAGNI)

- No web dashboard (that is v2b).
- No user-supplied datasets — bundled CSVs only.
- No metrics beyond the five (PSI, AUC, gini, KS, fairness).
- The Python module is a pure compute function: no web server, no persistence,
  no long-running process.
- No in-app / product feature — this stays a dev-only CLI.

## Architecture

```
config.yaml (fleet, datasets, metrics, thresholds)
      │  loader (TS) → FleetModel[]
      ▼
TS CLI (setup / backfill / live / verify)
      │  per model, per period:
      │      shell out ──►  python -m compute  (pandas / numpy / sklearn)
      │                       reads bundled CSV, slices ref window vs period,
      │                       computes PSI/AUC/gini/KS/fairness → JSON on stdout
      │  ◄── real metric JSON
      ▼
  ingestClient pushes the REAL computed values to the MRM ingestion API
      ▼
  verify + gap-finder (unchanged) → gaps-report.md
```

### What changes vs. what is reused

- **New:**
  - `tools/mrm-simulator/config.yaml` — the fleet definition.
  - `tools/mrm-simulator/src/configLoader.ts` — parse + validate config into
    `FleetModel[]`.
  - `tools/mrm-simulator/compute/` — Python metric engine + its venv.
  - `tools/mrm-simulator/datasets/*.csv` — the four bundled datasets.
  - `tools/mrm-simulator/datasets/generate.py` — one-time deterministic
    generator (kept for reproducibility; not run at simulate-time).
  - A thin change in `src/engine.ts` to call the compute subprocess instead of
    `metricValue()`.
- **Reused unchanged:** `cli.ts`, `jwtClient.ts`, `ingestClient.ts`, `setup.ts`,
  `verify.ts`, `report.ts`, the localhost safety guard, idempotency.
- **Removed:** `scenarios/storylines.ts`, `scenarios/fleet.ts`.

## Compute engine (Python)

A `compute/` module invoked by the TS CLI as a subprocess. One job: given a
dataset, a reference window, and a target period, compute the requested metrics
and return JSON.

### Invocation contract

```
python -m compute \
  --dataset credit-scoring.csv \
  --reference 2026-06-01:2026-06-07 \
  --period 2026-06-25 \
  --metrics psi,auc,gini,ks \
  --segment-col segment
```

Returns on stdout:

```json
{
  "psi": 0.18,
  "auc": 0.83,
  "gini": 0.66,
  "ks": 0.41,
  "fairness": { "subprime": { "gini": 0.41 }, "overall": { "gini": 0.62 } }
}
```

`fairness` is present only when `--segment-col` is passed; it repeats the
segment-sensitive metrics (gini here) per segment value plus `overall`.

**Reference window:** each dataset's first 7 days are the stable baseline. The
engine derives the reference range from the dataset's earliest date (min-date to
min-date + 7 days) unless the CLI passes an explicit `--reference`; every later
period is compared against that fixed baseline. This is what makes PSI meaningful
— drift is measured against an unchanging reference, exactly as a real monitoring
job pins a training-time reference distribution.

### Metric definitions

- **PSI** — population stability index between the reference-window distribution
  and the period distribution of a feature, binned (default 10 quantile bins).
  Identical distributions → PSI ≈ 0.
- **AUC** — `sklearn.metrics.roc_auc_score(label, prediction)` over the period.
- **gini** — `2 * AUC - 1`.
- **KS** — Kolmogorov–Smirnov statistic between the score distributions of the
  positive and negative classes.
- **fairness** — the segment-sensitive metric (gini) computed per `segment`
  value, plus `overall`, so a per-segment gap is visible.

### Stack & structure

- pandas + numpy + scikit-learn + scipy, in a venv under
  `tools/mrm-simulator/compute/` (mirrors EvalServer / AI Gateway Python setup).
- Pure functions, one per metric, each unit-tested against known inputs
  (identical dists → PSI ≈ 0; a perfectly-separating score → AUC = 1.0; a random
  score → AUC ≈ 0.5).
- The subprocess boundary keeps the metric math isolated and independently
  testable, and mirrors how a real pipeline separates compute from ship.

## Bundled datasets

Each dataset is a CSV: `date, <features...>, prediction, label, segment`. One row
per scored record; the `date` column lets the engine slice a reference window vs.
a target period. Committed static; the drift is embedded in the data, not scripted.

| Dataset | Behavior (via the data) | Exercises |
|---|---|---|
| `credit-scoring.csv` | A key feature's distribution genuinely shifts over the window, so computed PSI rises past 0.20; AUC sags as the fixed model scores the shifted population. | The headline breach → revalidation. |
| `fraud-detection.csv` | Distributions stable throughout → PSI low, AUC ~0.94. | The healthy control (no false breach). |
| `loan-approval.csv` | Overall healthy, but the `subprime` segment's prediction/label relationship degrades → segment gini drops below the band. | Segment/fairness path. |
| `churn.csv` | Drift then a recovery (a later slice returns to the reference distribution) → PSI breaches then recovers. | Breach-then-recover narrative. |

### Generator

`datasets/generate.py` produces the four CSVs deterministically (seeded numpy)
with the embedded drift, and the resulting CSVs are committed. The generator is
kept for reproducibility but is not run at simulate-time. Size: a few thousand
rows per dataset per period — enough for stable PSI/AUC without bloating the repo.

### Guardrail

Because metrics are computed (not hardcoded), exact breach values are whatever
the math yields. Datasets are tuned so breaches land in the right place, and
tests assert the computed values cross the thresholds at the intended periods
(e.g. credit-scoring PSI at the late period > 0.20) — the same guardrail approach
as v1, now over real data.

## Config-driven fleet

`config.yaml` replaces the hardcoded `fleet.ts`:

```yaml
models:
  - external_key: credit-scoring-v3
    name: Credit scoring v3
    tier: "1"
    materiality_drivers: capital impact, regulatory reporting
    dataset: credit-scoring.csv
    segment_col: segment
    metrics: [psi, auc, gini, ks]
    thresholds:
      - { metric: psi, op: gt, value_num: 0.20, severity: high, breach_action: notify_flag_revalidation }
      - { metric: gini, op: outside, value_lo: 0.45, value_hi: 0.75, severity: high, segment: subprime }
```

`configLoader.ts` parses and validates the file into the `FleetModel[]` shape the
existing `setup`/`engine` already consume, so downstream code barely changes.
Invalid config (missing dataset file, unknown metric, bad op, malformed
threshold) fails fast with a clear error before any API calls.

## Data flow (end to end)

```
config.yaml → configLoader → FleetModel[]
  → setup (creates models/thresholds/token — unchanged)
  → for each model, each period in the backfill/live window:
        engine calls compute(dataset, referenceWindow, period, metrics, segmentCol)
        → real metric JSON → ingestClient.pushBatch (unchanged)
  → verify + gap-finder (unchanged) → gaps-report.md
```

## Error handling

- Config validation fails fast (before any network call) with a message naming
  the offending model/field.
- A compute subprocess failure (missing CSV, Python exception, non-JSON output)
  surfaces as a clear TS error naming the model and period; the run stops rather
  than pushing garbage.
- The localhost safety guard, idempotency, and rate-limit handling are unchanged.

## Testing

- **Python unit:** each metric function against known inputs (identical dists →
  PSI ≈ 0; separating score → AUC = 1.0; random → AUC ≈ 0.5; KS bounds).
- **Dataset:** computed metrics cross thresholds at the right periods
  (credit-scoring PSI late > 0.20; fraud stays < 0.25; loan subprime gini < 0.45;
  churn breaches then recovers).
- **TS:** `configLoader` (valid parse + rejects each bad-config case); `engine`
  with a stubbed compute call (asserts it shells out with the right args and maps
  the JSON to metric points).
- **End-to-end:** the existing `verify` run against the live backend — real
  breaches fire from computed values, governance loop closes.

## Deliverables

- `tools/mrm-simulator/compute/` (Python engine + tests + venv/requirements).
- `tools/mrm-simulator/datasets/*.csv` + `generate.py`.
- `tools/mrm-simulator/config.yaml` + `src/configLoader.ts`.
- `src/engine.ts` change to call compute; removal of `scenarios/storylines.ts`
  and `scenarios/fleet.ts`.
- Updated README documenting the config format and the Python prerequisite.
