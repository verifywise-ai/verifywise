import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import {
  buildExcelTemplate,
  importRisks,
  RiskImportResult,
  RiskImportRow,
} from "./riskImport.service";

const fileName = "riskImport.ctrl.ts";

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

/**
 * Row errors. The legacy route is a frozen contract and keeps the English
 * `message` the service builds. Only /api/v1 translates.
 *
 * Row errors in the caller's language. The service keys each message
 * (`i18nKey`, found by `npm run i18n:check-en` where it is written), so the
 * text is translated here from that key. `message` stays a string on both
 * routes; only /api/v1 also returns the `key` and `params` it came from, so the
 * legacy response keeps its shape.
 */
function translateRowErrors(req: Request, result: RiskImportResult, strict: boolean) {
  if (!strict) {
    return {
      ...result,
      errors: result.errors.map(({ i18nKey: _key, i18nVars: _vars, ...error }) => error),
    };
  }
  return {
    ...result,
    errors: result.errors.map(({ i18nKey, i18nVars, ...error }) => {
      const message = i18nKey ? req.t!(i18nKey, i18nVars) : error.message;
      return i18nKey
        ? { ...error, message, key: i18nKey, ...(i18nVars ? { params: i18nVars } : {}) }
        : { ...error, message };
    }),
  };
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
    return res.status(status).json(STATUS_CODE[status](translateRowErrors(req, result, strict)));
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
