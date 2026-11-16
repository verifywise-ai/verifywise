import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import {
  buildExcelTemplate,
  importRisks,
  LEGACY_TRANSLATED_MESSAGES,
  RiskImportError,
  RiskImportRow,
} from "./riskImport.service";

const fileName = "riskImport.ctrl.ts";

/**
 * Shape one row error for the response. /api/v1 (strict) translates every
 * message from its `messageKey` and also returns that `key` and its `params`.
 * The legacy route is a frozen contract: it keeps its old shape (no key or
 * params) and its per-field validation messages in English, translating only
 * the messages the import itself words (row cap, refused inserts).
 */
export function translateImportError(req: Request, error: RiskImportError, strict = false) {
  const { messageKey, params, ...rest } = error;
  if (!messageKey) return rest;
  if (strict) {
    return {
      ...rest,
      message: req.t!(messageKey, params),
      key: messageKey,
      ...(params ? { params } : {}),
    };
  }
  return LEGACY_TRANSLATED_MESSAGES.has(messageKey)
    ? { ...rest, message: req.t!(messageKey, params) }
    : rest;
}

export async function downloadExcelTemplate(req: Request, res: Response): Promise<void> {
  const organizationId = (req as any).organizationId as number;
  try {
    const { buffer, filename } = await buildExcelTemplate(organizationId);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    logStructured(
      "error",
      "failed to build risk-import Excel template",
      "downloadExcelTemplate",
      fileName,
    );
    logger.error("❌ Error in downloadExcelTemplate:", error);
    res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function handleBulkImport(req: Request, res: Response, strict: boolean): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  const csvData = (req.body?.csvData ?? []) as RiskImportRow[];

  if (!Array.isArray(csvData)) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("csvData is required and must be an array")));
  }
  if (csvData.length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("No rows to import")));
  }

  try {
    const result = await importRisks(csvData, organizationId, req.userId!, { strict });
    // Validation-only failure = 400 (client error). Insert failures during a
    // partially-successful batch also come back with success=false and are
    // returned as 400 for the client to display per-row errors.
    const status = result.success ? 200 : 400;
    const body = {
      ...result,
      errors: result.errors.map((e) => translateImportError(req, e, strict)),
    };
    return res.status(status).json(STATUS_CODE[status](body));
  } catch (error) {
    logStructured("error", "risk-import bulk insert failed", "bulkImportRisks", fileName);
    logger.error("❌ Error in bulkImportRisks:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** POST /api/extensions/risk-import/import (legacy, frozen): the accept rules the endpoint always had. */
export function bulkImportRisks(req: Request, res: Response): Promise<any> {
  return handleBulkImport(req, res, false);
}

/** POST /api/v1/risk-import/import: strict rules (required fields, duplicate names, unknown categories). */
export function bulkImportRisksStrict(req: Request, res: Response): Promise<any> {
  return handleBulkImport(req, res, true);
}
