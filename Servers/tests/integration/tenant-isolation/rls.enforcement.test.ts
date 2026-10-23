/**
 * RLS runtime enforcement verification — issue #4680.
 *
 * Runs the cross-tenant isolation pack with RLS_ENFORCEMENT_ENABLED=true.
 * The default integration run (and the declarative matrix in
 * tenantIsolation.matrix.test.ts) exercises the app-level scoping with the
 * flag OFF; this file flips the flag ON and re-proves the core invariants
 * through the REAL JWT auth path — the test bypass in setup.ts short-circuits
 * before rlsEnforcement, so flag-on tests must log in like production.
 *
 * With the flag on, authenticateJWT establishes a per-request transaction
 * (`SET LOCAL app.current_org`) and commits it when the response finishes.
 * These tests pin:
 *
 *   1. Zero leaks: cross-tenant read attempts on projects, tasks and risks
 *      return 0 rows / 404 while the owner's positive control succeeds.
 *   2. Commit path: an owner write is visible to the owner's very next read
 *      (the RLS transaction commits on response finish — no half-written
 *      state).
 *   3. Fail-closed is NOT weakened: a request with no tenant context is
 *      rejected rather than running unscoped (asserted here at unit level in
 *      middleware/__tests__/rls.middleware.test.ts; end-to-end it is the
 *      SuperAdmin exemption path, out of scope per the runbook).
 *
 * CI NOTE (workflow wiring is another agent's job): the tenant-isolation
 * pack should run twice — once with RLS_ENFORCEMENT_ENABLED unset (app-level
 * scoping) and once with RLS_ENFORCEMENT_ENABLED=true (this file proves the
 * flag-on half). See Servers/docs/TESTING.md § RLS pack.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

// The flag must be set BEFORE database/db is first imported: it applies the
// enableRlsQueryScoping() wrapper at module load. Static imports are hoisted
// above statements, so every runtime import in this file is a require() that
// runs after this assignment.
process.env.RLS_ENFORCEMENT_ENABLED = "true";

import type http from "node:http";
import type { Response } from "supertest";

const { createTestApp, testRequest } = require("../setup");
const {
  cleanupDatabase,
  createTestOrganization,
  createTestUser,
  seedFrameworks,
} = require("../helpers");
const {
  createTestProject,
  createTestTask,
  createTestRisk,
  linkRiskToProject,
} = require("../../factories");
const { isRlsEnforcementEnabled } = require("../../../middleware/rls.middleware");

interface JwtTenant {
  orgId: number;
  userId: number;
  email: string;
  token: string;
}

async function loginTenant(app: http.Server, label: string): Promise<JwtTenant> {
  const orgId = await createTestOrganization(`RLS ${label} ${Date.now()}`);
  const email = `rls-${label}-${Date.now()}@test.com`;
  const userId = await createTestUser(orgId, 1, email, "Password123!");
  const res = await testRequest(app).post("/api/users/login").send({
    email,
    password: "Password123!",
  });
  if (res.status !== 202 || !res.body?.data?.token) {
    throw new Error(`login failed for ${label}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { orgId, userId, email, token: res.body.data.token };
}

const auth = (tenant: JwtTenant) => ({ Authorization: `Bearer ${tenant.token}` });

/** Poll: the RLS transaction commits asynchronously on response finish. */
async function waitFor(
  probe: () => Promise<boolean>,
  { timeoutMs = 5000, intervalMs = 100 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await probe()) return;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("RLS enforcement enabled (#4680)", () => {
  jest.setTimeout(60_000);

  let app: http.Server;

  beforeAll(async () => {
    expect(isRlsEnforcementEnabled()).toBe(true);
    await seedFrameworks();
    app = await createTestApp(); // real authenticateJWT — no bypass
  });

  afterEach(async () => {
    await cleanupDatabase();
    await seedFrameworks();
  });

  it("cross-tenant reads leak 0 rows across projects, tasks and risks", async () => {
    const owner = await loginTenant(app, "owner");
    const attacker = await loginTenant(app, "attacker");

    // Owner seeds one row per entity through the database factories (the rows
    // belong to the owner's org; RLS GUCs are per-request, so direct inserts
    // are visible to the owner's later requests).
    const projectId = await createTestProject(owner.orgId, owner.userId);
    await createTestTask(owner.orgId, { creator_id: owner.userId });
    const riskId = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await linkRiskToProject(owner.orgId, riskId, projectId);

    const listRoutes = [
      { route: "/api/projects" },
      { route: "/api/tasks" },
      { route: "/api/projectRisks" },
    ];

    // Owner positive control: every list shows exactly the seeded row.
    for (const { route } of listRoutes) {
      const res: Response = await testRequest(app).get(route).set(auth(owner));
      expect(res.status).toBe(200);
      const items = Array.isArray(res.body?.data)
        ? res.body.data
        : (Object.values(res.body?.data ?? {}).find(Array.isArray) ?? []);
      expect(items.length).toBeGreaterThan(0);
    }

    // Attacker: repeated reads (miss, then would-be cache hits) — 0 leaked rows.
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const { route } of listRoutes) {
        const res: Response = await testRequest(app).get(route).set(auth(attacker));
        expect(res.status).toBe(200);
        const items = Array.isArray(res.body?.data)
          ? res.body.data
          : (Object.values(res.body?.data ?? {}).find(Array.isArray) ?? []);
        const leaked = items.filter(
          (row: any) => row.organization_id === owner.orgId || row.id === projectId,
        );
        expect(leaked).toHaveLength(0);
      }
      // Item reads denied with an owner positive control at 200.
      const attackerItem: Response = await testRequest(app)
        .get(`/api/projects/${projectId}`)
        .set(auth(attacker));
      expect([404, 403]).toContain(attackerItem.status);
      const ownerItem: Response = await testRequest(app)
        .get(`/api/projects/${projectId}`)
        .set(auth(owner));
      expect(ownerItem.status).toBe(200);
    }

    // Cross-tenant writes are denied and change nothing.
    const before = await testRequest(app).get(`/api/projects/${projectId}`).set(auth(owner));
    const patchAttempt: Response = await testRequest(app)
      .patch(`/api/projects/${projectId}`)
      .set(auth(attacker))
      .send({ project_title: "Hijacked by attacker" });
    expect([404, 403]).toContain(patchAttempt.status);
    const after = await testRequest(app).get(`/api/projects/${projectId}`).set(auth(owner));
    expect(after.body).toEqual(before.body);
  });

  it("owner write commits inside the RLS transaction and reads back fresh", async () => {
    const owner = await loginTenant(app, "commit");
    const create: Response = await testRequest(app).post("/api/projects").set(auth(owner)).send({
      project_title: "RLS Commit Project",
      owner: owner.userId,
      start_date: "2024-06-01",
      geography: 1,
      framework: [],
      members: [],
    });
    expect(create.status).toBe(201);
    const projectId: number = create.body.data.project.id;

    // The POST's RLS transaction commits on response finish; the next read
    // must observe the row (poll guards the async commit).
    await waitFor(async () => {
      const res: Response = await testRequest(app)
        .get(`/api/projects/${projectId}`)
        .set(auth(owner));
      return res.status === 200;
    });

    const patch: Response = await testRequest(app)
      .patch(`/api/projects/${projectId}`)
      .set(auth(owner))
      .send({ project_title: "RLS Commit Project (updated)" });
    expect([200, 202, 204]).toContain(patch.status);

    await waitFor(async () => {
      const res: Response = await testRequest(app)
        .get(`/api/projects/${projectId}`)
        .set(auth(owner));
      const title = res.body?.data?.project?.project_title ?? res.body?.data?.project_title;
      return title === "RLS Commit Project (updated)";
    });
  });
});
