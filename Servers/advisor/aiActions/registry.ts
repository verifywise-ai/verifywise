/**
 * Registry of all AI write actions.
 *
 * Single source of truth for both:
 *   - The LLM-facing tool surface (definitions and filer functions wired
 *     into the tool bridge in `advisor.ctrl.ts`).
 *   - The post-approval dispatcher (`executor.ts`), which looks up the
 *     action's execute + schema by `tool_name`.
 *
 * Adding a new write tool:
 *
 *   1. Create `aiActions/<actionName>/` with schema.ts, definition.ts,
 *      file.ts, execute.ts, preview.ts, and an index.ts that exports an
 *      `AiActionHandler`.
 *   2. Import it here and add it to the `handlers` array.
 *
 * No other file needs to change — the composed tool lists and the
 * executor both pick it up automatically.
 */

import type { AiActionHandler } from "./types";
import { createRiskHandler } from "./createRisk";
import { updateRiskHandler } from "./updateRisk";
import { deleteRiskHandler } from "./deleteRisk";
import { createTaskHandler } from "./createTask";
import { updateTaskHandler } from "./updateTask";
import { deleteTaskHandler } from "./deleteTask";
import { registerModelHandler } from "./registerModel";
import { createModelRiskHandler } from "./createModelRisk";

/**
 * Ordered list of handlers. Order doesn't matter for correctness but it
 * does determine the order tools are listed when we iterate for building
 * the LLM's tool definition array.
 */
const handlers: AiActionHandler[] = [
  createRiskHandler as unknown as AiActionHandler,
  updateRiskHandler as unknown as AiActionHandler,
  deleteRiskHandler as unknown as AiActionHandler,
  createTaskHandler as unknown as AiActionHandler,
  updateTaskHandler as unknown as AiActionHandler,
  deleteTaskHandler as unknown as AiActionHandler,
  registerModelHandler as unknown as AiActionHandler,
  createModelRiskHandler as unknown as AiActionHandler,
];

/**
 * Handlers indexed by their LLM-facing tool name. The generic executor
 * uses this to dispatch post-approval execution by the `tool_name` stored
 * in `approval_requests.entity_data`.
 */
export const AI_ACTION_HANDLERS: Record<string, AiActionHandler> = Object.fromEntries(
  handlers.map((h) => [h.toolName, h]),
);

/**
 * Look up a handler by tool name. Returns `undefined` when no handler is
 * registered — callers should treat that as an error (it means either a
 * dead approval row pointing at a removed tool, or a tampered payload).
 */
export function getAiActionHandler(toolName: string): AiActionHandler | undefined {
  return AI_ACTION_HANDLERS[toolName];
}

/**
 * Tool definitions for all registered AI actions, in the shape the legacy
 * `bridgeTools` expects. Merged into the main tool list in
 * `advisor.ctrl.ts` alongside the read-tool definitions from
 * `advisor/tools/*.ts`.
 */
export const aiActionToolDefinitions = handlers.map((h) => h.toolDefinition);

/**
 * Filer functions keyed by tool name, matching the bridge's expected
 * `(params, tenant, userId?) => Promise<unknown>` signature. The return
 * type is widened intentionally — `bridgeTools` does not care about the
 * specific result shape, only that it can be JSON-stringified back to
 * the LLM.
 */
export const aiActionFilers: Record<
  string,
  (params: Record<string, unknown>, tenant: number, userId?: number) => Promise<unknown>
> = Object.fromEntries(handlers.map((h) => [h.toolName, h.file]));
