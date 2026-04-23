import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreResources: vi.fn(),
  createAITrustCentreResource: vi.fn(),
  deleteAITrustCentreResource: vi.fn(),
  updateAITrustCentreResource: vi.fn(),
}));

import {
  useAITrustCentreResourcesQuery,
  useCreateAITrustCentreResourceMutation,
  useDeleteAITrustCentreResourceMutation,
} from "../useAITrustCentreResourcesQuery";
import {
  getAITrustCentreResources,
  createAITrustCentreResource,
  deleteAITrustCentreResource,
} from "../../repository/aiTrustCentre.repository";

const mockGetResources = vi.mocked(getAITrustCentreResources);
const mockCreateResource = vi.mocked(createAITrustCentreResource);
const mockDeleteResource = vi.mocked(deleteAITrustCentreResource);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAITrustCentreResourcesQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches resources", async () => {
    const resources = [{ id: 1, name: "Policy Doc", description: "test", visible: true, file_id: 1, updated_at: "2024-01-01" }];
    mockGetResources.mockResolvedValue({ data: { data: { resources } } });

    const { result } = renderHook(() => useAITrustCentreResourcesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(resources);
  });

  it("returns empty array when no resources", async () => {
    mockGetResources.mockResolvedValue({});

    const { result } = renderHook(() => useAITrustCentreResourcesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useCreateAITrustCentreResourceMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a resource", async () => {
    mockCreateResource.mockResolvedValue({ id: 2 });

    const { result } = renderHook(() => useCreateAITrustCentreResourceMutation(), {
      wrapper: createWrapper(),
    });

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    result.current.mutate({ file, name: "New Resource", description: "desc" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreateResource).toHaveBeenCalledWith(file, "New Resource", "desc", undefined);
  });
});

describe("useDeleteAITrustCentreResourceMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a resource", async () => {
    mockDeleteResource.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteAITrustCentreResourceMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(5);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteResource).toHaveBeenCalledWith(5);
  });
});
