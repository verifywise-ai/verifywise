import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { GovernanceControlMappingModel } from "../domain.layer/models/governanceOs/governanceControlMapping.model";
import { GovernanceScenarioModel } from "../domain.layer/models/governanceOs/governanceScenario.model";
import { GovernanceScenarioRuleModel } from "../domain.layer/models/governanceOs/governanceScenarioRule.model";
import { GovernanceOrgPreferencesModel } from "../domain.layer/models/governanceOs/governanceOrgPreferences.model";
import { GovernanceCoverageCacheModel } from "../domain.layer/models/governanceOs/governanceCoverageCache.model";
import {
  IGovernanceScenarioAttributes,
  IGovernanceOrgPreferencesAttributes,
} from "../domain.layer/interfaces/i.governanceOs";

// ============================================
// MAPPINGS
// ============================================

export const getAllMappingsQuery = async (filters?: {
  frameworkId?: number;
  strength?: string;
  domain?: string;
}): Promise<GovernanceControlMappingModel[]> => {
  let where = "WHERE 1=1";
  const replacements: Record<string, unknown> = {};

  if (filters?.frameworkId) {
    where += " AND (source_framework_id = :frameworkId OR target_framework_id = :frameworkId)";
    replacements.frameworkId = filters.frameworkId;
  }
  if (filters?.strength) {
    where += " AND mapping_strength = :strength";
    replacements.strength = filters.strength;
  }
  if (filters?.domain) {
    where += " AND domain_tag = :domain";
    replacements.domain = filters.domain;
  }

  return sequelize.query(
    `SELECT * FROM governance_control_mappings ${where} ORDER BY domain_tag, source_framework_id`,
    {
      replacements,
      mapToModel: true,
      model: GovernanceControlMappingModel,
    },
  );
};

export const getMappingsBetweenFrameworksQuery = async (
  sourceId: number,
  targetId: number,
): Promise<GovernanceControlMappingModel[]> => {
  return sequelize.query(
    `SELECT * FROM governance_control_mappings
     WHERE (source_framework_id = :sourceId AND target_framework_id = :targetId)
        OR (source_framework_id = :targetId AND target_framework_id = :sourceId AND mapping_direction = 'bidirectional')
     ORDER BY domain_tag, mapping_strength`,
    {
      replacements: { sourceId, targetId },
      mapToModel: true,
      model: GovernanceControlMappingModel,
    },
  );
};

export const getMappingsForControlQuery = async (
  controlType: string,
  controlId: number,
): Promise<GovernanceControlMappingModel[]> => {
  return sequelize.query(
    `SELECT * FROM governance_control_mappings
     WHERE (source_control_type = :controlType AND source_control_id = :controlId)
        OR (target_control_type = :controlType AND target_control_id = :controlId)
     ORDER BY mapping_strength DESC, confidence_score DESC`,
    {
      replacements: { controlType, controlId },
      mapToModel: true,
      model: GovernanceControlMappingModel,
    },
  );
};

// ============================================
// SCENARIOS
// ============================================

export const getAllScenariosQuery = async (
  organizationId?: number,
): Promise<GovernanceScenarioModel[]> => {
  let where = "WHERE is_builtin = TRUE";
  const replacements: Record<string, unknown> = {};

  if (organizationId) {
    where += " OR organization_id = :organizationId";
    replacements.organizationId = organizationId;
  }

  return sequelize.query(
    `SELECT * FROM governance_scenarios ${where} ORDER BY is_builtin DESC, name`,
    {
      replacements,
      mapToModel: true,
      model: GovernanceScenarioModel,
    },
  );
};

export const getScenarioByIdQuery = async (id: number): Promise<GovernanceScenarioModel | null> => {
  const results = await sequelize.query(`SELECT * FROM governance_scenarios WHERE id = :id`, {
    replacements: { id },
    mapToModel: true,
    model: GovernanceScenarioModel,
  });
  return results[0] || null;
};

export const getScenarioRulesQuery = async (
  scenarioId: number,
): Promise<GovernanceScenarioRuleModel[]> => {
  return sequelize.query(
    `SELECT * FROM governance_scenario_rules WHERE scenario_id = :scenarioId ORDER BY weight DESC`,
    {
      replacements: { scenarioId },
      mapToModel: true,
      model: GovernanceScenarioRuleModel,
    },
  );
};

