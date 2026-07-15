# MRM metric simulator

> **Last Updated:** 2026-07-05
> **Location:** `tools/mrm-simulator/` — a **dev-only** CLI. Not shipped to users.

A tool that impersonates a push-based model-monitoring platform (Evidently /
Arize style) and feeds realistic metrics into VerifyWise's MRM ingestion API. It
computes real metrics from bundled datasets, pushes them through the real
pipeline, checks that the governance loop closes, and can visualize the whole run
live. It exists to demo MRM end-to-end and to exercise the ingestion/evaluation
path the way a real customer would — which is how it found three production bugs
(see the MRM doc and the 2026-07-05 handover).

## What it is (and is not)

- **Is:** a local TypeScript CLI (compute in Python) that drives setup → metric
  compute → ingestion → verification, with an optional live web dashboard.
- **Is not:** a product feature. It is developer/demo tooling. It refuses
  non-localhost targets unless `--i-know-what-im-doing` is passed; its token
  cache, venv, datasets cache, and gaps report are git-ignored.

## Architecture

```
config.yaml (fleet: models, tier, dataset, metrics, thresholds)
      │  configLoader (TS) → FleetModel[]
      ▼
TS CLI (setup / backfill / live / verify / dashboard)
      │  per model, per period:
      │    computeMetrics ── shells out ──► python __main__.py  (compute/)
      │                                      pandas/numpy/sklearn/scipy
      │                                      real PSI/AUC/gini/KS/fairness
      │    ingestClient.pushBatch ──────────► POST /api/mrm/models/:key/metrics
      ▼
  verify → reads MRM back, checks governance loop → gaps-report.md
```

### File map

| Path | Responsibility |
|------|----------------|
| `config.yaml` | The fleet definition (models, tiers, dataset mapping, metrics, thresholds). |
| `src/configLoader.ts` | Parse + validate config into `FleetModel[]`. Rejects bad op/metric/tier and path-traversal in the dataset field. |
| `compute/metrics.py` | Pure metric functions: `psi`, `auc`, `gini`, `ks`, `fairness`. |
| `compute/__main__.py` | CLI: read CSV, slice reference vs. period, compute, print JSON. |
| `datasets/*.csv` + `generate.py` | Four bundled datasets with embedded drift + a deterministic generator (committed static). |
| `src/computeClient.ts` | TS wrapper that shells out to the Python compute module. |
| `src/engine.ts` | Builds metric points per model/period from the compute result. |
| `src/setup.ts` | Idempotent fleet + thresholds + ingestion-token creation via the JWT API. |
| `src/ingestClient.ts` | Token-authed batched POST to the ingestion endpoint. |
| `src/verify.ts` + `src/report.ts` | Read MRM back, run contract/workflow gap checks, render `gaps-report.md`. |
| `src/config.ts` | Base URL, creds, the localhost safety guard, token cache. |
| `src/dashboard/{events,runner,server}.ts` + `public/` | The live web dashboard (v2b). |

## The four scenario models

Defined in `config.yaml`, backed by `datasets/`:

| Model (`external_key`) | Tier | Behavior (real, from the data) |
|---|---|---|
| `credit-scoring-v3` | 1 | PSI drifts across 0.20 mid-window (breach → revalidation); AUC sags. |
| `fraud-detector-v2` | 1 | Stable — healthy control, no false breach. |
| `loan-approval-v1` | 2 | `subprime` segment gini collapses below the band (fairness breach). |
| `churn-propensity-v1` | 3 | PSI breaches then recovers. |

Metrics are **computed**, not scripted; the datasets are tuned so breaches land
in the right place, and tests assert both direction and realistic ranges (AUC
never 1.0, bounded PSI, a visible fairness gap).

## Compute engine (Python)

- Invoked as `python __main__.py --dataset <path> --period <date> --metrics
  psi,auc,gini,ks --feature-col feature [--segment-col segment]`, run from the
  `compute/` directory. Prints a JSON object of metric values (+ a `fairness`
  block per segment when `--segment-col` is given).
- **Reference window:** each dataset's first 7 days (fixed baseline) unless
  `--reference start:end` is passed. Drift is measured against that baseline.
- Stack: pandas, numpy, scikit-learn, scipy (ranges in `compute/requirements.txt`;
  works on Python 3.11). One venv under `compute/venv/`.

## Commands

```bash
npm run sim -- setup                                        # create fleet + thresholds + token (idempotent)
npm run sim -- backfill --days 30 --start-date 2026-06-01   # push computed history over the dataset window
npm run sim -- live --interval 5s                           # keep pushing forward
npm run sim -- verify                                       # read MRM back, write gaps-report.md
npm run sim -- dashboard --start-date 2026-06-01 --days 30  # live web dashboard (default :4000)
```

Add `--dry-run` to `backfill`/`live` to compute without POSTing.

## Live dashboard (v2b)

`sim dashboard` starts a local Node HTTP + WebSocket server (loopback only) that
drives the simulation itself and streams typed events to a VerifyWise-styled
vanilla-JS page. Four panels: fleet overview (status chips), per-model metric
charts (with threshold lines and marked breaches), a live breach/event feed, and
ingestion totals. Chart.js is pinned with Subresource Integrity; DOM writes from
event data use `textContent` (no HTML injection). The server buffers events and
replays them so a browser connecting mid-run sees history.

- `src/dashboard/runner.ts` is pure orchestration (injected deps, emits typed
  events) — unit-tested. `server.ts` is thin transport. `public/` is presentation.

## Gotchas

- **Python venv required** before any command that computes (see Architecture).
- **Datasets are fixed-date** (2026-06-01 onward) → always pass
  `--start-date 2026-06-01` to `backfill`/`dashboard`; otherwise it asks for
  today-relative dates the datasets don't contain and gets "no rows for period".
- **`npm run` strips flags** → use `npm run sim -- <cmd> --flags` or
  `npx tsx src/cli.ts <cmd> --flags`.
- **Compute CLI is `python __main__.py`** run from `compute/` (a flat module),
  NOT `python -m compute`.
- The tool refuses non-localhost base URLs unless `--i-know-what-im-doing`.

## Prerequisites

- A running VerifyWise backend (default `http://localhost:3000`) with an admin
  login (dev auto-bootstrap: `gorkem.cetin@verifywise.ai` / `Verifywise#1`).
- Node 22+, Python 3.11+, and `npm install` in `tools/mrm-simulator/`.

## Spec / plan history

Design specs and implementation plans live under `docs/superpowers/`:
`2026-07-04-mrm-model-eval-simulator-*` (v1),
`2026-07-04-mrm-simulator-v2a-compute-*` (v2a),
`2026-07-04-mrm-simulator-v2b-dashboard-*` (v2b).
