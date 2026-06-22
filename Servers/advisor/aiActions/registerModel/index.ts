/**
 * `agent_register_model` AI action handler.
 *
 * Bundles schema, tool definition, file-time function, post-approval
 * executor, and preview renderer into a single `AiActionHandler` so the
 * registry can index it by tool name.
 */

import type { AiActionHandler } from "../types";
import type { AgentRegisterModelInput } from "./schema";
import { AgentRegisterModelSchema } from "./schema";
import { registerModelToolDefinition } from "./definition";
import { REGISTER_MODEL_TOOL_NAME, fileRegisterModel } from "./file";
import { executeRegisterModel } from "./execute";
import { renderRegisterModelPreview } from "./preview";

export const registerModelHandler: AiActionHandler<AgentRegisterModelInput> = {
  toolName: REGISTER_MODEL_TOOL_NAME,
  label: "Register model",
  toolDefinition: registerModelToolDefinition,
  schema: AgentRegisterModelSchema,
  file: fileRegisterModel,
  execute: executeRegisterModel,
  renderPreview: renderRegisterModelPreview,
};

export type { AgentRegisterModelInput } from "./schema";
export { AgentRegisterModelSchema } from "./schema";
