import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { GovernanceControlMappingModel } from "../domain.layer/models/governanceOs/governanceControlMapping.model";
import { GovernanceScenarioModel } from "../domain.layer/models/governanceOs/governanceScenario.model";
import { GovernanceScenarioRuleModel } from "../domain.layer/models/governanceOs/governanceScenarioRule.model";
import { GovernanceOrgPreferencesModel } from "../domain.layer/models/governanceOs/governanceOrgPreferences.model";
import { GovernanceCoverageCacheModel } from "../domain.layer/models/governanceOs/governanceCoverageCache.model";
import {
  IGovernanceControlMappingAttributes,
  IGovernanceScenarioAttributes,
  IGovernanceOrgPreferencesAttributes,
} from "../domain.layer/interfaces/i.governanceOs";
import { createNewTaskQuery } from "./task.utils";
import { ITask } from "../domain.layer/interfaces/i.task";
import { TaskPriority } from "../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";

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

export const createMappingQuery = async (
  data: Partial<IGovernanceControlMappingAttributes>,
): Promise<GovernanceControlMappingModel> => {
  const [results] = await sequelize.query(
    `INSERT INTO governance_control_mappings
      (source_framework_id, source_control_type, source_control_identifier, source_control_id,
       target_framework_id, target_control_type, target_control_identifier, target_control_id,
       mapping_strength, mapping_direction, domain_tag, rationale, confidence_score)
     VALUES
      (:source_framework_id, :source_control_type, :source_control_identifier, :source_control_id,
       :target_framework_id, :target_control_type, :target_control_identifier, :target_control_id,
       :mapping_strength, :mapping_direction, :domain_tag, :rationale, :confidence_score)
     RETURNING *`,
    {
      replacements: {
        source_framework_id: data.source_framework_id,
        source_control_type: data.source_control_type || "clause",
        source_control_identifier: data.source_control_identifier || "",
        source_control_id: data.source_control_id || null,
        target_framework_id: data.target_framework_id,
        target_control_type: data.target_control_type || "clause",
        target_control_identifier: data.target_control_identifier || "",
        target_control_id: data.target_control_id || null,
        mapping_strength: data.mapping_strength || "related",
        mapping_direction: data.mapping_direction || "bidirectional",
        domain_tag: data.domain_tag || null,
        rationale: data.rationale || null,
        confidence_score: data.confidence_score ?? 0.8,
      },
    },
  );
  return (results as any[])[0] as GovernanceControlMappingModel;
};

export const updateMappingQuery = async (
  id: number,
  data: Partial<IGovernanceControlMappingAttributes>,
): Promise<GovernanceControlMappingModel | null> => {
  const setClauses: string[] = [];
  const replacements: Record<string, unknown> = { id };

  if (data.mapping_strength !== undefined) {
    setClauses.push("mapping_strength = :mapping_strength");
    replacements.mapping_strength = data.mapping_strength;
  }
  if (data.mapping_direction !== undefined) {
    setClauses.push("mapping_direction = :mapping_direction");
    replacements.mapping_direction = data.mapping_direction;
  }
  if (data.domain_tag !== undefined) {
    setClauses.push("domain_tag = :domain_tag");
    replacements.domain_tag = data.domain_tag;
  }
  if (data.rationale !== undefined) {
    setClauses.push("rationale = :rationale");
    replacements.rationale = data.rationale;
  }
  if (data.confidence_score !== undefined) {
    setClauses.push("confidence_score = :confidence_score");
    replacements.confidence_score = data.confidence_score;
  }

  if (setClauses.length === 0) return null;

  setClauses.push("updated_at = NOW()");

  const [results] = await sequelize.query(
    `UPDATE governance_control_mappings SET ${setClauses.join(", ")}
     WHERE id = :id
     RETURNING *`,
    { replacements },
  );
  return ((results as any[])[0] as GovernanceControlMappingModel) || null;
};

export const deleteMappingQuery = async (id: number): Promise<boolean> => {
  const [, metadata] = await sequelize.query(
    `DELETE FROM governance_control_mappings WHERE id = :id`,
    { replacements: { id } },
  );
  return (metadata as any).rowCount > 0;
};

