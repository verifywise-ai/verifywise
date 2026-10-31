import { legacyProjectHighRiskRoles } from "../migrationConfig";

describe("legacyProjectHighRiskRoles", () => {
  it("turns the single legacy value into a one-item list", () => {
    expect(legacyProjectHighRiskRoles("Provider")).toEqual(["Provider"]);
    expect(legacyProjectHighRiskRoles("Deployer")).toEqual(["Deployer"]);
  });

  it("folds role names removed in the earlier enum reduction", () => {
    expect(legacyProjectHighRiskRoles("Importer")).toEqual(["Provider"]);
    expect(legacyProjectHighRiskRoles("Distributor")).toEqual(["Provider"]);
    expect(legacyProjectHighRiskRoles("Product manufacturer")).toEqual(["Provider"]);
    expect(legacyProjectHighRiskRoles("Authorized representative")).toEqual(["Provider"]);
    expect(legacyProjectHighRiskRoles("not_applicable")).toEqual(["Deployer"]);
  });

  it("gives an empty list, never null, for missing or unknown values", () => {
    expect(legacyProjectHighRiskRoles(null)).toEqual([]);
    expect(legacyProjectHighRiskRoles(undefined)).toEqual([]);
    expect(legacyProjectHighRiskRoles("")).toEqual([]);
    expect(legacyProjectHighRiskRoles("Something else")).toEqual([]);
  });
});
