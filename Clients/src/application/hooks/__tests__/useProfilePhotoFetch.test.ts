import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../repository/user.repository", () => ({
  getUserProfilePhoto: vi.fn(),
}));

import { useProfilePhotoFetch } from "../useProfilePhotoFetch";
import { getUserProfilePhoto } from "../../repository/user.repository";

const mockGetPhoto = vi.mocked(getUserProfilePhoto);

describe("useProfilePhotoFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("returns fetchProfilePhotoAsBlobUrl function", () => {
    const { result } = renderHook(() => useProfilePhotoFetch());
    expect(typeof result.current.fetchProfilePhotoAsBlobUrl).toBe("function");
  });

  it("returns null when no photo content", async () => {
    mockGetPhoto.mockResolvedValue({ data: { photo: null } } as any);

    const { result } = renderHook(() => useProfilePhotoFetch());
    const url = await result.current.fetchProfilePhotoAsBlobUrl(1);

    expect(url).toBeNull();
  });

  it("returns null on error", async () => {
    mockGetPhoto.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useProfilePhotoFetch());
    const url = await result.current.fetchProfilePhotoAsBlobUrl(1);

    expect(url).toBeNull();
  });

  it("returns null when content has no usable data", async () => {
    mockGetPhoto.mockResolvedValue({
      data: { photo: { content: "invalid", type: "image/png" } },
    } as any);

    const { result } = renderHook(() => useProfilePhotoFetch());
    const url = await result.current.fetchProfilePhotoAsBlobUrl(1);

    expect(url).toBeNull();
  });
});
