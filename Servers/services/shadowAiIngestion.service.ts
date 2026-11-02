/**
 * Shadow AI Ingestion Service
 *
 * Shared by the REST ingestion controller and the syslog listener. Takes
 * validated events for one organization, runs them through the tool matcher
 * and model extractor, stores them and starts alert rule evaluation.
 * Free of `req`: callable from a socket handler.
 */

import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import logger from "../utils/logger/fileLogger";
import { normalizeEvent, insertEventsQuery } from "../utils/shadowAiIngestion.utils";
import { eventRowFitsColumns, SHADOW_AI_EVENT_LIMITS } from "../utils/shadowAiEventLimits";
import { matchDomain, ensureTenantTool, updateToolCounters } from "./shadowAiToolMatcher.service";
import { extractModel } from "./shadowAiModelExtractor.service";
import { evaluateRulesForBatch } from "./shadowAiAlertNotification.service";
import { ShadowAiIngestionRequest } from "../domain.layer/interfaces/i.shadowAi";
import { getSettingsQuery } from "../utils/shadowAiConfig.utils";

// ─── In-memory sliding window rate limiter ─────────────────────────────
// Tracks event counts per tenant per hour window. Resets every hour.
type RateLimitBucket = { count: number; windowStart: number };
const rateLimitBuckets = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
let lastCleanup = Date.now();

/**
 * Count the batch against the tenant's window. Returns the bucket it was
 * counted in, null when no limit applies, or false when it would exceed it.
 */
function checkRateLimit(
  tenant: string,
  maxPerHour: number,
  batchSize: number,
): RateLimitBucket | null | false {
  if (maxPerHour <= 0) return null; // 0 = no limit

  const now = Date.now();

  // Prune expired buckets periodically (every 10 minutes)
  if (now - lastCleanup > 10 * 60 * 1000) {
    for (const [key, b] of rateLimitBuckets) {
      if (now - b.windowStart >= RATE_LIMIT_WINDOW_MS) {
        rateLimitBuckets.delete(key);
      }
    }
    lastCleanup = now;
  }

  const bucket = rateLimitBuckets.get(tenant);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // New window — only set count if within limit
    if (batchSize > maxPerHour) return false;
    const fresh = { count: batchSize, windowStart: now };
    rateLimitBuckets.set(tenant, fresh);
    return fresh;
  }

  if (bucket.count + batchSize > maxPerHour) {
    return false;
  }

  bucket.count += batchSize;
  return bucket;
}

// Optional short cache of each organization's limit, for callers that check
// often (the syslog listener flushes every 2 s per source).
const rateLimitSettingsCache = new Map<number, { maxPerHour: number; expiresAt: number }>();
const RATE_LIMIT_SETTINGS_CACHE_MAX = 10_000;

async function readMaxPerHour(organizationId: number, settingsMaxAgeMs: number): Promise<number> {
  const now = Date.now();
  if (settingsMaxAgeMs > 0) {
    const cached = rateLimitSettingsCache.get(organizationId);
    if (cached && cached.expiresAt > now) return cached.maxPerHour;
  }
  const maxPerHour = (await getSettingsQuery(organizationId)).rate_limit_max_events_per_hour;
  if (settingsMaxAgeMs > 0) {
    if (rateLimitSettingsCache.size >= RATE_LIMIT_SETTINGS_CACHE_MAX) {
      for (const [id, entry] of rateLimitSettingsCache) {
        if (entry.expiresAt <= now) rateLimitSettingsCache.delete(id);
      }
      if (rateLimitSettingsCache.size >= RATE_LIMIT_SETTINGS_CACHE_MAX) {
        rateLimitSettingsCache.clear();
      }
    }
    rateLimitSettingsCache.set(organizationId, {
      maxPerHour,
      expiresAt: now + settingsMaxAgeMs,
    });
  }
  return maxPerHour;
}

export interface ShadowAiRateLimitResult {
  allowed: boolean;
  /** The limit the batch was checked against; 0 = no limit (or settings unreadable). */
  maxPerHour: number;
  /**
   * Give back events that were counted but not stored (e.g. the write rolled
   * back). Never returns more than this batch counted, and does nothing once
   * the hour window has moved on.
   */
  refund: (count: number) => void;
}

const NO_REFUND = () => {};

