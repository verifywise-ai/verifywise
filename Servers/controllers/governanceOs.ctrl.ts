import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";
import { sequelize } from "../database/db";
import {
  getAllMappingsQuery,
  getMappingsBetweenFrameworksQuery,
  getMappingsForControlQuery,
  getAllScenariosQuery,
  getScenarioByIdQuery,
  getScenarioRulesQuery,
  createScenarioQuery,
  updateScenarioQuery,
  deleteScenarioQuery,
  getOrgPreferencesQuery,
  upsertOrgPreferencesQuery,
  getMappingStatsQuery,
} from "../utils/governanceOs.utils";
import { computeRecommendations } from "../utils/governanceRecommendation.utils";
import { getOrComputeCoverage } from "../utils/governanceCoverage.utils";
import {
  validateScenarioInput,
  validateRecommendationInput,
} from "../domain.layer/validations/governanceOs.valid";

const FILE_NAME = "governanceOs.ctrl.ts";

// ============================================
// MAPPINGS
// ============================================

export async function getAllMappings(req: Request, res: Response): Promise<any> {
  const FN = "getAllMappings";
  logStructured("processing", "fetching governance mappings", FN, FILE_NAME);
  try {
    const { frameworkId, strength, domain } = req.query;
    const mappings = await getAllMappingsQuery({
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
    const { sourceId, targetId } = req.params;
    const mappings = await getMappingsBetweenFrameworksQuery(Number(sourceId), Number(targetId));
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
    const { controlType, controlId } = req.params;
    const mappings = await getMappingsForControlQuery(String(controlType), Number(controlId));
    logStructured("successful", `fetched ${mappings.length} control mappings`, FN, FILE_NAME);
    return res.status(200).json(STATUS_CODE[200](mappings));
  } catch (error) {
    logStructured("error", "failed to fetch control mappings", FN, FILE_NAME);
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
    const { id } = req.params;
    const scenario = await getScenarioByIdQuery(Number(id));
    if (!scenario) {
      return res.status(404).json(STATUS_CODE[404]("Scenario not found"));
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
      getMappingStatsQuery(),
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
       JOIN projects p ON pf.project_id = p.id`,
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
