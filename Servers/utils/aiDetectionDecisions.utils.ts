/**
 * @fileoverview AI Detection decision storage
 *
 * Tenant-scoped raw-SQL queries for decisions that must outlive a single scan:
 *
 * - Governance decisions: the latest governance status a user set for a
 *   finding on the repository's latest completed scan, keyed by organization +
 *   repository + finding identity (finding type, name, provider; compared
 *   case-insensitively), with the files the decided finding was in. Scan
 *   completion copies matching decisions onto the new scan's findings.
 * - Suggested risk actions: what a user did with an LLM-suggested risk on a
 *   scan (added to the risk register, or ignored with a reason).
 *
 * Every query filters on `organization_id`. Writes run in a transaction that
 * the caller opens with `beginOrganizationTransaction`, so the RLS
 * organization is bound before the first statement.
 *
 * @module utils/aiDetectionDecisions
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  GovernanceStatus,
  ISuggestedRiskAction,
  SuggestedRiskIgnoreReason,
  VULNERABILITY_FINDING_TYPES,
} from "../domain.layer/interfaces/i.aiDetection";
import { userDisplayNameSql, validateOrganizationId } from "./aiDetection.utils";

/**
 * Normalised key for a suggested risk: its name, trimmed and lower-cased.
 * Suggestions are regenerated when the score is recalculated, so the list
 * index is not stable; the name is.
 */
export function suggestionKey(riskName: string): string {
  return riskName.trim().toLowerCase().slice(0, 255);
}

/**
 * Open a transaction with the RLS organization bound as its first statement.
 *
 * A transaction opened by a service does not inherit the request's RLS
 * transaction (an explicit transaction bypasses the request scoping), so
 * `app.current_org` is set here, transaction-local, before any other query.
 */
