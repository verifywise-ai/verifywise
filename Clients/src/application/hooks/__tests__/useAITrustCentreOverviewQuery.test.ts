import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreOverview: vi.fn(),
  updateAITrustCentreOverview: vi.fn(),
}));

import {
  useAITrustCentreOverviewQuery,
  useAITrustCentreOverviewMutation,
} from "../useAITrustCentreOverviewQuery";
import {
  getAITrustCentreOverview,
  updateAITrustCentreOverview,
} from "../../repository/aiTrustCentre.repository";

const mockGetOverview = vi.mocked(getAITrustCentreOverview);
const mockUpdateOverview = vi.mocked(updateAITrustCentreOverview);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAITrustCentreOverviewQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches overview data", async () => {
    const overviewData = {
      info: { title: "Test", visible: true, header_color: "#000", id: 1 },
    };
    mockGetOverview.mockResolvedValue({ data: { overview: overviewData } });

    const { result } = renderHook(() => useAITrustCentreOverviewQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(overviewData);
  });

  it("handles nested response structure", async () => {
    const overviewData = { info: { title: "Direct", visible: false } };
    mockGetOverview.mockResolvedValue({ overview: overviewData });

    const { result } = renderHook(() => useAITrustCentreOverviewQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(overviewData);
  });

  it("handles error", async () => {
    mockGetOverview.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAITrustCentreOverviewQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useAITrustCentreOverviewMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates overview data", async () => {
    mockUpdateOverview.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAITrustCentreOverviewMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ info: { title: "Updated" } } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateOverview).toHaveBeenCalledWith({ info: { title: "Updated" } });
  });
});
