import { Request } from "express";
import { logStructured } from "./fileLogger";
import { logEvent } from "./dbLogger";
import logger from "./fileLogger";

type LogState = "processing" | "successful" | "error";
type EventType = "Create" | "Read" | "Update" | "Delete" | "Error";

interface LogProcessingParams {
  logState?: LogState;
  description: string;
  functionName: string;
  fileName: string;
  userId: number;
  organizationId?: number;
}
interface LogSuccessParams extends LogProcessingParams {
  eventType: EventType;
}
interface LogFailureParams extends LogProcessingParams {
  eventType: EventType;
  error: Error;
}

export function logProcessing({
  logState = "processing",
  description,
  functionName,
  fileName,
}: LogProcessingParams): void {
  logStructured(logState, description, functionName, fileName);
  logger.debug(`🔄 ${description}`);
}

export async function logSuccess({
  logState = "successful",
  eventType,
  description,
  functionName,
  fileName,
  userId,
  organizationId,
}: LogSuccessParams): Promise<void> {
  logStructured(logState, description, functionName, fileName);
  logger.debug(`✅ ${description}`);
  if (eventType != "Read") {
    try {
      await logEvent(eventType, description, userId, organizationId ?? 0);
    } catch (error) {
      console.error("Failed to log success event to database:", error);
    }
  }
}

export async function logFailure({
  logState = "error",
  description,
  functionName,
  fileName,
  eventType,
  error,
  userId,
  organizationId,
}: LogFailureParams): Promise<void> {
  logStructured(logState, description, functionName, fileName);
  logger.error(`❌ ${description}:`, error);
  if (eventType != "Read") {
    try {
      await logEvent("Error", `${description}: ${error.message}`, userId, organizationId ?? 0);
    } catch (dbError) {
      console.error("Failed to log failure event to database:", dbError);
    }
  }
}

interface LogRollbackFailureParams {
  req: Request;
  functionName: string;
  fileName: string;
  eventType: EventType;
  originalError: unknown;
  rollbackError: unknown;
}

/**
 * Logs a transaction rollback failure with full dual-context:
 * the rollback error (the secondary failure) goes through the structured
 * logFailure pipeline, while the original error (the cause that triggered the
 * rollback) is preserved both in the rollback record's description and as a
 * separate file-logger entry. Request path and organizationId are included so
 * the two failures can be correlated to a single inbound request.
 */
export async function logRollbackFailure({
  req,
  functionName,
  fileName,
  eventType,
  originalError,
  rollbackError,
}: LogRollbackFailureParams): Promise<void> {
  const originalErr =
    originalError instanceof Error ? originalError : new Error(String(originalError));
  const rollbackErr =
    rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));

  const userId = req.userId ?? 0;
  const organizationId = req.organizationId;
  const path = req.originalUrl || req.url || "unknown";

  logger.error(
    `[rollback] original error in ${functionName} (path=${path}, org=${organizationId ?? "n/a"}):`,
    originalErr,
  );

  await logFailure({
    eventType,
    description: `transaction rollback failed (path=${path}) after original error: ${originalErr.message}`,
    functionName,
    fileName,
    userId,
    organizationId,
    error: rollbackErr,
  });
}
