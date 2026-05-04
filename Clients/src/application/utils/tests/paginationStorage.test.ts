import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPaginationRowCount, setPaginationRowCount } from "../paginationStorage";

function createMockStorage(): Storage {
  const storage = {} as Storage & Record<string, any>;

  Object.defineProperties(storage, {
    getItem: {
      value: (key: string) =>
        Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
      enumerable: false,
      writable: true,
    },
    setItem: {
      value: (key: string, value: string) => {
        storage[key] = String(value);
      },
      enumerable: false,
      writable: true,
    },
    removeItem: {
      value: (key: string) => {
        delete storage[key];
      },
      enumerable: false,
      writable: true,
    },
    clear: {
      value: () => {
        Object.keys(storage).forEach((key) => delete storage[key]);
      },
      enumerable: false,
    },
    key: {
      value: (index: number) => Object.keys(storage)[index] ?? null,
      enumerable: false,
    },
    length: {
      get: () => Object.keys(storage).length,
      enumerable: false,
    },
  });

  return storage;
}

describe("paginationStorage", () => {
  let mockLocalStorage: Storage;

  beforeEach(() => {
    mockLocalStorage = createMockStorage();
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("getPaginationRowCount", () => {
    it("returns defaultCount when nothing stored", () => {
      expect(getPaginationRowCount("users", 10)).toBe(10);
    });

    it("returns stored value when valid positive integer", () => {
      localStorage.setItem("pagination_rows_users", "25");
      expect(getPaginationRowCount("users", 10)).toBe(25);
    });

    it("returns defaultCount when stored value is NaN", () => {
      localStorage.setItem("pagination_rows_users", "abc");
      expect(getPaginationRowCount("users", 10)).toBe(10);
    });

    it("returns defaultCount when stored value is 0 or negative", () => {
      localStorage.setItem("pagination_rows_users", "0");
      expect(getPaginationRowCount("users", 10)).toBe(10);

      localStorage.setItem("pagination_rows_users", "-5");
      expect(getPaginationRowCount("users", 10)).toBe(10);
    });

    it("returns defaultCount and warns when localStorage.getItem throws", () => {
      // Spy on the mock localStorage directly
      mockLocalStorage.getItem = vi.fn(() => {
        throw new Error("boom");
      });

      expect(getPaginationRowCount("users", 10)).toBe(10);
      expect(console.warn).toHaveBeenCalledWith(
        "Failed to retrieve pagination setting from localStorage:",
        expect.any(Error),
      );
    });

    it("uses defaultCount=10 when not provided", () => {
      expect(getPaginationRowCount("users")).toBe(10);
    });
  });

  describe("setPaginationRowCount", () => {
    it("stores rowCount as string", () => {
      setPaginationRowCount("users", 50);
      expect(localStorage.getItem("pagination_rows_users")).toBe("50");
    });

    it("warns when localStorage.setItem throws", () => {
      mockLocalStorage.setItem = vi.fn(() => {
        throw new Error("boom");
      });

      setPaginationRowCount("users", 50);

      expect(console.warn).toHaveBeenCalledWith(
        "Failed to save pagination setting to localStorage:",
        expect.any(Error),
      );
    });
  });
});
