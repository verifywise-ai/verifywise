# Frontend coverage gap investigation

Issue #4617 item 2 — why the Vitest coverage gate (thresholds 50/40/45/50)
does not appear to fail despite `Clients/coverage/coverage-summary.json`
showing far lower numbers.

Date: 2026-10-20. Scope: `Clients/vite.config.ts`,
`.github/workflows/frontend-checks.yml`, `Clients/coverage/`. No thresholds
were changed.

## The configured gate

`Clients/vite.config.ts` (test.coverage):

```ts
thresholds: process.env.VITEST_SHARD_RUN
  ? undefined                                   // shard runs: collect only
  : { statements: 50, branches: 40, functions: 45, lines: 50 },
reporter: process.env.VITEST_SHARD_RUN ? [] : ["text", "html", "json-summary"],
```

CI (`.github/workflows/frontend-checks.yml`):

1. `unit-and-component-tests` — 4 shards, each runs with
   `VITEST_SHARD_RUN: 1`:
   `npx vitest run --shard=N/4 --reporter=blob --coverage`
   (thresholds off by design; raw coverage lands in the blob report,
   uploaded as `vitest-blob-N`).
2. `coverage` job — downloads all blobs into `Clients/.vitest/blob/` and
   runs the exact command:
   `npx vitest --merge-reports --coverage`
   (no `VITEST_SHARD_RUN`, so thresholds are active and, per the config
   comment, "enforces the thresholds over all shards combined").

## The committed artifact vs. the issue premise

The issue quotes "~32% statements". The actual
`Clients/coverage/coverage-summary.json` (dated 2026-10-14 22:42) says:

| Metric | Covered / Total | pct |
|---|---|---|
| Statements | 750 / 64,484 | **1.16%** |
| Lines | 746 / 59,342 | 1.25% |
| Functions | 78 / 18,195 | 0.42% |
| Branches | 164 / 49,019 | 0.33% |

Key observations:

- `Clients/coverage/` is **gitignored** — this is a local artifact, not a
  CI upload. ~750 covered statements is the signature of a single-test-file
  run (the reporter includes every uncovered `src/**` file at 0%, giving
  the full 64k-statement denominator). It is **not** the CI merged report
  and cannot be used to judge the CI gate.
- The 64,484-statement denominator is the whole included surface
  (`src/**/*.ts(x)` minus `src/test`, `src/mocks`, `src/i18n`, etc.) — so
  50% statements means ~32k covered statements across the merged shards.

## Empirical check: does the merge step enforce thresholds?

Yes. Verified locally on 2026-10-20 with the repo's exact tooling
(vitest 5.0.5, @vitest/coverage-v8 5.0.5):

1. `VITEST_SHARD_RUN=1 npx vitest run src/presentation/components/Cards/StatsCard/__tests__/StatsCard.test.tsx --reporter=blob --coverage`
2. `npx vitest --merge-reports --coverage` (env var unset)

Result: the merge reproduced the full report **and failed the gate**:

```
ERROR: Coverage for lines (0.35%) does not meet global threshold (50%)
ERROR: Coverage for functions (0.14%) does not meet global threshold (45%)
ERROR: Coverage for statements (0.33%) does not meet global threshold (50%)
ERROR: Coverage for branches (0.05%) does not meet global threshold (40%)
exit code 1
```

So with the current vitest version the plumbing works: thresholds are
read from `vite.config.ts` at merge time (not from the shard-recorded
config) and a shortfall fails the job with exit 1.

## Diagnosis — why the gate "doesn't fail"

1. **The premise is stale/mismatched.** No ~32% artifact exists in the
   repo; the only local summary shows 1.16% from a partial run. Nothing in
   the repo substantiates what CI's merged percentage actually is — that
   requires a CI artifact/log inspection (`frontend-coverage-report`,
   retention 14 days).
2. **If CI's merged coverage were truly ~32%, the job would fail today.**
   Given the enforcement verified above, a green `coverage` job implies the
   merged shards actually meet 50/40/45/50 — which is plausible only if the
   885 test files genuinely cover half of the 64k-statement surface;
   otherwise the job is failing silently somewhere upstream (e.g. blobs
   missing coverage → merge would fail-safe with a *lower* number, not a
   pass) or the job's result is not marked required in branch protection
   (not verifiable from the repo).
3. **Version history caveat.** Merge-mode threshold enforcement has been
   inconsistent across Vitest majors. If the workflow previously pinned an
   older vitest, the gate may genuinely have been a no-op then; the current
   `^5.0.5` pin enforces (proven above).
4. **Shard runs never enforce.** Any judgement based on
   `VITEST_SHARD_RUN=1` output is invalid — thresholds are off there by
   design.

## Worst-covered areas

Per-directory percentages from the only available summary (the partial
local artifact — directional only, since untested files count as 0 and the
real merged report may differ):

| Directory (under src) | Files | Stmts % | Lines % |
|---|---|---|---|
| presentation | 1,146 | 1.0% | 1.0% |
| application | 288 | 1.3% | 1.4% |
| infrastructure | 23 | 1.6% | 1.6% |
| domain | 180 | 9.0% | 9.2% |

`App.tsx`, `main.tsx`, `public.tsx` and `application/config` are at 0% in
this artifact. The largest absolute gap is `presentation` — over 1,100
files, mostly page/components with shallow or no unit coverage. For the
true merged ranking, download the latest `frontend-coverage-report`
artifact from a `coverage` job run.

## Recommendations (no threshold changes)

1. Treat the gate as functional on vitest 5.0.5 (proven). Do **not** lower
   thresholds; instead confirm the `coverage` job is a required check and
   inspect one recent CI run's merged summary to establish the true
   baseline.
2. Remove/regenerate the stale local `Clients/coverage/` artifact so the
   ~32%/1.16% confusion does not recur.
3. If the true merged number is below thresholds and CI is green,
   investigate the coverage job's blob download step (it is `if-no-files-
   found: error`, so a silent skip is unlikely) and branch-protection
   requirements for the workflow.
4. Biggest wins for real coverage growth: `presentation/pages` (dashboard,
   framework, reporting flows) — note the e2e suite
   (`Clients/e2e`, see `Clients/e2e/README.md`) already exercises many of
   these pages and can be mined for component-test scenarios.
