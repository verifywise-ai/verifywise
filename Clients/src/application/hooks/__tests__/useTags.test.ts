import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/policy.repository", () => ({
  getAllTags: vi.fn(),
}));

import { useTags } from "../useTags";
import { getAllTags } from "../../repository/policy.repository";

const mockGetAllTags = vi.mocked(getAllTags);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTags", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all tags", async () => {
    mockGetAllTags.mockResolvedValue([{ id: 1, name: "gdpr" }] as any);

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetAllTags).toHaveBeenCalled();
    expect(result.current.data).toEqual([{ id: 1, name: "gdpr" }]);
  });

  it("surfaces an error state when the request fails", async () => {
    mockGetAllTags.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
