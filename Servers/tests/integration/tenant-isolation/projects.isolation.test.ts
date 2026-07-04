jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import {
  seedTwoTenantContexts,
  assertCrossTenantDenial,
  assertListOnlyOwnOrg,
  assertCreateStampsCallerOrg,
} from "./tenantIsolation.harness";
import { createTestProject } from "../../factories";

const ROUTES = {
  list: "/api/projects",
  get: (id: number) => `/api/projects/${id}`,
  create: "/api/projects",
  update: (id: number) => `/api/projects/${id}`,
  delete: (id: number) => `/api/projects/${id}`,
};

const buildCreatePayload = (foreignOrgId: number) => ({
  project_title: "Cross-tenant project",
  owner: 1,
  start_date: "2024-06-01",
  geography: 1,
  framework: [],
  members: [],
  organization_id: foreignOrgId,
});

describe("Projects tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only projects in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertListOnlyOwnOrg(
      owner,
      attacker,
      ROUTES.list,
      async (ctx) => createTestProject(ctx.orgId, ctx.userId),
      (res) => res.body?.data ?? [],
    );
  });

  it("denies cross-tenant read, update, and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertCrossTenantDenial({
      owner,
      attacker,
      seedResource: async (ctx) => createTestProject(ctx.orgId, ctx.userId),
      routes: ROUTES,
      updatePayload: { project_title: "Hacked" },
      createPayload: buildCreatePayload(attacker.orgId),
      dbTable: "projects",
    });
  });

  it("stamps the caller's organization_id on create and ignores a foreign one in the body", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertCreateStampsCallerOrg(
      owner,
      attacker.orgId,
      { create: ROUTES.create },
      buildCreatePayload,
      "projects",
      (res) => res.body?.data?.project?.id,
    );
  });
});
