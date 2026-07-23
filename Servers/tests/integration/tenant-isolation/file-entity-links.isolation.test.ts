jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestFile, createTestFileEntityLink, createTestProject } from "../../factories";

const FRAMEWORK = "eu-ai-act";
const ENTITY_TYPE = "control";

describe("File entity links tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only file-entity links in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const fileId = await createTestFile(owner.orgId, owner.userId, { project_id: projectId });
    const entityId = 999001;
    await createTestFileEntityLink(owner.orgId, {
      file_id: fileId,
      framework_type: FRAMEWORK,
      entity_type: ENTITY_TYPE,
      entity_id: entityId,
      project_id: projectId,
    });

    const ownerList = await owner.request.get(
      `/api/files/entity/${FRAMEWORK}/${ENTITY_TYPE}/${entityId}`,
    );
    expect([200, 204]).toContain(ownerList.status);
    const ownerItems = ownerList.body?.data?.files ?? ownerList.body?.files ?? [];
    expect(ownerItems.length).toBeGreaterThan(0);

    const attackerList = await attacker.request.get(
      `/api/files/entity/${FRAMEWORK}/${ENTITY_TYPE}/${entityId}`,
    );
    expect([200, 204]).toContain(attackerList.status);
    const attackerItems = attackerList.body?.data?.files ?? attackerList.body?.files ?? [];
    expect(attackerItems.length).toBe(0);
  });

  it("denies cross-tenant detach", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const fileId = await createTestFile(owner.orgId, owner.userId, { project_id: projectId });
    const entityId = 999002;
    await createTestFileEntityLink(owner.orgId, {
      file_id: fileId,
      framework_type: FRAMEWORK,
      entity_type: ENTITY_TYPE,
      entity_id: entityId,
      project_id: projectId,
    });

    const detachRes = await attacker.request.delete("/api/files/detach").send({
      file_id: fileId,
      framework_type: FRAMEWORK,
      entity_type: ENTITY_TYPE,
      entity_id: entityId,
    });
    expect([404, 403]).toContain(detachRes.status);
  });

  it("stamps the caller's organization_id on attach", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const fileId = await createTestFile(owner.orgId, owner.userId, { project_id: projectId });
    const entityId = 999003;

    const res = await owner.request.post("/api/files/attach").send({
      file_id: fileId,
      framework_type: FRAMEWORK,
      entity_type: ENTITY_TYPE,
      entity_id: entityId,
      project_id: projectId,
      organization_id: attacker.orgId,
    });
    expect([200, 201]).toContain(res.status);

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM file_entity_links WHERE file_id = :fileId AND entity_id = :entityId`,
      { replacements: { fileId, entityId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });
});
