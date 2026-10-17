import { describe, it, expect } from "vitest";
import { HighRiskRole } from "../../../domain/enums/highRiskRole.enum";
import {
  HIGH_RISK_ROLES_REQUIRED_MESSAGE,
  classificationRoles,
  formatHighRiskRoles,
  highRiskRolesError,
  highRiskRolesPayload,
  highRiskRolesSortKey,
  normalizeHighRiskRoles,
  projectHighRiskRoles,
} from "../highRiskRoles";

const { PROVIDER, DEPLOYER } = HighRiskRole;

describe("normalizeHighRiskRoles", () => {
  it("orders Provider first and drops duplicates", () => {
    expect(normalizeHighRiskRoles(["Deployer", "Provider", "Deployer"])).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
  });

  it("maps legacy inputs", () => {
    expect(normalizeHighRiskRoles(1)).toEqual([PROVIDER]);
    expect(normalizeHighRiskRoles(0)).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles(2)).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles("not_applicable")).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles("deployer")).toEqual([DEPLOYER]);
    expect(normalizeHighRiskRoles("Product Manufacturer")).toEqual([PROVIDER]);
    expect(normalizeHighRiskRoles("Importer")).toEqual([PROVIDER]);
  });

  it("drops unknown values instead of defaulting to Provider", () => {
    expect(normalizeHighRiskRoles("InvalidString")).toEqual([]);
    expect(normalizeHighRiskRoles(99)).toEqual([]);
    expect(normalizeHighRiskRoles(null)).toEqual([]);
    expect(normalizeHighRiskRoles("")).toEqual([]);
  });
});

describe("display and form helpers", () => {
  it("formats in the fixed order", () => {
    expect(formatHighRiskRoles([DEPLOYER, PROVIDER])).toBe("Provider, Deployer");
    expect(formatHighRiskRoles([])).toBe("");
  });

  it("reads a project's list, falling back to the legacy single role", () => {
    expect(projectHighRiskRoles({ high_risk_roles: [DEPLOYER, PROVIDER] })).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(projectHighRiskRoles({ type_of_high_risk_role: "Deployer" })).toEqual([DEPLOYER]);
    expect(
      projectHighRiskRoles({ high_risk_roles: [], type_of_high_risk_role: "Deployer" }),
    ).toEqual([]);
    expect(projectHighRiskRoles(undefined)).toEqual([]);
  });

  it("reads a result's roles, falling back to the single role of an older result", () => {
    expect(classificationRoles({ roles: ["Provider", "Deployer"], role: "Provider" })).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(classificationRoles({ role: "Deployer" })).toEqual([DEPLOYER]);
    expect(classificationRoles({ role: null })).toEqual([]);
  });

  it("requires a role only when EU AI Act is selected", () => {
    expect(highRiskRolesError([], true)).toBe(HIGH_RISK_ROLES_REQUIRED_MESSAGE);
    expect(highRiskRolesError([PROVIDER], true)).toBe("");
    expect(highRiskRolesError([], false)).toBe("");
  });

  it("sends the roles only when EU AI Act is selected", () => {
    expect(highRiskRolesPayload([DEPLOYER, PROVIDER], true)).toEqual([PROVIDER, DEPLOYER]);
    expect(highRiskRolesPayload([PROVIDER], false)).toEqual([]);
  });

  it("sorts by the joined list", () => {
    const keys = [
      { high_risk_roles: [DEPLOYER] },
      { high_risk_roles: [PROVIDER, DEPLOYER] },
      { high_risk_roles: [PROVIDER] },
      { high_risk_roles: [] },
    ].map(highRiskRolesSortKey);
    expect([...keys].sort()).toEqual(["", "deployer", "provider", "provider, deployer"]);
  });
});
