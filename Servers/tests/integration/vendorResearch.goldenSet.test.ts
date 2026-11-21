jest.setTimeout(60000);

/**
 * The runs the golden-set script scores (scripts/vendorResearchGoldenSet.ts, spec D6.4): the first
 * completed run of each vendor row made with the credibility prompt, how many findings of other
 * runs and active risks its row had when it started, which its deduplication compared it with, and
 * the label the run stored for each finding. Then the script as a whole, on the stored runs.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
// The harness loads ./setup, which registers the mocks of BullMQ and the notification service:
// keep it before the modules that open a queue.
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor, createTestVendorRisk } from "../factories";
import type {
  CredibilityLabel,
  NewFinding,
  RunCoverage,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { CREDIBILITY_PROMPT_VERSION } from "../../services/vendorResearch/prompts";
import { createRunQuery, insertFindingsQuery } from "../../utils/vendorResearch.utils";
import { loadGoldenRuns, main } from "../../scripts/vendorResearchGoldenSet";

afterEach(async () => {
  await cleanupDatabase();
});

/** What a run of the confidence rules stored (the flag off), before the flag was removed. */
const EARLIER_PROMPT_VERSION = "vr-6";

const finding = (description: string, credibility?: CredibilityLabel): NewFinding => ({
  category: "security_incidents",
  risk_description: description,
  impact_description: "Our data could be exposed.",
  action_plan: "Ask the vendor.",
  likelihood: "Possible",
  risk_severity: "Moderate",
  risk_level: "Medium Risk",
  rationale: "One source reports it.",
  sources: [
    {
      url: "https://news.example/acme",
      title: "Acme",
      quote: "Acme was breached.",
      published_at: "2026-10-01",
    },
  ],
  ...(credibility === undefined ? {} : { credibility }),
});

/** What a run of the vendor risk database stores of its lists: none of them failed. */
const COVERAGE: RunCoverage = {
  registry_version: "sr-5",
  sources: [
    {
      id: "kev",
      name: "kev",
      attribution: "kev",
      mode: "mirror",
      checked: true,
      outcome: "none",
      strong: 0,
      weak: 0,
      last_success_at: "2026-10-30T09:23:00.000Z",
      stale: false,
    },
  ],
  lookups: [],
  cited: { official: 0, trusted_press: 1, vendor: 0, unverified: 0 },
};

/**
 * A completed run of the vendor row with the prompt version, started at `startedAt`, with the
 * findings, each given the label (none when it is not given), and the coverage the run stored.
 */
