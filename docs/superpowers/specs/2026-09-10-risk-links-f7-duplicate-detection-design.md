# F7 — Risk dedup: duplicate candidate report

> Roadmap item 8, verbatim:
> *"Risk dedup & merge — Aynı risk iki yerde. fieldOverlap scorer'ı zaten var
> ama sadece link öneriyor. Aynı risk_description + risk_category ile iki risks
> satırı varsa merge önerisi (keep one, link other as duplicate). Büyük org'larda
> 50+ vendor'da kaos çözücü."*

**Status:** approved 2026-09-10. Phase 1 (detect + report) implements.
Phase 2 (execute the merge) designed in §8, deferred on evidence.

---

## 1. What this is

A **read-only report**: `GET /api/riskLinks/duplicates` returns pairs of risks
that look like the same risk entered twice, ranked by text similarity, with the
reasons shown. A human reads it and cleans up by hand.

**No rows are written. No migration. No new `relation_type`.** That is the whole
design decision, and §2 is why.

---

## 2. Why not the roadmap's mechanism

Three separate findings, each verified against the live dev database
(org 1, 33 active risks, 528 distinct pairs).

### 2.1 Exact match fires on nothing

The roadmap's rule is "same `risk_description` + `risk_category`".

```
dup_groups (exact, lower+trim on description, same category): 0
near_groups (same category + same first 25 chars of name):    0
```

Zero. And this is not a demo-data artifact: two humans entering the same risk
write it in their own words. An exact-string rule is the one rule guaranteed
not to catch the case the roadmap is describing.

### 2.2 The existing scorer cannot detect duplicates

`services/riskLinks/providers/fieldOverlap.ts` scores five signals. Two of them
have no data at all:

| Signal | Weight | Usable rows / 33 |
|---|---|---|
| `shared_category` | +3 | 33 |
| `shared_control` (`controls_mapping`) | +2 | **0** |
| `shared_assessment` (`assessment_mapping`) | +2 | **0** |
| `same_lifecycle_phase` | +2 | 33 |
| `shared_project` | +1 | 33 |

`sameText` rejects `""` and `"0"`, and `controls_mapping` / `assessment_mapping`
are NULL on every risk — the risk form has no control or assessment picker.

So the maximum score any real pair can reach is **3 + 2 + 1 = 6**, not 10.
Measured across all 528 pairs:

```
max_pair_score = 6    pairs >= 8: 0    pairs >= 6: 5    pairs >= 4: 60
```

A threshold of 8 would never fire. And the five pairs that *do* reach the
maximum are not duplicates:

| Risk A | Risk B |
|---|---|
| Applicant appeal backlog | Incident response playbook missing AI |
| PII echoed back in transcripts | Prompt injection via ticket text |
| Escalation to a human fails silently | Incident response playbook missing AI |
| Off-label use outside triage | Audit trail incomplete for triage decisions |
| Shadow AI usage by staff | Third-party sub-processor unvetted |

These are topical neighbours — same category, same lifecycle phase, same
project. That is precisely what the scorer was built to find, and F1/C6 already
ships it as `related_to`. **The scorer never reads `risk_name` or
`risk_description`** (`RiskScoringRow`, `services/riskLinks/types.ts:21`, carries
only id, category, the two mapping columns, lifecycle phase and projects).
A duplicate is by definition two rows that *say the same thing*; a scorer with
no text signal cannot see it.

### 2.3 Why not a `duplicate_of` row in `risk_links`

Three reasons, in ascending order of severity.

**Encoding.** `relation_type` is a bare varchar with no value CHECK, so a new
value needs no type migration. But `risk_links_canonical` —

```sql
CHECK (relation_type = 'inherits_from' OR source_risk_id < target_risk_id)
```

— forces canonical ordering on everything else. Verified by probe:

```
INSERT ... (9507, 9503, 'duplicate_of') -> ERROR: violates risk_links_canonical
INSERT ... (9503, 9507, 'duplicate_of') -> INSERT 0 1
```

So a `duplicate_of` row is structurally **undirected**: it cannot encode
"keep 9503, drop 9507". Exactly the wrong shape for a merge suggestion.

