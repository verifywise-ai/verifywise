import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  resourcesQueryKey,
  useAITrustCentreResourcesQuery,
  useCreateAITrustCentreResourceMutation,
  useUpdateAITrustCentreResourceMutation,
  useDeleteAITrustCentreResourceMutation,
} from "../useAITrustCentreResourcesQuery";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreResources: vi.fn(),
  createAITrustCentreResource: vi.fn(),
  updateAITrustCentreResource: vi.fn(),
  deleteAITrustCentreResource: vi.fn(),
}));

import {
  getAITrustCentreResources,
  createAITrustCentreResource,
  updateAITrustCentreResource,
  deleteAITrustCentreResource,
} from "../../repository/aiTrustCentre.repository";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe("useAITrustCentreResourcesQuery + resource mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queryFn returns response.data.data.resources (nested)", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { resources: [{ id: 1, name: "A" }] } },
    });

    const { result } = renderHook(() => useAITrustCentreResourcesQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, name: "A" }]);
  });

  it("queryFn returns response.data.resources", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { resources: [{ id: 2, name: "B" }] },
    });

    const { result } = renderHook(() => useAITrustCentreResourcesQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 2, name: "B" }]);
  });

  it("queryFn returns response.resources", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      resources: [{ id: 3, name: "C" }],
    });

    const { result } = renderHook(() => useAITrustCentreResourcesQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 3, name: "C" }]);
  });

  it("queryFn returns [] when no resources exist (fallback)", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreResourcesQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("create mutation: calls repo with args (including optional visible) and invalidates on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (createAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useCreateAITrustCentreResourceMutation(), {
      wrapper: createWrapper(queryClient),
    });

    const file = new File(["x"], "doc.txt", { type: "text/plain" });

    await result.current.mutateAsync({
      file,
      name: "Resource name",
      description: "Desc",
      visible: true,
    });

    expect(createAITrustCentreResource).toHaveBeenCalledTimes(1);
    expect(createAITrustCentreResource).toHaveBeenCalledWith(file, "Resource name", "Desc", true);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: resourcesQueryKey });
  });

  it("create mutation: logs error onError", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const err = new Error("create failed");
    (createAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useCreateAITrustCentreResourceMutation(), {
      wrapper: createWrapper(queryClient),
    });

    const file = new File(["x"], "doc.txt", { type: "text/plain" });

    await expect(
      result.current.mutateAsync({ file, name: "N", description: "D" }) // visible omitted (optional)
    ).rejects.toThrow("create failed");

    expect(consoleSpy).toHaveBeenCalledWith("Error creating AI Trust Centre resource:", err);

    consoleSpy.mockRestore();
  });

  it("update mutation: calls repo with args (optional file + oldFileId) and invalidates on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (updateAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useUpdateAITrustCentreResourceMutation(), {
      wrapper: createWrapper(queryClient),
    });

    const file = new File(["y"], "new.pdf", { type: "application/pdf" });

    await result.current.mutateAsync({
      resourceId: 10,
      name: "Updated",
      description: "Updated desc",
      visible: false,
      file,
      oldFileId: 99,
    });

    expect(updateAITrustCentreResource).toHaveBeenCalledTimes(1);
    expect(updateAITrustCentreResource).toHaveBeenCalledWith(
      10,
      "Updated",
      "Updated desc",
      false,
      file,
      99
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: resourcesQueryKey });
  });

  it("update mutation: logs error onError (also covers undefined optional args)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const err = new Error("update failed");
    (updateAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useUpdateAITrustCentreResourceMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        resourceId: 11,
        name: "U",
        description: "UD",
        visible: true,
        // file + oldFileId omitted intentionally
      })
    ).rejects.toThrow("update failed");

    expect(updateAITrustCentreResource).toHaveBeenCalledWith(11, "U", "UD", true, undefined, undefined);
    expect(consoleSpy).toHaveBeenCalledWith("Error updating AI Trust Centre resource:", err);

    consoleSpy.mockRestore();
  });

  it("delete mutation: calls repo and invalidates on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (deleteAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDeleteAITrustCentreResourceMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync(123);

    expect(deleteAITrustCentreResource).toHaveBeenCalledTimes(1);
    expect(deleteAITrustCentreResource).toHaveBeenCalledWith(123);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: resourcesQueryKey });
  });

  it("delete mutation: logs error onError", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const err = new Error("delete failed");
    (deleteAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useDeleteAITrustCentreResourceMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync(456)).rejects.toThrow("delete failed");

    expect(consoleSpy).toHaveBeenCalledWith("Error deleting AI Trust Centre resource:", err);

    consoleSpy.mockRestore();
  });
});
