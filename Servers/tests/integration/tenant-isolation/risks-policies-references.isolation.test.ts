jest.setTimeout(60000);

/**
 * Risks and policies may only point at users, use cases, folders and objects
 * of the caller's own organization (Risks + Policies audit, PR A).
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, createTestUser } from "../helpers";
import { createTestApp, testRequest } from "../setup";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";
import { createTestFile, createTestProject, createTestRisk } from "../../factories";

const riskPayload = (ownerId: number, extra: Record<string, unknown> = {}) => ({
  risk_name: `Isolation risk ${Date.now()}`,
  risk_owner: ownerId,
  risk_description: "Tenant reference check",
  ...extra,
});

const policyPayload = (extra: Record<string, unknown> = {}) => ({
  title: `Isolation policy ${Date.now()}`,
  content_html: "<p>Body</p>",
  status: "Draft",
  tags: ["Privacy"],
  next_review_date: "2030-01-01",
  ...extra,
});

async function createPolicy(ctx: TenantContext): Promise<number> {
  const res = await ctx.request.post("/api/policies").send(policyPayload());
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function createFolder(ctx: TenantContext, name: string): Promise<number> {
  const res = await ctx.request.post("/api/virtual-folders").send({ name });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

describe("Risk references stay inside the organization", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("rejects an owner or approver from another organization on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const foreignOwner = await owner.request
      .post("/api/projectRisks")
      .send(riskPayload(attacker.userId));
    expect(foreignOwner.status).toBe(400);

    const foreignApprover = await owner.request
      .post("/api/projectRisks")
      .send(riskPayload(owner.userId, { risk_approval: attacker.userId }));
    expect(foreignApprover.status).toBe(400);

    const ok = await owner.request.post("/api/projectRisks").send(riskPayload(owner.userId));
    expect(ok.status).toBe(201);
  });

  it("rejects linking a use case of another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const foreignProject = await createTestProject(attacker.orgId, attacker.userId);
    const ownProject = await createTestProject(owner.orgId, owner.userId);

    const res = await owner.request
      .post("/api/projectRisks")
      .send(riskPayload(owner.userId, { projects: [ownProject, foreignProject] }));
    expect(res.status).toBe(400);

    const links = await sequelize.query(
      `SELECT 1 FROM projects_risks WHERE project_id = :foreignProject`,
      { replacements: { foreignProject }, type: QueryTypes.SELECT },
    );
    expect(links).toHaveLength(0);
  });

  it("rejects a foreign owner on update but keeps an unchanged owner editable", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const riskId = await createTestRisk(owner.orgId, { risk_owner: owner.userId });

    const foreign = await owner.request
      .put(`/api/projectRisks/${riskId}`)
      .send({ risk_owner: attacker.userId });
    expect(foreign.status).toBe(400);

    const stored = await sequelize.query<{ risk_owner: number }>(
      `SELECT risk_owner FROM risks WHERE id = :riskId`,
      { replacements: { riskId }, type: QueryTypes.SELECT },
    );
    expect(stored[0].risk_owner).toBe(owner.userId);

    const unchanged = await owner.request
      .put(`/api/projectRisks/${riskId}`)
      .send({ risk_owner: owner.userId, review_notes: "Still editable" });
    expect(unchanged.status).toBe(200);
  });

  it("rejects a foreign owner in bulk set_owner", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const riskId = await createTestRisk(owner.orgId, { risk_owner: owner.userId });

    const res = await owner.request
      .patch("/api/projectRisks/bulk")
      .send({ ids: [riskId], action: "set_owner", ownerId: attacker.userId });
    expect(res.status).toBe(400);
  });

  it("drops is_demo sent by a client", async () => {
    const { owner } = await seedTwoTenantContexts();
    const res = await owner.request
      .post("/api/projectRisks")
      .send(riskPayload(owner.userId, { is_demo: true }));
    expect(res.status).toBe(201);
    expect(res.body.data.is_demo).toBe(false);
  });

  it("denies risk history snapshots to an Auditor", async () => {
    const { owner } = await seedTwoTenantContexts();
    const auditorId = await createTestUser(
      owner.orgId,
      4,
      `auditor-${Date.now()}@test.com`,
      "Password123!",
    );
    const auditorApp = await createTestApp({
      bypassAuth: true,
      mockUser: { userId: auditorId, organizationId: owner.orgId, role: "Auditor" },
    });

    const res = await testRequest(auditorApp)
      .post("/api/riskHistory/snapshot")
      .send({ parameter: "severity" });
    expect(res.status).toBe(403);
  });
});

describe("Policy references stay inside the organization", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("rejects a foreign owner or reviewer and ignores is_demo on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const foreignOwner = await owner.request
      .post("/api/policies")
      .send(policyPayload({ policy_owner_id: attacker.userId }));
    expect(foreignOwner.status).toBe(400);

    const foreignReviewer = await owner.request
      .post("/api/policies")
      .send(policyPayload({ assigned_reviewer_ids: [attacker.userId] }));
    expect(foreignReviewer.status).toBe(400);

    const demo = await owner.request.post("/api/policies").send(policyPayload({ is_demo: true }));
    expect(demo.status).toBe(201);
    const stored = await sequelize.query<{ is_demo: boolean }>(
      `SELECT is_demo FROM policy_manager WHERE id = :id`,
      { replacements: { id: demo.body.data.id }, type: QueryTypes.SELECT },
    );
    expect(stored[0].is_demo).toBe(false);
  });

  it("rejects foreign reviewers on update, review request and bulk assign", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const policyId = await createPolicy(owner);

    const update = await owner.request
      .put(`/api/policies/${policyId}`)
      .send({ assigned_reviewer_ids: [attacker.userId] });
    expect(update.status).toBe(400);

    const review = await owner.request
      .post(`/api/policies/${policyId}/review/request`)
      .send({ reviewer_ids: [attacker.userId] });
    expect(review.status).toBe(400);

    const bulk = await owner.request
      .patch("/api/policies/bulk")
      .send({ ids: [policyId], action: "set_reviewer", reviewerId: attacker.userId });
    expect(bulk.status).toBe(400);

    const notifications = await sequelize.query(
      `SELECT 1 FROM notifications WHERE user_id = :userId`,
      { replacements: { userId: attacker.userId }, type: QueryTypes.SELECT },
    );
    expect(notifications).toHaveLength(0);
  });

  it("checks folder and policy ids on folder assignment", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const policyId = await createPolicy(owner);
    const attackerPolicyId = await createPolicy(attacker);
    const ownFolder = await createFolder(owner, "Own folder");
    const foreignFolder = await createFolder(attacker, "Secret folder name");

    const foreign = await owner.request
      .patch(`/api/policies/${policyId}/folders`)
      .send({ folder_ids: [foreignFolder] });
    expect(foreign.status).toBe(403);

    const foreignPolicy = await owner.request
      .patch(`/api/policies/${attackerPolicyId}/folders`)
      .send({ folder_ids: [ownFolder] });
    expect(foreignPolicy.status).toBe(404);

    const ok = await owner.request
      .patch(`/api/policies/${policyId}/folders`)
      .send({ folder_ids: [ownFolder] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.map((f: { id: number }) => f.id)).toEqual([ownFolder]);
  });

  it("does not return another organization's folder name for a mapping", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const policyId = await createPolicy(owner);
    const foreignFolder = await createFolder(attacker, "Secret folder name");
    // A mapping row written before the check existed.
    await sequelize.query(
      `INSERT INTO policy_folder_mappings (policy_id, folder_id, assigned_by, organization_id, assigned_at)
       VALUES (:policyId, :foreignFolder, :userId, :orgId, NOW())`,
      { replacements: { policyId, foreignFolder, userId: owner.userId, orgId: owner.orgId } },
    );

    const res = await owner.request.get(`/api/policies/${policyId}/folders`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("validates, org-checks and de-duplicates linked objects", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const policyId = await createPolicy(owner);
    const attackerPolicyId = await createPolicy(attacker);
    const ownRisk = await createTestRisk(owner.orgId);
    const foreignRisk = await createTestRisk(attacker.orgId);
    const foreignFile = await createTestFile(attacker.orgId, attacker.userId);

    const base = `/api/policy-linked/${policyId}/linked-objects`;

    expect(
      (await owner.request.post(base).send({ object_type: "control", object_ids: [ownRisk] }))
        .status,
    ).toBe(400);
    expect(
      (await owner.request.post(base).send({ object_type: "risk", object_ids: [foreignRisk] }))
        .status,
    ).toBe(403);
    expect(
      (await owner.request.post(base).send({ object_type: "evidence", object_ids: [foreignFile] }))
        .status,
    ).toBe(403);
    expect(
      (
        await owner.request
          .post(`/api/policy-linked/${attackerPolicyId}/linked-objects`)
          .send({ object_type: "risk", object_ids: [ownRisk] })
      ).status,
    ).toBe(404);

    const first = await owner.request
      .post(base)
      .send({ object_type: "risk", object_ids: [ownRisk] });
    expect(first.status).toBe(201);
    expect(first.body.linked).toBe(1);

    const again = await owner.request
      .post(base)
      .send({ object_type: "risk", object_id: ownRisk, object_ids: [ownRisk] });
    expect(again.status).toBe(200);
    expect(again.body.linked).toBe(0);

    const rows = await sequelize.query(
      `SELECT 1 FROM policy_linked_objects WHERE policy_id = :policyId AND object_id = :ownRisk`,
      { replacements: { policyId, ownRisk }, type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(1);
  });
});
