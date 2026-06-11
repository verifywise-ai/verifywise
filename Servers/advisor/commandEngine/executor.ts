/**
 * Phase 5 — Command Executor (issue 3812).
 *
 * Drives an ordered CommandStep[] to completion, streaming a StepStatusEvent
 * per transition. Per step, in order:
 *
 *   1. yield { executing }
 *   2. chain prior step results into the step inputs (under `_priorResults`)
 *   3. if requiresApproval → submitForApproval:
 *        - outcome "pending"   → yield { awaiting_approval, approvalId }, halt
 *                                 (the plan resumes out-of-band after approval)
 *        - outcome "completed" → capture executionResult, yield { completed }
 *        - outcome "rejected"  → yield { failed, error }, halt
 *      else (read step) → run the resolved tool executor directly
 *   4. yield { completed, result } and record the result for chaining
 *
 * Any thrown error yields { failed, error } and halts the remaining steps.
 *
 * The executor is pure orchestration: the actual tool executors and the
 * approval gateway are the side-effecting collaborators. Tool executors are
 * resolved via ctx.resolveToolExecutor so callers control the registry.
 */

import { submitForApproval } from "../approval/approvalGateway";
import type { CommandStep, StepStatusEvent } from "./types";

/**
 * A tool executor: matches the advisor's read/write tool signature
 * `(params, organizationId, userId?)`.
 */
export type ToolExecutor = (
  params: Record<string, unknown>,
  organizationId: number,
  userId?: number,
) => Promise<unknown>;

export interface CommandExecutionContext {
  organizationId: number;
  userId: number;
  conversationId?: string;
  llmKeyId?: number;
  /** Resolve a tool executor by name. Returns undefined when none is registered. */
  resolveToolExecutor: (toolName: string) => ToolExecutor | undefined;
  /**
   * Results from prior steps, keyed by step order. Seeded by the caller and
   * extended in place as steps complete so a chained next step sees them.
   */
  priorResults?: Record<number, unknown>;
}

/**
 * Map a step intent to the approval gateway's risk level. Writes are
 * "warning" by default (human-in-the-loop); the gateway's rule engine may
 * still auto-approve.
 */
function riskLevelForIntent(intent: string): "info" | "warning" | "danger" {
  const i = intent.toLowerCase();
  if (i.includes("delete")) return "danger";
  if (i.includes("create") || i.includes("update")) return "warning";
  return "info";
}

function actionTypeForIntent(intent: string): string {
  const i = intent.toLowerCase();
  if (i.includes("delete")) return "delete";
  if (i.includes("create")) return "create";
  if (i.includes("update")) return "update";
  return "read";
}

/**
 * Execute an ordered list of command steps, yielding one StepStatusEvent per
 * transition.
 */
export async function* executeCommandSteps(
  steps: CommandStep[],
  ctx: CommandExecutionContext,
): AsyncGenerator<StepStatusEvent> {
  const priorResults: Record<number, unknown> = ctx.priorResults ?? {};

  for (const step of steps) {
    yield { stepOrder: step.order, status: "executing" };

    // Chain prior step results into this step's inputs so a downstream step
    // can consume upstream output. Kept under a reserved key to avoid
    // clobbering the planner-provided inputs.
    const inputs: Record<string, unknown> = {
      ...step.inputs,
      ...(Object.keys(priorResults).length > 0 ? { _priorResults: { ...priorResults } } : {}),
    };

    try {
      if (step.requiresApproval) {
        const approval = await submitForApproval({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          toolName: step.toolName ?? "",
          actionType: actionTypeForIntent(step.intent),
          riskLevel: riskLevelForIntent(step.intent),
          description: step.description,
          inputParams: inputs,
        });

        if (approval.outcome === "pending") {
          // Needs human approval — surface the approval id and halt. The
          // plan resumes out-of-band once the user approves.
          yield {
            stepOrder: step.order,
            status: "awaiting_approval",
            approvalId: approval.approvalId,
          };
          return;
        }

        if (approval.outcome === "rejected") {
          yield {
            stepOrder: step.order,
            status: "failed",
            error: approval.errorMessage || "Action rejected",
          };
          return;
        }

        // outcome === "completed" — auto-approved and executed by the gateway.
        priorResults[step.order] = approval.executionResult;
        yield {
          stepOrder: step.order,
          status: "completed",
          result: approval.executionResult,
        };
        continue;
      }

      // Read step — run the resolved tool executor directly.
      const executor = step.toolName ? ctx.resolveToolExecutor(step.toolName) : undefined;
      if (!executor) {
        yield {
          stepOrder: step.order,
          status: "failed",
          error: `No executor registered for tool: ${step.toolName ?? "(none)"}`,
        };
        return;
      }

      const result = await executor(inputs, ctx.organizationId, ctx.userId);
      priorResults[step.order] = result;
      yield { stepOrder: step.order, status: "completed", result };
    } catch (error) {
      yield {
        stepOrder: step.order,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return;
    }
  }
}
