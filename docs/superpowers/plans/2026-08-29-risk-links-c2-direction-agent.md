# C2: Risk Link Direction Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admin a one-click pass that asks an LLM to turn clusters of `related_to` risks into parent/child `inherits_from` suggestions, written as `source = 'agent'` rows the user then confirms or dismisses through the C1 flow that already exists.

**Architecture:** The recompute engine can tell that two risks are related but never which one is the parent, so direction has to come from outside it. An admin hits `POST /riskLinks/suggest-hierarchy`; the controller partitions the org's `related_to` graph into connected components and enqueues one BullMQ job per component. Each job hands its component to the org's configured LLM through the house `generateObjectWithSelfCorrection` wrapper, runs the returned groups through a pure filter that enforces the C1 two-level rule, and writes the survivors as `suggested`/`agent` rows. Nothing new is invented at the storage layer: `source = 'agent'` is already in the type union, the column is an unconstrained `VARCHAR(20)`, and the C1 partial unique index already guards what may be confirmed.

**Tech Stack:** Node 22, TypeScript, Express 4, Sequelize 6 raw SQL, PostgreSQL, BullMQ + Redis, Vercel AI SDK (`@ai-sdk/anthropic`, `@ai-sdk/openai`), Zod, Jest (backend), React 19 + React Query + MUI 7 (frontend), Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-08-29-risk-links-c2-direction-agent-design.md` (commit `9c54568b2`)

## Global Constraints

- **The C1 rule is the law this feature serves:** a risk is either a parent, or a child, or unattached — never both; a child has exactly one parent. Nothing C2 writes may be unconfirmable at the moment it is written.
- **Direction convention:** `source_risk_id` = **child**, `target_risk_id` = **parent**. The `risk_links_canonical` CHECK exempts `inherits_from` from smaller-id-first ordering, so never reorder an `inherits_from` pair.
- **No migration.** `source = 'agent'` is already in `RiskLinkSource` (`Servers/services/riskLinks/types.ts`, `Clients/src/domain/interfaces/i.riskLink.ts`) and the `source` column is `VARCHAR(20) NOT NULL` with no CHECK.
- **Every new query is org-scoped.** `organization_id = :organizationId` on every table it touches, and `is_deleted = false` on every join to `risks`.
- **The LLM call itself is never unit-tested.** House rule, stated in `Servers/advisor/evidenceAnalyzer/__tests__/calibration.test.ts`: test everything around the call, never the call. This is why the validation filter is a separate pure function.
- **API keys never enter a job payload.** The worker receives `{ organizationId, riskIds }` and the service fetches the key itself.
- **`MAX_COMPONENT_SIZE = 25`.** Larger components are skipped and counted, never truncated.
- **LLM output bounds:** at most 6 groups per component, 1–12 children per group, `reason` 15–120 characters, `.strict()` on both schemas, `temperature: 0`.
- **`reasons` payload for an agent row:** exactly one signal, `{ signal: "hierarchy", weight: 0, detail: <the group's reason string> }`. `score` stays at its column default of 0.
- **Route changes require regenerated API docs.** After touching `riskLinks.route.ts`: `npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`, and commit the regenerated files. CI job `api-docs-drift` fails otherwise.
- **Commit format:** `type(scope): description`, e.g. `feat(risk-links): partition the related_to graph into components`.
- **No `console.log`.** Use `logger` from `utils/logger/fileLogger` in services, `logProcessing`/`logSuccess`/`logFailure` in controllers.

## Where this plan decides something the spec left open

Four places. Each is called out again at the task that lands it.

1. **`RelatedPair` lives in `services/riskLinks/types.ts`, not in `direction/components.ts`.** Both `components.ts` and `utils/riskLink.utils.ts` need it, and having a util import from a service inverts the dependency direction the rest of the file follows. `types.ts` is already imported by `riskLink.utils.ts`.

2. **The controller does not filter out components of size < 2.** Spec §5.1 lists that filter; it cannot fire. `connectedComponents` only ever emits ids that appeared in a pair, and the `risk_links` CHECK forbids `source_risk_id = target_risk_id`, so every component has at least two members. A dead branch with no test that can reach it is worse than a comment saying why it is absent. Task 8 carries that comment.

3. **Rule 3 lets the same parent appear in two groups.** Spec §7 words it as "an id in at most one group, never both parent and child." Read literally that drops `[{parent: 1, children: [2]}, {parent: 1, children: [3]}]` — one legal umbrella the model split across two objects because it had two reasons. C1 constrains a *child* to one parent; it says nothing about a parent. The plan keeps the half of the rule that matters (a child claimed once, no risk on both sides) and drops the half that would throw away a correct answer. Task 5 implements it with two sets and has a test for the split case.

4. **`createTestRisk` gains a `risk_description` option.** Spec §11 has no row for `getRiskPromptRowsQuery`, which would leave the one column no other query in `riskLink.utils.ts` reads entirely unverified. Four lines in the factory close it, and Task 3 asserts the column comes back.

---

## File Structure

**New — `Servers/services/riskLinks/direction/`**

| File | Responsibility |
|---|---|
| `components.ts` | Pure. Union-find over `related_to` pairs → sorted components. Owns `MAX_COMPONENT_SIZE`. No imports beyond the `RelatedPair` type. |
| `schema.ts` | The Zod contract for the LLM's answer, plus the inferred `HierarchyGroup` type. |
| `prompts.ts` | Pure prompt builders. Takes rows and edges, returns strings. |
| `direction.service.ts` | The orchestration: fetch key → build model → prompt → self-correcting call → `filterProposedGroups` → write. Also **exports the pure `filterProposedGroups`**, per spec §10. |

**Modified — backend**

| File | Change |
|---|---|
| `Servers/services/riskLinks/types.ts` | Add the `RelatedPair` interface. |
| `Servers/utils/riskLink.utils.ts` | Add four queries: `getRelatedPairsQuery`, `getRiskPromptRowsQuery`, `getHierarchyPairsQuery`, `createAgentHierarchyLinkQuery`. |
| `Servers/services/automations/automationProducer.ts` | Add `enqueueRiskLinkDirection`. |
| `Servers/services/automations/automationWorker.ts` | Add the `risk_link_direction` branch to the else-if chain. |
| `Servers/controllers/riskLinks.ctrl.ts` | Add `suggestRiskHierarchy`. |
| `Servers/routes/riskLinks.route.ts` | Add `POST /suggest-hierarchy`, Admin only. |
| `Servers/tests/factories/test-entities.factory.ts` | Add `risk_description` to `CreateTestRiskOptions`. |
| `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` | Regenerated, never hand-edited. |

**Modified — frontend**

| File | Change |
|---|---|
| `Clients/src/application/repository/riskLink.repository.ts` | Add `suggestRiskHierarchy()`. |
| `Clients/src/application/hooks/useRiskLinks.ts` | Add `useSuggestRiskHierarchy(riskId)`. |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | Admin "Suggest hierarchy" button in the header row; stop rendering `score` on agent rows. |
| `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx` | Extend the `useRiskLinks` module mock — it is a whole-module factory and will break otherwise. |

**New tests**

| File | Covers |
|---|---|
| `Servers/services/riskLinks/tests/components.spec.ts` | Union-find, ordering, duplicate and bridging pairs. |
| `Servers/services/riskLinks/tests/directionSchema.spec.ts` | `.strict()`, the bounds, empty-groups acceptance, prompt payload completeness. |
| `Servers/services/riskLinks/tests/directionFilter.spec.ts` | All five filter rules. |
| `Servers/services/automations/tests/riskLinkDirectionQueue.spec.ts` | Job name, payload, jobId, retry options. |
| `Servers/controllers/__tests__/riskLinks.suggestHierarchy.test.ts` | 400 with no key, the size cap, the 202 body. |
| `Servers/tests/integration/riskLinks.agentLink.test.ts` | The three data queries and the agent write, against a real database. |

---

## Task 1: Connected components of the `related_to` graph

**Files:**
- Modify: `Servers/services/riskLinks/types.ts` (append the `RelatedPair` interface)
- Create: `Servers/services/riskLinks/direction/components.ts`
- Test: `Servers/services/riskLinks/tests/components.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface RelatedPair { a: number; b: number }` from `services/riskLinks/types.ts`
  - `const MAX_COMPONENT_SIZE = 25` from `services/riskLinks/direction/components.ts`
  - `function connectedComponents(pairs: RelatedPair[]): number[][]` from the same file

- [ ] **Step 1: Write the failing test**

Create `Servers/services/riskLinks/tests/components.spec.ts`:

```ts
import { connectedComponents } from "../direction/components";

describe("connectedComponents", () => {
  it("returns nothing when there are no pairs", () => {
    expect(connectedComponents([])).toEqual([]);
  });

  it("merges pairs that share a risk into one component", () => {
    expect(
      connectedComponents([
        { a: 1, b: 2 },
        { a: 2, b: 3 },
      ]),
    ).toEqual([[1, 2, 3]]);
  });

  it("keeps disjoint pairs in separate components", () => {
    expect(
      connectedComponents([
        { a: 5, b: 6 },
        { a: 1, b: 2 },
      ]),
    ).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });

  // The bridging pair arrives after both chains already exist, which is the
  // case a naive one-pass grouping gets wrong.
  it("merges two existing chains when a later pair bridges them", () => {
    expect(
      connectedComponents([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
        { a: 2, b: 3 },
      ]),
    ).toEqual([[1, 2, 3, 4]]);
  });

  it("is unaffected by the same pair arriving twice in either order", () => {
    expect(
      connectedComponents([
        { a: 1, b: 2 },
        { a: 2, b: 1 },
      ]),
    ).toEqual([[1, 2]]);
  });

  // The queue derives a jobId from a component's smallest id, so an unstable
  // order would let one component enqueue twice under two different ids.
  it("sorts ids inside a component and components by their smallest id", () => {
    expect(
      connectedComponents([
        { a: 9, b: 7 },
        { a: 3, b: 1 },
      ]),
    ).toEqual([
      [1, 3],
      [7, 9],
    ]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Servers && npx jest services/riskLinks/tests/components.spec.ts
```

Expected: FAIL — `Cannot find module '../direction/components'`.

- [ ] **Step 3: Add the `RelatedPair` type**

Append to `Servers/services/riskLinks/types.ts`:

```ts
/**
 * One undirected `related_to` edge. Lives here rather than beside
 * `connectedComponents` because `utils/riskLink.utils.ts` produces it and the
 * service consumes it, and a util importing from a service inverts the
 * dependency direction the rest of that file keeps.
 */
export interface RelatedPair {
  a: number;
  b: number;
}
```

- [ ] **Step 4: Write the implementation**

Create `Servers/services/riskLinks/direction/components.ts`:

```ts
import { RelatedPair } from "../types";

/**
 * The largest component one LLM call will accept. Above this the prompt stops
 * fitting a sensible context budget and grouping quality falls off faster than
 * the component's value rises. Oversized components are skipped and counted,
 * never truncated — a partial component would be a grouping decision made by
 * an arbitrary cut rather than by the model.
 */
export const MAX_COMPONENT_SIZE = 25;

/**
 * Partitions the `related_to` edge list into connected components by
 * union-find. A component is the unit of work for a direction pass: see §3 of
 * the C2 design for why the component, and not the risk or the pair, is what
 * one call must own.
 *
 * Ids inside a component and the components themselves both come back sorted
 * ascending. That ordering is load-bearing, not cosmetic — the queue's jobId is
 * derived from a component's smallest id, so an unstable order would let one
 * component enqueue twice under two different ids.
 *
 * A risk with no `related_to` edge never appears in `pairs` and so is absent
 * from the result, correctly: a lone risk has nothing to group.
 */
export function connectedComponents(pairs: RelatedPair[]): number[][] {
  const parent = new Map<number, number>();

  const add = (x: number) => {
    if (!parent.has(x)) parent.set(x, x);
  };

  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression: re-point everything walked at the root.
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  for (const { a, b } of pairs) {
    add(a);
    add(b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const bucket = groups.get(root);
    if (bucket) bucket.push(id);
    else groups.set(root, [id]);
  }

  return [...groups.values()]
    .map((ids) => ids.sort((x, y) => x - y))
    .sort((left, right) => left[0] - right[0]);
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd Servers && npx jest services/riskLinks/tests/components.spec.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/riskLinks/types.ts Servers/services/riskLinks/direction/components.ts Servers/services/riskLinks/tests/components.spec.ts && git commit -m "feat(risk-links): partition the related_to graph into components"
```

---

## Task 2: `getRelatedPairsQuery` and its tenant-isolation case

The spec calls this query the only place tenant leakage is possible, so the query and the test that pins its scoping ship together — approving one without the other approves the risk.

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` (append)
- Test: `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts` (add one case)

**Interfaces:**
- Consumes: `RelatedPair` from `services/riskLinks/types.ts` (Task 1).
- Produces: `async function getRelatedPairsQuery(organizationId: number): Promise<RelatedPair[]>` from `utils/riskLink.utils.ts`.

- [ ] **Step 1: Write the failing test**

In `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts`, add `getRelatedPairsQuery` to the existing import block from `"../../../utils/riskLink.utils"`, then add this case at the end of the `describe("risk_links tenant isolation")` block:

```ts
  it("reads related_to pairs only from the caller's own org, and only live ones", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const riskB = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const riskC = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const deleted = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const attackerA = await createTestRisk(attacker.orgId, { risk_category: CATEGORY });
    const attackerB = await createTestRisk(attacker.orgId, { risk_category: CATEGORY });

    const insert = async (
      orgId: number,
      source: number,
      target: number,
      status: string,
    ) => {
      await sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                                 relation_type, status, source, created_at)
         VALUES (:orgId, :source, :target, 'related_to', :status, 'derived', NOW())`,
        { replacements: { orgId, source, target, status } },
      );
    };

    await insert(owner.orgId, Math.min(riskA, riskB), Math.max(riskA, riskB), "suggested");
    await insert(owner.orgId, Math.min(riskB, riskC), Math.max(riskB, riskC), "confirmed");
    // Dismissed says these two are NOT related; letting it through would pull
    // two clusters into one and hand the model a group the user rejected.
    await insert(owner.orgId, Math.min(riskA, riskC), Math.max(riskA, riskC), "dismissed");
    // A live edge whose partner is gone. The pair would otherwise reach the
    // prompt as an id with no risk row behind it.
    await insert(owner.orgId, Math.min(riskA, deleted), Math.max(riskA, deleted), "suggested");
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: deleted },
    });
    await insert(
      attacker.orgId,
      Math.min(attackerA, attackerB),
      Math.max(attackerA, attackerB),
      "confirmed",
    );

    const pairs = await getRelatedPairsQuery(owner.orgId);

    expect(pairs).toHaveLength(2);
    const flat = pairs.flatMap((pair) => [pair.a, pair.b]);
    expect(flat).not.toContain(attackerA);
    expect(flat).not.toContain(attackerB);
    expect(flat).not.toContain(deleted);
    expect(new Set(flat)).toEqual(new Set([riskA, riskB, riskC]));
  });
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Servers && npm run test:integration -- riskLinks.isolation -t "reads related_to pairs"
```

Expected: FAIL — `getRelatedPairsQuery is not a function` (or a TS resolution error on the import).

> `npm run test:integration` is the only way to reach these files: the plain `npm run test` script excludes `tests/integration/`. Everything after `--` is a path filter and Jest flags.

- [ ] **Step 3: Write the implementation**

Add `RelatedPair` to the existing import from `"../services/riskLinks/types"` in `Servers/utils/riskLink.utils.ts`, then append:

```ts
/**
 * Every `related_to` pair in the org that still has two live risks behind it —
 * the edge list `connectedComponents` partitions.
 *
 * `dismissed` is excluded deliberately. A dismissed relation is a statement
 * that these two risks are not related; letting it through would merge two
 * clusters the user has already told us to keep apart, and then hand the merged
 * cluster to the model as one grouping problem.
 *
 * The joins to `risks` are what keep a soft-deleted partner out. Without them a
 * dead id reaches the prompt with no risk row behind it: harmless in the sense
 * that the model cannot name what it cannot see, but it inflates the size check
 * and can spend a whole call on a component with one real member.
 */
export async function getRelatedPairsQuery(
  organizationId: number,
): Promise<RelatedPair[]> {
  const rows = await sequelize.query(
    `SELECT l.source_risk_id, l.target_risk_id
       FROM risk_links l
       JOIN risks s ON s.id = l.source_risk_id
                   AND s.organization_id = :organizationId
                   AND s.is_deleted = false
       JOIN risks t ON t.id = l.target_risk_id
                   AND t.organization_id = :organizationId
                   AND t.is_deleted = false
      WHERE l.organization_id = :organizationId
        AND l.relation_type = 'related_to'
        AND l.status IN ('suggested', 'confirmed')`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as { source_risk_id: number; target_risk_id: number }[]).map((row) => ({
    a: toNumber(row.source_risk_id),
    b: toNumber(row.target_risk_id),
  }));
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd Servers && npm run test:integration -- riskLinks.isolation
```

Expected: PASS — the new case plus every case already in the file.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts && git commit -m "feat(risk-links): read the org's live related_to pairs"
```

---

## Task 3: The three remaining queries, against a real database

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` (append)
- Modify: `Servers/tests/factories/test-entities.factory.ts:57-95`
- Test: `Servers/tests/integration/riskLinks.agentLink.test.ts` (create)

**Interfaces:**
- Consumes: `RiskLinkStatus` from `services/riskLinks/types.ts`; `toNumber` (already local to `riskLink.utils.ts`).
- Produces, all from `utils/riskLink.utils.ts`:
  - `interface RiskPromptRow { id: number; risk_name: string | null; risk_description: string | null; risk_category: string[] | null; ai_lifecycle_phase: string | null }`
  - `async function getRiskPromptRowsQuery(organizationId: number, riskIds: number[]): Promise<RiskPromptRow[]>`
  - `interface HierarchyPairRow { childRiskId: number; parentRiskId: number; status: RiskLinkStatus }`
  - `async function getHierarchyPairsQuery(organizationId: number, riskIds: number[]): Promise<HierarchyPairRow[]>`
  - `interface CreateAgentHierarchyLinkInput { organizationId: number; childRiskId: number; parentRiskId: number; reason: string }`
  - `async function createAgentHierarchyLinkQuery(input: CreateAgentHierarchyLinkInput): Promise<number | null>`
- Also produces: `risk_description?: string` on `CreateTestRiskOptions`.

- [ ] **Step 1: Write the failing test**

Create `Servers/tests/integration/riskLinks.agentLink.test.ts`:

```ts
jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk } from "../factories";
import {
  createAgentHierarchyLinkQuery,
  getHierarchyPairsQuery,
  getRiskPromptRowsQuery,
} from "../../utils/riskLink.utils";

afterEach(async () => {
  await cleanupDatabase();
});

describe("getRiskPromptRowsQuery", () => {
  it("returns the four prompt columns for this org's live risks only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId, {
      risk_name: "Model drift",
      risk_description: "The production model degrades against the training set.",
      risk_category: ["Strategic risk"],
      ai_lifecycle_phase: "Deployment & integration",
    });
    const deleted = await createTestRisk(owner.orgId, { risk_name: "Gone" });
    const theirs = await createTestRisk(attacker.orgId, { risk_name: "Not yours" });
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: deleted },
    });

    const rows = await getRiskPromptRowsQuery(owner.orgId, [subject, deleted, theirs]);

    expect(rows).toEqual([
      {
        id: subject,
        risk_name: "Model drift",
        risk_description: "The production model degrades against the training set.",
        risk_category: ["Strategic risk"],
        ai_lifecycle_phase: "Deployment & integration",
      },
    ]);
  });

  it("returns nothing for an empty id list without touching the database", async () => {
    const { owner } = await seedTwoTenantContexts();
    expect(await getRiskPromptRowsQuery(owner.orgId, [])).toEqual([]);
  });
});

describe("getHierarchyPairsQuery", () => {
  it("returns every status, in child/parent terms, for edges touching the ids", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId);
    const parent = await createTestRisk(owner.orgId);
    const outsider = await createTestRisk(owner.orgId);
    const untouched = await createTestRisk(owner.orgId);
    const theirChild = await createTestRisk(attacker.orgId);
    const theirParent = await createTestRisk(attacker.orgId);

    const insert = async (orgId: number, c: number, p: number, status: string) => {
      await sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                                 relation_type, status, source, created_at)
         VALUES (:orgId, :c, :p, 'inherits_from', :status, 'agent', NOW())`,
        { replacements: { orgId, c, p, status } },
      );
    };

    await insert(owner.orgId, child, parent, "suggested");
    await insert(owner.orgId, outsider, parent, "dismissed");
    await insert(owner.orgId, untouched, child, "confirmed");
    await insert(attacker.orgId, theirChild, theirParent, "confirmed");

    const pairs = await getHierarchyPairsQuery(owner.orgId, [child, parent]);

    // The `untouched -> child` edge is in because it touches `child`, and it
    // must be: it is exactly what makes `child` ineligible as someone's child.
    expect(pairs).toHaveLength(3);
    expect(pairs).toContainEqual({ childRiskId: child, parentRiskId: parent, status: "suggested" });
    expect(pairs).toContainEqual({ childRiskId: outsider, parentRiskId: parent, status: "dismissed" });
    expect(pairs).toContainEqual({ childRiskId: untouched, parentRiskId: child, status: "confirmed" });
  });

  it("returns nothing for an empty id list", async () => {
    const { owner } = await seedTwoTenantContexts();
    expect(await getHierarchyPairsQuery(owner.orgId, [])).toEqual([]);
  });
});

