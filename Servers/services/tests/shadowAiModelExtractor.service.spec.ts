/**
 * @fileoverview Shadow AI Model Extractor Service Tests
 *
 * Tests for extractModel, pattern matching, cache, and error handling.
 *
 * @module tests/shadowAiModelExtractor.service
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import {
  extractModel,
  loadModelPatterns,
  clearModelPatternCache,
} from "../shadowAiModelExtractor.service";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("shadowAiModelExtractor.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearModelPatternCache();
  });

  // ==========================================================================
  // loadModelPatterns + cache
  // ==========================================================================

  describe("loadModelPatterns", () => {
    it("should load patterns from database", async () => {
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "OpenAI",
            domain_pattern: "api\\.openai\\.com",
            path_regex: "/v1/chat/completions/(?<model>[^/]+)",
          },
        ],
        [],
      ] as any);

      const result = await loadModelPatterns();
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("OpenAI");
    });

    it("should use cache on subsequent calls", async () => {
      mockQuery.mockResolvedValueOnce([
        [{ id: 1, name: "Test", domain_pattern: "test", path_regex: "test" }],
        [],
      ] as any);

      await loadModelPatterns();
      await loadModelPatterns();

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should refresh after clearModelPatternCache", async () => {
      mockQuery.mockResolvedValue([
        [{ id: 1, name: "Test", domain_pattern: "test", path_regex: "test" }],
        [],
      ] as any);

      await loadModelPatterns();
      clearModelPatternCache();
      await loadModelPatterns();

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // extractModel
  // ==========================================================================

  describe("extractModel", () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue([
        [
          {
            id: 1,
            name: "OpenAI",
            domain_pattern: "api\\.openai\\.com",
            path_regex: "/v1/chat/completions.*model=(?<model>[\\w-]+)",
          },
          {
            id: 2,
            name: "Anthropic",
            domain_pattern: "api\\.anthropic\\.com",
            path_regex: "/v1/messages.*model=(?<model>[\\w.-]+)",
          },
        ],
        [],
      ] as any);
    });

    it("should return null when uriPath is undefined", async () => {
      const result = await extractModel("api.openai.com", undefined);
      expect(result).toBeNull();
    });

    it("should return null when uriPath is empty", async () => {
      const result = await extractModel("api.openai.com", "");
      // empty string is falsy, so returns null
      expect(result).toBeNull();
    });

    it("should extract model when pattern matches", async () => {
      const result = await extractModel("api.openai.com", "/v1/chat/completions?model=gpt-4");
      expect(result).toBe("gpt-4");
    });

    it("should return null when domain does not match any pattern", async () => {
      const result = await extractModel("example.com", "/v1/chat/completions?model=gpt-4");
      expect(result).toBeNull();
    });

    it("should return null when path does not match pattern", async () => {
      const result = await extractModel("api.openai.com", "/v2/unknown/endpoint");
      expect(result).toBeNull();
    });

    it("should handle invalid regex patterns gracefully", async () => {
      clearModelPatternCache();
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Bad",
            domain_pattern: "bad\\.com",
            path_regex: "[invalid(regex",
          },
          {
            id: 2,
            name: "OpenAI",
            domain_pattern: "api\\.openai\\.com",
            path_regex: "/v1/chat/completions.*model=(?<model>[\\w-]+)",
          },
        ],
        [],
      ] as any);

      // Should skip bad pattern and continue to next
      const result = await extractModel("api.openai.com", "/v1/chat/completions?model=gpt-4");
      expect(result).toBe("gpt-4");
    });

    it("should match domain case-insensitively", async () => {
      const result = await extractModel("API.OPENAI.COM", "/v1/chat/completions?model=gpt-4");
      expect(result).toBe("gpt-4");
    });
  });
});
