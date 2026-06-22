import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useReadinessScores,
  useReadinessScoresByFramework,
  useControlScores,
  useWeakestControls,
  useRecommendations,
  useReadinessHistory,
  useTriggerCalculateAll,
  useTriggerCalculateFramework,
} from "../useReadiness";

vi.mock("../../repository/readiness.repository", () => ({
  getReadinessScores: vi.fn(),
  getReadinessScoresByFramework: vi.fn(),
  getControlScores: vi.fn(),
  getWeakestControls: vi.fn(),
  getRecommendations: vi.fn(),
  getReadinessHistory: vi.fn(),
  triggerCalculateAll: vi.fn(),
  triggerCalculateFramework: vi.fn(),
}));

import {
  getReadinessScores,
  getReadinessScoresByFramework,
  getControlScores,
  getWeakestControls,
  getRecommendations,
  getReadinessHistory,
  triggerCalculateAll,
  triggerCalculateFramework,
} from "../../repository/readiness.repository";

const mockGetReadinessScores = vi.mocked(getReadinessScores);
const mockGetReadinessScoresByFramework = vi.mocked(getReadinessScoresByFramework);
const mockGetControlScores = vi.mocked(getControlScores);
const mockGetWeakestControls = vi.mocked(getWeakestControls);
const mockGetRecommendations = vi.mocked(getRecommendations);
const mockGetReadinessHistory = vi.mocked(getReadinessHistory);
const mockTriggerCalculateAll = vi.mocked(triggerCalculateAll);
const mockTriggerCalculateFramework = vi.mocked(triggerCalculateFramework);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useReadinessScores", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns scores data", async () => {
    mockGetReadinessScores.mockResolvedValue({ data: [{ framework: "ISO27001", score: 85 }] });
    const { result } = renderHook(() => useReadinessScores(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ framework: "ISO27001", score: 85 }]);
  });

  it("returns empty array when no data", async () => {
    mockGetReadinessScores.mockResolvedValue({ data: undefined });
    const { result } = renderHook(() => useReadinessScores(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useReadinessScoresByFramework", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns score for specific framework", async () => {
    mockGetReadinessScoresByFramework.mockResolvedValue({ data: { score: 75 } });
    const { result } = renderHook(() => useReadinessScoresByFramework("ISO27001"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ score: 75 });
  });

  it("respects enabled option", () => {
    const { result } = renderHook(
      () => useReadinessScoresByFramework("ISO27001", { enabled: false }),
      { wrapper: createWrapper() },
    );
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useControlScores", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns control scores", async () => {
    mockGetControlScores.mockResolvedValue({ data: [{ control: "A.5.1", score: 90 }] });
    const { result } = renderHook(() => useControlScores("ISO27001"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ control: "A.5.1", score: 90 }]);
  });
});

describe("useWeakestControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns weakest controls", async () => {
    mockGetWeakestControls.mockResolvedValue({ data: [{ control: "A.6.1", score: 30 }] });
    const { result } = renderHook(() => useWeakestControls(5), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ control: "A.6.1", score: 30 }]);
  });
});

describe("useRecommendations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns recommendations", async () => {
    mockGetRecommendations.mockResolvedValue({ data: [{ action: "Update policy" }] });
    const { result } = renderHook(() => useRecommendations(5), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ action: "Update policy" }]);
  });
});

describe("useReadinessHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns history data", async () => {
    mockGetReadinessHistory.mockResolvedValue({ data: [{ date: "2025-01-01", score: 50 }] });
    const { result } = renderHook(() => useReadinessHistory("ISO27001"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ date: "2025-01-01", score: 50 }]);
  });
});

describe("useTriggerCalculateAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("triggers calculation for all frameworks", async () => {
    mockTriggerCalculateAll.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useTriggerCalculateAll(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ projectId: 1 });
    expect(mockTriggerCalculateAll).toHaveBeenCalledWith(1, undefined);
  });
});

describe("useTriggerCalculateFramework", () => {
  beforeEach(() => vi.clearAllMocks());

  it("triggers calculation for specific framework", async () => {
    mockTriggerCalculateFramework.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useTriggerCalculateFramework(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ frameworkType: "ISO27001", projectId: 1 });
    expect(mockTriggerCalculateFramework).toHaveBeenCalledWith("ISO27001", 1, undefined);
  });
});
