# C6: Cross-entity suggested links (writing the suggestion C5 only ranked)

> **Status:** design, awaiting review
> **Date:** 2026-09-05
> **Follows:** C5 (cross-entity candidate ranking)
> **Roadmap line this closes:** C4 §8's first deferred item, the half C5 left
> undone — turning "these share a project" from a sort order in a picker into a
> stored `suggested` row.

---

## 1. Problem

C4 shipped cross-entity inheritance: a project risk may name a vendor risk or a
model risk as its parent. C5 shipped the honest signal behind it — shared
project — but deliberately stopped at ranking the manual picker. §3.1 of that
spec says why:

> Rank the picker. Do not write suggestions.

Nothing writes a cross-entity `inherits_from` row today except a human clicking
through the link form. A platform that can see the vendor risk sitting over a
project risk and says nothing about it is not doing the job.

### 1.1 The objection C5 raised, and what changes it

C5's argument was not that the signal is wrong. It was that shared project alone
is a cross-product — every project risk in a project against every vendor and
model risk reachable from that project — and that writing that cross-product into
the panel "puts the uncalibrated noise in the panel, which is the one thing that
cannot be undone cheaply."

That argument holds against a SQL fan-out. It does not hold against a design
where a model looks at the candidates and picks at most one, because the
cross-product never reaches the panel: it reaches the prompt.

C4 §8 also gated this on measuring precision with C3's dismissal report first.
That gate cannot be satisfied on its own terms — there is no dismissal data
because nothing has ever suggested a cross-entity link. The gate is circular, and
§4.3 below is what replaces it: C6 ships the discriminator that makes the
measurement possible, so the data exists from the first suggestion onward.

---

## 2. What already works, and what does not

The whole path downstream of the write is in place. This was verified against the
code, not assumed:

| Layer | State |
|---|---|
| `getRiskLinksForRiskQuery` (`riskLink.utils.ts:667`) | LEFT JOINs `model_risks` and `vendorrisks`, derives `related_entity_type`, coalesces name / level / owner. A cross-entity `suggested` row renders today. |
| `LinkedRisksPanel` `actionsFor` (`index.tsx:44`) | Branches on `status`, never on entity type. A `suggested` cross-entity row gets Confirm and Dismiss. |
| Confirm (`riskLinks.ctrl.ts:399`) | Derives the parent through `hierarchyParentFromLink` and runs `validateTwoLevel` with `parentEntityType`. |
| Dismiss + reason | C3's form is status-driven, not entity-driven. |
| `recomputeRiskLinks` (`recompute.ts:102`) | Skips every row with `target_risk_id == null`. A C6 row survives recompute untouched. |
| Candidate source | C5's `getSharedProjectCandidatesQuery` (`riskLink.utils.ts:769`). |

Three things do not work, and §4 and §5 are about them: there is no writer that
can reach the cross-entity target columns from an agent path, the dedupe query is
blind to cross-entity rows, and the precision SQL cannot tell a C6 row from a C2
one.

---

## 3. Where C6 runs

Inside `suggestDirectionForComponent`. No new endpoint, no new button, no new
job, no migration, and — this is the point — **no additional model call.**

The direction pass already asks a model "which of these related risks is the
umbrella?" for each connected component of the `related_to` graph. C6 widens the
candidate set for that same question: the component's project risks, plus the
vendor and model risks that share a project with them. The model answers once,
choosing from the union.

### 3.1 Why the same call rather than a second one

Asking separately produces two independent answers — "risk 4 is the umbrella"
and "vendor risk 9 is the umbrella" — and the single-parent rule then picks a
winner by whichever row was written first. That is arbitrary. Asked together, the
model compares a project-risk parent against a vendor-risk parent side by side,
which is the question a human would actually ask.

It is also the smaller change. The trigger, the 202, the BullMQ job, the panel's
180 s polling window, and the "no LLM key" pre-flight all already exist and are
untouched.

### 3.2 What this deliberately does not cover

A risk reaches the direction pass only by being in a `related_to` component. An
isolated risk — no scan run, or a scan that found nothing — gets no cross-entity
suggestion. That is already true of C2's project-risk grouping, and "Scan for
related risks" is the existing entry point for fixing it. Naming it here so it is
a known boundary rather than a surprise.

