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

jest.mock("ai", () => ({ generateText: jest.fn() }));
jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: jest.fn(() => jest.fn(() => ({}))),
}));

import {
  calculateAndStoreRiskScore,
  calculateDimensionScores,
  effectiveLlmStatus,
  LLM_PENDING_STALE_MS,
} from "../riskScoring";
import {
  getAllFindingsForScoringQuery,
  getRiskScoringConfigQuery,
  updateScanRiskScoreQuery,
} from "../../../utils/aiDetectionRiskScoring.utils";
import type { FindingForScoring } from "../../../utils/aiDetectionRiskScoring.utils";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
import { generateText } from "ai";

const mockFindings = getAllFindingsForScoringQuery as jest.MockedFunction<
  typeof getAllFindingsForScoringQuery
>;
const mockConfig = getRiskScoringConfigQuery as jest.MockedFunction<
  typeof getRiskScoringConfigQuery
>;
const mockUpdate = updateScanRiskScoreQuery as jest.MockedFunction<typeof updateScanRiskScoreQuery>;
const mockKeys = getLLMKeysWithKeyQuery as jest.MockedFunction<typeof getLLMKeysWithKeyQuery>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

/** Let fire-and-forget promises settle */
const flushBackground = () => new Promise((resolve) => setImmediate(resolve));

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

  describe("calculateAndStoreRiskScore", () => {
    const ctx = { organizationId: 7, userId: 1 } as any;
    const finding = makeFinding({ finding_type: "secret", name: "OpenAI key" });
    const llmConfig = {
      id: 1,
      llm_enabled: true,
      llm_key_id: 3,
      dimension_weights: undefined,
    } as any;

    beforeEach(() => {
      jest.clearAllMocks();
      mockUpdate.mockResolvedValue(undefined);
      mockFindings.mockResolvedValue([finding]);
    });

    it("stores the rule-based score with LLM analysis off when no key is set", async () => {
      mockConfig.mockResolvedValue(null);

      const result = await calculateAndStoreRiskScore(1, "acme/repo", ctx);

      expect(result).not.toBeNull();
      expect(result!.details.llm_status).toBe("off");
      expect(result!.details.llm_enhanced).toBe(false);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      await flushBackground();
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("gives a perfect score with no findings and skips LLM analysis", async () => {
      mockFindings.mockResolvedValue([]);
      mockConfig.mockResolvedValue(llmConfig);

      const result = await calculateAndStoreRiskScore(1, "acme/repo", ctx);

      expect(result!.score).toBe(100);
      expect(result!.details.llm_status).toBe("off");
      await flushBackground();
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("returns the rule-based score at once and applies LLM analysis in the background", async () => {
      mockConfig.mockResolvedValue(llmConfig);
      mockKeys.mockResolvedValue([{ id: 3, name: "OpenAI", key: "k", model: "m" }] as any);
      let resolveLlm: (value: unknown) => void = () => {};
      mockGenerateText.mockReturnValue(
        new Promise((resolve) => {
          resolveLlm = resolve;
        }) as any,
      );

      const result = await calculateAndStoreRiskScore(1, "acme/repo", ctx);

      // Rule-based score stored and returned while the LLM call is still open
      expect(result!.details.llm_status).toBe("pending");
      const runId = result!.details.llm_run_id;
      expect(runId).toEqual(expect.any(String));
      expect(mockUpdate).toHaveBeenCalledTimes(1);

      resolveLlm({
        text: JSON.stringify({
          adjustments: { security: 5 },
          narrative: "Secret in code",
          recommendations: ["Rotate it"],
          correlations: [],
          suggested_risks: [],
        }),
      });
      await flushBackground();
      await flushBackground();

      expect(mockUpdate).toHaveBeenCalledTimes(2);
      const [, score, , details, orgId, guard] = mockUpdate.mock.calls[1];
      expect(details.llm_status).toBe("done");
      expect(details.llm_enhanced).toBe(true);
      expect(details.llm_narrative).toBe("Secret in code");
      expect(score).toBeLessThan(result!.score);
      expect(orgId).toBe(7);
      expect(guard).toBe(runId);
    });

    it("keeps the rule-based score and marks LLM analysis failed when it errors", async () => {
      mockConfig.mockResolvedValue(llmConfig);
      mockKeys.mockResolvedValue([{ id: 3, name: "OpenAI", key: "k", model: "m" }] as any);
      mockGenerateText.mockRejectedValue(new Error("provider down"));

      const result = await calculateAndStoreRiskScore(1, "acme/repo", ctx);
      await flushBackground();
      await flushBackground();

      expect(mockUpdate).toHaveBeenCalledTimes(2);
      const [, score, grade, details, , guard] = mockUpdate.mock.calls[1];
      expect(details.llm_status).toBe("failed");
      expect(score).toBe(result!.score);
      expect(grade).toBe(result!.grade);
      expect(guard).toBe(result!.details.llm_run_id);
    });

    it("returns null instead of throwing when the score cannot be stored", async () => {
      mockConfig.mockResolvedValue(null);
      mockUpdate.mockRejectedValue(new Error("db down"));

      await expect(calculateAndStoreRiskScore(1, "acme/repo", ctx)).resolves.toBeNull();
    });
  });

  describe("effectiveLlmStatus", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");

    it("keeps a recent pending analysis pending", () => {
      const started = new Date(now - 60_000);
      expect(effectiveLlmStatus("pending", started, now)).toBe("pending");
    });

    it("reports a stale pending analysis as failed", () => {
      const started = new Date(now - LLM_PENDING_STALE_MS - 1);
      expect(effectiveLlmStatus("pending", started, now)).toBe("failed");
    });

    it("leaves other states and missing timestamps alone", () => {
      expect(effectiveLlmStatus("done", new Date(0), now)).toBe("done");
      expect(effectiveLlmStatus(undefined, new Date(0), now)).toBeUndefined();
      expect(effectiveLlmStatus("pending", null, now)).toBe("pending");
    });
  });
});
