/**
 * The backfill's queries (spec D4.6, Rulings 2, 3 and 7 of the M3 plan), on the throwaway
 * database: the findings without a label of one organization in id order after a cursor, the
 * stored pack and trace of their run, their vendor, the write guarded by the status and the
 * absence of a label, and the undo that clears only what the backfill wrote; and the script end to
 * end.
 */
import "./setup";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestOrganization } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import type {
  CredibilityBasis,
  EvidenceSource,
  NewFinding,
} from "../../domain.layer/interfaces/i.vendorResearch";
import type { RunTrace } from "../../services/vendorResearch/trace";
import {
  createRunQuery,
  finishRunQuery,
  insertFindingsQuery,
} from "../../utils/vendorResearch.utils";
import { defaultDeps, main } from "../../scripts/vendorResearchBackfillCredibility";
import {
  findFindingsToBackfillQuery,
  getRunForBackfillQuery,
  getVendorForBackfillQuery,
  listOrganizationIdsQuery,
  undoBackfillQuery,
  writeBackfillQuery,
} from "../../utils/vendorResearchBackfill.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const ICO = "https://ico.org.uk/action-weve-taken/enforcement/acme";

const LIVE_BASIS: CredibilityBasis = {
  rule: "official_page",
  registry_version: "sr-4",
  name_only: false,
  sources: [
    {
      url: ICO,
      category: "official",
      publisher: "ico",
      entry: "ico",
      reviewed: true,
      reading: "read",
    },
  ],
};

const BACKFILLED = {
  ...LIVE_BASIS,
  rule: "backfill_official_page" as const,
};

const finding = (over: Partial<NewFinding> = {}): NewFinding => ({
  category: "legal_regulatory",
  risk_description: "Acme Analytics was fined by the ICO.",
  impact_description: "Our data may be handled against the law.",
  action_plan: "Ask the vendor about the fine.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  rationale: null,
  sources: [{ url: ICO, title: "ICO", quote: "Acme Analytics was fined", published_at: null }],
  ...over,
});

/** An organization, its vendor, a run and the run's findings. */
async function seed(name: string, findings: NewFinding[]) {
  const organizationId = await createTestOrganization(name);
  const vendorId = await createTestVendor(organizationId, {
    vendor_name: "Acme Analytics",
    website: "https://acme-analytics.example",
    vendor_provides: "Analytics software",
  });
  const run = await createRunQuery({
    organizationId,
    vendorId,
    triggerType: "auto",
    requestedBy: null,
  });
  const inserted = await sequelize.transaction((transaction) =>
    insertFindingsQuery({ organizationId, vendorId, runId: run.id, findings }, transaction),
  );
  return { organizationId, vendorId, runId: run.id, ids: inserted.map((row) => row.id) };
}

