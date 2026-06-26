import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import {
  CustomFieldEntityType,
  createCustomFieldDefinitionQuery,
  deleteCustomFieldDefinitionQuery,
  deleteCustomFieldValueQuery,
  getCustomFieldDefinitionByIdQuery,
  getCustomFieldValuesForEntityQuery,
  getMissingRequiredCustomFieldsQuery,
  listCustomFieldDefinitionsQuery,
  setCustomFieldValueQuery,
  updateCustomFieldDefinitionQuery,
} from "../utils/customField.utils";

const FILE_NAME = "customField.ctrl.ts";

const parseIntParam = (raw: unknown): number => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(value as string, 10);
};

// Map our CustomException subclasses to HTTP status, mirroring the
// aiDetectionRepository pattern. Falls back to 500 for unknown errors.
const respondWithError = (req: Request, res: Response, error: unknown): Response => {
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const statusFn = (STATUS_CODE as any)[statusCode];
  if (typeof statusFn === "function") {
    return res.status(statusCode).json(statusFn((error as Error).message));
  }
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
};

// ---------- Definitions ----------

export async function listCustomFieldDefinitions(req: Request, res: Response): Promise<any> {
  const entityType = req.params.entityType as CustomFieldEntityType;

  logProcessing({
    description: `starting listCustomFieldDefinitions for entity_type=${entityType}`,
    functionName: "listCustomFieldDefinitions",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const defs = await listCustomFieldDefinitionsQuery(req.organizationId!, entityType);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${defs.length} custom field definitions for ${entityType}`,
      functionName: "listCustomFieldDefinitions",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](defs));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to list custom field definitions",
      functionName: "listCustomFieldDefinitions",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function getCustomFieldDefinitionById(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);

  logProcessing({
    description: `starting getCustomFieldDefinitionById for ID ${id}`,
    functionName: "getCustomFieldDefinitionById",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const def = await getCustomFieldDefinitionByIdQuery(id, req.organizationId!);
    if (!def) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await logSuccess({
      eventType: "Read",
      description: `Retrieved custom field definition ${id}`,
      functionName: "getCustomFieldDefinitionById",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](def));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve custom field definition",
      functionName: "getCustomFieldDefinitionById",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function createCustomFieldDefinition(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createCustomFieldDefinition",
    functionName: "createCustomFieldDefinition",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const def = await createCustomFieldDefinitionQuery(req.body, req.organizationId!, req.userId!);
    await logSuccess({
      eventType: "Create",
      description: `Created custom field definition ${def.id} (${def.entity_type}.${def.field_key})`,
      functionName: "createCustomFieldDefinition",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](def));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to create custom field definition",
      functionName: "createCustomFieldDefinition",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function updateCustomFieldDefinition(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);

  logProcessing({
    description: `starting updateCustomFieldDefinition for ID ${id}`,
    functionName: "updateCustomFieldDefinition",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const def = await updateCustomFieldDefinitionQuery(id, req.organizationId!, req.body ?? {});
    await logSuccess({
      eventType: "Update",
      description: `Updated custom field definition ${id}`,
      functionName: "updateCustomFieldDefinition",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](def));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to update custom field definition",
      functionName: "updateCustomFieldDefinition",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function deleteCustomFieldDefinition(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);

  logProcessing({
    description: `starting deleteCustomFieldDefinition for ID ${id}`,
    functionName: "deleteCustomFieldDefinition",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deleted = await deleteCustomFieldDefinitionQuery(id, req.organizationId!);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await logSuccess({
      eventType: "Delete",
      description: `Deleted custom field definition ${id}`,
      functionName: "deleteCustomFieldDefinition",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(202).json(STATUS_CODE[202]({ id }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete custom field definition",
      functionName: "deleteCustomFieldDefinition",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

// ---------- Values ----------

export async function getCustomFieldValuesForEntity(req: Request, res: Response): Promise<any> {
  const entityType = req.params.entityType as CustomFieldEntityType;
  const entityId = parseIntParam(req.params.entityId);

  logProcessing({
    description: `starting getCustomFieldValuesForEntity for ${entityType}/${entityId}`,
    functionName: "getCustomFieldValuesForEntity",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const values = await getCustomFieldValuesForEntityQuery(
      entityType,
      entityId,
      req.organizationId!,
    );
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${values.length} custom field values for ${entityType}/${entityId}`,
      functionName: "getCustomFieldValuesForEntity",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](values));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve custom field values",
      functionName: "getCustomFieldValuesForEntity",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function getMissingRequiredCustomFields(req: Request, res: Response): Promise<any> {
  const entityType = req.params.entityType as CustomFieldEntityType;
  const entityId = parseIntParam(req.params.entityId);

  try {
    const missing = await getMissingRequiredCustomFieldsQuery(
      entityType,
      entityId,
      req.organizationId!,
    );
    return res.status(200).json(STATUS_CODE[200](missing));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to compute missing required custom fields",
      functionName: "getMissingRequiredCustomFields",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function setCustomFieldValue(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();

  logProcessing({
    description: "starting setCustomFieldValue",
    functionName: "setCustomFieldValue",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const row = await setCustomFieldValueQuery(req.body, req.organizationId!, transaction);
    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `Set custom field value (definition=${row.definition_id}, entity=${row.entity_type}/${row.entity_id})`,
      functionName: "setCustomFieldValue",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to set custom field value",
      functionName: "setCustomFieldValue",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function deleteCustomFieldValue(req: Request, res: Response): Promise<any> {
  const definitionId = parseIntParam(req.params.definitionId);
  const entityId = parseIntParam(req.params.entityId);
  const transaction = await sequelize.transaction();

  logProcessing({
    description: `starting deleteCustomFieldValue (definition=${definitionId}, entity=${entityId})`,
    functionName: "deleteCustomFieldValue",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deleted = await deleteCustomFieldValueQuery(
      definitionId,
      entityId,
      req.organizationId!,
      transaction,
    );
    await transaction.commit();
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await logSuccess({
      eventType: "Delete",
      description: `Deleted custom field value (definition=${definitionId}, entity=${entityId})`,
      functionName: "deleteCustomFieldValue",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(202).json(STATUS_CODE[202]({ definitionId, entityId }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete custom field value",
      functionName: "deleteCustomFieldValue",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}
