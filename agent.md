# VerifyWise — Dependency Security Patch Report

**Date:** 2026-08-03  
**Branch:** `mo-379-aug-3-security-and-quality` (pushed to origin)  
**Scope:** Security updates for React Router and `brace-expansion` transitive dependencies.

---

## 1. What We Did

### 1.1 React Router — `docs/api-docs` & `GRSModule/ui/frontend`

Both modules declared `react-router-dom@^7.0.0` and locked `react-router@7.0.0`, which was affected by multiple Dependabot alerts:

- DoS via inefficient route matching (#511, #499) — patched in 7.18.0
- Pre-render data spoofing (#505, #493) — patched in 7.5.2
- XSS via open redirects (#503, #491) — patched in 7.12.0
- SSR XSS in `ScrollRestoration` (#502, #490) — patched in 7.12.0
- vendored `turbo-stream` RCE (#507, #495) — patched in 7.14.2
- XSS in `meta()` / `<Meta>` (#500, #488) — patched in 7.9.0
- `__manifest` DoS (#508, #496) — patched in 7.15.0
- Single-fetch DoS via `react-router` (#509, #497) — patched in 7.14.0
- Single-fetch DoS via `turbo-stream` (#510, #498) — patched in 3.0.0

**Action:** bumped `react-router-dom` to `^7.18.0` in both `package.json` files and regenerated lockfiles. The resolved version is `7.18.2`, which covers every alert above.

**Commits:**
- `security(docs/api-docs): bump react-router-dom to ^7.18.0`
- `fix(docs/api-docs): resolve pre-existing TypeScript build errors`
- `security(grs-frontend): bump react-router-dom to ^7.18.0`
- `fix(grs-frontend): resolve lint errors surfaced by updated eslint-plugin-react-hooks`

### 1.2 `brace-expansion` — `Servers`

`Servers/package-lock.json` contained vulnerable `brace-expansion` versions (`5.0.7` and nested `1.1.16`) via `minimatch`, `jest`, `mjml`, `sequelize-cli`, `swagger-jsdoc`, and `@e2b/code-interpreter` (Dependabot alert #513).

**Action:** added npm overrides to `Servers/package.json`:

```json
"brace-expansion@1": "1.1.17",
"brace-expansion@5": "^5.0.8"
```

Regenerated `Servers/package-lock.json`. All `brace-expansion` instances now resolve to `1.1.17` or `5.0.9`.

**Commit:**
- `security(servers): patch brace-expansion DoS via overrides`

### 1.3 `Clients` — RSC-mode CSRF (#478)

`Clients` pins `react-router-dom@7.18.0`. Alert #478 affects React Router's unstable RSC/server-action code paths and is patched only in v8.3.0.

**Decision:** `Clients/src/main.tsx` uses `<BrowserRouter>` with declarative `<Routes>` — it does **not** use RSC, `RouterProvider`, or server actions. The vector is not reachable, so no upgrade was performed. React Router v8 migration is tracked as a separate future initiative.

---

## 2. Verification

| Module | Command | Result |
|--------|---------|--------|
| `docs/api-docs` | `npm run build` | ✅ |
| `GRSModule/ui/frontend` | `npm run build` | ✅ |
| `GRSModule/ui/frontend` | `npm run lint` | ✅ |
| `Servers` | `npm run build` | ✅ |
| `docs/api-docs` | `npm audit` (React Router) | Only unrelated RSC CSRF remains |
| `GRSModule/ui/frontend` | `npm audit` (React Router) | Only unrelated RSC CSRF remains |
| `Servers` | `npm audit` (`brace-expansion`) | No `brace-expansion` findings |

---

## 3. Pull Request

Compare URL for `develop ← mo-379-aug-3-security-and-quality`:

https://github.com/verifywise-ai/verifywise/compare/develop...mo-379-aug-3-security-and-quality

---

## 4. Outcome

- All listed React Router Dependabot alerts for `docs/api-docs` and `GRSModule/ui/frontend` are resolved.
- The `brace-expansion` DoS alert for `Servers` is resolved via targeted overrides.
- `Clients` RSC-mode risk is accepted/documented as non-exploitable in the current BrowserRouter deployment.
