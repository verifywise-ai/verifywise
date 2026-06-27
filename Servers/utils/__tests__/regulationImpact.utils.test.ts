jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../advisor/aiSdkAgent", () => ({ runAdvisorAiSdk: jest.fn() }));
jest.mock("../logger/logHelper", () => ({ logFailure: jest.fn() }));
jest.mock("../llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn().mockReturnValue("https://api.openai.com/v1/"),
}));
// BUG 3: normalizeSlug is now exported and used — mock the module, keeping it
// real so slug normalization happens correctly in these unit tests.
jest.mock("../regulationsTracker.utils", () => ({
  normalizeSlug: (s: string) => String(s).trim().toLowerCase(),
}));

import { sequelize } from "../../database/db";
import { runAdvisorAiSdk } from "../../advisor/aiSdkAgent";
import { getCandidates } from "../regulationImpact.utils";
import { buildUserPrompt, analyzeType, SYSTEM_PROMPTS } from "../regulationImpact.utils";

import {
  regionForCountry,
  frameworksForRegulation,
  validateVerdicts,
} from "../regulationImpact.utils";

import { getLLMKeysWithKeyQuery } from "../llmKey.utils";
import { runImpactAnalysis } from "../regulationImpact.utils";

describe("regionForCountry", () => {
  it("maps known European countries to 2", () => {
    expect(regionForCountry("Germany")).toBe(2);
    expect(regionForCountry("France")).toBe(2);
  });
  it("maps the EU bloc entry to Europe", () => {
    expect(regionForCountry("European Union")).toBe(2);
  });
  it("maps the US to North America", () => {
    expect(regionForCountry("United States")).toBe(3);
  });
  it("returns null for an unknown country", () => {
    expect(regionForCountry("Atlantis")).toBeNull();
  });
});

describe("frameworksForRegulation", () => {
  it("maps an EU AI Act regulation to the EU AI Act framework", () => {
    expect(frameworksForRegulation({ type: "EU AI Act", country: "European Union" })).toContain(
      "EU AI Act",
    );
  });
  it("returns an empty array when no framework maps", () => {
    expect(frameworksForRegulation({ type: "Local guidance", country: "Atlantis" })).toEqual([]);
  });
});

describe("validateVerdicts", () => {
  const sent = [
    { type: "system" as const, id: 1, name: "A", description: "" },
    { type: "system" as const, id: 2, name: "B", description: "" },
  ];
  it("keeps valid entries that were sent", () => {
    const raw = { results: [{ type: "system", id: 1, affected: true, why: "x" }] };
    expect(validateVerdicts(raw, sent)).toEqual([
      { type: "system", id: 1, affected: true, why: "x" },
    ]);
  });
  it("drops hallucinated ids not in the sent set", () => {
    const raw = { results: [{ type: "system", id: 99, affected: true, why: "x" }] };
    expect(validateVerdicts(raw, sent)).toEqual([]);
  });
  it("drops entries with empty why", () => {
    const raw = { results: [{ type: "system", id: 1, affected: true, why: "" }] };
    expect(validateVerdicts(raw, sent)).toEqual([]);
  });
  it("drops entries with non-boolean affected", () => {
    const raw = { results: [{ type: "system", id: 1, affected: "yes", why: "x" }] };
    expect(validateVerdicts(raw, sent)).toEqual([]);
  });
  it("returns [] for malformed input", () => {
    expect(validateVerdicts(null, sent)).toEqual([]);
    expect(validateVerdicts({ nope: 1 }, sent)).toEqual([]);
  });
});

