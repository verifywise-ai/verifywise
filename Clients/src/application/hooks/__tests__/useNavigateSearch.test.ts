import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  createSearchParams: (params: Record<string, string>) => new URLSearchParams(params),
}));

import useNavigateSearch from "../useNavigateSearch";

describe("useNavigateSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to pathname with search params", () => {
    const { result } = renderHook(() => useNavigateSearch());

    act(() => {
      result.current("/projects", { id: "123" });
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: "/projects",
      search: "?id=123",
    });
  });

  it("navigates with empty params", () => {
    const { result } = renderHook(() => useNavigateSearch());

    act(() => {
      result.current("/home");
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: "/home",
      search: "?",
    });
  });

  it("does not navigate when pathname is empty", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useNavigateSearch());

    act(() => {
      result.current("");
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
