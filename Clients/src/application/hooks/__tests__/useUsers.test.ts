import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { buildUser } from "../../../test/factories/user.factory";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
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
    expect(result.current.error).toBeNull();
  });

  it("handles error", async () => {
    mockGetAll.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toBe("Server error"));
  });
});