describe("createAgentHierarchyLinkQuery", () => {
  it("stores a suggested/agent row with the model's reason, and refuses it twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId);
    const parent = await createTestRisk(owner.orgId);
    const input = {
      organizationId: owner.orgId,
      childRiskId: child,
      parentRiskId: parent,
      reason: "Both describe drift in the same deployed model.",
    };

    const id = await createAgentHierarchyLinkQuery(input);
    expect(id).not.toBeNull();
    expect(await createAgentHierarchyLinkQuery(input)).toBeNull();

    const [rows] = await sequelize.query(
      `SELECT source_risk_id, target_risk_id, relation_type, status, source,
              score::float8 AS score, reasons, decided_at
         FROM risk_links WHERE id = :id`,
      { replacements: { id } },
    );
    expect(rows[0]).toMatchObject({
      // source = child, target = parent. The canonical CHECK exempts
      // inherits_from, so the row must survive in exactly this order.
      source_risk_id: child,
      target_risk_id: parent,
      relation_type: "inherits_from",
      status: "suggested",
      source: "agent",
      score: 0,
    });
    expect((rows[0] as any).decided_at).toBeNull();
    expect((rows[0] as any).reasons).toEqual([
      { signal: "hierarchy", weight: 0, detail: "Both describe drift in the same deployed model." },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Servers && npm run test:integration -- riskLinks.agentLink
```

Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Add `risk_description` to the risk factory**

In `Servers/tests/factories/test-entities.factory.ts`, add the field to the options interface:

```ts
export interface CreateTestRiskOptions {
  risk_name?: string;
  risk_description?: string;
  risk_owner?: number;
  /** Scoring signals. Omitted columns stay NULL, which never matches. */
  risk_category?: string[];
  controls_mapping?: string;
  assessment_mapping?: string;
  ai_lifecycle_phase?: string;
}
```

Then add the column to the INSERT — three edits inside `createTestRisk`:

```ts
    `INSERT INTO risks (organization_id, risk_name, risk_description, risk_owner, risk_category,
                        controls_mapping, assessment_mapping, ai_lifecycle_phase,
                        created_at, updated_at)
     VALUES (:orgId, :name, :description, :riskOwner,
             CAST(:riskCategory AS enum_projectrisks_risk_category[]),
             :controlsMapping, :assessmentMapping,
             CAST(:aiLifecyclePhase AS enum_projectrisks_ai_lifecycle_phase),
             NOW(), NOW())
     RETURNING id`,
```

and in the `replacements` object, immediately after `name`:

```ts
        description: options.risk_description ?? null,
```

- [ ] **Step 4: Write the three queries**

Append to `Servers/utils/riskLink.utils.ts` (add `RiskLinkStatus` to the existing import from `"../services/riskLinks/types"` if it is not already there):

```ts
/** The four columns the direction prompt shows the model about one risk. */
export interface RiskPromptRow {
  id: number;
  risk_name: string | null;
  risk_description: string | null;
  risk_category: string[] | null;
  ai_lifecycle_phase: string | null;
}

/**
 * The prompt payload for one component.
 *
 * `risk_description` is the column that actually carries the signal a grouping
 * decision needs — the name alone rarely says whether a risk is the umbrella or
 * one instance under it. The two enum columns are cast to text for the same
 * reason `getRiskScoringRowsQuery` casts them: the driver returns a Postgres
 * enum as an opaque value otherwise.
 */
export async function getRiskPromptRowsQuery(
  organizationId: number,
  riskIds: number[],
): Promise<RiskPromptRow[]> {
  if (riskIds.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT id,
            risk_name,
            risk_description,
            risk_category::text[] AS risk_category,
            ai_lifecycle_phase::text AS ai_lifecycle_phase
       FROM risks
      WHERE id IN (:riskIds)
        AND organization_id = :organizationId
        AND is_deleted = false
      ORDER BY id`,
    { replacements: { riskIds, organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    id: toNumber(row.id),
    risk_name: row.risk_name ?? null,
    risk_description: row.risk_description ?? null,
    risk_category: Array.isArray(row.risk_category) ? row.risk_category : null,
    ai_lifecycle_phase: row.ai_lifecycle_phase ?? null,
  }));
}

/** One stored `inherits_from` edge, in the child/parent terms the rules use. */
export interface HierarchyPairRow {
  childRiskId: number;
  parentRiskId: number;
  status: RiskLinkStatus;
}

/**
 * Every `inherits_from` row touching any of these risks, in every status.
 *
 * One round trip serving two different needs. Rule 4 of the filter needs all
 * three statuses, because a `dismissed` pair must never be proposed again;
 * rule 5 needs the `confirmed` and `suggested` subset, because those are the
 * edges a new proposal could contradict. Splitting it would be two queries for
 * one index scan.
 *
 * Note the direction mapping: `source_risk_id` is the child.
 */
export async function getHierarchyPairsQuery(
  organizationId: number,
  riskIds: number[],
): Promise<HierarchyPairRow[]> {
  if (riskIds.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT source_risk_id, target_risk_id, status
       FROM risk_links
      WHERE organization_id = :organizationId
        AND relation_type = 'inherits_from'
        AND (source_risk_id IN (:riskIds) OR target_risk_id IN (:riskIds))`,
    { replacements: { organizationId, riskIds }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    childRiskId: toNumber(row.source_risk_id),
    parentRiskId: toNumber(row.target_risk_id),
    status: row.status as RiskLinkStatus,
  }));
}

export interface CreateAgentHierarchyLinkInput {
  organizationId: number;
  childRiskId: number;
  parentRiskId: number;
  /** The model's own one-line justification, 15-120 chars by schema. */
  reason: string;
}

/**
 * Writes one agent proposal as a `suggested` / `agent` row.
 *
 * A fourth query rather than a flag on `upsertRiskLinkQuery` or
 * `createUserRiskLinkQuery`: the first hardcodes `related_to`/`derived` and
 * exists to be re-run by the scoring engine, the second hardcodes
 * `confirmed`/`user` and stamps `decided_at`. An agent row is neither — it is
 * an undecided proposal, so `decided_at` stays NULL and `score` stays at its
 * column default of 0. §9 of the design stops the frontend showing that 0.
 *
 * The reason travels in the existing `reasons` column as a single signal with
 * `weight: 0`, which is what the panel's `reasonLabel` already knows how to
 * render.
 *
 * `ON CONFLICT DO NOTHING` returns null on a pair that already has a row of
 * this relation type. That should not happen — rule 4 of the filter drops those
 * before they get here — but two components can only be processed concurrently,
 * so the constraint stays the last word.
 */
export async function createAgentHierarchyLinkQuery(
  input: CreateAgentHierarchyLinkInput,
): Promise<number | null> {
  const reasons: LinkSignal[] = [
    { signal: "hierarchy", weight: 0, detail: input.reason },
  ];
  const rows = await sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                             relation_type, status, source, reasons, created_at)
     VALUES (:organizationId, :childRiskId, :parentRiskId,
             'inherits_from', 'suggested', 'agent', CAST(:reasons AS JSONB), NOW())
     ON CONFLICT (source_risk_id, target_risk_id, relation_type) DO NOTHING
     RETURNING id`,
    {
      replacements: {
        organizationId: input.organizationId,
        childRiskId: input.childRiskId,
        parentRiskId: input.parentRiskId,
        reasons: JSON.stringify(reasons),
      },
      type: QueryTypes.SELECT,
    },
  );

  const row = (rows as { id: number }[])[0];
  return row ? toNumber(row.id) : null;
}
```

> `LinkSignal` is already imported into this file from `"../services/riskLinks/types"`. If the import list does not include it, add it.

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd Servers && npm run test:integration -- riskLinks.agentLink
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Confirm the factory change broke nothing**

```bash
cd Servers && npm run test:integration -- "riskLinks.(hierarchy|isolation)"
```

Expected: PASS. `risk_description` is optional and defaults to NULL, so every existing caller is unaffected.

- [ ] **Step 7: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/tests/factories/test-entities.factory.ts Servers/tests/integration/riskLinks.agentLink.test.ts && git commit -m "feat(risk-links): add the direction pass's prompt, hierarchy, and write queries"
```

---

## Task 4: The LLM contract — schema and prompts

**Files:**
- Create: `Servers/services/riskLinks/direction/schema.ts`
- Create: `Servers/services/riskLinks/direction/prompts.ts`
- Test: `Servers/services/riskLinks/tests/directionSchema.spec.ts`

**Interfaces:**
- Consumes: `RiskPromptRow` from `utils/riskLink.utils.ts` (Task 3); `HierarchyEdge` from `services/riskLinks/hierarchy.ts`.
- Produces:
  - from `direction/schema.ts`: `hierarchyGroupSchema`, `hierarchyOutputSchema`, `type HierarchyGroup = z.infer<typeof hierarchyGroupSchema>` (`{ parent_risk_id: number; child_risk_ids: number[]; reason: string }`)
  - from `direction/prompts.ts`: `function buildDirectionSystemPrompt(): string`, `function buildDirectionUserPrompt(risks: RiskPromptRow[], confirmedEdges: HierarchyEdge[]): string`

- [ ] **Step 1: Write the failing test**

Create `Servers/services/riskLinks/tests/directionSchema.spec.ts`:

```ts
import { hierarchyOutputSchema } from "../direction/schema";
import { buildDirectionSystemPrompt, buildDirectionUserPrompt } from "../direction/prompts";
import { RiskPromptRow } from "../../../utils/riskLink.utils";

const group = (overrides: Record<string, unknown> = {}) => ({
  parent_risk_id: 1,
  child_risk_ids: [2, 3],
  reason: "Both are instances of the same drift problem.",
  ...overrides,
});

describe("hierarchyOutputSchema", () => {
  it("accepts an empty groups array — a flat cluster is a valid answer", () => {
    expect(hierarchyOutputSchema.safeParse({ groups: [] }).success).toBe(true);
  });

  it("accepts a well-formed group", () => {
    expect(hierarchyOutputSchema.safeParse({ groups: [group()] }).success).toBe(true);
  });

  // Strictness is what makes the self-correction loop earn its keep: an extra
  // key is a hallucinated field, and silently dropping it hides the drift.
  it("rejects an unknown key on a group", () => {
    const result = hierarchyOutputSchema.safeParse({
      groups: [{ ...group(), confidence: 0.9 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key at the top level", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [], notes: "hello" }).success,
    ).toBe(false);
  });

  it("rejects a group with no children", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ child_risk_ids: [] })] }).success,
    ).toBe(false);
  });

  it("rejects a non-integer risk id", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ parent_risk_id: 1.5 })] }).success,
    ).toBe(false);
  });

  it("rejects a reason too short to explain anything", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ reason: "same" })] }).success,
    ).toBe(false);
  });

  it("rejects a reason too long to sit in a chip", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ reason: "x".repeat(121) })] }).success,
    ).toBe(false);
  });
});

