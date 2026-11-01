/**
 * AI Gateway Email Notifications
 *
 * Sends in-app + email notifications for budget and guardrail events.
 * Uses the same dual-notification pattern as other VerifyWise modules.
 */

import { sendInAppNotification } from "../inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../domain.layer/interfaces/i.notification";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/** Agent Control agent key enforcement modes, as shown to people. */
const ENFORCEMENT_MODE_LABELS: Record<string, string> = {
  enforce: "enforce",
  monitor: "monitor only",
};

/**
 * Get all admin users for an organization (ID + name).
 */
async function getOrgAdmins(organizationId: number): Promise<Array<{ id: number; name: string }>> {
  const users = await sequelize.query(
    `SELECT u.id, COALESCE(NULLIF(TRIM(COALESCE(u.name, '') || ' ' || COALESCE(u.surname, '')), ''), 'Admin') AS name
     FROM users u
     JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
     WHERE om.role_id = 1`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );
  return (users as any[]).map((u) => ({ id: Number(u.id), name: u.name }));
}

/**
 * Notify: Budget threshold crossed (e.g., 80% of limit reached)
 */
export async function notifyBudgetWarning(
  organizationId: number,
  budget: {
    current_spend_usd: number;
    monthly_limit_usd: number;
    alert_threshold_pct: number;
    is_hard_limit: boolean;
  },
): Promise<void> {
  const admins = await getOrgAdmins(organizationId);
  const spendPct = Math.round(
    (Number(budget.current_spend_usd) / Number(budget.monthly_limit_usd)) * 100,
  );

  await Promise.allSettled(
    admins.map((admin) =>
      sendInAppNotification(
        organizationId,
        {
          user_id: admin.id,
          type: NotificationType.AI_GATEWAY_BUDGET_WARNING,
          title: "AI Gateway budget warning",
          message: `Spend has reached ${spendPct}% of the $${Number(budget.monthly_limit_usd).toFixed(2)} monthly limit.`,
          entity_type: NotificationEntityType.AI_GATEWAY,
          action_url: `${FRONTEND_URL}/ai-gateway/settings`,
        },
        true,
        {
          template: EMAIL_TEMPLATES.AI_GATEWAY_BUDGET_WARNING,
          subject: `AI Gateway: spend at ${spendPct}% of monthly budget`,
          variables: {
            recipient_name: admin.name,
            spend_percentage: String(spendPct),
            current_spend: Number(budget.current_spend_usd).toFixed(2),
            monthly_limit: Number(budget.monthly_limit_usd).toFixed(2),
            threshold: String(budget.alert_threshold_pct),
            hard_limit_status: budget.is_hard_limit
              ? "Enabled (requests will be rejected)"
              : "Disabled (requests continue)",
            total_requests: "—",
            gateway_url: `${FRONTEND_URL}/ai-gateway/analytics`,
          },
        },
      ).catch((err) => logger.error(`Failed to send budget warning to admin ${admin.id}:`, err)),
    ),
  );
}

/**
 * Notify: Budget exhausted with hard limit (all requests rejected)
 */
export async function notifyBudgetExhausted(
  organizationId: number,
  budget: {
    current_spend_usd: number;
    monthly_limit_usd: number;
  },
): Promise<void> {
  const admins = await getOrgAdmins(organizationId);

  await Promise.allSettled(
    admins.map((admin) =>
      sendInAppNotification(
        organizationId,
        {
          user_id: admin.id,
          type: NotificationType.AI_GATEWAY_BUDGET_EXHAUSTED,
          title: "AI Gateway budget exhausted",
          message: `Monthly budget of $${Number(budget.monthly_limit_usd).toFixed(2)} is exhausted. All requests are being rejected.`,
          entity_type: NotificationEntityType.AI_GATEWAY,
          action_url: `${FRONTEND_URL}/ai-gateway/settings`,
        },
        true,
        {
          template: EMAIL_TEMPLATES.AI_GATEWAY_BUDGET_EXHAUSTED,
          subject: "AI Gateway: budget exhausted, requests rejected",
          variables: {
            recipient_name: admin.name,
            current_spend: Number(budget.current_spend_usd).toFixed(2),
            monthly_limit: Number(budget.monthly_limit_usd).toFixed(2),
            settings_url: `${FRONTEND_URL}/ai-gateway/settings`,
          },
        },
      ).catch((err) => logger.error(`Failed to send budget exhausted to admin ${admin.id}:`, err)),
    ),
  );
}

/**
 * Notify: Guardrail activity spike (many blocks/masks in a short period)
 */
