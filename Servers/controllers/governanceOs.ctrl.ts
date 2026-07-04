import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";
import { sequelize } from "../database/db";
import {
  getAllMappingsQuery,
  getMappingsBetweenFrameworksQuery,
  getMappingsForControlQuery,
  createMappingQuery,
  updateMappingQuery,
  deleteMappingQuery,
  createBulkMappingsQuery,
  getAllScenariosQuery,
  getScenarioByIdQuery,
  getScenarioRulesQuery,
  createScenarioQuery,
  updateScenarioQuery,
  deleteScenarioQuery,
  createScenarioActivationQuery,
  getActivationHistoryQuery,
  deactivateScenarioQuery,
  getTaskProgressByFrameworkQuery,
  getOrgPreferencesQuery,
  upsertOrgPreferencesQuery,
  getMappingStatsQuery,
} from "../utils/governanceOs.utils";
import { computeRecommendations } from "../utils/governanceRecommendation.utils";
import { getOrComputeCoverage, invalidateCoverageCache } from "../utils/governanceCoverage.utils";
import {
  validateScenarioInput,
  validateRecommendationInput,
  validateMappingInput,
} from "../domain.layer/validations/governanceOs.valid";

const FILE_NAME = "governanceOs.ctrl.ts";

// ============================================
// MAPPINGS
// ============================================

