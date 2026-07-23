jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedFrameworks } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestProject } from "../../factories";

describe("EU AI Act controls tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes controls to the caller's project framework", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await seedFrameworks();

    const projectId = await createTestProject(owner.orgId, owner.userId);

    // Attach EU AI Act (framework_id = 1) to the owner's project.
    const addRes = await owner.request
      .post("/api/frameworks/toProject")
      .query({ projectId, frameworkId: 1 });
    expect(addRes.status).toBe(200);

    const [pfRow] = (await sequelize.query(
      `SELECT id FROM projects_frameworks WHERE project_id = :projectId AND framework_id = 1`,
      { replacements: { projectId }, type: QueryTypes.SELECT },
    )) as any[];
    const projectFrameworkId = pfRow?.id;
    expect(projectFrameworkId).toBeDefined();

    // Owner should be able to query controls for their project framework.
    const ownerRes = await owner.request
      .get("/api/eu-ai-act/controls/byControlCategoryId/1")
      .query({ projectFrameworkId });
    expect(ownerRes.status).toBe(200);

    // Attacker using the same projectFrameworkId should receive no controls
    // because the underlying query filters by the caller's organization_id.
    const attackerRes = await attacker.request
      .get("/api/eu-ai-act/controls/byControlCategoryId/1")
      .query({ projectFrameworkId });
    expect(attackerRes.status).toBe(200);
    const attackerControls = Array.isArray(attackerRes.body)
      ? attackerRes.body
      : (attackerRes.body?.data ?? []);
    expect(attackerControls.length).toBe(0);
  });
});
