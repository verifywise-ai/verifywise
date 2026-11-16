jest.mock("../../../../utils/risk.utils", () => ({
  getRiskByIdQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
}));

jest.mock("../../../../utils/riskVisibility.utils", () => ({
  riskViewerForUserQuery: jest.fn(),
}));

import { riskViewerForUserQuery } from "../../../../utils/riskVisibility.utils";
import { getRiskByIdQuery, updateRiskByIdQuery } from "../../../../utils/risk.utils";
import { executeUpdateRisk } from "../execute";

const mockGet = getRiskByIdQuery as jest.Mock;
const mockUpdate = updateRiskByIdQuery as jest.Mock;

const mockViewer = riskViewerForUserQuery as jest.Mock;
const viewer = { userId: 2, role: "Editor" };

const run = (inputParams: Record<string, unknown>) =>
  executeUpdateRisk({
    inputParams,
    organizationId: 1,
    requesterId: 2,
    transaction: undefined,
  } as never);

describe("executeUpdateRisk visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockViewer.mockResolvedValue(viewer);
    mockGet.mockResolvedValue({ id: 7, severity: "Major", likelihood: "Rare" });
    mockUpdate.mockResolvedValue({ id: 7 });
  });

  it("treats a risk the requester cannot see as missing", async () => {
    // getRiskByIdQuery answers a hidden risk with null, as a missing one.
    mockGet.mockResolvedValue(null);
    await expect(run({ risk_id: 7, project_ids: [3] })).rejects.toThrow("no longer exists");
    expect(mockGet).toHaveBeenCalledWith(7, 1, viewer);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("passes the requester as the viewer, so linking is checked", async () => {
    await run({ risk_id: 7, project_ids: [3] });
    expect(mockUpdate.mock.calls[0][4]).toEqual({ viewer });
  });
});

describe("executeUpdateRisk risk level", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockViewer.mockResolvedValue(viewer);
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

  it("does not default a missing stored severity to Negligible", async () => {
    mockGet.mockResolvedValue({ id: 7, severity: null, likelihood: "Rare" });
    await run({ risk_id: 7, likelihood: "Likely" });
    expect(mockUpdate.mock.calls[0][1].risk_level_autocalculated).toBeNull();
  });

  it("does not touch the residual level when only inherent inputs change", async () => {
    mockGet.mockResolvedValue({
      id: 7,
      severity: "Negligible",
      likelihood: "Rare",
      likelihood_mitigation: "Rare",
      risk_severity: "Negligible",
      final_risk_level: "No risk",
    });
    await run({ risk_id: 7, severity: "Catastrophic" });
    const partial = mockUpdate.mock.calls[0][1];
    expect(partial.risk_level_autocalculated).toBe("High risk");
    expect("final_risk_level" in partial).toBe(false);
  });
});
