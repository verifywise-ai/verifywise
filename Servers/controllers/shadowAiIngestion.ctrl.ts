/**
 * Shadow AI Ingestion Controller
 *
 * Handles incoming SIEM/proxy events via REST API.
 * Authenticates via X-API-Key header, processes events through
 * the tool matcher and model extractor pipeline.
 */

import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";
import { validateApiKeyWithCache } from "../utils/shadowAiApiKey.utils";
import {
  normalizeEvent,
  insertEventsQuery,
} from "../utils/shadowAiIngestion.utils";
import {
  matchDomain,
  ensureTenantTool,
  updateToolCounters,
} from "../services/shadowAiToolMatcher.service";
import { extractModel } from "../services/shadowAiModelExtractor.service";
import { evaluateRulesForBatch } from "../services/shadowAiAlertNotification.service";
import { ShadowAiIngestionRequest } from "../domain.layer/interfaces/i.shadowAi";
import { getSettingsQuery } from "../utils/shadowAiConfig.utils";

const MAX_EVENTS_PER_REQUEST = 10000;

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
 * POST /api/v1/shadow-ai/events
 * Ingest a batch of shadow AI events.
 * Authenticated via X-API-Key header (not JWT).
 */
export async function ingestEvents(req: Request, res: Response) {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("Missing X-API-Key header"));
  }

  // Validate API key and resolve organization
  let organizationId: number | null;
  try {
    organizationId = await validateApiKeyWithCache(apiKey);
  } catch (error) {
    logger.error("❌ API key validation error:", error);
    return res.status(500).json(STATUS_CODE[500]("Key validation failed"));
  }

  if (!organizationId) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("Invalid or revoked API key"));
  }

  // Validate request body
  const body = req.body as ShadowAiIngestionRequest;
  if (!body.events || !Array.isArray(body.events)) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Request body must contain an 'events' array"));
  }

  if (body.events.length === 0) {
    return res.status(200).json(STATUS_CODE[200]({ ingested: 0 }));
  }

  if (body.events.length > MAX_EVENTS_PER_REQUEST) {
    return res
      .status(413)
      .json(
        STATUS_CODE[413](
          `Maximum ${MAX_EVENTS_PER_REQUEST} events per request`
        )
      );
  }

  // Check rate limit from organization settings
  try {
    const settings = await getSettingsQuery(organizationId);
    if (!checkRateLimit(String(organizationId), settings.rate_limit_max_events_per_hour, body.events.length)) {
      return res
        .status(429)
        .json(
          STATUS_CODE[429](
            `Rate limit exceeded: max ${settings.rate_limit_max_events_per_hour} events/hour`
          )
        );
    }
  } catch (error) {
    // If settings table doesn't exist yet, skip rate limiting
    logger.debug("Rate limit check skipped (settings unavailable)");
  }

  // Validate required fields and basic formats
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (let i = 0; i < body.events.length; i++) {
    const evt = body.events[i];
    if (!evt.user_email || !evt.destination || !evt.timestamp) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            `Event at index ${i} missing required field(s): user_email, destination, timestamp`
          )
        );
    }
    if (!EMAIL_REGEX.test(evt.user_email)) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            `Event at index ${i} has invalid user_email format`
          )
        );
    }
  }

  let transaction: Transaction | null = null;

  try {
    transaction = await sequelize.transaction();

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
    const normalizedEvents = body.events.map(normalizeEvent);

    // Step 1: Parallelize domain matching and model extraction
    // matchDomain and extractModel are read-only lookups (no DB writes)
    const matchResults = await Promise.all(
      normalizedEvents.map(async (normalized) => {
        const [registryMatch, model] = await Promise.all([
          matchDomain(normalized.destination),
          normalized.uri_path
            ? extractModel(normalized.destination, normalized.uri_path)
            : Promise.resolve(null),
        ]);
        return { registryMatch, model };
      })
    );

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

      if (normalized.department) allDepartments.add(normalized.department);
      allEmails.add(normalized.user_email);

      if (registryMatch) {
        const { id: toolId, isNew } = await ensureTenantTool(
          organizationId,
          registryMatch,
          transaction
        );
        detectedToolId = toolId;

        if (isNew) {
          newToolIds.add(toolId);
          newToolNames.set(toolId, registryMatch.name);
        }

        toolEventCounts.set(
          toolId,
          (toolEventCounts.get(toolId) || 0) + 1
        );
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
    const insertedCount = await insertEventsQuery(
      organizationId,
      processedEvents,
      transaction
    );

    // Update tool counters
    for (const [toolId, count] of toolEventCounts.entries()) {
      await updateToolCounters(
        organizationId,
        toolId,
        count,
        toolUserSets.get(toolId) || new Set(),
        transaction
      );
    }

    await transaction.commit();

    logger.debug(
      `✅ Ingested ${insertedCount} shadow AI events for organization ${organizationId}`
    );

    // Evaluate alert rules asynchronously (don't block the response)
    evaluateRulesForBatch(organizationId, {
      newToolIds,
      newToolNames,
      toolEventCounts,
      toolDepartments,
      toolEmails,
      blockedAttempts,
      allDepartments,
      allEmails,
    }).catch((err) => {
      logger.error("Rule evaluation failed:", err);
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        ingested: insertedCount,
        tools_matched: toolEventCounts.size,
      })
    );
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        logger.error("Transaction rollback failed:", rollbackError);
      }
    }

    logger.error("❌ Error in shadow AI event ingestion:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
