/**
 * `agent_delete_task` AI action handler.
 */

import type { AiActionHandler } from "../types";
import type { AgentDeleteTaskInput } from "./schema";
import { AgentDeleteTaskSchema } from "./schema";
import { deleteTaskToolDefinition } from "./definition";
import { DELETE_TASK_TOOL_NAME, fileDeleteTask } from "./file";
import { executeDeleteTask } from "./execute";
import { renderDeleteTaskPreview } from "./preview";

export const deleteTaskHandler: AiActionHandler<AgentDeleteTaskInput> = {
  toolName: DELETE_TASK_TOOL_NAME,
  label: "Delete task",
  toolDefinition: deleteTaskToolDefinition,
  schema: AgentDeleteTaskSchema,
  file: fileDeleteTask,
  execute: executeDeleteTask,
  renderPreview: renderDeleteTaskPreview,
};

export type { AgentDeleteTaskInput } from "./schema";
export { AgentDeleteTaskSchema } from "./schema";
