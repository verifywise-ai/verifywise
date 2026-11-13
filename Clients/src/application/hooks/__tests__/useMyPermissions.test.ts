import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const authState = vi.hoisted(() => ({
  userId: 1 as number | null,
  organizationId: 7 as number | null,
  userRoleName: "Risk analyst",
}));
vi.mock("../useAuth", () => ({
  useAuth: () => authState,
}));
vi.mock("../../repository/role.repository", () => ({
  getMyPermissions: vi.fn(),
}));

import { useMyPermissions } from "../useMyPermissions";
import { useCan, usePermissionsSettled } from "../useCan";
import { getMyPermissions } from "../../repository/role.repository";

const mockGetMyPermissions = getMyPermissions as unknown as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.userId = 1;
  authState.organizationId = 7;
  authState.userRoleName = "Risk analyst";
});

describe("useMyPermissions", () => {
  it("loads the current user's permission keys", async () => {
    mockGetMyPermissions.mockResolvedValue(["agentDiscovery.admin", "aiApp.admin"]);
    const { result } = renderHook(() => useMyPermissions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.permissions).toEqual(["agentDiscovery.admin", "aiApp.admin"]);
  });

  it("does not ask without a signed-in user", () => {
    authState.userId = null;
    renderHook(() => useMyPermissions(), { wrapper: createWrapper() });
    expect(mockGetMyPermissions).not.toHaveBeenCalled();
  });
});

// One rule for every permission gate (#5314): the loaded list decides; until
// it loads, or if it fails, a built-in role answers from its static matrix and
// a custom role is denied.
describe("useCan through the real permissions query", () => {
  function renderCan(key: Parameters<typeof useCan>[0]) {
    return renderHook(
      () => ({
        has: useCan(key),
        settled: usePermissionsSettled(),
        error: useMyPermissions().error,
        loading: useMyPermissions().isLoading,
      }),
      { wrapper: createWrapper() },
    );
  }

  it("is true when a custom role was granted the key", async () => {
    mockGetMyPermissions.mockResolvedValue(["agentDiscovery.admin"]);
    const { result } = renderCan("agentDiscovery.admin");
    await waitFor(() => expect(result.current.has).toBe(true));
    expect(result.current.settled).toBe(true);
  });

  it("is false when the key is not granted", async () => {
    mockGetMyPermissions.mockResolvedValue(["aiApp.admin"]);
    const { result } = renderCan("agentDiscovery.admin");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.has).toBe(false);
  });

  it("denies a custom role while loading, and is not settled yet", () => {
    mockGetMyPermissions.mockReturnValue(new Promise(() => {}));
    const { result } = renderCan("agentDiscovery.admin");
    expect(result.current.has).toBe(false);
    expect(result.current.settled).toBe(false);
  });

  it("answers a built-in role from its matrix while loading", () => {
    authState.userRoleName = "Admin";
    mockGetMyPermissions.mockReturnValue(new Promise(() => {}));
    const { result } = renderCan("agentDiscovery.admin");
    expect(result.current.has).toBe(true);
    expect(result.current.settled).toBe(true);
  });

  it("answers a built-in role from its matrix when the request fails", async () => {
    authState.userRoleName = "Editor";
    mockGetMyPermissions.mockRejectedValue(new Error("down"));
    const editorKey = renderCan("policyTemplate.edit");
    const adminKey = renderCan("agentDiscovery.admin");
    await waitFor(() => expect(editorKey.result.current.error).toBeTruthy());
    expect(editorKey.result.current.has).toBe(true);
    expect(adminKey.result.current.has).toBe(false);
  });

  it("denies a custom role when the request fails", async () => {
    mockGetMyPermissions.mockRejectedValue(new Error("down"));
    const { result } = renderCan("agentDiscovery.admin");
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.has).toBe(false);
    expect(result.current.settled).toBe(true);
  });

  it("follows the loaded list, not the role name, once it arrives", async () => {
    authState.userRoleName = "Admin";
    mockGetMyPermissions.mockResolvedValue(["aiApp.admin"]);
    const { result } = renderCan("agentDiscovery.admin");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.has).toBe(false);
  });
});
