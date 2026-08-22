/**
 * useFrameworks — network-backed.
 *
 * Frameworks use the STATUS_CODE `{ message, data }` envelope: the repository
 * returns the whole body and the hook reads `.data` off it. The hook throws
 * "Invalid response format" if `.data` is missing, so a handler that returned a
 * bare array would surface here rather than silently yielding an empty list.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../test/mocks/server";
import { mockFrameworks } from "../../../test/mocks/data/frameworks";
import { frameworkErrors } from "../../../test/mocks/errorHandlers";

import useFrameworks from "../useFrameworks";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFrameworks (network-backed)", () => {
  it("returns every framework from the API", async () => {
    const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allFrameworks).toHaveLength(mockFrameworks.length);
    expect(result.current.allFrameworks[0].name).toBe("EU AI Act");
    expect(result.current.error).toBeNull();
  });

  it("filters to the frameworks assigned to the project", async () => {
    const { result } = renderHook(
      () => useFrameworks({ listOfFrameworks: [{ framework_id: 2, project_framework_id: 99 }] }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filteredFrameworks.map((f) => f.name)).toEqual(["ISO 42001"]);
    expect(result.current.projectFrameworksMap.get(2)).toBe(99);
  });

  it("surfaces a 500 as an error", async () => {
    server.use(frameworkErrors.serverError());

    const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.allFrameworks).toEqual([]);
  });

  it("surfaces a 403 as an error", async () => {
    server.use(frameworkErrors.forbidden());

    const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it("surfaces a transport failure as an error", async () => {
    server.use(frameworkErrors.transport());

    const { result } = renderHook(() => useFrameworks({ listOfFrameworks: [] }), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});
