/**
 * `agent_update_task` AI action handler.
 */

import type { AiActionHandler } from "../types";
import type { AgentUpdateTaskInput } from "./schema";
import { AgentUpdateTaskSchema } from "./schema";
import { updateTaskToolDefinition } from "./definition";
import { UPDATE_TASK_TOOL_NAME, fileUpdateTask } from "./file";
import { executeUpdateTask } from "./execute";
import { renderUpdateTaskPreview } from "./preview";

export const updateTaskHandler: AiActionHandler<AgentUpdateTaskInput> = {
  toolName: UPDATE_TASK_TOOL_NAME,
  label: "Update task",
  toolDefinition: updateTaskToolDefinition,
  schema: AgentUpdateTaskSchema as unknown as import("zod").z.ZodType<AgentUpdateTaskInput>,
  file: fileUpdateTask,
  execute: executeUpdateTask,
  renderPreview: renderUpdateTaskPreview,
};

export type { AgentUpdateTaskInput } from "./schema";
export { AgentUpdateTaskSchema } from "./schema";
