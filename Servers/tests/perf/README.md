# Performance tests (k6) — Servers/tests/perf

Load/performance smoke tests for the VerifyWise API, run by
`.github/workflows/perf-nightly.yml` (nightly cron + manual dispatch).

## Files

| File                   | Purpose                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.k6.js`            | Core read-path suite: login, project list, dashboard aggregation, reporting sections, file list, task list. p95 thresholds per endpoint (tagged). |
| `multireplica.k6.js`   | Multi-replica scenario: request distribution + cross-replica rate-limit behavior. Run against `docker-compose.multireplica.yml`, not CI.          |
| `compare-baseline.mjs` | Compares the current k6 summary JSON against the stored baseline; emits `::warning::` on p95 regressions > 20%. Informational only.               |

## Endpoint inventory

Endpoints under test (verified against `Servers/routes/` and the route
labels emitted by `Servers/middleware/requestMetrics.middleware.ts`):

| Endpoint                      | Route file             | Notes                                                           |
| ----------------------------- | ---------------------- | --------------------------------------------------------------- |
| `POST /api/users/login`       | `user.route.ts`        | Token source; envelope `{ message, data: { token } }`, HTTP 202 |
| `GET /api/projects/`          | `project.route.ts`     |                                                                 |
| `GET /api/dashboard/`         | `dashboard.route.ts`   | Aggregation; highest p95 budget                                 |
| `GET /api/reporting/sections` | `reporting.route.ts`   |                                                                 |
| `GET /api/file-manager/`      | `fileManager.route.ts` | Mounted at `/api/file-manager`                                  |
| `GET /api/tasks/`             | `task.route.ts`        |                                                                 |

## Running locally

Prereqs: a migrated + seeded backend (see `Servers/docs/TESTING.md` or the
e2e setup in `.github/workflows/e2e-tests.yml`), plus [k6](https://k6.io).

```bash
cd Servers
npm run build && npx sequelize db:migrate && node dist/scripts/seedTestData.js
node dist/index.js &

k6 run -e BASE_URL=http://localhost:3000 \
       -e PERF_EMAIL=admin@verifywise-test.com \
       -e PERF_PASSWORD='TestAdmin!Str0ng' \
       tests/perf/api.k6.js
```

## Status: REPORT-ONLY

The nightly workflow runs k6 with `continue-on-error: true`
(TODO(#4676) in `.github/workflows/perf-nightly.yml`). Threshold breaches are
recorded and compared against the stored baseline but do **not** fail CI. The
graduation path to a blocking gate is documented in
`docs/deployment/k6-perf-baselines.md`.
