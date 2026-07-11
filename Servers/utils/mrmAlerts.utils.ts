import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { getBreachNotificationRecipientsQuery } from "./mrmMonitoring.utils";

/**
 * MRM alerts (gaps #2+#3): recipient resolution, breach auto-finding, and
 * notification dispatch. The breach controller (handleBreaches) and the
 * revalidation sweep both call into this module so the logic stays
 * unit-testable without HTTP.
 */

/** Org-wide extra alert recipients (mrm_alert_recipients), sorted by user id. */
export const getAlertExtraRecipientsQuery = async (
  organizationId: number,
): Promise<number[]> => {
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
export const unionRecipients = (
  roleRecipients: number[],
  extraRecipients: number[],
): number[] => Array.from(new Set([...roleRecipients, ...extraRecipients]));

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
