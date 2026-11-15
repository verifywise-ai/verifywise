/**
 * Slack connections (the Slack extension's "workspaces"), served at
 * /api/extensions/slack/oauth/workspaces.
 *
 * A connection belongs to an organization. The owner and the organization
 * always come from the token (req.userId, req.organizationId), never from the
 * body or query. Every read and write is filtered by the caller's
 * organization in SQL; another organization's id answers 404, exactly like a
 * missing id. Connections with no organization (legacy rows, see
 * utils/slackWebhook.utils.ts) are invisible here.
 */
import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";
import {
  getSlackWebhooksByOrganizationQuery,
  getSlackWebhookByIdAndOrganizationQuery,
  createNewSlackWebhookQuery,
  updateSlackWebhookByIdQuery,
  deleteSlackWebhookByIdQuery,
  withOrganizationScope,
} from "../utils/slackWebhook.utils";
import { SlackWebhookModel } from "../domain.layer/models/slackNotification/slackWebhook.model";
import {
  inviteBotToChannel,
  sendImmediateMessage,
} from "../services/slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../domain.layer/enums/slack.enum";

import { translateError } from "../utils/i18n.utils";
import { MAX_POSTGRES_ID } from "../utils/validations/aiAppBulkValidation.utils";
const fileName = "slackWebhook.ctrl.ts";

const ROUTING_TYPES: readonly string[] = Object.values(SlackNotificationRoutingType);
const UPDATABLE_FIELDS = new Set(["routing_type", "is_active"]);

/** The :id route parameter as a positive INTEGER, or null when it is not one. */
function parseConnectionId(req: Request): number | null {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 && id <= MAX_POSTGRES_ID ? id : null;
}

type SlackWebhookUpdate = { routing_type?: SlackNotificationRoutingType[]; is_active?: boolean };

/**
 * A PATCH body: routing_type (a list of known routing types) and/or is_active
 * (a boolean), nothing else. Returns the parsed body, or the English message
 * key of the first problem.
 */
export function parseSlackWebhookUpdate(
  body: unknown,
): { ok: true; data: SlackWebhookUpdate } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "No valid fields to update" };
  }
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.some((key) => !UPDATABLE_FIELDS.has(key))) {
    return { ok: false, message: "Only routing_type and is_active can be changed" };
  }
  if (keys.length === 0) {
    return { ok: false, message: "No valid fields to update" };
  }

  const data: SlackWebhookUpdate = {};
  if ("routing_type" in input) {
    const routing = input.routing_type;
    if (
      !Array.isArray(routing) ||
      !routing.every((item) => typeof item === "string" && ROUTING_TYPES.includes(item))
    ) {
      return { ok: false, message: "routing_type must be a list of notification types" };
    }
    data.routing_type = [...new Set(routing as SlackNotificationRoutingType[])];
  }
  if ("is_active" in input) {
    if (typeof input.is_active !== "boolean") {
      return { ok: false, message: "is_active must be a boolean" };
    }
    data.is_active = input.is_active;
  }
  return { ok: true, data };
}

