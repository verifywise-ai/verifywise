/**
 * Human Confirmation Flow — Write Tool Wrapper (Phase 2: XState-backed)
 *
 * Wraps any write function so it routes through the approval state machine.
 * Auto-approve for info-level, human approval for warning/danger.
 * The actual execution happens via the approval gateway.
 */

import { submitForApproval } from "../approval/approvalGateway";
import type { WarningLevel, ConfirmationToolResult } from "./types";

export type WriteExecuteFn = (
  params: Record<string, unknown>,
  organizationId: number,
) => Promise<unknown>;

interface WriteToolConfig {
  toolName: string;
  warningLevel: WarningLevel;
  descriptionFn: (params: Record<string, unknown>) => string;
  executeFn: WriteExecuteFn;
  /**
   * Throws on parameters the tool must refuse outright. It runs before the
   * request is submitted for approval, so an invalid call never queues an
   * approval card, and again before execution.
   */
  validateFn?: (params: Record<string, unknown>) => void;
}

/**
 * Registry of write tool executors.
 * The approval gateway uses this to look up and execute the actual function.
 */
export const writeToolExecutors = new Map<string, WriteExecuteFn>();

/**
 * Creates a tool function that routes through the XState approval state machine.
 *
 * - info-level: auto-approved and executed immediately, returns actual result
 * - warning/danger: stored as pending, returns ConfirmationToolResult for UI
 * - no executor: auto-rejected
 */
export function createWriteToolFn(
  config: WriteToolConfig,
): (
  params: Record<string, unknown>,
  organizationId: number,
) => Promise<ConfirmationToolResult | unknown> {
  // Register the executor so the gateway can find it
  const { validateFn, executeFn } = config;
  writeToolExecutors.set(
    config.toolName,
    validateFn
      ? async (params, organizationId) => {
          validateFn(params);
          return executeFn(params, organizationId);
        }
      : executeFn,
  );

  return async (
    params: Record<string, unknown>,
    organizationId: number,
  ): Promise<ConfirmationToolResult | unknown> => {
    validateFn?.(params);
    const userId = (params._userId as number) || 0;
    const sanitized = sanitizeParams(params);
    const description = config.descriptionFn(sanitized);

    const result = await submitForApproval({
      organizationId,
      userId,
      toolName: config.toolName,
      actionType: deriveActionType(config.toolName),
      riskLevel: config.warningLevel,
      description,
      inputParams: sanitized,
    });

    switch (result.outcome) {
      case "completed":
        // Auto-approved and executed — return the actual result to the LLM
        return result.executionResult;

      case "pending":
        // Needs human approval — return confirmation payload for the UI
        return result.confirmationResult!;

      case "rejected":
        // Auto-rejected — throw so the LLM sees the error
        throw new Error(result.errorMessage || "Operation auto-rejected");

      default:
        throw new Error(`Unexpected approval outcome: ${result.outcome}`);
    }
  };
}

/**
 * Derive action type from tool name.
 */
function deriveActionType(toolName: string): string {
  if (toolName.includes("delete") || toolName.includes("remove")) return "delete";
  if (toolName.includes("archive")) return "archive";
  if (toolName.includes("create") || toolName.includes("register") || toolName.includes("add"))
    return "create";
  return "update";
}

/**
 * Remove internal/sensitive fields from params before showing to user.
 */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...params };
  delete sanitized._userId;
  delete sanitized._organizationId;
  return sanitized;
}
