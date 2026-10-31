import { describe, it, expect } from "@jest/globals";
import {
  buildProjectReplacements,
  buildProjectUpdateReplacements,
} from "../automation/project.automation.utils";

const base = { id: 1, project_title: "P", goal: "G", owner_name: "A B", status: "In progress" };

describe("project automation replacements: high-risk roles", () => {
  it("renders every role in the existing variable", () => {
    const replacements = buildProjectReplacements({
      ...base,
      high_risk_roles: ["Deployer", "Provider"],
    });
    expect(replacements["project.type_of_high_risk_role"]).toBe("Provider, Deployer");
  });

  it("shows a change of roles as old and new lists", () => {
    const replacements = buildProjectUpdateReplacements(
      { ...base, high_risk_roles: ["Provider"] },
      { ...base, high_risk_roles: ["Provider", "Deployer"] },
    );
    expect(replacements.changes_summary).toContain(
      "• High-risk roles: Provider → Provider, Deployer",
    );
    expect(replacements["old_project.type_of_high_risk_role"]).toBe("Provider");
    expect(replacements["project.type_of_high_risk_role"]).toBe("Provider, Deployer");
  });

  it("adds no changed line when only the order differs", () => {
    const replacements = buildProjectUpdateReplacements(
      { ...base, high_risk_roles: ["Provider", "Deployer"] },
      { ...base, high_risk_roles: ["Deployer", "Provider"] },
    );
    expect(replacements.changes_summary).toContain("• High-risk roles: Provider, Deployer");
    expect(replacements.changes_summary).not.toContain("→ Provider, Deployer");
  });

  it("shows no roles as (empty) in a change", () => {
    const replacements = buildProjectUpdateReplacements(
      { ...base, high_risk_roles: ["Deployer"] },
      { ...base, high_risk_roles: [] },
    );
    expect(replacements.changes_summary).toContain("• High-risk roles: Deployer → (empty)");
  });
});
