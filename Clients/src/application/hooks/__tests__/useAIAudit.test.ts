import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAuditLog, useAuditAnalytics } from "../useAIAudit";

vi.mock("../../repository/aiAudit.repository", () => ({
  getAuditLog: vi.fn(),
  getAuditAnalytics: vi.fn(),
}));

import { getAuditLog, getAuditAnalytics } from "../../repository/aiAudit.repository";

const mockGetAuditLog = vi.mocked(getAuditLog);
const mockGetAuditAnalytics = vi.mocked(getAuditAnalytics);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns audit log data on success", async () => {
    mockGetAuditLog.mockResolvedValue([{ id: 1, action: "test" }]);
    const { result } = renderHook(() => useAuditLog(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, action: "test" }]);
  });

  it("returns empty array when API returns no data", async () => {
    mockGetAuditLog.mockResolvedValue([]);
    const { result } = renderHook(() => useAuditLog(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("passes filters to repository", async () => {
    mockGetAuditLog.mockResolvedValue([]);
    const filters = { state: "completed", tool: "chat" };
    renderHook(() => useAuditLog(filters), { wrapper: createWrapper() });
    await waitFor(() => expect(mockGetAuditLog).toHaveBeenCalledWith(filters));
  });
});

describe("useAuditAnalytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns analytics data on success", async () => {
    mockGetAuditAnalytics.mockResolvedValue({ total: 10, by_tool: {} });
    const { result } = renderHook(() => useAuditAnalytics("2025-01-01", "2025-12-31"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ total: 10, by_tool: {} });
  });

  it("calls repository with date params", async () => {
    mockGetAuditAnalytics.mockResolvedValue({});
    renderHook(() => useAuditAnalytics("2025-06-01", "2025-06-30"), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(mockGetAuditAnalytics).toHaveBeenCalledWith("2025-06-01", "2025-06-30"),
    );
  });
});
