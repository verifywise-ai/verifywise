import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request } from "express";

const mockLogStructured = jest.fn<(...args: unknown[]) => void>();
const mockLoggerError = jest.fn<(...args: unknown[]) => void>();
const mockLogEvent = jest
  .fn<
    (
      eventType: string,
      description: string,
      userId: number,
      organizationId: number,
    ) => Promise<void>
  >()
  .mockResolvedValue(undefined);

jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    debug: jest.fn(),
  },
  logStructured: (...args: unknown[]) => mockLogStructured(...args),
}));

jest.mock("../logger/dbLogger", () => ({
  logEvent: (eventType: string, description: string, userId: number, organizationId: number) =>
    mockLogEvent(eventType, description, userId, organizationId),
}));

import { logRollbackFailure } from "../logger/logHelper";

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    userId: 42,
    organizationId: 7,
    originalUrl: "/api/datasets/123",
    url: "/api/datasets/123",
    ...overrides,
  } as unknown as Request;
}

describe("logRollbackFailure", () => {
  beforeEach(() => {
    mockLogStructured.mockReset();
    mockLoggerError.mockReset();
    mockLogEvent.mockReset();
    mockLogEvent.mockResolvedValue(undefined);
  });

  it("logs the rollback error via logFailure with the original error message + path in the description", async () => {
    await logRollbackFailure({
      req: makeReq(),
      functionName: "updateDatasetById",
      fileName: "dataset.ctrl.ts",
      eventType: "Update",
      originalError: new Error("connection terminated"),
      rollbackError: new Error("rollback already executed"),
    });

    expect(mockLogStructured).toHaveBeenCalledTimes(1);
    const [logState, description] = mockLogStructured.mock.calls[0] as [
      string,
      string,
      string,
      string,
    ];
    expect(logState).toBe("error");
    expect(description).toContain("transaction rollback failed");
    expect(description).toContain("path=/api/datasets/123");
    expect(description).toContain("connection terminated");
  });

  it("writes a separate file-logger entry preserving the original error so it isn't swallowed", async () => {
    const originalError = new Error("constraint violation");
    await logRollbackFailure({
      req: makeReq(),
      functionName: "createNewDataset",
      fileName: "dataset.ctrl.ts",
      eventType: "Create",
      originalError,
      rollbackError: new Error("rb failed"),
    });

    const originalLogCall = mockLoggerError.mock.calls.find((c) =>
      String(c[0]).startsWith("[rollback] original error"),
    );
    expect(originalLogCall).toBeDefined();
    expect(originalLogCall![0]).toContain("createNewDataset");
    expect(originalLogCall![0]).toContain("path=/api/datasets/123");
    expect(originalLogCall![0]).toContain("org=7");
    expect(originalLogCall![1]).toBe(originalError);
  });

  it("emits a DB event for the rollback failure with userId and organizationId", async () => {
    await logRollbackFailure({
      req: makeReq({ userId: 99, organizationId: 3 } as Partial<Request>),
      functionName: "deleteModelInventoryById",
      fileName: "modelInventory.ctrl.ts",
      eventType: "Delete",
      originalError: new Error("FK violation"),
      rollbackError: new Error("rb failed"),
    });

    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    const [eventType, description, userId, organizationId] = mockLogEvent.mock.calls[0];
    expect(eventType).toBe("Error");
    expect(userId).toBe(99);
    expect(organizationId).toBe(3);
    expect(description).toContain("transaction rollback failed");
    expect(description).toContain("FK violation");
    expect(description).toContain("rb failed");
  });

  it("coerces non-Error values for both originalError and rollbackError", async () => {
    await logRollbackFailure({
      req: makeReq(),
      functionName: "fn",
      fileName: "f.ts",
      eventType: "Update",
      originalError: "string-cause",
      rollbackError: { code: "ECONN" },
    });

    expect(mockLogStructured).toHaveBeenCalledTimes(1);
    const description = (mockLogStructured.mock.calls[0] as unknown[])[1] as string;
    expect(description).toContain("string-cause");
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("falls back to organizationId=0 in the DB event when req has no organizationId", async () => {
    await logRollbackFailure({
      req: makeReq({ organizationId: undefined } as Partial<Request>),
      functionName: "fn",
      fileName: "f.ts",
      eventType: "Create",
      originalError: new Error("x"),
      rollbackError: new Error("y"),
    });

    const [, , , organizationId] = mockLogEvent.mock.calls[0];
    expect(organizationId).toBe(0);
  });

  it("uses req.url when originalUrl is missing", async () => {
    await logRollbackFailure({
      req: makeReq({ originalUrl: undefined, url: "/fallback" } as Partial<Request>),
      functionName: "fn",
      fileName: "f.ts",
      eventType: "Create",
      originalError: new Error("x"),
      rollbackError: new Error("y"),
    });

    const description = (mockLogStructured.mock.calls[0] as unknown[])[1] as string;
    expect(description).toContain("path=/fallback");
  });
});
