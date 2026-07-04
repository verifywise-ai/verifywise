# MRM model-eval simulator — design

> **Status:** Approved design, pre-implementation
> **Date:** 2026-07-04
> **Scope:** A standalone in-repo tool. No changes to the MRM feature itself.

## Purpose

Build a standalone TypeScript CLI that impersonates a "world-class model
monitoring platform" (a mock Evidently/Arize) and feeds realistic model-risk
metrics into VerifyWise's MRM ingestion API, so the MRM feature can be seen
working end-to-end.

The tool serves three goals at once, from one scenario-driven design:

1. **Demo / storytelling** — populate the Monitoring tab, breach history,
   revalidation triggers, and attestation roll-up with believable data that
   tells a story (a model drifts, breaches, and fires revalidation).
2. **Dev / test harness** — exercise the ingestion API and threshold engine
   with deterministic, controllable scenarios.
3. **Reference integration** — a readable example of how a real monitoring
   pipeline connects to VerifyWise MRM.

A **fourth, explicit goal**: the tool doubles as a **gap-finder**. While driving
realistic data through the real API and reading the results back, it surfaces
workflow issues, contract friction, and UX rough edges in the MRM feature, and
writes them to a findings report.

## Non-goals (YAGNI)

- No web UI or branded dashboard (the "phase 2" mock-product option is out).
- No real ML computation — metrics are scripted, not learned.
- No persistence beyond a local token/id cache.
- No multi-org support.

## The wire contract (ground truth)

Grounded in the current backend. This is the exact format the simulator targets.

### Ingestion

- **Endpoint:** `POST /api/mrm/models/:externalModelKey/metrics`
- **Auth:** `Authorization: Bearer mrm_<64 hex>`. Token is SHA-256 hashed and
  looked up; the row carries `organization_id` (and optionally a single
  `model_inventory_id` scope).
- **Body — single point:** the body itself is the point.
- **Body — batch:** `{ "points": [ ... ] }`. Empty `points: []` → 422.
- **Batch semantics:** all-or-nothing. Every point is validated first; if any
  fails, the whole request is rejected 422 with per-point errors and zero writes.
- **Fields:**

  | Field | Required | Type | Rules |
  |-------|----------|------|-------|
  | `metric` | Yes | string | non-empty trimmed, max 100 chars |
  | `value` | Yes | number | finite only (no bool/NaN/Infinity) |
  | `at` | Yes | ISO-8601 string | valid date; > 1h in future rejected; truncated to the second for dedup |
  | `window` | No | string/null | default `""` |
  | `segment` | No | string/null | default `"overall"` |
  | `context` | No | object/null | non-array object; stored, never evaluated |

- **Idempotency:** unique on `(organization_id, model_inventory_id, metric,
  segment, window, at@second)`. A duplicate returns 200 with
  `status: "duplicate"` — a no-op, not a 409.
- **Rate limit:** per token id. Non-production: 100,000 / 15 min (not a concern
  for local runs).
- **Success response (200):** `{ status, data: { accepted, results: [ { metric,
  at, status, pointId, threshold? } ] } }` where per-point `status` ∈ `ok |
  warn | breach | no_threshold | duplicate`.
- **Unknown external key:** 404 `"Model not found for this key"`.

### Evaluation engine

- A point matches a threshold when the threshold is active, `metric` matches
  exactly, and segment/window either match or the threshold is unpinned.
- Operator shapes (`op`): `gt`, `gte`, `lt`, `lte`, `outside` (breach when
  `value < value_lo || value > value_hi`).
- Severity `warn` → point status `warn`; `high`/`critical` → `breach`.
- Breach action: `notify` (notification only) or `notify_flag_revalidation`
  (notification + sets `mrm_revalidation_flagged` + opens a revalidation task).
- Winner selection is most-conservative-wins: breaching beats non-breaching,
  then higher severity, then more specific, then lowest id.

### Model wiring & setup

- `model_inventories.external_key` (VARCHAR, unique per org) maps the URL key to
  a model. Set via the tiering/model-edit flow (`PUT /api/mrm/models/:id/tier`).
- Metric keys are free-form (advisory catalogue only) — any string ≤ 100 chars
  is accepted; unknown keys are stored and flagged `no_threshold`.
- **Token creation:** `POST /api/mrm/ingestion-tokens` (JWT, Admin) returns the
  plaintext `mrm_...` token exactly once. Only the hash is stored.

## Architecture

Standalone TS CLI at `tools/mrm-simulator/`. Each file has one clear job.

```
tools/mrm-simulator/
  scenarios/
    fleet.ts          # the 4 models: tiers, external_keys, threshold specs
    storylines.ts     # per-model metric(dayIndex) -> value (seeded, deterministic)
  src/
    config.ts         # base URL, creds, token/id cache (.mrm-simulator.json)
    jwtClient.ts      # login + JWT-authed calls (setup, read-back)
    ingestClient.ts   # token-authed POST /metrics (batched, retry, capture responses)
    engine.ts         # walk storylines over a date range -> metric points
    setup.ts          # create models/keys/thresholds/token (idempotent)
    verify.ts         # read MRM back; run contract + workflow gap checks
    report.ts         # accumulate findings -> gaps-report.md
    cli.ts            # setup | backfill | live | verify | report | teardown
  README.md
```

