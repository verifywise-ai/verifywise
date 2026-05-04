import { describe, it, expect } from "vitest";
import {
  FRAMEWORK_IDS,
  FRAMEWORK_NAMES,
  FRAMEWORK_DETECTION,
  getFrameworkType,
  isISO42001,
  isISO27001,
  isNISTAIRMF,
} from "../frameworks";

describe("frameworks constants", () => {
  describe("FRAMEWORK_IDS", () => {
    it("should have correct framework IDs", () => {
      expect(FRAMEWORK_IDS.ISO_42001).toBe(2);
      expect(FRAMEWORK_IDS.ISO_27001).toBe(3);
      expect(FRAMEWORK_IDS.NIST_AI_RMF).toBe(4);
    });
  });

  describe("FRAMEWORK_NAMES", () => {
    it("should have correct framework names", () => {
      expect(FRAMEWORK_NAMES.ISO_42001).toBe("ISO 42001");
      expect(FRAMEWORK_NAMES.ISO_27001).toBe("ISO 27001");
      expect(FRAMEWORK_NAMES.NIST_AI_RMF).toBe("NIST AI RMF");
    });
  });

  describe("FRAMEWORK_DETECTION", () => {
    it("should have detection patterns for each framework", () => {
      expect(FRAMEWORK_DETECTION.ISO_42001_PATTERNS.length).toBeGreaterThan(0);
      expect(FRAMEWORK_DETECTION.ISO_27001_PATTERNS.length).toBeGreaterThan(0);
      expect(FRAMEWORK_DETECTION.NIST_AI_RMF_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe("getFrameworkType", () => {
    it("should detect ISO 42001 from name", () => {
      expect(getFrameworkType("ISO 42001")).toBe("ISO_42001");
      expect(getFrameworkType("iso 42001")).toBe("ISO_42001");
      expect(getFrameworkType("iso42001")).toBe("ISO_42001");
    });

    it("should detect ISO 27001 from name", () => {
      expect(getFrameworkType("ISO 27001")).toBe("ISO_27001");
      expect(getFrameworkType("iso 27001")).toBe("ISO_27001");
      expect(getFrameworkType("iso27001")).toBe("ISO_27001");
    });

    it("should detect NIST AI RMF from name", () => {
      expect(getFrameworkType("NIST AI RMF")).toBe("NIST_AI_RMF");
      expect(getFrameworkType("nist ai rmf")).toBe("NIST_AI_RMF");
      expect(getFrameworkType("nist ai")).toBe("NIST_AI_RMF");
      expect(getFrameworkType("NIST RMF")).toBe("NIST_AI_RMF");
    });

    it("should return UNKNOWN for unrecognized frameworks", () => {
      expect(getFrameworkType("SOC 2")).toBe("UNKNOWN");
      expect(getFrameworkType("GDPR")).toBe("UNKNOWN");
      expect(getFrameworkType("")).toBe("UNKNOWN");
    });
  });

  describe("isISO42001", () => {
    it("should return true for matching framework ID", () => {
      expect(isISO42001(FRAMEWORK_IDS.ISO_42001)).toBe(true);
    });

    it("should return false for non-matching framework ID", () => {
      expect(isISO42001(FRAMEWORK_IDS.ISO_27001)).toBe(false);
      expect(isISO42001(999)).toBe(false);
    });

    it("should match by name when ID does not match", () => {
      expect(isISO42001(999, "ISO 42001")).toBe(true);
    });

    it("should return false when name does not match either", () => {
      expect(isISO42001(999, "SOC 2")).toBe(false);
    });

    it("should ignore name when not provided", () => {
      expect(isISO42001(999)).toBe(false);
    });
  });

  describe("isISO27001", () => {
    it("should return true for matching framework ID", () => {
      expect(isISO27001(FRAMEWORK_IDS.ISO_27001)).toBe(true);
    });

    it("should return false for non-matching framework ID", () => {
      expect(isISO27001(FRAMEWORK_IDS.ISO_42001)).toBe(false);
    });

    it("should match by name when ID does not match", () => {
      expect(isISO27001(999, "ISO 27001")).toBe(true);
    });
  });

  describe("isNISTAIRMF", () => {
    it("should return true for matching framework ID", () => {
      expect(isNISTAIRMF(FRAMEWORK_IDS.NIST_AI_RMF)).toBe(true);
    });

    it("should return false for non-matching framework ID", () => {
      expect(isNISTAIRMF(FRAMEWORK_IDS.ISO_42001)).toBe(false);
    });

    it("should match by name when ID does not match", () => {
      expect(isNISTAIRMF(999, "NIST AI RMF")).toBe(true);
    });
  });
});
