jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../services/extension/extensionService", () => ({
  ExtensionService: { getRuntimeConfiguration: jest.fn() },
}));
jest.mock("../../extensions/mlflow/mlflow.service", () => ({ testConnection: jest.fn() }));
jest.mock("../../extensions/azure-ai-foundry/azureAiFoundry.service", () => ({
  testConnection: jest.fn(),
}));
jest.mock("../../extensions/jira-incidents/jiraIncidents.config", () => ({
  testConnection: jest.fn(),
}));
jest.mock("../../extensions/jira-assets/jiraAssets.service", () => ({
  clientFromConfig: jest.fn(),
  loadFullConfig: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import { Request, Response } from "express";
import { testExtensionConnection, withoutRemoteBody } from "../extension.ctrl";
import { clientFromConfig } from "../../extensions/jira-assets/jiraAssets.service";
import { assertSafeOutboundUrl } from "../../utils/safeOutboundUrl";

const mockClientFromConfig = clientFromConfig as jest.Mock;

function call(configuration: Record<string, unknown>) {
  const req = {
    params: { key: "jira-assets" },
    body: { configuration },
    userId: 1,
    organizationId: 1,
    t: (s: string) => s,
  } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return testExtensionConnection(req, res).then(() => ({
    status: (res.status as jest.Mock).mock.calls[0][0],
    body: (res.json as jest.Mock).mock.calls[0][0],
  }));
}

const config = {
  jira_base_url: "https://jira.example.com",
  workspace_id: "w",
  email: "a@example.com",
  api_token: "t",
  deployment_type: "datacenter",
};

describe("withoutRemoteBody", () => {
  it("keeps the status of a Jira error answer and drops its body", () => {
    expect(withoutRemoteBody("Jira returned 401: <html>internal page</html>")).toBe(
      "Jira returned HTTP 401",
    );
  });

  it("leaves other reasons alone", () => {
    expect(withoutRemoteBody("Could not reach Jira: connection failed")).toBe(
      "Could not reach Jira: connection failed",
    );
  });
});

describe("POST /api/extensions/jira-assets/test-connection", () => {
  afterEach(() => jest.clearAllMocks());

  it("does not show what the server answered", async () => {
    mockClientFromConfig.mockReturnValue({
      testConnection: jest.fn().mockResolvedValue({
        success: false,
        error: "Jira returned 500: stack trace from an internal service",
      }),
    });
    const { status, body } = await call(config);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      success: false,
      message: "Connection failed: Jira returned HTTP 500",
    });
  });

  it("answers a refused base URL as a failed test, not a server error", async () => {
    mockClientFromConfig.mockImplementation((c: { jira_base_url: string }) => {
      assertSafeOutboundUrl(c.jira_base_url);
      return {};
    });
    const { status, body } = await call({ ...config, jira_base_url: "http://169.254.169.254" });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      success: false,
      message: "The URL resolves to a link-local address, which is not allowed",
    });
  });
});
