import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";

function httpError(status: number) {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    data: { data: "Refused." },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

const { createRun } = vi.hoisted(() => ({ createRun: vi.fn() }));

vi.mock("../../repository/aedtBiasAudit.repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
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
  // POST /runs: 404 nothing attested, 409 out of scope or cutoff open, and a
  // 400 mapping refusal checked against the attested metric.
  it.each([400, 404, 409, 422])(
    "refetches the profile view when the server refuses a run with %i, a stale profile",
    async (status) => {
      createRun.mockRejectedValueOnce(httpError(status));
      const { wrapper, invalidateSpy } = createWrapper();
      const { result } = renderHook(() => useCreateAedtRun(7), { wrapper });
      await act(async () => {
        await result.current
          .mutateAsync({ file: new File(["a"], "a.csv"), mapping: {} })
          .catch(() => undefined);
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aedtQueryKeys.profile(7) });
      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: aedtQueryKeys.project(7) });
    },
  );

  it.each([413, 415, 500])(
    "refetches nothing on a %i, which says nothing about the profile",
    async (status) => {
      createRun.mockRejectedValueOnce(httpError(status));
      const { wrapper, invalidateSpy } = createWrapper();
      const { result } = renderHook(() => useCreateAedtRun(7), { wrapper });
      await act(async () => {
        await result.current
          .mutateAsync({ file: new File(["a"], "a.csv"), mapping: {} })
          .catch(() => undefined);
      });
      expect(invalidateSpy).not.toHaveBeenCalled();
    },
  );

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

  // Finite, so a deploy that changes the question set reaches an open page.
  it("keeps the question set fresh for ten minutes", async () => {
    const { wrapper, queryClient } = createWrapper();
    renderHook(() => useAedtQuestions(7), { wrapper });
    await act(async () => {});
    const query = queryClient.getQueryCache().find({ queryKey: aedtQueryKeys.questions(7) });
    expect(query?.isStale()).toBe(false);
    expect((query?.options as { staleTime?: unknown })?.staleTime).toBe(10 * 60 * 1000);
  });

  it("refetches nothing on a network failure", async () => {
    createRun.mockRejectedValueOnce(new Error("Network Error"));
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useCreateAedtRun(7), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ file: new File(["a"], "a.csv"), mapping: {} })
        .catch(() => undefined);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
