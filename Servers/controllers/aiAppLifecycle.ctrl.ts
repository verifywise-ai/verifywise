import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { getAiAppLifecycleState, getAiAppLifecycleSummary } from "../utils/aiAppLifecycle.utils";
import { getPendingIntakeSubmissions } from "../utils/useCaseLifecycle.utils";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { lifecycleActionHandlers, lifecycleIdParam, serverError } from "./lifecycle.ctrl";
import { createChangeHistoryHandler } from "./changeHistoryHandler";

/** AI app lifecycle (#5193): the shared lifecycle actions plus AI app reads. */

const FILE = "aiAppLifecycle.ctrl.ts";

const actions = lifecycleActionHandlers("ai_app");
export const aiAppGoLiveHandler = actions.goLive;
export const aiAppRetireHandler = actions.retire;
export const aiAppConfirmHandler = actions.confirm;

export async function getAiAppLifecycleSummaryHandler(req: Request, res: Response) {
  try {
    const summary = await getAiAppLifecycleSummary(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    return serverError(req, res, "getAiAppLifecycleSummaryHandler", error, FILE);
  }
}

/** Pending AI app intake requests, listed in the In review tab (#5193). */
export async function getPendingAiAppSubmissionsHandler(req: Request, res: Response) {
  try {
    const submissions = await getPendingIntakeSubmissions(
      req.organizationId!,
      IntakeEntityType.AI_APP,
    );
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    return serverError(req, res, "getPendingAiAppSubmissionsHandler", error, FILE);
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
    return serverError(req, res, "getAiAppLifecycleHandler", error, FILE);
  }
}

/** Change history of one AI app (lifecycle changes), newest first. */
export const getAiAppHistoryHandler = createChangeHistoryHandler({
  subject: "AI app",
  invalidIdMessage: "Invalid AI app ID",
  functionName: "getAiAppHistoryHandler",
  fileName: FILE,
  fetchHistory: (organizationId, id, limit, offset) =>
    getEntityChangeHistory("ai_app", id, organizationId, limit, offset),
});
