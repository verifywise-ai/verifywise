import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  archiveRiskQuery,
  archiveRisksInBulkQuery,
  getAllRisksQuery,
  getRiskByIdQuery,
  getRisksByFrameworkQuery,
  getRisksByProjectQuery,
  assertRiskReferencesInOrganization,
  recordRiskSnapshots,
  getActiveRisksByIdsQuery,
  getProjectTitlesByRiskIdsQuery,
  sameRiskCategories,
  PROJECT_RISK_CATEGORIES_SET,
  enqueueBulkRiskAutomation,
} from "../utils/risk.utils";
import { sequelize } from "../database/db";
import {
  ValidationException,
  BusinessLogicException,
  ForbiddenException,
} from "../domain.layer/exceptions/custom.exception";
import { parseBulkIds, assertOrgOwnsIds, withBulkTransaction } from "../utils/bulkAction.utils";
import { logProcessing } from "../utils/logger/logHelper";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";
import { notifyUserAssigned, notifyUserAssignedMany } from "../services/inAppNotification.service";
import { QueryTypes } from "sequelize";
import { recordPortfolioSnapshot } from "../utils/quantitativeRisk.utils";
import {
  createRiskService,
  QuantitativeRiskValidationError,
  updateRiskService,
} from "../services/risk.service";
import { enqueueRiskLinkRecompute } from "../services/automations/automationProducer";
import { getProjectByIdQuery } from "../utils/project.utils";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "../utils/llmKey.utils";
import { LLMProvider } from "../domain.layer/interfaces/i.llmKey";
import { createModelFromKey } from "../advisor/llmModelFactory";
import {
  RiskSuggestionError,
  suggestRisksForUseCase,
} from "../services/riskSuggestions/riskSuggestions.service";

import { riskViewer, riskVisibilitySql, SYSTEM_RISK_VIEWER } from "../utils/riskVisibility.utils";
import { translateError } from "../utils/i18n.utils";
import { IRisk } from "../domain.layer/interfaces/I.risk";
import { BulkRiskChange } from "../utils/automation/risk.automation.utils";
// Helper function to get user name
async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

type AssignedRisk = Pick<IRisk, "id" | "risk_owner" | "risk_name" | "risk_description">;

/**
 * Tell each risk's new owner they were assigned. Shared by the single edit and
 * the bulk set_owner. An owner given one risk gets the single-risk notice; an
 * owner given several in one bulk action gets one notice listing them all.
 * Run it after commit and do not await it: a failed notification must not
 * fail the edit.
 */
async function notifyNewRiskOwners(
  organizationId: number,
  assignerUserId: number,
  risks: AssignedRisk[],
): Promise<void> {
  if (risks.length === 0) return;
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const assignerName = await getUserNameById(assignerUserId);

  const byOwner = new Map<number, AssignedRisk[]>();
  for (const risk of risks) {
    const owned = byOwner.get(risk.risk_owner) ?? [];
    owned.push(risk);
    byOwner.set(risk.risk_owner, owned);
  }

  const singles: AssignedRisk[] = [];
  for (const [ownerId, owned] of byOwner) {
    if (owned.length === 1) {
      singles.push(owned[0]);
      continue;
    }
    try {
      await notifyUserAssignedMany(
        organizationId,
        ownerId,
        {
          entityType: "project_risk",
          items: owned.map((risk) => ({ id: risk.id!, name: risk.risk_name })),
          roleType: "Risk Owner",
          entityUrl: "/risk-management",
          texts: {
            titleKey: "{count} risks were assigned to you",
            messageKey: "{assigner} assigned you as Risk Owner for {count} risks: {names}",
            messageMoreKey:
              "{assigner} assigned you as Risk Owner for {count} risks: {names} and {more} more",
            itemsLabel: "risks",
            roleDescription:
              "As the Risk Owner, you are responsible for managing and mitigating these risks.",
          },
        },
        assignerName,
        baseUrl,
      );
    } catch (err) {
      logger.error("Failed to send risk owner notification:", err);
    }
  }
  if (singles.length === 0) return;

  // Project name for context, one query for every single-risk notice
  const projectTitles = await getProjectTitlesByRiskIdsQuery(
    singles.map((risk) => risk.id!),
    organizationId,
  );

  for (const risk of singles) {
    try {
      await notifyUserAssigned(
        organizationId,
        risk.risk_owner,
        {
          entityType: "project_risk",
          entityId: risk.id!,
          entityName: risk.risk_name,
          roleType: "Risk Owner",
          entityUrl: `/risk-management?riskId=${risk.id}`,
        },
        assignerName,
        baseUrl,
        {
          projectName: projectTitles.get(risk.id!),
          description: risk.risk_description,
        },
      );
    } catch (err) {
      logger.error("Failed to send risk owner notification:", err);
    }
  }
}

