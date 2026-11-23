import { describe, it, expect } from "vitest";
import {
  buildVendorExportRows,
  buildVendorRiskDashboardMetrics,
  buildVendorRiskExportRows,
  distinctVendorRisks,
  vendorRiskCountByVendor,
  type VendorRiskRow,
} from "../vendorRiskRows";

// GET /vendorRisks/all answers one row per (vendor risk, use case).
const row = (overrides: Partial<VendorRiskRow>): VendorRiskRow =>
  ({
    risk_id: 1,
    vendor_id: 10,
    vendor_name: "Acme AI",
    risk_description: "Data leak",
    likelihood: "Possible",
    risk_severity: "Major",
    risk_level: "High risk",
    action_owner: 7,
    ...overrides,
  }) as VendorRiskRow;

const threeUseCases = [
  row({ project_id: 1, project_title: "Lending" }),
  row({ project_id: 2, project_title: "Onboarding" }),
  row({ project_id: 3, project_title: "Fraud" }),
];

describe("distinctVendorRisks", () => {
  it("keeps a risk once with the use cases of all its rows", () => {
    const risks = distinctVendorRisks([
      ...threeUseCases,
      row({ risk_id: 2, vendor_id: 11, project_id: 1, project_title: "Lending" }),
    ]);

    expect(risks).toHaveLength(2);
    expect(risks[0]).toMatchObject({
      risk_id: 1,
      project_ids: [1, 2, 3],
      project_titles: ["Lending", "Onboarding", "Fraud"],
    });
    expect(risks[0]).not.toHaveProperty("project_id");
    expect(risks[1]).toMatchObject({ risk_id: 2, project_ids: [1] });
  });

  it("keeps a risk whose vendor serves no use case, with no use cases", () => {
    const [risk] = distinctVendorRisks([row({ project_id: null, project_title: null })]);
    expect(risk.project_ids).toEqual([]);
    expect(risk.project_titles).toEqual([]);
  });

  it("is safe to apply twice", () => {
    const once = distinctVendorRisks(threeUseCases);
    expect(distinctVendorRisks(once)).toEqual(once);
  });

  it("reads `id` when a row has no `risk_id`", () => {
    const risks = distinctVendorRisks([
      row({ risk_id: undefined, id: 5, project_id: 1 }),
      row({ risk_id: undefined, id: 5, project_id: 2 }),
    ]);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ risk_id: 5, project_ids: [1, 2] });
  });
});

describe("vendorRiskCountByVendor", () => {
  it("counts each risk once per vendor", () => {
    const counts = vendorRiskCountByVendor([
      ...threeUseCases,
      row({ risk_id: 2, project_id: 1 }),
      row({ risk_id: 3, vendor_id: 11, project_id: 1 }),
    ]);
    expect(counts.get(10)).toBe(2);
    expect(counts.get(11)).toBe(1);
  });
});

