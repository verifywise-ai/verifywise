import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useProfilePhotoFetch } from "../useProfilePhotoFetch";
import * as userRepository from "../../repository/user.repository";

const mockGetUserProfilePhoto = userRepository.getUserProfilePhoto as jest.Mock;

vi.mock("../../repository/user.repository", () => ({
  getUserProfilePhoto: vi.fn(),
}));

describe("useProfilePhotoFetch", () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let mockImage: {
    new (): HTMLImageElement;
    prototype: HTMLImageElement;
  };
  let originalImage: typeof Image;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateObjectURL = vi.fn(() => "blob:test-url");
    mockRevokeObjectURL = vi.fn();

    mockImage = class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 0;
      height = 0;
      complete = true;

      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    } as unknown as typeof mockImage;

    originalImage = global.Image;
    (global as Record<string, unknown>).Image = mockImage;
    vi.spyOn(URL, "createObjectURL").mockImplementation(mockCreateObjectURL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(mockRevokeObjectURL);
  });

  afterEach(() => {
    (global as Record<string, unknown>).Image = originalImage;
    vi.restoreAllMocks();
  });

  describe("fetchProfilePhotoAsBlobUrl", () => {
    it("should return null when no photo data is available", async () => {
      mockGetUserProfilePhoto.mockResolvedValue(null);

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(photoUrl).toBeNull();
    });

    it("should return null when response data is empty", async () => {
      mockGetUserProfilePhoto.mockResolvedValue({});

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(photoUrl).toBeNull();
    });

    it("should return null when photo content is missing", async () => {
      mockGetUserProfilePhoto.mockResolvedValue({
        data: { photo: {} },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(photoUrl).toBeNull();
    });

    it("should handle ArrayBuffer content", async () => {
      mockGetUserProfilePhoto.mockResolvedValue({
        data: {
          photo: {
            content: new ArrayBuffer(8),
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(photoUrl).toBe("blob:test-url");
    });

    it("should handle array content with length > 0", async () => {
      const array = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetUserProfilePhoto.mockResolvedValue({
        data: {
          photo: {
            content: array,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(photoUrl).toBe("blob:test-url");
    });

    it("should handle content.data nested format with mimeType", async () => {
      const dataArray = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetUserProfilePhoto.mockResolvedValue({
        data: {
          photo: {
            content: {
              data: dataArray,
              mimeType: "image/png",
            },
          },
        },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(photoUrl).toBe("blob:test-url");
    });

    it("should handle content.data nested format with contentType", async () => {
      const dataArray = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetUserProfilePhoto.mockResolvedValue({
        data: {
          photo: {
            content: {
              data: dataArray,
              contentType: "image/png",
            },
          },
        },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(photoUrl).toBe("blob:test-url");
    });

    it("should auto-detect SVG from xml signature", async () => {
      const encoder = new TextEncoder();
      const svgContent = '<?xml version="1.0"?><svg></svg>';
      const array = Array.from(encoder.encode(svgContent));

      mockGetUserProfilePhoto.mockResolvedValue({
        data: {
          photo: {
            content: array,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(mockCreateObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ type: "image/svg+xml" })
      );
    });

    it("should return null when image fails to load", async () => {
      const dataArray = [137, 80, 78, 71, 13, 10, 26, 10];

      mockImage = class MockImageWithError {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = "";
        width = 0;
        height = 0;
        complete = true;

        constructor() {
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }
      } as unknown as typeof mockImage;

      (global as Record<string, unknown>).Image = mockImage;

      mockGetUserProfilePhoto.mockResolvedValue({
        data: {
          photo: {
            content: dataArray,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
      expect(photoUrl).toBeNull();
    });

    it("should return null for unknown content format", async () => {
      mockGetUserProfilePhoto.mockResolvedValue({
        data: {
          photo: {
            content: { invalid: "format" },
          },
        },
      });

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(photoUrl).toBeNull();
    });

    it("should return null on repository error", async () => {
      mockGetUserProfilePhoto.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useProfilePhotoFetch());

      let photoUrl: string | null = null;
      await act(async () => {
        photoUrl = await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(photoUrl).toBeNull();
    });

    it("should call repository with correct userId (number)", async () => {
      mockGetUserProfilePhoto.mockResolvedValue(null);

      const { result } = renderHook(() => useProfilePhotoFetch());

      await act(async () => {
        await result.current.fetchProfilePhotoAsBlobUrl(123);
      });

      expect(mockGetUserProfilePhoto).toHaveBeenCalledWith(123);
    });

    it("should call repository with correct userId (string)", async () => {
      mockGetUserProfilePhoto.mockResolvedValue(null);

      const { result } = renderHook(() => useProfilePhotoFetch());

      await act(async () => {
        await result.current.fetchProfilePhotoAsBlobUrl("user-abc");
      });

      expect(mockGetUserProfilePhoto).toHaveBeenCalledWith("user-abc");
    });
  });
});
