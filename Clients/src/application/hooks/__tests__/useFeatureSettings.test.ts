import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks do repository (precisa bater exatamente com o import do hook)
const fetchSettingsMock = vi.fn();
const patchSettingsMock = vi.fn();

vi.mock("../../repository/featureSettings.repository", () => {
  return {
    getFeatureSettings: (...args: any[]) => fetchSettingsMock(...args),
    updateFeatureSettings: (...args: any[]) => patchSettingsMock(...args),
  };
});

// Importa o hook depois dos mocks
import { useFeatureSettings } from "../useFeatureSettings";

describe("useFeatureSettings", () => {
  beforeEach(() => {
    fetchSettingsMock.mockReset();
    patchSettingsMock.mockReset();
  });

  it("should fetch settings on mount and update isLoading/settings", async () => {
    const settings = { lifecycle_enabled: true } as any;
    fetchSettingsMock.mockResolvedValue(settings);

    const { result } = renderHook(() => useFeatureSettings());

    // imediatamente após mount
    expect(result.current.isLoading).toBe(true);
    expect(result.current.settings).toBe(null);

    // aguarda concluir fetch
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchSettingsMock).toHaveBeenCalledTimes(1);
    expect(result.current.settings).toEqual(settings);
  });

  it("should keep settings null when fetch fails and stop loading", async () => {
    fetchSettingsMock.mockRejectedValue(new Error("Boom"));

    const { result } = renderHook(() => useFeatureSettings());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchSettingsMock).toHaveBeenCalledTimes(1);
    expect(result.current.settings).toBe(null);
  });

  it("refetch should fetch again and update settings after a previous failure", async () => {
    fetchSettingsMock
      .mockRejectedValueOnce(new Error("First fail"))
      .mockResolvedValueOnce({ lifecycle_enabled: false });

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings).toBe(null);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(fetchSettingsMock).toHaveBeenCalledTimes(2);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.settings).toEqual({ lifecycle_enabled: false });
    });
  });

  it("update should call patchSettings, update state, and return updated value", async () => {
    const initial = { lifecycle_enabled: false } as any;
    const updated = { lifecycle_enabled: true } as any;

    fetchSettingsMock.mockResolvedValue(initial);
    patchSettingsMock.mockResolvedValue(updated);

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings).toEqual(initial);

    let returned: any;
    await act(async () => {
      returned = await result.current.update({ lifecycle_enabled: true });
    });

    expect(patchSettingsMock).toHaveBeenCalledTimes(1);
    expect(patchSettingsMock).toHaveBeenCalledWith({ lifecycle_enabled: true });

    expect(returned).toEqual(updated);
    expect(result.current.settings).toEqual(updated);
  });

  it("should stop loading when fetch throws non-Error value", async () => {
    fetchSettingsMock.mockRejectedValue("some string error");

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toBe(null);
  });

  it("update should propagate errors from patchSettings", async () => {
    fetchSettingsMock.mockResolvedValue({ lifecycle_enabled: false } as any);
    patchSettingsMock.mockRejectedValue(new Error("Patch failed"));

    const { result } = renderHook(() => useFeatureSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.update({ lifecycle_enabled: true });
      }),
    ).rejects.toThrowError("Patch failed");

    expect(patchSettingsMock).toHaveBeenCalledTimes(1);
  });
});