export const createScenarioQuery = async (
  data: IGovernanceScenarioAttributes,
  transaction: Transaction | null = null,
): Promise<GovernanceScenarioModel> => {
  const [results] = await sequelize.query(
    `INSERT INTO governance_scenarios
      (organization_id, name, description, industry, use_case_type, region, recommended_framework_ids, priority_order, rationale, is_builtin)
     VALUES
      (:organization_id, :name, :description, :industry, :use_case_type, :region, :recommended_framework_ids, :priority_order, :rationale, :is_builtin)
     RETURNING *`,
    {
      replacements: {
        organization_id: data.organization_id || null,
        name: data.name,
        description: data.description || null,
        industry: data.industry || null,
        use_case_type: data.use_case_type || null,
        region: data.region || null,
        recommended_framework_ids: data.recommended_framework_ids
          ? `{${data.recommended_framework_ids.join(",")}}`
          : null,
        priority_order: data.priority_order ? JSON.stringify(data.priority_order) : null,
        rationale: data.rationale || null,
        is_builtin: data.is_builtin || false,
      },
      ...(transaction && { transaction }),
    },
  );
  return (results as any[])[0] as GovernanceScenarioModel;
};

export const updateScenarioQuery = async (
  id: number,
  organizationId: number,
  data: Partial<IGovernanceScenarioAttributes>,
  transaction: Transaction | null = null,
): Promise<GovernanceScenarioModel | null> => {
  const setClauses: string[] = [];
  const replacements: Record<string, unknown> = { id, organizationId };

  if (data.name !== undefined) {
    setClauses.push("name = :name");
    replacements.name = data.name;
  }
  if (data.description !== undefined) {
    setClauses.push("description = :description");
    replacements.description = data.description;
  }
  if (data.industry !== undefined) {
    setClauses.push("industry = :industry");
    replacements.industry = data.industry;
  }
  if (data.use_case_type !== undefined) {
    setClauses.push("use_case_type = :use_case_type");
    replacements.use_case_type = data.use_case_type;
  }
  if (data.region !== undefined) {
    setClauses.push("region = :region");
    replacements.region = data.region;
  }
  if (data.recommended_framework_ids !== undefined) {
    setClauses.push("recommended_framework_ids = :recommended_framework_ids");
    replacements.recommended_framework_ids = `{${data.recommended_framework_ids!.join(",")}}`;
  }
  if (data.priority_order !== undefined) {
    setClauses.push("priority_order = :priority_order");
    replacements.priority_order = JSON.stringify(data.priority_order);
  }
  if (data.rationale !== undefined) {
    setClauses.push("rationale = :rationale");
    replacements.rationale = data.rationale;
  }

  if (setClauses.length === 0) return null;

  setClauses.push("updated_at = NOW()");

  const [results] = await sequelize.query(
    `UPDATE governance_scenarios SET ${setClauses.join(", ")}
     WHERE id = :id AND organization_id = :organizationId AND is_builtin = FALSE
     RETURNING *`,
    {
      replacements,
      ...(transaction && { transaction }),
    },
  );
  return ((results as any[])[0] as GovernanceScenarioModel) || null;
};

export const deleteScenarioQuery = async (id: number, organizationId: number): Promise<boolean> => {
  const [, metadata] = await sequelize.query(
    `DELETE FROM governance_scenarios WHERE id = :id AND organization_id = :organizationId AND is_builtin = FALSE`,
    { replacements: { id, organizationId } },
  );
  return (metadata as any).rowCount > 0;
};

// ============================================
// PREFERENCES
// ============================================

export const getOrgPreferencesQuery = async (
  organizationId: number,
): Promise<GovernanceOrgPreferencesModel | null> => {
  const results = await sequelize.query(
    `SELECT * FROM governance_org_preferences WHERE organization_id = :organizationId`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: GovernanceOrgPreferencesModel,
    },
  );
  return results[0] || null;
};

