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
  RISK_APPROVAL_SELF_APPROVER_MESSAGE,
} from "../riskApproval.utils";
import { ForbiddenException } from "../../domain.layer/exceptions/custom.exception";

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

type Existing = { risk_approval: number | null; approval_status: string | null } | null;

const resolve = (
  existing: Existing,
  submitted: { risk_approval?: number | string | null; approval_status?: unknown },
  callerId: number,
  callerIsAdmin = false,
) => resolveRiskApproval({ existing, submitted, callerId, callerIsAdmin });

const forbidden = (fn: () => unknown, message = RISK_APPROVAL_FORBIDDEN_MESSAGE) => {
  expect(fn).toThrow(RiskApprovalForbiddenError);
  expect(fn).toThrow(message);
};

describe("RiskApprovalForbiddenError", () => {
  it("is a ForbiddenException, so generic handlers answer 403", () => {
    const error = new RiskApprovalForbiddenError();
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).toBeInstanceOf(RiskApprovalForbiddenError);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe(RISK_APPROVAL_FORBIDDEN_MESSAGE);
  });
});

describe("resolveRiskApproval on create", () => {
  it("defaults to Not required with no approver", () => {
    expect(resolve(null, {}, EDITOR)).toEqual({
      risk_approval: null,
      approval_status: "Not required",
      approverChangedTo: null,
    });
  });

  it("sets Pending when an approver is named", () => {
    expect(resolve(null, { risk_approval: APPROVER }, EDITOR)).toEqual({
      risk_approval: APPROVER,
      approval_status: "Pending",
      approverChangedTo: APPROVER,
    });
  });

  it("sets Pending when an approver is named and the client sends Not required", () => {
    expect(
      resolve(null, { risk_approval: APPROVER, approval_status: "Not required" }, EDITOR)
        .approval_status,
    ).toBe("Pending");
  });

  it("refuses Approved from an Editor who is not the approver", () => {
    forbidden(() =>
      resolve(null, { risk_approval: APPROVER, approval_status: "Approved" }, EDITOR),
    );
  });

  it("refuses an Editor who names themself as approver", () => {
    forbidden(
      () => resolve(null, { risk_approval: EDITOR }, EDITOR),
      RISK_APPROVAL_SELF_APPROVER_MESSAGE,
    );
    forbidden(
      () => resolve(null, { risk_approval: EDITOR, approval_status: "Approved" }, EDITOR),
      RISK_APPROVAL_SELF_APPROVER_MESSAGE,
    );
  });

  it("honors Approved from an Admin", () => {
    expect(
      resolve(null, { risk_approval: APPROVER, approval_status: "Approved" }, EDITOR, true)
        .approval_status,
    ).toBe("Approved");
  });

  it("lets an Admin name themself", () => {
    expect(resolve(null, { risk_approval: OTHER }, OTHER, true).approval_status).toBe("Pending");
  });

  it.each([["Pending"], ["Approved"], ["Rejected"], ["In Progress"]])(
    "stores Not required for %p with no approver",
    (status) => {
      expect(resolve(null, { approval_status: status }, EDITOR).approval_status).toBe(
        "Not required",
      );
      expect(resolve(null, { approval_status: status }, OTHER, true).approval_status).toBe(
        "Not required",
      );
    },
  );

  it("treats approver 0 or empty as no approver", () => {
    for (const none of [0, "", null]) {
      expect(resolve(null, { risk_approval: none as any }, EDITOR)).toEqual({
        risk_approval: null,
        approval_status: "Not required",
        approverChangedTo: null,
      });
    }
  });
});

