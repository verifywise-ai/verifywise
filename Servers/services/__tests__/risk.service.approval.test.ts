jest.mock("../../utils/risk.utils", () => ({
  createRiskQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
  lockRiskApprovalQuery: jest.fn(),
}));
jest.mock("../../utils/projectRiskChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
  recordProjectRiskCreation: jest.fn(),
  trackProjectRiskChanges: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({ writtenValues: jest.fn(() => ({})) }));
jest.mock("../../utils/rolePermissions.utils", () => ({ roleHasPermission: jest.fn() }));

import {
  createRiskQuery,
  lockRiskApprovalQuery,
  updateRiskByIdQuery,
} from "../../utils/risk.utils";
import { createRiskService, updateRiskService } from "../risk.service";
import { RiskApprovalForbiddenError } from "../../utils/riskApproval.utils";

const editor = { userId: 1, organizationId: 1, viewer: { system: true }, callerIsAdmin: false };
const approved = { id: 5, risk_approval: 20, approval_status: "Approved" };

const written = () => (updateRiskByIdQuery as jest.Mock).mock.calls[0][1];

describe("risk service approval status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createRiskQuery as jest.Mock).mockResolvedValue({ id: 5 });
    (updateRiskByIdQuery as jest.Mock).mockResolvedValue({ id: 5 });
    (lockRiskApprovalQuery as jest.Mock).mockResolvedValue(null);
  });

  it("creates with Not required by default", async () => {
    await createRiskService({ risk_name: "r" } as never, editor as never, undefined as never);
    const row = (createRiskQuery as jest.Mock).mock.calls[0][0];
    expect(row.approval_status).toBe("Not required");
    expect(row.risk_approval).toBeNull();
  });

  it("creates with Pending when an approver is named", async () => {
    await createRiskService(
      { risk_name: "r", risk_approval: 20, approval_status: "In Progress" } as never,
      editor as never,
      undefined as never,
    );
    expect((createRiskQuery as jest.Mock).mock.calls[0][0].approval_status).toBe("Pending");
  });

  it("leaves the status unwritten when an old client sends In Progress", async () => {
    await updateRiskService(
      5,
      { approval_status: "In Progress", risk_name: "x" } as never,
      approved as never,
      editor as never,
      undefined as never,
    );
    expect(written()).not.toHaveProperty("approval_status");
  });

  it("leaves the status unwritten when nothing approval-related is sent", async () => {
    await updateRiskService(
      5,
      { risk_name: "x" } as never,
      { ...approved, risk_approval: null } as never,
      editor as never,
      undefined as never,
    );
    expect(written()).not.toHaveProperty("approval_status");
  });

  it("refuses an Editor changing the approver of an Approved risk", async () => {
    await expect(
      updateRiskService(
        5,
        { risk_approval: 30, approval_status: "Approved" } as never,
        approved as never,
        editor as never,
        undefined as never,
      ),
    ).rejects.toBeInstanceOf(RiskApprovalForbiddenError);
    expect(updateRiskByIdQuery).not.toHaveBeenCalled();
  });

  it("keeps Pending when an Editor changes the approver of a Pending risk", async () => {
    await updateRiskService(
      5,
      { risk_approval: 30, approval_status: "Pending" } as never,
      { ...approved, approval_status: "Pending" } as never,
      editor as never,
      undefined as never,
    );
    // Pending already: only the approver is written.
    expect(written()).toMatchObject({ risk_approval: 30 });
    expect(written()).not.toHaveProperty("approval_status");
  });

  it("resolves against the locked row, not the caller's earlier read", async () => {
    // The caller read Pending; another save approved the risk meanwhile.
    (lockRiskApprovalQuery as jest.Mock).mockResolvedValue({
      risk_approval: 20,
      approval_status: "Approved",
    });
    await expect(
      updateRiskService(
        5,
        { risk_approval: 30 } as never,
        { ...approved, approval_status: "Pending" } as never,
        editor as never,
        "tx" as never,
      ),
    ).rejects.toBeInstanceOf(RiskApprovalForbiddenError);
    expect(lockRiskApprovalQuery).toHaveBeenCalledWith(5, 1, "tx");
  });

  it("does not lock the row when no approval field is sent", async () => {
    await updateRiskService(
      5,
      { risk_name: "x" } as never,
      approved as never,
      editor as never,
      undefined as never,
    );
    expect(lockRiskApprovalQuery).not.toHaveBeenCalled();
  });

  it("refuses an Editor's rejection before anything is written", async () => {
    await expect(
      updateRiskService(
        5,
        { approval_status: "Rejected" } as never,
        approved as never,
        editor as never,
        undefined as never,
      ),
    ).rejects.toBeInstanceOf(RiskApprovalForbiddenError);
    expect(updateRiskByIdQuery).not.toHaveBeenCalled();
  });
});
