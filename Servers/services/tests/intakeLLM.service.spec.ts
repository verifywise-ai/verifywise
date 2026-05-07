/**
 * @fileoverview Intake LLM Service Tests
 *
 * Tests for generateSuggestedQuestions and generateFieldGuidance:
 * model resolution, prompt building, response parsing, key not found fallback.
 *
 * @module tests/intakeLLM.service
 */

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
}));

jest.mock("ai", () => ({
  generateText: jest.fn(),
}));

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: jest.fn().mockReturnValue(
    Object.assign(jest.fn().mockReturnValue("openai-model"), {
      chat: jest.fn().mockReturnValue("openai-chat-model"),
    }),
  ),
}));

jest.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: jest.fn().mockReturnValue(jest.fn().mockReturnValue("anthropic-model")),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import { generateSuggestedQuestions, generateFieldGuidance } from "../intakeLLM.service";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import { generateText } from "ai";

const mockGetLLMKeys = getLLMKeysWithKeyQuery as jest.MockedFunction<typeof getLLMKeysWithKeyQuery>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

describe("intakeLLM.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateSuggestedQuestions", () => {
    it("should return null when LLM key is not found", async () => {
      mockGetLLMKeys.mockResolvedValue([]);

      const result = await generateSuggestedQuestions("MODEL", "context", 1, 10);

      expect(result).toBeNull();
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should parse valid JSON array from LLM response", async () => {
      mockGetLLMKeys.mockResolvedValue([
        { id: 1, name: "OpenAI", key: "sk-test", model: "gpt-4o-mini" },
      ] as any);

      const questions = [
        {
          label: "What data does this model use?",
          fieldType: "textarea",
          category: "Risks",
          guidanceText: "Important for GDPR compliance",
        },
      ];

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify(questions),
      } as any);

      const result = await generateSuggestedQuestions("MODEL", "AI governance form", 1, 10);

      expect(result).toEqual(questions);
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("MODEL"),
          maxOutputTokens: 1000,
        }),
      );
    });

    it("should return null when LLM response has no JSON array", async () => {
      mockGetLLMKeys.mockResolvedValue([
        { id: 1, name: "OpenAI", key: "sk-test", model: "gpt-4o-mini" },
      ] as any);

      mockGenerateText.mockResolvedValue({
        text: "I cannot generate questions for this.",
      } as any);

      const result = await generateSuggestedQuestions("MODEL", "context", 1, 10);

      expect(result).toBeNull();
    });

    it("should return null on LLM error", async () => {
      mockGetLLMKeys.mockResolvedValue([
        { id: 1, name: "OpenAI", key: "sk-test", model: "gpt-4o-mini" },
      ] as any);

      mockGenerateText.mockRejectedValue(new Error("API timeout"));

      const result = await generateSuggestedQuestions("MODEL", "context", 1, 10);

      expect(result).toBeNull();
    });
  });

  describe("generateFieldGuidance", () => {
    it("should return null when LLM key is not found", async () => {
      mockGetLLMKeys.mockResolvedValue([]);

      const result = await generateFieldGuidance("Risk Level", "MODEL", 1, 10);

      expect(result).toBeNull();
    });

    it("should return trimmed guidance text", async () => {
      mockGetLLMKeys.mockResolvedValue([
        { id: 1, name: "OpenAI", key: "sk-test", model: "gpt-4o-mini" },
      ] as any);

      mockGenerateText.mockResolvedValue({
        text: "  Helps identify risk severity for compliance.  ",
      } as any);

      const result = await generateFieldGuidance("Risk Level", "MODEL", 1, 10);

      expect(result).toBe("Helps identify risk severity for compliance.");
    });

    it("should return null on error", async () => {
      mockGetLLMKeys.mockResolvedValue([
        { id: 1, name: "OpenAI", key: "sk-test", model: "gpt-4o-mini" },
      ] as any);

      mockGenerateText.mockRejectedValue(new Error("timeout"));

      const result = await generateFieldGuidance("Risk Level", "MODEL", 1, 10);

      expect(result).toBeNull();
    });
  });
});
