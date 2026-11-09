import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { AIIncidentManagementStatus } from "../../domain.layer/enums/ai-incident-management.enum";
import { SETTLED_RECHECK_HOURS, type EventKind, type LinkState } from "./jiraIncidents.constants";

export interface LinkRow {
  id: number;
  incident_id: number | null;
  jira_issue_id: string;
  jira_issue_key: string;
  jira_url: string;
  last_jira_status_id: string | null;
  last_vw_status: string | null;
  state: LinkState;
  state_reason: string | null;
}

const LINK_COLUMNS = `id, incident_id, jira_issue_id, jira_issue_key, jira_url, last_jira_status_id,
  last_vw_status, state, state_reason`;

async function select<T>(
  sql: string,
  replacements: Record<string, unknown>,
  transaction?: Transaction,
): Promise<T[]> {
  return (await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
    transaction,
  })) as T[];
}

export async function linkExists(
  orgId: number,
  jiraIssueId: string,
  t?: Transaction,
): Promise<boolean> {
  const found = await select<{ id: number }>(
    `SELECT id FROM jira_incident_links
      WHERE organization_id = :orgId AND jira_issue_id = :jiraIssueId LIMIT 1`,
    { orgId, jiraIssueId },
    t,
  );
  return found.length > 0;
}

/** Null when the issue (or the incident) is already linked. */
export async function insertLink(
  orgId: number,
  link: {
    incidentId: number;
    jiraIssueId: string;
    jiraIssueKey: string;
    jiraUrl: string;
    jiraStatusId: string;
    vwStatus: string;
    remoteLinkPending?: boolean;
  },
  t: Transaction,
): Promise<number | null> {
  const inserted = await select<{ id: number }>(
    `INSERT INTO jira_incident_links
       (organization_id, incident_id, jira_issue_id, jira_issue_key, jira_url,
        last_jira_status_id, last_vw_status, remote_link_pending, last_synced_at)
     VALUES (:orgId, :incidentId, :jiraIssueId, :jiraIssueKey, :jiraUrl, :jiraStatusId, :vwStatus,
             :remoteLinkPending, now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    { orgId, ...link, remoteLinkPending: link.remoteLinkPending ?? false },
    t,
  );
  return inserted[0]?.id ?? null;
}

export async function updateLinkSnapshot(
  orgId: number,
  linkId: number,
  s: {
    jiraStatusId: string;
    vwStatus: string;
    jiraIssueKey: string;
    state: LinkState;
    stateReason: string | null;
  },
  t?: Transaction,
): Promise<void> {
  await sequelize.query(
    `UPDATE jira_incident_links
        SET last_jira_status_id = :jiraStatusId, last_vw_status = :vwStatus,
            jira_issue_key = :jiraIssueKey, state = :state, state_reason = :stateReason,
            last_synced_at = now(), updated_at = now()
      WHERE organization_id = :orgId AND id = :linkId`,
    { replacements: { orgId, linkId, ...s }, transaction: t },
  );
}

export async function setLinkState(
  orgId: number,
  linkId: number,
  state: LinkState,
  reason: string | null,
  t?: Transaction,
): Promise<void> {
  await sequelize.query(
    `UPDATE jira_incident_links
        SET state = :state, state_reason = :reason, updated_at = now()
      WHERE organization_id = :orgId AND id = :linkId`,
    { replacements: { orgId, linkId, state, reason }, transaction: t },
  );
}

/**
 * Linked, non-archived incidents whose link still needs syncing, in id order
 * after `afterId`. A settled link (ok, Closed in VerifyWise and in the
 * snapshot) is only due once SETTLED_RECHECK_HOURS have passed since its last
 * check, so a reopen in Jira can take that long to arrive; a VerifyWise
 * change unsettles it at once, and a manual run (`recheckSettled`) reads it.
 */
export async function listSyncableLinks(
  orgId: number,
  afterId: number,
  limit: number,
  recheckSettled = false,
): Promise<Array<LinkRow & { vw_status: string; linked_at: Date }>> {
  return select(
    `SELECT l.id, l.incident_id, l.jira_issue_id, l.jira_issue_key, l.jira_url, l.last_jira_status_id,
            l.last_vw_status, l.state, l.state_reason, l.created_at AS linked_at, i.status AS vw_status
       FROM jira_incident_links l
       JOIN ai_incident_managements i ON i.id = l.incident_id AND i.organization_id = l.organization_id
      WHERE l.organization_id = :orgId AND l.id > :afterId
        AND l.state IN ('ok', 'error', 'conflict', 'deleted_in_jira')
        AND COALESCE(i.archived, false) = false
        AND (:recheckSettled OR NOT (
          l.state = 'ok' AND i.status = :closed AND l.last_vw_status = :closed
          AND COALESCE(l.last_synced_at, '-infinity') >= now() - make_interval(hours => :settledHours)
        ))
      ORDER BY l.id
      LIMIT :limit`,
    {
      orgId,
      afterId,
      limit,
      closed: AIIncidentManagementStatus.CLOSED,
      settledHours: SETTLED_RECHECK_HOURS,
      recheckSettled,
    },
  );
}

export interface PendingRemoteLink {
  linkId: number;
  jiraIssueId: string;
  jiraIssueKey: string;
  incidentId: number;
  incidentCode: string;
  /** A previous attempt failed (and recorded its error event). */
  triedBefore: boolean;
}

/**
 * Live links whose Jira issue may still lack the link back to VerifyWise:
 * never-tried first, then the longest since their last failed attempt.
 */
export async function listPendingRemoteLinks(
  orgId: number,
  excludeIds: number[],
  limit: number,
): Promise<PendingRemoteLink[]> {
  return select(
    `SELECT l.id AS "linkId", l.jira_issue_id AS "jiraIssueId", l.jira_issue_key AS "jiraIssueKey",
            l.incident_id AS "incidentId", i.incident_id AS "incidentCode",
            l.remote_link_tried_at IS NOT NULL AS "triedBefore"
       FROM jira_incident_links l
       JOIN ai_incident_managements i ON i.id = l.incident_id AND i.organization_id = l.organization_id
      WHERE l.organization_id = :orgId AND l.remote_link_pending
        AND l.state IN ('ok', 'error', 'conflict') AND l.id NOT IN (:excludeIds)
      ORDER BY l.remote_link_tried_at NULLS FIRST, l.id
      LIMIT :limit`,
    // Ids are positive; 0 keeps the IN list non-empty.
    { orgId, excludeIds: excludeIds.length > 0 ? excludeIds : [0], limit },
  );
}

/** Clears the flag once Jira has the link, or records a failed attempt. */
export async function setRemoteLinkOutcome(
  orgId: number,
  linkId: number,
  added: boolean,
): Promise<void> {
  await sequelize.query(
    added
      ? `UPDATE jira_incident_links SET remote_link_pending = false, remote_link_tried_at = NULL,
                updated_at = now()
          WHERE organization_id = :orgId AND id = :linkId`
      : `UPDATE jira_incident_links SET remote_link_tried_at = now(), updated_at = now()
          WHERE organization_id = :orgId AND id = :linkId`,
    { replacements: { orgId, linkId } },
  );
}

export async function lockLink(
  orgId: number,
  linkId: number,
  t: Transaction,
): Promise<LinkRow | null> {
  const found = await select<LinkRow>(
    `SELECT ${LINK_COLUMNS} FROM jira_incident_links
      WHERE organization_id = :orgId AND id = :linkId FOR UPDATE`,
    { orgId, linkId },
    t,
  );
  return found[0] ?? null;
}

/** The incident's current status and archived flag, row-locked for the transaction; null if gone. */
export async function lockIncidentStatus(
  orgId: number,
  incidentId: number,
  t: Transaction,
): Promise<{ status: string; archived: boolean } | null> {
  const found = await select<{ status: string; archived: boolean | null }>(
    `SELECT status, archived FROM ai_incident_managements
      WHERE organization_id = :orgId AND id = :incidentId FOR UPDATE`,
    { orgId, incidentId },
    t,
  );
  return found[0] ? { status: found[0].status, archived: !!found[0].archived } : null;
}

export async function latestVwStatusChangeAt(
  orgId: number,
  incidentId: number,
): Promise<Date | null> {
  const found = await select<{ at: Date | string | null }>(
    `SELECT MAX(changed_at) AT TIME ZONE 'UTC' AS at FROM incident_change_history
      WHERE organization_id = :orgId AND incident_id = :incidentId AND field_name = 'Status'`,
    { orgId, incidentId },
  );
  // changed_at is a timestamp without time zone written in UTC (Sequelize sets every session to +00:00);
  // AT TIME ZONE turns it into an instant so the driver does not guess.
  const at = found[0]?.at;
  return at ? new Date(at) : null;
}

export async function insertEvent(
  orgId: number,
  e: {
    linkId: number | null;
    runId: number | null;
    kind: EventKind;
    detail: Record<string, unknown>;
  },
  t?: Transaction,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO jira_incident_sync_events (organization_id, link_id, run_id, kind, detail)
     VALUES (:orgId, :linkId, :runId, :kind, CAST(:detail AS JSONB))`,
    {
      replacements: {
        orgId,
        linkId: e.linkId,
        runId: e.runId,
        kind: e.kind,
        detail: JSON.stringify(e.detail),
      },
      transaction: t,
    },
  );
}

