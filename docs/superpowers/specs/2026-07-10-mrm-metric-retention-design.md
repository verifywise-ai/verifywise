# MRM Metric Retention Job — Design Spec

> **Date:** 2026-07-10
> **Gap:** #1 of the MRM completion set (retention/aggregation)
> **Branch:** `feat/mrm-retention` (off `develop`)

## Problem

`mrm_metrics` is an append-only time-series table with no lifecycle. It grows
unbounded. The ingestion spec required configurable retention (default keep raw
points ≥ 25 months) with optional aggregates for older data. No retention code
exists today. This is the one MRM gap with regulatory teeth: SR 26-2 / SS1/23 /
OSFI E-23 assume an examiner can review a full annual monitoring cycle, so the
audit trail depth must be *guaranteed*, not incidental.

## Core principle — retention never touches the audit trail

A raw metric point is prunable **only if every evaluation it produced was benign**
(`ok` / `no_threshold`). Any point with a `warn` or `breach` evaluation
(`mrm_metric_evaluations.status`) is kept **forever**. Aged-out benign points are
deleted; no aggregation in v1.

This matters because `mrm_metric_evaluations.metric_id` has `ON DELETE CASCADE` to
`mrm_metrics`. Deleting a raw point deletes its evaluation rows. By pruning only
benign points, breach/eval history is never reachable by the delete and never lost.

## Decisions (locked in brainstorming)

