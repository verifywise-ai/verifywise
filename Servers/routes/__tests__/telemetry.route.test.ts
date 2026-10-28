/**
 * Contract tests for the browser telemetry sink (telemetry.route.ts).
 *
 * This route is INTENTIONALLY unauthenticated — browser errors can occur
 * before login — and always answers 204 quickly. These tests lock in that
 * public contract (they fail if authentication is added) and verify the
 * advertised bounds: at most 50 events are processed and every string field is
 * clamped to 512 characters.
 *
 * Without an initialized OTel SDK `isObservabilityEnabled()` returns false and
 * the route short-circuits before any processing, which would make the
 * bounding/clamping assertions vacuous. So `../observability/otel` is mocked
 * with observability ENABLED, and `@opentelemetry/api` / `@opentelemetry/api-logs`
 * are mocked to capture counter/histogram/logger emissions.
 *
 * No tenant isolation applies here: telemetry events carry no tenant identity.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const counterAdd = jest.fn();
const histogramRecord = jest.fn();
const loggerEmit = jest.fn();

jest.mock("../../observability/otel", () => ({
  __esModule: true,
  isObservabilityEnabled: () => true,
  getDeploymentName: () => "test-deployment",
}));

jest.mock("@opentelemetry/api", () => ({
  __esModule: true,
  metrics: {
    getMeter: () => ({
      createCounter: () => ({ add: counterAdd }),
      createHistogram: () => ({ record: histogramRecord }),
    }),
  },
}));

jest.mock("@opentelemetry/api-logs", () => {
  const actual = jest.requireActual("@opentelemetry/api-logs") as Record<string, unknown>;
  return {
    __esModule: true,
    ...actual,
    logs: {
      getLogger: () => ({ emit: loggerEmit }),
    },
  };
});

import telemetryRouter from "../telemetry.route";

const app = () => {
  const a = express();
  a.use(express.json());
  a.use("/telemetry", telemetryRouter);
  return a;
};

beforeEach(() => {
  counterAdd.mockClear();
  histogramRecord.mockClear();
  loggerEmit.mockClear();
});

describe("POST /telemetry — intentionally public contract", () => {
  it("accepts a request with no auth header at all and answers 204", async () => {
    const res = await request(app())
      .post("/telemetry")
      .send({ events: [{ type: "event", name: "click" }] });

    expect(res.status).toBe(204);
    expect(counterAdd).toHaveBeenCalledTimes(1);
  });

  it("answers 204 with missing or empty events", async () => {
    const noBody = await request(app()).post("/telemetry").send({});
    expect(noBody.status).toBe(204);

    const empty = await request(app()).post("/telemetry").send({ events: [] });
    expect(empty.status).toBe(204);

    const notArray = await request(app()).post("/telemetry").send({ events: "nope" });
    expect(notArray.status).toBe(204);

    expect(counterAdd).not.toHaveBeenCalled();
  });

  it("bounds processing to at most 50 events", async () => {
    const events = Array.from({ length: 120 }, (_, i) => ({
      type: "event",
      name: `event-${i}`,
    }));

    const res = await request(app()).post("/telemetry").send({ events });

    expect(res.status).toBe(204);
    expect(counterAdd).toHaveBeenCalledTimes(50);
    expect(counterAdd.mock.calls.length).toBeLessThanOrEqual(50);
  });

  it("clamps oversized strings to 512 characters in captured emissions", async () => {
    const longMessage = "e".repeat(1000);
    const res = await request(app())
      .post("/telemetry")
      .send({
        events: [
          {
            type: "error",
            message: longMessage,
            route: `/r${"x".repeat(1000)}`,
            name: "boom",
          },
        ],
      });

    expect(res.status).toBe(204);
    expect(loggerEmit).toHaveBeenCalledTimes(1);
    const record = loggerEmit.mock.calls[0][0] as {
      body: string;
      attributes: Record<string, string>;
    };
    expect(record.body).toBe("e".repeat(512));
    expect(record.body.length).toBe(512);
    expect(record.attributes["browser.route"].length).toBeLessThanOrEqual(512);
  });
});
