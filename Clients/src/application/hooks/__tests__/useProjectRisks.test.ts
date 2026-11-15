import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/projectRisk.repository", () => ({
  getAllProjectRisksByProjectId: vi.fn(),
}));

import useProjectRisks from "../useProjectRisks";
import { getAllProjectRisksByProjectId } from "../../repository/projectRisk.repository";

const mockGetRisks = vi.mocked(getAllProjectRisksByProjectId);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useProjectRisks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches project risks", async () => {
    mockGetRisks.mockResolvedValue({
      data: [
        { id: 1, risk_level_autocalculated: "High", project_id: 1 },
        { id: 2, risk_level_autocalculated: "Low", project_id: 1 },
      ],
    });

    const { result } = renderHook(() => useProjectRisks({ projectId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loadingProjectRisks).toBe(false));
    expect(result.current.projectRisks).toHaveLength(2);
    expect(result.current.projectRisksSummary.total).toBe(2);
  });

  it("does not fetch when projectId is falsy", () => {
    const { result } = renderHook(() => useProjectRisks({ projectId: 0 }), {
      wrapper: createWrapper(),
    });
    expect(result.current.loadingProjectRisks).toBe(false);
  });

  it("handles error", async () => {
    mockGetRisks.mockRejectedValue(new Error("Timeout"));

    const { result } = renderHook(() => useProjectRisks({ projectId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBe("Timeout"));
  });

  it("counts No risk, Very low risk and uses the effective level", async () => {
    mockGetRisks.mockResolvedValue({
      data: [
        { id: 1, risk_level_autocalculated: "No risk", current_risk_level: null, project_id: 1 },
        {
          id: 2,
          risk_level_autocalculated: "Very low risk",
          current_risk_level: null,
          project_id: 1,
        },
        // inherent Very high, current Low: counted as Low
        {
          id: 3,
          risk_level_autocalculated: "Very high risk",
          current_risk_level: "Low risk",
          project_id: 1,
        },
        { id: 4, risk_level_autocalculated: "High risk", current_risk_level: null, project_id: 1 },
      ],
    });

    const { result } = renderHook(() => useProjectRisks({ projectId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loadingProjectRisks).toBe(false));
    expect(result.current.projectRisksSummary).toEqual({
      total: 4,
      veryHighRisks: 0,
      highRisks: 1,
      mediumRisks: 0,
      lowRisks: 1,
      veryLowRisks: 2,
    });
  });
});
