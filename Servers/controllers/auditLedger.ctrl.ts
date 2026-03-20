import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { verifyChain } from "../utils/auditLedger.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";

export async function getAuditLedger(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAuditLedger",
    functionName: "getAuditLedger",
    fileName: "auditLedger.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const organizationId = req.organizationId!;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    // Optional filters
    const entityType = (req.query.entity_type as string) || "";
    const entryType = (req.query.entry_type as string) || "";

    // Build WHERE clauses
    const conditions: string[] = ["al.organization_id = :organizationId"];
    const replacements: Record<string, string | number> = { organizationId, limit, offset };

    if (entityType) {
      conditions.push("al.entity_type = :entityType");
      replacements.entityType = entityType;
    }
    if (entryType) {
      conditions.push("al.entry_type = :entryType");
      replacements.entryType = entryType;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countResult: any[] = await sequelize.query(
      `SELECT COUNT(*) as count FROM audit_ledger al ${whereClause}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const entries = await sequelize.query(
      `SELECT al.*, u.name as user_name, u.surname as user_surname
       FROM audit_ledger al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}
       ORDER BY al.id DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );

    await logSuccess({
      eventType: "Read",
      description: "Retrieved audit ledger entries",
      functionName: "getAuditLedger",
      fileName: "auditLedger.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        entries,
        total,
        limit,
        offset,
        hasMore: offset + entries.length < total,
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve audit ledger",
      functionName: "getAuditLedger",
      fileName: "auditLedger.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function verifyAuditLedger(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting verifyAuditLedger",
    functionName: "verifyAuditLedger",
    fileName: "auditLedger.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const organizationId = req.organizationId!;
    const result = await verifyChain(organizationId);

    await logSuccess({
      eventType: "Read",
      description: `Audit ledger verification: ${result.status}`,
      functionName: "verifyAuditLedger",
      fileName: "auditLedger.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to verify audit ledger",
      functionName: "verifyAuditLedger",
      fileName: "auditLedger.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
