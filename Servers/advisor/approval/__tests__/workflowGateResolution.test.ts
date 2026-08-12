jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn(async () => []) } }));
jest.mock("../../../utils/notification.utils", () => ({ createNotificationQuery: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../../services/aiAuditTrail.service", () => ({
  // logStateHistory is async in production; submitWorkflowGate fire-and-forgets
  // it with `.catch(() => {})` (the same idiom submitForApprovalImpl uses), so
  // the mock must return a promise rather than the bare-jest.fn() default of
  // `undefined`, or `.catch` throws synchronously.
  logStateHistory: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../observability/traceManager", () => ({
  startTrace: jest.fn(() => null),
  startSpan: jest.fn(() => null),
  endSpan: jest.fn(),
  logError: jest.fn(),
  orgTag: jest.fn((id: number) => `org:${id}`),
}));
// Partial mock: keep the real cancelRunForRejectedApproval (it's exercised
// directly below, writing through the mocked sequelize.query) but stub
// resumeWorkflow, since that's asserted on as a jest.fn() call target.
jest.mock("../../../services/workflows/engine", () => {
  const actual = jest.requireActual("../../../services/workflows/engine");
  return { ...actual, resumeWorkflow: jest.fn() };
});
// resolveConfirmation never resolves. This is the sharpest possible proof
// that rejecting a gate cannot hang on Redis: rejectActionImpl skips this
// call entirely for WORKFLOW_GATE_TOOL records (submitWorkflowGate never
// calls storeConfirmation, so a gate has no key to resolve). If that guard
// were ever removed, this mock would make the "rejecting a gate" tests below
// hang until Jest's own timeout — reproducing, deterministically and without
// touching real infrastructure, the exact CI failure this file exists to
// prevent (three jobs timed out on this path because no job in
// backend-checks.yml provisions a Redis service, so the real client's
// offline queue never drained).
jest.mock("../../confirmation/confirmationStore", () => ({
  storeConfirmation: jest.fn(() => Promise.resolve()),
  resolveConfirmation: jest.fn(() => new Promise(() => {})),
}));

import { approveAction, rejectAction, WORKFLOW_GATE_TOOL } from "../approvalGateway";
import { sequelize } from "../../../database/db";
import { resumeWorkflow } from "../../../services/workflows/engine";
import { resolveConfirmation } from "../../confirmation/confirmationStore";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockQuery = sequelize.query as jest.Mock;
const mockResolveConfirmation = resolveConfirmation as jest.Mock;

function gateRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "appr-1",
    organization_id: 42,
    tool_name: WORKFLOW_GATE_TOOL,
    state: "pending_approval",
    state_history: [],
    input_params: { workflowId: "incident_response", workflowRunId: 77 },
    ...overrides,
  };
}

