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
