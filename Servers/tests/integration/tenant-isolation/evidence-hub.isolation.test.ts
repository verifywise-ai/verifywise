jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestEvidenceHub } from "../../factories";

const ROUTES = {
  list: "/api/evidenceHub",
  get: (id: number) => `/api/evidenceHub/${id}`,
  update: (id: number) => `/api/evidenceHub/${id}`,
  delete: (id: number) => `/api/evidenceHub/${id}`,
};

describe("Evidence hub tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only evidence in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await createTestEvidenceHub(owner.orgId);

    const ownerList = await owner.request.get(ROUTES.list);
    expect(ownerList.status).toBe(200);
    const ownerItems = Array.isArray(ownerList.body)
      ? ownerList.body
      : (ownerList.body?.data ?? []);
    expect(ownerItems.length).toBeGreaterThan(0);

    const attackerList = await attacker.request.get(ROUTES.list);
    expect(attackerList.status).toBe(200);
    const attackerItems = Array.isArray(attackerList.body)
      ? attackerList.body
      : (attackerList.body?.data ?? []);
    expect(attackerItems.length).toBe(0);
  });

  it("denies cross-tenant read, update, and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const evidenceId = await createTestEvidenceHub(owner.orgId);

    const getRes = await attacker.request.get(ROUTES.get(evidenceId));
    expect([204, 404]).toContain(getRes.status);

    const updateRes = await attacker.request
      .patch(ROUTES.update(evidenceId))
      .send({ evidence_name: "Cross-tenant evidence" });
    expect([404, 403]).toContain(updateRes.status);

    const deleteRes = await attacker.request.delete(ROUTES.delete(evidenceId));
    expect([404, 403]).toContain(deleteRes.status);
  });

  it("stamps the caller's organization_id on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const res = await owner.request.post(ROUTES.list).send({
      evidence_name: "Owner evidence",
      evidence_type: "document",
      organization_id: attacker.orgId,
    });
    expect(res.status).toBe(201);

    const evidenceId = res.body?.data?.id ?? res.body?.id;
    expect(evidenceId).toBeDefined();

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM evidence_hub WHERE id = :id`,
      { replacements: { id: evidenceId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });
});
