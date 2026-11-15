# Clients — Frontend Development Guide

> **Last Updated:** 2026-11-14

---

## Clean Architecture

```
presentation/     → UI components, pages (what user sees)
application/      → Business logic, hooks, redux, contexts
domain/           → Types, interfaces, enums (core entities)
infrastructure/   → API clients, external services
```

---

## Layer Flow

1. **Component** (`src/presentation/components/{Name}/index.tsx`) — Hooks first, handlers, early returns, render
2. **Page** (`src/presentation/pages/{Name}/index.tsx`) — Uses hooks, loading/error states, PageTitle
3. **Repository** (`src/application/repository/{entity}.repository.ts`) — CustomAxios calls to API
4. **Hook** (`src/application/hooks/use{Entity}.ts`) — React Query `useQuery`/`useMutation`
5. **Route** (`src/application/config/routes.tsx`) — Add `<Route>` inside dashboard

---

## Key Files

| Purpose           | Path                                    |
| ----------------- | --------------------------------------- |
| Frontend entry    | `src/main.tsx`                          |
| Route definitions | `src/application/config/routes.tsx`     |
| Axios config      | `src/infrastructure/api/customAxios.ts` |
| Redux store       | `src/application/redux/store.ts`        |

**Extensions:** UI in `src/presentation/pages/Extensions/` (catalog, `Settings/`, one folder per extension key). Gate every entry point with `useExtensions().isEnabled("<key>")` (`src/application/contexts/Extensions.context.tsx`). Bundled frameworks (ids 5–25) render through `pages/Framework/Generic` + `components/Drawer/GenericFrameworkDrawer`. There is no per-framework UI. See `docs/technical/infrastructure/extensions.md` and `docs/technical/guides/adding-new-framework.md`.

**Sidebar navigation:** the phase 1 (default) look has one sidebar, `src/presentation/components/UnifiedSidebar/`, driven by `navConfig.ts`. A new page needs an entry in `navConfig.ts` (group, item or sub-item, route, gate, count), or an entry in `KEPT_ELSEWHERE` with the reason it stays out; `navConfig.test.ts` enforces one or the other. While the classic look exists (until January 2027), also add the page to the classic module sidebar, since classic keeps the app switcher, per-module sidebars and the footer Management popup.

**Permission gating:** decide what to show from permission keys, never from the role name (a custom role can never match one). Use `useCan("vendor.edit")` or `useCanCheck()` (`src/application/hooks/useCan.ts`) with the key the server route authorizes on; add a new UI key to `BUILTIN_UI_PERMISSIONS` (`src/application/constants/permissions.ts`) and to `Servers/config/rolePermissions.config.ts` together, since `permissions.test.ts` checks they match. See `docs/technical/architecture/authentication.md`.

---

## UI patterns

- **Table filters:** `components/Table/TableFilter.tsx`, not `FilterBy`, for every new table. It shows `FilterBy` in the classic look and filter chips in phase 1 from one `FilterColumn[]`. Group and Columns stay as they are.
- **Lifecycle stage:** `components/StageSteps`.
- **No hex colours in screens:** `noHexInScreens.test.ts` fails on a hex literal under `presentation/pages` or `presentation/components`. Use a token or a named map in `themes/chartTheme.ts` (`entity`, `action`, `providers`, `tiles`, `avatars` and others); never index `chart[n]`. A genuine exception goes in `themes/hexAllowList.ts`.
- Details: `docs/technical/guides/design-tokens.md`.

---

## Environment

```env
VITE_APP_API_URL=http://localhost:3000/api
VITE_APP_PORT=5173
VITE_IS_MULTI_TENANT=false
```

---

## Commands

```bash
npm install && npm run dev       # Start development
npm run typecheck                # tsc -b — the ONLY thing that typechecks
npm run build                    # Build → /dist (esbuild; does NOT typecheck)
npx vitest run                   # Vitest, single run
npm run lint                     # eslint . — 0 errors in src; warnings are backlog
```

`src/` lints with 0 errors (2026-10-13), and the pre-commit hook runs `eslint --fix` on staged files, so a new error blocks the commit. The React Compiler rules from `eslint-plugin-react-hooks` v7 (`set-state-in-effect`, `refs`, `immutability`, `static-components`, `preserve-manual-memoization`, `purity`) are set to `warn` in `eslint.config.js` because of their pre-existing backlog (~4.5k warnings in total); raise each back to `error` once its findings are fixed.

**TypeScript is installed twice.** `typescript` is an npm alias of `@typescript/typescript6` (the 6.0 API, which typescript-eslint needs: TS 7.0 ships no API), and `@typescript/native` is TypeScript 7, which provides `tsc`. `npm run typecheck` therefore checks with 7.0. Do not "fix" the alias back to `typescript@7` until typescript-eslint supports it, or eslint and the pre-commit hook crash again.

**Always run `npm run typecheck` and `npm run build` before opening a PR.** Both are required: `build` is `node scripts/build.js`, which strips types with esbuild and never invokes `tsc`, so **type errors survive a green build**. A build that succeeds is not evidence the code typechecks.

**Do not use `npm run test` here** — it is `vitest watch` and never exits. Use `npx vitest run`.

---

## References

Read the relevant file BEFORE implementing changes in that area:

| When working on...                    | Read this file                                     |
| ------------------------------------- | -------------------------------------------------- |
| Component/page/hook patterns          | `docs/technical/guides/frontend-patterns.md`       |
| Adding a new feature (full guide)     | `docs/technical/guides/adding-new-feature.md`      |
| Extensions (built-in integrations)    | `docs/technical/infrastructure/extensions.md`      |
| Adding a compliance framework         | `docs/technical/guides/adding-new-framework.md`    |
| MUI theming & design tokens           | `docs/technical/guides/design-tokens.md`           |
| Frontend styling                      | `docs/technical/frontend/styling.md`               |
| Frontend components                   | `docs/technical/frontend/components.md`            |
| Redux, Axios, frontend architecture   | `docs/technical/frontend/overview.md`              |
| Change notices (what's changed card)  | `docs/technical/frontend/change-notice.md`         |
| TypeScript standards & naming         | `CodeRules/02-typescript/`                         |
| React component & hook conventions    | `CodeRules/03-react/`                              |
| Cross-org isolation tests (MSW guard) | `docs/technical/security/tenant-isolation.md` §6.4 |

> All `docs/` paths are relative to the repository root.

---

## Home queue

A new "needs action" item for the Home page (`/home`, Today tab) belongs in `Servers/services/homeQueue/sources/`, not in a client-side fetch. See `docs/technical/domains/home-queue.md`.
