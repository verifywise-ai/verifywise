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

describe("risk import parseRow approval status", () => {
  it.each([
    ["In progress", undefined, "Not required"],
    ["", undefined, "Not required"],
    [undefined, undefined, "Not required"],
    ["Pending", undefined, "Not required"],
    ["Approved", undefined, "Not required"],
    [undefined, 4, "Pending"],
    ["In progress", 4, "Pending"],
    ["not_required", 4, "Pending"],
    ["pending", 4, "Pending"],
  ])("stores %p with approver %p as %s", (status, approver, expected) => {
    const data = parseRow({ approval_status: status, risk_approval: approver } as never);
    expect(data.approval_status).toBe(expected);
  });

  it("keeps Approved or Rejected from the file only for an Admin", () => {
    const approved = { approval_status: "approved", risk_approval: 4 } as never;
    const rejected = { approval_status: "Rejected", risk_approval: 4 } as never;
    expect(parseRow(approved).approval_status).toBe("Pending");
    expect(parseRow(rejected, { callerIsAdmin: false }).approval_status).toBe("Pending");
    expect(parseRow(approved, { callerIsAdmin: true }).approval_status).toBe("Approved");
    expect(parseRow(rejected, { callerIsAdmin: true }).approval_status).toBe("Rejected");
  });

  it("needs an approver for a decision, even from an Admin", () => {
    expect(
      parseRow({ approval_status: "Approved" } as never, { callerIsAdmin: true }).approval_status,
    ).toBe("Not required");
  });
});
