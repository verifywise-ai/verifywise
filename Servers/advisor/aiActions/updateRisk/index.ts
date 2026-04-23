/**
 * `agent_update_risk` AI action handler.
 *
 * Bundles the schema, tool definition, file-time function, post-approval
 * executor, and preview renderer into a single `AiActionHandler` so the
 * registry can index it by tool name.
 *
 * Note: the handler's `renderPreview` field is the fallback variant that
 * doesn't take a current-entity context. The full diff preview lives in
 * `preview.ts` as `renderUpdateRiskDiffPreview` and is called directly
 * from `file.ts` where the DB connection is available.
 */

import type { AiActionHandler } from "../types";
import type { AgentUpdateRiskInput } from "./schema";
import { AgentUpdateRiskSchema } from "./schema";
import { updateRiskToolDefinition } from "./definition";
import { UPDATE_RISK_TOOL_NAME, fileUpdateRisk } from "./file";
import { executeUpdateRisk } from "./execute";
import { renderUpdateRiskPreview } from "./preview";

export const updateRiskHandler: AiActionHandler<AgentUpdateRiskInput> = {
  toolName: UPDATE_RISK_TOOL_NAME,
  label: "Update risk",
  toolDefinition: updateRiskToolDefinition,
  schema: AgentUpdateRiskSchema as unknown as import("zod").z.ZodType<AgentUpdateRiskInput>,
  file: fileUpdateRisk,
  execute: executeUpdateRisk,
  renderPreview: renderUpdateRiskPreview,
};

// Re-exports for callers that want the types or schema directly without
// going through the handler.
export type { AgentUpdateRiskInput } from "./schema";
export { AgentUpdateRiskSchema } from "./schema";
