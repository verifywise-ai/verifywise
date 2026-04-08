import { renderHook, waitFor } from "@testing-library/react";

const mockCheckOrganizationExists = vi.fn();

describe("useIsMultiTenant", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCheckOrganizationExists.mockReset();
    mockCheckOrganizationExists.mockResolvedValue(true);
    
    // Reset window location
    Object.defineProperty(window, "location", {
      value: { 
        ...window.location, 
        hostname: "localhost",
        configurable: true 
      },
      writable: true,
    });
  });

  it("should return loading=true initially, then false", async () => {
    vi.mock("../../repository/organization.repository", () => ({
      checkOrganizationExists: (...args: unknown[]) => mockCheckOrganizationExists(...args),
    }));

    const { useIsMultiTenant } = await import("../useIsMultiTenant");
    const { result } = renderHook(() => useIsMultiTenant());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("should return isMultiTenant=false when org exists and hostname is localhost", async () => {
    vi.mock("../../repository/organization.repository", () => ({
      checkOrganizationExists: (...args: unknown[]) => mockCheckOrganizationExists(...args),
    }));

    const { useIsMultiTenant } = await import("../useIsMultiTenant");
    const { result } = renderHook(() => useIsMultiTenant());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockCheckOrganizationExists).toHaveBeenCalled();
    expect(result.current.isMultiTenant).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should return isMultiTenant=true when hostname is app.verifywise.ai", async () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, hostname: "app.verifywise.ai" },
      writable: true,
    });

    vi.mock("../../repository/organization.repository", () => ({
      checkOrganizationExists: (...args: unknown[]) => mockCheckOrganizationExists(...args),
    }));

    const { useIsMultiTenant } = await import("../useIsMultiTenant");
    const { result } = renderHook(() => useIsMultiTenant());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isMultiTenant).toBe(true);
  });

  it("should return isMultiTenant=true when hostname is test.verifywise.ai", async () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, hostname: "test.verifywise.ai" },
      writable: true,
    });

    vi.mock("../../repository/organization.repository", () => ({
      checkOrganizationExists: (...args: unknown[]) => mockCheckOrganizationExists(...args),
    }));

    const { useIsMultiTenant } = await import("../useIsMultiTenant");
    const { result } = renderHook(() => useIsMultiTenant());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isMultiTenant).toBe(true);
  });

  it("should return isMultiTenant=true when org does NOT exist", async () => {
    mockCheckOrganizationExists.mockResolvedValue(false);

    vi.mock("../../repository/organization.repository", () => ({
      checkOrganizationExists: (...args: unknown[]) => mockCheckOrganizationExists(...args),
    }));

    const { useIsMultiTenant } = await import("../useIsMultiTenant");
    const { result } = renderHook(() => useIsMultiTenant());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockCheckOrganizationExists).toHaveBeenCalled();
    expect(result.current.isMultiTenant).toBe(true);
  });

  it("should default to multi-tenant on API error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCheckOrganizationExists.mockRejectedValue(new Error("Network error"));

    vi.mock("../../repository/organization.repository", () => ({
      checkOrganizationExists: (...args: unknown[]) => mockCheckOrganizationExists(...args),
    }));

    const { useIsMultiTenant } = await import("../useIsMultiTenant");
    const { result } = renderHook(() => useIsMultiTenant());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockCheckOrganizationExists).toHaveBeenCalled();
    expect(result.current.isMultiTenant).toBe(true);
    expect(result.current.error).toBeTruthy();
  });
});