describe("buildDirectionUserPrompt", () => {
  const risks: RiskPromptRow[] = [
    {
      id: 11,
      risk_name: "Model drift",
      risk_description: "Production accuracy falls away from the training set.",
      risk_category: ["Strategic risk"],
      ai_lifecycle_phase: "Monitoring & maintenance",
    },
    {
      id: 12,
      risk_name: "Stale features",
      risk_description: null,
      risk_category: null,
      ai_lifecycle_phase: null,
    },
  ];

  it("names every risk it was given, by id", () => {
    const prompt = buildDirectionUserPrompt(risks, []);
    expect(prompt).toContain("11");
    expect(prompt).toContain("Model drift");
    expect(prompt).toContain("Production accuracy falls away from the training set.");
    expect(prompt).toContain("12");
    expect(prompt).toContain("Stale features");
  });

  // A missing column must not become the string "null" in the model's input.
  it("leaves out the fields a risk does not have", () => {
    expect(buildDirectionUserPrompt([risks[1]], [])).not.toContain("null");
  });

  it("states the confirmed hierarchy as decisions already made", () => {
    const prompt = buildDirectionUserPrompt(risks, [{ childRiskId: 12, parentRiskId: 11 }]);
    expect(prompt).toContain("12");
    expect(prompt).toContain("11");
    expect(prompt.toLowerCase()).toContain("already");
  });

  it("says so plainly when there is no existing hierarchy", () => {
    expect(buildDirectionUserPrompt(risks, []).toLowerCase()).toContain("none");
  });
});

