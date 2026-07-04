import { renderHook, waitFor } from "@testing-library/react";
import { useLogoFetch } from "../useLogoFetch";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreLogo: vi.fn(),
}));

import { getAITrustCentreLogo } from "../../repository/aiTrustCentre.repository";

const mockGetLogo = vi.mocked(getAITrustCentreLogo);

describe("useLogoFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    // Mock Image for blob URL validation
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

  it("returns null when logo data is empty", async () => {
    mockGetLogo.mockResolvedValue({ data: { logo: { content: null } } });
    const { result } = renderHook(() => useLogoFetch());
    const url = await result.current.fetchLogoAsBlobUrl("tenant-1");
    expect(url).toBeNull();
  });

  it("returns null when response has no logo", async () => {
    mockGetLogo.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useLogoFetch());
    const url = await result.current.fetchLogoAsBlobUrl("tenant-1");
    expect(url).toBeNull();
  });

  it("handles error from repository", async () => {
    mockGetLogo.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useLogoFetch());
    const url = await result.current.fetchLogoAsBlobUrl("tenant-1");
    expect(url).toBeNull();
  });

  it("processes ArrayBuffer content format", async () => {
    mockGetLogo.mockResolvedValue({
      data: {
        logo: {
          content: new ArrayBuffer(8),
          type: "image/png",
        },
      },
    });
    const { result } = renderHook(() => useLogoFetch());
    const url = await waitFor(() => result.current.fetchLogoAsBlobUrl("tenant-1"));
    expect(url).toBe("blob:test-url");
  });
});
