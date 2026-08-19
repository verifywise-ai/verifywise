import { renderHook } from "@testing-library/react";
import { useProfilePhotoFetch } from "../useProfilePhotoFetch";

vi.mock("../../repository/user.repository", () => ({
  getUserProfilePhoto: vi.fn(),
}));

// useProfilePhotoFetch depends on useAuth which reads authToken from Redux
// (state.auth.authToken → extracted to userToken.organizationId → gates the
// fetch). Stub useAuth so the hook can render outside a Redux <Provider>
// and treat the caller as an org user with a valid organizationId; the
// tests here exercise the blob-processing branches, not the SSRF-style
// org-scope gate (that has its own coverage in the extension audit).
vi.mock("../useAuth", () => ({
  useAuth: () => ({
    token: "mock",
    userToken: { organizationId: "1" },
    userRoleName: "Admin",
    userId: 1,
    organizationId: 1,
    isAuthenticated: true,
    isSuperAdmin: false,
  }),
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
        queueMicrotask(() => this.onload?.());
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
