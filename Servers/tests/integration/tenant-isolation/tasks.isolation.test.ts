jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import {
  seedTwoTenantContexts,
  assertCrossTenantDenial,
  assertListOnlyOwnOrg,
  assertCreateStampsCallerOrg,
} from "./tenantIsolation.harness";
import { createTestTask } from "../../factories";

const ROUTES = {
  list: "/api/tasks",
  get: (id: number) => `/api/tasks/${id}`,
  create: "/api/tasks",
  update: (id: number) => `/api/tasks/${id}`,
  delete: (id: number) => `/api/tasks/${id}`,
};

const buildCreatePayload = () => ({
  title: "Cross-tenant task",
  description: "Should be stamped with caller org",
});

describe("Tasks tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists only tasks in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertListOnlyOwnOrg(
      owner,
      attacker,
      ROUTES.list,
      async (ctx) => createTestTask(ctx.orgId, { creator_id: ctx.userId }),
      (res) => res.body?.data?.tasks ?? [],
    );
  });

  it("denies cross-tenant read, update, and delete", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertCrossTenantDenial({
      owner,
      attacker,
      seedResource: async (ctx) => createTestTask(ctx.orgId, { creator_id: ctx.userId }),
      routes: ROUTES,
      updatePayload: { title: "Hacked" },
      createPayload: buildCreatePayload(),
      dbTable: "tasks",
    });
  });

  it("stamps the caller's organization_id on create", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await assertCreateStampsCallerOrg(
      owner,
      attacker.orgId,
      { create: ROUTES.create },
      buildCreatePayload,
      "tasks",
      (res) => res.body?.data?.id,
    );
  });
});
