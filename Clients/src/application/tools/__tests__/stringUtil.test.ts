import { describe, it, expect } from "vitest";
import { convertToCamelCaseRiskKey, stringToArray } from "../stringUtil";

describe("stringUtil", () => {
  describe("convertToCamelCaseRiskKey", () => {
    it("converts multi-word risk level to camelCase", () => {
      expect(convertToCamelCaseRiskKey("High Risk")).toBe("highRisk");
    });

    it("converts single word to lowercase", () => {
      expect(convertToCamelCaseRiskKey("Medium")).toBe("medium");
    });

    it("handles already lowercase single word", () => {
      expect(convertToCamelCaseRiskKey("low")).toBe("low");
    });

    it("handles multiple words with various casing", () => {
      expect(convertToCamelCaseRiskKey("VERY HIGH RISK")).toBe("veryHighRisk");
    });

    it("handles empty string", () => {
      expect(convertToCamelCaseRiskKey("")).toBe("");
    });
  });

  describe("stringToArray", () => {
    it("returns empty array for null", () => {
      expect(stringToArray(null as unknown as string)).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(stringToArray("")).toEqual([]);
    });

    it("parses JSON array format", () => {
      expect(stringToArray("[1,2,3]")).toEqual([1, 2, 3]);
    });

    it("parses single numeric string as array with one element", () => {
      expect(stringToArray("5")).toEqual([5]);
    });

    it("handles array with single element in bracket notation", () => {
      expect(stringToArray("[42]")).toEqual([42]);
    });
  });
});
