import { describe, it, expect } from "@jest/globals";

import {
  assertModelApprovalAllowed,
  assertModelApprovalInput,
  isModelStatusDecision,
  MODEL_APPROVAL_FORBIDDEN_MESSAGE,
  MODEL_DECISION_STATUSES,
  MODEL_STATUS_INVALID,
  ModelApprovalForbiddenError,
} from "../modelApproval.utils";
import { RISK_APPROVAL_SELF_APPROVER_MESSAGE } from "../riskApproval.utils";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const EDITOR = 10;
const APPROVER = 20;
const OTHER = 30;

type Args = Parameters<typeof assertModelApprovalAllowed>[0];

const run = (args: Partial<Args> & Pick<Args, "submitted">) =>
  assertModelApprovalAllowed({
    existing: null,
    callerId: EDITOR,
    callerIsAdmin: false,
    ...args,
  });

const refusal = (fn: () => void): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ModelApprovalForbiddenError);
    expect(error).toBeInstanceOf(ForbiddenException);
    return (error as Error).message;
  }
};

describe("isModelStatusDecision", () => {
  it("treats Approved, Restricted, Blocked and Rejected as decisions", () => {
    expect([...MODEL_DECISION_STATUSES]).toEqual(["Approved", "Restricted", "Blocked", "Rejected"]);
  });

  it.each(["Pending", "Retired", null, undefined, "", "approved"])("%p is not a decision", (s) => {
    expect(isModelStatusDecision(s as string)).toBe(false);
  });
});

describe("assertModelApprovalAllowed: R1, status changes with a saved approver", () => {
  const pendingWithApprover = { approver: APPROVER, status: "Pending" };

  it("refuses an Editor who is not the approver moving Pending to Approved", () => {
    expect(
      refusal(() => run({ existing: pendingWithApprover, submitted: { status: "Approved" } })),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it.each(["Approved", "Restricted", "Blocked", "Rejected"])(
    "lets the saved approver set %s",
    (status) => {
      expect(
        refusal(() =>
          run({ existing: pendingWithApprover, submitted: { status }, callerId: APPROVER }),
        ),
      ).toBeNull();
    },
  );

  it("lets an Admin set Blocked", () => {
    expect(
      refusal(() =>
        run({
          existing: pendingWithApprover,
          submitted: { status: "Blocked" },
          callerIsAdmin: true,
        }),
      ),
    ).toBeNull();
  });

  it("refuses moving an Approved model back to Pending", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: APPROVER, status: "Approved" },
          submitted: { status: "Pending" },
        }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("does not treat sending the stored status back as a change", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: APPROVER, status: "Approved" },
          submitted: { status: "Approved", approver: APPROVER },
        }),
      ),
    ).toBeNull();
  });

  it("lets anyone move between undecided statuses (Pending to Retired)", () => {
    expect(
      refusal(() => run({ existing: pendingWithApprover, submitted: { status: "Retired" } })),
    ).toBeNull();
  });

  it("refuses an approver id sent as a string that only looks like a change", () => {
    // "20" is the saved approver: not a change, so the Editor still cannot decide.
    expect(
      refusal(() =>
        run({ existing: pendingWithApprover, submitted: { status: "Approved", approver: "20" } }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("refuses clearing the approver and deciding in the same save", () => {
    expect(
      refusal(() =>
        run({ existing: pendingWithApprover, submitted: { approver: null, status: "Approved" } }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("leaves a model with no approver to anyone who can edit it", () => {
    expect(
      refusal(() =>
        run({ existing: { approver: null, status: "Pending" }, submitted: { status: "Approved" } }),
      ),
    ).toBeNull();
  });
});

describe("assertModelApprovalAllowed: R2, approver changes on a decided model", () => {
  it("refuses an Editor re-assigning an Approved model", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: APPROVER, status: "Approved" },
          submitted: { approver: OTHER },
        }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("refuses an Editor clearing the approver of a Blocked model", () => {
    expect(
      refusal(() =>
        run({ existing: { approver: APPROVER, status: "Blocked" }, submitted: { approver: "" } }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("lets the saved approver hand a decided model to someone else", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: APPROVER, status: "Approved" },
          submitted: { approver: OTHER },
          callerId: APPROVER,
        }),
      ),
    ).toBeNull();
  });

  it("refuses a non-Admin naming an approver on an Approved model with none", () => {
    expect(
      refusal(() =>
        run({ existing: { approver: null, status: "Approved" }, submitted: { approver: OTHER } }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("refuses it when the same save keeps or picks another decision", () => {
    for (const status of ["Approved", "Blocked"]) {
      expect(
        refusal(() =>
          run({
            existing: { approver: null, status: "Approved" },
            submitted: { approver: OTHER, status },
          }),
        ),
      ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
    }
  });

  it("lets a non-Admin name one in the save that moves it back to Pending", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: null, status: "Approved" },
          submitted: { approver: OTHER, status: "Pending" },
        }),
      ),
    ).toBeNull();
  });

  it("lets an Admin name one on a decided model with none", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: null, status: "Approved" },
          submitted: { approver: OTHER },
          callerIsAdmin: true,
        }),
      ),
    ).toBeNull();
  });

  it("refuses an Editor re-assigning a Pending model with a saved approver", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: APPROVER, status: "Pending" },
          submitted: { approver: OTHER },
        }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("refuses an Editor clearing the approver of a Pending model (step one of two)", () => {
    expect(
      refusal(() =>
        run({ existing: { approver: APPROVER, status: "Pending" }, submitted: { approver: null } }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });

  it("lets an Admin clear the approver of a Pending model", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: APPROVER, status: "Pending" },
          submitted: { approver: null },
          callerIsAdmin: true,
        }),
      ),
    ).toBeNull();
  });

  it("lets an Editor name a first approver on a Pending model", () => {
    expect(
      refusal(() =>
        run({ existing: { approver: null, status: "Pending" }, submitted: { approver: OTHER } }),
      ),
    ).toBeNull();
  });
});

