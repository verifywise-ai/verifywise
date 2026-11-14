jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { normalizeVendorRiskLikelihood } from "../vendorRisk.utils";

describe("normalizeVendorRiskLikelihood", () => {
  it("maps any casing of almost certain to the vendor enum value", () => {
    expect(normalizeVendorRiskLikelihood("Almost Certain")).toBe("Almost certain");
    expect(normalizeVendorRiskLikelihood("almost certain")).toBe("Almost certain");
    expect(normalizeVendorRiskLikelihood(" ALMOST CERTAIN ")).toBe("Almost certain");
  });

  it("leaves the other values unchanged", () => {
    for (const value of ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"]) {
      expect(normalizeVendorRiskLikelihood(value)).toBe(value);
    }
    expect(normalizeVendorRiskLikelihood(undefined)).toBeUndefined();
    expect(normalizeVendorRiskLikelihood(null)).toBeNull();
  });
});
