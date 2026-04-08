import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  connectOAuthWorkspace,
  disconnectOAuthWorkspace,
  getAllPlugins,
  getCategories,
  getInstalledPlugins,
  getOAuthWorkspaces,
  getPluginByKey,
  installPlugin,
  searchPlugins,
  testPluginConnection,
  uninstallPlugin,
  updateOAuthWorkspace,
  updatePluginConfiguration,
} from "../plugin.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockPlugins = [
  {
    id: 1,
    key: "slack-integration",
    name: "Slack Integration",
    description: "Send notifications to Slack",
    version: "1.0.0",
    category: "integrations",
  },
  {
    id: 2,
    key: "github-sync",
    name: "GitHub Sync",
    description: "Sync with GitHub repositories",
    version: "2.1.0",
    category: "integrations",
  },
];

const mockPlugin = {
  id: 1,
  key: "slack-integration",
  name: "Slack Integration",
  description: "Send notifications to Slack",
  version: "1.0.0",
  category: "integrations",
  configuration: {
    webhookUrl: "https://hooks.slack.com/...",
  },
};

const mockPluginInstallation = {
  id: 1,
  pluginKey: "slack-integration",
  organizationId: 123,
  configuration: {
    webhookUrl: "https://hooks.slack.com/...",
    channel: "#general",
  },
  enabled: true,
  createdAt: "2026-03-12T00:00:00Z",
};

const mockCategories = [
  {
    id: 1,
    name: "integrations",
    label: "Integrations",
    description: "Third-party integrations",
  },
  {
    id: 2,
    name: "frameworks",
    label: "Compliance Frameworks",
    description: "Compliance framework plugins",
  },
];

const mockOAuthWorkspaces = [
  {
    id: 1,
    worksheetId: "T12345",
    teamName: "My Workspace",
    isActive: true,
  },
];

