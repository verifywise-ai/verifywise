import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

vi.mock("../../repository/invitation.repository", () => ({
  getInvitations: vi.fn(),
}));

import useInvitations from "../useInvitations";
import { getInvitations } from "../../repository/invitation.repository";

const mockGetInvitations = vi.mocked(getInvitations);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches invitations", async () => {
    const invitations = [{ id: 1, email: "test@example.com", status: "pending" }];
    mockGetInvitations.mockResolvedValue({ invitations } as any);

    const { result } = renderHook(() => useInvitations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.invitations).toEqual(invitations);
    expect(result.current.error).toBeNull();
  });

  it("handles error", async () => {
    mockGetInvitations.mockRejectedValue(new Error("Forbidden"));

    const { result } = renderHook(() => useInvitations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBe("Forbidden"));
  });

  it("returns empty array by default", async () => {
    mockGetInvitations.mockResolvedValue({ invitations: [] });

    const { result } = renderHook(() => useInvitations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.invitations).toEqual([]);
  });

  it("provides refreshInvitations function", async () => {
    mockGetInvitations.mockResolvedValue({ invitations: [] });

    const { result } = renderHook(() => useInvitations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refreshInvitations).toBe("function");
  });
});
