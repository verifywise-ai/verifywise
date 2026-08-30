# C4 handoff prompt

Paste the block below into a fresh agent session at the repo root.

---

Read these two files first, in order, and follow the plan task by task:

1. `docs/superpowers/specs/2026-08-30-risk-links-c4-value-chain-inheritance-design.md`
2. `docs/superpowers/plans/2026-08-30-risk-links-c4-value-chain-inheritance.md`

Branch: `feature/risk-inheritance`. Work on it directly. Do not push, do not open a PR, do not merge, do not rebase, do not reset.

**Tasks 1 through 6 are TDD and the red step is mandatory:** write the test, run it, *see it fail for the reason the plan predicts*, then implement, then see it pass, then commit. A test that has never been red proves nothing. If a test passes before you implement, stop — the test is wrong, not the plan. Task 7 is documentation and a full-branch verification; it has no red step.

One test in Task 1 is different and the plan flags it: the fourth describe block, `risk_links_single_parent_idx across entity types`, asserts that the *existing* index already rejects a second parent when that parent lives in another table. It fails red before the migration (the column does not exist) and must pass immediately after. **If it still fails after the migration, stop and report it.** That single assertion is the load-bearing claim behind the whole storage shape — it is why the plan leaves `source_risk_id`, its foreign key, its cascade, and C1's one-parent guarantee untouched. Do not rescue it by adding a new constraint.

## Nine traps

1. **`npm run test` does not run integration tests.** It is `test:unit` and excludes `tests/integration/`. Integration tests need `npm run test:integration` — they have their own config with a `globalSetup`. `npx jest riskLinks` fails four suites for this reason and it is not a bug in your code.
2. **Migrations qualify the schema (`verifywise.risk_links`); application and test SQL must not.** `search_path` is already `verifywise`. Getting this backwards fails in a way that looks like a missing table.
3. **`npm run build` in `Clients` does not run `tsc`.** Type errors pass a green build. Run `npm run typecheck` separately — it is not optional.
4. **`npm run test` in `Clients` is `vitest watch` and never exits.** Use `npx vitest run`.
5. **Direction is not symmetric.** On every `inherits_from` row, `source_risk_id` is the child and the target column is the parent. In C4 the child is always a project risk and the parent is always the foreign one. Never reversed.
6. **`model_risks.organization_id` is nullable.** Every new query still filters on it with equality, which makes a NULL row invisible. That is deliberate and fail-closed — do not "fix" it with an `OR organization_id IS NULL`.
7. **Two layers share one id collision, and fixing one is worse than fixing neither.** Task 2 fixes `validateTwoLevel`; Task 3 fixes the query that feeds it. `model_risks.id = 7` and `risks.id = 7` are unrelated rows. Do them both.
8. **`ON CONFLICT` against a partial index must repeat the index predicate.** Task 5 gives the exact clause. Omitting the `WHERE` produces a 500, not a duplicate-friendly no-op.
9. **A type error never fails a test here.** `Servers` runs ts-jest with `diagnostics: false`; `Clients` runs vitest over esbuild. Both strip TypeScript without checking it, so a test can reference a property that does not exist and still run. Types are checked only by `cd Servers && npm run build` and `cd Clients && npm run typecheck`.

Each red step names the failure **per test**, not in bulk, because they genuinely differ within a single run. If what you see is not in the step's table, that is a signal — stop and report it rather than adjusting the test to match.

## Before you report back

```bash
cd Servers && npm run build && npm run test && npm run test:integration && npx tsx scripts/checkApiDrift.ts
```

```bash
cd Clients && npm run typecheck && npm run build && npx vitest run
```

API drift reporting **no drift** is expected: it compares path, method and `security.bearerAuth` only, so a request-body change never triggers it. `deadline-summary.test.ts` is date-dependent and already fails on `develop` — anything else that fails is yours.

Report: every commit hash, the actual output of each command above, any deviation from the plan and why, and confirmation that no `console.log` was added (`git diff develop...HEAD -- Servers Clients | grep -n "^+.*console\.log"` should print nothing).