/**
 * Check the organization's hourly event limit and count this batch against it.
 * `allowed` is false when the batch would exceed the limit. If settings cannot
 * be read (e.g. table missing), the batch is allowed.
 *
 * `settingsMaxAgeMs` lets a frequent caller reuse the limit it read up to that
 * long ago; the default 0 reads settings every time.
 */
export async function checkShadowAiRateLimit(
  organizationId: number,
  batchSize: number,
  options?: { settingsMaxAgeMs?: number },
): Promise<ShadowAiRateLimitResult> {
  let maxPerHour: number;
  try {
    maxPerHour = await readMaxPerHour(organizationId, options?.settingsMaxAgeMs ?? 0);
  } catch (error) {
    // If settings table doesn't exist yet, skip rate limiting
    logger.debug("Rate limit check skipped (settings unavailable)");
    return { allowed: true, maxPerHour: 0, refund: NO_REFUND };
  }
  const tenant = String(organizationId);
  const bucket = checkRateLimit(tenant, maxPerHour, batchSize);
  if (bucket === false) return { allowed: false, maxPerHour, refund: NO_REFUND };
  if (bucket === null) return { allowed: true, maxPerHour, refund: NO_REFUND };

  let refundable = batchSize;
  const refund = (count: number) => {
    // A new window replaced the bucket: these events count against nothing now.
    if (rateLimitBuckets.get(tenant) !== bucket) return;
    const amount = Math.min(Math.max(0, Math.floor(count)), refundable, bucket.count);
    bucket.count -= amount;
    refundable -= amount;
  };
  return { allowed: true, maxPerHour, refund };
}

/**
 * Store a batch of already-validated events for one organization.
 *
 * Without `options.transaction` the service opens its own transaction, commits
 * it, then starts rule evaluation without awaiting it. With an external
 * transaction the caller owns commit/rollback and rule evaluation is deferred
 * to `afterCommit`, so rules never see uncommitted rows.
 *
 * A uri_path longer than SHADOW_AI_EVENT_LIMITS.uri_path is left out (stored
 * as null) on both paths; the row itself is kept.
 *
 * Every row is checked against the column widths before anything is written,
 * because one row that does not fit fails the whole multi-row INSERT. With
 * `options.skipInvalidRows` (the syslog listener) such rows are left out and
 * counted in `skipped`; without it (REST) the batch is refused with an error,
 * as an over-long field already failed it before this check existed.
 *
 * Errors propagate to the caller (an owned transaction is rolled back first).
 */
