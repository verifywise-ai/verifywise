import { fill } from "../../../../i18n/fill";

/**
 * What an approve click did to the request. A step can need every approver,
 * so one approval often leaves the step (and the request) pending; the
 * approver needs to be told that, or the click looks like it did nothing.
 */
export type ApproveOutcome =
  | { kind: "requestApproved" }
  | { kind: "waitingOnStep"; remaining: number }
  | { kind: "movedToNextStep" }
  | { kind: "recorded" };

export interface RequestAfterApprove {
  status?: string;
  steps?: {
    id: number;
    status?: string;
    approvals?: { approval_result?: string }[];
  }[];
}

/**
 * Reads the request as fetched right after the approve call.
 * `votedStepId` is the step that was current when the user approved.
 */
export function getApproveOutcome(
  request: RequestAfterApprove | null | undefined,
  votedStepId: number | undefined,
): ApproveOutcome {
  if (request?.status?.toLowerCase() === "approved") {
    return { kind: "requestApproved" };
  }

  const step = request?.steps?.find((s) => s.id === votedStepId);
  if (!step) {
    return { kind: "recorded" };
  }

  if (step.status?.toLowerCase() === "completed") {
    return { kind: "movedToNextStep" };
  }

  const remaining = (step.approvals ?? []).filter(
    (a) => a.approval_result?.toLowerCase() === "pending",
  ).length;
  return remaining > 0 ? { kind: "waitingOnStep", remaining } : { kind: "recorded" };
}

/**
 * Whether listeners of the approved entity (file lists, the table an AI
 * action writes to) should refetch. The entity only changes once the last
 * step completes; an approval that leaves the request pending changes
 * nothing. If the refresh failed the outcome is unknown, so they refetch.
 */
export function approveMayHaveChangedEntity(
  request: RequestAfterApprove | null | undefined,
): boolean {
  return request ? request.status?.toLowerCase() === "approved" : true;
}

export function getApproveOutcomeMessage(
  outcome: ApproveOutcome,
  t: (key: string) => string,
): string {
  switch (outcome.kind) {
    case "requestApproved":
      return t("Request approved successfully!");
    case "waitingOnStep":
      return outcome.remaining === 1
        ? t("Your approval is recorded. Waiting on 1 more approver for this step.")
        : fill(t("Your approval is recorded. Waiting on {count} more approvers for this step."), {
            count: outcome.remaining,
          });
    case "movedToNextStep":
      return t("Your approval is recorded. The request moved to the next step.");
    case "recorded":
      return t("Your approval is recorded.");
  }
}
