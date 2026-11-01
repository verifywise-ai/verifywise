/**
 * The worker of the vendor risk database (spec D4.7): it takes the sync jobs one at a time, checks
 * the records switch again (the database has no flag of its own), and throws for a failed sync so
 * that BullMQ retries it; a sync that changed a status adds the status job of its list, which
 * relabels the pending findings that cite it (Ruling 12 of the M2 plan).
 */
const mockWorkerOn = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({})),
  Worker: jest.fn().mockImplementation(() => ({ on: mockWorkerOn })),
  // BullMQ's own: a job that throws it is not tried again.
  UnrecoverableError: jest.requireActual("bullmq").UnrecoverableError,
}));
jest.mock("../../../../database/redis", () => ({ REDIS_URL: "redis://localhost:6379" }));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../../utils/vrdb.utils", () => ({}));

import { UnrecoverableError, Worker } from "bullmq";
import logger from "../../../../utils/logger/fileLogger";
import type { VendorResearchConfig } from "../../config";
import type { SyncResult } from "../sync";
import { VrdbSyncFailed, VrdbSyncNotRetried, createVrdbWorker, processVrdbJob } from "../worker";

const config = (overrides: Partial<VendorResearchConfig> = {}): VendorResearchConfig => ({
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
  ...overrides,
});

const syncJob = (data: unknown = { sourceId: "kev" }, name = "vrdb_sync") => ({ name, data });

const syncOf = (result: SyncResult) => jest.fn().mockResolvedValue(result);

beforeEach(() => jest.clearAllMocks());

