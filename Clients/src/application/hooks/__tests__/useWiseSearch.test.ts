import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWiseSearch } from "../useWiseSearch";
import * as searchRepository from "../../repository/search.repository";

vi.mock("../../repository/search.repository", () => ({
  performWiseSearch: vi.fn(),
  getEntityDisplayName: vi.fn(),
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
    localStorage.clear();
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
    vi.useRealTimers();

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
});
