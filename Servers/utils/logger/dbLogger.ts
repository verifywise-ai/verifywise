// utils/logger/dbLogger.ts
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { asyncLocalStorage } from "../context/context";
import { appendToAuditLedger } from "../auditLedger.utils";
import { redactSensitiveInfo } from "./redact";

type EventType = "Create" | "Read" | "Update" | "Delete" | "Error";

export async function logEvent(
  eventType: EventType,
  rawDescription: string,
  userId: number,
  organizationId: number,
): Promise<void> {
  // event_logs is readable by every org member (GET /api/logger/events), and
  // callers often append `${error.message}`, so redact here at the sink
  // before the event_logs insert (appendToAuditLedger also redacts its own
  // copy, which finds nothing more in this text). A missing
  // description is stored as before; redactSensitiveInfo coerces anything
  // else to text and never throws, so an untyped caller cannot break this.
  const description = rawDescription == null ? rawDescription : redactSensitiveInfo(rawDescription);
  const store = asyncLocalStorage.getStore();
  const effectiveUserId = store?.userId || userId;
  if (!effectiveUserId) {
    console.warn("No user ID found in context, skipping event log");
    return;
  }
  try {
    await sequelize.query(
      `INSERT INTO event_logs (organization_id, event_type, description, user_id) VALUES (:organizationId, :eventType, :description, :userId)`,
      {
        replacements: { organizationId, eventType, description, userId: effectiveUserId },
        type: QueryTypes.INSERT,
      },
    );
    // Append to tamper-proof audit ledger (fire-and-forget)
    appendToAuditLedger({
      organizationId,
      entryType: "event_log",
      userId: effectiveUserId,
      eventType,
      description,
    }).catch((err) => console.error("[audit_ledger] write failed:", err));
  } catch (err) {
    console.error("Failed to log event:", err);
  }
}
