import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request } from "express";

jest.mock("../logger/logHelper", () => ({
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));

import { safeRollback } from "../safeRollback.utils";
import { logFailure } from "../logger/logHelper";

const mockLogFailure = logFailure as jest.MockedFunction<typeof logFailure>;

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "POST",
    originalUrl: "/api/datasets",
    url: "/api/datasets",
    userId: 7,
    organizationId: 99,
    ...overrides,
  } as unknown as Request;
}

describe("safeRollback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does nothing when transaction is null", async () => {
    await expect(
      safeRollback(null, {
        req: buildReq(),
        functionName: "fn",
        fileName: "f.ts",
        originatingError: new Error("boom"),
      }),
    ).resolves.toBeUndefined();
    expect(mockLogFailure).not.toHaveBeenCalled();
  });

  it("does nothing when transaction is undefined", async () => {
    await safeRollback(undefined as any, {
      req: buildReq(),
      functionName: "fn",
      fileName: "f.ts",
      originatingError: new Error("boom"),
    });
    expect(mockLogFailure).not.toHaveBeenCalled();
  });

  it("calls rollback when transaction is present", async () => {
    const rollback = jest.fn<any>().mockResolvedValue(undefined);
    await safeRollback({ rollback } as any, {
      req: buildReq(),
      functionName: "createDataset",
      fileName: "dataset.ctrl.ts",
      originatingError: new Error("DB constraint failed"),
    });
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(mockLogFailure).not.toHaveBeenCalled();
  });

  it("logs the rollback error + originating error when rollback fails", async () => {
    const rollback = jest.fn<any>().mockRejectedValue(new Error("rollback exploded"));
    await safeRollback({ rollback } as any, {
      req: buildReq(),
      functionName: "createDataset",
      fileName: "dataset.ctrl.ts",
      originatingError: new Error("DB constraint failed"),
    });

    expect(mockLogFailure).toHaveBeenCalledTimes(1);
    const call = mockLogFailure.mock.calls[0][0] as any;
    expect(call.functionName).toBe("createDataset");
    expect(call.fileName).toBe("dataset.ctrl.ts");
    expect(call.organizationId).toBe(99);
    expect(call.userId).toBe(7);
    expect(call.error).toBeInstanceOf(Error);
    expect(call.error.message).toBe("rollback exploded");
    // Description carries both contexts.
    expect(call.description).toContain("Transaction rollback failed");
    expect(call.description).toContain("createDataset");
    expect(call.description).toContain("POST /api/datasets");
    expect(call.description).toContain("DB constraint failed");
  });

  it("handles non-Error originating values gracefully", async () => {
    const rollback = jest.fn<any>().mockRejectedValue(new Error("rollback exploded"));
    await safeRollback({ rollback } as any, {
      req: buildReq(),
      functionName: "fn",
      fileName: "f.ts",
      originatingError: "string error",
    });

    const call = mockLogFailure.mock.calls[0][0] as any;
    expect(call.description).toContain("string error");
  });

  it("serializes object originating errors via JSON.stringify", async () => {
    const rollback = jest.fn<any>().mockRejectedValue(new Error("rollback exploded"));
    await safeRollback({ rollback } as any, {
      req: buildReq(),
      functionName: "fn",
      fileName: "f.ts",
      originatingError: { code: "P0001", detail: "x" },
    });
    const call = mockLogFailure.mock.calls[0][0] as any;
    expect(call.description).toContain('"code":"P0001"');
  });

  it("falls back to console.error when even logFailure throws", async () => {
    const rollback = jest.fn<any>().mockRejectedValue(new Error("rollback exploded"));
    mockLogFailure.mockRejectedValueOnce(new Error("logger down") as any);

    await safeRollback({ rollback } as any, {
      req: buildReq(),
      functionName: "fn",
      fileName: "f.ts",
      originatingError: new Error("orig"),
    });

    expect((console.error as jest.Mock).mock.calls[0][0]).toContain(
      "rollback AND logFailure failed",
    );
  });

  it("does NOT throw even when both rollback and logger throw", async () => {
    const rollback = jest.fn<any>().mockRejectedValue(new Error("rollback exploded"));
    mockLogFailure.mockRejectedValueOnce(new Error("logger down") as any);

    await expect(
      safeRollback({ rollback } as any, {
        req: buildReq(),
        functionName: "fn",
        fileName: "f.ts",
        originatingError: new Error("orig"),
      }),
    ).resolves.toBeUndefined();
  });

  it("uses req.url when originalUrl is missing", async () => {
    const rollback = jest.fn<any>().mockRejectedValue(new Error("rollback exploded"));
    await safeRollback({ rollback } as any, {
      req: buildReq({ originalUrl: undefined, url: "/api/fallback" }),
      functionName: "fn",
      fileName: "f.ts",
      originatingError: new Error("orig"),
    });
    const call = mockLogFailure.mock.calls[0][0] as any;
    expect(call.description).toContain("/api/fallback");
  });

  it("defaults userId to 0 when missing on req", async () => {
    const rollback = jest.fn<any>().mockRejectedValue(new Error("rollback exploded"));
    await safeRollback({ rollback } as any, {
      req: buildReq({ userId: undefined }),
      functionName: "fn",
      fileName: "f.ts",
      originatingError: new Error("orig"),
    });
    const call = mockLogFailure.mock.calls[0][0] as any;
    expect(call.userId).toBe(0);
  });
});
