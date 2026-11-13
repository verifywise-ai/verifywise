/**
 * @fileoverview AI Detection decision storage
 *
 * Tenant-scoped raw-SQL queries for decisions that must outlive a single scan:
 *
 * - Governance decisions: the latest governance status a user set for a
 *   finding, keyed by organization + repository + finding identity
 *   (finding type, name, provider; compared case-insensitively). Scan
 *   completion copies matching decisions onto the new scan's findings.
 * - Suggested risk actions: what a user did with an LLM-suggested risk on a
 *   scan (added to the risk register, or ignored with a reason).
 *
 * Every query filters on `organization_id`.
 *
 * @module utils/aiDetectionDecisions
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  GovernanceStatus,
  ISuggestedRiskAction,
  SuggestedRiskIgnoreReason,
} from "../domain.layer/interfaces/i.aiDetection";

function validateOrganizationId(organizationId: number): void {
  if (!organizationId || !Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error(`Invalid organization identifier: ${organizationId}`);
  }
}

/**
 * Normalised key for a suggested risk: its name, trimmed and lower-cased.
 * Suggestions are regenerated when the score is recalculated, so the list
 * index is not stable; the name is.
 */
export function suggestionKey(riskName: string): string {
  return riskName.trim().toLowerCase().slice(0, 255);
}

// ============================================================================
// Governance decisions
// ============================================================================

/*
 * How serious a finding is, as one number: the higher of its risk level
 * (low 1, medium 2, high 3) and its security severity (low 1 … critical 4).
 * A stored decision is not carried onto a later finding whose rank is higher,
 * so a risk that grew since the review is reviewed again.
 */
const FINDING_RISK_RANK_SQL = `GREATEST(
  CASE LOWER(COALESCE(f.risk_level, ''))
    WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 0 END,
  CASE LOWER(COALESCE(f.severity, ''))
    WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 WHEN 'critical' THEN 4 ELSE 0 END
)`;

/**
 * Store (or replace) the decision for the identity of one finding.
 * Reads the identity from the finding row itself, so it can only ever write
 * a decision for a finding in the caller's organization.
 */
