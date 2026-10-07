import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockOrganizationId: number | null = 1;
vi.mock("../useAuth", () => ({
  useAuth: () => ({ organizationId: mockOrganizationId }),
}));

vi.mock("../../repository/llmKeys.repository", () => ({
  getLLMKeyStatus: vi.fn(),
}));

import { useLLMKeyStatus } from "../useLLMKeyStatus";
import { getLLMKeyStatus } from "../../repository/llmKeys.repository";

const mockGetStatus = vi.mocked(getLLMKeyStatus);

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

// A fresh client per hook unless a test shares one on purpose.
const render = (client: QueryClient = newClient()) => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useLLMKeyStatus(), { wrapper });
};

describe("useLLMKeyStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrganizationId = 1;
  });

  it("fetches and returns LLM key status", async () => {
    const status = { hasKey: true, provider: "openai" };
    mockGetStatus.mockResolvedValue(status as any);

    const { result } = render();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(status);
    expect(result.current.error).toBeNull();
  });

  it("sets error on failure", async () => {
    mockGetStatus.mockRejectedValue(new Error("Network error"));

    const { result } = render();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Network error");
  });

  it("starts in loading state", () => {
    mockGetStatus.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = render();
    expect(result.current.loading).toBe(true);
  });

  it("derives hasKeys as true while still loading, regardless of eventual result", () => {
    mockGetStatus.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = render();
    expect(result.current.loading).toBe(true);
    expect(result.current.hasKeys).toBe(true);
  });

  it("derives hasKeys as false once resolved with no keys configured", async () => {
    mockGetStatus.mockResolvedValue({ hasKeys: false, keyCount: 0, providers: [] } as any);
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasKeys).toBe(false);
  });

  it("derives hasKeys as true once resolved with keys configured", async () => {
    mockGetStatus.mockResolvedValue({
      hasKeys: true,
      keyCount: 1,
      providers: ["Anthropic"],
    } as any);
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasKeys).toBe(true);
  });

  it("keeps the last known answer when a refetch fails", async () => {
    const client = newClient();
    mockGetStatus.mockResolvedValueOnce({ hasKeys: true, keyCount: 1, providers: ["OpenAI"] });
    const { result } = render(client);
    await waitFor(() => expect(result.current.data?.hasKeys).toBe(true));

    // A transient failure must not flip a known status to "no keys".
    mockGetStatus.mockRejectedValueOnce(new Error("Network error"));
    await act(() => client.refetchQueries());

    await waitFor(() => expect(result.current.error).toBe("Network error"));
    expect(result.current.data).toEqual({ hasKeys: true, keyCount: 1, providers: ["OpenAI"] });
    expect(result.current.hasKeys).toBe(true);
  });

  it("reports no keys when the first load fails", async () => {
    mockGetStatus.mockRejectedValueOnce(new Error("Network error"));
    const { result } = render();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Network error");
    expect(result.current.data).toBeNull();
    expect(result.current.hasKeys).toBe(false);
  });

  it("is loading while the mount's refetch of a stale cached answer runs", () => {
    const client = newClient();
    client.setQueryData(["llmKeyStatus", 1], { hasKeys: false, keyCount: 0, providers: [] });
    mockGetStatus.mockReturnValue(new Promise(() => {})); // refetch never resolves

    const { result } = render(client);

    // A stale "no keys" must not read as settled while it is being re-checked.
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
    expect(result.current.hasKeys).toBe(true);
  });

  it("is settled on fresh cached data that needs no refetch", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(["llmKeyStatus", 1], { hasKeys: false, keyCount: 0, providers: [] });

    const { result } = render(client);

    expect(mockGetStatus).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.hasKeys).toBe(false);
  });

  it("stays settled while a later invalidation refetches", async () => {
    const client = newClient();
    mockGetStatus.mockResolvedValueOnce({ hasKeys: false, keyCount: 0, providers: [] });
    const { result } = render(client);
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetStatus.mockReturnValueOnce(new Promise(() => {}));
    act(() => {
      void client.invalidateQueries({ queryKey: ["llmKeyStatus"] });
    });

    await waitFor(() => expect(mockGetStatus).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.hasKeys).toBe(false);
  });

  it("keeps each organization's status separate", async () => {
    const client = newClient();
    mockGetStatus.mockResolvedValueOnce({ hasKeys: true, keyCount: 1, providers: ["OpenAI"] });
    const first = render(client);
    await waitFor(() => expect(first.result.current.data?.hasKeys).toBe(true));
    first.unmount();

    // Another org signs in on the same tab: it must not see the first org's answer.
    mockOrganizationId = 2;
    mockGetStatus.mockReturnValueOnce(new Promise(() => {}));
    const second = render(client);
    expect(second.result.current.loading).toBe(true);
    expect(second.result.current.data).toBeNull();
  });

  it("settles on no keys when there is no organization", () => {
    mockOrganizationId = null;
    const { result } = render();
    expect(mockGetStatus).not.toHaveBeenCalled();
    // Nothing to ask about: settled, not pending.
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.hasKeys).toBe(false);
  });

  it("stays settled when a later refetch runs after mounting on fresh cached data", async () => {
    // Mounting on fresh data does not fetch; a later invalidation then must
    // not read as a first load (it would lock the Advisor and hide hints).
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    client.setQueryData(["llmKeyStatus", 1], { hasKeys: false, keyCount: 0, providers: [] });
    const { result } = render(client);
    expect(result.current.loading).toBe(false);

    mockGetStatus.mockReturnValueOnce(new Promise(() => {}));
    act(() => {
      void client.invalidateQueries({ queryKey: ["llmKeyStatus"] });
    });

    await waitFor(() => expect(mockGetStatus).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(false);
    expect(result.current.hasKeys).toBe(false);
  });
});
