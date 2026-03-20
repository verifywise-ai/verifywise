/**
 * Shadow AI Model Extractor Service
 *
 * Extracts AI model names from URI paths using regex patterns
 * stored in the shadow_ai_model_patterns table.
 */

import { sequelize } from "../database/db";
import { IShadowAiModelPattern } from "../domain.layer/interfaces/i.shadowAi";
import logger from "../utils/logger/fileLogger";

let patternCache: IShadowAiModelPattern[] = [];
let patternCacheLastRefreshed = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load model patterns from the public schema.
 * Cached with a 5-minute TTL.
 */
export async function loadModelPatterns(): Promise<IShadowAiModelPattern[]> {
  const now = Date.now();
  if (patternCache.length > 0 && now - patternCacheLastRefreshed < CACHE_TTL_MS) {
    return patternCache;
  }

  const [rows] = await sequelize.query(
    `SELECT id, name, domain_pattern, path_regex
     FROM shadow_ai_model_patterns
     ORDER BY name`
  );

  patternCache = rows as IShadowAiModelPattern[];
  patternCacheLastRefreshed = now;
  return patternCache;
}

/**
 * Clear the pattern cache (useful after seeding/updates).
 */
export function clearModelPatternCache(): void {
  patternCache = [];
  patternCacheLastRefreshed = 0;
}

/**
 * Extract the model name from a destination + URI path combination.
 *
 * 1. Match destination against domain_pattern
 * 2. If match, apply path_regex to uri_path
 * 3. Return named capture group "model" if found
 *
 * Returns null if no pattern matches or no model can be extracted.
 */
export async function extractModel(
  destination: string,
  uriPath?: string
): Promise<string | null> {
  if (!uriPath) return null;

  const patterns = await loadModelPatterns();
  const normalizedDest = destination.toLowerCase();

  for (const pattern of patterns) {
    // Check if destination matches domain_pattern
    try {
      const domainRegex = new RegExp(pattern.domain_pattern, "i");
      if (!domainRegex.test(normalizedDest)) continue;

      // Apply path_regex to extract model name
      const pathRegex = new RegExp(pattern.path_regex, "i");
      const match = pathRegex.exec(uriPath);

      if (match?.groups?.model) {
        return match.groups.model;
      }
    } catch (error) {
      logger.warn(`Invalid regex pattern in model extractor (id=${pattern.id}):`, error);
      continue;
    }
  }

  return null;
}
