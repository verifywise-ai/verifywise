import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/policy.repository", () => ({
  getAllPolicies: vi.fn(),
}));

import { usePolicies, policyQueryKeys } from "../usePolicies";
import { getAllPolicies } from "../../repository/policy.repository";

const mockGetAllPolicies = vi.mocked(getAllPolicies);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("usePolicies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all policies", async () => {
    mockGetAllPolicies.mockResolvedValue([{ id: 1, title: "Data Retention" }] as any);

    const { result } = renderHook(() => usePolicies(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetAllPolicies).toHaveBeenCalled();
    expect(result.current.data).toEqual([{ id: 1, title: "Data Retention" }]);
  });

  it("surfaces an error state when the request fails", async () => {
    mockGetAllPolicies.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => usePolicies(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("policyQueryKeys", () => {
  it("builds hierarchical query keys", () => {
    expect(policyQueryKeys.all).toEqual(["policies"]);
    expect(policyQueryKeys.lists()).toEqual(["policies", "list"]);
    expect(policyQueryKeys.list({ status: "active" })).toEqual([
      "policies",
      "list",
      { status: "active" },
    ]);
    expect(policyQueryKeys.details()).toEqual(["policies", "detail"]);
    expect(policyQueryKeys.detail(5)).toEqual(["policies", "detail", 5]);
  });
});
