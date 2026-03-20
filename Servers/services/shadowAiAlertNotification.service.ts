/**
 * Shadow AI Alert Notification Service
 *
 * Sends in-app and email notifications when Shadow AI rules are triggered.
 * Integrates with the existing notification system.
 */

import {
  sendInAppNotification,
  sendBulkInAppNotifications,
} from "./inAppNotification.service";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import {
  IShadowAiRule,
  ShadowAiTriggerType,
} from "../domain.layer/interfaces/i.shadowAi";
import {
  NotificationType,
  NotificationEntityType,
} from "../domain.layer/interfaces/i.notification";
import { insertAlertHistoryQuery, getActiveRulesQuery, getRecentAlertKeys } from "../utils/shadowAiRules.utils";
import { sequelize } from "../database/db";
import logger from "../utils/logger/fileLogger";

const TRIGGER_LABELS: Record<ShadowAiTriggerType, string> = {
  new_tool_detected: "New AI tool detected",
  usage_threshold_exceeded: "Usage threshold exceeded",
  sensitive_department: "Sensitive department using AI",
  blocked_attempt: "Blocked tool access attempt",
  risk_score_exceeded: "Risk score threshold exceeded",
  new_user_detected: "New user using AI tools",
};

const MAX_ALERTS_PER_BATCH = 50;
const DEFAULT_COOLDOWN_MINUTES = 1440; // 24 hours

interface AlertContext {
  toolName?: string;
  toolId?: number;
  userEmail?: string;
  department?: string;
  riskScore?: number;
  eventCount?: number;
  threshold?: number;
}

/**
 * Process triggered rules and send notifications.
 * Called during event ingestion when rules match.
 */
export async function processTriggeredRules(
  organizationId: number,
  rules: IShadowAiRule[],
  context: AlertContext
): Promise<void> {
  for (const rule of rules) {
    try {
      await sendRuleAlert(organizationId, rule, context);
    } catch (error) {
      logger.error(
        `Failed to process alert for rule ${rule.id}:`,
        error
      );
    }
  }
}

/**
 * Send alert for a single triggered rule.
 */
async function sendRuleAlert(
  organizationId: number,
  rule: IShadowAiRule,
  context: AlertContext
): Promise<void> {
  const triggerLabel =
    TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type;
  const description = buildAlertDescription(rule, context);
  const firedAt = new Date().toISOString();

  // 1. Record alert in history
  await insertAlertHistoryQuery(organizationId, {
    rule_id: rule.id!,
    rule_name: rule.name,
    trigger_type: rule.trigger_type,
    trigger_data: {
      tool_name: context.toolName,
      tool_id: context.toolId,
      user_email: context.userEmail,
      department: context.department,
      risk_score: context.riskScore,
    },
    actions_taken: {
      types: rule.actions?.map((a) => a.type) || [],
      fired_at: firedAt,
    },
  });

  // 2. Send notifications to configured users
  const userIds = rule.notification_user_ids || [];
  if (userIds.length === 0) return;

  const emailConfig = {
    subject: `Shadow AI alert: ${triggerLabel}`,
    template: EMAIL_TEMPLATES.SHADOW_AI_ALERT,
    variables: {
      alert_title: triggerLabel,
      rule_name: rule.name,
      alert_description: description,
      trigger_type: triggerLabel,
      tool_name: context.toolName || "Unknown",
      fired_at: new Date(firedAt).toLocaleString(),
      action_url: `${process.env.FRONTEND_URL || ""}/shadow-ai/rules`,
    },
  };

  if (userIds.length === 1) {
    await sendInAppNotification(
      organizationId,
      {
        user_id: userIds[0],
        type: NotificationType.SHADOW_AI_ALERT,
        title: `Shadow AI: ${triggerLabel}`,
        message: description,
        entity_type: NotificationEntityType.SHADOW_AI_TOOL,
        entity_id: context.toolId,
        entity_name: context.toolName,
        action_url: "/shadow-ai/rules",
        created_by: 0, // system
      },
      true,
      emailConfig
    );
  } else {
    await sendBulkInAppNotifications(
      organizationId,
      {
        user_ids: userIds,
        type: NotificationType.SHADOW_AI_ALERT,
        title: `Shadow AI: ${triggerLabel}`,
        message: description,
        entity_type: NotificationEntityType.SHADOW_AI_TOOL,
        entity_id: context.toolId,
        entity_name: context.toolName,
        action_url: "/shadow-ai/rules",
        created_by: 0,
      },
      true,
      emailConfig
    );
  }
}

