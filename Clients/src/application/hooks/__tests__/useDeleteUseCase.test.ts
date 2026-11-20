import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDeleteUseCase } from "../useDeleteUseCase";
import { projectRiskQueryKeys } from "../useProjectRisks";
import { projectQueryKeys } from "../useProjects";

vi.mock("../../repository/project.repository", () => ({
  deleteUseCase: vi.fn(),
}));

import { deleteUseCase } from "../../repository/project.repository";

const mockDeleteUseCase = vi.mocked(deleteUseCase);

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

describe("useDeleteUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["risks were archived", [3, 4]],
    ["no risk was archived", []],
  ])("refreshes the project risks and the project lists when %s", async (_label, archived) => {
    mockDeleteUseCase.mockResolvedValue({ deleted: true, archived_risk_ids: archived });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteUseCase(), { wrapper });

    await act(() => result.current.mutateAsync({ id: 7, archiveRisksLinkedOnlyHere: true }));

    expect(mockDeleteUseCase).toHaveBeenCalledWith({ id: 7, archiveRisksLinkedOnlyHere: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectRiskQueryKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectQueryKeys.lists() });
  });

  it("refreshes nothing when the delete fails", async () => {
    mockDeleteUseCase.mockRejectedValue(new Error("500"));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteUseCase(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 7, archiveRisksLinkedOnlyHere: false }),
      ).rejects.toThrow("500");
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
