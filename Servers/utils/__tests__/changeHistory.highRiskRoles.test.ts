import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../auditLedger.utils", () => ({ appendToAuditLedger: jest.fn() }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { trackEntityChanges } from "../changeHistory.base.utils";

describe("use case change history for high-risk roles", () => {
  it("records nothing when the same roles come back in another order", async () => {
    await expect(
      trackEntityChanges(
        "use_case",
        { high_risk_roles: ["Provider", "Deployer"] },
        { high_risk_roles: ["Deployer", "Provider"] },
      ),
    ).resolves.toEqual([]);
  });

  it("records a change as two lists in the fixed order", async () => {
    await expect(
      trackEntityChanges(
        "use_case",
        { high_risk_roles: ["Deployer"] },
        { high_risk_roles: ["Deployer", "Provider"] },
      ),
    ).resolves.toEqual([
      { fieldName: "High-risk roles", oldValue: "Deployer", newValue: "Provider, Deployer" },
    ]);
  });

  it("shows no roles as a dash", async () => {
    await expect(
      trackEntityChanges("use_case", { high_risk_roles: [] }, { high_risk_roles: ["Provider"] }),
    ).resolves.toEqual([{ fieldName: "High-risk roles", oldValue: "-", newValue: "Provider" }]);
  });
});