export async function listEvents(
  orgId: number,
  limit: number,
): Promise<
  Array<{
    id: number;
    kind: EventKind;
    detail: Record<string, unknown>;
    created_at: string;
    incident_id: number | null;
    incident_code: string | null;
    jira_issue_key: string | null;
    jira_url: string | null;
  }>
> {
  const found = await select<{
    id: number;
    kind: EventKind;
    detail: Record<string, unknown>;
    created_at: Date | string;
    incident_id: number | null;
    incident_code: string | null;
    jira_issue_key: string | null;
    jira_url: string | null;
  }>(
    `SELECT e.id, e.kind, e.detail, e.created_at, l.incident_id, i.incident_id AS incident_code,
            l.jira_issue_key, l.jira_url
       FROM jira_incident_sync_events e
       LEFT JOIN jira_incident_links l ON l.id = e.link_id AND l.organization_id = e.organization_id
       LEFT JOIN ai_incident_managements i ON i.id = l.incident_id AND i.organization_id = l.organization_id
      WHERE e.organization_id = :orgId
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT :limit`,
    { orgId, limit },
  );
  return found.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}

export async function linksForIncidents(
  orgId: number,
  incidentIds: number[],
): Promise<
  Array<{
    incident_id: number;
    jira_issue_key: string;
    jira_url: string;
    state: LinkState;
    state_reason: string | null;
  }>
> {
  if (incidentIds.length === 0) return [];
  return select(
    `SELECT incident_id, jira_issue_key, jira_url, state, state_reason
       FROM jira_incident_links
      WHERE organization_id = :orgId AND incident_id IN (:incidentIds)`,
    { orgId, incidentIds },
  );
}
