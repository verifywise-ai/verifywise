import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchData } from "../fetchDataHook";

const mockGetAllEntities = vi.fn();

vi.mock("../../repository/entity.repository", () => ({
  getAllEntities: (...args: unknown[]) => mockGetAllEntities(...args),
}));

describe("fetchData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call getAllEntities and setData with response.data (success path)", async () => {
    const setData = vi.fn();
    const routeUrl = "/api/entities";

    mockGetAllEntities.mockResolvedValue({
      data: [{ id: 1 }, { id: 2 }],
    });

    await fetchData(routeUrl, setData);

    expect(mockGetAllEntities).toHaveBeenCalledTimes(1);
    expect(mockGetAllEntities).toHaveBeenCalledWith({ routeUrl });

    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  it("should log an error when getAllEntities throws (catch path)", async () => {
    const setData = vi.fn();
    const routeUrl = "/api/entities";
    const err = new Error("boom");

    mockGetAllEntities.mockRejectedValue(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await fetchData(routeUrl, setData);

    expect(setData).not.toHaveBeenCalled();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      `Error fetching data from ${routeUrl}:`,
      err
    );

    consoleSpy.mockRestore();
  });
});
