/**
 * @fileoverview Plugin Service Tests
 *
 * Tests for PluginService: marketplace fetch, install lifecycle,
 * builtin detection, configuration update, search.
 *
 * @module tests/pluginService
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("axios", () => ({
  get: jest.fn(),
}));

jest.mock("../../../utils/pluginInstallation.utils", () => ({
  createInstallation: jest.fn(),
  findByIdWithValidation: jest.fn(),
  getInstalledPlugins: jest.fn(),
  toJSON: jest.fn().mockImplementation((obj: any) => ({ ...obj })),
  updateConfiguration: jest.fn(),
  deleteInstallation: jest.fn(),
  findByPlugin: jest.fn(),
}));

jest.mock("../builtinPlugins", () => ({
  getBuiltinPlugins: jest.fn().mockReturnValue([
    {
      key: "dataset-bulk-upload",
      name: "dataset-bulk-upload",
      displayName: "Dataset Bulk Upload",
      description: "Bulk upload datasets",
      version: "1.0.0",
      category: "data_governance",
      isOfficial: true,
      isPublished: true,
      isBuiltIn: true,
      requiresConfiguration: false,
      installationType: "built-in",
      features: [],
      tags: ["dataset"],
      pluginPath: "__builtin__",
      entryPoint: "__builtin__",
    },
  ]),
  isBuiltinPlugin: jest.fn().mockImplementation((key: string) => key === "dataset-bulk-upload"),
}));

jest.mock("../../../utils/validations/validation.utils", () => ({
  sanitizeForLog: jest.fn().mockImplementation((s: string) => s),
}));

import { PluginService } from "../pluginService";
import axios from "axios";
import {
  createInstallation,
  findByIdWithValidation,
  getInstalledPlugins,
  deleteInstallation,
} from "../../../utils/pluginInstallation.utils";
import { isBuiltinPlugin } from "../builtinPlugins";

const mockAxiosGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockCreateInstallation = createInstallation as jest.MockedFunction<typeof createInstallation>;
const mockFindByIdWithValidation = findByIdWithValidation as jest.MockedFunction<
  typeof findByIdWithValidation
>;
const mockGetInstalledPlugins = getInstalledPlugins as jest.MockedFunction<
  typeof getInstalledPlugins
>;
const mockDeleteInstallation = deleteInstallation as jest.MockedFunction<typeof deleteInstallation>;
const mockIsBuiltinPlugin = isBuiltinPlugin as jest.MockedFunction<typeof isBuiltinPlugin>;

const mockMarketplace = {
  version: "1.0.0",
  plugins: [
    {
      key: "mlflow",
      name: "mlflow",
      displayName: "MLflow",
      description: "MLflow integration",
      version: "1.0.0",
      category: "ml_ops",
      isOfficial: true,
      isPublished: true,
      requiresConfiguration: true,
      installationType: "remote",
      features: [],
      tags: ["mlflow", "ml"],
      pluginPath: "plugins/mlflow",
      entryPoint: "dist/index.js",
    },
    {
      key: "unpublished",
      name: "unpublished",
      displayName: "Unpublished",
      description: "Not published",
      version: "0.1.0",
      category: "other",
      isPublished: false,
      features: [],
      tags: [],
      pluginPath: "plugins/unpublished",
      entryPoint: "index.js",
    },
  ],
  categories: [{ id: "ml_ops", name: "ML Ops", description: "ML operations plugins" }],
};

describe("PluginService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: mockMarketplace });
  });

  describe("getAllPlugins", () => {
    it("should return published plugins from marketplace and built-ins", async () => {
      const plugins = await PluginService.getAllPlugins();

      // Built-in (dataset-bulk-upload) + remote (mlflow) = 2 published
      expect(plugins.length).toBe(2);
      expect(plugins.some((p) => p.key === "dataset-bulk-upload")).toBe(true);
      expect(plugins.some((p) => p.key === "mlflow")).toBe(true);
    });

    it("should filter by category", async () => {
      const plugins = await PluginService.getAllPlugins("ml_ops");

      expect(plugins.length).toBe(1);
      expect(plugins[0].key).toBe("mlflow");
    });

    it("should exclude unpublished plugins", async () => {
      const plugins = await PluginService.getAllPlugins();

      expect(plugins.some((p) => p.key === "unpublished")).toBe(false);
    });

    it("should throw on marketplace fetch failure", async () => {
      mockAxiosGet.mockRejectedValue(new Error("Network error"));

      await expect(PluginService.getAllPlugins()).rejects.toThrow("Failed to fetch plugins");
    });
  });

  describe("getPluginByKey", () => {
    it("should return built-in plugin first", async () => {
      const plugin = await PluginService.getPluginByKey("dataset-bulk-upload");

      expect(plugin).toBeDefined();
      expect(plugin!.key).toBe("dataset-bulk-upload");
      // Should not call marketplace fetch for built-in
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it("should return remote plugin from marketplace", async () => {
      const plugin = await PluginService.getPluginByKey("mlflow");

      expect(plugin).toBeDefined();
      expect(plugin!.key).toBe("mlflow");
    });

    it("should return null for non-existent plugin", async () => {
      const plugin = await PluginService.getPluginByKey("nonexistent");

      expect(plugin).toBeNull();
    });
  });

  describe("searchPlugins", () => {
    it("should search by name", async () => {
      const plugins = await PluginService.searchPlugins("mlflow");

      expect(plugins.length).toBe(1);
      expect(plugins[0].key).toBe("mlflow");
    });

    it("should search by tag", async () => {
      const plugins = await PluginService.searchPlugins("dataset");

      expect(plugins.some((p) => p.key === "dataset-bulk-upload")).toBe(true);
    });

    it("should search case-insensitively", async () => {
      const plugins = await PluginService.searchPlugins("MLFLOW");

      expect(plugins.length).toBe(1);
    });
  });

  describe("installPlugin", () => {
    it("should install built-in plugin without remote download", async () => {
      mockCreateInstallation.mockResolvedValue({
        id: 1,
        plugin_key: "dataset-bulk-upload",
        status: "installed",
      } as any);

      const result = await PluginService.installPlugin("dataset-bulk-upload", 1, 10);

      expect(result).toBeDefined();
      expect(mockCreateInstallation).toHaveBeenCalledWith("dataset-bulk-upload", 10);
    });

    it("should throw NotFoundException for unknown plugin", async () => {
      mockAxiosGet.mockResolvedValue({ data: { ...mockMarketplace, plugins: [] } });

      await expect(PluginService.installPlugin("nonexistent", 1, 10)).rejects.toThrow(
        "Plugin not found in marketplace",
      );
    });
  });

  describe("uninstallPlugin", () => {
    it("should uninstall built-in plugin without remote code", async () => {
      mockFindByIdWithValidation.mockResolvedValue({
        id: 1,
        plugin_key: "dataset-bulk-upload",
      } as any);
      mockDeleteInstallation.mockResolvedValue(undefined);

      await PluginService.uninstallPlugin(1, 1, 10);

      expect(mockDeleteInstallation).toHaveBeenCalledWith(1, 10);
    });
  });

  describe("getInstalledPlugins", () => {
    it("should return installed plugins with metadata", async () => {
      mockGetInstalledPlugins.mockResolvedValue([
        { plugin_key: "dataset-bulk-upload", status: "installed" },
      ] as any);

      const result = await PluginService.getInstalledPlugins(10);

      expect(result.length).toBe(1);
      expect(result[0].plugin.key).toBe("dataset-bulk-upload");
    });

    it("should handle plugin not found in marketplace", async () => {
      mockGetInstalledPlugins.mockResolvedValue([
        { plugin_key: "removed-plugin", status: "installed" },
      ] as any);
      mockIsBuiltinPlugin.mockReturnValueOnce(false);
      mockAxiosGet.mockResolvedValue({ data: { ...mockMarketplace, plugins: [] } });

      const result = await PluginService.getInstalledPlugins(10);

      expect(result[0].plugin.description).toBe("Plugin not found in marketplace");
    });
  });

  describe("getCategories", () => {
    it("should return marketplace categories merged with built-in categories", async () => {
      const categories = await PluginService.getCategories();

      expect(categories.length).toBeGreaterThanOrEqual(1);
      // Should include ml_ops from marketplace
      expect(categories.some((c: any) => c.id === "ml_ops")).toBe(true);
      // Should include data_governance from built-in
      expect(categories.some((c: any) => c.id === "data_governance")).toBe(true);
    });
  });
});
