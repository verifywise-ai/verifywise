import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockRoleHasPermission = jest.fn(async (..._args: any[]): Promise<boolean> => false);
jest.mock("../rolePermissions.utils", () => ({
  roleHasPermission: (...args: any[]) => mockRoleHasPermission(...args),
}));

import {
  normalizeRiskApprovalStatus,
  RISK_APPROVAL_STATUSES,
} from "../../domain.layer/enums/risk-approval-status.enum";
import {
  callerCanDecideAnyRisk,
  resolveRiskApproval,
  RiskApprovalForbiddenError,
  RISK_APPROVAL_FORBIDDEN_MESSAGE,
} from "../riskApproval.utils";

const EDITOR = 10;
const APPROVER = 20;
const OTHER = 30;

describe("normalizeRiskApprovalStatus", () => {
  it("lists exactly the four values", () => {
    expect([...RISK_APPROVAL_STATUSES]).toEqual([
      "Pending",
      "Approved",
      "Rejected",
      "Not required",
    ]);
  });

  it.each([
    ["approved", "Approved"],
    ["Approved", "Approved"],
    [" REJECTED ", "Rejected"],
    ["pending", "Pending"],
    ["NOT_REQUIRED", "Not required"],
    ["not-required", "Not required"],
    ["Not   required", "Not required"],
  ])("maps %p to %p", (input, expected) => {
    expect(normalizeRiskApprovalStatus(input)).toBe(expected);
  });

  it.each([["In Progress"], [""], [null], [undefined], [42], ["Requires review"]])(
    "ignores %p",
    (input) => {
      expect(normalizeRiskApprovalStatus(input)).toBeUndefined();
    },
  );
});

