jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn().mockResolvedValue([]),
    // upsertFeedTx wraps everything in a transaction; run the callback inline.
    transaction: jest.fn((cb: (t: unknown) => unknown) => cb({})),
  },
}));
import {
  normalizeSlug,
  getAppsQuery,
  upsertFeedTx,
  describeMaterialChanges,
} from "../aiTrustIndex.utils";
import { sequelize } from "../../database/db";
import { ITrustIndexAppData } from "../../domain.layer/interfaces/i.aiTrustIndex";

describe("normalizeSlug", () => {
  it("lowercases and trims", () => {
    expect(normalizeSlug("  ChatGPT  ")).toBe("chatgpt");
  });
});

describe("getAppsQuery", () => {
  beforeEach(() => {
    // Reset then restore the default empty-array resolution so any query call
    // beyond the explicit per-test mocks (e.g. the categories fan-out) resolves
    // instead of returning undefined.
    (sequelize.query as jest.Mock).mockReset().mockResolvedValue([]);
  });

  /** Find the ORDER BY clause in the generated data query. */
  function orderByOf(): string {
    const dataSql = (sequelize.query as jest.Mock).mock.calls
      .map((c) => c[0] as string)
      .find((s) => /ORDER BY/.test(s));
    return dataSql ?? "";
  }

  it("only selects active apps and passes the org id for is_tracked", async () => {
    (sequelize.query as jest.Mock)
      .mockResolvedValueOnce([{ total: "0" }]) // count
      .mockResolvedValueOnce([]); // data
    await getAppsQuery(7, { page: 1, pageSize: 25, sort: "score" });
    const sql = (sequelize.query as jest.Mock).mock.calls.map((c) => c[0]).join("\n");
    expect(sql).toMatch(/is_active\s*=\s*true|is_active = TRUE/i);
    const repl = (sequelize.query as jest.Mock).mock.calls[0][1].replacements;
    expect(repl.organizationId).toBe(7);
  });

  // getAppsQuery fans out three queries via Promise.all: count, data, categories.
  function mockThreeQueries() {
    (sequelize.query as jest.Mock)
      .mockResolvedValueOnce([{ total: "0" }]) // count
      .mockResolvedValueOnce([]) // data
      .mockResolvedValueOnce([]); // distinct categories
  }

  it("defaults to score DESC and never interpolates raw sort/dir input", async () => {
    mockThreeQueries();
    await getAppsQuery(7, { page: 1, pageSize: 25, sort: "score" });
    expect(orderByOf()).toMatch(/ORDER BY score_out_of_100 DESC NULLS LAST/);
  });

  it("honours a whitelisted column + direction (vendor ASC)", async () => {
    mockThreeQueries();
    await getAppsQuery(7, { page: 1, pageSize: 25, sort: "vendor", dir: "asc" });
    expect(orderByOf()).toMatch(/ORDER BY vendor ASC NULLS LAST/);
  });

  it("supports name and category sort columns with descending direction", async () => {
    mockThreeQueries();
    await getAppsQuery(7, { page: 1, pageSize: 25, sort: "category", dir: "desc" });
    expect(orderByOf()).toMatch(/ORDER BY category DESC NULLS LAST/);
  });

  it("escapes LIKE metacharacters in search and adds ESCAPE clauses", async () => {
    mockThreeQueries();
    await getAppsQuery(7, { page: 1, pageSize: 25, sort: "score", search: "_" });
    const calls = (sequelize.query as jest.Mock).mock.calls;
    const searchCall = calls.find((c) => c[1]?.replacements?.search !== undefined);
    expect(searchCall![1].replacements.search).toBe("%\\_%");
    const sql = calls.map((c) => c[0]).join("\n");
    expect(sql).toMatch(/ILIKE :search ESCAPE '\\'/);
  });

  it("escapes a literal percent in search input", async () => {
    mockThreeQueries();
    await getAppsQuery(7, { page: 1, pageSize: 25, sort: "score", search: "50%" });
    const searchCall = (sequelize.query as jest.Mock).mock.calls.find(
      (c) => c[1]?.replacements?.search !== undefined,
    );
    expect(searchCall![1].replacements.search).toBe("%50\\%%");
  });

  it("falls back to score for an unknown sort column and ignores an invalid dir", async () => {
    mockThreeQueries();
    // A SQL-injection-y sort/dir must not reach the query — both fall back.
    await getAppsQuery(7, {
      page: 1,
      pageSize: 25,
      sort: "score_out_of_100; DROP TABLE",
      dir: "ASC; DROP TABLE",
    });
    const order = orderByOf();
    expect(order).toMatch(/ORDER BY score_out_of_100 DESC NULLS LAST/);
    expect(order).not.toMatch(/DROP TABLE/);
  });
});