const rowOf = async (id: number) =>
  (
    (await sequelize.query(
      `SELECT status, credibility, credibility_basis FROM vendor_risk_findings WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )) as Array<{ status: string; credibility: string | null; credibility_basis: unknown }>
  )[0];

describe("the backfill's queries", () => {
  it("lists the organizations in id order", async () => {
    const first = await seed("Backfill A", []);
    const second = await seed("Backfill B", []);

    const ids = await listOrganizationIdsQuery();

    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids).toEqual(expect.arrayContaining([first.organizationId, second.organizationId]));
  });

  it("lists the findings without a label, in id order, after the cursor", async () => {
    const { organizationId, vendorId, runId, ids } = await seed("Backfill A", [
      finding(),
      finding({ credibility: "high", credibility_basis: LIVE_BASIS }),
      finding({ snippet_only: true, confidence: "low" }),
    ]);

    const all = await findFindingsToBackfillQuery(organizationId, 0, 10);

    expect(all.map((row) => row.id)).toEqual([ids[0], ids[2]]);
    expect(all[1]).toMatchObject({
      id: ids[2],
      vendor_id: vendorId,
      run_id: runId,
      status: "pending",
      category: "legal_regulatory",
      snippet_only: true,
      confidence: "low",
    });
    expect(all[1].sources).toEqual([
      { url: ICO, title: "ICO", quote: "Acme Analytics was fined", published_at: null },
    ]);
    expect(all[1].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(
      (await findFindingsToBackfillQuery(organizationId, ids[0], 10)).map((r) => r.id),
    ).toEqual([ids[2]]);
    expect((await findFindingsToBackfillQuery(organizationId, 0, 1)).map((r) => r.id)).toEqual([
      ids[0],
    ]);
  });

  it("reads the run's stored pack and trace, and the vendor as it is now", async () => {
    const { organizationId, vendorId, runId } = await seed("Backfill A", [finding()]);
    const evidence: EvidenceSource[] = [
      {
        id: "S1",
        category: "legal_regulatory",
        kind: "page",
        onVendorSite: false,
        url: ICO,
        title: "ICO",
        content: "Acme Analytics was fined.",
        publishedAt: null,
      },
    ];
    const trace = {
      version: 1,
      steps: [{ n: 1, by: "verification", tool: "read", url: ICO, outcome: "confirmed" }],
    } as unknown as RunTrace;
    await finishRunQuery({
      organizationId,
      runId,
      status: "completed",
      categories: ["legal_regulatory"],
      categorySummary: [],
      evidence,
      model: null,
      promptVersion: null,
      searchesUsed: 0,
      pagesRead: 0,
      duplicatesDropped: 0,
      error: null,
      trace,
      coverage: null,
      registryVersion: null,
    });

    expect(await getRunForBackfillQuery(organizationId, runId)).toEqual({
      evidence,
      trace: expect.objectContaining({ steps: trace.steps }),
    });
    expect(await getVendorForBackfillQuery(organizationId, vendorId)).toMatchObject({
      vendor_name: "Acme Analytics",
      website: "https://acme-analytics.example",
      vendor_provides: "Analytics software",
    });
    expect(await getRunForBackfillQuery(organizationId, runId + 1000)).toBeNull();
    expect(await getVendorForBackfillQuery(organizationId, vendorId + 1000)).toBeNull();
  });

  it("writes a label, once", async () => {
    const { organizationId, ids } = await seed("Backfill A", [finding()]);
    const write = () =>
      writeBackfillQuery({
        organizationId,
        id: ids[0],
        status: "pending",
        credibility: "high",
        basis: BACKFILLED,
      });

    await expect(write()).resolves.toBe(true);
    expect(await rowOf(ids[0])).toEqual({
      status: "pending",
      credibility: "high",
      credibility_basis: BACKFILLED,
    });
    // A second write finds the label and does nothing.
    await expect(write()).resolves.toBe(false);
  });

  it("a finding decided after the read is skipped", async () => {
    const { organizationId, ids } = await seed("Backfill A", [finding()]);
    const [read] = await findFindingsToBackfillQuery(organizationId, 0, 10);
    await sequelize.query(
      `UPDATE vendor_risk_findings SET status = 'accepted' WHERE organization_id = :organizationId AND id = :id`,
      { replacements: { organizationId, id: ids[0] } },
    );

    await expect(
      writeBackfillQuery({
        organizationId,
        id: read.id,
        status: read.status,
        credibility: "high",
        basis: BACKFILLED,
      }),
    ).resolves.toBe(false);
    expect(await rowOf(ids[0])).toEqual({
      status: "accepted",
      credibility: null,
      credibility_basis: null,
    });
  });

  it("a finding a live run labelled is never written", async () => {
    const { organizationId, ids } = await seed("Backfill A", [
      finding({ credibility: "high", credibility_basis: LIVE_BASIS }),
    ]);

    await expect(
      writeBackfillQuery({
        organizationId,
        id: ids[0],
        status: "pending",
        credibility: "low",
        basis: { ...BACKFILLED, rule: "backfill_unverified" },
      }),
    ).resolves.toBe(false);
    expect(await rowOf(ids[0])).toEqual({
      status: "pending",
      credibility: "high",
      credibility_basis: LIVE_BASIS,
    });
  });

  it("undo clears only the bases the backfill wrote", async () => {
    const { organizationId, ids } = await seed("Backfill A", [
      finding(),
      finding(),
      finding({ credibility: "high", credibility_basis: LIVE_BASIS }),
    ]);
    await writeBackfillQuery({
      organizationId,
      id: ids[0],
      status: "pending",
      credibility: "high",
      basis: BACKFILLED,
    });
    await sequelize.query(
      `UPDATE vendor_risk_findings SET status = 'dismissed' WHERE organization_id = :organizationId AND id = :id`,
      { replacements: { organizationId, id: ids[1] } },
    );
    await writeBackfillQuery({
      organizationId,
      id: ids[1],
      status: "dismissed",
      credibility: "medium",
      basis: { rule: "legacy_confidence" },
    });

    await expect(undoBackfillQuery(organizationId)).resolves.toEqual({ cleared: 2, kept: 0 });

    expect(await rowOf(ids[0])).toMatchObject({ credibility: null, credibility_basis: null });
    expect(await rowOf(ids[1])).toEqual({
      status: "dismissed",
      credibility: null,
      credibility_basis: null,
    });
    expect(await rowOf(ids[2])).toEqual({
      status: "pending",
      credibility: "high",
      credibility_basis: LIVE_BASIS,
    });
    await expect(undoBackfillQuery(organizationId)).resolves.toEqual({ cleared: 0, kept: 0 });
  });

  it("undo keeps the label of a finding a person decided since the backfill, and counts it", async () => {
    const { organizationId, ids } = await seed("Backfill A", [finding(), finding()]);
    for (const id of ids) {
      await writeBackfillQuery({
        organizationId,
        id,
        status: "pending",
        credibility: "high",
        basis: BACKFILLED,
      });
    }
    // A person accepted the first one with the label in front of them.
    await sequelize.query(
      `UPDATE vendor_risk_findings SET status = 'accepted' WHERE organization_id = :organizationId AND id = :id`,
      { replacements: { organizationId, id: ids[0] } },
    );

    await expect(undoBackfillQuery(organizationId)).resolves.toEqual({ cleared: 1, kept: 1 });

    expect(await rowOf(ids[0])).toEqual({
      status: "accepted",
      credibility: "high",
      credibility_basis: BACKFILLED,
    });
    expect(await rowOf(ids[1])).toEqual({
      status: "pending",
      credibility: null,
      credibility_basis: null,
    });
  });
});

describe("the backfill script, end to end", () => {
  const NVD = "https://nvd.nist.gov/vuln/detail/CVE-2026-1001";

  const allRows = async () =>
    (await sequelize.query(
      `SELECT id, status, credibility, credibility_basis, created_at FROM vendor_risk_findings
       ORDER BY id`,
      { type: QueryTypes.SELECT },
    )) as Array<{
      id: number;
      status: string;
      credibility: string | null;
      credibility_basis: { rule: string; sources?: Array<{ record?: unknown }> } | null;
      created_at: Date;
    }>;

  it("undo clears what apply wrote and nothing else", async () => {
    const a = await seed("Backfill A", [
      finding({
        category: "security_incidents",
        sources: [{ url: NVD, title: "NVD", quote: "CVE-2026-1001", published_at: null }],
      }),
      finding({ confidence: "medium" }),
      finding({ confidence: "low" }),
      finding({ credibility: "high", credibility_basis: LIVE_BASIS }),
    ]);
    const b = await seed("Backfill B", [finding()]);
    await finishRunQuery({
      organizationId: a.organizationId,
      runId: a.runId,
      status: "completed",
      categories: ["security_incidents"],
      categorySummary: [],
      evidence: [
        {
          id: "S1",
          category: "security_incidents",
          kind: "page",
          onVendorSite: false,
          url: NVD,
          title: "CVE-2026-1001",
          content: "A critical flaw in Acme Analytics.",
          publishedAt: null,
        },
      ],
      model: null,
      promptVersion: null,
      searchesUsed: 0,
      pagesRead: 0,
      duplicatesDropped: 0,
      error: null,
      trace: null,
      coverage: null,
      registryVersion: null,
    });
    for (const [id, status] of [
      [a.ids[1], "accepted"],
      [a.ids[2], "dismissed"],
    ] as const) {
      await sequelize.query(
        `UPDATE vendor_risk_findings SET status = :status WHERE organization_id = :organizationId AND id = :id`,
        { replacements: { organizationId: a.organizationId, id, status } },
      );
    }
    const seeded = await allRows();
    const out: string[] = [];
    const err: string[] = [];
    const deps = { ...defaultDeps, flagOn: () => true };

    await expect(
      main(
        ["--apply"],
        (text) => out.push(text),
        (text) => err.push(text),
        deps,
      ),
    ).resolves.toBe(0);

    expect(err).toEqual([]);
    expect(out[out.length - 1]).toBe(
      "total: 2 pending, 2 decided; written 4, skipped 0 (decided or labelled meanwhile)",
    );
    const applied = await allRows();
    const byId = new Map(applied.map((row) => [row.id, row]));
    const nvd = byId.get(a.ids[0])!;
    expect(nvd).toMatchObject({
      status: "pending",
      credibility: "high",
      credibility_basis: { rule: "backfill_official_record" },
    });
    expect(nvd.credibility_basis?.sources?.[0].record).toEqual({
      source: "nvd",
      match: "strong",
      status: "active",
      source_record_id: "CVE-2026-1001",
      as_of: new Date(nvd.created_at).toISOString().slice(0, 10),
    });
    expect(byId.get(a.ids[1])).toMatchObject({
      status: "accepted",
      credibility: "medium",
      credibility_basis: { rule: "legacy_confidence" },
    });
    expect(byId.get(a.ids[2])).toMatchObject({
      status: "dismissed",
      credibility: "low",
      credibility_basis: { rule: "legacy_confidence" },
    });
    expect(byId.get(a.ids[3])).toEqual(seeded.find((row) => row.id === a.ids[3]));
    // Organization B's run kept no evidence: its official page is unconfirmed, so Medium.
    expect(byId.get(b.ids[0])).toMatchObject({
      credibility: "medium",
      credibility_basis: { rule: "backfill_capped_unconfirmed" },
    });

    await expect(
      main(
        ["--undo"],
        () => undefined,
        () => undefined,
        deps,
      ),
    ).resolves.toBe(0);

    expect(await allRows()).toEqual(seeded);
  });

  it("a finding decided mid-run is skipped, and the next run labels it legacy", async () => {
    const a = await seed("Backfill A", [finding({ confidence: "medium" })]);
    const flagOn = { ...defaultDeps, flagOn: () => true };
    // A person accepts the finding after the script read it as pending, before its write.
    const deciding = {
      ...flagOn,
      writeBackfillQuery: async (input: Parameters<typeof writeBackfillQuery>[0]) => {
        await sequelize.query(
          `UPDATE vendor_risk_findings SET status = 'accepted' WHERE organization_id = :organizationId AND id = :id`,
          { replacements: { organizationId: input.organizationId, id: input.id } },
        );
        return writeBackfillQuery(input);
      },
    };
    const out: string[] = [];

    await expect(
      main(
        ["--apply"],
        (text) => out.push(text),
        () => undefined,
        deciding,
      ),
    ).resolves.toBe(0);

    expect(out[out.length - 1]).toBe(
      "total: 1 pending, 0 decided; written 0, skipped 1 (decided or labelled meanwhile)",
    );
    expect(await rowOf(a.ids[0])).toEqual({
      status: "accepted",
      credibility: null,
      credibility_basis: null,
    });

    // The next run reads it as decided: it keeps the confidence the person decided it by.
    out.length = 0;
    await expect(
      main(
        ["--apply"],
        (text) => out.push(text),
        () => undefined,
        flagOn,
      ),
    ).resolves.toBe(0);

    expect(out[out.length - 1]).toBe(
      "total: 0 pending, 1 decided; written 1, skipped 0 (decided or labelled meanwhile)",
    );
    expect(await rowOf(a.ids[0])).toEqual({
      status: "accepted",
      credibility: "medium",
      credibility_basis: { rule: "legacy_confidence" },
    });
  });

  it("--organization limits --apply and --undo to that organization, end to end", async () => {
    const a = await seed("Backfill A", [finding()]);
    const b = await seed("Backfill B", [finding()]);
    const deps = { ...defaultDeps, flagOn: () => true };
    const out: string[] = [];

    await expect(
      main(
        ["--apply", "--organization", String(a.organizationId)],
        (text) => out.push(text),
        () => undefined,
        deps,
      ),
    ).resolves.toBe(0);

    expect(out).toEqual([
      `organization ${a.organizationId}: 1 pending (high 0, medium 1, low 0), 0 decided (legacy 0)`,
      "total: 1 pending, 0 decided; written 1, skipped 0 (decided or labelled meanwhile)",
    ]);
    // A's run kept no evidence: its official page is unconfirmed, so Medium. B's finding is untouched.
    expect(await rowOf(a.ids[0])).toMatchObject({
      credibility: "medium",
      credibility_basis: { rule: "backfill_capped_unconfirmed" },
    });
    expect(await rowOf(b.ids[0])).toEqual({
      status: "pending",
      credibility: null,
      credibility_basis: null,
    });

    // The undo of organization B leaves the label the backfill gave organization A.
    await expect(
      main(
        ["--undo", "--organization", String(b.organizationId)],
        () => undefined,
        () => undefined,
        deps,
      ),
    ).resolves.toBe(0);
    expect(await rowOf(a.ids[0])).toMatchObject({ credibility: "medium" });
  });
});
