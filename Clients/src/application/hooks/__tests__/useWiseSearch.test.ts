import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWiseSearch } from "../useWiseSearch";

vi.mock("../../repository/search.repository", () => ({
  performWiseSearch: vi.fn(),
  getEntityDisplayName: vi.fn((type: string) => type),
}));

describe("useWiseSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("returns initial state", () => {
    const { result } = renderHook(() => useWiseSearch());

    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSearchMode).toBe(false);
    expect(result.current.totalCount).toBe(0);
  });

  it("isSearchMode is true when query >= 3 chars", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("abc");
    });

    expect(result.current.isSearchMode).toBe(true);
  });

  it("isSearchMode is false when query < 3 chars", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.setQuery("ab");
    });

    expect(result.current.isSearchMode).toBe(false);
  });

  it("manages recent searches", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("test query");
    });

    expect(result.current.recentSearches).toHaveLength(1);
    expect(result.current.recentSearches[0].query).toBe("test query");
  });

  it("does not add short queries to recent", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("ab");
    });

    expect(result.current.recentSearches).toHaveLength(0);
  });

  it("clears recent searches", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("test query");
      result.current.clearRecentSearches();
    });

    expect(result.current.recentSearches).toHaveLength(0);
  });

  it("removes a specific recent search", () => {
    const { result } = renderHook(() => useWiseSearch());

    act(() => {
      result.current.addToRecent("query 1");
    });

    const ts = result.current.recentSearches[0].timestamp;

    act(() => {
      result.current.removeFromRecent(ts);
    });

    expect(result.current.recentSearches).toHaveLength(0);
  });
});
