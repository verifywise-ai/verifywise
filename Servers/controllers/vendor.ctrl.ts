import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { toId } from "../utils/validations/validation.utils";
import { assertVendorRequestBody, parseRouteId } from "../utils/validations/vendorRequest.utils";
import {
  getAllVendorsQuery,
  getVendorByIdQuery,
  getVendorByProjectIdQuery,
} from "../utils/vendor.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import { getVendorRiskSuggestions as getVendorRiskSuggestionsService } from "../services/vendors/riskSuggestions";
import * as vendorService from "../services/vendor.service";
import { translateError } from "../utils/i18n.utils";

export async function getAllVendors(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllVendors",
    functionName: "getAllVendors",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendors = await getAllVendorsQuery(req.organizationId!);

    if (vendors) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved ${vendors.length} vendors`,
        functionName: "getAllVendors",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendors));
    }

    await logSuccess({
      eventType: "Read",
      description: "No vendors found",
      functionName: "getAllVendors",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(204).json(STATUS_CODE[204](vendors));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendors",
      functionName: "getAllVendors",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getVendorById(req: Request, res: Response): Promise<any> {
  const vendorId = parseRouteId(req.params.id);
  if (vendorId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }

  logProcessing({
    description: `starting getVendorById for ID ${vendorId}`,
    functionName: "getVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendor = await getVendorByIdQuery(vendorId, req.organizationId!);

    if (vendor) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved vendor ID ${vendorId}`,
        functionName: "getVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendor));
    }

    await logSuccess({
      eventType: "Read",
      description: `Vendor not found: ID ${vendorId}`,
      functionName: "getVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](vendor));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor by ID",
      functionName: "getVendorById",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getVendorByProjectId(req: Request, res: Response): Promise<any> {
  const projectId = parseRouteId(req.params.id);
  if (projectId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid project ID")));
  }

  logProcessing({
    description: `starting getVendorByProjectId for ID ${projectId}`,
    functionName: "getVendorByProjectId",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendor = await getVendorByProjectIdQuery(projectId, req.organizationId!);

    if (vendor !== null) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved vendor by project ID ${projectId}`,
        functionName: "getVendorByProjectId",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](vendor));
    }

    await logSuccess({
      eventType: "Read",
      description: `Vendor not found for project ID ${projectId}`,
      functionName: "getVendorByProjectId",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]([]));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve vendor by project ID",
      functionName: "getVendorByProjectId",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Read-only report: the vendor risks this vendor's questionnaire answers imply,
 * minus the ones it already has. Writes nothing and opens no transaction.
 */
export async function getVendorRiskSuggestions(req: Request, res: Response): Promise<any> {
  const vendorId = toId(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(vendorId) || vendorId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }

  logProcessing({
    description: `starting getVendorRiskSuggestions for ID ${vendorId}`,
    functionName: "getVendorRiskSuggestions",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const report = await getVendorRiskSuggestionsService(vendorId, req.organizationId!);

    if (!report) {
      await logSuccess({
        eventType: "Read",
        description: `Vendor not found for risk suggestions: ID ${vendorId}`,
        functionName: "getVendorRiskSuggestions",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    await logSuccess({
      eventType: "Read",
      description: `Derived ${report.suggestions.length} risk suggestions for vendor ID ${vendorId}`,
      functionName: "getVendorRiskSuggestions",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](report));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to fetch vendor risk suggestions",
      functionName: "getVendorRiskSuggestions",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** A failed write's answer: 400 invalid, 403 demo vendor, else 500. */
async function failedWrite(
  req: Request,
  res: Response,
  error: unknown,
  eventType: "Create" | "Update",
  functionName: string,
): Promise<any> {
  const log = (description: string) =>
    logFailure({
      eventType,
      description,
      functionName,
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
  if (error instanceof ValidationException) {
    await log(`Validation failed: ${error.message}`);
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }
  if (error instanceof BusinessLogicException) {
    await log(`Business logic error: ${error.message}`);
    return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
  }
  await log(`Failed to ${eventType.toLowerCase()} vendor`);
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
}

export async function createVendor(req: Request, res: Response): Promise<any> {
  try {
    assertVendorRequestBody(req.body);
  } catch (error) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }

  logProcessing({
    description: "starting createVendor",
    functionName: "createVendor",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const createdVendor = await vendorService.createVendor(req.body, {
      userId: req.userId,
      role: req.role!,
      organizationId: req.organizationId!,
    });

    if (createdVendor) {
      await logSuccess({
        eventType: "Create",
        description: `Created vendor: ${createdVendor.vendor_name}`,
        functionName: "createVendor",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(201).json(STATUS_CODE[201](createdVendor));
    }

    await logSuccess({
      eventType: "Create",
      description: "Vendor creation returned null",
      functionName: "createVendor",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    return failedWrite(req, res, error, "Create", "createVendor");
  }
}

export async function updateVendorById(req: Request, res: Response): Promise<any> {
  const vendorId = parseRouteId(req.params.id);
  if (vendorId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }
  try {
    assertVendorRequestBody(req.body);
  } catch (error) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }

  logProcessing({
    description: `starting updateVendorById for ID ${vendorId}`,
    functionName: "updateVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const { userId, role } = req;
  if (!userId || !role) {
    await logFailure({
      eventType: "Update",
      description: "Unauthorized access attempt to update vendor",
      functionName: "updateVendorById",
      fileName: "vendor.ctrl.ts",
      error: new Error("Unauthorized"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
  }

  try {
    const vendor = await vendorService.updateVendor(vendorId, req.body, {
      userId,
      role,
      organizationId: req.organizationId!,
    });

    if (vendor) {
      await logSuccess({
        eventType: "Update",
        description: `Updated vendor ID ${vendorId}`,
        functionName: "updateVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](vendor));
    }

    await logSuccess({
      eventType: "Update",
      description: `Vendor not found for update: ID ${vendorId}`,
      functionName: "updateVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    return failedWrite(req, res, error, "Update", "updateVendorById");
  }
}

export async function deleteVendorById(req: Request, res: Response): Promise<any> {
  const vendorId = parseRouteId(req.params.id);
  if (vendorId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }

  logProcessing({
    description: `starting deleteVendorById for ID ${vendorId}`,
    functionName: "deleteVendorById",
    fileName: "vendor.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deletedVendor = await vendorService.deleteVendor(vendorId, {
      userId: req.userId,
      role: req.role!,
      organizationId: req.organizationId!,
    });

    if (deletedVendor) {
      await logSuccess({
        eventType: "Delete",
        description: `Deleted vendor ID ${vendorId}`,
        functionName: "deleteVendorById",
        fileName: "vendor.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](deletedVendor));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Vendor not found for deletion: ID ${vendorId}`,
      functionName: "deleteVendorById",
      fileName: "vendor.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete vendor",
      functionName: "deleteVendorById",
      fileName: "vendor.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
