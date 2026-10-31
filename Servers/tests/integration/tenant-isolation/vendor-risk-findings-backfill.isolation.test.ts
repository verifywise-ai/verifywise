jest.setTimeout(60000);

/**
 * The backfill of the credibility label (Ruling 7 of the M3 plan) walks the organizations one at a
 * time: every read or write of a tenant table filters on `organization_id`, and only the list of
 * the organizations does not. A finding of another organization is never written or undone.
 */
import fs from "node:fs";
import path from "node:path";
import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { createTestVendor } from "../../factories";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { NewFinding } from "../../../domain.layer/interfaces/i.vendorResearch";
import { createRunQuery, insertFindingsQuery } from "../../../utils/vendorResearch.utils";
import {
  findFindingsToBackfillQuery,
  getRunForBackfillQuery,
  getVendorForBackfillQuery,
  undoBackfillQuery,
  writeBackfillQuery,
} from "../../../utils/vendorResearchBackfill.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const BASIS = {
  rule: "backfill_unverified" as const,
  registry_version: "sr-4",
  name_only: false,
  sources: [],
};

const FINDING: NewFinding = {
  category: "security_incidents",
  risk_description: "Acme Analytics had a breach.",
  impact_description: "Our data may be exposed.",
  action_plan: "Ask the vendor.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  rationale: null,
  sources: [{ url: "https://news.example/acme", title: "", quote: "q", published_at: null }],
};

/** A vendor of the organization, a run, and one finding of the run without a label. */
async function seedFinding(organizationId: number) {
  const vendorId = await createTestVendor(organizationId, { vendor_name: "Acme Analytics" });
  const run = await createRunQuery({
    organizationId,
    vendorId,
    triggerType: "auto",
    requestedBy: null,
  });
  const [inserted] = await sequelize.transaction((transaction) =>
    insertFindingsQuery(
      { organizationId, vendorId, runId: run.id, findings: [FINDING] },
      transaction,
    ),
  );
  return { vendorId, runId: run.id, id: inserted.id };
}

const basisOf = async (id: number) =>
  (
    (await sequelize.query(`SELECT credibility_basis FROM vendor_risk_findings WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    })) as Array<{ credibility_basis: unknown }>
  )[0].credibility_basis;

describe("the backfill across organizations", () => {
  it("a finding of another organization is never written", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerFinding = await seedFinding(owner.orgId);
    const attackerFinding = await seedFinding(attacker.orgId);

    // Organization A's finding, asked for under organization B, is neither read nor written.
    expect((await findFindingsToBackfillQuery(attacker.orgId, 0, 10)).map((row) => row.id)).toEqual(
      [attackerFinding.id],
    );
    expect(await getRunForBackfillQuery(attacker.orgId, ownerFinding.runId)).toBeNull();
    expect(await getVendorForBackfillQuery(attacker.orgId, ownerFinding.vendorId)).toBeNull();
    await expect(
      writeBackfillQuery({
        organizationId: attacker.orgId,
        id: ownerFinding.id,
        status: "pending",
        credibility: "low",
        basis: BASIS,
      }),
    ).resolves.toBe(false);
    expect(await basisOf(ownerFinding.id)).toBeNull();

    // The undo of organization A leaves the label the backfill gave organization B.
    await writeBackfillQuery({
      organizationId: attacker.orgId,
      id: attackerFinding.id,
      status: "pending",
      credibility: "low",
      basis: BASIS,
    });
    await expect(undoBackfillQuery(owner.orgId)).resolves.toEqual({ cleared: 0, kept: 0 });
    expect(await basisOf(attackerFinding.id)).toEqual(BASIS);
  });

  it("every query of the backfill filters on organization_id, but the list of organizations", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../utils/vendorResearchBackfill.utils.ts"),
      "utf8",
    );
    const statements = (source.match(/`[^`]*`/g) ?? []).filter((statement) =>
      /\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(statement),
    );
    const organizations = statements.filter((statement) =>
      /\bFROM organizations\b/.test(statement),
    );
    const scoped = statements.filter((statement) => !organizations.includes(statement));

    // The one statement without the filter reads the ids of the organizations, nothing of theirs.
    expect(organizations).toEqual(["`SELECT id FROM organizations ORDER BY id`"]);
    expect(scoped.length).toBeGreaterThanOrEqual(5);
    for (const statement of scoped) {
      expect(statement).toMatch(/\borganization_id = :organizationId\b/);
    }
  });
});
