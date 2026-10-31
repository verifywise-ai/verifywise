import { describe, it, expect } from "@jest/globals";
import { HighRiskRole } from "../../domain.layer/enums/high-risk-role.enum";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";
import {
  HIGH_RISK_ROLE_ORDER,
  formatHighRiskRoles,
  highRiskRolesArraySql,
  highRiskRolesFromEntityData,
  isHighRiskRole,
  legacyHighRiskRole,
  normalizeHighRiskRoles,
  resolveHighRiskRolesWrite,
  resolveMappedHighRiskRoles,
  sameHighRiskRoles,
  withLegacyHighRiskRole,
} from "../highRiskRoles.utils";

const { PROVIDER, DEPLOYER } = HighRiskRole;

describe("normalizeHighRiskRoles", () => {
  it("orders Provider before Deployer and drops duplicates", () => {
    expect(normalizeHighRiskRoles(["Deployer", "Provider", "Deployer"])).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
  });

  it("reads a single legacy value as a one-item list", () => {
    expect(normalizeHighRiskRoles("Deployer")).toEqual([DEPLOYER]);
  });

  it("returns an empty list for null, undefined and unknown values", () => {
    expect(normalizeHighRiskRoles(null)).toEqual([]);
    expect(normalizeHighRiskRoles(undefined)).toEqual([]);
    expect(normalizeHighRiskRoles(["Importer", "provider", 1])).toEqual([]);
  });

  it("exposes the fixed order", () => {
    expect(HIGH_RISK_ROLE_ORDER).toEqual([PROVIDER, DEPLOYER]);
    expect(isHighRiskRole("Provider")).toBe(true);
    expect(isHighRiskRole("provider")).toBe(false);
  });
});

describe("legacyHighRiskRole and formatHighRiskRoles", () => {
  it("derives Provider when the list holds Provider", () => {
    expect(legacyHighRiskRole([DEPLOYER, PROVIDER])).toBe(PROVIDER);
  });

  it("derives Deployer when the list holds only Deployer, and null when empty", () => {
    expect(legacyHighRiskRole([DEPLOYER])).toBe(DEPLOYER);
    expect(legacyHighRiskRole([])).toBeNull();
    expect(legacyHighRiskRole(null)).toBeNull();
  });

  it("formats in the fixed order and compares as a set", () => {
    expect(formatHighRiskRoles([DEPLOYER, PROVIDER])).toBe("Provider, Deployer");
    expect(formatHighRiskRoles([])).toBe("");
    expect(sameHighRiskRoles([DEPLOYER, PROVIDER], [PROVIDER, DEPLOYER])).toBe(true);
    expect(sameHighRiskRoles([DEPLOYER], [PROVIDER, DEPLOYER])).toBe(false);
  });
});

describe("highRiskRolesArraySql", () => {
  it("binds a non-empty list inside ARRAY[...]::text[], normalised", () => {
    expect(highRiskRolesArraySql([DEPLOYER, PROVIDER, DEPLOYER], "roles")).toEqual({
      sql: "ARRAY[:roles]::text[]",
      replacements: { roles: [PROVIDER, DEPLOYER] },
    });
  });

  it("never binds an empty list: it is the literal '{}'", () => {
    expect(highRiskRolesArraySql([], "roles")).toEqual({ sql: "'{}'::text[]", replacements: {} });
    expect(highRiskRolesArraySql(null, "roles")).toEqual({
      sql: "'{}'::text[]",
      replacements: {},
    });
  });
});

describe("withLegacyHighRiskRole", () => {
  it("adds the derived role to a plain row and normalises the list", () => {
    const row = withLegacyHighRiskRole({ id: 1, high_risk_roles: [DEPLOYER, PROVIDER] });
    expect(row).toEqual({
      id: 1,
      high_risk_roles: [PROVIDER, DEPLOYER],
      type_of_high_risk_role: PROVIDER,
    });
  });

  it("writes to dataValues too, so a spread of dataValues carries it", () => {
    const row = { dataValues: { id: 2, high_risk_roles: [DEPLOYER] } } as any;
    withLegacyHighRiskRole(row);
    expect(row.dataValues.type_of_high_risk_role).toBe(DEPLOYER);
    expect(row.type_of_high_risk_role).toBe(DEPLOYER);
  });

  it("treats a missing list as empty and passes null through", () => {
    expect(withLegacyHighRiskRole({ id: 3 } as any)).toMatchObject({
      high_risk_roles: [],
      type_of_high_risk_role: null,
    });
    expect(withLegacyHighRiskRole(null)).toBeNull();
  });
});

