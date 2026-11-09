# CSP Evidence Pack

Issue #4686-a — how Content-Security-Policy violations are captured,
aggregated, and turned into an enforcement decision for the VerifyWise
client.

## Current policy state (as of 2026-10-20)

`Clients/nginx.conf` ships a **Report-Only** header (line 26):

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src  'self' 'unsafe-inline';
  img-src    'self' data: https:;
  font-src   'self' data:;
  connect-src 'self' https:;
  frame-ancestors 'self';
  base-uri 'self';
  form-action 'self'
```

Notable gaps the policy itself acknowledges (comments in nginx.conf,
lines 12–25):

- `'unsafe-inline'` in `script-src` / `style-src` — promotion path is to
  move inline scripts/styles to external files or use nonces/hashes.
- **No `report-uri` / `report-to` directive** — browsers have no collector
  endpoint; violations surface only as in-page `securitypolicyviolation`
  events.
- HSTS is intentionally not set in this container (plain HTTP); it is set
  at the TLS-terminating layer.

## How violations are captured

`Clients/e2e/helpers/csp.helper.ts` (`CspCollector`) captures both browser
report channels:

1. **`securitypolicyviolation` DOM events** — via `page.addInitScript` so
   the listener is installed before page load (early violations are not
   missed). This is the live channel today.
2. **Reporting-API / `report-uri` / `report-to` POSTs** — the collector
   routes any POST that looks like a CSP report
   (`application/csp-report`, `application/reports+json`, or a `/report*`
   path) and records the body. Future-proof for when a collector endpoint
   is added to the policy.

## Where artifacts land

`Clients/e2e/canary/csp-capture.spec.ts` (tagged `@canary`) loads the main
pages (`/login`, `/`, `/overview`, `/project-view`) and writes:

```
Clients/test-results/csp-violations.json
```

Schema: `{ generatedAt, baseUrl, pages, policyMode, violationCount,
violatedDirectives[], violations[] }` where each violation carries
`source`, `pageUrl`, `violatedDirective`, `blockedUri`, `disposition`,
`sourceFile`, and `capturedAt`.

The spec **never hard-fails** on violations — Report-Only mode means
violations are evidence, not errors. The artifact is uploaded as a CI
artifact by the scheduled canary workflow so weekly aggregation always has
input.

## Weekly aggregation & the enforcement policy

1. **Collect** — every scheduled canary run (staging + prod) produces a
   `csp-violations.json` artifact.
2. **Aggregate** — weekly, the set of `violatedDirectives` (e.g.
   `script-src`, `connect-src`) from all runs is compared against the
   **baseline** stored in this repo (kept in the tracker table below / a
   future `docs/security/csp-baseline.json`).
3. **Policy: fail on any NEW violation directive.**
   - A violation whose directive is **already in the baseline** → evidence
     only, tracked as tech-debt toward removing `'unsafe-inline'`.
   - A violation in a **newly violated directive** (e.g. `img-src` starts
     tripping) → enforcement decision: block promotion / file a security
     issue, because the app began loading resources outside the policy.
4. **Promotion path** (from nginx.conf comments): triage baseline
   violations → remove `'unsafe-inline'` → rename the header to
   `Content-Security-Policy` (drop `-Report-Only`) → keep the collector
   running; from then on, the "new directive" rule upgrades to
   "fail on any violation".

## Baseline tracker

| Date       | Environment | Violated directives (baseline) | Artifact |
|------------|-------------|--------------------------------|----------|
| _pending first scheduled run_ | — | — | `test-results/csp-violations.json` |
