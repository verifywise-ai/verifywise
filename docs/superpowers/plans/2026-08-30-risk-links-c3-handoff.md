# C3 handoff prompt

Implement `docs/superpowers/plans/2026-08-30-risk-links-c3-dismissal-reason.md`
in the VerifyWise repo, on the branch that is already checked out
(`feature/risk-inheritance`). Read
`docs/superpowers/specs/2026-08-30-risk-links-c3-dismissal-reason-design.md`
first — the plan argues from it, and §3.1 and §3.5 are the two decisions the
whole feature turns on.

Work task by task, in order. **Each task is TDD and the red step is
mandatory:** write the test, run it, *see it fail for the reason the plan
predicts*, then implement, then see it pass, then commit. A test that has
never been red proves nothing. If a test passes before you implement, stop —
the test is wrong, not the plan.

Seven tasks, seven commits.

## What this builds

Dismissing a risk-link suggestion records who and when, never why. C3 adds an
optional structured reason at the moment of dismissal — seven slugs, filtered
by relation type — plus a note for `other`, and one SQL query that reads them
back.

## Non-negotiables

- **Only `suggested -> dismissed` carries a reason.** `confirmed -> dismissed`
  is a human un-linking a pair they previously accepted: a content edit, not
  feedback about the engine. Letting it write to the same column would skew
  every per-signal rate in `risk-link-precision.sql`, and the table stores no
  transition history to separate them afterwards. Spec §3.1. This is the
  single most likely thing to be "improved" by mistake. Do not.
- **The reason stays optional.** No "please choose" validation anywhere. A
  required reason gets the first radio clicked, and bad data is
  indistinguishable from good data in a `GROUP BY`.
- **Leaving `dismissed` clears both columns.** Task 4 is the proof and it is
  not skippable. The rule is structural, not a branch: the validator returns
  `null`/`null` for every transition that cannot legally carry a reason, and
  the UPDATE always writes both columns.
- **The seven slugs are new to this repo** — `not_related`, `too_weak`,
  `duplicate`, `wrong_direction`, `wrong_parent`, `not_hierarchical`, `other`.
  Nothing existing validates them and nothing will catch a typo but you. Copy
  them from the plan; do not retype from memory.
- **UI labels are verbatim from spec §4.** Do not paraphrase or "improve" them.
- **Tenant isolation from `req.organizationId` only** — the JWT. Never from the
  body, never from a query param.
- **Unqualified table names in application and test SQL.** `search_path` is
  `verifywise`. The migration is the exception: migrations qualify, matching
  `20260828090000-risk-links-single-parent.js`.
- **No `console.log`.** `logProcessing`/`logSuccess`/`logFailure` in
  controllers.
- **Commit format:** `type(scope): description`.

## Eight traps the plan flags, worth repeating

1. **Two test fixtures must gain the new fields or nothing typechecks.** The
   `suggested` object in `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`
   (~line 116) and the `link()` factory in
   `Clients/.../LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx` (~line 35)
   both feed `mockResolvedValue`/`RiskLink`, so widening the types breaks them.
   The plan adds `dismiss_reason: null, dismiss_note: null` and
   `dismissReason: null, dismissNote: null` respectively.
2. **Three existing assertions gain `, null, null`.** They name
   `updateRiskLinkStatusQuery`'s arguments and the function grows from four
   parameters to six. Miss one and the failure reads like a controller bug and
   is not one.
3. **Do not run `generate:swagger`.** `Servers/scripts/checkApiDrift.ts`
   compares path, method, and `security.bearerAuth` only. This plan adds no
   route, so a request-body change triggers no drift and a regenerated swagger
   commit is pure noise.
4. **`npm run test` on the backend EXCLUDES `tests/integration/`.** Task 4 only
   runs under `npm run test:integration`.
5. **On the frontend, `npm run build` does not run `tsc`** — `npm run
   typecheck` is the real gate — and `npm run test` is `vitest watch` and never
   exits. Use `npx vitest run`.
6. **The row's `key` moves from the `Stack` to the wrapping `Box`** in Task 6,
   because the row now has a form beneath it. And the row's action buttons are
   hidden while that form is open: two live buttons labelled `Dismiss` for one
   link is ambiguous on screen, and `getByRole("button", { name: "Dismiss" })`
   matches both and throws.
7. **Two different databases.** `npm run migrate-db` in Task 2 targets your
   development database. Task 4 needs no manual migration —
   `Servers/tests/integration/globalSetup.js` migrates the test database itself.
   If Task 4 fails on `column "dismiss_reason" does not exist`, that is not its
   red step; the migration file did not reach the test database.
8. **Query 6 must be run against the fixture, not just parsed.** On an empty
   instance a wrong `PARTITION BY` returns zero rows exactly like a right one.
   Task 7 Step 5 gives a `TEMP`-table fixture and the exact expected output —
   percentages summing to 100 within each relation type. Do not skip it.

## Boundaries

**Commit locally after each task, as the plan specifies. Do not push, do not
open a pull request, do not merge, do not rebase or reset.** The branch stays
local; the user decides what happens to it.

## Done when

- Seven tasks committed, one commit each.
- `cd Servers && npm run build` — clean.
- `cd Servers && npm run test` — green.
- `cd Servers && npm run test:integration` — green.
- `cd Clients && npm run typecheck` — clean.
- `cd Clients && npx vitest run` — green.
- `cd Servers && npm run check:api-drift` — unchanged from before the branch.
- `psql -d verifywise -f docs/technical/domains/risk-link-precision.sql` runs
  six result sets with no errors.
- Query 6 reproduces Task 7 Step 5's expected output against the fixture.

Report what you did per task, and anything in the plan that turned out to be
wrong.
