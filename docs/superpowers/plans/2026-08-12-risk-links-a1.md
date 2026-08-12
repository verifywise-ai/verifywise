# Risk Links A1 — Edge Store, Field-Overlap Provider, Recompute Worker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-side, throw-away "related risks" calculation with a persistent `risk_links` table that a background worker keeps up to date, exposed through three authenticated endpoints.

**Architecture:** A new `verifywise.risk_links` table stores one row per risk pair. A pluggable `LinkSignalProvider` interface lets scoring grow later (A2 adds structural-graph and embedding providers); A1 ships exactly one provider, `field_overlap`, ported from the existing client function. A BullMQ job on the shared `automation-actions` queue recomputes one risk's edges at a time, fired after every risk write that can change a scoring signal. Three REST endpoints read the edges, let a user confirm/dismiss one, and let an Admin backfill the whole org.

**Tech Stack:** Node 22, Express 4, Sequelize 6 (raw SQL via `sequelize.query`), PostgreSQL (`verifywise` schema), BullMQ + Redis, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-08-12-risk-links-a1-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

**Codebase rules (from `Servers/CLAUDE.md`):**
- Migration DDL uses the explicit `verifywise.` prefix. Application SQL (controllers, utils, services) uses **unqualified** table names — `search_path` resolves them. Never write `verifywise.risks` in application code.
- Migration timestamps come from `date +%Y%m%d%H%M%S`. Never hand-write one.
- Every tenant-scoped query filters `organization_id = :organizationId`.
- New routes require `npm run generate:swagger` + `npm run generate:endpoints`, and the regenerated files must be committed **in the same commit** as the route. The `api-docs-drift` CI job fails otherwise.
- Controllers use `logProcessing` / `logSuccess` / `logFailure` from `utils/logger/logHelper` and return `STATUS_CODE[xxx](...)`.
- Run `npm run build` in `Servers/` before considering any task done.

**Scoring rules (spec §5.2), fixed values — do not tune:**
- shared category → 3, shared control → 2, shared assessment → 2, same lifecycle phase → 2, shared project → 1.
- The `"0"` sentinel guard is **mandatory**: the risk form has no control/assessment picker and always sends `0`, which lands in those TEXT columns as `"0"`. `"0" === "0"` is *not* a shared mapping. This was a shipped regression (commit `49363ed7b`); do not drop the guard.
- Threshold `LINK_SCORE_THRESHOLD = 3`. Cap `MAX_LINKS_PER_RISK = 20`.
- Sort: score descending, ties broken by `targetRiskId` ascending. **No risk-level tiebreak** — phase 1 had one; it is deliberately dropped.
- A1 produces **no recommendation text**. Reasons are structured `LinkSignal[]`, never prose.

**Amendments to the spec, decided during planning. These override a literal reading of the spec section named:**

- **A. Pruning is by threshold, not by cap (overrides §5.3 step 4 bullet 3).** The spec prunes derived+suggested edges that are "not keepers". That thrashes: scores are symmetric but top-20 *membership* is not. If risk B has 2 candidates and risk A has 50 all scoring 5, then B's run creates edge (A,B) and A's next run deletes it, forever, in whatever order the risks happen to be saved. Fix: **delete a derived+suggested edge only when its merged score this run is `< LINK_SCORE_THRESHOLD`.** Score is symmetric, so both endpoints agree. The cap keeps its stated job — gating creation — and never causes a deletion. Consequence: a risk can end up with more than 20 stored edges (bounded by `20n` across the org), which the spec already accepts.

- **B. Enqueue matrix (resolves §11 vs. R7).** §11's file table says "create, update, delete, bulk"; R7 says deletion does not trigger recompute. R7 wins:

  | Write site | Enqueue? | Why |
  |---|---|---|
  | `createRisk`, post-commit | ✅ | A new risk has no edges yet. |
  | `updateRiskById`, post-commit | ✅ | Any scoring field may have changed. |
  | `deleteRiskById`, post-commit | ❌ | R7: edges survive soft delete, and the job would find no subject row and exit quietly (§9). Pure waste. |
  | bulk `action === "set_category"` | ✅ | Category is the 3-point signal. |
  | bulk `set_owner` / `archive` | ❌ | Owner is not a scoring signal; archive is a soft delete — same reasoning as delete. |

  **Do not "fix" this later by adding delete or `set_owner` enqueues.**

- **C. Job options are load-bearing, not decoration.** BullMQ silently ignores an `add` whose `jobId` already exists — *including a retained completed or failed job*. `jobId` without `removeOnComplete: true` is permanent suppression, not dedup: risk 7 would recompute once and never again. Both `removeOnComplete` and `removeOnFail` must be `true`. Known accepted limitation: a save arriving while that risk's job is already **active** is dropped; the next save or `POST /riskLinks/recompute` picks it up.

- **D. Postgres type coercion at the read boundary.** `NUMERIC(6,3)` comes back from `pg` as a **string**, and `JSONB` / `JSON_AGG` output can come back as a string too (`utils/risk.utils.ts:100-107` already does this dance for `projects`). `risk_category` is `verifywise.enum_projectrisks_risk_category[]` — a custom enum array whose OID `node-pg` has no parser for, so **select it as `r.risk_category::text[]`** to guarantee a JS array. Coerce all three in `riskLink.utils.ts`, never in the service or controller.

- **E. Client deletions are deferred to subsystem B (overrides §10's three deleted tests and §11's four client deletions).** A1 is server-only and purely additive. Deleting `relatedRisks.ts`, `RelatedRisksSummary/`, and the post-save modal wiring now would ship a regression window: users lose the post-save summary and get nothing rendering the new endpoints until B lands. The client module is pure and has no server dependency, so the two coexist harmlessly. B's plan removes them.

**Verified facts the tasks depend on (do not re-derive):**
- `transaction.afterCommit(fn)` exists in Sequelize 6 (`node_modules/sequelize/types/transaction.d.ts:27`) and is used nowhere else in this repo. All four callers of `processApprovalQuery` — `controllers/approvalRequest.ctrl.ts:346`, `:530`, and `advisor/functions/approvalWorkflowFunctions.ts:393`, `:423` — open a **top-level** `await sequelize.transaction()`. Nothing nests, so `afterCommit` fires on a real commit, not a savepoint release. This is why Task 7 can use it.
- Service unit tests live at `services/<subdir>/tests/*.spec.ts` (see `services/reporting/tests/`, `services/aiDetection/tests/`). Not `__tests__/`.
- `STATUS_CODE[202]` exists (`utils/statusCode.utils.ts:23`).
- `npm run test:unit` excludes `/tests/integration/`. `npm run test:integration` needs `--runInBand` and the `globalSetup`.

---

## File Structure

**Create — backend:**

| File | Responsibility |
|---|---|
| `Servers/database/migrations/<ts>-create-risk-links.js` | The `risk_links` table, its constraints and two indexes. |
| `Servers/services/riskLinks/types.ts` | Every shared type: `LinkSignal`, `LinkCandidate`, `RiskScoringRow`, `RecomputeContext`, `LinkSignalProvider`, `RiskLinkRow`, the string unions, and `canonicalPair`. No logic, no imports from the rest of the feature. |
| `Servers/services/riskLinks/providers/fieldOverlap.ts` | The one A1 provider. Pure — takes rows, returns candidates, touches no DB. |
| `Servers/services/riskLinks/recompute.ts` | The merge → threshold → cap → persist algorithm. Owns its transaction. |
| `Servers/utils/riskLink.utils.ts` | Every SQL statement the feature issues, plus the type coercion from constraint D. |
| `Servers/controllers/riskLinks.ctrl.ts` | The three handlers, transition validation, response normalization. |
| `Servers/routes/riskLinks.route.ts` | Route table + RBAC. |
| `Servers/services/riskLinks/tests/fieldOverlap.spec.ts` | Provider unit tests. |
| `Servers/services/riskLinks/tests/recompute.spec.ts` | Lifecycle R1–R7 + amendment A, with `riskLink.utils` mocked. |
| `Servers/utils/__tests__/riskLink.utils.test.ts` | Asserts the org filter and the both-endpoints soft-delete filter are in the SQL. |
| `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` | Handler unit tests. |
| `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts` | Cross-tenant read/write denial against a real DB. |

**Modify — backend:**

| File | Change |
|---|---|
| `Servers/services/automations/automationProducer.ts` | Add `enqueueRiskLinkRecompute`. |
| `Servers/services/automations/automationWorker.ts` | One `else if` dispatch branch. |
| `Servers/controllers/risks.ctrl.ts` | Three enqueue sites per amendment B. |
| `Servers/advisor/aiActions/createRisk/execute.ts` | `afterCommit` enqueue. |
| `Servers/app.ts` | Mount `/api/riskLinks`. |
| `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` | Regenerated, never hand-edited. |
| `Servers/tests/factories/test-entities.factory.ts` | `createTestRisk` gains the five scoring columns. |
| `docs/technical/domains/risk-management.md` | Rewrite the "Related Risks" section. |

**Not touched in A1:** anything under `Clients/` (amendment E).

---

## Task 1: The `risk_links` table

**Files:**
- Create: `Servers/database/migrations/<timestamp>-create-risk-links.js`

**Interfaces:**
- Consumes: nothing.
- Produces: table `verifywise.risk_links` with columns `id, organization_id, source_risk_id, target_risk_id, relation_type, status, source, score, reasons, created_by_user_id, decided_by_user_id, decided_at, last_computed_at, created_at, updated_at`; constraints `risk_links_no_self`, `risk_links_canonical`, `risk_links_unique`.

- [ ] **Step 1: Generate the timestamp**

```bash
cd Servers && date +%Y%m%d%H%M%S
```

Use that exact number as the filename prefix. Example if it prints `20260812143022`, the file is `Servers/database/migrations/20260812143022-create-risk-links.js`.

- [ ] **Step 2: Write the migration**

```javascript
"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.risk_links (
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
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_org_source_status_idx
        ON verifywise.risk_links (organization_id, source_risk_id, status);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_org_target_status_idx
        ON verifywise.risk_links (organization_id, target_risk_id, status);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.risk_links;");
  },
};
```

Note on the constraints: `risk_links_canonical` forces undirected edges (`related_to`) to be stored with the smaller id first, so `(3,7)` and `(7,3)` cannot both exist. Directed edges (`inherits_from`, A2/B) are exempt because direction is meaningful there. `risk_links_unique` is deliberately not scoped by `organization_id` — risk ids are globally unique, so the pair already implies the org.