export const createBulkMappingsQuery = async (
  mappings: Partial<IGovernanceControlMappingAttributes>[],
): Promise<number> => {
  if (mappings.length === 0) return 0;

  const values = mappings
    .map(
      (_, i) =>
        `(:source_framework_id_${i}, :source_control_type_${i}, :source_control_identifier_${i}, :source_control_id_${i},
      :target_framework_id_${i}, :target_control_type_${i}, :target_control_identifier_${i}, :target_control_id_${i},
      :mapping_strength_${i}, :mapping_direction_${i}, :domain_tag_${i}, :rationale_${i}, :confidence_score_${i})`,
    )
    .join(", ");

  const replacements: Record<string, unknown> = {};
  mappings.forEach((m, i) => {
    replacements[`source_framework_id_${i}`] = m.source_framework_id;
    replacements[`source_control_type_${i}`] = m.source_control_type || "clause";
    replacements[`source_control_identifier_${i}`] = m.source_control_identifier || "";
    replacements[`source_control_id_${i}`] = m.source_control_id || null;
    replacements[`target_framework_id_${i}`] = m.target_framework_id;
    replacements[`target_control_type_${i}`] = m.target_control_type || "clause";
    replacements[`target_control_identifier_${i}`] = m.target_control_identifier || "";
    replacements[`target_control_id_${i}`] = m.target_control_id || null;
    replacements[`mapping_strength_${i}`] = m.mapping_strength || "related";
    replacements[`mapping_direction_${i}`] = m.mapping_direction || "bidirectional";
    replacements[`domain_tag_${i}`] = m.domain_tag || null;
    replacements[`rationale_${i}`] = m.rationale || null;
    replacements[`confidence_score_${i}`] = m.confidence_score ?? 0.8;
  });

  const [results] = await sequelize.query(
    `INSERT INTO governance_control_mappings
      (source_framework_id, source_control_type, source_control_identifier, source_control_id,
       target_framework_id, target_control_type, target_control_identifier, target_control_id,
       mapping_strength, mapping_direction, domain_tag, rationale, confidence_score)
     VALUES ${values}
     RETURNING *`,
    { replacements },
  );

  return (results as any[]).length;
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

export const createScenarioActivationQuery = async ({
  organizationId,
  scenarioId,
  activatedBy,
  priorityOrder,
  projectIds,
  ownerAssignments,
}: {
  organizationId: number;
  scenarioId: number;
  activatedBy: number;
  priorityOrder: { primary?: number; secondary?: number[]; supplementary?: number[] };
  projectIds?: number[];
  ownerAssignments?: Record<number, number>;
}): Promise<{ activationId: number; tasksCreated: number }> => {
  const transaction = await sequelize.transaction();

  try {
    // Get projects that have the relevant frameworks assigned
    const frameworkIds = [
      priorityOrder.primary,
      ...(priorityOrder.secondary || []),
      ...(priorityOrder.supplementary || []),
    ].filter(Boolean) as number[];

    if (frameworkIds.length === 0) {
      throw new Error("Scenario has no frameworks assigned. Cannot activate.");
    }

    const projectQuery =
      projectIds && projectIds.length > 0
        ? `SELECT p.id, p.project_title, p.owner
         FROM projects p
         WHERE p.organization_id = :organizationId AND p.id = ANY(ARRAY[:projectIds]::INTEGER[])`
        : `SELECT DISTINCT p.id, p.project_title, p.owner
         FROM projects p
         JOIN projects_frameworks pf ON pf.project_id = p.id
         WHERE p.organization_id = :organizationId
           AND pf.framework_id = ANY(ARRAY[:frameworkIds]::INTEGER[])`;

    const [projects] = await sequelize.query(projectQuery, {
      replacements: { organizationId, projectIds: projectIds || [], frameworkIds },
      transaction,
    });

    if ((projects as any[]).length === 0) {
      throw new Error(
        "No eligible projects found for activation. Ensure projects have the required frameworks assigned.",
      );
    }

    let tasksCreated = 0;

    const createTaskForFramework = async (
      _projectId: number,
      projectTitle: string,
      frameworkId: number,
      priority: string,
      daysUntilDue: number,
      defaultOwnerId: number,
    ) => {
      const assigneeUserId = ownerAssignments?.[frameworkId] || defaultOwnerId;
      const frameworkName =
        frameworkId === 1
          ? "EU AI Act"
          : frameworkId === 2
            ? "ISO 42001"
            : frameworkId === 3
              ? "ISO 27001"
              : frameworkId === 4
                ? "NIST AI RMF"
                : `Framework ${frameworkId}`;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + daysUntilDue);

      const taskData: ITask = {
        title: `Implement ${frameworkName} controls — ${projectTitle}`,
        description: `This task was auto-generated by activating a governance scenario. Priority: ${priority}. Please review the framework controls and link evidence as you complete them.`,
        creator_id: activatedBy,
        organization_id: organizationId,
        due_date: dueDate,
        priority:
          priority === "primary"
            ? TaskPriority.HIGH
            : priority === "secondary"
              ? TaskPriority.MEDIUM
              : TaskPriority.LOW,
        status: TaskStatus.OPEN,
        categories: ["governance", frameworkName.toLowerCase().replace(/\s+/g, "-")],
      };

      await createNewTaskQuery(
        taskData,
        organizationId,
        transaction,
        assigneeUserId > 0 ? [{ user_id: assigneeUserId }] : undefined,
      );
      tasksCreated++;
    };

    for (const project of projects as any[]) {
      const projectId = project.id as number;
      const projectTitle = (project.project_title as string) || "Untitled Project";
      const defaultOwnerId = (project.owner as number) || 0;

      if (priorityOrder.primary) {
        await createTaskForFramework(
          projectId,
          projectTitle,
          priorityOrder.primary,
          "primary",
          14,
          defaultOwnerId,
        );
      }
      for (const fwId of priorityOrder.secondary || []) {
        await createTaskForFramework(
          projectId,
          projectTitle,
          fwId,
          "secondary",
          30,
          defaultOwnerId,
        );
      }
      for (const fwId of priorityOrder.supplementary || []) {
        await createTaskForFramework(
          projectId,
          projectTitle,
          fwId,
          "supplementary",
          60,
          defaultOwnerId,
        );
      }
    }

    const [activationResult] = await sequelize.query(
      `INSERT INTO governance_scenario_activations
        (organization_id, scenario_id, activated_by, tasks_created, frameworks_assigned, status)
       VALUES
        (:organizationId, :scenarioId, :activatedBy, :tasksCreated, :frameworksAssigned, 'active')
       RETURNING *`,
      {
        replacements: {
          organizationId,
          scenarioId,
          activatedBy,
          tasksCreated,
          frameworksAssigned: frameworkIds.length * (projects as any[]).length,
        },
        transaction,
      },
    );

    await transaction.commit();

    return {
      activationId: (activationResult as any[])[0]?.id as number,
      tasksCreated,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// ============================================
// ACTIVATION TRACKING
// ============================================

export const getActivationHistoryQuery = async (
  organizationId: number,
): Promise<
  {
    id: number;
    scenario_id: number;
    scenario_name: string;
    activated_by: number;
    activated_at: Date;
    tasks_created: number;
    frameworks_assigned: number;
    status: string;
  }[]
> => {
  const results = await sequelize.query(
    `SELECT
       a.id,
       a.scenario_id,
       s.name as scenario_name,
       a.activated_by,
       a.activated_at,
       a.tasks_created,
       a.frameworks_assigned,
       a.status
     FROM governance_scenario_activations a
     JOIN governance_scenarios s ON s.id = a.scenario_id
     WHERE a.organization_id = :organizationId
     ORDER BY a.activated_at DESC
     LIMIT 50`,
    {
      replacements: { organizationId },
    },
  );
  return results[0] as any[];
};

export const deactivateScenarioQuery = async (
  activationId: number,
  organizationId: number,
): Promise<{ id: number; status: string; deactivated_at: Date } | null> => {
  const [results] = await sequelize.query(
    `UPDATE governance_scenario_activations
     SET status = 'inactive', deactivated_at = NOW()
     WHERE id = :activationId AND organization_id = :organizationId
     RETURNING id, status, deactivated_at`,
    {
      replacements: { activationId, organizationId },
    },
  );
  const row = (results as any[])[0];
  if (!row) return null;
  return {
    id: row.id as number,
    status: row.status as string,
    deactivated_at: row.deactivated_at as Date,
  };
};

const FRAMEWORK_SLUGS: Record<number, string> = {
  1: "eu-ai-act",
  2: "iso-42001",
  3: "iso-27001",
  4: "nist-ai-rmf",
};

export const getTaskProgressByFrameworkQuery = async (
  activationId: number,
  organizationId: number,
): Promise<
  {
    frameworkId: number;
    frameworkName: string;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    openTasks: number;
  }[]
> => {
  // Get activation timestamp
  const [activationResult] = await sequelize.query(
    `SELECT activated_at FROM governance_scenario_activations
     WHERE id = :activationId AND organization_id = :organizationId`,
    {
      replacements: { activationId, organizationId },
    },
  );
  const activatedAt = (activationResult as any[])[0]?.activated_at;
  if (!activatedAt) return [];

  const frameworkIds = [1, 2, 3, 4];
  const progress: ReturnType<typeof getTaskProgressByFrameworkQuery> extends Promise<infer T>
    ? T
    : never = [];

  for (const fwId of frameworkIds) {
    const slug = FRAMEWORK_SLUGS[fwId];
    const [taskResult] = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Completed') as completed,
         COUNT(*) FILTER (WHERE status = 'In progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'Open') as open,
         COUNT(*) as total
       FROM tasks
       WHERE organization_id = :organizationId
         AND categories::jsonb ? 'governance'
         AND categories::jsonb ? :slug
         AND created_at >= :activatedAt`,
      {
        replacements: { organizationId, slug, activatedAt },
      },
    );
    const row = (taskResult as any[])[0];
    const total = parseInt(row?.total || "0", 10);
    if (total > 0) {
      progress.push({
        frameworkId: fwId,
        frameworkName:
          fwId === 1
            ? "EU AI Act"
            : fwId === 2
              ? "ISO 42001"
              : fwId === 3
                ? "ISO 27001"
                : "NIST AI RMF",
        totalTasks: total,
        completedTasks: parseInt(row?.completed || "0", 10),
        inProgressTasks: parseInt(row?.in_progress || "0", 10),
        openTasks: parseInt(row?.open || "0", 10),
      });
    }
  }

  return progress;
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
