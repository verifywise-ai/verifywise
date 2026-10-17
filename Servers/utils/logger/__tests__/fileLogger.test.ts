import { describe, expect, it, jest } from "@jest/globals";

const emitOtlpLog = jest.fn();
jest.mock("../../../observability/otel", () => ({ emitOtlpLog }));
jest.mock("../../tenant/tenantContext", () => ({
  getTenantIdForLogging: () => "42",
  ensureTenantLogDirectory: () => "/nonexistent",
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
});
