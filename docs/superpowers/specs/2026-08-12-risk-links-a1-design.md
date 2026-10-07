# Risk links A1 — persistent link store and field-overlap engine

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-08-12
> **Scope:** Backend only. Persistent `risk_links` table, recompute engine, three API endpoints.
> **Supersedes:** the client-side scoring half of `2026-08-11-risk-inheritance-design.md`

---

## 1. Summary

Risk-to-risk relations become **persistent and reviewable** instead of derived on every render. A background engine scores every risk against the org's other risks after each save and writes the results to a `risk_links` table as `suggested` edges. A human confirms or dismisses each suggestion, and that judgement survives every later recompute.

Phase 1 (`2026-08-11-risk-inheritance-design.md`) computed the same relations in the browser and stored nothing. Its scoring function moves to the server; the client module is deleted.

---

## 2. Where this sits

The full request — a persistent linked-risks list, an inheritance engine, and an agent that recommends and executes — decomposes into three subsystems, built in order:

| | Subsystem | Contents |
|---|---|---|
| **A** | Link store + engine | Edge table, scoring, keeping it current |
| **B** | Linked risks UI | Persistent list, graph view, manual linking |
| **C** | Risk inheritance agent | Recommendation generation and execution |

A is itself two phases:

- **A1 (this spec)** — edge store, field-overlap provider, worker infrastructure, three endpoints.
- **A2** — structural-graph and embedding providers. Same table, same provider interface, its own spec.

A1 defines the provider interface so A2 plugs in without reshaping anything.

### Out of scope for A1 (explicit — do NOT build)

- Any UI. A1 is backend only; the list, the graph, and manual linking are B.
- `POST /riskLinks` (manual link creation) — deferred to B, where its UI lives. The schema supports `source='user'` from day one and will not need to change.
- Structural-graph and embedding providers — A2.
- LLM link inference and recommendation text — C.
- Vendor risks and model risks. Project risk ↔ project risk only.
- Propagation. Nothing writes to a linked risk's fields. Ever, in any phase — the engine surfaces, the human decides.
- Deriving `inherits_from`, `duplicates`, or `shares_control`. See §4.
- Configurable signal weights. Fixed, in code.
- An `engine_version` column. `last_computed_at` plus an org-wide recompute covers weight changes.

---

## 3. Architecture

```
risks.ctrl.ts  ──commit──▶  enqueue risk-link-recompute {riskId, orgId}
                                        │
                              BullMQ worker (automation-actions queue)
                                        │
                          providers, in cost-tier order
                               fieldOverlap  (tier 0, A1)
                               structuralGraph (tier 1, A2)
                               embedding     (tier 2, A2)
                                        │
                              merge → threshold → prune
                                        │
                                 risk_links UPSERT
```

Three integration points, all following existing patterns.

### 3.1 Trigger

`createRiskService` takes a transaction, it does not open one — "Caller is responsible for committing." The controller owns the transaction: `Servers/controllers/risks.ctrl.ts:246` opens it and commits at `:263` (create), `:518` (update), `:679` (delete). Bulk uses a managed transaction at `:797`.

The controller already has a post-commit side-effect block — `logEvent`, `recordPortfolioSnapshot(...).catch(...)` fire-and-forget, `notifyUserAssigned`. The enqueue call is one more line in that block, in the same fire-and-forget shape.

**Second write path:** `Servers/advisor/aiActions/createRisk/execute.ts:128` calls the same service inside the approval transaction. Its enqueue belongs after the approval flow's commit. Wiring only the controller leaves agent-created risks permanently unlinked.

**Why fire-and-forget:** if Redis is down, the user's risk save must still succeed. An enqueue failure is logged; the links are picked up on the next save or by a manual recompute.

### 3.2 Queue

No new queue. `Servers/services/automations/automationProducer.ts:6` already defines a single `automation-actions` queue with a producer module; `enqueueRiskLinkRecompute` joins it as a sibling export.

**Deduplication:** `jobId: risk-link:${riskId}` — two rapid saves of the same risk collapse to one pending job. One line, cheaper than a lock.

### 3.3 Worker

A handler in the `automationWorker.ts` pattern, inheriting its existing retry and backoff settings. No new retry policy.

---

## 4. Data model

