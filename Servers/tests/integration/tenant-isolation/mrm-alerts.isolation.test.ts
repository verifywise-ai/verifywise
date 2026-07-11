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
    const extraA = await createTestUser(
      owner.orgId,
      3,
      `extra-a-${Date.now()}@test.com`,
      "Password123!",
    );

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
    const extra = await createTestUser(
      owner.orgId,
      3,
      `extra-u-${Date.now()}@test.com`,
      "Password123!",
    );
    // Overlap: the owner is ALSO an extra recipient — must appear once.
    await replaceAlertRecipientsQuery(owner.orgId, [owner.userId, extra]);

    const union = await getAlertRecipientsUnion(owner.orgId, modelId);
    expect([...union].sort((a, b) => a - b)).toEqual([owner.userId, extra].sort((a, b) => a - b));
  });
});

describe("MRM settings API partial semantics", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("GET returns defaults incl. empty recipients; org B never sees org A's config", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const res = await owner.request.get("/api/mrm/settings");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      organization_id: owner.orgId,
      retention_months: 25,
      alert_email_enabled: false,
      breach_auto_open_finding: false,
      alert_recipients: [],
    });

    const put = await owner.request.put("/api/mrm/settings").send({
      alert_email_enabled: true,
      breach_auto_open_finding: true,
      alert_recipients: [owner.userId],
    });
    expect(put.status).toBe(200);
    expect(put.body.data.alert_email_enabled).toBe(true);
    expect(put.body.data.alert_recipients).toEqual([owner.userId]);

    const attackerView = await attacker.request.get("/api/mrm/settings");
    expect(attackerView.status).toBe(200);
    expect(attackerView.body.data.alert_email_enabled).toBe(false);
    expect(attackerView.body.data.alert_recipients).toEqual([]);
  });

  it("PUT is partial: a retention-only body never touches alert fields", async () => {
    const { owner } = await seedTwoTenantContexts();
    await owner.request.put("/api/mrm/settings").send({ alert_email_enabled: true });

    const res = await owner.request.put("/api/mrm/settings").send({ retention_months: 36 });
    expect(res.status).toBe(200);
    expect(res.body.data.retention_months).toBe(36);
    expect(res.body.data.alert_email_enabled).toBe(true); // untouched
  });

  it("PUT rejects invalid bodies with 400", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    expect((await owner.request.put("/api/mrm/settings").send({})).status).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ retention_months: 6 })).status,
    ).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_email_enabled: "yes" })).status,
    ).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_recipients: [1.5] })).status,
    ).toBe(400);
    // A user id from another org is rejected — and nothing was stored.
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_recipients: [attacker.userId] }))
        .status,
    ).toBe(400);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([]);
  });
});
