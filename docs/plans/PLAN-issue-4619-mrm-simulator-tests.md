# Plan — Issue #4619 item 10: Unit tests for `tools/mrm-simulator`

- Branch: `feature/mrm-simulator-unit-tests` (off `develop`)
- Size: Small
- Status: complete — approved by "go /implement-plan". Tasks were left uncommitted during implementation; the developer then asked for one commit covering T1–T4.
- Gate mode: Interactive (default). Auto-advance only if the developer records a standing order here before implementation starts.
- Issue: https://github.com/verifywise-ai/verifywise/issues/4619 (item 10 only)

`docs/agent/plan-template.md`, `docs/agent/repo-map.md`, and `docs/agent/ci-local-parity.md` are not in this checkout. No org-scoped table and no route is touched, so tenant-isolation and swagger regeneration do not apply. There is no `tools/` CLAUDE.md.

## Brief

Item 10 asks for unit tests of the deterministic parts: dataset generation, and the `verify` / `dashboard` command data transforms. HTTP to the backend is mocked. No live backend. Test-only PR. The loop is `npx vitest run` inside `tools/mrm-simulator`.

CI stays out. The item names "no CI coverage" as background; the expected result is a test-only PR, and no workflow under `.github/workflows/` runs this package.

## Acceptance criteria

1. Dataset generation is unit-tested.
2. The `verify` command's data transform is unit-tested.
3. The `dashboard` command's data transform is unit-tested.
4. Tests mock HTTP. None call a live backend, spawn the dashboard server, or open a browser.
5. Production behavior is unchanged. Verification is `npx vitest run` in `tools/mrm-simulator`.

## What already exists

Vitest include is `**/*.test.ts` (`tools/mrm-simulator/vitest.config.ts`). Co-located tests, `vi.mock` before import (`src/engine.test.ts`), and injected fakes (`src/dashboard/runner.test.ts`).

| Already covered | File |
|---|---|
| `generatePoints` | `src/engine.test.ts` |
| `runDashboardSimulation` happy path (`gt`) and compute-throw | `src/dashboard/runner.test.ts` |
| `renderReport`, `parseEnvelope`, `parseConfig` / `loadConfig`, `assertSafeTarget` | `src/report.test.ts`, `src/httpEnvelope.test.ts`, `src/configLoader.test.ts`, `src/config.test.ts` |
| Python dataset and compute checks | `datasets/test_datasets.py`, `compute/test_metrics.py`, `compute/test_cli.py` — leave them; this plan does not add pytest |

## Decision

Do not extract handlers out of `src/cli.ts`, and do not import `cli.ts` from a test.

`verify` (`src/cli.ts` lines 103–109) calls `runVerify` then `writeReport` (`gaps-report.md`). `dashboard` (lines 121–133) calls `startDashboardServer`, then `execFile` to open a browser, then waits forever. Those branches are side effects around the transforms. A test-only PR covers the transforms the commands already call:

- Dataset generation in the TypeScript CLI is `generateRange` in `src/engine.ts` (lines 54–62). It walks one day at a time via `generatePoints`. `datasets/generate.py` is the offline CSV writer and is outside this Vitest loop.
- Verify's transform is `runContractChecks` (`src/verify.ts` lines 15–36, pure) and `runVerify` (lines 39–94). `runVerify` is what the `verify` command calls. `runContractChecks` is the pure breach check on the same findings path (`backfill` writes it). Both belong in one `verify.test.ts`.
- Dashboard's transform is `runDashboardSimulation` in `src/dashboard/runner.ts`. `evalStatus` (lines 29–42) and `segmentsFor` (lines 23–26) stay private. Cover the missing operators through `runDashboardSimulation`, the same way `runner.test.ts` already covers `gt`.

## Task board

### Wave 1 — tests

