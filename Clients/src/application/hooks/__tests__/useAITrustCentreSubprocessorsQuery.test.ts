import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  subprocessorsQueryKey,
  useAITrustCentreSubprocessorsQuery,
  useCreateAITrustCentreSubprocessorMutation,
  useUpdateAITrustCentreSubprocessorMutation,
  useDeleteAITrustCentreSubprocessorMutation,
} from "../useAITrustCentreSubprocessorsQuery";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreSubprocessors: vi.fn(),
  createAITrustCentreSubprocessor: vi.fn(),
  updateAITrustCentreSubprocessor: vi.fn(),
  deleteAITrustCentreSubprocessor: vi.fn(),
}));

import {
  getAITrustCentreSubprocessors,
  createAITrustCentreSubprocessor,
  updateAITrustCentreSubprocessor,
  deleteAITrustCentreSubprocessor,
} from "../../repository/aiTrustCentre.repository";

const createWrapper = (queryClient: QueryClient) => {
  // No JSX: keep test file as .ts
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe("useAITrustCentreSubprocessorsQuery + mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queryFn returns response.data.data.subprocessors (nested)", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: { subprocessors: [{ id: 1, name: "A", purpose: "P", location: "L", url: "U" }] } },
    });

    const { result } = renderHook(() => useAITrustCentreSubprocessorsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, name: "A", purpose: "P", location: "L", url: "U" }]);
  });

  it("queryFn returns response.data.subprocessors", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { subprocessors: [{ id: 2, name: "B", purpose: "P2", location: "L2", url: "U2" }] },
    });

    const { result } = renderHook(() => useAITrustCentreSubprocessorsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 2, name: "B", purpose: "P2", location: "L2", url: "U2" }]);
  });

  it("queryFn returns response.subprocessors", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      subprocessors: [{ id: 3, name: "C", purpose: "P3", location: "L3", url: "U3" }],
    });

    const { result } = renderHook(() => useAITrustCentreSubprocessorsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 3, name: "C", purpose: "P3", location: "L3", url: "U3" }]);
  });

  it("queryFn returns [] when nothing exists (fallback)", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreSubprocessorsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("create mutation: onSuccess invalidates subprocessors query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (createAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useCreateAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ name: "N", purpose: "P", location: "L", url: "U" });

    expect(createAITrustCentreSubprocessor).toHaveBeenCalledWith("N", "P", "L", "U");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: subprocessorsQueryKey });
  });

  it("create mutation: onError logs to console", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const err = new Error("create failed");
    (createAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useCreateAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ name: "N", purpose: "P", location: "L", url: "U" })
    ).rejects.toThrow("create failed");

    expect(consoleSpy).toHaveBeenCalledWith("Error creating AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });

  it("update mutation: onSuccess invalidates subprocessors query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (updateAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useUpdateAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      subprocessorId: 10,
      name: "N",
      purpose: "P",
      location: "L",
      url: "U",
    });

    expect(updateAITrustCentreSubprocessor).toHaveBeenCalledWith(10, "N", "P", "L", "U");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: subprocessorsQueryKey });
  });

  it("update mutation: onError logs to console", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const err = new Error("update failed");
    (updateAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useUpdateAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        subprocessorId: 10,
        name: "N",
        purpose: "P",
        location: "L",
        url: "U",
      })
    ).rejects.toThrow("update failed");

    expect(consoleSpy).toHaveBeenCalledWith("Error updating AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });

  it("delete mutation: onSuccess invalidates subprocessors query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    (deleteAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useDeleteAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync(123);

    expect(deleteAITrustCentreSubprocessor).toHaveBeenCalledWith(123);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: subprocessorsQueryKey });
  });

  it("delete mutation: onError logs to console", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const err = new Error("delete failed");
    (deleteAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useDeleteAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync(456)).rejects.toThrow("delete failed");

    expect(consoleSpy).toHaveBeenCalledWith("Error deleting AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });
});
