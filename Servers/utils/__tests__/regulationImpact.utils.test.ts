jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
import { sequelize } from "../../database/db";
import { getCandidates } from "../regulationImpact.utils";

import {
  regionForCountry,
  frameworksForRegulation,
  validateVerdicts,
} from "../regulationImpact.utils";

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
