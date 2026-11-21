import { describe, it, expect } from "vitest";
import { finding } from "../../../presentation/pages/Vendors/VendorResearchFindings/__tests__/fixtures";
import type { VendorRiskFinding } from "../../../domain/interfaces/i.vendorResearch";
import { groupFindings, orderFindings, summarizeFindings } from "../vendorResearchList";

const idsOf = (rows: readonly VendorRiskFinding[]) => rows.map((row) => row.id);

describe("the order of the pending findings", () => {
  it("puts the most severe risk level first, and a level it does not know last", () => {
    const rows = [
      finding({ id: 1, risk_level: "Low Risk" }),
      finding({ id: 2, risk_level: "Something else" }),
      finding({ id: 3, risk_level: "Very High Risk" }),
      finding({ id: 4, risk_level: "Medium Risk" }),
      finding({ id: 5, risk_level: "Very Low Risk" }),
      finding({ id: 6, risk_level: "High Risk" }),
    ];

    expect(idsOf(orderFindings(rows))).toEqual([3, 6, 4, 1, 5, 2]);
  });

  it("reads the level whatever its capitals", () => {
    const rows = [
      finding({ id: 1, risk_level: "medium risk" }),
      finding({ id: 2, risk_level: "HIGH RISK" }),
    ];

    expect(idsOf(orderFindings(rows))).toEqual([2, 1]);
  });

  it("puts the better established finding first among those of one level", () => {
    const rows = [
      finding({ id: 1, credibility: null }),
      finding({ id: 2, credibility: "low" }),
      finding({ id: 3, credibility: "high" }),
      finding({ id: 4, credibility: "medium" }),
    ];

    expect(idsOf(orderFindings(rows))).toEqual([3, 4, 2, 1]);
  });

  it("puts the newest first among those of one level and one credibility", () => {
    const rows = [
      finding({ id: 1, created_at: "2026-10-01T09:00:00.000Z" }),
      finding({ id: 2, created_at: "2026-11-04T09:00:00.000Z" }),
      finding({ id: 3, created_at: "2026-10-20T09:00:00.000Z" }),
    ];

    expect(idsOf(orderFindings(rows))).toEqual([2, 3, 1]);
  });

  it("lets the level decide before the credibility, and the credibility before the day", () => {
    const rows = [
      finding({
        id: 1,
        risk_level: "Medium Risk",
        credibility: "high",
        created_at: "2026-11-04T09:00:00.000Z",
      }),
      finding({
        id: 2,
        risk_level: "High Risk",
        credibility: "low",
        created_at: "2026-11-04T09:00:00.000Z",
      }),
      finding({
        id: 3,
        risk_level: "High Risk",
        credibility: "medium",
        created_at: "2026-10-01T09:00:00.000Z",
      }),
    ];

    expect(idsOf(orderFindings(rows))).toEqual([3, 2, 1]);
  });

  it("keeps the server's order for findings it cannot tell apart, and leaves the list it was given alone", () => {
    const rows = [finding({ id: 9 }), finding({ id: 4 }), finding({ id: 7 })];

    expect(idsOf(orderFindings(rows))).toEqual([9, 4, 7]);
    expect(idsOf(rows)).toEqual([9, 4, 7]);
  });
});

