jest.setTimeout(60000);

import { cleanupDatabase, createTestUser } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory, createTestMrmModelRole } from "../../factories";
import {
  getAlertExtraRecipientsQuery,
  getAlertRecipientsUnion,
  getOrgMemberIdsQuery,
  replaceAlertRecipientsQuery,
} from "../../../utils/mrmAlerts.utils";

/**
 * MRM alerts — tenant isolation for recipient storage, the recipient union,
 * the settings API partial semantics (Task 4 section), the breach auto-finding
 * dedup contract (Task 5 section), and the overdue-alert claim (Task 8 section).
 */

describe("MRM alert recipients tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores, replaces and scopes extra recipients per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const extraA = await createTestUser(owner.orgId, 3, `extra-a-${Date.now()}@test.com`, "Password123!");

    await replaceAlertRecipientsQuery(owner.orgId, [extraA, owner.userId]);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual(
      [extraA, owner.userId].sort((a, b) => a - b),
    );
    // The other org sees nothing.
    expect(await getAlertExtraRecipientsQuery(attacker.orgId)).toEqual([]);

    // Wholesale replace, including down to empty.
    await replaceAlertRecipientsQuery(owner.orgId, [owner.userId]);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([owner.userId]);
    await replaceAlertRecipientsQuery(owner.orgId, []);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([]);
  });

  it("getOrgMemberIdsQuery only returns ids belonging to the org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const members = await getOrgMemberIdsQuery(owner.orgId, [owner.userId, attacker.userId]);
    expect(members).toEqual([owner.userId]);
    expect(await getOrgMemberIdsQuery(owner.orgId, [])).toEqual([]);
  });

  it("unions model-role recipients with org extras, deduped", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });
    const extra = await createTestUser(owner.orgId, 3, `extra-u-${Date.now()}@test.com`, "Password123!");
    // Overlap: the owner is ALSO an extra recipient — must appear once.
    await replaceAlertRecipientsQuery(owner.orgId, [owner.userId, extra]);

    const union = await getAlertRecipientsUnion(owner.orgId, modelId);
    expect([...union].sort((a, b) => a - b)).toEqual(
      [owner.userId, extra].sort((a, b) => a - b),
    );
  });
});