export const upsertOrgPreferencesQuery = async (
  organizationId: number,
  data: Partial<IGovernanceOrgPreferencesAttributes>,
): Promise<GovernanceOrgPreferencesModel> => {
  const [results] = await sequelize.query(
    `INSERT INTO governance_org_preferences
      (organization_id, selected_scenario_id, custom_framework_priority, active_mapping_filters, is_enabled, dont_ask_governance_os)
     VALUES
      (:organizationId, :selected_scenario_id, :custom_framework_priority, :active_mapping_filters, :is_enabled, :dont_ask_governance_os)
     ON CONFLICT (organization_id) DO UPDATE SET
      selected_scenario_id = COALESCE(EXCLUDED.selected_scenario_id, governance_org_preferences.selected_scenario_id),
      custom_framework_priority = COALESCE(EXCLUDED.custom_framework_priority, governance_org_preferences.custom_framework_priority),
      active_mapping_filters = COALESCE(EXCLUDED.active_mapping_filters, governance_org_preferences.active_mapping_filters),
      is_enabled = COALESCE(EXCLUDED.is_enabled, governance_org_preferences.is_enabled),
      dont_ask_governance_os = COALESCE(EXCLUDED.dont_ask_governance_os, governance_org_preferences.dont_ask_governance_os),
      updated_at = NOW()
     RETURNING *`,
    {
      replacements: {
        organizationId,
        selected_scenario_id: data.selected_scenario_id ?? null,
        custom_framework_priority: data.custom_framework_priority
          ? JSON.stringify(data.custom_framework_priority)
          : null,
        active_mapping_filters: data.active_mapping_filters
          ? JSON.stringify(data.active_mapping_filters)
          : null,
        is_enabled: data.is_enabled ?? false,
        dont_ask_governance_os: data.dont_ask_governance_os ?? false,
      },
    },
  );
  return (results as any[])[0] as GovernanceOrgPreferencesModel;
};

// ============================================
// COVERAGE CACHE
// ============================================

export const getCoverageCacheQuery = async (
  organizationId: number,
  projectId: number,
): Promise<GovernanceCoverageCacheModel[]> => {
  return sequelize.query(
    `SELECT * FROM governance_coverage_cache
     WHERE organization_id = :organizationId AND project_id = :projectId
     ORDER BY framework_id`,
    {
      replacements: { organizationId, projectId },
      mapToModel: true,
      model: GovernanceCoverageCacheModel,
    },
  );
};

export const upsertCoverageCacheQuery = async (
  data: {
    organization_id: number;
    project_id: number;
    framework_id: number;
    total_controls: number;
    mapped_controls: number;
    coverage_percentage: number;
    gap_details?: Record<string, unknown>;
    synergy_details?: Record<string, unknown>;
  },
  transaction: Transaction | null = null,
): Promise<void> => {
  await sequelize.query(
    `INSERT INTO governance_coverage_cache
      (organization_id, project_id, framework_id, total_controls, mapped_controls, coverage_percentage, gap_details, synergy_details, computed_at)
     VALUES
      (:organization_id, :project_id, :framework_id, :total_controls, :mapped_controls, :coverage_percentage, :gap_details, :synergy_details, NOW())
     ON CONFLICT (organization_id, project_id, framework_id) DO UPDATE SET
      total_controls = EXCLUDED.total_controls,
      mapped_controls = EXCLUDED.mapped_controls,
      coverage_percentage = EXCLUDED.coverage_percentage,
      gap_details = EXCLUDED.gap_details,
      synergy_details = EXCLUDED.synergy_details,
      computed_at = NOW()`,
    {
      replacements: {
        organization_id: data.organization_id,
        project_id: data.project_id,
        framework_id: data.framework_id,
        total_controls: data.total_controls,
        mapped_controls: data.mapped_controls,
        coverage_percentage: data.coverage_percentage,
        gap_details: data.gap_details ? JSON.stringify(data.gap_details) : null,
        synergy_details: data.synergy_details ? JSON.stringify(data.synergy_details) : null,
      },
      ...(transaction && { transaction }),
    },
  );
};

// ============================================
// AGGREGATION (for unified view)
// ============================================

export const getMappingStatsQuery = async (): Promise<{
  total: number;
  byDomain: Record<string, number>;
  byStrength: Record<string, number>;
}> => {
  const [totalResult] = await sequelize.query(
    `SELECT COUNT(*) as total FROM governance_control_mappings`,
  );
  const [domainResult] = await sequelize.query(
    `SELECT domain_tag, COUNT(*) as count FROM governance_control_mappings GROUP BY domain_tag ORDER BY count DESC`,
  );
  const [strengthResult] = await sequelize.query(
    `SELECT mapping_strength, COUNT(*) as count FROM governance_control_mappings GROUP BY mapping_strength`,
  );

  const byDomain: Record<string, number> = {};
  for (const row of domainResult as any[]) {
    byDomain[row.domain_tag || "untagged"] = parseInt(row.count, 10);
  }

  const byStrength: Record<string, number> = {};
  for (const row of strengthResult as any[]) {
    byStrength[row.mapping_strength] = parseInt(row.count, 10);
  }

  return {
    total: parseInt((totalResult as any[])[0]?.total || "0", 10),
    byDomain,
    byStrength,
  };
};
