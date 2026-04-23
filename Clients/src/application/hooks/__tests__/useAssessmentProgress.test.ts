import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/assesment.repository", () => ({
  getAssessmentProgress: vi.fn(),
}));

import useAssessmentProgress from "../useAssessmentProgress";
import { getAssessmentProgress } from "../../repository/assesment.repository";

const mockGetProgress = vi.mocked(getAssessmentProgress);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAssessmentProgress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches assessment progress", async () => {
    mockGetProgress.mockResolvedValue({ data: { totalQuestions: 50, answeredQuestions: 30 } });

    const { result } = renderHook(
      () => useAssessmentProgress({ projectFrameworkId: 1, refreshKey: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentProgress.totalQuestions).toBe(50);
    expect(result.current.assessmentProgress.answeredQuestions).toBe(30);
  });

  it("returns defaults when projectFrameworkId is 0", () => {
    const { result } = renderHook(
      () => useAssessmentProgress({ projectFrameworkId: 0, refreshKey: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.assessmentProgress.totalQuestions).toBe(0);
  });
});
