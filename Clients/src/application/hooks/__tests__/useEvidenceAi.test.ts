import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useEvidenceAnalysis,
  useQualityScores,
  useEvidenceGaps,
  useEvidenceSuggestions,
  useTriggerAnalysis,
  useApplySuggestions,
} from "../useEvidenceAi";

const mockGetAnalysis = vi.fn();
const mockGetQualityScores = vi.fn();
const mockGetEvidenceGaps = vi.fn();
const mockGetSuggestions = vi.fn();
const mockTriggerAnalysis = vi.fn();
const mockApplySuggestions = vi.fn();

vi.mock("../../repository/evidenceAi.repository", () => ({
  getAnalysis: (...args: unknown[]) => mockGetAnalysis(...args),
  getQualityScores: (...args: unknown[]) => mockGetQualityScores(...args),
  getEvidenceGaps: (...args: unknown[]) => mockGetEvidenceGaps(...args),
  getSuggestions: (...args: unknown[]) => mockGetSuggestions(...args),
  triggerAnalysis: (...args: unknown[]) => mockTriggerAnalysis(...args),
  applySuggestions: (...args: unknown[]) => mockApplySuggestions(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useEvidenceAi", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useEvidenceAnalysis", () => {
    it("should fetch analysis for a file id", async () => {
      mockGetAnalysis.mockResolvedValue({ data: { score: 85 } });

      const { result } = renderHook(() => useEvidenceAnalysis(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGetAnalysis).toHaveBeenCalledWith(1);
      expect(result.current.data).toEqual({ score: 85 });
    });

    it("should return null when no data", async () => {
      mockGetAnalysis.mockResolvedValue({});

      const { result } = renderHook(() => useEvidenceAnalysis(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it("should not fetch when fileId is 0", () => {
      renderHook(() => useEvidenceAnalysis(0), {
        wrapper: createWrapper(),
      });

      expect(mockGetAnalysis).not.toHaveBeenCalled();
    });
  });

  describe("useQualityScores", () => {
    it("should fetch quality scores", async () => {
      mockGetQualityScores.mockResolvedValue({ data: [{ fileId: 1, score: 90 }] });

      const { result } = renderHook(() => useQualityScores(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGetQualityScores).toHaveBeenCalled();
      expect(result.current.data).toEqual([{ fileId: 1, score: 90 }]);
    });

    it("should return empty array when no data", async () => {
      mockGetQualityScores.mockResolvedValue({});

      const { result } = renderHook(() => useQualityScores(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });
  });

  describe("useEvidenceGaps", () => {
    it("should fetch evidence gaps with params", async () => {
      mockGetEvidenceGaps.mockResolvedValue({ data: { gaps: [{ id: 1 }], total_controls: 5 } });

      const { result } = renderHook(
        () => useEvidenceGaps({ framework_type: "iso27001", quality_threshold: 80 }),
        {
          wrapper: createWrapper(),
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGetEvidenceGaps).toHaveBeenCalledWith({
        framework_type: "iso27001",
        quality_threshold: 80,
      });
      expect(result.current.data).toEqual({ gaps: [{ id: 1 }], total_controls: 5 });
    });

    it("should return default value when no data", async () => {
      mockGetEvidenceGaps.mockResolvedValue({});

      const { result } = renderHook(() => useEvidenceGaps(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ gaps: [], total_controls: 0 });
    });
  });

  describe("useEvidenceSuggestions", () => {
    it("should fetch suggestions for a file id", async () => {
      mockGetSuggestions.mockResolvedValue({ data: [{ control_id: 5 }] });

      const { result } = renderHook(() => useEvidenceSuggestions(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGetSuggestions).toHaveBeenCalledWith(1);
      expect(result.current.data).toEqual([{ control_id: 5 }]);
    });

    it("should return null when no data", async () => {
      mockGetSuggestions.mockResolvedValue({});

      const { result } = renderHook(() => useEvidenceSuggestions(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it("should not fetch when fileId is 0", () => {
      renderHook(() => useEvidenceSuggestions(0), {
        wrapper: createWrapper(),
      });

      expect(mockGetSuggestions).not.toHaveBeenCalled();
    });
  });

  describe("useTriggerAnalysis", () => {
    it("should trigger analysis with file id as number", async () => {
      mockTriggerAnalysis.mockResolvedValue({ data: { success: true } });
      const { result } = renderHook(() => useTriggerAnalysis(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockTriggerAnalysis).toHaveBeenCalledWith(1, undefined);
    });

    it("should trigger analysis with object input", async () => {
      mockTriggerAnalysis.mockResolvedValue({ data: { success: true } });
      const { result } = renderHook(() => useTriggerAnalysis(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ fileId: 2, visibility: "public" });
      });

      expect(mockTriggerAnalysis).toHaveBeenCalledWith(2, "public");
    });
  });

  describe("useApplySuggestions", () => {
    it("should apply suggestions", async () => {
      mockApplySuggestions.mockResolvedValue({ data: { success: true } });
      const { result } = renderHook(() => useApplySuggestions(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          fileId: 1,
          suggestions: [{ control_id: 5, framework_type: "iso27001" }],
        });
      });

      expect(mockApplySuggestions).toHaveBeenCalledWith(1, [
        { control_id: 5, framework_type: "iso27001" },
      ]);
    });
  });
});
