import { Request, Response } from "express";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import {
  getAllIncidentsQuery,
  getIncidentByIdQuery,
  IncidentListFilters,
} from "../utils/incidentManagement.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { ValidationError } from "../utils/validations/validation.utils";
import { translateError, translateRequest } from "../utils/i18n.utils";
import {
  validateIncidentIdParam,
  validateModelInventoryId,
  validateProjectId,
  validateAssigneeId,
} from "../utils/validations/incidentManagementValidation.utils";
import {
  createIncident,
  deleteIncident,
  setIncidentArchived,
  updateIncident,
  IncidentAccessDeniedError,
  IncidentCreateValidationError,
  IncidentUpdateValidationError,
  INCIDENT_APPROVE_DENIED_MESSAGE,
  INCIDENT_CHANGED_MESSAGE,
  INCIDENT_EDIT_DENIED_MESSAGE,
  type IncidentWriteAccess,
} from "../services/incidentManagement.service";
import { requestHasPermission } from "../utils/rolePermissions.utils";
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

/** The caller's incident write access, from the request's role (built-in or custom). */
const incidentWriteAccess = async (req: Request): Promise<IncidentWriteAccess> => {
  const [canEdit, canApprove] = await Promise.all([
    requestHasPermission(req, "incident.edit"),
    requestHasPermission(req, "incident.approve"),
  ]);
  return { canEdit, canApprove };
};

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
    // Missing, or in another organization: the same 404 as update, archive and delete.
    return res.status(404).json(STATUS_CODE[404](req.t!("Incident not found")));
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
  const creationFailed = translateRequest(req, "Incident creation validation failed");
  try {
    // The shared create path (services/incidentManagement.service.ts), also
    // used by the AI Advisor: validation, reference checks, the server's
    // approval fields, creation history and the critical incident workflow.
    // Only a caller with incident.approve may record an approval decision.
    const savedIncident = await createIncident(req.organizationId!, req.body ?? {}, {
      userId: req.userId,
      canApprove: await requestHasPermission(req, "incident.approve"),
    });

    logStructured(
      "successful",
      "new incident created",
      "createNewIncident",
      "incidentManagement.controller.ts",
    );
    return res.status(201).json(STATUS_CODE[201](savedIncident.toSafeJSON()));
  } catch (error) {
    if (error instanceof IncidentCreateValidationError) {
      logStructured(
        "error",
        "Incident creation validation failed",
        "createNewIncident",
        "incidentManagement.controller.ts",
      );
      return res.status(400).json(
        STATUS_CODE[400]({
          status: "error",
          message: creationFailed,
          errors: error.errors.map((err: ValidationError) => ({
            field: err.field,
            message: translateError(req, err),
            code: err.code,
          })),
        }),
      );
    }
    if (error instanceof ValidationException) {
      return res.status(400).json(validationExceptionResponse(req, error, creationFailed));
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
    // The route lets in either key; which one each changed field needs is
    // decided in the write path against the locked row.
    const access = await incidentWriteAccess(req);
    // Shared write path: locks the row, checks expected_updated_at and the
    // caller's access, validates against the locked row, drops a stale
    // closure approval on reopen, sets the approver and approval date,
    // writes changed fields and records change history.
    const savedIncident = await updateIncident(
      req.organizationId!,
      incidentId,
      updates,
      req.userId,
      { expectedUpdatedAt, access },
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
    if (error instanceof IncidentAccessDeniedError) {
      // An expected refusal, not a server fault: keep it out of the error stream.
      logger.warn(
        `Incident ${incidentId} update refused: no permission for ${error.fields.join(", ")}`,
      );
      return res
        .status(403)
        .json(
          STATUS_CODE[403](
            error.need === "edit"
              ? req.t!(INCIDENT_EDIT_DENIED_MESSAGE)
              : req.t!(INCIDENT_APPROVE_DENIED_MESSAGE),
          ),
        );
    }
    if (error instanceof IncidentUpdateValidationError) {
      const errorDetails = error.errors.map((err: ValidationError) => ({
        field: err.field,
        message: translateError(req, err),
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

/** 400 for an :id that is not a positive integer; null when it is valid. */
const invalidIncidentIdResponse = (req: Request, res: Response, handler: string) => {
  const incidentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const idValidation = validateIncidentIdParam(incidentId);
  if (idValidation.isValid) return { incidentId };
  logStructured(
    "error",
    `Invalid incident ID parameter: ${req.params.id}`,
    handler,
    "incidentManagement.controller.ts",
  );
  return {
    response: res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: idValidation.message || "Invalid incident ID",
        code: idValidation.code || "INVALID_PARAMETER",
      }),
    ),
  };
};

/**
 * Delete incident by ID (incident.delete). Records a deletion entry in change
 * history; `incident_deleted` is sent after commit. 404 when the incident
 * does not exist in the organization (nothing is sent).
 */
export async function deleteIncidentById(req: Request, res: Response) {
  const { incidentId, response } = invalidIncidentIdResponse(req, res, "deleteIncidentById");
  if (response) return response;

  try {
    const deleted = await deleteIncident(req.organizationId!, incidentId!, req.userId);
    if (!deleted) {
      logStructured(
        "successful",
        "no incident found",
        "deleteIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Incident not found")));
    }

    logStructured(
      "successful",
      "incident deleted",
      "deleteIncidentById",
      "incidentManagement.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](req.t!("Incident deleted successfully")));
  } catch (error) {
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

/** Message for an archive request whose `archived` is not a boolean. */
export const INCIDENT_ARCHIVED_FLAG_MESSAGE = "archived must be true or false";

/**
 * Archive (body `{}` or `{ archived: true }`) or restore
 * (`{ archived: false }`) an incident (incident.edit). Both go through the
 * shared update path: row lock, change history ("Archived") and the
 * `incident_updated` automation after commit. Returns the incident.
 */
export async function archiveIncidentById(req: Request, res: Response) {
  const { incidentId, response } = invalidIncidentIdResponse(req, res, "archiveIncidentById");
  if (response) return response;

  const requested = (req.body ?? {}).archived;
  if (requested !== undefined && typeof requested !== "boolean") {
    return res.status(400).json(
      STATUS_CODE[400]({
        status: "error",
        message: req.t!(INCIDENT_ARCHIVED_FLAG_MESSAGE),
        code: "INVALID_PARAMETER",
      }),
    );
  }
  const archived = requested ?? true;

  try {
    const incident = await setIncidentArchived(
      req.organizationId!,
      incidentId!,
      archived,
      req.userId,
    );
    if (!incident) {
      logStructured(
        "successful",
        "no incident found",
        "archiveIncidentById",
        "incidentManagement.controller.ts",
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Incident not found")));
    }

    logStructured(
      "successful",
      archived ? "incident archived" : "incident restored",
      "archiveIncidentById",
      "incidentManagement.controller.ts",
    );
    return res.status(200).json(STATUS_CODE[200](incident.toSafeJSON()));
  } catch (error) {
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
