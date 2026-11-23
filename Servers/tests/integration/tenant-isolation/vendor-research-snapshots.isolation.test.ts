jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { createTestVendor } from "../../factories";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { TenantContext } from "./tenantIsolation.harness";
import type { SnapshotWrite } from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  createRunQuery,
  getSnapshotsQuery,
  saveSnapshotsQuery,
} from "../../../utils/vendorResearch.utils";

const countSnapshots = async (orgId: number): Promise<number> =>
  (
    (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM vendor_research_snapshots WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as Array<{ count: number }>
  )[0].count;

const PAGE: SnapshotWrite = {
  pageKey: "acme.com/legal/dpa",
  url: "https://acme.com/legal/dpa",
  kind: "dpa",
  title: "Data processing addendum",
  hash: "a".repeat(64),
  body: "We process customer content only on instructions.",
};

/** A vendor of the context, with a run to point at. */
async function vendorWithRun(context: TenantContext) {
  const vendorId = await createTestVendor(context.orgId, { vendor_name: "Acme" });
  const run = await createRunQuery({
    organizationId: context.orgId,
    vendorId,
    triggerType: "manual",
    requestedBy: context.userId,
  });
  return { vendorId, runId: run.id };
}

/**
 * vendor_research_snapshots — the text of the pages where a vendor states its terms is kept, read
 * and compared for the organization of the vendor only.
 */
describe("vendor_research_snapshots tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("reads the pages of the owning organization only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await vendorWithRun(owner);
    await saveSnapshotsQuery({
      organizationId: owner.orgId,
      vendorId,
      runId,
      writes: [PAGE],
    });

    // Positive control first, so a broken query cannot pass as "isolated".
    const own = await getSnapshotsQuery(owner.orgId, vendorId, [PAGE.pageKey]);
    expect(own.get(PAGE.pageKey)?.body).toBe(PAGE.body);

    // The other organization asks for the owner's vendor, and for a vendor of its own.
    expect((await getSnapshotsQuery(attacker.orgId, vendorId, [PAGE.pageKey])).size).toBe(0);
    const ownVendor = await vendorWithRun(attacker);
    expect((await getSnapshotsQuery(attacker.orgId, ownVendor.vendorId, [PAGE.pageKey])).size).toBe(
      0,
    );
  });

  it("writes nothing for a vendor of another organization, and nothing under another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await vendorWithRun(owner);

    await saveSnapshotsQuery({
      organizationId: attacker.orgId,
      vendorId,
      runId,
      writes: [{ ...PAGE, body: "planted" }],
    });

    expect(await countSnapshots(owner.orgId)).toBe(0);
    expect(await countSnapshots(attacker.orgId)).toBe(0);
    // The vendor is still the owner's to keep pages for.
    await saveSnapshotsQuery({ organizationId: owner.orgId, vendorId, runId, writes: [PAGE] });
    expect(await countSnapshots(owner.orgId)).toBe(1);
  });

  it("keeps the same page apart for two organizations that research the same vendor name", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const ownerVendor = await vendorWithRun(owner);
    const attackerVendor = await vendorWithRun(attacker);

    await saveSnapshotsQuery({
      organizationId: owner.orgId,
      ...ownerVendor,
      writes: [{ ...PAGE, body: "the owner's copy" }],
    });
    expect(
      (await getSnapshotsQuery(attacker.orgId, attackerVendor.vendorId, [PAGE.pageKey])).size,
    ).toBe(0);
    await saveSnapshotsQuery({
      organizationId: attacker.orgId,
      ...attackerVendor,
      writes: [{ ...PAGE, body: "the attacker's copy" }],
    });

    expect(
      (await getSnapshotsQuery(owner.orgId, ownerVendor.vendorId, [PAGE.pageKey])).get(PAGE.pageKey)
        ?.body,
    ).toBe("the owner's copy");
    expect(
      (await getSnapshotsQuery(attacker.orgId, attackerVendor.vendorId, [PAGE.pageKey])).get(
        PAGE.pageKey,
      )?.body,
    ).toBe("the attacker's copy");
  });
});
