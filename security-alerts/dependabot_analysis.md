# Dependabot Open Security Alerts Analysis

**Generated:** 2026-08-05  
**Total open alerts:** 14  
**Source:** `security-alerts/dependabot_alerts.json`

## Executive Summary

All 14 open Dependabot alerts are in the npm ecosystem. They cluster around three packages:
- **hono** (1 alert) in `Servers/package-lock.json` -- ReDoS in CORS middleware.
- **undici** (10 alerts) in `Clients/package-lock.json` and `GRSModule/ui/frontend/package-lock.json` -- CRLF injection, cache handling, cookie injection, retry desync.
- **react-router** (3 alerts) in `Clients`, `GRSModule/ui/frontend`, and `docs/api-docs` -- RSC-mode CSRF bypass.

The highest severity issues are the **react-router** high-severity RSC CSRF alerts and one **undici** high-severity shared-cache disclosure/parse-crash alert. The react-router fix requires a major-version migration (7.x -> 8.3.0+) and is the most invasive.

## Open Alerts Overview

| Alert # | Package | Installed | Vulnerable Range | Fixed Version | Severity | Manifest | Relationship | Introduced By | Owner |
|--------:|---------|----------:|------------------|--------------:|----------|----------|--------------|---------------|-------|
| 478 | npm:react-router 7.18.0 | 7.18.0 | `>= 7.12.0, < 8.3.0` | 8.3.0 | high | `Clients/package-lock.json` | transitive | react-router-dom (direct dependency) | Frontend Platform Engineer |
| 514 | npm:react-router 7.18.2 | 7.18.2 | `>= 7.12.0, < 8.3.0` | 8.3.0 | high | `GRSModule/ui/frontend/package-lock.json` | transitive | react-router-dom (direct dependency) | Frontend Platform Engineer (GRS UI) |
| 515 | npm:react-router 7.18.2 | 7.18.2 | `>= 7.12.0, < 8.3.0` | 8.3.0 | high | `docs/api-docs/package-lock.json` | transitive | react-router-dom (direct dependency) | Frontend Platform Engineer (Docs) |
| 520 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | high | `GRSModule/ui/frontend/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer (GRS UI) |
| 521 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | high | `Clients/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer |
| 523 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `GRSModule/ui/frontend/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer (GRS UI) |
| 524 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `Clients/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer |
| 526 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `GRSModule/ui/frontend/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer (GRS UI) |
| 527 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `Clients/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer |
| 529 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `GRSModule/ui/frontend/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer (GRS UI) |
| 530 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `Clients/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer |
| 532 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `GRSModule/ui/frontend/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer (GRS UI) |
| 533 | npm:undici 7.28.0 | 7.28.0 | `>= 7.0.0, < 7.29.0` | 7.29.0 | medium | `Clients/package-lock.json` | transitive | jsdom (dev dependency) | Frontend Platform Engineer |
| 537 | npm:hono 4.12.27 | 4.12.27 | `< 4.12.34` | 4.12.34 | medium | `Servers/package-lock.json` | transitive | @modelcontextprotocol/sdk (via @hono/node-server peer dep) | Backend Platform Engineer |

## Per-Alert / Per-Package Recommendations

### #537 -- hono ReDoS in CORS middleware (`Servers/package-lock.json`)

- **GHSA:** GHSA-8j4g-w8fx-2239  
- **CVE:** CVE-2026-69207  
- **Vulnerable range:** `< 4.12.34`  
- **Installed version:** `4.12.27`  
- **Patched version:** `4.12.34`  
- **Severity:** medium  
- **Relationship:** transitive (pulled in by `@modelcontextprotocol/sdk` and `@hono/node-server` peer dependency)

#### Recommended fix
```bash
cd Servers
npm update hono
# If npm does not resolve high enough, add to package.json overrides and reinstall:
#   "overrides": { "hono": "^4.12.34" }
npm install
```

#### Breaking changes / compatibility
- hono 4.12.34 is a patch release; no public API breaking changes.
- `@modelcontextprotocol/sdk` allows `hono ^4.11.4` and `@hono/node-server` peer-depends on `hono ^4`, so both accept the patched version.
- Verify any custom CORS `allowHeaders` configuration still behaves as expected after the patch.

#### Owner
Backend Platform Engineer (Servers npm workspace).

### undici alerts in `Clients/package-lock.json`

Affected alerts: #521, #524, #527, #530, #533  
- Installed version: `7.28.0`  
- Vulnerable range: `>= 7.0.0, < 7.29.0`  
- Patched version: `7.29.0`  
- Introduced by: `jsdom` (dev dependency)

#### Recommended fix
```bash
cd Clients
npm update undici
# If npm does not resolve high enough, pin via overrides in Clients/package.json:
#   "overrides": { "undici": "^7.29.0" }
npm install
```
Alternatively, upgrade `jsdom` to `^30.0.1` (which depends on `undici ^8.9.0`, also patched). This is a larger dev-dependency change and should be validated with the full Vitest/Playwright suite.

#### Breaking changes / compatibility
- `undici@7.29.0` is a patch-level security release in the same major line.
- The vulnerable code paths (CRLF injection via blob `type`, cache interceptor OWS handling, cookie attribute injection, retry interceptor desync, malformed `private` cache directives) are not used by VerifyWise production runtime; they only surface through `jsdom` internal fetch implementation during tests.
- `Servers/package-lock.json` already resolves `undici@7.29.0` via an existing override; use that lockfile as a reference.

#### Owner
Frontend Platform Engineer (Clients npm workspace).

### undici alerts in `GRSModule/ui/frontend/package-lock.json`

Affected alerts: #520, #523, #526, #529, #532  
- Installed version: `7.28.0`  
- Vulnerable range: `>= 7.0.0, < 7.29.0`  
- Patched version: `7.29.0`  
- Introduced by: `jsdom` (dev dependency)

#### Recommended fix
```bash
cd GRSModule/ui/frontend
npm update undici
# or add override in GRSModule/ui/frontend/package.json:
#   "overrides": { "undici": "^7.29.0" }
npm install
```
Alternatively, upgrade `jsdom` to `^30.0.1` (depends on `undici ^8.9.0`).

#### Breaking changes / compatibility
- Same as Clients: patch-level security release; no expected runtime impact because `undici` is only pulled in through the test-time `jsdom` dependency.

#### Owner
Frontend Platform Engineer (GRS UI npm workspace).

### react-router RSC-mode CSRF alerts

Affected alerts: #478, #514, #515  
- Installed versions: `7.18.0` (Clients), `7.18.2` (GRS, docs/api-docs)  
- Vulnerable range: `>= 7.12.0, < 8.3.0`  
- Patched version: `8.3.0`  
- Severity: high  
- Relationship: transitive (pulled in by direct `react-router-dom` dependency)

#### Recommended fix
The only patched release line is **react-router 8.3.0+**. `react-router-dom` does not have a v8 release (it was removed in v8). The fix requires migrating each workspace from `react-router-dom` to `react-router`:

```bash
# In each affected workspace (Clients, GRSModule/ui/frontend, docs/api-docs):
npm uninstall react-router-dom
npm install react-router@^8.3.0
```

Then update imports:
- `import { Link, useNavigate, ... } from 'react-router-dom'` -> `import { ... } from 'react-router'`
- `import { RouterProvider, ... } from 'react-router-dom'` -> `import { ... } from 'react-router/dom'`

#### Breaking changes / compatibility
- **React version requirement:** `react-router@8.3.0` peer-depends on `react >=19.2.7` and `react-dom >=19.2.7`.
  - `Clients` already declares `react ^19.2.7` / `react-dom ^19.2.7` -- compatible.
  - `GRSModule/ui/frontend` declares `react ^19.2.5` / `react-dom ^19.2.5` -- must bump to `^19.2.7`.
  - `docs/api-docs` is on React `^18.3.1` / `react-dom ^18.3.1` -- must upgrade to React `^19.2.7+`, which may affect `@mui/material ^6.1.6` and other React-18-era dependencies; verify type-check and build.
- **Node version requirement:** `react-router@8.3.0` requires `node >=22.22.0`. The `Clients` and `Servers` engines are currently `>=22.13.0`; update to `>=22.22.0`.
- **Package format:** react-router v8 is **ESM-only**. Vite-based builds are already ESM, but confirm no CJS-only tooling consumes it.
- **API removals:** deprecated `data` parameter removed from `meta` APIs in favor of `loaderData`; `hasErrorBoundary` internal field removed. Search for any `Route.MetaArgs.data`, `matches[i].data`, or `useMatches()[i].data` usage.
- **Import scope:** `react-router-dom` package no longer exists. ~144 source files in `Clients/src` import `react-router-dom`; `GRSModule/ui/frontend/src` has 4 files; `docs/api-docs/src` has 2 files. The refactor is mechanical but broad.
- **Actual exploitability:** The advisory (GHSA-qwww-vcr4-c8h2) only affects React Router's **unstable RSC (React Server Components) mode**. VerifyWise frontends appear to use declarative `<BrowserRouter>` / `<Routes>` SPA patterns, so the vulnerable code path is likely unreachable today. However, Dependabot still flags it and a clean audit requires the v8 upgrade.

#### Owner
Frontend Platform Engineer (Clients, GRS UI, and Docs npm workspaces). Given the cross-workspace impact and React-major-style upgrade for `docs/api-docs`, coordinate with the UI/UX and DevOps teams for build/runtime validation.

## Action Priority

| Priority | Alert(s) | Rationale |
|----------|----------|-----------|
| P1 (High) | react-router #478, #514, #515 | High severity; major-version migration required, broad import refactor, and React/Node baseline bumps. |
| P2 (Medium-High) | undici #521, #520 | High severity, but only reachable through `jsdom` test paths; still should be patched quickly. |
| P3 (Medium) | undici remaining (#533, #530, #527, #524, #523, #529, #526, #532) | Same patch fixes all medium undici alerts. |
| P4 (Medium) | hono #537 | Patch-only fix in Servers; low risk of regression. |

## Validation Checklist

- [ ] Run `npm audit` in each workspace and confirm the listed GHSA IDs no longer appear.
- [ ] For `Servers`: verify `node_modules/hono/package.json` reports `>=4.12.34`.
- [ ] For `Clients` / `GRSModule/ui/frontend`: verify `node_modules/undici/package.json` reports `>=7.29.0` (or `>=8.9.0` if jsdom was upgraded).
- [ ] For react-router migration: run `npm run typecheck`, `npm run build`, `npm run test:ci`, and `npm run test:e2e` in each affected workspace.
- [ ] After react-router upgrade, grep for any remaining `from 'react-router-dom'` imports and fix them.
- [ ] Update `engines.node` to `>=22.22.0` in workspaces that adopt `react-router@8.3.0`.
