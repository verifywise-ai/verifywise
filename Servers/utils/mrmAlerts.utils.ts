import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  getBreachNotificationRecipientsQuery,
  getModelLabelQuery,
  getModelRoleUserIdQuery,
} from "./mrmMonitoring.utils";
import { getOpenValidationForModelQuery } from "./mrmRevalidation.utils";
import { getMrmOrgSettings, MrmOrgSettings } from "./mrmSettings.utils";
import { MrmEvalStatus, MrmThresholdSeverity } from "../domain.layer/enums/mrmMonitoring.enum";
import { MrmFindingSeverity, MrmModelRole } from "../domain.layer/enums/mrm.enum";
import { sendInAppNotification } from "../services/inAppNotification.service";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import {
  ICreateNotification,
  IEmailNotificationConfig,
  NotificationEntityType,
  NotificationType,
} from "../domain.layer/interfaces/i.notification";
import logger from "./logger/fileLogger";

/**
 * MRM alerts (gaps #2+#3): recipient resolution, breach auto-finding, and
 * notification dispatch. The breach controller (handleBreaches) and the
 * revalidation sweep both call into this module so the logic stays
 * unit-testable without HTTP.
 */

/** Org-wide extra alert recipients (mrm_alert_recipients), sorted by user id. */
export const getAlertExtraRecipientsQuery = async (organizationId: number): Promise<number[]> => {
  const rows = (await sequelize.query(
    `SELECT user_id FROM mrm_alert_recipients
      WHERE organization_id = :organizationId
      ORDER BY user_id ASC`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as { user_id: number }[];
  return rows.map((r) => r.user_id);
};

/** Replace the org's extra-recipient list wholesale (DELETE + INSERT). */
export const replaceAlertRecipientsQuery = async (
  organizationId: number,
  userIds: number[],
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `DELETE FROM mrm_alert_recipients WHERE organization_id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.DELETE, transaction },
  );
  if (userIds.length === 0) return;
  const values = userIds.map((_, i) => `(:organizationId, :userId_${i})`).join(", ");
  const replacements: Record<string, number> = { organizationId };
  userIds.forEach((id, i) => {
    replacements[`userId_${i}`] = id;
  });
  await sequelize.query(
    `INSERT INTO mrm_alert_recipients (organization_id, user_id) VALUES ${values}`,
    { replacements, type: QueryTypes.INSERT, transaction },
  );
};

/** Which of the given user ids belong to this org (for PUT validation). */
export const getOrgMemberIdsQuery = async (
  organizationId: number,
  userIds: number[],
): Promise<number[]> => {
  if (userIds.length === 0) return [];
  const rows = (await sequelize.query(
    `SELECT id FROM users
      WHERE organization_id = :organizationId AND id IN (:userIds)`,
    { replacements: { organizationId, userIds }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return rows.map((r) => r.id);
};

/** Role-derived recipients ∪ org-wide extras, deduped (roles first). */
export const unionRecipients = (roleRecipients: number[], extraRecipients: number[]): number[] =>
  Array.from(new Set([...roleRecipients, ...extraRecipients]));

/** The full alert audience for a model's breach/overdue notifications. */
export const getAlertRecipientsUnion = async (
  organizationId: number,
  modelInventoryId: number,
): Promise<number[]> => {
  const [roleRecipients, extraRecipients] = await Promise.all([
    getBreachNotificationRecipientsQuery(organizationId, modelInventoryId),
    getAlertExtraRecipientsQuery(organizationId),
  ]);
  return unionRecipients(roleRecipients, extraRecipients);
};

export interface MrmAlertContext {
  settings: MrmOrgSettings;
  extraRecipients: number[];
}

/** Org-constant inputs for alert dispatch, loadable once per run. */
export const loadMrmAlertContext = async (organizationId: number): Promise<MrmAlertContext> => {
  const [settings, extraRecipients] = await Promise.all([
    getMrmOrgSettings(organizationId),
    getAlertExtraRecipientsQuery(organizationId),
  ]);
  return { settings, extraRecipients };
};

/** Threshold severity → finding severity. warn never opens a finding. */
export const severityToFindingSeverity = (
  severity: MrmThresholdSeverity,
): MrmFindingSeverity | null => {
  if (severity === MrmThresholdSeverity.CRITICAL) return MrmFindingSeverity.CRITICAL;
  if (severity === MrmThresholdSeverity.HIGH) return MrmFindingSeverity.HIGH;
  return null;
};

/** Auto-finding trigger predicate: hard breaches only, and only when enabled. */
export const isAutoFindingEligible = (status: MrmEvalStatus, autoOpenEnabled: boolean): boolean =>
  autoOpenEnabled && status === MrmEvalStatus.BREACH;

/**
 * Auto-open a finding for a hard metric breach, once per (model, metric) while
 * an auto-finding is still in flight (stage <> 'closed'). Deliberately
 * segment-coarse: per-segment detail lives in the evaluation audit.
 *
 * Concurrency: the dedup check + INSERT run in one short transaction that
 * first locks the model row FOR UPDATE — findings are permanent (no hard
 * delete), so two racing ingestions must not both create one. A partial
 * UNIQUE index was rejected in the spec: it would leak a DB error into a
 * human reopening an old closed auto-finding.
 *
 * Returns the new finding id, or null when skipped. Throws on DB errors —
 * the caller logs and swallows so ingestion is never poisoned.
 */
export const maybeAutoOpenFindingForBreach = async (
  organizationId: number,
  modelInventoryId: number,
  metric: string,
  status: MrmEvalStatus,
  thresholdSeverity: MrmThresholdSeverity,
  autoOpenEnabled: boolean,
): Promise<number | null> => {
  if (!isAutoFindingEligible(status, autoOpenEnabled)) return null;
  const severity = severityToFindingSeverity(thresholdSeverity);
  if (!severity) return null;

  const transaction = await sequelize.transaction();
  try {
    const lock = (await sequelize.query(
      `SELECT id FROM model_inventories
        WHERE id = :modelInventoryId AND organization_id = :organizationId
        FOR UPDATE`,
      {
        replacements: { organizationId, modelInventoryId },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];
    if (lock.length === 0) {
      await transaction.rollback();
      return null;
    }

    const inFlight = (await sequelize.query(
      `SELECT id FROM mrm_findings
        WHERE organization_id = :organizationId
          AND model_inventory_id = :modelInventoryId
          AND auto_metric = :metric
          AND stage <> 'closed'
        LIMIT 1`,
      {
        replacements: { organizationId, modelInventoryId, metric },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];
    if (inFlight.length > 0) {
      await transaction.rollback();
      return null;
    }

    const openValidation = await getOpenValidationForModelQuery(
      organizationId,
      modelInventoryId,
      transaction,
    );
    const ownerId = await getModelRoleUserIdQuery(
      organizationId,
      modelInventoryId,
      MrmModelRole.OWNER,
      transaction,
    );

    const rows = (await sequelize.query(
      `INSERT INTO mrm_findings
         (organization_id, model_inventory_id, validation_id, title, severity,
          stage, owner_id, auto_metric, closed_verified, created_at, updated_at)
       VALUES
         (:organizationId, :modelInventoryId, :validationId, :title, :severity,
          'open', :ownerId, :metric, false, now(), now())
       RETURNING id`,
      {
        replacements: {
          organizationId,
          modelInventoryId,
          validationId: openValidation?.id ?? null,
          title: `Metric breach: ${metric}`,
          severity,
          ownerId,
          metric,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];

    if (!rows[0]) {
      throw new Error("mrm_findings INSERT returned no row");
    }

    await transaction.commit();
    return rows[0].id;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Fan an alert out to every recipient via the standard dual-dispatch entry
 * point (in-app always; email when the org enabled it — sendInAppNotification
 * gates and swallows email failures itself). Per-recipient try/catch so one
 * failing recipient never blocks the rest; never throws.
 */
export const dispatchAlerts = async (
  organizationId: number,
  recipients: number[],
  notification: Omit<ICreateNotification, "user_id">,
  emailEnabled: boolean,
  email: IEmailNotificationConfig,
): Promise<void> => {
  for (const userId of recipients) {
    try {
      await sendInAppNotification(
        organizationId,
        { ...notification, user_id: userId },
        emailEnabled,
        email,
      );
    } catch (error) {
      logger.error("❌ Failed to dispatch MRM alert notification:", error);
    }
  }
};

/**
 * Atomically claim the ONE overdue nudge a validation lifecycle gets. Returns
 * true only for the caller that flips overdue_notified_at from NULL — every
 * later daily sweep finds the claim taken and stays silent. A new validation
 * row (next cycle) starts at NULL and notifies once again.
 */
export const claimOverdueNotificationQuery = async (
  organizationId: number,
  validationId: number,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `UPDATE mrm_validations
        SET overdue_notified_at = now()
      WHERE id = :validationId
        AND organization_id = :organizationId
        AND overdue_notified_at IS NULL
      RETURNING id`,
    {
      replacements: { organizationId, validationId },
      type: QueryTypes.SELECT,
    },
  )) as { id: number }[];
  return rows.length > 0;
};

/**
 * Overdue-validation alert (spec §4, amended 2026-07-11): fired by the
 * revalidation sweep — BOTH the daily BullMQ job and the on-demand endpoint
 * call the same sweep function. Claim first: the lifecycle's single nudge is
 * consumed even when nobody is assigned to hear it (consistent with the
 * breach path's "recorded, but no one assigned to notify").
 */
export const notifyRevalidationDue = async (
  organizationId: number,
  modelInventoryId: number,
  validationId: number,
  nextDue: Date | null,
  loadContext: () => Promise<MrmAlertContext> = () => loadMrmAlertContext(organizationId),
): Promise<void> => {
  const claimed = await claimOverdueNotificationQuery(organizationId, validationId);
  if (!claimed) return;

  const ctx = await loadContext();
  const roleRecipients = await getBreachNotificationRecipientsQuery(
    organizationId,
    modelInventoryId,
  );
  const recipients = unionRecipients(roleRecipients, ctx.extraRecipients);
  if (recipients.length === 0) return;

  const label = (await getModelLabelQuery(organizationId, modelInventoryId)) ?? "a model";
  const dueDate = nextDue ? new Date(nextDue).toISOString().slice(0, 10) : "unknown";
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const validationPath = "/model-inventory/model-risk-management/validation";

  await dispatchAlerts(
    organizationId,
    recipients,
    {
      type: NotificationType.MRM_REVALIDATION_DUE,
      title: `Validation overdue: ${label}`,
      message: `${label} — periodic revalidation was due on ${dueDate} and has not been started.`,
      entity_type: NotificationEntityType.MODEL,
      entity_id: modelInventoryId,
      entity_name: label,
      action_url: validationPath,
    },
    ctx.settings.alert_email_enabled,
    {
      template: EMAIL_TEMPLATES.MRM_REVALIDATION_DUE,
      subject: `Validation overdue: ${label}`,
      variables: {
        model_label: label,
        due_date: dueDate,
        validation_url: `${baseUrl}${validationPath}`,
      },
    },
  );
};
