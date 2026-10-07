import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockOrganizationId: number | null = 1;
vi.mock("../useAuth", () => ({
  useAuth: () => ({ organizationId: mockOrganizationId }),
}));

vi.mock("../../repository/llmKeys.repository", () => ({
  getLLMKeys: vi.fn(),
  getLLMKeyStatus: vi.fn(),
}));

import { useLLMKeys, invalidateLLMKeyQueries } from "../useLLMKeys";
import { useLLMKeyStatus } from "../useLLMKeyStatus";
import { getLLMKeys, getLLMKeyStatus } from "../../repository/llmKeys.repository";

const mockGetKeys = vi.mocked(getLLMKeys);
const mockGetStatus = vi.mocked(getLLMKeyStatus);

const keysResponse = (names: string[]) =>
  ({
    data: { data: names.map((name, i) => ({ id: i + 1, name, model: "m", key: "***" })) },
  }) as any;

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderKeys = (client: QueryClient) =>
  renderHook(() => useLLMKeys(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });

describe("useLLMKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrganizationId = 1;
  });

  it("is loading until the first list arrives, then returns it", async () => {
    mockGetKeys.mockResolvedValueOnce(keysResponse(["OpenAI"]));
    const { result } = renderKeys(newClient());

    expect(result.current.loading).toBe(true);
    expect(result.current.keys).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.keys.map((k) => k.name)).toEqual(["OpenAI"]);
  });

  it("is loading while the mount's refetch of a stale cached list runs", () => {
    const client = newClient();
    client.setQueryData(["llmKeys", 1], []);
    mockGetKeys.mockReturnValue(new Promise(() => {})); // refetch never resolves

    const { result } = renderKeys(client);

    // A stale empty list must not read as "no keys" while it is re-checked.
    expect(mockGetKeys).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
  });

  it("stays settled while a later invalidation refetches", async () => {
    const client = newClient();
    mockGetKeys.mockResolvedValueOnce(keysResponse(["OpenAI"]));
    const { result } = renderKeys(client);
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetKeys.mockReturnValueOnce(new Promise(() => {}));
    act(() => {
      void client.invalidateQueries({ queryKey: ["llmKeys"] });
    });

    await waitFor(() => expect(mockGetKeys).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.keys).toHaveLength(1);
  });

  it("stays settled when a later refetch runs after mounting on fresh cached data", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    client.setQueryData(["llmKeys", 1], []);
    const { result } = renderKeys(client);
    expect(result.current.loading).toBe(false);

    mockGetKeys.mockReturnValueOnce(new Promise(() => {}));
    act(() => {
      void client.invalidateQueries({ queryKey: ["llmKeys"] });
    });

    await waitFor(() => expect(mockGetKeys).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(false);
  });

  it("starts loading again when the organization changes", async () => {
    // A different organization's list is a new first load, not a refetch:
    // without this the previous org's settled state would show "no keys".
    const client = newClient();
    mockGetKeys.mockResolvedValueOnce(keysResponse(["OpenAI"]));
    const { result, rerender } = renderKeys(client);
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockOrganizationId = 2;
    mockGetKeys.mockReturnValueOnce(new Promise(() => {}));
    rerender();

    expect(result.current.loading).toBe(true);
  });

  it("is settled with no keys and no request without an organization", () => {
    mockOrganizationId = null;
    const { result, rerender } = renderKeys(newClient());
    const first = result.current.keys;
    rerender();

    expect(mockGetKeys).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.keys).toEqual([]);
    // Stable, so effects that depend on the list do not re-run every render.
    expect(result.current.keys).toBe(first);
  });

  it("keeps the same list when a refetch returns the same keys", async () => {
    // Callers' effects depend on the list, so an unchanged refetch must not
    // hand them a new array.
    mockGetKeys.mockResolvedValue(keysResponse(["OpenAI"]));
    const client = newClient();
    const { result } = renderKeys(client);
    await waitFor(() => expect(result.current.keys).toHaveLength(1));
    const firstList = result.current.keys;

    await act(() => client.invalidateQueries({ queryKey: ["llmKeys"] }));
    await waitFor(() => expect(mockGetKeys).toHaveBeenCalledTimes(2));
    expect(result.current.keys).toBe(firstList);
  });

  it("refetches the key list and the status after invalidateLLMKeyQueries", async () => {
    const client = newClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    mockGetKeys.mockResolvedValueOnce(keysResponse([]));
    mockGetStatus.mockResolvedValueOnce({ hasKeys: false, keyCount: 0, providers: [] });
    const { result } = renderHook(() => ({ keys: useLLMKeys(), status: useLLMKeyStatus() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.keys.keys).toEqual([]));
    await waitFor(() => expect(result.current.status.hasKeys).toBe(false));

    // A key was added on the keys page.
    mockGetKeys.mockResolvedValueOnce(keysResponse(["OpenAI"]));
    mockGetStatus.mockResolvedValueOnce({ hasKeys: true, keyCount: 1, providers: ["OpenAI"] });
    await act(() => invalidateLLMKeyQueries(client));

    await waitFor(() => expect(result.current.keys.keys).toHaveLength(1));
    expect(result.current.status.hasKeys).toBe(true);
  });
});
