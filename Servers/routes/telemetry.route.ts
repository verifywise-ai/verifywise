/**
 * Browser telemetry sink.
 *
 * The React frontend cannot push OTLP to the collector directly (the endpoint +
 * auth secret are server-side only). Instead it POSTs lightweight events here —
 * web-vitals, JS errors, route timings — which we re-emit as OpenTelemetry
 * metrics/logs tagged with `service.name=verifywise-frontend` and the deployment
 * name. No-op when observability is disabled.
 *
 * This route is intentionally unauthenticated (errors may occur before login)
 * and bounded (event count + field sizes are capped).
 */
import { Router, Request, Response } from "express";
import { metrics } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getDeploymentName, isObservabilityEnabled } from "../observability/otel";

const router = Router();

const FRONTEND_SERVICE = "verifywise-frontend";
const MAX_EVENTS = 50;
const MAX_STR = 512;

type TelemetryEvent = {
  type?: string;
  name?: string;
  value?: number;
  message?: string;
  level?: string;
  route?: string;
};

function clamp(value: unknown): string {
  return String(value ?? "").slice(0, MAX_STR);
}

router.post("/", (req: Request, res: Response) => {
  // Always succeed quickly so the browser never blocks/errors on telemetry.
  if (!isObservabilityEnabled()) {
    return res.status(204).end();
  }

  const events: TelemetryEvent[] = Array.isArray(req.body?.events)
    ? req.body.events.slice(0, MAX_EVENTS)
    : [];

  if (events.length === 0) {
    return res.status(204).end();
  }

  const deployment = getDeploymentName();
  const meter = metrics.getMeter(FRONTEND_SERVICE);
  const eventCounter = meter.createCounter("browser.events", {
    description: "Browser telemetry events received",
  });
  const vital = meter.createHistogram("browser.web_vital", {
    description: "Browser Web Vitals measurements",
    unit: "ms",
  });
  const logger = logs.getLogger(FRONTEND_SERVICE);

  for (const event of events) {
    const type = clamp(event.type || "event");
    const baseAttrs = {
      service_name: FRONTEND_SERVICE,
      deployment,
      type,
    };
    eventCounter.add(1, baseAttrs);

    if (type === "web-vital" && typeof event.value === "number" && isFinite(event.value)) {
      vital.record(event.value, { ...baseAttrs, name: clamp(event.name) });
    }

    if (type === "error" || event.level === "error") {
      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: clamp(event.message || event.name || "frontend error"),
        attributes: {
          "service.name": FRONTEND_SERVICE,
          "deployment.name": deployment,
          "browser.route": clamp(event.route),
          "event.type": type,
        },
      });
    }
  }

  return res.status(204).end();
});

export default router;
