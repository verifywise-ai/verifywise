import { describe, it, expect } from "vitest";
import {
  getGradeLabel,
  DEFAULT_DIMENSION_WEIGHTS,
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  VULNERABILITY_TYPES,
  DEFAULT_VULNERABILITY_TYPES_ENABLED,
} from "../riskScoringTypes";

describe("riskScoringTypes", () => {
  describe("getGradeLabel", () => {
    it("returns 'Excellent' for grade A", () => {
      expect(getGradeLabel("A")).toBe("Excellent");
    });

    it("returns 'Good' for grade B", () => {
      expect(getGradeLabel("B")).toBe("Good");
    });

    it("returns 'Acceptable' for grade C", () => {
      expect(getGradeLabel("C")).toBe("Acceptable");
    });

    it("returns 'Needs attention' for grade D", () => {
      expect(getGradeLabel("D")).toBe("Needs attention");
    });

    it("returns 'Critical' for grade F", () => {
      expect(getGradeLabel("F")).toBe("Critical");
    });

    it("returns 'Not scored' for null", () => {
      expect(getGradeLabel(null)).toBe("Not scored");
    });
  });

  describe("DEFAULT_DIMENSION_WEIGHTS", () => {
    it("weights sum to 1.0", () => {
      const sum = Object.values(DEFAULT_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    });

    it("has a weight for each dimension in DIMENSION_ORDER", () => {
      for (const key of DIMENSION_ORDER) {
        expect(DEFAULT_DIMENSION_WEIGHTS[key]).toBeGreaterThan(0);
      }
    });
  });

  describe("DIMENSION_LABELS", () => {
    it("has a label for each dimension", () => {
      for (const key of DIMENSION_ORDER) {
        expect(DIMENSION_LABELS[key]).toBeDefined();
        expect(typeof DIMENSION_LABELS[key]).toBe("string");
      }
    });
  });

  describe("VULNERABILITY_TYPES", () => {
    it("has 10 vulnerability types", () => {
      expect(VULNERABILITY_TYPES).toHaveLength(10);
    });

    it("each type has required fields", () => {
      for (const vt of VULNERABILITY_TYPES) {
        expect(vt.key).toBeDefined();
        expect(vt.name).toBeDefined();
        expect(vt.owaspId).toMatch(/^LLM\d{2}$/);
        expect(vt.description.length).toBeGreaterThan(0);
      }
    });

    it("all types are enabled by default", () => {
      for (const vt of VULNERABILITY_TYPES) {
        expect(DEFAULT_VULNERABILITY_TYPES_ENABLED[vt.key]).toBe(true);
      }
    });
  });
});