export async function getAllRisks(req: Request, res: Response): Promise<any> {
  const filter = (req.query.filter as "active" | "deleted" | "all") || "active";

  logStructured(
    "processing",
    `fetching all project risks with filter: ${filter}`,
    "getAllProjectRisks",
    "projectRisks.ctrl.ts",
  );
  logger.debug(`🔍 Fetching all project risks with filter: ${filter}`);
  try {
    const projectRisks = await getAllRisksQuery(req.organizationId!, filter, riskViewer(req));

    if (projectRisks) {
      logStructured(
        "successful",
        `project risks found`,
        "getAllProjectRisks",
        "projectRisks.ctrl.ts",
      );
      return res.status(200).json(STATUS_CODE[200](projectRisks));
    }

    logStructured(
      "successful",
      `no project risks found`,
      "getAllProjectRisks",
      "projectRisks.ctrl.ts",
    );
    return res.status(204).json(STATUS_CODE[204](projectRisks));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch project risks`,
      "getAllProjectRisks",
      "projectRisks.ctrl.ts",
    );
    await logEvent("Error", `Failed to retrieve project risks`, req.userId!, req.organizationId!);
    logger.error("❌ Error in getAllProjectRisks:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getRisksByProject(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(req.params.id as string, 10);
  const filter = (req.query.filter as "active" | "deleted" | "all") || "active";

  // Return empty array for non-numeric project IDs (e.g., plugin-sourced IDs like "plugin-prefix-2")
  if (isNaN(projectId)) {
    return res.status(200).json(STATUS_CODE[200]([]));
  }

  logStructured(
    "processing",
    `fetching risks for project ID: ${projectId} with filter: ${filter}`,
    "getRisksByProject",
    "risks.ctrl.ts",
  );
  logger.debug(`🔍 Fetching risks for project ID: ${projectId} with filter: ${filter}`);
  try {
    const risks = await getRisksByProjectQuery(
      projectId,
      req.organizationId!,
      filter,
      riskViewer(req),
    );

    if (risks) {
      logStructured(
        "successful",
        `risks found for project ID: ${projectId} with filter: ${filter}`,
        "getRisksByProject",
        "risks.ctrl.ts",
      );
      return res.status(200).json(STATUS_CODE[200](risks));
    }

    logStructured(
      "successful",
      `no risks found for project ID: ${projectId} with filter: ${filter}`,
      "getRisksByProject",
      "risks.ctrl.ts",
    );
    return res.status(204).json(STATUS_CODE[204](risks));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risks for project ID: ${projectId}`,
      "getRisksByProject",
      "risks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Failed to retrieve risks for project ID: ${projectId}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in getRisksByProject:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getRisksByFramework(req: Request, res: Response): Promise<any> {
  const frameworkId = parseInt(req.params.id as string, 10);
  const filter = (req.query.filter as "active" | "deleted" | "all") || "active";

  logStructured(
    "processing",
    `fetching risks for framework ID: ${frameworkId} with filter: ${filter}`,
    "getRisksByFramework",
    "risks.ctrl.ts",
  );
  logger.debug(`🔍 Fetching risks for framework ID: ${frameworkId} with filter: ${filter}`);
  try {
    const risks = await getRisksByFrameworkQuery(
      frameworkId,
      req.organizationId!,
      filter,
      riskViewer(req),
    );

    if (risks) {
      logStructured(
        "successful",
        `risks found for framework ID: ${frameworkId} with filter: ${filter}`,
        "getRisksByFramework",
        "risks.ctrl.ts",
      );
      return res.status(200).json(STATUS_CODE[200](risks));
    }

    logStructured(
      "successful",
      `no risks found for framework ID: ${frameworkId} with filter: ${filter}`,
      "getRisksByFramework",
      "risks.ctrl.ts",
    );
    return res.status(204).json(STATUS_CODE[204](risks));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risks for framework ID: ${frameworkId}`,
      "getRisksByFramework",
      "risks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Failed to retrieve risks for framework ID: ${frameworkId}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in getRisksByFramework:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getRiskById(req: Request, res: Response): Promise<any> {
  const projectRiskId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    10,
  );

  logStructured(
    "processing",
    `fetching project risk by ID: ${projectRiskId}`,
    "getRiskById",
    "risks.ctrl.ts",
  );
  logger.debug(`🔍 Looking up project risk with ID: ${projectRiskId}`);
  try {
    // A risk the viewer cannot see answers like a missing one.
    const projectRisk = await getRiskByIdQuery(projectRiskId, req.organizationId!, riskViewer(req));

    if (projectRisk) {
      logStructured(
        "successful",
        `project risk found: ID ${projectRiskId}`,
        "getProjectRiskById",
        "projectRisks.ctrl.ts",
      );
      return res.status(200).json(STATUS_CODE[200](projectRisk));
    }

    logStructured(
      "successful",
      `no project risk found: ID ${projectRiskId}`,
      "getProjectRiskById",
      "projectRisks.ctrl.ts",
    );
    return res.status(204).json(STATUS_CODE[204](projectRisk));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch project risk: ID ${projectRiskId}`,
      "getProjectRiskById",
      "projectRisks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Failed to retrieve project risk by ID: ${projectRiskId}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in getProjectRiskById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * What follows a committed risk creation: the event log entry, the portfolio
 * snapshot (FAIR risks), the risk link recompute and the risk owner's
 * notification. Shared by every HTTP route that creates a risk from a
 * request body, so they behave the same.
 */
export async function runRiskCreatedSideEffects(
  newProjectRisk: Awaited<ReturnType<typeof createRiskService>>,
  req: Request,
): Promise<void> {
  logStructured(
    "successful",
    `project risk created: ${newProjectRisk.risk_name}`,
    "createProjectRisk",
    "projectRisks.ctrl.ts",
  );
  await logEvent(
    "Create",
    `Project risk created: ${newProjectRisk.risk_name}`,
    req.userId!,
    req.organizationId!,
  );

  // Record portfolio snapshot if quantitative fields were provided (fire-and-forget)
  if (newProjectRisk.ale_estimate != null) {
    recordPortfolioSnapshot(req.organizationId!).catch((err) =>
      logger.error("Failed to record portfolio snapshot:", err),
    );
  }

  // Recompute this risk's stored links (fire-and-forget)
  enqueueRiskLinkRecompute(req.organizationId!, newProjectRisk.id!).catch((err) =>
    logger.error("Failed to enqueue risk link recompute:", err),
  );

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
        {
          replacements: { projectId: projects[0], organizationId: req.organizationId! },
          type: QueryTypes.SELECT,
        },
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
      },
    ).catch((err) => logger.error("Failed to send risk owner notification:", err));
  }
}

