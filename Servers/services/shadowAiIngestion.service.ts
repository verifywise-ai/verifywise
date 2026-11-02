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
import { eventRowFitsColumns } from "../utils/shadowAiEventLimits";
import { matchDomain, ensureTenantTool, updateToolCounters } from "./shadowAiToolMatcher.service";
import { extractModel } from "./shadowAiModelExtractor.service";
import { evaluateRulesForBatch } from "./shadowAiAlertNotification.service";
import { ShadowAiIngestionRequest } from "../domain.layer/interfaces/i.shadowAi";
import { getSettingsQuery } from "../utils/shadowAiConfig.utils";

// ─── In-memory sliding window rate limiter ─────────────────────────────
// Tracks event counts per tenant per hour window. Resets every hour.
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
let lastCleanup = Date.now();

function checkRateLimit(tenant: string, maxPerHour: number, batchSize: number): boolean {
  if (maxPerHour <= 0) return true; // 0 = no limit

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
    rateLimitBuckets.set(tenant, { count: batchSize, windowStart: now });
    return true;
  }

  if (bucket.count + batchSize > maxPerHour) {
    return false;
  }

  bucket.count += batchSize;
  return true;
}

/**
 * Check the organization's hourly event limit and count this batch against it.
 * Returns false when the batch would exceed the limit. If settings cannot be
 * read (e.g. table missing), the batch is allowed.
 */
export async function checkShadowAiRateLimit(
  organizationId: number,
  batchSize: number,
): Promise<boolean> {
  try {
    const settings = await getSettingsQuery(organizationId);
    return checkRateLimit(
      String(organizationId),
      settings.rate_limit_max_events_per_hour,
      batchSize,
    );
  } catch (error) {
    // If settings table doesn't exist yet, skip rate limiting
    logger.debug("Rate limit check skipped (settings unavailable)");
    return true;
  }
}

/**
 * Store a batch of already-validated events for one organization.
 *
 * Without `options.transaction` the service opens its own transaction, commits
 * it, then starts rule evaluation without awaiting it. With an external
 * transaction the caller owns commit/rollback and rule evaluation is deferred
 * to `afterCommit`, so rules never see uncommitted rows.
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

    // Normalize all events first
    const allNormalized = events.map(normalizeEvent);

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
