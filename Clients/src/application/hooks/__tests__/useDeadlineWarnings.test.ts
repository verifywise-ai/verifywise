import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/deadline.repository", () => ({
  getDeadlineSummary: vi.fn(),
}));

let mockUserId: number | null = 1;
vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: mockUserId }),
}));

import useDeadlineWarnings from "../useDeadlineWarnings";
import { getDeadlineSummary } from "../../repository/deadline.repository";

const mockGetDeadlineSummary = vi.mocked(getDeadlineSummary);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useDeadlineWarnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 1;
  });

  it("fetches the deadline summary using the configured due-soon window", async () => {
    mockGetDeadlineSummary.mockResolvedValue({
      data: { overdue: 3, dueSoon: 5, dueSoonDays: 7 },
    });

    const { result } = renderHook(() => useDeadlineWarnings(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetDeadlineSummary).toHaveBeenCalledWith(7);
    expect(result.current.overdue).toBe(3);
    expect(result.current.dueSoon).toBe(5);
    expect(result.current.dueSoonDays).toBe(7);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when there is no authenticated user", () => {
    mockUserId = null;

    const { result } = renderHook(() => useDeadlineWarnings(), { wrapper: createWrapper() });

    expect(mockGetDeadlineSummary).not.toHaveBeenCalled();
    expect(result.current.overdue).toBe(0);
    expect(result.current.dueSoon).toBe(0);
  });

  it("surfaces an error message when the request fails", async () => {
    mockGetDeadlineSummary.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useDeadlineWarnings(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("network error");
    expect(result.current.overdue).toBe(0);
  });
});
