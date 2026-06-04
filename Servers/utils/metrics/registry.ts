import client from "prom-client";

const SERVICE = process.env.SERVICE_NAME || "backend";
const ENV = process.env.NODE_ENV || "development";

export const register = new client.Registry();
register.setDefaultLabels({ service: SERVICE, env: ENV });
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "HTTP requests by method, route, and status",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const bullmqJobsProcessedTotal = new client.Counter({
  name: "bullmq_jobs_processed_total",
  help: "BullMQ jobs processed by queue and outcome",
  labelNames: ["queue", "status"],
  registers: [register],
});

export const bullmqJobDurationSeconds = new client.Histogram({
  name: "bullmq_job_duration_seconds",
  help: "BullMQ job processing duration",
  labelNames: ["queue"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [register],
});

export const rumWebVitals = new client.Histogram({
  name: "rum_web_vitals_seconds",
  help: "Browser Web Vitals reported via /api/rum/vitals (LCP, FID, INP, CLS, TTFB)",
  labelNames: ["metric"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16],
  registers: [register],
});

export const rumErrorsTotal = new client.Counter({
  name: "rum_errors_total",
  help: "Browser errors reported via /api/rum/errors",
  labelNames: ["kind"],
  registers: [register],
});
