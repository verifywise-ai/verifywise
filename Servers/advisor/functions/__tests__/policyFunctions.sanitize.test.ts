jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(async () => ({ commit: jest.fn(), rollback: jest.fn() })),
  },
}));
jest.mock("../../../services/policies/policyApproval.service", () => ({
  approvePolicyDirectly: jest.fn(),
  rejectPendingPolicyRequestOnDelete: jest.fn(),
  submitPolicyForApproval: jest.fn(),
}));
jest.mock("../../../utils/policyManager.utils", () => ({
  getAllPoliciesQuery: jest.fn(),
  createPolicyQuery: jest.fn(async () => ({ id: 1 })),
  getPolicyByIdQuery: jest.fn(async () => [{ id: 1, title: "P", content_html: "" }]),
  updatePolicyByIdQuery: jest.fn(async () => ({ id: 1 })),
}));
jest.mock("../../../utils/policyChangeHistory.utils", () => ({ recordPolicyCreation: jest.fn() }));
jest.mock("../../../utils/changeHistory.base.utils", () => ({ recordUpdateChanges: jest.fn() }));
jest.mock("../../../config/changeHistory.config", () => ({
  runInSavepoint: jest.fn(async (work: () => Promise<unknown>) => work()),
}));
jest.mock("../../../utils/policyTemplate.utils", () => ({ getPolicyTemplatesQuery: jest.fn() }));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { createPolicyQuery, updatePolicyByIdQuery } from "../../../utils/policyManager.utils";
import "../policyFunctions";

const q = sequelize.query as jest.Mock;
const DIRTY = '<p>keep</p><script>alert(1)</script><img src="x" onerror="alert(1)">';

describe("advisor policy writes sanitize content_html", () => {
  beforeEach(() => q.mockReset());

  it("agent_create_policy sanitizes the description before it becomes content_html", async () => {
    const exec = writeToolExecutors.get("agent_create_policy")!;
    await exec({ policy_name: "Policy", description: DIRTY, _userId: 9 }, 42);
    const html = (createPolicyQuery as jest.Mock).mock.calls.at(-1)![0].content_html as string;
    expect(html).toContain("<p>keep</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("agent_update_policy sanitizes the description before it becomes content_html", async () => {
    // The update gate locks the row and reads pending requests first.
    q.mockResolvedValueOnce([{ id: 1, title: "P", status: "Draft", content_html: "" }]);
    q.mockResolvedValueOnce([]);
    const exec = writeToolExecutors.get("agent_update_policy")!;
    await exec({ policy_id: 1, description: DIRTY, _userId: 9 }, 42);
    const html = (updatePolicyByIdQuery as jest.Mock).mock.calls.at(-1)![1].content_html as string;
    expect(html).toContain("<p>keep</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});
