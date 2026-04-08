/**
 * Feature Settings Controller
 *
 * Handles GET and PATCH for per-organization feature toggles.
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  getFeatureSettingsQuery,
  updateFeatureSettingsQuery,
} from "../utils/featureSettings.utils";

const FILE_NAME = "featureSettings.ctrl.ts";

export async function getFeatureSettings(
  req: Request,
  res: Response
): Promise<any> {
  const fn = "getFeatureSettings";
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "fetching feature settings",
    functionName: fn,
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const settings = await getFeatureSettingsQuery(organizationId);

    await logSuccess({
      eventType: "Read",
      description: "feature settings fetched",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to fetch feature settings",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateFeatureSettings(
  req: Request,
  res: Response
): Promise<any> {
  const fn = "updateFeatureSettings";
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "updating feature settings",
    functionName: fn,
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    if (req.role !== "Admin" && req.role !== "SuperAdmin") {
      return res
        .status(403)
        .json(STATUS_CODE[403]("Only admins can manage feature settings"));
    }

    const { lifecycle_enabled, audit_ledger_enabled } = req.body;

    if (
      lifecycle_enabled !== undefined &&
      typeof lifecycle_enabled !== "boolean"
    ) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("lifecycle_enabled must be a boolean"));
    }

    if (
      audit_ledger_enabled !== undefined &&
      typeof audit_ledger_enabled !== "boolean"
    ) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("audit_ledger_enabled must be a boolean"));
    }

    if (lifecycle_enabled === undefined && audit_ledger_enabled === undefined) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("No valid fields to update"));
    }

    const updated = await updateFeatureSettingsQuery(organizationId, {
      lifecycle_enabled,
      audit_ledger_enabled,
      updated_by: userId,
    });

    await logSuccess({
      eventType: "Update",
      description: "feature settings updated",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "failed to update feature settings",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
