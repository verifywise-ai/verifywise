jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FINDING: NewFinding = {
  category: "security_incidents",
  risk_description: "Customer records were exposed in a 2026 breach.",
  impact_description: "Personal data we share with the vendor may have been accessed.",
  action_plan: "Ask the vendor for the incident report and confirm remediation.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  rationale: "Because of what the sources say.",
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
const seedFindings = async (
  ctx: TenantContext,
  findings: NewFinding[],
  vendorName: string = VENDOR_NAME,
) => {
  const vendorId = await createTestVendor(ctx.orgId, { vendor_name: vendorName });
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
 * decided from org B, even when B names A's finding, vendor and run ids. The
 * remaining tests pin how the finding queries order, filter and page.
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

  it("reads a finding for update without waiting for a lock that is held, when asked not to wait", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const {
      inserted: [finding],
    } = await seedFindings(owner, [FINDING]);
    const readNoWait = (organizationId: number) =>
      sequelize.transaction((transaction) =>
        getFindingByIdQuery(organizationId, finding.id, {
          transaction,
          forUpdate: true,
          noWait: true,
        }),
      );

    // Positive controls: nobody holds the finding, so the read returns it, to its owner only.
    expect((await readNoWait(owner.orgId))?.id).toBe(finding.id);
    expect(await readNoWait(attacker.orgId)).toBeNull();

    // Another transaction holds the row lock.
    const holder = await sequelize.transaction();
    let attempt: Promise<unknown> | undefined;
    try {
      await sequelize.query("SELECT id FROM vendor_risk_findings WHERE id = :id FOR UPDATE", {
        replacements: { id: finding.id },
        type: QueryTypes.SELECT,
        transaction: holder,
      });

      // The read is refused at once with lock_not_available (55P03). A read that waited for the
      // lock would still be unanswered: the limit only keeps such a failure from hanging the test.
      attempt = readNoWait(owner.orgId).then(
        (row) => ({ read: row }),
        (error: unknown) => ({ error }),
      );
      const outcome = await Promise.race([attempt, delay(5000).then(() => "waited")]);
      expect(outcome).toMatchObject({
        error: { parent: { code: "55P03" }, original: { code: "55P03" } },
      });

      // The option only means something with a locking read: a plain read is not held up.
      const plain = await sequelize.transaction((transaction) =>
        getFindingByIdQuery(owner.orgId, finding.id, { transaction, noWait: true }),
      );
      expect(plain?.id).toBe(finding.id);
    } finally {
      await holder.rollback();
      await attempt;
    }

    // Once the holder has let go the same read succeeds again.
    expect((await readNoWait(owner.orgId))?.id).toBe(finding.id);
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

  it("keeps findings in the order given and returns them in that order within a run", async () => {
    const { owner } = await seedTwoTenantContexts();
    const {
      vendorId,
      inserted: [first, second],
    } = await seedFindings(owner, [FINDING, SECOND_FINDING]);

    // insertFindingsQuery returns the findings in the order it was given them.
    expect([first.risk_description, second.risk_description]).toEqual([
      FINDING.risk_description,
      SECOND_FINDING.risk_description,
    ]);
    // Both were stored in one transaction, so they share a created_at and the lower id comes
    // first: the pipeline stores a run's findings most severe first, and that is how they read.
    expect(second.created_at).toEqual(first.created_at);
    expect(first.id).toBeLessThan(second.id);
    expect((await getFindingsForVendorQuery(owner.orgId, vendorId)).map((row) => row.id)).toEqual([
      first.id,
      second.id,
    ]);
    const { rows } = await listFindingsQuery(owner.orgId, { limit: 50, offset: 0 });
    expect(rows.map((row) => row.id)).toEqual([first.id, second.id]);
  });

  it("lists the organization's findings newest run first, filtered by status and vendor, one page at a time", async () => {
    const { owner } = await seedTwoTenantContexts();
    const acme = await seedFindings(owner, [FINDING, SECOND_FINDING]);
    // A second vendor with its own finding, stored after the first vendor's.
    const globex = await seedFindings(owner, [FINDING], "Globex");
    const [first, second] = acme.inserted;
    const [newest] = globex.inserted;
    await markFindingDismissedQuery({
      organizationId: owner.orgId,
      id: first.id,
      reason: "not_applicable",
      note: null,
      userId: owner.userId,
    });

    const list = async (filter: Partial<Parameters<typeof listFindingsQuery>[1]> = {}) => {
      const { rows, total } = await listFindingsQuery(owner.orgId, {
        limit: 50,
        offset: 0,
        ...filter,
      });
      return { ids: rows.map((row) => row.id), total };
    };

    // The newest run comes first, across vendors; the findings of one run keep the order in
    // which they were stored.
    expect(await list()).toEqual({ ids: [newest.id, first.id, second.id], total: 3 });
    const everything = await listFindingsQuery(owner.orgId, { limit: 50, offset: 0 });
    expect(everything.rows.map((row) => row.vendor_name)).toEqual([
      "Globex",
      VENDOR_NAME,
      VENDOR_NAME,
    ]);

    // Status filter.
    expect(await list({ status: "pending" })).toEqual({ ids: [newest.id, second.id], total: 2 });
    expect(await list({ status: "dismissed" })).toEqual({ ids: [first.id], total: 1 });
    expect(await list({ status: "accepted" })).toEqual({ ids: [], total: 0 });

    // Vendor filter, alone and with a status.
    expect(await list({ vendorId: acme.vendorId })).toEqual({
      ids: [first.id, second.id],
      total: 2,
    });
    expect(await list({ vendorId: globex.vendorId })).toEqual({ ids: [newest.id], total: 1 });
    expect(await list({ status: "pending", vendorId: acme.vendorId })).toEqual({
      ids: [second.id],
      total: 1,
    });

    // Paging keeps the total of the whole list, also when the offset is past the end.
    expect(await list({ limit: 2, offset: 0 })).toEqual({ ids: [newest.id, first.id], total: 3 });
    expect(await list({ limit: 2, offset: 2 })).toEqual({ ids: [second.id], total: 3 });
    expect(await list({ limit: 2, offset: 10 })).toEqual({ ids: [], total: 3 });
  });

  it("does not list a finding whose vendor belongs to another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const {
      vendorId,
      inserted: [finding],
    } = await seedFindings(owner, [FINDING]);

    // No foreign key ties a finding's organization to its vendor's or run's, so the
    // database accepts a copy of the owner's finding stamped with the attacker's organization.
    const [stray] = (await sequelize.query(
      `INSERT INTO vendor_risk_findings
         (organization_id, vendor_id, run_id, category, risk_description, impact_description,
          action_plan, likelihood, risk_severity, risk_level, confidence, sources)
       SELECT :organizationId, vendor_id, run_id, category, risk_description, impact_description,
              action_plan, likelihood, risk_severity, risk_level, confidence, sources
       FROM vendor_risk_findings WHERE id = :findingId
       RETURNING id`,
      {
        replacements: { organizationId: attacker.orgId, findingId: finding.id },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ id: number }>;

    // Positive control: the row is there for the attacker's organization...
    expect(await getFindingByIdQuery(attacker.orgId, stray.id)).toMatchObject({
      organization_id: attacker.orgId,
      vendor_id: vendorId,
    });
    // ...but its vendor is the owner's, so the list shows neither the row nor the vendor's name.
    expect(await listFindingsQuery(attacker.orgId, { limit: 50, offset: 0 })).toEqual({
      rows: [],
      total: 0,
    });

    // The owner's list holds only the owner's own finding: the stray row carries another organization.
    const ownerList = await listFindingsQuery(owner.orgId, { limit: 50, offset: 0 });
    expect(ownerList.rows.map((row) => row.id)).toEqual([finding.id]);
    expect(ownerList.total).toBe(1);
  });
});
