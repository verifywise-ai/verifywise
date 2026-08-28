/**
 * useInvitations — network-backed.
 *
 * The sibling useInvitations.test.ts mocks the invitation repository, so it
 * never reaches MSW. This file leaves the repository real and drives the hook
 * through the handlers, which is what proves the handler's envelope matches
 * what the hook reads.
 *
 * Invitations is the one group whose success response is NOT the usual
 * `{ message, data }` wrapper: invitation.ctrl.ts returns a bare
 * `{ invitations }`, and the hook reads `response.invitations` directly.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../test/mocks/server";
import { mockInvitations } from "../../../test/mocks/data/invitations";
import { invitationErrors } from "../../../test/mocks/errorHandlers";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

import useInvitations from "../useInvitations";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useInvitations (network-backed)", () => {
  it("returns the invitations from the API", async () => {
    const { result } = renderHook(() => useInvitations(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.invitations).toHaveLength(mockInvitations.length);
    expect(result.current.invitations[0].email).toBe(mockInvitations[0].email);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a 403 as an error", async () => {
    server.use(invitationErrors.forbidden());

    const { result } = renderHook(() => useInvitations(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.invitations).toEqual([]);
  });

  it("surfaces a 500 as an error", async () => {
    server.use(invitationErrors.serverError());

    const { result } = renderHook(() => useInvitations(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.invitations).toEqual([]);
  });

  it("surfaces a transport failure as an error", async () => {
    server.use(invitationErrors.transport());

    const { result } = renderHook(() => useInvitations(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});
