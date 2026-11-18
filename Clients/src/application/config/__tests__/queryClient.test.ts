import { describe, it, expect, vi } from "vitest";
import { queryClient, invalidateQueries, resetQueryCache, retryQuery } from "../queryClient";

describe("queryClient config", () => {
  it("should have default query options configured", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(2000);
    expect(defaults.queries?.gcTime).toBe(600000);
    expect(defaults.queries?.retry).toBe(retryQuery);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.refetchOnMount).toBe(true);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it("should invalidate queries by keys", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue({} as any);

    invalidateQueries([["projects"], ["vendors", "list"]]);

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["vendors", "list"] });

    invalidateSpy.mockRestore();
  });

  it("should reset query cache", () => {
    const clearSpy = vi.spyOn(queryClient, "clear").mockImplementation(() => {});

    resetQueryCache();

    expect(clearSpy).toHaveBeenCalledTimes(1);

    clearSpy.mockRestore();
  });

  describe("retryQuery", () => {
    it("retries server, network and timeout failures up to three times", () => {
      const serverError = { status: 500 };
      expect(retryQuery(0, serverError)).toBe(true);
      expect(retryQuery(2, serverError)).toBe(true);
      expect(retryQuery(3, serverError)).toBe(false);
      expect(retryQuery(0, new Error("Network Error"))).toBe(true);
      expect(retryQuery(0, null)).toBe(true);
      expect(retryQuery(0, { status: 408 })).toBe(true);
    });

    it("never retries a rate-limited request or another 4xx", () => {
      expect(retryQuery(0, { status: 429 })).toBe(false);
      expect(retryQuery(0, { response: { status: 429 } })).toBe(false);
      expect(retryQuery(0, { status: 404 })).toBe(false);
    });
  });
});