export async function ingestShadowAiEvents(
  organizationId: number,
  events: ShadowAiIngestionRequest["events"],
  options?: { transaction?: Transaction; skipInvalidRows?: boolean },
): Promise<{ ingested: number; toolsMatched: number; skipped: number }> {
  const externalTransaction = options?.transaction;
  const transaction = externalTransaction ?? (await sequelize.transaction());

  try {
    // Track tool stats for batch counter updates
    const toolEventCounts = new Map<number, number>();
    const toolUserSets = new Map<number, Set<string>>();

    // Track data for rule evaluation
    const newToolIds = new Set<number>();
    const newToolNames = new Map<number, string>();
    const toolDepartments = new Map<number, Set<string>>();
    const toolEmails = new Map<number, Set<string>>();
    const blockedAttempts: { toolId: number; toolName: string; userEmail: string }[] = [];
    const allDepartments = new Set<string>();
    const allEmails = new Set<string>();

    // Normalize all events first. uri_path is a TEXT column with no width:
    // an over-long one is left out, as the syslog parser does, rather than
    // costing the row.
    const allNormalized = events.map((event) => {
      const normalized = normalizeEvent(event);
      if (
        normalized.uri_path !== undefined &&
        [...normalized.uri_path].length > SHADOW_AI_EVENT_LIMITS.uri_path
      ) {
        normalized.uri_path = undefined;
      }
      return normalized;
    });

    // Step 1: Parallelize domain matching and model extraction
    // matchDomain and extractModel are read-only lookups (no DB writes)
    const allMatches = await Promise.all(
      allNormalized.map(async (normalized) => {
        const [registryMatch, model] = await Promise.all([
          matchDomain(normalized.destination),
          normalized.uri_path
            ? extractModel(normalized.destination, normalized.uri_path)
            : Promise.resolve(null),
        ]);
        return { registryMatch, model };
      }),
    );

    // Drop rows that cannot be stored before any tool, counter or rule work.
    const fits = allNormalized.map((normalized, i) =>
      eventRowFitsColumns({ ...normalized, detected_model: allMatches[i].model ?? undefined }),
    );
    const skipped = fits.filter((ok) => !ok).length;
    if (skipped > 0 && !options?.skipInvalidRows) {
      throw new Error(`${skipped} Shadow AI events have a field that is too long or invalid`);
    }
    const normalizedEvents = allNormalized.filter((_, i) => fits[i]);
    const matchResults = allMatches.filter((_, i) => fits[i]);

    // Step 2: Process results sequentially (ensureTenantTool does DB writes)
    const processedEvents: Array<{
      user_email: string;
      destination: string;
      uri_path?: string;
      http_method?: string;
      action: string;
      detected_tool_id?: number;
      detected_model?: string;
      event_timestamp: Date;
      department?: string;
      job_title?: string;
      manager_email?: string;
    }> = [];

    for (let i = 0; i < normalizedEvents.length; i++) {
      const normalized = normalizedEvents[i];
      const { registryMatch, model } = matchResults[i];

      let detectedToolId: number | undefined;

      if (registryMatch) {
        // Only AI usage counts for the user and department rules.
        allEmails.add(normalized.user_email);
        if (normalized.department) allDepartments.add(normalized.department);
        const { id: toolId, isNew } = await ensureTenantTool(
          organizationId,
          registryMatch,
          transaction,
        );
        detectedToolId = toolId;

        if (isNew) {
          newToolIds.add(toolId);
          newToolNames.set(toolId, registryMatch.name);
        }

        toolEventCounts.set(toolId, (toolEventCounts.get(toolId) || 0) + 1);
        if (!toolUserSets.has(toolId)) {
          toolUserSets.set(toolId, new Set());
        }
        toolUserSets.get(toolId)!.add(normalized.user_email);

        // Track departments and emails per tool for rule evaluation
        if (normalized.department) {
          if (!toolDepartments.has(toolId)) toolDepartments.set(toolId, new Set());
          toolDepartments.get(toolId)!.add(normalized.department);
        }
        if (!toolEmails.has(toolId)) toolEmails.set(toolId, new Set());
        toolEmails.get(toolId)!.add(normalized.user_email);

        // Track blocked attempts
        if (normalized.action === "blocked") {
          blockedAttempts.push({
            toolId,
            toolName: registryMatch.name,
            userEmail: normalized.user_email,
          });
        }
      }

      processedEvents.push({
        user_email: normalized.user_email,
        destination: normalized.destination,
        uri_path: normalized.uri_path,
        http_method: normalized.http_method,
        action: normalized.action,
        detected_tool_id: detectedToolId,
        detected_model: model || undefined,
        event_timestamp: normalized.event_timestamp,
        department: normalized.department,
        job_title: normalized.job_title,
        manager_email: normalized.manager_email,
      });
    }

    // Batch insert all events
    const { inserted: insertedCount, firstEventId } = await insertEventsQuery(
      organizationId,
      processedEvents,
      transaction,
    );

    // Update tool counters
    for (const [toolId, count] of toolEventCounts.entries()) {
      await updateToolCounters(
        organizationId,
        toolId,
        count,
        toolUserSets.get(toolId) || new Set(),
        transaction,
      );
    }

    // Evaluate alert rules asynchronously (don't block the caller)
    const startRuleEvaluation = () => {
      evaluateRulesForBatch(organizationId, {
        newToolIds,
        newToolNames,
        toolEventCounts,
        toolDepartments,
        toolEmails,
        blockedAttempts,
        allDepartments,
        allEmails,
        firstEventId,
      }).catch((err) => {
        logger.error("Rule evaluation failed:", err);
      });
    };

    if (externalTransaction) {
      // The caller commits; rules must not see uncommitted rows.
      externalTransaction.afterCommit(startRuleEvaluation);
    } else {
      await transaction.commit();
      logger.debug(
        `✅ Ingested ${insertedCount} shadow AI events for organization ${organizationId}`,
      );
      startRuleEvaluation();
    }

    return { ingested: insertedCount, toolsMatched: toolEventCounts.size, skipped };
  } catch (error) {
    if (!externalTransaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        logger.error("❌ Shadow AI ingestion rollback failed:", rollbackError);
      }
    }
    throw error;
  }
}
