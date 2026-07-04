import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useUpdateProjectRisk } from "../useUpdateProjectRisk";
import { projectRiskQueryKeys } from "../useProjectRisks";

vi.mock("../../repository/projectRisk.repository", () => ({
  updateProjectRisk: vi.fn(),
}));

import { updateProjectRisk } from "../../repository/projectRisk.repository";

const mockUpdateProjectRisk = vi.mocked(updateProjectRisk);

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

describe("useUpdateProjectRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("optimistically patches the risk in the project risks list cache", async () => {
    let resolveMutation: () => void = () => {};
    mockUpdateProjectRisk.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const projectId = 5;
    const queryKey = projectRiskQueryKeys.list(projectId, "active");
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [
      { id: 1, risk_name: "Risk 1", risk_level_autocalculated: "High" },
      { id: 2, risk_name: "Risk 2", risk_level_autocalculated: "Low" },
    ]);

    const { result } = renderHook(() => useUpdateProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({
        id: 1,
        projectId,
        body: { risk_level_autocalculated: "Critical", final_risk_level: "Medium" },
      });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(queryKey)).toEqual([
        {
          id: 1,
          risk_name: "Risk 1",
          risk_level_autocalculated: "Critical",
          final_risk_level: "Medium",
        },
        { id: 2, risk_name: "Risk 2", risk_level_autocalculated: "Low" },
      ]),
    );

    act(() => {
      resolveMutation();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateProjectRisk).toHaveBeenCalledWith({
      id: 1,
      body: { risk_level_autocalculated: "Critical", final_risk_level: "Medium" },
    });
  });

  it("rolls back the optimistic patch when the mutation fails", async () => {
    let rejectMutation: (error: Error) => void = () => {};
    mockUpdateProjectRisk.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );

    const projectId = 5;
    const queryKey = projectRiskQueryKeys.list(projectId, "active");
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(queryKey, [
      { id: 1, risk_name: "Risk 1", risk_level_autocalculated: "High" },
    ]);

    const { result } = renderHook(() => useUpdateProjectRisk(), { wrapper });

    act(() => {
      result.current.mutate({
        id: 1,
        projectId,
        body: { risk_level_autocalculated: "Critical" },
      });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(queryKey)).toEqual([
        { id: 1, risk_name: "Risk 1", risk_level_autocalculated: "Critical" },
      ]),
    );

    act(() => {
      rejectMutation(new Error("Server error"));
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual([
      { id: 1, risk_name: "Risk 1", risk_level_autocalculated: "High" },
    ]);
  });
});