| ID | Task | Files | Verification |
|----|------|-------|--------------|
| T1 ☒ | Add `generateRange` cases to the existing engine suite. Keep the `vi.mock("./computeClient")` already at the top of the file so Python is not spawned. Assert day count, per-day point count (the existing loan fixture emits 5 points per day: 4 overall + 1 `subprime` gini), and UTC dates stepped by `86_400_000` from `2026-06-01T00:00:00.000Z`. Include `days === 0` → `[]`. | `tools/mrm-simulator/src/engine.test.ts` | `cd tools/mrm-simulator && npx vitest run src/engine.test.ts` |
| T2 ☒ | Add `src/verify.test.ts`. `vi.mock("./configLoader")` and `vi.mock("./jwtClient")` before importing `verify.ts` (`loadConfig()` runs at import, line 5, and `runVerify` constructs `JwtClient`). Do not call `writeReport`. `runContractChecks`: each of `credit-scoring-v3/psi`, `loan-approval-v1/gini`, `churn-propensity-v1/psi` with `breach` or `warn` yields no finding; a missing key, an `ok` status, or an empty map yields one high `contract` finding per miss; a warn counts as a hit. `runVerify`: drive a two-model fake fleet from the config mock, one model with `breach_action: "notify_flag_revalidation"`. Missing cache id is skipped. Empty `getRevalidationEvents` yields the high workflow finding; a non-empty list does not. `models_total` below the fleet length yields the medium attestation finding; a count at or above the fleet length does not. The low `ux` checklist finding is always present. `global.fetch` is not called. | `tools/mrm-simulator/src/verify.test.ts` (new) | `cd tools/mrm-simulator && npx vitest run src/verify.test.ts` |
| T3 ☒ | Extend `src/dashboard/runner.test.ts`. Keep HTTP behind the existing `IngestLike` fake (`pushBatch`). One day per case. Cover `gte`, `lt`, `lte`, and `outside` (inside the band → `ok` and no breach event; below `value_lo` or above `value_hi` → breach). `severity: "warn"` emits metric status `warn` and a breach event with that severity. A segmented fairness value emits a `metric` event whose `segment` is that segment, and a breach when that segment's threshold fails. `flagged` is true only when `breach_action` is `notify_flag_revalidation`. | `tools/mrm-simulator/src/dashboard/runner.test.ts` | `cd tools/mrm-simulator && npx vitest run src/dashboard/runner.test.ts` |

Criterion map: 1 → T1. 2 → T2. 3 → T3. 4 → T2 and T3 (T1 mocks `computeClient`, which is a Python subprocess, not HTTP). 5 → T4.

### Wave 2 — quality

| ID | Task | Files | Verification |
|----|------|-------|--------------|
| T4 ☒ | Run the full simulator suite. Review each acceptance criterion against the tests added in T1–T3. No production file in `src/` should differ from `develop`. | none | `cd tools/mrm-simulator && npx vitest run` |

## CI checks that apply

None. No workflow runs `tools/mrm-simulator`. This plan does not add one. Local check for the PR is the T4 command.

## Risks

- Importing `verify.ts` without mocking `./configLoader` reads the real `config.yaml` and ties `runVerify` to the committed fleet. T2 mocks that module.
- `JwtClient.login` calls `fetch`. The mock must replace the class before `runVerify` runs. A test that forgets the mock will try `http://localhost:3000`.
- `writeReport` and `writeCache` write `gaps-report.md` and `.mrm-simulator.json`. These tests do not call them.
- `startDashboardServer` binds a port. These tests do not import `src/dashboard/server.ts` or `src/cli.ts`.

## Review record

| Task | Result | Commit | Notes |
|------|--------|--------|-------|
| T1 | pass — 4 tests in `src/engine.test.ts` (vitest 4.1.12) | this commit | `npm install` was required first; `node_modules` was missing. The install rewrote `package-lock.json`; that diff was restored. No production change. |
| T2 | pass — 7 tests in `src/verify.test.ts` (vitest 4.1.12) | this commit | `configLoader` and `JwtClient` mocked. `global.fetch` asserted uncalled. `writeReport` not called. |
| T3 | pass — 9 tests in `src/dashboard/runner.test.ts` (vitest 4.1.12) | this commit | Added one-day cases for `gte`, `lt`, `lte`, `outside`, warn severity, segmented fairness, and `flagged`. HTTP stays behind `pushBatch`. |
| T4 | pass — 7 files, 36 tests (vitest 4.1.12) | this commit | No non-test file under `tools/mrm-simulator/src/` differs from `develop`. |

## Acceptance review

1. Dataset generation — met. `generateRange` cases in `src/engine.test.ts` (3 UTC days → 15 points, 5 per day; 0 days → `[]`). `generatePoints` was already covered.
2. Verify transform — met. `src/verify.test.ts`: contract hits and misses, cache skip, empty vs non-empty revalidation events, attestation below and at/above the fleet length, UX checklist always present.
3. Dashboard transform — met. `src/dashboard/runner.test.ts`: `gte`, `lt`, `lte`, `outside`, warn severity, segmented fairness, `flagged` only for `notify_flag_revalidation`. The existing `gt` path stayed.
4. No live backend — met. Engine mocks `computeClient`. Verify mocks `JwtClient` and asserts `global.fetch` is uncalled. Dashboard pushes through the `pushBatch` fake. No test imports `cli.ts` or `dashboard/server.ts`.
5. Production unchanged; suite is the loop — met. `git status` shows only `engine.test.ts`, `runner.test.ts`, `verify.test.ts`, and this plan. Full `npx vitest run` passed.
