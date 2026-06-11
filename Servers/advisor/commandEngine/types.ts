/**
 * Phase 5 — Command Engine shared contract types (issue 3812).
 *
 * One natural-language command is decomposed by the planner into an ordered
 * list of CommandStep, then driven by the executor which streams a
 * StepStatusEvent per state transition. The frontend mirrors these types.
 */

/**
 * A single planned step of a multi-step command.
 */
export interface CommandStep {
  /** 1-based position in the ordered plan. */
  order: number;
  /** Human-readable description of what this step does. */
  description: string;
  /** Classified intent (e.g. "read", "create", "update", "delete", or a domain). */
  intent: string;
  /** The agent assigned to handle this step (from the routing engine). */
  agent: string;
  /** The tool the step invokes, when known. */
  toolName?: string;
  /** True for create/update/delete steps that must pass through the approval gateway. */
  requiresApproval: boolean;
  /** Tool inputs for this step. Prior step results are chained in at execution time. */
  inputs: Record<string, unknown>;
}

/**
 * Lifecycle status of a single step during execution.
 */
export type StepStatus =
  | "pending"
  | "executing"
  | "awaiting_approval"
  | "completed"
  | "failed";

/**
 * One streamed event describing a step's status transition.
 */
export interface StepStatusEvent {
  stepOrder: number;
  status: StepStatus;
  result?: unknown;
  error?: string;
  approvalId?: string;
}
