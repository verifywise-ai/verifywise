# Playwright Canary

Fast, deterministic smoke test for the VerifyWise critical journey
(issue #4681-a). Intended to run **on a schedule** (GitHub Actions — the
workflow itself is owned by the CI/orchestration track) against **staging
and production**, not just the local dev stack.

## What it covers

`e2e/canary/canary.spec.ts` — tagged `@canary`, three steps only:

1. **Login** — authenticated storage state restored (produced by
   `e2e/global.setup.ts`); landing back on `/login` = session invalid = fail.
2. **Dashboard renders** — non-empty body plus a heading/card/welcome marker.
3. **Project list loads** — `/overview` shows a table, grid, list, card, or
   the seeded "E2E Baseline Project" entry.

The CSP evidence spec (`e2e/canary/csp-capture.spec.ts`) is also tagged
`@canary` so the scheduled run continuously collects CSP violation evidence
(see `docs/security/csp-evidence-pack.md`).

## How to run

From `Clients/`:

```bash
# Against the local dev stack (default baseURL from playwright.config.ts)
npx playwright test --project=canary --grep @canary

# Against staging / production
E2E_BASE_URL=https://staging.verifywise.com npx playwright test \
  --project=canary --grep @canary
```

- The target is selected with the **`E2E_BASE_URL`** environment variable,
  which `playwright.config.ts` reads for `use.baseURL` (fallback:
  `http://localhost:5173`). Credentials come from `E2E_EMAIL` /
  `E2E_PASSWORD` (used by `global.setup.ts` to mint the auth state).
- The `--project=canary` project is wired by the orchestration track in
  `playwright.config.ts` (not owned by this pod).
- Staging/prod runs still need a seeded, login-capable user; point the
  credentials env vars at a dedicated smoke-test account.

## Expected scheduled invocation

The scheduled GitHub workflow (separate agent's job) is expected to invoke
exactly:

```bash
npx playwright test --project=canary --grep @canary
```

with `E2E_BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` provided as job env /
secrets, and the workflow failing (page the on-call) if the canary fails.
