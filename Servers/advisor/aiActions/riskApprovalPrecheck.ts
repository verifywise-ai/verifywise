/**
 * File-time check for the advisor's risk create and update actions: would the
 * requester be allowed the approval decision they asked for? Answered before
 * an approval request is filed, so the LLM can tell the user instead of
 * filing a request that fails when an Admin approves it. The executors run
 * the same rule again (resolveRiskApproval inside the risk service or the
 * update executor), since the risk can change in between.
 */

import {
  callerCanDecideAnyRisk,
  resolveRiskApproval,
  RiskApprovalForbiddenError,
  RISK_APPROVAL_FORBIDDEN_MESSAGE,
} from "../../utils/riskApproval.utils";

export async function riskApprovalRefusal({
  existing,
  input,
  userId,
  organizationId,
  role,
}: {
  existing: { risk_approval?: number | null; approval_status?: string | null } | null;
  input: { approver?: number; approval_status?: string };
  userId: number;
  organizationId: number;
  role: string;
}): Promise<string | null> {
  if (input.approver === undefined && input.approval_status === undefined) return null;
  try {
    resolveRiskApproval({
      existing: existing
        ? {
            risk_approval: existing.risk_approval ?? null,
            approval_status: existing.approval_status ?? null,
          }
        : null,
      submitted: { risk_approval: input.approver, approval_status: input.approval_status },
      callerId: userId,
      callerIsAdmin: await callerCanDecideAnyRisk(organizationId, role),
    });
    return null;
  } catch (error) {
    if (!(error instanceof RiskApprovalForbiddenError)) throw error;
    return `${RISK_APPROVAL_FORBIDDEN_MESSAGE} Tell the user this. Naming an approver sets the status to Pending; the approver decides in a later change.`;
  }
}
