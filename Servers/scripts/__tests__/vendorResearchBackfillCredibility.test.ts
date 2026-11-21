/**
 * The backfill script (Task 5 of the M3 plan, spec D4.6): a dry run by default, `--apply` and
 * `--undo` when asked, with no flag to turn on first (M3 Part B), one organization at a time,
 * counts only. The queries are fakes here; the integration test
 * (tests/integration/vendorResearch.backfill.test.ts) runs the real ones end to end.
 */
jest.mock("../../database/db", () => ({ sequelize: { close: jest.fn(), query: jest.fn() } }));

import type {
  EvidenceSource,
  FindingConfidence,
} from "../../domain.layer/interfaces/i.vendorResearch";
import type { FindingToBackfill } from "../../utils/vendorResearchBackfill.utils";
import { type BackfillDeps, defaultDeps, main } from "../vendorResearchBackfillCredibility";

const ICO = "https://ico.org.uk/action-weve-taken/enforcement/acme";
const OFAC = "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=36001";
const NEWS = "https://news.example/acme";

const row = (
  id: number,
  status: FindingToBackfill["status"],
  cited: string,
  over: Partial<FindingToBackfill> = {},
): FindingToBackfill => ({
  id,
  vendor_id: 7,
  run_id: 5,
  status,
  category: "legal_regulatory",
  sources: [{ url: cited, title: "", quote: "q", published_at: null }],
  snippet_only: false,
  confidence: "medium" as FindingConfidence,
  created_at: "2026-10-12T08:30:00.000Z",
  ...over,
});

const PAGE: EvidenceSource = {
  id: "S1",
  category: "legal_regulatory",
  kind: "page",
  onVendorSite: false,
  url: ICO,
  title: "ICO",
  content: "Acme Analytics was fined.",
  publishedAt: null,
};

/** Organization 1: three pending findings (High, Low, Low) and two decided ones; 2: none. */
const FINDINGS: Record<number, FindingToBackfill[]> = {
  1: [
    row(11, "pending", ICO),
    row(12, "pending", OFAC),
    row(13, "pending", NEWS, { snippet_only: true, confidence: "low" }),
    row(14, "accepted", NEWS, { confidence: "medium" }),
    row(15, "dismissed", NEWS, { confidence: "low" }),
  ],
  2: [],
};

function fakeDeps(over: Partial<BackfillDeps> = {}): BackfillDeps & {
  [K in keyof BackfillDeps]: jest.Mock;
} {
  return {
    listOrganizationIdsQuery: jest.fn(async () => [1, 2]),
    findFindingsToBackfillQuery: jest.fn(async (organizationId: number, afterId: number) =>
      (FINDINGS[organizationId] ?? []).filter((finding) => finding.id > afterId),
    ),
    getRunForBackfillQuery: jest.fn(async () => ({ evidence: [PAGE], trace: null })),
    getVendorForBackfillQuery: jest.fn(async () => ({
      vendor_name: "Acme Analytics",
      website: "https://acme-analytics.example",
      vendor_provides: "Analytics software",
    })),
    writeBackfillQuery: jest.fn(async () => true),
    undoBackfillQuery: jest.fn(async (organizationId: number) =>
      organizationId === 1 ? { cleared: 3, kept: 1 } : { cleared: 0, kept: 0 },
    ),
    ...over,
  } as never;
}

function printed() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, write: (t: string) => out.push(t), error: (t: string) => err.push(t) };
}

