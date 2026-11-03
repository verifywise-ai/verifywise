jest.mock("../../utils/shadowAiApiKey.utils", () => ({
  validateApiKeyWithCache: jest.fn().mockResolvedValue(7),
}));
jest.mock("../../services/shadowAiIngestion.service", () => ({
  checkShadowAiRateLimit: jest.fn().mockResolvedValue({ allowed: true, maxPerHour: 0 }),
  ingestShadowAiEvents: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logRollbackFailure: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { Request, Response } from "express";
import { ingestEvents } from "../shadowAiIngestion.ctrl";
import { ingestShadowAiEvents } from "../../services/shadowAiIngestion.service";
import { logRollbackFailure } from "../../utils/logger/logHelper";

describe("ingestEvents rollback failure", () => {
  it("records the audit entry with the request through logRollbackFailure", async () => {
    const original = new Error("insert failed");
    const rollback = new Error("connection lost");
    (ingestShadowAiEvents as jest.Mock).mockImplementation(async (_org, _events, options) => {
      await options.onRollbackFailure(original, rollback);
      throw original;
    });

    const req = {
      headers: { "x-api-key": "key" },
      body: {
        events: [
          {
            user_email: "a@example.com",
            destination: "example.com",
            timestamp: "2026-11-01T10:00:00Z",
          },
        ],
      },
      t: (s: string) => s,
    } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;

    await ingestEvents(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(logRollbackFailure).toHaveBeenCalledWith({
      req,
      functionName: "ingestEvents",
      fileName: "shadowAiIngestion.ctrl.ts",
      eventType: "Create",
      originalError: original,
      rollbackError: rollback,
    });
  });
});
