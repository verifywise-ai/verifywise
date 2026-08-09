/**
 * Phase 6 — Compliance Autopilot
 * Workflow types: an extension of Phase 5's CommandStep with branching support.
 */

/**
 * Execution context handed to every step handler. Carries tenant scope, the
 * trigger payload, and the accumulating per-step results keyed by step id.
 */
export interface WorkflowContext {
  /** Id of the ai_workflow_runs row this execution is bound to. */
  workflowRunId: number;
  organizationId: number;
  userId?: number;
  /** The payload supplied by the trigger that started this run. */
  triggerPayload: Record<string, unknown>;
  /** Output of each completed step, keyed by step id. */
  results: Record<string, unknown>;
  /**
   * Set only when the run is being resumed after an approval was resolved. A
   * gated write step re-runs on resume (the engine restarts AT the gating step,
   * not after it), so the step uses this to tell "first visit → pause" apart
   * from "approved → perform the write". Undefined on the initial run.
   */
  resumedApprovalId?: string | null;
}

/**
 * Result a step handler returns to tell the engine what to do next.
 *  - ok: step succeeded; `output` is stored in ctx.results[stepId]
 *  - skip: step was intentionally not executed
 *  - branch: jump to another step by id
 *  - pause: halt the run and put it in 'awaiting_approval'. `approvalId` links
 *    the run to the ai_action_approvals row whose resolution resumes it; without
 *    it the run cannot be resumed (see engine.persistRun / resumeWorkflow).
 *  - fail: short-circuit the run into 'failed'
 */
export type StepResult =
  | { type: "ok"; output: unknown }
  | { type: "skip"; reason?: string }
  | { type: "branch"; gotoStepId: string }
  | { type: "pause"; reason?: string; approvalId?: string }
  | { type: "fail"; error: string };

/**
 * A single step of a workflow definition.
 */
export interface WorkflowStep {
  /** Stable id, also used as the branch target and the ctx.results key. */
  id: string;
  /** Human-readable description of what the step does. */
  description: string;
  /** The agent assigned to handle this step. */
  agent: string;
  /** True for steps that mutate state (used by approval / audit). */
  isWrite: boolean;
  /** Executes the step against the workflow context. */
  handler: (ctx: WorkflowContext) => Promise<StepResult>;
}

/**
 * A registered workflow: an ordered list of steps plus trigger metadata.
 */
export interface WorkflowDefinition {
  /** Stable workflow key (e.g. "model_deployment"). */
  id: string;
  /** Display name. */
  name: string;
  /** The event/trigger name that launches this workflow. */
  triggerName: string;
  /** Agents that participate in this workflow. */
  agents: string[];
  /** Ordered steps. */
  steps: WorkflowStep[];
}

/**
 * Lifecycle state of a persisted workflow run.
 */
export type WorkflowRunState =
  "pending" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";

/**
 * Per-step execution record persisted in the run's `results` column.
 */
export interface StepRecord {
  stepId: string;
  status: "running" | "completed" | "skipped" | "failed";
  startedAt: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

/**
 * A workflow run, as returned by the engine and persisted to ai_workflow_runs.
 */
export interface WorkflowRun {
  id: number;
  organizationId: number;
  workflowType: string;
  triggerName: string;
  triggerPayload: Record<string, unknown>;
  state: WorkflowRunState;
  currentStep: number;
  results: StepRecord[];
  error?: string;
  startedBy?: number;
  createdAt: string;
  completedAt?: string;
}

/**
 * Parameters required to create / run a workflow.
 */
export interface WorkflowRunParams {
  organizationId: number;
  userId?: number;
  triggerPayload?: Record<string, unknown>;
}
