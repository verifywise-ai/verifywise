jest.setTimeout(60000);

import fs from "node:fs";
import path from "node:path";
import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { createTestVendor } from "../../factories";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { VendorResearchConfig } from "../../../services/vendorResearch/config";
import { sharedVrdbLookup } from "../../../services/vendorResearch/vrdb/lookup";
import { vrdbSourceOf } from "../../../services/vendorResearch/vrdb/sources";
import {
  applyVrdbSnapshotQuery,
  findVrdbRecordsByKeysQuery,
  recordVendorVrdbMatchesQuery,
  upsertVrdbSourceQuery,
} from "../../../utils/vrdb.utils";

const NOW = new Date("2026-10-30T12:00:00Z");

const CONFIG: VendorResearchConfig = {
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
  vrdb: true,
};

const TARGET = { name: "Acme Analytics", domain: "acme-analytics.example", provides: "" };

/** One record of the shared copy of the OFAC list that matches Acme Analytics by name. */
async function seedRecord(): Promise<number> {
  await upsertVrdbSourceQuery(vrdbSourceOf("ofac"), NOW);
  await applyVrdbSnapshotQuery({
    sourceId: "ofac",
    records: [
      {
        sourceRecordId: "1001",
        recordType: "sanctions_entity",
        title: "ACME ANALYTICS LLC",
        summary: "OFAC Specially Designated Nationals and Blocked Persons List (treasury.gov).",
        url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=1001",
        identifiers: { programs: ["CYBER2"] },
        matchKeys: ["name:acmeanalytics"],
        publishedAt: null,
        sourceUpdatedAt: null,
      },
    ],
    missingStatus: "delisted",
    rawSnapshotHash: "a".repeat(64),
    sourceVersion: null,
    etag: null,
    lastModified: null,
    at: NOW,
  });
  const [record] = await findVrdbRecordsByKeysQuery(["name:acmeanalytics"], ["ofac"]);
  return record.id;
}

const countMatches = async (orgId: number): Promise<number> =>
  (
    (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM vendor_vrdb_matches WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as Array<{ count: number }>
  )[0].count;

const vendorsOfMatches = async (orgId: number): Promise<number[]> =>
  (
    (await sequelize.query(
      `SELECT vendor_id FROM vendor_vrdb_matches WHERE organization_id = :orgId ORDER BY vendor_id`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as Array<{ vendor_id: number }>
  ).map((row) => row.vendor_id);

/**
 * vendor_vrdb_matches — the records of the shared vendor risk database a vendor matched are kept
 * for the vendor's organization only. The records themselves are public and shared; the fact that
 * an organization researched a vendor is not.
 */
describe("vendor_vrdb_matches tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("organisation B's vendor never gets a row of organisation A", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const recordId = await seedRecord();
    const ownerVendor = await createTestVendor(owner.orgId, { vendor_name: "Acme Analytics" });
    const attackerVendor = await createTestVendor(attacker.orgId, {
      vendor_name: "Acme Analytics",
    });
    const match = {
      recordId,
      method: "name_exact",
      strength: "weak",
      matchedKey: "name:acmeanalytics",
    } as const;

    // Positive control first, so a broken query cannot pass as "isolated".
    await recordVendorVrdbMatchesQuery(owner.orgId, ownerVendor, [match], NOW);
    expect(await vendorsOfMatches(owner.orgId)).toEqual([ownerVendor]);

    // The attacker's organization with the owner's vendor, and the owner's with the attacker's.
    await recordVendorVrdbMatchesQuery(attacker.orgId, ownerVendor, [match], NOW);
    await recordVendorVrdbMatchesQuery(owner.orgId, attackerVendor, [match], NOW);
    expect(await vendorsOfMatches(owner.orgId)).toEqual([ownerVendor]);
    expect(await countMatches(attacker.orgId)).toBe(0);

    // A lookup through the attacker's organization for the owner's vendor writes nothing either.
    const lookup = sharedVrdbLookup(
      { organizationId: attacker.orgId, vendorId: ownerVendor },
      CONFIG,
    );
    await lookup?.({ target: TARGET, researchable: ["legal_regulatory"], now: NOW });
    expect(await countMatches(attacker.orgId)).toBe(0);

    // The same vendor name in the attacker's own organization gets a row of its own.
    const ownLookup = sharedVrdbLookup(
      { organizationId: attacker.orgId, vendorId: attackerVendor },
      CONFIG,
    );
    await ownLookup?.({ target: TARGET, researchable: ["legal_regulatory"], now: NOW });
    expect(await vendorsOfMatches(attacker.orgId)).toEqual([attackerVendor]);
    expect(await vendorsOfMatches(owner.orgId)).toEqual([ownerVendor]);
  });

  it("deleting a vendor removes its rows", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const recordId = await seedRecord();
    const ownerVendor = await createTestVendor(owner.orgId, { vendor_name: "Acme Analytics" });
    const attackerVendor = await createTestVendor(attacker.orgId, {
      vendor_name: "Acme Analytics",
    });
    const match = {
      recordId,
      method: "name_exact",
      strength: "weak",
      matchedKey: "name:acmeanalytics",
    } as const;
    await recordVendorVrdbMatchesQuery(owner.orgId, ownerVendor, [match], NOW);
    await recordVendorVrdbMatchesQuery(attacker.orgId, attackerVendor, [match], NOW);

    await sequelize.query(`DELETE FROM vendors WHERE id = :id`, {
      replacements: { id: ownerVendor },
    });

    expect(await countMatches(owner.orgId)).toBe(0);
    expect(await countMatches(attacker.orgId)).toBe(1);
    // The shared record stays: it is the list's, not the vendor's.
    expect(await findVrdbRecordsByKeysQuery(["name:acmeanalytics"], ["ofac"])).toHaveLength(1);
  });

  it("every query of the table filters on organization_id, the status job's included", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../../utils/vrdb.utils.ts"), "utf8");
    const statements = (source.match(/`[^`]*`/g) ?? []).filter(
      (statement) =>
        statement.includes("vendor_vrdb_matches") &&
        /\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(statement),
    );
    // The status job walks the organizations and reads the findings of one at a time
    // (findFindingsToRelabelQuery), as the backfill does: no statement crosses organizations.
    expect(statements.length).toBeGreaterThan(1);
    for (const statement of statements) {
      expect(statement).toMatch(/\borganization_id = :organizationId\b/);
    }
  });
});
