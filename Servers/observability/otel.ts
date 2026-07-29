/**
 * OpenTelemetry bootstrap for the Node backend.
 *
 * Configures OTLP metric + log exporters that push to the central observability
 * stack (an OTel Collector on a separate VM). Configuration is read ONCE at
 * startup from the instance-level `monitoring_config` row, with env-var
 * fallback — changes take effect after a restart ("direct export, restart to
 * apply").
 *
 * Everything here is a no-op when monitoring is disabled or unconfigured, so the
 * server always starts cleanly.
 */
import {
  metrics,
  Counter,
  Histogram,
  Attributes,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
} from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";

const SERVICE_NAME = "verifywise-backend";

interface ResolvedConfig {
  enabled: boolean;
  endpoint: string | null;
  deploymentName: string;
  authHeader: string | null;
}

let started = false;
let deploymentName = process.env.DEPLOYMENT_NAME || "unknown";
let requestCounter: Counter | undefined;
let requestDuration: Histogram | undefined;
let meterProvider: MeterProvider | undefined;
let loggerProvider: LoggerProvider | undefined;

/** Parse "Header-Name: value" into the headers map OTLP exporters expect. */
function parseAuthHeader(authHeader: string | null): Record<string, string> | undefined {
  if (!authHeader) return undefined;
  const idx = authHeader.indexOf(":");
  if (idx === -1) return { Authorization: authHeader.trim() };
  const name = authHeader.slice(0, idx).trim();
  const value = authHeader.slice(idx + 1).trim();
  if (!name || !value) return undefined;
  return { [name]: value };
}

/**
 * Resolve config from the DB (preferred) with env-var fallback. Imported lazily
 * so this module has no hard dependency on the DB layer when observability is
 * off or during early boot.
 */
async function resolveConfig(): Promise<ResolvedConfig> {
  const envEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null;
  const envEnabled = process.env.OTEL_ENABLED === "true";
  const fallback: ResolvedConfig = {
    enabled: envEnabled && Boolean(envEndpoint),
    endpoint: envEndpoint,
    deploymentName: process.env.DEPLOYMENT_NAME || "unknown",
    authHeader: process.env.OTEL_EXPORTER_OTLP_HEADERS_AUTH || null,
  };

  try {
    const { getMonitoringConfig } = await import("../utils/monitoringConfig.utils");
    const cfg = await getMonitoringConfig();
    if (cfg.enabled && cfg.otlp_endpoint) {
      return {
        enabled: true,
        endpoint: cfg.otlp_endpoint,
        deploymentName: cfg.deployment_name || fallback.deploymentName,
        authHeader: cfg.auth_header,
      };
    }
    // DB row exists but disabled → respect it unless env explicitly enables.
    if (!cfg.enabled && !envEnabled) {
      return { ...fallback, enabled: false };
    }
  } catch {
    // DB unavailable at boot — fall back to env config.
  }
  return fallback;
}

/**
 * Initialize OTLP metric + log pipelines. Safe to call once at startup.
 * Returns whether observability was actually enabled.
 */
export async function initObservability(): Promise<boolean> {
  if (started) return Boolean(meterProvider);
  started = true;

  // Surface OTLP exporter push failures (network/TLS/HTTP errors) to the console.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const config = await resolveConfig();
  deploymentName = config.deploymentName;

  if (!config.enabled || !config.endpoint) {
    console.log("[otel] observability disabled — metrics/logs not exported");
    return false;
  }

  const base = config.endpoint.replace(/\/+$/, "");
  const headers = parseAuthHeader(config.authHeader);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "0.0.0",
    "deployment.name": deploymentName,
  });

  // Metrics
  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers }),
        exportIntervalMillis: 15000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const meter = metrics.getMeter(SERVICE_NAME);
  requestCounter = meter.createCounter("http.server.requests", {
    description: "Total HTTP requests handled",
  });
  requestDuration = meter.createHistogram("http.server.request.duration", {
    description: "HTTP request duration",
    unit: "s",
  });

  // Logs — sdk-logs 0.217 removed addLogRecordProcessor(); processors are
  // supplied via the constructor.
  loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${base}/v1/logs`, headers })),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  console.log(
    `[otel] observability enabled — exporting to ${base} as deployment="${deploymentName}"`,
  );
  return true;
}

/** The active deployment name (always defined; "unknown" when unset). */
export function getDeploymentName(): string {
  return deploymentName;
}

export function isObservabilityEnabled(): boolean {
  return Boolean(meterProvider);
}

/** Record one HTTP request's metrics. No-op when disabled. */
export function recordRequestMetric(attrs: Attributes, durationSeconds: number): void {
  requestCounter?.add(1, attrs);
  requestDuration?.record(durationSeconds, attrs);
}

const SEVERITY_BY_LEVEL: Record<string, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

/** Ship one log record to the central stack. No-op when disabled. */
export function emitOtlpLog(level: string, body: string, attributes: Attributes = {}): void {
  if (!loggerProvider) return;
  loggerProvider.getLogger(SERVICE_NAME).emit({
    severityNumber: SEVERITY_BY_LEVEL[level] ?? SeverityNumber.INFO,
    severityText: level.toUpperCase(),
    body,
    attributes: { "deployment.name": deploymentName, ...attributes },
  });
}

/** Flush + shut down exporters during graceful shutdown. */
export async function shutdownObservability(): Promise<void> {
  await Promise.allSettled([meterProvider?.shutdown(), loggerProvider?.shutdown()]);
}
