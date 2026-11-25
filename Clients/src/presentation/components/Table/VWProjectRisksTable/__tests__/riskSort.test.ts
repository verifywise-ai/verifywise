import { describe, it, expect } from "vitest";
import { compareRisks, parseSavedRiskSort } from "../riskSort";
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

  it.each(["mitigation_status", "severity", "risk_level_autocalculated"])(
    "sorts %s without throwing when a value is null",
    (key) => {
      expect(() => sortIds(withNulls, key, "asc")).not.toThrow();
      expect(() => sortIds(withNulls, key, "desc")).not.toThrow();
    },
  );

  it("sorts a risk with no mitigation status as Not Started, as the table shows it", () => {
    // Completed, In progress, Not Started (no status)
    expect(sortIds(withNulls, "mitigation_status", "asc")).toEqual([3, 1, 2]);
    expect(sortIds(withNulls, "mitigation_status", "desc")).toEqual([2, 1, 3]);
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

  it("sorts a missing ALE as zero", () => {
    const rows = [risk({ id: 1, ale_estimate: 10 }), risk({ id: 2, ale_estimate: null })];
    expect(sortIds(rows, "ale_estimate", "asc")).toEqual([2, 1]);
  });

  // The deadline is optional: an undated risk is not the most urgent one.
  it("puts risks without a deadline last in both directions", () => {
    const rows = [
      risk({ id: 1, deadline: null }),
      risk({ id: 2, deadline: "2026-05-01T12:00:00Z" }),
      risk({ id: 3, deadline: "2026-03-01T12:00:00Z" }),
      risk({ id: 4, deadline: "" }),
    ];
    expect(sortIds(rows, "deadline", "asc")).toEqual([3, 2, 1, 4]);
    expect(sortIds(rows, "deadline", "desc")).toEqual([2, 3, 1, 4]);
  });

  it("keeps the original order for an unknown key saved in an older version", () => {
    expect(sortIds(withNulls, "likelihood", "asc")).toEqual([1, 2, 3]);
  });

  it("sorts the level column by the effective level, current level first", () => {
    const rows = [
      // inherent Very high, current Low: effective Low
      risk({ id: 1, risk_level_autocalculated: "Very high risk", current_risk_level: "Low risk" }),
      // current null: effective is the inherent Medium
      risk({ id: 2, risk_level_autocalculated: "Medium risk", current_risk_level: null }),
      // inherent Low, current Very high: effective Very high
      risk({ id: 3, risk_level_autocalculated: "Low risk", current_risk_level: "Very high risk" }),
    ];
    expect(sortIds(rows, "risk_level_autocalculated", "asc")).toEqual([1, 2, 3]);
    expect(sortIds(rows, "risk_level_autocalculated", "desc")).toEqual([3, 2, 1]);
  });
});

describe("compareRisks owner column", () => {
  const names: Record<number, string> = { 1: "zoe Adams", 2: "Bob Young", 3: "alice Yu" };
  const ownerName = (r: RiskModel) => names[(r as any).risk_owner] ?? "";
  const rows = [
    risk({ id: 1, risk_owner: 1 }),
    risk({ id: 2, risk_owner: 2 }),
    risk({ id: 3, risk_owner: 3 }),
    risk({ id: 4, risk_owner: null }),
  ];
  const ids = (direction: "asc" | "desc") =>
    [...rows]
      .sort((a, b) => compareRisks(a, b, "risk_owner", direction, ownerName))
      .map((r) => (r as any).id);

  it("sorts by display name, ignoring case, not by user id", () => {
    expect(ids("asc")).toEqual([4, 3, 2, 1]);
  });

  it("reverses for descending", () => {
    expect(ids("desc")).toEqual([1, 2, 3, 4]);
  });
});

describe("parseSavedRiskSort", () => {
  const sortable = ["risk_name", "severity"];
  const raw = (key: string, direction: unknown) => JSON.stringify({ key, direction });

  it("keeps a saved sort on a sortable column", () => {
    expect(parseSavedRiskSort(raw("severity", "desc"), sortable)).toEqual({
      key: "severity",
      direction: "desc",
    });
  });

  it("ignores a saved sort on a column that is no longer sortable", () => {
    expect(parseSavedRiskSort(raw("controls_mapping", "asc"), sortable)).toEqual({
      key: "",
      direction: null,
    });
  });

  it("ignores unreadable or malformed values", () => {
    const none = { key: "", direction: null };
    expect(parseSavedRiskSort(null, sortable)).toEqual(none);
    expect(parseSavedRiskSort("{oops", sortable)).toEqual(none);
    expect(parseSavedRiskSort("null", sortable)).toEqual(none);
    expect(parseSavedRiskSort(raw("severity", "sideways"), sortable)).toEqual(none);
  });
});