export async function getAllMappings(req: Request, res: Response): Promise<any> {
  const FN = "getAllMappings";
  logStructured("processing", "fetching governance mappings", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { frameworkId, strength, domain } = req.query;
    const mappings = await getAllMappingsQuery(organizationId, {
      frameworkId: frameworkId ? Number(frameworkId) : undefined,
      strength: strength as string | undefined,
      domain: domain as string | undefined,
    });
    logStructured("successful", `fetched ${mappings.length} mappings`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](mappings));
  } catch (error) {
    logStructured("error", "failed to fetch mappings", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getMappingsBetween(req: Request, res: Response): Promise<any> {
  const FN = "getMappingsBetween";
  logStructured("processing", "fetching mappings between frameworks", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { sourceId, targetId } = req.params;
    const mappings = await getMappingsBetweenFrameworksQuery(
      organizationId,
      Number(sourceId),
      Number(targetId),
    );
    logStructured(
      "successful",
      `fetched ${mappings.length} cross-framework mappings`,
      FN,
      FILE_NAME,
    );
    return res.status(200).json(STATUS_CODE[200](mappings));
  } catch (error) {
    logStructured("error", "failed to fetch cross-framework mappings", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getMappingsForControl(req: Request, res: Response): Promise<any> {
  const FN = "getMappingsForControl";
  logStructured("processing", "fetching mappings for control", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { controlType, controlId } = req.params;
    const mappings = await getMappingsForControlQuery(
      organizationId,
      String(controlType),
      Number(controlId),
    );
    logStructured("successful", `fetched ${mappings.length} control mappings`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](mappings));
  } catch (error) {
    logStructured("error", "failed to fetch control mappings", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createMapping(req: Request, res: Response): Promise<any> {
  const FN = "createMapping";
  logStructured("processing", "creating governance mapping", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const validation = validateMappingInput(req.body);
    if (!validation.valid) {
      return res.status(400).json(STATUS_CODE[400](validation.errors.join("; ")));
    }

    const mapping = await createMappingQuery(organizationId, req.body);
    await invalidateCoverageCache(organizationId);
    logStructured("successful", `created mapping ${mapping.id}`, FN, FILE_NAME);
    return res.status(201).json(STATUS_CODE[201](mapping));
  } catch (error) {
    logStructured("error", "failed to create mapping", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateMapping(req: Request, res: Response): Promise<any> {
  const FN = "updateMapping";
  logStructured("processing", "updating governance mapping", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const validation = validateMappingInput(req.body, true);
    if (!validation.valid) {
      return res.status(400).json(STATUS_CODE[400](validation.errors.join("; ")));
    }

    const { id } = req.params;
    const mapping = await updateMappingQuery(organizationId, Number(id), req.body);
    if (!mapping) {
      return res.status(404).json(STATUS_CODE[404]("Mapping not found"));
    }
    await invalidateCoverageCache(organizationId);
    logStructured("successful", `updated mapping ${id}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](mapping));
  } catch (error) {
    logStructured("error", "failed to update mapping", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteMapping(req: Request, res: Response): Promise<any> {
  const FN = "deleteMapping";
  logStructured("processing", "deleting governance mapping", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { id } = req.params;
    const deleted = await deleteMappingQuery(organizationId, Number(id));
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Mapping not found"));
    }
    await invalidateCoverageCache(organizationId);
    logStructured("successful", `deleted mapping ${id}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200]({ message: "Mapping deleted" }));
  } catch (error) {
    logStructured("error", "failed to delete mapping", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createBulkMappings(req: Request, res: Response): Promise<any> {
  const FN = "createBulkMappings";
  logStructured("processing", "creating bulk governance mappings", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { mappings } = req.body;
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json(STATUS_CODE[400]("mappings array is required"));
    }

    // Prevent cross-tenant pollution: every mapping in the bulk payload is
    // stamped with the caller's organization_id. Any embedded organization_id
    // in the payload is ignored.
    const sanitizedMappings = mappings.map((m) => ({
      ...m,
      organization_id: organizationId,
    }));

    const count = await createBulkMappingsQuery(organizationId, sanitizedMappings);
    await invalidateCoverageCache(organizationId);
    logStructured("successful", `created ${count} mappings in bulk`, FN, FILE_NAME);
    return res.status(201).json(STATUS_CODE[201]({ created: count }));
  } catch (error) {
    logStructured("error", "failed to create bulk mappings", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function activateScenario(req: Request, res: Response): Promise<any> {
  const FN = "activateScenario";
  logStructured("processing", "activating governance scenario", FN, FILE_NAME);
  try {
    const { organizationId, userId } = req;
    if (!organizationId || !userId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { id } = req.params;
    const scenario = await getScenarioByIdQuery(Number(id));
    if (!scenario) {
      return res.status(404).json(STATUS_CODE[404]("Scenario not found"));
    }

    // IDOR prevention: built-in scenarios are visible to all orgs, but custom
    // scenarios must belong to the caller's organization.
    if (!scenario.is_builtin && scenario.organization_id !== organizationId) {
      return res.status(403).json(STATUS_CODE[403]("Access denied to this scenario"));
    }

    const priorityOrder = (scenario.priority_order || {}) as {
      primary?: number;
      secondary?: number[];
      supplementary?: number[];
    };

    const { projectIds, ownerAssignments } = req.body;

    if (
      projectIds !== undefined &&
      (!Array.isArray(projectIds) ||
        !projectIds.every((id: unknown) => typeof id === "number" && id > 0))
    ) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("projectIds must be an array of positive integers"));
    }
    if (
      ownerAssignments !== undefined &&
      (typeof ownerAssignments !== "object" ||
        ownerAssignments === null ||
        Array.isArray(ownerAssignments))
    ) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400]("ownerAssignments must be an object mapping framework IDs to user IDs"),
        );
    }

    const result = await createScenarioActivationQuery({
      organizationId,
      scenarioId: Number(id),
      activatedBy: userId,
      priorityOrder,
      projectIds,
      ownerAssignments,
    });

    // Update preferences to set this as the active scenario
    await upsertOrgPreferencesQuery(organizationId, {
      selected_scenario_id: Number(id),
    });

    logStructured(
      "successful",
      `activated scenario ${id}, created ${result.tasksCreated} tasks`,
      FN,
      FILE_NAME,
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        activationId: result.activationId,
        tasksCreated: result.tasksCreated,
        scenarioId: Number(id),
      }),
    );
  } catch (error) {
    logStructured("error", "failed to activate scenario", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function simulateScenario(req: Request, res: Response): Promise<any> {
  const FN = "simulateScenario";
  logStructured("processing", "simulating governance scenario", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { frameworkIds, priorityOrder } = req.body;
    if (
      !Array.isArray(frameworkIds) ||
      frameworkIds.length === 0 ||
      !frameworkIds.every((id: unknown) => typeof id === "number" && id > 0)
    ) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("frameworkIds must be a non-empty array of positive integers"));
    }

    // Count total controls across selected frameworks using struct tables
    const frameworkControlQueries: Record<number, string> = {
      1: `SELECT COUNT(*) as cnt FROM subcontrols_struct_eu sc
          JOIN controls_struct_eu c ON sc.control_id = c.id
          JOIN controlcategories_struct_eu cc ON c.control_category_id = cc.id
          WHERE cc.framework_id = 1`,
      2: `SELECT COUNT(*) as cnt FROM subclauses_struct_iso s
          JOIN clauses_struct_iso c ON s.clause_id = c.id
          WHERE c.framework_id = 2`,
      3: `SELECT COUNT(*) as cnt FROM subclauses_struct_iso27001 s
          JOIN clauses_struct_iso27001 c ON s.clause_id = c.id
          WHERE c.framework_id = 3`,
      4: `SELECT COUNT(*) as cnt FROM nist_ai_rmf_subcategories_struct s
          JOIN nist_ai_rmf_categories_struct c ON s.category_struct_id = c.id
          WHERE c.framework_id = 4`,
    };

    const [frameworkRows] = await sequelize.query(
      `SELECT id, name FROM frameworks WHERE id = ANY(ARRAY[:frameworkIds]::INTEGER[])`,
      { replacements: { frameworkIds } },
    );

    const frameworkResults = await Promise.all(
      (frameworkRows as any[]).map(async (fw) => {
        const query = frameworkControlQueries[fw.id];
        if (!query) {
          return { id: fw.id, name: fw.name, control_count: "0" };
        }
        const [result] = await sequelize.query(query);
        return {
          id: fw.id,
          name: fw.name,
          control_count: String((result as any)?.cnt || 0),
        };
      }),
    );

    const breakdown = frameworkResults.map((row) => ({
      frameworkId: row.id,
      frameworkName: row.name,
      controlCount: parseInt(row.control_count, 10),
      priority:
        priorityOrder?.primary === row.id
          ? "primary"
          : priorityOrder?.secondary?.includes(row.id)
            ? "secondary"
            : priorityOrder?.supplementary?.includes(row.id)
              ? "supplementary"
              : "unprioritized",
    }));

    const totalControls = breakdown.reduce((sum, f) => sum + f.controlCount, 0);
    // Estimate 80% coverage achievable with selected frameworks
    const estimatedCoveragePercent = Math.min(85, 40 + frameworkIds.length * 12);
    const estimatedEffortHours = totalControls * 4;
    const timelineWeeks = Math.max(4, Math.ceil(totalControls / 20));

    logStructured("successful", "computed scenario simulation", FN, FILE_NAME);
    return res.status(200).json(
      STATUS_CODE[200]({
        frameworkIds,
        totalControls,
        estimatedCoveragePercent,
        estimatedEffortHours,
        timelineWeeks,
        frameworkBreakdown: breakdown,
        isHeuristicEstimate: true,
        methodology: {
          coverage: "estimatedCoveragePercent = min(85, 40 + 12 * numberOfFrameworks)",
          effort: "estimatedEffortHours = totalControls * 4",
          timeline: "timelineWeeks = max(4, ceil(totalControls / 20))",
          disclaimer:
            "These numbers are rough heuristic estimates based on simplified assumptions. " +
            "They are not predictive analytics and should not be used for final compliance planning.",
        },
      }),
    );
  } catch (error) {
    logStructured("error", "failed to simulate scenario", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getActivationHistory(req: Request, res: Response): Promise<any> {
  const FN = "getActivationHistory";
  logStructured("processing", "fetching activation history", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }
    const activations = await getActivationHistoryQuery(organizationId);
    logStructured("successful", `fetched ${activations.length} activations`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200]({ activations }));
  } catch (error) {
    logStructured("error", "failed to fetch activation history", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deactivateScenario(req: Request, res: Response): Promise<any> {
  const FN = "deactivateScenario";
  logStructured("processing", "deactivating scenario", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }
    const { id } = req.params;
    const result = await deactivateScenarioQuery(Number(id), organizationId);
    if (!result) {
      return res.status(404).json(STATUS_CODE[404]("Activation not found"));
    }
    logStructured("successful", "deactivated scenario activation", FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to deactivate scenario", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getScenarioProgress(req: Request, res: Response): Promise<any> {
  const FN = "getScenarioProgress";
  logStructured("processing", "fetching scenario progress", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }
    const { id } = req.params;
    const frameworks = await getTaskProgressByFrameworkQuery(Number(id), organizationId);
    logStructured(
      "successful",
      `fetched progress for ${frameworks.length} frameworks`,
      FN,
      FILE_NAME,
    );
    return res.status(200).json(STATUS_CODE[200]({ activationId: Number(id), frameworks }));
  } catch (error) {
    logStructured("error", "failed to fetch scenario progress", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================
// SCENARIOS
// ============================================

export async function getAllScenarios(req: Request, res: Response): Promise<any> {
  const FN = "getAllScenarios";
  logStructured("processing", "fetching governance scenarios", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    const scenarios = await getAllScenariosQuery(organizationId);
    logStructured("successful", `fetched ${scenarios.length} scenarios`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](scenarios));
  } catch (error) {
    logStructured("error", "failed to fetch scenarios", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getScenarioById(req: Request, res: Response): Promise<any> {
  const FN = "getScenarioById";
  logStructured("processing", "fetching scenario by id", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const scenario = await getScenarioByIdQuery(Number(id));
    if (!scenario) {
      return res.status(404).json(STATUS_CODE[404]("Scenario not found"));
    }
    // Built-in scenarios are visible to all; custom scenarios must belong to the org
    if (!scenario.is_builtin && scenario.organization_id !== organizationId) {
      return res.status(403).json(STATUS_CODE[403]("Access denied to this scenario"));
    }
    const rules = await getScenarioRulesQuery(scenario.id!);
    const result = { ...scenario.get({ plain: true }), rules };
    logStructured("successful", `fetched scenario ${id}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to fetch scenario", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createScenario(req: Request, res: Response): Promise<any> {
  const FN = "createScenario";
  logStructured("processing", "creating governance scenario", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const validation = validateScenarioInput(req.body);
    if (!validation.valid) {
      return res.status(400).json(STATUS_CODE[400](validation.errors.join("; ")));
    }

    const scenario = await createScenarioQuery({
      ...req.body,
      organization_id: organizationId,
      is_builtin: false,
    });
    logStructured("successful", `created scenario ${scenario.id}`, FN, FILE_NAME);
    return res.status(201).json(STATUS_CODE[201](scenario));
  } catch (error) {
    logStructured("error", "failed to create scenario", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateScenario(req: Request, res: Response): Promise<any> {
  const FN = "updateScenario";
  logStructured("processing", "updating governance scenario", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { id } = req.params;
    const validation = validateScenarioInput(req.body);
    if (!validation.valid) {
      return res.status(400).json(STATUS_CODE[400](validation.errors.join("; ")));
    }

    const scenario = await updateScenarioQuery(Number(id), organizationId, req.body);
    if (!scenario) {
      return res.status(404).json(STATUS_CODE[404]("Scenario not found or cannot be modified"));
    }
    logStructured("successful", `updated scenario ${id}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](scenario));
  } catch (error) {
    logStructured("error", "failed to update scenario", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteScenario(req: Request, res: Response): Promise<any> {
  const FN = "deleteScenario";
  logStructured("processing", "deleting governance scenario", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { id } = req.params;
    const deleted = await deleteScenarioQuery(Number(id), organizationId);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Scenario not found or cannot be deleted"));
    }
    logStructured("successful", `deleted scenario ${id}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200]({ message: "Scenario deleted" }));
  } catch (error) {
    logStructured("error", "failed to delete scenario", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================
// RECOMMENDATIONS
// ============================================

export async function getRecommendations(req: Request, res: Response): Promise<any> {
  const FN = "getRecommendations";
  logStructured("processing", "computing governance recommendations", FN, FILE_NAME);
  try {
    const validation = validateRecommendationInput(req.body);
    if (!validation.valid) {
      return res.status(400).json(STATUS_CODE[400](validation.errors.join("; ")));
    }

    const results = await computeRecommendations(req.body);
    logStructured("successful", `computed ${results.length} recommendations`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](results));
  } catch (error) {
    logStructured("error", "failed to compute recommendations", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================
// COVERAGE & UNIFIED VIEW
// ============================================

export async function getCoverage(req: Request, res: Response): Promise<any> {
  const FN = "getCoverage";
  logStructured("processing", "fetching coverage analysis", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { projectId } = req.params;
    const coverage = await getOrComputeCoverage(organizationId, Number(projectId));
    logStructured("successful", `fetched coverage for project ${projectId}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](coverage));
  } catch (error) {
    logStructured("error", "failed to fetch coverage", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function refreshCoverage(req: Request, res: Response): Promise<any> {
  const FN = "refreshCoverage";
  logStructured("processing", "refreshing coverage cache", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { projectId } = req.params;
    await invalidateCoverageCache(organizationId, Number(projectId));
    const coverage = await getOrComputeCoverage(organizationId, Number(projectId), true);
    logStructured("successful", `refreshed coverage for project ${projectId}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](coverage));
  } catch (error) {
    logStructured("error", "failed to refresh coverage", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getUnifiedView(req: Request, res: Response): Promise<any> {
  const FN = "getUnifiedView";
  logStructured("processing", "fetching unified governance view", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const { projectId } = req.params;
    const [coverage, mappingStats, preferences] = await Promise.all([
      getOrComputeCoverage(organizationId, Number(projectId)),
      getMappingStatsQuery(organizationId),
      getOrgPreferencesQuery(organizationId),
    ]);

    const unifiedView = {
      coverage,
      mappingStats,
      preferences: preferences?.get({ plain: true }) || null,
      projectId: Number(projectId),
    };

    logStructured("successful", `fetched unified view for project ${projectId}`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](unifiedView));
  } catch (error) {
    logStructured("error", "failed to fetch unified view", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================
// ELIGIBILITY
// ============================================

export async function getEligibility(req: Request, res: Response): Promise<any> {
  const FN = "getEligibility";
  logStructured("processing", "checking governance os eligibility", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    // Count distinct frameworks assigned to projects in this org
    const [result] = await sequelize.query(
      `SELECT COUNT(DISTINCT pf.framework_id) as framework_count
       FROM projects_frameworks pf
       JOIN projects p ON pf.project_id = p.id
       WHERE p.organization_id = :organizationId`,
      { replacements: { organizationId } },
    );

    const frameworkCount = parseInt((result as any[])[0]?.framework_count || "0", 10);
    const eligible = frameworkCount >= 2;

    logStructured(
      "successful",
      `eligibility: ${eligible}, frameworks: ${frameworkCount}`,
      FN,
      FILE_NAME,
    );
    return res.status(200).json(STATUS_CODE[200]({ eligible, frameworkCount }));
  } catch (error) {
    logStructured("error", "failed to check eligibility", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================
// PREFERENCES
// ============================================

export async function getPreferences(req: Request, res: Response): Promise<any> {
  const FN = "getPreferences";
  logStructured("processing", "fetching org preferences", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const preferences = await getOrgPreferencesQuery(organizationId);
    logStructured("successful", "fetched org preferences", FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](preferences));
  } catch (error) {
    logStructured("error", "failed to fetch preferences", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updatePreferences(req: Request, res: Response): Promise<any> {
  const FN = "updatePreferences";
  logStructured("processing", "updating org preferences", FN, FILE_NAME);
  try {
    const { organizationId } = req;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }

    const preferences = await upsertOrgPreferencesQuery(organizationId, req.body);
    logStructured("successful", "updated org preferences", FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](preferences));
  } catch (error) {
    logStructured("error", "failed to update preferences", FN, FILE_NAME);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
