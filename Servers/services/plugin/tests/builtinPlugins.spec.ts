/**
 * @fileoverview Built-in Plugins Tests
 *
 * Tests for getBuiltinPlugins and isBuiltinPlugin functions.
 *
 * @module tests/builtinPlugins
 */

import { getBuiltinPlugins, isBuiltinPlugin } from "../builtinPlugins";

describe("builtinPlugins", () => {
  describe("getBuiltinPlugins", () => {
    it("should return an array of built-in plugins", () => {
      const plugins = getBuiltinPlugins();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBeGreaterThan(0);
    });

    it("should return plugins with required fields", () => {
      const plugins = getBuiltinPlugins();

      for (const plugin of plugins) {
        expect(plugin.key).toBeDefined();
        expect(plugin.name).toBeDefined();
        expect(plugin.displayName).toBeDefined();
        expect(plugin.description).toBeDefined();
        expect(plugin.version).toBeDefined();
        expect(plugin.category).toBeDefined();
        expect(plugin.isBuiltIn).toBe(true);
        expect(plugin.isPublished).toBe(true);
        expect(plugin.pluginPath).toBe("__builtin__");
        expect(plugin.entryPoint).toBe("__builtin__");
      }
    });

    it("should include dataset-bulk-upload plugin", () => {
      const plugins = getBuiltinPlugins();
      const datasetPlugin = plugins.find((p) => p.key === "dataset-bulk-upload");

      expect(datasetPlugin).toBeDefined();
      expect(datasetPlugin!.displayName).toBe("Dataset Bulk Upload");
      expect(datasetPlugin!.category).toBe("data_governance");
    });

    it("should return plugins with features array", () => {
      const plugins = getBuiltinPlugins();

      for (const plugin of plugins) {
        expect(Array.isArray(plugin.features)).toBe(true);
        expect(plugin.features.length).toBeGreaterThan(0);
        for (const feature of plugin.features) {
          expect(feature.name).toBeDefined();
          expect(feature.description).toBeDefined();
          expect(typeof feature.displayOrder).toBe("number");
        }
      }
    });

    it("should return plugins with tags array", () => {
      const plugins = getBuiltinPlugins();

      for (const plugin of plugins) {
        expect(Array.isArray(plugin.tags)).toBe(true);
        expect(plugin.tags.length).toBeGreaterThan(0);
      }
    });
  });

  describe("isBuiltinPlugin", () => {
    it("should return true for known built-in plugin keys", () => {
      expect(isBuiltinPlugin("dataset-bulk-upload")).toBe(true);
    });

    it("should return false for unknown plugin keys", () => {
      expect(isBuiltinPlugin("unknown-plugin")).toBe(false);
      expect(isBuiltinPlugin("mlflow")).toBe(false);
      expect(isBuiltinPlugin("")).toBe(false);
    });

    it("should be case-sensitive", () => {
      expect(isBuiltinPlugin("Dataset-Bulk-Upload")).toBe(false);
      expect(isBuiltinPlugin("DATASET-BULK-UPLOAD")).toBe(false);
    });
  });
});
