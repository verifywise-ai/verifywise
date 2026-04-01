/**
 * @fileoverview Cache Utility Functions
 *
 * Provides Redis-based caching utilities for performance optimization.
 * Includes cache-aside pattern with automatic serialization/deserialization.
 *
 * @module utils/cache
 */

import redisClient from "../database/redis";

// Default cache TTL in seconds (5 minutes)
const DEFAULT_CACHE_TTL = 300;

/**
 * Cache key prefixes for different data types
 */
export const CACHE_KEYS = {
  AI_DETECTION_STATS: "ai_detection:stats",
} as const;

/**
 * Get a value from cache
 *
 * @param key - Cache key
 * @returns Cached value or null if not found
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (error) {
    // Log error but don't throw - cache failures should not break the application
    console.error(`[Cache] Error reading from cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 *
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttlSeconds - Time to live in seconds (default: 300)
 */
export async function setInCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_CACHE_TTL
): Promise<void> {
  try {
    await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    // Log error but don't throw - cache failures should not break the application
    console.error(`[Cache] Error writing to cache for key ${key}:`, error);
  }
}

/**
 * Delete a value from cache
 *
 * @param key - Cache key
 */
export async function deleteFromCache(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`[Cache] Error deleting from cache for key ${key}:`, error);
  }
}

/**
 * Delete all keys matching a pattern
 *
 * @param pattern - Key pattern (e.g., "ai_detection:stats:*")
 */
export async function deleteByPattern(pattern: string): Promise<void> {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch (error) {
    console.error(`[Cache] Error deleting keys matching pattern ${pattern}:`, error);
  }
}

/**
 * Cache-aside pattern: Get from cache or compute and cache
 *
 * @param key - Cache key
 * @param computeFn - Function to compute the value if not cached
 * @param ttlSeconds - Time to live in seconds (default: 300)
 * @returns Cached or computed value
 */
export async function cacheAside<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_CACHE_TTL
): Promise<T> {
  // Try to get from cache first
  const cached = await getFromCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Compute the value
  const value = await computeFn();

  // Store in cache (non-blocking)
  setInCache(key, value, ttlSeconds).catch(() => {
    // Silently ignore cache write errors
  });

  return value;
}

/**
 * Build an organization-specific cache key
 *
 * @param prefix - Cache key prefix
 * @param organizationId - Organization identifier
 * @returns Full cache key
 */
export function buildOrgCacheKey(prefix: string, organizationId: number): string {
  return `${prefix}:org_${organizationId}`;
}

/**
 * Build a tenant-specific cache key (DEPRECATED)
 * @deprecated Use buildOrgCacheKey instead for shared-schema multi-tenancy
 *
 * @param prefix - Cache key prefix
 * @param tenantId - Tenant identifier
 * @returns Full cache key
 */
export function buildTenantCacheKey(prefix: string, tenantId: string): string {
  return `${prefix}:${tenantId}`;
}
