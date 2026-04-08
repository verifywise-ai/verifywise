import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useAssessmentProgress from "../useAssessmentProgress";

const mockGetAssessmentProgress = vi.fn();

vi.mock("../repository/assesment.repository", () => ({
  getAssessmentProgress: (...args: unknown[]) => mockGetAssessmentProgress(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from "@tanstack/react-query";

describe("useAssessmentProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading true when query is loading", () => {
    (useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { result } = renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: 1, refreshKey: false })
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.assessmentProgress).toEqual({
      totalQuestions: 0,
      answeredQuestions: 0,
    });
  });

  it("returns data when query succeeds", () => {
    (useQuery as any).mockReturnValue({
      data: {
        totalQuestions: 10,
        answeredQuestions: 4,
      },
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: 1, refreshKey: false })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.assessmentProgress).toEqual({
      totalQuestions: 10,
      answeredQuestions: 4,
    });
  });

  it("returns default when data is undefined", () => {
    (useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: 1, refreshKey: false })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.assessmentProgress).toEqual({
      totalQuestions: 0,
      answeredQuestions: 0,
    });
  });

  it("returns null when data is null (current behavior)", () => {
    (useQuery as any).mockReturnValue({
      data: null,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: 1, refreshKey: false })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.assessmentProgress).toBeNull();
  });

  it("passes correct parameters to useQuery", () => {
    (useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: 42, refreshKey: true })
    );

    expect((useQuery as any).mock.calls[0][0].queryKey).toContain(42);
    expect((useQuery as any).mock.calls[0][0].queryKey).toContain(true);
    expect((useQuery as any).mock.calls[0][0].enabled).toBe(true);
  });

  it("handles enabled=false when projectFrameworkId is 0", () => {
    (useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: 0, refreshKey: false })
    );

    expect((useQuery as any).mock.calls[0][0].enabled).toBe(false);
  });

  it("handles enabled=false when projectFrameworkId is undefined", () => {
    (useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: undefined as any, refreshKey: false })
    );

    expect((useQuery as any).mock.calls[0][0].enabled).toBe(false);
  });

  it("returns partial data when query returns incomplete data", () => {
    (useQuery as any).mockReturnValue({
      data: {
        totalQuestions: 10,
      },
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useAssessmentProgress({ projectFrameworkId: 1, refreshKey: false })
    );

    expect(result.current.assessmentProgress).toEqual({
      totalQuestions: 10,
    });
  });
});
