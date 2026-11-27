import { describe, it, expect } from "vitest";
import { getAvailableSections } from "../constants";

const complianceSectionIds = (frameworkId: number, isOrganizational: boolean): string[] =>
  getAvailableSections(frameworkId, isOrganizational)
    .filter((g) => g.id === "complianceGovernance")
    .flatMap((g) => g.sections.map((s) => s.id));

describe("getAvailableSections frameworkRequirements", () => {
  it("offers only frameworkRequirements for an organizational bundled framework", () => {
    expect(complianceSectionIds(5, true)).toEqual(["frameworkRequirements"]);
    expect(complianceSectionIds(26, true)).toEqual(["frameworkRequirements"]);
  });

  it("offers each organizational core framework the section the server builds for it", () => {
    expect(complianceSectionIds(2, true)).toEqual(["clausesAndAnnexes"]);
    expect(complianceSectionIds(3, true)).toEqual(["clausesAndAnnexes"]);
    expect(complianceSectionIds(4, true)).toEqual(["nistSubcategories"]);
  });

  it("offers nothing in Compliance & Governance for EU AI Act on an organizational report", () => {
    expect(complianceSectionIds(1, true)).toEqual([]);
  });

  it("offers frameworkRequirements for a use case report on a bundled framework", () => {
    expect(complianceSectionIds(5, false)).toEqual(["frameworkRequirements"]);
  });

  it("offers EU AI Act's sections, not frameworkRequirements, for EU AI Act (organization)", () => {
    expect(complianceSectionIds(29, true)).toEqual(["controls", "assessmentTracker"]);
  });

  it("offers frameworkRequirements for bundled frameworks after id 29", () => {
    expect(complianceSectionIds(30, true)).toEqual(["frameworkRequirements"]);
  });

  it("does not offer frameworkRequirements for core frameworks on use case reports", () => {
    expect(complianceSectionIds(1, false)).not.toContain("frameworkRequirements");
  });
});
