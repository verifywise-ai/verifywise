/**
 * The queue of the vendor risk database (spec D4.7): one queue of its own, one job name, and one
 * scheduler per mirrored list, upserted only while both the VRDB flag and the records are on and
 * the list's gate is open (gates.ts).
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
jest.mock("../../../../utils/vrdb.utils", () => ({
  getVrdbSourceStatesQuery: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { Queue } from "bullmq";
import type { VendorResearchConfig } from "../../config";
import {
  VRDB_QUEUE,
  VRDB_RELABEL_JOB,
  VRDB_RELABEL_JOB_OPTIONS,
  VRDB_SYNC_JOB,
  VRDB_SYNC_JOB_OPTIONS,
  enqueueRelabel,
  scheduleVendorRiskDatabaseSync,
  vrdbSchedulerId,
} from "../queue";
import { activeMirrors } from "../sources";
import type { VrdbSourceState } from "../types";

/** The lists whose gates are open by default, and every mirrored list. */
const ACTIVE = ["kev", "ofac", "uk_sanctions", "eu_fsf"] as const;
const MIRRORS = [...ACTIVE, "cve", "un_sanctions"] as const;

const config = (overrides: Partial<VendorResearchConfig> = {}): VendorResearchConfig => ({
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
  vrdb: true,
  ...overrides,
});

const fakeQueue = () => ({
  upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  removeJobScheduler: jest.fn().mockResolvedValue(true),
  add: jest.fn().mockResolvedValue(undefined),
});

const state = (id: VrdbSourceState["id"], lastSuccessAt: Date | null): VrdbSourceState => ({
  id,
  lastSuccessAt,
  lastOutcome: lastSuccessAt === null ? "never" : "ok",
  sourceVersion: null,
  etag: null,
  lastModified: null,
  activeRecords: 0,
});

describe("the queue of the vendor risk database", () => {
  it("is a queue of its own, on the Redis of the application, with its two job names", () => {
    expect(VRDB_QUEUE).toBe("vendor-risk-database");
    expect(VRDB_SYNC_JOB).toBe("vrdb_sync");
    expect(VRDB_RELABEL_JOB).toBe("vrdb_relabel");
    expect((Queue as unknown as jest.Mock).mock.calls).toEqual([
      ["vendor-risk-database", { connection: { url: "redis://localhost:6379" } }],
    ]);
  });

  it("retries a failed sync three times, a minute apart and more, and keeps no settled job", () => {
    expect(VRDB_SYNC_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  });

  it("names a scheduler after its list, without a colon (Ruling 2)", () => {
    expect(vrdbSchedulerId("kev")).toBe("vrdb_sync_kev");
    expect(MIRRORS.map((id) => vrdbSchedulerId(id))).toEqual([
      "vrdb_sync_kev",
      "vrdb_sync_ofac",
      "vrdb_sync_uk_sanctions",
      "vrdb_sync_eu_fsf",
      "vrdb_sync_cve",
      "vrdb_sync_un_sanctions",
    ]);
  });
});

describe("enqueueRelabel", () => {
  it("adds the status job of a list, one waiting per list, by an id without a colon (Ruling 12)", async () => {
    const queue = fakeQueue();

    await enqueueRelabel("ofac", queue);
    await enqueueRelabel("cve", queue);

    expect(queue.add.mock.calls).toEqual([
      [
        "vrdb_relabel",
        { sourceId: "ofac" },
        { ...VRDB_RELABEL_JOB_OPTIONS, jobId: "vrdb_relabel_ofac" },
      ],
      [
        "vrdb_relabel",
        { sourceId: "cve" },
        { ...VRDB_RELABEL_JOB_OPTIONS, jobId: "vrdb_relabel_cve" },
      ],
    ]);
  });

  it("retries a failed status job as a failed sync is, and keeps no settled job", () => {
    // A settled job that stayed would keep its id, and BullMQ would add no later one.
    expect(VRDB_RELABEL_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  });
});

describe("scheduleVendorRiskDatabaseSync", () => {
  it("upserts one scheduler per active mirrored source when both flags are on", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseSync(config(), queue);

    expect(queue.upsertJobScheduler.mock.calls).toEqual(
      activeMirrors().map((source) => [
        `vrdb_sync_${source.id}`,
        { pattern: source.schedule, tz: "UTC" },
        { name: "vrdb_sync", data: { sourceId: source.id }, opts: VRDB_SYNC_JOB_OPTIONS },
      ]),
    );
  });

  it("a source behind a closed gate is neither scheduled nor covered", async () => {
    const queue = fakeQueue();
    // No list was ever copied, the gated ones included.
    const states = jest.fn(async () => [] as VrdbSourceState[]);

    await scheduleVendorRiskDatabaseSync(config(), queue, states);

    expect(queue.upsertJobScheduler.mock.calls.map(([id]) => id)).toEqual(
      ACTIVE.map((id) => `vrdb_sync_${id}`),
    );
    expect(queue.removeJobScheduler.mock.calls).toEqual([
      ["vrdb_sync_cve"],
      ["vrdb_sync_un_sanctions"],
    ]);
    expect(states).toHaveBeenCalledWith([...ACTIVE]);
    expect(queue.add.mock.calls.map(([, , opts]) => opts.jobId)).toEqual(
      ACTIVE.map((id) => `vrdb_sync_first_${id}`),
    );
  });

  it("removes the schedulers of every mirrored list when the VRDB flag is off", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseSync(config({ vrdb: false }), queue);

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.removeJobScheduler.mock.calls).toEqual(MIRRORS.map((id) => [`vrdb_sync_${id}`]));
  });

  it("removes the schedulers of every mirrored list when the records are off", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseSync(config({ records: false }), queue);

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.removeJobScheduler.mock.calls).toEqual(MIRRORS.map((id) => [`vrdb_sync_${id}`]));
  });

  it("queues a first sync of every list that was never copied, one job id per list", async () => {
    const queue = fakeQueue();
    const states = jest.fn(async () => [
      state("kev", new Date("2026-10-30T09:23:00Z")),
      state("ofac", null),
      // No row for the UK list: never copied either.
      state("eu_fsf", null),
    ]);

    await scheduleVendorRiskDatabaseSync(config(), queue, states);

    expect(states).toHaveBeenCalledWith([...ACTIVE]);
    expect(queue.add.mock.calls).toEqual(
      (["ofac", "uk_sanctions", "eu_fsf"] as const).map((id) => [
        "vrdb_sync",
        { sourceId: id },
        { ...VRDB_SYNC_JOB_OPTIONS, jobId: `vrdb_sync_first_${id}` },
      ]),
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(ACTIVE.length);
  });

  it("queues no first sync while the syncs are off", async () => {
    const queue = fakeQueue();
    const states = jest.fn(async () => [state("kev", null)]);

    await scheduleVendorRiskDatabaseSync(config({ vrdb: false }), queue, states);

    expect(states).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("keeps the schedulers when the states cannot be read, and queues no first sync", async () => {
    const queue = fakeQueue();
    const states = jest.fn(async () => {
      throw new Error("connection refused");
    });

    await expect(scheduleVendorRiskDatabaseSync(config(), queue, states)).resolves.toBeUndefined();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(ACTIVE.length);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("never empties the queue", async () => {
    await scheduleVendorRiskDatabaseSync(config(), fakeQueue());
    await scheduleVendorRiskDatabaseSync(config({ vrdb: false }), fakeQueue());

    expect(mockObliterate).not.toHaveBeenCalled();
  });
});
