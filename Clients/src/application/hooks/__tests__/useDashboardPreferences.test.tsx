import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { PropsWithChildren } from "react";
import { server } from "../../../test/mocks/server";
import { useDashboardPreferences, useUpdateDashboardPreferences } from "../useDashboardPreferences";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: 9, organizationId: 42 }),
}));

const ROUTE = "/api/v1/dashboard/preferences";
const layout = [{ widgetKey: "operations.task-radar", visible: false, position: 0 }];

const wrapperWith = (client: QueryClient) =>
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
const newClient = () => new QueryClient({ defaultOptions: { mutations: { retry: false } } });

describe("useDashboardPreferences", () => {
  it("returns null layout when nothing is saved", async () => {
    const { result } = renderHook(() => useDashboardPreferences(), {
      wrapper: wrapperWith(newClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ layout: null, updated_at: null });
  });

  it("stops loading and returns no data when the request fails, without retrying", async () => {
    const handler = vi.fn(() => new HttpResponse(null, { status: 500 }));
    server.use(http.get(ROUTE, handler));
    const { result } = renderHook(() => useDashboardPreferences(), {
      wrapper: wrapperWith(newClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("replaces the cached layout after a save", async () => {
    server.use(
      http.put(ROUTE, async ({ request }) => {
        const body = (await request.json()) as { layout: unknown };
        return HttpResponse.json({ data: { layout: body.layout, updated_at: "now" } });
      }),
    );
    const client = newClient();
    const wrapper = wrapperWith(client);
    const { result } = renderHook(
      () => ({ query: useDashboardPreferences(), mutation: useUpdateDashboardPreferences() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.query.isLoading).toBe(false));

    await act(async () => {
      await result.current.mutation.mutateAsync(() => layout);
    });
    await waitFor(() => expect(result.current.query.data?.layout).toEqual(layout));
  });

  it("builds a save from the layout stored now, not the cached copy", async () => {
    const stored = [{ widgetKey: "executive.task-radar", visible: false, position: 0 }];
    let getCalls = 0;
    server.use(
      http.get(ROUTE, () => {
        getCalls += 1;
        return HttpResponse.json({
          data: { layout: getCalls === 1 ? null : stored, updated_at: null },
        });
      }),
      http.put(ROUTE, () => HttpResponse.json({ data: { layout, updated_at: "now" } })),
    );
    const { result } = renderHook(
      () => ({ query: useDashboardPreferences(), mutation: useUpdateDashboardPreferences() }),
      { wrapper: wrapperWith(newClient()) },
    );
    await waitFor(() => expect(result.current.query.isLoading).toBe(false));

    const build = vi.fn(() => layout);
    await act(async () => {
      await result.current.mutation.mutateAsync(build);
    });
    expect(build).toHaveBeenCalledWith(stored);
  });

  it("saves nothing when the current layout cannot be read", async () => {
    const put = vi.fn(() => HttpResponse.json({ data: { layout, updated_at: "now" } }));
    server.use(
      http.get(ROUTE, () => new HttpResponse(null, { status: 500 })),
      http.put(ROUTE, put),
    );
    const { result } = renderHook(() => useUpdateDashboardPreferences(), {
      wrapper: wrapperWith(newClient()),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(() => layout)).rejects.toBeDefined();
    });
    expect(put).not.toHaveBeenCalled();
  });
});
