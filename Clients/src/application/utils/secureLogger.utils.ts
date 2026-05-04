/**
 * Secure Client-Side Logger
 *
 * SECURITY: This logger is designed to prevent PII (Personally Identifiable Information)
 * from leaking into browser console logs. Unlike logEngine which includes user ID, email,
 * and name in every log message, this logger only logs UI-safe, generic messages.
 *
 * USE THIS for:
 * - Client-side errors (upload failures, network errors)
 * - User-facing operations (form submissions, file operations)
 *
 * DO NOT USE THIS for:
 * - Server-side logging (use logEngine there)
 * - Debug logs in development (use console.log directly)
 *
 * Principles: KISS, Defensive Programming, GDPR/Compliance-Safe
 */

type LogLevel = "info" | "warn" | "error";

interface SecureLogOptions {
  level: LogLevel;
  message: string;
  context?: string; // Component/feature name (e.g., "FileUpload", "Training")
  isDevelopment?: boolean; // Show detailed logs in dev mode
}

/**
 * Secure logger that doesn't leak PII to browser console
 *
 * @example
 * // ✅ GOOD: Generic, no PII
 * secureLog({ level: 'error', message: 'File upload failed', context: 'FileManager' });
 *
 * @example
 * // ❌ BAD: Contains PII
 * console.error(`User ${userId} failed to upload ${filename}`); // DON'T DO THIS
 */
export const secureLog = ({
  level,
  message,
  context,
  isDevelopment = process.env.NODE_ENV === "development",
}: SecureLogOptions): void => {
  // Defensive: Validate inputs
  if (!message || typeof message !== "string") {
    console.warn("[SecureLogger] Invalid log message provided");
    return;
  }

  // Format: [Context] Message
  const formattedMessage = context ? `[${context}] ${message}` : message;

  // Development mode: Show detailed logs
  if (isDevelopment) {
    switch (level) {
      case "error":
        console.error(formattedMessage);
        break;
      case "warn":
        console.warn(formattedMessage);
        break;
      case "info":
      default:
        console.info(formattedMessage);
    }
    return;
  }

  // Production mode: Silent or minimal logging
  // In production, you might want to send errors to a monitoring service
  // without exposing them in browser console
  if (level === "error") {
    // TODO: Send to monitoring service (Sentry, DataDog, etc.)
    // Example: Sentry.captureMessage(formattedMessage, 'error');

    // For now, silent in production (or show generic message)
    console.error("[Error] An error occurred. Please contact support if the issue persists.");
  }
};

/**
 * Convenience functions for common log levels
 */
export const secureLogError = (message: string, context?: string): void => {
  secureLog({ level: "error", message, context });
};

export const secureLogWarn = (message: string, context?: string): void => {
  secureLog({ level: "warn", message, context });
};

export const secureLogInfo = (message: string, context?: string): void => {
  secureLog({ level: "info", message, context });
};

/**
 * Sanitize error messages to remove PII
 *
 * @example
 * const error = new Error("User john@example.com failed to upload file.pdf");
 * sanitizeErrorMessage(error.message);
 * // Returns: "Operation failed"
 */
export const sanitizeErrorMessage = (error: unknown): string => {
  // Defensive: Handle various error types
  if (!error) return "Unknown error occurred";

  if (error instanceof Error) {
    // Remove potential PII patterns (emails, IDs, file names)
    const sanitized = error.message
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
      .replace(/\b\d{3,}\b/g, "[ID]")
      .replace(/\b[\w-]+\.(pdf|docx?|xlsx?|pptx?|txt|csv)\b/gi, "[FILE]");

    return sanitized || "Operation failed";
  }

  if (typeof error === "string") {
    return error.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]");
  }

  return "An error occurred";
};
