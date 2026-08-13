# Linked Risks UI (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the risk-links engine in the product — a "Linked risks" tab on the risk edit modal that lists derived and manual links, lets a user confirm/dismiss/restore them, and lets anyone link two risks by hand — backed by one new endpoint, `POST /api/riskLinks`.

**Architecture:** The read and status-change endpoints already ship (phase A1). B adds a single write endpoint in the existing controller/route/utils trio, then builds the frontend on the `Clients/CLAUDE.md` layer flow — types → repository → React Query hook → components. The panel mounts as a tab in `AddNewRiskForm`, mirroring the existing Activity tab exactly. The client-side `findRelatedRisks` heuristic that B replaces is deleted in the same change, so the frontend comes out roughly line-neutral.

**Tech Stack:** Node 22 / Express 4 / Sequelize 6 raw SQL / Jest (backend); React 19 / TypeScript / MUI 7 / TanStack React Query / Vitest + Testing Library (frontend); PostgreSQL shared `verifywise` schema.

**Spec:** `docs/superpowers/specs/2026-08-13-risk-links-b-design.md`

## Global Constraints

- **Tenant isolation:** every SQL statement filters on `organization_id`, sourced from `req.organizationId` (the JWT), never from the request body.
- **Unqualified table names** in application SQL (`FROM risks`, not `FROM verifywise.risks`). The `search_path` resolves it. Migrations are the opposite — but B adds no migration.
- **No migration, no model change, no change under `Servers/services/riskLinks/`.**
- **`canonicalPair` applies only to `relation_type = 'related_to'`.** The `risk_links_canonical` CHECK constraint exempts `inherits_from`, because direction is carried by which column an id sits in. Getting this backwards is the single most likely error in B.
- **`check:api-drift` moves 705 → 706.** The baseline was verified at 705/705 before this work. One new route is one new operation. A different number means an unintended route change, not a broken generator.
- **Exact user-facing copy** (any deviation fails the tests):
  - `Invalid request`
  - `A risk cannot link to itself`
  - `Risk not found`
  - `These risks would inherit from each other`
  - `These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.`
  - `No linked risks yet.`
  - `One of these risks no longer exists`
  - `Scanning {n} risks. Links will appear as the scan completes.`
- **No `console.log`.** No hardcoded colors — use theme references.
- **Commit format:** `type(scope): description`, e.g. `feat(risk-links): add POST /api/riskLinks`.

---

## File Structure

**Backend (all existing files, extended)**

| File | Responsibility after B |
|---|---|
| `Servers/utils/riskLink.utils.ts` | +3 store functions: live-risk check, reverse-pair lookup, user-link insert |
| `Servers/controllers/riskLinks.ctrl.ts` | +`createRiskLink` — the five ordered validation steps of spec §4.3 |
| `Servers/routes/riskLinks.route.ts` | +1 line |
| `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` | regenerated, never hand-edited |

**Frontend (new)**

| File | Responsibility |
|---|---|
| `Clients/src/domain/interfaces/i.riskLink.ts` | Types mirroring the controller's `toResponse` |
| `Clients/src/application/repository/riskLink.repository.ts` | Four HTTP calls, thin |
| `Clients/src/application/hooks/useRiskLinks.ts` | One query hook + three mutation hooks, all keyed `["riskLinks", riskId]` |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | Grouped list, per-link actions, dismissed toggle, empty state |
| `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx` | Risk picker + relation choice + create |

**Frontend (deleted — 475 lines)**

`application/tools/relatedRisks.ts`, `application/tools/__tests__/relatedRisks.test.ts`, `presentation/components/RelatedRisksSummary/index.tsx`, `presentation/components/RelatedRisksSummary/__tests__/index.test.tsx`.

---

## Task Overview

| # | Deliverable | Test tier |
|---|---|---|
| 1 | `POST /api/riskLinks` end to end + regenerated API docs | Jest unit (mocked utils) |
| 2 | The tenant/soft-delete claim proved against a real database | Jest integration |
| 3 | Types, repository, `useRiskLinks` hooks | Vitest `renderHook` |
| 4 | `LinkedRisksPanel` — list, actions, toggle, empty state | Vitest + RTL |
| 5 | `LinkRiskForm` + its button in the panel | Vitest + RTL |
| 6 | Tab wiring + deletion of the client-side duplicate | Both builds + existing suites |

---