describe("buildDirectionSystemPrompt", () => {
  // The two-level rule is the whole product constraint. If the system prompt
  // stops carrying it, every call starts fighting the filter instead of
  // cooperating with it, and the filter silently throws the work away.
  it("states the two-level rule", () => {
    const prompt = buildDirectionSystemPrompt().toLowerCase();
    expect(prompt).toContain("exactly one parent");
    expect(prompt).toContain("cannot be both");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Servers && npx jest services/riskLinks/tests/directionSchema.spec.ts
```

Expected: FAIL — `Cannot find module '../direction/schema'`.

- [ ] **Step 3: Write `schema.ts`**

Create `Servers/services/riskLinks/direction/schema.ts`:

```ts
import { z } from "zod";

/**
 * One proposed grouping: a parent risk and the risks that sit under it.
 *
 * `.strict()` is deliberate. An extra key means the model invented a field, and
 * `generateObjectWithSelfCorrection` feeds that back as a Zod issue so the next
 * attempt drops it. Letting it through silently would hide the drift.
 */
export const hierarchyGroupSchema = z
  .object({
    parent_risk_id: z.number().int(),
    child_risk_ids: z.array(z.number().int()).min(1).max(12),
    reason: z.string().min(15).max(120),
  })
  .strict();

export type HierarchyGroup = z.infer<typeof hierarchyGroupSchema>;

/**
 * The whole answer for one component. An empty `groups` array is valid and
 * expected: a cluster of genuinely peer-level risks has no hierarchy in it, and
 * a model that must invent one will.
 *
 * The `max(6)` and `max(12)` bounds are hallucination guards, not calibrated
 * expectations. Against the 25-risk component cap they cannot both bind at
 * once; nobody should tune them thinking they encode a measured distribution.
 */
export const hierarchyOutputSchema = z
  .object({
    groups: z.array(hierarchyGroupSchema).max(6),
  })
  .strict();
```

- [ ] **Step 4: Write `prompts.ts`**

Create `Servers/services/riskLinks/direction/prompts.ts`:

```ts
import { HierarchyEdge } from "../hierarchy";
import { RiskPromptRow } from "../../../utils/riskLink.utils";

/**
 * The two-level rule, stated to the model in the same terms the filter will
 * enforce it. The filter is the guarantee; this is what stops the filter from
 * having to throw most of the answer away.
 */
export function buildDirectionSystemPrompt(): string {
  return [
    "You are an AI governance analyst organising a cluster of related risks.",
    "",
    "Some clusters contain an umbrella risk with narrower instances underneath it.",
    "Others are a set of peers with no umbrella at all. Your job is to say which,",
    "and, where there is an umbrella, which risks sit under it.",
    "",
    "Rules you must obey:",
    "- The hierarchy is exactly two levels deep. A parent has children; a child has none.",
    "- A risk has exactly one parent. Never place the same risk under two parents.",
    "- A risk cannot be both a parent and a child. It appears in at most one group,",
    "  on one side of it.",
    "- Only use the risk ids given to you. Never invent an id.",
    "- If the cluster is a set of peers, return an empty list of groups. That is a",
    "  correct answer, not a failure. Do not manufacture a hierarchy to fill it.",
    "",
    "For each group give a one-sentence reason naming what makes the parent the",
    "umbrella: 15 to 120 characters.",
  ].join("\n");
}

/**
 * The component's risks, then the hierarchy that already exists over them.
 *
 * Only `confirmed` edges appear here. Live `suggested` edges stay out on
 * purpose: they are not decisions, and rule 5 of the filter already drops
 * anything that collides with one. The prompt carries facts; the filter carries
 * policy.
 */
export function buildDirectionUserPrompt(
  risks: RiskPromptRow[],
  confirmedEdges: HierarchyEdge[],
): string {
  const described = risks.map((risk) => {
    const lines = [`- id ${risk.id}: ${risk.risk_name ?? "(unnamed)"}`];
    if (risk.risk_description) lines.push(`  description: ${risk.risk_description}`);
    if (risk.risk_category?.length) lines.push(`  category: ${risk.risk_category.join(", ")}`);
    if (risk.ai_lifecycle_phase) lines.push(`  lifecycle phase: ${risk.ai_lifecycle_phase}`);
    return lines.join("\n");
  });

  const hierarchy = confirmedEdges.length
    ? confirmedEdges
        .map((edge) => `- risk ${edge.childRiskId} is already under risk ${edge.parentRiskId}`)
        .join("\n")
    : "- none";

  return [
    "These risks are all related to each other:",
    "",
    described.join("\n"),
    "",
    "Hierarchy decisions a human has already made about them, which you must not",
    "contradict:",
    "",
    hierarchy,
  ].join("\n");
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd Servers && npx jest services/riskLinks/tests/directionSchema.spec.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/riskLinks/direction/schema.ts Servers/services/riskLinks/direction/prompts.ts Servers/services/riskLinks/tests/directionSchema.spec.ts && git commit -m "feat(risk-links): define the direction agent's schema and prompts"
```

---

## Task 5: `filterProposedGroups` — the five rules

This is where the guarantee lives: nothing the agent writes may be unconfirmable at the moment it is written. It is pure and exported precisely so it is testable without a paid network call.

**Files:**
- Create: `Servers/services/riskLinks/direction/direction.service.ts`
- Test: `Servers/services/riskLinks/tests/directionFilter.spec.ts`

**Interfaces:**
- Consumes: `HierarchyGroup` from `direction/schema.ts` (Task 4); `HierarchyEdge`, `validateTwoLevel` from `services/riskLinks/hierarchy.ts`; `canonicalPair` from `services/riskLinks/types.ts`.
- Produces from `direction/direction.service.ts`:
  ```ts
  function filterProposedGroups(
    groups: HierarchyGroup[],
    componentRiskIds: number[],
    blockingEdges: HierarchyEdge[],
    pairsWithExistingHierarchy: Set<string>,
  ): HierarchyEdge[]
  ```
  and `function hierarchyPairKey(a: number, b: number): string` — the unordered key `pairsWithExistingHierarchy` is built from. Task 6 builds that set and must use the same function.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/riskLinks/tests/directionFilter.spec.ts`:

```ts
// This file's subject is pure, but it lives in a module that will also hold the
// orchestration (Task 6), which reaches the database and the AI SDK. These three
// mocks keep importing it from opening a connection. Same trio as
// services/riskLinks/tests/recompute.spec.ts.
jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { filterProposedGroups, hierarchyPairKey } from "../direction/direction.service";
import { HierarchyGroup } from "../direction/schema";

const group = (parent: number, children: number[]): HierarchyGroup => ({
  parent_risk_id: parent,
  child_risk_ids: children,
  reason: "They are instances of the same underlying problem.",
});

const COMPONENT = [1, 2, 3, 4, 5];

describe("filterProposedGroups", () => {
  it("turns a clean group into one edge per child, child first", () => {
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, [], new Set())).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  // Two groups naming the SAME parent are one legal answer split across two
  // objects, which a model with two different reasons will produce. C1
  // constrains children to one parent; it says nothing about a parent
  // appearing twice, so dropping the second group would throw away half a
  // correct answer.
  it("keeps a second group that reuses the first group's parent", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(1, [3])], COMPONENT, [], new Set()),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("keeps two disjoint groups from the same component", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [4])], COMPONENT, [], new Set()),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 4, parentRiskId: 3 },
    ]);
  });

  it("accepts an empty answer", () => {
    expect(filterProposedGroups([], COMPONENT, [], new Set())).toEqual([]);
  });

  // Rule 1. A hallucinated id is the failure mode that would write a link
  // between two risks the model was never shown.
  it("drops a group naming an id outside the component", () => {
    expect(filterProposedGroups([group(1, [2, 99])], COMPONENT, [], new Set())).toEqual([]);
  });

  it("drops a group whose parent is outside the component", () => {
    expect(filterProposedGroups([group(99, [2])], COMPONENT, [], new Set())).toEqual([]);
  });

  // Rule 2.
  it("drops a group that makes a risk its own parent", () => {
    expect(filterProposedGroups([group(1, [1, 2])], COMPONENT, [], new Set())).toEqual([]);
  });

  // Rule 3. Both halves: the same id twice as a child, and the same id as a
  // child in one group and a parent in another.
  it("drops the second group when a risk is claimed as a child twice", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [2])], COMPONENT, [], new Set()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  it("drops the second group when a child of the first is used as its parent", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(2, [3])], COMPONENT, [], new Set()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  it("drops the second group when a parent of the first is used as its child", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [1])], COMPONENT, [], new Set()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  // Rule 4, both orderings. A dismissed A -> B blocks proposing B -> A: the
  // user rejected a hierarchy between these two risks, and offering the mirror
  // image next scan is re-asking the same question in different words.
  it("drops a pair that already has an inherits_from row", () => {
    const existing = new Set([hierarchyPairKey(2, 1)]);
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, [], existing)).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("blocks the mirror of a pair that already has a row", () => {
    const existing = new Set([hierarchyPairKey(1, 2)]);
    expect(filterProposedGroups([group(1, [2])], COMPONENT, [], existing)).toEqual([]);
  });

  // Rule 5, against confirmed edges.
  it("drops a child that already has a confirmed parent", () => {
    const blocking = [{ childRiskId: 2, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, blocking, new Set())).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("drops a group whose proposed parent is already someone's child", () => {
    const blocking = [{ childRiskId: 1, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2])], COMPONENT, blocking, new Set())).toEqual([]);
  });

  it("drops a proposed child that already has children of its own", () => {
    const blocking = [{ childRiskId: 5, parentRiskId: 2 }];
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, blocking, new Set())).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  // Rule 5 against a LIVE SUGGESTION, not a confirmed edge. This is the case
  // that closes the across-scans hole: without it a second scan can offer a
  // second parent for a child whose first suggestion is still unanswered, and
  // confirming both is impossible.
  it("drops a second candidate parent while an earlier suggestion is unanswered", () => {
    const blocking = [{ childRiskId: 2, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2])], COMPONENT, blocking, new Set())).toEqual([]);
  });

  // Rule 5's accumulator. Rule 3 already stops this shape from one model
  // answer; the accumulator is what makes the guarantee hold regardless.
  it("keeps the batch self-consistent as it accepts edges", () => {
    const kept = filterProposedGroups([group(1, [2]), group(4, [5])], COMPONENT, [], new Set());
    expect(kept).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Servers && npx jest services/riskLinks/tests/directionFilter.spec.ts
```

Expected: FAIL — `Cannot find module '../direction/direction.service'`.

- [ ] **Step 3: Write the filter**

Create `Servers/services/riskLinks/direction/direction.service.ts`:

```ts
import { HierarchyEdge, validateTwoLevel } from "../hierarchy";
import { canonicalPair } from "../types";
import { HierarchyGroup } from "./schema";

/**
 * The unordered key two risks share regardless of which is proposed as parent.
 * Rule 4 is deliberately direction-blind, so the key must be too.
 */
export function hierarchyPairKey(a: number, b: number): string {
  const [low, high] = canonicalPair(a, b);
  return `${low}:${high}`;
}

/**
 * Turns the model's proposed groups into the edges that are safe to store.
 *
 * Five rules, applied in order. The first three are about the answer's internal
 * shape; the last two are about the answer against what is already stored.
 *
 * 1. Every id must belong to this component. A hallucinated id would otherwise
 *    write a link between two risks the model was never shown.
 * 2. A parent may not be among its own children.
 * 3. A risk is claimed as a child at most once, and no risk is both a parent
 *    and a child. This is the two-level rule applied within a single answer.
 *    Note what it does NOT forbid: the same parent appearing in two groups.
 *    That is one legal answer split across two objects, and C1 constrains
 *    children to one parent, not parents to one group.
 * 4. A pair that already carries an `inherits_from` row in ANY status drops —
 *    `dismissed` included, and keyed on the unordered pair.
 * 5. Each survivor runs `validateTwoLevel` against the blocking edges plus what
 *    this call has already accepted.
 *
 * Rule 5 is the guarantee. The accumulator makes the batch self-consistent;
 * `blockingEdges` carrying confirmed edges makes it consistent with every human
 * decision; `blockingEdges` also carrying live suggestions makes it consistent
 * with what earlier scans have already put in front of the user. Nothing this
 * function returns can be unconfirmable at the moment it is written.
 *
 * Note that passing suggested edges to `validateTwoLevel` widens it past what
 * its own doc comment describes. That comment is written for the confirm
 * endpoint, where competing suggestions are legal by design. Here they are not:
 * C1 permits one confirmed parent per child, so a second live candidate is a
 * proposal guaranteed to fail on confirm. Widening at this call site is the
 * intended asymmetry, not a misuse.
 *
 * Pure and exported so it can be tested without a paid network call.
 */
export function filterProposedGroups(
  groups: HierarchyGroup[],
  componentRiskIds: number[],
  blockingEdges: HierarchyEdge[],
  pairsWithExistingHierarchy: Set<string>,
): HierarchyEdge[] {
  const inComponent = new Set(componentRiskIds);
  // Two sets, not one. A child may be claimed once; a parent may repeat as a
  // parent but must never cross over to the other set.
  const claimedAsChild = new Set<number>();
  const usedAsParent = new Set<number>();
  const accepted: HierarchyEdge[] = [];

  for (const group of groups) {
    const ids = [group.parent_risk_id, ...group.child_risk_ids];

    // 1
    if (ids.some((id) => !inComponent.has(id))) continue;
    // 2
    if (group.child_risk_ids.includes(group.parent_risk_id)) continue;
    // 3
    if (claimedAsChild.has(group.parent_risk_id)) continue;
    if (group.child_risk_ids.some((id) => claimedAsChild.has(id) || usedAsParent.has(id))) {
      continue;
    }
    // A duplicate id inside one group would break rule 3 on its second
    // occurrence; catching it here keeps the whole group atomic.
    if (new Set(ids).size !== ids.length) continue;

    const groupEdges: HierarchyEdge[] = [];
    for (const childRiskId of group.child_risk_ids) {
      // 4
      if (pairsWithExistingHierarchy.has(hierarchyPairKey(childRiskId, group.parent_risk_id))) {
        continue;
      }
      const edge = { childRiskId, parentRiskId: group.parent_risk_id };
      // 5
      if (validateTwoLevel(edge, [...blockingEdges, ...accepted, ...groupEdges])) continue;
      groupEdges.push(edge);
    }

    if (groupEdges.length === 0) continue;

    accepted.push(...groupEdges);
    for (const edge of groupEdges) {
      claimedAsChild.add(edge.childRiskId);
    }
    usedAsParent.add(group.parent_risk_id);
  }

  return accepted;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd Servers && npx jest services/riskLinks/tests/directionFilter.spec.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/riskLinks/direction/direction.service.ts Servers/services/riskLinks/tests/directionFilter.spec.ts && git commit -m "feat(risk-links): enforce the two-level rule on the agent's proposals"
```

---

## Task 6: The direction pass itself

The LLM call is not unit-tested — house rule, and the reason Task 5 exists. What this task must prove instead is that adding the database and AI SDK imports does not break the pure test that already passes.

**Files:**
- Modify: `Servers/services/riskLinks/direction/direction.service.ts` (add the orchestration above the filter)

**Interfaces:**
- Consumes: `MAX_COMPONENT_SIZE` (Task 1); `getRiskPromptRowsQuery`, `getHierarchyPairsQuery`, `createAgentHierarchyLinkQuery` (Task 3); `hierarchyOutputSchema`, `buildDirectionSystemPrompt`, `buildDirectionUserPrompt` (Task 4); `filterProposedGroups`, `hierarchyPairKey` (Task 5); `generateObjectWithSelfCorrection` from `advisor/llmSelfCorrect`; `getLLMKeysWithKeyQuery` from `utils/llmKey.utils`.
- Produces: `async function suggestDirectionForComponent(organizationId: number, riskIds: number[]): Promise<number>` — the count of rows written. Task 7's worker calls it.

- [ ] **Step 1: Add the imports and the model factory**

At the top of `Servers/services/riskLinks/direction/direction.service.ts`, above the existing imports:

```ts
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
import logger from "../../../utils/logger/fileLogger";
import {
  createAgentHierarchyLinkQuery,
  getHierarchyPairsQuery,
  getRiskPromptRowsQuery,
} from "../../../utils/riskLink.utils";
import { buildDirectionSystemPrompt, buildDirectionUserPrompt } from "./prompts";
import { hierarchyOutputSchema } from "./schema";
```

Then, after the existing imports and before `hierarchyPairKey`:

```ts
/**
 * The org's first configured LLM key, as an AI SDK model.
 *
 * `getLLMKeysWithKeyQuery` orders by `created_at DESC`, so this is the same row
 * the controller's `getLLMKeysQuery` presence check sees — the check and the
 * call agree by construction, not by coincidence.
 *
 * A third local copy of the three-line model factory that
 * `advisor/evidenceAnalyzer/analyzer.service.ts:133` and
 * `services/intakeLLM.service.ts:24` already carry. §5.3 of the design explains
 * why C2 duplicates rather than extracts: the three call sites disagree about
 * where the key comes from, and unifying them is a refactor that should not
 * ride along on a feature.
 */
async function getOrgModel(organizationId: number) {
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  const llmKey = keys[0] as any;
  if (!llmKey) return null;

  const keyName = (llmKey.name || "").toLowerCase();
  if (keyName.includes("anthropic") || keyName.includes("claude")) {
    return createAnthropic({
      apiKey: llmKey.key,
      baseURL: llmKey.url || undefined,
    })(llmKey.model || "claude-sonnet-4-20250514");
  }

  const baseURL = llmKey.url || undefined;
  const openai = createOpenAI({ apiKey: llmKey.key, baseURL });
  const modelId = llmKey.model || "gpt-4o-mini";
  // Only native OpenAI implements the Responses API. Any custom baseURL
  // (OpenRouter, vLLM, Together) must use Chat Completions.
  return baseURL ? openai.chat(modelId) : openai(modelId);
}
```

- [ ] **Step 2: Add the orchestration**

Append to the same file, below `filterProposedGroups`:

```ts
/**
 * One direction pass over one connected component.
 *
 * Returns how many rows were written. Every failure path returns 0 rather than
 * throwing: a component that cannot be grouped — no key, a model that will not
 * answer, an answer that breaks every rule — is not an error the admin needs to
 * act on, and throwing would make BullMQ retry a call that costs money and will
 * fail the same way three times.
 *
 * The API key is fetched here rather than passed in. A job payload lives in
 * Redis in plain text and is visible to anyone who can read the queue; a key
 * must never be in one.
 */
export async function suggestDirectionForComponent(
  organizationId: number,
  riskIds: number[],
): Promise<number> {
  const model = await getOrgModel(organizationId);
  if (!model) {
    logger.warn(
      `risk link direction: org ${organizationId} has no LLM key configured, skipping`,
    );
    return 0;
  }

  const risks = await getRiskPromptRowsQuery(organizationId, riskIds);
  // Risks can be soft-deleted between the controller's fan-out and this job.
  // Below two survivors there is nothing to group.
  if (risks.length < 2) return 0;
  const liveIds = risks.map((risk) => risk.id);

  const storedPairs = await getHierarchyPairsQuery(organizationId, liveIds);
  const pairsWithExistingHierarchy = new Set(
    storedPairs.map((pair) => hierarchyPairKey(pair.childRiskId, pair.parentRiskId)),
  );
  const blockingEdges = storedPairs
    .filter((pair) => pair.status === "confirmed" || pair.status === "suggested")
    .map((pair) => ({ childRiskId: pair.childRiskId, parentRiskId: pair.parentRiskId }));
  const confirmedEdges = storedPairs
    .filter((pair) => pair.status === "confirmed")
    .map((pair) => ({ childRiskId: pair.childRiskId, parentRiskId: pair.parentRiskId }));

  let groups;
  try {
    const result = await generateObjectWithSelfCorrection({
      model,
      schema: hierarchyOutputSchema,
      system: buildDirectionSystemPrompt(),
      prompt: buildDirectionUserPrompt(risks, confirmedEdges),
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
    });
    groups = result.object.groups;
  } catch (error) {
    logger.warn(
      `risk link direction: model call failed for org ${organizationId}, component [${liveIds.join(",")}]: ${(error as Error).message}`,
    );
    return 0;
  }

  const edges = filterProposedGroups(
    groups,
    liveIds,
    blockingEdges,
    pairsWithExistingHierarchy,
  );
  if (edges.length === 0) return 0;

  // Keyed on the pair, not on the child alone. A child can appear in a group
  // the filter rejected and in one it kept; keyed on the child, the rejected
  // group's text could end up on the surviving edge's chip.
  const reasonByEdge = new Map<string, string>();
  for (const group of groups) {
    for (const childRiskId of group.child_risk_ids) {
      reasonByEdge.set(hierarchyPairKey(childRiskId, group.parent_risk_id), group.reason);
    }
  }

  let written = 0;
  for (const edge of edges) {
    const id = await createAgentHierarchyLinkQuery({
      organizationId,
      childRiskId: edge.childRiskId,
      parentRiskId: edge.parentRiskId,
      reason:
        reasonByEdge.get(hierarchyPairKey(edge.childRiskId, edge.parentRiskId)) ??
        "Grouped by the direction agent.",
    });
    if (id !== null) written += 1;
  }

  logger.info(
    `risk link direction: org ${organizationId} wrote ${written} of ${edges.length} proposed edges over ${liveIds.length} risks`,
  );
  return written;
}
```

- [ ] **Step 3: Verify the filter test still passes with the new imports**

```bash
cd Servers && npx jest services/riskLinks/tests/directionFilter.spec.ts
```

Expected: PASS, still 17 tests. This is the step that catches the failure mode this task can actually produce: an import that reaches the database at module load and hangs or throws in Jest. If it fails on an unmocked module, add that module to the mock preamble at the top of the spec — do not remove the import from the service.

- [ ] **Step 4: Verify it compiles**

```bash
cd Servers && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/riskLinks/direction/direction.service.ts && git commit -m "feat(risk-links): run the direction pass over one component"
```

---

## Task 7: Queue the pass

**Files:**
- Modify: `Servers/services/automations/automationProducer.ts:51` (append after `enqueueRiskLinkRecompute`)
- Modify: `Servers/services/automations/automationWorker.ts:530-535` (add a branch after the `risk_link_recompute` one)
- Test: `Servers/services/automations/tests/riskLinkDirectionQueue.spec.ts` (create)

**Interfaces:**
- Consumes: `suggestDirectionForComponent` (Task 6).
- Produces: `async function enqueueRiskLinkDirection(organizationId: number, riskIds: number[])` from `services/automations/automationProducer.ts`. Task 8's controller calls it.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/automations/tests/riskLinkDirectionQueue.spec.ts`, mirroring `riskLinkQueue.spec.ts`:

```ts
const mockAdd = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    obliterate: jest.fn(),
  })),
  Worker: jest.fn(),
}));

jest.mock("../../../database/redis", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { enqueueRiskLinkDirection } from "../automationProducer";

beforeEach(() => {
  mockAdd.mockClear();
});

describe("enqueueRiskLinkDirection", () => {
  it("queues one job carrying the whole component", async () => {
    await enqueueRiskLinkDirection(7, [3, 1, 2]);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, data] = mockAdd.mock.calls[0];
    expect(name).toBe("risk_link_direction");
    expect(data).toEqual({ organizationId: 7, riskIds: [3, 1, 2] });
  });

  // The jobId is what makes a double-click cost one LLM call instead of two.
  // It is derived from the component's smallest id, which is stable because
  // connectedComponents sorts.
  it("derives a stable jobId from the org and the component's smallest id", async () => {
    await enqueueRiskLinkDirection(7, [3, 1, 2]);
    expect(mockAdd.mock.calls[0][2]).toMatchObject({
      jobId: "risk-link-direction:7:1",
    });
  });

  it("does not collide with another org's component of the same shape", async () => {
    await enqueueRiskLinkDirection(7, [1, 2]);
    await enqueueRiskLinkDirection(8, [1, 2]);
    expect(mockAdd.mock.calls[0][2].jobId).not.toBe(mockAdd.mock.calls[1][2].jobId);
  });

  it("cleans up after itself and retries with backoff", async () => {
    await enqueueRiskLinkDirection(7, [1, 2]);
    expect(mockAdd.mock.calls[0][2]).toMatchObject({
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  });

  it("refuses an empty component rather than queueing a job with no work", async () => {
    await expect(enqueueRiskLinkDirection(7, [])).rejects.toThrow();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Servers && npx jest services/automations/tests/riskLinkDirectionQueue.spec.ts
```

Expected: FAIL — `enqueueRiskLinkDirection is not a function`.

- [ ] **Step 3: Write the producer**

Append after `enqueueRiskLinkRecompute` in `Servers/services/automations/automationProducer.ts`:

```ts
/**
 * One direction pass over one connected component.
 *
 * The jobId is derived from the component's smallest id, which is stable
 * because `connectedComponents` sorts. An admin double-clicking the button, or
 * two admins clicking it at once, therefore costs one LLM call rather than two.
 *
 * `attempts: 3` matches the recompute job, but the failure it covers is
 * different: the service swallows model errors and returns 0, so a retry here
 * only ever re-runs a job that failed on Redis or on a database error, never
 * one that failed on the model's answer.
 */
export async function enqueueRiskLinkDirection(organizationId: number, riskIds: number[]) {
  if (riskIds.length === 0) {
    throw new Error("enqueueRiskLinkDirection requires at least one risk id");
  }
  return automationQueue.add(
    "risk_link_direction",
    { organizationId, riskIds },
    {
      jobId: `risk-link-direction:${organizationId}:${Math.min(...riskIds)}`,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd Servers && npx jest services/automations/tests/riskLinkDirectionQueue.spec.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the worker**

In `Servers/services/automations/automationWorker.ts`, add the import alongside the existing `recomputeRiskLinks` one:

```ts
import { suggestDirectionForComponent } from "../riskLinks/direction/direction.service";
```

and add this branch immediately after the `risk_link_recompute` branch at line 535:

```ts
        } else if (name === "risk_link_direction") {
          const { organizationId, riskIds } = job.data as {
            organizationId: number;
            riskIds: number[];
          };
          await suggestDirectionForComponent(organizationId, riskIds);
```

- [ ] **Step 6: Verify it compiles and nothing else broke**

```bash
cd Servers && npm run build && npx jest services/automations services/riskLinks
```

Expected: build clean, all automation and riskLinks unit suites pass.

> The worker now pulls the AI SDK in at boot, because `direction.service.ts`
> imports `@ai-sdk/anthropic` and `@ai-sdk/openai` at top level and the worker
> imports the service. Neither the build nor the unit suites boot the worker. If
> Redis and Postgres are already running, `cd Servers && npm run worker` and
> confirm it reaches its ready log; otherwise leave it to the final
> verification, which runs against a live stack.

- [ ] **Step 7: Commit**

```bash
git add Servers/services/automations/automationProducer.ts Servers/services/automations/automationWorker.ts Servers/services/automations/tests/riskLinkDirectionQueue.spec.ts && git commit -m "feat(risk-links): queue one direction pass per component"
```

---

## Task 8: The endpoint

**Files:**
- Modify: `Servers/controllers/riskLinks.ctrl.ts` (append after `recomputeAllRiskLinks`, which ends at line 377)
- Modify: `Servers/routes/riskLinks.route.ts`
- Modify (generated, never by hand): `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts`
- Test: `Servers/controllers/__tests__/riskLinks.suggestHierarchy.test.ts` (create)

**Interfaces:**
- Consumes: `connectedComponents`, `MAX_COMPONENT_SIZE` (Task 1); `getRelatedPairsQuery` (Task 2); `enqueueRiskLinkDirection` (Task 7); `getLLMKeysQuery` from `utils/llmKey.utils`.
- Produces: `async function suggestRiskHierarchy(req: Request, res: Response): Promise<any>`, mounted at `POST /riskLinks/suggest-hierarchy`, Admin only, responding `202 { enqueued: number, skipped: number }`.

- [ ] **Step 1: Write the failing test**

Create `Servers/controllers/__tests__/riskLinks.suggestHierarchy.test.ts`:

```ts
jest.mock("../../utils/riskLink.utils");
jest.mock("../../utils/llmKey.utils");
jest.mock("../../services/automations/automationProducer");
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import { suggestRiskHierarchy } from "../riskLinks.ctrl";
import { getRelatedPairsQuery } from "../../utils/riskLink.utils";
import { getLLMKeysQuery } from "../../utils/llmKey.utils";
import { enqueueRiskLinkDirection } from "../../services/automations/automationProducer";

const mockGetRelatedPairs = getRelatedPairsQuery as jest.Mock;
const mockGetKeys = getLLMKeysQuery as jest.Mock;
const mockEnqueue = enqueueRiskLinkDirection as jest.Mock;

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const req = () => ({ userId: 1, organizationId: 42 }) as any;

beforeEach(() => {
  jest.resetAllMocks();
  mockGetKeys.mockResolvedValue([{ id: 1, name: "Anthropic" }]);
  mockEnqueue.mockResolvedValue(undefined);
});

describe("suggestRiskHierarchy", () => {
  // Without a key every job would run, log a warning, and write nothing. The
  // admin would see "grouping 4 clusters" and then silence.
  it("refuses with 400 when the org has no LLM key", async () => {
    mockGetKeys.mockResolvedValue([]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockGetRelatedPairs).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues one job per component and reports the count", async () => {
    mockGetRelatedPairs.mockResolvedValue([
      { a: 1, b: 2 },
      { a: 2, b: 3 },
      { a: 8, b: 9 },
    ]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(42, [1, 2, 3]);
    expect(mockEnqueue).toHaveBeenCalledWith(42, [8, 9]);
    expect(r.status).toHaveBeenCalledWith(202);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enqueued: 2, skipped: 0 } }),
    );
  });

  // Truncating would make the grouping decision by an arbitrary cut rather than
  // by the model, so an oversized component is skipped whole — and counted, so
  // the admin can see it happened.
  it("skips a component larger than the cap and counts it", async () => {
    const chain = Array.from({ length: 30 }, (_, i) => ({ a: i + 1, b: i + 2 }));
    mockGetRelatedPairs.mockResolvedValue([...chain, { a: 500, b: 501 }]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(42, [500, 501]);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enqueued: 1, skipped: 1 } }),
    );
  });

  it("reports zero when the org has no related risks at all", async () => {
    mockGetRelatedPairs.mockResolvedValue([]);
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(202);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enqueued: 0, skipped: 0 } }),
    );
  });

  it("answers 500 when the queue is unreachable", async () => {
    mockGetRelatedPairs.mockResolvedValue([{ a: 1, b: 2 }]);
    mockEnqueue.mockRejectedValue(new Error("redis down"));
    const r = res();

    await suggestRiskHierarchy(req(), r);

    expect(r.status).toHaveBeenCalledWith(500);
  });
});
```

> `STATUS_CODE[202](payload)` wraps the payload as `{ message, data: payload }` — that is the shape `riskLink.repository.ts:69-73` already declares for the recompute response, so the assertions above are written against the real wrapper. If the existing `riskLinks.ctrl.test.ts` mocks `statusCode.utils`, mock it the same way here and assert on the mock's argument instead of on `res.json`.

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.suggestHierarchy.test.ts
```

