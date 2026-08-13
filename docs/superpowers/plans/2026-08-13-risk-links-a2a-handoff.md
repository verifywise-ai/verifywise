Implement Risk Links **A2a** — the structural-graph link provider — in the VerifyWise repo at `/Users/ozger/Desktop/verifywise`, on the current branch `feature/risk-inheritance`.

Read these three, in this order, before you write anything:

1. `docs/superpowers/plans/2026-08-13-risk-links-a2a.md` — the plan. Five tasks, every file path, every test, every command. Follow it literally.
2. `docs/superpowers/specs/2026-08-13-risk-links-a2a-design.md` — the design and its reasoning. The plan's `§x.y` references point here. Read it when a plan step's *why* is not obvious.
3. `CLAUDE.md` and `Servers/CLAUDE.md` — house rules.

A1 is already merged into this branch: the `risk_links` table, `fieldOverlapProvider` (tier 0), `recomputeRiskLinks`, the BullMQ job, and three endpoints all exist and pass. A2a adds the second provider. Do not redesign any of it.

## What you are building

A tier-1 provider that links two risks when they are attached to the same framework elements, weighted so rare elements count and ubiquitous ones do not: `min(4, Σ 2 / log2(1 + degree))`, where *degree* is how many of **this org's own live risks** touch that element.

Three pieces: one SQL function in `Servers/utils/riskLink.utils.ts`, one pure-arithmetic provider in `Servers/services/riskLinks/providers/structuralGraph.ts`, and registration in `recompute.ts` — where a throwing provider now aborts the run instead of letting the survivors prune real suggestions.

## Method

Work task by task, in order. **Each task is TDD and the red step is mandatory:** write the test, run it, *see it fail for the reason the plan predicts*, then implement, then see it pass, then commit. A test that has never been red proves nothing. If a test passes before you implement, stop — the test is wrong, not the plan.

Task 4 Step 3 is a falsifiability check on tests that will already be green: you apply three named mutations to the SQL, one at a time, restoring the file after each, and confirm each produces the specific failure the plan names. The three failures are all different from one another. **If a mutation does not produce the expected red, stop and report it — do not proceed.** That step is the point of Task 4; skipping it makes the isolation tests decoration.

## Non-negotiables

- **Unqualified table names in all application and test SQL.** `search_path` is `verifywise`. Never `verifywise.risks`, never `public.risks`.
- **Every query scoped by `organization_id`.** No exceptions.
- **Keep the `SELECT DISTINCT` in the `active` CTE.** It is redundant against today's schema and deliberately kept — the plan explains why. Do not remove it as dead weight.
- **Do not add a database index.** §9 of the spec considered it and decided against it for A2a. The eight join tables missing an `organization_id` index are missing it knowingly.
- **No migration, no route, no controller, no swagger change.** `npm run check:api-drift` must still report `705/705`.
- **No new dependency.** Stdlib arithmetic and the Sequelize already here.
- **Nothing under `Clients/`.** Backend only; the UI is phase B.
- **No `console.log`** — use `logger` from `utils/logger/fileLogger`.
- Do not touch `LINK_SCORE_THRESHOLD = 3` or `MAX_LINKS_PER_RISK = 20`.
- **Out of scope, do not build:** embeddings (that is A2b), the `duplicates` relation type, any endpoint or lifecycle change, any UI.

## One trap the plan flags, worth repeating

The moment you register the second provider, most of `recompute.spec.ts` goes red — `jest.mock` automocks `getStructuralNeighboursQuery` to return `undefined`, and every test that actually reaches the provider loop blows up on it. Task 3 Step 1(a) adds the one-line `beforeEach` stub that fixes it. Add it *before* you register the provider, or you will spend the task debugging nine unrelated failures.

## Boundaries

**Commit locally after each task, as the plan specifies. Do not push, do not open a pull request, do not merge, do not rebase or reset.** The branch stays local; the user handles what happens to it.

## Done when

- All five tasks committed.
- `cd Servers && npm run build` — clean.
- `npm test` — green, including the 14 tests in `recompute.spec.ts` and the 6 in the isolation suite.
- `npm run check:api-drift` — `705/705`.
- `git status --porcelain` — empty.
- `git diff develop --stat -- Clients/ Servers/routes/ Servers/swagger.yaml` — empty.
- Task 4 Step 3's three mutations each produced the failure the plan predicted, and you say so explicitly in your report.

Report what you did per task, and anything in the plan that turned out to be wrong.
