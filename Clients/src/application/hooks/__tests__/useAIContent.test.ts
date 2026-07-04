import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useAIContentBadges,
  useUnreviewedContent,
  useAIContentStats,
  useReviewContent,
} from "../useAIContent";

vi.mock("../../repository/aiContent.repository", () => ({
  getBadges: vi.fn(),
  getUnreviewed: vi.fn(),
  getStats: vi.fn(),
  reviewContent: vi.fn(),
}));

import {
  getBadges,
  getUnreviewed,
  getStats,
  reviewContent,
} from "../../repository/aiContent.repository";

const mockGetBadges = vi.mocked(getBadges);
const mockGetUnreviewed = vi.mocked(getUnreviewed);
const mockGetStats = vi.mocked(getStats);
const mockReviewContent = vi.mocked(reviewContent);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAIContentBadges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns badges data", async () => {
    mockGetBadges.mockResolvedValue({ data: [{ badge: "approved" }] });
    const { result } = renderHook(() => useAIContentBadges("project", 1), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ badge: "approved" }]);
  });

  it("returns empty array when no data", async () => {
    mockGetBadges.mockResolvedValue({ data: undefined });
    const { result } = renderHook(() => useAIContentBadges("project", 1), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("respects enabled option", () => {
    const { result } = renderHook(() => useAIContentBadges("project", 1, { enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useUnreviewedContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns unreviewed content", async () => {
    mockGetUnreviewed.mockResolvedValue({ data: { items: [], total: 0 } });
    const { result } = renderHook(() => useUnreviewedContent(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [], total: 0 });
  });
});

describe("useAIContentStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns stats", async () => {
    mockGetStats.mockResolvedValue({ data: { total: 5, approved: 3 } });
    const { result } = renderHook(() => useAIContentStats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ total: 5, approved: 3 });
  });

  it("returns null when no data", async () => {
    mockGetStats.mockResolvedValue({ data: undefined });
    const { result } = renderHook(() => useAIContentStats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useReviewContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls reviewContent with correct params", async () => {
    mockReviewContent.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useReviewContent(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ id: 1, action: "approve", notes: "Looks good" });
    expect(mockReviewContent).toHaveBeenCalledWith(1, "approve", "Looks good");
  });
});
