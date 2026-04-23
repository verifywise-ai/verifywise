/**
 * `agent_create_task` AI action handler.
 *
 * Bundles the schema, tool definition, file-time function, post-approval
 * executor, and preview renderer into a single `AiActionHandler` so the
 * registry can index it by tool name.
 */

import type { AiActionHandler } from "../types";
import type { AgentCreateTaskInput } from "./schema";
import { AgentCreateTaskSchema } from "./schema";
import { createTaskToolDefinition } from "./definition";
import { CREATE_TASK_TOOL_NAME, fileCreateTask } from "./file";
import { executeCreateTask } from "./execute";
import { renderCreateTaskPreview } from "./preview";

export const createTaskHandler: AiActionHandler<AgentCreateTaskInput> = {
  toolName: CREATE_TASK_TOOL_NAME,
  label: "Create task",
  toolDefinition: createTaskToolDefinition,
  schema: AgentCreateTaskSchema,
  file: fileCreateTask,
  execute: executeCreateTask,
  renderPreview: renderCreateTaskPreview,
};

// Re-exports for callers that want the types or schema directly without
// going through the handler — keeps `createTask/` a single public surface.
export type { AgentCreateTaskInput } from "./schema";
export { AgentCreateTaskSchema } from "./schema";