/**
 * Build human-readable description for the alert.
 */
function buildAlertDescription(
  rule: IShadowAiRule,
  context: AlertContext
): string {
  switch (rule.trigger_type) {
    case "new_tool_detected":
      return `A new AI tool "${context.toolName || "Unknown"}" has been detected in your organization.`;
    case "usage_threshold_exceeded":
      return `AI tool "${context.toolName || "Unknown"}" has exceeded the usage threshold (${context.eventCount || 0} events, threshold: ${context.threshold || "N/A"}).`;
    case "sensitive_department":
      return `AI tool usage detected in sensitive department "${context.department || "Unknown"}" by ${context.userEmail || "unknown user"}.`;
    case "blocked_attempt":
      return `An attempt to access blocked AI tool "${context.toolName || "Unknown"}" was detected from ${context.userEmail || "unknown user"}.`;
    case "risk_score_exceeded":
      return `AI tool "${context.toolName || "Unknown"}" has a risk score of ${context.riskScore || 0}, exceeding the threshold.`;
    case "new_user_detected":
      return `New user "${context.userEmail || "Unknown"}" detected using AI tools in ${context.department || "your organization"}.`;
    default:
      return `Rule "${rule.name}" was triggered.`;
  }
}

// ─── Batch Rule Evaluation ──────────────────────────────────────────

export interface BatchContext {
  newToolIds: Set<number>;
  newToolNames: Map<number, string>;
  toolEventCounts: Map<number, number>;
  toolDepartments: Map<number, Set<string>>;
  toolEmails: Map<number, Set<string>>;
  blockedAttempts: { toolId: number; toolName: string; userEmail: string }[];
  allDepartments: Set<string>;
  allEmails: Set<string>;
}

/**
 * Evaluate all active rules against the ingested batch data.
 * Called asynchronously after event ingestion completes.
 */
