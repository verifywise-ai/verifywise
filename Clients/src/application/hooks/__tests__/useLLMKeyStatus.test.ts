import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { useLLMKeyStatus } from "../useLLMKeyStatus";
import * as llmKeysRepository from "../../repository/llmKeys.repository";

const mockGetLLMKeyStatus = llmKeysRepository.getLLMKeyStatus as jest.Mock;

vi.mock("../../repository/llmKeys.repository", () => ({
  getLLMKeyStatus: vi.fn(),
  LLMKeyStatus: {
    ACTIVE: "active",
    INVALID: "invalid",
    NONE: "none",
  },
}));

describe("useLLMKeyStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and null data", () => {
      mockGetLLMKeyStatus.mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useLLMKeyStatus());

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("successful fetch", () => {
    it("should set data on successful fetch", async () => {
      const mockStatus = {
        hasKey: true,
        status: "active" as const,
        lastValidated: "2024-01-01",
      };

      mockGetLLMKeyStatus.mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useLLMKeyStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStatus);
      expect(result.current.error).toBeNull();
    });

    it("should handle different status values", async () => {
      const mockStatus = {
        hasKey: false,
        status: "none" as const,
        lastValidated: null,
      };

      mockGetLLMKeyStatus.mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useLLMKeyStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStatus);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetLLMKeyStatus.mockRejectedValue(
        new Error("API connection failed")
      );

      const { result } = renderHook(() => useLLMKeyStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("API connection failed");
      expect(result.current.data).toBeNull();
    });

    it("should handle errors without message", async () => {
      mockGetLLMKeyStatus.mockRejectedValue({});

      const { result } = renderHook(() => useLLMKeyStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to fetch LLM key status");
    });
  });

  describe("cleanup", () => {
    it("should not update state after unmount", async () => {
      const mockSetData = vi.fn();
      mockGetLLMKeyStatus.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ hasKey: true, status: "active" });
          }, 100);
        });
      });

      const { unmount } = renderHook(() => useLLMKeyStatus());

      unmount();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockSetData).not.toHaveBeenCalled();
    });
  });

  describe("loading state", () => {
    it("should set loading true when fetch starts", async () => {
      mockGetLLMKeyStatus.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ hasKey: true }), 100))
      );

      const { result } = renderHook(() => useLLMKeyStatus());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });
});
