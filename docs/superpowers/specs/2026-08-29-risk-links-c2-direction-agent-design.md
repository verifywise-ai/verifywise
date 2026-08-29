# Risk links C2 — direction-inference agent

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-08-29
> **Scope:** An admin-triggered LLM pass that proposes `inherits_from` groupings over the clusters the engine already found. Backend only, plus one button.
> **Builds on:** `2026-08-12-risk-links-a1-design.md` (link store), `2026-08-13-risk-links-b-design.md` (linked risks UI), `2026-08-27-risk-links-c1-two-level-grouping-design.md` (the grouping rule)

---

## 1. Summary

The recompute engine cannot produce direction, and this is structural rather
than incidental. Its providers score *pairs* — `LinkCandidate` has no field
for direction — and `upsertRiskLinkQuery` hardcodes `'related_to',
'suggested', 'derived'` in its INSERT. Every link the engine has ever written
is an undirected `related_to` suggestion. Direction has only ever come from a
human filling in the form.

C2 adds the missing producer: an LLM pass that reads a cluster of related
risks and proposes which of them is the parent and which are its children.

The unit of work is **not a risk and not a pair** — it is a connected
component of the `related_to` graph. One LLM call per component. Section 3
explains why that choice is load-bearing rather than cosmetic.

Everything C2 writes is a `suggested` row with `source = 'agent'`. Nothing is
ever confirmed on a user's behalf. The human decision point is unchanged: the
same Confirm / Dismiss buttons in the same panel, guarded by the same C1 rule.

---

## 2. Where this sits

| | Subsystem | Status |
|---|---|---|
| C1 | Two-level grouping constraint | Shipped |
| **C2 (this spec)** | Direction-inference agent | This document |
| C3 | Dismissal feedback report | Not started |
| C4 | Value-chain inheritance (vendor → model → project risk) | Its own data model |

### Out of scope for C2 (explicit — do NOT build)

- Any change to the recompute engine, its providers, or `related_to` scoring.
  C2 reads what the engine wrote; it never writes into the engine's lane.
- Any automatic confirmation. The agent suggests; a human confirms.
- Any per-save LLM call. Saving a risk stays free and offline.
- Any new relation type, any migration, any schema change. See §4.
- Model risks and vendor risks. C2 covers the `risks` table only, the same
  scope as the engine. Cross-table inheritance is C4.
- A shared `createModel` helper. See §5.3.

---

## 3. The unit of work is a connected component

This is the decision the rest of the design hangs off, so it is argued
before anything else.

### 3.1 Why not per risk

The obvious shape is one job per risk: take that risk's `related_to`
partners, ask the LLM which of them is its parent. It produces a defect that
cannot be patched afterwards.

