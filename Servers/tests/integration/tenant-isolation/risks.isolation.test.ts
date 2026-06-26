jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts, assertCreateStampsCallerOrg } from "./tenantIsolation.harness";
import { createTestProject, createTestRisk } from "../../factories";

const ROUTES = {
  list: "/api/projectRisks",
  get: (id: number) => `/api/projectRisks/${id}`,
  update: (id: number) => `/api/projectRisks/${id}`,
  delete: (id: number) => `/api/projectRisks/${id}`,
};

describe("Project risks tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only risks in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await createTestProject(owner.orgId, owner.userId);
    await createTestRisk(owner.orgId, { risk_owner: owner.userId });

    const ownerList = await owner.request.get(ROUTES.list);
    expect([200, 204]).toContain(ownerList.status);
    expect((ownerList.body?.data ?? []).length).toBeGreaterThan(0);

    const attackerList = await attacker.request.get(ROUTES.list);
    expect([200, 204]).toContain(attackerList.status);
    expect((attackerList.body?.data ?? []).length).toBe(0);
  });

  it("denies cross-tenant read, update, and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const riskId = await createTestRisk(owner.orgId, { risk_owner: owner.userId });

    // GET returns 204 when the risk is not found for the caller's organization.
    const getRes = await attacker.request.get(ROUTES.get(riskId));
    expect([204, 404]).toContain(getRes.status);

    const putRes = await attacker.request
      .put(ROUTES.update(riskId))
      .send({ risk_name: "Hacked", project_id: projectId });
    expect([404, 403]).toContain(putRes.status);

    const deleteRes = await attacker.request.delete(ROUTES.delete(riskId));
    expect([404, 403]).toContain(deleteRes.status);
  });

  it("stamps the caller's organization_id on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);

    await assertCreateStampsCallerOrg(
      owner,
      attacker.orgId,
      { create: ROUTES.list },
      () => ({
        risk_name: "Owner risk",
        risk_owner: owner.userId,
        project_id: projectId,
      }),
      "risks",
      (res) => res.body?.data?.id ?? res.body?.id,
    );
  });
});
