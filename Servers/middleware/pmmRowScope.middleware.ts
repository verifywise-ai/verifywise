/**
 * Post-market monitoring writes name rows in the body (a question's config,
 * the questions a cycle answers, the questions to reorder). Past the use case
 * guard these make sure each one belongs to the config or cycle the guard
 * checked, or to a use case the caller may change.
 *
 * Mount after the route's requireUseCaseAccessVia.
 */
import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { getProjectAccessQuery } from "../utils/project.utils";
import { toId } from "../utils/validations/validation.utils";
import {
  questionsBelongToPmmCycleQuery,
  useCasesOfPmmQuestionsQuery,
} from "../utils/pmmUseCaseAccess.utils";

/**
 * A question added through /config/:configId/questions belongs to that
 * config: the body's config_id is replaced by the checked one (the client may
 * send none, or null).
 */
export const pinPmmConfigFromPath = (req: Request, _res: Response, next: NextFunction) => {
  req.body = { ...(req.body ?? {}), config_id: toId(req.params.configId) };
  next();
};

/** The question ids a response save, flag or submit names. */
const questionIdsOf = (body: any): unknown[] => {
  const ids: unknown[] = [];
  if (Array.isArray(body?.responses)) {
    for (const r of body.responses) ids.push(r?.question_id);
  }
  if (body?.question_id !== undefined) ids.push(body.question_id);
  return ids;
};

/** 404 unless every question named belongs to the routed cycle's config. */
export const requirePmmCycleQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ok = await questionsBelongToPmmCycleQuery(
      toId(req.params.cycleId),
      questionIdsOf(req.body),
      req.organizationId!,
    );
    if (!ok) return res.status(404).json(STATUS_CODE[404](req.t!("Record not found")));
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Reordering names questions in the body: every one that belongs to a use
 * case needs write access to it (organization questions have none). 403
 * otherwise, nothing reordered.
 */
export const requirePmmReorderAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    const ids = orders
      .map((o: any) => toId(o?.id))
      .filter((id: number) => Number.isSafeInteger(id) && id > 0);
    const { userId, role, organizationId } = req;
    for (const projectId of await useCasesOfPmmQuestionsQuery(ids, organizationId!)) {
      const access = await getProjectAccessQuery(
        projectId,
        { userId: userId!, role: role! },
        organizationId!,
      );
      if (access !== "allowed") {
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
};
