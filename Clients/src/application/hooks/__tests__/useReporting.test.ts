import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockGetReportRun = vi.fn();

vi.mock("../../repository/reporting.repository", () => ({
  getTemplates: vi.fn(async () => [{ id: 1, name: "Daily Governance Pulse" }]),
  getScheduledReports: vi.fn(async () => []),
  getReportRun: (...args: unknown[]) => mockGetReportRun(...args),
}));

import { useTemplates, useReportRun } from "../useReporting";

const wrap = ({ children }: any) => {
  const c = new QueryClient();
  return React.createElement(QueryClientProvider, { client: c }, children);
};

describe("useReporting", () => {
  it("useTemplates loads templates", async () => {
    const { result } = renderHook(() => useTemplates(), { wrapper: wrap });
    await waitFor(() => expect(result.current.data?.length).toBe(1));
  });
});

describe("useReportRun", () => {
  afterEach(() => vi.clearAllMocks());

  it("fetches the run when enabled and id is set", async () => {
    mockGetReportRun.mockResolvedValue({ id: 5, status: "success" });

    const { result } = renderHook(() => useReportRun(5, true), { wrapper: wrap });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReportRun).toHaveBeenCalledWith(5);
    expect(result.current.data).toEqual({ id: 5, status: "success" });
  });

  it("does not fetch when disabled", async () => {
    const { result } = renderHook(() => useReportRun(undefined, false), { wrapper: wrap });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetReportRun).not.toHaveBeenCalled();
  });
});