```sql
CREATE TABLE verifywise.risk_links (
  id                 SERIAL PRIMARY KEY,
  organization_id    INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
  source_risk_id     INTEGER NOT NULL REFERENCES verifywise.risks(id) ON DELETE CASCADE,
  target_risk_id     INTEGER NOT NULL REFERENCES verifywise.risks(id) ON DELETE CASCADE,
  relation_type      VARCHAR(30) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'suggested',
  source             VARCHAR(20) NOT NULL,
  score              NUMERIC(6,3) NOT NULL DEFAULT 0,
  reasons            JSONB NOT NULL DEFAULT '[]',
  created_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
  decided_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
  decided_at         TIMESTAMPTZ,
  last_computed_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT risk_links_no_self CHECK (source_risk_id <> target_risk_id),
  CONSTRAINT risk_links_canonical CHECK (
    relation_type = 'inherits_from' OR source_risk_id < target_risk_id
  ),
  CONSTRAINT risk_links_unique UNIQUE (source_risk_id, target_risk_id, relation_type)
);
CREATE INDEX ON verifywise.risk_links (organization_id, source_risk_id, status);
CREATE INDEX ON verifywise.risk_links (organization_id, target_risk_id, status);
```

Migration timestamp comes from `date +%Y%m%d%H%M%S`; DDL uses the explicit `verifywise.` prefix per `Servers/CLAUDE.md`. `down` drops the table.

### 4.1 Canonical ordering

`risk_links_canonical` prevents duplicated undirected pairs **at the database level**: undirected types must be stored with `least(a,b), greatest(a,b)`; `inherits_from` is exempt because direction is meaningful there. A constraint rather than application discipline, because three separate writers reach this table (engine, user, agent).

Stored twice, every undirected suggestion would appear twice in the UI.

### 4.2 Relation types

| Type | Direction | Derived by A1? |
|---|---|---|
| `related_to` | undirected | **Yes** — the engine's only output |
| `inherits_from` | **directed** | No. Direction cannot be inferred from field overlap; a user or the agent sets it |
| `duplicates` | undirected | No. Needs a high threshold; A2's embedding provider may produce it |
| `shares_control` | undirected | No — unproducible today, see §5.2. Opens up when the risk form gains a control picker |

Stated explicitly so the implementation plan does not attempt four scorers. The column is a VARCHAR; the unused values cost nothing and B and C can write all four from day one.

### 4.3 Column notes

- `reasons` is structured, not prose: `[{"signal":"category","weight":3,"detail":"Bias & Fairness"}]`. The UI can re-render or localize it and the agent can reason over it.
- `score` is NUMERIC because A1 produces integers (1–10) and A2's embedding provider will produce fractions.
- `risks` uses soft delete (`is_deleted`), so `ON DELETE CASCADE` almost never fires. **Read queries must filter both endpoints on `is_deleted = false`** — easy to miss, and it fails silently.

---

## 5. Provider interface and scoring

### 5.1 Interface

```ts
interface LinkSignal {
  signal: string;        // "category" | "control" | "assessment" | "phase" | "project" | ...
  weight: number;
  detail?: string;       // "Bias & Fairness", "AC-1" — lands in reasons JSONB
}

interface LinkCandidate {
  targetRiskId: number;
  score: number;
  reasons: LinkSignal[];
}

interface RecomputeContext {
  organizationId: number;
  subject: RiskScoringRow;
  candidates: RiskScoringRow[];   // org's active risks, tenant-filtered, scoring columns only
}

interface LinkSignalProvider {
  name: string;
  tier: 0 | 1 | 2;       // 0 = rows already in memory, 1 = extra SQL, 2 = network/LLM
  score(ctx: RecomputeContext): Promise<LinkCandidate[]>;
}
```

The interface is **batch, not pairwise** — A2's embedding provider cannot make one network call per pair. `candidates` is ready-to-use data for tier 0 and a candidate universe (id allowlist) for tiers 1 and 2, which issue their own SQL.

**Providers return points on a shared scale, not raw similarities.** Normalization is the provider's job (A2 maps cosine ≥ 0.85 to 3 points, and so on). This keeps the merge step dumb: group by `targetRiskId`, sum scores, concatenate reasons.

**Symmetry invariant:** for undirected types, `score(A,B) == score(B,A)`. All five field-overlap signals are symmetric (intersection and equality), and so is cosine. A2's structural graph must be defined symmetrically (shared-neighbour counting). Pruning is unstable without this — see §5.3.

### 5.2 The `fieldOverlap` provider

