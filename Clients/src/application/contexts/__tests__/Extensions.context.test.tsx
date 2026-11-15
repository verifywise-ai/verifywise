import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { ExtensionsProvider, useExtensions } from "../Extensions.context";

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  organizationId: 1 as number | null,
}));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => auth }));

const repo = vi.hoisted(() => ({
  listExtensions: vi.fn(),
  enableExtension: vi.fn(),
  disableExtension: vi.fn(),
  updateExtensionConfiguration: vi.fn(),
}));
vi.mock("../../repository/extension.repository", () => repo);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ExtensionsProvider, null, children);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const ext = (key: string, enabled: boolean) => ({ key, enabled }) as never;

describe("ExtensionsProvider loaded state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    auth.organizationId = 1;
  });

  it("counts as loaded with an empty list when there is no organization to fetch for", async () => {
    auth.organizationId = null;
    const { result } = renderHook(() => useExtensions(), { wrapper });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.extensions).toEqual([]);
    expect(repo.listExtensions).not.toHaveBeenCalled();
  });

  it("reads not loaded on the first render after an organization change", async () => {
    repo.listExtensions.mockResolvedValueOnce([ext("model-lifecycle", true)]);
    const seen: boolean[] = [];
    const { result, rerender } = renderHook(
      () => {
        const ctx = useExtensions();
        seen.push(ctx.loaded);
        return ctx;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const pending = deferred<unknown[]>();
    repo.listExtensions.mockReturnValueOnce(pending.promise);
    seen.length = 0;
    auth.organizationId = 2;
    rerender();

    expect(seen[0]).toBe(false);
    expect(result.current.loaded).toBe(false);
    expect(result.current.isEnabled("model-lifecycle")).toBe(false);
    await act(async () => pending.resolve([ext("model-lifecycle", false)]));
    expect(result.current.loaded).toBe(true);
  });

  it("ignores a slow response for the previous organization", async () => {
    const orgOne = deferred<unknown[]>();
    const orgTwo = deferred<unknown[]>();
    repo.listExtensions.mockReturnValueOnce(orgOne.promise).mockReturnValueOnce(orgTwo.promise);
    const { result, rerender } = renderHook(() => useExtensions(), { wrapper });

    auth.organizationId = 2;
    rerender();
    await act(async () => orgTwo.resolve([ext("model-lifecycle", false)]));
    await act(async () => orgOne.resolve([ext("model-lifecycle", true)]));

    expect(result.current.loaded).toBe(true);
    expect(result.current.isEnabled("model-lifecycle")).toBe(false);
  });

  it("keeps the held list and reports the error when a refetch fails", async () => {
    repo.listExtensions
      .mockResolvedValueOnce([ext("model-lifecycle", true)])
      .mockRejectedValueOnce(new Error("Network down"));
    const { result } = renderHook(() => useExtensions(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => result.current.refetch());

    expect(result.current.error).toBe("Network down");
    expect(result.current.isEnabled("model-lifecycle")).toBe(true);
    expect(result.current.loaded).toBe(true);
  });
});