describe("plugin.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllPlugins", () => {
    it("should fetch all plugins without filters", async () => {
      const response = { data: { data: mockPlugins } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllPlugins({});

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/marketplace", {
        category: undefined,
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockPlugins);
    });

    it("should fetch plugins with category filter", async () => {
      const response = { data: { data: mockPlugins } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllPlugins({ category: "integrations" });

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/marketplace", {
        category: "integrations",
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockPlugins);
    });

    it("should pass AbortSignal for request cancellation", async () => {
      const abortController = new AbortController();
      const response = { data: { data: mockPlugins } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllPlugins({
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/marketplace", {
        category: undefined,
        signal: abortController.signal,
        responseType: "json",
      });
      expect(result).toEqual(mockPlugins);
    });

    it("should support custom responseType", async () => {
      const response = { data: { data: mockPlugins } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getAllPlugins({ responseType: "blob" });

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/marketplace", {
        category: undefined,
        signal: undefined,
        responseType: "blob",
      });
    });

    it("should handle empty plugins list", async () => {
      const response = { data: { data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllPlugins({});

      expect(result).toEqual([]);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllPlugins({})).rejects.toThrow("Network error");
    });
  });

  describe("getPluginByKey", () => {
    it("should fetch plugin by key", async () => {
      const response = { data: { data: mockPlugin } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getPluginByKey({ key: "slack-integration" });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/marketplace/slack-integration",
        {
          signal: undefined,
          responseType: "json",
        },
      );
      expect(result).toEqual(mockPlugin);
    });

    it("should pass AbortSignal to API call", async () => {
      const abortController = new AbortController();
      const response = { data: { data: mockPlugin } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getPluginByKey({
        key: "slack-integration",
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/marketplace/slack-integration",
        {
          signal: abortController.signal,
          responseType: "json",
        },
      );
      expect(result).toEqual(mockPlugin);
    });

    it("should support custom responseType", async () => {
      const response = { data: { data: mockPlugin } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getPluginByKey({
        key: "slack-integration",
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/marketplace/slack-integration",
        {
          signal: undefined,
          responseType: "blob",
        },
      );
    });

    it("should handle plugin not found", async () => {
      const error = new Error("Plugin not found");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getPluginByKey({ key: "non-existent" })).rejects.toThrow(
        "Plugin not found",
      );
    });
  });

  describe("searchPlugins", () => {
    it("should search plugins by query", async () => {
      const response = { data: { data: mockPlugins } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await searchPlugins({ query: "slack" });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/marketplace/search",
        {
          q: "slack",
          signal: undefined,
          responseType: "json",
        },
      );
      expect(result).toEqual(mockPlugins);
    });

    it("should pass AbortSignal to search request", async () => {
      const abortController = new AbortController();
      const response = { data: { data: mockPlugins } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await searchPlugins({
        query: "slack",
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/marketplace/search",
        {
          q: "slack",
          signal: abortController.signal,
          responseType: "json",
        },
      );
      expect(result).toEqual(mockPlugins);
    });

    it("should support custom responseType in search", async () => {
      const response = { data: { data: mockPlugins } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await searchPlugins({
        query: "integration",
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/marketplace/search",
        {
          q: "integration",
          signal: undefined,
          responseType: "blob",
        },
      );
    });

    it("should return empty array when no plugins match query", async () => {
      const response = { data: { data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await searchPlugins({ query: "nonexistent" });

      expect(result).toEqual([]);
    });

    it("should handle search API errors", async () => {
      const error = new Error("Search failed");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(searchPlugins({ query: "slack" })).rejects.toThrow(
        "Search failed",
      );
    });
  });

  describe("installPlugin", () => {
    it("should install plugin successfully", async () => {
      const response = { data: { data: mockPluginInstallation } };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await installPlugin({ pluginKey: "slack-integration" });

      expect(apiServices.post).toHaveBeenCalledWith("/plugins/install", {
        pluginKey: "slack-integration",
      });
      expect(result).toEqual(mockPluginInstallation);
    });

    it("should handle installation errors", async () => {
      const error = new Error("Installation failed");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        installPlugin({ pluginKey: "slack-integration" }),
      ).rejects.toThrow("Installation failed");
    });

    it("should handle plugin already installed error", async () => {
      const error = new Error("Plugin already installed");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        installPlugin({ pluginKey: "slack-integration" }),
      ).rejects.toThrow("Plugin already installed");
    });
  });

  describe("uninstallPlugin", () => {
    it("should uninstall plugin successfully", async () => {
      const response = { data: { data: { success: true } } };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      const result = await uninstallPlugin({ installationId: 1 });

      expect(apiServices.delete).toHaveBeenCalledWith(
        "/plugins/installations/1",
      );
      expect(result).toEqual({ success: true });
    });

    it("should handle uninstall errors", async () => {
      const error = new Error("Uninstall failed");
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(uninstallPlugin({ installationId: 1 })).rejects.toThrow(
        "Uninstall failed",
      );
    });

    it("should handle installation not found", async () => {
      const error = new Error("Installation not found");
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(uninstallPlugin({ installationId: 999 })).rejects.toThrow(
        "Installation not found",
      );
    });
  });

  describe("getInstalledPlugins", () => {
    it("should fetch installed plugins with defaults", async () => {
      const response = { data: { data: [mockPluginInstallation] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getInstalledPlugins();

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/installations", {
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual([mockPluginInstallation]);
    });

    it("should fetch installed plugins with AbortSignal", async () => {
      const abortController = new AbortController();
      const response = { data: { data: [mockPluginInstallation] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getInstalledPlugins({
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/installations", {
        signal: abortController.signal,
        responseType: "json",
      });
      expect(result).toEqual([mockPluginInstallation]);
    });

    it("should support custom responseType", async () => {
      const response = { data: { data: [mockPluginInstallation] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getInstalledPlugins({ responseType: "blob" });

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/installations", {
        signal: undefined,
        responseType: "blob",
      });
    });

    it("should return empty array when no plugins installed", async () => {
      const response = { data: { data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getInstalledPlugins();

      expect(result).toEqual([]);
    });

    it("should handle fetch errors", async () => {
      const error = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getInstalledPlugins()).rejects.toThrow("Network error");
    });
  });

  describe("getCategories", () => {
    it("should fetch categories with defaults", async () => {
      const response = { data: { data: mockCategories } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getCategories();

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/categories", {
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockCategories);
    });

    it("should fetch categories with AbortSignal", async () => {
      const abortController = new AbortController();
      const response = { data: { data: mockCategories } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getCategories({
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/categories", {
        signal: abortController.signal,
        responseType: "json",
      });
      expect(result).toEqual(mockCategories);
    });

    it("should support custom responseType", async () => {
      const response = { data: { data: mockCategories } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getCategories({ responseType: "blob" });

      expect(apiServices.get).toHaveBeenCalledWith("/plugins/categories", {
        signal: undefined,
        responseType: "blob",
      });
    });

    it("should handle category fetch errors", async () => {
      const error = new Error("Failed to fetch categories");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getCategories()).rejects.toThrow(
        "Failed to fetch categories",
      );
    });
  });

  describe("updatePluginConfiguration", () => {
    it("should update plugin configuration successfully", async () => {
      const updatedConfig = { webhookUrl: "https://new.slack.com/..." };
      const response = {
        data: {
          data: { ...mockPluginInstallation, configuration: updatedConfig },
        },
      };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      const result = await updatePluginConfiguration({
        installationId: 1,
        configuration: updatedConfig,
      });

      expect(apiServices.put).toHaveBeenCalledWith(
        "/plugins/installations/1/configuration",
        { configuration: updatedConfig },
      );
      expect(result.configuration).toEqual(updatedConfig);
    });

    it("should handle configuration update errors", async () => {
      const error = new Error("Configuration update failed");
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(
        updatePluginConfiguration({
          installationId: 1,
          configuration: {},
        }),
      ).rejects.toThrow("Configuration update failed");
    });

    it("should handle validation errors in configuration", async () => {
      const error = new Error("Invalid configuration");
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(
        updatePluginConfiguration({
          installationId: 1,
          configuration: { invalidKey: "value" },
        }),
      ).rejects.toThrow("Invalid configuration");
    });
  });

  describe("testPluginConnection", () => {
    it("should test plugin connection successfully", async () => {
      const testResult = { success: true, message: "Connection successful" };
      const response = { data: { data: testResult } };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await testPluginConnection({
        pluginKey: "slack-integration",
        configuration: { webhookUrl: "https://hooks.slack.com/..." },
      });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/plugins/slack-integration/test-connection",
        {
          configuration: { webhookUrl: "https://hooks.slack.com/..." },
        },
      );
      expect(result).toEqual(testResult);
    });

    it("should handle connection test failures", async () => {
      const testResult = { success: false, message: "Connection failed" };
      const response = { data: { data: testResult } };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await testPluginConnection({
        pluginKey: "slack-integration",
        configuration: { webhookUrl: "invalid" },
      });

      expect(result.success).toBe(false);
    });

    it("should handle API errors during test", async () => {
      const error = new Error("Test request failed");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        testPluginConnection({
          pluginKey: "slack-integration",
          configuration: {},
        }),
      ).rejects.toThrow("Test request failed");
    });
  });

  describe("connectOAuthWorkspace", () => {
    it("should connect OAuth workspace successfully", async () => {
      const response = { data: { data: mockOAuthWorkspaces[0] } };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await connectOAuthWorkspace({
        pluginKey: "slack-integration",
        code: "xoxb-auth-code",
      });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/plugins/slack-integration/oauth/connect",
        { code: "xoxb-auth-code" },
      );
      expect(result).toEqual(mockOAuthWorkspaces[0]);
    });

    it("should handle OAuth connection errors", async () => {
      const error = new Error("OAuth connection failed");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        connectOAuthWorkspace({
          pluginKey: "slack-integration",
          code: "invalid-code",
        }),
      ).rejects.toThrow("OAuth connection failed");
    });

    it("should handle expired authorization codes", async () => {
      const error = new Error("Authorization code expired");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        connectOAuthWorkspace({
          pluginKey: "slack-integration",
          code: "expired-code",
        }),
      ).rejects.toThrow("Authorization code expired");
    });
  });

  describe("getOAuthWorkspaces", () => {
    it("should fetch OAuth workspaces", async () => {
      const response = { data: { data: mockOAuthWorkspaces } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getOAuthWorkspaces({
        pluginKey: "slack-integration",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/slack-integration/oauth/workspaces",
        { signal: undefined },
      );
      expect(result).toEqual(mockOAuthWorkspaces);
    });

    it("should pass AbortSignal to OAuth workspace fetch", async () => {
      const abortController = new AbortController();
      const response = { data: { data: mockOAuthWorkspaces } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getOAuthWorkspaces({
        pluginKey: "slack-integration",
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/plugins/slack-integration/oauth/workspaces",
        { signal: abortController.signal },
      );
      expect(result).toEqual(mockOAuthWorkspaces);
    });

    it("should return empty array when no workspaces connected", async () => {
      const response = { data: { data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getOAuthWorkspaces({
        pluginKey: "slack-integration",
      });

      expect(result).toEqual([]);
    });

    it("should handle fetch errors", async () => {
      const error = new Error("Failed to fetch workspaces");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getOAuthWorkspaces({ pluginKey: "slack-integration" }),
      ).rejects.toThrow("Failed to fetch workspaces");
    });
  });

  describe("updateOAuthWorkspace", () => {
    it("should update OAuth workspace routing type", async () => {
      const updatedWorkspace = {
        ...mockOAuthWorkspaces[0],
        routing_type: ["#general", "#alerts"],
      };
      const response = { data: { data: updatedWorkspace } };
      vi.mocked(apiServices.patch).mockResolvedValue(response as any);

      const result = await updateOAuthWorkspace({
        pluginKey: "slack-integration",
        webhookId: 1,
        routing_type: ["#general", "#alerts"],
      });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/plugins/slack-integration/oauth/workspaces/1",
        { routing_type: ["#general", "#alerts"], is_active: undefined },
      );
      expect(result.routing_type).toEqual(["#general", "#alerts"]);
    });

    it("should update OAuth workspace active status", async () => {
      const response = {
        data: { data: { ...mockOAuthWorkspaces[0], isActive: false } },
      };
      vi.mocked(apiServices.patch).mockResolvedValue(response as any);

      const result = await updateOAuthWorkspace({
        pluginKey: "slack-integration",
        webhookId: 1,
        is_active: false,
      });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/plugins/slack-integration/oauth/workspaces/1",
        { routing_type: undefined, is_active: false },
      );
      expect(result.isActive).toBe(false);
    });

    it("should update both routing type and active status", async () => {
      const updated = {
        ...mockOAuthWorkspaces[0],
        routing_type: ["#alerts"],
        isActive: true,
      };
      const response = { data: { data: updated } };
      vi.mocked(apiServices.patch).mockResolvedValue(response as any);

      const result = await updateOAuthWorkspace({
        pluginKey: "slack-integration",
        webhookId: 1,
        routing_type: ["#alerts"],
        is_active: true,
      });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/plugins/slack-integration/oauth/workspaces/1",
        { routing_type: ["#alerts"], is_active: true },
      );
      expect(result.routing_type).toEqual(["#alerts"]);
      expect(result.isActive).toBe(true);
    });

    it("should handle update errors", async () => {
      const error = new Error("Update failed");
      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(
        updateOAuthWorkspace({
          pluginKey: "slack-integration",
          webhookId: 1,
        }),
      ).rejects.toThrow("Update failed");
    });
  });

  describe("disconnectOAuthWorkspace", () => {
    it("should disconnect OAuth workspace successfully", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({} as any);

      await disconnectOAuthWorkspace({
        pluginKey: "slack-integration",
        webhookId: 1,
      });

      expect(apiServices.delete).toHaveBeenCalledWith(
        "/plugins/slack-integration/oauth/workspaces/1",
      );
    });

    it("should handle disconnection errors", async () => {
      const error = new Error("Disconnection failed");
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(
        disconnectOAuthWorkspace({
          pluginKey: "slack-integration",
          webhookId: 1,
        }),
      ).rejects.toThrow("Disconnection failed");
    });

    it("should handle workspace not found error", async () => {
      const error = new Error("Workspace not found");
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(
        disconnectOAuthWorkspace({
          pluginKey: "slack-integration",
          webhookId: 999,
        }),
      ).rejects.toThrow("Workspace not found");
    });
  });
});
