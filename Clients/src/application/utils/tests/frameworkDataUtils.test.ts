import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ✅ Mock helper that decides if framework is ISO27001
vi.mock("../../constants/frameworks", () => ({
  isISO27001: vi.fn(),
}));

import { isISO27001 } from "../../constants/frameworks";

import {
  validateApiResponse,
  processSubItems,
  calculateItemPercentages,
  isValidClauseNumber,
  getClauseNumber,
  validateDataConsistency,
  processAnnexNumber,
  clampValue,
  isSuccessResponse,
  createErrorLogData,
} from "../frameworkDataUtils";

describe("frameworkDataUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateApiResponse", () => {
    it("returns invalid when response is null", () => {
      const result = validateApiResponse(null, "ISO 27001", "clauses");
      expect(result.isValid).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toContain("Null response received");
    });

    it("extracts data when response is an array", () => {
      const result = validateApiResponse([{ id: 1 }], "ISO 27001", "clauses");
      expect(result.isValid).toBe(true);
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.error).toBeUndefined();
    });

    it("extracts data when response.data is an array", () => {
      const result = validateApiResponse({ data: [{ id: 1 }] }, "ISO 27001", "clauses");
      expect(result.isValid).toBe(true);
      expect(result.data).toEqual([{ id: 1 }]);
    });

    it("extracts data when response.data.data is an array (nested)", () => {
      const result = validateApiResponse({ data: { data: [{ id: 1 }] } }, "ISO 27001", "clauses");
      expect(result.isValid).toBe(true);
      expect(result.data).toEqual([{ id: 1 }]);
    });

    it("returns invalid for invalid nested data structure", () => {
      const result = validateApiResponse({ data: { data: {} } }, "ISO 27001", "clauses");
      expect(result.isValid).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toContain("Invalid nested data structure");
    });

    it("returns invalid for unexpected response structure", () => {
      const result = validateApiResponse({ hello: "world" }, "ISO 27001", "clauses");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Unexpected response structure");
    });

    /**
     * This test mocks Array.isArray to force a specific code path that validates
     * the extracted data is an array. This is an implementation detail test that
     * ensures the guard clause at lines 106-111 works correctly. The mock forces
     * the second Array.isArray call to return false, simulating a scenario where
     * the extracted data unexpectedly becomes non-array after initial extraction.
     *
     * Note: This approach tests internal behavior rather than external behavior,
     * making it potentially brittle to refactoring. However, it's necessary to
     * achieve full branch coverage for this defensive code path.
     */
    it("returns invalid when extractedData is not an array (covers lines 106-111)", () => {
      const isArraySpy = vi.spyOn(Array, "isArray");
      isArraySpy
        .mockImplementationOnce(() => true) // response is treated as array (for branch)
        .mockImplementationOnce(() => false); // extractedData is not an array (forced)

      const result = validateApiResponse([{ id: 1 }], "ISO 27001", "clauses");

      expect(result).toEqual({
        isValid: false,
        data: [],
        error: "Data is not an array for ISO 27001 clauses",
      });

      isArraySpy.mockRestore();
    });
  });

  describe("processSubItems", () => {
    it("returns [] and warns when items is not an array", () => {
      const result = processSubItems("nope" as any, 1, "ISO 27001");
      expect(result).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    });

    it("maps valid items and filters invalid ones with warnings", () => {
      const result = processSubItems(
        [
          { id: "10", title: "T", status: "Implemented", owner: "5" },
          null,
          "bad",
          { id: undefined, title: undefined, status: undefined, owner: null },
          { id: 2, title: "X", status: "Not started", owner: undefined },
        ],
        "PARENT",
        "ISO 27001",
      );

      // invalid entries removed
      expect(result).toHaveLength(3);

      expect(result[0]).toEqual({
        id: 10,
        title: "T",
        status: "Implemented",
        owner: 5,
      });

      expect(result[1]).toEqual({
        id: 0,
        title: "Untitled",
        status: "Not started",
        owner: null,
      });

      expect(result[2]).toEqual({
        id: 2,
        title: "X",
        status: "Not started",
        owner: null,
      });

      // warnings for invalid items
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe("calculateItemPercentages", () => {
    it("returns 0/0 when items is empty", () => {
      expect(calculateItemPercentages([])).toEqual({
        completionPercentage: 0,
        assignmentPercentage: 0,
      });
    });

    it("calculates completion and assignment percentage", () => {
      const items = [
        { id: 1, title: "a", status: "Implemented", owner: 1 },
        { id: 2, title: "b", status: "Not started", owner: null },
        { id: 3, title: "c", status: "Implemented", owner: undefined },
        { id: 4, title: "d", status: "In progress", owner: 2 },
      ];

      const result = calculateItemPercentages(items as any);

      // Implemented = 2/4 => 50
      expect(result.completionPercentage).toBe(50);
      // Assigned (owner not null/undefined) = 2/4 => 50
      expect(result.assignmentPercentage).toBe(50);
    });
  });

  describe("isValidClauseNumber", () => {
    it("returns false and warns when clause is null", () => {
      (isISO27001 as any).mockReturnValue(true);
      expect(isValidClauseNumber(null, "ISO 27001")).toBe(false);
      expect(console.warn).toHaveBeenCalled();
    });

    it("ISO27001: returns false when both arrangement and clause_no missing", () => {
      (isISO27001 as any).mockReturnValue(true);
      expect(isValidClauseNumber({ title: "x" }, "ISO 27001")).toBe(false);
      expect(console.warn).toHaveBeenCalled();
    });

    it("ISO27001: returns false when arrangement/clause_no not numeric", () => {
      (isISO27001 as any).mockReturnValue(true);
      expect(isValidClauseNumber({ arrangement: "A" }, "ISO 27001")).toBe(false);
      expect(console.warn).toHaveBeenCalled();
    });

    it("ISO27001: returns true when clause number in range using arrangement", () => {
      (isISO27001 as any).mockReturnValue(true);
      expect(isValidClauseNumber({ arrangement: "4" }, "ISO 27001")).toBe(true);
      expect(isValidClauseNumber({ arrangement: "10" }, "ISO 27001")).toBe(true);
    });

    it("ISO27001: returns false when clause number out of range", () => {
      (isISO27001 as any).mockReturnValue(true);
      expect(isValidClauseNumber({ arrangement: "3" }, "ISO 27001")).toBe(false);
      expect(isValidClauseNumber({ arrangement: "11" }, "ISO 27001")).toBe(false);
    });

    it("ISO42001: returns false when clause_no missing", () => {
      (isISO27001 as any).mockReturnValue(false);
      expect(isValidClauseNumber({ arrangement: "4" }, "ISO 42001")).toBe(false);
      expect(console.warn).toHaveBeenCalled();
    });

    it("ISO42001: returns false when clause_no not numeric", () => {
      (isISO27001 as any).mockReturnValue(false);
      expect(isValidClauseNumber({ clause_no: "x" }, "ISO 42001")).toBe(false);
      expect(console.warn).toHaveBeenCalled();
    });

    it("ISO42001: returns true when clause_no in range", () => {
      (isISO27001 as any).mockReturnValue(false);
      expect(isValidClauseNumber({ clause_no: "4" }, "ISO 42001")).toBe(true);
      expect(isValidClauseNumber({ clause_no: "10" }, "ISO 42001")).toBe(true);
    });

    it("ISO27001: falls back to clause_no when arrangement is present but falsy (covers OR branch at line 202)", () => {
      (isISO27001 as any).mockReturnValue(true);

      // arrangement exists (does not trigger 'missing clause number'), but is "" (falsy)
      // so it should use clause_no
      const result = isValidClauseNumber({ arrangement: "", clause_no: "4" }, "ISO 27001");

      expect(result).toBe(true);
    });
  });

  describe("getClauseNumber", () => {
    it("ISO27001 uses arrangement fallback to clause_no", () => {
      (isISO27001 as any).mockReturnValue(true);
      expect(getClauseNumber({ arrangement: "5", clause_no: "6" }, "ISO 27001")).toBe(5);
      expect(getClauseNumber({ clause_no: "6" }, "ISO 27001")).toBe(6);
    });

    it("ISO42001 uses clause_no", () => {
      (isISO27001 as any).mockReturnValue(false);
      expect(getClauseNumber({ clause_no: "7" }, "ISO 42001")).toBe(7);
    });
  });

  describe("validateDataConsistency", () => {
    it("caps assigned to total when assigned > total and warns", () => {
      const result = validateDataConsistency(10, 3, "clauses", "ISO 27001");
      expect(result).toBe(3);
      expect(console.warn).toHaveBeenCalled();
    });

    it("returns assigned when consistent", () => {
      const result = validateDataConsistency(2, 3, "clauses", "ISO 27001");
      expect(result).toBe(2);
    });
  });

  describe("processAnnexNumber", () => {
    it("extracts annex number when title already starts with A.x", () => {
      (isISO27001 as any).mockReturnValue(true);

      const result = processAnnexNumber(
        { id: 1, title: "A.5 Organizational policies and governance" } as any,
        "ISO 27001",
      );

      expect(result.displayNumber).toBe("A.5");
      expect(result.cleanTitle).toBe("Organizational policies and governance");
    });

    it("ISO27001 generates annex number using id + 4", () => {
      (isISO27001 as any).mockReturnValue(true);

      const result = processAnnexNumber({ id: 2, title: "Some title" } as any, "ISO 27001");
      // id 2 => A.6
      expect(result.displayNumber).toBe("A.6");
      expect(result.cleanTitle).toBe("Some title");
    });

    it("non-ISO27001 uses arrangement first", () => {
      (isISO27001 as any).mockReturnValue(false);

      const result = processAnnexNumber(
        { id: 99, title: "X", arrangement: "12" } as any,
        "ISO 42001",
      );

      expect(result.displayNumber).toBe("A.12");
      expect(result.cleanTitle).toBe("X");
    });

    it("non-ISO27001 uses annex_no when arrangement missing", () => {
      (isISO27001 as any).mockReturnValue(false);

      const result = processAnnexNumber({ id: 99, title: "X", annex_no: "7" } as any, "ISO 42001");

      expect(result.displayNumber).toBe("A.7");
    });

    it("non-ISO27001 falls back to id when arrangement and annex_no missing", () => {
      (isISO27001 as any).mockReturnValue(false);

      const result = processAnnexNumber({ id: 3, title: "X" } as any, "ISO 42001");
      expect(result.displayNumber).toBe("A.3");
    });
  });

  describe("clampValue", () => {
    it("clamps to 0 by default", () => {
      expect(clampValue(-1)).toBe(0);
      expect(clampValue(5)).toBe(5);
    });

    it("clamps to custom min", () => {
      expect(clampValue(-1, 10)).toBe(10);
      expect(clampValue(12, 10)).toBe(12);
    });
  });

  describe("isSuccessResponse", () => {
    it("returns true for 2xx only", () => {
      expect(isSuccessResponse(200)).toBe(true);
      expect(isSuccessResponse(299)).toBe(true);
      expect(isSuccessResponse(199)).toBe(false);
      expect(isSuccessResponse(300)).toBe(false);
    });
  });

  describe("createErrorLogData", () => {
    it("formats Error objects, includes timestamp and context", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-22T12:00:00.000Z"));

      const result = createErrorLogData(new Error("boom"), {
        frameworkName: "ISO 27001",
        projectFrameworkId: 123,
        operation: "fetchClauses",
        routeUrl: "/api/x",
        extra: "value",
      });

      expect(result).toMatchObject({
        error: "boom",
        frameworkName: "ISO 27001",
        projectFrameworkId: 123,
        operation: "fetchClauses",
        routeUrl: "/api/x",
        extra: "value",
      });

      expect(result.timestamp).toBe("2026-01-22T12:00:00.000Z");

      vi.useRealTimers();
    });

    it("supports non-Error errors (string/object)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-22T12:00:00.000Z"));

      const result = createErrorLogData("bad", {
        frameworkName: "ISO 42001",
        projectFrameworkId: 1,
        operation: "fetch",
      });

      expect(result.error).toBe("bad");
      expect(result.timestamp).toBe("2026-01-22T12:00:00.000Z");

      vi.useRealTimers();
    });
  });
});
