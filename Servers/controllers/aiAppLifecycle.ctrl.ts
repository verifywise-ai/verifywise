import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { getAiAppLifecycleState, getAiAppLifecycleSummary } from "../utils/aiAppLifecycle.utils";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { lifecycleActionHandlers, lifecycleIdParam } from "./lifecycle.ctrl";

/** AI app lifecycle (#5193): the shared lifecycle actions plus AI app reads. */

const FILE = "aiAppLifecycle.ctrl.ts";

function serverError(req: Request, res: Response, fn: string, error: unknown) {
  logStructured("error", `${fn} failed`, fn, FILE);
  logger.error(`❌ Error in ${fn}:`, error);
  return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
}

const actions = lifecycleActionHandlers("ai_app");
export const aiAppGoLiveHandler = actions.goLive;
export const aiAppRetireHandler = actions.retire;
export const aiAppConfirmHandler = actions.confirm;

export async function getAiAppLifecycleSummaryHandler(req: Request, res: Response) {
  try {
    const summary = await getAiAppLifecycleSummary(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    return serverError(req, res, "getAiAppLifecycleSummaryHandler", error);
  }
}

export async function getAiAppLifecycleHandler(req: Request, res: Response) {
  const id = lifecycleIdParam(req);
  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid AI app ID")));
  }
  try {
    const state = await getAiAppLifecycleState(req.organizationId!, id);
    if (!state) return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    return res.status(200).json(STATUS_CODE[200](state));
  } catch (error) {
    return serverError(req, res, "getAiAppLifecycleHandler", error);
  }
}

const MAX_HISTORY_LIMIT = 100;

/** Change history of one AI app (lifecycle changes), newest first. */
export async function getAiAppHistoryHandler(req: Request, res: Response) {
  const id = lifecycleIdParam(req);
  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid AI app ID")));
  }
  const limitRaw = Number(req.query.limit ?? MAX_HISTORY_LIMIT);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, MAX_HISTORY_LIMIT)
      : MAX_HISTORY_LIMIT;
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  try {
    const result = await getEntityChangeHistory("ai_app", id, req.organizationId!, limit, offset);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    return serverError(req, res, "getAiAppHistoryHandler", error);
  }
}
