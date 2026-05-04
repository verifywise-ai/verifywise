/**
 * Shared types for the AI Actions subsystem.
 *
 * An "AI action" is a write tool the LLM can propose which must be approved
 * by a human before it runs. Each action is a single `AiActionHandler` that
 * co-locates:
 *
 *   1. `toolDefinition`  — the JSON-schema'd function definition shown to
 *                          the LLM at tool-selection time.
 *   2. `schema`          — a strict Zod schema used for BOTH file-time
 *                          validation (when the LLM proposes the action)
 *                          and execute-time re-validation (after approval,
 *                          in case the schema evolved or the stored
 *                          payload was tampered with).
 *   3. `file`            — the function invoked by the LLM via the tool
 *                          bridge. Opens its own transaction, creates an
 *                          `approval_request` row with `entity_type =
 *                          'ai_action'`, and returns a pending-approval
 *                          status. Must NOT perform the underlying write.
 *   4. `execute`         — the function invoked by the generic AI action
 *                          executor after the approval reaches the
 *                          approved state. Runs inside the approval's
 *                          transaction. Performs the actual write and
 *                          returns `{ entityId }`. Throws on failure;
 *                          the surrounding transaction will roll back.
 *   5. `renderPreview`   — a pure function producing a short human label
 *                          ("Create a Major/likely risk 'X'") that the
 *                          approval modal displays so reviewers don't
 *                          have to read the raw JSON.
 *
 * Adding a new write tool is a self-contained change: create a new
 * `aiActions/<actionName>/` directory with these 5 pieces, then add the
 * handler to the registry in `aiActions/registry.ts`. No other file needs
 * to be touched — the tool bridge and the post-approval executor both
 * dispatch through the registry.
 */

import type { Transaction } from "sequelize";
import type { z } from "zod";

/**
 * Shape of a single tool definition as consumed by `bridgeTools` and the
 * AI SDK's tool-calling API. Mirrors the existing legacy tool definition
 * shape used throughout `advisor/tools/*.ts`.
 */
export interface AiActionToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Return shape for a filer function. Matches what the LLM will see as the
 * tool call's result, so keep fields stable across versions.
 */
export type AiActionFileResult =
  | {
      status: "pending_approval";
      approvalRequestId: number;
      preview: string;
      message: string;
    }
  | {
      status: "validation_failed";
      errors: Array<{ path: string; message: string }>;
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

/**
 * Context passed to an action's `execute` function after approval.
 *
 * `inputParams` has already been re-validated against the handler's Zod
 * schema by the generic executor, so implementations can safely cast.
 */
export interface AiActionExecuteContext<TInput = unknown> {
  /**
   * User id of the person who originally proposed the action via the AI
   * advisor. Used as `changed_by` in change history and, where the
   * action's schema does not expose an explicit owner, as the default
   * owner for any rows the execute function creates.
   */
  requesterId: number;
  organizationId: number;
  transaction: Transaction;
  /** Raw stored input, already parsed + validated by the executor. */
  inputParams: TInput;
  /** Id of the approval_request row the action is being executed for. */
  approvalRequestId: number;
}

export interface AiActionExecuteResult {
  /** Primary key of the row the action created (or updated). */
  entityId: number;
}

/**
 * A complete AI action. The generic parameter binds the schema's inferred
 * type to the execute context and preview renderer so implementations
 * can't drift — change the schema and TypeScript forces the other files
 * in the action's directory to follow.
 */
export interface AiActionHandler<TInput = unknown> {
  /**
   * The tool name as the LLM sees it. Must be unique across all handlers
   * and must match the value stored in `approval_requests.entity_data.tool_name`.
   */
  toolName: string;

  /** Human-readable label for logs and audit trails. */
  label: string;

  toolDefinition: AiActionToolDefinition;

  schema: z.ZodType<TInput>;

  /**
   * Invoked by the LLM via `bridgeTools`. Signature matches the bridge's
   * `(params, tenant, userId?) => Promise<unknown>` expectation.
   *
   * Implementations must:
   *   1. Validate `params` against `schema` (the bridge does NOT do this).
   *   2. Open a transaction, ensure the AI Action workflow exists for the
   *      tenant, and insert an `approval_request` with `entity_type =
   *      'ai_action'` and an `entity_data` payload conforming to the
   *      `AiActionEntityData` shape in `executor.ts`.
   *   3. Return `AiActionFileResult`.
   *
   * Must NOT perform the underlying write — that happens only after
   * approval, in `execute`.
   */
  file: (
    params: Record<string, unknown>,
    tenant: number,
    userId?: number,
  ) => Promise<AiActionFileResult>;

  /**
   * Invoked by the generic executor (`aiActions/executor.ts`) after the
   * approval reaches the approved state. Runs inside the same transaction
   * as the approval state change, so any error rolls both back.
   */
  execute: (ctx: AiActionExecuteContext<TInput>) => Promise<AiActionExecuteResult>;

  /**
   * Pure function that produces a short human-readable summary of the
   * proposed action, shown in the approval modal. Must not depend on any
   * external state — it's called both at file-time (to stash in
   * entity_data) and potentially again at display time.
   */
  renderPreview: (input: TInput) => string;
}
