# Risk Links A2a — Structural Graph Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tier-1 link signal provider that scores two risks as related when they are attached to the same framework elements, weighted so that rare elements count and ubiquitous ones do not.

**Architecture:** One SQL function in `utils/riskLink.utils.ts` returns `(target_risk_id, element_key, degree)` rows for one subject risk, scoped to the org. One pure-arithmetic provider in `services/riskLinks/providers/structuralGraph.ts` turns those rows into `LinkCandidate`s using `min(4, Σ 2 / log2(1 + degree))`. `recompute.ts` registers it as the second provider, and — because there are now two — a provider that throws aborts the whole run instead of letting the survivors prune real suggestions.

**Tech Stack:** TypeScript, Node 22, Sequelize 6 raw SQL, PostgreSQL, Jest.

**Spec:** `docs/superpowers/specs/2026-08-13-risk-links-a2a-design.md`. Read it before Task 1. Section references below (§3.2, §4.1, …) point at that file.

## Global Constraints

- **Application SQL uses unqualified table names.** `search_path` is set to `verifywise` in `database/db.ts`. Never write `verifywise.risks` or `public.risks` in application or test code. (Migrations are the opposite — but this plan has no migration.)
- **Every query is scoped by `organization_id`.** No exceptions in this plan.
- **No new dependency.** Everything here is stdlib arithmetic and existing Sequelize.
- **No migration, no route, no controller, no swagger change.** `npm run check:api-drift` must still report `705/705`.
- **Nothing under `Clients/`.** A2a is backend-only. The UI is phase B.
- **No `console.log`.** Use `logger` from `utils/logger/fileLogger`.
- **Do not push, do not open a PR, do not merge.** Commit locally only.
- **Threshold and cap are unchanged:** `LINK_SCORE_THRESHOLD = 3`, `MAX_LINKS_PER_RISK = 20`. This plan does not touch them.
- **Out of scope, do NOT build:** embeddings / A2b, the `duplicates` relation type, any lifecycle or endpoint change, any UI.
- Run backend tests from `Servers/`: `npm test -- <path>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `Servers/services/riskLinks/types.ts` *(modify)* | `StructuralNeighbourRow` — the row shape, beside the other row shapes. |
| `Servers/utils/riskLink.utils.ts` *(modify)* | `getStructuralNeighboursQuery` — all SQL and all type coercion. |
| `Servers/services/riskLinks/providers/structuralGraph.ts` *(create)* | Rarity arithmetic, cap, rounding, `detail` string. No SQL. |
| `Servers/services/riskLinks/recompute.ts` *(modify)* | Register tier 1; failure becomes fatal; filter merged targets to the org's candidate ids. |
| `Servers/services/riskLinks/tests/structuralGraph.spec.ts` *(create)* | Provider unit tests, query mocked. |
| `Servers/services/riskLinks/tests/recompute.spec.ts` *(modify)* | Fatal-failure and merge-guard tests, plus the stub the whole file now needs. |
| `Servers/utils/__tests__/riskLink.utils.test.ts` *(modify)* | SQL-shape and coercion tests. |
| `Servers/tests/factories/test-entities.factory.ts` + `index.ts` *(modify)* | `attachRiskToEuControl`. |
| `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts` *(modify)* | Two real-database isolation tests. |
| `docs/technical/domains/risk-management.md` *(modify)* | Document tier 1 and the new failure rule. |

The split follows A1: SQL and coercion in the utils file, algorithm in the provider, orchestration in `recompute.ts`. Keeping the SQL out of the provider is what makes the provider testable without a database.

---

## Task 1: The structural-neighbour query

**Files:**
- Modify: `Servers/services/riskLinks/types.ts` (append after `RiskScoringRow`, around line 26)
- Modify: `Servers/utils/riskLink.utils.ts` (append after `getActiveRiskIdsQuery`, around line 91)
- Test: `Servers/utils/__tests__/riskLink.utils.test.ts`

**Interfaces:**
- Consumes: `toNumber` (already private in `riskLink.utils.ts`, line 15), `sequelize`, `QueryTypes`.
- Produces: `StructuralNeighbourRow { target_risk_id: number; element_key: string; degree: number }` and `getStructuralNeighboursQuery(organizationId: number, riskId: number): Promise<StructuralNeighbourRow[]>`. Tasks 2 and 3 depend on both names exactly as written.

**Background you need:**

Ten join tables attach a risk to a framework element. Eight of them name the risk column `projects_risks_id` — a legacy misnomer. It holds a **risk id** and joins directly against `risks.id`; `projects_risks` has no `id` column to reference. Do not add a hop through `projects_risks` (§3.3).

`COUNT(*)` is `bigint`, and node-pg returns `bigint` as a **string**. Verified against this database: `typeof degree === "string"`, and `1 + degree` yields `"14"`. It must go through `toNumber` (§8).

- [ ] **Step 1: Write the failing tests**

Add to `Servers/utils/__tests__/riskLink.utils.test.ts`. Extend the existing import block at line 8 to include `getStructuralNeighboursQuery`, then append these three tests inside the existing `describe("riskLink.utils", …)`:

```typescript
  it("filters by organization on every UNION arm and on the risks join", async () => {
    await getStructuralNeighboursQuery(7, 42);
    const [sql, options] = mockQuery.mock.calls[0];
    // Ten UNION arms plus the risks join. Drop any single one and this goes red.
    expect(sql.match(/organization_id = :organizationId/g)).toHaveLength(11);
    expect(sql).toContain("r.is_deleted = false");
    expect(options.replacements).toEqual({ organizationId: 7, riskId: 42 });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("computes degrees from the filtered set, not from the raw links", async () => {
    await getStructuralNeighboursQuery(7, 42);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain("COUNT(*) AS degree");
    // Rarity is a property of this org's own graph (spec §6). Counting over
    // element_links instead would include soft-deleted risks.
    expect(sql.slice(sql.indexOf("degrees AS"))).toContain("FROM active");
  });

  it("coerces the bigint degree that pg hands back as a string", async () => {
    mockQuery.mockResolvedValue([
      { target_risk_id: 3, element_key: "eu_control:412", degree: "3" },
    ]);
    const [row] = await getStructuralNeighboursQuery(7, 42);
    // Math.log2(1 + "3") is Math.log2("13") — wrong, and no type error anywhere.
    expect(row.degree).toBe(3);
    expect(typeof row.degree).toBe("number");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- utils/__tests__/riskLink.utils.test.ts
```

Expected: FAIL — `getStructuralNeighboursQuery is not a function` (or a TypeScript error that the module has no such export).

- [ ] **Step 3: Add the row type**

Append to `Servers/services/riskLinks/types.ts`, after the `RiskScoringRow` interface:

```typescript
/**
 * One (neighbour, shared element) row from the tier-1 graph query.
 *
 * `element_key` is namespaced by table, e.g. "eu_control:412". `degree` is how
 * many active risks in this org are attached to that element — always >= 2,
 * since the row only exists because two distinct risks share it.
 */
export interface StructuralNeighbourRow {
  target_risk_id: number;
  element_key: string;
  degree: number;
}
```

- [ ] **Step 4: Write the query**

Add `StructuralNeighbourRow` to the import from `../services/riskLinks/types` at the top of `Servers/utils/riskLink.utils.ts`, then append this function after `getActiveRiskIdsQuery`:

```typescript
/**
 * Every active risk in the org that shares a framework element with this one,
 * one row per (neighbour, shared element), with that element's degree.
 *
 * Eight of the ten join tables call the risk column `projects_risks_id`. That is
 * a legacy misnomer: it holds a risk id and joins straight to `risks.id` — there
 * is no hop through `projects_risks`.
 *
 * The org filter appears on every arm AND on the risks join. Element ids are not
 * global — each of the ten element tables is org-scoped — but `organization_id`
 * is nullable on these join tables and nothing declares a foreign key to the
 * element table, so a row naming another org's element is schema-legal. The
 * filter is what makes this correct instead of dependent on ids not colliding.
 */
export async function getStructuralNeighboursQuery(
  organizationId: number,
  riskId: number,
): Promise<StructuralNeighbourRow[]> {
  const rows = await sequelize.query(
    `WITH element_links AS (
       SELECT projects_risks_id AS risk_id, 'iso42001_subclause:'     || subclause_id                 AS element_key FROM subclauses_iso__risks            WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'iso27001_subclause:'     || subclause_id                                FROM subclauses_iso27001__risks       WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'iso42001_annexcategory:' || annexcategory_id                            FROM annexcategories_iso__risks       WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'iso27001_annexcontrol:'  || annexcontrol_id                             FROM annexcontrols_iso27001__risks    WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'eu_control:'             || control_id                                  FROM controls_eu__risks               WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'eu_subcontrol:'          || subcontrol_id                               FROM subcontrols_eu__risks            WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'eu_answer:'              || answer_id                                   FROM answers_eu__risks                WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'nist_subcategory:'       || nist_ai_rmf_subcategory_id                  FROM nist_ai_rmf_subcategories__risks WHERE organization_id = :organizationId
       UNION ALL
       SELECT risk_id,                      'custom_l2:'              || level2_impl_id                              FROM custom_framework_level2_risks    WHERE organization_id = :organizationId
       UNION ALL
       SELECT risk_id,                      'custom_l3:'              || level3_impl_id                              FROM custom_framework_level3_risks    WHERE organization_id = :organizationId
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
     WHERE a1.risk_id = :riskId`,
    { replacements: { organizationId, riskId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    target_risk_id: row.target_risk_id,
    element_key: row.element_key,
    degree: toNumber(row.degree),
  }));
}
```

`SELECT DISTINCT` is redundant today — all ten join tables have a primary key on `(element_id, risk_id)`, and the arm prefixes stop two arms from producing the same `element_key`. Keep it anyway: it costs one hash over a small set and keeps `COUNT(*)` a correct degree if a future join table ships without that constraint. **Do not remove it as dead weight.**

**Do not add an index.** Eight of the ten tables have no index on `organization_id` and will be sequentially scanned. That is a known, accepted limit for this phase (§9): the tables are three narrow integer columns, and the honest ceiling is the backfill, not an interactive save. An index needs a migration, and this plan has none. If you think the scan matters, say so in your report — do not add it.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- utils/__tests__/riskLink.utils.test.ts
```

Expected: PASS, 9 tests (6 existing + 3 new).

- [ ] **Step 6: Verify the SQL actually runs against Postgres**

The unit tests mock `sequelize.query`, so they never execute the SQL. A typo in a column name would pass them. Run it for real:

```bash
psql -d verifywise -c "SET search_path TO verifywise; PREPARE p(int,int) AS WITH element_links AS (SELECT projects_risks_id AS risk_id, 'eu_control:' || control_id AS element_key FROM controls_eu__risks WHERE organization_id = \$1) SELECT 1 FROM element_links LIMIT 0;"
```

Then check every column the query names actually exists:

```bash
psql -d verifywise -tAc "SELECT table_name || ': ' || string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='verifywise' AND table_name IN ('subclauses_iso__risks','subclauses_iso27001__risks','annexcategories_iso__risks','annexcontrols_iso27001__risks','controls_eu__risks','subcontrols_eu__risks','answers_eu__risks','nist_ai_rmf_subcategories__risks','custom_framework_level2_risks','custom_framework_level3_risks') GROUP BY table_name ORDER BY table_name;"
```

Expected: the eight `*__risks` tables show `organization_id, <element>_id, projects_risks_id`; the two custom tables show `organization_id, level{2,3}_impl_id, risk_id`. If any name differs from the query, fix the query, not the schema.

- [ ] **Step 7: Commit**

```bash
git add Servers/services/riskLinks/types.ts Servers/utils/riskLink.utils.ts Servers/utils/__tests__/riskLink.utils.test.ts
git commit -m "feat(risk-links): query a risk's shared framework elements and their degrees"
```

---

## Task 2: The structural-graph provider

**Files:**
- Create: `Servers/services/riskLinks/providers/structuralGraph.ts`
- Test: `Servers/services/riskLinks/tests/structuralGraph.spec.ts`

**Interfaces:**
- Consumes: `getStructuralNeighboursQuery` and `StructuralNeighbourRow` from Task 1; `LinkCandidate`, `LinkSignalProvider`, `RecomputeContext` from `../types`.
- Produces: `structuralGraphProvider: LinkSignalProvider` with `name: "structural_graph"` and `tier: 1`. Task 3 imports it by that exact name.

**The formula (§4.1):** `points(A, B) = min(4, Σ 2 / log2(1 + degree(e)))` over the elements A and B share, rounded to two decimals. Degree 2 → 1.26, degree 3 → 1.00, degree 5 → 0.77, degree 10 → 0.58, degree 40 → 0.37. The cap of 4 sits below tier 0's maximum of 10, so strong field overlap still outranks pure structure, while structure alone can still originate a suggestion.

The provider ignores `ctx.candidates` for scoring — the SQL already restricts itself to active risks in the org, which is the same population `candidates` was built from (§3.1). It does **not** apply the threshold; that belongs to `recompute.ts`.

- [ ] **Step 1: Write the failing tests**

Create `Servers/services/riskLinks/tests/structuralGraph.spec.ts`:

```typescript
jest.mock("../../../utils/riskLink.utils");

import * as utils from "../../../utils/riskLink.utils";
import { structuralGraphProvider } from "../providers/structuralGraph";
import { RecomputeContext, RiskScoringRow, StructuralNeighbourRow } from "../types";

const mockUtils = utils as jest.Mocked<typeof utils>;

const subject: RiskScoringRow = {
  id: 7,
  risk_category: null,
  controls_mapping: null,
  assessment_mapping: null,
  ai_lifecycle_phase: null,
  projects: [],
};

const ctx: RecomputeContext = { organizationId: 1, subject, candidates: [] };

const shared = (
  targetRiskId: number,
  elementKey: string,
  degree: number,
): StructuralNeighbourRow => ({
  target_risk_id: targetRiskId,
  element_key: elementKey,
  degree,
});

const rows = (...values: StructuralNeighbourRow[]) =>
  mockUtils.getStructuralNeighboursQuery.mockResolvedValue(values);

beforeEach(() => jest.resetAllMocks());

describe("structuralGraphProvider", () => {
  it("scores a single element shared by only these two risks at 1.26", async () => {
    rows(shared(3, "eu_control:412", 2));
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate).toEqual({
      targetRiskId: 3,
      score: 1.26,
      reasons: [
        { signal: "shared_framework_element", weight: 1.26, detail: "1 EU AI Act control" },
      ],
    });
  });

  it("adds three exclusive elements up past the threshold", async () => {
    rows(
      shared(3, "eu_control:1", 2),
      shared(3, "eu_control:2", 2),
      shared(3, "iso42001_subclause:9", 2),
    );
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.score).toBe(3.79);
  });

  it("caps a pair at 4 however many elements it shares", async () => {
    rows(...Array.from({ length: 10 }, (_, i) => shared(3, `eu_control:${i}`, 2)));
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.score).toBe(4);
  });

  it("returns a near-ubiquitous element rather than dropping it", async () => {
    rows(shared(3, "eu_control:412", 40));
    const [candidate] = await structuralGraphProvider.score(ctx);
    // The threshold belongs to recompute.ts, not to a provider.
    expect(candidate.score).toBe(0.37);
  });

  it("scores identically read from either endpoint", async () => {
    rows(shared(3, "eu_control:1", 5), shared(3, "nist_subcategory:2", 3));
    const [fromSeven] = await structuralGraphProvider.score(ctx);

    rows(shared(7, "eu_control:1", 5), shared(7, "nist_subcategory:2", 3));
    const [fromThree] = await structuralGraphProvider.score({
      ...ctx,
      subject: { ...subject, id: 3 },
    });

    expect(fromSeven.score).toBe(fromThree.score);
  });

  it("returns an empty array when the risk shares no element", async () => {
    rows();
    await expect(structuralGraphProvider.score(ctx)).resolves.toEqual([]);
  });

  it("orders the breakdown by count descending, then label, and pluralises", async () => {
    rows(
      shared(3, "iso42001_subclause:1", 2),
      shared(3, "eu_control:1", 2),
      shared(3, "eu_control:2", 2),
    );
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.reasons[0].detail).toBe("2 EU AI Act controls, 1 ISO 42001 subclause");
  });

  it("counts custom level-2 and level-3 items under one label", async () => {
    rows(shared(3, "custom_l2:1", 2), shared(3, "custom_l3:1", 2));
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.reasons[0].detail).toBe("2 custom framework items");
  });

  it("separates two neighbours reached through the same element", async () => {
    rows(shared(3, "eu_control:1", 3), shared(9, "eu_control:1", 3));
    const candidates = await structuralGraphProvider.score(ctx);
    expect(candidates.map((c) => c.targetRiskId).sort()).toEqual([3, 9]);
    expect(candidates.every((c) => c.score === 1)).toBe(true);
  });

  it("propagates a query failure instead of scoring nothing", async () => {
    mockUtils.getStructuralNeighboursQuery.mockRejectedValue(new Error("db down"));
    await expect(structuralGraphProvider.score(ctx)).rejects.toThrow("db down");
  });

  it("declares itself tier 1", () => {
    expect(structuralGraphProvider.name).toBe("structural_graph");
    expect(structuralGraphProvider.tier).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- services/riskLinks/tests/structuralGraph.spec.ts
```

Expected: FAIL — cannot find module `../providers/structuralGraph`.

- [ ] **Step 3: Write the provider**

Create `Servers/services/riskLinks/providers/structuralGraph.ts`:

```typescript
import { getStructuralNeighboursQuery } from "../../../utils/riskLink.utils";
import { LinkCandidate, LinkSignalProvider, RecomputeContext } from "../types";

/** Numerator of the rarity weight: 2 / log2(1 + degree). Degree 2 gives 1.26. */
const RARITY_NUMERATOR = 2;

/**
 * Tier 1's ceiling. Tier 0 can reach 10, so field overlap still outranks pure
 * structure, while structure alone can still clear the threshold of 3.
 */
export const MAX_STRUCTURAL_POINTS = 4;

/** element_key prefix -> [singular, plural]. Two prefixes may share a label. */
const LABELS: Record<string, [string, string]> = {
  iso42001_subclause: ["ISO 42001 subclause", "ISO 42001 subclauses"],
  iso27001_subclause: ["ISO 27001 subclause", "ISO 27001 subclauses"],
  iso42001_annexcategory: ["ISO 42001 annex category", "ISO 42001 annex categories"],
  iso27001_annexcontrol: ["ISO 27001 annex control", "ISO 27001 annex controls"],
  eu_control: ["EU AI Act control", "EU AI Act controls"],
  eu_subcontrol: ["EU AI Act subcontrol", "EU AI Act subcontrols"],
  eu_answer: ["EU AI Act assessment answer", "EU AI Act assessment answers"],
  nist_subcategory: ["NIST AI RMF subcategory", "NIST AI RMF subcategories"],
  custom_l2: ["custom framework item", "custom framework items"],
  custom_l3: ["custom framework item", "custom framework items"],
};

/**
 * "2 EU AI Act controls, 1 ISO 42001 subclause".
 *
 * Grouped by label rather than by prefix, so custom_l2 and custom_l3 collapse
 * into one count. Titles would mean joining ten struct tables for a string; the
 * type breakdown is the useful part.
 */
const describeElements = (elementKeys: string[]): string => {
  const counts = new Map<string, number>();
  const plurals = new Map<string, string>();

  for (const key of elementKeys) {
    const label = LABELS[key.slice(0, key.indexOf(":"))];
    if (!label) continue; // Unreachable: the query emits only the prefixes above.
    counts.set(label[0], (counts.get(label[0]) ?? 0) + 1);
    plurals.set(label[0], label[1]);
  }

  return [...counts.entries()]
    .sort(([labelA, countA], [labelB, countB]) => countB - countA || labelA.localeCompare(labelB))
    .map(([singular, count]) => `${count} ${count === 1 ? singular : plurals.get(singular)}`)
    .join(", ");
};

/**
 * Tier 1: two risks are related when they hang off the same framework elements,
 * discounted by how many other risks hang off those same elements.
 *
 * A flat weight would be useless — in a single-framework org every pair shares
 * the framework — so a shared element that forty risks touch is worth 0.37 and
 * one that only these two touch is worth 1.26. Roughly three exclusive elements
 * reach the threshold on structure alone.
 *
 * Uncapped by count and unsorted, like tier 0: recompute.ts merges every
 * provider before applying the threshold, the per-risk cap, and the ordering.
 */
export const structuralGraphProvider: LinkSignalProvider = {
  name: "structural_graph",
  tier: 1,
  async score(ctx: RecomputeContext): Promise<LinkCandidate[]> {
    const neighbours = await getStructuralNeighboursQuery(ctx.organizationId, ctx.subject.id);

    const byTarget = new Map<number, { points: number; elementKeys: string[] }>();
    for (const row of neighbours) {
      // The query cannot emit a degree below 2 — the row exists because two
      // distinct risks share the element — but log2(1 + 0) is 0, and Infinity
      // would cap to a maximum-strength link. Skip rather than score a divide.
      if (!Number.isFinite(row.degree) || row.degree < 2) continue;

      const entry = byTarget.get(row.target_risk_id) ?? { points: 0, elementKeys: [] };
      entry.points += RARITY_NUMERATOR / Math.log2(1 + row.degree);
      entry.elementKeys.push(row.element_key);
      byTarget.set(row.target_risk_id, entry);
    }

    return [...byTarget.entries()].map(([targetRiskId, entry]) => {
      // score is NUMERIC and stores exactly what it is sent, so round here or
      // 3.7699999999999996 reaches the UI verbatim.
      const score =
        Math.round(Math.min(MAX_STRUCTURAL_POINTS, entry.points) * 100) / 100;
      return {
        targetRiskId,
        score,
        reasons: [
          {
            signal: "shared_framework_element",
            weight: score,
            detail: describeElements(entry.elementKeys),
          },
        ],
      };
    });
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- services/riskLinks/tests/structuralGraph.spec.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/riskLinks/providers/structuralGraph.ts Servers/services/riskLinks/tests/structuralGraph.spec.ts
git commit -m "feat(risk-links): score shared framework elements by rarity (tier 1)"
```

---

## Task 3: Register tier 1, make provider failure fatal, guard the merge

**Files:**
- Modify: `Servers/services/riskLinks/recompute.ts:19-68`
- Test: `Servers/services/riskLinks/tests/recompute.spec.ts`

**Interfaces:**
- Consumes: `structuralGraphProvider` from Task 2.
- Produces: no new export. `recomputeRiskLinks` now **rejects** when any provider throws, where it previously resolved quietly.

**Why the failure rule inverts (§5).** With one provider, "keep going if any succeeded" meant all-or-nothing. With two it means something worse: if the structural query fails on a transient error, `fieldOverlap` alone finishes the run, every pair silently loses its tier-1 points, some drop below the threshold, and `derived` + `suggested` edges are **deleted**. A hiccup destroys real suggestions. So any provider failure aborts: nothing written, nothing pruned, the risk keeps the edges it had — stale but never wrong. The job then fails, and `attempts: 3` with exponential backoff on `enqueueRiskLinkRecompute` retries it.

`[]` still means "I ran, I found nothing" and the run continues normally. Only a throw aborts.

**Why the merge needs a guard (§6).** Tier 0 reads `ctx.candidates`, which `getRiskScoringRowsQuery` scopes to the org, so it cannot emit a foreign target. Tier 1 issues its own SQL and `recompute.ts` merges by target id with nothing checking that id belongs to the org — one missing `WHERE` in a future edit becomes a written cross-tenant row. Filtering merged targets to the candidate id set is exact, not merely defensive: `candidates` is every other active risk in the org, so any legitimate tier-1 target is already in it.

- [ ] **Step 1: Write the failing tests**

Three changes to `Servers/services/riskLinks/tests/recompute.spec.ts`.

**(a)** The whole file breaks without this. It does `jest.mock("../../../utils/riskLink.utils")` and `jest.resetAllMocks()` in `beforeEach`, so the auto-mocked `getStructuralNeighboursQuery` returns `undefined`; the new provider would iterate `undefined`, throw a `TypeError`, and under the new rule abort every run. Add one line to the existing `beforeEach` (line 49):

```typescript
beforeEach(() => {
  jest.resetAllMocks();
  (sequelize.transaction as jest.Mock).mockResolvedValue({ commit, rollback });
  mockUtils.getIncidentLinksQuery.mockResolvedValue([]);
  // Registering tier 1 makes this a dependency of every test in this file: the
  // automock returns undefined, and a provider that throws now aborts the run.
  mockUtils.getStructuralNeighboursQuery.mockResolvedValue([]);
});
```

**(b)** Replace the existing test at lines 165-182 (`"writes nothing and deletes nothing when every provider throws"`) with:

```typescript
  it("aborts the run and rethrows when a provider throws", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([link({ id: 100 })]);
    const provider = require("../providers/fieldOverlap");
    const spy = jest
      .spyOn(provider.fieldOverlapProvider, "score")
      .mockRejectedValue(new Error("boom"));

    await expect(recomputeRiskLinks(1, 7)).rejects.toThrow("boom");

    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();

    // Neither clearAllMocks nor resetAllMocks undoes a spy — restore it, or the
    // next test gets a provider that still throws.
    spy.mockRestore();
  });

  // Spec §5. Partial knowledge is not knowledge: tier 0 alone would strip every
  // pair's tier-1 points and prune the suggestions that fell below the threshold.
  it("aborts even though the other provider succeeded", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([link({ id: 100 })]);
    const provider = require("../providers/structuralGraph");
    const spy = jest
      .spyOn(provider.structuralGraphProvider, "score")
      .mockRejectedValue(new Error("graph down"));

    // fieldOverlap succeeds on the shared category and would have scored 3.
    await expect(recomputeRiskLinks(1, 7)).rejects.toThrow("graph down");

    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
    expect(mockUtils.updateRiskLinkScoreQuery).not.toHaveBeenCalled();

    spy.mockRestore();
  });
```

**(c)** Append the merge-guard test inside the same `describe`:

```typescript
  // Spec §6, second layer. Tier 1 issues its own SQL; if that SQL ever loses an
  // organization filter, the merge must not turn a foreign id into an edge.
  it("ignores a tier-1 target that is not an active risk in this org", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7), risk(3)]);
    const provider = require("../providers/structuralGraph");
    const spy = jest
      .spyOn(provider.structuralGraphProvider, "score")
      .mockResolvedValue([{ targetRiskId: 999, score: 5, reasons: [] }]);

    await recomputeRiskLinks(1, 7);

    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();
    spy.mockRestore();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- services/riskLinks/tests/recompute.spec.ts
```

Expected: FAIL. `"aborts the run and rethrows when a provider throws"` fails with "Received function did not throw"; `"aborts even though the other provider succeeded"` fails the same way; `"ignores a tier-1 target…"` fails because `upsertRiskLinkQuery` *was* called with target 999.

- [ ] **Step 3: Register the provider and invert the failure rule**

In `Servers/services/riskLinks/recompute.ts`, add the import beside the existing one:

```typescript
import { fieldOverlapProvider } from "./providers/fieldOverlap";
import { structuralGraphProvider } from "./providers/structuralGraph";
```

Replace line 19-20:

```typescript
/** A2b appends the embedding provider here. */
const PROVIDERS: LinkSignalProvider[] = [fieldOverlapProvider, structuralGraphProvider];
```

Replace the docstring block at lines 22-29 with:

```typescript
/**
 * Rebuild the stored edges for one risk.
 *
 * Idempotent, and safe to run concurrently with a recompute of the other
 * endpoint: writes go through ON CONFLICT, and pruning is driven by the score,
 * which is symmetric. Three at once can still deadlock on a triangle — see the
 * retry note on `enqueueRiskLinkRecompute`.
 *
 * Rejects if any provider throws. With more than one provider, finishing on a
 * partial set would strip the missing tier's points from every pair and prune
 * the suggestions that then fell below the threshold — a transient error would
 * silently delete real data. Stale edges are better than wrong ones.
 */
```

Replace the whole merge block at lines 41-68 with:

```typescript
  // 1. Run every provider. Any one that throws aborts the run.
  const merged = new Map<number, LinkCandidate>();
  const candidateIds = new Set(candidates.map((row) => row.id));

  for (const provider of PROVIDERS) {
    try {
      const results = await provider.score({ organizationId, subject, candidates });
      for (const candidate of results) {
        // Tier 1 and up issue their own SQL. `candidates` is every other active
        // risk in this org, so a target outside it is another org's risk or a
        // soft-deleted one — never an edge we may write.
        if (!candidateIds.has(candidate.targetRiskId)) continue;

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
      throw error;
    }
  }
```

The `let anyProviderSucceeded = false;` declaration, the `anyProviderSucceeded = true;` assignment, and the `if (!anyProviderSucceeded) return;` guard with its two-line comment are all deleted. Do not leave the variable behind unused.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- services/riskLinks/tests/recompute.spec.ts
```

Expected: PASS, 14 tests (12 existing, one of which is replaced by two, plus the merge-guard test). If any *pre-existing* test now fails, the `beforeEach` stub from Step 1(a) is missing.

- [ ] **Step 5: Run the whole risk-links unit surface**

```bash
npm test -- services/riskLinks utils/__tests__/riskLink.utils.test.ts controllers/__tests__/riskLinks.ctrl.test.ts services/automations/tests/riskLinkQueue.spec.ts
```

Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/riskLinks/recompute.ts Servers/services/riskLinks/tests/recompute.spec.ts
git commit -m "feat(risk-links): register tier 1, abort on provider failure, scope merged targets"
```

---

## Task 4: Tenant-isolation tests against a real database

**Files:**
- Modify: `Servers/tests/factories/test-entities.factory.ts` (append after `createTestControlEU`, around line 199)
- Modify: `Servers/tests/factories/index.ts` (add to the `test-entities.factory` export list)
- Test: `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts`

**Interfaces:**
- Consumes: `seedTwoTenantContexts`, `createTestRisk`, `cleanupDatabase`, `recomputeRiskLinks`.
- Produces: `attachRiskToEuControl(orgId: number, riskId: number, controlId: number): Promise<void>`.

**Read this before writing the tests, or they will pass no matter what the query does.** One shared element of degree 2 scores 1.26, well under the threshold of 3, so no row is written either way and the assertion proves nothing. Both tests therefore use **three** shared controls: three elements at degree 2 score 3.79 and do cross the threshold, so "a row exists / does not exist" is a real assertion against stored data.

The collision itself is not naturally reachable. Element ids are org-scoped — `controls_eu` has an `organization_id`, and its `id` comes from one sequence shared across orgs, so control 412 belongs to exactly one org. The tests seed the collision deliberately, which is possible only because `controls_eu__risks` declares **no foreign key** on `control_id` (§6). That is also why `attachRiskToEuControl` needs no `controls_eu` row.

`cleanupDatabase()` does not name `controls_eu__risks`, but its `TRUNCATE … CASCADE` of `organizations` reaches it through `controls_eu__risks_organization_id_fkey` — verified. Do not add it to the truncate list.

- [ ] **Step 1: Write the factory helper**

Append to `Servers/tests/factories/test-entities.factory.ts`:

```typescript
/**
 * Attach a risk to an EU AI Act control instance.
 *
 * `controls_eu__risks` has no foreign key on `control_id`, so `controlId` need
 * not exist in `controls_eu`. That is exactly what lets a test seed the
 * cross-org element collision the schema otherwise makes unreachable.
 */
export async function attachRiskToEuControl(
  orgId: number,
  riskId: number,
  controlId: number,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO controls_eu__risks (organization_id, control_id, projects_risks_id)
     VALUES (:orgId, :controlId, :riskId)`,
    { replacements: { orgId, controlId, riskId } },
  );
}
```

Add `attachRiskToEuControl,` to the `test-entities.factory` export list in `Servers/tests/factories/index.ts` (after `createTestControlEU,`).

- [ ] **Step 2: Write the failing tests**

Add `attachRiskToEuControl` to the `../../factories` import at line 6, and `getStructuralNeighboursQuery` to the `../../../utils/riskLink.utils` import at line 8 of `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts`. Then append these two tests inside the existing `describe`:

```typescript
  // Three controls, not one: a single element of degree 2 scores 1.26 and never
  // reaches the threshold, so a leak would leave risk_links empty either way and
  // this test could not fail. Three at degree 2 score 3.79 and do get written.
  it("never links across orgs through the same framework element id", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerRisk = await createTestRisk(owner.orgId);
    const attackerRisk = await createTestRisk(attacker.orgId);

    for (const controlId of [90001, 90002, 90003]) {
      await attachRiskToEuControl(owner.orgId, ownerRisk, controlId);
      await attachRiskToEuControl(attacker.orgId, attackerRisk, controlId);
    }

    // Assert at the query first. recompute.ts also filters merged targets to the
    // org's candidate ids (§6), and that guard alone would keep risk_links empty
    // even if this SQL leaked — so the end-to-end assertion below cannot fail on
    // an SQL mutation by itself. This line can, and is the one that pins the
    // organization filters against a real database.
    expect(await getStructuralNeighboursQuery(owner.orgId, ownerRisk)).toEqual([]);

    await recomputeRiskLinks(owner.orgId, ownerRisk);

    const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM risk_links`);
    expect((rows as any[])[0].n).toBe(0);
    expect(await getRiskLinksForRiskQuery(owner.orgId, ownerRisk, ["suggested"])).toHaveLength(0);
  });

  it("scores on this org's own element degrees, ignoring another org's volume", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId);
    const partner = await createTestRisk(owner.orgId);
    const softDeleted = await createTestRisk(owner.orgId);
    const controls = [90010, 90011, 90012];

    for (const controlId of controls) {
      await attachRiskToEuControl(owner.orgId, subject, controlId);
      await attachRiskToEuControl(owner.orgId, partner, controlId);
      await attachRiskToEuControl(owner.orgId, softDeleted, controlId);
    }
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: softDeleted },
    });

    // An orphan join row. `controls_eu__risks` has no FK on projects_risks_id
    // (its only FK is organization_id), so 999999 is insertable and names no risk
    // at all. It passes the arm's organization filter and is removed only by the
    // join to `risks` — dropping `is_deleted = false` does not remove it. This is
    // what makes Step 3's mutations 1 and 2 produce two different failures instead
    // of the same one twice.
    for (const controlId of controls) {
      await attachRiskToEuControl(owner.orgId, 999999, controlId);
    }

    for (let i = 0; i < 5; i++) {
      const noisy = await createTestRisk(attacker.orgId);
      for (const controlId of controls) {
        await attachRiskToEuControl(attacker.orgId, noisy, controlId);
      }
    }

    await recomputeRiskLinks(owner.orgId, subject);

    // Three elements at the owner org's own live degree of 2: 3 x 1.26 = 3.79.
    // Each mutation in Step 3 fails this differently, which is why all three are
    // worth running. Computing degrees FROM element_links counts the soft-deleted
    // risk AND the orphan row: degree 4, score 2.58, under the threshold, no row
    // at all. Dropping is_deleted = false counts only the soft-deleted risk:
    // degree 3, a row stored at 3.00. Losing both org filters lets the second
    // org's five risks in: degree 8, score 1.89, again no row.
    const [rows] = await sequelize.query(
      `SELECT source_risk_id, target_risk_id, score::float8 AS score FROM risk_links`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_risk_id: Math.min(subject, partner),
      target_risk_id: Math.max(subject, partner),
      score: 3.79,
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test -- --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testMatch="**/tests/integration/tenant-isolation/riskLinks.isolation.test.ts" --runInBand
```

With Tasks 1-3 already committed, both tests should pass on the first run — **if either fails, the query is wrong, not the test.** A test that has never been red proves nothing, so verify each can fail, one mutation at a time, restoring the file after every one:

1. In `getStructuralNeighboursQuery`, change `FROM active` inside the `degrees` CTE to `FROM element_links`. Re-run. Expected: the **degree-scoping** test goes red on the row count — degree 4 scores 2.58, below the threshold, so `rows` is empty rather than length 1. The cross-tenant test stays green. Restore.
2. Delete `AND r.is_deleted = false` from the `risks` join. Re-run. Expected: the degree-scoping test goes red on `score` — degree 3 gives a stored 3.00 instead of 3.79. This is a **different** failure from mutation 1; if both mutations produce the same red, the orphan row from Step 2 is missing. Restore.
3. Delete **both** `WHERE organization_id = :organizationId` from the `controls_eu__risks` arm **and** `AND r.organization_id = :organizationId` from the `risks` join. Re-run. Expected: the **cross-tenant** test goes red on `getStructuralNeighboursQuery(...)` returning rows instead of `[]`. Both filters must go — each alone is sufficient, which is the point of filtering twice. Restore.

If a mutation does not produce the expected red, stop and report it rather than proceeding: the test is not measuring what it claims.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testMatch="**/tests/integration/tenant-isolation/riskLinks.isolation.test.ts" --runInBand
```

Expected: PASS, 6 tests (4 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add Servers/tests/factories/test-entities.factory.ts Servers/tests/factories/index.ts Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts
git commit -m "test(risk-links): prove tier 1 cannot leak or borrow another org's degrees"
```

---

## Task 5: Documentation and final verification

**Files:**
- Modify: `docs/technical/domains/risk-management.md`

- [ ] **Step 1: Document tier 1 and the failure rule**

In the risk-links section of `docs/technical/domains/risk-management.md`, next to the existing tier-0 scoring description, add:

```markdown
### Tier 1 — shared framework elements

Two risks attached to the same framework element score
`min(4, Σ 2 / log2(1 + degree))`, where `degree` is how many active risks in the
organization are attached to that element. A control only these two risks touch
is worth 1.26; one that forty risks touch is worth 0.37. Roughly three exclusive
shared elements reach the suggestion threshold of 3 on structure alone.

The rarity weight is the point. In a single-framework organization every risk
shares the framework, so a flat weight would push every pair over the threshold
and leave the per-risk cap as the real filter. The cap of 4 sits below tier 0's
maximum of 10, so strong field overlap still outranks pure structure.

Ten join tables contribute elements: ISO 42001 subclauses and annex categories,
ISO 27001 subclauses and annex controls, EU AI Act controls, subcontrols and
assessment answers, NIST AI RMF subcategories, and custom framework level-2 and
level-3 items. Projects are excluded — tier 0 already scores `shared_project` —
and so is `frameworks_risks`, which rarity would flatten to noise anyway.

The user sees one signal per pair, not one per element:
`{ "signal": "shared_framework_element", "weight": 3.1,
   "detail": "2 EU AI Act controls, 1 ISO 42001 subclause" }`.

### A provider that fails aborts the recompute

Any provider throwing rejects the whole run: nothing is written and nothing is
pruned, so the risk keeps the edges it had. Finishing on a partial set would
strip the missing tier's points from every pair and delete the `derived` +
`suggested` edges that then fell below the threshold — a transient database
error would silently destroy real suggestions. A provider returning an empty
array still means "ran, found nothing" and the run continues. The failed job
retries three times with exponential backoff.
```

- [ ] **Step 2: Full verification**

Run each of these from `Servers/` and record the actual output — do not report a step you did not run.

```bash
npm run build
```
Expected: exit 0, no TypeScript errors.

```bash
npm test
```
Expected: no new failures against the pre-change baseline. Note the totals.

```bash
npm test -- --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testMatch="**/tests/integration/**/*.test.ts" --runInBand
```
Expected: all integration suites pass.

```bash
npm run check:api-drift
```
Expected: `705/705`. A2a adds no endpoint; any other number means something touched the route layer.

- [ ] **Step 3: Confirm nothing outside the plan changed**

```bash
git status --porcelain
git diff --stat develop...HEAD -- Clients/ Servers/routes/ Servers/swagger.yaml
```
Expected: `git status` clean, and the diff against `Clients/`, `Servers/routes/`, and `swagger.yaml` empty.

- [ ] **Step 4: Commit**

```bash
git add docs/technical/domains/risk-management.md
git commit -m "docs(risk-links): document the tier-1 provider and the fatal-failure rule"
```

---

## Definition of done

- `npm run build` exits 0.
- `npm test` shows no new failures against the baseline.
- The integration suite passes, including the two new isolation tests.
- `npm run check:api-drift` reports 705/705.
- No change under `Clients/`, `Servers/routes/`, or `swagger.yaml`; no migration.
- Five commits, local only. Nothing pushed, no PR, no merge.
