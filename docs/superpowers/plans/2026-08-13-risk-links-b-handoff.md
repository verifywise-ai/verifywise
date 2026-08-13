Implement Risk Links **B** — the linked-risks UI and the manual-link endpoint — in the VerifyWise repo at `/Users/ozger/Desktop/verifywise`, on the current branch `feature/risk-inheritance`.

Read these, in this order, before you write anything:

1. `docs/superpowers/plans/2026-08-13-risk-links-b.md` — the plan. Six tasks, every file path, every test, every command. Follow it literally.
2. `docs/superpowers/specs/2026-08-13-risk-links-b-design.md` — the design and its reasoning. The plan's `§x.y` references point here. Read it when a plan step's *why* is not obvious.
3. `CLAUDE.md`, `Servers/CLAUDE.md`, `Clients/CLAUDE.md` — house rules. B is the first phase that touches both sides.

A1 and A2a are already merged into this branch: the `risk_links` table, two providers, `recomputeRiskLinks`, the BullMQ job, and three endpoints (`GET /:riskId`, `PATCH /:id/status`, `POST /recompute`) all exist and pass. B adds one write endpoint and the entire frontend. Do not redesign any of it.

## What you are building

A "Linked risks" tab on the risk edit modal. It lists the engine's derived suggestions and any manual links, grouped by relation, and lets a user confirm, dismiss, or restore each one. Anyone can also link two risks by hand, which is the one new endpoint: `POST /api/riskLinks`.

Six tasks: the endpoint (store functions, controller, route, regenerated docs), an integration test that proves the tenant claim against a real database, the frontend types/repository/hooks, the panel, the create form, and finally the tab wiring — which also deletes `findRelatedRisks`, the 475-line client-side heuristic B replaces.

## Method

Work task by task, in order. **Each task is TDD and the red step is mandatory:** write the test, run it, *see it fail for the reason the plan predicts*, then implement, then see it pass, then commit. A test that has never been red proves nothing. If a test passes before you implement, stop — the test is wrong, not the plan.

Task 2 Step 3 is a falsifiability check on tests that will already be green: you delete one SQL clause at a time from the new store functions, restore the file after each, and confirm each deletion produces the specific, *different* failure the plan names. **If a mutation does not produce the expected red, stop and report it — do not proceed.** Task 1's controller tests `jest.mock` the whole utils module, so no mutated SQL ever runs there; Task 2 is the only thing standing behind the isolation claim, and without Step 3 it is decoration.

## Non-negotiables

- **`canonicalPair` applies only to `relation_type = 'related_to'`.** The `risk_links_canonical` CHECK constraint exempts `inherits_from` on purpose — direction is carried by which column an id sits in, so reordering an inheritance pair silently inverts it. This is the single most likely error in B. The plan spells out the exact ternary; use it.
- **Tenant isolation from `req.organizationId` only** — the JWT. Never from the request body, never from a query param.
- **Unqualified table names in all application and test SQL.** `search_path` is `verifywise`. Never `verifywise.risks`, never `public.risks`.
- **No migration, no model change, nothing under `Servers/services/riskLinks/`.** The engine is done.
- **`npm run check:api-drift` moves 705 → 706.** One new route is one new operation. Any other number means an unintended route change, not a broken generator.
- **Do not hand-edit `Servers/swagger.yaml` or `docs/api-docs/src/config/endpoints.ts`.** Regenerate with `npm run generate:swagger && npm run generate:endpoints`. CI regenerates and diffs them.
- **User-facing copy is exact.** The plan's Global Constraints list all eight strings; the tests assert on them verbatim. No rewording, no punctuation drift.
- **No `console.log`. No hardcoded colors** — theme references only.
- **No new dependency.** MUI 7, React Query, and Testing Library are all already here.
- **Out of scope, do not build:** embeddings (that is A2b), the linking agent (phase C), the `duplicates` relation type, bulk actions, a links view outside the risk modal, any change to the recompute lifecycle.

## Five traps the plan flags, worth repeating

1. **The controller test's `STATUS_CODE` mock has no `201` or `409`.** Task 1 Step 1 extends it. Skip that step and every new test throws `STATUS_CODE[201] is not a function`, which reads like a controller bug and is not one.
2. **`useIsAdmin` is a named export**, not a default: `import { useIsAdmin } from ".../hooks/useIsAdmin"`. Mock it as `{ useIsAdmin: () => mockIsAdmin() }`.
3. **`AutoCompleteField` renders its `label` as a detached `<Typography>`** and passes only `placeholder` into the `TextField`. The combobox therefore has no accessible name — `getByRole("combobox", { name: /…/ })` finds nothing. Query it with `getByPlaceholderText("Search risks")`, as the plan's tests do.
4. **Do not copy `policy.repository.ts`'s `error?.response?.status` idiom.** `handleError` in `networkServices.ts` puts the status on `.status` and the response *body* on `.response`, so that expression is always `undefined`. The panel has to tell 409 from 404, so the plan writes a small `toAPIError` helper reading `.status`/`.message`. Use it.
5. **`getAllProjectRisks` returns `response.data`, so the array is at `.data.data`.** One level deeper than it looks. The plan documents the unwrapping in both the form and its fixture.

## Task 6 specifically

The deletion pass in `Clients/src/presentation/pages/RiskManagement/index.tsx` has six regions and its line numbers are **pre-edit** — delete bottom-up, or re-locate each region by its text.

Two imports near the deleted ones **stay**: `getAllProjectRisks` at `:22` (used by `fetchProjectRisks` at `:474`) and `RiskModel` at `:29` (used at eight other lines). Deleting them by symmetry breaks the build.

## Boundaries

**Commit locally after each task, as the plan specifies. Do not push, do not open a pull request, do not merge, do not rebase or reset.** The branch stays local; the user handles what happens to it.

## Done when

- All six tasks committed.
- `cd Servers && npm run build && npm run test` — clean and green.
- `cd Servers && npm run check:api-drift` — `706/706`.
- `cd Clients && npm run build && npx vitest run` — clean and green, with four fewer test files than before.
- `git status --porcelain` — empty.
- Task 2 Step 3's mutations each produced the distinct failure the plan predicted, and you say so explicitly in your report.
- Task 2 needs a live PostgreSQL. If the database is unavailable, **say so** — do not quietly skip the task and call B done.

Report what you did per task, and anything in the plan that turned out to be wrong.
