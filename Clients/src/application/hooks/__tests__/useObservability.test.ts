import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/observability.repository", () => ({
  getTraces: vi.fn(),
  getTraceDetail: vi.fn(),
  getObservabilityMetrics: vi.fn(),
}));

import { useTraces, useTraceDetail, useObservabilityMetrics } from "../useObservability";
import {
  getTraces,
  getTraceDetail,
  getObservabilityMetrics,
} from "../../repository/observability.repository";

const mockGetTraces = vi.mocked(getTraces);
const mockGetTraceDetail = vi.mocked(getTraceDetail);
const mockGetMetrics = vi.mocked(getObservabilityMetrics);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTraces", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches traces with the given filters", async () => {
    mockGetTraces.mockResolvedValue([{ id: "t1" }] as any);

    const { result } = renderHook(() => useTraces({ status: "error" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetTraces).toHaveBeenCalledWith({ status: "error" });
    expect(result.current.data).toEqual([{ id: "t1" }]);
  });
});

describe("useTraceDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches the trace detail when a traceId is provided", async () => {
    mockGetTraceDetail.mockResolvedValue({ id: "t1" } as any);

    const { result } = renderHook(() => useTraceDetail("t1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetTraceDetail).toHaveBeenCalledWith("t1");
  });

  it("does not fetch when no traceId is provided", async () => {
    const { result } = renderHook(() => useTraceDetail(undefined), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetTraceDetail).not.toHaveBeenCalled();
  });
});

describe("useObservabilityMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches metrics with the given date range", async () => {
    mockGetMetrics.mockResolvedValue({ total: 10 } as any);

    const { result } = renderHook(() => useObservabilityMetrics("2026-01-01", "2026-01-31"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetMetrics).toHaveBeenCalledWith("2026-01-01", "2026-01-31");
    expect(result.current.data).toEqual({ total: 10 });
  });
});
