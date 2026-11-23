/**
 * The queue of the vendor risk database: one queue of its own, the load of the bundled lists queued
 * once at start while the records are on, and the status job of a list. The per-list sync
 * schedulers of earlier builds are removed at every start, whatever the switch says.
 */
const mockUpsertJobScheduler = jest.fn();
const mockRemoveJobScheduler = jest.fn();
const mockObliterate = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
    obliterate: mockObliterate,
  })),
  Worker: jest.fn(),
}));
jest.mock("../../../../database/redis", () => ({ REDIS_URL: "redis://localhost:6379" }));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { Queue } from "bullmq";
import { VRDB_SOURCE_IDS } from "../../../../domain.layer/interfaces/i.vendorResearch";
import type { VendorResearchConfig } from "../../config";
import {
  VRDB_JOB_OPTIONS,
  VRDB_LOAD_DEDUPLICATION_ID,
  VRDB_LOAD_JOB,
  VRDB_QUEUE,
  VRDB_RELABEL_JOB,
  enqueueRelabel,
  legacySyncSchedulerId,
  scheduleVendorRiskDatabaseLoad,
  vrdbRecordsOn,
} from "../queue";

const config = (overrides: Partial<VendorResearchConfig> = {}): VendorResearchConfig => ({
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
  ...overrides,
});

const fakeQueue = () => ({
  removeJobScheduler: jest.fn().mockResolvedValue(true),
  add: jest.fn().mockResolvedValue(undefined),
});

describe("the queue of the vendor risk database", () => {
  it("is a queue of its own, on the Redis of the application, with its two job names", () => {
    expect(VRDB_QUEUE).toBe("vendor-risk-database");
    expect(VRDB_LOAD_JOB).toBe("vrdb_load");
    expect(VRDB_RELABEL_JOB).toBe("vrdb_relabel");
    expect((Queue as unknown as jest.Mock).mock.calls).toEqual([
      ["vendor-risk-database", { connection: { url: "redis://localhost:6379" } }],
    ]);
  });

  it("retries a failed job three times, a minute apart and more, and keeps no settled job", () => {
    // A settled job that stayed would keep its deduplication, and BullMQ would add no later one.
    expect(VRDB_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  });

  it("names the scheduler of an earlier build after its list, as those builds did", () => {
    expect(legacySyncSchedulerId("kev")).toBe("vrdb_sync_kev");
    expect(legacySyncSchedulerId("nl_algoritmeregister")).toBe("vrdb_sync_nl_algoritmeregister");
    for (const id of VRDB_SOURCE_IDS) expect(legacySyncSchedulerId(id)).not.toContain(":");
  });
});

describe("enqueueRelabel", () => {
  it("adds the status job of a list, deduplicated per list by an id without a colon (Ruling 12)", async () => {
    const queue = fakeQueue();

    await enqueueRelabel("ofac", queue);
    await enqueueRelabel("cve", queue);

    expect(queue.add.mock.calls).toEqual([
      [
        "vrdb_relabel",
        { sourceId: "ofac" },
        {
          ...VRDB_JOB_OPTIONS,
          deduplication: { id: "vrdb_relabel_ofac", keepLastIfActive: true },
        },
      ],
      [
        "vrdb_relabel",
        { sourceId: "cve" },
        {
          ...VRDB_JOB_OPTIONS,
          deduplication: { id: "vrdb_relabel_cve", keepLastIfActive: true },
        },
      ],
    ]);
  });

  it("keeps a change that lands while the status job of its list runs: no fixed job id, the next job kept", async () => {
    // BullMQ drops an add whose job id exists, the running job's included, before it looks at the
    // deduplication; with `keepLastIfActive` an add during the run is queued when the run ends.
    const queue = fakeQueue();

    await enqueueRelabel("kev", queue);

    const [, , opts] = queue.add.mock.calls[0];
    expect(opts.jobId).toBeUndefined();
    expect(opts.deduplication).toEqual({ id: "vrdb_relabel_kev", keepLastIfActive: true });
    // A deduplication with a time to live would end it while the job still runs.
    expect(opts.deduplication.ttl).toBeUndefined();
  });
});

describe("vrdbRecordsOn", () => {
  it("is the records switch and nothing else", () => {
    expect(vrdbRecordsOn(config())).toBe(true);
    expect(vrdbRecordsOn({ records: true })).toBe(true);
    expect(vrdbRecordsOn(config({ records: false }))).toBe(false);
    expect(vrdbRecordsOn({ records: false })).toBe(false);
  });
});

describe("scheduleVendorRiskDatabaseLoad", () => {
  it("removes the sync scheduler of every list an earlier build may have registered, read-through ones included", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseLoad(config(), queue);

    expect(queue.removeJobScheduler.mock.calls).toEqual(
      VRDB_SOURCE_IDS.map((id) => [`vrdb_sync_${id}`]),
    );
    expect(queue.removeJobScheduler.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining([
        "vrdb_sync_kev",
        "vrdb_sync_cve",
        "vrdb_sync_aiid",
        "vrdb_sync_gleif",
      ]),
    );
  });

  it("queues one load job, with no data and deduplicated across replicas, while the records are on", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseLoad(config(), queue);

    expect(VRDB_LOAD_DEDUPLICATION_ID).toBe("vrdb_load");
    expect(queue.add.mock.calls).toEqual([
      ["vrdb_load", {}, { ...VRDB_JOB_OPTIONS, deduplication: { id: "vrdb_load" } }],
    ]);
    const [, , opts] = queue.add.mock.calls[0];
    // A fixed job id would make BullMQ drop the add while a settled job of that id is kept.
    expect(opts.jobId).toBeUndefined();
  });

  it("removes the schedulers before it queues the load", async () => {
    const order: string[] = [];
    const queue = {
      removeJobScheduler: jest.fn(async (id: string) => {
        order.push(id);
        return true;
      }),
      add: jest.fn(async (name: string) => {
        order.push(name);
        return undefined;
      }),
    };

    await scheduleVendorRiskDatabaseLoad(config(), queue as never);

    expect(order).toHaveLength(VRDB_SOURCE_IDS.length + 1);
    expect(order[order.length - 1]).toBe("vrdb_load");
  });

  it("only removes the schedulers when the records are off, and queues no load", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseLoad(config({ records: false }), queue);

    expect(queue.removeJobScheduler.mock.calls).toEqual(
      VRDB_SOURCE_IDS.map((id) => [`vrdb_sync_${id}`]),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("propagates a failure to remove a scheduler, so that the producer logs it, and queues no load", async () => {
    const queue = fakeQueue();
    queue.removeJobScheduler.mockRejectedValueOnce(new Error("Connection is closed."));

    await expect(scheduleVendorRiskDatabaseLoad(config(), queue)).rejects.toThrow(
      "Connection is closed.",
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("registers no scheduler of its own and never empties the queue", async () => {
    await scheduleVendorRiskDatabaseLoad(config(), fakeQueue());
    await scheduleVendorRiskDatabaseLoad(config({ records: false }), fakeQueue());

    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    expect(mockObliterate).not.toHaveBeenCalled();
  });
});
