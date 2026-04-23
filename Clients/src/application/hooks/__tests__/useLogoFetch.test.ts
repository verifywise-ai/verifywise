import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreLogo: vi.fn(),
}));

import { useLogoFetch } from "../useLogoFetch";
import { getAITrustCentreLogo } from "../../repository/aiTrustCentre.repository";

const mockGetLogo = vi.mocked(getAITrustCentreLogo);

describe("useLogoFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("returns null when no logo content", async () => {
    mockGetLogo.mockResolvedValue({ data: { logo: null } });

    const { result } = renderHook(() => useLogoFetch());
    const url = await result.current.fetchLogoAsBlobUrl("tenant-1");

    expect(url).toBeNull();
  });

  it("returns null on error", async () => {
    mockGetLogo.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useLogoFetch());
    const url = await result.current.fetchLogoAsBlobUrl("tenant-1");

    expect(url).toBeNull();
  });

  it("returns fetchLogoAsBlobUrl function", () => {
    const { result } = renderHook(() => useLogoFetch());
    expect(typeof result.current.fetchLogoAsBlobUrl).toBe("function");
  });
});
