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

describe("resumedApprovalId scoping", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("is cleared once the gating step completes, so a later gate pauses again", async () => {
    // incident_response has two gated write steps. With resumedApprovalId left
    // set for the rest of the loop, approving the first would silently
    // authorize the second — one human decision permitting two gated writes.
    const seen: Array<string | null | undefined> = [];
    const twoGateWorkflow: WorkflowDefinition = {
      id: "two_gate_probe",
      name: "Two gate probe",
      triggerName: "two.gate.probe",
      agents: ["probe"],
      steps: [
        {
          id: "first_gate",
          description: "gated",
          agent: "probe",
          isWrite: true,
          handler: async (ctx) => {
            seen.push(ctx.resumedApprovalId);
            if (!ctx.resumedApprovalId) {
              return { type: "pause" as const, reason: "first", approvalId: "appr-1" };
            }
            return { type: "ok" as const, output: { first: true } };
          },
        },
        {
          id: "second_gate",
          description: "gated",
          agent: "probe",
          isWrite: true,
          handler: async (ctx) => {
            seen.push(ctx.resumedApprovalId);
            if (!ctx.resumedApprovalId) {
              return { type: "pause" as const, reason: "second", approvalId: "appr-2" };
            }
            return { type: "ok" as const, output: { second: true } };
          },
        },
      ],
    };
    register(twoGateWorkflow);

    // Simulate the state the engine persists when it pauses at step 0. This
    // file doesn't have a shared "load a run row" helper (mockPausedRun above
    // is hardwired to the resume_test_wf fixture), so this mocks
    // sequelize.query directly, following the same SELECT/no-op shape.
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("SELECT") && String(sql).includes("ai_workflow_runs")) {
        return Promise.resolve([
          {
            id: 1,
            organization_id: 1,
            workflow_type: "two_gate_probe",
            trigger_name: "two.gate.probe",
            trigger_payload: {},
            state: "awaiting_approval",
            current_step: 0,
            results: [],
            error: null,
            started_by: null,
            created_at: new Date().toISOString(),
            completed_at: null,
          },
        ] as any);
      }
      return Promise.resolve([] as any);
    });

    const run = await resumeWorkflow(1, "appr-1", 1);

    // The first step saw the approval and proceeded; the second saw nothing
    // and paused for its own.
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe("appr-1");
    expect(seen[1]).toBeUndefined();
    expect(run?.state).toBe("awaiting_approval");

    // Not just "some" pause: confirm it parked under the SECOND gate's own
    // approvalId, not a reuse of the first. That's the actual security
    // property — a fresh human decision is required for the second write.
    const pauseCall = mockQuery.mock.calls.find(
      (c) => (c[1] as any)?.replacements?.state === "awaiting_approval",
    );
    expect((pauseCall?.[1] as any)?.replacements?.awaitingApprovalId).toBe("appr-2");
  });
});
