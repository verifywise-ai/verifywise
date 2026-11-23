/**
 * Starts that come at the same moment. The checks of a start (the active run, the cooldown, the
 * daily cap) and the insert of its run are separate statements, so they run under the
 * organization's start lock (`withRunStartLockQuery`). Here the queries share one in-memory table
 * and each waits a tick, as a pooled query does, and the lock is a mutex per organization, as
 * `pg_advisory_xact_lock` is: the test shows that every check and the insert sit inside the lock.
 * It does not prove the Postgres lock itself; utils/__tests__/vendorResearch.startLock.test.ts
 * checks the statement that takes it.
 */
jest.mock("../config", () => ({ getVendorResearchConfig: jest.fn() }));
jest.mock("../../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../../../utils/llmKey.utils", () => ({ getLLMKeysQuery: jest.fn() }));
jest.mock("../../../utils/vendorResearch.utils", () => ({
  STALE_RUN_MINUTES: 15,
  countRunsSinceQuery: jest.fn(),
  createRunQuery: jest.fn(),
  failStaleRunsQuery: jest.fn(),
  finishRunQuery: jest.fn(),
  getActiveRunQuery: jest.fn(),
  getLastRunCreatedAtQuery: jest.fn(),
  withRunStartLockQuery: jest.fn(),
}));
// The real module opens a BullMQ queue as soon as it is imported.
jest.mock("../queue", () => ({ enqueueVendorResearch: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { getLLMKeysQuery } from "../../../utils/llmKey.utils";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import {
  countRunsSinceQuery,
  createRunQuery,
  failStaleRunsQuery,
  getActiveRunQuery,
  getLastRunCreatedAtQuery,
  withRunStartLockQuery,
} from "../../../utils/vendorResearch.utils";
import { getVendorResearchConfig } from "../config";
import { enqueueVendorResearch } from "../queue";
import { StartResearchResult, startVendorResearch } from "../trigger";

type AnyMock = jest.Mock<any, any[]>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

const ORG = 3;

interface Row {
  id: number;
  vendorId: number;
  status: "queued" | "running" | "completed";
  createdAt: Date;
}

let rows: Row[];
let nextId: number;

/** One turn of the event loop, the time a pooled query takes at least. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

const isActive = (row: Row) => row.status === "queued" || row.status === "running";

const runOf = (row: Row) => ({ id: row.id, vendor_id: row.vendorId, status: row.status });

/** The organization's start lock as Postgres keeps it: one holder at a time, the others wait. */
function mutexPerOrganization() {
  const tails = new Map<number, Promise<unknown>>();
  return (organizationId: number, work: (transaction: unknown) => Promise<unknown>) => {
    const before = tails.get(organizationId) ?? Promise.resolve();
    const held = before.then(() => work({ organizationId }));
    tails.set(
      organizationId,
      held.catch(() => undefined),
    );
    return held;
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  rows = [];
  nextId = 1;
  asMock(getVendorResearchConfig).mockReturnValue({
    autoRun: true,
    manualCooldownMinutes: 10,
    dailyRunCap: 50,
    workerConcurrency: 5,
    headless: false,
    records: true,
  });
  asMock(getVendorByIdQuery).mockImplementation(async (vendorId: number) => ({ id: vendorId }));
  asMock(getLLMKeysQuery).mockResolvedValue([{ id: 1 }]);
  asMock(failStaleRunsQuery).mockResolvedValue(0);
  asMock(getActiveRunQuery).mockImplementation(async (_org: number, vendorId: number) => {
    await tick();
    const row = rows.find((candidate) => candidate.vendorId === vendorId && isActive(candidate));
    return row ? runOf(row) : null;
  });
  asMock(getLastRunCreatedAtQuery).mockImplementation(async (_org: number, vendorId: number) => {
    await tick();
    const times = rows.filter((row) => row.vendorId === vendorId).map((row) => row.createdAt);
    return times.length === 0 ? null : new Date(Math.max(...times.map(Number)));
  });
  asMock(countRunsSinceQuery).mockImplementation(async () => {
    await tick();
    return rows.length;
  });
  // The insert takes two ticks, and refuses a second active run of a vendor as the unique index does.
  asMock(createRunQuery).mockImplementation(async (input: { vendorId: number }) => {
    await tick();
    await tick();
    if (rows.some((row) => row.vendorId === input.vendorId && isActive(row))) {
      throw Object.assign(new Error("duplicate key"), { parent: { code: "23505" } });
    }
    const row: Row = {
      id: nextId++,
      vendorId: input.vendorId,
      status: "queued",
      createdAt: new Date(),
    };
    rows.push(row);
    return runOf(row);
  });
  asMock(enqueueVendorResearch).mockResolvedValue(undefined);
  asMock(withRunStartLockQuery).mockImplementation(mutexPerOrganization());
});

const startFor = (vendorId: number, triggerType: "manual" | "auto" = "manual") =>
  startVendorResearch({ organizationId: ORG, vendorId, triggerType, requestedBy: 5 });

const outcome = (result: StartResearchResult) =>
  result.ok ? (result.alreadyRunning ? "already_running" : "created") : result.error.code;

describe("starts at the same moment", () => {
  it("never take the organization over its daily cap, whatever the number of vendors", async () => {
    // 49 runs of other vendors in the last day, finished, and a cap of 50.
    for (let index = 0; index < 49; index += 1) {
      rows.push({
        id: nextId++,
        vendorId: 1000 + index,
        status: "completed",
        createdAt: new Date(0),
      });
    }

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) => startFor(index + 1, "auto")),
    );

    expect(results.map(outcome).filter((code) => code === "created")).toHaveLength(1);
    expect(results.map(outcome).filter((code) => code === "daily_cap")).toHaveLength(9);
    expect(rows).toHaveLength(50);
    expect(enqueueVendorResearch).toHaveBeenCalledTimes(1);
  });

  it("of one vendor give the second start the run of the first, not a cooldown", async () => {
    // The worst order without the lock: the second start's read of the last run comes after the
    // first start's insert (READ COMMITTED lets it see that row), while its check of the active run
    // came before. A read that waits for a row stops waiting after 50 ticks, so it never hangs.
    let lastRunReads = 0;
    asMock(getLastRunCreatedAtQuery).mockImplementation(async (_org: number, vendorId: number) => {
      lastRunReads += 1;
      if (lastRunReads > 1) {
        for (let turn = 0; turn < 50 && rows.length === 0; turn += 1) await tick();
      }
      await tick();
      const times = rows.filter((row) => row.vendorId === vendorId).map((row) => row.createdAt);
      return times.length === 0 ? null : new Date(Math.max(...times.map(Number)));
    });

    const [first, second] = await Promise.all([startFor(7), startFor(7)]);

    expect(outcome(first)).toBe("created");
    expect(second).toEqual({
      ok: true,
      run: expect.objectContaining({ id: (first as { run: { id: number } }).run.id }),
      alreadyRunning: true,
    });
    expect(rows).toHaveLength(1);
    expect(enqueueVendorResearch).toHaveBeenCalledTimes(1);
  });

  it("take the lock of their own organization once each, and queue the job after it is released", async () => {
    const order: string[] = [];
    const lock = mutexPerOrganization();
    asMock(withRunStartLockQuery).mockImplementation(
      async (organizationId: number, work: (transaction: unknown) => Promise<unknown>) => {
        const answer = await lock(organizationId, work);
        order.push("released");
        return answer;
      },
    );
    asMock(enqueueVendorResearch).mockImplementation(async () => {
      order.push("queued");
    });

    await startFor(7);

    expect(withRunStartLockQuery).toHaveBeenCalledTimes(1);
    expect(asMock(withRunStartLockQuery).mock.calls[0][0]).toBe(ORG);
    expect(order).toEqual(["released", "queued"]);
  });
});
