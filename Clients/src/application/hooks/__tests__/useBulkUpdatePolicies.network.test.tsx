/**
 * Bulk-update — network-backed.
 *
 * "Bulk update" is not one domain but seven endpoints across six repositories.
 * This covers the group through `useBulkUpdatePolicies`, which exercises
 * `PATCH /policies/bulk`; the other six handlers share the same shape and the
 * same error factories in `errorHandlers.ts`.
 *
 * Methods matter here. Four of the seven bulk routes are PATCH and three are
 * POST — a handler registered on the wrong verb never matches, and with
 * `onUnhandledRequest: "error"` the test fails with an unhandled-request error
 * rather than a useful assertion. The verbs were read off the repositories.
 *
 * The success handler echoes the payload it received, so the assertion proves
 * the body actually reached the wire, not merely that the call resolved.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../test/mocks/server";
import { bulkErrors } from "../../../test/mocks/errorHandlers";

import { useBulkUpdatePolicies } from "../useBulkUpdatePolicies";
import type { BulkUpdatePoliciesPayload } from "../../repository/policy.repository";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const payload: BulkUpdatePoliciesPayload = { ids: [1, 2, 3], action: "archive" };

describe("useBulkUpdatePolicies (network-backed)", () => {
  it("sends the payload and resolves on success", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useBulkUpdatePolicies({ onSuccess }), { wrapper });

    result.current.mutate({ ...payload });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // The handler echoes what it received, so this confirms the body was sent.
    expect(result.current.data).toMatchObject({ ids: [1, 2, 3], action: "archive" });
  });

  it("reports a 400 validation failure", async () => {
    server.use(bulkErrors.policies.validation("ids must not be empty"));
    const onError = vi.fn();

    const { result } = renderHook(() => useBulkUpdatePolicies({ onError }), { wrapper });
    result.current.mutate({ ...payload });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports a 403", async () => {
    server.use(bulkErrors.policies.forbidden());

    const { result } = renderHook(() => useBulkUpdatePolicies(), { wrapper });
    result.current.mutate({ ...payload });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("reports a 500", async () => {
    server.use(bulkErrors.policies.serverError());

    const { result } = renderHook(() => useBulkUpdatePolicies(), { wrapper });
    result.current.mutate({ ...payload });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("reports a transport failure", async () => {
    server.use(bulkErrors.policies.transport());

    const { result } = renderHook(() => useBulkUpdatePolicies(), { wrapper });
    result.current.mutate({ ...payload });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