A near-verbatim server port of the phase-1 pure function, with the same weights:

| Signal | Condition | Points |
|---|---|---|
| Shared category | `risk_category` arrays intersect | 3 |
| Shared control | `controls_mapping` equal, non-empty, **not `"0"`** | 2 |
| Shared assessment | `assessment_mapping` equal, non-empty, **not `"0"`** | 2 |
| Same lifecycle phase | `ai_lifecycle_phase` equal | 2 |
| Shared project | `projects` arrays intersect | 1 |

**The `"0"` guard must be carried over.** The risk form has no control or assessment picker: `useRiskForm.ts` hardcodes `0` and `RiskDatabaseModal` sends `DEFAULT_VALUES.*_MAPPING`, also `0`, so every UI-created risk stores `"0"` in these text columns. Without the guard, every pair of UI-created risks gets a bogus +4 and the bug fixed in `49363ed7b` returns. Drop the guard when the form gains a real picker — which is also when `shares_control` becomes derivable.

The provider returns candidates unsorted and uncapped. Ranking, the threshold, and the cap belong to §5.3, because they have to run across all providers' merged output, not one provider's.

Scoring runs in JS, not a SQL self-join: the worker loads the rows for the other providers anyway, array intersection in SQL is longer, and the JS version already exists and is tested. The `SELECT` pulls only the scoring columns.

**The engine does not produce recommendation text.** Phase 1's `mitigation_plan` → template-sentence fallback is not ported; the engine writes structured `reasons` and rendering them as prose belongs to B or C. This also removes the phase-1 oddity where the demo seed's `mitigation_plan: "In Progress"` surfaced as a recommendation.

### 5.3 Merge, threshold, prune

"Incident to the subject" below means an edge with the subject at **either** endpoint.

1. Run providers in tier order, merge on `targetRiskId`: sum scores, concatenate reasons.
2. Load the subject's existing incident edges.
3. **Keepers** = merged candidates scoring `>= 3`, sorted by score descending with ties broken by `targetRiskId` ascending, capped at the top 20.
4. In one transaction:
   - `UPSERT` the keepers. New rows get `source='derived'`, `status='suggested'`. Existing rows get `score`, `reasons`, and `last_computed_at` only.
   - For existing incident edges with `status` of `confirmed` or `dismissed` that are **not** keepers, write the merged score and reasons anyway — `0` and `[]` when the pair produced no candidate at all. Never `status`. This is R2.
   - Delete the remaining incident `source='derived' AND status='suggested'` edges.

**The threshold decides what gets created; step 4's second bullet is what keeps a decided edge's score honest after it stops matching.**

**Why threshold and prune at all:** in an org where 200 risks all carry "Bias & Fairness", an unthresholded, unpruned run writes 39,800 rows.

**The 20 cap bounds one run, not a risk's total edge count.** Risk X can appear in many other risks' top 20, so its incident count can exceed 20. The bound is `20n` rather than `n²`, which is the point.

**Why pruning does not thrash:** the score is symmetric, so A's computation and B's computation produce the same number. They can only disagree on rank, and rank follows deterministically from the data.

**Tie-breaking changed from phase 1.** Phase 1 broke ties by risk level, then id. A1 breaks them by `targetRiskId` alone — with a cap of 20 rather than 5, which edges get cut barely matters, and display ordering by risk level is B's job. Do not "restore" the risk-level tiebreak.

### 5.4 Provider failures

Each provider runs in its own `try/catch`; one failure is logged and the rest continue.

**If all providers fail, nothing is written and nothing is deleted.** An empty result must be distinguishable from a failure — otherwise one transient Redis or DB hiccup wipes every `suggested` edge in the org. The delete step runs only when at least one provider completed successfully.

---

## 6. Lifecycle rules

**R1 — Dismissal survives recompute.**
Keyed on `(source_risk_id, target_risk_id, relation_type)`. Recompute updates `score`, `reasons`, and `last_computed_at` **in place**; it **never** touches `status`, `decided_by_user_id`, or `decided_at`.

Worked example: risk 7 is dismissed against risk 3. The user then edits risk 3 so the two also share a control. The score rises from 3 to 5, "Shared control" is appended to the reasons, and the status stays `dismissed`. "Not relevant" has to mean permanently not relevant; anything else reads as broken.

