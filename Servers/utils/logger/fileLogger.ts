// Load .env BEFORE reading env vars below. The logger is imported very early
// in the boot chain (before db.ts which normally calls dotenv.config), so
// without this LOKI_URL etc. would be undefined at module init.
import "dotenv/config";

import { createLogger, format, transports, Logger } from "winston";
import LokiTransport from "winston-loki";
import { asyncLocalStorage } from "../context/context";

const { combine, timestamp, printf, colorize, json } = format;
const isDev = process.env.NODE_ENV !== "production";
const SERVICE = process.env.SERVICE_NAME || "backend";
const ENV = process.env.NODE_ENV || "development";
const LOKI_URL = process.env.LOKI_URL;
const LOKI_ENABLED = !!LOKI_URL && process.env.LOKI_ENABLED !== "false";

// Diagnostic banner — prints to stderr at startup so you can see whether the
// Loki transport is actually wired up. Remove or gate behind LOG_DEBUG once
// confirmed working.
// eslint-disable-next-line no-console
console.error(
  `[logger-init] service=${SERVICE} env=${ENV} LOKI_URL=${LOKI_URL ?? "(unset)"} LOKI_ENABLED=${LOKI_ENABLED}`,
);

/**
 * Injects request-scoped context (org_id, user_id, request_id, tenant_hash)
 * into every log line by reading from AsyncLocalStorage. Kept off the Loki
 * stream labels to avoid high cardinality at 600+ tenants; query in LogQL with
 * `{service="backend"} | json | org_id="42"`.
 */
const contextFormat = format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store) {
    if (store.organizationId !== undefined) info.org_id = store.organizationId;
    if (store.userId !== undefined) info.user_id = store.userId;
    if (store.requestId !== undefined) info.request_id = store.requestId;
    if (store.tenantHash !== undefined) info.tenant_hash = store.tenantHash;
  }
  info.service = SERVICE;
  info.env = ENV;
  return info;
});

const consoleFormat = combine(
  colorize(),
  timestamp(),
  printf(({ level, message, timestamp, request_id, org_id }) => {
    const ctx = [request_id ? `req=${request_id}` : null, org_id !== undefined ? `org=${org_id}` : null]
      .filter(Boolean)
      .join(" ");
    return `${timestamp} [${level}]${ctx ? ` (${ctx})` : ""}: ${message}`;
  }),
);

const buildTransports = (): (transports.ConsoleTransportInstance | LokiTransport)[] => {
  const list: (transports.ConsoleTransportInstance | LokiTransport)[] = [];

  if (isDev) {
    list.push(
      new transports.Console({
        level: "debug",
        format: consoleFormat,
      }),
    );
  }

  if (LOKI_ENABLED && LOKI_URL) {
    // Production with Loki: log to Loki only.
    // Non-prod with Loki: keep console too (already added above).
  } else if (!isDev) {
    // Production without Loki: at minimum keep stdout so container logs aren't lost.
    list.push(
      new transports.Console({
        level: "info",
        format: combine(timestamp(), json()),
      }),
    );
  }

  if (LOKI_ENABLED && LOKI_URL) {
    // eslint-disable-next-line no-console
    console.error(`[logger-init] adding LokiTransport host=${LOKI_URL}`);

    // winston-loki 6.x has a serialization bug when combined with format.json()
    // — it produces malformed JSON that Loki rejects with "Value is string, but
    // can't find closing '"' symbol". Using printf lets us control the exact
    // string that becomes the log line, which winston-loki then escapes
    // correctly when building the push body.
    const lokiFormat = combine(
      contextFormat(),
      timestamp(),
      printf((info) => {
        // Strip Symbol-keyed winston internals and emit a plain JSON line.
        const { level, message, ...rest } = info as Record<string, unknown> & {
          level: string;
          message: unknown;
        };
        const safeMessage = typeof message === "string" ? message : String(message);
        try {
          return JSON.stringify({ level, message: safeMessage, ...rest });
        } catch {
          return JSON.stringify({ level, message: safeMessage });
        }
      }),
    );

    list.push(
      new LokiTransport({
        host: LOKI_URL,
        labels: { service: SERVICE, env: ENV },
        // CRITICAL: json:false sends the printf output verbatim as the log line.
        // With json:true, winston-loki re-serializes the info object itself
        // (ignoring our printf format) which mangles the JSON Loki expects.
        json: false,
        format: lokiFormat,
        replaceTimestamp: true,
        batching: true,
        interval: 5,
        gracefulShutdown: true,
        onConnectionError: (err: unknown) => {
          // eslint-disable-next-line no-console
          console.error("[loki-transport] CONNECTION ERROR:", err);
        },
      }),
    );
  } else {
    // eslint-disable-next-line no-console
    console.error(
      `[logger-init] LokiTransport SKIPPED (LOKI_ENABLED=${LOKI_ENABLED}, LOKI_URL=${LOKI_URL ?? "unset"})`,
    );
  }

  // eslint-disable-next-line no-console
  console.error(`[logger-init] transports installed: ${list.length} (${list.map((t) => t.constructor.name).join(", ")})`);

  return list;
};

