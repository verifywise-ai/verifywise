# C5 handoff prompt

Paste the block below into a fresh agent session at the repo root.

---

Read these two files first, in order, and follow the plan task by task:

1. `docs/superpowers/specs/2026-08-31-risk-links-c5-cross-entity-candidates-design.md`
2. `docs/superpowers/plans/2026-08-31-risk-links-c5-cross-entity-candidate-ranking.md`

Branch: `feature/risk-inheritance`. Work on it directly. Do not push, do not open a PR, do not merge, do not rebase, do not reset.

**Tasks 1 through 3 are TDD and the red step is mandatory:** write the test, run it, *see it fail for the reason the plan predicts*, then implement, then see it pass, then commit. A test that has never been red proves nothing. If a test passes before you implement, stop — the test is wrong, not the plan. Task 4 is a full-branch verification sweep; it has no red step.

**What C5 is, and what it is not.** It adds one read-only endpoint and reorders a list the user is already looking at. It writes nothing, suggests nothing, and filters nothing out. There is **no migration** in this feature and no new table, column, or index. If you find yourself writing a migration, inserting a `risk_links` row, or hiding a candidate from the picker, you have left the plan — stop and report.

The design rests on a schema fact you should not re-litigate: `vendorrisks` and `model_risks` share **no** comparable scoring column with `risks`. `vendorrisks` has none of C3's four signals at all, and `model_risks.risk_category` uses a completely disjoint enum (`enum_model_risks_risk_category`, five values, scalar) from the project-risk one (`enum_projectrisks_risk_category`, fifteen values, and an *array* column). Zero shared labels. Shared project is therefore the only honest cross-entity signal, and there is no second signal to weight it against — which is why the endpoint returns a fact, not a score.

## Ten traps

1. **`npm run test` does not run integration tests, and it swallows your flags.** It is literally `npm run test:unit`, which excludes `tests/integration/`. Worse: `npm run test -- --testPathPatterns=riskLink` hands the flag to *npm*, not Jest — all 243 suites run and it still **exits 0**, which looks like a pass. Use `npm run test:unit -- --testPathPatterns=...` for a filtered unit run and `npm run test:integration` for the integration suites.
2. **Six nullable columns and every one of them fails closed. Leave them alone.** `model_risks.model_id`, `model_risks.organization_id`, `model_risks.is_deleted`, `vendorrisks.vendor_id`, and the `organization_id` on all three junction tables (`projects_risks`, `vendors_projects`, `model_inventories_projects_frameworks`) are nullable. Every filter in the plan compares them with `=`, so a NULL row is invisible. That is deliberate, it matches the codebase (the identical join lives at `Servers/utils/postMarketMonitoring.utils.ts:849`), and it is the safe direction for a tenant filter. Do **not** "fix" it with `OR ... IS NULL`.
3. **The `JOIN risks subject` inside the CTE is the tenant anchor — do not simplify it away.** It looks redundant next to `pr.organization_id = :organizationId`, but `projects_risks.organization_id` is nullable while `risks.organization_id` is `NOT NULL`. Gating only on the junction row lets a legacy NULL row escape the check. `getRiskLinksForRiskQuery` (`Servers/utils/riskLink.utils.ts:667`) does the same thing for the same reason.
4. **`DISTINCT` is load-bearing on the model branch and only there.** `model_inventories_projects_frameworks` is `UNIQUE (model_inventory_id, project_id, framework_id)`, so one model in one project under three frameworks is three rows, and without `DISTINCT` the project title appears three times in the response. `vendors_projects` has no third dimension, so its `DISTINCT` is symmetry, not necessity. Keep both.
5. **The result array is model-first, even though the vendor branch is written first.** `ORDER BY entity_type` sorts `'model_risk'` before `'vendor_risk'` alphabetically, and the grouping map preserves row order. If you write a mixed-type assertion, order it accordingly — and on the client, join by `id`, never by array position.
6. **The endpoint and the picker filter independently, so their lists can differ in both directions.** The endpoint filters `is_deleted = false`; the picker fetches through `getAllVendorRisks({filter:"active"})` and `/modelRisks`. Never assume equal lengths and never index one list by the other's position. Build the `Map` keyed on `entityType:id` exactly as the plan writes it.
7. **`entityType` is not enough on its own — id spaces collide.** `model_risks.id = 10` and `risks.id = 10` are unrelated rows. The frontend memo filters the response by `candidate.entityType === source` *before* building the id map. Dropping that filter makes a model risk badge a project risk, and one of the four component tests exists solely to catch it.
8. **Whether a type error fails a test depends on *where the test lives*.** Four cases:

   | Test location | In the `tsc` program? | A type error there |
   |---|---|---|
   | `Servers/services/*/tests/*.spec.ts` | no — outside `include`, ts-jest runs `diagnostics: false` | is invisible |
   | `Servers/utils/__tests__/*.test.ts` | **yes** — `include` has `./utils/**/*.ts` | **fails `npm run build`** |
   | `Servers/tests/integration/**/*.test.ts` | **yes**, and `globalSetup.js` runs `npm run build` first | **aborts the whole run before any test executes** |
   | `Clients/**` | no — `npm run build` is esbuild and strips types | is caught only by `npm run typecheck` |

   Both files C5 touches on the backend are in the *first two* rows of the "yes" column, so a stray type error there costs you the entire integration run. Verify rather than guess: `cd Servers && npx tsc --noEmit -p tsconfig.json --listFilesOnly`.
