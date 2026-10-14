/**
 * PUT /api/ai-gateway/guardrails/settings, handled before the generic AI
 * Gateway proxy so retention changes leave a trace in the audit ledger.
 *
 * The request is forwarded unchanged with the caller's own organization, user
 * and role; the gateway still enforces admin-only access and validation, and
 * its status and body are returned as they are, errors included.
 *
 * One exception: the gateway only knows the built-in Admin role, while the
 * Data retention page is open to any role holding organization.admin. A save
 * that changes only retention settings, from a caller this backend has checked
 * holds that permission, is forwarded as Admin. Every other save keeps the
 * caller's own role, so guardrail behaviour settings stay Admin-only.
 */

import { Request, Response } from "express";
import { AiGatewayError, aiGatewayRequest } from "../utils/aiGatewayInternal.utils";
import {
  appendRetentionChangeToLedger,
  canChangeRetentionPeriods,
} from "../utils/retentionAudit.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { GATEWAY_DEFAULTS } from "../utils/aiGatewayRetention.constants";

const FILE_NAME = "aiGatewaySettings.ctrl.ts";
const SETTINGS_PATH = "/internal/guardrails/settings";
const RETENTION_CONFIG_PATH = "/internal/retention/config";
/** Same as the generic AI Gateway proxy this route used to go through. */
const SETTINGS_UPDATE_TIMEOUT_MS = 30_000;

type RetentionKey = keyof typeof GATEWAY_DEFAULTS;

const RETENTION_LABELS: Record<RetentionKey, string> = {
  log_retention_days: "guardrail log retention",
  spend_log_retention_days: "spend log retention",
  auto_purge_enabled: "automatic deletion",
  mcp_audit_retention_days: "Agent Control log retention",
};

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** The deployment default, with its days when known (0 or less keeps indefinitely). */
function deploymentDefaultLabel(days: number | null): string {
  if (days === null) return "the deployment default";
  return days > 0
    ? `the deployment default (${days} days)`
    : "the deployment default (kept indefinitely)";
}

function formatValue(
  key: RetentionKey,
  value: unknown,
  deploymentDefaultDays: number | null,
): string {
  if (key === "auto_purge_enabled") return value ? "on" : "off";
  if (key === "mcp_audit_retention_days" && value === null) {
    return deploymentDefaultLabel(deploymentDefaultDays);
  }
  return `${value} days`;
}

/**
 * Describe each retention value the request set that differs from before.
 * Keys absent from the request are never described. `before` is null when the
 * old settings could not be read; the new value is then written as "set to".
 * `deploymentDefaultDays` is the Agent Control deployment default, named in
 * the description when known; null describes it without its days.
 */
export function describeRetentionChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  requested: Record<string, unknown>,
  deploymentDefaultDays: number | null = null,
): string[] {
  const changes: string[] = [];
  for (const key of Object.keys(RETENTION_LABELS) as RetentionKey[]) {
    if (!hasOwn(requested, key) || !hasOwn(after, key)) continue;
    const newValue = formatValue(key, after[key], deploymentDefaultDays);
    if (before === null) {
      changes.push(`${RETENTION_LABELS[key]} set to ${newValue}`);
      continue;
    }
    const oldValue = before[key] ?? GATEWAY_DEFAULTS[key];
    if (oldValue === after[key]) continue;
    changes.push(
      `${RETENTION_LABELS[key]} from ${formatValue(key, oldValue, deploymentDefaultDays)} to ${newValue}`,
    );
  }
  return changes;
}

/** Whether a settings body touches retention settings and nothing else. */
export function isRetentionOnlyUpdate(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body);
  // Own keys only: `in` would also accept inherited names like "constructor".
  return keys.length > 0 && keys.every((key) => hasOwn(RETENTION_LABELS, key));
}

/**
 * The Agent Control deployment default's days, for the ledger entry. Read only
 * when the save set the Agent Control period; a failed read gives null (the
 * entry then names the default without its days) and never fails the save.
 */