---

## 4. Decisions taken without asking

### 4.1 The parent's entity type is a required field, never a default

`hierarchyGroupSchema` gains:

```ts
parent_entity_type: z.enum(["risk", "model_risk", "vendor_risk"]),
```

Required, with no `.default("risk")`. `risks.id = 7`, `model_risks.id = 7` and
`vendorrisks.id = 7` all exist. A model that omits the field under a default
writes a link to the wrong table with no error anywhere — the id resolves, the
insert succeeds, and the panel renders someone else's risk. A required field
turns that into a Zod issue, which `generateObjectWithSelfCorrection` feeds back
for a second attempt.

`.strict()` stays. `child_risk_ids` is unchanged: C4 §3.3 makes vendor and model
risks parents only, so a child is always a `risks(id)`.

### 4.2 A candidate may only parent the risks it shares a project with

`getSharedProjectCandidatesQuery` is per-risk. For a component the service calls
it once per member — plain SQL, no model cost, and bounded by
`MAX_COMPONENT_SIZE = 25`. The results merge into a map keyed by
`entityType:id`, each entry carrying the set of component risks that reached it.

That set is not bookkeeping; it is the rule. Without it a vendor risk that shares
a project with risk A could be proposed as the parent of risk B, which shares
nothing with it — a link with no justification at all, which is the exact noise
this design claims to avoid. The prompt states the constraint and the filter
enforces it.

### 4.3 Cross-entity rows carry their own reason signal

`createAgentHierarchyLinkQuery` writes `{ signal: "hierarchy", weight: 0, detail }`.
A cross-entity row writes `"cross_entity_hierarchy"` instead.

This is what makes the feature measurable. `risk-link-precision.sql` query 4
filters `source = 'agent' AND relation_type = 'inherits_from'` with no other
discriminator — exactly C2's rows. Ship C6 under the same signal and the two
features merge into one bucket: query 4 stops measuring C2 and never measures C6.
The signal splits them, and §6.2 adds the query that reads it.

`source` stays `agent` and `relation_type` stays `inherits_from`. Both are
forced: `agent` is what an undecided machine proposal means everywhere else in
this schema, and C4 §3.4 put cross-entity `related_to` out of scope.

### 4.4 Over the candidate cap, the cross-entity half is skipped, not truncated

A component of 25 risks spanning several projects can reach hundreds of vendor
and model risks. Past `MAX_CROSS_ENTITY_CANDIDATES = 25` distinct candidates, the
component runs as a plain C2 pass and logs that it did.

Not truncated, because there is nothing to truncate on. Every candidate shares a
project by construction, so they are all equally justified; cutting at 25 by id
order picks winners for no reason. Skipping is the same fail-closed choice the
controller already makes for oversized components.

### 4.5 Recompute stays untouched

`recompute.ts:102` already skips rows with a null `target_risk_id`, with a
comment saying cross-entity inheritance is not recompute's to own. C6 writes
rows of exactly that shape. Nothing in `recompute.ts` changes.

---

## 5. The changes

### 5.1 `services/riskLinks/direction/schema.ts`

Add `parent_entity_type` to `hierarchyGroupSchema` per §4.1.

### 5.2 `services/riskLinks/direction/prompts.ts`

`buildDirectionSystemPrompt` gains two rules:

- Candidate parents from the vendor and model lists may be parents. They are
  never children, and they never appear in `child_risk_ids`.
- A candidate parent may only take the risk ids listed beside it as children.

`buildDirectionUserPrompt` gains a second block after the risk list — omitted
entirely when there are no candidates, so a C2-only component's prompt is
byte-identical to today's:

```
These vendor and model risks share a project with the risks above and may be
umbrellas over them:

- vendor_risk 9: Third-party model drift
  shares a project with risks: 3, 4
  projects: Acme Onboarding
- model_risk 2: Fairness degradation in production
  shares a project with risks: 4
  projects: Acme Onboarding, Fraud Scoring
```

### 5.3 `services/riskLinks/direction/direction.service.ts`

After `getRiskPromptRowsQuery`, call `getSharedProjectCandidatesQuery` once per
live risk id and merge the results into a map keyed `entityType:id`:

