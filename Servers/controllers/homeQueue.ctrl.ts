import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { requestEffectivePermissions } from "../utils/rolePermissions.utils";
import { getHomeQueue } from "../services/homeQueue";
import type { HomeQueueResponse } from "../domain.layer/interfaces/i.homeQueue";

const FILE = "homeQueue.ctrl.ts";

const EMPTY_QUEUE: HomeQueueResponse = { items: [], sources: {}, counts: {} };

/**
 * The signed-in user's Home queue. Organization and user come from the token
 * only. Permissions resolve once, through the same resolver authorize() uses,
 * so built-in and custom roles see the same sources they could open.
 */
export async function getHomeQueueHandler(req: Request, res: Response) {
  const fn = "getHomeQueueHandler";
  logStructured("processing", "fetching home queue", fn, FILE);

  // A pure super admin has no organization, so nothing in it can need them.
  if (!req.organizationId) {
    return res.status(200).json(STATUS_CODE[200](EMPTY_QUEUE));
  }

  try {
    const permissions = await requestEffectivePermissions(req);
    const queue = await getHomeQueue({
      organizationId: req.organizationId,
      userId: req.userId!,
      can: (permissionKey) => permissions.has(permissionKey),
      // Intake lets an Admin, by role name, decide any review lane
      // (isAdminRequest, intakeForm.ctrl.ts); the queue mirrors it so an
      // unnamed lane reaches exactly who can decide it.
      isAdmin: req.role === "Admin",
      today: new Date().toISOString().slice(0, 10),
    });
    logStructured("successful", "home queue retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](queue));
  } catch (error) {
    logStructured("error", "failed to retrieve home queue", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