describe("vendorResearchBackfillCredibility", () => {
  it("a dry run prints what it would write and writes nothing", async () => {
    const deps = fakeDeps();
    const lines = printed();

    await expect(main([], lines.write, lines.error, deps)).resolves.toBe(0);

    expect(lines.out).toEqual([
      "organization 1: 3 pending (high 1, medium 0, low 2), 2 decided (legacy 2)",
      "organization 2: nothing to backfill",
      "total: 3 pending, 2 decided; dry run, nothing written",
    ]);
    expect(lines.err).toEqual([]);
    expect(deps.writeBackfillQuery).not.toHaveBeenCalled();
    expect(deps.undoBackfillQuery).not.toHaveBeenCalled();
    // A run and a vendor are read once for the organization, and only for a pending finding.
    expect(deps.getRunForBackfillQuery).toHaveBeenCalledTimes(1);
    expect(deps.getVendorForBackfillQuery).toHaveBeenCalledTimes(1);
    expect(deps.getRunForBackfillQuery).toHaveBeenCalledWith(1, 5);
  });

  it("apply runs with no flag: nothing asks for one, and the queries are the only dependencies", async () => {
    const deps = fakeDeps();
    const lines = printed();

    await expect(main(["--apply"], lines.write, lines.error, deps)).resolves.toBe(0);

    expect(lines.err).toEqual([]);
    expect(lines.out[lines.out.length - 1]).toMatch(
      /^total: 3 pending, 2 decided; written 5, skipped 0/,
    );
    expect(deps.writeBackfillQuery).toHaveBeenCalledTimes(5);
    // The default dependencies hold the queries and nothing else: no flag and no setting.
    expect(Object.keys(defaultDeps).sort()).toEqual([
      "findFindingsToBackfillQuery",
      "getRunForBackfillQuery",
      "getVendorForBackfillQuery",
      "listOrganizationIdsQuery",
      "undoBackfillQuery",
      "writeBackfillQuery",
    ]);
  });

  it("apply does not read the environment for the flag the vendor risk database used to have", async () => {
    const real = process.env;
    jest.replaceProperty(process, "env", { VENDOR_RESEARCH_VRDB: "false" });
    try {
      const deps = fakeDeps();
      const lines = printed();

      await expect(main(["--apply"], lines.write, lines.error, deps)).resolves.toBe(0);

      expect(lines.err).toEqual([]);
      expect(deps.writeBackfillQuery).toHaveBeenCalled();
    } finally {
      jest.replaceProperty(process, "env", real);
    }
  });

  it("apply writes, and counts what it skipped", async () => {
    const deps = fakeDeps({
      writeBackfillQuery: jest.fn(async ({ id }: { id: number }) => id !== 14),
    });
    const lines = printed();

    await expect(main(["--apply"], lines.write, lines.error, deps)).resolves.toBe(0);

    expect(lines.out).toEqual([
      "organization 1: 3 pending (high 1, medium 0, low 2), 2 decided (legacy 2)",
      "organization 2: nothing to backfill",
      "total: 3 pending, 2 decided; written 4, skipped 1 (decided or labelled meanwhile)",
    ]);
    expect(deps.writeBackfillQuery).toHaveBeenCalledTimes(5);
    expect(deps.writeBackfillQuery).toHaveBeenCalledWith({
      organizationId: 1,
      id: 14,
      status: "accepted",
      credibility: "medium",
      basis: { rule: "legacy_confidence" },
    });
    expect(deps.writeBackfillQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        id: 11,
        status: "pending",
        credibility: "high",
        basis: expect.objectContaining({ rule: "backfill_official_page" }),
      }),
    );
  });

  it("undo clears and counts per organization, with the labels it kept", async () => {
    const deps = fakeDeps();
    const lines = printed();

    await expect(main(["--undo"], lines.write, lines.error, deps)).resolves.toBe(0);

    expect(lines.out).toEqual([
      "organization 1: cleared 3, kept 1 (decided after the backfill)",
      "organization 2: cleared 0, kept 0 (decided after the backfill)",
      "total: cleared 3, kept 1 (decided after the backfill)",
    ]);
    expect(deps.undoBackfillQuery.mock.calls).toEqual([[1], [2]]);
    expect(deps.findFindingsToBackfillQuery).not.toHaveBeenCalled();
  });

  it("--organization limits the work to one organization", async () => {
    const deps = fakeDeps();
    const lines = printed();

    await expect(main(["--organization", "2"], lines.write, lines.error, deps)).resolves.toBe(0);

    expect(lines.out).toEqual([
      "organization 2: nothing to backfill",
      "total: 0 pending, 0 decided; dry run, nothing written",
    ]);
    expect(
      deps.findFindingsToBackfillQuery.mock.calls.map(([organizationId]) => organizationId),
    ).toEqual([2]);

    // An organization that does not exist is refused before any finding is read.
    const unknown = fakeDeps();
    const refused = printed();
    await expect(
      main(["--undo", "--organization", "9"], refused.write, refused.error, unknown),
    ).resolves.toBe(2);
    expect(refused.err).toEqual(["There is no organization 9."]);
    expect(unknown.undoBackfillQuery).not.toHaveBeenCalled();
  });

  it("holds one run at a time: a run whose findings come back after another's is read again", async () => {
    const deps = fakeDeps({
      listOrganizationIdsQuery: jest.fn(async () => [1]),
      findFindingsToBackfillQuery: jest.fn(async (_organizationId: number, afterId: number) =>
        afterId === 0
          ? [
              row(1, "pending", ICO, { run_id: 5 }),
              row(2, "pending", ICO, { run_id: 6 }),
              row(3, "pending", ICO, { run_id: 5 }),
            ]
          : [],
      ),
    });
    const lines = printed();

    await expect(main([], lines.write, lines.error, deps)).resolves.toBe(0);

    // A run's findings are stored together, so they come one after another; keeping every run of
    // a large organization (a pack and a trace each) would exhaust the memory.
    expect(deps.getRunForBackfillQuery.mock.calls).toEqual([
      [1, 5],
      [1, 6],
      [1, 5],
    ]);
    expect(deps.getVendorForBackfillQuery).toHaveBeenCalledTimes(1);
  });

  it("reads the findings in batches of 500, each after the last id", async () => {
    const many = Array.from({ length: 500 }, (_, index) => row(index + 1, "accepted", NEWS));
    const deps = fakeDeps({
      listOrganizationIdsQuery: jest.fn(async () => [1]),
      findFindingsToBackfillQuery: jest.fn(async (_organizationId: number, afterId: number) =>
        afterId === 0 ? many : [row(501, "dismissed", NEWS)],
      ),
    });
    const lines = printed();

    await expect(main([], lines.write, lines.error, deps)).resolves.toBe(0);

    expect(deps.findFindingsToBackfillQuery.mock.calls).toEqual([
      [1, 0, 500],
      [1, 500, 500],
    ]);
    expect(lines.out[0]).toBe(
      "organization 1: 0 pending (high 0, medium 0, low 0), 501 decided (legacy 501)",
    );
  });

  it.each([
    [["--force"]],
    [["--apply", "--undo"]],
    [["--apply", "--apply"]],
    [["--organization"]],
    [["--organization", "x"]],
    [["--organization", "0"]],
    [["--organization", "1", "--organization", "2"]],
  ])("usage errors exit 2: %p", async (argv) => {
    const deps = fakeDeps();
    const lines = printed();

    await expect(main(argv, lines.write, lines.error, deps)).resolves.toBe(2);

    expect(lines.err).toHaveLength(1);
    expect(lines.err[0]).toContain("Usage: ");
    expect(deps.listOrganizationIdsQuery).not.toHaveBeenCalled();
  });

  it("its usage names the compiled script, which the backend image runs without npx", async () => {
    const lines = printed();

    await expect(main(["--force"], lines.write, lines.error, fakeDeps())).resolves.toBe(2);

    // The image keeps node and dist/ only (Servers/Dockerfile removes npm and npx).
    expect(lines.err[0]).toContain(
      "Usage: node dist/scripts/vendorResearchBackfillCredibility.js [--apply | --undo] [--organization N]",
    );
    expect(lines.err[0]).toContain("npx ts-node scripts/vendorResearchBackfillCredibility.ts");
  });

  it("a database error exits 1 with its name only", async () => {
    const error = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    error.name = "SequelizeConnectionRefusedError";
    const deps = fakeDeps({ findFindingsToBackfillQuery: jest.fn().mockRejectedValue(error) });
    const lines = printed();

    await expect(main(["--apply"], lines.write, lines.error, deps)).resolves.toBe(1);

    expect(lines.err).toEqual(["The backfill failed (SequelizeConnectionRefusedError)."]);
    expect(JSON.stringify([lines.out, lines.err])).not.toContain("10.0.0.5");
  });
});
