/**
 * @fileoverview AI Detection Risk Scoring Database Utils
 *
 * Database queries for risk scoring configuration and score storage.
 *
 * @module utils/aiDetectionRiskScoring
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { DimensionKey, DEFAULT_DIMENSION_WEIGHTS } from "../config/riskScoringConfig";

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
  vulnerability_scan_enabled: boolean;
  vulnerability_types_enabled: Record<VulnerabilityTypeKey, boolean>;
  updated_by: number | null;
  updated_at: string;
}

export interface VulnerabilityConfig {
  id: number;
  organization_id: number;
  vulnerability_scan_enabled: boolean;
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

// ============================================================================
// Risk Scoring Config Queries
// ============================================================================

/**
 * Get risk scoring config for an organization. Returns null if no config exists.
 */
export async function getRiskScoringConfigQuery(
  organizationId: number
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
  config.vulnerability_scan_enabled = vulnConfig?.vulnerability_scan_enabled ?? false;
  config.vulnerability_types_enabled = vulnConfig?.vulnerability_types_enabled ?? defaultVulnerabilityTypesEnabled();

  return config;
}

/**
 * Get vulnerability scan config for an organization from the dedicated table.
 */
export async function getVulnerabilityConfigQuery(
  organizationId: number
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
  });

  return (results as VulnerabilityConfig[])[0] || null;
}

/**
 * Upsert risk scoring config for an organization.
 * If config exists, update it. Otherwise create it.
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
  }
): Promise<RiskScoringConfig> {
  validateOrganizationId(organizationId);

  // Fetch existing config from the base risk scoring table (without merged vuln config)
  const baseQuery = `
    SELECT id, organization_id, llm_enabled, llm_key_id, dimension_weights, updated_by, updated_at
    FROM ai_detection_risk_scoring_config
    WHERE organization_id = :organizationId
    ORDER BY id DESC LIMIT 1;
  `;
  const baseResults = await sequelize.query(baseQuery, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
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
        dimension_weights: JSON.stringify(
          data.dimension_weights ?? DEFAULT_DIMENSION_WEIGHTS
        ),
        updated_by: data.updated_by,
      },
    });

    config = (results as RiskScoringConfig[])[0];
  }

  // Upsert vulnerability scan config in the dedicated table
  if (data.vulnerability_scan_enabled !== undefined || data.vulnerability_types_enabled !== undefined) {
    await upsertVulnerabilityConfigQuery(organizationId, {
      vulnerability_scan_enabled: data.vulnerability_scan_enabled,
      vulnerability_types_enabled: data.vulnerability_types_enabled,
      updated_by: data.updated_by,
    });
  }

  // Merge vulnerability config into the returned object
  const vulnConfig = await getVulnerabilityConfigQuery(organizationId);
  config.vulnerability_scan_enabled = vulnConfig?.vulnerability_scan_enabled ?? false;
  config.vulnerability_types_enabled = vulnConfig?.vulnerability_types_enabled ?? defaultVulnerabilityTypesEnabled();

  return config;
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
  }
): Promise<void> {
  const insertVulnEnabled = data.vulnerability_scan_enabled ?? false;
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
  });
}

// ============================================================================
// Scan Risk Score Queries
// ============================================================================

/**
 * Update risk score on a scan record.
 */
export async function updateScanRiskScoreQuery(
  scanId: number,
  score: number,
  grade: string,
  details: Record<string, unknown>,
  organizationId: number
): Promise<void> {
  validateOrganizationId(organizationId);
  const query = `
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
  organizationId: number
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