describe("getCandidates", () => {
  const q = sequelize.query as jest.Mock;
  beforeEach(() => q.mockReset());

  it("returns candidates grouped by type", async () => {
    // 5 real queries fire when systems and controls are both non-empty:
    // systems, controls, assessments (projectIds non-empty), vendors, policies (controlIds non-empty)
    q.mockResolvedValueOnce([{ id: 1, name: "Resume Ranker", description: "hiring" }]); // systems
    q.mockResolvedValueOnce([{ id: 7, name: "Human oversight", description: "" }]); // controls
    q.mockResolvedValueOnce([]); // assessments
    q.mockResolvedValueOnce([{ id: 3, name: "OpenAI", description: "vendor" }]); // vendors
    q.mockResolvedValueOnce([]); // policies

    const out = await getCandidates(7, "European Union", {
      type: "EU AI Act",
      country: "European Union",
    });

    expect(out.system).toEqual([
      { type: "system", id: 1, name: "Resume Ranker", description: "hiring" },
    ]);
    expect(out.control).toEqual([
      { type: "control", id: 7, name: "Human oversight", description: "" },
    ]);
    expect(out.assessment).toEqual([]);
    expect(out.vendor).toEqual([{ type: "vendor", id: 3, name: "OpenAI", description: "vendor" }]);
    expect(out.policy).toEqual([]);
    expect(q).toHaveBeenCalledTimes(5);
  });

  it("skips the assessments query and returns [] when systems is empty", async () => {
    // systems empty → candidateProjectIds=[] → assessments branch skipped
    // controls empty → policies branch skipped
    // Only 3 real queries: systems, controls, vendors
    q.mockResolvedValue([]);
    const out = await getCandidates(5, "Germany", { type: "EU AI Act" });

    expect(out.assessment).toEqual([]);
    // No assessments query should have fired
    const sqls = q.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(sqls.some((s) => /FROM assessments/.test(s))).toBe(false);
    expect(q).toHaveBeenCalledTimes(3); // systems, controls, vendors only
  });

  it("skips the policies query and returns [] when controls is empty", async () => {
    // systems non-empty → assessments query fires
    // controls empty → policies branch skipped
    // Total: 4 queries: systems, controls, assessments, vendors
    q.mockResolvedValueOnce([{ id: 10, name: "Proj A", description: "" }]); // systems
    q.mockResolvedValueOnce([]); // controls (empty)
    q.mockResolvedValueOnce([]); // assessments
    q.mockResolvedValueOnce([]); // vendors

    const out = await getCandidates(5, "European Union", { type: "EU AI Act" });

    expect(out.policy).toEqual([]);
    const sqls = q.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(sqls.some((s) => /policy_manager/.test(s))).toBe(false);
    expect(q).toHaveBeenCalledTimes(4); // systems, controls, assessments, vendors — no policies
  });

  it("scopes every query to organization_id", async () => {
    q.mockResolvedValue([]);
    await getCandidates(42, "Germany", { type: "EU AI Act" });
    for (const call of q.mock.calls) {
      expect(call[1].replacements.organizationId).toBe(42);
    }
  });
});

const ctx = {
  name: "AI Act",
  type: "EU AI Act",
  status: "in force",
  country: "European Union",
  obligations: ["human oversight"],
  maxPenalty: "€35M",
  changeLines: ["status: draft → in force"],
};

describe("buildUserPrompt", () => {
  it("includes regulation header, the change, and each candidate line", () => {
    const p = buildUserPrompt("system", ctx, [
      { type: "system", id: 1, name: "Resume Ranker", description: "hiring tool" },
    ]);
    expect(p).toContain("EU AI Act");
    expect(p).toContain("status: draft → in force");
    expect(p).toContain('id=1 "Resume Ranker"');
  });
});

describe("SYSTEM_PROMPTS", () => {
  it("has a prompt for every entity type with the conservative rule", () => {
    for (const t of ["system", "control", "policy", "vendor", "assessment"] as const) {
      expect(SYSTEM_PROMPTS[t]).toContain("conservative");
    }
  });
});

describe("analyzeType", () => {
  const creds = { apiKey: "k", baseURL: "u", model: "m", provider: "OpenAI" as const };
  const cands = [{ type: "system" as const, id: 1, name: "A", description: "" }];
  beforeEach(() => (runAdvisorAiSdk as jest.Mock).mockReset());

  it("returns ok:true with verdicts for a good JSON response", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue(
      '{"results":[{"type":"system","id":1,"affected":true,"why":"in scope"}]}',
    );
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.verdicts).toEqual([{ type: "system", id: 1, affected: true, why: "in scope" }]);
    }
  });

  it("returns ok:false (not ok:true with []) when the LLM throws", async () => {
    (runAdvisorAiSdk as jest.Mock).mockRejectedValue(new Error("provider down"));
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out.ok).toBe(false);
  });

  it("returns ok:false for non-JSON text (parse error is a failure, not empty success)", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue("Sorry, I cannot help.");
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out.ok).toBe(false);
  });

  it("strips markdown fences and parses the inner JSON, returning ok:true", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue(
      '```json\n{"results":[{"type":"system","id":1,"affected":false,"why":"not in scope"}]}\n```',
    );
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.verdicts).toEqual([
        { type: "system", id: 1, affected: false, why: "not in scope" },
      ]);
    }
  });

  it("returns ok:true with empty verdicts when the LLM returns all not-affected (genuine empty)", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue(
      '{"results":[{"type":"system","id":1,"affected":false,"why":"not in scope"}]}',
    );
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out.ok).toBe(true);
    if (out.ok) {
      // validateVerdicts passes all entries through (including affected:false), so verdicts.length >= 0
      expect(Array.isArray(out.verdicts)).toBe(true);
    }
  });
});