**R2 — The threshold gates creation, not updating.**
`score < 3` prevents a new edge from being **created**. An existing `confirmed` or `dismissed` edge is still written when its score falls below the threshold. This is deliberate: a `confirmed` edge whose score has dropped to 0 is something the user should see and reconsider.

**R3 — `confirmed` edges are never pruned or deleted.**
Pruning touches only `source='derived' AND status='suggested'` rows. When a human says two risks are related, the engine does not get to overrule them.

**R4 — `source` and `status` are orthogonal.**
`source` records who **created** the edge; `status` plus `decided_by_user_id` record who **judged** it. A user confirming a derived edge leaves `source='derived'`. If the engine later re-derives a user-created edge, `source` stays `user` while `score` and `reasons` get filled in.

**R5 — Initial status depends on source.**

| `source` | Initial `status` | Why |
|---|---|---|
| `derived` | `suggested` | The engine suggests; it does not decide |
| `user` | `confirmed` | A human created it explicitly; asking them to confirm their own link is absurd |
| `agent` | `suggested` | Agent proposals need human judgement. An agent wanting a `confirmed` edge goes through the existing `aiActions` approval gate |

**R6 — Transitions.**
`suggested → confirmed`, `suggested → dismissed`, and `confirmed ↔ dismissed` (people change their minds). `dismissed → suggested` only via an explicit undo that clears the `decided_*` fields — **never automatically**. This is R1's escape hatch: no automatic un-dismissal, always a manual one. Any other transition is rejected with a 400.

**R7 — Deleted risks.**
Soft-deleted risks keep their edges, because the risk can be restored. The read query filters **both endpoints** on `is_deleted = false`. Deleting a risk does not trigger recompute for its neighbours — the read filter already handles it.

---

## 7. Backfill

After the migration the table is empty. Phase 1's design doc warned about exactly this trap: a store that stays empty until users do the work "would show nothing for weeks."

`POST /riskLinks/recompute` fans out one job per active risk in the org. Run once after deploy, and again if weights change.

No hidden trigger inside a `GET` — that is a silent side effect and a thundering herd.

---

## 8. API

| Endpoint | Behaviour |
|---|---|
| `GET /riskLinks/:riskId` | That risk's edges, **in both directions** — rows where `:riskId` is the source or the target. Both endpoints filtered on `is_deleted = false`. Defaults to `status IN ('suggested','confirmed')`; `?status=dismissed` returns the dismissed ones |
| `PATCH /riskLinks/:id` | `{ status }` — writes `decided_by_user_id` and `decided_at`. Applies R6's transitions and rejects anything else with a 400 |
| `POST /riskLinks/recompute` | Admin fan-out (§7) |

**Response shape is normalized to the caller's perspective.** Each row returns `relatedRisk` — the *other* endpoint's display fields — regardless of which column it sat in, plus `direction` (`outgoing` | `incoming` | `undirected`) so B can render `inherits_from` correctly without knowing the column layout. Without this, every consumer re-implements the "which end am I?" branch.

No delete endpoint: a mistaken link is dismissed. One code path for "make it go away", not two.

### 8.1 RBAC

`Servers/routes/risks.route.ts` is looser than expected — no role gate on any single-risk write endpoint, only `authenticateJWT`. The one exception is bulk update, `authorize(["Admin", "Editor"])` at `:25`.

A1 matches that convention rather than tightening it:

- `GET` and `PATCH` → `authenticateJWT`, same as the single-risk write endpoints.
- `POST /riskLinks/recompute` → `authorize(["Admin"])`, following the bulk precedent and because it is an expensive fan-out.

The inconsistency on the risks route is real but out of scope here; it should be raised separately.

### 8.2 Generated API docs

New routes require `npm run generate:swagger`, `npm run generate:endpoints`, and `npm run check:api-drift`, with the regenerated files committed. The `api-docs-drift` CI job fails otherwise.

---

## 9. Error handling

| Situation | Behaviour |
|---|---|
| Enqueue fails (Redis down) | Logged; the request still succeeds. A risk save does not fail over a suggestion list |
| One provider throws | Logged; the rest continue |
| **All providers throw** | Nothing written, **nothing deleted** (§5.4) |
| Job throws | Inherits `automationWorker`'s existing retry and backoff |
| Two jobs write the same edge | `ON CONFLICT ... DO UPDATE` — idempotent by construction |
| Risk deleted between enqueue and run | The job exits quietly. Not an error |
| Canonical ordering violated | The CHECK rejects it. A programming error, impossible after the canonicalize helper; pinned by a test |

