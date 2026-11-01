import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import {
  getUseCaseOrgSettings,
  projectLevelFrameworkIdsQuery,
  upsertUseCaseOrgSettings,
  USE_CASE_GEOGRAPHY_IDS,
  type UseCaseOrgSettingsUpdate,
} from "../utils/useCaseOrgSettings.utils";

const FILE = "useCaseOrgSettings.ctrl.ts";
// More than every project-level framework there is; keeps the IN list bounded.
const MAX_DEFAULT_FRAMEWORKS = 50;

export async function getUseCaseOrgSettingsHandler(req: Request, res: Response) {
  const fn = "getUseCaseOrgSettingsHandler";
  logStructured("processing", "fetching use case org settings", fn, FILE);
  try {
    const settings = await getUseCaseOrgSettings(req.organizationId!);
    logStructured("successful", "use case org settings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    logStructured("error", "failed to retrieve use case org settings", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateUseCaseOrgSettingsHandler(req: Request, res: Response) {
  const fn = "updateUseCaseOrgSettingsHandler";
  logStructured("processing", "updating use case org settings", fn, FILE);
  try {
    const body = req.body ?? {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    // PARTIAL semantics: only fields present in the body change.
    if (!has("default_geography") && !has("default_framework_ids")) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No settings provided")));
    }

    const update: UseCaseOrgSettingsUpdate = {};

    if (has("default_geography")) {
      const geography = body.default_geography;
      // null clears the default.
      if (
        geography !== null &&
        !(USE_CASE_GEOGRAPHY_IDS as readonly number[]).includes(geography as number)
      ) {
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid region")));
      }
      update.default_geography = geography;
    }

    if (has("default_framework_ids")) {
      const ids = body.default_framework_ids;
      if (
        !Array.isArray(ids) ||
        ids.length > MAX_DEFAULT_FRAMEWORKS ||
        !ids.every((id) => Number.isSafeInteger(id) && id > 0)
      ) {
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Default frameworks must be a list of framework ids")));
      }
      const unique = [...new Set(ids as number[])];
      const allowed = await projectLevelFrameworkIdsQuery(unique);
      if (allowed.length !== unique.length) {
        return res
          .status(400)
          .json(
            STATUS_CODE[400](
              req.t!("Only frameworks that apply to a single use case can be defaults"),
            ),
          );
      }
      update.default_framework_ids = unique;
    }

    const settings = await upsertUseCaseOrgSettings(req.organizationId!, update);
    logStructured("successful", "use case org settings updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    logStructured("error", "failed to update use case org settings", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