const feedApp = (slug: string): ITrustIndexAppData =>
  ({
    slug,
    name: slug,
    vendor: "V",
    domain: `${slug}.com`,
    category: "Assistant",
    scoreOutOf100: 80,
    letterGrade: "B",
    displayedGrade: "B",
    confidence: "High",
    dealbreakerFlags: [],
    summary: "s",
    highlights: [],
    policyUrl: "https://x.com",
    policyLastUpdated: null,
    modalities: ["text"],
    processesBiometrics: false,
  }) as unknown as ITrustIndexAppData;

describe("upsertFeedTx soft-delete", () => {
  // Simulate the DB: the soft-delete UPDATE returns rows ONLY for pre-existing
  // active slugs that are NOT in the :seen array (mirrors `slug <> ALL(:seen)`).
  // Pre-existing active rows in the simulated table: "a0", "a1", "gone".
  const PREEXISTING_ACTIVE = ["a0", "a1", "gone"];
  function installQueryRouter() {
    (sequelize.query as jest.Mock).mockImplementation(
      (sql: string, opts?: { replacements?: Record<string, unknown> }) => {
        if (/SELECT seeded_at FROM ai_trust_index_meta/.test(sql)) {
          return Promise.resolve([{ seeded_at: new Date() }]); // not first seed
        }
        if (/SELECT material_hash, full_hash FROM ai_trust_index_apps/.test(sql)) {
          return Promise.resolve([]); // treat every fed app as new → INSERT path
        }
        if (/UPDATE ai_trust_index_apps[\s\S]*is_active = FALSE/.test(sql)) {
          const seen = (opts?.replacements?.seen as string[]) ?? [];
          const removed = PREEXISTING_ACTIVE.filter((s) => !seen.includes(s));
          return Promise.resolve(removed.map((slug) => ({ slug })));
        }
        return Promise.resolve([]); // INSERT / meta UPDATE
      },
    );
  }

  beforeEach(() => {
    (sequelize.query as jest.Mock).mockReset();
    installQueryRouter();
  });

  it("does NOT soft-delete an app dropped for a missing field but still present in the feed", async () => {
    // Valid (upserted) app: "a0". Dropped-but-present app: "a1" (passed via presentSlugs).
    // Genuinely absent app: "gone" (not in feed at all).
    const apps = [feedApp("a0")];
    const presentSlugs = ["a0", "a1"]; // a1 was present but dropped upstream
    const { newlyRemoved } = await upsertFeedTx(apps, presentSlugs);

    // a1 must NOT be reported removed (it's present-but-dropped → left alone).
    expect(newlyRemoved).not.toContain("a1");
    // genuinely absent "gone" IS soft-deleted.
    expect(newlyRemoved).toContain("gone");

    // And the soft-delete's :seen set includes both upserted AND dropped-present.
    const updateCall = (sequelize.query as jest.Mock).mock.calls.find((c) =>
      /UPDATE ai_trust_index_apps[\s\S]*is_active = FALSE/.test(c[0]),
    );
    const seen = updateCall![1].replacements.seen as string[];
    expect(seen).toEqual(expect.arrayContaining(["a0", "a1"]));
    expect(seen).not.toContain("gone");
  });

  it("is backward-compatible: without presentSlugs, only upserted slugs are spared", async () => {
    const { newlyRemoved } = await upsertFeedTx([feedApp("a0")]);
    // a1 is now absent from the present set → soft-deleted (today's behavior).
    expect(newlyRemoved).toEqual(expect.arrayContaining(["a1", "gone"]));
    expect(newlyRemoved).not.toContain("a0");
  });

  it("stores last_good_count from rawCount (raw feed size), not the upserted count", async () => {
    // One app survives validation, but the raw feed had 5 — last_good_count
    // should reflect the raw feed size, not the single upserted app.
    await upsertFeedTx([feedApp("a0")], ["a0"], 5);
    const metaCall = (sequelize.query as jest.Mock).mock.calls.find((c) =>
      /UPDATE ai_trust_index_meta[\s\S]*last_good_count/.test(c[0]),
    );
    expect(metaCall![1].replacements.count).toBe(5);
  });

  it("falls back to the upserted count for last_good_count when rawCount is omitted", async () => {
    await upsertFeedTx([feedApp("a0")], ["a0"]);
    const metaCall = (sequelize.query as jest.Mock).mock.calls.find((c) =>
      /UPDATE ai_trust_index_meta[\s\S]*last_good_count/.test(c[0]),
    );
    expect(metaCall![1].replacements.count).toBe(1);
  });
});