---

## 10. Testing

**Migrating the 13 phase-1 tests.** Most port, but not all — the responsibilities split differently on the server, so the plan must handle each group deliberately rather than assuming a clean move.

| Phase-1 test | Fate |
|---|---|
| Ranks a higher score above a lower one | Ports (assert scores, not order — ordering is now §5.3's) |
| Excludes the subject by id | Ports |
| Returns empty when nothing matches | Ports |
| Two empty mappings do not match | Ports |
| The `"0"` sentinel does not match | Ports — the regression guard |
| Case-insensitive, ignores surrounding space | Ports |
| Names the matched values | Ports, asserting structured `LinkSignal`s instead of badge strings |
| Tolerates missing array fields | Ports |
| Caps the result at 5 | **Moves** to the merge/prune unit, cap 20 |
| Breaks ties by risk level, then id | **Changes** — ties break by `targetRiskId` alone (§5.3) |
| Uses `mitigation_plan` as the recommendation | **Deleted** with the recommendation logic (§5.2) |
| Falls back to the highest-weight template | **Deleted** |
| Falls back to the control template | **Deleted** |

**Other unit tests**

- Canonicalize helper: undirected pairs normalize; `inherits_from` passes through unchanged.
- Merge / threshold / prune: a sub-threshold pair creates no edge, but a sub-threshold pair with an existing `dismissed` edge still gets its score written (R2); the top-20 cut is deterministic; `confirmed` rows survive pruning (R3).
- **All providers failing does not delete.** This is the one silent-catastrophe path.

**Integration** (Jest, in the `Servers/controllers/__tests__/` convention)

- Recompute writes edges; re-running after a field change updates `score` and `reasons` in place and leaves `dismissed` untouched (R1). The whole design hangs on this rule, and an untested rule is not a rule.
- **Tenant isolation:** org A's recompute never links org B's risks. `docs/technical/security/tenant-isolation.md` makes this mandatory.
- Controller tests for the three endpoints, following `risks.ctrl.test.ts`.

---

## 11. Files

| File | Change |
|---|---|
| `Servers/database/migrations/<ts>-risk-links.js` | New — §4 DDL |
| `Servers/services/riskLinks/types.ts` | New — §5.1 interfaces |
| `Servers/services/riskLinks/providers/fieldOverlap.ts` | New — port plus the `"0"` guard |
| `Servers/services/riskLinks/recompute.ts` | New — merge, threshold, prune, write |
| `Servers/utils/riskLinks.utils.ts` | New — SQL: candidate rows, upsert, prune, read |
| `Servers/controllers/riskLinks.ctrl.ts` | New — three endpoints |
| `Servers/routes/riskLinks.route.ts` | New — registered in `app.ts` |
| `Servers/services/automations/automationProducer.ts` | `enqueueRiskLinkRecompute` |
| `Servers/services/automations/automationWorker.ts` | Handler registration |
| `Servers/controllers/risks.ctrl.ts` | Enqueue after commit — create, update, delete, bulk |
| `Servers/advisor/aiActions/createRisk/execute.ts` | Enqueue after the approval commit |
| `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` | Regenerated (§8.2) |
| `Clients/src/application/tools/relatedRisks.ts` and its tests | **Deleted** — tests move to the server port |
| `Clients/src/presentation/components/RelatedRisksSummary/` | **Deleted** — B replaces it |
| `Clients/src/presentation/pages/RiskManagement/index.tsx` | Remove the post-save modal wiring |
| `docs/technical/domains/risk-management.md` | Update — it currently documents the client-side scoring being removed |

---

## 12. What A2 adds

Recorded so A1's interface is built to carry it, not so it gets built now.

- **`structuralGraph` provider (tier 1).** Shared projects, frameworks, and subclauses via FK traversal. Starting point: `getAllRisksQueryWithRelationships` at `Servers/utils/risk.utils.ts:141`, which already aggregates all three. Must be symmetric (§5.1).
- **`embedding` provider (tier 2).** Follows `Servers/advisor/evidenceAnalyzer/embeddingMatcher.ts` — `text-embedding-3-small`, 1536 dims, cosine in JS, JSONB cache keyed by `source_hash`. No pgvector. May produce `duplicates` edges above a high threshold.

Neither changes the table, the lifecycle rules, or the API.
