import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
}));

import { fetchData } from "../fetchDataHook";
import { getAllEntities } from "../../repository/entity.repository";

const mockGetAll = vi.mocked(getAllEntities);

describe("fetchData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches data and calls setData with response.data", async () => {
    const setData = vi.fn();
    mockGetAll.mockResolvedValue({ data: [{ id: 1 }] });

    await fetchData("/projects", setData);

    expect(mockGetAll).toHaveBeenCalledWith({ routeUrl: "/projects" });
    expect(setData).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it("logs error and does not call setData on failure", async () => {
    const setData = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAll.mockRejectedValue(new Error("Network error"));

    await fetchData("/projects", setData);

    expect(setData).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error fetching data from /projects"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
