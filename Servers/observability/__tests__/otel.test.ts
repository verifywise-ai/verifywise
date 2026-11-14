/**
 * Tests for the OpenTelemetry bootstrap (observability/otel.ts).
 *
 * 1. Dependency compatibility: drives the REAL installed @opentelemetry
 *    packages through the calls the backend makes. When @opentelemetry/core was
 *    pinned to 2.x (an npm override) under resources/sdk-logs/sdk-metrics 3.x,
 *    these calls threw "cleanSimpleAttributes is not a function" /
 *    "isSimpleAttributeValue is not a function" and every login on a
 *    monitoring-enabled deployment answered 500. A version mismatch like that
 *    now fails here instead of in production.
 *
 * 2. Isolation: with monitoring enabled, a throwing SDK must not escape
 *    emitOtlpLog / recordRequestMetric, since both run inside request handling.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { diag, metrics } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

describe("installed OpenTelemetry packages are mutually compatible", () => {
  const resource = () =>
    resourceFromAttributes({ "service.name": "verifywise-backend", "deployment.name": "test" });

  it("reads resource attributes", () => {
    expect(resource().attributes).toEqual({
      "service.name": "verifywise-backend",
      "deployment.name": "test",
    });
  });

  it("emits a log record with attributes", async () => {
    const exporter = new InMemoryLogRecordExporter();
    const provider = new LoggerProvider({
      resource: resource(),
      processors: [new SimpleLogRecordProcessor({ exporter })],
    });

    provider.getLogger("t").emit({ body: "login ok", attributes: { "http.status_code": 200 } });

    const [record] = exporter.getFinishedLogRecords();
    expect(record.body).toBe("login ok");
    expect(record.attributes).toEqual({ "http.status_code": 200 });
    expect(record.resource.attributes["service.name"]).toBe("verifywise-backend");
    await provider.shutdown();
  });

  it("records and collects a metric", async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const provider = new MeterProvider({ resource: resource(), readers: [reader] });

    provider.getMeter("t").createCounter("http.server.requests").add(1, { route: "/login" });
    await reader.forceFlush();

    const [batch] = exporter.getMetrics();
    expect(batch.resource.attributes["service.name"]).toBe("verifywise-backend");
    expect(batch.scopeMetrics[0].metrics[0].descriptor.name).toBe("http.server.requests");
    await provider.shutdown();
  });
});

jest.mock("../../utils/monitoringConfig.utils", () => ({
  __esModule: true,
  getMonitoringConfig: async () => ({
    enabled: true,
    otlp_endpoint: "http://127.0.0.1:1",
    deployment_name: "test",
    auth_header: null,
  }),
}));

describe("telemetry failures never reach the request", () => {
  const sdkFault = () => {
    throw new TypeError("(0 , _opentelemetry_core.cleanSimpleAttributes) is not a function");
  };
  let otel: any;
  const diagError = jest.spyOn(diag, "error").mockImplementation(() => undefined);

  beforeAll(async () => {
    jest.spyOn(LoggerProvider.prototype, "getLogger").mockReturnValue({ emit: sdkFault });
    jest.spyOn(metrics, "getMeter").mockReturnValue({
      createCounter: () => ({ add: sdkFault }),
      createHistogram: () => ({ record: sdkFault }),
    } as any);
    otel = await import("../otel");
    await expect(otel.initObservability()).resolves.toBe(true);
  });

  afterAll(async () => {
    await otel.shutdownObservability();
    jest.restoreAllMocks();
  });

  it("emitOtlpLog swallows an SDK error and reports it once", () => {
    expect(() => otel.emitOtlpLog("info", "login attempt")).not.toThrow();
    expect(() => otel.emitOtlpLog("error", "login attempt")).not.toThrow();
    const reports = diagError.mock.calls.filter(([msg]) => String(msg).includes("emitOtlpLog"));
    expect(reports).toHaveLength(1);
  });

  it("recordRequestMetric swallows an SDK error and reports it once", () => {
    expect(() => otel.recordRequestMetric({ route: "/login" }, 0.01)).not.toThrow();
    expect(() => otel.recordRequestMetric({ route: "/login" }, 0.02)).not.toThrow();
    const reports = diagError.mock.calls.filter(([msg]) =>
      String(msg).includes("recordRequestMetric"),
    );
    expect(reports).toHaveLength(1);
  });
});
