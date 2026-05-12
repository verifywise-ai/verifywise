import { describe, it, expect } from "@jest/globals";
import { validateRiskArray, toStringParam, getStringParam, toStringQuery } from "../utility.utils";

describe("utility.utils", () => {
  describe("validateRiskArray", () => {
    it("should return a validated array of integers", () => {
      const result = validateRiskArray([1, 2, 3], "riskLevels");
      expect(result).toEqual([1, 2, 3]);
    });

    it("should return an empty array when input is empty", () => {
      const result = validateRiskArray([], "riskLevels");
      expect(result).toEqual([]);
    });

    it("should throw when input is not an array", () => {
      expect(() => validateRiskArray("not an array" as any, "riskLevels")).toThrow(
        "riskLevels must be an array",
      );
      expect(() => validateRiskArray(null as any, "riskLevels")).toThrow(
        "riskLevels must be an array",
      );
      expect(() => validateRiskArray(undefined as any, "riskLevels")).toThrow(
        "riskLevels must be an array",
      );
      expect(() => validateRiskArray(42 as any, "riskLevels")).toThrow(
        "riskLevels must be an array",
      );
    });

    it("should throw for string values", () => {
      expect(() => validateRiskArray([1, "two", 3], "riskLevels")).toThrow(
        'riskLevels[1] contains invalid value: "two". All items must be valid integers.',
      );
    });

    it("should throw for float values", () => {
      expect(() => validateRiskArray([1, 2.5, 3], "riskLevels")).toThrow(
        'riskLevels[1] contains invalid value: "2.5". All items must be valid integers.',
      );
    });

    it("should throw for NaN values", () => {
      expect(() => validateRiskArray([1, NaN, 3], "riskLevels")).toThrow(
        'riskLevels[1] contains invalid value: "NaN". All items must be valid integers.',
      );
    });

    it("should throw for Infinity values", () => {
      expect(() => validateRiskArray([1, Infinity, 3], "riskLevels")).toThrow(
        'riskLevels[1] contains invalid value: "Infinity". All items must be valid integers.',
      );
    });

    it("should throw for boolean values", () => {
      expect(() => validateRiskArray([1, true, 3], "riskLevels")).toThrow(
        'riskLevels[1] contains invalid value: "true". All items must be valid integers.',
      );
    });
  });

  describe("toStringParam", () => {
    it("should return the first element for array input", () => {
      expect(toStringParam(["a", "b", "c"])).toBe("a");
    });

    it("should return the string for string input", () => {
      expect(toStringParam("hello")).toBe("hello");
    });

    it("should return empty string for undefined", () => {
      expect(toStringParam(undefined)).toBe("");
    });

    it("should return empty string for empty string input", () => {
      expect(toStringParam("")).toBe("");
    });
  });

  describe("getStringParam", () => {
    it("should return the first element for array input", () => {
      expect(getStringParam(["a", "b", "c"])).toBe("a");
    });

    it("should return the string for string input", () => {
      expect(getStringParam("hello")).toBe("hello");
    });

    it("should return empty string for undefined", () => {
      expect(getStringParam(undefined)).toBe("");
    });

    it("should return empty string for empty string input", () => {
      expect(getStringParam("")).toBe("");
    });
  });

  describe("toStringQuery", () => {
    it("should return empty string for undefined", () => {
      expect(toStringQuery(undefined)).toBe("");
    });

    it("should return empty string for null", () => {
      expect(toStringQuery(null)).toBe("");
    });

    it("should return first element for array input", () => {
      expect(toStringQuery(["a", "b", "c"])).toBe("a");
    });

    it("should return empty string for empty array", () => {
      expect(toStringQuery([])).toBe("");
    });

    it("should return string for string input", () => {
      expect(toStringQuery("hello")).toBe("hello");
    });

    it("should return string representation for object input", () => {
      expect(toStringQuery({ foo: "bar" })).toBe("[object Object]");
    });

    it("should return string representation for number input", () => {
      expect(toStringQuery(42)).toBe("42");
    });

    it("should return string representation for boolean input", () => {
      expect(toStringQuery(false)).toBe("false");
    });
  });
});
