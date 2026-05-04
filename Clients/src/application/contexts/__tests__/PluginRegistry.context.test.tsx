import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PluginRegistryProvider, usePluginRegistry } from "../PluginRegistry.context";

vi.mock("../../repository/plugin.repository", () => ({
  getInstalledPlugins: vi.fn().mockResolvedValue([
    { pluginKey: "risk-import", status: "installed" },
    { pluginKey: "soc2", status: "installed" },
    { pluginKey: "old-plugin", status: "uninstalled" },
  ]),
}));

vi.mock("../../registry/builtinPlugins.registry", () => ({
  getBuiltinPluginComponents: vi.fn().mockReturnValue(null),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(PluginRegistryProvider, null, children),
    );
}

describe("PluginRegistryContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("usePluginRegistry", () => {
    it("should throw when used outside provider", () => {
      const queryClient = new QueryClient();
      const qWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      expect(() => {
        renderHook(() => usePluginRegistry(), { wrapper: qWrapper });
      }).toThrow("usePluginRegistry must be used within PluginRegistryProvider");
    });

    it("should load installed plugins", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => usePluginRegistry(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should filter to only "installed" status
      expect(result.current.installedPlugins).toHaveLength(2);
      expect(result.current.installedPlugins[0].pluginKey).toBe("risk-import");
      expect(result.current.installedPlugins[1].pluginKey).toBe("soc2");
    });

    it("should check if a plugin is installed", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => usePluginRegistry(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isPluginInstalled("risk-import")).toBe(true);
      expect(result.current.isPluginInstalled("soc2")).toBe(true);
      expect(result.current.isPluginInstalled("old-plugin")).toBe(false);
      expect(result.current.isPluginInstalled("nonexistent")).toBe(false);
    });

    it("should return empty components for unknown slot", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => usePluginRegistry(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getComponentsForSlot("unknown-slot")).toEqual([]);
    });

    it("should return empty tabs for unknown slot", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => usePluginRegistry(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getPluginTabs("unknown-slot")).toEqual([]);
    });

    it("should have loadedComponents as an empty Map initially", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => usePluginRegistry(), { wrapper });

      expect(result.current.loadedComponents.size).toBe(0);
    });
  });
});
