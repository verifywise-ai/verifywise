jest.mock("../../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn().mockResolvedValue(false),
}));

import { roleHasPermission } from "../../../utils/rolePermissions.utils";
import {
  RISK_APPROVAL_FORBIDDEN_MESSAGE,
  RISK_APPROVAL_SELF_APPROVER_MESSAGE,
} from "../../../utils/riskApproval.utils";
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
      role: async () => "Editor",
    });
    expect(message).toContain(RISK_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("refuses naming yourself as the approver", async () => {
    expect(
      await riskApprovalRefusal({
        existing: null,
        input: { approver: 2, approval_status: "Approved" },
        userId: 2,
        organizationId: 1,
        role: async () => "Editor",
      }),
    ).toContain(RISK_APPROVAL_SELF_APPROVER_MESSAGE);
  });

  it("allows an Admin", async () => {
    mockIsAdmin.mockResolvedValue(true);
    expect(
      await riskApprovalRefusal({
        existing: { risk_approval: 9, approval_status: "Pending" },
        input: { approval_status: "Approved" },
        userId: 2,
        organizationId: 1,
        role: async () => "Admin",
      }),
    ).toBeNull();
  });

  it("skips the check, and the role lookup, when no approval field is sent", async () => {
    const role = jest.fn(async () => "Editor");
    expect(
      await riskApprovalRefusal({
        existing: { risk_approval: 9, approval_status: "Approved" },
        input: {},
        userId: 2,
        organizationId: 1,
        role,
      }),
    ).toBeNull();
    expect(role).not.toHaveBeenCalled();
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });
});
