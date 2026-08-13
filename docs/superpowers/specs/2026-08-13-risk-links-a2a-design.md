# Risk links A2a — structural graph provider

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-08-13
> **Scope:** Backend only. One new signal provider, one new query, one semantic change in the recompute guard.
> **Builds on:** `2026-08-12-risk-links-a1-design.md`

---

## 1. Summary

A1 scores a pair of risks on the fields a human would eyeball: shared category, the same control or assessment text, the same lifecycle phase, a shared project. It never looks at what the two risks are actually *attached to* in the compliance frameworks.

A2a adds that. Two risks that both hang off ISO 42001 subclause 9.2.3 are related whether or not anyone typed the same words into their category field. The new `structuralGraph` provider reads the ten risk-to-framework-element join tables, and weights each shared element by how rare it is: an element two risks share is strong evidence, an element thirty-eight risks share is almost none.

Nothing else moves. Same table, same lifecycle rules, same endpoints, no migration, no UI.

---

## 2. Where this sits

A1's §12 recorded A2 as one phase holding two providers. It is split:

| | Phase | Contents |
|---|---|---|
| **A2a (this spec)** | Structural graph | Pure SQL. No external dependency, no API cost, no new table. |
| **A2b** | Embeddings | `text-embedding-3-small`, a `risk_embeddings` cache table, org-scoped LLM key resolution inside a worker, OpenAI spend. Its own spec. |

The split is by risk profile, not by size. A2a can ship without anyone approving a budget or configuring a key. A2b brings a failure mode — no key, wrong provider, upstream outage — that has no business blocking A2a.

### Out of scope for A2a (explicit — do NOT build)

- The embedding provider, `risk_embeddings`, and anything touching an LLM key. That is A2b.
- The `duplicates` relation type. A1 §4.2 floated it for the embedding provider; structural evidence never implies duplication, and adding an enum member costs a migration, a lifecycle rule, and UI copy.
- Any change to the threshold (3), the per-risk cap (20), the lifecycle rules, the endpoints, or the table.
- Any UI. Still B.
- A1's parked cleanup of the `any` casts at the SQL boundary in `riskLink.utils.ts`. Unrelated to this change; it would only spread the diff.

---

## 3. Architecture

A1 built the seam this drops into:

```
recomputeRiskLinks(orgId, riskId)
    │
    ├── getRiskScoringRowsQuery(orgId)  ── every active risk, tier-0 columns
    │
    ├── PROVIDERS
    │     ├── fieldOverlap    (tier 0, A1)  pure, reads ctx.candidates
    │     └── structuralGraph (tier 1, NEW) issues its own SQL
    │
    ├── merge → threshold 3 → cap 20 → transaction
    └── upsert keepers, rescore or prune the rest
```

`PROVIDERS` in `recompute.ts` gains a second element. That is the whole wiring change.

### 3.1 The provider is not pure, and the interface already knew

A1 §5.1: *"`candidates` is ready-to-use data for tier 0 and a candidate universe (id allowlist) for tiers 1 and 2, which issue their own SQL."* `structuralGraph` uses `ctx.organizationId` and `ctx.subject.id`, issues one query, and ignores `ctx.candidates` for scoring — the SQL already restricts itself to active risks in the org, which is the same population `ctx.candidates` was built from.

Following A1's file convention, the SQL lives in `utils/riskLink.utils.ts` as `getStructuralNeighboursQuery`, not in the provider. The provider is then arithmetic over a mockable function, testable exactly like `recompute.spec.ts` tests the algorithm.

### 3.2 Query shape

Subject-scoped, not org-scoped. The result is one row per (neighbour, shared element), so it grows with the subject's neighbourhood, not with the org.

