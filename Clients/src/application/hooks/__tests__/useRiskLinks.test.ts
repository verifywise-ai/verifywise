import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/riskLink.repository", () => ({
  getRiskLinks: vi.fn(),
  createRiskLink: vi.fn(),
  updateRiskLinkStatus: vi.fn(),
  recomputeRiskLinks: vi.fn(),
}));

import {
  useRiskLinks,
  useCreateRiskLink,
  useUpdateRiskLinkStatus,
  useRecomputeRiskLinks,
} from "../useRiskLinks";
import {
  getRiskLinks,
  createRiskLink,
  updateRiskLinkStatus,
  recomputeRiskLinks,
} from "../../repository/riskLink.repository";

const mockGet = vi.mocked(getRiskLinks);
const mockCreate = vi.mocked(createRiskLink);
const mockUpdate = vi.mocked(updateRiskLinkStatus);
const mockRecompute = vi.mocked(recomputeRiskLinks);

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidate };
}

beforeEach(() => vi.clearAllMocks());

describe("useRiskLinks", () => {
  it("fetches with no status filter by default", async () => {
    mockGet.mockResolvedValue([]);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useRiskLinks(42), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(42, undefined);
  });

  it("passes the status through and keys the query on it", async () => {
    mockGet.mockResolvedValue([]);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useRiskLinks(42, "dismissed"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(42, "dismissed");
  });

  it("re-fetches when the status changes rather than reusing the cache", async () => {
    mockGet.mockResolvedValue([]);
    const { wrapper } = createHarness();
    const { rerender, result } = renderHook(
      ({ status }: { status?: "dismissed" }) => useRiskLinks(42, status),
      { wrapper, initialProps: {} as { status?: "dismissed" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ status: "dismissed" });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

describe("risk link mutations", () => {
  it("useCreateRiskLink posts the payload and invalidates the risk's links", async () => {
    mockCreate.mockResolvedValue({ id: 7 });
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useCreateRiskLink(42), { wrapper });

    result.current.mutate({ sourceRiskId: 42, targetRiskId: 9, relationType: "related_to" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreate).toHaveBeenCalledWith({
      sourceRiskId: 42,
      targetRiskId: 9,
      relationType: "related_to",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });

  it("useUpdateRiskLinkStatus invalidates the risk's links", async () => {
    mockUpdate.mockResolvedValue({ id: 7, status: "confirmed" });
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({ id: 7, status: "confirmed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith(7, "confirmed", undefined);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });

  it("forwards a dismissal reason to the repository", async () => {
    mockUpdate.mockResolvedValue({ id: 1, status: "dismissed" });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({
      id: 1,
      status: "dismissed",
      dismissal: { dismissReason: "wrong_direction" },
    });

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(1, "dismissed", {
        dismissReason: "wrong_direction",
      }),
    );
  });

  it("sends no dismissal when the user skipped the reason", async () => {
    mockUpdate.mockResolvedValue({ id: 1, status: "dismissed" });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({ id: 1, status: "dismissed" });

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, "dismissed", undefined));
  });

  it("useRecomputeRiskLinks invalidates the risk's links", async () => {
    mockRecompute.mockResolvedValue({ enqueued: 12 });
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useRecomputeRiskLinks(42), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });

  // A 404 means one end of the link is gone; the list on screen is stale either
  // way, so the invalidation must not be conditional on success.
  it("invalidates even when the mutation fails", async () => {
    mockUpdate.mockRejectedValue(new Error("gone"));
    const { wrapper, invalidate } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({ id: 7, status: "confirmed" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["riskLinks", 42] });
  });
});