### Task 1: `POST /api/riskLinks`

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` (append after `upsertRiskLinkQuery`, ~`:198`)
- Modify: `Servers/controllers/riskLinks.ctrl.ts` (append after `updateRiskLinkStatus`, before `recomputeAllRiskLinks`)
- Modify: `Servers/routes/riskLinks.route.ts`
- Modify (generated, do not hand-edit): `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts`
- Test: `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`

**Interfaces:**
- Consumes: `canonicalPair(a, b): [number, number]` and `RiskLinkRelationType` from `../services/riskLinks/types`; `STATUS_CODE` from `../utils/statusCode.utils`; `logProcessing`/`logSuccess`/`logFailure` from `../utils/logger/logHelper`.
- Produces:
  - `getLiveRiskIdsQuery(ids: number[], organizationId: number): Promise<number[]>`
  - `riskLinkPairExistsQuery(organizationId: number, sourceRiskId: number, targetRiskId: number, relationType: RiskLinkRelationType): Promise<boolean>`
  - `createUserRiskLinkQuery(input: CreateUserRiskLinkInput): Promise<number | null>` where `CreateUserRiskLinkInput = { organizationId: number; sourceRiskId: number; targetRiskId: number; relationType: RiskLinkRelationType; userId: number }`
  - `createRiskLink(req: Request, res: Response): Promise<any>` — responds `201 { id }`
  - Wire protocol consumed by Task 3: request `{ sourceRiskId, targetRiskId, relationType }`, response `{ message: "Created", data: { id } }`

- [ ] **Step 1: Add the three new STATUS_CODE entries to the test file's mock**

The existing mock at the top of `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` has no `201` or `409`. Without them the new tests throw `STATUS_CODE[201] is not a function` and you will misread it as a bug in the controller.

Replace the `jest.mock("../../utils/statusCode.utils", ...)` block (lines 10–18) with:

```ts
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    202: (data: any) => ({ message: "Accepted", data }),
    400: (data: any) => ({ message: "Bad request", data }),
    404: (data: any) => ({ message: "Not found", data }),
    409: (data: any) => ({ message: "Conflict", data }),
    500: (error: any) => ({ message: "Internal server error", error }),
  },
}));
```

Also extend the controller import on line 22 to pull in the new handler:

```ts
import {
  getRiskLinks,
  updateRiskLinkStatus,
  recomputeAllRiskLinks,
  createRiskLink,
} from "../riskLinks.ctrl";
```

- [ ] **Step 2: Write the failing tests**

Append this whole `describe` block to the end of `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`. The file already provides `req()` (which supplies `userId: 5, organizationId: 7`), `res()`, `mockUtils`, and a `beforeEach(() => jest.resetAllMocks())` — do not redefine them.

```ts
describe("createRiskLink", () => {
  const body = (overrides: any = {}) => ({
    sourceRiskId: 4,
    targetRiskId: 9,
    relationType: "related_to",
    ...overrides,
  });

  it("rejects a malformed body with 400", async () => {
    const r = res();
    await createRiskLink(req({ body: { sourceRiskId: "abc", targetRiskId: 9 } }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Invalid request" }));
    expect(mockUtils.createUserRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("rejects an unknown relationType with 400", async () => {
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "banana" }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockUtils.getLiveRiskIdsQuery).not.toHaveBeenCalled();
  });

  it("rejects a self-link with 400", async () => {
    const r = res();
    await createRiskLink(req({ body: body({ targetRiskId: 4 }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "A risk cannot link to itself" }),
    );
    expect(mockUtils.getLiveRiskIdsQuery).not.toHaveBeenCalled();
  });

  it("checks both ids against the caller's org in one query", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(77);
    await createRiskLink(req({ body: body() }) as any, res() as any);
    expect(mockUtils.getLiveRiskIdsQuery).toHaveBeenCalledWith([4, 9], 7);
  });

  // Unknown, cross-org and soft-deleted ids are one code path: the store returns
  // fewer than two rows. They are listed separately because the SQL clause behind
  // each differs, and Task 2 pins them against a real database.
  it.each([
    ["an unknown id", [4]],
    ["a cross-org id", [4]],
    ["a soft-deleted id", [4]],
  ])("404s on %s", async (_label, live) => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue(live as number[]);
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Risk not found" }));
    expect(mockUtils.createUserRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("409s when the reverse inherits_from already exists", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.riskLinkPairExistsQuery.mockResolvedValue(true);
    const r = res();
    await createRiskLink(
      req({ body: body({ relationType: "inherits_from" }) }) as any,
      r as any,
    );
    // reverse of {source: 4, target: 9} is {source: 9, target: 4}
    expect(mockUtils.riskLinkPairExistsQuery).toHaveBeenCalledWith(7, 9, 4, "inherits_from");
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "These risks would inherit from each other" }),
    );
    expect(mockUtils.createUserRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("does not look for a reverse row on related_to", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(77);
    await createRiskLink(req({ body: body() }) as any, res() as any);
    expect(mockUtils.riskLinkPairExistsQuery).not.toHaveBeenCalled();
  });

  it("409s with the dismissed hint when the pair already exists", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(null);
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data:
          'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      }),
    );
  });

  // The load-bearing assertion. Identical input, two relation types, two
  // different column placements. Inverting this has no visible symptom until
  // someone reads an inheritance backwards.
  it("canonicalises related_to to smaller-id-first", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([9, 4]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(77);
    const r = res();
    await createRiskLink(
      req({ body: { sourceRiskId: 9, targetRiskId: 4, relationType: "related_to" } }) as any,
      r as any,
    );
    expect(mockUtils.createUserRiskLinkQuery).toHaveBeenCalledWith({
      organizationId: 7,
      sourceRiskId: 4,
      targetRiskId: 9,
      relationType: "related_to",
      userId: 5,
    });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 77 } }));
  });

  it("leaves inherits_from in the order the caller sent", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([9, 4]);
    mockUtils.riskLinkPairExistsQuery.mockResolvedValue(false);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(78);
    const r = res();
    await createRiskLink(
      req({ body: { sourceRiskId: 9, targetRiskId: 4, relationType: "inherits_from" } }) as any,
      r as any,
    );
    expect(mockUtils.createUserRiskLinkQuery).toHaveBeenCalledWith({
      organizationId: 7,
      sourceRiskId: 9,
      targetRiskId: 4,
      relationType: "inherits_from",
      userId: 5,
    });
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it("500s when the store throws", async () => {
    mockUtils.getLiveRiskIdsQuery.mockRejectedValue(new Error("boom"));
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(500);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts
```

Expected: the new `describe` fails at import time — `createRiskLink` is not exported from `../riskLinks.ctrl`. The four pre-existing `describe` blocks fail with it; that is the import error, not a regression.

- [ ] **Step 4: Add the three store functions**

Append to `Servers/utils/riskLink.utils.ts`, immediately after `upsertRiskLinkQuery`. The file already imports `sequelize` and `QueryTypes`; add `RiskLinkRelationType` to the existing import from `../services/riskLinks/types` if it is not already there.

```ts
/**
 * Which of these ids are live risks in this org.
 *
 * Both risk id columns on `risk_links` carry real foreign keys to `risks`, so an
 * id that exists nowhere is already rejected by the database. What no constraint
 * catches is an id that exists and belongs to another org, or one that is
 * soft-deleted — so both clauses below are load-bearing, and neither has a
 * safety net behind it. Callers compare the result length against the input.
 */
export async function getLiveRiskIdsQuery(
  ids: number[],
  organizationId: number,
): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT id FROM risks
      WHERE id IN (:ids) AND organization_id = :organizationId AND is_deleted = false`,
    { replacements: { ids, organizationId }, type: QueryTypes.SELECT },
  );
  return (rows as { id: number }[]).map((row) => row.id);
}

/** Does this exact directed edge already exist? Used to refuse a two-cycle. */
export async function riskLinkPairExistsQuery(
  organizationId: number,
  sourceRiskId: number,
  targetRiskId: number,
  relationType: RiskLinkRelationType,
): Promise<boolean> {
  const rows = await sequelize.query(
    `SELECT 1 FROM risk_links
      WHERE organization_id = :organizationId
        AND source_risk_id = :sourceRiskId
        AND target_risk_id = :targetRiskId
        AND relation_type = :relationType
      LIMIT 1`,
    {
      replacements: { organizationId, sourceRiskId, targetRiskId, relationType },
      type: QueryTypes.SELECT,
    },
  );
  return (rows as unknown[]).length > 0;
}

export interface CreateUserRiskLinkInput {
  organizationId: number;
  sourceRiskId: number;
  targetRiskId: number;
  relationType: RiskLinkRelationType;
  userId: number;
}

/**
 * Write a human-asserted link. `confirmed` + `user` makes the row immune to the
 * recompute prune on both of that prune's two conditions. `score` and `reasons`
 * are left to their column defaults (0, []) — a human link has no score.
 *
 * Returns null when the pair already exists: ON CONFLICT DO NOTHING rather than
 * catching a driver error code, so the controller never sniffs SQLSTATE.
 */
export async function createUserRiskLinkQuery(
  input: CreateUserRiskLinkInput,
): Promise<number | null> {
  const [rows] = await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, relation_type,
        status, source, created_by_user_id, decided_by_user_id, decided_at)
     VALUES (:organizationId, :sourceRiskId, :targetRiskId, :relationType,
             'confirmed', 'user', :userId, :userId, NOW())
     ON CONFLICT (source_risk_id, target_risk_id, relation_type) DO NOTHING
     RETURNING id`,
    {
      replacements: {
        organizationId: input.organizationId,
        sourceRiskId: input.sourceRiskId,
        targetRiskId: input.targetRiskId,
        relationType: input.relationType,
        userId: input.userId,
      },
    },
  );
  const row = (rows as { id: number }[])[0];
  return row ? row.id : null;
}
```

- [ ] **Step 5: Add the controller**

In `Servers/controllers/riskLinks.ctrl.ts`, extend the import block from `../utils/riskLink.utils` with `createUserRiskLinkQuery`, `getLiveRiskIdsQuery`, `riskLinkPairExistsQuery`, and the import from `../services/riskLinks/types` with `canonicalPair` and `RiskLinkRelationType`. Then add this constant next to `ALLOWED_TRANSITIONS`:

```ts
const RELATION_TYPES: RiskLinkRelationType[] = ["related_to", "inherits_from"];

const isRelationType = (value: unknown): value is RiskLinkRelationType =>
  typeof value === "string" && (RELATION_TYPES as string[]).includes(value);
```

And this handler, after `updateRiskLinkStatus`:

```ts
/**
 * A human asserting a link the engine did not find. For `inherits_from`,
 * `sourceRiskId` is the risk that inherits and `targetRiskId` is the risk
 * inherited from — matching how `toResponse` reads direction back out.
 */
export async function createRiskLink(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createRiskLink",
    functionName: "createRiskLink",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const sourceRiskId = parseInt(String(req.body?.sourceRiskId), 10);
    const targetRiskId = parseInt(String(req.body?.targetRiskId), 10);
    const relationType = req.body?.relationType;

    if (isNaN(sourceRiskId) || isNaN(targetRiskId) || !isRelationType(relationType)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid request"));
    }
    if (sourceRiskId === targetRiskId) {
      return res.status(400).json(STATUS_CODE[400]("A risk cannot link to itself"));
    }

    const live = await getLiveRiskIdsQuery([sourceRiskId, targetRiskId], req.organizationId!);
    if (live.length !== 2) {
      return res.status(404).json(STATUS_CODE[404]("Risk not found"));
    }

    // ponytail: application-level cycle check. Two admins asserting opposite
    // inheritance in the same instant both pass here and both rows land. Closing
    // it needs a database constraint, i.e. another migration; the result is
    // displayable rather than corrupting and either row can be dismissed.
    if (relationType === "inherits_from") {
      const reverseExists = await riskLinkPairExistsQuery(
        req.organizationId!,
        targetRiskId,
        sourceRiskId,
        "inherits_from",
      );
      if (reverseExists) {
        return res
          .status(409)
          .json(STATUS_CODE[409]("These risks would inherit from each other"));
      }
    }

    // The risk_links_canonical CHECK exempts inherits_from: direction is carried
    // by which column an id sits in, so only related_to is reordered.
    const [storedSource, storedTarget] =
      relationType === "related_to"
        ? canonicalPair(sourceRiskId, targetRiskId)
        : [sourceRiskId, targetRiskId];

    const id = await createUserRiskLinkQuery({
      organizationId: req.organizationId!,
      sourceRiskId: storedSource,
      targetRiskId: storedTarget,
      relationType,
      userId: req.userId!,
    });

    if (id === null) {
      return res
        .status(409)
        .json(
          STATUS_CODE[409](
            'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
          ),
        );
    }

    logSuccess({
      eventType: "Create",
      description: `linked risk ${storedSource} to ${storedTarget} as ${relationType}`,
      functionName: "createRiskLink",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201]({ id }));
  } catch (error) {
    logFailure({
      eventType: "Create",
      description: "failed to create risk link",
      functionName: "createRiskLink",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts
```

Expected: PASS, all five `describe` blocks.

- [ ] **Step 7: Add the route**

In `Servers/routes/riskLinks.route.ts`, add `createRiskLink` to the controller import and add the route above the `GET`:

```ts
router.post("/", authenticateJWT, createRiskLink);
```

No `authorize(...)`. The sibling `PATCH /:id` and `POST /api/risks` both gate on JWT alone; gating link creation harder than risk creation would be incoherent. `POST /recompute` is a distinct path, so there is no collision.

- [ ] **Step 8: Regenerate the API artifacts and confirm the new count**

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

Expected: `706/706`. The pre-B baseline was 705/705 and this adds exactly one operation. **Any other number means a route changed that should not have** — stop and find out which, rather than committing the regenerated files.

- [ ] **Step 9: Build and run the full unit suite**

```bash
cd Servers && npm run build && npm run test
```

Expected: build clean, suite green.

- [ ] **Step 10: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/controllers/riskLinks.ctrl.ts Servers/controllers/__tests__/riskLinks.ctrl.test.ts Servers/routes/riskLinks.route.ts Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts && git commit -m "feat(risk-links): add POST /api/riskLinks for manual links"
```

---

### Task 2: Prove the tenant and soft-delete clauses against a real database

Task 1's controller tests mock `../../utils/riskLink.utils` wholesale, so mutating the SQL inside `getLiveRiskIdsQuery` cannot turn any of them red — the mutated code never runs. This task is the tier where the isolation claim is actually tested.

**Files:**
- Test: `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts` (modify — append one `describe`)

**Interfaces:**
- Consumes: `getLiveRiskIdsQuery` and `createUserRiskLinkQuery` from Task 1; `seedTwoTenantContexts(): Promise<{ owner: { orgId: number }, attacker: { orgId: number } }>` from `./tenantIsolation.harness`; `createTestRisk(orgId: number, options?): Promise<number>` from `../../factories`.
- Produces: nothing consumed downstream.

The existing file calls store functions **directly** — it imports `getRiskLinksForRiskQuery`, `getRiskLinkByIdQuery`, `getStructuralNeighboursQuery` and calls them. Follow that; do not go through Express.

- [ ] **Step 1: Write the failing tests**

Extend the import from `../../../utils/riskLink.utils` at the top of the file with `getLiveRiskIdsQuery` and `createUserRiskLinkQuery`, then append this `describe` at the end (outside the existing one):

```ts
describe("manual risk links respect the tenant boundary", () => {
  it("does not treat another org's live risk as linkable", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerRisk = await createTestRisk(owner.orgId);
    // A real row in the other org. A fabricated id would prove nothing: the FK on
    // target_risk_id rejects it with or without the organization_id clause, so the
    // test would pass against a query that has no tenant scoping at all.
    const attackerRisk = await createTestRisk(attacker.orgId);

    const live = await getLiveRiskIdsQuery([ownerRisk, attackerRisk], owner.orgId);

    expect(live).toEqual([ownerRisk]);
  });

  it("does not treat this org's soft-deleted risk as linkable", async () => {
    const { owner } = await seedTwoTenantContexts();
    const ownerRisk = await createTestRisk(owner.orgId);
    const deletedRisk = await createTestRisk(owner.orgId);
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: deletedRisk },
    });

    const live = await getLiveRiskIdsQuery([ownerRisk, deletedRisk], owner.orgId);

    expect(live).toEqual([ownerRisk]);
  });

  it("stores a manual link as confirmed/user and refuses the pair twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId);
    const riskB = await createTestRisk(owner.orgId);
    const input = {
      organizationId: owner.orgId,
      sourceRiskId: Math.min(riskA, riskB),
      targetRiskId: Math.max(riskA, riskB),
      relationType: "related_to" as const,
      userId: owner.userId,
    };

    const id = await createUserRiskLinkQuery(input);
    expect(id).not.toBeNull();
    expect(await createUserRiskLinkQuery(input)).toBeNull();

    const [rows] = await sequelize.query(
      `SELECT status, source, score::float8 AS score, decided_at FROM risk_links WHERE id = :id`,
      { replacements: { id } },
    );
    expect(rows[0]).toMatchObject({ status: "confirmed", source: "user", score: 0 });
    expect((rows[0] as any).decided_at).not.toBeNull();
  });

  it("keeps both directions of inherits_from distinguishable", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId);
    const parent = await createTestRisk(owner.orgId);

    // Deliberately non-canonical order — the CHECK constraint exempts
    // inherits_from, so the database must accept it exactly as given.
    await createUserRiskLinkQuery({
      organizationId: owner.orgId,
      sourceRiskId: Math.max(child, parent),
      targetRiskId: Math.min(child, parent),
      relationType: "inherits_from",
      userId: owner.userId,
    });

    expect(
      await riskLinkPairExistsQuery(
        owner.orgId,
        Math.max(child, parent),
        Math.min(child, parent),
        "inherits_from",
      ),
    ).toBe(true);
    expect(
      await riskLinkPairExistsQuery(
        owner.orgId,
        Math.min(child, parent),
        Math.max(child, parent),
        "inherits_from",
      ),
    ).toBe(false);

    // The controller's two-cycle refusal routes through this query. Unscoped, it
    // would answer "yes" for another org's pair — a 409 on a link the caller may
    // legitimately make, which also discloses that the other org has it linked.
    expect(
      await riskLinkPairExistsQuery(
        attacker.orgId,
        Math.max(child, parent),
        Math.min(child, parent),
        "inherits_from",
      ),
    ).toBe(false);
  });
});
```

Add `riskLinkPairExistsQuery` to the same import.

If `seedTwoTenantContexts` does not expose `userId` on its contexts, read `tenantIsolation.harness.ts` and use whatever field carries the seeded admin's id; the column is `NOT NULL` only if the schema says so — check the migration before passing `null`.

- [ ] **Step 2: Run to verify they fail**

```bash
cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testPathPatterns=riskLinks.isolation --runInBand
```

Expected: FAIL — `getLiveRiskIdsQuery is not a function` if Task 1 is not merged into this working tree, otherwise the four new cases run. This needs a live PostgreSQL; if it cannot connect, fix that before continuing — a skipped isolation test is worse than none.

- [ ] **Step 3: Confirm the tests pass with Task 1's implementation**

No new production code is needed. Run the same command.

Expected: PASS, ten cases (six existing + four new).

- [ ] **Step 4: Verify both clauses are actually load-bearing**

Mutate, run, revert. Each must produce a *different* red.

1. In `getLiveRiskIdsQuery`, delete `AND organization_id = :organizationId`. Re-run. Expected: "does not treat another org's live risk as linkable" fails — `live` comes back with both ids. Revert.
2. Delete `AND is_deleted = false`. Re-run. Expected: "does not treat this org's soft-deleted risk as linkable" fails — `live` comes back with both ids, and the cross-org test still passes. Revert.
3. In `riskLinkPairExistsQuery`, delete `AND organization_id = :organizationId`. Re-run. Expected: "keeps both directions of inherits_from distinguishable" fails on its last assertion — the attacker org is told the owner's pair exists. Revert. This clause is a separate one from the two above and no other test reaches it: `getLiveRiskIdsQuery` guards which risks may be linked, while this one guards the controller's two-cycle refusal, so an unscoped version leaks a 409 across the tenant boundary while every other test stays green.

If any mutation leaves the suite green, the test is not testing what it claims and must be fixed before committing.

- [ ] **Step 5: Commit**

```bash
git add Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts && git commit -m "test(risk-links): pin the manual-link tenant and soft-delete clauses"
```

---

### Task 3: Frontend types, repository, and `useRiskLinks`

The repository layer has no `__tests__` directory in this codebase and gets no unit tests of its own; the hook test covers it by mocking the repository module, which is the established pattern (`useVendorRiskMutations.test.ts`).

**Files:**
- Create: `Clients/src/domain/interfaces/i.riskLink.ts`
- Create: `Clients/src/application/repository/riskLink.repository.ts`
- Create: `Clients/src/application/hooks/useRiskLinks.ts`
- Test: `Clients/src/application/hooks/__tests__/useRiskLinks.test.ts`

**Interfaces:**
- Consumes: `apiServices` from `../../infrastructure/api/networkServices`; `APIError` from `../tools/error`; the wire protocol from Task 1.
- Produces:
  - Types `RiskLink`, `RiskLinkStatus`, `RiskLinkSource`, `RiskLinkRelationType`, `RiskLinkDirection`, `RiskLinkReason`, `CreateRiskLinkInput`
  - Repository: `getRiskLinks(riskId: number, status?: RiskLinkStatus): Promise<RiskLink[]>`, `createRiskLink(input: CreateRiskLinkInput): Promise<{ id: number }>`, `updateRiskLinkStatus(id: number, status: RiskLinkStatus): Promise<{ id: number; status: RiskLinkStatus }>`, `recomputeRiskLinks(): Promise<{ enqueued: number }>`
  - Hooks: `useRiskLinks(riskId: number, status?: RiskLinkStatus)`, `useCreateRiskLink(riskId: number)`, `useUpdateRiskLinkStatus(riskId: number)`, `useRecomputeRiskLinks(riskId: number)`
  - Query key: `["riskLinks", riskId, status ?? "default"]`; every mutation invalidates the prefix `["riskLinks", riskId]`

- [ ] **Step 1: Write the types**

Create `Clients/src/domain/interfaces/i.riskLink.ts`:

```ts
export type RiskLinkStatus = "suggested" | "confirmed" | "dismissed";
export type RiskLinkSource = "derived" | "user" | "agent";
export type RiskLinkRelationType = "related_to" | "inherits_from";
export type RiskLinkDirection = "outgoing" | "incoming" | "undirected";

export interface RiskLinkReason {
  signal: string;
  weight: number;
  detail?: string;
}

/** Mirrors `toResponse` in Servers/controllers/riskLinks.ctrl.ts. */
export interface RiskLink {
  id: number;
  status: RiskLinkStatus;
  source: RiskLinkSource;
  relationType: RiskLinkRelationType;
  score: number;
  reasons: RiskLinkReason[];
  direction: RiskLinkDirection;
  decidedAt: string | null;
  lastComputedAt: string | null;
  relatedRisk: {
    id: number;
    name: string | null;
    riskLevel: string | null;
    ownerId: number | null;
  };
}

/**
 * For `inherits_from`, `sourceRiskId` is the risk that inherits. The client never
 * canonicalises — the server does, and only for `related_to`.
 */
export interface CreateRiskLinkInput {
  sourceRiskId: number;
  targetRiskId: number;
  relationType: RiskLinkRelationType;
}
```

- [ ] **Step 2: Write the repository**

Create `Clients/src/application/repository/riskLink.repository.ts`:

```ts
import { apiServices } from "../../infrastructure/api/networkServices";
import { APIError } from "../tools/error";
import {
  CreateRiskLinkInput,
  RiskLink,
  RiskLinkStatus,
} from "../../domain/interfaces/i.riskLink";

function extractData<T>(response: { data: { data: T } }): T {
  return response.data.data;
}

/**
 * Deliberately unlike `policy.repository.ts`, which throws a hardcoded message
 * and reads `error.response.status`. `apiServices` rejects with a
 * `CustomException` whose `.message` is already the backend's message and whose
 * `.response` is the response *body*, not the response object — so
 * `.response.status` is always undefined there. The panel needs the real status
 * (409 vs 404) and the real message, so both are carried through.
 */
function toAPIError(error: any, fallback: string): APIError {
  return new APIError(error?.message || fallback, error?.status, error);
}

export async function getRiskLinks(
  riskId: number,
  status?: RiskLinkStatus,
): Promise<RiskLink[]> {
  try {
    const query = status ? `?status=${status}` : "";
    const response = await apiServices.get<{ message: string; data: RiskLink[] }>(
      `/riskLinks/${riskId}${query}`,
    );
    return extractData<RiskLink[]>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to fetch linked risks");
  }
}

export async function createRiskLink(input: CreateRiskLinkInput): Promise<{ id: number }> {
  try {
    const response = await apiServices.post<{ message: string; data: { id: number } }>(
      "/riskLinks",
      input,
    );
    return extractData<{ id: number }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to create the link");
  }
}

export async function updateRiskLinkStatus(
  id: number,
  status: RiskLinkStatus,
): Promise<{ id: number; status: RiskLinkStatus }> {
  try {
    const response = await apiServices.patch<{
      message: string;
      data: { id: number; status: RiskLinkStatus };
    }>(`/riskLinks/${id}`, { status });
    return extractData<{ id: number; status: RiskLinkStatus }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to update the link");
  }
}

export async function recomputeRiskLinks(): Promise<{ enqueued: number }> {
  try {
    const response = await apiServices.post<{
      message: string;
      data: { enqueued: number };
    }>("/riskLinks/recompute", {});
    return extractData<{ enqueued: number }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to start the scan");
  }
}
```

`apiServices` exposes `get`, `post`, `patch`, `put`, `delete` — all five are `async <T>(...) => ApiResponse<T>`.

- [ ] **Step 3: Write the failing hook test**

Create `Clients/src/application/hooks/__tests__/useRiskLinks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/riskLink.repository", () => ({
  getRiskLinks: vi.fn(),
  createRiskLink: vi.fn(),
  updateRiskLinkStatus: vi.fn(),
  recomputeRiskLinks: vi.fn(),
}));

import {
  useRiskLinks,
  useCreateRiskLink,
  useUpdateRiskLinkStatus,
  useRecomputeRiskLinks,
} from "../useRiskLinks";
import {
  getRiskLinks,
  createRiskLink,
  updateRiskLinkStatus,
  recomputeRiskLinks,
} from "../../repository/riskLink.repository";

const mockGet = vi.mocked(getRiskLinks);
const mockCreate = vi.mocked(createRiskLink);
const mockUpdate = vi.mocked(updateRiskLinkStatus);
const mockRecompute = vi.mocked(recomputeRiskLinks);

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidate };
}

beforeEach(() => vi.clearAllMocks());

describe("useRiskLinks", () => {
  it("fetches with no status filter by default", async () => {
    mockGet.mockResolvedValue([]);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useRiskLinks(42), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(42, undefined);
  });

  it("passes the status through and keys the query on it", async () => {
    mockGet.mockResolvedValue([]);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useRiskLinks(42, "dismissed"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(42, "dismissed");
  });

  it("re-fetches when the status changes rather than reusing the cache", async () => {
    mockGet.mockResolvedValue([]);
    const { wrapper } = createHarness();
    const { rerender, result } = renderHook(
      ({ status }: { status?: "dismissed" }) => useRiskLinks(42, status),
      { wrapper, initialProps: {} as { status?: "dismissed" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ status: "dismissed" });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

describe("risk link mutations", () => {
  it("useCreateRiskLink posts the payload and invalidates the risk's links", async () => {
    mockCreate.mockResolvedValue({ id: 7 });
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useCreateRiskLink(42), { wrapper });

    result.current.mutate({ sourceRiskId: 42, targetRiskId: 9, relationType: "related_to" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreate).toHaveBeenCalledWith({
      sourceRiskId: 42,
      targetRiskId: 9,
      relationType: "related_to",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });

  it("useUpdateRiskLinkStatus invalidates the risk's links", async () => {
    mockUpdate.mockResolvedValue({ id: 7, status: "confirmed" });
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({ id: 7, status: "confirmed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith(7, "confirmed");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });

  it("useRecomputeRiskLinks invalidates the risk's links", async () => {
    mockRecompute.mockResolvedValue({ enqueued: 12 });
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useRecomputeRiskLinks(42), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });

  // A 404 means one end of the link is gone; the list on screen is stale either
  // way, so the invalidation must not be conditional on success.
  it("invalidates even when the mutation fails", async () => {
    mockUpdate.mockRejectedValue(new Error("gone"));
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({ id: 7, status: "confirmed" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });
});
```

- [ ] **Step 4: Run to verify it fails**

```bash
cd Clients && npx vitest run src/application/hooks/__tests__/useRiskLinks.test.ts
```

Expected: FAIL — cannot resolve `../useRiskLinks`.

- [ ] **Step 5: Write the hooks**

Create `Clients/src/application/hooks/useRiskLinks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRiskLink,
  getRiskLinks,
  recomputeRiskLinks,
  updateRiskLinkStatus,
} from "../repository/riskLink.repository";
import {
  CreateRiskLinkInput,
  RiskLink,
  RiskLinkStatus,
} from "../../domain/interfaces/i.riskLink";

const linksKey = (riskId: number) => ["riskLinks", riskId] as const;

/**
 * The API accepts one status at a time, so the "show dismissed" view is a
 * different query rather than a filter over one cached list. `status` is part of
 * the key for that reason.
 */
export function useRiskLinks(riskId: number, status?: RiskLinkStatus) {
  return useQuery<RiskLink[]>({
    queryKey: [...linksKey(riskId), status ?? "default"],
    queryFn: () => getRiskLinks(riskId, status),
    enabled: Number.isFinite(riskId),
  });
}

/** onSettled, not onSuccess: a 404 means the list on screen is stale too. */
function useInvalidateLinks(riskId: number) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: linksKey(riskId) });
}

export function useCreateRiskLink(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: (input: CreateRiskLinkInput) => createRiskLink(input),
    onSettled: invalidate,
  });
}

export function useUpdateRiskLinkStatus(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: RiskLinkStatus }) =>
      updateRiskLinkStatus(id, status),
    onSettled: invalidate,
  });
}

export function useRecomputeRiskLinks(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: () => recomputeRiskLinks(),
    onSettled: invalidate,
  });
}
```

- [ ] **Step 6: Run to verify it passes**

```bash
cd Clients && npx vitest run src/application/hooks/__tests__/useRiskLinks.test.ts
```

Expected: PASS, seven cases.

- [ ] **Step 7: Commit**

```bash
git add Clients/src/domain/interfaces/i.riskLink.ts Clients/src/application/repository/riskLink.repository.ts Clients/src/application/hooks/useRiskLinks.ts Clients/src/application/hooks/__tests__/useRiskLinks.test.ts && git commit -m "feat(risk-links): add the frontend riskLink types, repository and hooks"
```

---

### Task 4: `LinkedRisksPanel`

The list, the actions, the dismissed toggle and the empty state. The "Link a risk" button arrives in Task 5 — leave it out here so this task's tests are about reading and deciding, not creating.

**Files:**
- Create: `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`
- Test: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`

**Interfaces:**
- Consumes: `useRiskLinks`, `useUpdateRiskLinkStatus`, `useRecomputeRiskLinks` from Task 3; `RiskLink` from `i.riskLink`; `useIsAdmin` from `../../../application/hooks/useIsAdmin` — a **named** export (`export const useIsAdmin = (): boolean`), not a default.
- Produces: `export default function LinkedRisksPanel({ riskId }: { riskId: number })` — consumed by Task 5 (which adds a child) and Task 6 (which mounts it).

- [ ] **Step 1: Write the failing test**

Create `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RiskLink } from "../../../../domain/interfaces/i.riskLink";

const mockUseRiskLinks = vi.fn();
const mockMutateStatus = vi.fn();
const mockMutateRecompute = vi.fn();
const mockIsAdmin = vi.fn();

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useRiskLinks: (riskId: number, status?: string) => mockUseRiskLinks(riskId, status),
  useUpdateRiskLinkStatus: () => ({ mutate: mockMutateStatus, isPending: false }),
  useRecomputeRiskLinks: () => ({ mutate: mockMutateRecompute, isPending: false }),
  useCreateRiskLink: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));

vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin(),
}));

