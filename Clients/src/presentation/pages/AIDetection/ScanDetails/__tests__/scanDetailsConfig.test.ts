import {
  isFindingSuppressed,
  CONFIDENCE_CHIP_VARIANT,
  SEVERITY_CHIP_VARIANT,
  SEVERITY_BORDER_COLORS,
  CONFIDENCE_TOOLTIPS,
  RISK_LEVEL_CONFIG,
  LICENSE_RISK_CONFIG,
  SEVERITY_TOOLTIPS,
  GOVERNANCE_STATUS_CONFIG,
  COMPLIANCE_CATEGORY_CONFIG,
  PRIORITY_CONFIG,
  ARTICLE_DESCRIPTIONS,
  DIMENSION_CHIP_COLORS,
  VULN_TYPE_LABELS,
} from "../scanDetailsConfig";
import type { Finding } from "../../../../../domain/ai-detection/types";

const baseFinding: Finding = {
  id: 1,
  finding_type: "library",
  category: "AI/ML",
  name: "openai",
  provider: "OpenAI",
  confidence: "high",
  risk_level: "high",
  file_count: 1,
  file_paths: [],
};

describe("scanDetailsConfig", () => {
  describe("isFindingSuppressed", () => {
    it("returns false when neither suppressed flag nor governance status is set", () => {
      expect(isFindingSuppressed(baseFinding)).toBe(false);
    });

    it("returns true when the scan-time suppressed flag is set", () => {
      expect(isFindingSuppressed({ ...baseFinding, suppressed: true })).toBe(true);
    });

    it("returns true when governance_status is 'suppressed'", () => {
      expect(isFindingSuppressed({ ...baseFinding, governance_status: "suppressed" })).toBe(true);
    });

    it("returns false for other governance statuses", () => {
      expect(isFindingSuppressed({ ...baseFinding, governance_status: "accepted_risk" })).toBe(
        false,
      );
    });
  });

  describe("configuration tables", () => {
    it("defines chip variants for every confidence level", () => {
      expect(CONFIDENCE_CHIP_VARIANT).toEqual({ high: "high", medium: "medium", low: "low" });
    });

    it("defines chip variants for every severity level", () => {
      expect(SEVERITY_CHIP_VARIANT.critical).toBe("critical");
      expect(SEVERITY_CHIP_VARIANT.low).toBe("low");
    });

    it("defines border colors for every severity level", () => {
      expect(Object.keys(SEVERITY_BORDER_COLORS)).toEqual(["critical", "high", "medium", "low"]);
    });

    it("defines tooltips for every confidence level", () => {
      expect(CONFIDENCE_TOOLTIPS.high).toContain("very confident");
      expect(CONFIDENCE_TOOLTIPS.medium).toBeTruthy();
      expect(CONFIDENCE_TOOLTIPS.low).toBeTruthy();
    });

    it("defines risk level config with label/color/bgColor/tooltip", () => {
      expect(RISK_LEVEL_CONFIG.high.label).toBe("High risk");
      expect(RISK_LEVEL_CONFIG.medium.label).toBe("Medium risk");
      expect(RISK_LEVEL_CONFIG.low.label).toBe("Low risk");
    });

    it("defines license risk config including 'unknown'", () => {
      expect(LICENSE_RISK_CONFIG.unknown.label).toBe("Unknown");
      expect(LICENSE_RISK_CONFIG.high.label).toBe("Restrictive");
    });

    it("defines severity tooltips for every level", () => {
      expect(SEVERITY_TOOLTIPS.critical).toContain("Critical severity");
    });

    it("defines governance status config for all statuses", () => {
      expect(Object.keys(GOVERNANCE_STATUS_CONFIG)).toEqual([
        "reviewed",
        "approved",
        "flagged",
        "suppressed",
        "accepted_risk",
      ]);
      expect(GOVERNANCE_STATUS_CONFIG.approved.label).toBe("Approved");
    });

    it("defines compliance category config for all categories", () => {
      expect(COMPLIANCE_CATEGORY_CONFIG.transparency.label).toBe("Transparency");
      expect(COMPLIANCE_CATEGORY_CONFIG.accountability.label).toBe("Accountability");
    });

    it("defines priority config for high/medium/low", () => {
      expect(PRIORITY_CONFIG.high.label).toBe("High");
      expect(PRIORITY_CONFIG.low.label).toBe("Low");
    });

    it("defines article descriptions", () => {
      expect(ARTICLE_DESCRIPTIONS["Article 9"]).toContain("Risk Management");
    });

    it("defines dimension chip colors for all dimensions", () => {
      expect(Object.keys(DIMENSION_CHIP_COLORS)).toEqual([
        "data_sovereignty",
        "transparency",
        "security",
        "autonomy",
        "supply_chain",
      ]);
    });

    it("defines vulnerability type labels", () => {
      expect(VULN_TYPE_LABELS.prompt_injection).toEqual({
        label: "Prompt injection",
        owaspId: "LLM01",
      });
    });
  });
});
