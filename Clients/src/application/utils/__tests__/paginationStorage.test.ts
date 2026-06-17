import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPaginationRowCount, setPaginationRowCount } from "../paginationStorage";

const TABLE_KEY = "test-table";

describe("paginationStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("getPaginationRowCount", () => {
    it("returns default count when nothing stored", () => {
      const result = getPaginationRowCount(TABLE_KEY);
      expect(result).toBe(10);
    });

    it("returns custom default when provided", () => {
      const result = getPaginationRowCount(TABLE_KEY, 25);
      expect(result).toBe(25);
    });

    it("returns stored value", () => {
      localStorage.setItem("verifywise_pagination_rows_test-table", "50");
      const result = getPaginationRowCount(TABLE_KEY);
      expect(result).toBe(50);
    });

    it("returns default when stored value is NaN", () => {
      localStorage.setItem("verifywise_pagination_rows_test-table", "not-a-number");
      const result = getPaginationRowCount(TABLE_KEY);
      expect(result).toBe(10);
    });

    it("returns default when stored value is <= 0", () => {
      localStorage.setItem("verifywise_pagination_rows_test-table", "0");
      const result = getPaginationRowCount(TABLE_KEY);
      expect(result).toBe(10);
    });

    it("returns default when localStorage throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });
      const result = getPaginationRowCount(TABLE_KEY);
      expect(result).toBe(10);
    });
  });

  describe("setPaginationRowCount", () => {
    it("stores the value in localStorage", () => {
      setPaginationRowCount(TABLE_KEY, 25);
      expect(localStorage.getItem("verifywise_pagination_rows_test-table")).toBe("25");
    });

    it("handles localStorage error gracefully", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("localStorage full");
      });
      expect(() => setPaginationRowCount(TABLE_KEY, 25)).not.toThrow();
    });
  });
});
