# VerifyWise — Dependency Security Patch Report

**Date:** 2026-08-03  
**Branch:** `mo-380-aug-3-dependency-security-patch` (pushed to origin)  
**Scope:** Security updates for React Router, `brace-expansion`, `sharp`, `sanitize-html`, and `dompurify` transitive dependencies.

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

### 1.3 `sharp` — root `package-lock.json`

Root devDependency `webreel@^0.1.4` transitively depended on `sharp@0.34.5`, which bundles vulnerable `libvips` versions (Dependabot alert #474).

**Action:** added an npm override in root `package.json`:

```json
"overrides": {
  "sharp": ">=0.35.0"
}
```

Regenerated root `package-lock.json`. `sharp` now resolves to `0.35.3`.

**Commit:**
- `security(root): override transitive sharp to >=0.35.0`

### 1.4 `sanitize-html` — `Servers`

`Servers` directly depended on `sanitize-html@^2.17.4`, which has incomplete URI scheme validation for attributes like `action`, `formaction`, `data`, `poster`, and `background` (Dependabot alert #512).

**Action:** bumped `sanitize-html` to `^2.17.5` in `Servers/package.json` and regenerated `Servers/package-lock.json`. Resolved version is `2.17.6`.

**Commit:**
- `security(servers): bump sanitize-html to ^2.17.5`

### 1.5 `dompurify` — `GRSModule/ui/frontend`

`GRSModule/ui/frontend` did not directly depend on `dompurify`; it was pulled in by `monaco-editor` (via `@monaco-editor/react`) at `dompurify@3.2.7`. The affected range is `<=3.4.11` (Dependabot alert #466).

**Action:** added an npm override in `GRSModule/ui/frontend/package.json`:

```json
"overrides": {
  "dompurify": ">=3.4.12"
}
```

Regenerated the lockfile. `dompurify` now resolves to `3.4.12`.

**Commit:**
- `security(grs-frontend): override dompurify to >=3.4.12`

### 1.6 React Router RSC-mode CSRF — `docs/api-docs`, `GRSModule/ui/frontend`, `Clients`

New Dependabot alerts #515, #514, and #478 are additional instances of the same RSC-mode CSRF advisory (`GHSA-qwww-vcr4-c8h2`). The patched version is 8.3.0.

**Decision:** all three modules use React Router in **Declarative/Data mode** (`BrowserRouter` / `<Routes>`). They do **not** use unstable RSC/server-action APIs, so the vector is not reachable. No upgrade to React Router v8 was performed; migration is tracked separately.

The GitHub Dependency Review action (`actions/dependency-review-action@v5`) already allowlists `GHSA-qwww-vcr4-c8h2` in both `.github/workflows/backend-checks.yml` and `.github/workflows/frontend-checks.yml` alongside the `brace-expansion` exception (`GHSA-mh99-v99m-4gvg`).

**Commit:**
- `ci: allow GHSA-qwww-vcr4-c8h2 in dependency-review`

---

## 2. Verification

| Module | Command | Result |
|--------|---------|--------|
| `docs/api-docs` | `npm run build` | ✅ |
| `GRSModule/ui/frontend` | `npm run build` | ✅ |
| `GRSModule/ui/frontend` | `npm run lint` | ✅ |
| `Servers` | `npm run build` | ✅ |
| Root | `npm ls sharp` | `0.35.3` ✅ |
| `Servers` | `npm ls sanitize-html` | `2.17.6` ✅ |
| `GRSModule/ui/frontend` | `npm ls dompurify` | `3.4.12` ✅ |
| `docs/api-docs` | `npm audit` (React Router) | Only non-exploitable RSC CSRF remains |
| `GRSModule/ui/frontend` | `npm audit` (React Router) | Only non-exploitable RSC CSRF remains |
| `Servers` | `npm audit` (`brace-expansion`, `sanitize-html`) | No findings for either |

---

## 3. Pull Request

Compare URL for `develop ← mo-380-aug-3-dependency-security-patch`:

https://github.com/verifywise-ai/verifywise/compare/develop...mo-380-aug-3-dependency-security-patch

---

## 4. Outcome

- All listed React Router Dependabot alerts for `docs/api-docs` and `GRSModule/ui/frontend` are resolved.
- The `brace-expansion`, `sanitize-html`, `sharp`, and `dompurify` alerts are resolved via targeted version bumps and overrides.
- Residual React Router RSC-mode CSRF alerts (#515, #514, #478) are accepted/documented as non-exploitable in the current BrowserRouter/Data-mode deployments and allowlisted in CI.
