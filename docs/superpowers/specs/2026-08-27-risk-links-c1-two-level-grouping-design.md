# Risk links C1 — two-level risk grouping

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-08-27
> **Scope:** Constrain `inherits_from` to a strict two-level parent/child grouping. Backend constraint plus the existing risk modal panel.
> **Builds on:** `2026-08-12-risk-links-a1-design.md` (link store), `2026-08-13-risk-links-b-design.md` (linked risks UI)

---

## 1. Summary

`inherits_from` currently accepts any directed graph. Nothing stops a
grandchild (`A→B`, `B→C`), a second parent (`A→B`, `A→C`), or a cycle longer
than two hops. Only the direct reciprocal pair `A→B` + `B→A` is refused.

C1 replaces that open graph with a **two-level grouping**:

> A risk is either a parent, or a child, or unattached — never both.
> A child has exactly one parent.

`related_to` is untouched: it stays a flat, undirected, many-to-many relation
alongside the grouping.

This is the shape ServiceNow ("Parent Risk Statement" / "Child Risk
Statements") and RSA Archer (two-level roll-up) both use. It is also the
precondition for C2: an agent that proposes a parent needs a model where
"parent" has one unambiguous meaning.

---

## 2. Where this sits

Phase C decomposes into four subsystems, built in this order:

| | Subsystem | Depends on |
|---|---|---|
| **C1 (this spec)** | Two-level grouping constraint | — |
| **C2** | Direction-inference agent | C1 |
| **C3** | Dismissal feedback report | — |
| **C4** | Value-chain inheritance (vendor → model → project risk) | its own data model |

### Out of scope for C1 (explicit — do NOT build)

- Any agent, LLM call, or automatic parent proposal. That is C2.
- Any change to the recompute engine, the providers, or `related_to` scoring.
  The engine only ever emits `related_to`, so it never meets this rule.
- Cross-entity inheritance. `model_risks` and `vendorrisks` are separate
  tables; `risk_links` foreign-keys to `risks(id)` only. That is C4.
- A grouped view in the Risk Management table, or a standalone "risk groups"
  page. The grouping is visible in the risk modal panel only.
- Creating an umbrella/theme risk to serve as a parent. A parent is an
  ordinary existing risk.
- Auto-dismissing a `related_to` row when the same pair becomes parent/child.
  See §8.
- Moving inheritance out of `risk_links` into a `risks.parent_risk_id`
  column. See §3.

---

## 3. Decisions and rationale

| Decision | Choice | Why |
|---|---|---|
| Where inheritance lives | Stays in `risk_links` | A column has no `suggested` state. C2's entire output is *proposals* a human confirms; a plain FK cannot hold one, nor the `score`/`reasons` that justify it. |
| What the rule applies to | `confirmed` rows only | Suggestions must be allowed to conflict. If two proposed parents for one risk were rejected at insert, C2's agent could never offer a choice. |
| Single-parent enforcement | Partial unique index | Cross-row, but expressible as a unique key — so the database can guarantee it atomically for free. |
| Two-level enforcement | Application-level check | Not expressible as a `CHECK` or unique index; a trigger is more machinery than the residual race justifies. See §5. |
| Old reciprocal-cycle check | Controller call deleted | Subsumed. If no risk is both parent and child, no cycle of any length can exist. |
| Existing violating dev rows | Demoted to `dismissed` by the migration | `risk_links` has never shipped, but the migration has run in local dev databases. A hard index failure there breaks a teammate's `migrate` for no gain. |
| Client-side candidate filtering | Best-effort, server 409 explains | Matches the rule already documented in `LinkRiskForm.tsx`: a partner the client cannot evaluate stays selectable rather than vanishing unexplained. |

---

## 4. The rule

Let an inheritance edge be `(child, parent)` — in storage, `source_risk_id`
is the child and `target_risk_id` is the parent. The `risk_links_canonical`
CHECK already exempts `inherits_from` from id reordering, so this direction
survives as written.

Over the set of **confirmed** `inherits_from` rows in an organization, a
proposed edge `(c, p)` is rejected when any of these holds:

| # | Condition | Violation |
|---|---|---|
| 1 | An edge `(c, _)` already exists | `child_already_has_parent` |
| 2 | An edge `(p, _)` already exists | `parent_is_a_child` |
| 3 | An edge `(_, c)` already exists | `child_has_children` |

Checks run in that order and the first match is returned, so the message is
deterministic.

Rules 2 and 3 together are the two-level guarantee: no risk appears in both
columns, so every edge runs from a leaf to a root and no path of length two
exists. Cycles of every length are impossible as a consequence — including
the reciprocal `A→B` + `B→A` that the current code checks for separately.

`source_risk_id <> target_risk_id` is already enforced by the
`risk_links_no_self` CHECK and is not re-checked here.

Dismissed rows are invisible to the rule. Restoring a dismissed
`inherits_from` link is a transition to `confirmed`, so it runs the same
check and can be refused.

---

## 5. Enforcement

### 5.1 Single parent — partial unique index

New migration (not an edit to `20260812185522-create-risk-links.js`; that one
has already run in dev databases):

```sql
CREATE UNIQUE INDEX risk_links_single_parent_idx
  ON verifywise.risk_links (source_risk_id)
  WHERE relation_type = 'inherits_from' AND status = 'confirmed';
```

Not scoped by `organization_id`: a risk id belongs to exactly one
organization, so adding it would only weaken the key.

The migration first demotes any pre-existing duplicate, keeping the most
recently decided parent per child:

```sql
UPDATE verifywise.risk_links
   SET status = 'dismissed'
 WHERE relation_type = 'inherits_from'
   AND status = 'confirmed'
   AND id NOT IN (
     SELECT DISTINCT ON (source_risk_id) id
       FROM verifywise.risk_links
      WHERE relation_type = 'inherits_from' AND status = 'confirmed'
      ORDER BY source_risk_id, decided_at DESC NULLS LAST, id DESC
   );
```

Demotion, not deletion — a dismissed row is restorable from the panel's
"Show dismissed" view, so nobody loses a judgement.

`down` drops the index. It does not restore demoted rows; that information is
not recoverable and the rows are still present and visible.

Rows violating the *two-level* rule (a risk in both columns) are left alone by
the migration. The index does not see them, they render correctly, and new
writes are blocked from here on.

### 5.2 Two levels — pure function

New module `Servers/services/riskLinks/hierarchy.ts`, no database access:

```ts
export interface HierarchyEdge {
  childRiskId: number;
  parentRiskId: number;
}

export type HierarchyViolation =
  | "child_already_has_parent"
  | "parent_is_a_child"
  | "child_has_children";

/** Null when the proposed edge keeps the grouping two levels deep. */
export function validateTwoLevel(
  proposed: HierarchyEdge,
  confirmed: HierarchyEdge[],
): HierarchyViolation | null;
```

Keeping it pure makes the rule testable without a database, a request, or
React — the same reason `relatedRisks.ts` was a standalone module in phase 1.

**An edge identical to the proposed one is not a violation.** On POST, a
duplicate confirmed pair would otherwise trip rule 1 and answer *"This risk
already has a parent"* — naming, as the blocker, the very parent the user just
tried to add. Filtering the identical edge out first lets the insert proceed to
`createUserRiskLinkQuery`, whose `ON CONFLICT` returns `null` and produces the
truer message: *"These risks are already linked."* On PATCH the case cannot
arise (`risk_links_unique` forbids a second row for the same pair, and
`confirmed → confirmed` is already a 400), so the filter costs nothing there.

### 5.3 Loading the confirmed edges

New query in `Servers/utils/riskLink.utils.ts`:

```sql
SELECT source_risk_id, target_risk_id
  FROM risk_links
 WHERE organization_id = :organizationId
   AND relation_type = 'inherits_from'
   AND status = 'confirmed'
   AND (source_risk_id IN (:childRiskId, :parentRiskId)
        OR target_risk_id IN (:childRiskId, :parentRiskId))
```

Both existing indexes (`risk_links_org_source_status_idx`,
`risk_links_org_target_status_idx`) serve this. The result is a superset of
what the three checks need, which keeps the query and the function simple.

`organization_id` travels in `:replacements` like every other query in that
file.

### 5.4 Residual race

Two admins confirming opposite ends of a chain in the same instant can both
pass the application check and produce a risk that is both parent and child.
The single-parent index is unaffected — it is atomic. The two-level outcome is
displayable rather than corrupting, and either row can be dismissed. This is
the same trade-off, with the same `ponytail:` note, that the code the check
replaces already documents.

---

## 6. Integration points

### 6.1 `POST /riskLinks` — `createRiskLink`

Manual links insert as `status='confirmed', source='user'`, so the check runs
before the insert. It replaces the `riskLinkPairExistsQuery` reciprocal-cycle
block at `riskLinks.ctrl.ts:215-227`.

`riskLinkPairExistsQuery` loses its only production caller. It is still
imported by `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts`,
which uses it to assert cross-tenant invisibility — a legitimate second use.
The function stays; only the controller's call goes.

### 6.2 `PATCH /riskLinks/:id` — `updateRiskLinkStatus`

When the target status is `confirmed` and the row's `relation_type` is
`inherits_from`, run the check between the existing `ALLOWED_TRANSITIONS`
guard and `updateRiskLinkStatusQuery`. Covers both `suggested → confirmed`
and `dismissed → confirmed`.

Every other transition, and every `related_to` row, skips the check entirely.

### 6.3 Responses

`409` with the matching message:

| Violation | Message |
|---|---|
| `child_already_has_parent` | `This risk already has a parent. Remove it first.` |
| `parent_is_a_child` | `That risk is already a child of another risk, so it cannot be a parent.` |
| `child_has_children` | `This risk has child risks, so it cannot become a child.` |

`409` matches the status the endpoint already returns for a refused link.

#### The unique-violation path — both endpoints

Neither endpoint returns the right thing today when the index fires, and the
two fail differently:

- **POST.** `createUserRiskLinkQuery` ends in
  `ON CONFLICT (source_risk_id, target_risk_id, relation_type) DO NOTHING`.
  That names the *pair* constraint, so it absorbs a duplicate pair and returns
  `null` — but a `risk_links_single_parent_idx` violation is a different
  constraint and **raises**. Today's catch block turns any raise into a `500`.
- **PATCH.** `updateRiskLinkStatus` has no unique-violation handling at all;
  its catch block returns `500` unconditionally. A `dismissed → confirmed`
  restore that loses the §5.4 race would 500.

Both handlers run outside a transaction, so no savepoint is needed
(contrast `ingestPointQuery` in `mrmMonitoring.utils.ts`, which needs one
because its insert sits inside an enclosing transaction).

Add one predicate in `riskLinks.ctrl.ts` and call it first in **both** catch
blocks, before `logFailure`:

```ts
/**
 * `createUserRiskLinkQuery`'s ON CONFLICT names the pair constraint, so a
 * single-parent violation raises instead of returning null — and the PATCH
 * path has no ON CONFLICT at all. The index is on `source_risk_id`, and
 * source is the child, so the violation means exactly one thing: that child
 * already has a confirmed parent. Losing the §5.4 race is a 409, not a 500.
 */
const SINGLE_PARENT_INDEX = "risk_links_single_parent_idx";

type PgError = { code?: string; constraint?: string };

function isSingleParentViolation(error: unknown): boolean {
  const pg =
    (error as { parent?: PgError; original?: PgError })?.parent ??
    (error as { original?: PgError })?.original;
  return pg?.code === "23505" && pg?.constraint === SINGLE_PARENT_INDEX;
}
```

```ts
} catch (error) {
  if (isSingleParentViolation(error)) {
    return res
      .status(409)
      .json(STATUS_CODE[409]("This risk already has a parent. Remove it first."));
  }
  logFailure({ /* unchanged */ });
  return res.status(500).json(STATUS_CODE[500]((error as Error).message));
}
```

Returning before `logFailure` is deliberate: a lost race is a user-facing
conflict, not a system failure, and the endpoint's other 409s do not log
either.

Sniffing the constraint name rather than the bare `23505` keeps the check
honest if a third unique constraint is ever added to the table. The
`23505`-with-`error.original.code` idiom is already used in
`customField.utils.ts:417` and `modelInventory.ctrl.ts:352`; matching on
`constraint` as well is the same pattern, narrowed.

This contradicts the note on `createUserRiskLinkQuery` — *"ON CONFLICT DO
NOTHING rather than catching a driver error code, so the controller never
sniffs SQLSTATE."* That note was true when the pair constraint was the only
one. Update it when this lands rather than leaving it as a lie.

---

## 7. UI

`Clients/src/presentation/components/LinkedRisksPanel/index.tsx` — the
`GROUPS` array keeps its three entries and its match predicates. Only the two
hierarchy titles change:

| Now | Becomes |
|---|---|
| `Inherits from` | `Parent risk` |
| `Inherited by` | `Child risks` |
| `Relates to` | `Relates to` (unchanged) |

Singular "Parent risk" because the rule permits at most one confirmed parent.
Nouns rather than the verb phrases used elsewhere, because these two now name
a *position in a group*, not a relation — and parent/child is the vocabulary
the grouping model is borrowed from. `Relates to` stays a verb phrase; it is
still a relation, and it is the string that resolved the
"Related versus Linked" collision.

A group with no rows renders nothing, as today. A child risk therefore shows
`Parent risk` and never `Child risks`, and vice versa — except while
unconfirmed suggestions sit in both, which is intended.

`LinkRiskForm.tsx` — the `CHOICES` radio labels stay verb phrases
(`Relates to`, `Inherits from`, `Is inherited by`): a heading names a thing,
a control names an action.

Two choices become disabled, computed from the `existingLinks` prop the form
already receives, counting **confirmed** `inherits_from` links only:

| Choice | Disabled when | Reason shown |
|---|---|---|
| `Inherits from` | this risk has a confirmed parent, or has confirmed children | `This risk already has a parent.` / `This risk has child risks.` |
| `Is inherited by` | this risk has a confirmed parent | `This risk is a child of another risk.` |

The third rule — the chosen partner is already someone else's child — cannot
be evaluated client-side: the form's candidate list is
`getAllProjectRisks({ filter: "active" })`, which carries no link data. That
case is left to the server's 409, matching the exclusion policy already
documented in that file.

When the currently selected choice becomes disabled, reset it to
`related_to` and clear the selected partner, mirroring the existing
`handleChoice` reset.

---

## 8. Known and accepted

`risk_links_unique` is `(source_risk_id, target_risk_id, relation_type)`, so
one pair can hold both a `related_to` and an `inherits_from` row and appear
in two groups at once. Redundant but harmless, and auto-dismissing one of them
would be a write the user did not ask for. Left as is.

---

## 9. Testing

**`Servers/services/riskLinks/tests/hierarchy.spec.ts`** (Jest; the folder uses `.spec.ts`) — `validateTwoLevel`:

- Returns `null` for an edge into an empty set.
- Returns `null` when the confirmed edges touch neither risk.
- `child_already_has_parent` when the child already appears as a child.
- `parent_is_a_child` when the proposed parent already appears as a child.
- `child_has_children` when the proposed child already appears as a parent.
- Returns `child_already_has_parent` when rules 1 and 2 both apply, proving
  the documented order.
- Allows a second child under the same parent (fan-out is unlimited).

**`Servers/controllers/__tests__/riskLinks.ctrl.test.ts`** — extend:

- `POST /riskLinks` with `inherits_from` returns 409 and the matching message
  for each of the three violations.
- `POST /riskLinks` with `related_to` never loads confirmed edges.
- `PATCH` to `confirmed` on an `inherits_from` row runs the check; to
  `dismissed` or `suggested` it does not.
- `PATCH` on a `related_to` row never runs the check.
- The reciprocal case `A→B` then `B→A` is now refused as `parent_is_a_child`,
  replacing the assertions on `riskLinkPairExistsQuery`.

**Integration** — one test that the partial unique index rejects a second
confirmed parent for the same child at the database level, with the
application check bypassed. This is the only assertion that the index, rather
than the function, is doing the work.

**The unique-violation path (§6.3)** — two unit tests, one per endpoint, that
feed the handler a rejected query whose error carries
`{ code: "23505", constraint: "risk_links_single_parent_idx" }` and assert a
409 with the `child_already_has_parent` message, not a 500. Without these the
race path is only reachable by actually racing, so a regression would be
invisible.

**`Clients`** (Vitest) — `LinkRiskForm`:

- `Inherits from` is disabled when a confirmed parent link is present.
- `Inherits from` is disabled when a confirmed child link is present.
- `Is inherited by` is disabled when a confirmed parent link is present.
- Suggested-only links disable nothing.
- Selecting a choice that then becomes disabled resets to `related_to`.

---

## 10. Files

| File | Change |
|---|---|
| `Servers/database/migrations/<generated-timestamp>-risk-links-single-parent.js` | New — demote duplicates, create the partial unique index (§5.1). |
| `Servers/services/riskLinks/hierarchy.ts` | New — `validateTwoLevel`, pure (§5.2). |
| `Servers/services/riskLinks/tests/hierarchy.spec.ts` | New — unit tests (§9). |
| `Servers/utils/riskLink.utils.ts` | Add the confirmed-edge query (§5.3). Correct `createUserRiskLinkQuery`'s "never sniffs SQLSTATE" note (§6.3). `riskLinkPairExistsQuery` stays for the isolation test. |
| `Servers/controllers/riskLinks.ctrl.ts` | Check in `createRiskLink` (replacing the cycle block) and in `updateRiskLinkStatus`, plus `isSingleParentViolation` in both catch blocks (§6). |
| `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` | Extend (§9). |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | Two `GROUPS` titles (§7). |
| `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx` | Disable impossible choices, reset on disable (§7). |
| `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx` | Extend — the five cases in §9. |

No change to the recompute engine, the providers, `types.ts`, the API
contract's shape, or `swagger.yaml` — no field is added or removed, only a
new 409 condition on two existing endpoints.
