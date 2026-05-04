/**
 * Post-approval executor for `agent_create_task`.
 *
 * Called by the generic `executeAiAction` dispatcher in
 * `aiActions/executor.ts` once an approval for this tool reaches the
 * approved state. Runs inside the same transaction as the approval state
 * change, so any failure rolls the entire approval back.
 *
 * Unlike `createRisk` which goes through a service layer, tasks have no
 * service — `task.ctrl.ts` calls `createNewTaskQuery` directly. We do
 * the same here to keep the insert path identical to the HTTP controller.
 *
 * Field mapping:
 *   input.assignees  → second arg of createNewTaskQuery (array of ids)
 *   input.due_date   → new Date(...) — createNewTaskQuery expects a Date
 *   creator_id       → ctx.requesterId (the chatting user; matches what
 *                       the HTTP controller sets from the JWT)
 */

import { createNewTaskQuery } from "../../../utils/task.utils";
import { TaskPriority } from "../../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../../domain.layer/enums/task-status.enum";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentCreateTaskInput } from "./schema";

export async function executeCreateTask(
  ctx: AiActionExecuteContext<AgentCreateTaskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  const newTask = await createNewTaskQuery(
    {
      title: input.title,
      description: input.description,
      creator_id: ctx.requesterId,
      due_date: new Date(input.due_date),
      // The Zod schema's string enums line up with the TaskPriority /
      // TaskStatus enum values exactly ("Low"/"Medium"/"High" and
      // "Open"/"In Progress"/"Completed"). Cast so the interface
      // expects the enum type, not the narrower zod inference.
      priority: input.priority as TaskPriority,
      status: input.status as TaskStatus,
      categories: input.categories ?? [],
    },
    ctx.organizationId,
    ctx.transaction,
    // createNewTaskQuery accepts an array of plain ids or {user_id}
    // objects — the plain-id path matches what our schema produces.
    input.assignees.map((userId) => ({ user_id: userId })),
  );

  if (newTask.id == null) {
    throw new Error(
      "createNewTaskQuery returned a task without an id — refusing to record an empty execution result.",
    );
  }

  return { entityId: newTask.id };
}
