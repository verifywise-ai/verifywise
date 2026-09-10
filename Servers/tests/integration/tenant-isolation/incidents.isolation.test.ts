jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import {
  seedTwoTenantContexts,
  assertListOnlyOwnOrg,
  assertCreateStampsCallerOrg,
} from "./tenantIsolation.harness";
import { createTestIncident, createTestModelInventory } from "../../factories";

const ROUTES = {
  list: "/api/ai-incident-managements",
  get: (id: number) => `/api/ai-incident-managements/${id}`,
  create: "/api/ai-incident-managements",
  update: (id: number) => `/api/ai-incident-managements/${id}`,
  delete: (id: number) => `/api/ai-incident-managements/${id}`,
};

const buildCreatePayload = (foreignOrgId: number) => ({
  ai_project: "Cross-tenant incident",
  type: "Malfunction",
  severity: "Minor",
  status: "Open",
  occurred_date: "2026-09-01",
  date_detected: "2026-09-01",
  reporter: "Test Reporter",
  approval_status: "Pending",
  categories_of_harm: ["Other"],
  description: "Isolation test incident",
  relationship_causality: "Test causality",
  organization_id: foreignOrgId,
});

describe("AI incidents tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only incidents in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertListOnlyOwnOrg(
      owner,
      attacker,
      ROUTES.list,
      (ctx) => createTestIncident(ctx.orgId, ctx.userId),
      (res) => res.body?.data ?? [],
    );
  });

  it("applies organization-scoped filters by model and owner (issue #4583)", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerModelId = await createTestModelInventory(owner.orgId);
    await createTestIncident(owner.orgId, owner.userId, { model_inventory_id: ownerModelId });

    // Attacker filtering by their own (different) model id must see nothing
    const attackerModelId = await createTestModelInventory(attacker.orgId);
    const res = await attacker.request.get(`${ROUTES.list}?model_inventory_id=${attackerModelId}`);
    expect(res.status).toBe(200);
    expect(res.body?.data ?? []).toHaveLength(0);

    // Owner filtering by their own model id sees their incident
    const ownerRes = await owner.request.get(`${ROUTES.list}?model_inventory_id=${ownerModelId}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body?.data ?? []).toHaveLength(1);
  });

  it("denies cross-tenant read, update, and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const incidentId = await createTestIncident(owner.orgId, owner.userId);

    const getRes = await attacker.request.get(ROUTES.get(incidentId));
    expect([204, 404]).toContain(getRes.status);

    const patchRes = await attacker.request
      .patch(ROUTES.update(incidentId))
      .send({ description: "Hacked" });
    expect([204, 404, 403]).toContain(patchRes.status);

    const deleteRes = await attacker.request.delete(ROUTES.delete(incidentId));
    expect([404, 403]).toContain(deleteRes.status);
  });

  it("rejects FK references to another tenant's model inventory (issue #4583)", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const foreignModelId = await createTestModelInventory(attacker.orgId);

    const res = await owner.request
      .post(ROUTES.create)
      .send({ ...buildCreatePayload(attacker.orgId), model_inventory_id: foreignModelId });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("INVALID_REFERENCE");
  });

  it("stamps the caller's organization_id on create and ignores a foreign one in the body", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertCreateStampsCallerOrg(
      owner,
      attacker.orgId,
      { create: ROUTES.create },
      buildCreatePayload,
      "ai_incident_managements",
    );
  });
});
