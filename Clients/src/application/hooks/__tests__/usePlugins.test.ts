import { renderHook, waitFor, act } from "@testing-library/react";
import { usePlugins } from "../usePlugins";
import * as pluginRepository from "../../repository/plugin.repository";

const mockGetAllPlugins = pluginRepository.getAllPlugins as jest.Mock;
const mockGetInstalledPlugins = pluginRepository.getInstalledPlugins as jest.Mock;

vi.mock("../../repository/plugin.repository", () => ({
  getAllPlugins: vi.fn(),
  getInstalledPlugins: vi.fn(),
}));

describe("usePlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and empty plugins", async () => {
      mockGetAllPlugins.mockImplementation(
        () => new Promise(() => {})
      );
      mockGetInstalledPlugins.mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => usePlugins());

      expect(result.current.loading).toBe(true);
      expect(result.current.plugins).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe("successful fetch", () => {
    it("should return plugins on successful fetch", async () => {
      const mockPlugins = [
        { key: "plugin1", name: "Plugin 1", category: "compliance" },
        { key: "plugin2", name: "Plugin 2", category: "security" },
      ];

      mockGetAllPlugins.mockResolvedValue(mockPlugins);
      mockGetInstalledPlugins.mockResolvedValue([]);

      const { result } = renderHook(() => usePlugins());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plugins).toHaveLength(2);
      expect(result.current.plugins[0].key).toBe("plugin1");
      expect(result.current.plugins[1].key).toBe("plugin2");
      expect(result.current.error).toBeNull();
    });

    it("should filter plugins by category", async () => {
      const mockPlugins = [
        { key: "plugin1", name: "Plugin 1", category: "compliance" },
        { key: "plugin2", name: "Plugin 2", category: "security" },
      ];

      mockGetAllPlugins.mockResolvedValue(mockPlugins);
      mockGetInstalledPlugins.mockResolvedValue([]);

      const { result } = renderHook(() => usePlugins("compliance"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetAllPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ category: "compliance" })
      );
    });

    it("should merge installation status into plugins", async () => {
      const mockPlugins = [
        { key: "plugin1", name: "Plugin 1" },
        { key: "plugin2", name: "Plugin 2" },
      ];

      const mockInstalled = [
        {
          id: 1,
          pluginKey: "plugin1",
          status: "active",
          installedAt: "2024-01-01",
        },
      ];

      mockGetAllPlugins.mockResolvedValue(mockPlugins);
      mockGetInstalledPlugins.mockResolvedValue(mockInstalled);

      const { result } = renderHook(() => usePlugins());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plugins).toHaveLength(2);
      const plugin1 = result.current.plugins.find((p) => p.key === "plugin1");
      expect(plugin1?.installationId).toBe(1);
      expect(plugin1?.installationStatus).toBe("active");
    });

    it("should normalize optional array fields", async () => {
      const mockPlugins = [
        { key: "plugin1", name: "Plugin 1" },
      ];

      mockGetAllPlugins.mockResolvedValue(mockPlugins);
      mockGetInstalledPlugins.mockResolvedValue([]);

      const { result } = renderHook(() => usePlugins());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plugins[0].tags).toEqual([]);
      expect(result.current.plugins[0].features).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetAllPlugins.mockRejectedValue(new Error("Network error"));
      mockGetInstalledPlugins.mockResolvedValue([]);

      const { result } = renderHook(() => usePlugins());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
    });

    it("should not set error on AbortError", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";

      mockGetAllPlugins.mockRejectedValue(abortError);
      mockGetInstalledPlugins.mockResolvedValue([]);

      const { result } = renderHook(() => usePlugins());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("refetch", () => {
    it("should refetch plugins when refetch is called", async () => {
      mockGetAllPlugins.mockResolvedValue([{ key: "plugin1", name: "Plugin 1" }]);
      mockGetInstalledPlugins.mockResolvedValue([]);

      const { result } = renderHook(() => usePlugins());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialCallCount = mockGetAllPlugins.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(mockGetAllPlugins.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });
});
