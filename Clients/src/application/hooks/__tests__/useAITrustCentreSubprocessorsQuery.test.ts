import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreSubprocessors: vi.fn(),
  createAITrustCentreSubprocessor: vi.fn(),
  deleteAITrustCentreSubprocessor: vi.fn(),
  updateAITrustCentreSubprocessor: vi.fn(),
}));

import {
  useAITrustCentreSubprocessorsQuery,
  useCreateAITrustCentreSubprocessorMutation,
  useDeleteAITrustCentreSubprocessorMutation,
} from "../useAITrustCentreSubprocessorsQuery";
import {
  getAITrustCentreSubprocessors,
  createAITrustCentreSubprocessor,
  deleteAITrustCentreSubprocessor,
} from "../../repository/aiTrustCentre.repository";

const mockGetSubprocessors = vi.mocked(getAITrustCentreSubprocessors);
const mockCreateSubprocessor = vi.mocked(createAITrustCentreSubprocessor);
const mockDeleteSubprocessor = vi.mocked(deleteAITrustCentreSubprocessor);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAITrustCentreSubprocessorsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches subprocessors", async () => {
    const subprocessors = [
      { id: 1, name: "AWS", purpose: "Cloud hosting", location: "US", url: "https://aws.amazon.com" },
    ];
    mockGetSubprocessors.mockResolvedValue({ data: { data: { subprocessors } } });

    const { result } = renderHook(() => useAITrustCentreSubprocessorsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(subprocessors);
  });

  it("returns empty array when no subprocessors", async () => {
    mockGetSubprocessors.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreSubprocessorsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useCreateAITrustCentreSubprocessorMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a subprocessor", async () => {
    mockCreateSubprocessor.mockResolvedValue({ id: 2 });

    const { result } = renderHook(() => useCreateAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ name: "GCP", purpose: "AI", location: "EU", url: "https://cloud.google.com" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreateSubprocessor).toHaveBeenCalledWith("GCP", "AI", "EU", "https://cloud.google.com");
  });
});

describe("useDeleteAITrustCentreSubprocessorMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a subprocessor", async () => {
    mockDeleteSubprocessor.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteAITrustCentreSubprocessorMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(3);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteSubprocessor).toHaveBeenCalledWith(3);
  });
});