export async function evaluateRulesForBatch(
  organizationId: number,
  batch: BatchContext
): Promise<void> {
  let rules: IShadowAiRule[];
  try {
    rules = await getActiveRulesQuery(organizationId);
  } catch (error) {
    logger.debug("Rule evaluation skipped (rules table unavailable)");
    return;
  }

  if (rules.length === 0) return;

  const triggered: { rule: IShadowAiRule; context: AlertContext }[] = [];

  // Pre-fetch tool data for risk_score and usage_threshold checks (single query)
  const toolIds = [...batch.toolEventCounts.keys()];
  let toolDataMap = new Map<number, { name: string; risk_score: number | null; total_events: number; status: string }>();
  if (toolIds.length > 0) {
    try {
      const [toolRows] = await sequelize.query(
        `SELECT id, name, risk_score, total_events, status
         FROM shadow_ai_tools
         WHERE organization_id = :organizationId AND id IN (:toolIds)`,
        { replacements: { organizationId, toolIds } }
      );
      for (const t of toolRows as any[]) {
        toolDataMap.set(t.id, {
          name: t.name,
          risk_score: t.risk_score,
          total_events: t.total_events,
          status: t.status,
        });
      }
    } catch {
      // If query fails, continue with empty map
    }
  }

  // Pre-fetch existing user emails for new_user_detected (single batch query)
  const batchEmails = [...batch.allEmails];
  const existingEmails = new Set<string>();
  if (batchEmails.length > 0) {
    try {
      const [userRows] = await sequelize.query(
        `SELECT DISTINCT user_email FROM shadow_ai_events
         WHERE organization_id = :organizationId AND user_email IN (:emails)
         AND id NOT IN (
           SELECT id FROM shadow_ai_events
           WHERE organization_id = :organizationId
           ORDER BY id DESC LIMIT :recentLimit
         )`,
        { replacements: { organizationId, emails: batchEmails, recentLimit: batchEmails.length * 10 } }
      );
      for (const r of userRows as any[]) {
        existingEmails.add(r.user_email);
      }
    } catch {
      // If query fails, treat all as existing (safe default — no false alerts)
      for (const e of batchEmails) existingEmails.add(e);
    }
  }

  // Pre-fetch recent alert keys for cooldown deduplication (single batch query)
  const cooldownRules = rules.map((r) => ({
    id: r.id!,
    cooldown_minutes: (r.cooldown_minutes as number) || DEFAULT_COOLDOWN_MINUTES,
  }));
  const recentKeys = await getRecentAlertKeys(organizationId, cooldownRules);

  for (const rule of rules) {
    switch (rule.trigger_type) {
      case "new_tool_detected":
        // Fire once per newly detected tool
        for (const toolId of batch.newToolIds) {
          const cooldownKey = `${rule.id}:tool:${toolId}`;
          if (recentKeys.has(cooldownKey)) continue;
          triggered.push({
            rule,
            context: {
              toolName: batch.newToolNames.get(toolId) || "Unknown",
              toolId,
            },
          });
        }
        break;

      case "usage_threshold_exceeded": {
        const threshold = (rule.trigger_config?.event_count_threshold as number) || 100;
        // Check cumulative total_events (after counter update), not just batch count
        for (const [toolId, batchCount] of batch.toolEventCounts) {
          const cooldownKey = `${rule.id}:tool:${toolId}`;
          if (recentKeys.has(cooldownKey)) continue;
          const toolData = toolDataMap.get(toolId);
          // total_events already includes this batch (counters updated before commit)
          const cumulativeEvents = toolData ? toolData.total_events : batchCount;
          if (cumulativeEvents >= threshold) {
            triggered.push({
              rule,
              context: {
                toolId,
                toolName: toolData?.name || `Tool #${toolId}`,
                eventCount: cumulativeEvents,
                threshold,
              },
            });
          }
        }
        break;
      }

      case "sensitive_department": {
        const sensitiveList = (rule.trigger_config?.departments as string[]) || [];
        if (sensitiveList.length === 0) break;
        const sensitiveSet = new Set(sensitiveList.map((d) => d.toLowerCase()));
        for (const dept of batch.allDepartments) {
          if (sensitiveSet.has(dept.toLowerCase())) {
            const cooldownKey = `${rule.id}:dept:${dept}`;
            if (recentKeys.has(cooldownKey)) continue;
            triggered.push({
              rule,
              context: { department: dept },
            });
          }
        }
        break;
      }

      case "blocked_attempt":
        // Only fire for tools that have "blocked" status in the system
        for (const attempt of batch.blockedAttempts) {
          const toolData = toolDataMap.get(attempt.toolId);
          if (toolData && toolData.status === "blocked") {
            const cooldownKey = `${rule.id}:tool:${attempt.toolId}`;
            if (recentKeys.has(cooldownKey)) continue;
            triggered.push({
              rule,
              context: {
                toolId: attempt.toolId,
                toolName: attempt.toolName,
                userEmail: attempt.userEmail,
              },
            });
          }
        }
        break;

      case "risk_score_exceeded": {
        const minScore = (rule.trigger_config?.risk_score_min as number) || 70;
        // Use pre-fetched tool data instead of N queries
        for (const toolId of batch.toolEventCounts.keys()) {
          const cooldownKey = `${rule.id}:tool:${toolId}`;
          if (recentKeys.has(cooldownKey)) continue;
          const toolData = toolDataMap.get(toolId);
          if (toolData && toolData.risk_score != null && toolData.risk_score >= minScore) {
            triggered.push({
              rule,
              context: {
                toolId,
                toolName: toolData.name,
                riskScore: toolData.risk_score,
              },
            });
          }
        }
        break;
      }

      case "new_user_detected":
        // Fire for users not previously seen in events (using pre-fetched data)
        for (const email of batch.allEmails) {
          if (!existingEmails.has(email)) {
            const cooldownKey = `${rule.id}:email:${email}`;
            if (recentKeys.has(cooldownKey)) continue;
            // Find the department for this specific user from batch context
            let userDept: string | undefined;
            for (const [, depts] of batch.toolDepartments) {
              if (depts.size > 0) {
                userDept = [...depts][0];
                break;
              }
            }
            triggered.push({
              rule,
              context: {
                userEmail: email,
                department: userDept,
              },
            });
          }
        }
        break;
    }
  }

  // Per-batch alert cap — hard safety net
  if (triggered.length > MAX_ALERTS_PER_BATCH) {
    logger.warn(
      `Alert cap reached: ${triggered.length} alerts truncated to ${MAX_ALERTS_PER_BATCH} for org ${organizationId}`
    );
    triggered.length = MAX_ALERTS_PER_BATCH;
  }

  // Send alerts for all triggered rules
  if (triggered.length > 0) {
    logger.debug(`🔔 ${triggered.length} alert(s) triggered for org ${organizationId}`);
    for (const { rule, context } of triggered) {
      try {
        await sendRuleAlert(organizationId, rule, context);
      } catch (error) {
        logger.error(`Failed to send alert for rule ${rule.id}:`, error);
      }
    }
  }
}