**Spillover into two shipped features.** Neither of these filters
`relation_type`:

- `getRiskGraphQuery`, `utils/riskLink.utils.ts:807-844` — F3's inheritance
  graph selects every link for the org and orders by `relation_type`. A
  `duplicate_of` row appears in the graph immediately, as an edge type the
  renderer has no styling for.
- `getDismissalAnalyticsQuery`, `utils/riskLink.utils.ts:923` — F4 groups by
  `relation_type` with no filter. Duplicate suggestions would silently enter
  the precision numbers that F4 exists to measure.

Adding the relation type means editing both, i.e. a feature that writes no rows
would still carry regression risk into two finished features. The report writes
nothing and touches neither.

**TypeScript.** `RiskLinkRelationType = "related_to" | "inherits_from"`
(`services/riskLinks/types.ts:59`). Widening it is cheap and the compiler finds
every consumer — this one is a non-problem, noted only so nobody re-derives it.

### 2.4 What we do instead

Detect duplicates with the signal that actually discriminates — **text** — and
present the result as a report. §3.2 sets the threshold from measurement, not
assumption: the noise floor was computed over all 528 real pairs and the signal
level over hand-written duplicate pairs, and the chosen configuration separates
them completely.

---

## 3. The matcher

### 3.1 Tokens

For each active risk, build a token set from `risk_name || ' ' || risk_description`:

- lowercase, strip everything but `[a-z0-9 ]`, split on whitespace
- drop tokens of length **<= 2** (kills "an", "in", "at", "of", "AI")
- de-duplicate — it is a **set**, not a bag

The cutoff is 2, not 3, and this was measured. At `<= 3` the filter also eats
"bias", "data", "logs", "gap", "PII" — real content words in this domain — and
one of the three test duplicate pairs drops from 0.27 to 0.17, below any usable
threshold. Moving the cutoff to 2 costs nothing on the noise side (§3.2).

Field sizes on live data: names average 4.6 words, descriptions 9.9, and every
risk has both (`empty_desc = 0`). A combined set of roughly 8-12 significant
tokens is enough for a stable Jaccard.

### 3.2 Score

```
jaccard(a, b) = |A ∩ B| / |A ∪ B|
```

`DUPLICATE_SIMILARITY_THRESHOLD = 0.25`, chosen from measurement.

**Noise floor** — Jaccard over `risk_name + risk_description`, tokens of length
> 2, across all 528 pairs of the 33 live risks, an org with no duplicates in it:

```
max = 0.23   2nd = 0.14   3rd = 0.13   p99 = 0.07
pairs >= 0.25 : 0 of 528
```

**Signal level** — four hand-written duplicate pairs (the same risk reworded)
and two pairs that share a category and a project but mean different things:

| Pair | Score |
|---|---|
| Retention wording A / B | 0.56 |
| Bias-in-scoring A / B | 0.30 |
| Borderline: human-handoff A / B | 0.29 |
| Model-card A / B | 0.27 |
| **False positive** — PII in transcripts / prompt injection | **0.00** |
| **False positive** — shadow AI / unvetted sub-processor | **0.00** |

At 0.25 the report catches **4 of 4** true pairs, admits **0 of 2** false
positives, and flags **0 of 528** noise pairs. That is complete separation, and
it is why the number is 0.25 and not a rounder guess.

Two things this measurement also shows, worth stating so nobody re-derives them:
duplicates land far lower than intuition suggests (0.27-0.56, not 0.8+) because
two people describing one risk share only content words; and the false positives
score exactly **0.00**, meaning the failure mode of this matcher is missing a
duplicate, never inventing one. For a report a human reads, that is the right
direction to fail in.

It is a single exported constant so it can be tuned without touching logic.

Guard: if either token set is empty after filtering, the pair scores 0 and is
skipped. Never divide by zero.

### 3.3 Blocking — only compare risks that share a category

Generating all pairs is O(n²): 33 risks is 528 pairs, but 5000 risks is 12.5
million. Compare only risks that share at least one `risk_category` value.

