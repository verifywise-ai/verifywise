/**
 * @fileoverview AI Detection Risk Scoring Database Utils
 *
 * Database queries for risk scoring configuration and score storage.
 *
 * @module utils/aiDetectionRiskScoring
 */

import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { DimensionKey, DEFAULT_DIMENSION_WEIGHTS } from "../config/riskScoringConfig";
import type { IRiskScoreDetails } from "../domain.layer/interfaces/i.aiDetection";

// ============================================================================
// Organization ID Validation
// ============================================================================

function validateOrganizationId(organizationId: number): void {
  if (!organizationId || !Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error(`Invalid organization identifier: ${organizationId}`);
  }
}

// ============================================================================
// Types
// ============================================================================

export type VulnerabilityTypeKey =
  | "prompt_injection"
  | "pii_exposure"
  | "excessive_agency"
  | "jailbreak_risk"
  | "training_data_poisoning"
  | "model_dos"
  | "supply_chain"
  | "insecure_plugin"
  | "overreliance"
  | "model_theft";

export interface RiskScoringConfig {
  id: number;
  llm_enabled: boolean;
  llm_key_id: number | null;
  dimension_weights: Record<DimensionKey, number>;
  /** Effective value: the stored choice, or the default when none was made */
  vulnerability_scan_enabled: boolean;
  /** True when an admin chose the vulnerability toggle; false when it is the default */
  vulnerability_scan_explicit: boolean;
  vulnerability_types_enabled: Record<VulnerabilityTypeKey, boolean>;
  updated_by: number | null;
  updated_at: string;
}

export interface VulnerabilityConfig {
  id: number;
  organization_id: number;
  /** NULL when the org never chose */
  vulnerability_scan_enabled: boolean | null;
  vulnerability_types_enabled: Record<VulnerabilityTypeKey, boolean> | null;
  updated_by: number | null;
  updated_at: string;
}

export interface FindingForScoring {
  id: number;
  finding_type: string;
  confidence: string;
  risk_level: string;
  provider: string | null;
  license_risk: string | null;
  governance_status: string | null;
  suppressed: boolean;
  name: string;
  category: string;
  file_count: number;
}

function defaultVulnerabilityTypesEnabled(): Record<VulnerabilityTypeKey, boolean> {
  return {
    prompt_injection: true,
    pii_exposure: true,
    excessive_agency: true,
    jailbreak_risk: true,
    training_data_poisoning: true,
    model_dos: true,
    supply_chain: true,
    insecure_plugin: true,
    overreliance: true,
    model_theft: true,
  };
}

/**
 * Effective vulnerability detection setting.
 *
 * Vulnerability checks send code snippets to the org's LLM provider, so they
 * only run after an admin explicitly turns them on (the Settings page asks
 * for that choice when LLM analysis is first saved with a key). A stored
 * NULL means "not chosen yet" and resolves to off. They also need LLM
 * analysis with a key to run at all.
 */
export function resolveVulnerabilityScanEnabled(
  stored: boolean | null | undefined,
  llmEnabled: boolean | null | undefined,
  llmKeyId: number | null | undefined,
): boolean {
  return stored === true && llmEnabled === true && llmKeyId != null;
}

function mergeVulnerabilityConfig(
  config: RiskScoringConfig,
  vulnConfig: VulnerabilityConfig | null,
): RiskScoringConfig {
  const stored = vulnConfig?.vulnerability_scan_enabled ?? null;
  config.vulnerability_scan_enabled = resolveVulnerabilityScanEnabled(
    stored,
    config.llm_enabled,
    config.llm_key_id,
  );
  config.vulnerability_scan_explicit = stored !== null;
  config.vulnerability_types_enabled =
    vulnConfig?.vulnerability_types_enabled ?? defaultVulnerabilityTypesEnabled();
  return config;
}

// ============================================================================
// Risk Scoring Config Queries
// ============================================================================

/**
 * Get risk scoring config for an organization. Returns null if no config exists.
 */
