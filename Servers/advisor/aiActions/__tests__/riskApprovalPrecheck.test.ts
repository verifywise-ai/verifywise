jest.mock("../../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn().mockResolvedValue(false),
}));

import { roleHasPermission } from "../../../utils/rolePermissions.utils";
import { RISK_APPROVAL_FORBIDDEN_MESSAGE } from "../../../utils/riskApproval.utils";
import { riskApprovalRefusal } from "../riskApprovalPrecheck";

const mockIsAdmin = roleHasPermission as jest.Mock;

describe("riskApprovalRefusal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdmin.mockResolvedValue(false);
  });

  it("tells the LLM when the requester cannot decide", async () => {
    const message = await riskApprovalRefusal({
      existing: { risk_approval: 9, approval_status: "Pending" },
      input: { approval_status: "Approved" },
      userId: 2,
      organizationId: 1,
      role: "Editor",
    });
    expect(message).toContain(RISK_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("refuses naming yourself and approving in one create", async () => {
    expect(
      await riskApprovalRefusal({
        existing: null,
        input: { approver: 2, approval_status: "Approved" },
        userId: 2,
        organizationId: 1,
        role: "Editor",
      }),
    ).toContain(RISK_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("allows an Admin", async () => {
    mockIsAdmin.mockResolvedValue(true);
    expect(
      await riskApprovalRefusal({
        existing: { risk_approval: 9, approval_status: "Pending" },
        input: { approval_status: "Approved" },
        userId: 2,
        organizationId: 1,
        role: "Admin",
      }),
    ).toBeNull();
  });

  it("skips the check when no approval field is sent", async () => {
    expect(
      await riskApprovalRefusal({
        existing: { risk_approval: 9, approval_status: "Approved" },
        input: {},
        userId: 2,
        organizationId: 1,
        role: "Editor",
      }),
    ).toBeNull();
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });
});
