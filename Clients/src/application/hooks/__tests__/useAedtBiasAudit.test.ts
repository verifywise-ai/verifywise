import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../repository/aedtBiasAudit.repository", () => ({
  createAedtRun: vi.fn().mockResolvedValue({ runId: 5 }),
  generateAedtScopeDetermination: vi.fn().mockResolvedValue({ stanceId: 9 }),
}));

import {
  aedtQueryKeys,
  useCreateAedtRun,
  useGenerateAedtScopeDetermination,
} from "../useAedtBiasAudit";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidateSpy };
}

describe("useAedtBiasAudit invalidation", () => {
  it("refetches only the run list after a run is recorded", async () => {
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useCreateAedtRun(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ file: new File(["a"], "a.csv"), mapping: {} });
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aedtQueryKeys.runs(7) });
  });

  it("refetches only the profile view after a scope determination", async () => {
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useGenerateAedtScopeDetermination(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aedtQueryKeys.profile(7) });
  });
});
