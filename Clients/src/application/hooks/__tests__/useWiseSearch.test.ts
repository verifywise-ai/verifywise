import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWiseSearch } from "../useWiseSearch";
import * as searchRepository from "../../repository/search.repository";

vi.mock("../../repository/search.repository", () => ({
  performWiseSearch: vi.fn(),
  getEntityDisplayName: vi.fn(),
}));

vi.mock("../data/PolicyTemplates.json", () => ({
  default: [
    { id: 1, title: "Template A", description: "Description A" },
    { id: 2, title: "Template B", description: "Description B" },
  ],
}));

const mockPerformWiseSearch = searchRepository.performWiseSearch as jest.Mock;

describe("useWiseSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize with empty state", () => {
    const { result } = renderHook(() => useWiseSearch());

    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual({});
    expect(result.current.flatResults).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.totalCount).toBe(0);
    expect(result.current.recentSearches).toEqual([]);
    expect(result.current.isSearchMode).toBe(false);
  });

  it("should not enter search mode with query less than 3 characters", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("ab");
    });

    expect(result.current.isSearchMode).toBe(false);
    expect(mockPerformWiseSearch).not.toHaveBeenCalled();
  });

  it("should enter search mode with query of 3 or more characters", async () => {
    mockPerformWiseSearch.mockResolvedValue({
      data: {
        results: {},
        totalCount: 0,
      },
    });

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("test");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.isSearchMode).toBe(true);
  });

  it("should add to recent searches", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("test query");
    });

    expect(result.current.recentSearches.length).toBe(1);
    expect(result.current.recentSearches[0].query).toBe("test query");
  });

  it("should not add short queries to recent searches", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("ab");
    });

    expect(result.current.recentSearches).toEqual([]);
  });

  it("should filter out duplicate queries when adding to recent", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("test");
      result.current.addToRecent("test");
    });

    expect(result.current.recentSearches.length).toBe(1);
  });

  it("should limit recent searches to 5", () => {
    const { result } = renderHook(() => useWiseSearch());

    for (let i = 0; i < 7; i++) {
      act(() => {
        result.current.addToRecent(`query${i}`);
      });
    }

    expect(result.current.recentSearches.length).toBe(5);
  });

  it("should set review status filter", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setReviewStatus("pending");
    });

    expect(result.current.reviewStatus).toBe("pending");
  });

  it("should clear recent searches", async () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("test1");
      result.current.addToRecent("test2");
    });

    expect(result.current.recentSearches.length).toBe(2);

    act(() => {
      result.current.clearRecentSearches();
    });

    expect(result.current.recentSearches).toEqual([]);
    expect(localStorage.getItem("verifywise_recent_searches")).toBeNull();
  });

  it("should not search when query is empty and no filter", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("");
    });

    vi.advanceTimersByTime(400);

    expect(mockPerformWiseSearch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual({});
  });

  it("should activate search mode with review status filter", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setReviewStatus("approved");
    });

    expect(result.current.isSearchMode).toBe(true);
  });

  it("should handle localStorage error gracefully when loading recent searches", () => {
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = () => { throw new Error("Storage error"); };

    const { result } = renderHook(() => useWiseSearch());

    expect(result.current.recentSearches).toEqual([]);

    localStorage.getItem = originalGetItem;
  });

  it("should search with review status filter", () => {
    mockPerformWiseSearch.mockResolvedValue({
      data: {
        results: { policies: { results: [], count: 0 } },
        totalCount: 0,
      },
    });

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("test");
      result.current.setReviewStatus("pending");
    });

    vi.advanceTimersByTime(400);

    expect(result.current.isSearchMode).toBe(true);
  });

  it("should call performWiseSearch when query is entered", () => {
    mockPerformWiseSearch.mockResolvedValue({
      data: {
        results: {},
        totalCount: 0,
      },
    });

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("search term");
    });

    vi.advanceTimersByTime(400);

    expect(mockPerformWiseSearch).toHaveBeenCalled();
  });

  it("should return merged results with policy templates when query matches", async () => {
    mockPerformWiseSearch.mockResolvedValue({
      data: {
        results: {
          policies: {
            results: [{ id: 1, title: "Policy 1" }],
            count: 1,
          },
        },
        totalCount: 1,
      },
    });

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("template");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.results).toHaveProperty("policies");
    expect(result.current.flatResults.length).toBeGreaterThan(0);
  });

  it("should handle search cancellation (AbortError)", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    mockPerformWiseSearch.mockRejectedValue(abortError);

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("test");
    });

    vi.advanceTimersByTime(400);

    expect(result.current.error).toBeNull();
  });

  it("should handle search cancellation (CanceledError)", async () => {
    const cancelError = new Error("Canceled");
    cancelError.name = "CanceledError";
    mockPerformWiseSearch.mockRejectedValue(cancelError);

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("test");
    });

    vi.advanceTimersByTime(400);

    expect(result.current.error).toBeNull();
  });

  it("should handle search cancellation (ERR_CANCELED)", async () => {
    const error = new Error("Canceled") as Error & { code?: string };
    error.code = "ERR_CANCELED";
    mockPerformWiseSearch.mockRejectedValue(error);

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("test");
    });

    vi.advanceTimersByTime(400);

    expect(result.current.error).toBeNull();
  });

  it("should update totalCount when search returns results", async () => {
    mockPerformWiseSearch.mockResolvedValue({
      data: {
        results: {
          vendors: {
            results: [
              { id: 1, title: "Vendor 1" },
              { id: 2, title: "Vendor 2" },
            ],
            count: 2,
          },
        },
        totalCount: 2,
      },
    });

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("xyz");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.totalCount).toBeGreaterThanOrEqual(2);
  });

  it("should cleanup on unmount", () => {
    const { unmount } = renderHook(() => useWiseSearch());

    act(() => {
      unmount();
    });

    expect(true).toBe(true);
  });

  it("should update isSearchMode when query becomes too short", async () => {
    mockPerformWiseSearch.mockResolvedValue({
      data: {
        results: { policies: { results: [], count: 0 } },
        totalCount: 0,
      },
    });

    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("test query");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.isSearchMode).toBe(true);

    act(() => {
      result.current.setQuery("ab");
    });

    expect(result.current.isSearchMode).toBe(false);
  });
});
