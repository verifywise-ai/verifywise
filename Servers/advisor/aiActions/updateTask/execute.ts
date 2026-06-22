/**
 * Post-approval executor for `agent_update_task`.
 *
 * Delegates to `updateTaskByIdQuery` which handles permission checks,
 * partial field updates, and assignee replacement.
 *
 * The query needs userId + role for permission checks. We use the
 * original requester's id (from the approval request) and pass role
 * "Admin" since the approval itself already required an Admin to sign
 * off — re-checking role here would be redundant.
 */

import { updateTaskByIdQuery } from "../../../utils/task.utils";
import { TaskPriority } from "../../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../../domain.layer/enums/task-status.enum";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentUpdateTaskInput } from "./schema";

export async function executeUpdateTask(
  ctx: AiActionExecuteContext<AgentUpdateTaskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  const taskPartial: Record<string, unknown> = {};
  if (input.title !== undefined) taskPartial.title = input.title;
  if (input.description !== undefined) taskPartial.description = input.description;
  if (input.priority !== undefined) taskPartial.priority = input.priority as TaskPriority;
  if (input.status !== undefined) taskPartial.status = input.status as TaskStatus;
  if (input.due_date !== undefined) taskPartial.due_date = new Date(input.due_date);
  if (input.categories !== undefined) taskPartial.categories = input.categories;

  const updated = await updateTaskByIdQuery(
    {
      id: input.task_id,
      task: taskPartial,
      userId: ctx.requesterId,
      role: "Admin",
      transaction: ctx.transaction,
    },
    ctx.organizationId,
    input.assignees,
  );

  if (!updated || updated.id == null) {
    throw new Error(`updateTaskByIdQuery returned no row for task #${input.task_id}.`);
  }

  return { entityId: updated.id };
}
