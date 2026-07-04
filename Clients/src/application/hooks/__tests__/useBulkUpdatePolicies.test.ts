import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBulkUpdatePolicies } from "../useBulkUpdatePolicies";
import { policyQueryKeys } from "../usePolicies";
import { PolicyManagerModel } from "../../../domain/models/Common/policy/policyManager.model";

const mockBulkUpdatePolicies = vi.fn();

vi.mock("../../repository/policy.repository", () => ({
  bulkUpdatePolicies: (...args: unknown[]) => mockBulkUpdatePolicies(...args),
}));

function createPolicy(id: number, overrides: Partial<PolicyManagerModel> = {}): PolicyManagerModel {
  return PolicyManagerModel.createNewPolicyManager({
    id,
    title: `Policy ${id}`,
    content_html: "",
    status: "Draft",
    tags: [],
    author_id: 1,
    last_updated_by: 1,
    last_updated_at: new Date("2026-01-01"),
    created_at: new Date("2026-01-01"),
    ...overrides,
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe("useBulkUpdatePolicies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call bulkUpdatePolicies on mutate", async () => {
    mockBulkUpdatePolicies.mockResolvedValue({ updated: 2, action: "archive" });

    const { result } = renderHook(() => useBulkUpdatePolicies(), {
      wrapper: createWrapper().wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ ids: [1, 2], action: "archive" });
    });

    expect(mockBulkUpdatePolicies).toHaveBeenCalledWith({ ids: [1, 2], action: "archive" });
  });

  it("should call onSuccess callback when mutation succeeds", async () => {
    const onSuccess = vi.fn();
    mockBulkUpdatePolicies.mockResolvedValue({ updated: 1, action: "archive" });

    const { result } = renderHook(() => useBulkUpdatePolicies({ onSuccess }), {
      wrapper: createWrapper().wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ ids: [1], action: "archive" });
    });

    expect(onSuccess).toHaveBeenCalledWith({ ids: [1], action: "archive" });
  });

  it("should call onError callback when mutation fails", async () => {
    const onError = vi.fn();
    const testError = new Error("Network error");
    mockBulkUpdatePolicies.mockRejectedValue(testError);

    const { result } = renderHook(() => useBulkUpdatePolicies({ onError }), {
      wrapper: createWrapper().wrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ ids: [1], action: "archive" });
      } catch {
        // expected
      }
    });

    expect(onError).toHaveBeenCalledWith(testError, { ids: [1], action: "archive" });
  });

  it("optimistically archives selected policies", async () => {
    let resolveMutation: () => void = () => {};
    mockBulkUpdatePolicies.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [
      createPolicy(1, { status: "Draft" }),
      createPolicy(2, { status: "Draft" }),
      createPolicy(3, { status: "Draft" }),
    ]);

    const { result } = renderHook(() => useBulkUpdatePolicies(), { wrapper });

    act(() => {
      result.current.mutate({ ids: [1, 2], action: "archive" });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      expect(data?.[0].status).toBe("Archived");
      expect(data?.[1].status).toBe("Archived");
      expect(data?.[2].status).toBe("Draft");
    });

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("optimistically assigns a reviewer to selected policies", async () => {
    let resolveMutation: () => void = () => {};
    mockBulkUpdatePolicies.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [
      createPolicy(1, { assigned_reviewer_ids: [] }),
      createPolicy(2, { assigned_reviewer_ids: [1] }),
    ]);

    const { result } = renderHook(() => useBulkUpdatePolicies(), { wrapper });

    act(() => {
      result.current.mutate({ ids: [1, 2], action: "set_reviewer", reviewerId: 5 });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      expect(data?.[0].assigned_reviewer_ids).toEqual([5]);
      expect(data?.[1].assigned_reviewer_ids).toEqual([5]);
    });

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("optimistically sets tags on selected policies", async () => {
    let resolveMutation: () => void = () => {};
    mockBulkUpdatePolicies.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [
      createPolicy(1, { tags: ["AI ethics"] }),
      createPolicy(2, { tags: ["Privacy"] }),
    ]);

    const { result } = renderHook(() => useBulkUpdatePolicies(), { wrapper });

    act(() => {
      result.current.mutate({ ids: [1, 2], action: "set_tags", tags: ["Transparency"] });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      expect(data?.[0].tags).toEqual(["Transparency"]);
      expect(data?.[1].tags).toEqual(["Transparency"]);
    });

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back optimistic updates when the mutation fails", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    mockBulkUpdatePolicies.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createPolicy(1, { status: "Draft" })]);

    const { result } = renderHook(() => useBulkUpdatePolicies(), { wrapper });

    act(() => {
      result.current.mutate({ ids: [1], action: "archive" });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      expect(data?.[0].status).toBe("Archived");
    });

    act(() => {
      rejectMutation(new Error("Failed"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
    expect(data?.[0].status).toBe("Draft");
  });
});
