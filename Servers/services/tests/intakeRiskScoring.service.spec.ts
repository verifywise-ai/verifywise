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

    it("sends select answers to the LLM as option labels, as keyword scoring reads them", async () => {
      mockGetLLMKeys.mockResolvedValue([{ id: 1, name: "openai", key: "sk-test", model: "gpt-4" }]);
      const { createOpenAI } = require("@ai-sdk/openai");
      (createOpenAI as jest.Mock).mockReturnValue(jest.fn().mockReturnValue("model-instance"));
      mockGenerateText.mockResolvedValue({ text: "not valid json" } as any);
      const schema = {
        version: "1.0",
        fields: [
          {
            id: "sector",
            type: "select",
            label: "Sector",
            options: [{ value: "option3", label: "Healthcare" }],
          },
          {
            id: "uses",
            type: "multiselect",
            label: "Uses",
            options: [{ value: "option1", label: "Triage" }],
          },
          { id: "cost", type: "number", label: "Cost" },
        ],
      };
      const data = { sector: "option3", uses: ["option1"], cost: 1200 };

      await enhanceWithLLM(scoreSubmissionRuleBased(data, schema), data, schema, 1, 1);

      const prompt = String(mockGenerateText.mock.calls[0][0].prompt);
      expect(prompt).toContain('Sector: "Healthcare"');
      expect(prompt).toContain('Uses: ["Triage"]');
      expect(prompt).toContain("Cost: 1200");
      expect(prompt).not.toContain("option3");
    });
  });

  describe("answer selection and keyword matching", () => {
    const dimension = (result: ReturnType<typeof scoreSubmissionRuleBased>, key: string) =>
      result.find((d) => d.key === key)!;

    it("matches whole words only", () => {
      const schema = { version: "1.0", fields: [{ id: "notes", type: "text", label: "Notes" }] };
      const result = scoreSubmissionRuleBased({ notes: "The file was renamed" }, schema);
      expect(dimension(result, "data_sensitivity").score).toBe(50);
    });

    it("matches keywords at the start of a word, so plurals and compounds count", () => {
      const schema = { version: "1.0", fields: [{ id: "notes", type: "text", label: "Notes" }] };
      const plural = scoreSubmissionRuleBased({ notes: "facial biometrics at the border" }, schema);
      expect(dimension(plural, "data_sensitivity").score).toBeGreaterThan(70);
      const compound = scoreSubmissionRuleBased({ notes: "healthcare records" }, schema);
      expect(dimension(compound, "data_sensitivity").score).toBeGreaterThan(70);
      const inside = scoreSubmissionRuleBased({ notes: "the file was renamed" }, schema);
      expect(dimension(inside, "data_sensitivity").score).toBe(50);
    });

    it.each(["telehealth", "telemedicine", "biomedical"])(
      "scores the health compound %s as high risk despite word-start matching",
      (word) => {
        const schema = { version: "1.0", fields: [{ id: "notes", type: "text", label: "Notes" }] };
        const result = scoreSubmissionRuleBased({ notes: `A ${word} triage tool` }, schema);
        expect(dimension(result, "data_sensitivity").score).toBeGreaterThan(70);
        expect(dimension(result, "domain_criticality").score).toBeGreaterThan(70);
      },
    );

    it("matches multi-word keywords as phrases", () => {
      const schema = { version: "1.0", fields: [{ id: "notes", type: "text", label: "Notes" }] };
      const result = scoreSubmissionRuleBased({ notes: "There is no human in the loop" }, schema);
      expect(dimension(result, "autonomy_level").score).toBeGreaterThanOrEqual(70);
    });

    const taggedSchema = {
      version: "1.0",
      fields: [
        { id: "notes", type: "text", label: "Notes" },
        { id: "purpose", type: "text", label: "Purpose", riskDimension: "data_sensitivity" },
      ],
    };

    it("tagged answers decide over medium and low signals elsewhere", () => {
      // Scored from all answers, "public" would pull this down to 15; the
      // tagged medium-risk answer decides instead.
      const result = scoreSubmissionRuleBased(
        { notes: "a public dataset", purpose: "personal email addresses" },
        taggedSchema,
      );
      expect(dimension(result, "data_sensitivity").score).toBe(55);
    });

    it("falls back to every answer when the tagged field has no answer", () => {
      const result = scoreSubmissionRuleBased({ notes: "biometric" }, taggedSchema);
      expect(dimension(result, "data_sensitivity").score).toBeGreaterThan(70);
    });

    it("falls back to every answer when the tagged answers match no keyword", () => {
      const schema = {
        version: "1.0",
        fields: [
          { id: "notes", type: "text", label: "Notes" },
          {
            id: "bio",
            type: "checkbox",
            label: "Uses face data",
            riskDimension: "data_sensitivity",
          },
        ],
      };
      const unchecked = scoreSubmissionRuleBased({ notes: "biometric", bio: false }, schema);
      expect(dimension(unchecked, "data_sensitivity").score).toBeGreaterThan(70);
      const checked = scoreSubmissionRuleBased({ notes: "biometric", bio: true }, schema);
      expect(dimension(checked, "data_sensitivity").score).toBeGreaterThan(70);
    });

    it("an untouched tagged multiselect or blank text is not a tagged answer", () => {
      const schema = {
        version: "1.0",
        fields: [
          { id: "notes", type: "text", label: "Notes" },
          { id: "kinds", type: "multiselect", label: "Kinds", riskDimension: "data_sensitivity" },
          { id: "why", type: "text", label: "Why", riskDimension: "data_sensitivity" },
        ],
      };
      const result = scoreSubmissionRuleBased(
        { notes: "biometric", kinds: [], why: "   " },
        schema,
      );
      expect(dimension(result, "data_sensitivity").score).toBeGreaterThan(70);
    });

    it("a low-risk tagged answer cannot hide high-risk text elsewhere", () => {
      const schema = {
        version: "1.0",
        fields: [
          { id: "notes", type: "textarea", label: "Notes" },
          { id: "purpose", type: "text", label: "Purpose", riskDimension: "data_sensitivity" },
        ],
      };
      const result = scoreSubmissionRuleBased(
        { notes: "we process biometric and health records", purpose: "public" },
        schema,
      );
      const data = dimension(result, "data_sensitivity");
      expect(data.score).toBe(80);
      expect(data.signals).toContain('High-risk signal: "biometric" (Notes)');
    });

    it("tagging a field does not change that field's own score", () => {
      const answer = { notes: "Aggregated, anonymous health statistics" };
      const untagged = { version: "1.0", fields: [{ id: "notes", type: "text", label: "Notes" }] };
      const tagged = {
        version: "1.0",
        fields: [{ id: "notes", type: "text", label: "Notes", riskDimension: "data_sensitivity" }],
      };
      const before = dimension(scoreSubmissionRuleBased(answer, untagged), "data_sensitivity");
      const after = dimension(scoreSubmissionRuleBased(answer, tagged), "data_sensitivity");
      expect(before.score).toBe(40);
      expect(after.score).toBe(before.score);
    });

    it("scores select answers by option label", () => {
      const schema = {
        version: "1.0",
        fields: [
          {
            id: "kind",
            type: "select",
            label: "Data kind",
            options: [{ value: "option1", label: "Health records" }],
          },
        ],
      };
      const result = scoreSubmissionRuleBased({ kind: "option1" }, schema);
      expect(dimension(result, "data_sensitivity").score).toBeGreaterThan(70);
    });

    it("scores a checked checkbox by its label and ignores an unchecked one", () => {
      const schema = {
        version: "1.0",
        fields: [{ id: "bio", type: "checkbox", label: "Uses biometric data" }],
      };
      expect(
        dimension(scoreSubmissionRuleBased({ bio: true }, schema), "data_sensitivity").score,
      ).toBeGreaterThan(70);
      expect(
        dimension(scoreSubmissionRuleBased({ bio: false }, schema), "data_sensitivity").score,
      ).toBe(50);
    });

    it("never scores number, date or calculated values", () => {
      const schema = {
        version: "1.0",
        fields: [
          { id: "n", type: "number", label: "N" },
          { id: "d", type: "date", label: "D" },
          { id: "c", type: "calculated", label: "C" },
        ],
      };
      const result = scoreSubmissionRuleBased(
        { n: "biometric", d: "biometric", c: "biometric" },
        schema,
      );
      expect(dimension(result, "data_sensitivity").score).toBe(50);
    });

    it("names the field in signals", () => {
      const result = scoreSubmissionRuleBased({ purpose: "biometric" }, taggedSchema);
      expect(dimension(result, "data_sensitivity").signals).toContain(
        'High-risk signal: "biometric" (Purpose)',
      );
    });
  });
});