```sql
WITH element_links AS (
  SELECT projects_risks_id AS risk_id, 'iso42001_subclause:'     || subclause_id                 AS element_key FROM subclauses_iso__risks               WHERE organization_id = :organizationId
  UNION ALL
  SELECT projects_risks_id,            'iso27001_subclause:'     || subclause_id                                FROM subclauses_iso27001__risks          WHERE organization_id = :organizationId
  UNION ALL
  SELECT projects_risks_id,            'iso42001_annexcategory:' || annexcategory_id                            FROM annexcategories_iso__risks          WHERE organization_id = :organizationId
  UNION ALL
  SELECT projects_risks_id,            'iso27001_annexcontrol:'  || annexcontrol_id                             FROM annexcontrols_iso27001__risks       WHERE organization_id = :organizationId
  UNION ALL
  SELECT projects_risks_id,            'eu_control:'             || control_id                                  FROM controls_eu__risks                  WHERE organization_id = :organizationId
  UNION ALL
  SELECT projects_risks_id,            'eu_subcontrol:'          || subcontrol_id                               FROM subcontrols_eu__risks               WHERE organization_id = :organizationId
  UNION ALL
  SELECT projects_risks_id,            'eu_answer:'              || answer_id                                   FROM answers_eu__risks                   WHERE organization_id = :organizationId
  UNION ALL
  SELECT projects_risks_id,            'nist_subcategory:'       || nist_ai_rmf_subcategory_id                  FROM nist_ai_rmf_subcategories__risks    WHERE organization_id = :organizationId
  UNION ALL
  SELECT risk_id,                      'custom_l2:'              || level2_impl_id                              FROM custom_framework_level2_risks       WHERE organization_id = :organizationId
  UNION ALL
  SELECT risk_id,                      'custom_l3:'              || level3_impl_id                              FROM custom_framework_level3_risks       WHERE organization_id = :organizationId
),
active AS (
  SELECT DISTINCT el.risk_id, el.element_key
  FROM element_links el
  JOIN risks r
    ON r.id = el.risk_id
   AND r.organization_id = :organizationId
   AND r.is_deleted = false
),
degrees AS (
  SELECT element_key, COUNT(*) AS degree
  FROM active
  GROUP BY element_key
)
SELECT a2.risk_id  AS target_risk_id,
       a1.element_key,
       d.degree
FROM active a1
JOIN active a2 ON a2.element_key = a1.element_key AND a2.risk_id <> a1.risk_id
JOIN degrees d ON d.element_key = a1.element_key
WHERE a1.risk_id = :riskId
```

Three things this shape buys, each load-bearing:

- **`SELECT DISTINCT` in `active`.** Redundant today and kept anyway: all ten join tables have a primary key on exactly `(element_id, risk_id)` (verified against the live schema), and the arm prefixes keep two arms from ever producing the same `element_key`, so a duplicate `(risk_id, element_key)` cannot occur. `DISTINCT` costs one hash over a small set and keeps `COUNT(*)` a correct degree if a future join table ships without that constraint. Do not remove it as dead weight.
- **`organization_id` on every `UNION` arm *and* on the `risks` join.** Defense in depth, and not optional. See §6 for why the ids alone do not protect this.
- **`is_deleted = false` on the `risks` join.** Soft-deleted risks stay in the join tables. Without this filter they would both inflate degrees and appear as neighbours.

### 3.3 `projects_risks_id` holds a risk id

Eight of the ten tables name their risk column `projects_risks_id`. The name is a legacy misnomer — `projects_risks` has no `id` column to reference, and the codebase joins it directly against `risks.id` (`utils/risk.utils.ts:250`, and `:518` where the same column is compared to `:riskId`). There is no extra hop. Do not add a join to `projects_risks`.

---

## 4. Scoring

### 4.1 The formula

```
points(A, B) = min( 4, Σ  2 / log2(1 + degree(e)) )
                      e ∈ elements shared by A and B
```

`degree(e)` is the number of active risks in the org attached to element `e`.

| degree | contribution | reading |
|---|---|---|
| 2 | 1.26 | only these two risks — distinctive |
| 3 | 1.00 | |
| 5 | 0.77 | |
| 10 | 0.58 | common |
| 40 | 0.37 | nearly noise |

Structural evidence alone therefore needs roughly **three exclusive shared elements** to reach the threshold of 3. Sharing one control that forty risks also touch never gets there on its own, which is the entire point: in a single-framework org every risk shares the framework, and a flat weight would push every pair over the threshold and turn the cap into the real filter.

The **cap of 4** keeps tier 1 from dominating. Tier 0's maximum is 10 (3+2+2+2+1), so a pair with strong field overlap still outranks a pair with only structural evidence, while structural evidence alone can still originate a suggestion.

### 4.2 Symmetry

A1 §5.1 makes `score(A,B) == score(B,A)` an invariant; pruning is unstable without it. This formula satisfies it by construction: the shared-element set is the same read from either side, and `degree` is a property of the element within the org (§6), not of either risk — so both endpoints read the same number.

### 4.3 Rounding

The provider rounds its own total to two decimals before returning. `score` is `NUMERIC` and stores exactly what it is sent, so an unrounded `3.7699999999999996` would reach the UI verbatim. Tier 0 returns integers, so a rounded tier-1 total keeps the merged sum clean and `recompute.ts` needs no rounding of its own.

### 4.4 What the user sees

One signal per pair, not one per element:

```json
{ "signal": "shared_framework_element",
  "weight": 3.1,
  "detail": "2 EU AI Act controls, 1 ISO 42001 subclause" }
```

