/**
 * `agent_create_risk` AI action handler.
 *
 * Bundles the schema, tool definition, file-time function, post-approval
 * executor, and preview renderer into a single `AiActionHandler` so the
 * registry can index it by tool name.
 */

import type { AiActionHandler } from "../types";
import type { AgentCreateRiskInput } from "./schema";
import { AgentCreateRiskSchema } from "./schema";
import { createRiskToolDefinition } from "./definition";
import { CREATE_RISK_TOOL_NAME, fileCreateRisk } from "./file";
import { executeCreateRisk } from "./execute";
import { renderCreateRiskPreview } from "./preview";

export const createRiskHandler: AiActionHandler<AgentCreateRiskInput> = {
  toolName: CREATE_RISK_TOOL_NAME,
  label: "Create risk",
  toolDefinition: createRiskToolDefinition,
  schema: AgentCreateRiskSchema,
  file: fileCreateRisk,
  execute: executeCreateRisk,
  renderPreview: renderCreateRiskPreview,
};

// Re-exports for callers that want the types or schema directly without
// going through the handler — keeps `createRisk/` a single public surface.
export type { AgentCreateRiskInput } from "./schema";
export { AgentCreateRiskSchema } from "./schema";