Expected: FAIL — `suggestRiskHierarchy is not a function`.

- [ ] **Step 3: Write the controller**

Add to the imports at the top of `Servers/controllers/riskLinks.ctrl.ts`:

```ts
import { enqueueRiskLinkDirection } from "../services/automations/automationProducer";
import { getLLMKeysQuery } from "../utils/llmKey.utils";
import {
  connectedComponents,
  MAX_COMPONENT_SIZE,
} from "../services/riskLinks/direction/components";
```

and add `getRelatedPairsQuery` to the existing import block from `"../utils/riskLink.utils"`. (`enqueueRiskLinkDirection` may be folded into the existing `automationProducer` import line instead of a second one.)

Then append after `recomputeAllRiskLinks`:

```ts
/**
 * Asks the direction agent to propose parent/child groupings across the org.
 *
 * The unit of work is a connected component of the `related_to` graph, not a
 * risk: a grouping decision needs every risk it could involve in front of it at
 * once. See §3 of the C2 design.
 *
 * There is no filter here for components of fewer than two risks, and there
 * cannot usefully be one: `connectedComponents` only emits ids that appeared in
 * a pair, and the `risk_links` CHECK forbids `source_risk_id = target_risk_id`,
 * so every component already has at least two members.
 */
export async function suggestRiskHierarchy(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting suggestRiskHierarchy",
    functionName: "suggestRiskHierarchy",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Checked here rather than left to each job. Without a key every job would
    // log a warning and write nothing, and the admin would see "grouping 4
    // clusters" followed by silence. `getLLMKeysQuery` is the redacted variant —
    // no secret needs to reach the controller to answer "is one configured".
    const keys = await getLLMKeysQuery(req.organizationId!);
    if (keys.length === 0) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            "No LLM key is configured for this organization. Add one under Settings before suggesting a hierarchy.",
          ),
        );
    }

    const components = connectedComponents(await getRelatedPairsQuery(req.organizationId!));
    const groupable = components.filter((ids) => ids.length <= MAX_COMPONENT_SIZE);
    const skipped = components.length - groupable.length;

    await Promise.all(
      groupable.map((ids) => enqueueRiskLinkDirection(req.organizationId!, ids)),
    );

    logSuccess({
      eventType: "Create",
      description: `enqueued ${groupable.length} risk link direction jobs, skipped ${skipped} oversized components`,
      functionName: "suggestRiskHierarchy",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res
      .status(202)
      .json(STATUS_CODE[202]({ enqueued: groupable.length, skipped }));
  } catch (error) {
    logFailure({
      eventType: "Create",
      description: "failed to enqueue risk link direction jobs",
      functionName: "suggestRiskHierarchy",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.suggestHierarchy.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Mount the route**

In `Servers/routes/riskLinks.route.ts`, add `suggestRiskHierarchy` to the controller import list and the route below the recompute one:

```ts
router.post(
  "/suggest-hierarchy",
  authenticateJWT,
  authorize(["Admin"]),
  suggestRiskHierarchy,
);
```

- [ ] **Step 6: Regenerate the API docs**

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

Expected: `check:api-drift` reports no drift. The CI job `api-docs-drift` fails the build if these files are not committed with the route change.

- [ ] **Step 7: Verify the whole backend**

```bash
cd Servers && npm run build && npm run test
```

Expected: build clean, unit suite green.

- [ ] **Step 8: Commit**

```bash
git add Servers/controllers/riskLinks.ctrl.ts Servers/routes/riskLinks.route.ts Servers/swagger.yaml Servers/controllers/__tests__/riskLinks.suggestHierarchy.test.ts docs/api-docs/src/config/endpoints.ts && git commit -m "feat(risk-links): add the admin endpoint that starts a direction pass"
```

---

## Task 9: The two frontend changes

**Files:**
- Modify: `Clients/src/application/repository/riskLink.repository.ts`
- Modify: `Clients/src/application/hooks/useRiskLinks.ts`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`
- Test: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`

**Interfaces:**
- Consumes: `POST /riskLinks/suggest-hierarchy` → `202 { enqueued: number, skipped: number }` (Task 8).
- Produces:
  - `async function suggestRiskHierarchy(): Promise<{ enqueued: number; skipped: number }>` from `riskLink.repository.ts`
  - `function useSuggestRiskHierarchy(riskId: number)` from `useRiskLinks.ts`

- [ ] **Step 1: Write the failing test**

In `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`, add the mock for the new hook — **the existing `vi.mock` is a whole-module factory, so the panel will throw on an undefined export if you skip this**:

```ts
const mockMutateSuggest = vi.fn();
```

and inside the existing `vi.mock("../../../../application/hooks/useRiskLinks", ...)` factory object:

```ts
  useSuggestRiskHierarchy: () => ({ mutate: mockMutateSuggest, isPending: false }),