import LinkedRisksPanel from "../index";

const link = (overrides: Partial<RiskLink> = {}): RiskLink => ({
  id: 1,
  status: "suggested",
  source: "derived",
  relationType: "related_to",
  score: 4.2,
  reasons: [{ signal: "shared_category", weight: 3 }],
  direction: "undirected",
  decidedAt: null,
  lastComputedAt: null,
  relatedRisk: { id: 9, name: "Model drift", riskLevel: "High risk", ownerId: 2 },
  ...overrides,
});

const queryResult = (links: RiskLink[], extra: any = {}) => ({
  data: links,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.mockReturnValue(false);
});

describe("LinkedRisksPanel grouping", () => {
  it("puts each relation and direction under its own heading", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({ id: 1, relationType: "inherits_from", direction: "outgoing",
               relatedRisk: { id: 9, name: "Parent risk", riskLevel: null, ownerId: null } }),
        link({ id: 2, relationType: "inherits_from", direction: "incoming",
               relatedRisk: { id: 10, name: "Child risk", riskLevel: null, ownerId: null } }),
        link({ id: 3, relationType: "related_to", direction: "undirected",
               relatedRisk: { id: 11, name: "Sibling risk", riskLevel: null, ownerId: null } }),
      ]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("Inherits from")).toBeInTheDocument();
    expect(screen.getByText("Inherited by")).toBeInTheDocument();
    expect(screen.getByText("Related risks")).toBeInTheDocument();
    expect(screen.getByText("Parent risk")).toBeInTheDocument();
  });

  it("hides a group with no links", () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link()]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("Related risks")).toBeInTheDocument();
    expect(screen.queryByText("Inherits from")).not.toBeInTheDocument();
    expect(screen.queryByText("Inherited by")).not.toBeInTheDocument();
  });

  it("hides the score on a user-created link but shows it on a derived one", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({ id: 1, source: "derived", score: 4.2 }),
        link({ id: 2, source: "user", score: 0,
               relatedRisk: { id: 10, name: "Hand-linked", riskLevel: null, ownerId: null } }),
      ]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("4.2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("LinkedRisksPanel actions", () => {
  it("offers Confirm and Dismiss on a suggestion", () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ status: "suggested" })]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("offers only Dismiss on a confirmed link", () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ status: "confirmed" })]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("offers Restore and Confirm on a dismissed derived link", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([link({ status: "dismissed", source: "derived" })]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  // Restoring a user link to `suggested` achieves nothing — the recompute prune
  // requires source = 'derived' — and misdescribes it as a machine suggestion.
  it("offers Confirm but not Restore on a dismissed user link", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([link({ status: "dismissed", source: "user" })]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("sends the target status to the mutation", async () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ id: 55, status: "suggested" })]));
    render(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 55, status: "dismissed" },
      expect.anything(),
    );
  });
});