9. **`noUnusedLocals` and `noUnusedParameters` are `true` in both `Servers/tsconfig.json` and `Clients/tsconfig.app.json`.** An import added one task ahead of its first use is a build **error**, not a warning. This is why `supertest` first appears in Task 2 and not in Task 1 — do not hoist imports "to save a step".
10. **`Servers/tests/factories/index.ts` re-exports by explicit name, not `export *`.** Task 1 adds `linkModelToProject` to `test-entities.factory.ts`; if you forget the matching line in `index.ts`, every `import { linkModelToProject } from "../factories"` fails to resolve and the red step lies to you. Everything else the tests need already exists there: `createTestProject`, `createTestRisk`, `createTestVendor`, `createTestVendorRisk`, `createTestModelRisk`, `linkRiskToProject`, `linkVendorToProject`.

Three more, shorter:

- **`vi.clearAllMocks()` clears recorded calls but leaves implementations in place.** A `mockReturnValue` from one test therefore leaks into every test after it and silently reorders unrelated pickers. The plan puts `mockUseSharedProjects.mockReturnValue({ data: [] })` in the global `beforeEach` for exactly this reason — keep it.
- **Two frontend test files mock the hooks module, and both must be repaired.** `LinkRiskForm.test.tsx` and `LinkedRisksPanel.test.tsx` each mock the module with an explicit factory, so adding a new export to it breaks the second file even though that suite has nothing to do with this feature.
- **`check:api-drift` compares path, method and `security.bearerAuth`.** It reads 707 = 707 today; after Task 2 it must read **708 = 708**. Express `/:riskId` normalizes to `/{riskId}` in the comparison, so the swagger path must be written with braces.

Unit tests are `.spec.ts`; integration tests are `.test.ts`. That is not style — `test:integration` matches `**/tests/integration/**/*.test.ts`, so an integration test named `.spec.ts` is silently never run.

**Where to be suspicious.** The design reasoning has been checked against the live database — every schema claim above came from `information_schema` / `pg_constraint`, and the plan's SQL was executed against the real DB to prove it parses. What is most likely to be wrong is something about the *repo*: a line number, a file name, a call-site count. If a path or a command in the plan does not match what you see, you are right and the plan is wrong. Stop and report; do not improvise a nearby file.

## Before you report back

```bash
cd Servers && npm run build && npm run test && npm run test:integration && npm run check:api-drift
```

```bash
cd Clients && npm run typecheck && npm run build && npx vitest run
```

`npm run check:api-drift` must print **708 endpoints, 708 operations, no drift**. `deadline-summary.test.ts` is date-dependent and already fails on `develop`; it lives in `tests/integration/`, so it appears in the integration run only. Whether it fails depends on the calendar — anything else that fails is yours.

Report: every commit hash, the actual output of each command above, any deviation from the plan and why, and confirmation that no `console.log` was added (`git diff develop...HEAD -- Servers Clients | grep -n "^+.*console\.log"` should print nothing).