export async function createRisk(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const riskData = req.body;

  logStructured("processing", "starting createRisk", "createRisk", "risks.ctrl.ts");
  logger.debug("🛠️ Creating new project risk");
  try {
    const newProjectRisk = await createRiskService(
      {
        ...riskData,
        projects: req.body.projects || [],
        frameworks: req.body.frameworks || [],
        // Only the demo seed creates demo risks; "Delete demo data" removes them.
        is_demo: false,
      },
      { userId: req.userId!, organizationId: req.organizationId!, viewer: riskViewer(req) },
      transaction,
    );

    if (newProjectRisk) {
      await transaction.commit();
      await runRiskCreatedSideEffects(newProjectRisk, req);

      return res.status(201).json(STATUS_CODE[201](newProjectRisk));
    }

    logStructured(
      "error",
      "failed to create project risk",
      "createProjectRisk",
      "projectRisks.ctrl.ts",
    );
    await logEvent("Error", "Project risk creation failed", req.userId!, req.organizationId!);
    await transaction.rollback();
    return res.status(400).json(STATUS_CODE[400](req.t!("Unable to create project risk")));
  } catch (error) {
    await transaction.rollback();

    // Handle specific validation errors
    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation failed: ${error.message}`,
        "createProjectRisk",
        "projectRisks.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Validation error during project risk creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "createProjectRisk",
        "projectRisks.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Business logic error during project risk creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logStructured(
      "error",
      "unexpected error during project risk creation",
      "createProjectRisk",
      "projectRisks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Unexpected error during project risk creation: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in createProjectRisk:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateRiskById(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectRiskId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    10,
  );
  const updateData = req.body;

  logStructured(
    "processing",
    `updating project risk ID: ${projectRiskId}`,
    "updateRiskById",
    "risks.ctrl.ts",
  );
  logger.debug(`✏️ Update requested for project risk ID: ${projectRiskId}`);
  try {
    // Find existing risk to track changes. A risk the viewer cannot see
    // answers like a missing one.
    const existingProjectRisk = await getRiskByIdQuery(
      projectRiskId,
      req.organizationId!,
      riskViewer(req),
    );

    if (!existingProjectRisk) {
      logStructured(
        "error",
        `project risk not found: ID ${projectRiskId}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Project risk not found for update: ID ${projectRiskId}`,
        req.userId!,
        req.organizationId!,
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Project risk not found")));
    }

    const updatedProjectRisk = await updateRiskService(
      projectRiskId,
      updateData,
      existingProjectRisk,
      { userId: req.userId!, organizationId: req.organizationId!, viewer: riskViewer(req) },
      transaction,
    );

    if (updatedProjectRisk) {
      await transaction.commit();
      logStructured(
        "successful",
        `project risk updated: ID ${projectRiskId}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts",
      );
      await logEvent(
        "Update",
        `Project risk updated: ID ${projectRiskId}`,
        req.userId!,
        req.organizationId!,
      );

      // Record portfolio snapshot if quantitative fields were updated (fire-and-forget)
      if (updatedProjectRisk.ale_estimate != null) {
        recordPortfolioSnapshot(req.organizationId!).catch((err) =>
          console.error("Failed to record portfolio snapshot:", err),
        );
      }

      // Recompute this risk's stored links (fire-and-forget)
      enqueueRiskLinkRecompute(req.organizationId!, projectRiskId).catch((err) =>
        console.error("Failed to enqueue risk link recompute:", err),
      );

      // Send risk owner assignment notification if owner changed (fire-and-forget)
      const newRiskOwner = updatedProjectRisk.risk_owner;
      if (newRiskOwner && newRiskOwner !== existingProjectRisk.risk_owner) {
        notifyNewRiskOwners(req.organizationId!, req.userId!, [updatedProjectRisk]).catch((err) =>
          console.error("Failed to send risk owner notification:", err),
        );
      }

      return res.status(200).json(STATUS_CODE[200](updatedProjectRisk));
    }

    logStructured(
      "error",
      "project risk not found for update",
      "updateProjectRiskById",
      "projectRisks.ctrl.ts",
    );
    await logEvent(
      "Error",
      "Project risk not found for updateProjectRiskById",
      req.userId!,
      req.organizationId!,
    );
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("Project risk not found")));
  } catch (error) {
    await transaction.rollback();

    // Raised by updateRiskService when the merged FAIR field set does not
    // validate. Answered with the whole list, exactly as this handler did
    // before the check moved into the service.
    if (error instanceof QuantitativeRiskValidationError) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!("Quantitative risk validation failed"),
          errors: error.errors,
        }),
      );
    }

    // Handle specific validation and business logic errors
    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Validation error during project risk update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "updateProjectRiskById",
        "projectRisks.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Business logic error during project risk update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logStructured(
      "error",
      `unexpected error for project risk ID ${projectRiskId}`,
      "updateProjectRiskById",
      "projectRisks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Unexpected error during update for project risk ID ${projectRiskId}: ${
        (error as Error).message
      }`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in updateProjectRiskById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteRiskById(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectRiskId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    10,
  );

  logStructured(
    "processing",
    `attempting to delete project risk ID ${projectRiskId}`,
    "deleteRiskById",
    "risks.ctrl.ts",
  );
  logger.debug(`🗑️ Delete request for project risk ID ${projectRiskId}`);
  try {
    // Soft delete + automation + change history + policy unlinks (R-M8). A
    // risk the viewer cannot see answers like a missing one.
    const deletedProjectRisk = await archiveRiskQuery(
      projectRiskId,
      req.organizationId!,
      req.userId,
      transaction,
      { viewer: riskViewer(req) },
    );

    if (deletedProjectRisk) {
      await transaction.commit();
      logStructured(
        "successful",
        `project risk deleted: ID ${projectRiskId}`,
        "deleteProjectRiskById",
        "projectRisks.ctrl.ts",
      );
      await logEvent(
        "Delete",
        `Project risk deleted: ID ${projectRiskId}`,
        req.userId!,
        req.organizationId!,
      );
      // The response body stays `true`: the legacy contract never returned the row.
      return res.status(200).json(STATUS_CODE[200](true));
    }

    logStructured(
      "error",
      `project risk not found: ID ${projectRiskId}`,
      "deleteProjectRiskById",
      "projectRisks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Delete failed — project risk not found: ID ${projectRiskId}`,
      req.userId!,
      req.organizationId!,
    );
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("Project risk not found")));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error deleting project risk ID ${projectRiskId}`,
      "deleteProjectRiskById",
      "projectRisks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Unexpected error during delete for project risk ID ${projectRiskId}: ${
        (error as Error).message
      }`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in deleteProjectRiskById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