export async function notifyGuardrailSpike(
  organizationId: number,
  stats: {
    blocked_count: number;
    masked_count: number;
    pii_count: number;
    content_filter_count: number;
    active_rules: number;
  },
): Promise<void> {
  const admins = await getOrgAdmins(organizationId);

  await Promise.allSettled(
    admins.map((admin) =>
      sendInAppNotification(
        organizationId,
        {
          user_id: admin.id,
          type: NotificationType.AI_GATEWAY_GUARDRAIL_SPIKE,
          title: "Guardrail activity spike",
          message: `${stats.blocked_count} blocked and ${stats.masked_count} masked requests in the last hour.`,
          entity_type: NotificationEntityType.AI_GATEWAY,
          action_url: `${FRONTEND_URL}/ai-gateway/guardrails`,
        },
        true,
        {
          template: EMAIL_TEMPLATES.AI_GATEWAY_GUARDRAIL_SPIKE,
          subject: `AI Gateway: ${stats.blocked_count + stats.masked_count} guardrail triggers in the last hour`,
          variables: {
            recipient_name: admin.name,
            blocked_count: String(stats.blocked_count),
            masked_count: String(stats.masked_count),
            pii_count: String(stats.pii_count),
            content_filter_count: String(stats.content_filter_count),
            active_rules: String(stats.active_rules),
            guardrails_url: `${FRONTEND_URL}/ai-gateway/guardrails`,
          },
        },
      ).catch((err) => logger.error(`Failed to send guardrail spike to admin ${admin.id}:`, err)),
    ),
  );
}

/**
 * Notify: Virtual key budget exhausted
 */
export async function notifyVirtualKeyBudgetExhausted(
  organizationId: number,
  keyName: string,
  spend: number,
  limit: number,
): Promise<void> {
  const admins = await getOrgAdmins(organizationId);

  await Promise.allSettled(
    admins.map((admin) =>
      sendInAppNotification(
        organizationId,
        {
          user_id: admin.id,
          type: NotificationType.AI_GATEWAY_VIRTUAL_KEY_BUDGET_EXHAUSTED,
          title: "Virtual key budget exhausted",
          message: `Virtual key "${keyName}" has exhausted its $${limit.toFixed(2)} budget. Requests using this key are now rejected.`,
          entity_type: NotificationEntityType.AI_GATEWAY,
          action_url: `${FRONTEND_URL}/ai-gateway/virtual-keys`,
        },
        true,
        {
          template: EMAIL_TEMPLATES.AI_GATEWAY_VIRTUAL_KEY_BUDGET_EXHAUSTED,
          subject: `AI Gateway: virtual key "${keyName}" budget exhausted`,
          variables: {
            recipient_name: admin.name,
            key_name: keyName,
            current_spend: spend.toFixed(4),
            monthly_limit: limit.toFixed(2),
            settings_url: `${FRONTEND_URL}/ai-gateway/virtual-keys`,
          },
        },
      ).catch((err) =>
        logger.error(`Failed to send vkey budget exhausted to admin ${admin.id}:`, err),
      ),
    ),
  );
}

/**
 * Notify: An MCP tool call is waiting for human approval.
 *
 * In-app only (no email) — approvals are time-bounded and reviewed in the
 * MCP Approvals page, so the in-app notification links straight there.
 */
export async function notifyApprovalPending(
  organizationId: number,
  approval: {
    approval_id: number;
    tool_name: string;
    agent_key_id: number;
    agent_key_name?: string | null;
  },
): Promise<void> {
  const admins = await getOrgAdmins(organizationId);
  const keyLabel = approval.agent_key_name || `agent key #${approval.agent_key_id}`;

  await Promise.allSettled(
    admins.map((admin) =>
      sendInAppNotification(organizationId, {
        user_id: admin.id,
        type: NotificationType.AI_GATEWAY_APPROVAL_PENDING,
        title: "Tool call waiting for approval",
        message: `${keyLabel} requested "${approval.tool_name}" and is waiting for your approval.`,
        entity_type: NotificationEntityType.AI_GATEWAY,
        action_url: `${FRONTEND_URL}/ai-gateway/mcp/approvals`,
      }).catch((err) =>
        logger.error(`Failed to send approval-pending notice to admin ${admin.id}:`, err),
      ),
    ),
  );
}

/**
 * Notify: Configuration change (endpoint, API key, guardrail rule)
 *
 * Generic notification for any config change event.
 * Uses a single shared template with variable content.
 */
