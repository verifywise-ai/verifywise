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
import { requireAccessToUseCases } from "./projectAccess.middleware";
import { toStrictId } from "../utils/validations/validation.utils";
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
  req.body = { ...(req.body ?? {}), config_id: toStrictId(req.params.configId) };
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
      toStrictId(req.params.cycleId),
      questionIdsOf(req.body),
      req.organizationId!,
    );
    if (!ok) return res.status(404).json(STATUS_CODE[404](req.t!("Record not found")));
    return next();
  } catch (error) {
    return next(error);
  }
};

const isWhole = (value: unknown, min: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min;

/**
 * A reorder body is `{ orders: [{ id, display_order }, ...] }`: a non-empty
 * list of positive integer ids and whole display orders of 0 or more (JSON
 * numbers, never strings or arrays). Anything else is a 400. The validated
 * list replaces the body, so the handler binds exactly what was checked.
 */
export const validatePmmReorder = (req: Request, res: Response, next: NextFunction) => {
  const orders = req.body?.orders;
  const valid =
    Array.isArray(orders) &&
    orders.length > 0 &&
    orders.every((o) => isWhole(o?.id, 1) && isWhole(o?.display_order, 0));
  if (!valid) {
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          req.t!("orders must list positive integer ids with display orders of 0 or more"),
        ),
      );
  }
  req.body = {
    orders: orders.map((o: { id: number; display_order: number }) => ({
      id: o.id,
      display_order: o.display_order,
    })),
  };
  return next();
};

/**
 * Reordering names questions in the body: every one that belongs to a use
 * case needs write access to it (organization questions have none). Mount
 * after validatePmmReorder.
 */
export const requirePmmReorderAccess = requireAccessToUseCases(
  (req, organizationId) =>
    useCasesOfPmmQuestionsQuery(
      (req.body.orders as Array<{ id: number }>).map((o) => o.id),
      organizationId,
    ),
  "requirePmmReorderAccess",
);
