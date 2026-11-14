jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../utils/user.utils", () => ({ findUsersNotInOrganization: jest.fn() }));

import { parseRow } from "../riskImport.service";

describe("risk import parseRow residual level", () => {
  it("computes final_risk_level from the residual inputs and ignores the sheet value", () => {
    const data = parseRow({
      likelihood_mitigation: "Unlikely",
      risk_severity: "Moderate",
      final_risk_level: "Very high risk",
    } as never);
    // 2 + 3 * 3 = 11 -> Medium risk
    expect(data.final_risk_level).toBe("Medium risk");
  });

  it("stores null when the residual inputs are missing, whatever the sheet says", () => {
    const data = parseRow({ final_risk_level: "High risk" } as never);
    expect(data.final_risk_level).toBeNull();
  });

  it("derives the residual level from the stored default likelihood", () => {
    const data = parseRow({ risk_severity: "Catastrophic" } as never);
    // stored likelihood_mitigation defaults to Rare: 1 + 3 * 5 = 16
    expect(data.likelihood_mitigation).toBe("Rare");
    expect(data.final_risk_level).toBe("High risk");
  });
});
