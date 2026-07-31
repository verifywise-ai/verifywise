/**
 * Phase 6 — Workflow resume tests (issue 3813).
 *
 * resumeWorkflow(runId, approvalId, organizationId) continues a run that is
 * parked in 'awaiting_approval'. It loads the persisted run, looks up the
 * workflow definition from the registry by the run's workflow_type, and
 * re-enters the step loop AT the gating step (current_step) with
 * ctx.resumedApprovalId set, so the gate's write runs (instead of being skipped)
 * and the run drives to 'completed'.
 *
 * Persistence (sequelize.query) is mocked: the first SELECT returns the paused
 * run row; subsequent UPDATE/INSERT calls are no-ops we can assert on. No DB /
 * HTTP. The fileLogger is mocked to keep output quiet.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import { resumeWorkflow } from "../engine";
import { register } from "../registry";
import type { WorkflowDefinition } from "../types";
import { sequelize } from "../../../database/db";

const mockQuery = sequelize.query as unknown as jest.Mock;

/** UPDATE ai_workflow_runs ... SET state = :state — collect persisted states. */
function persistStates(): string[] {
  return mockQuery.mock.calls
    .filter((c) => String(c[0]).includes("UPDATE") && String(c[0]).includes("ai_workflow_runs"))
    .map((c) => (c[1] as any)?.replacements?.state as string);
}

const ORG_ID = 1;
const RUN_ID = 555;
const APPROVAL_ID = "approval-abc";

/**
 * A 2-step workflow: a gating step that pauses on first visit and performs its
 * write on the post-approval resume, then a finishing step. `gateWrite` records
 * that the gate's write body actually ran on resume.
 */
function pausedThenFinishWorkflow(
  afterHandler: () => void,
  gateWrite = () => {},
): WorkflowDefinition {
  return {
    id: "resume_test_wf",
    name: "Resume Test Workflow",
    triggerName: "resume.test.trigger",
    agents: ["compliance"],
    steps: [
      {
        id: "gate",
        description: "gate: pauses first, writes on resume",
        agent: "compliance",
        isWrite: true,
        handler: async (ctx) => {
          if (!ctx.resumedApprovalId) {
            return { type: "pause" as const, reason: "needs approval" };
          }
          gateWrite();
          return { type: "ok" as const, output: { approved: true } };
        },
      },
      {
        id: "finish",
        description: "finishing step run on resume",
        agent: "compliance",
        isWrite: false,
        handler: async () => {
          afterHandler();
          return { type: "ok", output: { done: true } };
        },
      },
    ],
  };
}

/** Mock query gateway: SELECT (the load) returns the paused run; rest no-op. */
function mockPausedRun(): void {
  mockQuery.mockImplementation((sql: string) => {
    if (String(sql).includes("SELECT") && String(sql).includes("ai_workflow_runs")) {
      return Promise.resolve([
        {
          id: RUN_ID,
          organization_id: ORG_ID,
          workflow_type: "resume_test_wf",
          trigger_name: "resume.test.trigger",
          trigger_payload: { foo: "bar" },
          state: "awaiting_approval",
          current_step: 0, // paused at the gate (step index 0)
          results: [{ stepId: "gate", status: "completed", startedAt: "x" }],
          error: null,
          started_by: 7,
          created_at: new Date().toISOString(),
          completed_at: null,
        },
      ] as any);
    }
    return Promise.resolve([] as any);
  });
}

describe("workflows / resumeWorkflow", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("re-runs the gating step's write on resume, then continues to 'completed'", async () => {
    const afterHandler = jest.fn();
    const gateWrite = jest.fn();
    register(pausedThenFinishWorkflow(afterHandler, gateWrite));
    mockPausedRun();

    const run = await resumeWorkflow(RUN_ID, APPROVAL_ID, ORG_ID);

    // Regression: the gating step must RE-RUN on resume so its write executes
    // (previously the engine restarted at current_step + 1 and skipped it).
    expect(gateWrite).toHaveBeenCalledTimes(1);
    // the finishing step ran on resume
    expect(afterHandler).toHaveBeenCalledTimes(1);
    // the run reached completion
    expect(run).not.toBeNull();
    expect(run?.state).toBe("completed");
    // and 'completed' was persisted to ai_workflow_runs
    expect(persistStates()).toContain("completed");
  });

  it("returns null when the run does not exist", async () => {
    mockQuery.mockResolvedValue([] as any);

    const run = await resumeWorkflow(999999, APPROVAL_ID, ORG_ID);

    expect(run).toBeNull();
  });

  it("returns the run unchanged when it is not awaiting approval", async () => {
    register(pausedThenFinishWorkflow(jest.fn()));
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("SELECT") && String(sql).includes("ai_workflow_runs")) {
        return Promise.resolve([
          {
            id: RUN_ID,
            organization_id: ORG_ID,
            workflow_type: "resume_test_wf",
            trigger_name: "resume.test.trigger",
            trigger_payload: {},
            state: "completed",
            current_step: 2,
            results: [],
            error: null,
            started_by: 7,
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          },
        ] as any);
      }
      return Promise.resolve([] as any);
    });

    const run = await resumeWorkflow(RUN_ID, APPROVAL_ID, ORG_ID);

    expect(run?.state).toBe("completed");
    // no re-run persistence beyond the load (no new 'running' transition)
    expect(persistStates()).not.toContain("running");
  });
});
