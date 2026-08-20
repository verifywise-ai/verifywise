import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/aiTrustIndex.repository", () => ({
  getApps: vi.fn(),
  getApp: vi.fn(),
  getTracked: vi.fn(),
  trackApp: vi.fn(),
  trackAppsBulk: vi.fn(),
  untrackApp: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

import {
  useApps,
  useApp,
  useTracked,
  useTrackApp,
  useTrackAppsBulk,
  useUntrackApp,
  useSettings,
  useUpdateSettings,
} from "../useAiTrustIndex";
import {
  getApps,
  getApp,
  getTracked,
  trackApp,
  trackAppsBulk,
  untrackApp,
  getSettings,
  updateSettings,
} from "../../repository/aiTrustIndex.repository";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidateSpy };
}

describe("useAiTrustIndex hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("useApps", () => {
    it("fetches the apps list with filters", async () => {
      vi.mocked(getApps).mockResolvedValue({ apps: [] } as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useApps({ search: "chat" }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getApps).toHaveBeenCalledWith({ search: "chat" });
    });
  });

  describe("useApp", () => {
    it("fetches a single app when slug is provided", async () => {
      vi.mocked(getApp).mockResolvedValue({ slug: "chat-gpt" } as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useApp("chat-gpt"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getApp).toHaveBeenCalledWith("chat-gpt");
    });

    it("does not fetch when slug is empty", () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useApp(""), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(getApp).not.toHaveBeenCalled();
    });
  });

  describe("useTracked", () => {
    it("fetches tracked apps", async () => {
      vi.mocked(getTracked).mockResolvedValue([] as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useTracked(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getTracked).toHaveBeenCalled();
    });
  });

  describe("useTrackApp", () => {
    it("tracks an app and invalidates related queries", async () => {
      vi.mocked(trackApp).mockResolvedValue({ tracked: true } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useTrackApp(), { wrapper });

      result.current.mutate("chat-gpt");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(trackApp).toHaveBeenCalledWith("chat-gpt");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ai-trust-index", "apps"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ai-trust-index", "tracked"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ai-trust-index", "app"] });
    });
  });

  describe("useTrackAppsBulk", () => {
    it("tracks apps in bulk and invalidates related queries", async () => {
      vi.mocked(trackAppsBulk).mockResolvedValue({ tracked: 2 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useTrackAppsBulk(), { wrapper });

      result.current.mutate(["a", "b"]);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(trackAppsBulk).toHaveBeenCalledWith(["a", "b"]);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ai-trust-index", "apps"] });
    });
  });

  describe("useUntrackApp", () => {
    it("untracks an app and invalidates related queries", async () => {
      vi.mocked(untrackApp).mockResolvedValue({ tracked: false } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useUntrackApp(), { wrapper });

      result.current.mutate("chat-gpt");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(untrackApp).toHaveBeenCalledWith("chat-gpt");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ai-trust-index", "tracked"] });
    });
  });

  describe("useSettings", () => {
    it("fetches settings", async () => {
      vi.mocked(getSettings).mockResolvedValue({ recipientUserIds: [] } as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getSettings).toHaveBeenCalled();
    });
  });

  describe("useUpdateSettings", () => {
    it("updates settings and invalidates the settings query", async () => {
      const body = { recipientUserIds: [1], recipientEmails: [] };
      vi.mocked(updateSettings).mockResolvedValue(body as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useUpdateSettings(), { wrapper });

      result.current.mutate(body);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(updateSettings).toHaveBeenCalledWith(body);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ai-trust-index", "settings"] });
    });
  });
});