| Question | Decision |
|----------|----------|
| What does retention protect? | Never prune breach/eval history; only prune raw points whose evaluations are all `ok`/`no_threshold`. |
| Config location | New per-org `mrm_org_settings` table (also the future home for gap #3 alerts config). |
| Aggregate old data? | **No** — prune-only for v1 (YAGNI; trend reads use recent windows, breach points kept anyway). |
| Job cadence / safety | Daily, batched/capped deletes (bounded lock + transaction size). |
| UI location | A field in the existing **MRM → Settings** sub-tab (`SettingsTab.tsx`). |

## 1. Data model — new `mrm_org_settings` table

```sql
CREATE TABLE verifywise.mrm_org_settings (
  organization_id  INTEGER PRIMARY KEY
                   REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
  retention_months INTEGER NOT NULL DEFAULT 25 CHECK (retention_months >= 13),
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

- One row per org, lazily created. A missing row means defaults (25 months).
- `CHECK (retention_months >= 13)` — retention can never drop below a one-year
  examiner cycle + margin.
- Named generically (`mrm_org_settings`, not `..._retention`) so gap #3's alerts
  config adds columns here rather than a second table.
- Migration timestamp: `20260710xxxxxx-create-mrm-org-settings.js`.

## 2. Prune query (examiner-safe core)

For an org, `cutoff = now - retention_months` (computed in SQL via
`now() - make_interval(months => :m)` to avoid JS month-arithmetic edge cases):

```sql
DELETE FROM verifywise.mrm_metrics
WHERE id IN (
  SELECT mm.id
  FROM verifywise.mrm_metrics mm
  WHERE mm.organization_id = :org
    AND mm.at < :cutoff
    AND NOT EXISTS (
      SELECT 1 FROM verifywise.mrm_metric_evaluations e
      WHERE e.organization_id = mm.organization_id
        AND e.metric_id = mm.id
        AND e.status IN ('warn','breach')
    )
  ORDER BY mm.at
  LIMIT :batchSize
);
```

- The `NOT EXISTS` guard protects the breach trail — a point with any
  warn/breach eval is never deleted.
- **The guard lives INSIDE the batching subquery — this is load-bearing.** If the
  batch window were selected first (oldest N ids) and filtered afterwards,
  never-deletable protected points would permanently occupy the window's slots;
  once the oldest `batchSize` rows past cutoff are all protected, every run
  would select the same rows, delete zero, and the loop's stop condition would
  fire with prunable rows still beyond the window — silently wedging the job
  forever. With the guard inside, `deleted < batchSize` genuinely means "no
  more prunable rows."
- `e.organization_id = mm.organization_id` correlates the probe onto the existing
  `idx_mrm_metric_evaluations_org_metric (organization_id, metric_id)` index.
- Batched (`LIMIT :batchSize`, default 10 000), looped until a run deletes
  fewer than `batchSize` rows, **capped at `maxBatches` (default 500) per run**
  — a pathological first purge is bounded (~5M rows/org/day) and the daily job
  picks up the remainder next day. Bounds lock time and transaction size.
- `ORDER BY mm.at` prunes oldest-first and rides the new index below.
- **New index** (in the same migration as `mrm_org_settings`):
  `idx_mrm_metrics_org_at ON verifywise.mrm_metrics (organization_id, at)` —
  the existing indexes (`(org)` and `(org, model, metric, at)`) do not serve an
  org + at-range scan.
- CASCADE cleanly removes a pruned benign point's (benign-only) eval rows; breach
  eval rows are never reached because their metric survives.

## 3. The job — mirrors `mrmRevalidationSweep.ts`

New `Servers/services/automations/actions/mrmRetentionPrune.ts`:

```ts
runRetentionPrune(orgId, now)     // { organization_id, cutoff, deleted, batches }
runRetentionPruneAllOrgs()        // iterate all orgs, isolated per-org failures
```

- `runRetentionPrune` reads the org's `retention_months` (default 25 if no row),
  computes the cutoff, loops the batched delete (up to `maxBatches`, default 500),
  returns a summary `{ organization_id, cutoff, deleted, batches, capped }` —
  `capped: true` when the run hit `maxBatches` with rows likely remaining.
- `runRetentionPruneAllOrgs` iterates `getAllOrganizationsQuery()`, wraps each org
  in try/catch (one org's failure cannot block the rest), logs a summary only when
  `deleted > 0`. Same structure as the revalidation sweep.
- BullMQ wiring:
  - `automationProducer.ts` — `scheduleMrmRetentionPrune()` with
    `repeat: { pattern: "0 3 * * *" }` (daily 03:00 — off-peak, distinct from the
    01:00 revalidation sweep).
  - `jobs/producer.ts` — call it among the non-obliterating schedulers.
  - `automationWorker.ts` — dispatch `name === "mrm_retention_prune"` →
    `runRetentionPruneAllOrgs()` (mirrors the `mrm_revalidation_sweep` branch at
    line ~524).
- Job is idempotent — re-running only deletes what is now past cutoff.

## 4. Settings surface

**Backend** — new `Servers/utils/mrmSettings.utils.ts`:
- `getMrmOrgSettings(orgId)` → row or defaults.
- `upsertMrmOrgSettings(orgId, { retention_months })` → INSERT … ON CONFLICT
  (organization_id) DO UPDATE, `updated_at = now()`.

New routes on `mrm.route.ts` (JWT, org-scoped):
- `GET  /api/mrm/settings` → current settings (defaults if no row).
- `PUT  /api/mrm/settings` → validate `retention_months` (integer, ≥ 13), upsert.

Thin controller in the existing MRM controller layer; validation rejects
`retention_months < 13` with a 400.

**Frontend** — `SettingsTab.tsx`:
- One field: "Monitoring data retention (months)", number input, min 13,
  default 25, helper text: *"Breach and evaluation history is always retained;
  this only ages out benign monitoring points."*
- Uses VerifyWise `Field`/number input + theme tokens, wired through
  `mrm.repository.ts` + a `useMrm` hook mutation, React Query invalidation on save.
- i18n keys (label + helper) added to `i18n/translations.ts` for de/fr/es.

## 5. Testing

- **Unit** — prune-eligibility predicate:
  - benign point past cutoff → pruned
  - point with a breach eval past cutoff → kept
  - point with a warn eval past cutoff → kept
  - benign point within cutoff → kept
  - batch cap respected (loop terminates)
  - **wedge regression:** protected points OLDER than benign points do not block
    pruning of the newer benign points (guard-inside-batch-window behaviour)
  - `maxBatches` cap: run stops at the cap and reports `capped: true`
- **Integration** (tenant-isolation, matching the 9 existing
  `tests/integration/tenant-isolation/mrm-*.isolation.test.ts`):
  - org A's prune never deletes org B's points
  - settings read/write is org-scoped (A cannot read/write B's settings)

## Out of scope (deliberate)

- Aggregation / rollup of aged benign points (no consumer; add later if needed).
- Per-metric-key retention (over-engineered for v1).
- Pruning `mrm_metric_evaluations`, `mrm_validations`, `mrm_findings`,
  `mrm_revalidation_events` — all audit tables, never pruned.

## Regulatory note

Keeping every warn/breach point and its evaluation forever, and flooring retention
at 13 months, guarantees an examiner can always review a full annual cycle plus the
complete breach history — the SR 26-2 / SS1/23 / OSFI E-23 monitoring-evidence
expectation this gap was flagged against.
