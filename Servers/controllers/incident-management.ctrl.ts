import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import {
  getAllIncidentsQuery,
  getIncidentByIdQuery,
  createNewIncidentQuery,
  updateIncidentByIdQuery,
  deleteIncidentByIdQuery,
  archiveIncidentByIdQuery,
} from "../utils/incidentManagement.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { ValidationError } from "../utils/validations/validation.utils";
import {
  validateCompleteIncidentCreation,
  validateCompleteIncidentUpdate,
  validateIncidentIdParam,
} from "../utils/validations/incidentManagementValidation.utils";
import {
  recordIncidentCreation,
  trackIncidentChanges,
  recordMultipleFieldChanges,
} from "../utils/incidentChangeHistory.utils";

/**
 * Get all incidents
 */
export async function getAllIncidents(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getAllIncidents",
    "getAllIncidents",
    "incidentManagement.controller.ts"
  );
  logger.debug("🔍 Fetching all incidents");

  try {
    const incidents = (await getAllIncidentsQuery(
      req.organizationId!
    )) as AIIncidentManagementModel[];

    if (incidents && incidents.length > 0) {
      logStructured(
        "successful",
        "incidents found",
        "getAllIncidents",
        "incidentManagement.controller.ts"
      );
      return res
        .status(200)
        .json(
          STATUS_CODE[200](incidents.map((incident) => incident.toSafeJSON()))
        );
    }

    logStructured(
      "successful",
      "no incidents found",
      "getAllIncidents",
      "incidentManagement.controller.ts"
    );
    return res.status(200).json(STATUS_CODE[200](incidents));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve incidents",
      "getAllIncidents",
      "incidentManagement.controller.ts"
    );
    logger.error("❌ Error in getAllIncidents:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get incident by ID
 */
export async function getIncidentById(req: Request, res: Response) {
  const incidentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  const idValidation = validateIncidentIdParam(incidentId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid incident ID parameter: ${req.params.id}`,
      "getIncidentById",
      "incidentManagement.controller.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid incident ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  logStructured(
    "processing",
    `fetching incident by id: ${incidentId}`,
    "getIncidentById",
    "incidentManagement.controller.ts"
  );
  logger.debug(`🔍 Looking up incident with id: ${incidentId}`);

  try {
    const incident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!
    )) as AIIncidentManagementModel;
    if (incident) {
      logStructured(
        "successful",
        `incident found: ${incidentId}`,
        "getIncidentById",
        "incidentManagement.controller.ts"
      );
      return res.status(200).json(STATUS_CODE[200](incident.toSafeJSON()));
    }

    logStructured(
      "successful",
      `no incident found: ${incidentId}`,
      "getIncidentById",
      "incidentManagement.controller.ts"
    );
    return res.status(204).json(STATUS_CODE[204](incident));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve incident",
      "getIncidentById",
      "incidentManagement.controller.ts"
    );
    logger.error("❌ Error in getIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Create new incident
 */
export async function createNewIncident(req: Request, res: Response) {
  const validationErrors = validateCompleteIncidentCreation(req.body);
  if (validationErrors.length > 0) {
    logStructured(
      "error",
      "Incident creation validation failed",
      "createNewIncident",
      "incidentManagement.controller.ts"
    );
    return res.status(400).json({
      status: "error",
      message: "Incident creation validation failed",
      errors: validationErrors.map((err: ValidationError) => ({
        field: err.field,
        message: err.message,
        code: err.code,
      })),
    });
  }

  const transaction = await sequelize.transaction();
  try {
    const incident = new AIIncidentManagementModel({
      ai_project: req.body.ai_project,
      type: req.body.type,
      severity: req.body.severity,
      status: req.body.status,
      occurred_date: req.body.occurred_date ? req.body.occurred_date : null,
      date_detected: req.body.date_detected ? req.body.date_detected : null,
      reporter: req.body.reporter,
      approval_status: req.body.approval_status,
      approved_by: req.body.approved_by,
      categories_of_harm: req.body.categories_of_harm
        ? Array.isArray(req.body.categories_of_harm)
          ? req.body.categories_of_harm
          : req.body.categories_of_harm.split(",").map((s: string) => s.trim())
        : [],
      affected_persons_groups: req.body.affected_persons_groups,
      description: req.body.description,
      relationship_causality: req.body.relationship_causality,
      immediate_mitigations: req.body.immediate_mitigations,
      planned_corrective_actions: req.body.planned_corrective_actions,
      model_system_version: req.body.model_system_version,
      interim_report: req.body.interim_report,
      archived: req.body.archived || false,
      approval_date: req.body.approval_date ? req.body.approval_date : null,
      approval_notes: req.body.approval_notes,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const savedIncident = await createNewIncidentQuery(
      incident,
      req.organizationId!,
      transaction
    );

    // Record creation in change history
    if (savedIncident.id && req.userId) {
      await recordIncidentCreation(
        savedIncident.id,
        req.userId,
        req.organizationId!,
        req.body,
        transaction
      );
    }

    await transaction.commit();

    logStructured(
      "successful",
      "new incident created",
      "createNewIncident",
      "incidentManagement.controller.ts"
    );
    return res.status(201).json(STATUS_CODE[201](savedIncident.toSafeJSON()));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to create new incident",
      "createNewIncident",
      "incidentManagement.controller.ts"
    );
    logger.error("❌ Error in createNewIncident:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Update incident by ID
 */
export async function updateIncidentById(req: Request, res: Response) {
  const incidentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  const idValidation = validateIncidentIdParam(incidentId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid incident ID parameter: ${req.params.id}`,
      "updateIncidentById",
      "incidentManagement.controller.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid incident ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  let existingIncident: AIIncidentManagementModel | null = null;
  try {
    existingIncident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!
    )) as AIIncidentManagementModel;
  } catch {}

  const validationErrors = validateCompleteIncidentUpdate(
    req.body,
    existingIncident
  );
  if (validationErrors.length > 0) {
    const errorDetails = validationErrors.map((err: ValidationError) => ({
      field: err.field,
      message: err.message,
      code: err.code,
    }));
    logStructured(
      "error",
      `Incident update validation failed for ID ${incidentId}: ${JSON.stringify(errorDetails)}`,
      "updateIncidentById",
      "incidentManagement.controller.ts"
    );
    return res.status(400).json({
      status: "error",
      message: "Incident update validation failed",
      errors: errorDetails,
    });
  }

  const transaction = await sequelize.transaction();
  try {
    const currentIncident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!
    )) as AIIncidentManagementModel;
    if (!currentIncident) {
      logStructured(
        "successful",
        "no incident found",
        "updateIncidentById",
        "incidentManagement.controller.ts"
      );
      return res.status(404).json(STATUS_CODE[404]("Incident not found"));
    }

    // Get the plain object for change tracking before updating
    const existingData = currentIncident.toSafeJSON();

    Object.assign(currentIncident, { ...req.body, updated_at: new Date() });

    const savedIncident = await updateIncidentByIdQuery(
      incidentId,
      currentIncident,
      req.organizationId!,
      transaction
    );

    // Track and record changes
    if (req.userId) {
      const changes = await trackIncidentChanges(existingData, req.body);
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          incidentId,
          req.userId,
          req.organizationId!,
          changes,
          transaction
        );
      }
    }

    await transaction.commit();

    logStructured(
      "successful",
      "incident updated",
      "updateIncidentById",
      "incidentManagement.controller.ts"
    );
    return res.status(200).json(STATUS_CODE[200](savedIncident.toSafeJSON()));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to update incident",
      "updateIncidentById",
      "incidentManagement.controller.ts"
    );
    logger.error("❌ Error in updateIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Delete incident by ID
 */
export async function deleteIncidentById(req: Request, res: Response) {
  const incidentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  const idValidation = validateIncidentIdParam(incidentId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid incident ID parameter: ${req.params.id}`,
      "deleteIncidentById",
      "incidentManagement.controller.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid incident ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  const transaction = await sequelize.transaction();
  try {
    const existingIncident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!
    )) as AIIncidentManagementModel;
    if (!existingIncident) {
      logStructured(
        "successful",
        "no incident found",
        "deleteIncidentById",
        "incidentManagement.controller.ts"
      );
      return res.status(404).json(STATUS_CODE[404]("Incident not found"));
    }

    await deleteIncidentByIdQuery(incidentId, req.organizationId!, transaction);
    await transaction.commit();

    logStructured(
      "successful",
      "incident deleted",
      "deleteIncidentById",
      "incidentManagement.controller.ts"
    );
    return res
      .status(200)
      .json(STATUS_CODE[200]("Incident deleted successfully"));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to delete incident",
      "deleteIncidentById",
      "incidentManagement.controller.ts"
    );
    logger.error("❌ Error in deleteIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Archive incident by ID
 */
export async function archiveIncidentById(req: Request, res: Response) {
  const incidentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  const idValidation = validateIncidentIdParam(incidentId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid incident ID parameter: ${req.params.id}`,
      "archiveIncidentById",
      "incidentManagement.controller.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid incident ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  const transaction = await sequelize.transaction();
  try {
    const existingIncident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!
    )) as AIIncidentManagementModel;
    if (!existingIncident) {
      logStructured(
        "successful",
        "no incident found",
        "archiveIncidentById",
        "incidentManagement.controller.ts"
      );
      return res.status(404).json(STATUS_CODE[404]("Incident not found"));
    }

    const archivedIncident = await archiveIncidentByIdQuery(
      incidentId,
      req.organizationId!,
      transaction
    );
    await transaction.commit();

    logStructured(
      "successful",
      "incident archived",
      "archiveIncidentById",
      "incidentManagement.controller.ts"
    );
    return res
      .status(200)
      .json(STATUS_CODE[200](archivedIncident.toSafeJSON()));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to archive incident",
      "archiveIncidentById",
      "incidentManagement.controller.ts"
    );
    logger.error("❌ Error in archiveIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