export async function beginOrganizationTransaction(organizationId: number): Promise<Transaction> {
  validateOrganizationId(organizationId);
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(`SELECT set_config('app.current_org', :org, true)`, {
      replacements: { org: String(organizationId) },
      type: QueryTypes.SELECT,
      transaction,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  return transaction;
}

// Advisory lock classes (first key of pg_advisory_xact_lock(int4, int4)).
/** Serialises decision writes and decision application for one repository. */
const REPOSITORY_DECISIONS_LOCK = 1094992195;
/** Serialises actions on one suggested risk of one scan. */
const SUGGESTED_RISK_LOCK = 1094997842;

// ============================================================================
// Governance decisions
// ============================================================================

/** Lower-cased "owner/name" of the scan aliased `s`: the repository part of a decision's key. */
const REPOSITORY_KEY_SQL = `LOWER(s.repository_owner || '/' || s.repository_name)`;

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

/*
 * The distinct file paths of finding `f` (line numbers dropped). `file_paths`
 * is a JSONB array of { path, line_number, matched_text }; plain strings are
 * accepted too.
 */
const FILE_PATH_ELEMENT_SQL = `COALESCE(p.value->>'path', CASE WHEN jsonb_typeof(p.value) = 'string' THEN p.value #>> '{}' END)`;
const FINDING_PATHS_SQL = `ARRAY(
  SELECT DISTINCT ${FILE_PATH_ELEMENT_SQL}
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(f.file_paths) = 'array' THEN f.file_paths ELSE '[]'::jsonb END
  ) AS p(value)
  WHERE ${FILE_PATH_ELEMENT_SQL} IS NOT NULL
)::text[]`;

/**
 * Finding types whose risk is tied to where they are: a stored decision
 * other than "flagged" carries only while the finding stays in files the
 * decision covered. Library-like findings (libraries, API calls, models,
 * RAG components, agents) are decisions about the dependency itself; their
 * file paths are just the places it is used, so new usages keep the decision.
 */
export const PATH_SCOPED_FINDING_TYPES: readonly string[] = [
  "secret",
  "model_security",
  ...VULNERABILITY_FINDING_TYPES,
];

/**
 * Take the repository's decision lock for the rest of the transaction.
 * Decision writes and decision application both take it, so a status set on
 * the latest scan and a new scan's completion cannot interleave.
 */
async function lockRepositoryDecisions(
  organizationId: number,
  repositoryKey: string,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(`SELECT pg_advisory_xact_lock(:lockClass, hashtext(:lockKey)) AS locked`, {
    replacements: {
      lockClass: REPOSITORY_DECISIONS_LOCK,
      lockKey: `${organizationId}:${repositoryKey}`,
    },
    type: QueryTypes.SELECT,
    transaction,
  });
}

/**
 * Whether the scan is its repository's latest completed scan.
 *
 * @returns The repository key and whether the scan is the latest, or null
 *          when the scan is unknown or has no repository
 */
export async function getScanDecisionScopeQuery(
  scanId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<{ repository_key: string; is_latest_scan: boolean } | null> {
  validateOrganizationId(organizationId);
  const rows = (await sequelize.query(
    `
    SELECT
      ${REPOSITORY_KEY_SQL} AS repository_key,
      (s.id = (
        SELECT s2.id FROM ai_detection_scans s2
        WHERE s2.organization_id = s.organization_id
          AND LOWER(s2.repository_owner || '/' || s2.repository_name) = ${REPOSITORY_KEY_SQL}
          AND s2.status = 'completed'
        ORDER BY s2.completed_at DESC NULLS LAST, s2.id DESC
        LIMIT 1
      )) IS TRUE AS is_latest_scan
    FROM ai_detection_scans s
    WHERE s.id = :scanId AND s.organization_id = :organizationId
      AND s.repository_owner IS NOT NULL AND s.repository_name IS NOT NULL;
    `,
    { replacements: { scanId, organizationId }, type: QueryTypes.SELECT, transaction },
  )) as { repository_key: string; is_latest_scan: boolean }[];
  return rows[0] ?? null;
}

/**
 * Store, replace or remove the repository's decision for one finding, but
 * only when the finding's scan is the repository's latest completed scan.
 * The latest-scan check runs under the repository's decision lock in the
 * caller's transaction, so it holds for the write.
 *
 * A status stores (or replaces) the decision with the finding's risk rank and
 * file paths; null removes it, so later scans show the finding unreviewed.
 * The decision is read from the finding row itself, so it can only ever be
 * written for a finding in the caller's organization.
 *
 * @returns true when the stored decision was written or removed, false when
 *          the scan is not the latest (only the scan's own finding changed)
 */
export async function writeGovernanceDecisionQuery(
  findingId: number,
  scanId: number,
  governanceStatus: GovernanceStatus | null,
  userId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> {
  validateOrganizationId(organizationId);
  const scope = await getScanDecisionScopeQuery(scanId, organizationId, transaction);
  if (!scope) return false;

  await lockRepositoryDecisions(organizationId, scope.repository_key, transaction);
  // Re-read under the lock: a newer scan may have completed meanwhile
  const locked = await getScanDecisionScopeQuery(scanId, organizationId, transaction);
  if (!locked?.is_latest_scan) return false;

  const replacements = {
    finding_id: findingId,
    scan_id: scanId,
    governance_status: governanceStatus,
    user_id: userId,
    organizationId,
  };

  if (governanceStatus === null) {
    await sequelize.query(
      `
      DELETE FROM ai_detection_governance_decisions d
      USING ai_detection_findings f, ai_detection_scans s
      WHERE f.id = :finding_id AND f.scan_id = :scan_id AND f.organization_id = :organizationId
        AND s.id = f.scan_id AND s.organization_id = f.organization_id
        AND d.organization_id = f.organization_id
        AND d.repository_key = ${REPOSITORY_KEY_SQL}
        AND d.finding_type = f.finding_type
        AND d.finding_name_key = LOWER(f.name)
        AND d.provider_key = LOWER(COALESCE(f.provider, ''));
      `,
      { replacements, type: QueryTypes.DELETE, transaction },
    );
    return true;
  }

  await sequelize.query(
    `
    INSERT INTO ai_detection_governance_decisions (
      organization_id, repository_key, finding_type, finding_name_key, provider_key,
      governance_status, risk_rank, file_paths, source_scan_id, decided_by, decided_at
    )
    SELECT
      f.organization_id,
      ${REPOSITORY_KEY_SQL},
      f.finding_type,
      LOWER(f.name),
      LOWER(COALESCE(f.provider, '')),
      :governance_status,
      ${FINDING_RISK_RANK_SQL},
      ${FINDING_PATHS_SQL},
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
      file_paths = EXCLUDED.file_paths,
      source_scan_id = EXCLUDED.source_scan_id,
      decided_by = EXCLUDED.decided_by,
      decided_at = EXCLUDED.decided_at;
    `,
    { replacements, type: QueryTypes.INSERT, transaction },
  );
  return true;
}

/**
 * Copy stored decisions onto the findings of a newly completed scan.
 *
 * A decision is applied to a finding of the same repository with the same
 * type, name and provider (case-insensitive) when the finding has no status
 * yet and:
 * - its risk rank is not higher than when the decision was made, and
 * - for secret, model security and vulnerability findings, every file it is
 *   in was covered by the decision (paths compared without line numbers).
 * Otherwise it arrives unreviewed. "Flagged" is always carried: a risk that
 * grew or spread is still worth a flag. The finding keeps the original
 * decider and date.
 *
 * Runs in its own transaction, after the scan was committed: the RLS
 * organization is bound first, then the repository's decision lock is taken.
 *
 * @returns Number of findings that received a decision
 */
export async function applyGovernanceDecisionsToScanQuery(
  scanId: number,
  organizationId: number,
): Promise<number> {
  const transaction = await beginOrganizationTransaction(organizationId);
  try {
    const scope = await getScanDecisionScopeQuery(scanId, organizationId, transaction);
    if (!scope) {
      await transaction.commit();
      return 0;
    }
    await lockRepositoryDecisions(organizationId, scope.repository_key, transaction);

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
        AND d.repository_key = ${REPOSITORY_KEY_SQL}
        AND d.finding_type = f.finding_type
        AND d.finding_name_key = LOWER(f.name)
        AND d.provider_key = LOWER(COALESCE(f.provider, ''))
        AND (
          d.governance_status = 'flagged'
          OR (
            ${FINDING_RISK_RANK_SQL} <= d.risk_rank
            AND (
              f.finding_type NOT IN (:pathScopedTypes)
              OR ${FINDING_PATHS_SQL} <@ d.file_paths
            )
          )
        );
      `,
      {
        replacements: {
          scan_id: scanId,
          organizationId,
          pathScopedTypes: PATH_SCOPED_FINDING_TYPES,
        },
        transaction,
      },
    )) as [unknown, unknown];

    await transaction.commit();
    return typeof meta === "number" ? meta : ((meta as { rowCount?: number })?.rowCount ?? 0);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ============================================================================
// Suggested risk actions
// ============================================================================

const SUGGESTED_RISK_ACTION_COLUMNS_SQL = `
  a.id,
  a.scan_id,
  a.suggestion_key,
  a.risk_name,
  a.action,
  a.risk_id,
  a.ignore_reason,
  a.acted_by,
  a.acted_at,
  ${userDisplayNameSql("u")} AS acted_by_name,
  (a.action = 'added' AND (r.id IS NULL OR r.is_deleted = true)) AS risk_deleted
`;

const SUGGESTED_RISK_ACTION_JOINS_SQL = `
  LEFT JOIN users u ON u.id = a.acted_by
  LEFT JOIN risks r ON r.id = a.risk_id AND r.organization_id = a.organization_id
`;

/**
 * Take the lock for one suggestion of a scan for the rest of the transaction,
 * so two requests acting on the same suggestion run one after the other.
 */
export async function lockSuggestedRiskQuery(
  scanId: number,
  key: string,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  validateOrganizationId(organizationId);
  await sequelize.query(`SELECT pg_advisory_xact_lock(:lockClass, hashtext(:lockKey)) AS locked`, {
    replacements: {
      lockClass: SUGGESTED_RISK_LOCK,
      lockKey: `${organizationId}:${scanId}:${key}`,
    },
    type: QueryTypes.SELECT,
    transaction,
  });
}

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
    SELECT ${SUGGESTED_RISK_ACTION_COLUMNS_SQL}
    FROM ai_detection_suggested_risk_actions a
    ${SUGGESTED_RISK_ACTION_JOINS_SQL}
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
  transaction?: Transaction,
): Promise<ISuggestedRiskAction | null> {
  validateOrganizationId(organizationId);
  const rows = (await sequelize.query(
    `
    SELECT ${SUGGESTED_RISK_ACTION_COLUMNS_SQL}
    FROM ai_detection_suggested_risk_actions a
    ${SUGGESTED_RISK_ACTION_JOINS_SQL}
    WHERE a.scan_id = :scanId AND a.suggestion_key = :key AND a.organization_id = :organizationId;
    `,
    { replacements: { scanId, key, organizationId }, type: QueryTypes.SELECT, transaction },
  )) as ISuggestedRiskAction[];
  return rows[0] ?? null;
}

/**
 * Get one stored action of a scan by id, if any.
 */
export async function getSuggestedRiskActionByIdQuery(
  actionId: number,
  scanId: number,
  organizationId: number,
): Promise<ISuggestedRiskAction | null> {
  validateOrganizationId(organizationId);
  const rows = (await sequelize.query(
    `
    SELECT ${SUGGESTED_RISK_ACTION_COLUMNS_SQL}
    FROM ai_detection_suggested_risk_actions a
    ${SUGGESTED_RISK_ACTION_JOINS_SQL}
    WHERE a.id = :actionId AND a.scan_id = :scanId AND a.organization_id = :organizationId;
    `,
    { replacements: { actionId, scanId, organizationId }, type: QueryTypes.SELECT },
  )) as ISuggestedRiskAction[];
  return rows[0] ?? null;
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
  transaction: Transaction,
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
      transaction,
    },
  );
}

/**
 * Delete one stored ignore (undo it). An action that is not an ignore is
 * left alone.
 *
 * @returns true when an ignore was deleted
 */
export async function deleteIgnoredSuggestedRiskActionQuery(
  actionId: number,
  scanId: number,
  organizationId: number,
): Promise<boolean> {
  validateOrganizationId(organizationId);
  const rows = await sequelize.query(
    `
    DELETE FROM ai_detection_suggested_risk_actions
    WHERE id = :actionId AND scan_id = :scanId AND organization_id = :organizationId
      AND action = 'ignored'
    RETURNING id;
    `,
    { replacements: { actionId, scanId, organizationId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}
