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
  organizationId?: number;       // New name (preferred)
  tenantId?: number | string;    // Deprecated alias - accepts both types
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
  tenantId,  // Deprecated: use organizationId
}: LogSuccessParams): Promise<void> {
  logStructured(logState, description, functionName, fileName);
  logger.debug(`✅ ${description}`);
  if (eventType != "Read") {
    try {
      // Support both organizationId (new) and tenantId (deprecated)
      // tenantId can be number or string (legacy schema hash)
      const orgId = organizationId ?? (typeof tenantId === 'number' ? tenantId : 0);
      await logEvent(eventType, description, userId, orgId);
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
  tenantId,  // Deprecated: use organizationId
}: LogFailureParams): Promise<void> {
  logStructured(logState, description, functionName, fileName);
  logger.error(`❌ ${description}:`, error);
  if (eventType != "Read") {
    try {
      // Support both organizationId (new) and tenantId (deprecated)
      // tenantId can be number or string (legacy schema hash)
      const orgId = organizationId ?? (typeof tenantId === 'number' ? tenantId : 0);
      await logEvent('Error', `${description}: ${error.message}`, userId, orgId);
    } catch (dbError) {
      console.error("Failed to log failure event to database:", dbError);
    }
  }
}
