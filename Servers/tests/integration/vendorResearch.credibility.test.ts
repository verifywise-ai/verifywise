jest.setTimeout(60000);

/**
 * The credibility of a finding and the coverage of a run, stored and served (spec D4.6, D4.10):
 * a finding keeps its label, its basis and the new fields of its sources, and the findings
 * endpoint adds the English line of the label; a run keeps its coverage and the version of the
 * source registry, and the run endpoint serves the coverage.
 *
 * A run writes no confidence any more (M3 Part B1): a finding of a run before the credibility rule,
 * which has a confidence and no label, reads as the label of that confidence on the basis
 * `legacy_confidence`, in every statement that returns findings, until the column is dropped (B2).
 */

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
// The harness loads ./setup, which registers the mocks of BullMQ and the notification service:
// keep it before the modules that open a queue.
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor } from "../factories";
import type {
  CredibilityBasis,
  NewFinding,
  RunCoverage,
} from "../../domain.layer/interfaces/i.vendorResearch";
import {
  createRunQuery,
  finishRunQuery,
  insertFindingsQuery,
} from "../../utils/vendorResearch.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const BASIS: CredibilityBasis = {
  rule: "official_record",
  registry_version: "sr-2",
  name_only: false,
  sources: [
    {
      url: "https://nvd.nist.gov/vuln/detail/CVE-2026-31337",
      category: "official",
      publisher: "kev",
      entry: null,
      reviewed: true,
      reading: "read",
      record: {
        source: "kev",
        match: "strong",
        status: "active",
        source_record_id: "CVE-2026-31337",
        as_of: "2026-10-28",
      },
    },
  ],
};

const FINDING: NewFinding = {
  category: "security_incidents",
  risk_description: "A flaw of the vendor's gateway is exploited in the wild.",
  impact_description: "An attacker could reach the data we keep with the vendor.",
  action_plan: "Ask the vendor whether the update is applied.",
  likelihood: "Likely",
  risk_severity: "Major",
  risk_level: "High Risk",
  rationale: "CISA lists the flaw as exploited.",
  sources: [
    {
      url: "https://nvd.nist.gov/vuln/detail/CVE-2026-31337",
      title: "CVE-2026-31337: Acme Gateway flaw",
      quote: "CVE: CVE-2026-31337.",
      published_at: "2026-10-01",
      category: "official",
      publisher: "kev",
      flags: ["syndicated"],
      record: { source_id: "kev", record_id: 42, status: "active", match_strength: "strong" },
    },
  ],
  credibility: "high",
  credibility_basis: BASIS,
};

const COVERAGE: RunCoverage = {
  registry_version: "sr-2",
  sources: [
    {
      id: "kev",
      name: "CISA Known Exploited Vulnerabilities",
      attribution: "CISA Known Exploited Vulnerabilities catalog (CC0 1.0)",
      mode: "mirror",
      checked: true,
      outcome: "found",
      strong: 1,
      weak: 0,
      last_success_at: "2026-10-28T19:23:00.000Z",
      stale: false,
    },
  ],
  lookups: [{ id: "hibp", outcome: "none" }],
  cited: { official: 1, trusted_press: 0, vendor: 0, unverified: 0 },
};

/** A vendor of the context whose run stored `findings`. */
async function seedFindings(context: TenantContext, findings: NewFinding[]) {
  const vendorId = await createTestVendor(context.orgId, { vendor_name: "Acme" });
  const run = await createRunQuery({
    organizationId: context.orgId,
    vendorId,
    triggerType: "manual",
    requestedBy: context.userId,
  });
  await sequelize.transaction((transaction) =>
    insertFindingsQuery(
      { organizationId: context.orgId, vendorId, runId: run.id, findings },
      transaction,
    ),
  );
  return { vendorId, runId: run.id };
}

describe("the credibility of a finding, stored and served", () => {
  it("stores the label, its basis and the sources' fields, and lists them with the English line", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedFindings(owner, [FINDING]);

    const stored = (await sequelize.query(
      `SELECT credibility, credibility_basis, sources, confidence FROM vendor_risk_findings`,
      { type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>;
    // A run writes the label and no confidence: the column stays, empty, until it is dropped.
    expect(stored).toEqual([
      {
        credibility: "high",
        credibility_basis: BASIS,
        sources: FINDING.sources,
        confidence: null,
      },
    ]);

    const res = await owner.request.get("/api/v1/vendor-risk-findings?status=pending");
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({
      credibility: "high",
      credibility_basis: BASIS,
      credibility_rationale:
        "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-31337), as of 28 Oct 2026.",
      sources: [
        expect.objectContaining({
          category: "official",
          publisher: "kev",
          flags: ["syndicated"],
          record: { source_id: "kev", record_id: 42, status: "active", match_strength: "strong" },
        }),
      ],
    });
  });

  it("a finding without a label lists null", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const { credibility: _label, credibility_basis: _basis, ...withoutLabel } = FINDING;
    await seedFindings(owner, [withoutLabel]);

    const res = await owner.request.get("/api/v1/vendor-risk-findings?status=pending");

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0]).toMatchObject({
      confidence: null,
      credibility: null,
      credibility_basis: null,
      credibility_rationale: null,
    });
  });

  it("the decisions answer with the English line too", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedFindings(owner, [FINDING]);
    const [finding] = (await sequelize.query(`SELECT id FROM vendor_risk_findings`, {
      type: QueryTypes.SELECT,
    })) as Array<{ id: number }>;

    const res = await owner.request
      .post(`/api/v1/vendor-risk-findings/${finding.id}/dismiss`)
      .send({ reason: "not_applicable" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      credibility: "high",
      credibility_rationale:
        "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-31337), as of 28 Oct 2026.",
    });
  });
});