async function deploymentDefaultDaysFor(
  req: Request,
  body: Record<string, unknown>,
): Promise<number | null> {
  if (!hasOwn(body, "mcp_audit_retention_days")) return null;
  try {
    const config = await aiGatewayRequest("GET", RETENTION_CONFIG_PATH, {
      organizationId: req.organizationId!,
      role: req.role,
      userId: req.userId,
      requestId: req.requestId,
    });
    const days = config?.mcp_audit_retention_days;
    return typeof days === "number" ? days : null;
  } catch (error) {
    logger.warn(
      `Reading the Agent Control retention default failed: ${(error as Error)?.message ?? error}`,
    );
    return null;
  }
}

/**
 * The role to send to the gateway. The gateway's admin check accepts only
 * "Admin", so a retention-only save by a role this backend allows to change
 * retention periods (organization.admin, including custom roles) is sent as
 * Admin. The check is role-based: the SuperAdmin grant flag is never used.
 */
async function gatewayRoleFor(req: Request, body: Record<string, unknown>) {
  if (req.role === "Admin" || !isRetentionOnlyUpdate(body)) return req.role;
  try {
    return (await canChangeRetentionPeriods(req.organizationId, req.role)) ? "Admin" : req.role;
  } catch (error) {
    // Without the permission answer the caller's own role is sent, and the
    // gateway's admin check decides.
    logger.warn(
      `Checking retention permission for role ${req.role} failed: ${(error as Error)?.message ?? error}`,
    );
    return req.role;
  }
}

export async function updateGuardrailSettings(req: Request, res: Response): Promise<any> {
  const fn = "updateGuardrailSettings";
  const tenant = {
    organizationId: req.organizationId!,
    role: req.role,
    userId: req.userId,
    requestId: req.requestId,
  };
  const body: Record<string, unknown> = req.body ?? {};

  logProcessing({
    description: `Updating AI Gateway guardrail settings for organization ${req.organizationId}`,
    functionName: fn,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId,
  });

  const gatewayRole = await gatewayRoleFor(req, body);
  let updated: any;
  try {
    updated = await aiGatewayRequest("PUT", SETTINGS_PATH, {
      ...tenant,
      role: gatewayRole,
      body,
      timeoutMs: SETTINGS_UPDATE_TIMEOUT_MS,
    });
  } catch (error) {
    // A 4xx is the gateway rejecting the request (validation, admin check),
    // passed back to the caller as is; anything else is a failure to log.
    if (!(error instanceof AiGatewayError) || error.status >= 500) {
      await logFailure({
        eventType: "Update",
        description: `Failed to update AI Gateway guardrail settings for organization ${req.organizationId}`,
        functionName: fn,
        fileName: FILE_NAME,
        userId: req.userId!,
        organizationId: req.organizationId,
        error: error as Error,
      });
    }
    if (error instanceof AiGatewayError) {
      return typeof error.body === "string"
        ? res.status(error.status).send(error.body)
        : res.status(error.status).json(error.body);
    }
    return res.status(502).json({
      error: "AI Gateway proxy error",
      message: (error as Error)?.message || "Unknown error",
    });
  }

  // The "from" values come from the gateway's own save: it reads them under a
  // row lock in its save transaction, so concurrent saves cannot make them
  // stale (a lock cannot span this backend and the gateway). The current
  // gateway always returns an object. The fallbacks are for a rolling deploy
  // against an older gateway: one that returns null for an organization with
  // no settings row (the gateway defaults applied, so {} compares against
  // them), and one that sends no previous_retention at all ("set to" wording).
  const { previous_retention: previous, ...gatewayResponse } = updated ?? {};
  const before: Record<string, unknown> | null =
    updated && "previous_retention" in updated ? (previous ?? {}) : null;
  const changes = describeRetentionChanges(
    before,
    gatewayResponse.settings ?? {},
    body,
    await deploymentDefaultDaysFor(req, body),
  );
  if (changes.length > 0) {
    await appendRetentionChangeToLedger({
      organizationId: req.organizationId!,
      userId: req.userId,
      description: `AI Gateway retention changed: ${changes.join("; ")}`,
      functionName: fn,
      fileName: FILE_NAME,
    });
  }

  await logSuccess({
    eventType: "Update",
    description: `Updated AI Gateway guardrail settings for organization ${req.organizationId}`,
    functionName: fn,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId,
  });
  return res.status(200).json(gatewayResponse);
}
