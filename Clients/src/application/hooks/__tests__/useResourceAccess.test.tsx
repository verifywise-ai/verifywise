import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResourceAccess, RESOURCE_ACTION_PERMISSION_KEY } from "../useResourceAccess";

const state: { userRoleName: string; permissions: Set<string> } = {
  userRoleName: "Admin",
  permissions: new Set<string>(),
};

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userRoleName: state.userRoleName }),
}));

vi.mock("../useRolePermissions", () => ({
  useMyPermissions: () => ({
    can: (key: string) => state.permissions.has(key),
    isLoading: false,
  }),
}));

describe("useResourceAccess", () => {
  beforeEach(() => {
    state.userRoleName = "Admin";
    state.permissions = new Set();
  });

  // Fresh render per assertion: the useAuth/useMyPermissions mocks are not
  // reactive, so role changes require a new hook instance.
  const check = (resource: string, action: string): boolean => {
    const { result } = renderHook(() => useResourceAccess());
    return result.current.canAccess(resource, action);
  };

  it("keeps legacy matrix behavior for built-in roles", () => {
    state.userRoleName = "Admin";
    expect(check("organizations", "edit")).toBe(true);
    expect(check("evals", "manageApiKeys")).toBe(true);

    state.userRoleName = "Editor";
    expect(check("organizations", "edit")).toBe(false);
    expect(check("vendors", "create")).toBe(true);

    state.userRoleName = "Auditor";
    expect(check("vendors", "create")).toBe(false);
    expect(check("vendors", "view")).toBe(true);
  });

  it("keeps SuperAdmin on the static matrix", () => {
    state.userRoleName = "SuperAdmin";
    // organizations.edit lists only Admin — SuperAdmin stays excluded, as before.
    expect(check("organizations", "edit")).toBe(false);
  });

  it("allows custom roles for newly-mapped pairs only when the key is granted", () => {
    state.userRoleName = "AI Engineer";
    // vendors.create now maps to the vendors.create catalog key (issue #4588
    // migration follow-up): denied without a grant, allowed with one.
    expect(check("vendors", "create")).toBe(false);
    state.permissions = new Set(["vendors.create"]);
    expect(check("vendors", "create")).toBe(true);
  });

  it("allows custom roles when the matrix grants the mapped key", () => {
    state.userRoleName = "AI Engineer";
    state.permissions = new Set(["organization.admin"]);
    expect(check("organizations", "edit")).toBe(true);
    // Still denied for pairs whose key is not granted.
    expect(check("sso", "manage")).toBe(false);
  });

  it("denies custom roles when the mapped key is not granted", () => {
    state.userRoleName = "AI Engineer";
    state.permissions = new Set(["risks.edit"]);
    expect(check("organizations", "edit")).toBe(false);
  });

  it("denies unknown resource/action pairs", () => {
    expect(check("nope", "nope")).toBe(false);
  });

  it("maps every entry to a dotted resource.action pair", () => {
    for (const key of Object.keys(RESOURCE_ACTION_PERMISSION_KEY)) {
      expect(key.split(".").length).toBeGreaterThanOrEqual(2);
      expect(RESOURCE_ACTION_PERMISSION_KEY[key].length).toBeGreaterThan(0);
    }
  });
});