This is safe here and semantically right: two rows describing the same risk are
in the same category, and on live data **every risk has a category**
(`no_category = 0`, max 2 categories per risk). Largest bucket is 10 risks
(Operational risk), so the real pair count per bucket is 45.

`MAX_DUPLICATE_PAIRS = 2000` caps the total scored pairs regardless, and
`MAX_DUPLICATE_RESULTS = 50` caps what the endpoint returns.

> `ponytail:` category blocking plus a hard pair cap. If an org ever has a
> single category bucket in the thousands this degrades to the cap and silently
> reports less; the upgrade path is pg_trgm with a GIN index, which is a
> migration and was deliberately not taken in phase 1.

### 3.4 The field score rides along as context, not as the gate

For each pair that clears the text threshold, also report the `fieldOverlap`
signals (shared category, shared project, same lifecycle phase). They do not
decide anything — §2.2 proved they cannot — but they tell the reader *"and these
two are also in the same project"*, which is what makes the report actionable.

---

## 4. The query

One read, no joins into the link tables. Projects come along because §3.4 wants
them.

```sql
SELECT r.id,
       r.risk_name,
       r.risk_description,
       r.risk_category::text[]         AS risk_category,
       r.ai_lifecycle_phase::text      AS ai_lifecycle_phase,
       r.risk_owner,
       COALESCE(
         (SELECT array_agg(DISTINCT pr.project_id)
            FROM projects_risks pr
           WHERE pr.risk_id = r.id
             AND pr.organization_id = :organizationId),
         ARRAY[]::integer[]
       )                               AS projects
  FROM risks r
 WHERE r.organization_id = :organizationId
   AND r.is_deleted = false
 ORDER BY r.id
 LIMIT :limit
```

Traps:

1. **`ai_lifecycle_phase` is a Postgres enum**, not text. `trim()` and `lower()`
   on it fail with `function ... does not exist`. Cast with `::text` in the
   SELECT, as above.
2. **`risk_category` is an array column** (`text[]`-ish, max 2 values per row on
   live data). Cast `::text[]` and treat it as an array in JS — not a string.
3. `LIMIT` is `MAX_DUPLICATE_SCAN = 2000` risks. An org past that gets a
   truncated scan, which the response reports honestly (§5).

---

## 5. The service and the endpoint

New file `Servers/services/riskLinks/duplicates.ts`.

```ts
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.25;  // see §3.2 — measured, not chosen
export const MAX_DUPLICATE_SCAN = 2000;
export const MAX_DUPLICATE_PAIRS = 2000;
export const MAX_DUPLICATE_RESULTS = 50;

export interface DuplicateCandidate {
  risk_a: { id: number; risk_name: string; risk_owner: number | null };
  risk_b: { id: number; risk_name: string; risk_owner: number | null };
  similarity: number;          // rounded to 2 decimals
  shared_tokens: string[];     // the intersection, for "why"
  also_shares: string[];       // e.g. ["category: Operational risk", "project"]
}

export interface DuplicateReport {
  organization_id: number;
  scanned: number;             // risks read
  compared: number;            // pairs actually scored
  truncated: boolean;          // hit MAX_DUPLICATE_SCAN or MAX_DUPLICATE_PAIRS
  candidates: DuplicateCandidate[];
}

export async function findDuplicateCandidates(
  organizationId: number,
): Promise<DuplicateReport>;
```

`risk_a` is always the lower id. Results sort by `similarity` descending, then
by `risk_a.id`, so the output is stable between calls.

**Endpoint.** `GET /api/riskLinks/duplicates` → `getDuplicateCandidates` in
`controllers/riskLinks.ctrl.ts`, copying `getDismissalAnalytics` (line 325)
exactly: `logProcessing` / `logSuccess` / `logFailure`, `STATUS_CODE[200](...)`,
500 on throw. Read-only, so `authenticateJWT` only — no `authorize(["Admin"])`,
matching `/dismissals`.

**Routing trap.** `routes/riskLinks.route.ts` declares `router.get("/:riskId", ...)`.
A route registered after it is swallowed by the param route. `GET /duplicates`
must be declared **before** `/:riskId`, next to the existing `/dismissals` line.

