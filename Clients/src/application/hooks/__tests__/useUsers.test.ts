import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { buildUser } from "../../../test/factories/user.factory";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: 1, organizationId: 1 }),
}));

vi.mock("../../repository/user.repository", () => ({
  getAllUsers: vi.fn(),
}));

import useUsers from "../useUsers";
import { getAllUsers } from "../../repository/user.repository";

const mockGetAll = vi.mocked(getAllUsers);

/** A /users row as the API sends it: plain JSON, dates as ISO strings. */
const apiRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "John",
  surname: "Doe",
  email: "john.doe@example.com",
  role_id: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  last_login: "2026-06-10T00:00:00.000Z",
  ...overrides,
});

function createWrapper(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useUsers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and formats users", async () => {
    mockGetAll.mockResolvedValue({
      status: 200,
      data: [buildUser({ email: "john@test.com" })],
    } as any);

    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toHaveLength(1);
    expect(result.current.users[0].roleId).toBe(1);
    expect(result.current.users[0].created_at).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(result.current.users[0].last_login).toEqual(new Date("2026-06-10T00:00:00Z"));
    expect(result.current.error).toBeNull();
  });

  it("maps a missing last login to undefined", async () => {
    mockGetAll.mockResolvedValue({
      status: 200,
      data: [buildUser({ last_login: null as unknown as Date })],
    } as any);

    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users[0].last_login).toBeUndefined();
    expect(result.current.users[0].created_at).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("handles error", async () => {
    mockGetAll.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toBe("Server error"));
  });

  it("returns the same empty array on every render while loading", async () => {
    mockGetAll.mockReturnValue(new Promise(() => undefined));
    const { result, rerender } = renderHook(() => useUsers(), { wrapper: createWrapper() });
    const first = result.current.users;
    rerender();
    expect(first).toEqual([]);
    expect(result.current.users).toBe(first);
  });

  it("keeps the same users array after a refetch that returns the same rows", async () => {
    mockGetAll.mockImplementation(async () => ({ status: 200, data: [apiRow()] }) as any);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    const first = result.current.users;

    await act(() => result.current.refreshUsers());
    // The second fetch has been stored, and the hook has rendered with it.
    await waitFor(() => expect(client.getQueryState(["users"])?.dataUpdateCount).toBe(2));

    expect(mockGetAll).toHaveBeenCalledTimes(2);
    expect(result.current.users).toBe(first);
  });

  it("returns a new users array when a refetch changes the rows", async () => {
    mockGetAll.mockResolvedValueOnce({ status: 200, data: [apiRow({ name: "Ada" })] } as any);
    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    const first = result.current.users;

    mockGetAll.mockResolvedValueOnce({ status: 200, data: [apiRow({ name: "Grace" })] } as any);
    await act(() => result.current.refreshUsers());

    await waitFor(() => expect(result.current.users[0].name).toBe("Grace"));
    expect(result.current.users).not.toBe(first);
    expect(result.current.users[0].created_at).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("does not refetch in a loop from an effect keyed on users that refreshes them", async () => {
    // The Home page pattern: an effect that refreshes users and lists them
    // (directly or through a parent re-render) among its dependencies.
    mockGetAll.mockImplementation(async () => ({ status: 200, data: [apiRow()] }) as any);
    const { unmount } = renderHook(
      () => {
        const { users, refreshUsers } = useUsers();
        React.useEffect(() => {
          void refreshUsers();
        }, [users, refreshUsers]);
      },
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 200));
    const calls = mockGetAll.mock.calls.length;
    unmount();
    expect(calls).toBeLessThanOrEqual(3);
  });

  it("returns no users when GET /users answers 204 with no body", async () => {
    mockGetAll.mockResolvedValue("" as any);
    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
