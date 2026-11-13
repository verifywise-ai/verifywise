/**
 * Queries behind the AI Detection scan notifier
 * (services/aiDetection/scanNotifications.ts). Every query is scoped by
 * organization_id.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { IScan } from "../domain.layer/interfaces/i.aiDetection";

/** The fields of a finding the notifier compares and reports. */
export interface IScanFindingKey {
  name: string;
  provider: string | null;
  finding_type: string;
  risk_level: string | null;
}

/** One action row of an active automation, as the other triggers read it. */
export interface IAutomationActionRow {
  automation_id: number;
  action_key: string;
  params: Record<string, any> | null;
}

/**
 * The most recent completed scan of the same repository before `scan`, or
 * null when `scan` is the first. Any scan mode counts: the question is what
 * the repository looked like last time.
 */
export async function getPreviousCompletedScanQuery(
  scan: Pick<IScan, "id" | "repository_owner" | "repository_name" | "completed_at">,
  organizationId: number,
): Promise<IScan | null> {
  const rows = await sequelize.query<IScan>(
    `SELECT * FROM ai_detection_scans
      WHERE organization_id = :organizationId
        AND repository_owner = :owner
        AND repository_name = :repo
        AND status = 'completed'
        AND id <> :scanId
        AND (CAST(:completedAt AS timestamp) IS NULL OR completed_at <= CAST(:completedAt AS timestamp))
      ORDER BY completed_at DESC, id DESC
      LIMIT 1`,
    {
      replacements: {
        organizationId,
        owner: scan.repository_owner,
        repo: scan.repository_name,
        scanId: scan.id,
        completedAt: scan.completed_at ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0] ?? null;
}

/**
 * The findings of a scan that still count: not suppressed by a rule, not
 * suppressed or accepted by a reviewer, and not marked fixed by an
 * incremental scan. Same filter the risk score uses.
 */
export async function getCountedScanFindingsQuery(
  scanId: number,
  organizationId: number,
): Promise<IScanFindingKey[]> {
  return sequelize.query<IScanFindingKey>(
    `SELECT name, provider, finding_type, risk_level
       FROM ai_detection_findings
      WHERE organization_id = :organizationId
        AND scan_id = :scanId
        AND COALESCE(suppressed, FALSE) = FALSE
        AND COALESCE(governance_status, '') NOT IN ('suppressed', 'accepted_risk')
        AND COALESCE(finding_status, 'active') <> 'fixed'`,
    { replacements: { organizationId, scanId }, type: QueryTypes.SELECT },
  );
}

/** A user who may hear about a scan. */
export interface IScanRecipient {
  id: number;
  name: string;
  isTriggeredBy: boolean;
  isAdmin: boolean;
}

/**
 * The user who triggered the scan and the organization's Admins, one row per
 * user, and only while they are members of the organization: a user removed
 * since the scan gets nothing.
 */
export async function getScanRecipientsQuery(
  organizationId: number,
  triggeredBy: number | null | undefined,
): Promise<IScanRecipient[]> {
  const rows = await sequelize.query<{ user_id: number; role_id: number; name: string | null }>(
    `SELECT m.user_id, m.role_id, u.name
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = :organizationId
        AND (m.role_id = 1 OR m.user_id = :triggeredBy)`,
    {
      replacements: { organizationId, triggeredBy: triggeredBy ?? -1 },
      type: QueryTypes.SELECT,
    },
  );
  const byId = new Map<number, IScanRecipient>();
  for (const row of rows) {
    const id = Number(row.user_id);
    const existing = byId.get(id);
    const isAdmin = Number(row.role_id) === 1;
    byId.set(id, {
      id,
      name: row.name || existing?.name || "",
      isTriggeredBy: triggeredBy != null && id === Number(triggeredBy),
      isAdmin: isAdmin || (existing?.isAdmin ?? false),
    });
  }
  return [...byId.values()];
}

/**
 * Whether this scan was already announced. The notifier's own in-app rows
 * are the record (entity ai_detection_scan + the scan id), so a second call
 * for the same scan sends nothing.
 */
export async function hasScanNotificationQuery(
  organizationId: number,
  scanId: number,
  types: string[],
): Promise<boolean> {
  const rows = await sequelize.query(
    `SELECT 1 FROM notifications
      WHERE organization_id = :organizationId
        AND entity_type = 'ai_detection_scan'
        AND entity_id = :scanId
        AND type::text IN (:types)
      LIMIT 1`,
    { replacements: { organizationId, scanId, types }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

/**
 * Every action row of every active automation of the organization that uses
 * `triggerKey`, in action order. Same join the vendor and incident triggers use.
 */
export async function getActiveAutomationActionsQuery(
  organizationId: number,
  triggerKey: string,
): Promise<IAutomationActionRow[]> {
  return sequelize.query<IAutomationActionRow>(
    `SELECT a.id AS automation_id, paa.key AS action_key, aa.params
       FROM automation_triggers pat
       JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
       JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
       JOIN automation_actions paa ON aa.action_type_id = paa.id
      WHERE pat.key = :triggerKey AND a.is_active
      ORDER BY a.id ASC, aa."order" ASC`,
    { replacements: { organizationId, triggerKey }, type: QueryTypes.SELECT },
  );
}