```ts
interface CrossEntityCandidate {
  parent: HierarchyParent;
  /** Component risk ids that reach it through a shared project. §4.2. */
  childRiskIds: Set<number>;
  /** Project titles, for the prompt. */
  projects: string[];
}
```

Over `MAX_CROSS_ENTITY_CANDIDATES`, replace the map with an empty one and log.
Pass it to the prompt builder and the filter. In the write loop, pass the parent
as a `HierarchyParent` rather than a bare number.

### 5.4 `services/riskLinks/direction/direction.service.ts` — `filterProposedGroups`

The five rules stay; three of them learn about entity types.

| Rule | Change |
|---|---|
| 1 — ids belong to the component | A cross-entity parent must be in the candidate map instead. Children are still checked against the component. |
| 2 — parent not among its own children | Only meaningful for `parent_entity_type === "risk"`; a cross-entity parent cannot be a child. |
| 3 — one child, one side | `usedAsParent` keys on `entityType:id`, not the bare number, so `vendor_risk 7` and `risk 7` stop colliding. `claimedAsChild` stays numeric — children are always project risks. |
| **new** — justification | The group drops for any child not in that candidate's shared set (§4.2). |
| 4 — pair already has a row | `hierarchyPairKey` becomes entity-aware; see §5.5. |
| 5 — `validateTwoLevel` | Unchanged. It already takes `parentEntityType` and already guards the id collision. |

Rule 4's key cannot stay `canonicalPair`-based: that function orders two numbers,
and a cross-entity pair is not two numbers from the same space. Cross-entity
keys become `${childRiskId}:${entityType}:${parentId}` — directed, which is
correct, since a cross-entity edge has only one legal direction.

### 5.5 `utils/riskLink.utils.ts` — `getHierarchyPairsQuery`

Today it selects `source_risk_id, target_risk_id, status` and maps
`parentRiskId: toNumber(row.target_risk_id)`. On a cross-entity row that is
`toNumber(null)`, and the row's real parent is invisible.

Two live consequences: rule 4 cannot see a cross-entity pair, so a parent a human
already dismissed gets re-suggested on every pass; and `blockingEdges` gains a
junk edge whose parent id is not a real id.

The query selects all three target columns and returns `parentEntityType`
alongside `parentRiskId`. `HierarchyPairRow` grows the field. Its consumers in
`direction.service.ts` — the rule-4 key set, `blockingEdges`, and
`confirmedEdges` — pass it straight through to `HierarchyEdge`, which has
accepted it since C4.

### 5.6 `utils/riskLink.utils.ts` — `createAgentHierarchyLinkQuery`

`CreateAgentHierarchyLinkInput.parentRiskId: number` becomes
`parent: HierarchyParent`. The body adopts `createUserRiskLinkQuery`'s existing
branching verbatim — the `targetColumn` ternary and the partial-index
`conflictTarget` — because the partial unique indexes it names already exist and
already serve the C4 path.

The reason signal follows §4.3: `"cross_entity_hierarchy"` when the parent is not
a plain risk, `"hierarchy"` when it is.

This query still does not absorb `risk_links_single_parent_idx`. It never did,
and nothing about C6 changes that: rule 5 keeps the batch self-consistent and the
index closes the race, in which case `ON CONFLICT DO NOTHING` is not the
mechanism that fires. A single-parent violation from a concurrent component
raises and the job's existing catch logs it.

### 5.7 `utils/riskLink.utils.ts` — `getSharedProjectCandidatesQuery` returns a name

`SharedProjectCandidate` is `{ entityType, id, projects }`. C5 could stop there
because its consumer, `LinkRiskForm`, uses the result only as an id-to-projects
lookup and already holds the names from the list it is decorating. A prompt has
no such list: "vendor_risk 9" with no name is not something a model can judge.

The query gains a `name` column, taking the display expressions
`getRiskLinksForRiskQuery` already settled on — `model_risks.risk_name`, and
`LEFT(vendorrisks.risk_description, 80)` because `vendorrisks` has no name
column.

Additive, so C5's path is untouched: `LinkRiskForm` ignores the extra key, and
the `/shared-projects` response gains a field without changing its shape. The
generated Swagger describes operations rather than response bodies, so
`check:api-drift` is unaffected.

