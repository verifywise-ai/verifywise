import { QueryClient } from "@tanstack/react-query";
import { queryClient, invalidateQueries, resetQueryCache } from "../queryClient";

describe("queryClient", () => {
  it("should be an instance of QueryClient", () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
  });

  describe("default query options", () => {
    it("should set staleTime to 2000ms", () => {
      const options = queryClient.getDefaultOptions();
      expect(options.queries?.staleTime).toBe(2000);
    });

    it("should set gcTime to 600000ms (10 minutes)", () => {
      const options = queryClient.getDefaultOptions();
      expect(options.queries?.gcTime).toBe(600000);
    });

    it("should set retry to 3 for queries", () => {
      const options = queryClient.getDefaultOptions();
      expect(options.queries?.retry).toBe(3);
    });

    it("should disable refetchOnWindowFocus", () => {
      const options = queryClient.getDefaultOptions();
      expect(options.queries?.refetchOnWindowFocus).toBe(false);
    });

    it("should enable refetchOnMount", () => {
      const options = queryClient.getDefaultOptions();
      expect(options.queries?.refetchOnMount).toBe(true);
    });

    it("should enable refetchOnReconnect", () => {
      const options = queryClient.getDefaultOptions();
      expect(options.queries?.refetchOnReconnect).toBe(true);
    });
  });

  describe("default mutation options", () => {
    it("should set retry to 1 for mutations", () => {
      const options = queryClient.getDefaultOptions();
      expect(options.mutations?.retry).toBe(1);
    });
  });

  describe("invalidateQueries", () => {
    it("should call invalidateQueries on the client for each key", () => {
      const spy = vi.spyOn(queryClient, "invalidateQueries");

      const keys = [["users"], ["posts"], ["comments"]];
      invalidateQueries(keys);

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledWith({ queryKey: ["users"] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["posts"] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["comments"] });

      spy.mockRestore();
    });

    it("should handle an empty array without calling invalidateQueries", () => {
      const spy = vi.spyOn(queryClient, "invalidateQueries");

      invalidateQueries([]);

      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe("resetQueryCache", () => {
    it("should call clear on the client", () => {
      const spy = vi.spyOn(queryClient, "clear");

      resetQueryCache();

      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });
  });
});
