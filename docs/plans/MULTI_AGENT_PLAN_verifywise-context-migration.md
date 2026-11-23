# MULTI_AGENT_PLAN — Issue #4618 Item 1: Migrate `VerifyWiseContext` consumers to Redux + React Query

> Branch: `mo-nov-23-verifywise-context-migration`
> Issue: https://github.com/verifywise-ai/verifywise/issues/4618 (Item 1)
> Size: Large. Standing order from user: **small atomic commits + push after each** (overrides interactive STOP gates for this run).

## PRD (Phase 1, Product Manager)

- **Problem:** `VerifyWiseContext` (`Clients/src/application/contexts/VerifyWise.context.ts`, provided in `App.tsx`) duplicates state already owned by Redux Toolkit (`auth`, `ui` slices) and React Query (`useProjects`, `useUsers`, `useVendors`, `useDashboard`). ~23 consumer files → prop-drilling and double source of truth.
- **Scope:** Migrate every consumer to Redux/React Query; delete the context file and provider when the last consumer is gone. Pure state-ownership migration — **no unrelated logic rewrites**.
- **Out of scope:** behavior changes, API contract changes, other checklist items from #4618.
- **Acceptance criteria:** zero `VerifyWiseContext` references remain in `Clients/src` (except migration notes); full `Clients` test suite passes; lint/typecheck/build clean.

## Architecture Brief (Phase 3, Technical Lead + Senior Frontend Developer)

### Field-by-field target mapping

| Context field | Target | Notes |
|---|---|---|
| `token`, `userId`, `userRoleName`, `organizationId` | `useAuth()` (Redux auth slice, JWT-derived) | Drop-in; App.tsx already sources context from it. |
| `users`, `refreshUsers` | `useUsers()` (React Query) | Drop-in; identical API. |
| `projects` (reads) | `useProjects().data` | Query key `projectQueryKeys.list()`. |
| `setProjects` (writes: add/replace/remove/refetch) | New helper `useProjectsCache()` → `setProjectsCache(updater)` + `refreshProjects()` via `queryClient.setQueryData`/`invalidateQueries` | Preserves setState updater semantics. |
| `dashboardValues.projects` | `useProjects()` | GenerateReportFrom picker; GenerateReport diagnostics block removed. |
| `dashboardValues.vendors` | `useVendors()` | Table/index.tsx writer replaced by hook. |
| `dashboardValues.users` | `useUsers()` | Was always `[]` (never written) — lookup becomes functional; fallback to raw `risk_owner` preserved. |
| `dashboardValues.dashboard/compliance/assessments/selectedProjectId` | **Delete** | Never read anywhere. |
| `inputValues` / `setInputValues` | Redux `ui` slice: `inputValues` + `setInputValues` action | Edit-row shuttle: 3 table writers → `useRiskForm` reader. |
| `componentsVisible` / `changeComponentVisibility` | Redux `ui` slice: `componentsVisible` + `setComponentVisibility` | Tour-trigger flags (home/sidebar/projectFrameworks/compliance). |
| `photoRefreshFlag` / `setPhotoRefreshFlag` | Redux `ui` slice: `photoRefreshCounter` + `bumpPhotoRefresh()` | Readers use counter as effect dep; writers dispatch bump. |
| `currentProjectId` / `setCurrentProjectId` | **Delete** | Setter never called (always `""`); GovernanceOS Hub read adjusted to preserve behavior. |
| `uiValues`, `authValues` (+ setters) | **Delete** | Zero consumers. |

### Risk register
- **Framework/index.tsx** passes `setProjects` as a prop to `FrameworkSettings` → prop signature changes to the cache-action helper. Highest-risk file.
- **Dashboard container** is the only place that eagerly fetched all projects on route change; post-migration, consumers self-fetch via React Query (5-min staleTime). Cache-update approach keeps timing identical.
- Test files mock/wrap `VerifyWiseContext` — updated in the same commit as their component.

## Task Board (Phase 5)

