import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import { buildExcelTemplate, importRisks, RiskImportRow } from "./riskImport.service";

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

export async function bulkImportRisks(req: Request, res: Response): Promise<any> {
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
    const result = await importRisks(csvData, organizationId);
    // Validation-only failure = 400 (client error). Insert failures during a
    // partially-successful batch also come back with success=false and are
    // returned as 400 for the client to display per-row errors.
    const status = result.success ? 200 : 400;
    return res.status(status).json(STATUS_CODE[status](result));
  } catch (error) {
    logStructured("error", "risk-import bulk insert failed", "bulkImportRisks", fileName);
    logger.error("❌ Error in bulkImportRisks:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