export async function upsertGovernanceDecisionQuery(
  findingId: number,
  scanId: number,
  governanceStatus: GovernanceStatus,
  userId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> {
  validateOrganizationId(organizationId);
  await sequelize.query(
    `
    INSERT INTO ai_detection_governance_decisions (
      organization_id, repository_key, finding_type, finding_name_key, provider_key,
      governance_status, risk_rank, source_scan_id, decided_by, decided_at
    )
    SELECT
      f.organization_id,
      LOWER(s.repository_owner || '/' || s.repository_name),
      f.finding_type,
      LOWER(f.name),
      LOWER(COALESCE(f.provider, '')),
      :governance_status,
      ${FINDING_RISK_RANK_SQL},
      f.scan_id,
      (SELECT u.id FROM users u WHERE u.id = :user_id),
      NOW()
    FROM ai_detection_findings f
    JOIN ai_detection_scans s ON s.id = f.scan_id AND s.organization_id = f.organization_id
    WHERE f.id = :finding_id AND f.scan_id = :scan_id AND f.organization_id = :organizationId
      AND s.repository_owner IS NOT NULL AND s.repository_name IS NOT NULL
    ON CONFLICT (organization_id, repository_key, finding_type, finding_name_key, provider_key)
    DO UPDATE SET
      governance_status = EXCLUDED.governance_status,
      risk_rank = EXCLUDED.risk_rank,
      source_scan_id = EXCLUDED.source_scan_id,
      decided_by = EXCLUDED.decided_by,
      decided_at = EXCLUDED.decided_at;
    `,
    {
      replacements: {
        finding_id: findingId,
        scan_id: scanId,
        governance_status: governanceStatus,
        user_id: userId,
        organizationId,
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
}

/**
 * Remove the stored decision for the identity of one finding (the user
 * cleared its status), so later scans show it as unreviewed.
 */
export async function deleteGovernanceDecisionQuery(
  findingId: number,
  scanId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> {
  validateOrganizationId(organizationId);
  await sequelize.query(
    `
    DELETE FROM ai_detection_governance_decisions d
    USING ai_detection_findings f, ai_detection_scans s
    WHERE f.id = :finding_id AND f.scan_id = :scan_id AND f.organization_id = :organizationId
      AND s.id = f.scan_id AND s.organization_id = f.organization_id
      AND d.organization_id = f.organization_id
      AND d.repository_key = LOWER(s.repository_owner || '/' || s.repository_name)
      AND d.finding_type = f.finding_type
      AND d.finding_name_key = LOWER(f.name)
      AND d.provider_key = LOWER(COALESCE(f.provider, ''));
    `,
    {
      replacements: { finding_id: findingId, scan_id: scanId, organizationId },
      type: QueryTypes.DELETE,
      transaction,
    },
  );
}

/**
 * Copy stored decisions onto the findings of a newly completed scan.
 *
 * A decision is applied to a finding of the same repository with the same
 * type, name and provider (case-insensitive) when the finding has no status
 * yet and its risk rank is not higher than when the decision was made.
 * "Flagged" is always carried: a risk that grew is still worth a flag.
 * The finding keeps the original decider and date.
 *
 * Runs inside the scan's completion transaction. The scan runs outside the
 * request, so the RLS organization is bound here for the transaction.
 *
 * @returns Number of findings that received a decision
 */
export async function applyGovernanceDecisionsToScanQuery(
  scanId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number> {
  validateOrganizationId(organizationId);
  await sequelize.query(`SELECT set_config('app.current_org', :org, true)`, {
    replacements: { org: String(organizationId) },
    type: QueryTypes.SELECT,
    transaction,
  });

  const [, meta] = (await sequelize.query(
    `
    UPDATE ai_detection_findings f
    SET
      governance_status = d.governance_status,
      governance_updated_at = d.decided_at,
      governance_updated_by = d.decided_by
    FROM ai_detection_scans s, ai_detection_governance_decisions d
    WHERE f.scan_id = :scan_id AND f.organization_id = :organizationId
      AND f.governance_status IS NULL
      AND s.id = f.scan_id AND s.organization_id = f.organization_id
      AND d.organization_id = f.organization_id
      AND d.repository_key = LOWER(s.repository_owner || '/' || s.repository_name)
      AND d.finding_type = f.finding_type
      AND d.finding_name_key = LOWER(f.name)
      AND d.provider_key = LOWER(COALESCE(f.provider, ''))
      AND (d.governance_status = 'flagged' OR ${FINDING_RISK_RANK_SQL} <= d.risk_rank);
    `,
    {
      replacements: { scan_id: scanId, organizationId },
      transaction,
    },
  )) as [unknown, unknown];

  return typeof meta === "number" ? meta : ((meta as { rowCount?: number })?.rowCount ?? 0);
}

// ============================================================================
// Suggested risk actions
// ============================================================================

/**
 * List what was done with the suggested risks of a scan. `risk_deleted` is
 * true when the risk created from a suggestion has since been deleted.
 */
export async function listSuggestedRiskActionsQuery(
  scanId: number,
  organizationId: number,
): Promise<ISuggestedRiskAction[]> {
  validateOrganizationId(organizationId);
  const rows = await sequelize.query(
    `
    SELECT
      a.id,
      a.scan_id,
      a.suggestion_key,
      a.risk_name,
      a.action,
      a.risk_id,
      a.ignore_reason,
      a.acted_by,
      a.acted_at,
      NULLIF(TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))), '') AS acted_by_name,
      (a.action = 'added' AND (r.id IS NULL OR r.is_deleted = true)) AS risk_deleted
    FROM ai_detection_suggested_risk_actions a
    LEFT JOIN users u ON u.id = a.acted_by
    LEFT JOIN risks r ON r.id = a.risk_id AND r.organization_id = a.organization_id
    WHERE a.scan_id = :scanId AND a.organization_id = :organizationId
    ORDER BY a.acted_at ASC, a.id ASC;
    `,
    { replacements: { scanId, organizationId }, type: QueryTypes.SELECT },
  );
  return rows as ISuggestedRiskAction[];
}

/**
 * Get the action stored for one suggestion of a scan, if any.
 */
export async function getSuggestedRiskActionQuery(
  scanId: number,
  key: string,
  organizationId: number,
): Promise<ISuggestedRiskAction | null> {
  const rows = await listSuggestedRiskActionsQuery(scanId, organizationId);
  return rows.find((r) => r.suggestion_key === key) ?? null;
}

/**
 * True when the risk exists, is not deleted and belongs to the organization.
 */
export async function riskExistsInOrganizationQuery(
  riskId: number,
  organizationId: number,
): Promise<boolean> {
  validateOrganizationId(organizationId);
  const rows = await sequelize.query(
    `SELECT id FROM risks WHERE id = :riskId AND organization_id = :organizationId AND is_deleted = false`,
    { replacements: { riskId, organizationId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

/**
 * Record (or replace) the action taken on one suggestion of a scan.
 */
export async function upsertSuggestedRiskActionQuery(
  input: {
    scanId: number;
    riskName: string;
    action: "added" | "ignored";
    riskId: number | null;
    ignoreReason: SuggestedRiskIgnoreReason | null;
  },
  userId: number,
  organizationId: number,
): Promise<void> {
  validateOrganizationId(organizationId);
  await sequelize.query(
    `
    INSERT INTO ai_detection_suggested_risk_actions (
      organization_id, scan_id, suggestion_key, risk_name, action,
      risk_id, ignore_reason, acted_by, acted_at
    ) VALUES (
      :organizationId, :scanId, :suggestionKey, :riskName, :action,
      :riskId, :ignoreReason, :userId, NOW()
    )
    ON CONFLICT (organization_id, scan_id, suggestion_key) DO UPDATE SET
      risk_name = EXCLUDED.risk_name,
      action = EXCLUDED.action,
      risk_id = EXCLUDED.risk_id,
      ignore_reason = EXCLUDED.ignore_reason,
      acted_by = EXCLUDED.acted_by,
      acted_at = EXCLUDED.acted_at;
    `,
    {
      replacements: {
        organizationId,
        scanId: input.scanId,
        suggestionKey: suggestionKey(input.riskName),
        riskName: input.riskName.trim().slice(0, 500),
        action: input.action,
        riskId: input.riskId,
        ignoreReason: input.ignoreReason,
        userId,
      },
      type: QueryTypes.INSERT,
    },
  );
}

/**
 * Delete one stored action (undo an ignore).
 *
 * @returns true when a row was deleted
 */
export async function deleteSuggestedRiskActionQuery(
  actionId: number,
  scanId: number,
  organizationId: number,
): Promise<boolean> {
  validateOrganizationId(organizationId);
  const rows = await sequelize.query(
    `
    DELETE FROM ai_detection_suggested_risk_actions
    WHERE id = :actionId AND scan_id = :scanId AND organization_id = :organizationId
    RETURNING id;
    `,
    { replacements: { actionId, scanId, organizationId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

/**
 * Display name ("First Last") of a user, or null when the user is unknown.
 */
export async function getUserDisplayNameQuery(userId: number): Promise<string | null> {
  const rows = (await sequelize.query(
    `SELECT NULLIF(TRIM(CONCAT(name, ' ', COALESCE(surname, ''))), '') AS display_name
       FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  )) as { display_name: string | null }[];
  return rows[0]?.display_name ?? null;
}
