import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/plugin.repository", () => ({
  getAllPlugins: vi.fn(),
  getInstalledPlugins: vi.fn(),
}));

import { usePlugins } from "../usePlugins";
import { getAllPlugins, getInstalledPlugins } from "../../repository/plugin.repository";

const mockGetAll = vi.mocked(getAllPlugins);
const mockGetInstalled = vi.mocked(getInstalledPlugins);

describe("usePlugins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and merges plugins with installation status", async () => {
    mockGetAll.mockResolvedValue([
      { key: "soc2", name: "SOC 2", tags: ["compliance"] },
      { key: "gdpr", name: "GDPR", tags: [] },
    ] as any);
    mockGetInstalled.mockResolvedValue([
      { id: 10, pluginKey: "soc2", status: "active", installedAt: "2024-01-01" },
    ] as any);

    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.plugins).toHaveLength(2);
    const soc2 = result.current.plugins.find((p: any) => p.key === "soc2");
    expect(soc2?.installationId).toBe(10);
    expect(soc2?.installationStatus).toBe("active");
  });

  it("handles error gracefully", async () => {
    mockGetAll.mockRejectedValue(new Error("API down"));
    mockGetInstalled.mockResolvedValue([]);

    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("API down");
  });

  it("passes category filter", async () => {
    mockGetAll.mockResolvedValue([]);
    mockGetInstalled.mockResolvedValue([]);

    renderHook(() => usePlugins("compliance"));

    await waitFor(() =>
      expect(mockGetAll).toHaveBeenCalledWith(expect.objectContaining({ category: "compliance" })),
    );
  });
});
