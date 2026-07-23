jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts, buildTenantContext } from "./tenantIsolation.harness";
import { createTestApp, testRequest } from "../setup";
import { createTestProject } from "../../factories";
import type { TenantContext } from "./tenantIsolation.harness";

/**
 * Build a request agent scoped to a specific organization for the given
 * SuperAdmin context. The X-Organization-Id header is set to match the real
 * SuperAdmin auth flow, while the mock auth middleware is rebuilt for that
 * target organization (the test bypass harness does not itself parse headers).
 */
function superAdminScope(superAdmin: TenantContext, orgId: number) {
  const app = createTestApp({
    bypassAuth: true,
    mockUser: {
      userId: superAdmin.userId,
      role: "SuperAdmin",
      organizationId: orgId,
      isSuperAdmin: true,
    },
  });
  return testRequest(app).set("X-Organization-Id", orgId.toString());
}

describe("Super-admin tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("allows SuperAdmin to read cross-organization users and projects", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const superAdmin = await buildTenantContext(5);

    const userRes = await superAdminScope(superAdmin, owner.orgId).get(
      `/api/users/${owner.userId}`,
    );
    expect(userRes.status).toBe(200);

    const projectId = await createTestProject(owner.orgId, owner.userId);
    const projectRes = await superAdminScope(superAdmin, owner.orgId).get(
      `/api/projects/${projectId}`,
    );
    expect(projectRes.status).toBe(200);
  });

  it("denies normal Admin cross-organization reads", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);

    const userRes = await attacker.request.get(`/api/users/${owner.userId}`);
    expect(userRes.status).toBe(403);

    const projectId = await createTestProject(owner.orgId, owner.userId);
    const projectRes = await attacker.request.get(`/api/projects/${projectId}`);
    expect(projectRes.status).toBe(404);
  });
});
