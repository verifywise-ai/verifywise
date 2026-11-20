---
name: verify-pr
description: Run the same checks locally that GitHub Actions runs on PRs — scoped to the areas the branch touched — and produce a PR-readiness report mapped to the PR template. Use before opening any pull request. Final stage of the VerifyWise development flow.
---

# Verify PR

Prove the branch passes CI **before** the PR is opened. Nothing in this skill opens a PR.

**Input:** optionally a base branch (default `develop`). No other input needed — the diff determines everything.

## Steps

1. **Freshness check on the matrix.** This skill is driven by `docs/agent/ci-local-parity.md`. If any file in `.github/workflows/` is newer than that document, re-derive the affected section from the workflow first and flag the matrix as needing an update in the same PR.

2. **Compute affected areas:**

   ```bash
   git fetch origin develop 2>/dev/null || true
   git diff --name-only origin/develop...HEAD
   ```

   Map paths to areas: `Clients/`, `Servers/`, `AIGateway/`, `EvalServer/`, `EvaluationModule/`, `GRSModule/`, `sdks/python/`, `kubernetes/`+`observability/`, `.github/workflows/`, root config. If the branch also has uncommitted changes, include them and say so.

3. **Run every [must] check** for each affected area, exactly as listed in `docs/agent/ci-local-parity.md`. Order within an area: format → types/build → lint → i18n/drift checks → tests → dependency audit. Practical notes that save red PRs:
   - **Clients:** run `npm run typecheck` even if `npm run build` passed — the build does not type-check.
   - **Servers:** if any route/controller changed, run `npm run generate:swagger && npm run generate:endpoints` and require `git diff --exit-code -- swagger.yaml ../docs/api-docs/src/config/endpoints.ts` to be clean; then `npm run check:api-drift`. Commit regenerated files.
   - **Servers:** if an org-scoped table was added/modified, require the tenant-isolation registry + test matrix update (`.github/pull_request_template.md` demands it) and run the tenant-isolation integration suite if Postgres is available; otherwise mark it explicitly as deferred to CI.
   - **Repo-wide:** always run `gitleaks detect --no-git --source . --config .gitleaks.toml --redact --exit-code 1` regardless of area.
   - **[ci-ok] checks** (e2e, semgrep, docker builds, CodeQL): do not run by default; list them in the report as "delegated to CI" unless the developer asked for them.

4. **Handle failures by looping back, not around.** A failed [must] check means the branch is not PR-ready: report the failure with its output, propose the fix, and (with the developer's go-ahead) return to `implement-plan` behavior to fix it, then re-run the failed check. Never mark a red check as "probably fine in CI."

5. **Produce the readiness report** and **STOP**:

   ```
   ## PR Readiness — <branch> vs develop

   Affected areas: <list>

   | Check | Area | Result |
   |-------|------|--------|
   | format-check | Clients | ✅ / ❌ / ⏭ not affected |
   | typecheck | Clients | ✅ |
   | … | … | … |

   Deferred to CI: <[ci-ok] checks and why>
   Coverage: < Clients vs 50/40/45/50, Servers vs 30/25/25/40 — actual numbers >

   PR template mapping:
   - [x] Deployed/tested locally …
   - [x] swagger.yaml/endpoints.ts regenerated and committed (if routes changed)
   - [ ] Tenant isolation registry updated (if org-scoped table changed)
   <one line per applicable item from .github/pull_request_template.md>

   Verdict: READY / NOT READY — <reasons>
   ```

## Gate — developer opens the PR

The skill ends at the report. The developer decides what happens next. Per the root CLAUDE.md rule, never run `gh pr create` without an explicit instruction — "looks good" / "ship it" refers to the work, not to opening a PR. If asked to open it, use the PR template, title format `type(scope): description`, and `Fixes #<issue>`.
