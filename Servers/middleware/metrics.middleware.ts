import { NextFunction, Request, Response } from "express";
import { httpRequestDurationSeconds, httpRequestsTotal } from "../utils/metrics/registry";

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;

    const routePath = req.route?.path
      ? `${req.baseUrl || ""}${req.route.path}`
      : req.path === "/metrics" || req.path === "/health"
        ? req.path
        : "unmatched";

    const labels = {
      method: req.method,
      route: routePath,
      status_code: String(res.statusCode),
    };

    httpRequestDurationSeconds.observe(labels, seconds);
    httpRequestsTotal.inc(labels);
  });

  next();
}
