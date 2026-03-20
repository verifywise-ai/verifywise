import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createRiskQuery,
  deleteRiskByIdQuery,
  getAllRisksQuery,
  getRiskByIdQuery,
  getRisksByFrameworkQuery,
  getRisksByProjectQuery,
  updateRiskByIdQuery,
} from "../utils/risk.utils";
import { RiskModel } from "../domain.layer/models/risks/risk.model";
import { sequelize } from "../database/db";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";
import {
  recordProjectRiskCreation,
  recordMultipleFieldChanges,
  trackProjectRiskChanges,
  recordProjectRiskDeletion,
} from "../utils/projectRiskChangeHistory.utils";
import { notifyUserAssigned } from "../services/inAppNotification.service";
import { QueryTypes } from "sequelize";
import {
  computeDerivedFields,
  recordPortfolioSnapshot,
} from "../utils/quantitativeRisk.utils";
import { validateQuantitativeRiskFields } from "../utils/validations/quantitativeRiskValidation.utils";

// Helper function to get user name
async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

export async function getAllRisks(
  req: Request,
  res: Response
): Promise<any> {
  const filter = (req.query.filter as 'active' | 'deleted' | 'all') || 'active';
  
  logStructured(
    "processing",
    `fetching all project risks with filter: ${filter}`,
    "getAllProjectRisks",
    "projectRisks.ctrl.ts"
  );
  logger.debug(`🔍 Fetching all project risks with filter: ${filter}`);
  try {
    const projectRisks = await getAllRisksQuery(req.organizationId!, filter);

    if (projectRisks) {
      logStructured(
        "successful",
        `project risks found`,
        "getAllProjectRisks",
        "projectRisks.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](projectRisks));
    }

    logStructured(
      "successful",
      `no project risks found`,
      "getAllProjectRisks",
      "projectRisks.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](projectRisks));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch project risks`,
      "getAllProjectRisks",
      "projectRisks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve project risks`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getAllProjectRisks:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getRisksByProject(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(req.params.id as string);
  const filter = (req.query.filter as 'active' | 'deleted' | 'all') || 'active';

  // Return empty array for non-numeric project IDs (e.g., plugin-sourced IDs like "plugin-prefix-2")
  if (isNaN(projectId)) {
    return res.status(200).json(STATUS_CODE[200]([]));
  }

  logStructured(
    "processing",
    `fetching risks for project ID: ${projectId} with filter: ${filter}`,
    "getRisksByProject",
    "risks.ctrl.ts"
  );
  logger.debug(`🔍 Fetching risks for project ID: ${projectId} with filter: ${filter}`);
  try {
    const risks = await getRisksByProjectQuery(
      projectId,
      req.organizationId!,
      filter
    );

    if (risks) {
      logStructured(
        "successful",
        `risks found for project ID: ${projectId} with filter: ${filter}`,
        "getRisksByProject",
        "risks.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](risks));
    }

    logStructured(
      "successful",
      `no risks found for project ID: ${projectId} with filter: ${filter}`,
      "getRisksByProject",
      "risks.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](risks));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risks for project ID: ${projectId}`,
      "getRisksByProject",
      "risks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve risks for project ID: ${projectId}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getRisksByProject:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getRisksByFramework(
  req: Request,
  res: Response
): Promise<any> {
  const frameworkId = parseInt(req.params.id as string);
  const filter = (req.query.filter as 'active' | 'deleted' | 'all') || 'active';

  logStructured(
    "processing",
    `fetching risks for framework ID: ${frameworkId} with filter: ${filter}`,
    "getRisksByFramework",
    "risks.ctrl.ts"
  );
  logger.debug(`🔍 Fetching risks for framework ID: ${frameworkId} with filter: ${filter}`);
  try {
    const risks = await getRisksByFrameworkQuery(
      frameworkId,
      req.organizationId!,
      filter
    );

    if (risks) {
      logStructured(
        "successful",
        `risks found for framework ID: ${frameworkId} with filter: ${filter}`,
        "getRisksByFramework",
        "risks.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](risks));
    }

    logStructured(
      "successful",
      `no risks found for framework ID: ${frameworkId} with filter: ${filter}`,
      "getRisksByFramework",
      "risks.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](risks));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risks for framework ID: ${frameworkId}`,
      "getRisksByFramework",
      "risks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve risks for framework ID: ${frameworkId}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getRisksByFramework:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getRiskById(
  req: Request,
  res: Response
): Promise<any> {
  const projectRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `fetching project risk by ID: ${projectRiskId}`,
    "getRiskById",
    "risks.ctrl.ts"
  );
  logger.debug(`🔍 Looking up project risk with ID: ${projectRiskId}`);
  try {
    const projectRisk = await getRiskByIdQuery(
      projectRiskId,
      req.organizationId!
    );

    if (projectRisk) {
      logStructured(
        "successful",
        `project risk found: ID ${projectRiskId}`,
        "getProjectRiskById",
        "projectRisks.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](projectRisk));
    }

    logStructured(
      "successful",
      `no project risk found: ID ${projectRiskId}`,
      "getProjectRiskById",
      "projectRisks.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](projectRisk));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch project risk: ID ${projectRiskId}`,
      "getProjectRiskById",
      "projectRisks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve project risk by ID: ${projectRiskId}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getProjectRiskById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createRisk(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const riskData = req.body;

  logStructured(
    "processing",
    "starting createRisk",
    "createRisk",
    "risks.ctrl.ts"
  );
  logger.debug("🛠️ Creating new project risk");
  try {

    const projectRiskData = {
      ...riskData,
      risk_owner:
        riskData.risk_owner && Number(riskData.risk_owner) !== 0
          ? Number(riskData.risk_owner)
          : null,
    } as Partial<RiskModel & { projects: number[], frameworks: number[] }>;

    // Validate and auto-compute FAIR quantitative fields if present
    if (projectRiskData.event_frequency_min != null || projectRiskData.ale_estimate != null) {
      const fairErrors = validateQuantitativeRiskFields(projectRiskData as Record<string, unknown>);
      if (fairErrors.length > 0) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400]({
          message: "Quantitative risk validation failed",
          errors: fairErrors,
        }));
      }
      const derived = computeDerivedFields(projectRiskData);
      Object.assign(projectRiskData, derived);
    }

    const newProjectRisk = await createRiskQuery(
      { ...projectRiskData, projects: req.body.projects || [], frameworks: req.body.frameworks || [] },
      req.organizationId!,
      transaction
    );

    if (newProjectRisk) {
      // Record creation in change history
      if (req.userId) {
        await recordProjectRiskCreation(
          newProjectRisk.id!,
          req.userId,
          req.organizationId!,
          projectRiskData,
          transaction
        );
      }

      await transaction.commit();
      logStructured(
        "successful",
        `project risk created: ${newProjectRisk.risk_name}`,
        "createProjectRisk",
        "projectRisks.ctrl.ts"
      );
      await logEvent(
        "Create",
        `Project risk created: ${newProjectRisk.risk_name}`,
        req.userId!,
        req.organizationId!
      );

      // Record portfolio snapshot if quantitative fields were provided (fire-and-forget)
      if (newProjectRisk.ale_estimate != null) {
        recordPortfolioSnapshot(req.organizationId!).catch((err) =>
          console.error("Failed to record portfolio snapshot:", err)
        );
      }

      // Send risk owner assignment notification (fire-and-forget)
      if (newProjectRisk.risk_owner) {
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const assignerName = await getUserNameById(req.userId!);

        // Get project name for context (use first associated project if available)
        let projectName: string | undefined;
        const projects = req.body.projects || [];
        if (projects.length > 0) {
          const projectResult = await sequelize.query<{ project_title: string }>(
            `SELECT project_title FROM projects WHERE id = :projectId AND organization_id = :organizationId`,
            { replacements: { projectId: projects[0], organizationId: req.organizationId! }, type: QueryTypes.SELECT }
          );
          projectName = projectResult[0]?.project_title;
        }

        notifyUserAssigned(
          req.organizationId!,
          newProjectRisk.risk_owner,
          {
            entityType: "project_risk",
            entityId: newProjectRisk.id!,
            entityName: newProjectRisk.risk_name,
            roleType: "Risk Owner",
            entityUrl: `/risk-management?riskId=${newProjectRisk.id}`,
          },
          assignerName,
          baseUrl,
          {
            projectName,
            description: newProjectRisk.risk_description,
          }
        ).catch((err) => console.error("Failed to send risk owner notification:", err));
      }

      return res.status(201).json(STATUS_CODE[201](newProjectRisk));
    }

    logStructured(
      "error",
      "failed to create project risk",
      "createProjectRisk",
      "projectRisks.ctrl.ts"
    );
    await logEvent("Error", "Project risk creation failed", req.userId!, req.organizationId!);
    await transaction.rollback();
    return res
      .status(400)
      .json(STATUS_CODE[400]("Unable to create project risk"));
  } catch (error) {
    await transaction.rollback();

    // Handle specific validation errors
    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation failed: ${error.message}`,
        "createProjectRisk",
        "projectRisks.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Validation error during project risk creation: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "createProjectRisk",
        "projectRisks.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Business logic error during project risk creation: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured(
      "error",
      "unexpected error during project risk creation",
      "createProjectRisk",
      "projectRisks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during project risk creation: ${(error as Error).message
      }`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in createProjectRisk:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateRiskById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const updateData = req.body;

  logStructured(
    "processing",
    `updating project risk ID: ${projectRiskId}`,
    "updateRiskById",
    "risks.ctrl.ts"
  );
  logger.debug(`✏️ Update requested for project risk ID: ${projectRiskId}`);
  try {

    // Convert optional FK fields (0 => NULL)
    const updateDataTyped = {
      ...updateData,
      risk_owner:
        updateData.risk_owner && Number(updateData.risk_owner) !== 0
          ? Number(updateData.risk_owner)
          : null
    } as Partial<RiskModel & { projects: number[]; frameworks: number[] }>;


    // Find existing risk to track changes
    const existingProjectRisk = await getRiskByIdQuery(projectRiskId, req.organizationId!);

    if (!existingProjectRisk) {
      logStructured(
        "error",
        `project risk not found: ID ${projectRiskId}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Project risk not found for update: ID ${projectRiskId}`,
        req.userId!,
        req.organizationId!
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Project risk not found"));
    }

    // Validate and auto-compute FAIR quantitative fields if present
    if (updateDataTyped.event_frequency_min !== undefined || updateDataTyped.control_effectiveness !== undefined || updateDataTyped.mitigation_cost_annual !== undefined) {
      // Merge existing FAIR fields with incoming updates for full recomputation
      const mergedFairFields = {
        event_frequency_min: updateDataTyped.event_frequency_min ?? existingProjectRisk.event_frequency_min,
        event_frequency_likely: updateDataTyped.event_frequency_likely ?? existingProjectRisk.event_frequency_likely,
        event_frequency_max: updateDataTyped.event_frequency_max ?? existingProjectRisk.event_frequency_max,
        loss_regulatory_min: updateDataTyped.loss_regulatory_min ?? existingProjectRisk.loss_regulatory_min,
        loss_regulatory_likely: updateDataTyped.loss_regulatory_likely ?? existingProjectRisk.loss_regulatory_likely,
        loss_regulatory_max: updateDataTyped.loss_regulatory_max ?? existingProjectRisk.loss_regulatory_max,
        loss_operational_min: updateDataTyped.loss_operational_min ?? existingProjectRisk.loss_operational_min,
        loss_operational_likely: updateDataTyped.loss_operational_likely ?? existingProjectRisk.loss_operational_likely,
        loss_operational_max: updateDataTyped.loss_operational_max ?? existingProjectRisk.loss_operational_max,
        loss_litigation_min: updateDataTyped.loss_litigation_min ?? existingProjectRisk.loss_litigation_min,
        loss_litigation_likely: updateDataTyped.loss_litigation_likely ?? existingProjectRisk.loss_litigation_likely,
        loss_litigation_max: updateDataTyped.loss_litigation_max ?? existingProjectRisk.loss_litigation_max,
        loss_reputational_min: updateDataTyped.loss_reputational_min ?? existingProjectRisk.loss_reputational_min,
        loss_reputational_likely: updateDataTyped.loss_reputational_likely ?? existingProjectRisk.loss_reputational_likely,
        loss_reputational_max: updateDataTyped.loss_reputational_max ?? existingProjectRisk.loss_reputational_max,
        control_effectiveness: updateDataTyped.control_effectiveness ?? existingProjectRisk.control_effectiveness,
        mitigation_cost_annual: updateDataTyped.mitigation_cost_annual ?? existingProjectRisk.mitigation_cost_annual,
      };

      const fairErrors = validateQuantitativeRiskFields(mergedFairFields as Record<string, unknown>);
      if (fairErrors.length > 0) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400]({
          message: "Quantitative risk validation failed",
          errors: fairErrors,
        }));
      }
      const derived = computeDerivedFields(mergedFairFields);
      Object.assign(updateDataTyped, derived);
    }

    // Track changes before updating
    const changes = await trackProjectRiskChanges(existingProjectRisk as RiskModel, updateDataTyped);

    const updatedProjectRisk = await updateRiskByIdQuery(
      projectRiskId,
      { ...updateDataTyped, projects: req.body.projects || [], frameworks: req.body.frameworks || [] },
      req.organizationId!,
      transaction
    );

    if (updatedProjectRisk) {
      // Record changes in change history
      if (changes.length > 0 && req.userId) {
        await recordMultipleFieldChanges(
          projectRiskId,
          req.userId,
          req.organizationId!,
          changes,
          transaction
        );
      }

      await transaction.commit();
      logStructured(
        "successful",
        `project risk updated: ID ${projectRiskId}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts"
      );
      await logEvent("Update", `Project risk updated: ID ${projectRiskId}`, req.userId!, req.organizationId!);

      // Record portfolio snapshot if quantitative fields were updated (fire-and-forget)
      if (updatedProjectRisk.ale_estimate != null) {
        recordPortfolioSnapshot(req.organizationId!).catch((err) =>
          console.error("Failed to record portfolio snapshot:", err)
        );
      }

      // Send risk owner assignment notification if owner changed (fire-and-forget)
      const oldRiskOwner = existingProjectRisk.risk_owner;
      const newRiskOwner = updatedProjectRisk.risk_owner;
      if (newRiskOwner && newRiskOwner !== oldRiskOwner) {
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const assignerName = await getUserNameById(req.userId!);

        // Get project name for context
        let projectName: string | undefined;
        const projectsResult = await sequelize.query<{ project_title: string }>(
          `SELECT p.project_title FROM projects p
           JOIN projects_risks prl ON p.id = prl.project_id AND prl.organization_id = :organizationId
           WHERE prl.risk_id = :riskId AND p.organization_id = :organizationId LIMIT 1`,
          { replacements: { riskId: projectRiskId, organizationId: req.organizationId! }, type: QueryTypes.SELECT }
        );
        projectName = projectsResult[0]?.project_title;

        notifyUserAssigned(
          req.organizationId!,
          newRiskOwner,
          {
            entityType: "project_risk",
            entityId: projectRiskId,
            entityName: updatedProjectRisk.risk_name,
            roleType: "Risk Owner",
            entityUrl: `/risk-management?riskId=${projectRiskId}`,
          },
          assignerName,
          baseUrl,
          {
            projectName,
            description: updatedProjectRisk.risk_description,
          }
        ).catch((err) => console.error("Failed to send risk owner notification:", err));
      }

      return res.status(200).json(STATUS_CODE[200](updatedProjectRisk));
    }

    logStructured(
      "error",
      "project risk not found for update",
      "updateProjectRiskById",
      "projectRisks.ctrl.ts"
    );
    await logEvent("Error", "Project risk not found for updateProjectRiskById", req.userId!, req.organizationId!);
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404]("Project risk not found"));
  } catch (error) {
    await transaction.rollback();

    // Handle specific validation and business logic errors
    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Validation error during project risk update: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Business logic error during project risk update: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured(
      "error",
      `unexpected error for project risk ID ${projectRiskId}`,
      "updateProjectRiskById",
      "projectRisks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during update for project risk ID ${projectRiskId}: ${(error as Error).message
      }`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in updateProjectRiskById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteRiskById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `attempting to delete project risk ID ${projectRiskId}`,
    "deleteRiskById",
    "risks.ctrl.ts"
  );
  logger.debug(`🗑️ Delete request for project risk ID ${projectRiskId}`);
  try {
    const deletedProjectRisk = await deleteRiskByIdQuery(
      projectRiskId,
      req.organizationId!,
      transaction
    );

    if (deletedProjectRisk) {
      // Record deletion in change history
      if (req.userId) {
        await recordProjectRiskDeletion(
          projectRiskId,
          req.userId,
          req.organizationId!,
          transaction
        );
      }

      await transaction.commit();
      logStructured(
        "successful",
        `project risk deleted: ID ${projectRiskId}`,
        "deleteProjectRiskById",
        "projectRisks.ctrl.ts"
      );
      await logEvent("Delete", `Project risk deleted: ID ${projectRiskId}`, req.userId!, req.organizationId!);
      return res.status(200).json(STATUS_CODE[200](deletedProjectRisk));
    }

    logStructured(
      "error",
      `project risk not found: ID ${projectRiskId}`,
      "deleteProjectRiskById",
      "projectRisks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Delete failed — project risk not found: ID ${projectRiskId}`,
      req.userId!,
      req.organizationId!
    );
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404]("Project risk not found"));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error deleting project risk ID ${projectRiskId}`,
      "deleteProjectRiskById",
      "projectRisks.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during delete for project risk ID ${projectRiskId}: ${(error as Error).message
      }`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in deleteProjectRiskById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
