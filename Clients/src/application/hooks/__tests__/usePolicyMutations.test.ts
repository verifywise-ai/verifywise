import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreatePolicy, useUpdatePolicy, useDeletePolicy } from "../usePolicyMutations";
import { policyQueryKeys } from "../usePolicies";
import { tagQueryKeys } from "../useTags";
import { PolicyManagerModel } from "../../../domain/models/Common/policy/policyManager.model";
import { PolicyInput } from "../../../domain/interfaces/i.policy";

const mockCreatePolicy = vi.fn();
const mockUpdatePolicy = vi.fn();
const mockDeletePolicy = vi.fn();
const mockShowAlert = vi.fn();

vi.mock("../../repository/policy.repository", () => ({
  createPolicy: (...args: unknown[]) => mockCreatePolicy(...args),
  updatePolicy: (...args: unknown[]) => mockUpdatePolicy(...args),
  deletePolicy: (...args: unknown[]) => mockDeletePolicy(...args),
}));

vi.mock("../../tools/alertUtils", () => ({
  showAlert: (...args: unknown[]) => mockShowAlert(...args),
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

describe("useCreatePolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a policy and returns the created policy", async () => {
    const created = createPolicy(10, { title: "New Policy" });
    mockCreatePolicy.mockResolvedValue(created);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreatePolicy(), { wrapper });

    const input: PolicyInput = {
      title: "New Policy",
      status: "Draft",
      content_html: "<p>Content</p>",
    };

    let returned: PolicyManagerModel | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync(input);
    });

    expect(mockCreatePolicy).toHaveBeenCalledWith(input);
    expect(returned).toEqual(created);
  });
});

describe("useUpdatePolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically updates the policy in the list cache", async () => {
    let resolveMutation: () => void = () => {};
    mockUpdatePolicy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createPolicy(1, { title: "Old Title" })]);

    const { result } = renderHook(() => useUpdatePolicy(), { wrapper });

    act(() => {
      result.current.mutate({
        id: 1,
        input: { title: "New Title", status: "Draft", content_html: "" },
      });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      expect(data?.[0].title).toBe("New Title");
    });

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back the optimistic update when the mutation fails", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    mockUpdatePolicy.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createPolicy(1, { title: "Old Title" })]);

    const { result } = renderHook(() => useUpdatePolicy(), { wrapper });

    act(() => {
      result.current.mutate({
        id: 1,
        input: { title: "New Title", status: "Draft", content_html: "" },
      });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      expect(data?.[0].title).toBe("New Title");
    });

    act(() => {
      rejectMutation(new Error("Failed"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
    expect(data?.[0].title).toBe("Old Title");
  });

  it("updates the policy via the repository", async () => {
    const updated = createPolicy(1, { title: "New Title" });
    mockUpdatePolicy.mockResolvedValue(updated);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdatePolicy(), { wrapper });

    const input = { title: "New Title", status: "Draft", content_html: "" };

    let returned: PolicyManagerModel | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ id: 1, input });
    });

    expect(mockUpdatePolicy).toHaveBeenCalledWith(1, input);
    expect(returned).toEqual(updated);
  });
});

describe("useDeletePolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the policy optimistically and invalidates only policy-tags on success", async () => {
    let resolveMutation: () => void = () => {};
    mockDeletePolicy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [createPolicy(1), createPolicy(2)]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeletePolicy(), { wrapper });

    act(() => {
      result.current.mutate(1);
    });

    // Optimistic removal is visible before the repository promise resolves.
    await waitFor(() => {
      const data = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      expect(data?.map((p) => p.id)).toEqual([2]);
    });
    expect(mockDeletePolicy).toHaveBeenCalledWith(1);

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Deleting a policy can orphan a tag, so only the tags query refreshes.
    const keys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(keys).toContainEqual([...tagQueryKeys.all]);
    expect(keys.every((key) => key[0] !== "policies")).toBe(true);

    // The exact removal stands — no list refetch needed.
    expect(queryClient.getQueryData<PolicyManagerModel[]>(queryKey)?.map((p) => p.id)).toEqual([2]);
  });

  it("rolls back the removal and toasts when deletion fails with a 4xx", async () => {
    let rejectMutation: (error: unknown) => void = () => {};
    mockDeletePolicy.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const queryKey = policyQueryKeys.list();
    const { queryClient, wrapper } = createWrapper();

    const original = [createPolicy(1), createPolicy(2)];
    queryClient.setQueryData(queryKey, original);

    const { result } = renderHook(() => useDeletePolicy(), { wrapper });

    act(() => {
      result.current.mutate(1);
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<PolicyManagerModel[]>(queryKey)).toHaveLength(1),
    );

    act(() => {
      rejectMutation({ response: { status: 403 }, message: "Forbidden" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<PolicyManagerModel[]>(queryKey)).toEqual(original);
    expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });
});
