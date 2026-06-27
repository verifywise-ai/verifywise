jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../advisor/aiSdkAgent", () => ({ runAdvisorAiSdk: jest.fn() }));
jest.mock("../logger/logHelper", () => ({ logFailure: jest.fn() }));
jest.mock("../llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn().mockReturnValue("https://api.openai.com/v1/"),
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
    expect(frameworksForRegulation({ type: "EU AI Act", country: "European Union" }))
      .toContain("EU AI Act");
  });
  it("returns an empty array when no framework maps", () => {
    expect(frameworksForRegulation({ type: "Local guidance", country: "Atlantis" }))
      .toEqual([]);
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
    q.mockResolvedValueOnce([{ id: 7, name: "Human oversight", description: "" }]);     // controls
    q.mockResolvedValueOnce([]);                                                        // assessments
    q.mockResolvedValueOnce([{ id: 3, name: "OpenAI", description: "vendor" }]);         // vendors
    q.mockResolvedValueOnce([]);                                                        // policies

    const out = await getCandidates(7, "European Union", { type: "EU AI Act", country: "European Union" });

    expect(out.system).toEqual([{ type: "system", id: 1, name: "Resume Ranker", description: "hiring" }]);
    expect(out.control).toEqual([{ type: "control", id: 7, name: "Human oversight", description: "" }]);
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
    q.mockResolvedValueOnce([]);                                             // controls (empty)
    q.mockResolvedValueOnce([]);                                             // assessments
    q.mockResolvedValueOnce([]);                                             // vendors

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
  name: "AI Act", type: "EU AI Act", status: "in force", country: "European Union",
  obligations: ["human oversight"], maxPenalty: "€35M", changeLines: ["status: draft → in force"],
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

  it("parses and validates a good JSON response", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue(
      '{"results":[{"type":"system","id":1,"affected":true,"why":"in scope"}]}',
    );
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out).toEqual([{ type: "system", id: 1, affected: true, why: "in scope" }]);
  });

  it("returns [] when the LLM throws", async () => {
    (runAdvisorAiSdk as jest.Mock).mockRejectedValue(new Error("provider down"));
    expect(await analyzeType("system", ctx, cands, creds, 7)).toEqual([]);
  });

  it("returns [] for non-JSON text (no throw)", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue("Sorry, I cannot help.");
    expect(await analyzeType("system", ctx, cands, creds, 7)).toEqual([]);
  });

  it("strips markdown fences and parses the inner JSON", async () => {
    (runAdvisorAiSdk as jest.Mock).mockResolvedValue(
      '```json\n{"results":[{"type":"system","id":1,"affected":false,"why":"not in scope"}]}\n```',
    );
    const out = await analyzeType("system", ctx, cands, creds, 7);
    expect(out).toEqual([{ type: "system", id: 1, affected: false, why: "not in scope" }]);
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
    q.mockResolvedValueOnce([{ data: { name: "AI Act", regulations: [], history: null }, hash: "h1" }]);
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("no_key");
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  it("returns skipped_no_candidates when Stage A is empty for all types", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([{ data: { name: "AI Act", country: "European Union", regulations: [], history: null }, hash: "h1" }]); // reg row
    // no cached row
    q.mockResolvedValueOnce([]); // getImpactRow
    // Stage A: 5 queries all empty
    q.mockResolvedValue([]);
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("skipped_no_candidates");
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });

  it("reuses a cached row when hash matches", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", name: "OpenAI", url: null, model: "gpt-4o" },
    ]);
    q.mockResolvedValueOnce([{ data: { name: "AI Act", regulations: [], history: null }, hash: "h1" }]); // reg row
    q.mockResolvedValueOnce([
      { regulation_hash: "h1", status: "ok", result: { systems: [], controls: [], policies: [], vendors: [], assessments: [], generatedAt: "x" }, refreshed_at: "t" },
    ]); // cached, hash matches
    const out = await runImpactAnalysis(7, "eu");
    expect(out.status).toBe("ok");
    expect(runAdvisorAiSdk).not.toHaveBeenCalled();
  });
});
