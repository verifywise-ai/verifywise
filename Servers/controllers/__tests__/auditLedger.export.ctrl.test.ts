import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { EventEmitter } from "events";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/auditLedgerExport.utils", () => ({
  ...(jest.requireActual("../../utils/auditLedgerExport.utils") as object),
  fetchAuditLedgerBatch: jest.fn(),
}));
jest.mock("../../utils/auditLedger.utils", () => ({
  verifyChain: jest.fn(),
  appendToAuditLedger: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn<any>(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, err: any) => (err as Error).message),
}));

import { exportAuditLedger, getAuditLedger, verifyAuditLedger } from "../auditLedger.ctrl";
import { sequelize } from "../../database/db";
import { fetchAuditLedgerBatch } from "../../utils/auditLedgerExport.utils";
import { appendToAuditLedger, verifyChain } from "../../utils/auditLedger.utils";

const fetchBatch = fetchAuditLedgerBatch as jest.MockedFunction<any>;
const appendLedger = appendToAuditLedger as jest.MockedFunction<any>;

const makeRows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: from + i,
    occurred_at: new Date("2026-10-11T00:00:00.000Z"),
    user_id: 1,
    user_name: "A",
    user_surname: "B",
    entry_type: "event_log",
    event_type: "Read",
    action: null,
    entity_type: "x",
    entity_id: null,
    field_name: null,
    old_value: null,
    new_value: null,
    description: "d",
    entry_hash: "h",
    prev_hash: "p",
  }));

function createReq(query: Record<string, any> = {}): any {
  const req: any = new EventEmitter();
  Object.assign(req, { userId: 5, organizationId: 2, query });
  return req;
}

function createRes(writeReturns: boolean | (() => boolean) = true): any {
  const res: any = new EventEmitter();
  res.headers = {} as Record<string, string>;
  res.chunks = [] as string[];
  res.headersSent = false;
  res.writableFinished = false;
  res.setHeader = jest.fn((k: string, v: string) => {
    res.headers[k] = v;
  });
  res.write = jest.fn((chunk: string) => {
    res.headersSent = true;
    res.chunks.push(chunk);
    return typeof writeReturns === "function" ? writeReturns() : writeReturns;
  });
  res.end = jest.fn(() => {
    res.writableFinished = true;
  });
  res.destroy = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const flush = () => new Promise((r) => setImmediate(r));

describe("auditLedger.ctrl - exportAuditLedger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appendLedger.mockResolvedValue(undefined);
  });

  it("sets CSV headers and writes the BOM and header row", async () => {
    fetchBatch.mockResolvedValueOnce([]);
    const res = createRes();
    await exportAuditLedger(createReq(), res);

    expect(res.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["Content-Disposition"]).toMatch(
      /^attachment; filename="audit-ledger-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers["Access-Control-Expose-Headers"]).toBe("Content-Disposition");
    expect(res.chunks[0].startsWith('\uFEFF"id","occurred_at"')).toBe(true);
    expect(res.chunks[0].endsWith('"prev_hash"\r\n')).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  it("passes filters and pages by keyset across batches", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1000)).mockResolvedValueOnce(makeRows(1001, 3));
    const res = createRes();
    await exportAuditLedger(createReq({ entity_type: "vendor", entry_type: "event_log" }), res);

    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(fetchBatch).toHaveBeenNthCalledWith(
      1,
      2,
      { entityType: "vendor", entryType: "event_log" },
      0,
    );
    expect(fetchBatch).toHaveBeenNthCalledWith(
      2,
      2,
      { entityType: "vendor", entryType: "event_log" },
      1000,
    );
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid entry_type with 400 and runs no query", async () => {
    const res = createRes();
    await exportAuditLedger(createReq({ entry_type: "bogus" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetchBatch).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });

  it("returns 500 JSON when the first batch fails", async () => {
    fetchBatch.mockRejectedValueOnce(new Error("db down"));
    const res = createRes();
    // headers were set but nothing written yet, so headersSent stays false
    res.write = jest.fn(() => true);
    await exportAuditLedger(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
    expect(res.destroy).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it("destroys the response when a later batch fails", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1000)).mockRejectedValueOnce(new Error("boom"));
    const res = createRes();
    await exportAuditLedger(createReq(), res);
    expect(res.destroy).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
    expect(appendLedger).not.toHaveBeenCalled();
  });

  it("writes one self-audit entry with the row count after end", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1000)).mockResolvedValueOnce(makeRows(1001, 3));
    const res = createRes();
    await exportAuditLedger(createReq({ entity_type: "vendor" }), res);
    await flush();
    expect(appendLedger).toHaveBeenCalledTimes(1);
    const arg = appendLedger.mock.calls[0][0];
    expect(arg).toMatchObject({
      organizationId: 2,
      entryType: "event_log",
      userId: 5,
      eventType: "Read",
      entityType: "audit_ledger",
    });
    expect(arg.description).toContain("Exported 1003 audit ledger entries");
    expect(arg.description).toContain("vendor");
    expect(res.end.mock.invocationCallOrder[0]).toBeLessThan(
      appendLedger.mock.invocationCallOrder[0],
    );
  });

  it("does not throw when the self-audit fails", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 2));
    appendLedger.mockRejectedValueOnce(new Error("ledger down"));
    const res = createRes();
    await expect(exportAuditLedger(createReq(), res)).resolves.not.toThrow();
    await flush();
    expect(res.destroy).not.toHaveBeenCalled();
  });

  it("stops fetching and skips the self-audit when the response closes", async () => {
    let resolveSecond: (v: any[]) => void = () => {};
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1000)).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveSecond = r;
        }),
    );
    const res = createRes();
    const done = exportAuditLedger(createReq(), res);
    await flush();
    res.emit("close");
    resolveSecond(makeRows(1001, 1000));
    await done;
    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(res.end).not.toHaveBeenCalled();
    expect(appendLedger).not.toHaveBeenCalled();
  });

  it("is not stopped by the request emitting close", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1000)).mockResolvedValueOnce(makeRows(1001, 2));
    const req = createReq();
    const res = createRes();
    const done = exportAuditLedger(req, res);
    req.emit("close");
    await done;
    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(res.end).toHaveBeenCalled();
  });

  it("waits for drain when write returns false", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1000)).mockResolvedValueOnce(makeRows(1001, 1));
    const res = createRes(false);
    const done = exportAuditLedger(createReq(), res);
    await flush();
    await flush();
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
    // release every pending drain wait until the export finishes
    const pump = setInterval(() => res.emit("drain"), 5);
    await done;
    clearInterval(pump);
    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(res.end).toHaveBeenCalled();
    // each drain wait removed its close listener; only the export's own remains
    expect(res.listenerCount("drain")).toBe(0);
    expect(res.listenerCount("close")).toBe(1);
  });

  it("ends the loop without hanging when close arrives instead of drain", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1000));
    const res = createRes(false);
    const done = exportAuditLedger(createReq(), res);
    await flush();
    await flush();
    res.emit("close");
    await done;
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
    expect(appendLedger).not.toHaveBeenCalled();
    expect(res.listenerCount("drain")).toBe(0);
  });

  it("writes nothing when the client leaves during the first batch", async () => {
    let resolveFirst: (v: any[]) => void = () => {};
    fetchBatch.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveFirst = r;
        }),
    );
    const res = createRes();
    const done = exportAuditLedger(createReq(), res);
    await flush();
    res.emit("close");
    resolveFirst(makeRows(1, 1000));
    await done;
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(res.write).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it("treats a repeated filter param as no filter", async () => {
    fetchBatch.mockResolvedValueOnce(makeRows(1, 1));
    await exportAuditLedger(createReq({ entity_type: ["vendor", "policy"] }), createRes());
    expect(fetchBatch).toHaveBeenCalledWith(2, { entityType: "", entryType: "" }, 0);
  });
});

