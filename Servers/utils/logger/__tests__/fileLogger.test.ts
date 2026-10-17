import { describe, expect, it, jest } from "@jest/globals";

const emitOtlpLog = jest.fn();
jest.mock("../../../observability/otel", () => ({ emitOtlpLog }));
const getTenantIdForLogging = jest.fn(() => "42");
const ensureTenantLogDirectory = jest.fn((tenant: string) => {
  if (tenant === "broken") throw new Error("EACCES: mkdir /app/logs/broken");
  return "/nonexistent";
});
jest.mock("../../tenant/tenantContext", () => ({
  getTenantIdForLogging,
  ensureTenantLogDirectory,
}));
// The tenant file log is not under test here; keep it off the disk.
jest.mock("winston-daily-rotate-file", () => {
  const Transport = jest.requireActual("winston-transport") as any;
  return class extends Transport {
    log(_info: unknown, callback: () => void) {
      callback();
    }
  };
});

import { logCentralOnly, logStructured } from "../fileLogger";

describe("the central log line", () => {
  it("logCentralOnly sends one line with the structured-line attributes", () => {
    logCentralOnly("error", "it failed", "fnName", "file.ts");
    expect(emitOtlpLog.mock.calls).toEqual([
      [
        "error",
        "it failed",
        {
          "tenant.hash": "42",
          "log.state": "error",
          "log.function": "fnName",
          "log.file": "file.ts",
          "service.name": "verifywise-backend",
        },
      ],
    ]);
  });

  it("logStructured ships its line through the same attributes", () => {
    emitOtlpLog.mockClear();
    logStructured("successful", "done", "fnName", "file.ts");
    expect(emitOtlpLog).toHaveBeenCalledTimes(1);
    const [level, line, attributes] = emitOtlpLog.mock.calls[0] as [string, string, unknown];
    expect(level).toBe("info");
    expect(line).toMatch(/, successful, done, fnName, file\.ts$/);
    expect(attributes).toEqual({
      "tenant.hash": "42",
      "log.state": "successful",
      "log.function": "fnName",
      "log.file": "file.ts",
      "service.name": "verifywise-backend",
    });
  });

  it("logStructured resolves the tenant once and hands it to logCentralOnly", () => {
    emitOtlpLog.mockClear();
    getTenantIdForLogging.mockClear();
    logStructured("processing", "starting", "fnName", "file.ts");
    expect(getTenantIdForLogging).toHaveBeenCalledTimes(1);
    expect(emitOtlpLog.mock.calls[0][2]).toMatchObject({ "tenant.hash": "42" });
  });

  it("logCentralOnly uses a tenant it is given instead of resolving one", () => {
    emitOtlpLog.mockClear();
    getTenantIdForLogging.mockClear();
    logCentralOnly("error", "it failed", "fnName", "file.ts", "7");
    expect(getTenantIdForLogging).not.toHaveBeenCalled();
    expect(emitOtlpLog.mock.calls[0][2]).toMatchObject({ "tenant.hash": "7" });
  });
});

describe("an unwritable tenant file log", () => {
  it("never throws, still ships the central line, and is reported once per tenant", () => {
    emitOtlpLog.mockClear();
    getTenantIdForLogging.mockReturnValue("broken");
    const stderr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => logStructured("processing", "starting", "fnName", "file.ts")).not.toThrow();
      expect(() => logStructured("successful", "done", "fnName", "file.ts")).not.toThrow();
      expect(emitOtlpLog).toHaveBeenCalledTimes(2);
      expect(emitOtlpLog.mock.calls[1][2]).toMatchObject({ "tenant.hash": "broken" });
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(String(stderr.mock.calls[0][0])).toContain("broken");
    } finally {
      stderr.mockRestore();
      getTenantIdForLogging.mockReturnValue("42");
    }
  });
});