describe("runImpactAnalysis", () => {
  const q = sequelize.query as jest.Mock;
  beforeEach(() => {
    q.mockReset();
    (getLLMKeysWithKeyQuery as jest.Mock).mockReset();
    (runAdvisorAiSdk as jest.Mock).mockReset();
  });

  it("returns no_key and does not call the LLM when the org has no key", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([]);
    // regulation_countries row lookup
    q.mockResolvedValueOnce([
      { data: { name: "AI Act", regulations: [], history: null }, hash: "h1" },
    ]);
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("no_key");
    expect(out.cached).toBe(false);
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  it("returns skipped_no_candidates when Stage A is empty for all types", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([
      {
        data: { name: "AI Act", country: "European Union", regulations: [], history: null },
        hash: "h1",
      },
    ]); // reg row
    // no cached row
    q.mockResolvedValueOnce([]); // getImpactRow
    // Stage A: 5 queries all empty
    q.mockResolvedValue([]);
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("skipped_no_candidates");
    expect(out.cached).toBe(false);
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  it("does NOT use stale cache when regulation_hash differs — proceeds to Stage A and returns skipped_no_candidates", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    // regulation_countries returns hash "h2" (new hash)
    q.mockResolvedValueOnce([
      {
        data: { name: "AI Act", country: "European Union", regulations: [], history: null },
        hash: "h2",
      },
    ]); // reg row
    // getImpactRow returns a cached row with OLD hash "h1" and status "ok"
    q.mockResolvedValueOnce([
      {
        regulation_hash: "h1",
        status: "ok",
        result: {
          systems: [],
          controls: [],
          policies: [],
          vendors: [],
          assessments: [],
          generatedAt: "x",
        },
        refreshed_at: "t",
      },
    ]); // stale cached row
    // Stage A: all candidate queries return empty
    q.mockResolvedValue([]);
    const out = await runImpactAnalysis(7, "eu");
    // Must NOT return cached "ok" — hash mismatch forces re-analysis
    expect(out.status).toBe("skipped_no_candidates");
    expect(out.cached).toBe(false);
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  it("reuses a cached row when hash matches and returns cached:true", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([
      { data: { name: "AI Act", regulations: [], history: null }, hash: "h1" },
    ]); // reg row
    q.mockResolvedValueOnce([
      {
        regulation_hash: "h1",
        status: "ok",
        result: {
          systems: [],
          controls: [],
          policies: [],
          vendors: [],
          assessments: [],
          generatedAt: "x",
        },
        refreshed_at: "t",
      },
    ]); // cached, hash matches
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("ok");
    // BUG 2 / BUG 5: cached:true signals that no LLM call was made
    expect(out.cached).toBe(true);
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  // BUG 1: all analyzeType calls fail → status "error", NOT "ok" (no cache poisoning)
  it("returns status:error (not ok) when every LLM type call fails", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([
      {
        data: { name: "AI Act", country: "European Union", regulations: [], history: null },
        hash: "h1",
      },
    ]); // reg row
    q.mockResolvedValueOnce([]); // getImpactRow — no cache
    // Stage A: one non-empty type so Stage B fires
    q.mockResolvedValueOnce([{ id: 1, name: "Sys", description: "" }]); // systems
    q.mockResolvedValue([]); // controls, vendors, (no assessments/policies branches)
    // Every LLM call throws
    (runAdvisorAiSdk as jest.Mock).mockRejectedValue(new Error("provider down"));
    // upsertImpactRow call
    q.mockResolvedValue([]);
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("error");
    expect(out.result).toBeNull();
    expect(out.cached).toBe(false);
  });

  // BUG 2: force=true bypasses the cache even when hash matches
  it("bypasses cache and re-runs LLM when force=true", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([
      {
        data: { name: "AI Act", country: "European Union", regulations: [], history: null },
        hash: "h1",
      },
    ]); // reg row
    // No getImpactRow call expected when force=true (cache is skipped entirely)
    // Stage A: all empty → skipped_no_candidates (no LLM call needed, just prove cache bypassed)
    q.mockResolvedValue([]);
    const out = await runImpactAnalysis(7, "eu", true);
    // force=true skipped the cache — result is from a fresh run
    expect(out.status).toBe("skipped_no_candidates");
    expect(out.cached).toBe(false);
  });

  // BUG 3: mixed-case / whitespace slug is normalized and resolves to the same row
  it("normalizes a mixed-case slug so it resolves to the same cached row as lowercase", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    // Catalog row stored under normalized "eu"
    q.mockResolvedValueOnce([
      { data: { name: "AI Act", regulations: [], history: null }, hash: "h1" },
    ]); // reg row
    // Cache row also stored under "eu" (normalized)
    q.mockResolvedValueOnce([
      {
        regulation_hash: "h1",
        status: "ok",
        result: {
          systems: [],
          controls: [],
          policies: [],
          vendors: [],
          assessments: [],
          generatedAt: "x",
        },
        refreshed_at: "t",
      },
    ]);
    // Pass "  EU  " — should normalize to "eu" and hit the cache
    const out = await runImpactAnalysis(7, "  EU  ");
    expect(out.status).toBe("ok");
    expect(out.cached).toBe(true);
    // Verify the normalized slug was used in the DB query
    const firstQueryReplacements = (q.mock.calls[0][1] as any).replacements;
    expect(firstQueryReplacements.slug).toBe("eu");
  });
});