describe("processVrdbJob", () => {
  it("the job syncs with no flag set: the database is on unless the records are off", async () => {
    const sync = syncOf({ outcome: "ok" });

    await expect(processVrdbJob(syncJob(), { config: config(), sync })).resolves.toEqual({
      outcome: "ok",
    });
    expect(sync).toHaveBeenCalledWith("kev");
  });

  it("the job does nothing while the records are off", async () => {
    const sync = syncOf({ outcome: "ok" });

    await expect(
      processVrdbJob(syncJob(), { config: config({ records: false }), sync }),
    ).resolves.toBe(null);
    expect(sync).not.toHaveBeenCalled();
  });

  it.each([["un_sanctions"]])(
    "the job of a list behind a closed gate does nothing: %s",
    async (sourceId) => {
      const sync = syncOf({ outcome: "ok" });

      await expect(processVrdbJob(syncJob({ sourceId }), { config: config(), sync })).resolves.toBe(
        null,
      );
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it("the job of the CVE records syncs, now that Q7 is open", async () => {
    const result: SyncResult = {
      outcome: "ok",
      counts: { seen: 393, inserted: 12, updated: 4, statusChanged: 0 },
    };
    const sync = syncOf(result);

    await expect(
      processVrdbJob(syncJob({ sourceId: "cve" }), { config: config(), sync }),
    ).resolves.toEqual(result);
    expect(sync).toHaveBeenCalledWith("cve");
  });

  it("the job syncs its source", async () => {
    const result: SyncResult = {
      outcome: "ok",
      counts: { seen: 3, inserted: 1, updated: 0, statusChanged: 0 },
    };
    const sync = syncOf(result);

    await expect(
      processVrdbJob(syncJob({ sourceId: "uk_sanctions" }), { config: config(), sync }),
    ).resolves.toEqual(result);
    expect(sync).toHaveBeenCalledWith("uk_sanctions");
  });

  it.each([["fetch_failed"], ["unexpected"]] as const)(
    "a sync that failed on the way (%s) throws, so that BullMQ retries",
    async (errorCode) => {
      const sync = syncOf({ outcome: "failed", errorCode });

      const failed = processVrdbJob(syncJob(), { config: config(), sync });

      // Of its own class, which the worker logs by its fixed text (createVrdbWorker).
      await expect(failed).rejects.toThrow(VrdbSyncFailed);
      await expect(failed).rejects.toThrow(`The sync of kev failed (${errorCode})`);
      await expect(failed).rejects.not.toBeInstanceOf(UnrecoverableError);
    },
  );

  it.each([
    ["wrong_root"],
    ["parse_errors"],
    ["empty"],
    ["shrank"],
    ["too_large"],
    ["feed_without_file"],
    ["no_baseline"],
  ] as const)(
    "a sync that was refused (%s) is not retried: a retry within minutes would meet the same refusal",
    async (errorCode) => {
      const sync = syncOf({ outcome: "failed", errorCode });

      const failed = processVrdbJob(syncJob(), { config: config(), sync });

      await expect(failed).rejects.toBeInstanceOf(UnrecoverableError);
      await expect(failed).rejects.toThrow(VrdbSyncNotRetried);
      await expect(failed).rejects.toThrow(`The sync of kev failed (${errorCode})`);
    },
  );

  it("a sync whose answer asked for a wait is not retried by the job, which would ask sooner", async () => {
    const sync = syncOf({ outcome: "failed", errorCode: "fetch_failed", retryAfterMs: 120_000 });

    const failed = processVrdbJob(syncJob(), { config: config(), sync });

    // The list's next scheduled sync, hours later, asks again.
    await expect(failed).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(failed).rejects.toThrow("The sync of kev failed (fetch_failed)");
  });

  it("an unchanged sync does not throw", async () => {
    const sync = syncOf({ outcome: "unchanged" });

    await expect(processVrdbJob(syncJob(), { config: config(), sync })).resolves.toEqual({
      outcome: "unchanged",
    });
  });

  it("an unknown job name throws", async () => {
    const sync = syncOf({ outcome: "ok" });

    await expect(
      processVrdbJob(syncJob({ sourceId: "kev" }, "vendor_research"), { config: config(), sync }),
    ).rejects.toThrow("Unknown job: vendor_research");
    expect(sync).not.toHaveBeenCalled();
  });

  it.each([[{ sourceId: "hibp" }], [{ sourceId: "statuspage" }], [{}], [null], ["kev"]])(
    "a source id that is not a VRDB id throws: %p",
    async (data) => {
      const sync = syncOf({ outcome: "ok" });

      await expect(processVrdbJob(syncJob(data), { config: config(), sync })).rejects.toThrow(
        "The job names no list of the vendor risk database",
      );
      expect(sync).not.toHaveBeenCalled();
    },
  );
});

describe("the status job", () => {
  const relabelJob = (data: unknown = { sourceId: "ofac" }) => syncJob(data, "vrdb_relabel");

  it("a sync that changed statuses adds a relabel job", async () => {
    const enqueueRelabel = jest.fn().mockResolvedValue(undefined);
    const changed = syncOf({
      outcome: "ok",
      counts: { seen: 9, inserted: 0, updated: 1, statusChanged: 2 },
    });

    await processVrdbJob(syncJob({ sourceId: "ofac" }), {
      config: config(),
      sync: changed,
      enqueueRelabel,
    });

    expect(enqueueRelabel).toHaveBeenCalledTimes(1);
    expect(enqueueRelabel).toHaveBeenCalledWith("ofac");
  });

  it("a sync that changed no status adds none", async () => {
    const enqueueRelabel = jest.fn().mockResolvedValue(undefined);

    for (const result of [
      { outcome: "ok", counts: { seen: 9, inserted: 2, updated: 1, statusChanged: 0 } },
      { outcome: "unchanged" },
    ] as SyncResult[]) {
      await processVrdbJob(syncJob(), { config: config(), sync: syncOf(result), enqueueRelabel });
    }

    expect(enqueueRelabel).not.toHaveBeenCalled();
  });

  it("a failed sync that applied days with changes adds a relabel job, then throws", async () => {
    // A list read by its changes keeps the days it applied before the one that failed (sync.ts).
    const enqueueRelabel = jest.fn().mockResolvedValue(undefined);
    const partly = syncOf({
      outcome: "failed",
      errorCode: "fetch_failed",
      counts: { seen: 4, inserted: 1, updated: 1, statusChanged: 1 },
    });

    await expect(
      processVrdbJob(syncJob({ sourceId: "kev" }), {
        config: config(),
        sync: partly,
        enqueueRelabel,
      }),
    ).rejects.toThrow("The sync of kev failed (fetch_failed)");
    expect(enqueueRelabel).toHaveBeenCalledWith("kev");
  });

  it("a status job that cannot be added is logged, and the sync stands", async () => {
    const enqueueRelabel = jest.fn().mockRejectedValue(new Error("Connection is closed."));
    const result: SyncResult = {
      outcome: "ok",
      counts: { seen: 9, inserted: 0, updated: 0, statusChanged: 1 },
    };

    await expect(
      processVrdbJob(syncJob({ sourceId: "ofac" }), {
        config: config(),
        sync: syncOf(result),
        enqueueRelabel,
      }),
    ).resolves.toEqual(result);
    expect(logger.warn).toHaveBeenCalledWith(
      "vendor risk database: the status job of ofac could not be added (error Error)",
    );
  });

  it("the relabel job relabels", async () => {
    const relabel = jest.fn().mockResolvedValue({ relabeled: 3 });
    const sync = syncOf({ outcome: "ok" });

    await expect(
      processVrdbJob(relabelJob(), { config: config(), sync, relabel }),
    ).resolves.toEqual({ relabeled: 3 });
    expect(relabel).toHaveBeenCalledWith("ofac");
    expect(sync).not.toHaveBeenCalled();

    // The job reads the copies only: it runs while the records are off, as the findings it
    // relabels are stored.
    await expect(
      processVrdbJob(relabelJob(), { config: config({ records: false }), relabel }),
    ).resolves.toEqual({ relabeled: 3 });
  });

  it.each([[{ sourceId: "hibp" }], [{}], [null]])(
    "a relabel job that names no list of the vendor risk database throws: %p",
    async (data) => {
      const relabel = jest.fn().mockResolvedValue({ relabeled: 0 });

      await expect(processVrdbJob(relabelJob(data), { config: config(), relabel })).rejects.toThrow(
        "The job names no list of the vendor risk database",
      );
      expect(relabel).not.toHaveBeenCalled();
    },
  );
});

describe("createVrdbWorker", () => {
  it("takes the jobs of the VRDB queue one at a time, on the Redis of the application", () => {
    createVrdbWorker();

    expect(Worker).toHaveBeenCalledTimes(1);
    expect((Worker as unknown as jest.Mock).mock.calls[0][0]).toBe("vendor-risk-database");
    expect((Worker as unknown as jest.Mock).mock.calls[0][2]).toEqual({
      connection: { url: "redis://localhost:6379" },
      concurrency: 1,
    });
  });

  it("logs a failed job by its id and the fixed text of its error", () => {
    createVrdbWorker();
    const failed = mockWorkerOn.mock.calls.find(([event]) => event === "failed")?.[1] as (
      job: unknown,
      error: Error,
    ) => void;

    failed({ id: "repeat:vrdb_sync_kev:1" }, new VrdbSyncFailed("kev", "fetch_failed"));

    expect(logger.error).toHaveBeenCalledWith(
      "vendor risk database job repeat:vrdb_sync_kev:1 failed: The sync of kev failed (fetch_failed)",
    );
  });

  it("logs a sync that is not retried by its fixed text too", () => {
    createVrdbWorker();
    const failed = mockWorkerOn.mock.calls.find(([event]) => event === "failed")?.[1] as (
      job: unknown,
      error: Error,
    ) => void;

    failed(
      { id: "repeat:vrdb_sync_uk_sanctions:1" },
      new VrdbSyncNotRetried("uk_sanctions", "shrank"),
    );

    expect(logger.error).toHaveBeenCalledWith(
      "vendor risk database job repeat:vrdb_sync_uk_sanctions:1 failed: The sync of uk_sanctions failed (shrank)",
    );
  });

  it("logs the name of any other error, never its message", () => {
    // The status job throws what the database throws, and a database's message can carry the
    // values of a query or the database's address.
    createVrdbWorker();
    const failed = mockWorkerOn.mock.calls.find(([event]) => event === "failed")?.[1] as (
      job: unknown,
      error: Error,
    ) => void;
    const error = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    error.name = "SequelizeConnectionRefusedError";

    failed({ id: "vrdb_relabel_ofac" }, error);

    expect(logger.error).toHaveBeenCalledWith(
      "vendor risk database job vrdb_relabel_ofac failed: SequelizeConnectionRefusedError",
    );
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain("10.0.0.5");
  });
});