type BulkProjectRiskAction = "set_owner" | "set_category" | "archive";

/**
 * PATCH /api/project-risks/bulk
 *
 * Body: { ids: number[], action: 'set_owner' | 'set_category' | 'archive',
 *         ownerId?: number, categories?: string[] }
 *
 * Tenant-scoped bulk update of project risks. Authorized for Admin and Editor roles.
 */
export async function bulkUpdateProjectRisks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting bulkUpdateProjectRisks",
    functionName: "bulkUpdateProjectRisks",
    fileName: "risks.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const ids = parseBulkIds(req.body?.ids);
    const action = req.body?.action as BulkProjectRiskAction;

    if (action !== "set_owner" && action !== "set_category" && action !== "archive") {
      throw new ValidationException(
        "action must be one of: set_owner, set_category, archive",
        "action",
        req.body?.action,
      );
    }

    let ownerId: number | undefined;
    if (action === "set_owner") {
      const raw = req.body?.ownerId;
      const parsed = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ValidationException("ownerId must be a positive integer", "ownerId", raw);
      }
      ownerId = parsed;
    }

    let categories: string[] | undefined;
    if (action === "set_category") {
      const raw = req.body?.categories;
      if (!Array.isArray(raw)) {
        throw new ValidationException("categories must be an array", "categories", raw);
      }
      for (const c of raw) {
        if (typeof c !== "string" || !PROJECT_RISK_CATEGORIES_SET.has(c)) {
          throw new ValidationException(`Invalid risk category: ${String(c)}`, "categories", c);
        }
      }
      categories = raw as string[];
    }

    const organizationId = req.organizationId!;
    const userId = req.userId!;

    // Each risk goes through the single-edit path, so it gets the same change
    // history and policy unlinks (R-M8). The org's automation runs once for
    // the whole action, with a summary, not once per risk.
    const { updatedIds, newOwnerRisks } = await withBulkTransaction(
      {
        audit: {
          action,
          ids,
          fileName: "risks.ctrl.ts",
          functionName: "bulkUpdateProjectRisks",
          userId,
          organizationId,
          eventType: action === "archive" ? "Delete" : "Update",
        },
      },
      async (transaction) => {
        // A risk the user cannot see counts as an id that is not theirs.
        await assertOrgOwnsIds({
          table: "risks",
          ids,
          organizationId,
          transaction,
          extra: riskVisibilitySql("risks", riskViewer(req)),
        });

        const updatedIds: number[] = [];
        const newOwnerRisks: AssignedRisk[] = [];
        const changes: BulkRiskChange[] = [];

        if (action === "archive") {
          // The batch check above already rejected any id the user cannot
          // see, in this transaction, so the shared bulk archive runs as the
          // system rather than repeat the visibility check once per id.
          const archived = await archiveRisksInBulkQuery(ids, organizationId, userId, transaction);
          return { updatedIds: archived.map((row) => Number(row.id)), newOwnerRisks };
        }

        if (action === "set_owner") {
          await assertRiskReferencesInOrganization(
            { risk_owner: ownerId },
            organizationId,
            transaction,
          );
        }

        // Archived risks are left alone, as before.
        const activeRisks = await getActiveRisksByIdsQuery(ids, organizationId, transaction);

        for (const risk of activeRisks) {
          // A risk that already has the value is not an edit: no write,
          // automation, history or recompute, and it is not counted.
          const unchanged =
            action === "set_owner"
              ? Number(risk.risk_owner) === ownerId
              : sameRiskCategories(risk.risk_category, categories!);
          if (unchanged) continue;

          const input =
            action === "set_owner" ? { risk_owner: ownerId } : { risk_category: categories };
          // The batch check above already rejected any id the user cannot
          // see, in this transaction, so update as the system rather than
          // repeat the visibility check once per id. The input names no use
          // case, so no link is touched (ruling J3 is not in play).
          const updated = await updateRiskService(
            risk.id!,
            input,
            risk,
            { userId, organizationId, viewer: SYSTEM_RISK_VIEWER },
            transaction,
            { recordSnapshots: false, runAutomations: false },
          );
          if (!updated) continue;
          updatedIds.push(risk.id!);
          changes.push({ before: risk, after: updated.dataValues ?? updated });
          if (action === "set_owner" && updated.risk_owner) {
            newOwnerRisks.push(updated);
          }
        }
        if (updatedIds.length > 0) {
          await recordRiskSnapshots(organizationId, transaction);
          await enqueueBulkRiskAutomation("risk_updated", changes, organizationId, transaction);
        }
        return { updatedIds, newOwnerRisks };
      },
    );

    // After commit, as the single edit does: a link recompute for every
    // updated risk (an archive is a soft delete and recomputes nothing — R7)
    // and one notification to the new owner (one notice listing the risks
    // when there are several).
    if (action !== "archive") {
      for (const riskId of updatedIds) {
        enqueueRiskLinkRecompute(organizationId, riskId).catch((err) =>
          console.error("Failed to enqueue risk link recompute:", err),
        );
      }
    }
    notifyNewRiskOwners(organizationId, userId, newOwnerRisks).catch((err) =>
      console.error("Failed to send risk owner notification:", err),
    );

    // `updated` keeps its frozen meaning (the ids sent); `changed` is how many
    // risks were actually archived or edited.
    return res
      .status(200)
      .json(STATUS_CODE[200]({ updated: ids.length, changed: updatedIds.length, action }));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof ForbiddenException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Mirrors selectLLMKey in advisor.ctrl.ts (not exported there): an explicit
 * llmKeyId wins when it exists; anything else falls back to the org's first
 * key — the same row the empty-check above saw, since getLLMKeysWithKeyQuery
 * orders by created_at DESC.
 */
