/**
 * `agent_delete_risk` AI action handler.
 *
 * Bundles the schema, tool definition, file-time function, post-approval
 * executor, and preview renderer into a single `AiActionHandler` so the
 * registry can index it by tool name.
 */

import type { AiActionHandler } from "../types";
import type { AgentDeleteRiskInput } from "./schema";
import { AgentDeleteRiskSchema } from "./schema";
import { deleteRiskToolDefinition } from "./definition";
import { DELETE_RISK_TOOL_NAME, fileDeleteRisk } from "./file";
import { executeDeleteRisk } from "./execute";
import { renderDeleteRiskPreview } from "./preview";

export const deleteRiskHandler: AiActionHandler<AgentDeleteRiskInput> = {
  toolName: DELETE_RISK_TOOL_NAME,
  label: "Delete risk",
  toolDefinition: deleteRiskToolDefinition,
  schema: AgentDeleteRiskSchema,
  file: fileDeleteRisk,
  execute: executeDeleteRisk,
  renderPreview: renderDeleteRiskPreview,
};

export type { AgentDeleteRiskInput } from "./schema";
export { AgentDeleteRiskSchema } from "./schema";