Risk A's job proposes `A → P1` (A's parent is P1). Risk C's job, running from
its own view of the graph, proposes `C → A` (C's parent is A). Both land as
`suggested`, which C1 permits by design — the single-parent index and
`validateTwoLevel` constrain `confirmed` rows only, precisely so that
competing suggestions can coexist.

But these two do not merely compete, they contradict. Confirming either one
makes the other permanently unconfirmable: A cannot be both a child of P1 and
the parent of C. The user is left with a suggestion that returns 409 forever
and no way to understand why.

A `riskId < partnerId` guard fixes the symmetric case (the same pair judged
twice, in opposite directions) but not this one, because the contradiction
spans three risks and two separate LLM calls. No per-risk scheme can see it.

### 3.2 Why the component

A connected component of the `related_to` graph is the smallest unit that
contains every risk a grouping decision could involve. Components partition
the risks, so every risk belongs to exactly one of them, and §7's rule 1
confines a call's output to its own component's ids. Every proposed edge
touching a given risk therefore comes from one call, which rule 3 keeps
self-consistent. Within a scan, the contradiction of §3.1 cannot occur.

Across scans it can, and rule 5 is what closes it. If the graph grows an edge
between two previously separate components, a later scan sees them as one and
could propose `C → A` while `A → P1` from the earlier scan is still sitting
there unanswered. Rule 5 therefore validates against confirmed **and live
suggested** edges, not confirmed alone. §7.2 covers what that costs.

It is also the shape the requirement actually asks for. "Two-level grouping"
is a statement about groups. Asking "of these two, which is on top?" N times
yields N opinions that must then be reconciled; asking "of these N risks,
which is the parent and which are its children?" once yields the artifact
directly.

And it is cheaper: one call per cluster instead of one per risk.

### 3.3 What this costs

Components can only be computed after the recompute jobs have committed their
edges, and BullMQ gives no completion signal across N independent jobs.

The design does not paper over this with a polling waiter. Direction is a
**separate admin action**: the admin runs "Scan for related risks", and then,
whenever they choose, "Suggest hierarchy". The second reads whatever edges
exist at that moment. Two buttons, two decisions, no hidden orchestration.

---

## 4. What already exists

C2 needs no migration. Four facts from the current schema and types:

**`source = 'agent'` is already reserved.** `RiskLinkSource` is
`"derived" | "user" | "agent"` in both `Servers/services/riskLinks/types.ts`
and `Clients/src/domain/interfaces/i.riskLink.ts`. The value is declared and
written nowhere. The column is `VARCHAR(20) NOT NULL` with **no CHECK
constraint**, so writing it needs nothing.

**Direction survives the canonicalisation rule.** The `risk_links_canonical`
CHECK reorders undirected pairs smaller-id-first but exempts `inherits_from`,
so `source_risk_id` stays the child and `target_risk_id` stays the parent.

**Both rows can coexist for one pair.** `risk_links_unique` is
`(source_risk_id, target_risk_id, relation_type)`. A `related_to` row and an
`inherits_from` row for the same pair are different keys.

**The engine will not touch agent rows.** `recompute.ts` prunes only rows
matching `source = 'derived' AND status = 'suggested'` and below threshold.
Agent rows are outside that predicate. No race, no scheduled deletion.

---

## 5. Architecture

### 5.1 Flow

```
Admin clicks "Suggest hierarchy"
   │
   ▼  POST /riskLinks/suggest-hierarchy      (Admin only)
suggestRiskHierarchy (controller)
   ├─ no LLM key for the org        → 400, ends here
   ├─ getRelatedPairsQuery(orgId)   → related_to pairs, status IN (suggested, confirmed)
   ├─ connectedComponents(pairs)    → disjoint clusters
   ├─ drop components of size < 2   (nothing to group)
   ├─ drop components of size > 25  (counted, reported)
   └─ enqueue one job per remaining component → 202 { enqueued, skipped }
   │
   ▼  worker: "risk_link_direction"   payload { organizationId, riskIds }
suggestDirectionForComponent (service)
   ├─ fetch the LLM key itself — the key never enters the job payload
   ├─ getRiskPromptRowsQuery(orgId, riskIds)          name, description, category, phase
   ├─ getHierarchyPairsQuery(orgId, riskIds)          every inherits_from row touching them,
   │                                                  any status — yields both the confirmed
   │                                                  edges and the already-decided pairs
   ├─ generateObjectWithSelfCorrection(...)           one structured call, temperature 0
   ├─ filterProposedGroups(...)                       pure; §7
   └─ createAgentHierarchyLinkQuery per surviving edge
        relation_type='inherits_from', status='suggested', source='agent'
```

### 5.2 Three deliberate reuses

**`validateTwoLevel`** (`services/riskLinks/hierarchy.ts`, from C1) filters
agent proposals. The pure function that guards the confirm path now also
decides which suggestions are worth writing. One rule, one definition, two
call sites — an LLM proposal cannot violate the grouping rule, because the
code that enforces it is the same code.

**`generateObjectWithSelfCorrection`** (`advisor/llmSelfCorrect.ts`) feeds Zod
validation failures back to the model with a corrective directive and retries.
Already written, already unit-tested, already used by two callers.

**The panel needs no display code.** An `inherits_from` row renders under
"Parent risk" / "Child risks" via the existing `GROUPS` table
(`LinkedRisksPanel/index.tsx:16`), gets Confirm / Dismiss from `actionsFor`,
and shows its `reasons` as chips. The only frontend additions are one admin
button and the one-word fix in §9.

### 5.3 On duplicating `createModel`

`aiSdkAgent.ts:80` and `analyzer.service.ts:133` already hold two copies of the
same twelve-line provider switch. The house pattern here is to duplicate, not
to share. C2 adds a third local copy.

Extracting a shared helper at the third call site would be the right refactor.
It is not this change's job, and mixing it in would put an unrelated edit
across the advisor surface into a risk-links PR.

---

## 6. LLM contract

### 6.1 Schema

`services/riskLinks/direction/schema.ts`, following the house conventions in
`advisor/evidenceAnalyzer/schema.ts` — `.strict()`, `.describe()` on every
field, explicit bounds:

```ts
export const hierarchyGroupSchema = z
  .object({
    parent_risk_id: z
      .number()
      .int()
      .describe("The broader risk. Must be one of the ids given in the prompt."),
    child_risk_ids: z
      .array(z.number().int())
      .min(1)
      .max(12)
      .describe("Risks that are specific manifestations of the parent."),
    reason: z
      .string()
      .min(15)
      .max(120)
      .describe("One short sentence: why the parent subsumes these children."),
  })
  .strict();

export const hierarchyOutputSchema = z
  .object({
    groups: z
      .array(hierarchyGroupSchema)
      .max(6)
      .describe(
        "Two-level groups found in this cluster. Return [] when none are genuine — do NOT pad.",
      ),
  })
  .strict();
```

`temperature: 0`. An empty `groups` array is a valid and expected answer:
a cluster of genuinely peer-level risks has no hierarchy in it.

The `max(6)` and `max(12)` bounds are hallucination guards, not calibrated
expectations — against the 25-risk component cap they cannot all bind at once,
and nobody should tune them thinking they encode a measured distribution.

The schema permits **several disjoint groups per component, or none**. This
mirrors C1 exactly — C1 allows many groups across an org and forbids only
grandchildren, second parents, and cycles — so the schema neither widens nor
narrows the rule. Forcing exactly one group per component would manufacture a
"1 parent + 8 children" answer for a nine-risk cluster that really holds two
separate themes.

### 6.2 The semantic anchor

The prompt's real job is pinning down what "parent" means, because a model
left to itself will reach for causation or severity ordering.

> A parent risk **subsumes** its children: each child is a specific
> manifestation of the broader parent risk.

"Model bias" → "Gender bias in the hiring model" is a group. "Data breach" →
"Regulatory fine" is **not** — that is causation, not containment. Two risks
at the same level of abstraction stay ungrouped and remain `related_to`.

The same anti-inflation policy as the evidence analyzer applies: **on the
boundary, do not group.** A missed grouping costs nothing; a wrong one costs
the user a dismissal and teaches them to distrust the feature.

### 6.3 Prompt payload

Per risk in the component: id, `risk_name`, `risk_description` truncated to
300 characters, `risk_category`, `ai_lifecycle_phase`. At the 25-risk cap that
is roughly 10k characters — comfortable for one call.

Then the confirmed `inherits_from` edges touching those risks, labelled as
decisions already made by humans and not to be contradicted. Live `suggested`
edges stay out of the prompt on purpose — they are not decisions, and rule 5
already drops anything that collides with one. The prompt carries facts; the
filter carries policy.

---

## 7. Validating the output

The prompt is not trusted. `filterProposedGroups` is a pure exported function
that re-checks everything the prompt asked for:

```ts
export function filterProposedGroups(
  groups: HierarchyGroup[],
  componentRiskIds: number[],
  blockingEdges: HierarchyEdge[],
  pairsWithExistingHierarchy: Set<string>,
): HierarchyEdge[]
```

Rules, applied in order:

1. Every id in the group must be in `componentRiskIds`. Hallucinated ids drop.
2. `parent_risk_id` must not appear in its own `child_risk_ids`.
3. An id may appear in at most one group, and never as both parent and child.
4. Pairs already carrying an `inherits_from` row in **any** status —
   `suggested`, `confirmed`, or `dismissed` — drop. The key is the
   **unordered** pair, so a dismissed `A → B` also blocks proposing `B → A`:
   the user rejected a hierarchy between these two risks, and offering the
   mirror image next scan is re-asking the same question in different words.
   §8 covers why `dismissed` is in the list at all.
5. Each surviving edge runs `validateTwoLevel(edge, blockingEdges.concat(accepted))`,
   where `blockingEdges` is every `confirmed` **or** `suggested`
   `inherits_from` edge from `getHierarchyPairsQuery`, and `accepted` is what
   this same call has already kept. A non-null violation drops the edge.

Rule 5 is the guarantee. The accumulator makes the batch self-consistent;
including confirmed edges makes it consistent with every human decision; and
including live suggestions makes it consistent with what earlier scans already
put in front of the user. Nothing C2 writes can be unconfirmable at the moment
it is written.

Being pure and exported is not incidental. It is the only way the validation
is testable without a paid network call — see §11.

### 7.1 Why the blocking edges are scoped to the component

`getHierarchyPairsQuery` fetches only the `inherits_from` rows touching the
component's risks, not every such row in the org. This is cheaper, and it is
also correct rather than merely adequate.

All three of `validateTwoLevel`'s rules match an existing edge against one of
the proposed edge's two endpoints — `child_already_has_parent` on the child,
`parent_is_a_child` on the parent, `child_has_children` on the child again.
Both endpoints are, by construction, members of the component. An edge that
touches neither can never satisfy any rule, so omitting it cannot change the
verdict.

The same query supplies `pairsWithExistingHierarchy` (rule 4), which needs
every status, and the confirmed-plus-suggested subset for rule 5. One round
trip, two uses.

### 7.2 What counting live suggestions costs

Because rule 5 blocks on `suggested` edges too, a child with an unanswered
agent suggestion will not be offered a second candidate parent on the next
scan — not even a better one.

That is the intended trade. C1 permits exactly one confirmed parent per child,
so offering three candidates means at least two are destined to fail on
confirm. One live proposal at a time mirrors the rule the user will be judged
against.

Nothing is lost permanently. Dismissing the stale suggestion clears rule 5,
and since rule 4 only blocks the specific pair that was dismissed, the next
scan is free to propose a different parent.

---

## 8. Behaviour and failure

| Situation | Behaviour |
|---|---|
| No LLM key for the org | Endpoint returns **400**. The admin who clicked sees it; it does not vanish into a worker log. |
| Key deleted mid-scan | The worker logs a warning and finishes without writing. No retry — retrying cannot conjure a key. |
| LLM call fails (network, rate limit, auth) | BullMQ retry: `attempts: 3`, exponential backoff, matching `enqueueRiskLinkRecompute`. After three, the job is dropped and `logFailure` records it. |
| Model returns unparseable JSON | `generateObjectWithSelfCorrection` feeds the Zod issues back, two correction attempts. Still failing falls into the row above. |
| One component's job fails | The others are unaffected. Jobs are independent. |
| Component larger than 25 risks | Skipped, counted, returned as `skipped` in the 202. Grouping a 60-risk cluster is not something the model does well; skipping is more honest than emitting quiet nonsense. |
| Component smaller than 2 | Skipped silently. Nothing to group. |
| Org has no `related_to` edges at all | `202 { enqueued: 0, skipped: 0 }`; the panel says so. |

**Re-running the scan.** Rule 4 in §7 excludes any pair that already carries
an `inherits_from` row in any status. A second scan therefore proposes only
new things, and a pair the user dismissed is never proposed again. This is the
join point for C3: the dismissed agent rows are the feedback signal, and they
accumulate rather than being overwritten.

**Cost visibility.** The `enqueued` count in the 202 is exactly the number of
LLM calls about to be made. The admin sees what they spent immediately after
clicking, which is the honest version of a feature that costs money.

**Job identity.** `jobId` is `risk-link-direction:<orgId>:<minRiskIdInComponent>`.
Components are disjoint, so two of them cannot collide within one scan;
`removeOnComplete: true` frees the id once the scan finishes, so a later scan
runs again as intended. Double-clicking the button does not double the bill.

---

## 9. Two frontend changes

**A button.** For admins, next to the existing "Scan for related risks",
wired to a `useSuggestRiskHierarchy` mutation. The action is org-wide, which
matches the existing scan button in the same panel.

**A one-word fix.** `LinkedRisksPanel/index.tsx:181` shows the score when
`link.source !== "user"`. Agent rows have no score, so the column default of 0
would render as a meaningless "0". The condition becomes
`link.source === "derived"` — score means derived signal strength and nothing
else, so this is both the fix and the more accurate predicate.

**One known cosmetic issue, deliberately not fixed.** The same partner can
appear under both "Parent risk" and "Relates to". Suppressing the `related_to`
row would hide a confirmed human decision behind an unconfirmed agent guess.
Both stay.

---

## 10. Files

### New — `Servers/services/riskLinks/direction/`

| File | Responsibility |
|---|---|
| `components.ts` | Connected components of the `related_to` pair list. Union-find, no DB, no LLM. Pure. |
| `schema.ts` | Zod schema and inferred output type. |
| `prompts.ts` | `buildDirectionSystemPrompt()` / `buildDirectionUserPrompt(risks, confirmedEdges)`. |
| `direction.service.ts` | Orchestration, the local `createModel`, and the exported `filterProposedGroups`. |

`components.ts` is separate from the service for the same reason `hierarchy.ts`
is separate in C1: it must be testable on its own.

### Modified

| File | Change |
|---|---|
| `Servers/utils/riskLink.utils.ts` | `getRelatedPairsQuery`, `getRiskPromptRowsQuery`, `getHierarchyPairsQuery`, `createAgentHierarchyLinkQuery` |
| `Servers/services/automations/automationProducer.ts` | `enqueueRiskLinkDirection(organizationId, riskIds)` |
| `Servers/services/automations/automationWorker.ts` | `risk_link_direction` case |
| `Servers/controllers/riskLinks.ctrl.ts` | `suggestRiskHierarchy` |
| `Servers/routes/riskLinks.route.ts` | `POST /suggest-hierarchy`, `authorize(["Admin"])` |
| `Clients/src/application/hooks/useRiskLinks.ts` | `useSuggestRiskHierarchy` |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | Admin button; the §9 score-condition fix |

Each agent row carries the model's own justification in the existing `reasons`
column: a single `LinkSignal` of `{ signal: "hierarchy", weight: 0, detail:
<the group's reason string> }`. `weight` is meaningless for an agent row and
stays 0; the panel's `reasonLabel` renders `signal: detail`, which is why the
schema caps `reason` at 120 characters — long enough to explain, short enough
to sit in a chip. `score` is left at its column default of 0, and §9 stops it
from being displayed.

`createAgentHierarchyLinkQuery` is a fourth query rather than a parameter on an
existing one because `upsertRiskLinkQuery` hardcodes `'related_to',
'suggested', 'derived'` and `createUserRiskLinkQuery` hardcodes
`'confirmed', 'user'` and requires a `userId`. Loosening either with three
optional parameters is more code and less readable than twenty new lines.

---

## 11. Testing

The house rule for LLM features is stated in
`advisor/evidenceAnalyzer/__tests__/calibration.test.ts`: the LLM call itself
is not tested — it is paid, networked, and non-deterministic — and everything
around it is. C2 follows that, which is why §7's filter is a pure exported
function rather than logic buried in the service.

| File | What it proves |
|---|---|
| `services/riskLinks/tests/components.spec.ts` | Chain `A-B, B-C` yields one component of three; disjoint pairs stay separate; a triangle is one component; empty input yields empty output |
| `services/riskLinks/tests/directionFilter.spec.ts` | Ids outside the component drop; a parent listed among its own children drops the group; an id in two groups drops the second; a child with a confirmed parent drops (`child_already_has_parent`); a proposed parent that is already someone's child drops (`parent_is_a_child`); two groups in one response that contradict each other — the second drops; a pair with an existing `inherits_from` row drops, `dismissed` included; a
dismissed `A → B` also blocks proposing `B → A`; a live `suggested` parent
blocks a second candidate parent for the same child |
| `services/automations/tests/riskLinkDirectionQueue.spec.ts` | `jobId` derives deterministically from the component's smallest id; the payload carries no API key |
| `controllers/__tests__/riskLinks.suggestHierarchy.test.ts` | No key yields 400 and enqueues nothing; components below 2 are skipped; components above 25 are counted as `skipped`; the 202 body is correct |
| `tests/integration/riskLinks.agentLink.test.ts` | `createAgentHierarchyLinkQuery` writes `source='agent'`, `status='suggested'`; a second call hits `ON CONFLICT DO NOTHING`; two `suggested` parents for one child are **accepted by the database** |
| `tests/integration/tenant-isolation/riskLinks.isolation.test.ts` | Added case: `getRelatedPairsQuery` never returns another org's pairs |

The last two rows carry weight beyond coverage.

The agent-link integration test asserting that Postgres *accepts* two
suggested parents is not a loose assertion — it documents where the
single-parent guarantee lives. `risk_links_single_parent_idx` is partial on
`status = 'confirmed'`, so it does not apply to suggestions. For agent output,
`filterProposedGroups` is the only guard, and a test that pins this down stops
a future reader from assuming the index has their back.

The isolation case is required rather than optional. `getRelatedPairsQuery` is
the only org-wide query C2 introduces, which makes it the only place tenant
leakage is possible.

---

## 12. Open questions

None. The three decisions that shaped this design were settled before it was
written:

- **Row shape** — the agent writes a new `inherits_from` row beside the
  `related_to` row rather than converting it. Converting cannot hold: the next
  recompute finds the pair above threshold and re-inserts the `related_to`
  row, so the conversion undoes itself and both rows exist anyway, minus the
  provenance. Writing no row at all was also rejected — dismissals would leave
  no record, and C3 needs that record.
- **Trigger** — admin-triggered only. Per-save inference would put an LLM call
  on every risk save and make a 500-risk backfill cost 500 calls.
- **Groups per component** — several, or none. §6.1.
