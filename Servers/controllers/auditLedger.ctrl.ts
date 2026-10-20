import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { appendToAuditLedger, verifyChain } from "../utils/auditLedger.utils";
import { CSV_BOM, csvRow } from "../utils/csv.utils";
import {
  AUDIT_LEDGER_EXPORT_COLUMNS,
  EXPORT_BATCH_SIZE,
  fetchAuditLedgerBatch,
  isLedgerEntryType,
  LEDGER_ENTRY_TYPES,
  LEDGER_FILTER_SQL,
  ledgerFilterReplacements,
  ledgerRowValues,
} from "../utils/auditLedgerExport.utils";
import { redactRowText } from "../utils/logger/redact";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";

import { translateError } from "../utils/i18n.utils";
const INVALID_ENTRY_TYPE = `entry_type must be one of: ${LEDGER_ENTRY_TYPES.join(", ")}`;

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

    // A repeated param (an array) counts as no filter.
    const entryType = typeof req.query.entry_type === "string" ? req.query.entry_type : "";
    if (entryType && !isLedgerEntryType(entryType)) {
      return res.status(400).json(STATUS_CODE[400](INVALID_ENTRY_TYPE));
    }
    const replacements = {
      ...ledgerFilterReplacements(organizationId, {
        entityType: typeof req.query.entity_type === "string" ? req.query.entity_type : "",
        entryType,
      }),
      limit,
      offset,
    };

    const countResult: any[] = await sequelize.query(
      `SELECT COUNT(*) as count FROM audit_ledger al WHERE ${LEDGER_FILTER_SQL}`,
      { replacements, type: QueryTypes.SELECT },
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const rows: Array<Record<string, unknown>> = await sequelize.query(
      `SELECT al.*, u.name as user_name, u.surname as user_surname
       FROM audit_ledger al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${LEDGER_FILTER_SQL}
       ORDER BY al.id DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );
    const entries = rows.map(redactRowText);

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
      }),
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

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** Resolves when the response drains, or when it closes (client gone). */
function waitForDrainOrClose(res: Response): Promise<void> {
  return new Promise((resolve) => {
    // Already gone: "close" has fired and would never fire again.
    if (res.destroyed) return resolve();
    const onDrain = () => {
      res.off("close", onClose);
      resolve();
    };
    const onClose = () => {
      res.off("drain", onDrain);
      resolve();
    };
    res.once("drain", onDrain);
    res.once("close", onClose);
  });
}

export async function exportAuditLedger(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting exportAuditLedger",
    functionName: "exportAuditLedger",
    fileName: "auditLedger.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  // A repeated param arrives as an array; treat anything but one string as no filter.
  const entityType = typeof req.query.entity_type === "string" ? req.query.entity_type : "";
  const entryType = typeof req.query.entry_type === "string" ? req.query.entry_type : "";

  if (entryType && !isLedgerEntryType(entryType)) {
    return res.status(400).json(STATUS_CODE[400](INVALID_ENTRY_TYPE));
  }

  // Client disconnect = the response closed before it finished. (Not `req`
  // close: on Node 16+ that fires as soon as the request has been read.)
  let aborted = false;
  res.on("close", () => {
    aborted = !res.writableFinished;
  });

  try {
    const organizationId = req.organizationId!;
    const filters = { entityType, entryType };
    let started = false;
    let afterId = 0;
    let count = 0;

    for (;;) {
      if (aborted) break;
      const rows = await fetchAuditLedgerBatch(organizationId, filters, afterId);
      if (aborted) break;

      // Nothing is sent until the first batch is in hand, so a failure there
      // is still a normal JSON error response.
      if (!started) {
        started = true;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="audit-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
        );
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
        res.write(CSV_BOM + csvRow([...AUDIT_LEDGER_EXPORT_COLUMNS]));
      }

      if (rows.length > 0) {
        const text = rows.map((r) => csvRow(ledgerRowValues(r))).join("");
        if (!res.write(text)) await waitForDrainOrClose(res);
        count += rows.length;
        afterId = rows[rows.length - 1].id;
      }
      if (rows.length < EXPORT_BATCH_SIZE) break;
    }

    if (aborted) return;
    res.end();

    // Best effort; never delays or fails the download.
    try {
      const filterNote = [
        entityType && `entity_type=${entityType.slice(0, 100)}`,
        entryType && `entry_type=${entryType}`,
      ]
        .filter(Boolean)
        .join(", ");
      await appendToAuditLedger({
        organizationId,
        entryType: "event_log",
        userId: req.userId ?? null,
        eventType: "Read",
        entityType: "audit_ledger",
        description: `Exported ${count} audit ledger entries${filterNote ? ` (${filterNote})` : ""}`,
      });
    } catch {
      // The export already succeeded; losing the self-audit entry is acceptable.
    }

    await logSuccess({
      eventType: "Read",
      description: `Exported ${count} audit ledger entries`,
      functionName: "exportAuditLedger",
      fileName: "auditLedger.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to export audit ledger",
      functionName: "exportAuditLedger",
      fileName: "auditLedger.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (!res.headersSent) {
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
    // Streaming already started: fail the download instead of a truncated file.
    res.destroy(error as Error);
  }
}
