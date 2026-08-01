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
jest.mock("../../../services/workflows/engine", () => ({ resumeWorkflow: jest.fn() }));

import { submitWorkflowGate, WORKFLOW_GATE_TOOL } from "../approvalGateway";
import { sequelize } from "../../../database/db";

const mockQuery = sequelize.query as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe("submitWorkflowGate", () => {
  it("inserts a pending_approval row tagged as a workflow gate", async () => {
    const approvalId = await submitWorkflowGate({
      organizationId: 42,
      userId: 9,
      workflowId: "incident_response",
      workflowRunId: 77,
      stepId: "create_remediation_tasks",
      description: "Approve creation of remediation tasks",
    });

    expect(typeof approvalId).toBe("string");
    expect(approvalId.length).toBeGreaterThan(0);

    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO ai_action_approvals"),
    );
    expect(insert).toBeDefined();
    const r = insert![1].replacements;
    expect(r.state).toBe("pending_approval");
    expect(r.toolName).toBe(WORKFLOW_GATE_TOOL);
    expect(r.organizationId).toBe(42);
    expect(r.requestedBy).toBe(9);
    // Self-describing in the approval queue before the run is looked up.
    expect(JSON.parse(r.inputParams)).toMatchObject({
      workflowId: "incident_response",
      workflowRunId: 77,
      stepId: "create_remediation_tasks",
    });
  });

  it("stores NULL requested_by for a trigger-started run with no user", async () => {
    // Most gated runs come from a trigger, not a person. requested_by is
    // nullable, so a system gate stores NULL rather than a synthetic user id.
    await submitWorkflowGate({
      organizationId: 42,
      workflowId: "audit_preparation",
      workflowRunId: 5,
      stepId: "generate_audit_prep_report",
      description: "Approve publishing",
    });

    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO ai_action_approvals"),
    );
    expect(insert![1].replacements.requestedBy).toBeNull();
  });
});