`detail` is derived from the `element_key` prefixes, so it costs no extra SQL. Titles would mean joining ten struct tables for a string; the type breakdown is the useful part. The `weight` above is two controls of degree 2 plus one subclause of degree 10: `1.26 + 1.26 + 0.58`.

| prefix | label (singular / plural) |
|---|---|
| `iso42001_subclause` | ISO 42001 subclause / subclauses |
| `iso27001_subclause` | ISO 27001 subclause / subclauses |
| `iso42001_annexcategory` | ISO 42001 annex category / categories |
| `iso27001_annexcontrol` | ISO 27001 annex control / controls |
| `eu_control` | EU AI Act control / controls |
| `eu_subcontrol` | EU AI Act subcontrol / subcontrols |
| `eu_answer` | EU AI Act assessment answer / answers |
| `nist_subcategory` | NIST AI RMF subcategory / subcategories |
| `custom_l2` | custom framework item / items |
| `custom_l3` | custom framework item / items |

Order the breakdown by count descending, then by label, so the string is deterministic and testable.

### 4.5 What is deliberately not an element

- **`projects_risks`.** Tier 0 already awards `shared_project` one point. Including it here would double-count the same fact.
- **`frameworks_risks`.** In a single-framework org every risk shares it; the rarity weight would reduce it to ~0.37 anyway. A `UNION` arm that contributes noise and nothing else is not worth its line.
- **Models.** There is no risk-to-model link in the schema. `model_risks` is a separate register with its own `risk_name` and `model_id` — it is not a join table, and the only tables carrying a `risk_id` are `projects_risks`, `frameworks_risks`, and the two custom-framework tables. "Two risks about the same model" is not expressible today.

---

## 5. Provider failure becomes fatal

A1 §5.4 kept going when a provider threw, as long as one succeeded. With a single provider that meant all-or-nothing. With two it means something else: if `structuralGraph` throws on a transient database error, `fieldOverlap` alone completes the run, every pair loses its tier-1 points, some fall under the threshold, and **`derived` + `suggested` edges are deleted**. A hiccup silently destroys suggestions.

So the rule inverts: **any provider failure aborts the whole run.** Partial knowledge is not knowledge — nothing is written and nothing is pruned. The risk keeps the edges it had: stale, but never wrong. The job fails, and `attempts: 3` with exponential backoff retries it; if it still fails, the next save or the next `POST /riskLinks/recompute` picks the risk up.

The two outcomes are distinguished by what a provider does, with no extra machinery:

| provider does | means | run |
|---|---|---|
| returns `[]` | "I ran, I found nothing" | continues normally |
| throws | "I ran and broke" | aborts, no writes, no deletes |

For A2a only a SQL error throws. An org with no framework elements linked to anything yields no rows, which is the empty-array case — a normal run where tier 0 decides alone. A2b will map "no LLM key configured" to the empty array and "the embedding call failed" to a throw.

Implementation is a net deletion in `recompute.ts`: the `catch` logs as it does today and then rethrows; the `anyProviderSucceeded` flag and its guard go away.

---

## 6. Tenant isolation

**Correcting an earlier reading of the schema.** Element ids here are *not* global. Every one of the ten join tables references an **org-scoped instance** table — `controls_eu`, `subcontrols_eu`, `answers_eu`, `subclauses_iso`, `subclauses_iso27001`, `annexcategories_iso`, `annexcontrols_iso27001`, `nist_ai_rmf_subcategories`, `custom_framework_level2_impl`, `custom_framework_level3_impl` — each carrying its own `organization_id`. The genuinely global tables are the `*_struct` ones (`nist_ai_rmf_subcategories_struct` and friends), and **no join table points at them**. Each instance table's `id` comes from a single sequence shared across orgs, so a given id belongs to exactly one organization. Two orgs running the EU AI Act do *not* share control id 412.

So the cross-tenant edge cannot arise from two orgs legitimately touching one element. The filters stay anyway, for two independent reasons:

- **Nothing in the schema enforces what the ids imply.** `organization_id` is **nullable** on the eight `*__risks` tables, and there is **no foreign key** from `control_id` (or any sibling) to its element table. A row in org B naming org A's element id is schema-legal. A bad import, demo seeding, or a bug elsewhere produces one, and an unfiltered query turns it into a cross-tenant edge that the A1 endpoints then serve happily, since they filter `risk_links` by `organization_id` and the row would carry the reader's own org id. The filter is what makes the query correct rather than making it depend on ids happening not to collide. (A NULL `organization_id` fails `= :organizationId` and so drops out — the safe direction.)
- **Degree scoping is semantics, not only safety.** Rarity must be a property of *this org's* graph. A control that forty of your own risks touch is not rare to you; a large neighbour org's volume must not depress your scores. An unscoped `degrees` CTE would get this wrong even with no leak at all.

