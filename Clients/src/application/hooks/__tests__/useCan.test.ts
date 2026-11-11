import { renderHook } from "@testing-library/react";
import { useCan, useCanCheck } from "../useCan";

let mockPermissions: string[] | undefined;
let mockRole = "";

vi.mock("../useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: mockPermissions, isLoading: false, error: null }),
}));
vi.mock("../useAuth", () => ({
  useAuth: () => ({ userRoleName: mockRole }),
}));

describe("useCan", () => {
  beforeEach(() => {
    mockPermissions = undefined;
    mockRole = "";
  });

  it("follows the loaded permission list for a custom role", () => {
    mockRole = "Risk analyst";
    mockPermissions = ["risks.edit"];
    expect(renderHook(() => useCan("risks.edit")).result.current).toBe(true);
    expect(renderHook(() => useCan("vendor.edit")).result.current).toBe(false);
  });

  it("denies a custom role while its permissions load", () => {
    mockRole = "Risk analyst";
    expect(renderHook(() => useCan("risks.edit")).result.current).toBe(false);
  });

  it("keeps a built-in role's answer while its permissions load", () => {
    mockRole = "Editor";
    expect(renderHook(() => useCan("risks.edit")).result.current).toBe(true);
    expect(renderHook(() => useCan("training.admin")).result.current).toBe(false);
  });

  it("useCanCheck answers several keys from one hook call", () => {
    mockRole = "Auditor";
    const { result } = renderHook(() => useCanCheck());
    expect(result.current("framework.audit")).toBe(true);
    expect(result.current("framework.edit")).toBe(false);
  });
});
