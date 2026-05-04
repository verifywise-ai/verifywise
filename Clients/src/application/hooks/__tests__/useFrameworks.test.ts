import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/entity.repository", () => ({
  getAllFrameworks: vi.fn(),
}));

import useFrameworks from "../useFrameworks";
import { getAllFrameworks } from "../../repository/entity.repository";

const mockGetAll = vi.mocked(getAllFrameworks);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFrameworks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all frameworks", async () => {
    mockGetAll.mockResolvedValue({
      data: [
        { id: 1, name: "EU AI Act" },
        { id: 2, name: "ISO 42001" },
      ],
    });

    const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allFrameworks).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("filters frameworks based on listOfFrameworks", async () => {
    mockGetAll.mockResolvedValue({
      data: [
        { id: 1, name: "EU AI Act" },
        { id: 2, name: "ISO 42001" },
      ],
    });

    const { result } = renderHook(
      () => useFrameworks({ listOfFrameworks: [{ framework_id: 1, project_framework_id: 10 }] }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filteredFrameworks).toHaveLength(1);
    expect(result.current.filteredFrameworks[0].name).toBe("EU AI Act");
    expect(result.current.projectFrameworksMap.get(1)).toBe(10);
  });

  it("handles error", async () => {
    mockGetAll.mockRejectedValue(new Error("Server down"));

    const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBe("Server down"));
  });
});
