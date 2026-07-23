jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedFrameworks } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestProject, createTestProjectFramework } from "../../factories";

describe("Project-frameworks tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stamps the caller's organization_id when adding a framework to a project", async () => {
    await seedFrameworks();
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);

    const res = await owner.request
      .post("/api/frameworks/toProject")
      .query({ projectId, frameworkId: 1 });
    expect(res.status).toBe(200);

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM projects_frameworks WHERE project_id = :projectId AND framework_id = 1`,
      { replacements: { projectId }, type: QueryTypes.SELECT },
    )) as any[];
    expect(row).toBeDefined();
    expect(row.organization_id).toBe(owner.orgId);
  });

  it("denies cross-tenant add and delete of project-framework links", async () => {
    await seedFrameworks();
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    await createTestProjectFramework(owner.orgId, projectId, 2);

    const addRes = await attacker.request
      .post("/api/frameworks/toProject")
      .query({ projectId, frameworkId: 2 });
    expect([404, 403]).toContain(addRes.status);

    const deleteRes = await attacker.request
      .delete("/api/frameworks/fromProject")
      .query({ projectId, frameworkId: 2 });
    expect([404, 403]).toContain(deleteRes.status);
  });
});