describe("LinkedRisksPanel dismissed toggle", () => {
  it("re-queries with the dismissed status", async () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link()]));
    render(<LinkedRisksPanel riskId={42} />);
    expect(mockUseRiskLinks).toHaveBeenLastCalledWith(42, undefined);

    await userEvent.click(screen.getByRole("button", { name: "Show dismissed" }));

    await waitFor(() => expect(mockUseRiskLinks).toHaveBeenLastCalledWith(42, "dismissed"));
    expect(screen.getByRole("button", { name: "Hide dismissed" })).toBeInTheDocument();
  });
});

describe("LinkedRisksPanel empty state", () => {
  it("shows a scan button to admins and starts the scan", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseRiskLinks.mockReturnValue(queryResult([]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("No linked risks yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Scan for related risks" }));

    expect(mockMutateRecompute).toHaveBeenCalled();
  });

  it("shows no scan button to a non-admin", () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue(queryResult([]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("No linked risks yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Scan for related risks" }),
    ).not.toBeInTheDocument();
  });
});

describe("LinkedRisksPanel failures", () => {
  it("shows a retry in place of the list", async () => {
    const refetch = vi.fn();
    mockUseRiskLinks.mockReturnValue(queryResult([], { isError: true, refetch }));
    render(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.queryByText("No linked risks yet.")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx
```

Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Write the component**

Create `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`:

```tsx
import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import {
  useRecomputeRiskLinks,
  useRiskLinks,
  useUpdateRiskLinkStatus,
} from "../../../application/hooks/useRiskLinks";
import { useIsAdmin } from "../../../application/hooks/useIsAdmin";
import { RiskLink, RiskLinkStatus } from "../../../domain/interfaces/i.riskLink";

interface LinkedRisksPanelProps {
  riskId: number;
}

const GROUPS: { title: string; match: (link: RiskLink) => boolean }[] = [
  {
    title: "Inherits from",
    match: (l) => l.relationType === "inherits_from" && l.direction === "outgoing",
  },
  {
    title: "Inherited by",
    match: (l) => l.relationType === "inherits_from" && l.direction === "incoming",
  },
  { title: "Related risks", match: (l) => l.relationType === "related_to" },
];

/**
 * Mirrors ALLOWED_TRANSITIONS in Servers/controllers/riskLinks.ctrl.ts rather
 * than re-deriving it. The dismissed/user row is not a simplification: Restore
 * sets `suggested`, but the recompute prune also requires source = 'derived', so
 * restoring a human link achieves nothing and misdescribes it.
 */
const actionsFor = (link: RiskLink): { label: string; next: RiskLinkStatus }[] => {
  if (link.status === "suggested") {
    return [
      { label: "Confirm", next: "confirmed" },
      { label: "Dismiss", next: "dismissed" },
    ];
  }
  if (link.status === "confirmed") {
    return [{ label: "Dismiss", next: "dismissed" }];
  }
  return link.source === "derived"
    ? [
        { label: "Restore", next: "suggested" },
        { label: "Confirm", next: "confirmed" },
      ]
    : [{ label: "Confirm", next: "confirmed" }];
};

const reasonLabel = (reason: RiskLink["reasons"][number]) =>
  reason.detail ? `${reason.signal}: ${reason.detail}` : reason.signal;

export default function LinkedRisksPanel({ riskId }: LinkedRisksPanelProps) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = useIsAdmin();

  const { data: links = [], isLoading, isError, refetch } = useRiskLinks(
    riskId,
    showDismissed ? "dismissed" : undefined,
  );
  const updateStatus = useUpdateRiskLinkStatus(riskId);
  const recompute = useRecomputeRiskLinks(riskId);

  const handleAction = (link: RiskLink, next: RiskLinkStatus) => {
    setNotice(null);
    updateStatus.mutate(
      { id: link.id, status: next },
      {
        onError: (error: any) =>
          setNotice(
            error?.status === 404
              ? "One of these risks no longer exists"
              : error?.message || "Failed to update the link",
          ),
      },
    );
  };

  const handleScan = () => {
    setNotice(null);
    recompute.mutate(undefined, {
      onSuccess: (result) =>
        setNotice(`Scanning ${result.enqueued} risks. Links will appear as the scan completes.`),
      onError: (error: any) => setNotice(error?.message || "Failed to start the scan"),
    });
  };

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button size="small" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      >
        Failed to load linked risks.
      </Alert>
    );
  }

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      <Stack direction="row" justifyContent="flex-end">
        <Button size="small" onClick={() => setShowDismissed((shown) => !shown)}>
          {showDismissed ? "Hide dismissed" : "Show dismissed"}
        </Button>
      </Stack>

      {notice && <Alert severity="info">{notice}</Alert>}

      {isLoading && <CircularProgress size={20} />}

      {!isLoading && links.length === 0 && (
        <Stack spacing={1} alignItems="flex-start">
          <Typography variant="body2">No linked risks yet.</Typography>
          {isAdmin ? (
            <Button size="small" onClick={handleScan} disabled={recompute.isPending}>
              Scan for related risks
            </Button>
          ) : (
            <Typography variant="caption">
              Links appear as risks are saved, or after an administrator runs a scan.
            </Typography>
          )}
        </Stack>
      )}

      {GROUPS.map(({ title, match }) => {
        const group = links.filter(match);
        if (group.length === 0) return null;
        return (
          <Box key={title}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {title}
            </Typography>
            <Stack spacing={1}>
              {group.map((link) => (
                <Stack
                  key={link.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  flexWrap="wrap"
                >
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {link.relatedRisk.name ?? `Risk ${link.relatedRisk.id}`}
                  </Typography>
                  {link.relatedRisk.riskLevel && (
                    <Chip size="small" label={link.relatedRisk.riskLevel} />
                  )}
                  {link.reasons.map((reason, index) => (
                    <Chip key={index} size="small" variant="outlined" label={reasonLabel(reason)} />
                  ))}
                  {/* score is 0 by column default on a user link and means nothing there */}
                  {link.source !== "user" && (
                    <Typography variant="caption">{link.score}</Typography>
                  )}
                  {actionsFor(link).map(({ label, next }) => (
                    <Button
                      key={label}
                      size="small"
                      disabled={updateStatus.isPending}
                      onClick={() => handleAction(link, next)}
                    >
                      {label}
                    </Button>
                  ))}
                </Stack>
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx
```

Expected: PASS, twelve cases.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/components/LinkedRisksPanel && git commit -m "feat(risk-links): add the linked risks panel"
```

---

### Task 5: `LinkRiskForm`

**Files:**
- Create: `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` (add the toggle button and render the form)
- Test: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx`

**Interfaces:**
- Consumes: `useCreateRiskLink(riskId)` from Task 3; `RiskLink`, `CreateRiskLinkInput` from `i.riskLink`; `getAllProjectRisks({ filter })` from `../../../application/repository/projectRisk.repository`; `AutoCompleteField` (default export) from `../Inputs/Autocomplete`.
- Produces: `export default function LinkRiskForm({ riskId, existingLinks, onClose }: { riskId: number; existingLinks: RiskLink[]; onClose: () => void })`.

`existingLinks` is passed in from the panel rather than re-fetched. The panel already has the list, and the exclusions only need the *actively* linked partners.

- [ ] **Step 1: Write the failing test**

Create `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";
import { RiskLink } from "../../../../domain/interfaces/i.riskLink";

const mockCreate = vi.fn();
const mockGetAllProjectRisks = vi.fn();

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useCreateRiskLink: () => ({ mutate: mockCreate, isPending: false }),
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: (...args: unknown[]) => mockGetAllProjectRisks(...args),
}));

import LinkRiskForm from "../LinkRiskForm";

// The app theme is required, not decorative: AutoCompleteField reads
// theme.palette.border.dark, a custom key MUI's default theme does not define,
// so a bare render throws before any assertion runs.
const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={light}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </ThemeProvider>,
  );
};

const link = (overrides: Partial<RiskLink>): RiskLink => ({
  id: 1,
  status: "confirmed",
  source: "user",
  relationType: "related_to",
  score: 0,
  reasons: [],
  direction: "undirected",
  decidedAt: null,
  lastComputedAt: null,
  relatedRisk: { id: 9, name: "Model drift", riskLevel: null, ownerId: null },
  ...overrides,
});

// getAllProjectRisks returns response.data, and the array sits one level deeper
// inside that — the payload is { message, data: [...] }.
const risksResponse = (risks: { id: number; risk_name: string }[]) => ({ data: risks });

// Queried by placeholder, not by accessible name: AutoCompleteField renders its
// `label` as a detached <Typography> above the field and passes only
// `placeholder` down to the TextField, so the combobox has no accessible name.
const pick = async (name: string) => {
  const input = screen.getByPlaceholderText("Search risks");
  await userEvent.click(input);
  await userEvent.click(await screen.findByText(name));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllProjectRisks.mockResolvedValue(
    risksResponse([
      { id: 42, risk_name: "Subject risk" },
      { id: 9, risk_name: "Model drift" },
      { id: 10, risk_name: "Data quality" },
      { id: 11, risk_name: "Vendor outage" },
    ]),
  );
});

describe("LinkRiskForm payloads", () => {
  it("sends the subject as source for Related to", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceRiskId: 42, targetRiskId: 10, relationType: "related_to" },
      expect.anything(),
    );
  });

  it("sends the subject as source for Inherits from", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceRiskId: 42, targetRiskId: 10, relationType: "inherits_from" },
      expect.anything(),
    );
  });

  // The one place the client expresses direction. Getting this backwards stores
  // the inheritance the wrong way round with no visible symptom.
  it("swaps the ids for Is inherited by", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Is inherited by" }));
    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceRiskId: 10, targetRiskId: 42, relationType: "inherits_from" },
      expect.anything(),
    );
  });
});

