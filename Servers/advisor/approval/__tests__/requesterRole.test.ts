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
jest.mock("../../../utils/userPermission.utils", () => ({
  getUserRoleInOrganization: jest.fn(),
}));
jest.mock("../rules", () => {
  const actual = jest.requireActual("../rules");
  return { ...actual, evaluateRules: jest.fn(actual.evaluateRules) };
});

import { submitForApproval } from "../approvalGateway";
import { evaluateRules } from "../rules";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { getUserRoleInOrganization } from "../../../utils/userPermission.utils";

const mockRole = getUserRoleInOrganization as jest.Mock;
const mockEvaluate = evaluateRules as jest.Mock;
const TOOL = "agent_update_test_record";
const executor = jest.fn(async () => ({ success: true }));

const submit = () =>
  submitForApproval({
    organizationId: 42,
    userId: 5,
    toolName: TOOL,
    actionType: "update",
    riskLevel: "warning",
    description: "Update test record #1",
    inputParams: { id: 1 },
  });

beforeAll(() => {
  writeToolExecutors.set(TOOL, executor);
});
afterAll(() => {
  writeToolExecutors.delete(TOOL);
});
beforeEach(() => jest.clearAllMocks());

describe("the rule engine sees the requester's role", () => {
  it("auto-rejects an Auditor's write under the default rules, without running it", async () => {
    mockRole.mockResolvedValue({ id: 4, name: "Auditor", organizationId: null });

    const result = await submit();

    expect(mockRole).toHaveBeenCalledWith(42, 5);
    expect(mockEvaluate.mock.calls[0][1]).toMatchObject({ user_role: "Auditor" });
    expect(result.outcome).toBe("rejected");
    expect(executor).not.toHaveBeenCalled();
  });

  it("does not reject an Editor's write", async () => {
    mockRole.mockResolvedValue({ id: 3, name: "Editor", organizationId: null });

    const result = await submit();

    expect(mockEvaluate.mock.calls[0][1]).toMatchObject({ user_role: "Editor" });
    expect(result.outcome).not.toBe("rejected");
  });

  it("matches no role when the requester's role can't be resolved", async () => {
    mockRole.mockResolvedValue(undefined);

    await submit();

    expect(mockEvaluate.mock.calls[0][1]).toMatchObject({ user_role: "Unknown" });
  });
});
