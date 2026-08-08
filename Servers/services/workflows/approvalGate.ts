import { submitWorkflowGate } from "../../advisor/approval/approvalGateway";
import logger from "../../utils/logger/fileLogger";
import { StepResult, WorkflowContext } from "./types";

/**
 * Pause a gated step for human approval, creating the approval record that
 * makes the pause resumable.
 *
 * A bare `{ type: "pause" }` leaves ai_workflow_runs.awaiting_approval_id NULL,
 * and the only resume path matches on that column — so the run parks forever.
 * Every gated step goes through here so that cannot be forgotten one site at a
 * time.
 */
export async function requestGateApproval(
  ctx: WorkflowContext,
  workflowId: string,
  stepId: string,
  description: string,
): Promise<StepResult> {
  try {
    const approvalId = await submitWorkflowGate({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      // WorkflowContext carries no workflow id, so each definition passes its
      // own. It lands in the approval's input_params, which is what makes the
      // Admin queue readable without joining back to the run.
      workflowId,
      workflowRunId: ctx.workflowRunId,
      stepId,
      description,
    });
    return { type: "pause", reason: description, approvalId };
  } catch (error) {
    // Failing loudly beats pausing on an approval that does not exist, which
    // is indistinguishable from the bug this replaces.
    logger.error(`[workflow] could not create gate approval for ${stepId}:`, error);
    return {
      type: "fail",
      error: `could not create approval for gated step ${stepId}`,
    };
  }
}
