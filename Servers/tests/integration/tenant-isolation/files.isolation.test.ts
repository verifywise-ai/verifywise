jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestFile, createTestProject } from "../../factories";

describe("Files tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only files in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const fileId = await createTestFile(owner.orgId, owner.userId, { project_id: projectId });
    // The list endpoint filters out rows whose source ILIKE '%report%'.
    // NULL source is excluded by the NOT ILIKE clause, so set a real source.
    await sequelize.query(`UPDATE files SET source = :source WHERE id = :id`, {
      replacements: { id: fileId, source: "evidence" },
    });

    const ownerList = await owner.request.get("/api/files");
    expect(ownerList.status).toBe(200);
    const ownerItems = Array.isArray(ownerList.body)
      ? ownerList.body
      : (ownerList.body?.data ?? []);
    expect(ownerItems.length).toBeGreaterThan(0);

    const attackerList = await attacker.request.get("/api/files");
    expect(attackerList.status).toBe(200);
    const attackerItems = Array.isArray(attackerList.body)
      ? attackerList.body
      : (attackerList.body?.data ?? []);
    expect(attackerItems.length).toBe(0);
  });

  it("denies cross-tenant file download", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const fileId = await createTestFile(owner.orgId, owner.userId, { project_id: projectId });

    const res = await attacker.request.get(`/api/files/${fileId}`);
    // Admins are allowed through canUserAccessFile, but the file row is then
    // fetched scoped to the caller's organization_id, so a cross-org request
    // resolves to 404 rather than 403.
    expect([403, 404]).toContain(res.status);
  });

  // Create-stamping for files is not tested here because the POST /api/files
  // endpoint requires a multipart upload tied to an assessment answer. The
  // attach endpoint (/api/files/attach) links an existing file to an entity and
  // does not itself create a new file row. Tenant isolation for file rows is
  // covered by the list and download tests above.
});