describe("assertModelApprovalAllowed: R3 and the naming save", () => {
  it("refuses a non-Admin naming themself as approver", () => {
    expect(
      refusal(() =>
        run({ existing: { approver: null, status: "Pending" }, submitted: { approver: EDITOR } }),
      ),
    ).toBe(RISK_APPROVAL_SELF_APPROVER_MESSAGE);
  });

  it("refuses a non-Admin naming themself and deciding on create", () => {
    expect(refusal(() => run({ submitted: { approver: EDITOR, status: "Approved" } }))).toBe(
      RISK_APPROVAL_SELF_APPROVER_MESSAGE,
    );
  });

  it("refuses a non-Admin naming someone else and deciding in one save", () => {
    expect(refusal(() => run({ submitted: { approver: OTHER, status: "Approved" } }))).toBe(
      MODEL_APPROVAL_FORBIDDEN_MESSAGE,
    );
  });

  it("lets a non-Admin name someone else on a Pending create", () => {
    expect(refusal(() => run({ submitted: { approver: OTHER, status: "Pending" } }))).toBeNull();
  });

  it("lets a non-Admin create an Approved model with no approver", () => {
    expect(refusal(() => run({ submitted: { status: "Approved" } }))).toBeNull();
  });

  it("lets an Admin name themself and decide", () => {
    expect(
      refusal(() =>
        run({ submitted: { approver: EDITOR, status: "Approved" }, callerIsAdmin: true }),
      ),
    ).toBeNull();
  });

  it("lets the saved approver keep themself", () => {
    expect(
      refusal(() =>
        run({
          existing: { approver: APPROVER, status: "Pending" },
          submitted: { approver: APPROVER, status: "Approved" },
          callerId: APPROVER,
        }),
      ),
    ).toBeNull();
  });
});

describe("assertModelApprovalInput: malformed status and approver", () => {
  it.each([[["Approved"]], [{}], [1], [true]])("refuses status %p with a 400", (status) => {
    for (const creating of [true, false]) {
      expect(() => assertModelApprovalInput({ status }, { creating })).toThrow(ValidationException);
    }
  });

  it("refuses a status that is not a model status", () => {
    expect(() => assertModelApprovalInput({ status: "Deployed" }, { creating: true })).toThrow(
      MODEL_STATUS_INVALID,
    );
  });

  it("treats an empty or null status on create as not sent (legacy)", () => {
    expect(assertModelApprovalInput({ status: "" }, { creating: true })).not.toHaveProperty(
      "status",
    );
    expect(assertModelApprovalInput({ status: null }, { creating: true })).not.toHaveProperty(
      "status",
    );
  });

  it("refuses an empty or null status on update", () => {
    expect(() => assertModelApprovalInput({ status: "" }, { creating: false })).toThrow(
      ValidationException,
    );
    expect(() => assertModelApprovalInput({ status: null }, { creating: false })).toThrow(
      ValidationException,
    );
  });

  it.each([[[5]], [{ id: 5 }], ["5a"], [1.5], [true]])("refuses approver %p", (approver) => {
    expect(() => assertModelApprovalInput({ approver }, { creating: false })).toThrow(
      ValidationException,
    );
  });

  it.each([[null], [""], [5], ["5"], [undefined]])("accepts approver %p", (approver) => {
    expect(() => assertModelApprovalInput({ approver }, { creating: false })).not.toThrow();
  });
});

describe("assertModelApprovalAllowed fails closed on a malformed status", () => {
  it.each([[["Approved"]], [{}], [3]])("treats status %p as a decision change", (status) => {
    expect(
      refusal(() =>
        run({ existing: { approver: APPROVER, status: "Pending" }, submitted: { status } }),
      ),
    ).toBe(MODEL_APPROVAL_FORBIDDEN_MESSAGE);
  });
});

describe("approver ids are normalized once", () => {
  it('reads "07" as 7, so a saved approver 7 sent as "07" is unchanged', () => {
    const input = assertModelApprovalInput({ approver: "07" }, { creating: false });
    expect(input.approver).toBe(7);
    expect(() =>
      assertModelApprovalAllowed({
        existing: { approver: 7, status: "Approved" },
        submitted: { approver: input.approver, status: "Approved" },
        callerId: EDITOR,
        callerIsAdmin: false,
      }),
    ).not.toThrow();
  });

  it('reads "", null, 0 and "0" as none (the legacy meaning; v1 refuses 0 earlier)', () => {
    for (const approver of ["", null, 0, "0"]) {
      expect(assertModelApprovalInput({ approver }, { creating: true }).approver).toBeNull();
    }
  });

  it.each([["00"], ["-1"], ["1e3"], [2147483648], ["2147483648"], [-3]])(
    "refuses approver %p with a 400",
    (approver) => {
      expect(() => assertModelApprovalInput({ approver }, { creating: false })).toThrow(
        ValidationException,
      );
    },
  );
});
