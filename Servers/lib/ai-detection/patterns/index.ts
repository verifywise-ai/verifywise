/**
 * @fileoverview AI Detection Patterns - Main Export
 * @module lib/ai-detection/patterns
 */

export * from "./cloud-providers";
export * from "./frameworks";
export * from "./local-ml";

import { CLOUD_PROVIDER_PATTERNS } from "./cloud-providers";
import { FRAMEWORK_PATTERNS } from "./frameworks";
import { LOCAL_ML_PATTERNS } from "./local-ml";
import type { DetectionPattern, PatternCategory } from "../types";

/**
 * All detection patterns organized by category
 */
export const PATTERN_CATEGORIES: PatternCategory[] = [
  {
    name: "Cloud AI Providers",
    patterns: CLOUD_PROVIDER_PATTERNS,
  },
  {
    name: "AI/ML Frameworks",
    patterns: FRAMEWORK_PATTERNS,
  },
  {
    name: "Local ML Libraries",
    patterns: LOCAL_ML_PATTERNS,
  },
];

/**
 * Flat list of all detection patterns
 */
export const ALL_PATTERNS: DetectionPattern[] = [
  ...CLOUD_PROVIDER_PATTERNS,
  ...FRAMEWORK_PATTERNS,
  ...LOCAL_ML_PATTERNS,
];

/**
 * Get patterns by provider name
 */
export function getPatternsByProvider(provider: string): DetectionPattern[] {
  return ALL_PATTERNS.filter((p) => p.provider.toLowerCase() === provider.toLowerCase());
}

/**
 * Get patterns that have secret detection
 */
export function getSecretPatterns(): DetectionPattern[] {
  return ALL_PATTERNS.filter((p) => p.patterns.secrets && p.patterns.secrets.length > 0);
}

/**
 * Get patterns that have API call detection
 */
export function getApiCallPatterns(): DetectionPattern[] {
  return ALL_PATTERNS.filter((p) => p.patterns.apiCalls && p.patterns.apiCalls.length > 0);
}
