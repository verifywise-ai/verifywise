# Playwright Canary

Fast, deterministic smoke test for the VerifyWise critical journey
(issue #4681-a). Intended to run **on a schedule** (GitHub Actions) against
**staging and production**, not just the local dev stack.

## What it covers

`e2e/canary/canary.spec.ts` — tagged `@canary`, three steps only:

1. **Login** — authenticated storage state restored; landing back on
   `/login` = session invalid = fail. Against a deployed target the state
   comes from `e2e/canary/canary.setup.ts`, locally from `e2e/global.setup.ts`
   (see _Deployed targets_ below).
2. **Dashboard renders** — non-empty body plus a heading/card/welcome marker.
3. **Project list loads** — `/overview` shows a table, grid, list, card, or
   (locally) the seeded "E2E Baseline Project" entry.

The CSP evidence spec (`e2e/canary/csp-capture.spec.ts`) is also tagged
`@canary` so the scheduled run continuously collects CSP violation evidence
(see `docs/security/csp-evidence-pack.md`).

## How to run

From `Clients/`:

```bash
# Against the local dev stack (default baseURL from playwright.config.ts)
npx playwright test --project=canary --grep @canary

# Against staging / production
E2E_BASE_URL=https://<app host> E2E_EMAIL=<canary account> E2E_PASSWORD=<password> \
  npx playwright test --project=canary --grep @canary
```

The target is selected with the **`E2E_BASE_URL`** environment variable,
which `playwright.config.ts` reads for `use.baseURL` (fallback:
`http://localhost:5173`). Credentials come from `E2E_EMAIL` / `E2E_PASSWORD`.

## Deployed targets

Any `E2E_BASE_URL` whose host is not loopback (`localhost`, `127.x.x.x`,
`[::1]`, `0.0.0.0`) counts as a deployed environment
(`e2e/helpers/target.helper.ts`). There:

- The canary depends on `canary-setup` (`e2e/canary/canary.setup.ts`), which
  only signs in `E2E_EMAIL` and saves `e2e/.auth/canary.json`. It creates,
  seeds and deletes nothing.
- `global.setup.ts` and `risk-inheritance.setup.ts` refuse to run, because
  they delete, recreate and seed organizations. They also refuse when
  `E2E_BACKEND_URL` (where their API calls go) is not loopback, even with a
  local `E2E_BASE_URL`. Set `E2E_ALLOW_DEPLOYED_SETUP=1` only for a disposable
  environment, or for a local stack reached by a container hostname.
- No local Vite server is started.
- Point `E2E_EMAIL` / `E2E_PASSWORD` at a dedicated smoke-test account that is
  an in-org user (an Admin works). A super-admin is sent to `/super-admin` and
  fails the journey.

## Workflow

`.github/workflows/canary.yml` runs
`npx playwright test --project=canary --grep @canary` every 30 minutes, with
repo variable `CANARY_BASE_URL` and secrets `CANARY_EMAIL` /
`CANARY_PASSWORD`. Until all three exist the run is skipped with a warning.
