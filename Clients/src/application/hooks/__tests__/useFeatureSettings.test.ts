import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../repository/featureSettings.repository", () => ({
  getFeatureSettings: vi.fn(),
  updateFeatureSettings: vi.fn(),
}));

import { useFeatureSettings } from "../useFeatureSettings";
import {
  getFeatureSettings,
  updateFeatureSettings,
} from "../../repository/featureSettings.repository";

const mockGet = vi.mocked(getFeatureSettings);
const mockUpdate = vi.mocked(updateFeatureSettings);

describe("useFeatureSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches settings on mount", async () => {
    const settings = { lifecycle_enabled: true, audit_ledger_enabled: false };
    mockGet.mockResolvedValue(settings as any);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings).toEqual(settings);
  });

  it("handles fetch error gracefully", async () => {
    mockGet.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings).toBeNull();
  });

  it("update calls repository and sets new settings", async () => {
    mockGet.mockResolvedValue({ lifecycle_enabled: false } as any);
    const updated = { lifecycle_enabled: true };
    mockUpdate.mockResolvedValue(updated as any);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.update({ lifecycle_enabled: true });
    });

    expect(mockUpdate).toHaveBeenCalledWith({ lifecycle_enabled: true });
    expect(result.current.settings).toEqual(updated);
  });
});