- [ ] **Step 3: Build and run the migration**

```bash
cd Servers && npm run build && npx sequelize db:migrate
```

Expected: the new migration name appears in the output with no error.

- [ ] **Step 4: Verify the constraints actually reject bad rows**

Run against the dev database (substitute your own connection string / `psql` invocation):

```bash
psql "$DB_URL" -c "INSERT INTO verifywise.risk_links (organization_id, source_risk_id, target_risk_id, relation_type, source) SELECT organization_id, id, id, 'related_to', 'derived' FROM verifywise.risks LIMIT 1;"
```

Expected: FAIL with `new row for relation "risk_links" violates check constraint "risk_links_no_self"`.

- [ ] **Step 5: Verify the rollback is clean**

```bash
cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate
```

Expected: both commands succeed. (The undo/redo also proves `IF NOT EXISTS` on the indexes does not wedge a re-run.)

- [ ] **Step 6: Commit**

```bash
git add Servers/database/migrations/
git commit -m "feat(risk-links): add risk_links table"
```

---

## Task 2: Shared types and the field-overlap provider

**Files:**
- Create: `Servers/services/riskLinks/types.ts`
- Create: `Servers/services/riskLinks/providers/fieldOverlap.ts`
- Test: `Servers/services/riskLinks/tests/fieldOverlap.spec.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: everything in `types.ts` below, plus `fieldOverlapProvider: LinkSignalProvider` and the constant `canonicalPair(a, b): [number, number]`.

- [ ] **Step 1: Write `types.ts`**

This file is the vocabulary for the whole feature. Later tasks import from here and nowhere else for types.

```typescript
/** One reason a pair of risks scored together. Structured, never prose. */
export interface LinkSignal {
  /** Stable machine key, e.g. "shared_category". Safe to switch on. */
  signal: string;
  /** Points this signal contributed to the pair's score. */
  weight: number;
  /** The matched value(s), for display. Omitted when the signal is boolean. */
  detail?: string;
}

/** One scored partner for the subject risk, before merging across providers. */
export interface LinkCandidate {
  targetRiskId: number;
  score: number;
  reasons: LinkSignal[];
}

/** The only risk columns a tier-0 provider needs. */
export interface RiskScoringRow {
  id: number;
  risk_category: string[] | null;
  controls_mapping: string | null;
  assessment_mapping: string | null;
  ai_lifecycle_phase: string | null;
  projects: number[];
}

export interface RecomputeContext {
  organizationId: number;
  subject: RiskScoringRow;
  /** Every other active risk in the org. Never includes the subject. */
  candidates: RiskScoringRow[];
}

export interface LinkSignalProvider {
  name: string;
  /** 0 = field overlap (A1). 1 = structural graph, 2 = embeddings (both A2). */
  tier: 0 | 1 | 2;
  score(ctx: RecomputeContext): Promise<LinkCandidate[]>;
}

export type RiskLinkStatus = "suggested" | "confirmed" | "dismissed";
export type RiskLinkSource = "derived" | "user" | "agent";
export type RiskLinkRelationType = "related_to" | "inherits_from";

export const RISK_LINK_STATUSES: RiskLinkStatus[] = ["suggested", "confirmed", "dismissed"];

/** A row of risk_links, already type-coerced by riskLink.utils. */
export interface RiskLinkRow {
  id: number;
  organization_id: number;
  source_risk_id: number;
  target_risk_id: number;
  relation_type: RiskLinkRelationType;
  status: RiskLinkStatus;
  source: RiskLinkSource;
  score: number;
  reasons: LinkSignal[];
  decided_at: string | null;
  last_computed_at: string | null;
}

/**
 * Undirected edges are stored smaller-id-first so a pair has exactly one row.
 * Enforced by the risk_links_canonical CHECK constraint.
 */
export const canonicalPair = (a: number, b: number): [number, number] =>
  a < b ? [a, b] : [b, a];
```

- [ ] **Step 2: Write the failing provider tests**

Ten tests: eight ported from `Clients/src/application/tools/__tests__/relatedRisks.test.ts` and two changed (the cap and the tiebreak now live in `recompute.ts`, so the provider is tested for *not* applying them).

```typescript
import { fieldOverlapProvider } from "../providers/fieldOverlap";
import { RecomputeContext, RiskScoringRow } from "../types";

const risk = (id: number, overrides: Partial<RiskScoringRow> = {}): RiskScoringRow => ({
  id,
  risk_category: null,
  controls_mapping: null,
  assessment_mapping: null,
  ai_lifecycle_phase: null,
  projects: [],
  ...overrides,
});

const ctx = (subject: RiskScoringRow, candidates: RiskScoringRow[]): RecomputeContext => ({
  organizationId: 1,
  subject,
  candidates,
});

