import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/llmKeys.repository", () => ({
  getLLMKeyStatus: vi.fn(),
}));

import { useLLMKeyStatus } from "../useLLMKeyStatus";
import { getLLMKeyStatus } from "../../repository/llmKeys.repository";

const mockGetStatus = vi.mocked(getLLMKeyStatus);

describe("useLLMKeyStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and returns LLM key status", async () => {
    const status = { hasKey: true, provider: "openai" };
    mockGetStatus.mockResolvedValue(status as any);

    const { result } = renderHook(() => useLLMKeyStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(status);
    expect(result.current.error).toBeNull();
  });

  it("sets error on failure", async () => {
    mockGetStatus.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useLLMKeyStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Network error");
  });

  it("starts in loading state", () => {
    mockGetStatus.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useLLMKeyStatus());
    expect(result.current.loading).toBe(true);
  });
});
