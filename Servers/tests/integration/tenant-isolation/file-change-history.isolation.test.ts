jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestFile, createTestFileChangeHistory, createTestProject } from "../../factories";

describe("File change history tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns only file change history in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const fileId = await createTestFile(owner.orgId, owner.userId, { project_id: projectId });
    await createTestFileChangeHistory(owner.orgId, {
      file_id: fileId,
      changed_by_user_id: owner.userId,
    });

    const ownerRes = await owner.request.get(`/api/file-change-history/${fileId}`);
    expect(ownerRes.status).toBe(200);
    const ownerItems = ownerRes.body?.data?.data ?? ownerRes.body?.data ?? [];
    expect(ownerItems.length).toBeGreaterThan(0);

    const attackerRes = await attacker.request.get(`/api/file-change-history/${fileId}`);
    expect(attackerRes.status).toBe(200);
    const attackerItems = attackerRes.body?.data?.data ?? attackerRes.body?.data ?? [];
    expect(attackerItems.length).toBe(0);
  });
});
