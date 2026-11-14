jest.mock("../../../../utils/risk.utils", () => ({
  getRiskByIdQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
}));

import { getRiskByIdQuery, updateRiskByIdQuery } from "../../../../utils/risk.utils";
import { executeUpdateRisk } from "../execute";

const mockGet = getRiskByIdQuery as jest.Mock;
const mockUpdate = updateRiskByIdQuery as jest.Mock;

const run = (inputParams: Record<string, unknown>) =>
  executeUpdateRisk({ inputParams, organizationId: 1, transaction: undefined } as never);

describe("executeUpdateRisk risk level", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ id: 7 });
  });

  it("does not write a null level when the stored severity is unrecognised", async () => {
    mockGet.mockResolvedValue({ id: 7, severity: "Weird", likelihood: "Rare" });
    await run({ risk_id: 7, likelihood: "Likely" });
    const partial = mockUpdate.mock.calls[0][1];
    expect(partial.likelihood).toBe("Likely");
    expect("risk_level_autocalculated" in partial).toBe(false);
  });

  it("recomputes the level when both labels are known", async () => {
    mockGet.mockResolvedValue({ id: 7, severity: "Negligible", likelihood: "Rare" });
    await run({ risk_id: 7, likelihood: "Likely" });
    expect(mockUpdate.mock.calls[0][1].risk_level_autocalculated).toBe("Low risk");
  });
});
