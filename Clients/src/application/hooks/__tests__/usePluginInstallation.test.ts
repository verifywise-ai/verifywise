import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockRefreshPlugins = vi.fn().mockResolvedValue(undefined);
const mockUnloadPlugin = vi.fn();

vi.mock("../../contexts/PluginRegistry.context", () => ({
  usePluginRegistry: () => ({
    refreshPlugins: mockRefreshPlugins,
    unloadPlugin: mockUnloadPlugin,
  }),
}));

vi.mock("../../repository/plugin.repository", () => ({
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
}));

import { usePluginInstallation } from "../usePluginInstallation";
import { installPlugin, uninstallPlugin } from "../../repository/plugin.repository";

const mockInstall = vi.mocked(installPlugin);
const mockUninstall = vi.mocked(uninstallPlugin);

describe("usePluginInstallation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("installs a plugin and refreshes", async () => {
    mockInstall.mockResolvedValue({ id: 1, pluginKey: "soc2", status: "active" } as any);

    const { result } = renderHook(() => usePluginInstallation());

    await act(async () => {
      await result.current.install("soc2");
    });

    expect(mockInstall).toHaveBeenCalledWith({ pluginKey: "soc2" });
    expect(mockRefreshPlugins).toHaveBeenCalled();
    expect(result.current.installing).toBeNull();
  });

  it("sets error on install failure", async () => {
    mockInstall.mockRejectedValue(new Error("Plugin not found"));

    const { result } = renderHook(() => usePluginInstallation());

    await act(async () => {
      try {
        await result.current.install("bad-plugin");
      } catch {
        // expected to throw
      }
    });

    expect(result.current.error).toBe("Plugin not found");
    expect(result.current.installing).toBeNull();
  });

  it("uninstalls a plugin and unloads UI", async () => {
    mockUninstall.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePluginInstallation());

    await act(async () => {
      await result.current.uninstall(42, "gdpr");
    });

    expect(mockUninstall).toHaveBeenCalledWith({ installationId: 42 });
    expect(mockUnloadPlugin).toHaveBeenCalledWith("gdpr");
    expect(mockRefreshPlugins).toHaveBeenCalled();
    expect(result.current.uninstalling).toBeNull();
  });

  it("uninstalls without pluginKey (skips unloadPlugin)", async () => {
    mockUninstall.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePluginInstallation());

    await act(async () => {
      await result.current.uninstall(10);
    });

    expect(mockUnloadPlugin).not.toHaveBeenCalled();
    expect(mockRefreshPlugins).toHaveBeenCalled();
  });

  it("sets error on uninstall failure", async () => {
    mockUninstall.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => usePluginInstallation());

    await act(async () => {
      try {
        await result.current.uninstall(99);
      } catch {
        // expected to throw
      }
    });

    expect(result.current.error).toBe("Server error");
    expect(result.current.uninstalling).toBeNull();
  });
});
