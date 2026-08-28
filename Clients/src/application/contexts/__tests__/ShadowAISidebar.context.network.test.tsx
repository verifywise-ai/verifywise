/**
 * ShadowAISidebar context — network-backed (Shadow AI group).
 *
 * The sibling ShadowAISidebar.context.test.tsx mocks `getTools`, so it never
 * reaches MSW. This file leaves the repository real and drives the provider
 * through the handlers, which is what proves the `{ data: { tools, total } }`
 * envelope matches what the provider reads.
 *
 * Error behaviour here is a swallow, not a surfaced state: `refreshRecentTools`
 * catches and logs, leaving the counts at zero. That is the actual contract, so
 * the error tests assert the fallback rather than an error flag that does not
 * exist.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { server } from "../../../test/mocks/server";
import { mockShadowAiTools } from "../../../test/mocks/data/shadowAi";
import { shadowAiErrors } from "../../../test/mocks/errorHandlers";

import { ShadowAISidebarProvider, useShadowAISidebarContext } from "../ShadowAISidebar.context";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ShadowAISidebarProvider, null, children);
}

describe("ShadowAISidebarContext (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads recent tools from the API", async () => {
    const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });

    await waitFor(() => expect(result.current.toolsCount).toBe(mockShadowAiTools.length));

    expect(result.current.recentTools.map((t) => t.name)).toEqual(
      mockShadowAiTools.map((t) => t.name),
    );
  });

  it("leaves the sidebar empty on 403 rather than throwing", async () => {
    server.use(shadowAiErrors.forbidden());

    const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.toolsCount).toBe(0);
    expect(result.current.recentTools).toEqual([]);
  });

  it("leaves the sidebar empty on 500", async () => {
    server.use(shadowAiErrors.serverError());

    const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.toolsCount).toBe(0);
  });

  it("leaves the sidebar empty on a transport failure", async () => {
    server.use(shadowAiErrors.transport());

    const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.toolsCount).toBe(0);
  });

  it("leaves the sidebar empty on a 400", async () => {
    server.use(shadowAiErrors.validation());

    const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.toolsCount).toBe(0);
  });
});
