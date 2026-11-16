jest.mock("../../../../utils/risk.utils", () => ({
  getRiskByIdQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
}));

jest.mock("../../../../utils/riskVisibility.utils", () => ({
  riskViewerForUserQuery: jest.fn(),
}));

jest.mock("../../../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../../../services/riskApproverNotification.service", () => ({
  notifyNewRiskApprover: jest.fn().mockResolvedValue(undefined),
}));

import { riskViewerForUserQuery } from "../../../../utils/riskVisibility.utils";
import { getRiskByIdQuery, updateRiskByIdQuery } from "../../../../utils/risk.utils";
import { roleHasPermission } from "../../../../utils/rolePermissions.utils";
import { notifyNewRiskApprover } from "../../../../services/riskApproverNotification.service";
import { RISK_APPROVAL_FORBIDDEN_MESSAGE } from "../../../../utils/riskApproval.utils";
import { executeUpdateRisk } from "../execute";

const mockGet = getRiskByIdQuery as jest.Mock;
const mockUpdate = updateRiskByIdQuery as jest.Mock;

const mockViewer = riskViewerForUserQuery as jest.Mock;
const viewer = { userId: 2, role: "Editor" };

const afterCommit = jest.fn();
const run = (inputParams: Record<string, unknown>) =>
  executeUpdateRisk({
    inputParams,
    organizationId: 1,
    requesterId: 2,
    transaction: { afterCommit },
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

describe("executeUpdateRisk approval", () => {
  const mockIsAdmin = roleHasPermission as jest.Mock;
  const mockNotify = notifyNewRiskApprover as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockViewer.mockResolvedValue(viewer);
    mockIsAdmin.mockResolvedValue(false);
    mockUpdate.mockImplementation(async (id: number, partial: Record<string, unknown>) => ({
      id,
      risk_name: "R",
      ...partial,
    }));
  });

  it("refuses a decision from a requester who is not the approver or an Admin", async () => {
    mockGet.mockResolvedValue({ id: 7, risk_approval: 9, approval_status: "Pending" });
    await expect(run({ risk_id: 7, approval_status: "Approved" })).rejects.toThrow(
      RISK_APPROVAL_FORBIDDEN_MESSAGE,
    );
    expect(mockIsAdmin).toHaveBeenCalledWith(1, "Editor", "organization.admin");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("lets the approver decide", async () => {
    mockGet.mockResolvedValue({ id: 7, risk_approval: 2, approval_status: "Pending" });
    await run({ risk_id: 7, approval_status: "Rejected" });
    expect(mockUpdate.mock.calls[0][1].approval_status).toBe("Rejected");
  });

  it("lets an Admin decide", async () => {
    mockIsAdmin.mockResolvedValue(true);
    mockGet.mockResolvedValue({ id: 7, risk_approval: 9, approval_status: "Pending" });
    await run({ risk_id: 7, approval_status: "Approved" });
    expect(mockUpdate.mock.calls[0][1].approval_status).toBe("Approved");
  });

  it("sets Pending and notifies after commit when the approver changes", async () => {
    mockGet.mockResolvedValue({ id: 7, risk_approval: 9, approval_status: "Approved" });
    await run({ risk_id: 7, approver: 11 });
    const partial = mockUpdate.mock.calls[0][1];
    expect(partial.risk_approval).toBe(11);
    expect(partial.approval_status).toBe("Pending");
    expect(mockNotify).not.toHaveBeenCalled();
    expect(afterCommit).toHaveBeenCalledTimes(1);
    afterCommit.mock.calls[0][0]();
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ id: 7, risk_approval: 11 }),
    );
  });

  it("does not touch the approval when no approval field is sent", async () => {
    mockGet.mockResolvedValue({ id: 7, risk_approval: 9, approval_status: "Approved" });
    await run({ risk_id: 7, review_notes: "n" });
    const partial = mockUpdate.mock.calls[0][1];
    expect("approval_status" in partial).toBe(false);
    expect("risk_approval" in partial).toBe(false);
    expect(afterCommit).not.toHaveBeenCalled();
  });
});