describe("resolveRiskApproval on create", () => {
  it("defaults to Not required with no approver", () => {
    expect(
      resolveRiskApproval({
        existing: null,
        submitted: {},
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toEqual({ risk_approval: null, approval_status: "Not required", approverChangedTo: null });
  });

  it("sets Pending when an approver is named", () => {
    expect(
      resolveRiskApproval({
        existing: null,
        submitted: { risk_approval: APPROVER },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toEqual({ risk_approval: APPROVER, approval_status: "Pending", approverChangedTo: APPROVER });
  });

  it("sets Pending when an approver is named and the client sends Not required", () => {
    expect(
      resolveRiskApproval({
        existing: null,
        submitted: { risk_approval: APPROVER, approval_status: "Not required" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }).approval_status,
    ).toBe("Pending");
  });

  it("refuses Approved from an Editor who is not the approver", () => {
    expect(() =>
      resolveRiskApproval({
        existing: null,
        submitted: { risk_approval: APPROVER, approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toThrow(RiskApprovalForbiddenError);
  });

  it("refuses Approved from an Editor who names themself as approver", () => {
    expect(() =>
      resolveRiskApproval({
        existing: null,
        submitted: { risk_approval: EDITOR, approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toThrow(RiskApprovalForbiddenError);
  });

  it("honors Approved from an Admin", () => {
    expect(
      resolveRiskApproval({
        existing: null,
        submitted: { risk_approval: APPROVER, approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: true,
      }).approval_status,
    ).toBe("Approved");
  });

  it("ignores a legacy value such as In Progress", () => {
    expect(
      resolveRiskApproval({
        existing: null,
        submitted: { approval_status: "In Progress" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }).approval_status,
    ).toBe("Not required");
  });

  it("treats approver 0 or empty as no approver", () => {
    for (const none of [0, "", null]) {
      expect(
        resolveRiskApproval({
          existing: null,
          submitted: { risk_approval: none as any },
          callerId: EDITOR,
          callerIsAdmin: false,
        }),
      ).toEqual({ risk_approval: null, approval_status: "Not required", approverChangedTo: null });
    }
  });
});

describe("resolveRiskApproval on update", () => {
  const approved = { risk_approval: APPROVER, approval_status: "Approved" };

  it("lets an Editor re-save an Approved risk without touching the status", () => {
    expect(
      resolveRiskApproval({
        existing: approved,
        submitted: { risk_approval: APPROVER, approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toEqual({ risk_approval: APPROVER, approval_status: "Approved", approverChangedTo: null });
  });

  it("keeps the status when nothing approval-related is sent", () => {
    expect(
      resolveRiskApproval({
        existing: approved,
        submitted: {},
        callerId: EDITOR,
        callerIsAdmin: false,
      }).approval_status,
    ).toBe("Approved");
  });

  it("resets to Pending when an Editor changes the approver of an Approved risk", () => {
    expect(
      resolveRiskApproval({
        existing: approved,
        submitted: { risk_approval: OTHER, approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toEqual({ risk_approval: OTHER, approval_status: "Pending", approverChangedTo: OTHER });
  });

  it("sets Not required when the approver is cleared", () => {
    expect(
      resolveRiskApproval({
        existing: approved,
        submitted: { risk_approval: null, approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toEqual({ risk_approval: null, approval_status: "Not required", approverChangedTo: null });
  });

  it("lets the approver approve", () => {
    expect(
      resolveRiskApproval({
        existing: { risk_approval: APPROVER, approval_status: "Pending" },
        submitted: { approval_status: "Approved" },
        callerId: APPROVER,
        callerIsAdmin: false,
      }).approval_status,
    ).toBe("Approved");
  });

  it("lets an Admin reject", () => {
    expect(
      resolveRiskApproval({
        existing: { risk_approval: APPROVER, approval_status: "Pending" },
        submitted: { approval_status: "rejected" },
        callerId: OTHER,
        callerIsAdmin: true,
      }).approval_status,
    ).toBe("Rejected");
  });

  it("refuses Rejected from an Editor", () => {
    expect(() =>
      resolveRiskApproval({
        existing: { risk_approval: APPROVER, approval_status: "Pending" },
        submitted: { approval_status: "Rejected" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toThrow(RiskApprovalForbiddenError);
  });

  it("refuses Not required on an Approved risk from an Editor", () => {
    expect(() =>
      resolveRiskApproval({
        existing: approved,
        submitted: { approval_status: "Not required" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toThrow(RISK_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("ignores In Progress and keeps the current status", () => {
    expect(
      resolveRiskApproval({
        existing: { risk_approval: APPROVER, approval_status: "Pending" },
        submitted: { approval_status: "In Progress" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }).approval_status,
    ).toBe("Pending");
  });

  it("refuses a decision from the newly named approver in the same save", () => {
    // Naming yourself and approving in one save is a self-attested approval.
    expect(() =>
      resolveRiskApproval({
        existing: { risk_approval: null, approval_status: "Not required" },
        submitted: { risk_approval: EDITOR, approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toThrow(RiskApprovalForbiddenError);
  });

  it("refuses a decision when an approver replaces another and approves in one save", () => {
    expect(() =>
      resolveRiskApproval({
        existing: { risk_approval: APPROVER, approval_status: "Pending" },
        submitted: { risk_approval: EDITOR, approval_status: "Rejected" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).toThrow(RiskApprovalForbiddenError);
  });

  it("lets the newly named approver decide in a later save", () => {
    const named = resolveRiskApproval({
      existing: { risk_approval: null, approval_status: "Not required" },
      submitted: { risk_approval: EDITOR },
      callerId: EDITOR,
      callerIsAdmin: false,
    });
    expect(named.approval_status).toBe("Pending");
    expect(
      resolveRiskApproval({
        existing: { risk_approval: named.risk_approval, approval_status: named.approval_status },
        submitted: { approval_status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }).approval_status,
    ).toBe("Approved");
  });

  it("lets an Admin name an approver and decide in the same save", () => {
    expect(
      resolveRiskApproval({
        existing: { risk_approval: null, approval_status: "Not required" },
        submitted: { risk_approval: APPROVER, approval_status: "Rejected" },
        callerId: OTHER,
        callerIsAdmin: true,
      }),
    ).toEqual({
      risk_approval: APPROVER,
      approval_status: "Rejected",
      approverChangedTo: APPROVER,
    });
  });

  it("needs an approver for a decision, even from an Admin", () => {
    expect(
      resolveRiskApproval({
        existing: { risk_approval: null, approval_status: "Not required" },
        submitted: { approval_status: "Approved" },
        callerId: OTHER,
        callerIsAdmin: true,
      }).approval_status,
    ).toBe("Not required");
  });

  it("does not report an unchanged approver", () => {
    expect(
      resolveRiskApproval({
        existing: { risk_approval: APPROVER, approval_status: "Pending" },
        submitted: { risk_approval: String(APPROVER) as any },
        callerId: EDITOR,
        callerIsAdmin: false,
      }).approverChangedTo,
    ).toBeNull();
  });
});

describe("callerCanDecideAnyRisk", () => {
  beforeEach(() => {
    mockRoleHasPermission.mockReset();
  });

  it("asks for organization.admin", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(true);
    await expect(callerCanDecideAnyRisk(5, "Admin")).resolves.toBe(true);
    expect(mockRoleHasPermission).toHaveBeenCalledWith(5, "Admin", "organization.admin");
  });

  it("is false without a role", async () => {
    await expect(callerCanDecideAnyRisk(5, "")).resolves.toBe(false);
    expect(mockRoleHasPermission).not.toHaveBeenCalled();
  });
});