```

Then add these cases:

```ts
  it("offers an admin the hierarchy pass even when links already exist", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseRiskLinks.mockReturnValue({
      data: [link()],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();

    // Not in the empty state: hierarchy needs existing related_to links, so a
    // button that only appears when there are none would be unreachable exactly
    // when it is useful.
    await userEvent.click(screen.getByRole("button", { name: /suggest hierarchy/i }));
    expect(mockMutateSuggest).toHaveBeenCalled();
  });

  it("hides the hierarchy pass from a non-admin", () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue({
      data: [link()],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();

    expect(screen.queryByRole("button", { name: /suggest hierarchy/i })).toBeNull();
  });

  // score is 0 by column default on an agent row and means nothing there, the
  // same way it means nothing on a user row.
  it("does not show a score on an agent suggestion", () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue({
      data: [
        link({
          source: "agent",
          relationType: "inherits_from",
          direction: "parent",
          score: 0,
          reasons: [{ signal: "hierarchy", weight: 0, detail: "Same deployed model." }],
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPanel();

    expect(screen.getByText(/same deployed model/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
```

> `renderPanel()` is whatever the existing file uses to render — reuse it verbatim rather than writing a new helper. If the file inlines `render(...)` per test, inline it the same way.

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel
```

Expected: FAIL — no button matching `/suggest hierarchy/i`.

- [ ] **Step 3: Add the repository function**

Append to `Clients/src/application/repository/riskLink.repository.ts`, following `recomputeRiskLinks` exactly:

```ts
/**
 * Starts a direction pass over every cluster of related risks in the org.
 * `skipped` counts clusters too large for one model call.
 */
export async function suggestRiskHierarchy(): Promise<{
  enqueued: number;
  skipped: number;
}> {
  try {
    const response = await apiServices.post<{
      message: string;
      data: { enqueued: number; skipped: number };
    }>("/riskLinks/suggest-hierarchy", {});
    return extractData<{ enqueued: number; skipped: number }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to start the hierarchy suggestions");
  }
}
```

- [ ] **Step 4: Add the hook**

Add the import of `suggestRiskHierarchy` to the repository import block in `Clients/src/application/hooks/useRiskLinks.ts`, then append:

```ts
/**
 * The pass writes `inherits_from` suggestions across the org, so this risk's
 * own list can change even though the request names no risk. Invalidate on
 * settle for the same reason `useRecomputeRiskLinks` does.
 */
export function useSuggestRiskHierarchy(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: () => suggestRiskHierarchy(),
    onSettled: invalidate,
  });
}
```

- [ ] **Step 5: Add the button and fix the score**

In `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`:

Add `useSuggestRiskHierarchy` to the `useRiskLinks` hook import block, then next to `const recompute = ...`:

```ts
  const suggestHierarchy = useSuggestRiskHierarchy(riskId);
```

Add the handler after `handleScan`:

```ts
  const handleSuggestHierarchy = () => {
    setNotice(null);
    suggestHierarchy.mutate(undefined, {
      onSuccess: (result) =>
        setNotice(
          result.enqueued === 0
            ? "No clusters of related risks to group yet. Run a scan for related risks first."
            : `Grouping ${result.enqueued} clusters of related risks. Suggestions appear here as they finish.` +
              (result.skipped > 0
                ? ` ${result.skipped} clusters were too large to group in one pass.`
                : ""),
        ),
      onError: (error: any) =>
        setNotice(error?.message || "Failed to start the hierarchy suggestions"),
    });
  };
```

Replace the header row (currently lines 111-118) with:

```tsx
      <Stack direction="row" justifyContent="space-between">
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => setShowForm((open) => !open)}>
            {showForm ? "Cancel" : "Link a risk"}
          </Button>
          {/*
            Here rather than in the empty state below: a hierarchy pass groups
            risks that are ALREADY related, so a button that only appeared when
            there were no links would be unreachable exactly when it is useful.
          */}
          {isAdmin && (
            <Button
              size="small"
              onClick={handleSuggestHierarchy}
              disabled={suggestHierarchy.isPending}
            >
              Suggest hierarchy
            </Button>
          )}
        </Stack>
        <Button size="small" onClick={() => setShowDismissed((shown) => !shown)}>
          {showDismissed ? "Hide dismissed" : "Show dismissed"}
        </Button>
      </Stack>
```

And at line 180-183, widen the score guard from "not user" to "only derived":

```tsx
                  {/*
                    score is 0 by column default on a user link and on an agent
                    link, and means nothing on either. Only the scoring engine
                    produces a number worth showing.
                  */}
                  {link.source === "derived" && (
                    <Typography variant="caption">{link.score}</Typography>
                  )}
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel
```

Expected: PASS — the three new cases plus everything already in the file.

- [ ] **Step 7: Verify types and the full frontend suite**

```bash
cd Clients && npm run typecheck && npx vitest run
```

Expected: no type errors; suite green. `typecheck` is not optional — `npm run build` does not run `tsc`, so type errors pass a green build.

- [ ] **Step 8: Commit**

```bash
git add Clients/src/application/repository/riskLink.repository.ts Clients/src/application/hooks/useRiskLinks.ts Clients/src/presentation/components/LinkedRisksPanel/index.tsx Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx && git commit -m "feat(risk-links): let an admin start a hierarchy pass from the panel"
```

---

## Final verification

Run after Task 9, before opening a PR.

- [ ] **Backend build, unit suite, integration suite**

```bash
cd Servers && npm run build && npm run test
```

```bash
cd Servers && npm run test:integration -- "riskLinks.(agentLink|hierarchy|isolation)"
```

- [ ] **API docs in sync**

```bash
cd Servers && npm run check:api-drift
```

- [ ] **Frontend types, build, tests**

```bash
cd Clients && npm run typecheck && npm run build && npx vitest run
```

- [ ] **Read your own diff**

```bash
git diff develop...HEAD --stat && git diff develop...HEAD
```

Check specifically: no `console.log`; no API key in any job payload, log line, or response body; every new SQL statement carries `organization_id = :organizationId`; `source_risk_id` is the child in every `inherits_from` statement.

---

## Self-review

**Spec coverage.** §3 (component as unit of work) → Task 1. §4/§5.1 (flow) → Tasks 7, 8. §5.2 (three reuses: `validateTwoLevel`, `generateObjectWithSelfCorrection`, the BullMQ pattern) → Tasks 5, 6, 7. §5.3 (duplicate `createModel`, deliberately) → Task 6 Step 1. §6.1 (schema) → Task 4. §6.2/§6.3 (prompts) → Task 4. §7 (five rules, component scoping) → Task 5. §7.2 (what blocking on live suggestions costs) → Task 5's rule-5 suggestion case and the doc comment. §8 (behaviour and failure: swallow, never throw) → Task 6 Step 2. §9 (two frontend changes) → Task 9. §10 (files, `reasons` payload) → the File Structure table and Task 3. §11 (test matrix) → Tasks 1, 2, 3, 5, 7, 8, plus `directionSchema.spec.ts` and the frontend cases, which the matrix does not require and which are additions rather than substitutions. §12 had no open questions.

One spec item is deliberately not implemented as written and is documented above: the size-<2 filter in §5.1, which cannot fire.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Every code step carries the code. One step carries a conditional instruction rather than fixed code — Task 9's `renderPanel` helper, because the existing test file's rendering idiom is the thing to match and reusing it verbatim is more correct than inventing one. The step names the file and what to match.

**Type consistency.** `RelatedPair {a, b}` is produced in Task 1 and consumed in Tasks 2 and 8. `RiskPromptRow` is produced in Task 3 and consumed in Tasks 4 and 6. `HierarchyPairRow {childRiskId, parentRiskId, status}` is produced in Task 3 and consumed in Task 6, where it is mapped to the `HierarchyEdge {childRiskId, parentRiskId}` that Tasks 4 and 5 take. `HierarchyGroup` is produced in Task 4 and consumed in Tasks 5 and 6. `hierarchyPairKey` is defined in Task 5 and used to build the set in Task 6, so both sides of rule 4 key identically. `filterProposedGroups`'s third parameter is named `blockingEdges` in the signature, the doc comment, the test, and the call site. `MAX_COMPONENT_SIZE` is defined in Task 1 and used only in Task 8. The response body `{ enqueued, skipped }` is the same shape in Task 8's controller, Task 8's test, Task 9's repository return type, and Task 9's notice handler.
