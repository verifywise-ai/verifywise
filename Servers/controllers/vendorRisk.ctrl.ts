import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getAllVendorRisksAllProjectsQuery,
  getVendorRiskByIdQuery,
  getVendorRisksByProjectIdQuery,
  getVendorRisksByVendorIdQuery,
  getVendorRisksByFrameworkIdQuery,
  restoreVendorRiskByIdQuery,
} from "../utils/vendorRisk.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { enqueueVendorRiskLinkRecompute } from "../services/automations/automationProducer";
import * as vendorRiskService from "../services/vendorRisk.service";
import logger from "../utils/logger/fileLogger";

import { translateError } from "../utils/i18n.utils";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import {
  assertVendorRiskRequestBody,
  parseRouteId,
  parseVendorRiskListFilter,
} from "../utils/validations/vendorRequest.utils";

const INVALID_FILTER = "Filter must be active, deleted or all";
export async function getAllVendorRisksAllProjects(req: Request, res: Response): Promise<any> {
  const filter = parseVendorRiskListFilter(req.query.filter);
  if (filter === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!(INVALID_FILTER)));
  }

  logProcessing({
    description: `starting getAllVendorRisksAllProjects with filter: ${filter}`,
    functionName: "getAllVendorRisksAllProjects",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const risks = await getAllVendorRisksAllProjectsQuery(req.organizationId!, filter);
    await logSuccess({
      eventType: "Read",
      description: "Retrieved all vendor risks across all projects",
      functionName: "getAllVendorRisksAllProjects",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](risks));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor risks",
      functionName: "getAllVendorRisksAllProjects",
      fileName: "vendorRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getAllVendorRisks(req: Request, res: Response): Promise<any> {
  const projectIdParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const projectId = parseInt(projectIdParam);
  const filter = parseVendorRiskListFilter(req.query.filter);
  if (filter === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!(INVALID_FILTER)));
  }

  // Return empty array for non-numeric project IDs (e.g., plugin-sourced IDs like "plugin-prefix-2")
  if (isNaN(projectId)) {
    return res.status(200).json(STATUS_CODE[200]([]));
  }

  logProcessing({
    description: `starting getAllVendorRisks for project ID ${projectId} with filter: ${filter}`,
    functionName: "getAllVendorRisks",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRisks = await getVendorRisksByProjectIdQuery(
      projectId,
      req.organizationId!,
      filter,
    );

    if (vendorRisks) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved vendor risks for project ID ${projectId} with filter: ${filter}`,
        functionName: "getAllVendorRisks",
        fileName: "vendorRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendorRisks));
    }

    await logSuccess({
      eventType: "Read",
      description: `No vendor risks found for project ID ${projectId} with filter: ${filter}`,
      functionName: "getAllVendorRisks",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(204).json(STATUS_CODE[204](vendorRisks));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor risks by project",
      functionName: "getAllVendorRisks",
      fileName: "vendorRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getAllVendorRisksByVendorId(req: Request, res: Response) {
  const vendorId = parseRouteId(req.params.id);
  if (vendorId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }
  const filter = parseVendorRiskListFilter(req.query.filter);
  if (filter === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!(INVALID_FILTER)));
  }

  logProcessing({
    description: `starting getAllVendorRisksByVendorId for vendor ID ${vendorId} with filter: ${filter}`,
    functionName: "getAllVendorRisksByVendorId",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRisks = await getVendorRisksByVendorIdQuery(vendorId, req.organizationId!, filter);

    if (vendorRisks) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved vendor risks for vendor ID ${vendorId} with filter: ${filter}`,
        functionName: "getAllVendorRisksByVendorId",
        fileName: "vendorRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendorRisks));
    }

    await logSuccess({
      eventType: "Read",
      description: `No vendor risks found for vendor ID ${vendorId} with filter: ${filter}`,
      functionName: "getAllVendorRisksByVendorId",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(204).json(STATUS_CODE[204](vendorRisks));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor risks by vendor ID",
      functionName: "getAllVendorRisksByVendorId",
      fileName: "vendorRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** GET /vendorRisks/:id (legacy): an active vendor risk; 404 for a deleted one. */
export async function getVendorRiskById(req: Request, res: Response): Promise<any> {
  return readVendorRiskById(req, res, false);
}

/**
 * GET /v1/vendor-risks/:id: a vendor risk, deleted ones included with
 * is_deleted set, so a deleted risk can be opened read-only and restored.
 */
export async function getVendorRiskByIdIncludingDeleted(req: Request, res: Response): Promise<any> {
  return readVendorRiskById(req, res, true);
}

async function readVendorRiskById(
  req: Request,
  res: Response,
  includeDeleted: boolean,
): Promise<any> {
  const vendorRiskId = parseRouteId(req.params.id);
  if (vendorRiskId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor risk ID")));
  }

  logProcessing({
    description: `starting getVendorRiskById for ID ${vendorRiskId}`,
    functionName: "getVendorRiskById",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRisk = await getVendorRiskByIdQuery(
      vendorRiskId,
      req.organizationId!,
      includeDeleted,
    );

    if (vendorRisk) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved vendor risk ID ${vendorRiskId}`,
        functionName: "getVendorRiskById",
        fileName: "vendorRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendorRisk));
    }

    await logSuccess({
      eventType: "Read",
      description: `Vendor risk not found: ID ${vendorRiskId}`,
      functionName: "getVendorRiskById",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](vendorRisk));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor risk by ID",
      functionName: "getVendorRiskById",
      fileName: "vendorRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** A failed write's answer: 400 invalid, else 500. */
async function failedWrite(
  req: Request,
  res: Response,
  error: unknown,
  eventType: "Create" | "Update" | "Delete",
  functionName: string,
): Promise<any> {
  const invalid = error instanceof ValidationException;
  await logFailure({
    eventType,
    description: invalid
      ? `Validation failed: ${(error as Error).message}`
      : `Failed to ${eventType.toLowerCase()} vendor risk`,
    functionName,
    fileName: "vendorRisk.ctrl.ts",
    error: error as Error,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  return res
    .status(invalid ? 400 : 500)
    .json(STATUS_CODE[invalid ? 400 : 500](translateError(req, error)));
}

export async function createVendorRisk(req: Request, res: Response): Promise<any> {
  try {
    assertVendorRiskRequestBody(req.body, "create");
  } catch (error) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }

  logProcessing({
    description: "starting createVendorRisk",
    functionName: "createVendorRisk",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const createdVendorRisk = await vendorRiskService.createVendorRisk(req.body, {
      userId: req.userId,
      organizationId: req.organizationId!,
    });

    if (createdVendorRisk) {
      await logSuccess({
        eventType: "Create",
        description: "Created new vendor risk",
        functionName: "createVendorRisk",
        fileName: "vendorRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(201).json(STATUS_CODE[201](createdVendorRisk));
    }

    await logSuccess({
      eventType: "Create",
      description: "Vendor risk creation returned null",
      functionName: "createVendorRisk",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    return failedWrite(req, res, error, "Create", "createVendorRisk");
  }
}

export async function updateVendorRiskById(req: Request, res: Response): Promise<any> {
  const vendorRiskId = parseRouteId(req.params.id);
  if (vendorRiskId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor risk ID")));
  }
  try {
    assertVendorRiskRequestBody(req.body, "update");
  } catch (error) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }

  logProcessing({
    description: `starting updateVendorRiskById for ID ${vendorRiskId}`,
    functionName: "updateVendorRiskById",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRisk = await vendorRiskService.updateVendorRisk(vendorRiskId, req.body, {
      userId: req.userId,
      organizationId: req.organizationId!,
    });

    if (vendorRisk) {
      await logSuccess({
        eventType: "Update",
        description: `Updated vendor risk ID ${vendorRiskId}`,
        functionName: "updateVendorRiskById",
        fileName: "vendorRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](vendorRisk));
    }

    await logSuccess({
      eventType: "Update",
      description: `Vendor risk not found for update: ID ${vendorRiskId}`,
      functionName: "updateVendorRiskById",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    return failedWrite(req, res, error, "Update", "updateVendorRiskById");
  }
}

export async function deleteVendorRiskById(req: Request, res: Response): Promise<any> {
  const vendorRiskId = parseRouteId(req.params.id);
  if (vendorRiskId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor risk ID")));
  }

  logProcessing({
    description: `starting deleteVendorRiskById for ID ${vendorRiskId}`,
    functionName: "deleteVendorRiskById",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deletedVendorRisk = await vendorRiskService.deleteVendorRisk(vendorRiskId, {
      userId: req.userId,
      organizationId: req.organizationId!,
    });

    if (deletedVendorRisk) {
      await logSuccess({
        eventType: "Delete",
        description: `Deleted vendor risk ID ${vendorRiskId}`,
        functionName: "deleteVendorRiskById",
        fileName: "vendorRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](deletedVendorRisk));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Vendor risk not found for deletion: ID ${vendorRiskId}`,
      functionName: "deleteVendorRiskById",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    return failedWrite(req, res, error, "Delete", "deleteVendorRiskById");
  }
}

/**
 * PATCH /v1/vendor-risks/:id/restore (vendor.edit): restores a deleted vendor
 * risk. 404 when no deleted risk has this id.
 */
export async function restoreVendorRiskById(req: Request, res: Response): Promise<any> {
  const vendorRiskId = parseRouteId(req.params.id);
  if (vendorRiskId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor risk ID")));
  }
  const transaction = await sequelize.transaction();

  logProcessing({
    description: `starting restoreVendorRiskById for ID ${vendorRiskId}`,
    functionName: "restoreVendorRiskById",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const restored = await restoreVendorRiskByIdQuery(
      vendorRiskId,
      req.organizationId!,
      transaction,
      req.userId!,
    );
    if (!restored) {
      await transaction.rollback();
      await logSuccess({
        eventType: "Update",
        description: `No deleted vendor risk to restore: ID ${vendorRiskId}`,
        functionName: "restoreVendorRiskById",
        fileName: "vendorRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `Restored vendor risk ID ${vendorRiskId}`,
      functionName: "restoreVendorRiskById",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    // Back in the pool of related-risk suggestions.
    enqueueVendorRiskLinkRecompute(req.organizationId!, vendorRiskId).catch((err) =>
      logger.error("Vendor risk link recompute enqueue failed:", err),
    );

    const vendorRisk = await getVendorRiskByIdQuery(vendorRiskId, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](vendorRisk));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to restore vendor risk",
      functionName: "restoreVendorRiskById",
      fileName: "vendorRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getVendorRisksByFrameworkId(req: Request, res: Response): Promise<any> {
  const frameworkId = parseRouteId(req.params.id);
  if (frameworkId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid framework id")));
  }
  const filter = parseVendorRiskListFilter(req.query.filter);
  if (filter === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!(INVALID_FILTER)));
  }

  logProcessing({
    description: `starting getVendorRisksByFrameworkId for framework ID ${frameworkId} with filter: ${filter}`,
    functionName: "getVendorRisksByFrameworkId",
    fileName: "vendorRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRisks = await getVendorRisksByFrameworkIdQuery(
      frameworkId,
      req.organizationId!,
      filter,
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved vendor risks for framework ID ${frameworkId}`,
      functionName: "getVendorRisksByFrameworkId",
      fileName: "vendorRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](vendorRisks));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor risks by framework ID",
      functionName: "getVendorRisksByFrameworkId",
      fileName: "vendorRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
