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
    // 5 queries in fixed order: systems, controls, assessments, vendors, policies
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

  it("scopes every query to organization_id", async () => {
    q.mockResolvedValue([]);
    await getCandidates(42, "Germany", { type: "EU AI Act" });
    for (const call of q.mock.calls) {
      expect(call[1].replacements.organizationId).toBe(42);
    }
  });
});
