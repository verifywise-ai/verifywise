/**
 * Public surface of the AI Actions subsystem.
 *
 * External consumers only need four things:
 *
 *   - `executeAiAction`            — called by the approval pipeline
 *                                    (utils/approvalRequest.utils.ts) to
 *                                    run an approved action.
 *   - `aiActionToolDefinitions`    — merged into the LLM's tool list by
 *                                    the advisor controller.
 *   - `aiActionFilers`             — merged into `availableTools` by the
 *                                    advisor controller so the tool
 *                                    bridge can dispatch LLM tool calls.
 *   - `AiActionEntityData`         — TypeScript shape of the payload
 *                                    stored in `approval_requests.entity_data`.
 *
 * Everything else (individual handlers, schemas, preview renderers) is
 * an implementation detail of this module.
 */

export { executeAiAction, type AiActionEntityData, type AiActionResult } from "./executor";
export { aiActionToolDefinitions, aiActionFilers } from "./registry";
export type { AiActionHandler } from "./types";