describe("resolveHighRiskRolesWrite", () => {
  it("returns undefined when neither field is sent", () => {
    expect(resolveHighRiskRolesWrite({}, [PROVIDER])).toBeUndefined();
  });

  it("replaces the list with high_risk_roles, normalised", () => {
    expect(resolveHighRiskRolesWrite({ high_risk_roles: ["Deployer", "Provider"] }, [])).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(resolveHighRiskRolesWrite({ high_risk_roles: null }, [PROVIDER])).toEqual([]);
  });

  it("keeps the list when the legacy role is already in it", () => {
    expect(
      resolveHighRiskRolesWrite({ type_of_high_risk_role: "Provider" }, [PROVIDER, DEPLOYER]),
    ).toEqual([PROVIDER, DEPLOYER]);
  });

  it("replaces the list with the legacy role when it is not in it", () => {
    expect(resolveHighRiskRolesWrite({ type_of_high_risk_role: "Deployer" }, [PROVIDER])).toEqual([
      DEPLOYER,
    ]);
  });

  it("clears the list when the legacy role is null", () => {
    expect(resolveHighRiskRolesWrite({ type_of_high_risk_role: null }, [PROVIDER])).toEqual([]);
  });

  it("accepts both fields when they agree", () => {
    expect(
      resolveHighRiskRolesWrite(
        { high_risk_roles: ["Provider", "Deployer"], type_of_high_risk_role: "Deployer" },
        [],
      ),
    ).toEqual([PROVIDER, DEPLOYER]);
    expect(
      resolveHighRiskRolesWrite({ high_risk_roles: [], type_of_high_risk_role: null }, []),
    ).toEqual([]);
  });

  it("rejects both fields when they disagree", () => {
    expect(() =>
      resolveHighRiskRolesWrite(
        { high_risk_roles: ["Provider"], type_of_high_risk_role: "Deployer" },
        [],
      ),
    ).toThrow(ValidationException);
    expect(() =>
      resolveHighRiskRolesWrite(
        { high_risk_roles: ["Provider"], type_of_high_risk_role: null },
        [],
      ),
    ).toThrow(ValidationException);
  });

  it("rejects unknown roles in either field", () => {
    expect(() => resolveHighRiskRolesWrite({ high_risk_roles: ["Importer"] }, [])).toThrow(
      ValidationException,
    );
    expect(() => resolveHighRiskRolesWrite({ high_risk_roles: "Provider" }, [])).toThrow(
      ValidationException,
    );
    expect(() => resolveHighRiskRolesWrite({ type_of_high_risk_role: "Importer" }, [])).toThrow(
      ValidationException,
    );
  });
});

describe("highRiskRolesFromEntityData", () => {
  it("prefers the list and falls back to the legacy single role", () => {
    expect(highRiskRolesFromEntityData({ high_risk_roles: ["Deployer", "Provider"] })).toEqual([
      PROVIDER,
      DEPLOYER,
    ]);
    expect(highRiskRolesFromEntityData({ type_of_high_risk_role: "Deployer" })).toEqual([DEPLOYER]);
    expect(highRiskRolesFromEntityData({})).toEqual([]);
  });
});

describe("resolveMappedHighRiskRoles", () => {
  const options = [
    { value: "opt_1", label: "Provider" },
    { value: "opt_2", label: "Importer" },
    { value: "deployer", label: "We use it" },
  ];

  it("matches an option by its label when the stored value is a code", () => {
    expect(resolveMappedHighRiskRoles("opt_1", options)).toEqual({
      roles: [PROVIDER],
      unmatched: [],
    });
  });

  it("matches an option by its value, case-insensitively", () => {
    expect(resolveMappedHighRiskRoles(["deployer"], options)).toEqual({
      roles: [DEPLOYER],
      unmatched: [],
    });
    expect(resolveMappedHighRiskRoles("PROVIDER", [])).toEqual({
      roles: [PROVIDER],
      unmatched: [],
    });
  });

  it("returns both roles from a multi-select and lists unmatched options by label", () => {
    expect(resolveMappedHighRiskRoles(["deployer", "opt_2", "opt_1"], options)).toEqual({
      roles: [PROVIDER, DEPLOYER],
      unmatched: ["Importer"],
    });
  });

  it("returns nothing for an empty answer", () => {
    expect(resolveMappedHighRiskRoles(undefined, options)).toEqual({ roles: [], unmatched: [] });
    expect(resolveMappedHighRiskRoles("", options)).toEqual({ roles: [], unmatched: [] });
    expect(resolveMappedHighRiskRoles([], options)).toEqual({ roles: [], unmatched: [] });
  });
});
