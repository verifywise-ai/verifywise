# k6 performance baselines

Baseline policy for the nightly k6 performance suite (#4676, #4617-12),
implemented in `.github/workflows/perf-nightly.yml` with the scripts in
`Servers/tests/perf/`.

## Suite inventory

`Servers/tests/perf/api.k6.js` exercises the hot read paths with per-endpoint
request tags: login, `GET /api/projects/`, `GET /api/dashboard/`,
`GET /api/reporting/sections`, `GET /api/file-manager/`, `GET /api/tasks/`.

## Phases

### Phase 1 — Collect (current, REPORT-ONLY)

The k6 step runs with `continue-on-error: true` (TODO(#4676) in the
workflow). Every run:

1. Runs the suite against a migrated, seeded backend (Postgres + Redis
   service containers, mirroring `e2e-tests.yml`).
2. Downloads the previous run's summary (`k6-summary-latest` artifact) and
   runs `Servers/tests/perf/compare-baseline.mjs`, which writes a p95
   comparison table to the job summary and emits `::warning::` annotations
   for any endpoint regressed > 20%.
3. Uploads the run's summary JSON twice: once as a versioned artifact
   (`k6-summary-<run_id>-<attempt>`, 90-day retention) and once as the
   stable `k6-summary-latest` name that the next run consumes as its
   baseline.

Nothing fails the workflow in this phase. Watch the job summary for a few
weeks to learn the noise floor of each endpoint.

### Phase 2 — Enforce (graduation criteria)

Switch to a blocking gate when ALL of the following hold:

- At least ~14 consecutive nightly runs on `develop` with stable baselines
  (no machine-size-related jumps — GitHub-hosted runners vary, so treat
  single-run spikes under ~30% as noise until they repeat).
- Every endpoint tag in `api.k6.js` has a stored baseline p95.
- The threshold budgets in `api.k6.js` have been re-tuned once against
  observed values (they are currently conservative guesses).

Enforcement = **fail on p95 regression > 20% vs the stored baseline**:

1. Remove `continue-on-error: true` from the k6 step (delete the
   TODO(#4676) comment).
2. Make `compare-baseline.mjs` exit non-zero on regression (drop the
   trailing `|| true` in the workflow and let the script `process.exit(1)`
   when `regressions > 0`).
3. Keep thresholds in the k6 script as the absolute ceiling; the baseline
   comparison is the relative gate. A run fails if either trips.

### Phase 3 — PR gating (optional, do not do lightly)

Running the full staged suite per PR is expensive and noisy on shared
runners. If PR signal is ever needed, add a *smoke* variant (fixed 10 VUs,
30 s, dashboard + projects only) to `backend-checks.yml` rather than
running the nightly suite there.

## Adjusting budgets

Endpoint budgets live in `options.thresholds` in `api.k6.js`, keyed by the
`endpoint` request tag. The regression percentage is a single constant at
the top of `compare-baseline.mjs` (`REGRESSION_THRESHOLD`, overridable via
the `REGRESSION_PCT` env var).

## Caveats

- CI runners are shared and variable; baselines track the *develop* branch
  over time, not absolute SLAs. Production SLO measurement needs a
  dedicated environment (see `docs/deployment/multi-replica-scaling.md`
  for the multi-replica harness).
- The suite is read-only plus one login; write-path performance is covered
  indirectly (report generation is exercised by the integration suite).
