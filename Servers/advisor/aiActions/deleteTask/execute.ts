/**
 * Post-approval executor for `agent_delete_task`.
 * Soft delete — sets status to "Deleted" via deleteTaskByIdQuery.
 */

import { deleteTaskByIdQuery } from "../../../utils/task.utils";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentDeleteTaskInput } from "./schema";

export async function executeDeleteTask(
  ctx: AiActionExecuteContext<AgentDeleteTaskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  const success = await deleteTaskByIdQuery({
    id: input.task_id,
    userId: ctx.requesterId,
    role: "Admin",
    transaction: ctx.transaction,
    organizationId: ctx.organizationId,
  });

  if (!success) {
    throw new Error(
      `Task #${input.task_id} could not be deleted — it may already be deleted or not found.`,
    );
  }

  return { entityId: input.task_id };
}
