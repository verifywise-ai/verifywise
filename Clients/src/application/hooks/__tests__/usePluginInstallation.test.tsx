import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePluginInstallation } from "../usePluginInstallation";
import * as pluginRepository from "../../repository/plugin.repository";
import { usePluginRegistry } from "../../contexts/PluginRegistry.context";

vi.mock("../../contexts/PluginRegistry.context", () => {
  const mockFn = vi.fn();
  return {
    usePluginRegistry: mockFn,
  };
});

vi.mock("../../repository/plugin.repository", () => ({
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
}));

const mockUsePluginRegistry = usePluginRegistry as unknown as ReturnType<typeof vi.fn>;
const mockInstallPlugin = pluginRepository.installPlugin as unknown as ReturnType<typeof vi.fn>;
const mockUninstallPlugin = pluginRepository.uninstallPlugin as unknown as ReturnType<typeof vi.fn>;

describe("usePluginInstallation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePluginRegistry.mockReturnValue({
      refreshPlugins: vi.fn().mockResolvedValue(undefined),
      unloadPlugin: vi.fn(),
    });
  });

  describe("install", () => {
    it("should set installing state during installation", async () => {
      mockInstallPlugin.mockResolvedValue({ id: 1 });

      const { result } = renderHook(() => usePluginInstallation());

      expect(result.current.installing).toBeNull();
      expect(result.current.error).toBeNull();

      await act(async () => {
        await result.current.install("test-plugin");
      });

      expect(result.current.installing).toBeNull();
      expect(mockInstallPlugin).toHaveBeenCalledWith({ pluginKey: "test-plugin" });
    });

    it("should handle install error", async () => {
      const error = new Error("Installation failed");
      mockInstallPlugin.mockRejectedValue(error);

      const { result } = renderHook(() => usePluginInstallation());

      await act(async () => {
        try {
          await result.current.install("test-plugin");
        } catch {
          // Expected
        }
      });

      expect(result.current.installing).toBeNull();
      expect(result.current.error).toBe("Installation failed");
    });

    it("should clear installing state on error", async () => {
      mockInstallPlugin.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => usePluginInstallation());

      await act(async () => {
        try {
          await result.current.install("plugin-key");
        } catch {
          // Expected
        }
      });

      expect(result.current.installing).toBeNull();
    });
  });

  describe("uninstall", () => {
    it("should set uninstalling state during uninstallation", async () => {
      mockUninstallPlugin.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePluginInstallation());

      expect(result.current.uninstalling).toBeNull();

      await act(async () => {
        await result.current.uninstall(123, "test-plugin");
      });

      expect(result.current.uninstalling).toBeNull();
      expect(mockUninstallPlugin).toHaveBeenCalledWith({ installationId: 123 });
    });

    it("should handle uninstall error", async () => {
      const error = new Error("Uninstall failed");
      mockUninstallPlugin.mockRejectedValue(error);

      const { result } = renderHook(() => usePluginInstallation());

      await act(async () => {
        try {
          await result.current.uninstall(123);
        } catch {
          // Expected
        }
      });

      expect(result.current.uninstalling).toBeNull();
      expect(result.current.error).toBe("Uninstall failed");
    });

    it("should not unload plugin if pluginKey not provided", async () => {
      mockUninstallPlugin.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePluginInstallation());

      await act(async () => {
        await result.current.uninstall(123);
      });

      expect(result.current.uninstalling).toBeNull();
    });
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const { result } = renderHook(() => usePluginInstallation());

      expect(result.current.installing).toBeNull();
      expect(result.current.uninstalling).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
