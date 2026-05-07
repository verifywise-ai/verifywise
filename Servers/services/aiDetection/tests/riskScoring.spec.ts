/**
 * @fileoverview Risk Scoring Tests
 *
 * Tests for calculateDimensionScores: empty findings, secret penalties,
 * severity multipliers, diminishing returns, and 85-point cap.
 *
 * @module tests/riskScoring
 */

// Mock dependencies BEFORE imports
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

jest.mock("../../../utils/aiDetectionRiskScoring.utils");
jest.mock("../../../utils/llmKey.utils");

import { calculateDimensionScores } from "../riskScoring";
import type { FindingForScoring } from "../../../utils/aiDetectionRiskScoring.utils";

/** Helper to create a FindingForScoring with required defaults */
function makeFinding(
  overrides: Partial<FindingForScoring> & { finding_type: string; name: string },
): FindingForScoring {
  return {
    id: 1,
    governance_status: null,
    category: "test",
    file_count: 1,
    provider: null,
    confidence: "high",
    risk_level: "high",
    license_risk: null,
    ...overrides,
  };
}

describe("riskScoring", () => {
  describe("calculateDimensionScores", () => {
    it("should return all dimensions at 100 for empty findings", () => {
      const scores = calculateDimensionScores([]);

      for (const key of Object.keys(scores)) {
        expect(scores[key as keyof typeof scores].score).toBe(100);
        expect(scores[key as keyof typeof scores].penalty_count).toBe(0);
        expect(scores[key as keyof typeof scores].top_contributors).toEqual([]);
      }
    });

    it("should penalize security dimension for secret findings", () => {
      const findings = [makeFinding({ finding_type: "secret", name: "AWS Key" })];

      const scores = calculateDimensionScores(findings);

      expect(scores.security.score).toBeLessThan(100);
      expect(scores.security.penalty_count).toBeGreaterThanOrEqual(1);
    });

    it("should apply confidence multiplier to penalties", () => {
      const highConf = [makeFinding({ finding_type: "secret", name: "Key", confidence: "high" })];
      const lowConf = [makeFinding({ finding_type: "secret", name: "Key", confidence: "low" })];

      const highScores = calculateDimensionScores(highConf);
      const lowScores = calculateDimensionScores(lowConf);

      // High confidence should result in more penalty (lower score)
      expect(highScores.security.score).toBeLessThan(lowScores.security.score);
    });

    it("should apply risk level multiplier to penalties", () => {
      const highRisk = [makeFinding({ finding_type: "secret", name: "Key", risk_level: "high" })];
      const lowRisk = [makeFinding({ finding_type: "secret", name: "Key", risk_level: "low" })];

      const highScores = calculateDimensionScores(highRisk);
      const lowScores = calculateDimensionScores(lowRisk);

      expect(highScores.security.score).toBeLessThan(lowScores.security.score);
    });

    it("should apply diminishing returns for many findings", () => {
      const singleFinding = [makeFinding({ finding_type: "secret", name: "Key1" })];
      const manyFindings = Array.from({ length: 20 }, (_, i) =>
        makeFinding({ id: i, finding_type: "secret", name: `Key${i}` }),
      );

      const singleScores = calculateDimensionScores(singleFinding);
      const manyScores = calculateDimensionScores(manyFindings);

      const singlePenalty = 100 - singleScores.security.score;
      const manyPenalty = 100 - manyScores.security.score;

      expect(manyPenalty).toBeGreaterThan(singlePenalty);
      expect(manyPenalty).toBeLessThan(singlePenalty * 20);
    });

    it("should cap penalty at 85 points per dimension", () => {
      const findings = Array.from({ length: 100 }, (_, i) =>
        makeFinding({ id: i, finding_type: "secret", name: `Key${i}` }),
      );

      const scores = calculateDimensionScores(findings);

      // Score should be at least 15 (100 - 85 cap)
      expect(scores.security.score).toBeGreaterThanOrEqual(15);
    });

    it("should not penalize dimensions for low-risk inventory items", () => {
      const findings = [
        makeFinding({ finding_type: "library", name: "lodash", risk_level: "low" }),
      ];

      const scores = calculateDimensionScores(findings);

      expect(scores.transparency.score).toBe(100);
      expect(scores.supply_chain.score).toBe(100);
    });

    it("should penalize dimensions for high-risk inventory items", () => {
      const findings = [
        makeFinding({ finding_type: "library", name: "risky-lib", risk_level: "high" }),
      ];

      const scores = calculateDimensionScores(findings);

      expect(scores.transparency.score).toBeLessThan(100);
      expect(scores.supply_chain.score).toBeLessThan(100);
    });

    it("should track top 3 contributors per dimension", () => {
      const findings = Array.from({ length: 5 }, (_, i) =>
        makeFinding({ id: i, finding_type: "secret", name: `Secret${i}` }),
      );

      const scores = calculateDimensionScores(findings);
      expect(scores.security.top_contributors.length).toBeLessThanOrEqual(3);
    });

    it("should include provider in contributor label when present", () => {
      const findings = [
        makeFinding({ finding_type: "api_call", name: "GPT API", provider: "OpenAI" }),
      ];

      const scores = calculateDimensionScores(findings);

      const allContributors = Object.values(scores).flatMap((d) => d.top_contributors);
      const hasProvider = allContributors.some((c) => c.includes("(OpenAI)"));
      expect(hasProvider).toBe(true);
    });

    it("should map prompt_injection to security and data_sovereignty", () => {
      const findings = [makeFinding({ finding_type: "prompt_injection", name: "Injection" })];

      const scores = calculateDimensionScores(findings);

      expect(scores.security.penalty_count).toBeGreaterThanOrEqual(1);
      expect(scores.data_sovereignty.penalty_count).toBeGreaterThanOrEqual(1);
    });
  });
});
