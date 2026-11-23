jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn(async () => []) } }));
jest.mock("../../../utils/notification.utils", () => ({ createNotificationQuery: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../../services/aiAuditTrail.service", () => ({
  logStateHistory: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../observability/traceManager", () => ({
  startTrace: jest.fn(() => null),
  startSpan: jest.fn(() => null),
  endSpan: jest.fn(),
  logError: jest.fn(),
  orgTag: jest.fn((id: number) => `org:${id}`),
}));
jest.mock("../../../services/workflows/engine", () => ({
  resumeWorkflow: jest.fn(),
  cancelRunForRejectedApproval: jest.fn(),
}));
jest.mock("../../confirmation/confirmationStore", () => ({
  storeConfirmation: jest.fn(() => Promise.resolve()),
  resolveConfirmation: jest.fn(() => Promise.resolve()),
}));
jest.mock("../rules", () => ({
  ...jest.requireActual("../rules"),
  evaluateRules: jest.fn(async () => ({ decision: "auto-approve", matchedRule: "test" })),
}));

import { approveAction, executionFailureMessage, submitForApproval } from "../approvalGateway";
import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockQuery = sequelize.query as jest.Mock;
const TOOL = "test_execution_failure_tool";

/** The approval row the gateway reads back, plus nothing for every other query. */
function arrange() {
  mockQuery.mockImplementation(async (sql: string) =>
    String(sql).includes("SELECT * FROM ai_action_approvals")
      ? [
          {
            id: "appr-1",
            organization_id: 42,
            tool_name: TOOL,
            state: "pending_approval",
            state_history: [],
            input_params: { training_id: 3 },
            requested_by: 5,
          },
        ]
      : [],
  );
}

/** The state each approval write recorded, in order. */
const recordedStates = (): unknown[] =>
  mockQuery.mock.calls
    .map(([, options]) => options?.replacements)
    .filter((r) => r && "state" in r)
    .map((r) => r.state);

describe("executionFailureMessage", () => {
  it.each([
    [{ success: false, message: "No fields to update" }, "No fields to update"],
    [{ success: false, error: "Model #4 not found" }, "Model #4 not found"],
    [{ success: false }, "The action did not complete"],
    [{ success: true, message: "Done" }, null],
    [{ id: 7 }, null],
    [null, null],
    ["text", null],
  ])("%j gives %j", (result, expected) => {
    expect(executionFailureMessage(result)).toBe(expected);
  });
});

describe("an executor that reports success: false has failed", () => {
  const executor = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    writeToolExecutors.set(TOOL, executor);
    arrange();
  });

  afterAll(() => writeToolExecutors.delete(TOOL));

  it("records an approved action as failed, with the executor's message", async () => {
    executor.mockResolvedValue({ success: false, message: "No fields to update" });

    const result = await approveAction(42, "appr-1", 9);

    expect(result).toEqual({ success: false, error: "No fields to update" });
    expect(recordedStates()).toEqual(["executing", "failed"]);
  });

  it("still records a real success as completed", async () => {
    executor.mockResolvedValue({ success: true, id: 1 });

    const result = await approveAction(42, "appr-1", 9);

    expect(result).toMatchObject({ success: true });
    expect(recordedStates()).toEqual(["executing", "completed"]);
  });

  it("rejects an auto-approved action whose executor did nothing", async () => {
    executor.mockResolvedValue({ success: false, message: "Already linked" });

    const result = await submitForApproval({
      organizationId: 42,
      userId: 9,
      toolName: TOOL,
      actionType: "update",
      riskLevel: "info",
      description: "Test",
      inputParams: {},
    });

    expect(result).toMatchObject({ outcome: "rejected", errorMessage: "Already linked" });
    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO ai_action_approvals"),
    );
    expect(insert?.[1].replacements).toMatchObject({ state: "failed" });
  });
});
