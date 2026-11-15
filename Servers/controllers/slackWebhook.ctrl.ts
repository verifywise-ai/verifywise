/**
 * Slack connections (the Slack extension's "workspaces"), served at
 * /api/extensions/slack/oauth/workspaces.
 *
 * A connection belongs to an organization. The owner and the organization
 * always come from the token (req.userId, req.organizationId), never from the
 * body or query. Every read and write is filtered by the caller's
 * organization in SQL; another organization's id answers 404, exactly like a
 * missing id. Connections with no organization (legacy rows, see
 * utils/slackWebhook.utils.ts) are invisible to those routes; their owner
 * lists and removes them at /api/extensions/slack/oauth/unlinked.
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
  getUnlinkedSlackConnectionsQuery,
  deleteUnlinkedSlackConnectionQuery,
} from "../utils/slackWebhook.utils";
import { SlackWebhookModel } from "../domain.layer/models/slackNotification/slackWebhook.model";
import {
  inviteBotToChannel,
  sendImmediateMessage,
} from "../services/slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../domain.layer/enums/slack.enum";

import { translateError } from "../utils/i18n.utils";
import { normaliseHttpUrl } from "../utils/publicUrl.utils";
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

/** Longest authorization code accepted; Slack's codes are far shorter. */
const MAX_SLACK_OAUTH_CODE_LENGTH = 512;

/** The OAuth `code` from the request body: a non-empty string of at most 512 characters. */
export function isValidSlackOAuthCode(code: unknown): code is string {
  return (
    typeof code === "string" && code.trim().length > 0 && code.length <= MAX_SLACK_OAUTH_CODE_LENGTH
  );
}

/** Path Slack returns the browser to; the client sends the same redirect URI. */
const SLACK_REDIRECT_PATH = "/extensions/slack/settings";

/** Slack's errors for a redirect_uri that does not match the authorize request or the app. */
const REDIRECT_URI_ERRORS = new Set(["bad_redirect_uri", "redirect_uri_mismatch"]);

export const SLACK_REDIRECT_MISMATCH_MESSAGE =
  "Slack rejected the return address. FRONTEND_URL must match the address you open VerifyWise at.";
export const SLACK_CODE_REFUSED_MESSAGE =
  "Slack did not accept the authorization code. Add Slack again.";
export const SLACK_MISSING_PERMISSIONS_MESSAGE =
  "Slack did not grant the permissions VerifyWise needs. Add Slack again and allow every permission.";

/**
 * The redirect URI sent with the code exchange. It must equal the one the
 * browser sent to Slack (`${window.location.origin}/extensions/slack/settings`),
 * so trailing slashes in FRONTEND_URL are dropped.
 */
export function slackRedirectUri(
  frontendUrl: string | undefined = process.env.FRONTEND_URL,
): string {
  const base = normaliseHttpUrl(frontendUrl) ?? (frontendUrl ?? "").trim().replace(/\/+$/, "");
  return `${base}${SLACK_REDIRECT_PATH}`;
}

/**
 * Exchange the authorization code with Slack. Slack refusing it throws a
 * ValidationException with a fixed message: a redirect URI that does not
 * match (FRONTEND_URL differs from the address the browser used) gets its own
 * admin-facing message, anything else (a used, expired or foreign code) the
 * generic one. Slack's own error is logged here, never sent to the client.
 * Anything else (no SLACK_API_URL, network failure, a body that is not JSON)
 * throws a generic error.
 */
async function validateSlackOAuth(code: string): Promise<any> {
  let data: any;
  try {
    const url = process.env.SLACK_API_URL;
    if (!url) {
      throw new Error("Slack API URL is not configured");
    }
    const searchParams = {
      client_id: process.env.SLACK_CLIENT_ID || "",
      client_secret: process.env.SLACK_CLIENT_SECRET || "",
      code: code,
      redirect_uri: slackRedirectUri(),
    };
    const tokenResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(searchParams),
    });
    data = await tokenResponse.json();
  } catch {
    throw new Error("Failed to validate Slack OAuth code");
  }

  if (!data || data.ok !== true) {
    // Slack's error is a short code such as invalid_code; keep only safe characters.
    const reason = String(data?.error ?? "unknown")
      .replace(/[^a-z0-9_]/gi, "")
      .slice(0, 64);
    logger.warn(`Slack refused the OAuth code: ${reason}`);
    if (REDIRECT_URI_ERRORS.has(reason)) {
      throw new ValidationException(SLACK_REDIRECT_MISMATCH_MESSAGE, "redirect_uri");
    }
    throw new ValidationException(SLACK_CODE_REFUSED_MESSAGE, "code");
  }
  // The user token invites the bot to the channel. Slack only issues it when
  // the authorize request asked for user scopes and the installer allowed them.
  if (typeof data.authed_user?.access_token !== "string" || !data.authed_user.access_token) {
    logger.warn("Slack returned no user token: the user scopes were not granted");
    throw new ValidationException(SLACK_MISSING_PERMISSIONS_MESSAGE, "authed_user");
  }
  return data;
}

export async function createNewSlackWebhook(req: Request, res: Response): Promise<any> {
  const functionName = "createNewSlackWebhook";

  const code: unknown = req.body?.code;
  if (!isValidSlackOAuthCode(code)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A Slack authorization code is required")));
  }

  logStructured("processing", `starting slackWebhook creation`, functionName, fileName);

  try {
    const slackWebhookData = await validateSlackOAuth(code);
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

/**
 * The caller's own connections with no organization (created before
 * connections belonged to an organization). They send nothing; the owner can
 * only remove them. Only the owner's rows are returned, never a token or URL.
 */
export async function getUnlinkedSlackConnections(req: Request, res: Response): Promise<any> {
  const functionName = "getUnlinkedSlackConnections";
  try {
    const connections = await getUnlinkedSlackConnectionsQuery(req.userId!);
    logStructured(
      "successful",
      `${connections.length} unlinked slackWebhooks found`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](connections));
  } catch (error) {
    logStructured("error", "failed to retrieve unlinked slackWebhooks", functionName, fileName);
    logger.error("❌ Error in getUnlinkedSlackConnections:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Remove one of the caller's own connections with no organization. Another
 * user's row, an organization's connection and a missing id all answer 404.
 */
export async function deleteUnlinkedSlackConnection(req: Request, res: Response): Promise<any> {
  const functionName = "deleteUnlinkedSlackConnection";
  const connectionId = parseConnectionId(req);
  if (connectionId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Valid ID is required (must be >= 1)")));
  }

  try {
    const deleted = await deleteUnlinkedSlackConnectionQuery(connectionId, req.userId!);
    if (!deleted) {
      logStructured(
        "error",
        `unlinked slackWebhook not found: ID ${connectionId}`,
        functionName,
        fileName,
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Slack Webhook not found")));
    }

    logStructured(
      "successful",
      `unlinked slackWebhook deleted: ID ${connectionId}`,
      functionName,
      fileName,
    );
    // The row is gone: a failing audit write is logged, not turned into a 500.
    try {
      await logEvent(
        "Delete",
        `Unlinked slackWebhook deleted: ID ${connectionId}`,
        req.userId!,
        req.organizationId!,
      );
    } catch (auditError) {
      logger.error("❌ Could not record the unlinked slackWebhook delete:", auditError);
    }
    return res.status(204).send();
  } catch (error) {
    logStructured(
      "error",
      `failed to delete unlinked slackWebhook: ID ${connectionId}`,
      functionName,
      fileName,
    );
    logger.error("❌ Error in deleteUnlinkedSlackConnection:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
