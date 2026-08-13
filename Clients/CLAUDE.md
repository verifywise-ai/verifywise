# Clients — Frontend Development Guide

> **Last Updated:** 2026-08-13

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
```

**Always run `npm run typecheck` and `npm run build` before opening a PR.** Both are required: `build` is `node scripts/build.js`, which strips types with esbuild and never invokes `tsc`, so **type errors survive a green build**. A build that succeeds is not evidence the code typechecks.

**Do not use `npm run test` here** — it is `vitest watch` and never exits. Use `npx vitest run`.

---

## References

Read the relevant file BEFORE implementing changes in that area:

| When working on...                  | Read this file                                |
| ----------------------------------- | --------------------------------------------- |
| Component/page/hook patterns        | `docs/technical/guides/frontend-patterns.md`  |
| Adding a new feature (full guide)   | `docs/technical/guides/adding-new-feature.md` |
| MUI theming & design tokens         | `docs/technical/guides/design-tokens.md`      |
| Frontend styling                    | `docs/technical/frontend/styling.md`          |
| Frontend components                 | `docs/technical/frontend/components.md`       |
| Redux, Axios, frontend architecture | `docs/technical/frontend/overview.md`         |
| TypeScript standards & naming       | `CodeRules/02-typescript/`                    |
| React component & hook conventions  | `CodeRules/03-react/`                         |

> All `docs/` paths are relative to the repository root.
