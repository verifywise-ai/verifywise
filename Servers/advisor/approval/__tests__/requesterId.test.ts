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

import { approveAction } from "../approvalGateway";
import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockQuery = sequelize.query as jest.Mock;
const TOOL = "test_requester_tool";

/** The approval row the gateway reads back, plus nothing for every other query. */
function arrange(record: Record<string, unknown>) {
  mockQuery.mockImplementation(async (sql: string) =>
    String(sql).includes("SELECT * FROM ai_action_approvals")
      ? [
          {
            id: "appr-1",
            organization_id: 42,
            tool_name: TOOL,
            state: "pending_approval",
            state_history: [],
            ...record,
          },
        ]
      : [],
  );
}

describe("approveAction passes the requester to the executor", () => {
  const executor = jest.fn(async (_params: Record<string, unknown>) => ({ ok: true }));

  beforeEach(() => {
    jest.clearAllMocks();
    writeToolExecutors.set(TOOL, executor);
  });

  afterAll(() => writeToolExecutors.delete(TOOL));

  it("sets _requesterId from the approval record and _userId to the approver", async () => {
    arrange({ input_params: { risk_id: 7 }, requested_by: 5 });

    await approveAction(42, "appr-1", 9);

    expect(executor).toHaveBeenCalledWith({ risk_id: 7, _userId: 9, _requesterId: 5 }, 42);
  });

  it("never takes _requesterId from the stored params", async () => {
    arrange({ input_params: { risk_id: 7, _requesterId: 1 }, requested_by: null });

    await approveAction(42, "appr-1", 9);

    expect(executor).toHaveBeenCalledWith({ risk_id: 7, _userId: 9 }, 42);
  });
});
