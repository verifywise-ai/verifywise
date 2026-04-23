import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../env.vars", () => ({
  ENV_VARs: { URL: "http://localhost:3000" },
}));

import { downloadResource } from "../downloadResource";

describe("downloadResource", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;
    // Mock DOM APIs
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  it("returns early when tenantHash is empty", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await downloadResource("res-1", "");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith("Tenant hash not found in token");
    consoleSpy.mockRestore();
  });

  it("fetches the resource and triggers download", async () => {
    const mockBlob = new Blob(["pdf content"], { type: "application/pdf" });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const mockClick = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click: mockClick,
      style: {},
    } as unknown as HTMLElement);

    await downloadResource("res-123", "tenant-abc");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/aiTrustCentre/tenant-abc/resources/res-123",
      expect.objectContaining({ method: "GET" })
    );
    expect(mockClick).toHaveBeenCalled();
  });

  it("logs error when fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await downloadResource("res-1", "tenant-1");

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error downloading resource:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