const logger: Logger = createLogger({
  level: isDev ? "debug" : "info",
  defaultMeta: { service: SERVICE, env: ENV },
  format: combine(contextFormat(), timestamp(), json()),
  transports: buildTransports(),
});

// Listen to winston-level errors (any transport that throws bubbles here).
logger.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[winston] transport error:", err);
});

// Smoke test — emit one line immediately so we know the pipeline works.
logger.info("logger initialized", { kind: "boot", service: SERVICE });
// eslint-disable-next-line no-console
console.error("[logger-init] smoke-test log emitted");

// ── Crash safety: flush winston before exiting on uncaught errors ────────────
//
// winston-loki batches logs in memory and pushes every 5s. On a hard crash
// (uncaughtException, unhandledRejection) those in-flight logs would be lost
// unless we explicitly drain the transport before exiting. We give winston up
// to FLUSH_TIMEOUT_MS to flush, then force-exit so the process never hangs.
//
// gracefulShutdown: true on the Loki transport already covers SIGTERM/SIGINT,
// so we don't install signal handlers here.

const FLUSH_TIMEOUT_MS = 3000;
let crashFlushInFlight = false;

const flushLoggerAndExit = (exitCode: number): void => {
  if (crashFlushInFlight) return;
  crashFlushInFlight = true;

  let exited = false;
  const doExit = () => {
    if (exited) return;
    exited = true;
    process.exit(exitCode);
  };

  // Hard deadline — never let a stuck transport prevent process exit.
  setTimeout(doExit, FLUSH_TIMEOUT_MS).unref();

  logger.on("finish", doExit);
  logger.end();
};

process.on("uncaughtException", (err) => {
  // Best-effort structured log. Console fallback in case the logger itself
  // is part of what's broken.
  // eslint-disable-next-line no-console
  console.error("[fatal] uncaughtException:", err);
  logger.error("uncaughtException — process crashing", {
    kind: "process_crash",
    crash_type: "uncaughtException",
    error: err?.message,
    stack: err?.stack,
  });
  flushLoggerAndExit(1);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  // eslint-disable-next-line no-console
  console.error("[fatal] unhandledRejection:", reason);
  logger.error("unhandledRejection — process crashing", {
    kind: "process_crash",
    crash_type: "unhandledRejection",
    error: err.message,
    stack: err.stack,
  });
  flushLoggerAndExit(1);
});

export default logger;

let logId = 1;

export function logStructured(
  state: "processing" | "successful" | "error",
  description: string,
  functionName: string,
  fileName: string,
): void {
  logger.info(description, {
    log_id: logId++,
    state,
    function_name: functionName,
    file_name: fileName,
  });
}

/**
 * Back-compat shim. The logger is now tenant-aware via AsyncLocalStorage
 * (org_id is injected into every record), so there is no separate per-tenant
 * logger instance. Callers can continue invoking `getTenantAwareLogger()`
 * without changing the call sites.
 */
export function getTenantAwareLogger(): Logger {
  return logger;
}