### Commands

- **`setup`** — logs in via JWT once. Idempotently creates the fleet (models +
  `external_key` + tier), registers metric keys, configures each scenario's
  thresholds, and mints one ingestion token. Caches token + model ids to a
  git-ignored `.mrm-simulator.json`. Re-running reuses models by `external_key`.
- **`backfill --days N`** — walks each storyline over the last N days and pushes
  the points in batches via the ingestion token. Captures every per-point
  `status`. Idempotent (endpoint dedup makes re-runs safe no-ops).
- **`live --interval Ns`** — continues ticking forward from "now" so a breach
  can be watched happening on screen.
- **`verify`** — reads MRM back through the JWT API and runs the gap checks.
- **`report`** — writes/updates `gaps-report.md`.
- **`teardown`** — best-effort decommission of created models.

### Data flow

`cli → setup (jwtClient) → backfill/live (engine → ingestClient, capturing
per-point status) → verify (jwtClient reads back) → report`. Findings accumulate
across commands into one `gaps-report.md`.

### Config & safety

- `config.ts` reads base URL + login from env/flags. Default `localhost:3000`
  and the dev credentials.
- **Dev-only guard:** refuses to run against a non-localhost base URL unless
  `--i-know-what-im-doing` is passed. This is synthetic data and must never
  accidentally hit a real deployment.
- `--dry-run` prints what would be sent without POSTing.
- No secrets in code or committed files; the token cache is git-ignored.

## Scenario fleet

Four models, each a deliberate storyline exercising a different governance path.
All metric values are deterministic functions of day-index (seeded) with
realistic noise, so runs are reproducible and expected breaches are known.

| Model (`external_key`) | Tier | Storyline | Exercises |
|---|---|---|---|
| `credit-scoring-v3` | 1 | PSI creeps 0.05 → 0.12 → 0.22 over 30d, crosses `psi > 0.20` ~day 18. AUC sags 0.86 → 0.82. | The headline breach → `notify_flag_revalidation` → revalidation task + event log. |
| `fraud-detector-v2` | 1 | Healthy throughout: AUC ~0.94, PSI ~0.04, KS stable. | The control — proves "green" looks right; no false breaches. |
| `loan-approval-v1` | 2 | Overall gini fine, but `segment=subprime` gini drops below a band. | Segment/fairness path + `outside` (band) threshold + most-conservative-wins. |
| `churn-propensity-v1` | 3 | Drifts and breaches ~day 10, then recovers after a simulated retrain ~day 22. | Recovery narrative + warn-vs-breach severity + lighter Tier 3 cadence. |

Metrics per model per day: `psi`, `auc`, `gini`, `ks` (scalar), plus segmented
`gini` for `loan-approval-v1`.

Thresholds `setup` configures:

- `credit-scoring-v3`: `psi > 0.20` (high, notify+flag); `auc < 0.80` (warn).
- `loan-approval-v1`: `gini outside [0.45, 0.75]` on `segment=subprime` (high).
- `churn-propensity-v1`: `psi > 0.15` (warn) — softer, to show warn vs breach.
- `fraud-detector-v2`: `psi > 0.25` (never trips — proves the control stays green).

## Gap-finding

The simulator asserts and observes at every step, then emits
`tools/mrm-simulator/gaps-report.md`, categorised Contract / Workflow / UX. Each
finding records severity, what was expected, what happened, and a repro.

**1. Contract gaps (automatic).** For every call, compare expected vs actual:

- A point engineered to breach comes back `ok`/`no_threshold` → threshold
  matching or setup gap.
- Setup steps that should exist but don't (e.g. no dedicated `external_key`
  endpoint; had to piggyback on the tier PUT).
- Error responses that don't match the documented shape, missing fields, wrong
  status codes, confusing messages.
- Verify documented behaviours actually hold: idempotency, rate limit,
  future-timestamp rejection, batch all-or-nothing. Flag any surprise.

**2. Workflow gaps (semi-automatic).** After backfill, read MRM back through the
JWT API and check the governance loop closes:

- A flagged breach — did it create a revalidation task and an event-log entry?
  Visible in the validation drawer's "Triggered by"?
- Does the attestation roll-up reflect the breaches (overdue, blocked tiers)?
- Are breach notifications delivered to the model's assigned roles?
- Anything the SR 26-2 governance narrative implies should happen but didn't.

**3. UX / observation gaps (manual, guided).** The report ends with a "go look
at this" checklist — specific URLs and what to inspect in the UI — plus friction
noted during development.

**Seeded known discrepancy (to confirm during implementation):** the ingestion
UI example (`MetricsFeedSection.tsx`) shows a `vw_mrm_...` bearer token, but the
backend generates and expects `mrm_...` (no `vw_` prefix). If confirmed, this is
a real doc/UX gap that would mislead an integrator, and belongs in the report.

## Testing

- Storyline functions and the engine are pure and unit-tested (e.g. assert
  `credit-scoring-v3` PSI crosses 0.20 at the expected day).
- The clients are exercised live against the running backend during `verify` —
  that run is both the integration test and the gap-finder.

## Deliverables

- `tools/mrm-simulator/` (the CLI, scenarios, README).
- `tools/mrm-simulator/gaps-report.md` (generated) — the MRM punch-list.
