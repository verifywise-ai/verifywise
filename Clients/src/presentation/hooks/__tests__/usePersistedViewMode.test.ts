import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedViewMode } from "../usePersistedViewMode";

describe("usePersistedViewMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("initialization", () => {
    it("returns 'card' as default when localStorage is empty", () => {
      const { result } = renderHook(() => usePersistedViewMode("test-key"));
      expect(result.current[0]).toBe("card");
    });

    it("reads 'table' from localStorage", () => {
      localStorage.setItem("test-key", "table");
      const { result } = renderHook(() => usePersistedViewMode("test-key"));
      expect(result.current[0]).toBe("table");
    });

    it("reads 'card' from localStorage", () => {
      localStorage.setItem("test-key", "card");
      const { result } = renderHook(() => usePersistedViewMode("test-key"));
      expect(result.current[0]).toBe("card");
    });

    it("ignores invalid localStorage values and uses default", () => {
      localStorage.setItem("test-key", "grid");
      const { result } = renderHook(() => usePersistedViewMode("test-key"));
      expect(result.current[0]).toBe("card");
    });

    it("uses custom default value", () => {
      const { result } = renderHook(() => usePersistedViewMode("test-key", "table"));
      expect(result.current[0]).toBe("table");
    });
  });

  describe("update", () => {
    it("setViewMode updates state and writes to localStorage", () => {
      const { result } = renderHook(() => usePersistedViewMode("test-key"));
      expect(result.current[0]).toBe("card");

      act(() => {
        result.current[1]("table");
      });

      expect(result.current[0]).toBe("table");
      expect(localStorage.getItem("test-key")).toBe("table");
    });
  });

  describe("error handling", () => {
    it("survives localStorage.getItem throwing", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });

      const { result } = renderHook(() => usePersistedViewMode("test-key"));
      expect(result.current[0]).toBe("card");

      spy.mockRestore();
    });

    it("survives localStorage.setItem throwing", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("localStorage full");
      });

      const { result } = renderHook(() => usePersistedViewMode("test-key"));

      // Should not throw
      act(() => {
        result.current[1]("table");
      });

      // State still updates even if localStorage fails
      expect(result.current[0]).toBe("table");

      spy.mockRestore();
    });
  });
});
