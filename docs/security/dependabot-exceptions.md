# Dependabot Alert Exceptions & Resolution Log

Last updated: 2026-10-20
Scope: open Dependabot alerts on `verifywise-ai/verifywise` (default branch: `develop`).
Tracking issues: #4646 (4th Task Checklist), security verification workstream.

This document records the disposition of every open Dependabot alert: either the fix that
resolved it, or — where no upstream fix exists — a reachability analysis and the compensating
controls that make the residual risk acceptable. Alerts documented here as "risk accepted" are
dismissed in the GitHub security tab with a link to this file and must be re-reviewed whenever
a patched version is published upstream (see "Re-review triggers").

---

## 1. aiohttp — memory/CPU use, missing request/header timeout, cookie `Secure` attribute
- **Alerts:** #671 (high, GHSA-2g87-pp6c-29x5), #670 (high, CVE-2026-111064, GHSA-5wr8-gcqf-gqf3), #669 (low, CVE-2026-111063, GHSA-494j-54xm-rwp3)
- **Package:** `aiohttp` (pip) — `EvalServer/requirements.txt`
- **Vulnerable range:** `<= 3.14.3` · **Patched:** `3.14.5`
- **Status: RESOLVED.** `EvalServer/requirements.txt` pins `aiohttp==3.14.5`
  (commit `99b262715` — "deps(eval): bump aiohttp to 3.14.5 and yarl to 1.25.1 in EvalServer"),
  which is above the vulnerable range. The alerts auto-close on the next Dependabot rescan of
  the default branch; they are dismissed as *fixed* with this note.

## 2. braces — stack-exhaustion DoS via deeply nested patterns
- **Alert:** #651 (high, CVE-2026-93687, GHSA-vfj7-8cjw-p6xm)
- **Package:** `braces` (npm) — `Servers/package-lock.json`
- **Vulnerable range:** `<= 3.0.3` · **Patched:** *none published*
- **Dependency path:** `Servers` → `http-proxy-middleware@4.2.0` (latest) → `micromatch@4.0.8` (latest) → `braces@3.0.3`
- **Status: RISK ACCEPTED — no upstream fix available** (upstream issue: micromatch/braces#70).
- **Reachability analysis:** the vulnerable recursive AST walkers run only when `micromatch`
  *compiles a brace pattern*. In VerifyWise the only compilation inputs are the route-context
  glob strings hard-coded in
  `Servers/routes/aiGateway.route.ts`, `Servers/routes/deepEvalRoutes.route.ts`, and
  `Servers/routes/virtualKeyProxy.route.ts`. These are developer-controlled constants; no
  request data, header, URL segment, or config value controlled by a remote party reaches the
  pattern compiler. An attacker cannot supply "deeply nested brace patterns" to this process.
- **Compensating controls:** (a) `npm audit` remains wired into CI (`backend-checks.yml`) so a
  future patched release (`3.0.4+`) surfaces immediately; (b) the moment a fix is published,
  apply `overrides: { "braces": "^3.0.4" }` in `Servers/package.json` — a one-line change; (c)
  the multi-replica deployment (see `docker-compose.yml` / k6 workstream) limits blast radius
  of any single-process crash.
- **Re-review trigger:** new `braces` release on npm, or any change that passes user input into
  micromatch/http-proxy-middleware context patterns.

## 3. sprintf-js — DoS via unbounded precision specifiers
- **Alert:** #659 (medium, CVE-2026-97058, GHSA-hp3w-g68c-fv3c)
- **Package:** `sprintf-js` (npm) — `Servers/package-lock.json`
- **Vulnerable range:** `<= 1.1.3` (every published version) · **Patched:** *none published*
- **Dependency path:** `Servers` → `mammoth@1.13.0` → `argparse@1.0.10` → `sprintf-js@1.1.3`
  (also pinned via `overrides` in `Servers/package.json` for deterministic resolution)
- **Status: RISK ACCEPTED — no upstream fix available** (upstream issue: alexei/sprintf.js#237).
- **Reachability analysis:** `sprintf-js` is imported **nowhere** in VerifyWise source
  (verified: zero `require`/`import` of `sprintf-js` or `sprintf` call sites in `Servers/**/*.ts|js`).
  Its only presence is as `argparse`'s format helper inside `mammoth`, where the format strings
  are argparse's own CLI-usage templates — compile-time constants, never attacker-controlled.
  There is no runtime path by which a remote party controls a format string.
- **Compensating controls:** (a) the package is a transitive dep of document-conversion
  (`mammoth`) only — no web-facing code path executes it per request; (b) Dependabot continues
  to scan; (c) when upstream ships a fix, bump the `overrides` pin in `Servers/package.json`.
- **Re-review trigger:** new `sprintf-js` release on npm, or introduction of any direct
  `sprintf-js` usage.

---

## Standing procedure
1. Monthly (aligned with the benchmark re-score, issue #4687): re-check npm/PyPI for patched
   releases of `braces` and `sprintf-js`; bump and close out if available.
2. New alerts: fix by version bump when a patch exists; otherwise extend this document with a
   reachability analysis *before* dismissing as risk-accepted.
3. Full-history secret scanning (`.github/workflows/gitleaks.yml` scheduled job, issue #4686)
   covers the supply-chain side; `sbom.yml` tracks dependency inventory drift.
