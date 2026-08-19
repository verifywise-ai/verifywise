import { renderHook, act } from "@testing-library/react";
import { usePaginatedFindings } from "../usePaginatedFindings";
import type { Finding } from "../../../../../domain/ai-detection/types";

describe("usePaginatedFindings", () => {
  it("initializes with default values", () => {
    const { result } = renderHook(() => usePaginatedFindings());

    expect(result.current.findings).toEqual([]);
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });

  it("initializes with a custom initial page", () => {
    const { result } = renderHook(() => usePaginatedFindings(3));

    expect(result.current.page).toBe(3);
  });

  it("updates findings via setFindings", () => {
    const { result } = renderHook(() => usePaginatedFindings<Finding>());

    const mockFinding = { id: 1, name: "Test finding" } as Finding;

    act(() => {
      result.current.setFindings([mockFinding]);
    });

    expect(result.current.findings).toEqual([mockFinding]);
  });

  it("updates page via setPage", () => {
    const { result } = renderHook(() => usePaginatedFindings());

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);
  });

  it("supports functional updates for setPage", () => {
    const { result } = renderHook(() => usePaginatedFindings());

    act(() => {
      result.current.setPage((p) => p + 1);
    });

    expect(result.current.page).toBe(2);
  });

  it("updates totalPages via setTotalPages", () => {
    const { result } = renderHook(() => usePaginatedFindings());

    act(() => {
      result.current.setTotalPages(5);
    });

    expect(result.current.totalPages).toBe(5);
  });
});
