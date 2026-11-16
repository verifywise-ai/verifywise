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
  // The real field checks (parseJiraConnection) and error classes.
  ...jest.requireActual("../../extensions/jira-assets/jiraAssets.service"),
  clientFromConfig: jest.fn(),
  loadFullConfig: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import { Request, Response } from "express";
import { testExtensionConnection } from "../extension.ctrl";
import {
  JiraNotConfiguredError,
  clientFromConfig,
  loadFullConfig,
} from "../../extensions/jira-assets/jiraAssets.service";
import { ExtensionService } from "../../services/extension/extensionService";
import { testConnection as mlflowTest } from "../../extensions/mlflow/mlflow.service";
import { testConnection as azureTest } from "../../extensions/azure-ai-foundry/azureAiFoundry.service";

const mockClientFromConfig = clientFromConfig as jest.Mock;
const mockLoadFullConfig = loadFullConfig as jest.Mock;
const mockRuntimeConfig = ExtensionService.getRuntimeConfiguration as jest.Mock;
const mockMlflowTest = mlflowTest as jest.Mock;
const mockAzureTest = azureTest as jest.Mock;

function call(configuration: Record<string, unknown>, key = "jira-assets") {
  const req = {
    params: { key },
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

describe("POST /api/extensions/jira-assets/test-connection", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows the status the client reports", async () => {
    mockClientFromConfig.mockReturnValue({
      testConnection: jest.fn().mockResolvedValue({
        success: false,
        error: "Jira returned HTTP 500",
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
    const { status, body } = await call({ ...config, jira_base_url: "http://169.254.169.254" });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      success: false,
      message: "JIRA Base URL points to an address that is not allowed",
    });
    expect(mockClientFromConfig).not.toHaveBeenCalled();
  });

  it.each([
    [{ jira_base_url: "jira.example.com" }, "JIRA Base URL must be a valid http or https URL"],
    [
      { jira_base_url: "https://u:p@jira.example.com" },
      "JIRA Base URL must not include a user name or password",
    ],
    [
      { workspace_id: "a/b" },
      "Workspace ID may only contain letters, numbers and hyphens, up to 64 characters",
    ],
    [{ workspace_id: "  " }, "Workspace ID is required"],
    [{ deployment_type: "server" }, "Deployment type must be cloud or datacenter"],
    [{ deployment_type: "cloud", email: "not-an-email" }, "Email must be a valid email address"],
    [{ email: 42 }, "Jira connection fields must be text"],
  ])(
    "answers invalid fields %p as a failed test with the save message",
    async (change, message) => {
      const { status, body } = await call({ ...config, ...change });
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ success: false, message });
      expect(mockClientFromConfig).not.toHaveBeenCalled();
    },
  );

  it("answers a missing token with none stored as a failed test, not a server error", async () => {
    mockLoadFullConfig.mockResolvedValue(null);
    const { status, body } = await call({ ...config, api_token: "" });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ success: false, message: "API Token is required" });
    expect(mockClientFromConfig).not.toHaveBeenCalled();
  });

  it("tests the trimmed fields, as a save stores them", async () => {
    mockClientFromConfig.mockReturnValue({
      testConnection: jest.fn().mockResolvedValue({ success: true }),
    });
    await call({
      ...config,
      jira_base_url: "  https://jira.example.com ",
      workspace_id: " w ",
      email: " a@example.com ",
      api_token: " t ",
    });
    expect(mockClientFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        jira_base_url: "https://jira.example.com",
        workspace_id: "w",
        email: "a@example.com",
        api_token: "t",
        deployment_type: "datacenter",
      }),
    );
  });
});

describe("jira-assets test connection with a missing configuration", () => {
  afterEach(() => jest.resetAllMocks());

  // Field checks (parseJiraConnection) run first, so an empty submission is
  // answered by the save message for the first missing field.
  it("answers a failed test, not a 500, when nothing is submitted or stored", async () => {
    mockLoadFullConfig.mockResolvedValue(null);
    const { status, body } = await call({});
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      success: false,
      message: "JIRA Base URL is required",
    });
    expect(mockClientFromConfig).not.toHaveBeenCalled();
  });

  const validFields = {
    jira_base_url: "https://jira.example.com",
    workspace_id: "ws-1",
    email: "a@example.com",
    deployment_type: "cloud",
  };

  it("answers a client that reports a missing field without its raw text", async () => {
    mockLoadFullConfig.mockResolvedValue({ ...validFields, api_token: "stored" });
    mockClientFromConfig.mockImplementation(() => {
      throw new JiraNotConfiguredError("Jira connection is not fully configured");
    });
    const { status, body } = await call(validFields);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      success: false,
      message: "Save the Jira Assets connection first.",
    });
    expect(body.data.message).not.toContain("not fully configured");
  });

  it("keeps the 500 for a real fault", async () => {
    mockLoadFullConfig.mockRejectedValue(new Error("connection terminated"));
    const { status } = await call(validFields);
    expect(status).toBe(500);
  });
});

