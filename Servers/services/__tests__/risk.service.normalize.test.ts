jest.mock("../../utils/risk.utils", () => ({
  createRiskQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
}));
jest.mock("../../utils/projectRiskChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
  recordProjectRiskCreation: jest.fn(),
  trackProjectRiskChanges: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({ writtenValues: jest.fn(() => ({})) }));

import { createRiskQuery, updateRiskByIdQuery } from "../../utils/risk.utils";
import { createRiskService, updateRiskService } from "../risk.service";

const ctx = { userId: 1, organizationId: 1 };

describe("risk service current level spelling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createRiskQuery as jest.Mock).mockResolvedValue({ id: 5 });
    (updateRiskByIdQuery as jest.Mock).mockResolvedValue({ id: 5 });
  });

  it("stores the legacy 'Very Low risk' as 'Very low risk' on create", async () => {
    await createRiskService(
      { risk_name: "r", current_risk_level: "Very Low risk" } as never,
      ctx,
      undefined as never,
    );
    expect((createRiskQuery as jest.Mock).mock.calls[0][0].current_risk_level).toBe(
      "Very low risk",
    );
  });

  it("stores the legacy 'Very Low risk' as 'Very low risk' on update", async () => {
    await updateRiskService(
      5,
      { current_risk_level: "Very Low risk" } as never,
      { id: 5 } as never,
      ctx,
      undefined as never,
    );
    expect((updateRiskByIdQuery as jest.Mock).mock.calls[0][1].current_risk_level).toBe(
      "Very low risk",
    );
  });
});
