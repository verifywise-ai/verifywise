import { describe, it, expect } from "vitest";
import { compareVendorRisks, compareVendors, type SortDirection } from "../vendorSort";
import { buildUserSortNames } from "../userSort";

// User ids deliberately in the opposite order of the names.
const userNames = buildUserSortNames([
  { id: 1, name: "Zoe", surname: "Young" },
  { id: 2, name: "Adam", surname: "Ames" },
  { id: 3, name: "maria", surname: "Lopez" },
]);

type V = Parameters<typeof compareVendors>[0];
const vendor = (overrides: Partial<V>): V => ({ id: 1, vendor_name: "Vendor", ...overrides });

const sortVendors = (vendors: V[], key: string, direction: SortDirection) =>
  [...vendors]
    .sort((a, b) => compareVendors(a, b, key, direction, { userNames, riskCounts: new Map() }))
    .map((v) => v.vendor_name);

describe("compareVendors", () => {
  it("sorts the assignee by display name, unassigned last", () => {
    const vendors = [
      vendor({ vendor_name: "none", assignee: null }),
      vendor({ vendor_name: "zoe", assignee: 1 }),
      vendor({ vendor_name: "adam", assignee: 2 }),
      vendor({ vendor_name: "maria", assignee: 3 }),
    ];
    expect(sortVendors(vendors, "assignee", "asc")).toEqual(["adam", "maria", "zoe", "none"]);
    expect(sortVendors(vendors, "assignee", "desc")).toEqual(["zoe", "maria", "adam", "none"]);
  });

  it("puts vendors without a review date last in both directions", () => {
    const vendors = [
      vendor({ vendor_name: "empty", review_date: null }),
      vendor({ vendor_name: "late", review_date: "2026-12-01T12:00:00.000Z" }),
      vendor({ vendor_name: "invalid", review_date: "not a date" }),
      vendor({ vendor_name: "early", review_date: "2026-01-01T12:00:00.000Z" }),
    ];
    const asc = sortVendors(vendors, "review_date", "asc");
    const desc = sortVendors(vendors, "review_date", "desc");
    expect(asc.slice(0, 2)).toEqual(["early", "late"]);
    expect(desc.slice(0, 2)).toEqual(["late", "early"]);
    expect(asc.slice(2).sort()).toEqual(["empty", "invalid"]);
    expect(desc.slice(2).sort()).toEqual(["empty", "invalid"]);
  });

  it("sorts risks by the distinct count it is given", () => {
    const vendors = [vendor({ id: 1, vendor_name: "one" }), vendor({ id: 2, vendor_name: "two" })];
    const sorted = [...vendors].sort((a, b) =>
      compareVendors(a, b, "risk", "desc", { userNames, riskCounts: new Map([[2, 3]]) }),
    );
    expect(sorted.map((v) => v.vendor_name)).toEqual(["two", "one"]);
  });
});

describe("compareVendorRisks", () => {
  it("sorts the level Not assessed, No risk, Low, Medium, High, Very high", () => {
    const levels = ["Very high risk", "", "Medium risk", "No risk", "High risk", "Low risk"];
    const sorted = levels
      .map((risk_level) => ({ risk_level }))
      .sort((a, b) => compareVendorRisks(a, b, "risk_level", userNames))
      .map((risk) => risk.risk_level);
    expect(sorted).toEqual([
      "",
      "No risk",
      "Low risk",
      "Medium risk",
      "High risk",
      "Very high risk",
    ]);
  });

  it("ranks an older stored Very low with No risk", () => {
    expect(
      compareVendorRisks(
        { risk_level: "Very low risk" },
        { risk_level: "No risk" },
        "risk_level",
        userNames,
      ),
    ).toBe(0);
  });

  it("sorts the action owner by display name", () => {
    const sorted = [{ action_owner: 1 }, { action_owner: 3 }, { action_owner: 2 }]
      .sort((a, b) => compareVendorRisks(a, b, "action_owner", userNames))
      .map((risk) => risk.action_owner);
    expect(sorted).toEqual([2, 3, 1]);
  });

  it.each<[SortDirection, (number | null)[]]>([
    ["asc", [2, 3, 1, null]],
    ["desc", [1, 3, 2, null]],
  ])("keeps a risk with no action owner last when sorting %s", (direction, expected) => {
    const sign = direction === "asc" ? 1 : -1;
    const sorted = [
      { action_owner: null },
      { action_owner: 1 },
      { action_owner: 3 },
      { action_owner: 2 },
    ]
      // As useStandardTable applies it: the direction times the comparator.
      .sort((a, b) => sign * compareVendorRisks(a, b, "action_owner", userNames, direction))
      .map((risk) => risk.action_owner);
    expect(sorted).toEqual(expected);
  });

  it("sorts severity by its scale, not alphabetically", () => {
    const sorted = ["Major", "Negligible", "Catastrophic", "Moderate", "Minor"]
      .map((risk_severity) => ({ risk_severity }))
      .sort((a, b) => compareVendorRisks(a, b, "risk_severity", userNames))
      .map((risk) => risk.risk_severity);
    expect(sorted).toEqual(["Negligible", "Minor", "Moderate", "Major", "Catastrophic"]);
  });

  it("sorts use cases given as a list", () => {
    expect(
      compareVendorRisks(
        { project_titles: ["Beta"] },
        { project_titles: ["Alpha", "Zeta"] },
        "project_titles",
        userNames,
      ),
    ).toBeGreaterThan(0);
  });
});
