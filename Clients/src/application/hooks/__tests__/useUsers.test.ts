import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
});
