/**
 * The worker of the vendor risk database: it takes the jobs one at a time. The load job loads the
 * bundles the release ships (loadBundled.ts), checks the records switch again, and adds the status
 * job of each list whose records changed status; the status job relabels the pending findings that
 * cite a list (Ruling 12 of the M2 plan). Nothing is downloaded.
 */
const mockWorkerOn = jest.fn();
// The load of every bundle: a test of the default sees that the job reaches it with the store.
const mockLoadBundledSources = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({})),
  Worker: jest.fn().mockImplementation(() => ({ on: mockWorkerOn })),
}));
jest.mock("../../../../database/redis", () => ({ REDIS_URL: "redis://localhost:6379" }));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../../utils/vrdb.utils", () => ({ marker: "the vrdb store" }));
jest.mock("../loadBundled", () => ({
  loadBundledSources: (...args: unknown[]) => mockLoadBundledSources(...args),
}));

import { Worker } from "bullmq";
import logger from "../../../../utils/logger/fileLogger";
import type { VendorResearchConfig } from "../../config";
import type { LoadResult } from "../loadBundled";
import { VrdbLoadFailed, createVrdbWorker, processVrdbJob } from "../worker";

const config = (overrides: Partial<VendorResearchConfig> = {}): VendorResearchConfig => ({
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
  ...overrides,
});

const loadJob = () => ({ name: "vrdb_load", data: {} });
const relabelJob = (data: unknown = { sourceId: "ofac" }) => ({ name: "vrdb_relabel", data });

const counts = (statusChanged: number) => ({ seen: 9, inserted: 1, updated: 1, statusChanged });

const loadOf = (results: LoadResult[]) => jest.fn().mockResolvedValue(results);

beforeEach(() => jest.clearAllMocks());

