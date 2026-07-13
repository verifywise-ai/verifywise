import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import {
  getMrmOrgSettings,
  MIN_RETENTION_MONTHS,
  upsertMrmOrgSettings,
} from "../utils/mrmSettings.utils";

const FILE = "mrmSettings.ctrl.ts";

function fail(req: Request, res: Response, fn: string, msg: string, error: unknown) {
  logStructured("error", msg, fn, FILE);
  logger.error(`❌ Error in ${fn}:`, error);
  const status = error instanceof CustomException ? error.statusCode : 500;
  if (status >= 500) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
  const body = (STATUS_CODE as any)[status]
    ? (STATUS_CODE as any)[status](translateError(req, error))
    : STATUS_CODE[400](translateError(req, error));
  return res.status(status).json(body);
}

export async function getMrmSettingsHandler(req: Request, res: Response) {
  const fn = "getMrmSettingsHandler";
  logStructured("processing", "fetching MRM settings", fn, FILE);
  try {
    const settings = await getMrmOrgSettings(req.organizationId!);
    logStructured("successful", "MRM settings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve MRM settings", error);
  }
}

export async function updateMrmSettingsHandler(req: Request, res: Response) {
  const fn = "updateMrmSettingsHandler";
  logStructured("processing", "updating MRM settings", fn, FILE);
  try {
    const { retention_months } = req.body ?? {};
    if (!Number.isInteger(retention_months) || retention_months < MIN_RETENTION_MONTHS) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Retention must be an integer of at least 13 months")));
    }
    const settings = await upsertMrmOrgSettings(req.organizationId!, retention_months);
    logStructured("successful", "MRM settings updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to update MRM settings", error);
  }
}
