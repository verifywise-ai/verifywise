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

- **`SELECT DISTINCT` in `active`.** None of the ten join tables has a unique constraint on its pair, so a risk can appear twice against the same element. Without the `DISTINCT`, the degree inflates and the pair join emits duplicate rows, double-counting the same evidence. With it, `COUNT(*)` is a correct degree.
- **`organization_id` on every `UNION` arm *and* on the `risks` join.** Framework struct rows are global: `eu_control:412` is the same string in every org. Omitting either filter lets two orgs' risks match on a shared global element and produces a cross-tenant edge. See §6.
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

A1 §5.1 makes `score(A,B) == score(B,A)` an invariant; pruning is unstable without it. This formula satisfies it by construction: the shared-element set is the same read from either side, and `degree` is a global property of the element, not of either risk.

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

This is the sharpest risk in A2a and the reason §3.2 filters twice.

Framework struct rows are global. Two organizations both running the EU AI Act both have risks attached to control id 412. The `element_key` string `eu_control:412` is identical across them. A query that joined on `element_key` without an organization filter would match org A's risk to org B's risk and write an edge across the tenant boundary — a data leak dressed as a feature, and one the A1 endpoints would then happily serve, since they filter by `organization_id` on `risk_links` and the row would carry the reader's own org id.

Degrees have the same shape of problem in a milder form: an unscoped `degrees` CTE would let a large org's density depress a small org's scores.

Both are covered by tests in §7, not only by review.

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
- `degree` arriving as the string `"2"` (see §8) is coerced before the arithmetic — a regression guard for `2 / log2(1 + "2")`.
- `detail` for a mixed set is ordered by count descending, then label, and pluralizes.

### 7.2 `services/riskLinks/tests/recompute.spec.ts` (modified)

- The existing *"writes nothing and deletes nothing when every provider throws"* now asserts `rejects.toThrow("boom")` alongside the unchanged no-write assertions. Under the new rule the function propagates instead of returning quietly.
- **New, and the closure of A1's third parked minor:** one provider succeeds, the other throws → nothing written, nothing pruned, the error propagates. A1 could not write this test with a single provider.

### 7.3 `utils/__tests__/riskLink.utils.test.ts` (modified)

Assert the emitted SQL carries `organization_id` on every `UNION` arm, `is_deleted = false` on the `risks` join, and a `GROUP BY` for degrees that sees only the filtered set — the same shape of assertion A1 uses for its soft-delete filters.

### 7.4 `tests/integration/tenant-isolation/riskLinks.isolation.test.ts` (modified)

Against a real database, two new cases:

- Two organizations each own a risk attached to the **same global framework element**. Recompute both. Neither org gets an edge to the other's risk, and `getRiskLinksForRiskQuery` returns nothing cross-tenant.
- One organization's element degrees are unaffected by another organization's volume: seed a second org with many risks on the same element, recompute in the first, and assert its score is what the first org's own degree predicts.

---

## 8. Type coercion at the read boundary

A1's constraint D applies unchanged. `COUNT(*)` is `bigint`, and `node-pg` returns `bigint` as a **string** to avoid silent precision loss. `degree` must be coerced with the existing `toNumber` helper before it reaches the formula, or `2 / Math.log2(1 + "2")` evaluates against a string and the arithmetic is wrong in a way no type error catches. The coercion belongs in `riskLink.utils.ts` with the others, so the provider receives real numbers.

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
| `Servers/tests/factories/test-entities.factory.ts` | A helper to attach a risk to a framework element, for §7.4. |
| `docs/technical/domains/risk-management.md` | Document tier 1 and the new failure rule. |

No migration. No route, controller, or swagger change — `npm run check:api-drift` must still report 705/705. Nothing under `Clients/`.

---

## 11. What A2b adds

Recorded so this phase's seams are built to carry it, not so it gets built now.

- **`embedding` provider (tier 2).** `text-embedding-3-small`, 1536 dims, cosine in JS, a `risk_embeddings` JSONB cache keyed by `source_hash`, no pgvector — following `Servers/advisor/evidenceAnalyzer/embeddingMatcher.ts`.
- **Org-scoped key resolution inside a worker.** Every existing embedding caller takes its key from request context. A background job has none, so A2b resolves it per org from `llm_keys` via `getLLMKeysWithKeyQuery`, and only for OpenAI-compatible providers — Anthropic exposes no embedding endpoint through `@ai-sdk/openai`.
- **"Cannot run" versus "failed".** No key configured returns `[]` and the run proceeds on tiers 0 and 1. An embedding call that errors throws and aborts the run, per §5.

Neither changes the table, the lifecycle rules, or the API.
