import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const authState = vi.hoisted(() => ({
  userId: 1 as number | null,
  organizationId: 7 as number | null,
}));
vi.mock("../useAuth", () => ({
  useAuth: () => authState,
}));
vi.mock("../../repository/role.repository", () => ({
  getMyPermissions: vi.fn(),
}));

import { useHasPermission, useMyPermissions } from "../useMyPermissions";
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

describe("useHasPermission", () => {
  it("is true when the key is granted (e.g. through a custom role)", async () => {
    mockGetMyPermissions.mockResolvedValue(["agentDiscovery.admin"]);
    const { result } = renderHook(() => useHasPermission("agentDiscovery.admin"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("is false when the key is not granted", async () => {
    mockGetMyPermissions.mockResolvedValue(["aiApp.admin"]);
    const { result } = renderHook(
      () => ({
        has: useHasPermission("agentDiscovery.admin"),
        loading: useMyPermissions().isLoading,
      }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.has).toBe(false);
  });

  it("is false while loading", () => {
    mockGetMyPermissions.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHasPermission("agentDiscovery.admin"), {
      wrapper: createWrapper(),
    });
    expect(result.current).toBe(false);
  });

  it("is false when the request fails", async () => {
    mockGetMyPermissions.mockRejectedValue(new Error("down"));
    const { result } = renderHook(
      () => ({
        has: useHasPermission("agentDiscovery.admin"),
        error: useMyPermissions().error,
      }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.has).toBe(false);
  });
});
