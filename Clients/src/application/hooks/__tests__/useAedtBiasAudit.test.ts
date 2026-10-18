import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const { createRun } = vi.hoisted(() => ({ createRun: vi.fn() }));

vi.mock("../../repository/aedtBiasAudit.repository", () => ({
  createAedtRun: createRun,
  generateAedtScopeDetermination: vi.fn().mockResolvedValue({ stanceId: 9 }),
  saveAedtAnswers: vi.fn().mockResolvedValue({ profileId: 3, version: 2 }),
  attestAedtProfile: vi.fn().mockResolvedValue({ profileId: 3, version: 2 }),
  getAedtQuestions: vi.fn().mockResolvedValue([]),
}));

import {
  aedtQueryKeys,
  useAedtQuestions,
  useAttestAedtProfile,
  useCreateAedtRun,
  useGenerateAedtScopeDetermination,
  useSaveAedtAnswers,
} from "../useAedtBiasAudit";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidateSpy, queryClient };
}

describe("useAedtBiasAudit invalidation", () => {
  it("refetches only the run list after a run is recorded", async () => {
    createRun.mockResolvedValueOnce({ runId: 5 });
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

  // A refusal such as a 422 "out of scope" means the attested profile changed
  // under the page, so its gate and metric label are refetched.
  it("refetches the profile view when the server refuses a run", async () => {
    createRun.mockRejectedValueOnce(new Error("422"));
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useCreateAedtRun(7), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ file: new File(["a"], "a.csv"), mapping: {} })
        .catch(() => undefined);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aedtQueryKeys.profile(7) });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: aedtQueryKeys.project(7) });
  });

  it.each([
    ["save", () => useSaveAedtAnswers(7), [] as unknown[]],
    ["attest", () => useAttestAedtProfile(7), [undefined] as unknown[]],
  ])(
    "refetches only the profile view after %s, not the static question set",
    async (_n, hook, args) => {
      const { wrapper, invalidateSpy } = createWrapper();
      const { result } = renderHook(
        hook as () => { mutateAsync: (...a: unknown[]) => Promise<unknown> },
        {
          wrapper,
        },
      );
      await act(async () => {
        await result.current.mutateAsync(...args);
      });
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aedtQueryKeys.profile(7) });
    },
  );

  it("never treats the question set as stale", async () => {
    const { wrapper, queryClient } = createWrapper();
    renderHook(() => useAedtQuestions(7), { wrapper });
    await act(async () => {});
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: aedtQueryKeys.questions(7) })
        ?.isStale(),
    ).toBe(false);
    expect(
      (
        queryClient.getQueryCache().find({ queryKey: aedtQueryKeys.questions(7) })?.options as {
          staleTime?: unknown;
        }
      )?.staleTime,
    ).toBe(Infinity);
  });
});