export async function getRiskScoringConfigQuery(
  organizationId: number,
): Promise<RiskScoringConfig | null> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT id, organization_id, llm_enabled, llm_key_id, dimension_weights, updated_by, updated_at
    FROM ai_detection_risk_scoring_config
    WHERE organization_id = :organizationId
    ORDER BY id DESC LIMIT 1;
  `;

  const results = await sequelize.query(query, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  const config = (results as RiskScoringConfig[])[0] || null;
  if (!config) return null;

  // Merge vulnerability config from separate table
  const vulnConfig = await getVulnerabilityConfigQuery(organizationId);
  return mergeVulnerabilityConfig(config, vulnConfig);
}

/**
 * Get vulnerability scan config for an organization from the dedicated table.
 */
export async function getVulnerabilityConfigQuery(
  organizationId: number,
  transaction?: Transaction,
): Promise<VulnerabilityConfig | null> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT id, organization_id, vulnerability_scan_enabled, vulnerability_types_enabled, updated_by, updated_at
    FROM ai_detection_vulnerability_config
    WHERE organization_id = :organizationId
    LIMIT 1;
  `;

  const results = await sequelize.query(query, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
    transaction,
  });

  return (results as VulnerabilityConfig[])[0] || null;
}

function normalizeKeyId(value: number | string | null | undefined): number | null {
  return value == null ? null : Number(value);
}

/**
 * Whether a config save invalidates the vulnerability consent. Consent is
 * given for sending code to one provider: it no longer holds when the LLM
 * key changes (including clearing it) or LLM analysis is turned back on, so
 * the stored choice goes back to "not chosen" (off) and the Settings page
 * asks again. An explicit vulnerability_scan_enabled in the same save is
 * that new choice and wins.
 */
export function shouldResetVulnerabilityConsent(
  existing: { llm_enabled: boolean | null; llm_key_id: number | string | null } | null,
  data: {
    llm_enabled?: boolean;
    llm_key_id?: number | null;
    vulnerability_scan_enabled?: boolean;
  },
): boolean {
  if (data.vulnerability_scan_enabled !== undefined) return false;
  const keyChanged =
    data.llm_key_id !== undefined &&
    normalizeKeyId(data.llm_key_id) !== normalizeKeyId(existing?.llm_key_id);
  const reEnabled = data.llm_enabled === true && existing?.llm_enabled !== true;
  return keyChanged || reEnabled;
}

/**
 * Reset vulnerability consent when an edit to an LLM key changes where code
 * would be sent. Consent names a key, but the key record itself can be edited
 * to point at another provider or endpoint while keeping its id; then the
 * organization using that key goes back to "not chosen" (off) and the Settings
 * page asks again. Model-only or API-key-only edits keep the same provider and
 * keep consent. Call it inside the key update's transaction, BEFORE the
 * update, so the comparison sees the stored provider and URL.
 *
 * @param change.name New provider name, or undefined when not changing.
 * @param change.url New endpoint URL (null clears it), or undefined when not changing.
 */
