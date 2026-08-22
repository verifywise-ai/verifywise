/**
 * AIDetectionSidebar context — network-backed.
 *
 * Covers two handler groups at once, because the provider consumes both:
 * AI Detection **scans** (`getScans`, `getActiveScan`) and AI Detection
 * **repositories** (`getRepositoryCount`).
 *
 * That makes it the best guard for the route-ordering trap in this task:
 * `/ai-detection/scans/active` and `/ai-detection/scans` are both requested
 * here, and if the generic `/scans/:scanId` handler were declared before its
 * siblings it would swallow `active` and this test would fail.
 *
 * As with the Shadow AI sidebar, failures are swallowed and logged rather than
 * surfaced as state, so the error tests assert the zeroed fallback.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { server } from "../../../test/mocks/server";
import { mockScans } from "../../../test/mocks/data/aiDetection";
import { mockAiDetectionRepositories } from "../../../test/mocks/data/aiDetection";
import { aiDetectionErrors, aiDetectionRepositoryErrors } from "../../../test/mocks/errorHandlers";

import {
  AIDetectionSidebarProvider,
  useAIDetectionSidebarContext,
} from "../AIDetectionSidebar.context";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AIDetectionSidebarProvider, null, children);
}

describe("AIDetectionSidebarContext (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads recent scans from the API", async () => {
    const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });

    await waitFor(() => expect(result.current.historyCount).toBe(mockScans.length));
    expect(result.current.recentScans.length).toBe(mockScans.length);
  });

  it("loads the repository count from the repositories endpoint", async () => {
    const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });

    await waitFor(() =>
      expect(result.current.repositoryCount).toBe(mockAiDetectionRepositories.length),
    );
  });

  it("leaves counts at zero when scans return 500", async () => {
    server.use(aiDetectionErrors.serverError());

    const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.historyCount).toBe(0);
    expect(result.current.recentScans).toEqual([]);
  });

  it("leaves counts at zero when scans return 403", async () => {
    server.use(aiDetectionErrors.forbidden());

    const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.historyCount).toBe(0);
  });

  it("leaves counts at zero on a transport failure", async () => {
    server.use(aiDetectionErrors.transport());

    const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.historyCount).toBe(0);
  });

  it("leaves the repository count at zero on a 400", async () => {
    server.use(aiDetectionRepositoryErrors.validation());

    const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.repositoryCount).toBe(0);
  });
});