function selectLLMKeyForSuggestion(clients: any[], llmKeyId?: number): any {
  if (llmKeyId !== undefined) {
    const found = clients.find((k: any) => k.id === llmKeyId);
    if (found) return found;
    logger.warn(`LLM key ID ${llmKeyId} not found, using default key`);
  }
  return clients[0];
}

/**
 * POST /api/projectRisks/suggest-ai
 *
 * Body: { projectId: number, technologySummary?: string, llmKeyId?: number }
 *
 * Ask the org-configured LLM for risks relevant to a use case: matches from
 * the built-in MIT/IBM risk catalogs plus free-form suggestions. Read-only —
 * nothing is persisted; accepting a suggestion is a separate flow.
 *
 * Error mapping: a RiskSuggestionError means the paid provider call failed,
 * which is an upstream failure → 502 with a safe, actionable message chosen
 * from the provider's HTTP status (taxonomy per advisor.ctrl.ts's onError).
 * The raw provider body, prompt and API key never leave the server. Anything
 * else is an internal failure → 500.
 */
export async function suggestRisksWithAI(req: Request, res: Response): Promise<any> {
  const projectId = Number(req.body?.projectId);

  logStructured(
    "processing",
    `suggesting risks with AI for project ID: ${projectId}`,
    "suggestRisksWithAI",
    "risks.ctrl.ts",
  );
  logger.debug(`🤖 AI risk suggestions requested for project ID: ${projectId}`);

  try {
    const organizationId = req.organizationId!;

    if (!Number.isInteger(projectId) || projectId < 1) {
      return res.status(400).json(STATUS_CODE[400](req.t!("projectId must be a positive integer")));
    }

    const project = await getProjectByIdQuery(projectId, organizationId);
    if (!project) {
      logStructured(
        "error",
        `project not found: ID ${projectId}`,
        "suggestRisksWithAI",
        "risks.ctrl.ts",
      );
      await logEvent(
        "Error",
        `AI risk suggestions failed — project not found: ID ${projectId}`,
        req.userId!,
        organizationId,
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Project not found")));
    }

    const clients = await getLLMKeysWithKeyQuery(organizationId);
    if (clients.length === 0) {
      logger.debug(`No LLM keys found for organization: ${organizationId}`);
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("No LLM keys configured for this organization.")));
    }

    const llmKeyId = req.body?.llmKeyId !== undefined ? Number(req.body.llmKeyId) : undefined;
    const llmKey = selectLLMKeyForSuggestion(clients, llmKeyId);
    const model = createModelFromKey({
      name: llmKey.name,
      key: llmKey.key,
      url: llmKey.url || getLLMProviderUrl(llmKey.name as LLMProvider),
      model: llmKey.model,
      custom_headers: llmKey.custom_headers ?? null,
    });

    const technologySummary =
      typeof req.body?.technologySummary === "string" &&
      req.body.technologySummary.trim().length > 0
        ? req.body.technologySummary.trim()
        : undefined;

    // Only the risks the user can see are named to the model as existing ones.
    const existingRisks =
      (await getRisksByProjectQuery(projectId, organizationId, "active", riskViewer(req))) ?? [];
    const existingRiskNames = existingRisks
      .map((risk) => risk.risk_name)
      .filter((name): name is string => Boolean(name));

    // The service decides how purpose and description combine (fallback and
    // repeat handling): see resolvePurposeAndDescription.
    const result = await suggestRisksForUseCase({
      model,
      useCase: {
        name: project.project_title,
        purpose: project.goal?.trim() || project.use_case_purpose?.trim() || undefined,
        description: project.description || undefined,
        technology:
          technologySummary || project.deployment_context || project.use_case_category || undefined,
      },
      existingRiskNames,
    });

    logStructured(
      "successful",
      `AI risk suggestions generated for project ID: ${projectId}`,
      "suggestRisksWithAI",
      "risks.ctrl.ts",
    );
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    if (error instanceof RiskSuggestionError) {
      // The provider's HTTP status, when present, rides on the wrapped cause
      // (@ai-sdk/* providers expose `statusCode`). Message and status decide
      // the client answer; the raw provider body is never echoed.
      const cause = (error as { cause?: unknown }).cause;
      const statusCode = (cause as { statusCode?: number } | undefined)?.statusCode;
      const causeMessage = cause instanceof Error ? cause.message : "";

      let safeMessage: string;
      if (statusCode === 401 || /invalid.*api.*key|unauthorized/i.test(causeMessage)) {
        safeMessage =
          "The configured LLM API key was rejected by the provider. Ask an Admin to verify the LLM key in Settings.";
      } else if (statusCode === 429 || /rate.*limit/i.test(causeMessage)) {
        safeMessage = "The AI provider is rate-limiting requests. Please wait and try again.";
      } else if (statusCode !== undefined && statusCode >= 500) {
        safeMessage = "The AI provider is currently unavailable. Please try again shortly.";
      } else {
        safeMessage =
          "Failed to generate risk suggestions with the configured AI provider. Please try again later.";
      }

      logStructured(
        "error",
        `AI risk suggestion failed for project ID ${projectId}`,
        "suggestRisksWithAI",
        "risks.ctrl.ts",
      );
      await logEvent(
        "Error",
        `AI risk suggestion failed for project ID ${projectId}`,
        req.userId!,
        req.organizationId!,
      );
      // Status only: the service already logged the provider message, and the
      // prompt/key/raw completion must never be logged or returned.
      logger.error(
        `❌ suggestRisksWithAI: provider call failed for project ${projectId} (status ${statusCode ?? "n/a"})`,
      );
      return res.status(502).json(STATUS_CODE[502](safeMessage));
    }

    logStructured(
      "error",
      `unexpected error suggesting risks for project ID ${projectId}`,
      "suggestRisksWithAI",
      "risks.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Unexpected error during AI risk suggestion for project ID ${projectId}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in suggestRisksWithAI:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