describe("workflow gate resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    writeToolExecutors.clear?.();
  });

  // The gate branch issues two different SELECTs against ai_workflow_runs:
  // one to find the run before resuming it, one to read it back afterward
  // to discover whether it advanced. Both queries include "FROM
  // ai_workflow_runs", so tests must distinguish them by their SELECT list
  // rather than matching on the table name alone.
  function mockRunLookups(opts: {
    beforeResume: Array<{ id: number }>;
    afterResume?: Array<{ state: string; awaiting_approval_id: string | null }>;
  }) {
    mockQuery.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (s.includes("SELECT id FROM ai_workflow_runs")) return opts.beforeResume;
      if (s.includes("SELECT state, awaiting_approval_id FROM ai_workflow_runs")) {
        return opts.afterResume ?? [];
      }
      return [];
    });
  }

  it("approving a gate resumes the run instead of looking for an executor", async () => {
    mockRunLookups({
      beforeResume: [{ id: 77 }],
      // Single-gate resume: the run finished and cleared its approval link.
      afterResume: [{ state: "completed", awaiting_approval_id: null }],
    });
    (resumeWorkflow as jest.Mock).mockResolvedValue({ id: 77, state: "completed" });

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(true);
    expect(resumeWorkflow).toHaveBeenCalledWith(77, "appr-1", 42);
    // The executor path must not run: a gate has none, and the old code
    // failed the approval with "No executor" before reaching the resume.
    const failed = mockQuery.mock.calls.find((c) =>
      String(JSON.stringify(c[1]?.replacements ?? {})).includes("No executor"),
    );
    expect(failed).toBeUndefined();
  });

  it("marks the approval failed when no run is linked, rather than reporting success", async () => {
    mockRunLookups({ beforeResume: [] });

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(false);
    expect(resumeWorkflow).not.toHaveBeenCalled();
  });

  it("marks the approval failed when resumeWorkflow leaves the run parked on the SAME approval", async () => {
    // resumeWorkflow doesn't always throw or advance the run: if its workflow
    // definition can't be resolved (unregistered after a deploy/rename), it
    // logs an error and returns the run UNCHANGED, still in 'awaiting_approval'
    // pointing at THIS SAME approval id. That is a resume that resumed
    // nothing and must not be reported as success. (state alone can't tell
    // this apart from advancing into a new gate -- see the next test.)
    mockRunLookups({
      beforeResume: [{ id: 77 }],
      afterResume: [{ state: "awaiting_approval", awaiting_approval_id: "appr-1" }],
    });
    (resumeWorkflow as jest.Mock).mockResolvedValue({ id: 77, state: "awaiting_approval" });

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(false);
    expect(resumeWorkflow).toHaveBeenCalledWith(77, "appr-1", 42);
    const failed = mockQuery.mock.calls.find(
      (c) =>
        String(c[0]).includes("UPDATE ai_action_approvals") &&
        String(JSON.stringify(c[1]?.replacements ?? {})).includes("failed"),
    );
    expect(failed).toBeDefined();
  });

  it("completes the approval when the resume advances into a NEW gate on a different approval", async () => {
    // incident_response has two sequential gates: create_remediation_tasks,
    // then escalate_notify_admins. Approving the first gate resumes the run,
    // which legitimately re-pauses in 'awaiting_approval' -- but on a NEW,
    // DIFFERENT approval id. By state alone this is indistinguishable from
    // the previous test (nothing advanced); the approval id is what tells
    // them apart, and this run DID advance, so it must be reported as
    // success. This is the case that regressed in the first fix pass: it
    // used `resumed.state === "awaiting_approval"` alone as the failure
    // signal and could not tell these two cases apart.
    mockRunLookups({
      beforeResume: [{ id: 77 }],
      afterResume: [{ state: "awaiting_approval", awaiting_approval_id: "appr-2" }],
    });
    (resumeWorkflow as jest.Mock).mockResolvedValue({ id: 77, state: "awaiting_approval" });

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(true);
    expect(resumeWorkflow).toHaveBeenCalledWith(77, "appr-1", 42);
    const completed = mockQuery.mock.calls.find(
      (c) =>
        String(c[0]).includes("UPDATE ai_action_approvals") &&
        String(JSON.stringify(c[1]?.replacements ?? {})).includes("completed"),
    );
    expect(completed).toBeDefined();
    const failed = mockQuery.mock.calls.find(
      (c) =>
        String(c[0]).includes("UPDATE ai_action_approvals") &&
        String(JSON.stringify(c[1]?.replacements ?? {})).includes("failed"),
    );
    expect(failed).toBeUndefined();
  });

  it("marks the approval failed, and does not throw, when resumeWorkflow rejects", async () => {
    // By the time resumeWorkflow is called the approval is already persisted
    // as 'executing'. If the resume throws uncaught, the approval is stuck
    // there forever: the entry guard (state !== 'pending_approval') blocks
    // every retry. approveAction must catch this and land on 'failed'.
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (String(sql).includes("FROM ai_workflow_runs")) return [{ id: 77 }];
      return [];
    });
    (resumeWorkflow as jest.Mock).mockRejectedValue(
      new Error("workflow definition not registered"),
    );

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(false);
    expect(result.error).toBe("workflow definition not registered");
    const failed = mockQuery.mock.calls.find(
      (c) =>
        String(c[0]).includes("UPDATE ai_action_approvals") &&
        String(JSON.stringify(c[1]?.replacements ?? {})).includes("failed"),
    );
    expect(failed).toBeDefined();
  });

  it("rejecting a gate cancels the run", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (String(sql).includes("FROM ai_workflow_runs")) return [{ id: 77 }];
      return [];
    });

    const result = await rejectAction(42, "appr-1", 9, "not now");

    expect(result.success).toBe(true);
    const cancel = mockQuery.mock.calls.find(
      (c) =>
        String(c[0]).includes("UPDATE ai_workflow_runs") &&
        String(JSON.stringify(c[1]?.replacements ?? {})).includes("cancelled"),
    );
    expect(cancel).toBeDefined();
    // The regression this guards against: resolveConfirmation is mocked above
    // to never resolve, so if rejectActionImpl ever called it for a
    // WORKFLOW_GATE_TOOL record again, `await rejectAction(...)` would hang
    // until Jest's timeout instead of returning. Reaching this line at all is
    // part of the proof; this assertion makes the "why" explicit.
    expect(mockResolveConfirmation).not.toHaveBeenCalled();
  });
});
