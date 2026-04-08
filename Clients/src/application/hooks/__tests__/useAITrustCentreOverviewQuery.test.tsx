import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  overviewQueryKey,
  useAITrustCentreOverviewQuery,
  useAITrustCentreOverviewMutation,
} from "../useAITrustCentreOverviewQuery";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreOverview: vi.fn(),
  updateAITrustCentreOverview: vi.fn(),
}));

import {
  getAITrustCentreOverview,
  updateAITrustCentreOverview,
} from "../../repository/aiTrustCentre.repository";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useAITrustCentreOverviewQuery + useAITrustCentreOverviewMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queryFn: returns response.data.overview when nested structure exists", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { overview: { info: { title: "from data.overview" } } },
    });

    const { result } = renderHook(() => useAITrustCentreOverviewQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAITrustCentreOverview).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ info: { title: "from data.overview" } });
  });

  it("queryFn: returns response.overview when data.overview is missing", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      overview: { info: { title: "from overview" } },
    });

    const { result } = renderHook(() => useAITrustCentreOverviewQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ info: { title: "from overview" } });
  });

  it("queryFn: returns response itself when neither data.overview nor overview exist", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      info: { title: "from response root" },
    });

    const { result } = renderHook(() => useAITrustCentreOverviewQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ info: { title: "from response root" } });
  });

  it("mutation: onSuccess invalidates overview query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (updateAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useAITrustCentreOverviewMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ info: { visible: true } } as any);

    expect(updateAITrustCentreOverview).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: overviewQueryKey });
  });

  it("mutation: onError logs error to console", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const err = new Error("update failed");
    (updateAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useAITrustCentreOverviewMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ intro: { purpose_visible: true } } as any)
    ).rejects.toThrow("update failed");

    expect(consoleSpy).toHaveBeenCalledWith("Error updating AI Trust Centre overview:", err);

    consoleSpy.mockRestore();
  });
});