| ID | Task | Owner agent | Files | Status |
|----|------|-------------|-------|--------|
| C-00 | Branch + this plan | Orchestrator | `docs/plans/MULTI_AGENT_PLAN_verifywise-context-migration.md` | 🟡 |
| C-01 | ui slice: `componentsVisible` + `setComponentVisibility` | Senior Frontend Dev | `redux/ui/uiSlice.ts` | ⬜ |
| C-02 | ui slice: `inputValues` + `setInputValues` | Senior Frontend Dev | `redux/ui/uiSlice.ts` | ⬜ |
| C-03 | ui slice: `photoRefreshCounter` + `bumpPhotoRefresh` | Senior Frontend Dev | `redux/ui/uiSlice.ts` | ⬜ |
| C-04 | `useProjectsCache()` helper hook | Senior Frontend Dev | `application/hooks/useProjectsCache.ts` | ⬜ |
| C-05 | Migrate Sidebar/index.tsx | Mid Frontend Dev | `components/Sidebar/index.tsx` | ⬜ |
| C-06 | Migrate SidebarShell (remove vestigial useContext) | Mid Frontend Dev | `components/Sidebar/SidebarShell.tsx` | ⬜ |
| C-07 | Migrate Tasks page (useAuth) | Mid Frontend Dev | `pages/Tasks/index.tsx` + test | ⬜ |
| C-08 | Migrate GovernanceOS UnifiedInsights (useAuth+useProjects) | Mid Frontend Dev | `pages/GovernanceOS/UnifiedInsights.tsx` + tests | ⬜ |
| C-09 | Migrate GovernanceOS Hub (useProjects; drop currentProjectId) | Mid Frontend Dev | `pages/GovernanceOS/Hub/index.tsx` + test | ⬜ |
| C-10 | Migrate SidebarFooter (useUsers/useAuth + photoRefreshCounter) | Mid Frontend Dev | `components/Sidebar/SidebarFooter.tsx` | ⬜ |
| C-11 | Migrate AdvisorChat CustomMessage | Mid Frontend Dev | `components/AdvisorChat/CustomMessage.tsx` | ⬜ |
| C-12 | Migrate SettingsPage Profile | Mid Frontend Dev | `pages/SettingsPage/Profile/index.tsx` | ⬜ |
| C-13 | Migrate Home page | Mid Frontend Dev | `pages/Home/1.0Home/index.tsx` | ⬜ |
| C-14 | Migrate ComplianceTracker | Mid Frontend Dev | `pages/ComplianceTracker/1.0ComplianceTracker/index.tsx` | ⬜ |
| C-15 | Migrate ProjectFrameworks | Mid Frontend Dev | `pages/ProjectView/ProjectFrameworks/index.tsx` | ⬜ |
| C-16 | Migrate VWProjectRisksTableBody (setInputValues→Redux) | Mid Frontend Dev | `components/Table/VWProjectRisksTable/VWProjectRisksTableBody.tsx` + test | ⬜ |
| C-17 | Migrate PolicyTable (setInputValues→Redux) | Mid Frontend Dev | `components/Table/PolicyTable/index.tsx` | ⬜ |
| C-18 | Migrate Table/index.tsx (vendors/users/inputValues) | Senior Frontend Dev | `components/Table/index.tsx` | ⬜ |
| C-19 | Migrate useRiskForm (inputValues from Redux) | Senior Frontend Dev | `components/AddNewRiskForm/hooks/useRiskForm.ts` + tests | ⬜ |
| C-20 | Migrate ProjectForm (setProjects→cache) | Senior Frontend Dev | `components/Forms/ProjectForm/index.tsx` + tests | ⬜ |
| C-21 | Migrate ProjectTableView (setProjects→cache) | Mid Frontend Dev | `components/ProjectsList/ProjectTableView.tsx` | ⬜ |
| C-22 | Migrate ProjectSettings (setProjects→cache) | Mid Frontend Dev | `pages/ProjectView/ProjectSettings/index.tsx` | ⬜ |
| C-23 | Migrate Framework page (projects, cache, visibility, FrameworkSettings prop) | Senior Frontend Dev | `pages/Framework/index.tsx` + test | ⬜ |
| C-24 | Migrate GenerateReport (drop diagnostic context read) | Mid Frontend Dev | `components/Reporting/GenerateReport/index.tsx` | ⬜ |
| C-25 | Migrate GenerateReportFrom (dashboardValues.projects→useProjects) | Senior Frontend Dev | `components/Reporting/GenerateReport/GenerateReportFrom/index.tsx` + test | ⬜ |
| C-26 | Migrate Dashboard container (remove context writers) | Senior Frontend Dev | `containers/Dashboard/index.tsx` + test | ⬜ |
| C-27 | Remove provider from App.tsx; delete context file | Technical Lead | `App.tsx`, `application/contexts/VerifyWise.context.ts` | ⬜ |
| C-28 | Full QA: test suite, lint, typecheck, build | QA Engineer | — | ⬜ |
| C-29 | PR to develop + CI green | Release Manager | — | ⬜ |

## Git Convention
- Branch: `mo-nov-23-verifywise-context-migration`
- Commit: `refactor(clients): migrate <file/area> off VerifyWiseContext (<scope>)`
- Push after every commit.

## Notes / Decisions
- `appStates.ts` interfaces stay (used by the new ui-slice `inputValues` typing).
- `dashboardValues.users` read in `Table/index.tsx` was dead (always `[]`); sourcing from `useUsers()` makes the risk-owner name lookup functional — flagged here as an intentional, minimal correction within migration scope.
- `currentProjectId` was always `""` (setter never called); Hub usage adjusted to preserve rendered behavior exactly.