async function seedRun(
  context: TenantContext,
  vendorId: number,
  promptVersion: string,
  startedAt: string,
  descriptions: string[],
  stored: { credibility?: CredibilityLabel; coverage?: RunCoverage } = {},
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
            coverage = CAST(:coverage AS JSONB),
            started_at = CAST(:startedAt AS TIMESTAMPTZ),
            finished_at = CAST(:startedAt AS TIMESTAMPTZ) + INTERVAL '5 minutes'
      WHERE id = :id`,
    {
      replacements: {
        id: run.id,
        promptVersion,
        startedAt,
        coverage: stored.coverage === undefined ? null : JSON.stringify(stored.coverage),
      },
    },
  );
  if (descriptions.length > 0) {
    await sequelize.transaction((transaction) =>
      insertFindingsQuery(
        {
          organizationId: context.orgId,
          vendorId,
          runId: run.id,
          findings: descriptions.map((description) => finding(description, stored.credibility)),
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
    await seedRun(owner, fresh, CREDIBILITY_PROMPT_VERSION, "2026-11-01T10:00:00Z", [
      "Acme disclosed a breach.",
    ]);
    // A second run of the row is compared with the first, and drops what it repeats.
    await seedRun(owner, fresh, CREDIBILITY_PROMPT_VERSION, "2026-11-02T10:00:00Z", [
      "Acme had an outage.",
    ]);

    const runs = await loadGoldenRuns(owner.orgId, [fresh], CREDIBILITY_PROMPT_VERSION);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      vendorId: fresh,
      promptVersion: CREDIBILITY_PROMPT_VERSION,
      earlier: 0,
    });
    expect(runs[0].findings.map((item) => item.risk_description)).toEqual([
      "Acme disclosed a breach.",
    ]);
  });

  it("counts the findings of other runs and the active risks the row had when the run started", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const reused = await createTestVendor(owner.orgId, { vendor_name: "Beta" });
    await seedRun(owner, reused, EARLIER_PROMPT_VERSION, "2026-11-01T10:00:00Z", [
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
    await seedRun(owner, reused, CREDIBILITY_PROMPT_VERSION, "2026-11-02T10:00:00Z", [
      "Beta disclosed a breach.",
    ]);

    const [run] = await loadGoldenRuns(owner.orgId, [reused], CREDIBILITY_PROMPT_VERSION);

    // Two findings of the earlier run and the one active risk.
    expect(run).toMatchObject({ vendorId: reused, earlier: 3 });
  });

  it("leaves out a row whose runs were made with another prompt version", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const before = await createTestVendor(owner.orgId, { vendor_name: "Before" });
    const current = await createTestVendor(owner.orgId, { vendor_name: "Current" });
    await seedRun(owner, before, EARLIER_PROMPT_VERSION, "2026-11-01T10:00:00Z", [
      "Before disclosed a breach.",
    ]);
    // A row with a run of each version is scored by the run of the credibility prompt only.
    await seedRun(owner, current, EARLIER_PROMPT_VERSION, "2026-10-01T10:00:00Z", [
      "Current disclosed a breach.",
    ]);
    await seedRun(owner, current, CREDIBILITY_PROMPT_VERSION, "2026-11-02T10:00:00Z", [
      "Current had an outage.",
    ]);

    const runs = await loadGoldenRuns(owner.orgId, [before, current], CREDIBILITY_PROMPT_VERSION);

    expect(runs.map((run) => run.vendorId)).toEqual([current]);
    expect(runs[0].findings.map((item) => item.risk_description)).toEqual([
      "Current had an outage.",
    ]);
    expect(await loadGoldenRuns(owner.orgId, [before], CREDIBILITY_PROMPT_VERSION)).toEqual([]);
  });

  it("reads the label the run stored for each finding, and nothing of a confidence", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const vendor = await createTestVendor(owner.orgId, { vendor_name: "Acme" });
    await seedRun(
      owner,
      vendor,
      CREDIBILITY_PROMPT_VERSION,
      "2026-11-01T10:00:00Z",
      ["Acme disclosed a breach."],
      { credibility: "medium", coverage: COVERAGE },
    );

    const [run] = await loadGoldenRuns(owner.orgId, [vendor], CREDIBILITY_PROMPT_VERSION);

    expect(run.coverage).toEqual(COVERAGE);
    expect(run.findings).toEqual([
      {
        category: "security_incidents",
        risk_description: "Acme disclosed a breach.",
        credibility: "medium",
        sources: [
          {
            url: "https://news.example/acme",
            title: "Acme",
            quote: "Acme was breached.",
            published_at: "2026-10-01",
          },
        ],
      },
    ]);
  });

  it("reads a finding without a label as none, and a run without coverage as none", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const vendor = await createTestVendor(owner.orgId, { vendor_name: "Acme" });
    await seedRun(owner, vendor, CREDIBILITY_PROMPT_VERSION, "2026-11-01T10:00:00Z", [
      "Acme disclosed a breach.",
    ]);

    const [run] = await loadGoldenRuns(owner.orgId, [vendor], CREDIBILITY_PROMPT_VERSION);

    expect(run.coverage).toBeNull();
    expect(run.findings[0].credibility).toBeNull();
  });

  it("reads the runs of the organization only", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const theirs = await createTestVendor(attacker.orgId, { vendor_name: "Theirs" });
    await seedRun(attacker, theirs, CREDIBILITY_PROMPT_VERSION, "2026-11-01T10:00:00Z", [
      "Theirs disclosed a breach.",
    ]);

    expect(await loadGoldenRuns(owner.orgId, [theirs], CREDIBILITY_PROMPT_VERSION)).toEqual([]);
    expect(await loadGoldenRuns(attacker.orgId, [theirs], CREDIBILITY_PROMPT_VERSION)).toHaveLength(
      1,
    );
  });
});

describe("the golden-set script", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-set-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Runs the script on a labels file, and gives its exit code and what it printed. */
  async function score(labels: unknown) {
    const file = path.join(dir, "labels.json");
    fs.writeFileSync(file, JSON.stringify(labels));
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(
      [file],
      (text) => out.push(text),
      (text) => err.push(text),
    );
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  const breach = { category: "security_incidents", anyOf: ["breach"], label: "high" };
  const labelsOf = (organizationId: number, vendors: unknown[]) => ({
    organizationId,
    labelledBy: "A. Person",
    labelledOn: "2026-11-01",
    vendors,
  });

  it("scores the one run of each labelled vendor, and exits 0 when every bar is met", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const acme = await createTestVendor(owner.orgId, { vendor_name: "Acme" });
    await seedRun(
      owner,
      acme,
      CREDIBILITY_PROMPT_VERSION,
      "2026-11-01T10:00:00Z",
      ["Acme disclosed a breach."],
      { credibility: "high", coverage: COVERAGE },
    );

    const result = await score(
      labelsOf(owner.orgId, [
        { profile: 5, vendorId: acme, name: "Acme", expected: [breach], traps: [] },
      ]),
    );

    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("Runs: precision 1.00, recall 1.00");
    expect(result.out).toContain(
      `#5 Acme (vendor ${acme}): 1/1 matched, 1/1 recalled, 1/1 labels agree`,
    );
    expect(result.out).toContain("Bars met: yes");
  });

  it("reads the row researched with the flag on from a file of the earlier shape", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const acme = await createTestVendor(owner.orgId, { vendor_name: "Acme" });
    await seedRun(
      owner,
      acme,
      CREDIBILITY_PROMPT_VERSION,
      "2026-11-01T10:00:00Z",
      ["Acme disclosed a breach."],
      { credibility: "high", coverage: COVERAGE },
    );

    // The row of the flag off is not read: it names no vendor of the organization.
    const result = await score(
      labelsOf(owner.orgId, [
        {
          profile: 5,
          vendorIds: { off: acme + 100_000, on: acme },
          name: "Acme",
          expected: [breach],
          traps: [],
        },
      ]),
    );

    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain(`#5 Acme (vendor ${acme}):`);
  });

  it("scores the label the run stored: a High that the labeller rates Low misses a bar", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const acme = await createTestVendor(owner.orgId, { vendor_name: "Acme" });
    await seedRun(
      owner,
      acme,
      CREDIBILITY_PROMPT_VERSION,
      "2026-11-01T10:00:00Z",
      ["Acme disclosed a breach."],
      { credibility: "high", coverage: COVERAGE },
    );

    const result = await score(
      labelsOf(owner.orgId, [
        {
          profile: 5,
          vendorId: acme,
          name: "Acme",
          expected: [{ ...breach, label: "low" }],
          traps: [],
        },
      ]),
    );

    expect(result.code).toBe(1);
    expect(result.out).toContain("High rated Low:\n  - Acme: Acme disclosed a breach.");
    expect(result.out).toContain("  - 1 finding labelled High is Low for the labeller");
  });

  it("misses a bar for a vendor whose row has no run of the credibility prompt", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const acme = await createTestVendor(owner.orgId, { vendor_name: "Acme" });
    await seedRun(
      owner,
      acme,
      EARLIER_PROMPT_VERSION,
      "2026-11-01T10:00:00Z",
      ["Acme disclosed a breach."],
      { coverage: COVERAGE },
    );

    const result = await score(
      labelsOf(owner.orgId, [
        { profile: 5, vendorId: acme, name: "Acme", expected: [breach], traps: [] },
      ]),
    );

    expect(result.code).toBe(1);
    expect(result.out).toContain(`Missing runs:\n  - Acme (vendor ${acme})`);
    expect(result.out).toContain("  - 1 vendor has no completed run (Acme)");
  });

  it("refuses a vendor row that is not one of the organization's", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const theirs = await createTestVendor(attacker.orgId, { vendor_name: "Theirs" });
    await seedRun(
      attacker,
      theirs,
      CREDIBILITY_PROMPT_VERSION,
      "2026-11-01T10:00:00Z",
      ["Theirs disclosed a breach."],
      { credibility: "high", coverage: COVERAGE },
    );

    const result = await score(
      labelsOf(owner.orgId, [
        { profile: 5, vendorId: theirs, name: "Theirs", expected: [breach], traps: [] },
      ]),
    );

    expect(result.code).toBe(2);
    expect(result.err).toContain(`These vendors are not vendors of organization ${owner.orgId}:`);
    expect(result.out).toBe("");
  });

  it("refuses labels that are not filled in", async () => {
    const { owner } = await seedTwoTenantContexts(1);

    const result = await score(
      labelsOf(owner.orgId, [
        { profile: 5, vendorId: 0, name: "Acme", expected: [breach], traps: [] },
      ]),
    );

    expect(result.code).toBe(2);
    expect(result.err).toContain("  - vendors[0].vendorId must be a positive whole number");
  });
});
