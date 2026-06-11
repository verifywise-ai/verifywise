/**
 * Phase 6 — Workflow engine tests (issue 3813).
 *
 * Verifies runWorkflow(workflow, runId, params) drives an ordered
 * WorkflowStep[]:
 *   - steps run in declared order (handler call order)
 *   - a step returning a pause result halts the run in state
 *     'awaiting_approval' and persists that state (later steps do not run)
 *   - a workflow that runs to the end finishes in state 'completed'
 *   - an audit entry is recorded for each state transition
 *
 * The persistence + audit layer is the sequelize query gateway, which is
 * mocked. No DB / HTTP. logWorkflowAudit and persistRun both go through
 * sequelize.query, so we assert on the SQL each call issues.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import { runWorkflow } from "../engine";
import type { WorkflowDefinition, WorkflowStep } from "../types";
import { sequelize } from "../../../database/db";

const mockQuery = sequelize.query as unknown as jest.Mock;

/** Helpers to read what was persisted / audited from the mocked query calls. */
function sqlStrings(): string[] {
  return mockQuery.mock.calls.map((c) => String(c[0]));
}
function auditTransitions(): string[] {
  // logWorkflowAudit issues an INSERT INTO ai_action_audit_log with a
  // :toState replacement. Collect the to_state of each audit call in order.
  return mockQuery.mock.calls
    .filter((c) => String(c[0]).includes("ai_action_audit_log"))
    .map((c) => (c[1] as any)?.replacements?.toState as string);
}
function persistStates(): string[] {
  // persistRun issues an UPDATE ai_workflow_runs ... SET state = :state
  return mockQuery.mock.calls
    .filter(
      (c) =>
        String(c[0]).includes("UPDATE") &&
        String(c[0]).includes("ai_workflow_runs"),
    )
    .map((c) => (c[1] as any)?.replacements?.state as string);
}

function step(partial: Partial<WorkflowStep> & { id: string }): WorkflowStep {
  return {
    description: `step ${partial.id}`,
    agent: "compliance",
    isWrite: false,
    handler: async () => ({ type: "ok", output: {} }),
    ...partial,
  };
}

function workflow(steps: WorkflowStep[]): WorkflowDefinition {
  return {
    id: "test_workflow",
    name: "Test Workflow",
    triggerName: "test.trigger",
    agents: ["compliance"],
    steps,
  };
}

const params = { organizationId: 1, userId: 7, triggerPayload: { foo: "bar" } };

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([] as any);
});

describe("workflows / runWorkflow", () => {
  it("runs steps in declared order", async () => {
    const calls: string[] = [];
    const wf = workflow([
      step({ id: "a", handler: async () => { calls.push("a"); return { type: "ok", output: 1 }; } }),
      step({ id: "b", handler: async () => { calls.push("b"); return { type: "ok", output: 2 }; } }),
      step({ id: "c", handler: async () => { calls.push("c"); return { type: "ok", output: 3 }; } }),
    ]);

    await runWorkflow(wf, 100, params);

    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("chains a completed step output into ctx.results for later steps", async () => {
    let seen: unknown;
    const wf = workflow([
      step({ id: "first", handler: async () => ({ type: "ok", output: { value: 42 } }) }),
      step({
        id: "second",
        handler: async (ctx) => { seen = ctx.results.first; return { type: "ok", output: {} }; },
      }),
    ]);

    await runWorkflow(wf, 101, params);

    expect(seen).toEqual({ value: 42 });
  });

  it("completes a workflow that runs to the end (state 'completed')", async () => {
    const wf = workflow([step({ id: "only" })]);

    const run = await runWorkflow(wf, 102, params);

    expect(run.state).toBe("completed");
    expect(run.currentStep).toBe(wf.steps.length);
    // final persistRun wrote state 'completed'
    expect(persistStates()).toContain("completed");
    // a 'completed' audit transition was recorded
    expect(auditTransitions()).toContain("completed");
  });

  it("halts in 'awaiting_approval' and persists it when a step returns a pause result", async () => {
    const laterHandler = jest.fn(async () => ({ type: "ok" as const, output: {} }));
    const wf = workflow([
      step({ id: "gate", handler: async () => ({ type: "pause", reason: "needs approval" }) }),
      step({ id: "after", handler: laterHandler }),
    ]);

    const run = await runWorkflow(wf, 103, params);

    expect(run.state).toBe("awaiting_approval");
    // the run paused at the gate step, the later step never ran
    expect(laterHandler).not.toHaveBeenCalled();
    expect(run.currentStep).toBe(0);
    // awaiting_approval was persisted to ai_workflow_runs
    expect(persistStates()).toContain("awaiting_approval");
    // and the pause produced an 'awaiting_approval' audit transition
    expect(auditTransitions()).toContain("awaiting_approval");
  });

  it("records an audit entry for each state transition", async () => {
    const wf = workflow([
      step({ id: "s1" }),
      step({ id: "s2" }),
    ]);

    await runWorkflow(wf, 104, params);

    const transitions = auditTransitions();
    // run-level lifecycle transitions plus per-step transitions are all audited
    expect(transitions).toContain("running");
    // each step records a step_running and a step_completed transition
    expect(transitions.filter((t) => t === "step_running")).toHaveLength(2);
    expect(transitions.filter((t) => t === "step_completed")).toHaveLength(2);
    expect(transitions).toContain("completed");
    // every audit transition writes to ai_action_audit_log
    expect(sqlStrings().some((s) => s.includes("ai_action_audit_log"))).toBe(true);
  });

  it("fails the run when a step handler throws (state 'failed')", async () => {
    const wf = workflow([
      step({ id: "boom", handler: async () => { throw new Error("kaboom"); } }),
      step({ id: "never", handler: jest.fn(async () => ({ type: "ok" as const, output: {} })) }),
    ]);

    const run = await runWorkflow(wf, 105, params);

    expect(run.state).toBe("failed");
    expect(run.error).toContain("kaboom");
    expect(persistStates()).toContain("failed");
  });
});