describe("resolveRiskApproval on update: status changes (R1)", () => {
  const approved = { risk_approval: APPROVER, approval_status: "Approved" };
  const pending = { risk_approval: APPROVER, approval_status: "Pending" };

  it("lets an Editor re-save an Approved risk without touching the status", () => {
    expect(
      resolve(approved, { risk_approval: APPROVER, approval_status: "Approved" }, EDITOR),
    ).toEqual({ risk_approval: APPROVER, approval_status: "Approved", approverChangedTo: null });
  });

  it("keeps the status when nothing approval-related is sent", () => {
    expect(resolve(approved, {}, EDITOR).approval_status).toBe("Approved");
  });

  it("lets the approver approve", () => {
    expect(resolve(pending, { approval_status: "Approved" }, APPROVER).approval_status).toBe(
      "Approved",
    );
  });

  it("lets an Admin reject", () => {
    expect(resolve(pending, { approval_status: "rejected" }, OTHER, true).approval_status).toBe(
      "Rejected",
    );
  });

  it.each([
    ["Pending", "Approved"],
    ["Pending", "Rejected"],
    ["Pending", "Not required"],
    ["Approved", "Not required"],
    ["Approved", "Pending"],
    ["Rejected", "Pending"],
    ["Not required", "Pending"],
    ["Not required", "Approved"],
  ])("refuses an Editor moving %p to %p while an approver is set", (from, to) => {
    forbidden(() =>
      resolve({ risk_approval: APPROVER, approval_status: from }, { approval_status: to }, EDITOR),
    );
  });

  it.each([
    ["Pending", "Not required"],
    ["Approved", "Pending"],
    ["Rejected", "Approved"],
  ])("lets the saved approver move %p to %p", (from, to) => {
    expect(
      resolve({ risk_approval: APPROVER, approval_status: from }, { approval_status: to }, APPROVER)
        .approval_status,
    ).toBe(to);
  });

  it("ignores In Progress and keeps the current status", () => {
    expect(resolve(pending, { approval_status: "In Progress" }, EDITOR).approval_status).toBe(
      "Pending",
    );
  });

  it("does not report an unchanged approver", () => {
    expect(
      resolve(pending, { risk_approval: String(APPROVER) as any }, EDITOR).approverChangedTo,
    ).toBeNull();
  });
});

describe("resolveRiskApproval on update: approver changes (R2)", () => {
  const approved = { risk_approval: APPROVER, approval_status: "Approved" };
  const rejected = { risk_approval: APPROVER, approval_status: "Rejected" };
  const pending = { risk_approval: APPROVER, approval_status: "Pending" };

  it("refuses an Editor re-assigning an Approved risk", () => {
    forbidden(() =>
      resolve(approved, { risk_approval: OTHER, approval_status: "Approved" }, EDITOR),
    );
    forbidden(() => resolve(approved, { risk_approval: OTHER }, EDITOR));
  });

  it("refuses an Editor clearing the approver of a Rejected risk", () => {
    forbidden(() => resolve(rejected, { risk_approval: null }, EDITOR));
  });

  it("lets the saved approver hand a decided risk on, which resets it to Pending", () => {
    expect(resolve(approved, { risk_approval: OTHER }, APPROVER)).toEqual({
      risk_approval: OTHER,
      approval_status: "Pending",
      approverChangedTo: OTHER,
    });
  });

  it("lets an Admin re-assign an Approved risk", () => {
    expect(resolve(approved, { risk_approval: OTHER }, EDITOR, true).approval_status).toBe(
      "Pending",
    );
  });

  it("lets an Editor change the approver of a Pending risk, resetting to Pending", () => {
    expect(resolve(pending, { risk_approval: OTHER }, EDITOR)).toEqual({
      risk_approval: OTHER,
      approval_status: "Pending",
      approverChangedTo: OTHER,
    });
  });

  it("lets an Editor clear the approver of a Pending risk, which sets Not required", () => {
    expect(resolve(pending, { risk_approval: null, approval_status: "Pending" }, EDITOR)).toEqual({
      risk_approval: null,
      approval_status: "Not required",
      approverChangedTo: null,
    });
  });

  it("lets an Editor name an approver on a Not required risk", () => {
    expect(
      resolve(
        { risk_approval: null, approval_status: "Not required" },
        { risk_approval: OTHER },
        EDITOR,
      ).approval_status,
    ).toBe("Pending");
  });

  it("refuses a decision from a non-Admin in the save that changes the approver", () => {
    forbidden(() =>
      resolve(pending, { risk_approval: OTHER, approval_status: "Rejected" }, APPROVER),
    );
    forbidden(() =>
      resolve(
        { risk_approval: null, approval_status: "Not required" },
        { risk_approval: OTHER, approval_status: "Approved" },
        EDITOR,
      ),
    );
  });

  it("lets an Admin name an approver and decide in the same save", () => {
    expect(
      resolve(
        { risk_approval: null, approval_status: "Not required" },
        { risk_approval: APPROVER, approval_status: "Rejected" },
        OTHER,
        true,
      ),
    ).toEqual({
      risk_approval: APPROVER,
      approval_status: "Rejected",
      approverChangedTo: APPROVER,
    });
  });
});

