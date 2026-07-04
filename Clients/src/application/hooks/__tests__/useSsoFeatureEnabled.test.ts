import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/ssoConfig.repository", () => ({
  GetSsoFeatureEnabled: vi.fn(),
}));

import { useSsoFeatureEnabled } from "../useSsoFeatureEnabled";
import { GetSsoFeatureEnabled } from "../../repository/ssoConfig.repository";

const mockGetSsoFeatureEnabled = vi.mocked(GetSsoFeatureEnabled);

describe("useSsoFeatureEnabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when SSO feature is enabled", async () => {
    mockGetSsoFeatureEnabled.mockResolvedValue(true);

    const { result } = renderHook(() => useSsoFeatureEnabled());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("returns false when SSO feature is disabled", async () => {
    mockGetSsoFeatureEnabled.mockResolvedValue(false);

    const { result } = renderHook(() => useSsoFeatureEnabled());

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("does not update state after unmount (cancellation)", async () => {
    let resolvePromise!: (value: boolean) => void;
    mockGetSsoFeatureEnabled.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useSsoFeatureEnabled());

    unmount();
    resolvePromise(true);

    await vi.waitFor(() => {
      expect(mockGetSsoFeatureEnabled).toHaveBeenCalledTimes(1);
    });

    expect(result.current).toBe(false);
  });
});