describe("the groups of the pending findings", () => {
  it("groups one vendor's findings by category, in the order the categories are researched", () => {
    const rows = [
      finding({ id: 1, category: "availability" }),
      finding({ id: 2, category: "legal_regulatory" }),
      finding({ id: 3, category: "security_incidents" }),
      finding({ id: 4, category: "legal_regulatory" }),
      finding({ id: 5, category: "financial_health" }),
      finding({ id: 6, category: "ai_specific" }),
      finding({ id: 7, category: "certifications" }),
    ];

    const groups = groupFindings(rows, "category");

    expect(groups.map((group) => [group.category, idsOf(group.rows)])).toEqual([
      ["security_incidents", [3]],
      ["certifications", [7]],
      ["legal_regulatory", [2, 4]],
      ["ai_specific", [6]],
      ["availability", [1]],
      ["financial_health", [5]],
    ]);
    expect(groups.every((group) => group.vendorId === null)).toBe(true);
  });

  it("orders the findings inside a group, the most severe first", () => {
    const rows = [
      finding({ id: 1, risk_level: "Low Risk" }),
      finding({ id: 2, risk_level: "High Risk" }),
    ];

    expect(idsOf(groupFindings(rows, "category")[0].rows)).toEqual([2, 1]);
  });

  it("puts a category it does not know after the ones it knows", () => {
    const rows = [
      finding({ id: 1, category: "something_new" as VendorRiskFinding["category"] }),
      finding({ id: 2, category: "financial_health" }),
    ];

    expect(groupFindings(rows, "category").map((group) => group.category)).toEqual([
      "financial_health",
      "something_new",
    ]);
  });

  it("groups the findings of every vendor by vendor, by name", () => {
    const rows = [
      finding({ id: 1, vendor_id: 8, vendor_name: "Zeta Labs" }),
      finding({ id: 2, vendor_id: 7, vendor_name: "Acme Cloud", risk_level: "Low Risk" }),
      finding({ id: 3, vendor_id: 7, vendor_name: "Acme Cloud", risk_level: "High Risk" }),
    ];

    const groups = groupFindings(rows, "vendor");

    expect(groups.map((group) => [group.vendorId, group.vendorName, idsOf(group.rows)])).toEqual([
      [7, "Acme Cloud", [3, 2]],
      [8, "Zeta Labs", [1]],
    ]);
    expect(groups.every((group) => group.category === null)).toBe(true);
  });

  it("keeps two vendors of one name apart, and puts a vendor without a name last", () => {
    const rows = [
      finding({ id: 1, vendor_id: 3, vendor_name: undefined }),
      finding({ id: 2, vendor_id: 9, vendor_name: "Acme Cloud" }),
      finding({ id: 3, vendor_id: 7, vendor_name: "Acme Cloud" }),
    ];

    expect(
      groupFindings(rows, "vendor").map((group) => [group.vendorId, group.vendorName]),
    ).toEqual([
      [7, "Acme Cloud"],
      [9, "Acme Cloud"],
      [3, null],
    ]);
  });

  it("gives each group a key of its own", () => {
    const rows = [
      finding({ id: 1, vendor_id: 7, category: "availability" }),
      finding({ id: 2, vendor_id: 8, category: "ai_specific" }),
    ];

    for (const by of ["category", "vendor"] as const) {
      const keys = groupFindings(rows, by).map((group) => group.key);
      expect(new Set(keys).size).toBe(2);
    }
  });

  it("has no groups for an empty list", () => {
    expect(groupFindings([], "category")).toEqual([]);
    expect(groupFindings([], "vendor")).toEqual([]);
  });
});

describe("the summary of the pending findings", () => {
  const legacy = { rule: "legacy_confidence" } as const;

  it("counts the findings, the high ones and the two categories with the most", () => {
    const rows = [
      finding({ id: 1, category: "legal_regulatory", risk_level: "High Risk" }),
      finding({ id: 2, category: "legal_regulatory", risk_level: "Very High Risk" }),
      finding({ id: 3, category: "legal_regulatory", risk_level: "Medium Risk" }),
      finding({ id: 4, category: "security_incidents", risk_level: "High Risk" }),
      finding({ id: 5, category: "security_incidents", risk_level: "Low Risk" }),
      finding({ id: 6, category: "availability", risk_level: "Very Low Risk" }),
    ];

    expect(summarizeFindings(rows, 6)).toEqual({
      total: 6,
      complete: true,
      high: 3,
      topics: [
        { category: "legal_regulatory", count: 3 },
        { category: "security_incidents", count: 2 },
      ],
      earlier: 0,
    });
  });

  it("breaks a tie between categories by the order the categories are researched", () => {
    const rows = [
      finding({ id: 1, category: "availability" }),
      finding({ id: 2, category: "ai_specific" }),
      finding({ id: 3, category: "security_incidents" }),
    ];

    expect(summarizeFindings(rows, 3).topics).toEqual([
      { category: "security_incidents", count: 1 },
      { category: "ai_specific", count: 1 },
    ]);
  });

  it("names no categories when every finding is in one", () => {
    const rows = [finding({ id: 1 }), finding({ id: 2 })];

    expect(summarizeFindings(rows, 2).topics).toEqual([]);
  });

  it("counts the findings whose label is their earlier confidence", () => {
    const rows = [
      finding({ id: 1, credibility_basis: legacy }),
      finding({ id: 2, credibility_basis: null }),
      finding({ id: 3, credibility_basis: legacy }),
      finding({
        id: 4,
        credibility_basis: {
          rule: "self_claim",
          registry_version: "2026-10-29.1",
          name_only: false,
          sources: [],
        },
      }),
    ];

    expect(summarizeFindings(rows, 4).earlier).toBe(2);
  });

  it("does not count a level it does not know as high", () => {
    const rows = [finding({ risk_level: "Highest ever" })];

    expect(summarizeFindings(rows, 1).high).toBe(0);
  });

  it("says the rows are not everything when the server holds more than it sent", () => {
    const rows = [finding({ id: 1 }), finding({ id: 2, category: "availability" })];

    const summary = summarizeFindings(rows, 250);

    expect(summary.total).toBe(250);
    expect(summary.complete).toBe(false);
  });

  it("is empty for an empty list", () => {
    expect(summarizeFindings([], 0)).toEqual({
      total: 0,
      complete: true,
      high: 0,
      topics: [],
      earlier: 0,
    });
  });
});
