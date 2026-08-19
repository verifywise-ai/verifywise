import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/modelInventory.repository", () => ({
  getModelInventories: vi.fn(),
}));

import { useModelInventories, modelInventoryQueryKeys } from "../useModelInventories";
import { getModelInventories } from "../../repository/modelInventory.repository";

const mockGetModelInventories = vi.mocked(getModelInventories);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useModelInventories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all model inventories", async () => {
    mockGetModelInventories.mockResolvedValue([{ id: 1, model_name: "GPT-4" }] as any);

    const { result } = renderHook(() => useModelInventories(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetModelInventories).toHaveBeenCalledWith(expect.anything());
    expect(result.current.data).toEqual([{ id: 1, model_name: "GPT-4" }]);
  });

  it("surfaces an error state when the request fails", async () => {
    mockGetModelInventories.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useModelInventories(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("modelInventoryQueryKeys", () => {
  it("builds hierarchical query keys", () => {
    expect(modelInventoryQueryKeys.all).toEqual(["modelInventories"]);
    expect(modelInventoryQueryKeys.lists()).toEqual(["modelInventories", "list"]);
  });
});
