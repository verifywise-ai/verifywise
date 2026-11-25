jest.setTimeout(60000);

/**
 * The organization's Brave Search key and the search status of the vendor research, against the
 * real test database: each organization reads, saves and removes only its own key, the key never
 * comes back in an answer, and the roles that do not manage the LLM keys are refused. The check of
 * a key with Brave is mocked, so no request leaves the test.
 */

jest.mock("../../services/vendorResearch/braveKeyCheck", () => ({
  ...jest.requireActual("../../services/vendorResearch/braveKeyCheck"),
  checkBraveKey: jest.fn(async () => ({ ok: true })),
}));

import http from "http";
import { cleanupDatabase } from "./helpers";
// The harness loads ./setup, which registers the mocks of BullMQ and Redis: keep it before the
// modules that open a queue.
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestApp, testRequest } from "./setup";
import { getBraveKeyQuery } from "../../utils/vendorResearch.utils";

const SEARCH_KEY = "/api/v1/vendor-research/search-key";
const SEARCH_STATUS = "/api/v1/vendor-research/search-status";
const OWNER_KEY = "BSA-owner-SENTINEL-1111";
const ATTACKER_KEY = "BSA-attacker-SENTINEL-2222";

afterEach(async () => {
  await cleanupDatabase();
});

/** A request agent for another role of the same organization and user. */
async function requestAs(role: string, ctx: TenantContext) {
  const app: http.Server = await createTestApp({
    bypassAuth: true,
    mockUser: { userId: ctx.userId, organizationId: ctx.orgId, role },
  });
  return testRequest(app);
}

describe("the search key of the vendor research", () => {
  it("saves, reads and removes an Admin's key for the organization, and never returns it", async () => {
    const { owner } = await seedTwoTenantContexts(1);

    const before = await owner.request.get(SEARCH_KEY);
    expect(before.status).toBe(200);
    expect(before.body.data).toEqual({ provider: "brave", configured: false, last4: null });

    const saved = await owner.request.put(SEARCH_KEY).send({ key: OWNER_KEY });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ configured: true, last4: "1111" });
    expect(await getBraveKeyQuery(owner.orgId)).toBe(OWNER_KEY);

    const read = await owner.request.get(SEARCH_KEY);
    expect(read.body.data).toEqual({ provider: "brave", configured: true, last4: "1111" });
    const status = await owner.request.get(SEARCH_STATUS);
    expect(status.status).toBe(200);
    expect(status.body.data.braveConfigured).toBe(true);
    for (const res of [saved, read, status]) expect(res.text).not.toContain("SENTINEL");

    const removed = await owner.request.delete(SEARCH_KEY);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ configured: false, last4: null });
    expect(await getBraveKeyQuery(owner.orgId)).toBeNull();
  });

  it("does not let another organization read, replace or remove the key", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    // Positive control: the owner's key is stored and the owner sees it.
    expect((await owner.request.put(SEARCH_KEY).send({ key: OWNER_KEY })).status).toBe(200);
    expect((await owner.request.get(SEARCH_KEY)).body.data.configured).toBe(true);

    // The attacker is an Admin of its own organization, so only the organization can refuse it.
    const read = await attacker.request.get(SEARCH_KEY);
    const status = await attacker.request.get(SEARCH_STATUS);
    expect(read.status).toBe(200);
    expect(read.body.data).toEqual({ provider: "brave", configured: false, last4: null });
    expect(status.status).toBe(200);
    expect(status.body.data.braveConfigured).toBe(false);
    for (const res of [read, status]) {
      expect(res.text).not.toContain("SENTINEL");
      expect(res.text).not.toContain("1111");
    }

    // A remove and a save of the attacker's own key touch its organization only, whatever the
    // request names.
    const removed = await attacker.request
      .delete(`${SEARCH_KEY}?organizationId=${owner.orgId}`)
      .send({ organizationId: owner.orgId });
    expect(removed.status).toBe(200);
    const replaced = await attacker.request
      .put(SEARCH_KEY)
      .send({ key: ATTACKER_KEY, organizationId: owner.orgId });
    expect(replaced.status).toBe(200);

    expect(await getBraveKeyQuery(owner.orgId)).toBe(OWNER_KEY);
    expect(await getBraveKeyQuery(attacker.orgId)).toBe(ATTACKER_KEY);
    expect((await owner.request.get(SEARCH_KEY)).body.data.last4).toBe("1111");
  });

  it("refuses the roles that do not manage the LLM keys, and changes nothing", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    // Positive control: the Admin can use every route, so the 403s below are not missing routes.
    expect((await owner.request.put(SEARCH_KEY).send({ key: OWNER_KEY })).status).toBe(200);
    expect((await owner.request.get(SEARCH_KEY)).status).toBe(200);
    expect((await owner.request.get(SEARCH_STATUS)).status).toBe(200);

    for (const role of ["Editor", "Reviewer", "Auditor"]) {
      const request = await requestAs(role, owner);
      expect((await request.get(SEARCH_KEY)).status).toBe(403);
      expect((await request.get(SEARCH_STATUS)).status).toBe(403);
      expect((await request.put(SEARCH_KEY).send({ key: ATTACKER_KEY })).status).toBe(403);
      expect((await request.delete(SEARCH_KEY)).status).toBe(403);
    }

    expect(await getBraveKeyQuery(owner.orgId)).toBe(OWNER_KEY);
  });
});
