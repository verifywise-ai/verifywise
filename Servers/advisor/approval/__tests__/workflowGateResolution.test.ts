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

import { approveAction, rejectAction, WORKFLOW_GATE_TOOL } from "../approvalGateway";
import { sequelize } from "../../../database/db";
import { resumeWorkflow } from "../../../services/workflows/engine";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockQuery = sequelize.query as jest.Mock;

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

  it("approving a gate resumes the run instead of looking for an executor", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (String(sql).includes("FROM ai_workflow_runs")) return [{ id: 77 }];
      return [];
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
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (String(sql).includes("FROM ai_workflow_runs")) return [];
      return [];
    });

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(false);
    expect(resumeWorkflow).not.toHaveBeenCalled();
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
  });
});
