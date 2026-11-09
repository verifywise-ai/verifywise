import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import {
  getAllIncidentsQuery,
  getIncidentByIdQuery,
  createNewIncidentQuery,
  deleteIncidentByIdQuery,
  archiveIncidentByIdQuery,
  validateIncidentReferences,
  IncidentListFilters,
} from "../utils/incidentManagement.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { ValidationError } from "../utils/validations/validation.utils";
import { translateError } from "../utils/i18n.utils";
import {
  validateCompleteIncidentCreation,
  validateIncidentIdParam,
  validateModelInventoryId,
  validateProjectId,
  validateAssigneeId,
} from "../utils/validations/incidentManagementValidation.utils";
import { recordIncidentCreation } from "../utils/incidentChangeHistory.utils";
import { triggerIncidentResponse } from "../services/workflows/triggers";
import { isCriticalIncidentSeverity } from "../domain.layer/enums/ai-incident-management.enum";
import {
  updateIncident,
  IncidentUpdateValidationError,
  INCIDENT_CHANGED_MESSAGE,
} from "../services/incidentManagement.service";
import {
  ConflictException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";

/** Parse and validate optional list filters (issue #4583). Returns an error message or the filters. */
const parseIncidentListFilters = (
  query: Request["query"],
): {
  filters?: IncidentListFilters;
  error?: string;
} => {
  const filters: IncidentListFilters = {};
  const checks: Array<[keyof IncidentListFilters, any, string]> = [
    ["model_inventory_id", query.model_inventory_id, "model_inventory_id"],
    ["project_id", query.project_id, "project_id"],
    ["assignee_id", query.assignee_id, "assignee_id"],
  ];
  for (const [key, raw, field] of checks) {
    if (raw === undefined || raw === null || raw === "") continue;
    const result =
      key === "model_inventory_id"
        ? validateModelInventoryId(raw)
        : key === "project_id"
          ? validateProjectId(raw)
          : validateAssigneeId(raw);
    if (!result.isValid) return { error: `${field}: ${result.message}` };
    filters[key] = Number(raw);
  }
  return { filters };
};

/**
 * 400 body for a ValidationException thrown by the write path, in the same
 * shape as the up-front validation failures in these handlers.
 */
const validationExceptionResponse = (req: Request, error: ValidationException, message: string) =>
  STATUS_CODE[400]({
    status: "error",
    message,
    errors: [
      {
        field: (error.metadata.field as string | undefined) ?? "unknown",
        message: translateError(req, error),
        code: (error.metadata.validationCode as string | undefined) ?? error.code,
      },
    ],
  });

/**
 * Get all incidents
 */
export async function getAllIncidents(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getAllIncidents",
    "getAllIncidents",
    "incidentManagement.controller.ts",
  );
  logger.debug("🔍 Fetching all incidents");

  try {
    const { filters, error } = parseIncidentListFilters(req.query);
    if (error) {
      return res.status(400).json(
        STATUS_CODE[400]({
          status: "error",
          message: "Invalid filter parameter",
          code: "INVALID_PARAMETER",
          details: error,
        }),
      );
    }

    const incidents = (await getAllIncidentsQuery(
      req.organizationId!,
      filters,
    )) as AIIncidentManagementModel[];

    if (incidents && incidents.length > 0) {
      logStructured(
        "successful",
        "incidents found",
        "getAllIncidents",
        "incidentManagement.controller.ts",
      );
      return res
        .status(200)
        .json(STATUS_CODE[200](incidents.map((incident) => incident.toSafeJSON())));
    }

    logStructured(
      "successful",
      "no incidents found",
      "getAllIncidents",
      "incidentManagement.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](incidents));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve incidents",
      "getAllIncidents",
      "incidentManagement.controller.ts",
    );
    logger.error("❌ Error in getAllIncidents:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
      "incidentManagement.controller.ts",
    );
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: idValidation.message || "Invalid incident ID",
        code: idValidation.code || "INVALID_PARAMETER",
      }),
    );
  }

  logStructured(
    "processing",
    `fetching incident by id: ${incidentId}`,
    "getIncidentById",
    "incidentManagement.controller.ts",
  );
  logger.debug(`🔍 Looking up incident with id: ${incidentId}`);

  try {
    const incident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!,
    )) as AIIncidentManagementModel;
    if (incident) {
      logStructured(
        "successful",
        `incident found: ${incidentId}`,
        "getIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(200).json(STATUS_CODE[200](incident.toSafeJSON()));
    }

    logStructured(
      "successful",
      `no incident found: ${incidentId}`,
      "getIncidentById",
      "incidentManagement.controller.ts",
    );
    return res.status(204).json(STATUS_CODE[204](incident));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve incident",
      "getIncidentById",
      "incidentManagement.controller.ts",
    );
    logger.error("❌ Error in getIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
      "incidentManagement.controller.ts",
    );
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: "Incident creation validation failed",
        errors: validationErrors.map((err: ValidationError) => ({
          field: err.field,
          message: translateError(req, err.message),
          code: err.code,
        })),
      }),
    );
  }

  const invalidRefs = await validateIncidentReferences(
    {
      model_inventory_id: req.body.model_inventory_id,
      project_id: req.body.project_id,
      assignee_id: req.body.assignee_id,
    },
    req.organizationId!,
  );
  if (invalidRefs.length > 0) {
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: "Incident creation validation failed",
        errors: invalidRefs.map((field) => ({
          field,
          message: `${field} does not reference an entity in your organization`,
          code: "INVALID_REFERENCE",
        })),
      }),
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const incident = new AIIncidentManagementModel({
      ai_project: req.body.ai_project,
      model_inventory_id: req.body.model_inventory_id ?? null,
      project_id: req.body.project_id ?? null,
      assignee_id: req.body.assignee_id ?? null,
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

    const savedIncident = await createNewIncidentQuery(incident, req.organizationId!, transaction);

    // Record creation in change history
    if (savedIncident.id && req.userId) {
      await recordIncidentCreation(
        savedIncident.id,
        req.userId,
        req.organizationId!,
        req.body,
        transaction,
      );
    }

    await transaction.commit();

    // Phase 6 / issue 3813 — launch the critical incident_response autopilot
    // workflow when the new incident is critical-tier. Fire-and-forget; never
    // blocks or fails the response.
    if (savedIncident.id && isCriticalIncidentSeverity(savedIncident.severity)) {
      triggerIncidentResponse(req.organizationId!, savedIncident.id, savedIncident.severity).catch(
        (err) => console.error("Failed to trigger incident_response workflow:", err),
      );
    }

    logStructured(
      "successful",
      "new incident created",
      "createNewIncident",
      "incidentManagement.controller.ts",
    );
    return res.status(201).json(STATUS_CODE[201](savedIncident.toSafeJSON()));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      return res
        .status(400)
        .json(validationExceptionResponse(req, error, "Incident creation validation failed"));
    }
    logStructured(
      "error",
      "failed to create new incident",
      "createNewIncident",
      "incidentManagement.controller.ts",
    );
    logger.error("❌ Error in createNewIncident:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
      "incidentManagement.controller.ts",
    );
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: idValidation.message || "Invalid incident ID",
        code: idValidation.code || "INVALID_PARAMETER",
      }),
    );
  }

  // The edit drawer sends the updated_at it loaded so a save over someone
  // else's newer change is refused (409) instead of silently overwriting it.
  const { expected_updated_at: expectedUpdatedAt, ...updates } = req.body ?? {};

  try {
    // Shared write path: locks the row, checks expected_updated_at, validates
    // against the locked row, drops a stale closure approval on reopen,
    // writes changed fields and records change history.
    const savedIncident = await updateIncident(
      req.organizationId!,
      incidentId,
      updates,
      req.userId,
      { expectedUpdatedAt },
    );
    if (!savedIncident) {
      logStructured(
        "successful",
        "no incident found",
        "updateIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Incident not found")));
    }

    logStructured(
      "successful",
      "incident updated",
      "updateIncidentById",
      "incidentManagement.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](savedIncident.toSafeJSON()));
  } catch (error) {
    if (error instanceof IncidentUpdateValidationError) {
      const errorDetails = error.errors.map((err: ValidationError) => ({
        field: err.field,
        message: translateError(req, err.message),
        code: err.code,
      }));
      logStructured(
        "error",
        `Incident update validation failed for ID ${incidentId}: ${JSON.stringify(errorDetails)}`,
        "updateIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(400).json(
        STATUS_CODE[400]({
          status: "error",
          message: "Incident update validation failed",
          errors: errorDetails,
        }),
      );
    }
    // Backstop in the write query (assertValidIncidentDescription).
    if (error instanceof ValidationException) {
      return res
        .status(400)
        .json(validationExceptionResponse(req, error, "Incident update validation failed"));
    }
    if (error instanceof ConflictException) {
      logStructured(
        "error",
        `Incident ${incidentId} changed since the editor loaded it`,
        "updateIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(409).json(
        STATUS_CODE[409]({
          status: "error",
          message: req.t!(INCIDENT_CHANGED_MESSAGE),
          code: "CONFLICT",
        }),
      );
    }
    logStructured(
      "error",
      "failed to update incident",
      "updateIncidentById",
      "incidentManagement.controller.ts",
    );
    logger.error("❌ Error in updateIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
      "incidentManagement.controller.ts",
    );
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: idValidation.message || "Invalid incident ID",
        code: idValidation.code || "INVALID_PARAMETER",
      }),
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const existingIncident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!,
    )) as AIIncidentManagementModel;
    if (!existingIncident) {
      logStructured(
        "successful",
        "no incident found",
        "deleteIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Incident not found")));
    }

    await deleteIncidentByIdQuery(incidentId, req.organizationId!, transaction);
    await transaction.commit();

    logStructured(
      "successful",
      "incident deleted",
      "deleteIncidentById",
      "incidentManagement.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](req.t!("Incident deleted successfully")));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to delete incident",
      "deleteIncidentById",
      "incidentManagement.controller.ts",
    );
    logger.error("❌ Error in deleteIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
      "incidentManagement.controller.ts",
    );
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: idValidation.message || "Invalid incident ID",
        code: idValidation.code || "INVALID_PARAMETER",
      }),
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const existingIncident = (await getIncidentByIdQuery(
      incidentId,
      req.organizationId!,
    )) as AIIncidentManagementModel;
    if (!existingIncident) {
      logStructured(
        "successful",
        "no incident found",
        "archiveIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Incident not found")));
    }

    const archivedIncident = await archiveIncidentByIdQuery(
      incidentId,
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    logStructured(
      "successful",
      "incident archived",
      "archiveIncidentById",
      "incidentManagement.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](archivedIncident.toSafeJSON()));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "failed to archive incident",
      "archiveIncidentById",
      "incidentManagement.controller.ts",
    );
    logger.error("❌ Error in archiveIncidentById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
