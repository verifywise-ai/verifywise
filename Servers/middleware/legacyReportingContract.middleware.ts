/**
 * Legacy contract adapters for the frozen /api/reporting routers (ADR 0001).
 *
 * The OSFI E-23 report (#5501) taught the shared reporting controllers three
 * new inputs: a template's parameters_config (its report kind and declared
 * fields), a run's or schedule's reportParameters, and the "quarterly"
 * schedule frequency. Those are v1 contracts, served by /api/v1/report-templates
 * and /api/v1/scheduled-reports. These adapters sit on the legacy create,
 * update and run routes only, in front of the same controllers, and restore
 * what those routes did before #5501:
 *
 * - Templates (POST /, PATCH /:id): parameters_config did not exist; like any
 *   unknown field it was ignored. It is dropped here. A legacy create stores
 *   the column default ({}), and a legacy update keeps the stored kind because
 *   createTemplateVersionQuery COALESCEs a missing parameters_config to the
 *   previous version's value. A body carrying only parameters_config is "no
 *   updatable fields supplied", as it was.
 * - Template run (POST /:id/run): reportParameters did not exist and is
 *   dropped. A kind template (one that declares required fields) therefore
 *   answers 400 with its missing fields here; it is run through v1.
 * - Scheduled reports (POST /, PATCH /:id): reportParameters is dropped. Before
 *   #5501 scheduleConfig.frequency was not validated: an unknown value, which
 *   "quarterly" was, was stored and then run monthly by computeNextRun's
 *   fallback. Accepting quarterly here would now mean a real quarterly
 *   schedule, a v1 contract, so it is refused with 400 rather than silently
 *   accepted.
 *
 * Not undone here: the refusal of kind-limited sections outside a kind
 * template. It is a protection that applies on every route, legacy included.
 */
import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";

function dropBodyFields(...fields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const body = req.body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const field of fields) delete body[field];
    }
    next();
  };
}

/** Legacy POST/PATCH /api/reporting/templates: no parameters_config. */
export const legacyTemplateWriteContract = dropBodyFields("parameters_config");

/** Legacy POST /api/reporting/templates/:id/run: no reportParameters. */
export const legacyTemplateRunContract = dropBodyFields("reportParameters");

const dropScheduleParameters = dropBodyFields("reportParameters");

/**
 * Legacy POST/PATCH /api/reporting/scheduled-reports: no reportParameters, and
 * no quarterly frequency.
 */
export function legacyScheduleWriteContract(
  req: Request,
  res: Response,
  next: NextFunction,
): void | Response {
  if (req.body?.scheduleConfig?.frequency === "quarterly") {
    return res.status(400).json(
      STATUS_CODE[400]({
        errors: [
          req.t!("quarterly schedules are created and changed through /api/v1/scheduled-reports"),
        ],
      }),
    );
  }
  return dropScheduleParameters(req, res, next);
}
