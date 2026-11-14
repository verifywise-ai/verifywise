import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { HomeQueueResponse } from "../../../domain/types/homeQueue.types";

// Mock the network layer, not the repository, so the endpoint path and the
// response envelope are pinned too.
const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../../infrastructure/api/networkServices", () => ({ apiServices: api }));

import { useHomeQueue, HOME_QUEUE_QUERY_KEY } from "../useHomeQueue";

const RESPONSE: HomeQueueResponse = {
  items: [],
  sources: { tasks: { status: "ok", count: 0 } },
  counts: { untreatedRisks: 3 },
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

describe("useHomeQueue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the queue from /v1/home/queue and unwraps the envelope", async () => {
    api.get.mockResolvedValue({ data: { message: "OK", data: RESPONSE } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useHomeQueue(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/v1/home/queue");
    expect(result.current.data).toEqual(RESPONSE);
  });

  it("caches under home-queue for a minute and refetches on window focus", async () => {
    api.get.mockResolvedValue({ data: { data: RESPONSE } });
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useHomeQueue(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(HOME_QUEUE_QUERY_KEY).toEqual(["home-queue"]);
    const query = queryClient.getQueryCache().find({ queryKey: ["home-queue"] });
    expect(query).toBeDefined();
    const options = query!.options as { staleTime?: number; refetchOnWindowFocus?: boolean };
    expect(options.staleTime).toBe(60_000);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("refetches when Home mounts again inside the stale window", async () => {
    api.get.mockResolvedValue({ data: { data: RESPONSE } });
    const { wrapper } = createWrapper();

    const first = renderHook(() => useHomeQueue(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
    first.unmount();

    renderHook(() => useHomeQueue(), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("surfaces a request failure as an error", async () => {
    api.get.mockRejectedValue(new Error("network down"));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useHomeQueue(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
