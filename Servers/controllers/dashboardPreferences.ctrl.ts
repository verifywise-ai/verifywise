import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import {
  getDashboardPreferences,
  upsertDashboardPreferences,
  type DashboardLayoutEntry,
} from "../utils/dashboardPreferences.utils";

const FILE = "dashboardPreferences.ctrl.ts";

export async function getDashboardPreferencesHandler(req: Request, res: Response) {
  const fn = "getDashboardPreferencesHandler";
  logStructured("processing", "fetching dashboard preferences", fn, FILE);
  try {
    const preferences = await getDashboardPreferences(req.userId!, req.organizationId!);
    logStructured("successful", "dashboard preferences retrieved", fn, FILE);
    return res
      .status(200)
      .json(STATUS_CODE[200](preferences ?? { layout: null, updated_at: null }));
  } catch (error) {
    logStructured("error", "failed to retrieve dashboard preferences", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateDashboardPreferencesHandler(req: Request, res: Response) {
  const fn = "updateDashboardPreferencesHandler";
  logStructured("processing", "updating dashboard preferences", fn, FILE);
  try {
    // validateUpdateDashboardPreferences has checked the shape. The owner of
    // the row always comes from the token, never from the body.
    const layout = req.body.layout as DashboardLayoutEntry[];
    const preferences = await upsertDashboardPreferences(req.userId!, req.organizationId!, layout);
    logStructured("successful", "dashboard preferences updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](preferences));
  } catch (error) {
    logStructured("error", "failed to update dashboard preferences", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
