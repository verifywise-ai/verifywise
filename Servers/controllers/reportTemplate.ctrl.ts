/**
 * @fileoverview Report Templates Controller
 *
 * Read-only endpoints for the enterprise reporting template catalog:
 * list system + org templates, and fetch one template with its latest version.
 *
 * All endpoints require JWT authentication and are org-scoped via
 * req.organizationId.
 *
 * @module controllers/reportTemplate
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getTemplatesQuery,
  getTemplateByIdQuery,
  getLatestVersionQuery,
} from "../utils/reportTemplate.utils";

export async function listTemplates(req: Request, res: Response): Promise<any> {
  try {
    return res.status(200).json(STATUS_CODE[200](await getTemplatesQuery(req.organizationId!)));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function getTemplate(req: Request, res: Response): Promise<any> {
  try {
    const tpl = await getTemplateByIdQuery(Number(req.params.id), req.organizationId!);
    if (!tpl) return res.status(404).json(STATUS_CODE[404]("not found"));
    const version = await getLatestVersionQuery(tpl.id);
    return res.status(200).json(STATUS_CODE[200]({ ...tpl, latestVersion: version }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