export async function getAllSlackWebhooks(req: Request, res: Response): Promise<any> {
  const functionName = "getAllSlackWebhooks";
  logStructured("processing", "starting getAllSlackWebhooks", functionName, fileName);
  // The organization's connections. A userId in the query is ignored.
  const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
  try {
    const slackWebhooks = await getSlackWebhooksByOrganizationQuery(req.organizationId!, channel);
    logStructured(
      "successful",
      `${slackWebhooks.length} slackWebhooks found`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](slackWebhooks));
  } catch (error) {
    logStructured("error", "failed to retrieve slackWebhooks", functionName, fileName);
    logger.error("❌ Error in getAllSlackWebhooks:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getSlackWebhookById(req: Request, res: Response): Promise<any> {
  const functionName = "getSlackWebhookById";
  const requestId = parseConnectionId(req);
  if (requestId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Valid ID is required (must be >= 1)")));
  }
  logStructured("processing", `fetching slackWebhook by ID: ${requestId}`, functionName, fileName);

  try {
    const slackWebhook = await getSlackWebhookByIdAndOrganizationQuery(
      requestId,
      req.organizationId!,
    );
    if (!slackWebhook) {
      logStructured("successful", `no slackWebhook found: ID ${requestId}`, functionName, fileName);
      return res.status(404).json(STATUS_CODE[404](req.t!("Slack Webhook not found")));
    }

    logStructured("successful", `slackWebhook found: ID ${requestId}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](slackWebhook.toJSON()));
  } catch (error) {
    logStructured("error", `failed to fetch slackWebhook: ID ${requestId}`, functionName, fileName);
    logger.error("❌ Error in getSlackWebhookById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function validateSlackOAuth(code: string): Promise<any> {
  try {
    const url = process.env.SLACK_API_URL;
    const searchParams = {
      client_id: process.env.SLACK_CLIENT_ID || "",
      client_secret: process.env.SLACK_CLIENT_SECRET || "",
      code: code,
      redirect_uri: `${process.env.FRONTEND_URL}/extensions/slack/settings`,
    };
    if (!url) {
      throw new Error("Slack API URL is not configured");
    }
    const tokenResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(searchParams),
    });
    const data = await tokenResponse.json();

    if (data.ok) {
      return data;
    } else {
      throw new Error(data.error || "Slack OAuth failed");
    }
  } catch (error) {
    throw new Error("Failed to validate Slack OAuth code");
  }
}

export async function createNewSlackWebhook(req: Request, res: Response): Promise<any> {
  const functionName = "createNewSlackWebhook";

  logStructured("processing", `starting slackWebhook creation`, functionName, fileName);

  try {
    const slackWebhookData = await validateSlackOAuth(req.body?.code);
    // Owner and organization come from the token. A userId in the body is ignored.
    const slackWebhookModel = await SlackWebhookModel.createNewSlackWebhook(
      slackWebhookData.access_token,
      slackWebhookData.scope,
      slackWebhookData.team.name,
      slackWebhookData.team.id,
      slackWebhookData.incoming_webhook.channel,
      slackWebhookData.incoming_webhook.channel_id,
      slackWebhookData.incoming_webhook.configuration_url,
      slackWebhookData.incoming_webhook.url,
      req.userId!,
      true,
    );
    slackWebhookModel.organization_id = req.organizationId!;

    await slackWebhookModel.validateSlackWebhookData();

    // The insert and the bot invite share one transaction, bound to the
    // caller's organization for RLS: a failed invite rolls the insert back.
    // New rows take the column default delivery_scope = 'organization'.
    const newSlackWebhook = await withOrganizationScope(
      req.organizationId!,
      async (transaction) => {
        const created = await createNewSlackWebhookQuery(slackWebhookModel, transaction);
        await inviteBotToChannel(
          slackWebhookData.authed_user.access_token,
          slackWebhookData.incoming_webhook.channel_id,
          slackWebhookData.bot_user_id,
        );
        return created;
      },
    );

    if (newSlackWebhook) {
      logStructured(
        "successful",
        `slackWebhook created: ID ${newSlackWebhook.id}`,
        functionName,
        fileName,
      );
      await logEvent(
        "Create",
        `slackWebhook created: ID ${newSlackWebhook.id}, channel: ${newSlackWebhook.channel}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(201).json(STATUS_CODE[201](newSlackWebhook));
    }

    logStructured("error", "failed to create slackWebhook", functionName, fileName);
    await logEvent("Error", "slackWebhook creation failed", req.userId!, req.organizationId!);
    return res.status(400).json(STATUS_CODE[400](req.t!("Failed to create slackWebhook")));
  } catch (error) {
    if (error instanceof ValidationException) {
      logStructured("error", `validation failed: ${error.message}`, functionName, fileName);
      await logEvent(
        "Error",
        `Validation error during slackWebhook creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      logStructured("error", `business logic error: ${error.message}`, functionName, fileName);
      await logEvent(
        "Error",
        `Business logic error during slackWebhook creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logStructured("error", `unexpected error during slackWebhook creation`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error during slackWebhook creation: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in createNewslackWebhook:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateSlackWebhookById(req: Request, res: Response): Promise<any> {
  const functionName = "updateSlackWebhookById";
  const slackWebhookId = parseConnectionId(req);
  if (slackWebhookId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Valid ID is required (must be >= 1)")));
  }
  const parsed = parseSlackWebhookUpdate(req.body);
  if (!parsed.ok) {
    return res.status(400).json(STATUS_CODE[400](req.t!(parsed.message)));
  }

  logStructured("processing", `updating slackWebhook ID ${slackWebhookId}`, functionName, fileName);

  try {
    // Saving routing_type also sets delivery_scope = 'organization' (see the query).
    // Bound to the caller's organization for RLS; a miss changes no row.
    const updatedSlackWebhook = await withOrganizationScope(req.organizationId!, (transaction) =>
      updateSlackWebhookByIdQuery(slackWebhookId, req.organizationId!, parsed.data, transaction),
    );

    if (!updatedSlackWebhook) {
      logStructured(
        "error",
        `slackWebhook not found: ID ${slackWebhookId}`,
        functionName,
        fileName,
      );
      await logEvent(
        "Error",
        `Update failed — slackWebhook not found: ID ${slackWebhookId}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("SlackWebhook not found")));
    }

    logStructured(
      "successful",
      `slackWebhook updated: ID ${slackWebhookId}`,
      functionName,
      fileName,
    );
    await logEvent(
      "Update",
      `SlackWebhook updated: ID ${slackWebhookId}`,
      req.userId!,
      req.organizationId!,
    );
    return res.status(202).json(STATUS_CODE[202](updatedSlackWebhook));
  } catch (error) {
    logStructured(
      "error",
      `unexpected error for slackWebhook ID ${slackWebhookId}`,
      functionName,
      fileName,
    );
    await logEvent(
      "Error",
      `Unexpected error during slackWebhook update for ID ${slackWebhookId}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in updateSlackWebhookById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** Posts one message to this connection's channel only (the test-message action). */
export async function sendSlackMessage(req: Request, res: Response): Promise<any> {
  const functionName = "sendSlackMessage";
  const requestId = parseConnectionId(req);
  if (requestId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Valid ID is required (must be >= 1)")));
  }

  logStructured("processing", `sending slack message to ID ${requestId}`, functionName, fileName);

  try {
    const slackWebhook = await getSlackWebhookByIdAndOrganizationQuery(
      requestId,
      req.organizationId!,
    );
    if (!slackWebhook) {
      logStructured("error", `SlackWebhook not found: ID ${requestId}`, functionName, fileName);
      return res.status(404).json(STATUS_CODE[404](req.t!("Slack Webhook not found")));
    }

    if (!slackWebhook.is_active) {
      return res.status(400).json(STATUS_CODE[400](req.t!("This Slack connection is not active")));
    }

    // Throws when Slack refuses the message; handled below.
    const slackMsgSent = await sendImmediateMessage(slackWebhook, req.body);
    logStructured("successful", `slack message sent: ID ${requestId}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](slackMsgSent));
  } catch (error) {
    logStructured("error", `Failed to send slack message: ID ${requestId}`, functionName, fileName);
    logger.error("❌ Error in sendSlackMessage:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteSlackWebhookById(req: Request, res: Response): Promise<any> {
  const functionName = "deleteSlackWebhookById";
  const slackWebhookId = parseConnectionId(req);
  if (slackWebhookId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Valid ID is required (must be >= 1)")));
  }

  logStructured(
    "processing",
    `deleting slack integration of ID ${slackWebhookId}`,
    functionName,
    fileName,
  );
  try {
    // Bound to the caller's organization for RLS; a miss deletes no row.
    const deleted = await withOrganizationScope(req.organizationId!, (transaction) =>
      deleteSlackWebhookByIdQuery(slackWebhookId, req.organizationId!, transaction),
    );

    if (!deleted) {
      logStructured(
        "error",
        `slackWebhook not found: ID ${slackWebhookId}`,
        functionName,
        fileName,
      );
      await logEvent(
        "Error",
        `Delete failed — slackWebhook not found: ID ${slackWebhookId}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("SlackWebhook not found")));
    }

    logStructured(
      "successful",
      `slackWebhook deleted: ID ${slackWebhookId}`,
      functionName,
      fileName,
    );
    await logEvent(
      "Delete",
      `slackWebhook deleted: ID ${slackWebhookId}`,
      req.userId!,
      req.organizationId!,
    );
    return res.status(204).json(STATUS_CODE[204](deleted));
  } catch (error) {
    logStructured(
      "error",
      `failed to delete slackWebhook: ID ${slackWebhookId}`,
      functionName,
      fileName,
    );
    await logEvent(
      "Error",
      `slackWebhook deletion failed: ID ${slackWebhookId}`,
      req.userId!,
      req.organizationId!,
    );
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
