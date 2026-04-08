import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useLogoFetch } from "../useLogoFetch";
import * as aiTrustCentreRepository from "../../repository/aiTrustCentre.repository";

const mockGetAITrustCentreLogo = aiTrustCentreRepository.getAITrustCentreLogo as jest.Mock;

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreLogo: vi.fn(),
}));

describe("useLogoFetch", () => {
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

  describe("fetchLogoAsBlobUrl", () => {
    it("should return null when no logo data is available", async () => {
      mockGetAITrustCentreLogo.mockResolvedValue(null);

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(logoUrl).toBeNull();
    });

    it("should return null when response data is empty", async () => {
      mockGetAITrustCentreLogo.mockResolvedValue({});

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(logoUrl).toBeNull();
    });

    it("should return null when logo content is missing", async () => {
      mockGetAITrustCentreLogo.mockResolvedValue({
        data: { logo: {} },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(logoUrl).toBeNull();
    });

    it("should handle ArrayBuffer content", async () => {
      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: new ArrayBuffer(8),
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(logoUrl).toBe("blob:test-url");
    });

    it("should handle array content with length > 0", async () => {
      const array = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: array,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(logoUrl).toBe("blob:test-url");
    });

    it("should handle content.data nested format with mimeType", async () => {
      const dataArray = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: {
              data: dataArray,
              mimeType: "image/png",
            },
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(logoUrl).toBe("blob:test-url");
    });

    it("should handle content.data nested format with contentType", async () => {
      const dataArray = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: {
              data: dataArray,
              contentType: "image/png",
            },
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(logoUrl).toBe("blob:test-url");
    });

    it("should fallback to image/png when no mime type provided in content.data", async () => {
      const dataArray = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: {
              data: dataArray,
            },
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ type: "image/png" })
      );
      expect(logoUrl).toBe("blob:test-url");
    });

    it("should auto-detect SVG from xml signature", async () => {
      const encoder = new TextEncoder();
      const svgContent = '<?xml version="1.0"?><svg></svg>';
      const array = Array.from(encoder.encode(svgContent));

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: array,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ type: "image/svg+xml" })
      );
      expect(logoUrl).toBe("blob:test-url");
    });

    it("should auto-detect SVG from svg tag", async () => {
      const encoder = new TextEncoder();
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      const array = Array.from(encoder.encode(svgContent));

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: array,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ type: "image/svg+xml" })
      );
      expect(logoUrl).toBe("blob:test-url");
    });

    it("should return blob URL when image loads successfully", async () => {
      const encoder = new TextEncoder();
      const pngContent = encoder.encode("PNG content");
      const array = Array.from(pngContent);

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: array,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(logoUrl).toBe("blob:test-url");
    });

    it("should return null and revoke URL when image fails to load", async () => {
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

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: dataArray,
            type: "image/png",
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
      expect(logoUrl).toBeNull();
    });

    it("should return null for unknown content format", async () => {
      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: { invalid: "format" },
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(logoUrl).toBeNull();
    });

    it("should return null on repository error", async () => {
      mockGetAITrustCentreLogo.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(logoUrl).toBeNull();
    });

    it("should call repository with correct tenantId", async () => {
      mockGetAITrustCentreLogo.mockResolvedValue(null);

      const { result } = renderHook(() => useLogoFetch());

      await act(async () => {
        await result.current.fetchLogoAsBlobUrl("tenant-abc");
      });

      expect(mockGetAITrustCentreLogo).toHaveBeenCalledWith("tenant-abc");
    });

    it("should use provided type when specified for array content", async () => {
      const array = [137, 80, 78, 71, 13, 10, 26, 10];

      mockGetAITrustCentreLogo.mockResolvedValue({
        data: {
          logo: {
            content: array,
            type: "image/gif",
          },
        },
      });

      const { result } = renderHook(() => useLogoFetch());

      let logoUrl: string | null = null;
      await act(async () => {
        logoUrl = await result.current.fetchLogoAsBlobUrl("tenant-123");
      });

      expect(mockCreateObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({ type: "image/gif" })
      );
      expect(logoUrl).toBe("blob:test-url");
    });
  });
});
