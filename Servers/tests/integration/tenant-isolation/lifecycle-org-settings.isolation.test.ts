jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  getLifecycleOrgSettings,
  upsertLifecycleOrgSettings,
} from "../../../utils/lifecycle.utils";

/**
 * lifecycle_org_settings — the org-wide "still live?" interval (#5187).
 *   (a) a missing row resolves to the default (90 days), never another org's row;
 *   (b) a write through the API or the utils only touches the caller's org.
 */
describe("lifecycle_org_settings tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("defaults to 90 days and scopes upserts per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    expect((await getLifecycleOrgSettings(owner.orgId)).confirmation_interval_days).toBe(90);
    expect((await getLifecycleOrgSettings(attacker.orgId)).confirmation_interval_days).toBe(90);

    await upsertLifecycleOrgSettings(owner.orgId, 30);
    expect((await getLifecycleOrgSettings(owner.orgId)).confirmation_interval_days).toBe(30);
    expect((await getLifecycleOrgSettings(attacker.orgId)).confirmation_interval_days).toBe(90);
  });

  it("an admin's PATCH changes only their own org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    await upsertLifecycleOrgSettings(attacker.orgId, 180);
    const res = await owner.request
      .patch("/api/v1/lifecycle-settings")
      .send({ confirmation_interval_days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.data.organization_id).toBe(owner.orgId);

    const ownerRead = await owner.request.get("/api/v1/lifecycle-settings");
    expect(ownerRead.body.data.confirmation_interval_days).toBe(30);
    const attackerRead = await attacker.request.get("/api/v1/lifecycle-settings");
    expect(attackerRead.body.data.confirmation_interval_days).toBe(180);
    expect(attackerRead.body.data.organization_id).toBe(attacker.orgId);
  });
});
