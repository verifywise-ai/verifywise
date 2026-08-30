# C4 handoff prompt

Paste the block below into a fresh agent session at the repo root.

---

Read these two files first, in order, and follow the plan task by task:

1. `docs/superpowers/specs/2026-08-30-risk-links-c4-value-chain-inheritance-design.md`
2. `docs/superpowers/plans/2026-08-30-risk-links-c4-value-chain-inheritance.md`

Branch: `feature/risk-inheritance`. Work on it directly. Do not push, do not open a PR, do not merge, do not rebase, do not reset.

**Tasks 1 through 6 are TDD and the red step is mandatory:** write the test, run it, *see it fail for the reason the plan predicts*, then implement, then see it pass, then commit. A test that has never been red proves nothing. If a test passes before you implement, stop — the test is wrong, not the plan. Task 7 is documentation and a full-branch verification; it has no red step.

One test in Task 1 is different and the plan flags it: the fourth describe block, `risk_links_single_parent_idx across entity types`, asserts that the *existing* index already rejects a second parent when that parent lives in another table. It fails red before the migration (the column does not exist) and must pass immediately after. **If it still fails after the migration, stop and report it.** That single assertion is the load-bearing claim behind the whole storage shape — it is why the plan leaves `source_risk_id`, its foreign key, its cascade, and C1's one-parent guarantee untouched. Do not rescue it by adding a new constraint.

## Ten traps

1. **`npm run test` does not run integration tests.** It is `test:unit` and excludes `tests/integration/`. Integration tests need `npm run test:integration` — they have their own config with a `globalSetup`. `npx jest riskLinks` fails four suites for this reason and it is not a bug in your code.
2. **Migrations qualify the schema (`verifywise.risk_links`); application and test SQL must not.** `search_path` is already `verifywise`. Getting this backwards fails in a way that looks like a missing table.
3. **`npm run build` in `Clients` does not run `tsc`.** Type errors pass a green build. Run `npm run typecheck` separately — it is not optional.
4. **`npm run test` in `Clients` is `vitest watch` and never exits.** Use `npx vitest run`.
5. **Direction is not symmetric.** On every `inherits_from` row, `source_risk_id` is the child and the target column is the parent. In C4 the child is always a project risk and the parent is always the foreign one. Never reversed.
6. **`model_risks.organization_id` is nullable.** Every new query still filters on it with equality, which makes a NULL row invisible. That is deliberate and fail-closed — do not "fix" it with an `OR organization_id IS NULL`.
7. **Two layers share one id collision, and fixing one is worse than fixing neither.** Task 2 fixes `validateTwoLevel`; Task 3 fixes the query that feeds it. `model_risks.id = 7` and `risks.id = 7` are unrelated rows. Do them both.
8. **`ON CONFLICT` against a partial index must repeat the index predicate.** Task 5 gives the exact clause. Omitting the `WHERE` produces a 500, not a duplicate-friendly no-op.
9. **Whether a type error fails a test depends on *where the test lives*, and this is the trap that broke three drafts of this plan.** There are five cases, not two, and "backend unit test" straddles the divide — `Servers/utils/__tests__` is typechecked while `Servers/controllers/__tests__` is not:

   | Test location | In the `tsc` program? | A type error there |
   |---|---|---|
   | `Servers/services/*/tests/*.spec.ts` | no — outside `include`, and ts-jest runs `diagnostics: false` | is invisible; several red steps depend on this |
   | `Servers/utils/__tests__/*.test.ts` | **yes** — `include` has `./utils/**/*.ts` | **fails `npm run build`**, so `globalSetup` aborts and no integration test runs at all |
   | `Servers/controllers/__tests__/*.test.ts` | no — `exclude` lists `controllers/__tests__` | is invisible to the build, but the test still fails at runtime under `npm run test:unit` |
   | `Servers/tests/integration/**/*.test.ts` | yes — `include` has `./tests/**/*.ts`, and `globalSetup.js` runs `npm run build` | **aborts the entire run before any test executes** |
   | `Clients/**` | no — esbuild strips types | is caught only by `npm run typecheck` |

   Verify rather than guess: `cd Servers && npx tsc --noEmit -p tsconfig.json --listFilesOnly` prints exactly what the compiler sees. This is why Tasks 3 and 4 widen their types in a Step 1a, ahead of the red — and why changing an exported signature needs `grep -rn "<name>" Servers --include="*.ts"` across tests as well as production code, not just whatever the build complains about.
10. **Unit tests are `.spec.ts`; integration tests are `.test.ts`.** Not a style preference — `test:integration` matches `**/tests/integration/**/*.test.ts`, so an integration test named `.spec.ts` is silently never run. Every file in `Servers/services/riskLinks/tests/` is `.spec.ts`. Do not create a sibling with the other extension.

There is also no `npm run migrate` script, and you do not need one: `npm run test:integration` runs `globalSetup`, which does `npm run build` and `npx sequelize db:migrate` with `NODE_ENV=test` on every run.

Each red step names the failure **per test**, not in bulk, because they genuinely differ within a single run. If what you see is not in the step's table, that is a signal — stop and report it rather than adjusting the test to match.

Two tasks have tests that are **green before you implement**: Task 2 (two of four) and Task 4 (two of four). Both are called out in their red tables. Those are the only exceptions to "if a test passes before you implement, stop" — they are guards whose subject does not exist yet. Anywhere else, a test that is green before implementation means the test is wrong.

**Where to be suspicious.** This plan has been through four audits. Every defect found was a claim about the *environment* — a script name, a file name, a harness shape, what typechecks when, how many call sites a function has — and none was a claim about the design. So: trust the design reasoning, and verify anything the plan asserts about the repo before you build on it. If a path or a command in the plan does not match what you see, you are right and the plan is wrong. Stop and report, exactly as you did the last two times; do not improvise a nearby file.

## Before you report back

```bash
cd Servers && npm run build && npm run test && npm run test:integration && npm run check:api-drift
```

```bash
cd Clients && npm run typecheck && npm run build && npx vitest run
```

API drift reporting **no drift** is expected: it compares path, method and `security.bearerAuth` only, so a request-body change never triggers it. `deadline-summary.test.ts` is date-dependent and already fails on `develop`; it lives in `tests/integration/`, so it shows up in the integration run only and never in `npm run test`. Whether it fails depends on the calendar — anything else that fails is yours.

Report: every commit hash, the actual output of each command above, any deviation from the plan and why, and confirmation that no `console.log` was added (`git diff develop...HEAD -- Servers Clients | grep -n "^+.*console\.log"` should print nothing).