describe("test connection never sends a stored secret to a changed address", () => {
  const ok = { success: true, message: "ok", testedAt: "t" };
  beforeEach(() => {
    mockMlflowTest.mockResolvedValue(ok);
    mockAzureTest.mockResolvedValue(ok);
  });
  afterEach(() => jest.resetAllMocks());

  describe("mlflow", () => {
    const stored = {
      tracking_server_url: "https://mlflow.example.com",
      auth_method: "token",
      api_token: "stored-token",
    };

    it("fails a changed URL without a token and does not call the server", async () => {
      mockRuntimeConfig.mockResolvedValue(stored);
      const { status, body } = await call(
        { tracking_server_url: "https://evil.example.com" },
        "mlflow",
      );
      expect(status).toBe(200);
      expect(body.data).toMatchObject({
        success: false,
        message: "Enter the API token again: the tracking server URL changed.",
      });
      expect(mockMlflowTest).not.toHaveBeenCalled();
    });

    it("uses a newly submitted token for a changed URL", async () => {
      mockRuntimeConfig.mockResolvedValue(stored);
      await call({ tracking_server_url: "https://new.example.com", api_token: "new" }, "mlflow");
      expect(mockMlflowTest).toHaveBeenCalledWith(
        expect.objectContaining({
          tracking_server_url: "https://new.example.com",
          api_token: "new",
        }),
      );
    });

    it("keeps the stored token when the URL is unchanged (trailing slash, spaces)", async () => {
      mockRuntimeConfig.mockResolvedValue(stored);
      await call({ tracking_server_url: " https://mlflow.example.com/ " }, "mlflow");
      expect(mockMlflowTest).toHaveBeenCalledWith(
        expect.objectContaining({ api_token: "stored-token" }),
      );
    });

    it("fails a changed username under basic auth without a password", async () => {
      mockRuntimeConfig.mockResolvedValue({
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "basic",
        username: "alice",
        password: "stored-password",
      });
      const { body } = await call({ username: "mallory" }, "mlflow");
      expect(body.data).toMatchObject({
        success: false,
        message: "Enter the password again: the username changed.",
      });
      expect(mockMlflowTest).not.toHaveBeenCalled();
    });

    it("drops a stored secret the new auth method would not send", async () => {
      mockRuntimeConfig.mockResolvedValue(stored);
      await call({ tracking_server_url: "https://new.example.com", auth_method: "none" }, "mlflow");
      const sent = mockMlflowTest.mock.calls[0][0];
      expect(sent).not.toHaveProperty("api_token");
    });
  });

  describe("azure-ai-foundry", () => {
    const stored = { project_endpoint: "https://a.services.ai.azure.com/p", api_key: "stored-key" };

    it("fails a changed endpoint without a key and does not call the server", async () => {
      mockRuntimeConfig.mockResolvedValue(stored);
      const { body } = await call(
        { project_endpoint: "https://evil.example.com" },
        "azure-ai-foundry",
      );
      expect(body.data).toMatchObject({
        success: false,
        message: "Enter the API key again: the project endpoint changed.",
      });
      expect(mockAzureTest).not.toHaveBeenCalled();
    });

    it("uses a newly submitted key for a changed endpoint", async () => {
      mockRuntimeConfig.mockResolvedValue(stored);
      await call(
        { project_endpoint: "https://new.example.com", api_key: "new" },
        "azure-ai-foundry",
      );
      expect(mockAzureTest).toHaveBeenCalledWith(expect.objectContaining({ api_key: "new" }));
    });

    it("keeps the stored key when the endpoint is unchanged", async () => {
      mockRuntimeConfig.mockResolvedValue(stored);
      await call({ project_endpoint: "https://a.services.ai.azure.com/p/" }, "azure-ai-foundry");
      expect(mockAzureTest).toHaveBeenCalledWith(
        expect.objectContaining({ api_key: "stored-key" }),
      );
    });
  });

  describe("jira-assets", () => {
    const stored = { ...config, api_token: "stored-token" };

    it("fails a changed base URL without a token and builds no client", async () => {
      mockLoadFullConfig.mockResolvedValue(stored);
      const { body } = await call({
        ...config,
        api_token: "",
        jira_base_url: "https://evil.example.com",
      });
      expect(body.data).toMatchObject({
        success: false,
        message: "Enter the API token again: the Jira base URL changed.",
      });
      expect(mockClientFromConfig).not.toHaveBeenCalled();
    });

    it("fails a changed email without a token", async () => {
      mockLoadFullConfig.mockResolvedValue(stored);
      const { body } = await call({ ...config, api_token: "", email: "x@example.com" });
      expect(body.data.message).toBe("Enter the API token again: the email changed.");
      expect(mockClientFromConfig).not.toHaveBeenCalled();
    });

    it("reuses the stored token when nothing changed", async () => {
      mockLoadFullConfig.mockResolvedValue(stored);
      mockClientFromConfig.mockReturnValue({
        testConnection: jest.fn().mockResolvedValue({ success: true }),
      });
      await call({ ...config, api_token: "", jira_base_url: "https://jira.example.com/" });
      expect(mockClientFromConfig).toHaveBeenCalledWith(
        expect.objectContaining({ api_token: "stored-token" }),
      );
    });

    it("uses a new token for a changed base URL without reading the stored one", async () => {
      mockClientFromConfig.mockReturnValue({
        testConnection: jest.fn().mockResolvedValue({ success: true }),
      });
      await call({ ...config, jira_base_url: "https://new.example.com", api_token: "new" });
      expect(mockLoadFullConfig).not.toHaveBeenCalled();
      expect(mockClientFromConfig).toHaveBeenCalledWith(
        expect.objectContaining({ api_token: "new" }),
      );
    });
  });
});
