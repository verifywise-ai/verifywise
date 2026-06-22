import { renderHook } from "@testing-library/react";
import { useProfilePhotoFetch } from "../useProfilePhotoFetch";

vi.mock("../../repository/user.repository", () => ({
  getUserProfilePhoto: vi.fn(),
}));

import { getUserProfilePhoto } from "../../repository/user.repository";

const mockGetUserProfilePhoto = vi.mocked(getUserProfilePhoto);

describe("useProfilePhotoFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    global.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when photo data is empty", async () => {
    mockGetUserProfilePhoto.mockResolvedValue({ data: { photo: null } } as any);
    const { result } = renderHook(() => useProfilePhotoFetch());
    const url = await result.current.fetchProfilePhotoAsBlobUrl(1);
    expect(url).toBeNull();
  });

  it("handles error from repository", async () => {
    mockGetUserProfilePhoto.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useProfilePhotoFetch());
    const url = await result.current.fetchProfilePhotoAsBlobUrl(1);
    expect(url).toBeNull();
  });

  it("processes photo with ArrayBuffer content", async () => {
    mockGetUserProfilePhoto.mockResolvedValue({
      data: {
        photo: {
          content: new ArrayBuffer(8),
          type: "image/png",
        },
      },
    } as any);
    const { result } = renderHook(() => useProfilePhotoFetch());
    const url = await result.current.fetchProfilePhotoAsBlobUrl(1);
    expect(url).toBe("blob:photo-url");
  });
});
