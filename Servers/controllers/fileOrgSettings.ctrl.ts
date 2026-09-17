import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import { getFileOrgSettings, upsertFileOrgSettings } from "../utils/fileOrgSettings.utils";
import { isRetentionPolicy } from "../utils/retention.utils";

const FILE = "fileOrgSettings.ctrl.ts";

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

export async function getFileOrgSettingsHandler(req: Request, res: Response) {
  const fn = "getFileOrgSettingsHandler";
  logStructured("processing", "fetching file org settings", fn, FILE);
  try {
    const settings = await getFileOrgSettings(req.organizationId!);
    logStructured("successful", "file org settings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve file org settings", error);
  }
}

export async function updateFileOrgSettingsHandler(req: Request, res: Response) {
  const fn = "updateFileOrgSettingsHandler";
  logStructured("processing", "updating file org settings", fn, FILE);
  try {
    const body = req.body ?? {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    // PARTIAL semantics: only fields present in the body are validated and
    // updated. Nothing to change is an error, not a silent no-op.
    if (!has("default_retention_policy")) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No settings provided")));
    }

    // null explicitly clears the default; any other value must be canonical.
    if (
      body.default_retention_policy !== null &&
      !isRetentionPolicy(body.default_retention_policy)
    ) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid retention policy")));
    }

    const settings = await upsertFileOrgSettings(req.organizationId!, {
      default_retention_policy: body.default_retention_policy,
    });
    logStructured("successful", "file org settings updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to update file org settings", error);
  }
}
