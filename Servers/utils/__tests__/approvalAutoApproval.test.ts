/**
 * Unit tests for the risk-based auto-approval decision (evaluateAutoApproval).
 * Pure function — the module's heavy imports are mocked so no DB/Redis is
 * touched.
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../advisor/aiActions", () => ({ executeAiAction: jest.fn() }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));

import { evaluateAutoApproval } from "../approvalRequest.utils";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";

describe("evaluateAutoApproval", () => {
  describe("fail-closed cases", () => {
    it("is ineligible when no threshold is configured", () => {
      expect(
        evaluateAutoApproval(null, "use_case", AiRiskClassification.MINIMAL_RISK).eligible,
      ).toBe(false);
      expect(
        evaluateAutoApproval(undefined, "use_case", AiRiskClassification.MINIMAL_RISK).eligible,
      ).toBe(false);
    });

    it("is ineligible for an unsupported threshold value", () => {
      const result = evaluateAutoApproval("GPAI", "use_case", AiRiskClassification.MINIMAL_RISK);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("unsupported auto-approval threshold");
    });

    it("is ineligible for non-use_case entity types", () => {
      expect(
        evaluateAutoApproval("Limited risk", "vendor", AiRiskClassification.MINIMAL_RISK).eligible,
      ).toBe(false);
      expect(
        evaluateAutoApproval("Limited risk", undefined, AiRiskClassification.MINIMAL_RISK).eligible,
      ).toBe(false);
    });

    it("is ineligible when the risk classification is missing", () => {
      expect(evaluateAutoApproval("Prohibited", "use_case", null).eligible).toBe(false);
      expect(evaluateAutoApproval("Prohibited", "use_case", undefined).eligible).toBe(false);
      expect(evaluateAutoApproval("Prohibited", "use_case", "").eligible).toBe(false);
    });

    it.each(["GPAI", "General Risk", "bogus", "minimal risk"])(
      "is ineligible for unsupported or unrecognized classification %s",
      (risk) => {
        const result = evaluateAutoApproval("Prohibited", "use_case", risk);
        expect(result.eligible).toBe(false);
        expect(result.reason).toContain("not auto-approvable");
      },
    );
  });

  describe("ordered threshold semantics: Minimal < Limited < High < Prohibited", () => {
    it.each([
      [AiRiskClassification.MINIMAL_RISK, "Minimal risk"],
      [AiRiskClassification.MINIMAL_RISK, "Limited risk"],
      [AiRiskClassification.LIMITED_RISK, "Limited risk"],
      [AiRiskClassification.HIGH_RISK, "High risk"],
      [AiRiskClassification.LIMITED_RISK, "Prohibited"],
      [AiRiskClassification.PROHIBITED, "Prohibited"],
    ])("approves risk %s at-or-below threshold %s", (risk, threshold) => {
      const result = evaluateAutoApproval(threshold, "use_case", risk);
      expect(result.eligible).toBe(true);
      expect(result.reason).toContain("at or below threshold");
    });

    it.each([
      [AiRiskClassification.LIMITED_RISK, "Minimal risk"],
      [AiRiskClassification.HIGH_RISK, "Limited risk"],
      [AiRiskClassification.PROHIBITED, "High risk"],
    ])("rejects risk %s above threshold %s", (risk, threshold) => {
      expect(evaluateAutoApproval(threshold, "use_case", risk).eligible).toBe(false);
    });
  });
});
