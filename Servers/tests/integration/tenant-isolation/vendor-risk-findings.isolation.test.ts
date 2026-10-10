jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { TenantContext } from "./tenantIsolation.harness";
import { createTestVendor, createTestVendorRisk } from "../../factories";
import type { NewFinding } from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  createRunQuery,
  getFindingByIdQuery,
  getFindingsForVendorQuery,
  insertFindingsQuery,
  listFindingsQuery,
  markFindingAcceptedQuery,
  markFindingDismissedQuery,
} from "../../../utils/vendorResearch.utils";

const VENDOR_NAME = "Acme Corp";

const FINDING: NewFinding = {
  category: "security_incidents",
  risk_description: "Customer records were exposed in a 2026 breach.",
  impact_description: "Personal data we share with the vendor may have been accessed.",
  action_plan: "Ask the vendor for the incident report and confirm remediation.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  sources: [
    {
      url: "https://example.com/breach-notice",
      title: "Breach notice",
      quote: "We confirmed unauthorised access to customer records.",
      published_at: "2026-09-01",
    },
  ],
};

const SECOND_FINDING: NewFinding = {
  ...FINDING,
  category: "certifications",
  risk_description: "The vendor's SOC 2 report has lapsed.",
  confidence: "high",
};

/** A vendor in `ctx`'s organization with a run that produced these findings, all pending. */
const seedFindings = async (ctx: TenantContext, findings: NewFinding[]) => {
  const vendorId = await createTestVendor(ctx.orgId, { vendor_name: VENDOR_NAME });
  const run = await createRunQuery({
    organizationId: ctx.orgId,
    vendorId,
    triggerType: "manual",
    requestedBy: ctx.userId,
  });
  // insertFindingsQuery needs a transaction; the managed one commits on return.
  const inserted = await sequelize.transaction((transaction) =>
    insertFindingsQuery(
      { organizationId: ctx.orgId, vendorId, runId: run.id, findings },
      transaction,
    ),
  );
  return { vendorId, inserted };
};

/**
 * vendor_risk_findings — a finding written for org A is never listed, read or
 * decided from org B, even when B names A's finding, vendor and run ids.
 */
