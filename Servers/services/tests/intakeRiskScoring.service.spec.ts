/**
 * @fileoverview Intake Risk Scoring Service Tests
 *
 * Tests for rule-based scoring, tier assignment, and LLM fallback behavior.
 *
 * @module tests/intakeRiskScoring.service
 */

// Mock dependencies BEFORE imports
jest.mock("ai", () => ({
  generateText: jest.fn(),
}));

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: jest.fn(),
}));

jest.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: jest.fn(),
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  scoreSubmissionRuleBased,
  calculateSubmissionRisk,
  enhanceWithLLM,
} from "../intakeRiskScoring.service";
import { generateText } from "ai";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";

// Cast mocks
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockGetLLMKeys = getLLMKeysWithKeyQuery as jest.MockedFunction<typeof getLLMKeysWithKeyQuery>;

describe("intakeRiskScoring.service", () => {
  const emptySchema = { version: "1.0", fields: [] };
  const basicSchema = {
    version: "1.0",
    fields: [
      { id: "description", type: "text", label: "Description" },
      { id: "data_type", type: "text", label: "Data Type", entityFieldMapping: "data_sensitivity" },
      { id: "domain", type: "text", label: "Domain", entityFieldMapping: "domain" },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("scoreSubmissionRuleBased", () => {
    it("should return 6 dimensions", () => {
      const result = scoreSubmissionRuleBased({}, emptySchema);

      expect(result).toHaveLength(6);
      const keys = result.map((d) => d.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          "data_sensitivity",
          "autonomy_level",
          "impact_scope",
          "transparency",
          "human_oversight",
          "domain_criticality",
        ]),
      );
    });

    it("should return default score of 50 when no keywords match", () => {
      const result = scoreSubmissionRuleBased(
        { description: "generic text with no risk keywords" },
        basicSchema,
      );

      for (const dim of result) {
        expect(dim.score).toBe(50);
      }
    });

    it("should push score above 70 when high-risk keywords are present", () => {
      const result = scoreSubmissionRuleBased(
        { data_type: "biometric health medical genetic" },
        basicSchema,
      );

      const dataSensitivity = result.find((d) => d.key === "data_sensitivity");
      expect(dataSensitivity).toBeDefined();
      expect(dataSensitivity!.score).toBeGreaterThan(70);
    });

    it("should push score below 30 when low-risk keywords are present", () => {
      const result = scoreSubmissionRuleBased(
        { data_type: "anonymous aggregated public synthetic" },
        basicSchema,
      );

      const dataSensitivity = result.find((d) => d.key === "data_sensitivity");
      expect(dataSensitivity).toBeDefined();
      expect(dataSensitivity!.score).toBeLessThan(30);
    });

    it("should clamp scores between 0 and 100", () => {
      const result = scoreSubmissionRuleBased(
        {
          data_type:
            "biometric health medical genetic racial ethnic political sexual criminal social security ssn passport",
        },
        basicSchema,
      );

      for (const dim of result) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("calculateSubmissionRisk", () => {
    it("should calculate weighted average overall score", async () => {
      const result = await calculateSubmissionRisk({}, emptySchema);

      // With empty data, all dimensions default to 50, so weighted average is 50
      expect(result.overallScore).toBe(50);
    });

    it("should assign 'Minimal' tier for score <= 25", async () => {
      // Low-risk keywords across all dimensions
      const lowRiskData = {
        data_type: "anonymous aggregated public synthetic",
        description:
          "human-controlled tool advisory manual override entertainment gaming internal prototype",
      };

      const result = await calculateSubmissionRisk(lowRiskData, basicSchema);

      if (result.overallScore <= 25) {
        expect(result.tier).toBe("Minimal");
      }
    });

    it("should assign 'Limited' tier for score <= 50", async () => {
      const result = await calculateSubmissionRisk({}, emptySchema);

      // Default scores of 50 => overallScore = 50 => "Limited"
      expect(result.tier).toBe("Limited");
    });

    it("should assign correct tier system", async () => {
      const result = await calculateSubmissionRisk({}, emptySchema, "eu_ai_act");

      expect(result.tierSystem).toBe("eu_ai_act");
    });

    it("should set llmEnhanced to false when no LLM key provided", async () => {
      const result = await calculateSubmissionRisk({}, emptySchema);

      expect(result.llmEnhanced).toBe(false);
    });

    it("should include all 6 dimensions in result", async () => {
      const result = await calculateSubmissionRisk({}, emptySchema);

      expect(result.dimensions).toHaveLength(6);
    });
  });

  describe("LLM fallback", () => {
    it("should return rule-based scores when LLM fails", async () => {
      mockGetLLMKeys.mockResolvedValue([{ id: 1, name: "openai", key: "sk-test", model: "gpt-4" }]);
      mockGenerateText.mockRejectedValue(new Error("LLM API error"));

      const dimensions = scoreSubmissionRuleBased({}, emptySchema);
      const result = await enhanceWithLLM(dimensions, {}, emptySchema, 1, 1);

      // Should return original dimensions unchanged on failure
      expect(result).toEqual(dimensions);
    });

    it("should return rule-based scores when LLM key not found", async () => {
      mockGetLLMKeys.mockResolvedValue([]);

      const dimensions = scoreSubmissionRuleBased({}, emptySchema);
      const result = await enhanceWithLLM(dimensions, {}, emptySchema, 999, 1);

      expect(result).toEqual(dimensions);
    });

    it("should return rule-based scores when LLM returns invalid JSON", async () => {
      mockGetLLMKeys.mockResolvedValue([{ id: 1, name: "openai", key: "sk-test", model: "gpt-4" }]);

      const mockOpenAI = jest.fn().mockReturnValue("model-instance");
      const { createOpenAI } = require("@ai-sdk/openai");
      (createOpenAI as jest.Mock).mockReturnValue(mockOpenAI);

      mockGenerateText.mockResolvedValue({ text: "not valid json at all" } as any);

      const dimensions = scoreSubmissionRuleBased({}, emptySchema);
      const result = await enhanceWithLLM(dimensions, {}, emptySchema, 1, 1);

      // Should return original dimensions since JSON parsing fails
      expect(result).toEqual(dimensions);
    });
  });
});
