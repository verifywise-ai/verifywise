import { describe, it, expect, vi } from "vitest";
import { queryClient, invalidateQueries, resetQueryCache } from "../queryClient";

describe("queryClient config", () => {
  it("should have default query options configured", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(2000);
    expect(defaults.queries?.gcTime).toBe(600000);
    expect(defaults.queries?.retry).toBe(3);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.refetchOnMount).toBe(true);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
    expect(defaults.mutations?.retry).toBe(1);
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
});
