import { describe, it, expect } from "vitest";
import { compareRisks } from "../riskSort";
import { RiskModel } from "../../../../../domain/models/Common/risks/risk.model";

const risk = (fields: Record<string, unknown>) => fields as unknown as RiskModel;

const sortIds = (rows: RiskModel[], key: string, direction: "asc" | "desc") =>
  [...rows].sort((a, b) => compareRisks(a, b, key, direction)).map((r) => (r as any).id);

describe("compareRisks", () => {
  // Risks created by intake, MCP, the advisor or the API have no value in these columns.
  const withNulls = [
    risk({
      id: 1,
      controls_mapping: "B control",
      mitigation_status: "In progress",
      severity: "Major",
      risk_level_autocalculated: "High risk",
    }),
    risk({
      id: 2,
      controls_mapping: null,
      mitigation_status: null,
      severity: null,
      risk_level_autocalculated: null,
    }),
    risk({
      id: 3,
      controls_mapping: "a control",
      mitigation_status: "Completed",
      severity: "Minor",
      risk_level_autocalculated: "Low risk",
    }),
  ];

  it.each(["controls_mapping", "mitigation_status", "severity", "risk_level_autocalculated"])(
    "sorts %s without throwing when a value is null",
    (key) => {
      expect(() => sortIds(withNulls, key, "asc")).not.toThrow();
      expect(() => sortIds(withNulls, key, "desc")).not.toThrow();
    },
  );

  it("puts null text first ascending and last descending", () => {
    expect(sortIds(withNulls, "controls_mapping", "asc")).toEqual([2, 3, 1]);
    expect(sortIds(withNulls, "controls_mapping", "desc")).toEqual([1, 3, 2]);
  });

  it("orders severity by rank, not alphabetically", () => {
    const rows = [
      risk({ id: 1, severity: "Minor" }),
      risk({ id: 2, severity: "Catastrophic" }),
      risk({ id: 3, severity: "Moderate" }),
    ];
    expect(sortIds(rows, "severity", "desc")).toEqual([2, 3, 1]);
  });

  it("orders risk levels from no risk to very high risk", () => {
    const rows = [
      risk({ id: 1, risk_level_autocalculated: "Very high risk" }),
      risk({ id: 2, risk_level_autocalculated: "Very low risk" }),
      risk({ id: 3, risk_level_autocalculated: "Low risk" }),
      risk({ id: 4, risk_level_autocalculated: "No risk" }),
    ];
    expect(sortIds(rows, "risk_level_autocalculated", "asc")).toEqual([4, 2, 3, 1]);
  });

  it("sorts missing deadlines and ALE as zero", () => {
    const rows = [
      risk({ id: 1, deadline: "2026-05-01T00:00:00Z", ale_estimate: 10 }),
      risk({ id: 2, deadline: null, ale_estimate: null }),
    ];
    expect(sortIds(rows, "deadline", "asc")).toEqual([2, 1]);
    expect(sortIds(rows, "ale_estimate", "asc")).toEqual([2, 1]);
  });

  it("keeps the original order for an unknown key saved in an older version", () => {
    expect(sortIds(withNulls, "likelihood", "asc")).toEqual([1, 2, 3]);
  });
});