There is a second layer, and A2a adds it: **`recompute.ts` filters merged candidates to the id set it already holds.** Tier 0 reads `ctx.candidates`, which `getRiskScoringRowsQuery` scopes to the org, so tier 0 cannot emit a foreign target. Tier 1 issues its own SQL and merges by target id with nothing checking that the id belongs to the org — so a single missing `WHERE` becomes a written cross-tenant row. One `if` at the merge closes it:

```typescript
const candidateIds = new Set(candidates.map((row) => row.id));
// …inside the merge loop
if (!candidateIds.has(candidate.targetRiskId)) continue;
```

This is exact, not merely defensive: `candidates` is *every other active risk in the org*, so any legitimate tier-1 target is already in it, and anything else is either another org's risk or a soft-deleted one. Both are covered by tests in §7, not only by review. Because the collision is not naturally reachable, §7.4 seeds it deliberately — which the missing foreign key makes possible.

---

## 7. Testing

### 7.1 `services/riskLinks/tests/structuralGraph.spec.ts` (new)

`getStructuralNeighboursQuery` mocked. No database.

- One element of degree 2 → 1.26, one signal, `detail` naming that element type.
- Three elements of degree 2 → 3.79, above the threshold.
- Ten elements of degree 2 → capped at 4, not 12.6.
- One element of degree 40 → 0.37; well below the threshold, still returned (the threshold belongs to `recompute`, not the provider).
- Symmetry: the same inputs read from either risk's side produce the same total.
- Empty result → `[]`, not a throw.
- `detail` for a mixed set is ordered by count descending, then label, and pluralizes.
- `custom_l2` and `custom_l3` share the label "custom framework item", so a pair sharing one of each reads `2 custom framework items` — the breakdown groups by label, not by prefix.

The string-`degree` regression guard lives in §7.3, not here: coercion happens once, in the utils function, and a provider test that mocks that function cannot exercise it. The provider takes `number` and means it.

### 7.2 `services/riskLinks/tests/recompute.spec.ts` (modified)

- The existing *"writes nothing and deletes nothing when every provider throws"* now asserts `rejects.toThrow("boom")` alongside the unchanged no-write assertions. Under the new rule the function propagates instead of returning quietly.
- **New, and the closure of A1's third parked minor:** one provider succeeds, the other throws → nothing written, nothing pruned, the error propagates. A1 could not write this test with a single provider.
- **Every other test in this file needs a one-line stub, or the whole suite goes red.** The file does `jest.mock("../../../utils/riskLink.utils")` and `jest.resetAllMocks()` in `beforeEach`, so the auto-mocked `getStructuralNeighboursQuery` returns `undefined`. The new provider would then iterate `undefined`, throw a `TypeError`, and — under §5 — abort every run. Add `mockUtils.getStructuralNeighboursQuery.mockResolvedValue([])` to the existing `beforeEach` beside `getIncidentLinksQuery`. This is a consequence of registering the provider, not of any test's own subject.

### 7.3 `utils/__tests__/riskLink.utils.test.ts` (modified)

Assert the emitted SQL carries `organization_id` on every `UNION` arm *and* on the `risks` join — count the occurrences and require exactly **11**, so dropping any single arm's filter goes red — plus `is_deleted = false` on the `risks` join and a `degrees` CTE that reads `FROM active`. Same shape of assertion A1 uses for its soft-delete filters.

Also the coercion, which is only reachable here: a row whose `degree` is the string `"3"` comes back as the number `3`. Without it `Math.log2(1 + "3")` is `Math.log2("13")`, and the score is wrong with no type error anywhere (§8).

### 7.4 `tests/integration/tenant-isolation/riskLinks.isolation.test.ts` (modified)

Against a real database, two new cases. Both seed the element collision **deliberately** — per §6 it is not naturally reachable, and the absent foreign key on `control_id` is what lets a test write it.

Both use **three** shared controls rather than one, because one element of degree 2 scores 1.26 and never crosses the threshold of 3 — a leak would be invisible in `risk_links`. Three of degree 2 score 3.79 and do cross it, so the assertion is "a row exists / does not exist" against real stored data.

