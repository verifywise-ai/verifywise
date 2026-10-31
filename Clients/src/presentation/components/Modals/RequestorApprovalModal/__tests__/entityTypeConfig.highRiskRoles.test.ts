import { describe, it, expect } from "vitest";
import { extractEntityDetails, getEntityTypeConfig } from "../entityTypeConfig";

describe("use case approval details: high-risk roles", () => {
  it("shows every role, Provider first", () => {
    const details = extractEntityDetails({
      entity_type: "use_case",
      project_title: "Hiring tool",
      high_risk_roles: ["Deployer", "Provider"],
    });
    expect(details.highRiskRoles).toBe("Provider, Deployer");
  });

  it("falls back to the single role of an older response and hides an empty list", () => {
    expect(
      extractEntityDetails({ entity_type: "use_case", type_of_high_risk_role: "Deployer" })
        .highRiskRoles,
    ).toBe("Deployer");
    expect(
      extractEntityDetails({ entity_type: "use_case", high_risk_roles: [] }).highRiskRoles,
    ).toBeUndefined();
  });

  it("labels the field", () => {
    expect(getEntityTypeConfig("use_case").fields).toContainEqual(
      expect.objectContaining({ key: "highRiskRoles", label: "High-risk roles" }),
    );
  });
});