Swagger and the endpoint registry are generated, never hand-edited:
`npm run generate:swagger && npm run generate:endpoints`, then
`npm run check:api-drift`.

---

## 6. Seed data

The detector has nothing to prove itself against — the dev org has zero
duplicates by construction. Add `Servers/seed_risk_duplicates_demo.sql`
alongside the existing `seed_risk_links_demo.sql`:

- two obvious duplicates (same meaning, different wording, same category)
  landing around **0.3-0.55** — the range §3.2 measured for real duplicates
- one borderline pair just under 0.25, which must **not** appear
- one pair that shares a category and a project but says different things,
  which must **not** appear and should score ~0.00 — this is the §2.2 false
  positive, and it is the point of the whole seed

Risks go in ids **9560-9579**. `seed_risk_links_demo.sql` owns 9500-9599 for
risks and clears the whole block on every run; the F7 seed must delete only its
own narrow range or it wipes the Feature 1-5 demo data.

---

## 7. Out of scope

- **No `risk_links` rows**, no `duplicate_of` relation type. §2.3.
- `getRiskGraphQuery` and `getDismissalAnalyticsQuery` are **untouched** and
  stay correct, because nothing new enters `risk_links`.
- Vendor risks and model risks. The same text signal would work; nothing asks
  for it.
- Frontend. The endpoint returns JSON; no client file changes in phase 1.
- pg_trgm. Available on this server but not installed; installing it is a
  migration and §3.3 does not need it.

---

## 8. Phase 2 (deferred) — actually executing the merge

Repointing every row from the loser to the winner and soft-deleting the loser.
Deferred, on evidence.

**18 tables reference `risks(id)`. Only 5 have a foreign key.**

With FK (`ON DELETE CASCADE` protects them):
`projects_risks`, `frameworks_risks`, `subcontrols_eu__risks`,
`risk_links.source_risk_id`, `risk_links.target_risk_id`.

**Without any FK** — no CASCADE, no referential check, silent orphans if missed:
`controls_eu__risks`, `answers_eu__risks`, `annexcategories_iso__risks`,
`annexcontrols_iso27001__risks`, `nist_ai_rmf_subcategories__risks`,
`subclauses_iso__risks`, `subclauses_iso27001__risks`,
`custom_framework_level2_risks`, `custom_framework_level3_risks`,
`fria_risk_items`, `project_risk_change_history`.

In a compliance product an orphaned control-to-risk mapping is an audit finding,
not a bug report. A merge is a data-integrity project with its own spec: it
needs the FKs added first (or an explicit, tested repoint list), a dry-run mode,
and an undo path. `utils/bulkAction.utils.ts` already has `withBulkTransaction`,
`assertOrgOwnsIds` and `parseBulkIds` to build on.

---

## 9. Testing

**Unit** — `Servers/services/riskLinks/__tests__/duplicates.test.ts`, mocking
the query:

1. Two near-identical risks in the same category → one candidate above threshold.
2. Two risks sharing a category and a project but no wording → **no** candidate
   (the §2.2 false positive must not come back).
3. Risks in disjoint categories are never compared, even with identical text
   (blocking works).
4. A risk whose tokens all filter out (every word <= 2 chars, e.g. a name of
   `"AI on"` with no description) → no divide-by-zero, no candidate.
5. `risk_a.id < risk_b.id` always, and results are sorted by similarity desc.
6. More than `MAX_DUPLICATE_RESULTS` matches → list capped, `truncated` true.

**Integration** — `Servers/tests/integration/riskLinks.duplicates.test.ts`,
following `riskLinks.hierarchy.test.ts` and using
`tests/factories/test-entities.factory.ts`:

1. Seeded duplicate pair → returned by `GET /api/riskLinks/duplicates`.
2. Non-duplicate pair sharing category and project → absent.
3. Endpoint writes nothing: `SELECT count(*) FROM risk_links` is identical
   before and after the call.
4. Tenant isolation: a second org's identical duplicate pair never appears.