describe("buildVendorRiskDashboardMetrics", () => {
  it("counts each risk once and an unknown level as not assessed", () => {
    const metrics = buildVendorRiskDashboardMetrics([
      ...threeUseCases,
      row({ risk_id: 2, risk_level: "No risk" }),
      row({ risk_id: 3, risk_level: "Very low" }),
      row({ risk_id: 4, risk_level: "" }),
    ]);

    expect(metrics.total).toBe(4);
    expect(metrics.distribution).toEqual({
      veryHigh: 0,
      high: 1,
      medium: 0,
      low: 0,
      veryLow: 2,
      notAssessed: 1,
    });
  });

  it("titles a recent risk by its description, cut at 60 characters, or Vendor risk", () => {
    const long = "x".repeat(400);
    const metrics = buildVendorRiskDashboardMetrics([
      row({ risk_id: 1, risk_description: long, created_at: "2026-01-02T00:00:00Z" }),
      row({ risk_id: 2, risk_description: "  ", created_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(metrics.recent.map((risk) => risk.title)).toEqual([
      `${"x".repeat(60)}...`,
      "Vendor risk",
    ]);
  });

  it("lists the newest risks first, by their real id and description", () => {
    const metrics = buildVendorRiskDashboardMetrics([
      row({ risk_id: 30, risk_description: "Oldest", created_at: "2026-01-01T00:00:00Z" }),
      row({
        risk_id: 31,
        risk_description: "Edited lately",
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      }),
      row({ risk_id: 32, risk_description: "Newest", created_at: "2026-06-01T00:00:00Z" }),
      row({
        risk_id: 32,
        risk_description: "Newest",
        created_at: "2026-06-01T00:00:00Z",
        project_id: 9,
      }),
      row({ risk_id: 33, risk_level: null as unknown as string }),
    ]);

    expect(metrics.recent.map((risk) => risk.id)).toEqual([31, 32, 30, 33]);
    expect(metrics.recent[0]).toMatchObject({
      title: "Edited lately",
      severity: "high",
      vendor_name: "Acme AI",
      updated_at: "2026-11-01T00:00:00.000Z",
    });
    // No invented level for a risk that has none.
    expect(metrics.recent[3].severity).toBeNull();
  });

  it("keeps at most five recent risks", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ risk_id: i + 1 }));
    expect(buildVendorRiskDashboardMetrics(rows).recent).toHaveLength(5);
  });

  it("answers zeroes for no rows", () => {
    expect(buildVendorRiskDashboardMetrics(undefined)).toEqual({
      total: 0,
      distribution: { veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0, notAssessed: 0 },
      recent: [],
    });
  });
});

describe("buildVendorRiskExportRows", () => {
  it("exports each risk once with its use case names", () => {
    const rows = buildVendorRiskExportRows(
      [
        ...threeUseCases,
        row({ risk_id: 2, vendor_id: 99, vendor_name: "Row name", action_owner: 8 }),
      ],
      {
        users: [{ id: 7, name: "Ada", surname: "Lovelace" }],
        vendorNames: new Map([[10, "Acme AI"]]),
      },
    );

    expect(rows).toEqual([
      {
        risk_description: "Data leak",
        vendor_name: "Acme AI",
        project_titles: "Lending, Onboarding, Fraud",
        action_owner: "Ada Lovelace",
        risk_severity: "Major",
        likelihood: "Possible",
        risk_level: "High risk",
      },
      {
        risk_description: "Data leak",
        vendor_name: "Row name",
        project_titles: "-",
        action_owner: "-",
        risk_severity: "Major",
        likelihood: "Possible",
        risk_level: "High risk",
      },
    ]);
  });
});

describe("buildVendorExportRows", () => {
  it("adds use cases and risk counts and formats the review date with the table's formatter", () => {
    const rows = buildVendorExportRows(
      [
        {
          id: 10,
          vendor_name: "Acme AI",
          assignee: 7,
          review_status: "In review",
          risk_score: 42,
          review_date: "2026-12-01T12:00:00.000Z",
          projects: [1, 2, 404],
        },
        { id: 11, vendor_name: "Beta", projects: [] },
      ],
      {
        users: [{ id: 7, name: "Ada", surname: "Lovelace" }],
        projectTitles: new Map([
          [1, "Lending"],
          [2, "Onboarding"],
        ]),
        riskCounts: new Map([[10, 3]]),
        formatDate: (date) => `day:${String(date).slice(0, 10)}`,
      },
    );

    expect(rows).toEqual([
      {
        vendor_name: "Acme AI",
        assignee: "Ada Lovelace",
        review_status: "In review",
        use_cases: "Lending, Onboarding",
        risk_count: 3,
        scorecard: "42%",
        review_date: "day:2026-12-01",
      },
      {
        vendor_name: "Beta",
        assignee: "Unassigned",
        review_status: "Not started",
        use_cases: "-",
        risk_count: 0,
        scorecard: "N/A",
        review_date: "N/A",
      },
    ]);
  });
});
