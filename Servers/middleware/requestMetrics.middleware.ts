/**
 * Per-request metrics + access logging.
 *
 * Tracks EVERY HTTP request: increments a Prometheus-bound counter and records a
 * latency histogram (both tagged with the deployment name), and emits a single
 * structured access-log line (shipped to Loki when observability is enabled).
 */
import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { recordRequestMetric, getDeploymentName, emitOtlpLog } from "../observability/otel";
import logger from "../utils/logger/fileLogger";

/**
 * Build a low-cardinality route label. Uses the matched Express route pattern
 * (e.g. `/api/users/:id`) rather than the raw path so IDs don't explode label
 * cardinality. Falls back to the mount path.
 */
function routeLabel(req: Request): string {
  const base = req.baseUrl || "";
  const routePath = (req.route as { path?: string } | undefined)?.path;
  if (routePath) return `${base}${routePath}`;
  return base || "unmatched";
}

export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const startNs = process.hrtime.bigint();

  res.on("finish", () => {
    try {
      const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      const route = routeLabel(req);
      const deployment = getDeploymentName();

      recordRequestMetric(
        {
          http_request_method: req.method,
          http_route: route,
          http_response_status_code: res.statusCode,
          service_name: "verifywise-backend",
          deployment,
        },
        durationSeconds,
      );

      const durationMs = Math.round(durationSeconds * 1000);
      const orgId = req.organizationId ?? "-";
      const userId = req.userId ?? "-";
      const tenant = req.tenantHash ?? "-";
      const line =
        `access ${req.method} ${route} ${res.statusCode} ${durationMs}ms ` +
        `org=${orgId} user=${userId} tenant=${tenant} reqId=${requestId} deployment=${deployment}`;

      // Keep the existing file/console logger working...
      logger.info(line);
      // ...and ship a structured record to the central stack (no-op when disabled).
      emitOtlpLog(res.statusCode >= 500 ? "error" : "info", line, {
        "http.request.method": req.method,
        "http.route": route,
        "http.response.status_code": res.statusCode,
        "http.server.request.duration_ms": durationMs,
        "organization.id": String(orgId),
        "user.id": String(userId),
        "tenant.hash": tenant,
        "request.id": requestId,
        "service.name": "verifywise-backend",
      });
    } catch {
      // Telemetry must never break request handling.
    }
  });

  next();
}
