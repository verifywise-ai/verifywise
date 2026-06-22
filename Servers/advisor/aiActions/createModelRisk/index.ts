/**
 * `agent_create_model_risk` AI action handler — the user-driven path.
 *
 * For the AI auto-suggest flow that produces inline chat-card approvals,
 * see `agent_suggest_model_risk` in advisor/functions/modelRiskFunctions.ts.
 */

import type { AiActionHandler } from "../types";
import type { AgentCreateModelRiskInput } from "./schema";
import { AgentCreateModelRiskSchema } from "./schema";
import { createModelRiskToolDefinition } from "./definition";
import { CREATE_MODEL_RISK_TOOL_NAME, fileCreateModelRisk } from "./file";
import { executeCreateModelRisk } from "./execute";
import { renderCreateModelRiskPreview } from "./preview";

export const createModelRiskHandler: AiActionHandler<AgentCreateModelRiskInput> = {
  toolName: CREATE_MODEL_RISK_TOOL_NAME,
  label: "Create model risk",
  toolDefinition: createModelRiskToolDefinition,
  schema: AgentCreateModelRiskSchema,
  file: fileCreateModelRisk,
  execute: executeCreateModelRisk,
  renderPreview: renderCreateModelRiskPreview,
};

export type { AgentCreateModelRiskInput } from "./schema";
export { AgentCreateModelRiskSchema } from "./schema";
