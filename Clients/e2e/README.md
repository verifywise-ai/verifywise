# VerifyWise E2E tests (`Clients/e2e`)

Playwright end-to-end suite for the VerifyWise client. Covers issue items
#4617 (project matching, coverage conventions) and #4820 (UI-behavior
regressions).

## Prerequisites

1. PostgreSQL + Redis running, backend migrated and seeded
   (`cd Servers && npm run build && npx sequelize db:migrate`).
2. Backend running (`cd Servers && npm run watch`, default
   `http://localhost:3000`).
3. From `Clients/`: `npx playwright test` — the dev server on
   `:5173` starts automatically (`webServer` block in `playwright.config.ts`,
   `reuseExistingServer: true`).

Environment overrides: `E2E_BASE_URL` (frontend), `E2E_BACKEND_URL`,
`E2E_EMAIL` / `E2E_PASSWORD` (super-admin credentials used by setup),
`PLAYWRIGHT_USE_SYSTEM_CHROME=1` to use local Chrome instead of the
bundled Chromium.

## Project map (spec file → project)

Every spec file under `e2e/` MUST be claimed by at least one project —
specs matched by no project silently never run (#4617 item 1). Verify with
`npx playwright test --list` and diff against
`Get-ChildItem e2e -Recurse -Filter *.spec.ts`.

| Project                                       | Auth state                                | Specs                                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setup`                                       | — (logs in via UI)                        | `global.setup.ts` — writes `e2e/.auth/user.json` (super-admin) and `e2e/.auth/admin.json` (org Admin of the seeded "E2E Global Setup Org")                   |
| `auth-tests`                                  | none                                      | `auth.spec.ts` (login/register/forgot flows)                                                                                                                 |
| `chromium`                                    | `user.json` (super-admin)                 | `super-admin.spec.ts`                                                                                                                                        |
| `risk-inheritance-setup` / `risk-inheritance` | own setup → `risk-inheritance-admin.json` | `risk-inheritance.spec.ts` (+ `risk-inheritance.setup.ts`)                                                                                                   |
| `admin`                                       | `admin.json` (org Admin)                  | Critical journeys: `use-cases`, `risk-management`, `tasks`, `critical-journey`, `reporting-journey`, `compliance-journey`                                    |
| `features`                                    | `admin.json`                              | All other feature specs (see `FEATURE_SPECS` in `playwright.config.ts`), with axe tests (`/accessibility violations/`) grep-inverted                         |
| `a11y`                                        | `admin.json`                              | Same feature specs, only the axe tests (`grep /accessibility violations/`) — axe scans run exactly once                                                      |
| `canary`                                      | `user.json` (super-admin)                 | `e2e/canary/canary.spec.ts`, `e2e/canary/csp-capture.spec.ts` — scheduled smoke + CSP evidence (`--project=canary --grep @canary`). Owned by the canary pod. |
| `quarantine`                                  | `admin.json`                              | `plugins.spec.ts` — whole spec self-skips (`test.describe.skip`); targets the removed `/plugins` route. Rewrite against `/extensions` before reactivating.   |

## Auth states & fixtures

- `fixtures/auth.fixture.ts` → `authedPage`: a page with the project's
  `storageState` already loaded; navigates to `/` and asserts auth stuck.
- `fixtures/project.fixture.ts` → `{ projectPage, projectName }`: fully
  isolated org + Admin + project per test. The org is deleted after the
  test (cascades). **Use this for any test that writes data.**
- Custom isolated-org fixtures (see `framework-empty-state.spec.ts`,
  `compliance-journey.spec.ts`, `onboarding.spec.ts`): same pattern,
  with an **organizational** project (`is_organizational: true` +
  `framework: [2]` for ISO 42001) when the `/framework` page is the target.
- `helpers/auth.helper.ts` → `loginAs`, `dismissOnboardingModals`.
- Browser-side API calls (same pattern as `critical-journey.spec.ts`):
  read the JWT from `localStorage["persist:root"] → auth.authToken` and
  `fetch("/api/…", { headers: { Authorization: \`Bearer ${token}\` } })`.
- Server-side API seeding: `factories/api.factory.ts` →
  `createApiContext` / `orgs` / `users.seedAdmin` / `projects` /
  `projectRisks` / `vendors` / `tasks` / `riskLinks`.

## Framework / domain ids used by factories

| Id  | Framework                      |
| --- | ------------------------------ |
| 1   | EU AI Act (non-organizational) |
| 2   | ISO 42001 (organizational)     |
| 3   | ISO 27001 (organizational)     |
| 4   | NIST AI RMF (organizational)   |

Linking a framework to a project (at creation or via
`addFrameworkToProject`) auto-generates all clause/subclause/control rows
on the server — there is no API-reachable "0 items" state.

## How to add a spec

1. Create `e2e/<name>.spec.ts` following an existing spec's imports and
   fixture usage. Pick the name so it lands in the right project:
   - journey specs → suffix `-journey.spec.ts` (claimed by `admin` via
     `CRITICAL_PATH_SPECS`);
   - feature specs → add the basename to the `FEATURE_SPECS` alternation in
     `playwright.config.ts` (claimed by `features` + `a11y`).
2. If the page is a11y-enforced, add one test titled
   `… has no … accessibility violations` using `helpers/axe.ts`
   (`analyzeCriticalAndSeriousViolations` + `summarizeViolations`) — it is
   grep-inverted out of `features` and runs once under `a11y`.
3. Seed data through `factories/api.factory.ts` or browser-side
   `fetch` with the persisted token — never through the UI when an API
   exists (speed + stability).
4. Run `npx playwright test --list` and confirm the new file appears under
   exactly the intended project(s).

## Quarantine & `@flaky` process

Full process lives in `docs/qa/flaky-test-tracker.md` (#4503 / #4617-9).
Summary:

- **`@flaky` tag** — every project in `playwright.config.ts` carries
  `grepInvert: /@flaky/`, so tagged tests never run in the default suite.
  Run them explicitly with `npx playwright test --grep @flaky`.
  Tagging requires a linked tracking issue:
  `test("…", { tag: "@flaky" }, …)` plus a `flaky` annotation with the
  issue number. The tag is temporary — fix the root cause or quarantine.
- **Quarantine** — dead-route/stale-selector specs are claimed by the
  `quarantine` project and self-skip with a triage comment naming the
  issue and owner (`plugins.spec.ts` is the current example). Never delete
  a spec without grepping `Clients/src` to prove the page is really gone.
- **Defensive `test.skip()`** — conditional skips when a UI element is
  absent hide regressions (skip ≠ fail). Prefer strict assertions plus
  explicit seeding; any conditional skip must say in a comment what
  condition triggers it.

## Known adapted behaviors (#4820 triage, 2026-10-20)

- **Stats-card empty state** — `StatsCard` implements
  "No regulation connected" for `total === 0`, but no API flow produces a
  0-item connected framework, so `framework-empty-state.spec.ts` pins the
  positive shape ("of N completed", never "0 of 0") and skips the
  empty-state test with a triage note.
- **SetupModal LLM-key step** — does not exist (no such step, no
  `/settings/apikeys` route). `onboarding.spec.ts` tests the implemented
  modal and skips the LLM-key test until the feature ships.
- **Command palette** — Cmd/Ctrl+K opens (synthetic `keydown` dispatch;
  Chromium intercepts the physical combo), the palette's X button
  (`aria-label="Close"`) and Esc both close.
