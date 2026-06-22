import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { getActionAuditLog, getAuditLogPaginated } from "../services/aiAuditTrail.service";
import { getAIAuditAnalytics, getAuditExportData } from "../utils/aiAudit.utils";

const fileName = "aiAudit.ctrl.ts";

/**
 * GET /api/ai-audit/log
 */
export async function getAuditLog(req: Request, res: Response) {
  const functionName = "getAuditLog";
  const organizationId = req.organizationId!;

  try {
    const { state, tool, user, actorType, dateFrom, dateTo, limit, offset } = req.query;
    const result = await getAuditLogPaginated(organizationId, {
      state: state as string | undefined,
      toolName: tool as string | undefined,
      userId: user ? Number(user) : undefined,
      actorType: actorType as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to get audit log", functionName, fileName);
    logger.error("Error in getAuditLog:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-audit/log/:actionId
 */
export async function getActionAuditTrail(req: Request, res: Response) {
  const functionName = "getActionAuditTrail";
  const organizationId = req.organizationId!;
  const actionId = req.params.actionId as string;

  try {
    const trail = await getActionAuditLog(organizationId, actionId);
    return res.status(200).json(STATUS_CODE[200](trail));
  } catch (error) {
    logStructured("error", "failed to get action audit trail", functionName, fileName);
    logger.error("Error in getActionAuditTrail:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-audit/analytics
 */
export async function getAnalytics(req: Request, res: Response) {
  const functionName = "getAnalytics";
  const organizationId = req.organizationId!;

  try {
    const { dateFrom, dateTo } = req.query;
    const analytics = await getAIAuditAnalytics(organizationId, {
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    });

    return res.status(200).json(STATUS_CODE[200](analytics));
  } catch (error) {
    logStructured("error", "failed to get analytics", functionName, fileName);
    logger.error("Error in getAnalytics:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-audit/export
 */
export async function exportAuditLog(req: Request, res: Response) {
  const functionName = "exportAuditLog";
  const organizationId = req.organizationId!;

  try {
    const { dateFrom, dateTo, format } = req.query;
    const data = await getAuditExportData(organizationId, {
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    });

    if (format === "csv") {
      const headers = [
        "id",
        "tool_name",
        "action_type",
        "risk_level",
        "state",
        "rule_matched",
        "error_message",
        "created_at",
        "approved_at",
        "executed_at",
        "requested_by_name",
        "approved_by_name",
      ];
      const csv = [
        headers.join(","),
        ...data.map((row: any) =>
          headers.map((h) => `"${(row[h] ?? "").toString().replace(/"/g, '""')}"`).join(","),
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=ai-audit-log.csv");
      return res.send(csv);
    }

    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    logStructured("error", "failed to export audit log", functionName, fileName);
    logger.error("Error in exportAuditLog:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