export async function notifyConfigChange(
  organizationId: number,
  changedByUserId: number | null,
  // Built by the gateway's config_event(); every field is optional here so an
  // incomplete event still produces a notification.
  event: {
    entityType?: string; // "Endpoint" | "API key" | "Agent key" | ...
    entityName?: string; // e.g., "prod-gpt4o" or "Block credit cards"
    action?: string; // "created" | "updated" | "deleted" | "revoked" | "approved" | ... | "enforcement_mode_changed"
    detail?: string; // e.g., "Provider: openai"
    actionUrl?: string; // link to the relevant page; a path ("/ai-gateway/...") is prefixed with FRONTEND_URL
    actionLabel?: string; // button text e.g., "View endpoints"
    oldMode?: string; // enforcement_mode_changed only: "enforce" | "monitor"
    newMode?: string; // enforcement_mode_changed only: "enforce" | "monitor"
    email?: boolean; // true = also email admins; absent or false = in-app only
  },
): Promise<void> {
  const admins = await getOrgAdmins(organizationId);

  // Look up who made the change
  let changedByName = "A user";
  try {
    const users = await sequelize.query(
      `SELECT u.name, u.surname
       FROM users u
       JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
       WHERE u.id = :userId`,
      {
        replacements: { userId: changedByUserId, organizationId },
        type: QueryTypes.SELECT,
      },
    );
    const u = (users as any[])[0];
    if (u) changedByName = [u.name, u.surname].filter(Boolean).join(" ") || "A user";
  } catch {
    /* fallback to "A user" */
  }

  // Older or malformed events must not throw here: a TypeError turns into a 500
  // that the gateway only logs, and the notification is lost. Log what was
  // missing so a gateway that sends the wrong shape is noticed.
  const missing = (["entityType", "action", "actionUrl", "actionLabel"] as const).filter(
    (field) => !event?.[field],
  );
  if (missing.length) {
    logger.warn(
      `AI Gateway config-change event is missing ${missing.join(", ")}; sending it with defaults`,
    );
  }
  const entityType = event?.entityType || "Gateway setting";
  const entityName = event?.entityName || "";
  const action = event?.action || "modified";
  const entityLower = entityType.toLowerCase();
  const target = entityName ? `the ${entityLower} "${entityName}"` : `the ${entityLower}`;

  const descriptions: Record<string, string> = {
    created: entityName
      ? `${changedByName} created a new ${entityLower}: "${entityName}".`
      : `${changedByName} created a new ${entityLower}.`,
    deleted: `${changedByName} deleted ${target}.`,
    disabled: `${changedByName} disabled ${target}.`,
    enabled: `${changedByName} enabled ${target}.`,
    modified: `${changedByName} modified ${target}.`,
    updated: `${changedByName} updated ${target}.`,
    revoked: `${changedByName} revoked ${target}.`,
    approved: `${changedByName} approved ${target}.`,
    denied: `${changedByName} denied ${target}.`,
    published: `${changedByName} published a new version of ${target}.`,
    purged: `${changedByName} purged old ${entityLower}.`,
    enforcement_mode_changed: `${entityName ? `${entityType} "${entityName}"` : entityType} switched to ${
      ENFORCEMENT_MODE_LABELS[event?.newMode ?? ""] ?? "a different mode"
    } by ${changedByName}.`,
  };

  const changeDescription = descriptions[action] || `${changedByName} changed ${target}.`;
  // Wording for the title and email subject ("Agent key mode changed").
  const actionText = action === "enforcement_mode_changed" ? "mode changed" : action;
  const rawUrl = event?.actionUrl || "/ai-gateway";
  const actionUrl = rawUrl.startsWith("/") ? `${FRONTEND_URL}${rawUrl}` : rawUrl;
  const actionLabel = event?.actionLabel || "Open AI Gateway";
  // The gateway marks the changes worth an email (keys revoked, monitor only
  // switched, guardrails removed, ...); everything else is in-app only.
  const sendEmail = event?.email === true;

  await Promise.allSettled(
    admins
      .filter((admin) => admin.id !== changedByUserId)
      .map((admin) =>
        sendInAppNotification(
          organizationId,
          {
            user_id: admin.id,
            type: NotificationType.AI_GATEWAY_CONFIG_CHANGE,
            title: `${entityType} ${actionText}`,
            message: changeDescription,
            entity_type: NotificationEntityType.AI_GATEWAY,
            action_url: actionUrl,
          },
          sendEmail,
          {
            template: EMAIL_TEMPLATES.AI_GATEWAY_CONFIG_CHANGE,
            subject: `AI Gateway: ${entityLower} ${actionText}`,
            variables: {
              recipient_name: admin.name,
              change_description: changeDescription,
              entity_type: entityType,
              entity_name: entityName,
              change_detail: event?.detail || "",
              changed_by: changedByName,
              changed_at: new Date().toLocaleString(),
              action_url: actionUrl,
              action_label: actionLabel,
            },
          },
        ).catch((err) => logger.error(`Failed to send config change to admin ${admin.id}:`, err)),
      ),
  );
}