describe("resolveRiskApproval on update: naming yourself (R3)", () => {
  it("refuses an Editor naming themself as the new approver", () => {
    forbidden(
      () =>
        resolve(
          { risk_approval: null, approval_status: "Not required" },
          { risk_approval: EDITOR },
          EDITOR,
        ),
      RISK_APPROVAL_SELF_APPROVER_MESSAGE,
    );
    forbidden(
      () =>
        resolve(
          { risk_approval: APPROVER, approval_status: "Pending" },
          { risk_approval: EDITOR },
          EDITOR,
        ),
      RISK_APPROVAL_SELF_APPROVER_MESSAGE,
    );
  });

  it("lets the saved approver keep themself", () => {
    expect(
      resolve(
        { risk_approval: APPROVER, approval_status: "Pending" },
        { risk_approval: APPROVER, approval_status: "Approved" },
        APPROVER,
      ).approval_status,
    ).toBe("Approved");
  });

  it("lets an Admin name themself", () => {
    expect(
      resolve(
        { risk_approval: APPROVER, approval_status: "Approved" },
        { risk_approval: OTHER },
        OTHER,
        true,
      ).approverChangedTo,
    ).toBe(OTHER);
  });
});

describe("resolveRiskApproval on update: no approver (R4)", () => {
  const legacyApproved = { risk_approval: null, approval_status: "Approved" };

  it("keeps a legacy Approved status with no approver on an unrelated save", () => {
    expect(
      resolve(legacyApproved, { risk_approval: null, approval_status: "Approved" }, EDITOR),
    ).toEqual({
      risk_approval: null,
      approval_status: "Approved",
      approverChangedTo: null,
    });
    expect(resolve(legacyApproved, { risk_approval: 0 }, EDITOR).approval_status).toBe("Approved");
  });

  it("allows Not required on a risk with no approver", () => {
    expect(
      resolve(legacyApproved, { approval_status: "Not required" }, EDITOR).approval_status,
    ).toBe("Not required");
  });

  it.each([["Pending"], ["Approved"], ["Rejected"]])(
    "ignores %p on a Not required risk with no approver",
    (status) => {
      expect(
        resolve(
          { risk_approval: null, approval_status: "Not required" },
          { approval_status: status },
          OTHER,
          true,
        ).approval_status,
      ).toBe("Not required");
    },
  );

  it("ignores Pending on a legacy Approved risk with no approver", () => {
    expect(resolve(legacyApproved, { approval_status: "Pending" }, EDITOR).approval_status).toBe(
      "Approved",
    );
  });
});

describe("resolveRiskApproval for an Admin", () => {
  it.each([
    [
      { risk_approval: APPROVER, approval_status: "Approved" },
      { approval_status: "Pending" },
      "Pending",
    ],
    [{ risk_approval: APPROVER, approval_status: "Approved" }, { risk_approval: OTHER }, "Pending"],
    [
      { risk_approval: APPROVER, approval_status: "Rejected" },
      { risk_approval: null },
      "Not required",
    ],
    [
      { risk_approval: APPROVER, approval_status: "Pending" },
      { approval_status: "Not required" },
      "Not required",
    ],
    [
      { risk_approval: APPROVER, approval_status: "Pending" },
      { risk_approval: OTHER, approval_status: "Approved" },
      "Approved",
    ],
  ])("may change %p with %p", (existing, submitted, expected) => {
    expect(resolve(existing, submitted, OTHER, true).approval_status).toBe(expected);
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
