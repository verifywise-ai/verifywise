# Flaky Test Tracker

Issue #4503 / #4617-9 — flake-management process for the VerifyWise
Playwright suite (`Clients/e2e`).

## The `@flaky` tag convention

- A test that is observed to flake (passes/fails non-deterministically
  across runs without a code change) **must** be tagged `@flaky` when it
  is temporarily stabilized, and the tag **requires a linked tracking
  issue** in the annotation, e.g.:

  ```ts
  test.info().annotations.push({ type: "flaky", description: "#4711" });
  test("...", { tag: "@flaky" }, async ({ page }) => { ... });
  ```

- Tagging rules:
  - `@flaky` is a **temporary** state. The linked issue must either fix the
    root cause and remove the tag, or quarantine (`test.describe.skip`)
    the spec with an owner + issue reference.
  - No `@flaky` tag may be merged without a tracking issue number — review
    checks for this.
  - Prefer targeted stabilization first (waits on network responses instead
    of `waitForTimeout`, explicit data seeding) before tagging.
- CI runs `@flaky`-tagged tests in a dedicated shard so their signal is
  separated from the blocking suite (wired by the orchestration track).

## Weekly flake report process

1. **Collect** — each week, pull the last 7 days of Playwright runs
   (GitHub Actions `list` reporter output / HTML reports). Flag any test
   that failed at least once and passed on retry.
2. **Triage** (30 min, QA + owning engineer):
   - New flake → file/update tracking issue, add `@flaky` tag with the
     issue link, or fix root cause directly.
   - Known `@flaky` test still flaking → escalate; consider quarantine.
   - Quarantined spec → confirm owner is actively working the issue.
3. **Record** — update the tracker table below with file:line and issue.
4. **Report** — post the summary (new flakes, fixed, still-quarantined) to
   the team channel and link it from the sprint review notes.

## Known-flaky / quarantined areas (seeded 2026-10-20)

Seeded by grepping `Clients/e2e` for `test.skip`, `test.describe.skip`,
and `.fixme` annotations.

### Quarantined

| Area | File:line | State | Notes |
|------|-----------|-------|-------|
| Plugins | `e2e/plugins.spec.ts:9` | `test.describe.skip` | Whole spec quarantined: targets removed `/plugins` route (superseded by `/extensions`); pending rewrite — see spec header and `playwright.config.ts:21-22`. Owner: Debora. |
| Plugins (inner) | `e2e/plugins.spec.ts:101` | `test.skip()` | Conditional skip inside the already-quarantined describe. |

### Defensive conditional skips (`test.skip()` when a UI element/feature is absent)

These skip silently when the app doesn't render the expected element.
They hide UI regressions (the thing they wait for never appears → skip,
not fail) and are the suite's primary flake/false-green risk:

| Spec | Lines |
|------|-------|
| `e2e/model-inventory.spec.ts` | 108, 214, 251, 267, 322, 338, 384, 404 |
| `e2e/policy-editor.spec.ts` | 19, 58, 97, 147, 203, 288, 305, 358 |
| `e2e/public-intake-form.spec.ts` | 94, 114, 123, 146, 186, 204, 232, 260 |
| `e2e/ai-gateway.spec.ts` | 74, 120, 211, 315, 428, 466 |
| `e2e/compliance-tracker.spec.ts` | 37, 63, 90, 114, 152, 159 |
| `e2e/command-palette.spec.ts` | 63, 91, 134, 187 |
| `e2e/assessment.spec.ts` | 50, 73, 104, 145 |
| `e2e/reporting.spec.ts` | 70, 101, 162 |
| `e2e/notifications.spec.ts` | 17, 57, 110 |
| `e2e/training.spec.ts` | 108, 155 |
| `e2e/policies.spec.ts` | 135, 183 |
| `e2e/datasets.spec.ts` | 89, 121, 173 (`projectTest.skip`) |
| `e2e/file-manager.spec.ts` | 144, 202 |
| `e2e/approval-workflows.spec.ts` | 98, 147 |
| `e2e/vendors.spec.ts` | 148 (`projectTest.skip`) |
| `e2e/evals-dashboard.spec.ts` | 89 |
| `e2e/frameworks.spec.ts` | 79 |
| `e2e/intake-forms.spec.ts` | 107 |
| `e2e/incidents.spec.ts` | 119 |
| `e2e/shadow-ai.spec.ts` | 96 |

**Recommendation (follow-up issue):** convert these to hard assertions
(element must appear within N seconds) or explicit feature-flag checks, so
a silently-broken page fails instead of skipping.

### Data-dependent conditional skips

| Spec | File:line | Notes |
|------|-----------|-------|
| Risk inheritance | `e2e/risk-inheritance.spec.ts:76` | Skips when no duplicate candidates in seeded data — acceptable if seeding is deterministic; verify. |
| Risk inheritance | `e2e/risk-inheritance.spec.ts:165` | Skips when no gap row carries a risk level — same as above. |

### Explicitly excluded from flake process

- `e2e/page-not-found.spec.ts`, `e2e/auth.spec.ts`, `e2e/network-resilience.spec.ts`,
  `e2e/navigation.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/start-here.spec.ts`,
  `e2e/super-admin.spec.ts`, `e2e/overview.spec.ts`, `e2e/project-view.spec.ts`,
  `e2e/dashboard.spec.ts`, `e2e/agent-discovery.spec.ts`, `e2e/ai-detection.spec.ts`,
  `e2e/ai-trust-center.spec.ts`, `e2e/automations.spec.ts`, `e2e/event-tracker.spec.ts`,
  `e2e/use-cases.spec.ts`, `e2e/risk-management.spec.ts`, `e2e/tasks.spec.ts`,
  `e2e/settings.spec.ts`, `e2e/post-market-monitoring.spec.ts`,
  `e2e/critical-journey.spec.ts` — no skip/fixme annotations found (baseline).

## Tracker log

| Date | Test (file:line) | Issue | Action | Status |
|------|------------------|-------|--------|--------|
| 2026-10-20 | `e2e/plugins.spec.ts:9` | _needs issue_ | Quarantined (`describe.skip`), excluded from projects in config | Quarantined |
