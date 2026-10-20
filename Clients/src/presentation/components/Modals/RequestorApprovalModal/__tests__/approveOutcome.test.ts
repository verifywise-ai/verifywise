import { getApproveOutcome, getApproveOutcomeMessage } from "../approveOutcome";

const identity = (key: string) => key;

const request = (stepStatus: string, results: string[], requestStatus = "Pending") => ({
  status: requestStatus,
  steps: [
    {
      id: 10,
      status: stepStatus,
      approvals: results.map((approval_result) => ({ approval_result })),
    },
    { id: 11, status: "Pending", approvals: [{ approval_result: "Pending" }] },
  ],
});

describe("getApproveOutcome", () => {
  it("reports a fully approved request", () => {
    expect(getApproveOutcome(request("Completed", ["Approved"], "Approved"), 10)).toEqual({
      kind: "requestApproved",
    });
  });

  it("counts the approvers still pending on the voted step", () => {
    expect(getApproveOutcome(request("Pending", ["Approved", "Pending", "Pending"]), 10)).toEqual({
      kind: "waitingOnStep",
      remaining: 2,
    });
  });

  it("reports a move to the next step when the voted step completed", () => {
    expect(getApproveOutcome(request("Completed", ["Approved", "Pending"]), 10)).toEqual({
      kind: "movedToNextStep",
    });
  });

  it("falls back to a plain confirmation when the step is unknown or the data is missing", () => {
    expect(getApproveOutcome(request("Pending", ["Approved"]), undefined)).toEqual({
      kind: "recorded",
    });
    expect(getApproveOutcome(null, 10)).toEqual({ kind: "recorded" });
    expect(getApproveOutcome(request("Pending", ["Approved"]), 10)).toEqual({
      kind: "recorded",
    });
  });
});

describe("getApproveOutcomeMessage", () => {
  it("uses singular and plural wording for the remaining approvers", () => {
    expect(getApproveOutcomeMessage({ kind: "waitingOnStep", remaining: 1 }, identity)).toBe(
      "Your approval is recorded. Waiting on 1 more approver for this step.",
    );
    expect(getApproveOutcomeMessage({ kind: "waitingOnStep", remaining: 3 }, identity)).toBe(
      "Your approval is recorded. Waiting on 3 more approvers for this step.",
    );
  });

  it("fills the count after translating the template", () => {
    const t = (key: string) => (key.includes("{count}") ? "Noch {count} offen." : key);
    expect(getApproveOutcomeMessage({ kind: "waitingOnStep", remaining: 2 }, t)).toBe(
      "Noch 2 offen.",
    );
  });
});