describe("the load job", () => {
  it("loads the bundles and gives what it did for each list", async () => {
    const results: LoadResult[] = [
      { sourceId: "kev", outcome: "ok", counts: counts(0) },
      { sourceId: "ofac", outcome: "unchanged" },
      { sourceId: "csl", outcome: "failed", errorCode: "bundle_missing" },
    ];
    const load = loadOf(results);
    const enqueueRelabel = jest.fn().mockResolvedValue(undefined);

    await expect(
      processVrdbJob(loadJob(), { config: config(), load, enqueueRelabel }),
    ).resolves.toEqual(results);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads with the database's store when no load is given", async () => {
    mockLoadBundledSources.mockResolvedValue([]);

    await expect(processVrdbJob(loadJob(), { config: config() })).resolves.toEqual([]);

    expect(mockLoadBundledSources).toHaveBeenCalledTimes(1);
    expect(mockLoadBundledSources.mock.calls[0][0].store.marker).toBe("the vrdb store");
  });

  it("does nothing while the records are off: the switch is read again when the job runs", async () => {
    const load = loadOf([]);
    const enqueueRelabel = jest.fn();

    await expect(
      processVrdbJob(loadJob(), { config: config({ records: false }), load, enqueueRelabel }),
    ).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(mockLoadBundledSources).not.toHaveBeenCalled();
    expect(enqueueRelabel).not.toHaveBeenCalled();
  });

  it("adds the status job of each list whose records changed status, and of no other", async () => {
    const load = loadOf([
      { sourceId: "kev", outcome: "ok", counts: counts(0) },
      { sourceId: "ofac", outcome: "ok", counts: counts(2) },
      { sourceId: "uk_sanctions", outcome: "unchanged" },
      { sourceId: "csl", outcome: "failed", errorCode: "load_failed" },
      { sourceId: "cve", outcome: "ok", counts: counts(1) },
    ]);
    const enqueueRelabel = jest.fn().mockResolvedValue(undefined);

    // csl failed in the database, so the job throws to be tried again, after the status jobs.
    await expect(
      processVrdbJob(loadJob(), { config: config(), load, enqueueRelabel }),
    ).rejects.toBeInstanceOf(VrdbLoadFailed);

    expect(enqueueRelabel.mock.calls).toEqual([["ofac"], ["cve"]]);
  });

  it("throws when the database failed to take a list, naming only the lists, so that BullMQ tries the job again", async () => {
    const load = loadOf([
      { sourceId: "kev", outcome: "ok", counts: counts(0) },
      { sourceId: "csl", outcome: "failed", errorCode: "load_failed" },
      { sourceId: "ofac", outcome: "failed", errorCode: "load_failed" },
    ]);

    const error = await processVrdbJob(loadJob(), { config: config(), load }).catch((e) => e);

    expect(error).toBeInstanceOf(VrdbLoadFailed);
    expect((error as VrdbLoadFailed).sourceIds).toEqual(["csl", "ofac"]);
    expect((error as Error).message).toBe("The load of csl, ofac failed");
  });

  it("does not throw for a list whose bundle is missing or unreadable: a retry reads the same file", async () => {
    const results: LoadResult[] = [
      { sourceId: "kev", outcome: "ok", counts: counts(0) },
      { sourceId: "eu_dg_comp", outcome: "failed", errorCode: "bundle_missing" },
      { sourceId: "csl", outcome: "failed", errorCode: "bundle_unreadable" },
    ];

    await expect(
      processVrdbJob(loadJob(), { config: config(), load: loadOf(results) }),
    ).resolves.toEqual(results);
  });

  it("logs a status job that cannot be added by the error's name, adds the others, and the load stands", async () => {
    const results: LoadResult[] = [
      { sourceId: "ofac", outcome: "ok", counts: counts(1) },
      { sourceId: "kev", outcome: "ok", counts: counts(3) },
    ];
    const load = loadOf(results);
    const enqueueRelabel = jest
      .fn()
      .mockRejectedValueOnce(new Error("Connection is closed. redis://secret@10.0.0.5"))
      .mockResolvedValueOnce(undefined);

    await expect(
      processVrdbJob(loadJob(), { config: config(), load, enqueueRelabel }),
    ).resolves.toEqual(results);

    expect(enqueueRelabel.mock.calls).toEqual([["ofac"], ["kev"]]);
    expect(logger.warn).toHaveBeenCalledWith(
      "vendor risk database: the status job of ofac could not be added (error Error)",
    );
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain("10.0.0.5");
  });

  it("throws what the load throws, so that BullMQ tries the job again", async () => {
    const load = jest.fn().mockRejectedValue(new Error("connection refused"));

    await expect(processVrdbJob(loadJob(), { config: config(), load })).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("the status job", () => {
  it("relabels the list it names and loads nothing", async () => {
    const relabel = jest.fn().mockResolvedValue({ relabeled: 3 });
    const load = loadOf([]);

    await expect(
      processVrdbJob(relabelJob(), { config: config(), load, relabel }),
    ).resolves.toEqual({ relabeled: 3 });
    expect(relabel).toHaveBeenCalledWith("ofac");
    expect(load).not.toHaveBeenCalled();
  });

  it("runs while the records are off: it reads the stored copies only", async () => {
    const relabel = jest.fn().mockResolvedValue({ relabeled: 1 });

    await expect(
      processVrdbJob(relabelJob({ sourceId: "gleif" }), {
        config: config({ records: false }),
        relabel,
      }),
    ).resolves.toEqual({ relabeled: 1 });
    expect(relabel).toHaveBeenCalledWith("gleif");
  });

  it.each([[{ sourceId: "hibp" }], [{ sourceId: "statuspage" }], [{}], [null], ["kev"]])(
    "a status job that names no list of the vendor risk database throws: %p",
    async (data) => {
      const relabel = jest.fn().mockResolvedValue({ relabeled: 0 });

      await expect(processVrdbJob(relabelJob(data), { config: config(), relabel })).rejects.toThrow(
        "The job names no list of the vendor risk database",
      );
      expect(relabel).not.toHaveBeenCalled();
    },
  );
});

describe("another job", () => {
  it.each([["vendor_research"], ["vrdb_sync"]])(
    "throws for a job name the worker does not know: %s",
    async (name) => {
      const load = loadOf([]);
      const relabel = jest.fn();

      await expect(
        processVrdbJob({ name, data: { sourceId: "kev" } }, { config: config(), load, relabel }),
      ).rejects.toThrow(`Unknown job: ${name}`);
      expect(load).not.toHaveBeenCalled();
      expect(relabel).not.toHaveBeenCalled();
    },
  );
});

describe("createVrdbWorker", () => {
  const failedHandler = () =>
    mockWorkerOn.mock.calls.find(([event]) => event === "failed")?.[1] as (
      job: unknown,
      error: Error,
    ) => void;

  it("takes the jobs of the VRDB queue one at a time, on the Redis of the application", () => {
    createVrdbWorker();

    expect(Worker).toHaveBeenCalledTimes(1);
    expect((Worker as unknown as jest.Mock).mock.calls[0][0]).toBe("vendor-risk-database");
    expect((Worker as unknown as jest.Mock).mock.calls[0][2]).toEqual({
      connection: { url: "redis://localhost:6379" },
      concurrency: 1,
    });
  });

  it("logs a failed job by its id and the name of its error, never its message", () => {
    // A database's message can carry the values of a query or the database's address.
    createVrdbWorker();
    const error = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    error.name = "SequelizeConnectionRefusedError";

    failedHandler()({ id: "vrdb_relabel_ofac" }, error);

    expect(logger.error).toHaveBeenCalledWith(
      "vendor risk database job vrdb_relabel_ofac failed: SequelizeConnectionRefusedError",
    );
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain("10.0.0.5");
  });

  it("logs a failed load by the lists it names", () => {
    createVrdbWorker();

    failedHandler()({ id: "7" }, new VrdbLoadFailed(["csl", "ofac"]));

    expect(logger.error).toHaveBeenCalledWith(
      "vendor risk database job 7 failed: The load of csl, ofac failed",
    );
  });

  it("logs an error whose name is not a plain identifier as unknown", () => {
    createVrdbWorker();
    const error = new Error("boom");
    error.name = "name with spaces 10.0.0.5";

    failedHandler()({ id: "1" }, error);

    expect(logger.error).toHaveBeenCalledWith("vendor risk database job 1 failed: unknown");
  });
});
