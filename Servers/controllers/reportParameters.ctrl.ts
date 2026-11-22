/**
 * @fileoverview Report parameter endpoints.
 *
 * GET /api/v1/report-templates/:id/last-parameters returns the answers from
 * this organization's latest successful run of a template, so the run wizard
 * can prefill them ("remember for next time").
 *
 * @module controllers/reportParameters
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { getTemplateByIdQuery } from "../utils/reportTemplate.utils";
import { getLastParametersQuery } from "../utils/reportRun.utils";
import { translateError } from "../utils/i18n.utils";

export async function getLastParameters(req: Request, res: Response): Promise<any> {
  try {
    const templateId = Number(req.params.id);
    const organizationId = req.organizationId!;
    // A template this organization cannot see is a 404 whether it exists
    // elsewhere or not, the same answer GET /templates/:id gives.
    const template = Number.isInteger(templateId)
      ? await getTemplateByIdQuery(templateId, organizationId)
      : null;
    if (!template) return res.status(404).json(STATUS_CODE[404](req.t!("template not found")));

    const last = await getLastParametersQuery(templateId, organizationId);
    return res.status(200).json(STATUS_CODE[200](last));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
