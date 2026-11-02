/**
 * Shadow AI Ingestion Controller
 *
 * Handles incoming SIEM/proxy events via REST API.
 * Authenticates via X-API-Key header, processes events through
 * the tool matcher and model extractor pipeline.
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger from "../utils/logger/fileLogger";
import { validateApiKeyWithCache } from "../utils/shadowAiApiKey.utils";
import {
  checkShadowAiRateLimit,
  ingestShadowAiEvents,
} from "../services/shadowAiIngestion.service";
import { ShadowAiIngestionRequest } from "../domain.layer/interfaces/i.shadowAi";

import { translateError } from "../utils/i18n.utils";
import { isEmail } from "../utils/validations/email.utils";
const MAX_EVENTS_PER_REQUEST = 10000;

/**
 * POST /api/v1/shadow-ai/events
 * Ingest a batch of shadow AI events.
 * Authenticated via X-API-Key header (not JWT).
 */
export async function ingestEvents(req: Request, res: Response) {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    return res.status(401).json(STATUS_CODE[401](req.t!("Missing X-API-Key header")));
  }

  // Validate API key and resolve organization
  let organizationId: number | null;
  try {
    organizationId = await validateApiKeyWithCache(apiKey);
  } catch (error) {
    logger.error("❌ API key validation error:", error);
    return res.status(500).json(STATUS_CODE[500](req.t!("Key validation failed")));
  }

  if (!organizationId) {
    return res.status(401).json(STATUS_CODE[401](req.t!("Invalid or revoked API key")));
  }

  // Validate request body
  const body = req.body as ShadowAiIngestionRequest;
  if (!body.events || !Array.isArray(body.events)) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("Request body must contain an 'events' array")));
  }

  if (body.events.length === 0) {
    return res.status(200).json(STATUS_CODE[200]({ ingested: 0 }));
  }

  if (body.events.length > MAX_EVENTS_PER_REQUEST) {
    return res
      .status(413)
      .json(
        STATUS_CODE[413](
          req.t!("Maximum {max} events per request", { max: MAX_EVENTS_PER_REQUEST }),
        ),
      );
  }

  // Check rate limit from organization settings
  // The check reports the limit it used, so the 429 needs no second read.
  const rateLimit = await checkShadowAiRateLimit(organizationId, body.events.length);
  if (!rateLimit.allowed) {
    return res
      .status(429)
      .json(
        STATUS_CODE[429](
          req.t!("Rate limit exceeded: max {max} events/hour", { max: rateLimit.maxPerHour }),
        ),
      );
  }

  // Validate required fields and basic formats
  for (let i = 0; i < body.events.length; i++) {
    const evt = body.events[i];
    if (!evt.user_email || !evt.destination || !evt.timestamp) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!(
              "Event at index {i} missing required field(s): user_email, destination, timestamp",
              { i },
            ),
          ),
        );
    }
    if (!isEmail(evt.user_email)) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Event at index {i} has invalid user_email format", { i })));
    }
  }

  try {
    const { ingested, toolsMatched } = await ingestShadowAiEvents(organizationId, body.events);

    return res.status(200).json(
      STATUS_CODE[200]({
        ingested,
        tools_matched: toolsMatched,
      }),
    );
  } catch (error) {
    logger.error("❌ Error in shadow AI event ingestion:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
