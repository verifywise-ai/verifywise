import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useSuperAdminReadOnly } from "../useSuperAdminReadOnly";
import { useAuth } from "../useAuth";

const mockUseAuth = vi.mocked(useAuth);

describe("useSuperAdminReadOnly", () => {
  it("returns true when user is super admin with active org", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: true,
      activeOrganizationId: 5,
    } as any);

    const { result } = renderHook(() => useSuperAdminReadOnly());
    expect(result.current).toBe(true);
  });

  it("returns false when user is super admin without active org", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: true,
      activeOrganizationId: null,
    } as any);

    const { result } = renderHook(() => useSuperAdminReadOnly());
    expect(result.current).toBe(false);
  });

  it("returns false when user is not super admin", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: false,
      activeOrganizationId: 5,
    } as any);

    const { result } = renderHook(() => useSuperAdminReadOnly());
    expect(result.current).toBe(false);
  });

  it("returns false when neither condition is true", () => {
    mockUseAuth.mockReturnValue({
      isSuperAdmin: false,
      activeOrganizationId: null,
    } as any);

    const { result } = renderHook(() => useSuperAdminReadOnly());
    expect(result.current).toBe(false);
  });
});
