/**
 * @fileoverview Shadow AI Tool Matcher Service Tests
 *
 * Tests for matchDomain, cache TTL, ensureTenantTool, and updateToolCounters.
 *
 * @module tests/shadowAiToolMatcher.service
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import {
  matchDomain,
  ensureTenantTool,
  updateToolCounters,
  loadToolRegistry,
  clearToolRegistryCache,
} from "../shadowAiToolMatcher.service";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("shadowAiToolMatcher.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearToolRegistryCache();
  });

  // ==========================================================================
  // loadToolRegistry + cache
  // ==========================================================================

  describe("loadToolRegistry", () => {
    it("should load registry from database", async () => {
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "ChatGPT",
            vendor: "OpenAI",
            domains: ["chat.openai.com", "chatgpt.com"],
            category: "Chat",
            models: ["gpt-4"],
            trains_on_data: true,
            soc2_certified: true,
            gdpr_compliant: true,
          },
        ],
        [],
      ] as any);

      const result = await loadToolRegistry();
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("ChatGPT");
    });

    it("should use cache on subsequent calls within TTL", async () => {
      mockQuery.mockResolvedValueOnce([
        [{ id: 1, name: "Tool", vendor: "V", domains: ["d.com"], models: [] }],
        [],
      ] as any);

      await loadToolRegistry();
      await loadToolRegistry();

      // Only called once due to cache
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache after clearToolRegistryCache", async () => {
      mockQuery.mockResolvedValue([
        [{ id: 1, name: "Tool", vendor: "V", domains: ["d.com"], models: [] }],
        [],
      ] as any);

      await loadToolRegistry();
      clearToolRegistryCache();
      await loadToolRegistry();

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // matchDomain
  // ==========================================================================

  describe("matchDomain", () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue([
        [
          {
            id: 1,
            name: "ChatGPT",
            vendor: "OpenAI",
            domains: ["chat.openai.com", "chatgpt.com"],
            models: [],
          },
          {
            id: 2,
            name: "Claude",
            vendor: "Anthropic",
            domains: ["claude.ai"],
            models: [],
          },
        ],
        [],
      ] as any);
    });

    it("should match exact domain", async () => {
      const result = await matchDomain("chat.openai.com");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("ChatGPT");
    });

    it("should match subdomain", async () => {
      const result = await matchDomain("api.claude.ai");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Claude");
    });

    it("should strip www prefix", async () => {
      const result = await matchDomain("www.chatgpt.com");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("ChatGPT");
    });

    it("should match case-insensitively", async () => {
      const result = await matchDomain("CHAT.OPENAI.COM");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("ChatGPT");
    });

    it("should return null for non-matching domain", async () => {
      const result = await matchDomain("example.com");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // ensureTenantTool
  // ==========================================================================

  describe("ensureTenantTool", () => {
    const registryEntry = {
      id: 1,
      name: "ChatGPT",
      vendor: "OpenAI",
      domains: ["chat.openai.com"],
      models: [],
      trains_on_data: true,
      soc2_certified: true,
      gdpr_compliant: true,
    } as any;

    it("should create new tenant tool when not existing", async () => {
      // SELECT check - not found
      mockQuery.mockResolvedValueOnce([[], []] as any);
      // INSERT RETURNING id
      mockQuery.mockResolvedValueOnce([[{ id: 42 }], []] as any);

      const result = await ensureTenantTool(1, registryEntry);

      expect(result).toEqual({ id: 42, isNew: true });
    });

    it("should return existing tool as not new", async () => {
      // SELECT check - found
      mockQuery.mockResolvedValueOnce([[{ id: 42 }], []] as any);
      // INSERT ON CONFLICT RETURNING id
      mockQuery.mockResolvedValueOnce([[{ id: 42 }], []] as any);

      const result = await ensureTenantTool(1, registryEntry);

      expect(result).toEqual({ id: 42, isNew: false });
    });

    it("should pass transaction when provided", async () => {
      const tx = { id: "tx-1" };
      mockQuery.mockResolvedValueOnce([[], []] as any);
      mockQuery.mockResolvedValueOnce([[{ id: 1 }], []] as any);

      await ensureTenantTool(1, registryEntry, tx);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ transaction: tx }),
      );
    });
  });

  // ==========================================================================
  // updateToolCounters
  // ==========================================================================

  describe("updateToolCounters", () => {
    it("should update counters with event count and unique user count", async () => {
      mockQuery.mockResolvedValueOnce([[], []] as any);

      const emails = new Set(["a@b.com", "c@d.com"]);
      await updateToolCounters(1, 42, 10, emails);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE shadow_ai_tools"),
        expect.objectContaining({
          replacements: {
            organizationId: 1,
            toolId: 42,
            eventCount: 10,
            uniqueUserCount: 2,
          },
        }),
      );
    });

    it("should pass transaction when provided", async () => {
      const tx = { id: "tx-1" };
      mockQuery.mockResolvedValueOnce([[], []] as any);

      await updateToolCounters(1, 42, 5, new Set(), tx);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ transaction: tx }),
      );
    });
  });
});