- **Cross-tenant edge.** Owner org and attacker org each own one risk, and both risks get `controls_eu__risks` rows naming the *same three* `control_id`s, each row with its own `organization_id`. No shared category, so tier 0 contributes nothing. Recompute in the owner org: `risk_links` stays empty, because within the owner org each control has degree 1 and the pair join needs two distinct risks. Drop either org filter and each control reaches degree 2, tier 1 scores 3.79, and an edge to the attacker's risk id is written — red.
- **Degree scoping.** Subject and one partner risk in the owner org, both on the *same three* controls. Also seed (a) five risks in a second org on those controls and (b) one **soft-deleted** owner-org risk on them. Recompute the subject and assert the stored `score` is **3.79** — three elements at the owner org's own live degree of 2. Three distinct mutations each turn this red and leave the cross-tenant case above green: degrees over an unscoped source gives degree 7 → 2.00 → below threshold → no row at all; degrees over `element_links` instead of `active` gives degree 3 → 3.00 → a row with the wrong score; both together give degree 8 → 1.89 → no row.

---

## 8. Type coercion at the read boundary

A1's constraint D applies unchanged. `COUNT(*)` is `bigint`, and `node-pg` returns `bigint` as a **string** to avoid silent precision loss. Verified against this database, not assumed: `pg_typeof(count(*))` is `bigint`, and the same aggregate read back through `sequelize.query(..., { type: QueryTypes.SELECT })` arrives as `typeof "string"`, with `1 + degree` evaluating to `"14"`. `degree` must be coerced with the existing `toNumber` helper before it reaches the formula, or `2 / Math.log2(1 + "2")` evaluates against a string and the arithmetic is wrong in a way no type error catches. The coercion belongs in `riskLink.utils.ts` with the others, so the provider receives real numbers.

---

## 9. Performance

One query per recompute job, matching what tier 0 already does with `getRiskScoringRowsQuery`. The backfill runs one job per risk, so an org with N risks issues N of these — the same multiplication A1 already accepted and shipped.

The query is a ten-table `UNION ALL` filtered by `organization_id`, and every one of those tables is indexed on `organization_id`. No new index is part of this spec. If a large org later shows this in the slow log, the fix is a covering index or a per-org cache with a short TTL, and it can be added without touching the provider — the seam is `getStructuralNeighboursQuery`. Building either now would be optimizing an unmeasured load.

---

## 10. Files

**Create:**

| File | Responsibility |
|---|---|
| `Servers/services/riskLinks/providers/structuralGraph.ts` | Rarity arithmetic, cap, `detail` string. No SQL. |
| `Servers/services/riskLinks/tests/structuralGraph.spec.ts` | §7.1. |

**Modify:**

| File | Change |
|---|---|
| `Servers/utils/riskLink.utils.ts` | `getStructuralNeighboursQuery` + `StructuralNeighbourRow` coercion. |
| `Servers/services/riskLinks/types.ts` | `StructuralNeighbourRow`. A1 keeps row shapes here and their coercion in the utils file; follow that. |
| `Servers/services/riskLinks/recompute.ts` | Register the provider; the failure `catch` rethrows and `anyProviderSucceeded` is deleted. |
| `Servers/services/riskLinks/tests/recompute.spec.ts` | §7.2. |
| `Servers/utils/__tests__/riskLink.utils.test.ts` | §7.3. |
| `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts` | §7.4. |
| `Servers/tests/factories/test-entities.factory.ts` | `attachRiskToEuControl(orgId, riskId, controlId)` — one insert into `controls_eu__risks`, for §7.4. One table, not a generic helper: `controls_eu__risks` has no foreign key on `control_id`, so the test needs no `controls_eu` row, and one element type exercises every branch of the query. |
| `docs/technical/domains/risk-management.md` | Document tier 1 and the new failure rule. |

No migration. No route, controller, or swagger change — `npm run check:api-drift` must still report 705/705. Nothing under `Clients/`.

---

## 11. What A2b adds

Recorded so this phase's seams are built to carry it, not so it gets built now.

- **`embedding` provider (tier 2).** `text-embedding-3-small`, 1536 dims, cosine in JS, a `risk_embeddings` JSONB cache keyed by `source_hash`, no pgvector — following `Servers/advisor/evidenceAnalyzer/embeddingMatcher.ts`.
- **Org-scoped key resolution inside a worker.** Every existing embedding caller takes its key from request context. A background job has none, so A2b resolves it per org from `llm_keys` via `getLLMKeysWithKeyQuery`, and only for OpenAI-compatible providers — Anthropic exposes no embedding endpoint through `@ai-sdk/openai`.
- **"Cannot run" versus "failed".** No key configured returns `[]` and the run proceeds on tiers 0 and 1. An embedding call that errors throws and aborts the run, per §5.

Neither changes the table, the lifecycle rules, or the API.
