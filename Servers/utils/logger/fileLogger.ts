import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { getTenantIdForLogging, ensureTenantLogDirectory } from "../tenant/tenantContext";
import { emitOtlpLog } from "../../observability/otel";
import { getServerLogRetentionDays } from "./logRetention";

const { combine, timestamp, printf, colorize } = format;
const isDev = process.env.NODE_ENV !== "production";

/**
 * Defense-in-depth redaction for accidentally-logged secrets.
 * Applied to every log message before it reaches the transport.
 */
export function redactSensitiveInfo(input: string): string {
  return (
    input
      // OpenAI-style API keys and similar long key prefixes
      .replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, "[REDACTED]")
      // Authorization: Bearer <token>
      .replace(/(\bAuthorization\s*:\s*Bearer\s+)\S+/gi, "$1[REDACTED]")
      // key=value or key: value style sensitive fields
      .replace(
        /\b(password|secret|token|apiKey|api_key|refreshToken|accessToken)\b\s*[:=]\s*[^\s&,"{}]+/gi,
        "$1=[REDACTED]",
      )
      // JSON double-quoted sensitive fields
      .replace(
        /"(password|secret|token|apiKey|api_key|refreshToken|accessToken)"\s*:\s*"[^"]*"/gi,
        '"$1":"[REDACTED]"',
      )
      // JSON single-quoted sensitive fields
      .replace(
        /'(password|secret|token|apiKey|api_key|refreshToken|accessToken)'\s*:\s*'[^']*'/gi,
        "'$1':'[REDACTED]'",
      )
  );
}

const logFormat = printf(({ level, message, timestamp }) => {
  const safeMessage = typeof message === "string" ? redactSensitiveInfo(message) : String(message);
  return `${timestamp} [${level}]: ${safeMessage}`;
});

/**
 * Create a tenant-specific rotating file transport
 * Uses UTC timezone to ensure consistent date-based file naming across different server timezones
 */
function createTenantRotatingFileTransport(tenant: string): DailyRotateFile {
  const tenantLogDir = ensureTenantLogDirectory(tenant);

  return new DailyRotateFile({
    filename: path.join(tenantLogDir, "app-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "10m",
    maxFiles: `${getServerLogRetentionDays()}d`,
    level: "info",
    utc: true, // Force UTC timezone to prevent date inconsistencies
  });
}

const consoleTransport = new transports.Console({
  level: "debug",
  format: combine(colorize(), timestamp(), logFormat),
});

// Create default logger with console transport
const logger = createLogger({
  level: isDev ? "debug" : "info",
  format: combine(timestamp(), logFormat),
  transports: isDev ? [consoleTransport] : [],
});

/**
 * Cache of tenant-specific loggers to avoid opening new file streams on every log call.
 * Without this cache, each call to getTenantLogger() creates a new DailyRotateFile
 * transport, leaking file descriptors until the OS EMFILE limit is hit.
 */
const tenantLoggerCache = new Map<string, ReturnType<typeof createLogger>>();

/**
 * Get or create a tenant-specific logger
 */
function getTenantLogger(tenant: string = "default") {
  const cached = tenantLoggerCache.get(tenant);
  if (cached) return cached;

  const fileTransport = createTenantRotatingFileTransport(tenant);

  const tenantLogger = createLogger({
    level: isDev ? "debug" : "info",
    format: combine(timestamp({ format: () => new Date().toISOString() }), logFormat),
    transports: isDev ? [consoleTransport, fileTransport] : [fileTransport],
  });

  tenantLoggerCache.set(tenant, tenantLogger);
  return tenantLogger;
}

export default logger;

let logId = 1;

type LogState = "processing" | "successful" | "error";

/**
 * Ship one line to the central log stack (OTLP) only, with the attributes
 * every structured line carries; the deployment name is added by
 * emitOtlpLog. No-op when observability is disabled. Writes nothing to the
 * tenant file log, so a line sent only here is not readable by org users.
 * logStructured sends its own line through this, passing the tenant it has
 * already resolved; other callers leave it out and it is resolved here.
 */
export function logCentralOnly(
  state: LogState,
  text: string,
  functionName: string,
  fileName: string,
  tenant: string = getTenantIdForLogging(),
): void {
  emitOtlpLog(state === "error" ? "error" : "info", text, {
    "tenant.hash": tenant,
    "log.state": state,
    "log.function": functionName,
    "log.file": fileName,
    "service.name": "verifywise-backend",
  });
}

/**
 * File-log failures already reported, keyed by tenant and error code (or
 * message), so a lasting failure is reported once and a new kind is still
 * reported.
 */
const reportedTenantLogFailures = new Set<string>();

/**
 * Writes one line to the tenant's file log. A failure (the tenant log
 * directory cannot be created, say) goes to stderr once per tenant and kind
 * of failure and is never thrown: it must not reject a log call, hang a
 * request, or stop the central line and the event-log write that follow it.
 */
function writeTenantLine(tenant: string, line: string): void {
  try {
    getTenantLogger(tenant).info(line);
  } catch (error) {
    const kind = (error as NodeJS.ErrnoException)?.code ?? String((error as Error)?.message);
    const key = `${tenant}:${kind}`;
    if (reportedTenantLogFailures.has(key)) return;
    reportedTenantLogFailures.add(key);
    console.error(`Failed to write the file log for tenant ${tenant}:`, error);
  }
}

export function logStructured(
  state: LogState,
  description: string,
  functionName: string,
  fileName: string,
) {
  // Use UTC timestamp to ensure consistency across timezones
  const timestamp = new Date().toISOString();
  const safeDescription = redactSensitiveInfo(description);
  const line = `${logId++}, ${timestamp}, ${state}, ${safeDescription}, ${functionName}, ${fileName}`;

  // Resolve the tenant scope from request context; falls back to 'default' when unset.
  const tenant = getTenantIdForLogging();
  writeTenantLine(tenant, line);

  // Ship the same line to the central stack. File format unchanged.
  logCentralOnly(state, line, functionName, fileName, tenant);
}

/**
 * Get a tenant-aware logger instance for general logging
 * This can be used for non-structured logging throughout the application
 */
export function getTenantAwareLogger() {
  const tenant = getTenantIdForLogging();
  return getTenantLogger(tenant);
}