describe("a finding of a run before the credibility rule (M3 Part B1)", () => {
  const LEGACY_RATIONALE =
    "Rated before the source rules; this is the earlier confidence level until the label is recomputed.";
  const { credibility: _label, credibility_basis: _basis, ...withoutLabel } = FINDING;

  /** A finding as the runs before the rule stored it: a confidence, and no label. */
  async function seedLegacy(context: TenantContext, confidence: string | null) {
    await seedFindings(context, [withoutLabel]);
    await sequelize.query(`UPDATE vendor_risk_findings SET confidence = :confidence`, {
      replacements: { confidence },
    });
  }

  it.each(["low", "medium", "high"])(
    "reads a confidence of %s as the label of that level, on the basis legacy_confidence",
    async (level) => {
      const { owner } = await seedTwoTenantContexts(1);
      await seedLegacy(owner, level);

      const res = await owner.request.get("/api/v1/vendor-risk-findings?status=pending");

      expect(res.status).toBe(200);
      expect(res.body.data.rows).toHaveLength(1);
      expect(res.body.data.rows[0]).toMatchObject({
        credibility: level,
        credibility_basis: { rule: "legacy_confidence" },
        credibility_rationale: LEGACY_RATIONALE,
      });
    },
  );

  it("leaves the stored row as it is: the fallback is made when the row is read", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedLegacy(owner, "medium");

    await owner.request.get("/api/v1/vendor-risk-findings?status=pending");

    const stored = (await sequelize.query(
      `SELECT credibility, credibility_basis, confidence FROM vendor_risk_findings`,
      { type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>;
    expect(stored).toEqual([{ credibility: null, credibility_basis: null, confidence: "medium" }]);
  });

  it("reads the label of the rule, and not the confidence, for a finding that has both", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedFindings(owner, [FINDING]);
    await sequelize.query(`UPDATE vendor_risk_findings SET confidence = 'low'`);

    const res = await owner.request.get("/api/v1/vendor-risk-findings?status=pending");

    expect(res.body.data.rows[0]).toMatchObject({
      confidence: "low",
      credibility: "high",
      credibility_basis: BASIS,
    });
  });

  it("reads null for a finding that has neither a label nor a confidence", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedLegacy(owner, null);

    const res = await owner.request.get("/api/v1/vendor-risk-findings?status=pending");

    expect(res.body.data.rows[0]).toMatchObject({
      credibility: null,
      credibility_basis: null,
      credibility_rationale: null,
    });
  });

  it("answers a decision on it with the label of its confidence too", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedLegacy(owner, "high");
    const [finding] = (await sequelize.query(`SELECT id FROM vendor_risk_findings`, {
      type: QueryTypes.SELECT,
    })) as Array<{ id: number }>;

    const res = await owner.request
      .post(`/api/v1/vendor-risk-findings/${finding.id}/dismiss`)
      .send({ reason: "not_applicable" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      credibility: "high",
      credibility_basis: { rule: "legacy_confidence" },
      credibility_rationale: LEGACY_RATIONALE,
    });
  });
});

describe("the coverage of a run, stored and served", () => {
  it("finishes a run with its coverage and registry version, and serves the coverage", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await seedFindings(owner, []);

    await finishRunQuery({
      organizationId: owner.orgId,
      runId,
      status: "completed",
      categories: ["security_incidents"],
      categorySummary: [],
      evidence: null,
      model: null,
      promptVersion: "vr-8",
      searchesUsed: 0,
      pagesRead: 0,
      duplicatesDropped: 0,
      error: null,
      trace: null,
      coverage: COVERAGE,
      registryVersion: "sr-2",
    });

    const stored = (await sequelize.query(
      `SELECT coverage, registry_version FROM vendor_research_runs WHERE id = :runId`,
      { replacements: { runId }, type: QueryTypes.SELECT },
    )) as Array<Record<string, unknown>>;
    expect(stored).toEqual([{ coverage: COVERAGE, registry_version: "sr-2" }]);

    const res = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);
    expect(res.status).toBe(200);
    expect(res.body.data.coverage).toEqual(COVERAGE);
  });

  it("a run finished without coverage serves null", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await seedFindings(owner, []);

    await finishRunQuery({
      organizationId: owner.orgId,
      runId,
      status: "completed",
      categories: [],
      categorySummary: [],
      evidence: null,
      model: null,
      promptVersion: "vr-6",
      searchesUsed: 0,
      pagesRead: 0,
      duplicatesDropped: 0,
      error: null,
      trace: null,
      coverage: null,
      registryVersion: null,
    });

    const res = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);
    expect(res.body.data.coverage).toBeNull();
  });
});