describe("fieldOverlapProvider", () => {
  it("returns nothing when no signal matches", async () => {
    const result = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), [risk(2, { risk_category: ["Cyber risk"] })]),
    );
    expect(result).toEqual([]);
  });

  it("scores a shared category as 3", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), [risk(2, { risk_category: ["Strategic risk"] })]),
    );
    expect(match.score).toBe(3);
    expect(match.reasons).toEqual([
      { signal: "shared_category", weight: 3, detail: "Strategic risk" },
    ]);
  });

  it("matches categories case- and whitespace-insensitively", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), [risk(2, { risk_category: ["  STRATEGIC RISK "] })]),
    );
    expect(match.score).toBe(3);
  });

  it("scores a shared control as 2 and a shared assessment as 2", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(
        risk(1, { controls_mapping: "AC-2", assessment_mapping: "Q7" }),
        [risk(2, { controls_mapping: "AC-2", assessment_mapping: "Q7" })],
      ),
    );
    expect(match.score).toBe(4);
    expect(match.reasons.map((r) => r.signal)).toEqual(["shared_control", "shared_assessment"]);
  });

  it('ignores the "0" sentinel in control and assessment mappings', async () => {
    const result = await fieldOverlapProvider.score(
      ctx(
        risk(1, { controls_mapping: "0", assessment_mapping: "0" }),
        [risk(2, { controls_mapping: "0", assessment_mapping: "0" })],
      ),
    );
    expect(result).toEqual([]);
  });

  it("ignores empty and whitespace-only text mappings", async () => {
    const result = await fieldOverlapProvider.score(
      ctx(risk(1, { controls_mapping: "  " }), [risk(2, { controls_mapping: "" })]),
    );
    expect(result).toEqual([]);
  });

  it("scores the same lifecycle phase as 2 and a shared project as 1", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(
        risk(1, { ai_lifecycle_phase: "Deployment", projects: [4, 9] }),
        [risk(2, { ai_lifecycle_phase: "Deployment", projects: [9] })],
      ),
    );
    expect(match.score).toBe(3);
    expect(match.reasons).toEqual([
      { signal: "same_lifecycle_phase", weight: 2, detail: "Deployment" },
      { signal: "shared_project", weight: 1 },
    ]);
  });

  it("sums every matching signal", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(
        risk(1, {
          risk_category: ["Strategic risk"],
          controls_mapping: "AC-2",
          assessment_mapping: "Q7",
          ai_lifecycle_phase: "Deployment",
          projects: [4],
        }),
        [
          risk(2, {
            risk_category: ["Strategic risk"],
            controls_mapping: "AC-2",
            assessment_mapping: "Q7",
            ai_lifecycle_phase: "Deployment",
            projects: [4],
          }),
        ],
      ),
    );
    expect(match.score).toBe(10);
  });

  // Changed from phase 1: the provider no longer caps. recompute.ts owns the cap.
  it("returns every match, uncapped", async () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      risk(i + 2, { risk_category: ["Strategic risk"] }),
    );
    const result = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), candidates),
    );
    expect(result).toHaveLength(30);
  });

  // Changed from phase 1: the provider no longer sorts. recompute.ts owns ordering.
  it("never returns the subject itself, even if it appears in candidates", async () => {
    const subject = risk(1, { risk_category: ["Strategic risk"] });
    const result = await fieldOverlapProvider.score(ctx(subject, [subject, risk(2, { risk_category: ["Strategic risk"] })]));
    expect(result.map((c) => c.targetRiskId)).toEqual([2]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd Servers && npx jest services/riskLinks/tests/fieldOverlap.spec.ts
```

Expected: FAIL — `Cannot find module '../providers/fieldOverlap'`.

- [ ] **Step 4: Write the provider**

```typescript
import {
  LinkCandidate,
  LinkSignal,
  LinkSignalProvider,
  RecomputeContext,
  RiskScoringRow,
} from "../types";

const norm = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** Values present on both sides, in the subject's original casing. */
const sharedCategories = (a?: string[] | null, b?: string[] | null): string[] => {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const other = new Set(b.map(norm).filter(Boolean));
  return a.filter((value) => norm(value) !== "" && other.has(norm(value)));
};

const sharesProject = (a?: number[] | null, b?: number[] | null): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const other = new Set(b);
  return a.some((id) => other.has(id));
};

/**
 * Equal and non-empty. Two blanks are not a match, and neither is "0": the risk
 * form has no control/assessment picker, so it always sends 0, which lands in
 * these text columns as "0". That is "nothing mapped", not a shared mapping.
 */
const sameText = (a?: string | null, b?: string | null): boolean => {
  const left = norm(a);
  return left !== "" && left !== "0" && left === norm(b);
};

const scoreCandidate = (
  subject: RiskScoringRow,
  candidate: RiskScoringRow,
): LinkCandidate | null => {
  const reasons: LinkSignal[] = [];
  let score = 0;

  const categories = sharedCategories(subject.risk_category, candidate.risk_category);
  if (categories.length > 0) {
    score += 3;
    reasons.push({ signal: "shared_category", weight: 3, detail: categories.join(", ") });
  }

  if (sameText(subject.controls_mapping, candidate.controls_mapping)) {
    score += 2;
    reasons.push({ signal: "shared_control", weight: 2, detail: candidate.controls_mapping! });
  }

  if (sameText(subject.assessment_mapping, candidate.assessment_mapping)) {
    score += 2;
    reasons.push({ signal: "shared_assessment", weight: 2, detail: candidate.assessment_mapping! });
  }

  if (sameText(subject.ai_lifecycle_phase, candidate.ai_lifecycle_phase)) {
    score += 2;
    reasons.push({
      signal: "same_lifecycle_phase",
      weight: 2,
      detail: candidate.ai_lifecycle_phase!,
    });
  }

  if (sharesProject(subject.projects, candidate.projects)) {
    score += 1;
    reasons.push({ signal: "shared_project", weight: 1 });
  }

  if (score === 0) return null;
  return { targetRiskId: candidate.id, score, reasons };
};

/**
 * Tier 0: two risks are related when they overlap on the fields a human would
 * eyeball. Uncapped and unsorted on purpose — recompute.ts merges every
 * provider's output before applying the threshold, the cap, and the ordering.
 */
export const fieldOverlapProvider: LinkSignalProvider = {
  name: "field_overlap",
  tier: 0,
  async score(ctx: RecomputeContext): Promise<LinkCandidate[]> {
    return ctx.candidates
      .filter((candidate) => candidate.id !== ctx.subject.id)
      .map((candidate) => scoreCandidate(ctx.subject, candidate))
      .filter((match): match is LinkCandidate => match !== null);
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd Servers && npx jest services/riskLinks/tests/fieldOverlap.spec.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/riskLinks/
git commit -m "feat(risk-links): add field-overlap signal provider"
```

---

## Task 3: The SQL layer

**Files:**
- Create: `Servers/utils/riskLink.utils.ts`
- Test: `Servers/utils/__tests__/riskLink.utils.test.ts`

**Interfaces:**
- Consumes: `types.ts` from Task 2; the `risk_links` table from Task 1.
- Produces:
  - `getRiskScoringRowsQuery(organizationId: number): Promise<RiskScoringRow[]>`
  - `getActiveRiskIdsQuery(organizationId: number): Promise<number[]>`
  - `getIncidentLinksQuery(organizationId: number, riskId: number, transaction?: Transaction): Promise<RiskLinkRow[]>`
  - `upsertRiskLinkQuery(input: UpsertRiskLinkInput, transaction: Transaction): Promise<void>`
  - `updateRiskLinkScoreQuery(id: number, organizationId: number, score: number, reasons: LinkSignal[], transaction: Transaction): Promise<void>`
  - `deleteRiskLinksQuery(ids: number[], organizationId: number, transaction: Transaction): Promise<void>`
  - `getRiskLinksForRiskQuery(organizationId: number, riskId: number, statuses: RiskLinkStatus[]): Promise<RiskLinkWithRelated[]>`
  - `getRiskLinkByIdQuery(id: number, organizationId: number): Promise<RiskLinkRow | null>`
  - `updateRiskLinkStatusQuery(id, organizationId, status, decidedByUserId): Promise<void>`
  - types `UpsertRiskLinkInput` and `RiskLinkWithRelated`

- [ ] **Step 1: Write the failing tests**

These assert the two properties that a reviewer cannot check by eye without reading every query: the org filter, and R7's requirement that the read filters soft-deleted risks on **both** endpoints.

```typescript
import { QueryTypes } from "sequelize";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  getRiskLinksForRiskQuery,
  getRiskScoringRowsQuery,
  getIncidentLinksQuery,
} from "../riskLink.utils";

const mockQuery = sequelize.query as jest.Mock;

describe("riskLink.utils", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
  });

  it("scopes the scoring rows to the org and skips soft-deleted risks", async () => {
    await getRiskScoringRowsQuery(7);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("r.organization_id = :organizationId");
    expect(sql).toContain("r.is_deleted = false");
    expect(options.replacements).toEqual({ organizationId: 7 });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("casts risk_category to text[] so pg returns a JS array", async () => {
    await getRiskScoringRowsQuery(7);
    expect(mockQuery.mock.calls[0][0]).toContain("r.risk_category::text[]");
  });

  it("coerces the projects aggregate when pg hands back a string", async () => {
    mockQuery.mockResolvedValue([
      { id: 1, risk_category: null, controls_mapping: null, assessment_mapping: null, ai_lifecycle_phase: null, projects: "[3,4]" },
    ]);
    const rows = await getRiskScoringRowsQuery(7);
    expect(rows[0].projects).toEqual([3, 4]);
  });

  it("scopes incident links to the org and to both endpoints", async () => {
    await getIncidentLinksQuery(7, 42);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("source_risk_id = :riskId OR target_risk_id = :riskId");
    expect(options.replacements).toEqual({ organizationId: 7, riskId: 42 });
  });

  it("filters soft-deleted risks on BOTH endpoints when reading a risk's links", async () => {
    await getRiskLinksForRiskQuery(7, 42, ["suggested", "confirmed"]);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("related.is_deleted = false");
    expect(sql).toContain("subject.is_deleted = false");
    expect(sql).toContain("l.organization_id = :organizationId");
    expect(options.replacements.statuses).toEqual(["suggested", "confirmed"]);
  });

  it("coerces the NUMERIC score to a number and reasons to an array", async () => {
    mockQuery.mockResolvedValue([
      {
        id: 1, source_risk_id: 3, target_risk_id: 42, relation_type: "related_to",
        status: "suggested", source: "derived", score: "5.000",
        reasons: '[{"signal":"shared_category","weight":3}]',
        decided_at: null, last_computed_at: null,
        related_id: 3, related_risk_name: "R", related_risk_level: "High risk", related_risk_owner: null,
      },
    ]);
    const [link] = await getRiskLinksForRiskQuery(7, 42, ["suggested"]);
    expect(link.score).toBe(5);
    expect(link.reasons).toEqual([{ signal: "shared_category", weight: 3 }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest utils/__tests__/riskLink.utils.test.ts
```

Expected: FAIL — `Cannot find module '../riskLink.utils'`.

- [ ] **Step 3: Write `riskLink.utils.ts`**

```typescript
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  LinkSignal,
  RiskLinkRow,
  RiskLinkStatus,
  RiskScoringRow,
} from "../services/riskLinks/types";

/**
 * pg hands NUMERIC back as a string and can hand JSONB / JSON_AGG output back
 * as a string too. Everything crossing this boundary is coerced here so no
 * caller ever compares a number to "5.000".
 */
const toNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number(value ?? 0);

const toJsonArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toLinkRow = (row: any): RiskLinkRow => ({
  id: row.id,
  organization_id: row.organization_id,
  source_risk_id: row.source_risk_id,
  target_risk_id: row.target_risk_id,
  relation_type: row.relation_type,
  status: row.status,
  source: row.source,
  score: toNumber(row.score),
  reasons: toJsonArray<LinkSignal>(row.reasons),
  decided_at: row.decided_at ?? null,
  last_computed_at: row.last_computed_at ?? null,
});

/**
 * Every active risk in the org, reduced to the columns tier-0 scoring reads.
 *
 * risk_category is enum_projectrisks_risk_category[] — a custom enum array whose
 * OID node-pg has no parser for, so it is cast to text[] to guarantee a JS array.
 */
export async function getRiskScoringRowsQuery(
  organizationId: number,
): Promise<RiskScoringRow[]> {
  const rows = await sequelize.query(
    `SELECT r.id,
            r.risk_category::text[] AS risk_category,
            r.controls_mapping,
            r.assessment_mapping,
            r.ai_lifecycle_phase::text AS ai_lifecycle_phase,
            COALESCE(
              JSON_AGG(DISTINCT pr.project_id) FILTER (WHERE pr.project_id IS NOT NULL),
              '[]'
            ) AS projects
     FROM risks r
     LEFT JOIN projects_risks pr
       ON r.id = pr.risk_id AND pr.organization_id = :organizationId
     WHERE r.organization_id = :organizationId AND r.is_deleted = false
     GROUP BY r.id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    risk_category: Array.isArray(row.risk_category) ? row.risk_category : null,
    controls_mapping: row.controls_mapping ?? null,
    assessment_mapping: row.assessment_mapping ?? null,
    ai_lifecycle_phase: row.ai_lifecycle_phase ?? null,
    projects: toJsonArray<number>(row.projects),
  }));
}

/** Every active risk id in the org — the fan-out list for a full recompute. */
export async function getActiveRiskIdsQuery(organizationId: number): Promise<number[]> {
  const rows = await sequelize.query(
    `SELECT id FROM risks
     WHERE organization_id = :organizationId AND is_deleted = false
     ORDER BY id ASC`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );
  return (rows as any[]).map((row) => row.id);
}

/** Every stored edge touching this risk, in either direction, any status. */
export async function getIncidentLinksQuery(
  organizationId: number,
  riskId: number,
  transaction?: Transaction,
): Promise<RiskLinkRow[]> {
  const rows = await sequelize.query(
    `SELECT * FROM risk_links
     WHERE organization_id = :organizationId
       AND (source_risk_id = :riskId OR target_risk_id = :riskId)`,
    {
      replacements: { organizationId, riskId },
      type: QueryTypes.SELECT,
      ...(transaction && { transaction }),
    },
  );
  return (rows as any[]).map(toLinkRow);
}

export interface UpsertRiskLinkInput {
  organizationId: number;
  /** Already canonicalised: sourceRiskId < targetRiskId. */
  sourceRiskId: number;
  targetRiskId: number;
  score: number;
  reasons: LinkSignal[];
}

/**
 * Create a derived suggestion, or refresh an existing edge's score.
 *
 * ON CONFLICT deliberately touches neither status nor source: a confirmed or
 * dismissed edge keeps the human's decision across every recompute (R1, R3).
 */
export async function upsertRiskLinkQuery(
  input: UpsertRiskLinkInput,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, relation_type,
        status, source, score, reasons, last_computed_at)
     VALUES (:organizationId, :sourceRiskId, :targetRiskId, 'related_to',
             'suggested', 'derived', :score, CAST(:reasons AS JSONB), NOW())
     ON CONFLICT (source_risk_id, target_risk_id, relation_type)
     DO UPDATE SET score = EXCLUDED.score,
                   reasons = EXCLUDED.reasons,
                   last_computed_at = NOW(),
                   updated_at = NOW()`,
    {
      replacements: {
        organizationId: input.organizationId,
        sourceRiskId: input.sourceRiskId,
        targetRiskId: input.targetRiskId,
        score: input.score,
        reasons: JSON.stringify(input.reasons),
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
}

/** Refresh score and reasons on an edge the recompute is keeping but not upserting. */
export async function updateRiskLinkScoreQuery(
  id: number,
  organizationId: number,
  score: number,
  reasons: LinkSignal[],
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `UPDATE risk_links
     SET score = :score,
         reasons = CAST(:reasons AS JSONB),
         last_computed_at = NOW(),
         updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: { id, organizationId, score, reasons: JSON.stringify(reasons) },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
}

/**
 * Prune stale suggestions. The source/status predicate is belt-and-braces: the
 * caller already filtered, but a confirmed edge must never be deletable here.
 */
export async function deleteRiskLinksQuery(
  ids: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (ids.length === 0) return;
  await sequelize.query(
    `DELETE FROM risk_links
     WHERE organization_id = :organizationId
       AND id IN (:ids)
       AND source = 'derived'
       AND status = 'suggested'`,
    {
      replacements: { organizationId, ids },
      type: QueryTypes.DELETE,
      transaction,
    },
  );
}

export interface RiskLinkWithRelated extends RiskLinkRow {
  related_id: number;
  related_risk_name: string | null;
  related_risk_level: string | null;
  related_risk_owner: number | null;
}

/**
 * Every visible edge for one risk, in either direction.
 *
 * R7: edges outlive a soft-deleted risk, so the read — not the write — is what
 * hides them. Both endpoints are joined and both are filtered: `related` so a
 * deleted partner disappears from the list, `subject` so a deleted subject
 * returns an empty list rather than its old neighbours.
 */
export async function getRiskLinksForRiskQuery(
  organizationId: number,
  riskId: number,
  statuses: RiskLinkStatus[],
): Promise<RiskLinkWithRelated[]> {
  const rows = await sequelize.query(
    `SELECT l.*,
            related.id AS related_id,
            related.risk_name AS related_risk_name,
            related.risk_level_autocalculated::text AS related_risk_level,
            related.risk_owner AS related_risk_owner
     FROM risk_links l
     JOIN risks related
       ON related.id = CASE WHEN l.source_risk_id = :riskId
                            THEN l.target_risk_id ELSE l.source_risk_id END
     JOIN risks subject ON subject.id = :riskId
     WHERE l.organization_id = :organizationId
       AND (l.source_risk_id = :riskId OR l.target_risk_id = :riskId)
       AND related.organization_id = :organizationId
       AND related.is_deleted = false
       AND subject.organization_id = :organizationId
       AND subject.is_deleted = false
       AND l.status IN (:statuses)
     ORDER BY l.score DESC, related.id ASC`,
    { replacements: { organizationId, riskId, statuses }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    ...toLinkRow(row),
    related_id: row.related_id,
    related_risk_name: row.related_risk_name ?? null,
    related_risk_level: row.related_risk_level ?? null,
    related_risk_owner: row.related_risk_owner ?? null,
  }));
}

export async function getRiskLinkByIdQuery(
  id: number,
  organizationId: number,
): Promise<RiskLinkRow | null> {
  const rows = await sequelize.query(
    `SELECT * FROM risk_links WHERE id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  );
  const row = (rows as any[])[0];
  return row ? toLinkRow(row) : null;
}

/**
 * Record a human decision. `decidedByUserId` of null is the explicit undo
 * (dismissed -> suggested): it clears decided_at too, so the edge looks
 * untouched again and a later recompute may prune it normally.
 */
export async function updateRiskLinkStatusQuery(
  id: number,
  organizationId: number,
  status: RiskLinkStatus,
  decidedByUserId: number | null,
): Promise<void> {
  await sequelize.query(
    `UPDATE risk_links
     SET status = :status,
         decided_by_user_id = :decidedByUserId,
         decided_at = CASE WHEN :decidedByUserId IS NULL THEN NULL ELSE NOW() END,
         updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: { id, organizationId, status, decidedByUserId },
      type: QueryTypes.UPDATE,
    },
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Servers && npx jest utils/__tests__/riskLink.utils.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Verify it compiles**

```bash
cd Servers && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/utils/__tests__/riskLink.utils.test.ts
git commit -m "feat(risk-links): add risk link SQL layer"
```

---

## Task 4: The recompute algorithm

**Files:**
- Create: `Servers/services/riskLinks/recompute.ts`
- Test: `Servers/services/riskLinks/tests/recompute.spec.ts`

**Interfaces:**
- Consumes: `types.ts` (Task 2), `fieldOverlapProvider` (Task 2), every function in `riskLink.utils.ts` (Task 3).
- Produces: `recomputeRiskLinks(organizationId: number, riskId: number): Promise<void>`, and the exported constants `LINK_SCORE_THRESHOLD = 3`, `MAX_LINKS_PER_RISK = 20`.

- [ ] **Step 1: Write the failing tests**

These are the lifecycle rules. Read the assertion names against spec §6 — each one is a rule, not a code path.

```typescript
jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import * as utils from "../../../utils/riskLink.utils";
import { recomputeRiskLinks, LINK_SCORE_THRESHOLD, MAX_LINKS_PER_RISK } from "../recompute";
import { RiskLinkRow, RiskScoringRow } from "../types";

const mockUtils = utils as jest.Mocked<typeof utils>;
const commit = jest.fn();
const rollback = jest.fn();

const risk = (id: number, overrides: Partial<RiskScoringRow> = {}): RiskScoringRow => ({
  id,
  risk_category: null,
  controls_mapping: null,
  assessment_mapping: null,
  ai_lifecycle_phase: null,
  projects: [],
  ...overrides,
});

const link = (overrides: Partial<RiskLinkRow>): RiskLinkRow => ({
  id: 100,
  organization_id: 1,
  source_risk_id: 3,
  target_risk_id: 7,
  relation_type: "related_to",
  status: "suggested",
  source: "derived",
  score: 0,
  reasons: [],
  decided_at: null,
  last_computed_at: null,
  ...overrides,
});

const CAT = { risk_category: ["Strategic risk"] };

beforeEach(() => {
  jest.clearAllMocks();
  (sequelize.transaction as jest.Mock).mockResolvedValue({ commit, rollback });
  mockUtils.getIncidentLinksQuery.mockResolvedValue([]);
});

describe("recomputeRiskLinks", () => {
  it("exits quietly when the subject risk is gone (R7)", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(3, CAT)]);
    await recomputeRiskLinks(1, 999);
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
  });

  it("creates a canonical edge for a pair at or above the threshold", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.upsertRiskLinkQuery).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 1, sourceRiskId: 3, targetRiskId: 7, score: 3 }),
      expect.anything(),
    );
    expect(commit).toHaveBeenCalled();
  });

  it("does not create an edge below the threshold (R2)", async () => {
    // shared project only = 1 point
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { projects: [4] }),
      risk(3, { projects: [4] }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("keeps a dismissed edge dismissed when its score rises (R1)", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { ...CAT, ai_lifecycle_phase: "Deployment" }),
      risk(3, { ...CAT, ai_lifecycle_phase: "Deployment" }),
    ]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, status: "dismissed", score: 3 }),
    ]);
    await recomputeRiskLinks(1, 7);
    // The keeper path refreshes score via upsert, which never touches status.
    expect(mockUtils.upsertRiskLinkQuery).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRiskId: 3, targetRiskId: 7, score: 5 }),
      expect.anything(),
    );
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
  });

  it("never prunes a confirmed edge, and zeroes its score honestly (R3, R2)", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7), risk(3)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, status: "confirmed", score: 5 }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.updateRiskLinkScoreQuery).toHaveBeenCalledWith(
      100, 1, 0, [], expect.anything(),
    );
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
  });

  it("prunes a derived suggestion that fell below the threshold", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7), risk(3)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, status: "suggested", source: "derived", score: 3 }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.deleteRiskLinksQuery).toHaveBeenCalledWith([100], 1, expect.anything());
  });

  // Amendment A. This is the anti-thrash rule; deleting this test reintroduces the bug.
  it("does NOT prune an at-threshold edge merely because the cap excluded it", async () => {
    // 25 candidates all scoring 5; risk 3 scores 3, so it sorts last and is cut by the cap.
    const strong = Array.from({ length: 25 }, (_, i) =>
      risk(i + 100, { ...CAT, ai_lifecycle_phase: "Deployment" }),
    );
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { ...CAT, ai_lifecycle_phase: "Deployment" }),
      risk(3, CAT),
      ...strong,
    ]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, source_risk_id: 3, target_risk_id: 7, status: "suggested", source: "derived" }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
    expect(mockUtils.updateRiskLinkScoreQuery).toHaveBeenCalledWith(
      100, 1, 3, expect.any(Array), expect.anything(),
    );
  });

  it("caps creation at 20 edges, best score first", async () => {
    const strong = Array.from({ length: 25 }, (_, i) =>
      risk(i + 100, { ...CAT, ai_lifecycle_phase: "Deployment" }),
    );
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { ...CAT, ai_lifecycle_phase: "Deployment" }),
      ...strong,
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.upsertRiskLinkQuery).toHaveBeenCalledTimes(MAX_LINKS_PER_RISK);
  });

  it("breaks ties on target risk id ascending, not on risk level", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, CAT), risk(50, CAT), risk(3, CAT), risk(20, CAT),
    ]);
    await recomputeRiskLinks(1, 7);
    const order = mockUtils.upsertRiskLinkQuery.mock.calls.map(([input]) =>
      input.sourceRiskId === 7 ? input.targetRiskId : input.sourceRiskId,
    );
    expect(order).toEqual([3, 20, 50]);
  });

  it("writes nothing and deletes nothing when every provider throws", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([link({ id: 100 })]);
    const provider = require("../providers/fieldOverlap");
    const spy = jest
      .spyOn(provider.fieldOverlapProvider, "score")
      .mockRejectedValue(new Error("boom"));

    await recomputeRiskLinks(1, 7);

    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();

    // jest.clearAllMocks() does not undo a spy — restore it or the next test
    // gets a provider that still throws.
    spy.mockRestore();
  });

  it("rolls back and rethrows when a write fails", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    mockUtils.upsertRiskLinkQuery.mockRejectedValue(new Error("db down"));
    await expect(recomputeRiskLinks(1, 7)).rejects.toThrow("db down");
    expect(rollback).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("exports the spec's threshold and cap", () => {
    expect(LINK_SCORE_THRESHOLD).toBe(3);
    expect(MAX_LINKS_PER_RISK).toBe(20);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest services/riskLinks/tests/recompute.spec.ts
```

Expected: FAIL — `Cannot find module '../recompute'`.

- [ ] **Step 3: Write `recompute.ts`**

```typescript
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import {
  deleteRiskLinksQuery,
  getIncidentLinksQuery,
  getRiskScoringRowsQuery,
  updateRiskLinkScoreQuery,
  upsertRiskLinkQuery,
} from "../../utils/riskLink.utils";
import { fieldOverlapProvider } from "./providers/fieldOverlap";
import { canonicalPair, LinkCandidate, LinkSignalProvider } from "./types";

/** A pair scoring below this is not worth suggesting. */
export const LINK_SCORE_THRESHOLD = 3;

/** How many new suggestions one recompute may create for one risk. */
export const MAX_LINKS_PER_RISK = 20;

/** A2 appends the structural-graph and embedding providers here. */
const PROVIDERS: LinkSignalProvider[] = [fieldOverlapProvider];

/**
 * Rebuild the stored edges for one risk.
 *
 * Idempotent and safe to run concurrently with a recompute of the other
 * endpoint: writes go through ON CONFLICT, and pruning is driven by the score,
 * which is symmetric.
 */
export async function recomputeRiskLinks(
  organizationId: number,
  riskId: number,
): Promise<void> {
  const rows = await getRiskScoringRowsQuery(organizationId);
  const subject = rows.find((row) => row.id === riskId);
  // Deleted, archived, or another org's risk. R7: leave its edges alone.
  if (!subject) return;

  const candidates = rows.filter((row) => row.id !== riskId);

  // 1. Run every provider. One that throws must not cost us the others.
  const merged = new Map<number, LinkCandidate>();
  let anyProviderSucceeded = false;

  for (const provider of PROVIDERS) {
    try {
      const results = await provider.score({ organizationId, subject, candidates });
      anyProviderSucceeded = true;
      for (const candidate of results) {
        const existing = merged.get(candidate.targetRiskId);
        if (existing) {
          existing.score += candidate.score;
          existing.reasons.push(...candidate.reasons);
        } else {
          merged.set(candidate.targetRiskId, { ...candidate, reasons: [...candidate.reasons] });
        }
      }
    } catch (error) {
      logger.error(
        `[riskLinks] provider ${provider.name} failed for risk ${riskId} (org ${organizationId})`,
        error,
      );
    }
  }

  // Every provider failed: we know nothing, so we must not act on nothing.
  // Writing would zero real scores; deleting would wipe live suggestions.
  if (!anyProviderSucceeded) return;

  // 2. Keepers: at or above threshold, best first, ties by target id.
  const keepers = [...merged.values()]
    .filter((candidate) => candidate.score >= LINK_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.targetRiskId - b.targetRiskId)
    .slice(0, MAX_LINKS_PER_RISK);
  const keeperIds = new Set(keepers.map((keeper) => keeper.targetRiskId));

  // 3. One transaction for the whole rewrite.
  const transaction = await sequelize.transaction();
  try {
    for (const keeper of keepers) {
      const [sourceRiskId, targetRiskId] = canonicalPair(riskId, keeper.targetRiskId);
      await upsertRiskLinkQuery(
        { organizationId, sourceRiskId, targetRiskId, score: keeper.score, reasons: keeper.reasons },
        transaction,
      );
    }

    const incident = await getIncidentLinksQuery(organizationId, riskId, transaction);
    const pruneIds: number[] = [];

    for (const existing of incident) {
      const otherId =
        existing.source_risk_id === riskId ? existing.target_risk_id : existing.source_risk_id;
      // Already refreshed by the upsert above.
      if (keeperIds.has(otherId)) continue;

      const candidate = merged.get(otherId);
      const score = candidate?.score ?? 0;

      // Prune only what fell below the threshold. The cap gates creation, never
      // deletion: score is symmetric but top-N membership is not, so pruning on
      // the cap would let two risks fight over the same edge on every save.
      const prunable =
        existing.source === "derived" &&
        existing.status === "suggested" &&
        score < LINK_SCORE_THRESHOLD;

      if (prunable) {
        pruneIds.push(existing.id);
        continue;
      }

      // A decided edge, or one the cap excluded. Keep the row, tell the truth
      // about its score.
      await updateRiskLinkScoreQuery(
        existing.id,
        organizationId,
        score,
        candidate?.reasons ?? [],
        transaction,
      );
    }

    if (pruneIds.length > 0) {
      await deleteRiskLinksQuery(pruneIds, organizationId, transaction);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Servers && npx jest services/riskLinks/tests/recompute.spec.ts
```

Expected: PASS, 12 tests.

Note: the "writes nothing when every provider throws" test uses `jest.spyOn` on the real provider object, so it must run with the module unmocked — that is why `providers/fieldOverlap` is *not* in the `jest.mock` list at the top of the file.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/riskLinks/recompute.ts Servers/services/riskLinks/tests/recompute.spec.ts
git commit -m "feat(risk-links): add recompute engine"
```

---

## Task 5: Queue producer and worker dispatch

**Files:**
- Modify: `Servers/services/automations/automationProducer.ts` (append after `enqueueAutomationAction`, around line 16)
- Modify: `Servers/services/automations/automationWorker.ts` (the dispatch chain inside `createAutomationWorker`, around lines 478-656)
- Test: `Servers/services/automations/tests/riskLinkQueue.spec.ts`

**Interfaces:**
- Consumes: `recomputeRiskLinks` (Task 4).
- Produces: `enqueueRiskLinkRecompute(organizationId: number, riskId: number)` — imported by Tasks 6 and 7. Job name: `"risk_link_recompute"`. Job data: `{ organizationId, riskId }`.

- [ ] **Step 1: Write the failing test**

The two things worth locking down: the job options (amendment C — getting these wrong silently disables the feature after the first run) and the worker's data contract.

```typescript
const mockAdd = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd, obliterate: jest.fn() })),
  Worker: jest.fn(),
}));
jest.mock("../../../database/redis", () => ({ REDIS_URL: "redis://localhost:6379" }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { enqueueRiskLinkRecompute } from "../automationProducer";

describe("enqueueRiskLinkRecompute", () => {
  beforeEach(() => mockAdd.mockReset());

  it("enqueues under the risk_link_recompute name with org-scoped data", async () => {
    await enqueueRiskLinkRecompute(7, 42);
    const [name, data] = mockAdd.mock.calls[0];
    expect(name).toBe("risk_link_recompute");
    expect(data).toEqual({ organizationId: 7, riskId: 42 });
  });

  it("dedups per risk with a jobId that is org-scoped", async () => {
    await enqueueRiskLinkRecompute(7, 42);
    expect(mockAdd.mock.calls[0][2].jobId).toBe("risk-link:7:42");
  });

  // Amendment C: BullMQ ignores an add whose jobId still exists, including a
  // retained completed or failed job. Without both of these the risk recomputes
  // exactly once and never again.
  it("removes the job on completion AND on failure so the jobId is reusable", async () => {
    await enqueueRiskLinkRecompute(7, 42);
    const options = mockAdd.mock.calls[0][2];
    expect(options.removeOnComplete).toBe(true);
    expect(options.removeOnFail).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Servers && npx jest services/automations/tests/riskLinkQueue.spec.ts
```

Expected: FAIL — `enqueueRiskLinkRecompute is not a function`.

- [ ] **Step 3: Add the producer**

In `Servers/services/automations/automationProducer.ts`, immediately after the `enqueueAutomationAction` function (line 16) and before `scheduleVendorReviewDateNotification`:

```typescript
/**
 * Recompute one risk's stored link edges in the background.
 *
 * `jobId` collapses a burst of saves for the same risk into one run. That only
 * works because the job is removed as soon as it settles: BullMQ silently
 * ignores an `add` whose jobId still exists, so a *retained* completed or
 * failed job would suppress every later recompute for that risk forever.
 * Known limitation: a save landing while the job is already active is dropped;
 * the next save or POST /riskLinks/recompute picks it up.
 */
export async function enqueueRiskLinkRecompute(organizationId: number, riskId: number) {
  return automationQueue.add(
    "risk_link_recompute",
    { organizationId, riskId },
    {
      jobId: `risk-link:${organizationId}:${riskId}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
```

- [ ] **Step 4: Add the worker dispatch branch**

In `Servers/services/automations/automationWorker.ts`, add the import at the top with the other service imports:

```typescript
import { recomputeRiskLinks } from "../riskLinks/recompute";
```

Then add one branch to the `if / else if` chain inside `createAutomationWorker`, next to the other `else if (name === ...)` cases (e.g. immediately after the `mrm_retention_prune` branch):

```typescript
    } else if (name === "risk_link_recompute") {
      const { organizationId, riskId } = job.data as {
        organizationId: number;
        riskId: number;
      };
      await recomputeRiskLinks(organizationId, riskId);
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd Servers && npx jest services/automations/tests/riskLinkQueue.spec.ts && npm run build
```

Expected: PASS, 3 tests, and a clean build.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/automations/
git commit -m "feat(risk-links): wire recompute job into the automation queue"
```

---

## Task 6: Endpoints

**Files:**
- Create: `Servers/controllers/riskLinks.ctrl.ts`
- Create: `Servers/routes/riskLinks.route.ts`
- Modify: `Servers/app.ts` (import near line 8, mount near line 222)
- Modify: `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` (generated)
- Test: `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`

**Interfaces:**
- Consumes: `getRiskLinksForRiskQuery`, `getRiskLinkByIdQuery`, `updateRiskLinkStatusQuery`, `getActiveRiskIdsQuery` (Task 3); `enqueueRiskLinkRecompute` (Task 5); `RISK_LINK_STATUSES`, `RiskLinkStatus` (Task 2).
- Produces: `getRiskLinks`, `updateRiskLinkStatus`, `recomputeAllRiskLinks` request handlers; routes `GET /api/riskLinks/:riskId`, `PATCH /api/riskLinks/:id`, `POST /api/riskLinks/recompute`.

- [ ] **Step 1: Write the failing controller tests**

```typescript
jest.mock("../../utils/riskLink.utils");
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  __esModule: true,
  default: {
    200: (data: any) => ({ message: "OK", data }),
    202: (data: any) => ({ message: "Accepted", data }),
    400: (data: any) => ({ message: "Bad request", data }),
    404: (data: any) => ({ message: "Not found", data }),
    500: (error: any) => ({ message: "Internal server error", error }),
  },
}));

import * as utils from "../../utils/riskLink.utils";
import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import { getRiskLinks, updateRiskLinkStatus, recomputeAllRiskLinks } from "../riskLinks.ctrl";

const mockUtils = utils as jest.Mocked<typeof utils>;

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const req = (overrides: any = {}) => ({
  params: {},
  query: {},
  body: {},
  userId: 5,
  organizationId: 7,
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe("getRiskLinks", () => {
  it("defaults to suggested and confirmed", async () => {
    mockUtils.getRiskLinksForRiskQuery.mockResolvedValue([]);
    await getRiskLinks(req({ params: { riskId: "42" } }) as any, res() as any);
    expect(mockUtils.getRiskLinksForRiskQuery).toHaveBeenCalledWith(7, 42, [
      "suggested",
      "confirmed",
    ]);
  });

  it("honours ?status=dismissed", async () => {
    mockUtils.getRiskLinksForRiskQuery.mockResolvedValue([]);
    await getRiskLinks(
      req({ params: { riskId: "42" }, query: { status: "dismissed" } }) as any,
      res() as any,
    );
    expect(mockUtils.getRiskLinksForRiskQuery).toHaveBeenCalledWith(7, 42, ["dismissed"]);
  });

  it("rejects an unknown status with 400", async () => {
    const r = res();
    await getRiskLinks(
      req({ params: { riskId: "42" }, query: { status: "banana" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockUtils.getRiskLinksForRiskQuery).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric riskId with 400", async () => {
    const r = res();
    await getRiskLinks(req({ params: { riskId: "abc" } }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("normalises an undirected edge to the caller's perspective", async () => {
    mockUtils.getRiskLinksForRiskQuery.mockResolvedValue([
      {
        id: 100, organization_id: 7, source_risk_id: 3, target_risk_id: 42,
        relation_type: "related_to", status: "suggested", source: "derived",
        score: 5, reasons: [{ signal: "shared_category", weight: 3 }],
        decided_at: null, last_computed_at: null,
        related_id: 3, related_risk_name: "Model drift",
        related_risk_level: "High risk", related_risk_owner: 9,
      },
    ] as any);
    const r = res();
    await getRiskLinks(req({ params: { riskId: "42" } }) as any, r as any);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 100,
            direction: "undirected",
            score: 5,
            relatedRisk: { id: 3, name: "Model drift", riskLevel: "High risk", ownerId: 9 },
          }),
        ],
      }),
    );
  });
});

describe("updateRiskLinkStatus", () => {
  const suggested = {
    id: 100, organization_id: 7, source_risk_id: 3, target_risk_id: 42,
    relation_type: "related_to" as const, status: "suggested" as const,
    source: "derived" as const, score: 5, reasons: [],
    decided_at: null, last_computed_at: null,
  };

  it("confirms a suggestion and records who decided", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "confirmed", 5);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("clears the decision fields on an explicit undo (dismissed -> suggested)", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({ ...suggested, status: "dismissed" });
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "suggested" } }) as any,
      res() as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "suggested", null);
  });

  it("rejects confirmed -> suggested with 400 (R6)", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({ ...suggested, status: "confirmed" });
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "suggested" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockUtils.updateRiskLinkStatusQuery).not.toHaveBeenCalled();
  });

  it("404s on a link belonging to another org", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(null);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it("rejects an unknown target status with 400", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "banana" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe("recomputeAllRiskLinks", () => {
  it("enqueues one job per active risk and answers 202", async () => {
    mockUtils.getActiveRiskIdsQuery.mockResolvedValue([3, 7, 42]);
    const r = res();
    await recomputeAllRiskLinks(req() as any, r as any);
    expect(enqueueRiskLinkRecompute).toHaveBeenCalledTimes(3);
    expect(enqueueRiskLinkRecompute).toHaveBeenCalledWith(7, 42);
    expect(r.status).toHaveBeenCalledWith(202);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: { enqueued: 3 } }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts
```

Expected: FAIL — `Cannot find module '../riskLinks.ctrl'`.

- [ ] **Step 3: Write the controller**

```typescript
import { Request, Response } from "express";
import STATUS_CODE from "../utils/statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { enqueueRiskLinkRecompute } from "../services/automations/automationProducer";
import {
  getActiveRiskIdsQuery,
  getRiskLinkByIdQuery,
  getRiskLinksForRiskQuery,
  RiskLinkWithRelated,
  updateRiskLinkStatusQuery,
} from "../utils/riskLink.utils";
import { RISK_LINK_STATUSES, RiskLinkStatus } from "../services/riskLinks/types";

const FILE_NAME = "riskLinks.ctrl.ts";

/** What the list endpoint shows by default: open suggestions plus accepted links. */
const DEFAULT_STATUSES: RiskLinkStatus[] = ["suggested", "confirmed"];

/**
 * R6. `dismissed -> suggested` is the explicit undo and clears the decision
 * fields. `confirmed -> suggested` is not a thing: un-confirming means
 * dismissing.
 */
const ALLOWED_TRANSITIONS: Record<RiskLinkStatus, RiskLinkStatus[]> = {
  suggested: ["confirmed", "dismissed"],
  confirmed: ["dismissed"],
  dismissed: ["confirmed", "suggested"],
};

const isRiskLinkStatus = (value: unknown): value is RiskLinkStatus =>
  typeof value === "string" && (RISK_LINK_STATUSES as string[]).includes(value);

/**
 * Rewrite a stored edge from the caller's point of view. The store is canonical
 * (smaller id first); the caller only cares which risk is the *other* one.
 */
const toResponse = (link: RiskLinkWithRelated, riskId: number) => ({
  id: link.id,
  status: link.status,
  source: link.source,
  relationType: link.relation_type,
  score: link.score,
  reasons: link.reasons,
  direction:
    link.relation_type === "inherits_from"
      ? link.source_risk_id === riskId
        ? "outgoing"
        : "incoming"
      : "undirected",
  decidedAt: link.decided_at,
  lastComputedAt: link.last_computed_at,
  relatedRisk: {
    id: link.related_id,
    name: link.related_risk_name,
    riskLevel: link.related_risk_level,
    ownerId: link.related_risk_owner,
  },
});

export async function getRiskLinks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getRiskLinks",
    functionName: "getRiskLinks",
    fileName: FILE_NAME,
    userId: req.userId,
    organizationId: req.organizationId,
  });

  try {
    const riskId = parseInt(String(req.params.riskId), 10);
    if (isNaN(riskId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid risk ID"));
    }

    const requested = req.query.status;
    if (requested !== undefined && !isRiskLinkStatus(requested)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid status filter"));
    }
    const statuses = requested ? [requested] : DEFAULT_STATUSES;

    const links = await getRiskLinksForRiskQuery(req.organizationId!, riskId, statuses);

    logSuccess({
      eventType: "Read",
      description: `fetched ${links.length} links for risk ${riskId}`,
      functionName: "getRiskLinks",
      fileName: FILE_NAME,
      userId: req.userId,
      organizationId: req.organizationId,
    });

    return res.status(200).json(STATUS_CODE[200](links.map((link) => toResponse(link, riskId))));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch risk links",
      functionName: "getRiskLinks",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId,
      organizationId: req.organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateRiskLinkStatus(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting updateRiskLinkStatus",
    functionName: "updateRiskLinkStatus",
    fileName: FILE_NAME,
    userId: req.userId,
    organizationId: req.organizationId,
  });

  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid link ID"));
    }

    const next = req.body?.status;
    if (!isRiskLinkStatus(next)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid status"));
    }

    const link = await getRiskLinkByIdQuery(id, req.organizationId!);
    if (!link) {
      return res.status(404).json(STATUS_CODE[404]("Risk link not found"));
    }

    if (!ALLOWED_TRANSITIONS[link.status].includes(next)) {
      return res
        .status(400)
        .json(STATUS_CODE[400](`Cannot change status from ${link.status} to ${next}`));
    }

    // The undo back to `suggested` erases the decision so a later recompute may
    // prune the edge normally again.
    const decidedByUserId = next === "suggested" ? null : req.userId!;
    await updateRiskLinkStatusQuery(id, req.organizationId!, next, decidedByUserId);

    logSuccess({
      eventType: "Update",
      description: `risk link ${id} set to ${next}`,
      functionName: "updateRiskLinkStatus",
      fileName: FILE_NAME,
      userId: req.userId,
      organizationId: req.organizationId,
    });

    return res.status(200).json(STATUS_CODE[200]({ id, status: next }));
  } catch (error) {
    logFailure({
      eventType: "Update",
      description: "failed to update risk link status",
      functionName: "updateRiskLinkStatus",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId,
      organizationId: req.organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Backfill. The table starts empty and only fills as risks are saved, so an org
 * needs one full pass before the feature shows anything. Fan out one job per
 * risk rather than one big job: the jobs dedup, retry, and progress
 * independently.
 */
export async function recomputeAllRiskLinks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting recomputeAllRiskLinks",
    functionName: "recomputeAllRiskLinks",
    fileName: FILE_NAME,
    userId: req.userId,
    organizationId: req.organizationId,
  });

  try {
    const riskIds = await getActiveRiskIdsQuery(req.organizationId!);
    await Promise.all(riskIds.map((riskId) => enqueueRiskLinkRecompute(req.organizationId!, riskId)));

    logSuccess({
      eventType: "Create",
      description: `enqueued ${riskIds.length} risk link recompute jobs`,
      functionName: "recomputeAllRiskLinks",
      fileName: FILE_NAME,
      userId: req.userId,
      organizationId: req.organizationId,
    });

    return res.status(202).json(STATUS_CODE[202]({ enqueued: riskIds.length }));
  } catch (error) {
    logFailure({
      eventType: "Create",
      description: "failed to enqueue risk link recompute",
      functionName: "recomputeAllRiskLinks",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId,
      organizationId: req.organizationId,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

- [ ] **Step 4: Write the route file**

`Servers/routes/riskLinks.route.ts`:

```typescript
import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getRiskLinks,
  recomputeAllRiskLinks,
  updateRiskLinkStatus,
} from "../controllers/riskLinks.ctrl";

// Declared before GET /:riskId is irrelevant (different verb), but kept first
// so the backfill route is the obvious one in this file.
router.post("/recompute", authenticateJWT, authorize(["Admin"]), recomputeAllRiskLinks);

router.get("/:riskId", authenticateJWT, getRiskLinks);
router.patch("/:id", authenticateJWT, updateRiskLinkStatus);

export default router;
```

There is deliberately **no** DELETE route: dismissing is the way to remove a link from view, and it survives recompute. A hard delete would be silently undone the next time the risk is saved.

- [ ] **Step 5: Mount the router in `app.ts`**

Add the import next to the other route imports (near line 8):

```typescript
import riskLinksRoutes from "./routes/riskLinks.route";
```

Add the mount next to `app.use("/api/projectRisks", risksRoutes);` (near line 222):

```typescript
app.use("/api/riskLinks", riskLinksRoutes);
```

- [ ] **Step 6: Run the controller tests**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 7: Regenerate the API docs and verify no drift**

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

Expected: `check:api-drift` reports no drift. If it fails, the generators did not pick up the new route — check that `app.ts` mounts it and that the route file exports a default router.

- [ ] **Step 8: Build**

```bash
cd Servers && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 9: Commit route, controller, and generated files together**

The `api-docs-drift` CI job fails if the regenerated files land in a later commit.

```bash
git add Servers/controllers/riskLinks.ctrl.ts Servers/controllers/__tests__/riskLinks.ctrl.test.ts \
        Servers/routes/riskLinks.route.ts Servers/app.ts \
        Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "feat(risk-links): add risk link endpoints"
```

---

## Task 7: Fire the recompute from every write that can change a score

**Files:**
- Modify: `Servers/controllers/risks.ctrl.ts` (post-commit block after line 263; post-commit block after line 518; after the `withBulkTransaction` call around lines 784-816)
- Modify: `Servers/advisor/aiActions/createRisk/execute.ts:114-165`
- Test: `Servers/controllers/__tests__/riskLinks.enqueue.test.ts`

**Interfaces:**
- Consumes: `enqueueRiskLinkRecompute` (Task 5).
- Produces: nothing new; this task only wires existing pieces.

Follow amendment B's table exactly. **Three** enqueue sites in `risks.ctrl.ts` and **one** in the AI action. No delete-path enqueue.

- [ ] **Step 1: Write the failing tests**

These lock in the negative cases, which are the ones a future reader is most likely to "fix" wrongly.

```typescript
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
}));

import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import * as fs from "fs";
import * as path from "path";

/**
 * Amendment B is a policy, not a code path — the controller is far too wired
 * into Express, Sequelize, notifications and audit logging to exercise its four
 * commit sites from a unit test without mocking half the backend. These assert
 * the policy against the source instead: the enqueue appears in the create,
 * update and set_category paths, and nowhere near the delete path.
 */
const source = fs.readFileSync(
  path.join(__dirname, "..", "risks.ctrl.ts"),
  "utf8",
);

const bodyOf = (fnName: string): string => {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start === -1) throw new Error(`${fnName} not found in risks.ctrl.ts`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

describe("risk link enqueue matrix (amendment B)", () => {
  it("imports the producer", () => {
    expect(source).toContain("enqueueRiskLinkRecompute");
    expect(enqueueRiskLinkRecompute).toBeDefined();
  });

  it("enqueues after creating a risk", () => {
    expect(bodyOf("createRisk")).toContain("enqueueRiskLinkRecompute(");
  });

  it("enqueues after updating a risk", () => {
    expect(bodyOf("updateRiskById")).toContain("enqueueRiskLinkRecompute(");
  });

  // R7: edges outlive a soft-deleted risk and the job would exit quietly anyway.
  it("does NOT enqueue after deleting a risk", () => {
    expect(bodyOf("deleteRiskById")).not.toContain("enqueueRiskLinkRecompute(");
  });

  it("enqueues from the bulk path only under set_category", () => {
    const bulk = bodyOf("bulkUpdateProjectRisks");
    expect(bulk).toContain("enqueueRiskLinkRecompute(");
    expect(bulk).toContain('action === "set_category"');
  });
});

describe("agent_create_risk", () => {
  const executeSource = fs.readFileSync(
    path.join(__dirname, "..", "..", "advisor", "aiActions", "createRisk", "execute.ts"),
    "utf8",
  );

  // Enqueueing before the commit would race: the worker reads the risk, does not
  // find it, and exits quietly — leaving the risk permanently unlinked.
  it("enqueues from afterCommit, not inline", () => {
    expect(executeSource).toContain("ctx.transaction.afterCommit(");
    expect(executeSource).toContain("enqueueRiskLinkRecompute(");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.enqueue.test.ts
```

Expected: FAIL on "enqueues after creating a risk" and the three that follow.

- [ ] **Step 3: Add the import to `risks.ctrl.ts`**

With the other service imports at the top of the file (lines 1-38):

```typescript
import { enqueueRiskLinkRecompute } from "../services/automations/automationProducer";
```

- [ ] **Step 4: Enqueue after `createRisk` commits**

In `createRisk`, inside the `if (newProjectRisk) { ... }` post-commit block. Place it **after the closing brace of** the `if (newProjectRisk.ale_estimate != null) { recordPortfolioSnapshot(...) }` block and **before** the `// Send risk owner assignment notification` comment. It must not sit inside the `ale_estimate` guard — a risk with no quantitative fields still needs its links.

```typescript
      // Recompute this risk's stored links (fire-and-forget)
      enqueueRiskLinkRecompute(req.organizationId!, newProjectRisk.id!).catch((err) =>
        console.error("Failed to enqueue risk link recompute:", err),
      );
```

- [ ] **Step 5: Enqueue after `updateRiskById` commits**

Same placement in `updateRiskById`: after the closing brace of the `if (updatedProjectRisk.ale_estimate != null) { ... }` block (near line 537) and before the `const oldRiskOwner = ...` line. The parsed id local in this function is `projectRiskId`.

```typescript
      // Recompute this risk's stored links (fire-and-forget)
      enqueueRiskLinkRecompute(req.organizationId!, projectRiskId).catch((err) =>
        console.error("Failed to enqueue risk link recompute:", err),
      );
```

- [ ] **Step 6: Enqueue after the bulk `set_category` path**

`bulkUpdateProjectRisks` already parses `const ids = parseBulkIds(req.body?.ids);` and `const action = req.body?.action as BulkProjectRiskAction;` at the top, and `action` is validated to be one of `set_owner | set_category | archive`. Add this after the `await withBulkTransaction({ audit: {...} }, async (transaction) => {...})` call returns, outside the transaction callback:

```typescript
    // Only set_category moves a scoring signal. set_owner does not affect
    // scoring, and archive is a soft delete — see R7.
    if (action === "set_category") {
      for (const riskId of ids) {
        enqueueRiskLinkRecompute(req.organizationId!, riskId).catch((err) =>
          console.error("Failed to enqueue risk link recompute:", err),
        );
      }
    }
```

- [ ] **Step 7: Do NOT touch `deleteRiskById`**

Confirm by reading the post-commit block after line 679 that no enqueue was added there. R7: the edges must survive, and a job for a deleted risk finds no subject row and returns immediately.

- [ ] **Step 8: Enqueue from the AI action**

In `Servers/advisor/aiActions/createRisk/execute.ts`, add the import:

```typescript
import { enqueueRiskLinkRecompute } from "../../../services/automations/automationProducer";
```

Then, in `executeCreateRisk`, immediately after the `if (newRisk.id == null) throw ...` guard:

```typescript
  // The generic executor owns this transaction and commits it after we return,
  // so there is no post-commit hook to hang this on. Enqueueing inline would
  // race: the worker would read a risk that is not committed yet, find nothing,
  // and exit quietly, leaving the risk permanently unlinked.
  // Safe to use afterCommit here: every caller of processApprovalQuery opens a
  // top-level sequelize.transaction(), so this fires on a real commit rather
  // than a savepoint release.
  ctx.transaction.afterCommit(() => {
    void enqueueRiskLinkRecompute(ctx.organizationId, newRisk.id!).catch((err) =>
      console.error("Failed to enqueue risk link recompute:", err),
    );
  });
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.enqueue.test.ts && npm run build
```

Expected: PASS, 6 tests, and a clean build.

- [ ] **Step 10: Run the existing risk controller tests to confirm nothing regressed**

```bash
cd Servers && npx jest controllers/__tests__/risks
```

Expected: PASS. If `risks.bulk.ctrl.test.ts` now fails on an unmocked module, add `jest.mock("../../services/automations/automationProducer", () => ({ enqueueRiskLinkRecompute: jest.fn() }));` to its mock block alongside the existing ones.

- [ ] **Step 11: Commit**

```bash
git add Servers/controllers/risks.ctrl.ts Servers/controllers/__tests__/ \
        Servers/advisor/aiActions/createRisk/execute.ts
git commit -m "feat(risk-links): recompute links after every scoring-relevant risk write"
```

---

## Task 8: Tenant isolation, against a real database

**Files:**
- Modify: `Servers/tests/factories/test-entities.factory.ts:57-79`
- Create: `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4.
- Produces: `CreateTestRiskOptions` gains `risk_category?: string[]`, `controls_mapping?: string`, `assessment_mapping?: string`, `ai_lifecycle_phase?: string`.

`createTestRisk` currently inserts only `organization_id, risk_name, risk_owner, created_at, updated_at` — no scoring column at all, so as it stands no two seeded risks can ever score above zero.

- [ ] **Step 1: Extend the factory**

Replace `CreateTestRiskOptions` and `createTestRisk` in `Servers/tests/factories/test-entities.factory.ts` with:

```typescript
export interface CreateTestRiskOptions {
  risk_name?: string;
  risk_owner?: number;
  /** Scoring signals. Omitted columns stay NULL, which never matches. */
  risk_category?: string[];
  controls_mapping?: string;
  assessment_mapping?: string;
  ai_lifecycle_phase?: string;
}

export async function createTestRisk(
  orgId: number,
  options: CreateTestRiskOptions = {},
): Promise<number> {
  const name = options.risk_name ?? `Risk ${Date.now()}`;
  const [result] = await sequelize.query(
    `INSERT INTO risks (organization_id, risk_name, risk_owner, risk_category,
                        controls_mapping, assessment_mapping, ai_lifecycle_phase,
                        created_at, updated_at)
     VALUES (:orgId, :name, :riskOwner,
             CAST(:riskCategory AS verifywise.enum_projectrisks_risk_category[]),
             :controlsMapping, :assessmentMapping,
             CAST(:aiLifecyclePhase AS verifywise.enum_projectrisks_ai_lifecycle_phase),
             NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        orgId,
        name,
        riskOwner: options.risk_owner ?? null,
        riskCategory: options.risk_category ?? null,
        controlsMapping: options.controls_mapping ?? null,
        assessmentMapping: options.assessment_mapping ?? null,
        aiLifecyclePhase: options.ai_lifecycle_phase ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}
```

`risk_category` is passed as a JS array; the `pg` driver serialises it to a Postgres array literal, and the explicit `CAST` resolves it to the enum array type. The two enum casts are the only place in application-adjacent code that names the `verifywise.` schema — allowed here because a type name is not a table name and `search_path` does not cover the cast target reliably in a test connection.

- [ ] **Step 2: Write the isolation test**

```typescript
jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestRisk } from "../../factories";
import { recomputeRiskLinks } from "../../../services/riskLinks/recompute";
import {
  getRiskLinksForRiskQuery,
  getRiskLinkByIdQuery,
} from "../../../utils/riskLink.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const CATEGORY = ["Strategic risk"];

describe("risk_links tenant isolation", () => {
  it("never links two risks from different orgs, even with identical fields", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerRiskA = await createTestRisk(owner.orgId, {
      risk_category: CATEGORY,
      ai_lifecycle_phase: "Deployment",
    });
    const ownerRiskB = await createTestRisk(owner.orgId, {
      risk_category: CATEGORY,
      ai_lifecycle_phase: "Deployment",
    });
    const attackerRisk = await createTestRisk(attacker.orgId, {
      risk_category: CATEGORY,
      ai_lifecycle_phase: "Deployment",
    });

    await recomputeRiskLinks(owner.orgId, ownerRiskA);

    const [rows] = await sequelize.query(
      `SELECT source_risk_id, target_risk_id, organization_id FROM risk_links`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: owner.orgId,
      source_risk_id: Math.min(ownerRiskA, ownerRiskB),
      target_risk_id: Math.max(ownerRiskA, ownerRiskB),
    });
    const ids = [(rows[0] as any).source_risk_id, (rows[0] as any).target_risk_id];
    expect(ids).not.toContain(attackerRisk);
  });

  it("hides the owner's links from the attacker org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment" });
    await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment" });
    await recomputeRiskLinks(owner.orgId, riskA);

    expect(await getRiskLinksForRiskQuery(owner.orgId, riskA, ["suggested"])).toHaveLength(1);
    expect(await getRiskLinksForRiskQuery(attacker.orgId, riskA, ["suggested"])).toHaveLength(0);

    const [rows] = await sequelize.query(`SELECT id FROM risk_links LIMIT 1`);
    const linkId = (rows as any[])[0].id;
    expect(await getRiskLinkByIdQuery(linkId, attacker.orgId)).toBeNull();
    expect(await getRiskLinkByIdQuery(linkId, owner.orgId)).not.toBeNull();
  });

  it("keeps the edge but hides it once the partner risk is soft-deleted (R7)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment" });
    const riskB = await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment" });
    await recomputeRiskLinks(owner.orgId, riskA);

    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: riskB },
    });

    expect(await getRiskLinksForRiskQuery(owner.orgId, riskA, ["suggested"])).toHaveLength(0);
    const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM risk_links`);
    expect((rows as any[])[0].n).toBe(1);
  });

  it("is idempotent: running twice leaves exactly one row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const riskB = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    await recomputeRiskLinks(owner.orgId, riskA);
    await recomputeRiskLinks(owner.orgId, riskB);
    await recomputeRiskLinks(owner.orgId, riskA);

    const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM risk_links`);
    expect((rows as any[])[0].n).toBe(1);
  });
});
```

The last test is the one that catches a canonicalisation bug: without `canonicalPair`, recomputing both endpoints produces two rows for one pair.

- [ ] **Step 3: Run the isolation test**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.isolation
```

Expected: PASS, 4 tests. This needs a running PostgreSQL — the `globalSetup` provisions the test database.

- [ ] **Step 4: Run the whole unit suite to check for collateral damage**

```bash
cd Servers && npm run test:unit
```

Expected: PASS. The coverage thresholds (statements 30 / branches 25 / functions 25 / lines 40) only apply to `test:coverage`, but a large body of new uncovered code would move them — the new files are well tested, so this should improve, not regress.

- [ ] **Step 5: Commit**

```bash
git add Servers/tests/
git commit -m "test(risk-links): add tenant isolation coverage and extend the risk factory"
```

---

## Task 9: Documentation

**Files:**
- Modify: `docs/technical/domains/risk-management.md:501-524`
- Modify: `CLAUDE.md` (the "Last Updated" date only, if any CLAUDE.md changed — it should not have)

**Interfaces:**
- Consumes: the shipped behaviour of Tasks 1-8.
- Produces: nothing consumed by code.

The existing "Related Risks (risk inheritance, phase 1)" section is now wrong in four specific ways: it says the relation is "derived, not stored — there is no risk-to-risk table"; it documents a cap of 5; it documents a risk-level tiebreak; and it documents a recommendation string with a `mitigation_plan` fallback. All four are false for the server-side engine.

- [ ] **Step 1: Read the current section**

```bash
sed -n '495,530p' docs/technical/domains/risk-management.md
```

- [ ] **Step 2: Replace it**

Replace lines 501-524 with:

```markdown
### Risk links (risk inheritance)

Risks are linked to each other in `verifywise.risk_links` — one row per pair,
stored canonically (smaller risk id first) for undirected `related_to` edges.
An edge carries a `score`, a structured `reasons` array, a `source`
(`derived` | `user` | `agent`) and a `status` (`suggested` | `confirmed` |
`dismissed`). Source and status are orthogonal: a derived suggestion can be
confirmed, and a user-created link can be dismissed.

**Scoring.** `Servers/services/riskLinks/` holds a `LinkSignalProvider`
interface and, today, one provider: `field_overlap` (tier 0). It scores shared
category 3, shared control mapping 2, shared assessment mapping 2, same
lifecycle phase 2, shared project 1. `"0"` in a control or assessment mapping
means "nothing mapped" and never matches — the risk form has no picker for
those fields and always sends `0`. Providers are merged by summing scores and
concatenating reasons; a provider that throws is logged and skipped, and if
*every* provider fails the recompute writes and deletes nothing.

**Persistence.** A pair at or above score 3 becomes a `derived` / `suggested`
edge, up to 20 new edges per recompute, best score first with ties broken by
risk id. The cap gates creation only. Pruning is driven by the score alone —
an edge is deleted only when it is `derived` + `suggested` *and* its score fell
below 3 — because scores are symmetric between two risks but cap membership is
not, and pruning on the cap would make the two endpoints delete and recreate
the same edge on alternating saves. `confirmed` edges are never pruned, and a
`dismissed` edge stays dismissed however high its score climbs.

**When it runs.** A BullMQ job (`risk_link_recompute` on the shared
`automation-actions` queue) recomputes one risk at a time, enqueued after a
risk is created, after it is updated, and after a bulk `set_category`.
Deleting a risk does *not* trigger a recompute: `risks` is soft-deleted, edges
survive, and the read path filters soft-deleted risks on both endpoints.
`POST /api/riskLinks/recompute` (Admin) fans out one job per active risk and is
required at least once per org, since the table starts empty.

**Endpoints.**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/riskLinks/:riskId` | any authenticated | Links in either direction. Defaults to `suggested` + `confirmed`; `?status=dismissed` for the dismissed list. |
| PATCH | `/api/riskLinks/:id` | any authenticated | `{ status }`. Allowed: `suggested→confirmed`, `suggested→dismissed`, `confirmed→dismissed`, `dismissed→confirmed`, and `dismissed→suggested` as an explicit undo that clears the decision fields. Anything else is a 400. |
| POST | `/api/riskLinks/recompute` | Admin | Backfill the whole org. |

There is no delete endpoint: a hard delete would be recreated by the next
recompute, so dismissal is the durable way to remove a link.

> The older client-side summary in
> `Clients/src/application/tools/relatedRisks.ts` still renders after a risk is
> saved. It computes the same signals in the browser and stores nothing; it is
> superseded by the endpoints above and is removed when the linked-risks UI
> lands.
```

- [ ] **Step 3: Update the "Last Updated" line at the top of the file**

```bash
sed -n '1,6p' docs/technical/domains/risk-management.md
```

Set it to `2026-08-12` (or today's date if later).

- [ ] **Step 4: Verify no other doc still claims links are not stored**

```bash
grep -rn "derived, not stored\|no risk-to-risk table" docs/
```

Expected: no results.

- [ ] **Step 5: Commit**

```bash
git add docs/technical/domains/risk-management.md
git commit -m "docs(risk-links): document the stored risk link engine"
```

---

## Final verification

- [ ] **Step 1: Full build**

```bash
cd Servers && npm run build
```

- [ ] **Step 2: Full unit suite**

```bash
cd Servers && npm run test:unit
```

- [ ] **Step 3: Integration suite**

```bash
cd Servers && npm run test:integration
```

- [ ] **Step 4: API drift**

```bash
cd Servers && npm run check:api-drift
```

- [ ] **Step 5: End-to-end smoke against the dev server**

Start the backend and the worker, then, signed in as an Admin:

1. `POST /api/riskLinks/recompute` → 202 with a non-zero `enqueued` count.
2. `GET /api/riskLinks/<a risk id that shares a category with another>` → at least one link with `score >= 3`, structured `reasons`, `direction: "undirected"`.
3. `PATCH /api/riskLinks/<that link id>` with `{"status":"dismissed"}` → 200.
4. Re-run `POST /api/riskLinks/recompute`, then `GET /api/riskLinks/<same risk>` → the dismissed link is gone from the default list, and `?status=dismissed` still returns it. This is R1 end-to-end: the dismissal survived a recompute.

---

## Out of scope for A1

- **A2:** the structural-graph (tier 1) and embedding (tier 2) providers. `PROVIDERS` in `recompute.ts` is the only place they attach.
- **B:** the linked-risks UI, `POST /riskLinks` for manual linking (`source: "user"`, initial status `confirmed`), and the removal of the phase-1 client module per amendment E.
- **C:** the risk inheritance agent (`source: "agent"`, initial status `suggested`).
