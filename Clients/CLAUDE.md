# Clients — Frontend Development Guide

> **Last Updated:** 2026-09-26

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
npm run build                    # Build → /dist
npm run test                     # Vitest
```

**Always run `npm run build` and verify it succeeds before opening a PR.** Build failures are the most common reason PRs fail CI.

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
| TypeScript standards & naming         | `CodeRules/02-typescript/`                         |
| React component & hook conventions    | `CodeRules/03-react/`                              |
| Cross-org isolation tests (MSW guard) | `docs/technical/security/tenant-isolation.md` §6.4 |

> All `docs/` paths are relative to the repository root.
