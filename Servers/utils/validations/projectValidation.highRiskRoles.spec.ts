import { describe, it, expect } from "@jest/globals";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import {
  HIGH_RISK_ROLES_REQUIRED_MESSAGE,
  sanitizeProjectDataForOrganizational,
  validateCompleteProject,
  validateHighRiskRoles,
  validateRiskClassificationConsistency,
  validateUpdateProject,
} from "./projectValidation.utils";

const EU_AI_ACT = [1];
const ISO_42001 = [2];

describe("validateHighRiskRoles", () => {
  it("requires at least one role when EU AI Act is selected", () => {
    expect(validateHighRiskRoles([], false, EU_AI_ACT)).toEqual({
      isValid: false,
      message: HIGH_RISK_ROLES_REQUIRED_MESSAGE,
      code: "REQUIRED_FIELD",
    });
    expect(validateHighRiskRoles(["Provider", "Deployer"], false, EU_AI_ACT)).toEqual({
      isValid: true,
    });
  });

  it("normalises duplicates away instead of rejecting them", () => {
    expect(validateHighRiskRoles(["Provider", "Provider"], false, EU_AI_ACT).isValid).toBe(true);
  });

  it("rejects unknown roles and a non-list", () => {
    expect(validateHighRiskRoles(["Importer"], false, EU_AI_ACT).code).toBe("INVALID_ENUM");
    expect(validateHighRiskRoles("Provider", false, EU_AI_ACT).code).toBe("INVALID_ENUM");
  });

  it("requires an empty list when EU AI Act is not selected", () => {
    expect(validateHighRiskRoles([], false, ISO_42001).isValid).toBe(true);
    expect(validateHighRiskRoles(["Provider"], false, ISO_42001).code).toBe(
      "HIGH_RISK_ROLE_WITHOUT_EU_AI_ACT",
    );
  });

  it("requires an empty list for organizational projects", () => {
    expect(validateHighRiskRoles(null, true, ISO_42001).isValid).toBe(true);
    expect(validateHighRiskRoles(["Deployer"], true, ISO_42001).code).toBe(
      "ORGANIZATIONAL_PROJECT_HIGH_RISK_ROLE_NOT_NULL",
    );
  });
});

describe("project validation with high_risk_roles", () => {
  it("reports the roles field on create", () => {
    const errors = validateCompleteProject({
      project_title: "P",
      owner: 1,
      start_date: "2026-01-01",
      goal: "G",
      framework: EU_AI_ACT,
      ai_risk_classification: "High risk",
      high_risk_roles: [],
    });
    expect(errors).toContainEqual({
      field: "high_risk_roles",
      message: HIGH_RISK_ROLES_REQUIRED_MESSAGE,
      code: "REQUIRED_FIELD",
    });
  });

  it("checks the roles on update only when they are sent", () => {
    const current = { is_organizational: false, framework: [{ framework_id: 1 }] };
    expect(validateUpdateProject({ project_title: "P" }, current)).toEqual([]);
    expect(validateUpdateProject({ high_risk_roles: ["Importer"] }, current)).toContainEqual(
      expect.objectContaining({ field: "high_risk_roles", code: "INVALID_ENUM" }),
    );
  });

  it("empties the roles of an organizational project", () => {
    expect(
      sanitizeProjectDataForOrganizational({
        is_organizational: true,
        high_risk_roles: ["Provider"],
      }).high_risk_roles,
    ).toEqual([]);
  });

  it("accepts any list of valid roles for a high-risk system", () => {
    expect(
      validateRiskClassificationConsistency(AiRiskClassification.HIGH_RISK, [
        "Provider",
        "Deployer",
      ]).isValid,
    ).toBe(true);
    expect(
      validateRiskClassificationConsistency(AiRiskClassification.HIGH_RISK, ["Importer"]).isValid,
    ).toBe(false);
  });
});
