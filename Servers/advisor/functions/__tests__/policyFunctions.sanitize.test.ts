jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../utils/policyManager.utils", () => ({ getAllPoliciesQuery: jest.fn() }));
jest.mock("../../../utils/policyTemplate.utils", () => ({ getPolicyTemplatesQuery: jest.fn() }));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import "../policyFunctions";

const q = sequelize.query as jest.Mock;
const DIRTY = '<p>keep</p><script>alert(1)</script><img src="x" onerror="alert(1)">';

describe("advisor policy writes sanitize content_html", () => {
  beforeEach(() => q.mockReset());

  it("agent_create_policy sanitizes the description before it becomes content_html", async () => {
    q.mockResolvedValueOnce([{ id: 1 }]);
    const exec = writeToolExecutors.get("agent_create_policy")!;
    await exec({ policy_name: "Policy", description: DIRTY, _userId: 9 }, 42);
    const html = q.mock.calls[0][1].replacements.content_html as string;
    expect(html).toContain("<p>keep</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("agent_update_policy sanitizes the description before it becomes content_html", async () => {
    q.mockResolvedValueOnce([{ id: 1 }]);
    const exec = writeToolExecutors.get("agent_update_policy")!;
    await exec({ policy_id: 1, description: DIRTY, _userId: 9 }, 42);
    const html = q.mock.calls[0][1].replacements.content_html as string;
    expect(html).toContain("<p>keep</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});
