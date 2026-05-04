import { describe, it, expect } from "vitest";
import { getBuiltinPluginComponents, isBuiltinPlugin } from "../builtinPlugins.registry";

describe("builtinPlugins.registry", () => {
  describe("isBuiltinPlugin", () => {
    it('returns true for "dataset-bulk-upload"', () => {
      expect(isBuiltinPlugin("dataset-bulk-upload")).toBe(true);
    });

    it('returns false for "nonexistent"', () => {
      expect(isBuiltinPlugin("nonexistent")).toBe(false);
    });
  });

  describe("getBuiltinPluginComponents", () => {
    it('returns object with BulkUploadButton and BulkUploadModal for "dataset-bulk-upload"', () => {
      const components = getBuiltinPluginComponents("dataset-bulk-upload");

      expect(components).not.toBeNull();
      expect(components).toHaveProperty("BulkUploadButton");
      expect(components).toHaveProperty("BulkUploadModal");
    });

    it('returns null for "nonexistent"', () => {
      expect(getBuiltinPluginComponents("nonexistent")).toBeNull();
    });
  });
});