describe("vendor_risk_findings tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists and reads findings only for the owning organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const {
      vendorId,
      inserted: [finding],
    } = await seedFindings(owner, [FINDING]);

    // Positive controls first, so a broken query cannot pass as "isolated".
    const ownerList = await listFindingsQuery(owner.orgId, { limit: 50, offset: 0 });
    expect(ownerList.total).toBe(1);
    expect(ownerList.rows).toHaveLength(1);
    expect(ownerList.rows[0]).toMatchObject({
      id: finding.id,
      vendor_name: VENDOR_NAME,
      status: "pending",
    });
    expect(await getFindingByIdQuery(owner.orgId, finding.id)).toMatchObject({
      ...FINDING,
      organization_id: owner.orgId,
      vendor_id: vendorId,
      status: "pending",
      dismissed_reason: null,
      accepted_vendor_risk_id: null,
      decided_by: null,
      decided_at: null,
    });
    expect((await getFindingsForVendorQuery(owner.orgId, vendorId)).map((row) => row.id)).toEqual([
      finding.id,
    ]);

    // The attacker names the owner's vendor, status and finding ids directly.
    const nothing = { rows: [], total: 0 };
    expect(await listFindingsQuery(attacker.orgId, { limit: 50, offset: 0 })).toEqual(nothing);
    expect(
      await listFindingsQuery(attacker.orgId, {
        status: "pending",
        vendorId,
        limit: 50,
        offset: 0,
      }),
    ).toEqual(nothing);
    expect(await getFindingsForVendorQuery(attacker.orgId, vendorId)).toEqual([]);
    expect(await getFindingByIdQuery(attacker.orgId, finding.id)).toBeNull();

    // The locking read the accept flow uses is scoped the same way.
    await sequelize.transaction(async (transaction) => {
      const locking = { transaction, forUpdate: true };
      expect(await getFindingByIdQuery(attacker.orgId, finding.id, locking)).toBeNull();
      expect((await getFindingByIdQuery(owner.orgId, finding.id, locking))?.id).toBe(finding.id);
    });
  });

  it("does not let another organization decide a finding", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const {
      vendorId,
      inserted: [finding, bystander],
    } = await seedFindings(owner, [FINDING, SECOND_FINDING]);
    const vendorRiskId = await createTestVendorRisk(owner.orgId, { vendor_id: vendorId });

    expect(
      await markFindingDismissedQuery({
        organizationId: attacker.orgId,
        id: finding.id,
        reason: "other",
        note: "not ours",
        userId: attacker.userId,
      }),
    ).toBeNull();
    const accepted = await sequelize.transaction((transaction) =>
      markFindingAcceptedQuery(
        { organizationId: attacker.orgId, id: finding.id, vendorRiskId, userId: attacker.userId },
        transaction,
      ),
    );
    expect(accepted).toBeNull();

    // Nothing about the owner's findings changed.
    for (const { id } of [finding, bystander]) {
      expect(await getFindingByIdQuery(owner.orgId, id)).toMatchObject({
        status: "pending",
        dismissed_reason: null,
        dismissed_note: null,
        accepted_vendor_risk_id: null,
        decided_by: null,
        decided_at: null,
      });
    }

    // Positive control: the same accept succeeds for the owner, and only for the
    // finding it names.
    const ownerAccepted = await sequelize.transaction((transaction) =>
      markFindingAcceptedQuery(
        { organizationId: owner.orgId, id: finding.id, vendorRiskId, userId: owner.userId },
        transaction,
      ),
    );
    expect(ownerAccepted).toMatchObject({
      id: finding.id,
      status: "accepted",
      accepted_vendor_risk_id: vendorRiskId,
      decided_by: owner.userId,
    });
    expect(ownerAccepted?.decided_at).toBeInstanceOf(Date);
    expect(await getFindingByIdQuery(owner.orgId, bystander.id)).toMatchObject({
      status: "pending",
      accepted_vendor_risk_id: null,
    });
  });

  it("decides a finding once", async () => {
    const { owner } = await seedTwoTenantContexts();
    const {
      vendorId,
      inserted: [finding, bystander],
    } = await seedFindings(owner, [FINDING, SECOND_FINDING]);
    const dismissal = {
      organizationId: owner.orgId,
      id: finding.id,
      reason: "already_covered" as const,
      note: "Tracked in the register already.",
      userId: owner.userId,
    };

    // Findings come back in the order they were given, and listings put the newest first.
    expect([finding.risk_description, bystander.risk_description]).toEqual([
      FINDING.risk_description,
      SECOND_FINDING.risk_description,
    ]);
    expect((await getFindingsForVendorQuery(owner.orgId, vendorId)).map((row) => row.id)).toEqual([
      bystander.id,
      finding.id,
    ]);

    const first = await markFindingDismissedQuery(dismissal);
    expect(first).toMatchObject({
      id: finding.id,
      status: "dismissed",
      dismissed_reason: "already_covered",
      dismissed_note: "Tracked in the register already.",
      decided_by: owner.userId,
    });
    expect(first?.decided_at).toBeInstanceOf(Date);

    // The second decision finds nothing pending, so the first one stands.
    expect(
      await markFindingDismissedQuery({ ...dismissal, reason: "other", note: null }),
    ).toBeNull();
    const vendorRiskId = await createTestVendorRisk(owner.orgId, { vendor_id: vendorId });
    const accepted = await sequelize.transaction((transaction) =>
      markFindingAcceptedQuery(
        { organizationId: owner.orgId, id: finding.id, vendorRiskId, userId: owner.userId },
        transaction,
      ),
    );
    expect(accepted).toBeNull();
    expect(await getFindingByIdQuery(owner.orgId, finding.id)).toMatchObject({
      status: "dismissed",
      dismissed_reason: "already_covered",
      accepted_vendor_risk_id: null,
    });
    // Deciding one finding leaves the vendor's other finding pending.
    expect(await getFindingByIdQuery(owner.orgId, bystander.id)).toMatchObject({
      status: "pending",
      dismissed_reason: null,
    });
  });
});
