import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import {
  getEvidenceHubOrgSettings,
  upsertEvidenceHubOrgSettings,
} from "../utils/evidenceHubSettings.utils";
import { EVIDENCE_RETENTION_PERIODS } from "../utils/evidenceRetention.utils";

const FILE = "evidenceHubSettings.ctrl.ts";

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

export async function getEvidenceHubSettingsHandler(req: Request, res: Response) {
  const fn = "getEvidenceHubSettingsHandler";
  logStructured("processing", "fetching Evidence Hub settings", fn, FILE);
  try {
    const settings = await getEvidenceHubOrgSettings(req.organizationId!);
    logStructured("successful", "Evidence Hub settings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve Evidence Hub settings", error);
  }
}

export async function updateEvidenceHubSettingsHandler(req: Request, res: Response) {
  const fn = "updateEvidenceHubSettingsHandler";
  logStructured("processing", "updating Evidence Hub settings", fn, FILE);
  try {
    const body = req.body ?? {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    // PARTIAL semantics: only fields present in the body are validated and
    // updated; absent fields keep their current value.
    if (!has("default_retention_period") && !has("archive_on_expiry")) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No settings provided")));
    }

    if (
      has("default_retention_period") &&
      body.default_retention_period !== null &&
      !(EVIDENCE_RETENTION_PERIODS as readonly string[]).includes(body.default_retention_period)
    ) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid default retention period")));
    }

    if (has("archive_on_expiry") && typeof body.archive_on_expiry !== "boolean") {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Archive on expiry must be true or false")));
    }

    const settings = await upsertEvidenceHubOrgSettings(req.organizationId!, {
      default_retention_period: has("default_retention_period")
        ? body.default_retention_period
        : undefined,
      archive_on_expiry: has("archive_on_expiry") ? body.archive_on_expiry : undefined,
    });

    logStructured("successful", "Evidence Hub settings updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to update Evidence Hub settings", error);
  }
}
