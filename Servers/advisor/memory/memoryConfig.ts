/**
 * Phase 3 — Agent Memory Configuration
 */

export const MEMORY_CONFIG = {
  /** Maximum messages to keep per session per agent */
  messageWindowSize: 50,

  /** Default TTL for working memory (minutes) */
  defaultWorkingMemoryTTL: 60,

  /** Cleanup interval for expired entries (ms) */
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes

  /** Maximum semantic memories per agent per org */
  maxSemanticMemories: 10_000,

  /** Retention policy (days) */
  messageRetentionDays: 30,
  workingMemoryRetentionDays: 7,
  semanticMemoryRetentionDays: 365,
};
