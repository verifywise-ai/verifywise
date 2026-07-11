import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { getBreachNotificationRecipientsQuery } from "./mrmMonitoring.utils";
import { getOpenValidationForModelQuery } from "./mrmRevalidation.utils";
import { MrmEvalStatus, MrmThresholdSeverity } from "../domain.layer/enums/mrmMonitoring.enum";
import { MrmFindingSeverity } from "../domain.layer/enums/mrm.enum";

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

/** The model's assigned owner role user, or null. Lowest id wins if duplicated. */
const getModelOwnerUserIdQuery = async (
  organizationId: number,
  modelInventoryId: number,
  transaction?: Transaction,
): Promise<number | null> => {
  const rows = (await sequelize.query(
    `SELECT user_id FROM mrm_model_roles
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND role = 'owner'
        AND user_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 1`,
    {
      replacements: { organizationId, modelInventoryId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { user_id: number }[];
  return rows[0]?.user_id ?? null;
};

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
    const ownerId = await getModelOwnerUserIdQuery(organizationId, modelInventoryId, transaction);

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

    await transaction.commit();
    return rows[0].id;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
