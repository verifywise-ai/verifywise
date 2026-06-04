import { NextFunction, Request, Response } from "express";
import logger from "../utils/logger/fileLogger";

const SKIP_PATHS = new Set(["/metrics", "/health"]);
const SKIP_PREFIXES = ["/api/rum/"];

/**
 * Logs one structured line per HTTP request on response finish.
 * Complements the Prometheus histogram with per-request detail (queryable in
 * Loki by request_id, org_id, status, path).
 *
 * Skips /metrics, /health, and /api/rum/* to keep ingestion volume sane.
 */
export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_PATHS.has(req.path) || SKIP_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path;
    const contentLength = res.getHeader("content-length");

    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger.log(level, `${req.method} ${route} ${res.statusCode}`, {
      kind: "http_access",
      method: req.method,
      path: req.path,
      route,
      status: res.statusCode,
      duration_ms: Math.round(durationMs * 100) / 100,
      content_length:
        typeof contentLength === "string" ? parseInt(contentLength, 10) || undefined : undefined,
      user_agent: req.headers["user-agent"],
      ip: req.ip,
    });
  });

  next();
}