describe("LinkRiskForm candidates", () => {
  it("never offers the subject itself", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByPlaceholderText("Search risks"));

    expect(await screen.findByText("Data quality")).toBeInTheDocument();
    expect(screen.queryByText("Subject risk")).not.toBeInTheDocument();
  });

  it("excludes a risk already related, for the Related to choice only", async () => {
    const existing = [link({ relationType: "related_to", relatedRisk: { id: 9, name: "Model drift", riskLevel: null, ownerId: null } })];
    wrap(<LinkRiskForm riskId={42} existingLinks={existing} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(screen.queryByText("Model drift")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // A pair may legitimately hold both a related_to and an inherits_from.
    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(await screen.findByText("Model drift")).toBeInTheDocument();
  });

  // An incoming inherits_from blocks both inheritance choices: one would be the
  // duplicate the server refuses at step 5, the other the two-cycle at step 4.
  it("excludes a risk holding the reverse inheritance from both inheritance choices", async () => {
    const existing = [
      link({
        relationType: "inherits_from",
        direction: "incoming",
        relatedRisk: { id: 11, name: "Vendor outage", riskLevel: null, ownerId: null },
      }),
    ];
    wrap(<LinkRiskForm riskId={42} existingLinks={existing} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(screen.queryByText("Vendor outage")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("radio", { name: "Is inherited by" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(screen.queryByText("Vendor outage")).not.toBeInTheDocument();
  });

  // The exclusions are computed from suggested + confirmed only, so a dismissed
  // partner stays selectable on purpose — the 409 explains it (§6.4).
  it("keeps a risk selectable when its only link is dismissed", async () => {
    const existing = [
      link({ status: "dismissed", relationType: "related_to",
             relatedRisk: { id: 9, name: "Model drift", riskLevel: null, ownerId: null } }),
    ];
    // The panel does not pass dismissed links down; simulate that by passing none.
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    expect(await screen.findByText("Model drift")).toBeInTheDocument();
    expect(existing[0].status).toBe("dismissed");
  });
});

describe("LinkRiskForm errors", () => {
  it("shows the server's 409 message inline", async () => {
    mockCreate.mockImplementation((_input: unknown, options: any) =>
      options.onError({
        status: 409,
        message:
          'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      }),
    );
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(
      await screen.findByText(
        'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      ),
    ).toBeInTheDocument();
  });

  it("shows the cycle message on the other 409", async () => {
    mockCreate.mockImplementation((_input: unknown, options: any) =>
      options.onError({ status: 409, message: "These risks would inherit from each other" }),
    );
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(
      await screen.findByText("These risks would inherit from each other"),
    ).toBeInTheDocument();
  });

  it("rewrites a 404 into its own message", async () => {
    mockCreate.mockImplementation((_input: unknown, options: any) =>
      options.onError({ status: 404, message: "Risk not found" }),
    );
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByText("One of these risks no longer exists")).toBeInTheDocument();
  });

  it("closes on success", async () => {
    const onClose = vi.fn();
    mockCreate.mockImplementation((_input: unknown, options: any) => options.onSuccess());
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={onClose} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    await pick("Data quality");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("disables Link until a risk is chosen", async () => {
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx
```

Expected: FAIL — cannot resolve `../LinkRiskForm`.

- [ ] **Step 3: Write the form**

Create `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
} from "@mui/material";
import AutoCompleteField from "../Inputs/Autocomplete";
import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import { useCreateRiskLink } from "../../../application/hooks/useRiskLinks";
import { CreateRiskLinkInput, RiskLink } from "../../../domain/interfaces/i.riskLink";

interface LinkRiskFormProps {
  riskId: number;
  /** The panel's current list — suggested + confirmed only. */
  existingLinks: RiskLink[];
  onClose: () => void;
}

interface Candidate {
  id: number;
  risk_name: string;
}

/** "Is inherited by" is the same relation with the ids swapped. */
type Choice = "related_to" | "inherits_from" | "inherited_by";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "related_to", label: "Related to" },
  { value: "inherits_from", label: "Inherits from" },
  { value: "inherited_by", label: "Is inherited by" },
];

export default function LinkRiskForm({ riskId, existingLinks, onClose }: LinkRiskFormProps) {
  const [choice, setChoice] = useState<Choice>("related_to");
  const [partner, setPartner] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createLink = useCreateRiskLink(riskId);

  // Org-wide, not per-project: useProjectRisks calls
  // getAllProjectRisksByProjectId and is scoped to one project.
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["projectRisks", "active"],
    queryFn: async () => {
      const response: any = await getAllProjectRisks({ filter: "active" });
      return (response?.data ?? []) as Candidate[];
    },
  });

  /**
   * Deliberately incomplete: computed from the panel's suggested + confirmed
   * list, so a dismissed partner stays selectable and the server's 409 does the
   * explaining. Hiding it would leave the user hunting for a risk they know
   * exists with no explanation.
   */
  const excludedIds = useMemo(() => {
    const ids = new Set<number>([riskId]);
    for (const link of existingLinks) {
      const blocks =
        choice === "related_to"
          ? link.relationType === "related_to"
          : link.relationType === "inherits_from";
      if (blocks) ids.add(link.relatedRisk.id);
    }
    return ids;
  }, [existingLinks, choice, riskId]);

  const options = useMemo(
    () => candidates.filter((candidate) => !excludedIds.has(candidate.id)),
    [candidates, excludedIds],
  );

  const handleChoice = (next: Choice) => {
    setChoice(next);
    setError(null);
    // The chosen partner may be excluded under the new relation type.
    setPartner(null);
  };

  const handleSubmit = () => {
    if (!partner) return;
    setError(null);
    const input: CreateRiskLinkInput =
      choice === "inherited_by"
        ? { sourceRiskId: partner.id, targetRiskId: riskId, relationType: "inherits_from" }
        : { sourceRiskId: riskId, targetRiskId: partner.id, relationType: choice };

    createLink.mutate(input, {
      onSuccess: () => onClose(),
      onError: (mutationError: any) =>
        setError(
          mutationError?.status === 404
            ? "One of these risks no longer exists"
            : mutationError?.message || "Failed to create the link",
        ),
    });
  };

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <RadioGroup row value={choice} onChange={(event) => handleChoice(event.target.value as Choice)}>
        {CHOICES.map(({ value, label }) => (
          <FormControlLabel key={value} value={value} control={<Radio />} label={label} />
        ))}
      </RadioGroup>

      <AutoCompleteField<Candidate>
        label="Risk"
        placeholder="Search risks"
        options={options}
        value={partner}
        getOptionLabel={(option) => option.risk_name}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        onChange={(_event, selected) => {
          setPartner(selected);
          setError(null);
        }}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          disabled={!partner || createLink.isPending}
          onClick={handleSubmit}
        >
          Link
        </Button>
        <Button size="small" onClick={onClose}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}
```

`AutoCompleteField` is a default export wrapping MUI `Autocomplete`; it accepts every `AutocompleteProps` except `renderInput` and `sx`, plus `label`, `placeholder`, `error`, `helperText`, `isRequired`. Keep `placeholder="Search risks"` — the tests query the input by it.

- [ ] **Step 4: Wire the form into the panel**

In `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`, add the import and a state flag, then the button and the conditional render. Replace the toolbar `Stack` from Task 4 with:

```tsx
      <Stack direction="row" justifyContent="space-between">
        <Button size="small" onClick={() => setShowForm((open) => !open)}>
          {showForm ? "Cancel" : "Link a risk"}
        </Button>
        <Button size="small" onClick={() => setShowDismissed((shown) => !shown)}>
          {showDismissed ? "Hide dismissed" : "Show dismissed"}
        </Button>
      </Stack>

      {/*
        With the dismissed view open, `links` holds dismissed rows, not the
        active ones the form's exclusions are defined over. Passing them would
        invert the rule: it would hide the dismissed partners §6.4 keeps
        selectable and stop excluding the actively-linked ones. Pass nothing
        instead and let the server's 409 do the explaining.
      */}
      {showForm && (
        <LinkRiskForm
          riskId={riskId}
          existingLinks={showDismissed ? [] : links}
          onClose={() => setShowForm(false)}
        />
      )}
```

Add `const [showForm, setShowForm] = useState(false);` next to the other state, and `import LinkRiskForm from "./LinkRiskForm";`.

**Do not write `existingLinks={links}`.** The panel queries `useRiskLinks(riskId, showDismissed ? "dismissed" : undefined)`, so with the dismissed view open `links` is the dismissed set — the exact inverse of what the prop is documented to take. Every test in Task 4 passes either way, because none of them opens the form while the dismissed view is on; Step 5 below adds the case that does.

**Link a risk stays available to everyone**, admin or not, and in the empty state as well as the populated one — manual linking does not need the engine.

- [ ] **Step 5: Add the panel-level test for the button**

Append to `LinkedRisksPanel.test.tsx`. The existing `vi.mock` for `useRiskLinks` already stubs `useCreateRiskLink`; add a stub for the repository so the form's query resolves. It must be a named mock set in `beforeEach`, not a one-shot inline resolve — the second case below needs candidates in it, and `vi.clearAllMocks()` in the existing `beforeEach` wipes the calls of an inline mock while leaving stale implementations behind:

```tsx
const mockGetAllProjectRisks = vi.fn();

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: (...args: unknown[]) => mockGetAllProjectRisks(...args),
}));
```

and, inside the existing `beforeEach`:

```tsx
  mockGetAllProjectRisks.mockResolvedValue({
    data: [
      { id: 42, risk_name: "Subject risk" },
      { id: 9, risk_name: "Model drift" },
    ],
  });
```

then the two cases (wrapped in both providers the same way `LinkRiskForm.test.tsx` does — the theme is required, see Step 1):

```tsx
describe("LinkedRisksPanel link form", () => {
  it("opens the form for a non-admin with no links", async () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue(queryResult([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={client}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Link a risk" }));

    expect(screen.getByRole("radio", { name: "Related to" })).toBeInTheDocument();
  });

  // Pins Step 4's `showDismissed ? [] : links`. The form's exclusions are defined
  // over suggested + confirmed; with the dismissed view open the panel holds
  // dismissed rows instead, so passing them down would invert the rule and hide
  // exactly the partners §6.4 keeps selectable. Queried inside the listbox
  // because the panel's own list shows the same name.
  it("keeps a dismissed partner selectable while the dismissed view is open", async () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({
          status: "dismissed",
          relationType: "related_to",
          relatedRisk: { id: 9, name: "Model drift", riskLevel: null, ownerId: null },
        }),
      ]),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={client}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Show dismissed" }));
    await userEvent.click(screen.getByRole("button", { name: "Link a risk" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Model drift")).toBeInTheDocument();
  });
});
```

Add to that file: `import { QueryClient, QueryClientProvider } from "@tanstack/react-query";`, `import { ThemeProvider } from "@mui/material";`, `import { light } from "../../../themes";`, and `within` to the existing `@testing-library/react` import.

Verify the second case bites: change Step 4's wiring back to `existingLinks={links}` and re-run. Expected: FAIL at `findByRole("listbox")` — with every candidate excluded MUI renders no listbox element at all, so the query times out rather than merely missing the option. Revert.

- [ ] **Step 6: Run both component suites**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Clients/src/presentation/components/LinkedRisksPanel && git commit -m "feat(risk-links): add the manual link form to the linked risks panel"
```

---

### Task 6: Mount the tab, delete the client-side duplicate

**Files:**
- Modify: `Clients/src/presentation/components/AddNewRiskForm/index.tsx` (two insertions, at `:134` and after `:205`)
- Modify: `Clients/src/presentation/pages/RiskManagement/index.tsx` (six deletion regions)
- Delete: `Clients/src/application/tools/relatedRisks.ts`
- Delete: `Clients/src/application/tools/__tests__/relatedRisks.test.ts`
- Delete: `Clients/src/presentation/components/RelatedRisksSummary/index.tsx`
- Delete: `Clients/src/presentation/components/RelatedRisksSummary/__tests__/index.test.tsx`

**Interfaces:**
- Consumes: `LinkedRisksPanel` from Task 4/5.
- Produces: nothing.

- [ ] **Step 1: Add the tab**

In `Clients/src/presentation/components/AddNewRiskForm/index.tsx`, add `import LinkedRisksPanel from "../LinkedRisksPanel";` to the imports, then insert **after line 134** (the `)}` closing the Activity tab's gate, immediately before `</TabList>`):

```tsx
            {popupStatus === "edit" && entityId && (
              <Tab
                label="Linked risks"
                value="linked-risks"
                sx={tabStyle}
                disableRipple={disableRipple}
              />
            )}
```

And **after line 205** (the `)}` closing the Activity `TabPanel`'s gate):

```tsx
        {popupStatus === "edit" && entityId && (
          <TabPanel value="linked-risks" sx={{ p: 0 }}>
            <LinkedRisksPanel riskId={entityId} />
          </TabPanel>
        )}
```

Both gates are `popupStatus === "edit" && entityId` — identical to Activity's, because a risk that does not exist yet cannot have links. No `keepMounted`: unlike the Risks and Mitigation panels, this one should fetch when opened, not on every risk edit.

- [ ] **Step 2: Delete the four files**

```bash
cd /Users/ozger/Desktop/verifywise && git rm Clients/src/application/tools/relatedRisks.ts Clients/src/application/tools/__tests__/relatedRisks.test.ts Clients/src/presentation/components/RelatedRisksSummary/index.tsx Clients/src/presentation/components/RelatedRisksSummary/__tests__/index.test.tsx
```

- [ ] **Step 3: Remove the six regions from `RiskManagement/index.tsx`**

Line numbers are pre-edit; work top to bottom or they shift.

**3a — imports (`:21` and `:23`).** Delete these two lines:

```tsx
import RelatedRisksSummary from "../../components/RelatedRisksSummary";
import { findRelatedRisks, RelatedRisk } from "../../../application/tools/relatedRisks";
```

**Line 22 — `import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";` — stays.** `fetchProjectRisks` at `:474` still uses it. Deleting all three neighbouring imports breaks the build.

**3b — state (`:120–123`).** Delete:

```tsx
  const [relatedSummary, setRelatedSummary] = useState<{
    subject: RiskModel;
    related: RelatedRisk[];
  } | null>(null);
```

**3c — `showRelatedRisks` and its doc comment (`:636–647`).** Delete the whole block:

```tsx
  /**
   * Finds the risk that was just saved in the freshly fetched list and, if it
   * has related risks, opens the summary. Silent when nothing matches.
   */
  const showRelatedRisks = (fresh: RiskModel[], matchSubject: (risk: RiskModel) => boolean) => {
    const subject = fresh.find(matchSubject);
    if (!subject) return;
    const related = findRelatedRisks(subject, fresh);
    if (related.length > 0) {
      setRelatedSummary({ subject, related });
    }
  };
```

**3d — `handleSuccess` (`:649–666`).** `previousIds` exists only to feed `showRelatedRisks` and becomes an unused-variable build error if left behind. Replace the whole function with:

```tsx
  const handleSuccess = () => {
    setTimeout(() => {
      setIsLoading(initialLoadingState);
      handleToast("success", "Risk created successfully");
    }, 1000);

    // set pagination for FIFO risk listing after adding a new risk
    const rowsPerPage = 5;
    const pageCount = Math.floor(projectRisks.length / rowsPerPage);
    setCurrentPage(pageCount);

    void fetchProjectRisks();
    setRefreshKey((prevKey) => prevKey + 1);
  };
```

**3e — `handleUpdate` (`:668–686`).** Replace the whole function with:

```tsx
  const handleUpdate = () => {
    const subjectId = selectedRow[0]?.id;
    // Set flash immediately to ensure visibility
    setCurrentRow(subjectId!); // set current row to trigger flash-feedback

    setTimeout(() => {
      setIsLoading(initialLoadingState);
      handleToast("success", "Risk updated successfully");
      // Fetch fresh data after flash is set
      void fetchProjectRisks();
    }, 500);

    setTimeout(() => {
      setCurrentRow(null);
    }, 3000); // Flash duration consistent with other tables
    setRefreshKey((prevKey) => prevKey + 1);
  };
```

**3f — the render block (`:1077–1088`).** Delete:

```tsx
      {relatedSummary && (
        <RelatedRisksSummary
          subject={relatedSummary.subject}
          related={relatedSummary.related}
          onClose={() => setRelatedSummary(null)}
          onOpenRisk={(risk) => {
            setRelatedSummary(null);
            setSelectedRow([risk]);
            setIsRiskModalOpen(true);
          }}
        />
      )}
```

- [ ] **Step 4: Verify nothing references the deleted code**

```bash
cd /Users/ozger/Desktop/verifywise && git grep -nE "findRelatedRisks|RelatedRisksSummary|relatedSummary|showRelatedRisks" -- Clients/
```

Expected: no output. Any hit is a reference the deletion missed.

`-E` so the alternation is unambiguous. Do not add a `\b`-anchored `RelatedRisk`
term: word boundaries are not portable across git's regex backends, and a term
that silently matches nothing reads as a pass. The four names above only ever
appear in the deleted imports, the deleted state block, and the two deleted
handlers, so they cover the same ground.

Note the `RiskModel` import at `index.tsx:29` **stays**. It is still used at
lines 82, 83, 266, 294, 455, 477, 749 and 1036 — only `relatedSummary`'s
annotation and `showRelatedRisks`'s signature go away with it.

- [ ] **Step 5: Build and run the full frontend suite**

```bash
cd Clients && npm run typecheck && npm run build && npx vitest run
```

Expected: all three clean; the suite runs two fewer test files than before this task (`relatedRisks.test.ts` and `RelatedRisksSummary/__tests__/index.test.tsx`), which is net +1 across the whole feature against the three added in Tasks 3–5.

`npm run typecheck` is not redundant with `npm run build`. **`build` is `node scripts/build.js` and never invokes tsc** — only `typecheck` (`tsc -b`) and `build:original` do. So an unused import or a stale type left behind by this task's deletions will sail straight through a green `build`. If `tsc` reports one in `RiskManagement/index.tsx`, a deletion region was missed — go back to Step 3.

Note also that `npm run test` in `Clients` is `vitest watch`, which never exits. Use `npx vitest run`.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/presentation/components/AddNewRiskForm/index.tsx Clients/src/presentation/pages/RiskManagement/index.tsx && git commit -m "feat(risk-links): mount the linked risks tab and drop the client-side heuristic"
```

The four deleted files need no staging here — Step 3's `git rm` already removed them from both the worktree and the index.

Stage explicit paths. **Do not use `git add -A Clients/src`**: this working tree carries untracked `.megasaver/` tooling directories under `Clients/src/` that are not git-ignored, and `-A` sweeps them into the commit. Run `git show --stat HEAD` after committing and confirm no `.megasaver` path appears. Then check the commit actually recorded all four deletions: `git show --stat HEAD | grep -c "relatedRisks\|RelatedRisksSummary"` must print `4`.

- [ ] **Step 7: Final verification of the whole feature**

```bash
cd Servers && npm run build && npm run test && npm run check:api-drift
```

```bash
cd Clients && npm run typecheck && npm run build && npx vitest run
```

Expected: both builds clean, `tsc -b` exit 0, both suites green, drift `706/706`.

The `Servers` `npm run test` above excludes the integration tier — its script appends `--testPathIgnorePatterns=/tests/integration/`, so Task 2's isolation tests are *not* in that count and must be run and reported separately, with the command in Task 2 Step 2.

---

## Notes for the executor

- **The integration test in Task 2 needs a live PostgreSQL.** It is the only tier that proves the tenant claim; if the database is unavailable, say so rather than skipping it.
- **Do not hand-edit `swagger.yaml` or `endpoints.ts`.** They are generated from the route layer and CI regenerates and diffs them.
- **Line numbers in Task 6 are pre-edit.** Delete from the bottom up, or re-locate each region by its text.
- **Everything is local.** Nothing in this plan pushes, opens a PR, or merges. Those need explicit permission.
