jest.setTimeout(60000);

/**
 * The runs the golden-set script scores (scripts/vendorResearchGoldenSet.ts, spec D6.4): the first
 * completed run of each vendor row with a prompt version, and how many findings of other runs and
 * active risks its row had when it started, which its deduplication compared it with.
 */

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
// The harness loads ./setup, which registers the mocks of BullMQ and the notification service:
// keep it before the modules that open a queue.
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor, createTestVendorRisk } from "../factories";
import type { NewFinding } from "../../domain.layer/interfaces/i.vendorResearch";
import { createRunQuery, insertFindingsQuery } from "../../utils/vendorResearch.utils";
import { loadGoldenRuns } from "../../scripts/vendorResearchGoldenSet";

afterEach(async () => {
  await cleanupDatabase();
});

const finding = (description: string): NewFinding => ({
  category: "security_incidents",
  risk_description: description,
  impact_description: "Our data could be exposed.",
  action_plan: "Ask the vendor.",
  likelihood: "Possible",
  risk_severity: "Moderate",
  risk_level: "Medium Risk",
  confidence: "low",
  rationale: "One source reports it.",
  sources: [
    {
      url: "https://news.example/acme",
      title: "Acme",
      quote: "Acme was breached.",
      published_at: "2026-10-01",
    },
  ],
});

/** A completed run of the vendor row with the prompt version, started at `startedAt`. */
async function seedRun(
  context: TenantContext,
  vendorId: number,
  promptVersion: string,
  startedAt: string,
  descriptions: string[],
): Promise<number> {
  const run = await createRunQuery({
    organizationId: context.orgId,
    vendorId,
    triggerType: "manual",
    requestedBy: context.userId,
  });
  await sequelize.query(
    `UPDATE vendor_research_runs
        SET status = 'completed', prompt_version = :promptVersion,
            started_at = CAST(:startedAt AS TIMESTAMPTZ),
            finished_at = CAST(:startedAt AS TIMESTAMPTZ) + INTERVAL '5 minutes'
      WHERE id = :id`,
    { replacements: { id: run.id, promptVersion, startedAt } },
  );
  if (descriptions.length > 0) {
    await sequelize.transaction((transaction) =>
      insertFindingsQuery(
        {
          organizationId: context.orgId,
          vendorId,
          runId: run.id,
          findings: descriptions.map(finding),
        },
        transaction,
      ),
    );
    await sequelize.query(
      `UPDATE vendor_risk_findings
          SET created_at = CAST(:startedAt AS TIMESTAMPTZ) + INTERVAL '4 minutes'
        WHERE run_id = :id`,
      { replacements: { id: run.id, startedAt } },
    );
  }
  return run.id;
}

describe("loadGoldenRuns", () => {
  it("takes the first completed run of a vendor row with the prompt version: on a fresh row it follows nothing", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const fresh = await createTestVendor(owner.orgId, { vendor_name: "Acme" });
    await seedRun(owner, fresh, "vr-9", "2026-11-01T10:00:00Z", ["Acme disclosed a breach."]);
    // A second run of the row is compared with the first, and drops what it repeats.
    await seedRun(owner, fresh, "vr-9", "2026-11-02T10:00:00Z", ["Acme had an outage."]);

    const runs = await loadGoldenRuns(owner.orgId, [fresh], "vr-9");

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ vendorId: fresh, promptVersion: "vr-9", earlier: 0 });
    expect(runs[0].findings.map((item) => item.risk_description)).toEqual([
      "Acme disclosed a breach.",
    ]);
  });

  it("counts the findings of other runs and the active risks the row had when the run started", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const reused = await createTestVendor(owner.orgId, { vendor_name: "Beta" });
    await seedRun(owner, reused, "vr-6", "2026-11-01T10:00:00Z", [
      "Beta disclosed a breach.",
      "Beta had an outage.",
    ]);
    await createTestVendorRisk(owner.orgId, { vendor_id: reused });
    const deleted = await createTestVendorRisk(owner.orgId, { vendor_id: reused });
    await sequelize.query(`UPDATE vendorrisks SET is_deleted = true WHERE id = :deleted`, {
      replacements: { deleted },
    });
    await sequelize.query(
      `UPDATE vendorrisks SET created_at = '2026-11-01T12:00:00Z' WHERE vendor_id = :reused`,
      { replacements: { reused } },
    );
    await seedRun(owner, reused, "vr-9", "2026-11-02T10:00:00Z", ["Beta disclosed a breach."]);

    const [run] = await loadGoldenRuns(owner.orgId, [reused], "vr-9");

    // Two findings of the earlier run and the one active risk.
    expect(run).toMatchObject({ vendorId: reused, earlier: 3 });
  });
});