describe("getAuditLedger", () => {
  it("rejects an invalid entry_type with 400, like the export", async () => {
    const res = createRes();
    await getAuditLedger(createReq({ entry_type: "nope" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  // The ledger is hash-chained, so rows written before write-time redaction
  // cannot be rewritten; they are redacted on the way out instead.
  it("redacts secrets in descriptions it returns", async () => {
    const query = sequelize.query as unknown as jest.MockedFunction<any>;
    query.mockResolvedValueOnce([{ count: "1" }]).mockResolvedValueOnce([
      {
        ...makeRows(1, 1)[0],
        description: "failed: password=hunter2",
        old_value: "token=abc",
        new_value: "plain",
      },
    ]);
    const res = createRes();
    await getAuditLedger(createReq(), res);
    const { entries } = res.json.mock.calls[0][0].data;
    expect(entries[0].description).toBe("failed: password=[REDACTED]");
    expect(entries[0].old_value).toBe("token=[REDACTED]");
    expect(entries[0].new_value).toBe("plain");
  });
});

// The export is the verifiable copy kept before retention cleanup, so it
// carries the stored text and every row still matches its entry_hash.
describe("exportAuditLedger stored text", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appendLedger.mockResolvedValue(undefined);
  });

  it("exports descriptions as stored", async () => {
    fetchBatch.mockResolvedValueOnce([
      { ...makeRows(1, 1)[0], description: "failed: client_secret=abc123" },
    ]);
    const res = createRes();
    await exportAuditLedger(createReq(), res);
    await flush();
    expect(res.chunks.join("")).toContain("client_secret=abc123");
  });
});

describe("verifyAuditLedger", () => {
  it("returns the chain result with prunedThrough as is", async () => {
    const result = {
      status: "intact",
      totalEntries: 4,
      prunedThrough: { id: 20, cutoff: "2025-01-01T00:00:00.000Z" },
    };
    (verifyChain as jest.MockedFunction<any>).mockResolvedValueOnce(result);
    const res = createRes();
    await verifyAuditLedger(createReq(), res);
    expect(verifyChain).toHaveBeenCalledWith(2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "OK", data: result });
  });
});