export async function resetVulnerabilityConsentOnProviderChangeQuery(
  keyId: number,
  organizationId: number,
  change: { name?: string; url?: string | null },
  transaction: Transaction,
): Promise<void> {
  const nameSet = change.name !== undefined;
  const urlSet = change.url !== undefined;
  if (!nameSet && !urlSet) return;

  await sequelize.query(
    `
    UPDATE ai_detection_vulnerability_config v
    SET vulnerability_scan_enabled = NULL, updated_at = NOW()
    WHERE v.organization_id = :organizationId
      AND v.vulnerability_scan_enabled = true
      AND EXISTS (
        SELECT 1
        FROM ai_detection_risk_scoring_config r
        JOIN llm_keys k ON k.id = r.llm_key_id AND k.organization_id = r.organization_id
        WHERE r.organization_id = :organizationId
          AND r.llm_key_id = :keyId
          AND (
            (:nameSet AND k.name::text IS DISTINCT FROM CAST(:name AS text))
            OR (:urlSet AND k.url IS DISTINCT FROM CAST(:url AS text))
          )
      );
    `,
    {
      replacements: {
        organizationId,
        keyId,
        nameSet,
        urlSet,
        name: change.name ?? null,
        url: change.url ?? null,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
}

/**
 * Upsert risk scoring config for an organization.
 * If config exists, update it. Otherwise create it. Runs in one transaction,
 * so a key change and the consent reset it causes land together.
 */
export async function upsertRiskScoringConfigQuery(
  organizationId: number,
  data: {
    llm_enabled?: boolean;
    llm_key_id?: number | null;
    dimension_weights?: Record<DimensionKey, number>;
    vulnerability_scan_enabled?: boolean;
    vulnerability_types_enabled?: Record<VulnerabilityTypeKey, boolean>;
    updated_by: number;
  },
): Promise<RiskScoringConfig> {
  validateOrganizationId(organizationId);

  return sequelize.transaction(async (transaction) => {
    // Fetch existing config from the base risk scoring table (without merged vuln config).
    // Locked so concurrent saves can't both miss a key change.
    const baseQuery = `
      SELECT id, organization_id, llm_enabled, llm_key_id, dimension_weights, updated_by, updated_at
      FROM ai_detection_risk_scoring_config
      WHERE organization_id = :organizationId
      ORDER BY id DESC LIMIT 1
      FOR UPDATE;
    `;
    const baseResults = await sequelize.query(baseQuery, {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
      transaction,
    });
    const existing = (baseResults as RiskScoringConfig[])[0] || null;

    let config: RiskScoringConfig;

    if (existing) {
      const query = `
        UPDATE ai_detection_risk_scoring_config
        SET
          llm_enabled = COALESCE(:llm_enabled, llm_enabled),
          llm_key_id = CASE WHEN :has_llm_key_id THEN :llm_key_id ELSE llm_key_id END,
          dimension_weights = COALESCE(:dimension_weights, dimension_weights),
          updated_by = :updated_by,
          updated_at = NOW()
        WHERE id = :id AND organization_id = :organizationId
        RETURNING id, organization_id, llm_enabled, llm_key_id, dimension_weights, updated_by, updated_at;
      `;

      const results = await sequelize.query(query, {
        replacements: {
          id: existing.id,
          organizationId,
          llm_enabled: data.llm_enabled ?? null,
          has_llm_key_id: data.llm_key_id !== undefined,
          llm_key_id: data.llm_key_id ?? null,
          dimension_weights: data.dimension_weights ? JSON.stringify(data.dimension_weights) : null,
          updated_by: data.updated_by,
        },
        type: QueryTypes.SELECT,
        transaction,
      });

      config = (results as RiskScoringConfig[])[0];
    } else {
      const query = `
        INSERT INTO ai_detection_risk_scoring_config
          (organization_id, llm_enabled, llm_key_id, dimension_weights, updated_by, updated_at)
        VALUES
          (:organizationId, :llm_enabled, :llm_key_id, :dimension_weights, :updated_by, NOW())
        RETURNING id, organization_id, llm_enabled, llm_key_id, dimension_weights, updated_by, updated_at;
      `;

      const [results] = await sequelize.query(query, {
        replacements: {
          organizationId,
          llm_enabled: data.llm_enabled ?? false,
          llm_key_id: data.llm_key_id ?? null,
          dimension_weights: JSON.stringify(data.dimension_weights ?? DEFAULT_DIMENSION_WEIGHTS),
          updated_by: data.updated_by,
        },
        transaction,
      });

      config = (results as RiskScoringConfig[])[0];
    }

    // A new key or re-enabled LLM analysis needs a fresh vulnerability choice
    if (shouldResetVulnerabilityConsent(existing, data)) {
      await sequelize.query(
        `
        UPDATE ai_detection_vulnerability_config
        SET vulnerability_scan_enabled = NULL, updated_by = :updated_by, updated_at = NOW()
        WHERE organization_id = :organizationId;
      `,
        {
          replacements: { organizationId, updated_by: data.updated_by },
          type: QueryTypes.UPDATE,
          transaction,
        },
      );
    }

    // Upsert vulnerability scan config in the dedicated table
    if (
      data.vulnerability_scan_enabled !== undefined ||
      data.vulnerability_types_enabled !== undefined
    ) {
      await upsertVulnerabilityConfigQuery(
        organizationId,
        {
          vulnerability_scan_enabled: data.vulnerability_scan_enabled,
          vulnerability_types_enabled: data.vulnerability_types_enabled,
          updated_by: data.updated_by,
        },
        transaction,
      );
    }

    // Merge vulnerability config into the returned object
    const vulnConfig = await getVulnerabilityConfigQuery(organizationId, transaction);
    return mergeVulnerabilityConfig(config, vulnConfig);
  });
}

/**
 * Upsert vulnerability scan config in the dedicated table.
 */
async function upsertVulnerabilityConfigQuery(
  organizationId: number,
  data: {
    vulnerability_scan_enabled?: boolean;
    vulnerability_types_enabled?: Record<VulnerabilityTypeKey, boolean>;
    updated_by: number;
  },
  transaction?: Transaction,
): Promise<void> {
  // NULL = not chosen, which resolves to off (see resolveVulnerabilityScanEnabled)
  const insertVulnEnabled = data.vulnerability_scan_enabled ?? null;
  const insertTypesEnabled = data.vulnerability_types_enabled
    ? JSON.stringify(data.vulnerability_types_enabled)
    : null;

  const query = `
    INSERT INTO ai_detection_vulnerability_config
      (organization_id, vulnerability_scan_enabled, vulnerability_types_enabled, updated_by, updated_at)
    VALUES
      (:organizationId, :insert_vuln_enabled, :insert_types_enabled, :updated_by, NOW())
    ON CONFLICT (organization_id) DO UPDATE SET
      vulnerability_scan_enabled = COALESCE(:vulnerability_scan_enabled, ai_detection_vulnerability_config.vulnerability_scan_enabled),
      vulnerability_types_enabled = COALESCE(:vulnerability_types_enabled, ai_detection_vulnerability_config.vulnerability_types_enabled),
      updated_by = :updated_by,
      updated_at = NOW();
  `;

  await sequelize.query(query, {
    replacements: {
      organizationId,
      insert_vuln_enabled: insertVulnEnabled,
      insert_types_enabled: insertTypesEnabled,
      vulnerability_scan_enabled: data.vulnerability_scan_enabled ?? null,
      vulnerability_types_enabled: data.vulnerability_types_enabled
        ? JSON.stringify(data.vulnerability_types_enabled)
        : null,
      updated_by: data.updated_by,
    },
    transaction,
  });
}

// ============================================================================
// Scan Risk Score Queries
// ============================================================================

/**
 * Update risk score on a scan record.
 *
 * When onlyIfRunId is given, the update only applies while the stored
 * details still carry that llm_run_id. A background LLM result then can't
 * overwrite a newer recalculation. risk_score_calculated_at is kept in that
 * case, so it stays the time the run started.
 */
export async function updateScanRiskScoreQuery(
  scanId: number,
  score: number,
  grade: string,
  details: IRiskScoreDetails,
  organizationId: number,
  onlyIfRunId?: string,
): Promise<void> {
  validateOrganizationId(organizationId);
  const query = onlyIfRunId
    ? `
    UPDATE ai_detection_scans
    SET
      risk_score = :score,
      risk_score_grade = :grade,
      risk_score_details = :details,
      updated_at = NOW()
    WHERE id = :scanId AND organization_id = :organizationId
      AND risk_score_details->>'llm_run_id' = :runId;
  `
    : `
    UPDATE ai_detection_scans
    SET
      risk_score = :score,
      risk_score_grade = :grade,
      risk_score_details = :details,
      risk_score_calculated_at = NOW(),
      updated_at = NOW()
    WHERE id = :scanId AND organization_id = :organizationId;
  `;

  await sequelize.query(query, {
    replacements: {
      scanId,
      score,
      grade,
      details: JSON.stringify(details),
      organizationId,
      runId: onlyIfRunId ?? null,
    },
    type: QueryTypes.UPDATE,
  });
}

// ============================================================================
// Findings for Scoring
// ============================================================================

/**
 * Get all findings for a scan in a lightweight format suitable for scoring.
 */
export async function getAllFindingsForScoringQuery(
  scanId: number,
  organizationId: number,
): Promise<FindingForScoring[]> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT
      id,
      finding_type,
      confidence,
      COALESCE(risk_level, 'medium') as risk_level,
      provider,
      license_risk,
      governance_status,
      COALESCE(suppressed, FALSE) as suppressed,
      name,
      category,
      file_count
    FROM ai_detection_findings
    WHERE scan_id = :scanId AND organization_id = :organizationId
    ORDER BY
      CASE confidence
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      file_count DESC;
  `;

  const results = await sequelize.query(query, {
    replacements: { scanId, organizationId },
    type: QueryTypes.SELECT,
  });

  return results as FindingForScoring[];
}
