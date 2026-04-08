import { renderHook } from "@testing-library/react";
import { useSuperAdminReadOnly } from "../useSuperAdminReadOnly";
import { useAuth } from "../useAuth";

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;

describe("useSuperAdminReadOnly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return false when user is not super admin", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: false,
      activeOrganizationId: "org-123",
    });

    const { result } = renderHook(() => useSuperAdminReadOnly());

    expect(result.current).toBe(false);
  });

  it("should return false when super admin has no active organization", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: true,
      activeOrganizationId: null,
    });

    const { result } = renderHook(() => useSuperAdminReadOnly());

    expect(result.current).toBe(false);
  });

  it("should return false when super admin has empty organization id", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: true,
      activeOrganizationId: "",
    });

    const { result } = renderHook(() => useSuperAdminReadOnly());

    expect(result.current).toBe(false);
  });

  it("should return true when super admin has active organization", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: true,
      activeOrganizationId: "org-123",
    });

    const { result } = renderHook(() => useSuperAdminReadOnly());

    expect(result.current).toBe(true);
  });

  it("should return false when activeOrganizationId is undefined", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: true,
      activeOrganizationId: undefined,
    });

    const { result } = renderHook(() => useSuperAdminReadOnly());

    expect(result.current).toBe(false);
  });
});