describe("describeMaterialChanges", () => {
  it("reports a grade change using displayedGrade, not letterGrade", () => {
    const prev = { ...feedApp("a0"), letterGrade: "A", displayedGrade: "B" };
    // letterGrade unchanged (A→A) but displayedGrade moved B→C: the digest must
    // follow the governance grade, so it reports the displayed change.
    const next = { ...feedApp("a0"), letterGrade: "A", displayedGrade: "C" };
    expect(describeMaterialChanges(prev, next)).toContain("grade B → C");
  });

  it("does NOT report a grade transition when only the uncapped letterGrade moved", () => {
    // letterGrade A→B but displayedGrade stays B and nothing else changed. The
    // digest must not claim a grade transition ("B → ..."); with no other
    // material change it falls back to stating the current displayed grade.
    const prev = { ...feedApp("a0"), letterGrade: "A", displayedGrade: "B" };
    const next = { ...feedApp("a0"), letterGrade: "B", displayedGrade: "B" };
    const out = describeMaterialChanges(prev, next);
    expect(out).toEqual(["grade B"]);
    expect(out.some((c) => c.includes("→"))).toBe(false);
  });

  it("reports a score change as old → new", () => {
    const prev = { ...feedApp("a0"), scoreOutOf100: 78 };
    const next = { ...feedApp("a0"), scoreOutOf100: 71 };
    expect(describeMaterialChanges(prev, next)).toContain("score 78 → 71");
  });

  it("reports a new dealbreaker flag and a policy update together", () => {
    const prev = { ...feedApp("a0"), dealbreakerFlags: [], policyLastUpdated: "2026-01-01" };
    const next = {
      ...feedApp("a0"),
      dealbreakerFlags: ["sells data with no opt-out"],
      policyLastUpdated: "2026-06-01",
    };
    const out = describeMaterialChanges(prev, next);
    expect(out).toContain("new dealbreaker flag");
    expect(out).toContain("policy updated");
  });

  it("reports biometrics turning on", () => {
    const prev = { ...feedApp("a0"), processesBiometrics: false };
    const next = { ...feedApp("a0"), processesBiometrics: true };
    expect(describeMaterialChanges(prev, next)).toContain("now processes biometrics");
  });

  it("falls back to the current displayed grade when no previous record exists", () => {
    expect(describeMaterialChanges(null, feedApp("a0"))).toEqual(["grade B"]);
  });
});
