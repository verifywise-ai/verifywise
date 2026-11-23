jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { createTestVendor } from "../../factories";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { TenantContext } from "./tenantIsolation.harness";
import {
  createRunQuery,
  getKnownSourceKeysQuery,
  listDueVendorsQuery,
  listScanOrganizationsQuery,
  rememberSourcesQuery,
  saveVendorResearchSettingsQuery,
} from "../../../utils/vendorResearch.utils";

const countSources = async (orgId: number): Promise<number> =>
  (
    (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM vendor_research_sources WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as Array<{ count: number }>
  )[0].count;

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

const chooseInterval = (context: TenantContext, scanIntervalDays: number) =>
  sequelize.transaction((transaction) =>
    saveVendorResearchSettingsQuery(
      {
        organizationId: context.orgId,
        userId: context.userId,
        researchKeyId: null,
        analysisKeyId: null,
        scanIntervalDays,
      },
      transaction,
    ),
  );

/**
 * vendor_research_sources — the sources that a vendor's runs showed to the model are remembered,
 * read and used for the organization of the vendor only, and the scan reads the vendors and the
 * interval of one organization at a time.
 */
describe("vendor_research_sources tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("reads the sources of the owning organization only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await vendorWithRun(owner);
    await rememberSourcesQuery({
      organizationId: owner.orgId,
      vendorId,
      runId,
      keys: ["news.example.com/acme-breach"],
    });

    // Positive control first, so a broken query cannot pass as "isolated".
    expect(await getKnownSourceKeysQuery(owner.orgId, vendorId)).toEqual(
      new Set(["news.example.com/acme-breach"]),
    );

    // The other organization asks for the owner's vendor, and for a vendor of its own.
    expect(await getKnownSourceKeysQuery(attacker.orgId, vendorId)).toEqual(new Set());
    const ownVendor = await vendorWithRun(attacker);
    expect(await getKnownSourceKeysQuery(attacker.orgId, ownVendor.vendorId)).toEqual(new Set());
  });

  it("writes nothing for a vendor of another organization, and nothing under another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await vendorWithRun(owner);

    await rememberSourcesQuery({
      organizationId: attacker.orgId,
      vendorId,
      runId,
      keys: ["news.example.com/planted"],
    });

    expect(await countSources(owner.orgId)).toBe(0);
    expect(await countSources(attacker.orgId)).toBe(0);
    // The vendor is still the owner's to remember for.
    await rememberSourcesQuery({
      organizationId: owner.orgId,
      vendorId,
      runId,
      keys: ["news.example.com/acme-breach"],
    });
    expect(await countSources(owner.orgId)).toBe(1);
  });

  it("keeps the same address apart for two organizations that research the same vendor name", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const ownerVendor = await vendorWithRun(owner);
    const attackerVendor = await vendorWithRun(attacker);
    const key = "news.example.com/acme-breach";

    await rememberSourcesQuery({ organizationId: owner.orgId, ...ownerVendor, keys: [key] });
    expect(await getKnownSourceKeysQuery(attacker.orgId, attackerVendor.vendorId)).toEqual(
      new Set(),
    );
    await rememberSourcesQuery({ organizationId: attacker.orgId, ...attackerVendor, keys: [key] });

    expect(await countSources(owner.orgId)).toBe(1);
    expect(await countSources(attacker.orgId)).toBe(1);
  });

  it("lists the vendors that are due for the organization it is asked about only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const ownerVendor = await createTestVendor(owner.orgId, { vendor_name: "Owner vendor" });
    const attackerVendor = await createTestVendor(attacker.orgId, {
      vendor_name: "Attacker vendor",
    });

    expect(
      await listDueVendorsQuery({ organizationId: owner.orgId, intervalDays: 7, limit: 50 }),
    ).toEqual([ownerVendor]);
    expect(
      await listDueVendorsQuery({ organizationId: attacker.orgId, intervalDays: 7, limit: 50 }),
    ).toEqual([attackerVendor]);
  });

  it("lists each organization with its own interval, and not an organization that chose none", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    await chooseInterval(owner, 14);

    expect(await listScanOrganizationsQuery()).toEqual([
      { organizationId: owner.orgId, intervalDays: 14 },
    ]);

    await chooseInterval(attacker, 30);
    const listed = await listScanOrganizationsQuery();
    expect(listed.sort((a, b) => a.organizationId - b.organizationId)).toEqual(
      [
        { organizationId: owner.orgId, intervalDays: 14 },
        { organizationId: attacker.orgId, intervalDays: 30 },
      ].sort((a, b) => a.organizationId - b.organizationId),
    );
  });
});
