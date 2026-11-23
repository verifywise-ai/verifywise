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
import { AUDITOR_WRITE_TOOLS } from "../rules/defaultRules";

const mockRole = getUserRoleInOrganization as jest.Mock;
const mockEvaluate = evaluateRules as jest.Mock;
const TOOL = "agent_update_test_vendor";
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

  it.each(AUDITOR_WRITE_TOOLS)(
    "lets an Auditor's %s through to the tool's own check",
    async (tool) => {
      mockRole.mockResolvedValue({ id: 4, name: "Auditor", organizationId: null });
      writeToolExecutors.set(tool, executor);
      try {
        const result = await submitForApproval({
          organizationId: 42,
          userId: 5,
          toolName: tool,
          actionType: "update",
          riskLevel: "warning",
          description: tool,
          inputParams: {},
        });
        expect(result.outcome).not.toBe("rejected");
      } finally {
        writeToolExecutors.delete(tool);
      }
    },
  );

  it.each([
    "agent_create_use_case",
    "agent_create_automation",
    "agent_send_invitation",
    "agent_approve_policy_review",
    // Not checked against the requester yet, so not open to Auditors.
    "agent_update_task_status",
    "agent_save_entity_graph_view",
    "agent_update_note",
    "agent_delete_note",
    "agent_submit_pmm_responses",
    "agent_flag_pmm_concern",
  ])("refuses an Auditor's %s, which is not on the allowlist", async (tool) => {
    mockRole.mockResolvedValue({ id: 4, name: "Auditor", organizationId: null });
    writeToolExecutors.set(tool, executor);
    try {
      const result = await submitForApproval({
        organizationId: 42,
        userId: 5,
        toolName: tool,
        actionType: "create",
        riskLevel: "warning",
        description: tool,
        inputParams: {},
      });
      expect(result.outcome).toBe("rejected");
      expect(executor).not.toHaveBeenCalled();
    } finally {
      writeToolExecutors.delete(tool);
    }
  });

  it("allowlists only tools that exist", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const dir = path.join(__dirname, "../../functions");
    const source = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
      .join("\n");
    for (const tool of AUDITOR_WRITE_TOOLS) {
      expect(source).toContain(`toolName: "${tool}"`);
    }
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