---

---

## 6. Measurement

### 6.1 What a verdict means here

Unchanged from C3's four reading rules, which the precision file already states:
`suggested` rows stay out of denominators, `source = 'user'` rows stay out
entirely, a verdict credits every signal on the row, and under roughly thirty
decisions a percentage is noise. C6 adds volume to the fourth of those, which is
the point.

### 6.2 `docs/technical/domains/risk-link-precision.sql`

Query 4 gains one `AND` so it goes on measuring C2 alone, and a sibling that
measures C6:

```sql
-- added to query 4
   AND target_risk_id IS NOT NULL
```

```sql
\echo '--- 4b. Cross-entity agent hierarchy (C6) ---'
SELECT count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
       count(*) FILTER (WHERE status = 'dismissed') AS dismissed,
       count(*) FILTER (WHERE status = 'suggested') AS undecided
  FROM risk_links
 WHERE source = 'agent'
   AND relation_type = 'inherits_from'
   AND (target_model_risk_id IS NOT NULL OR target_vendor_risk_id IS NOT NULL);
```

Query 6 groups dismissals by `relation_type` and would merge C2 and C6 the same
way. It gains `reasons @> '[{"signal":"cross_entity_hierarchy"}]'` as a
breakdown column rather than a filter, so the existing rows keep reading the same.

---

## 7. Out of scope

- **Isolated risks.** §3.2. A risk with no `related_to` edges never reaches the
  direction pass. Fixing that means a per-risk trigger — its own endpoint,
  button, and model call — and it is a separate piece of work.
- **Cross-entity `related_to`.** C4 §3.4 put it out of scope and nothing here
  reopens it.
- **Vendor risk under model risk.** C4 §3.3: these tables supply parents, never
  children, in either direction.
- **Backfill.** No migration, and no pass over existing components. The feature
  arrives on the next press of "Suggest hierarchy".
- **Scoring cross-entity candidates.** C5 §3.2 declined a score and this design
  does not add one: the model's choice is the ranking, and `score` stays at the
  column default of 0.
- **Tuning the caps.** `MAX_CROSS_ENTITY_CANDIDATES = 25` mirrors
  `MAX_COMPONENT_SIZE`; it is a hallucination and prompt-size guard, not a
  measured distribution.

---

## 8. Test plan

Every test is written failing first. The first five need no database and no
network — `filterProposedGroups` is pure and exported for exactly this reason.

**`filterProposedGroups`**

1. A cross-entity parent whose candidate set contains the child is accepted, and
   carries `parentEntityType` through to the returned edge.
2. A group naming a child outside that candidate's shared set drops (§4.2).
3. `vendor_risk 7` used as a parent does not stop `risk 7` from being a parent in
   another group — the namespacing in rule 3.
4. A pair that already has a `dismissed` cross-entity `inherits_from` row drops
   (rule 4, entity-aware key).
5. A group naming a cross-entity parent absent from the candidate map drops
   (rule 1) — the hallucination guard.

**`getHierarchyPairsQuery`**

6. A stored `target_vendor_risk_id` row returns `parentEntityType:
   "vendor_risk"` and the vendor risk's id, not null.

**`createAgentHierarchyLinkQuery`**

7. A `model_risk` parent writes `target_model_risk_id`, leaves `target_risk_id`
   null, and stamps `cross_entity_hierarchy`.
8. A plain risk parent still writes `target_risk_id` under the `hierarchy`
   signal, with both cross-entity columns null — the regression guard on C2.

**`getSharedProjectCandidatesQuery`**

9. A vendor candidate carries the first 80 characters of its description as its
   name, and a model candidate carries `risk_name` (§5.7).

**`buildDirectionUserPrompt`**

10. Candidates are listed with entity type, name, shared risk ids, and project
    titles.
11. With no candidates the prompt is unchanged from today's output.

**`suggestDirectionForComponent`**

12. Past `MAX_CROSS_ENTITY_CANDIDATES`, no candidate block reaches the prompt and
    the project-risk grouping still runs and still writes.
13. A model answer naming a vendor parent produces one row with
    `target_vendor_risk_id` set.
