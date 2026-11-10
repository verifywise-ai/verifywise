/**
 * The queue of the vendor risk database (spec D4.7): one queue of its own, one job name, and one
 * scheduler per mirrored list, upserted while the records are on (the database has no flag of its
 * own) and the list's gate is open (gates.ts).
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
import { VRDB_GATES } from "../gates";
import {
  VRDB_QUEUE,
  VRDB_RELABEL_JOB,
  VRDB_RELABEL_JOB_OPTIONS,
  VRDB_SYNC_JOB,
  VRDB_SYNC_JOB_OPTIONS,
  enqueueRelabel,
  scheduleVendorRiskDatabaseSync,
  vrdbSchedulerId,
  vrdbSyncsOn,
} from "../queue";
import { activeMirrors } from "../sources";
import type { VrdbSourceState } from "../types";

/** The 22 lists added on 2026-11-10 that are copied (GLEIF is read through), in the order of the registry. */
const NEW_MIRRORS = [
  "canada_sema",
  "california_breaches",
  "uk_ofsi",
  "charlotin",
  "ftc_penalties",
  "piperoll",
  "eu_dg_comp",
  "disclose_io",
  "uk_cma",
  "canada_ai_register",
  "ftc_competition",
  "omb_ai_inventory",
  "co_sic_penalties",
  "uk_atrs",
  "nhtsa_recalls",
  "fmti",
  "uk_mhra",
  "nl_algoritmeregister",
  "nhtsa_odi",
  "fedramp",
  "epoch_ai",
  "c2pa_conforming",
] as const;

/** The schedule of each, in UTC. */
const NEW_SCHEDULES = [
  ["canada_sema", "2 1 * * *"],
  ["california_breaches", "12 7 * * *"],
  ["uk_ofsi", "18 10 * * 3"],
  ["charlotin", "25 15 * * *"],
  ["ftc_penalties", "55 4 * * 2"],
  ["piperoll", "21 11 * * *"],
  ["eu_dg_comp", "51 17 * * 1"],
  ["disclose_io", "8 20 * * 6"],
  ["uk_cma", "16 8 * * 2"],
  ["canada_ai_register", "31 20 * * 1"],
  ["ftc_competition", "57 4 * * 4"],
  ["omb_ai_inventory", "33 21 * * 2"],
  ["co_sic_penalties", "4 3 * * 3"],
  ["uk_atrs", "14 5 * * 1"],
  ["nhtsa_recalls", "3 9 * * *"],
  ["fmti", "45 21 * * 5"],
  ["uk_mhra", "22 22 * * 4"],
  ["nl_algoritmeregister", "37 22 * * 3"],
  ["nhtsa_odi", "1 10 * * *"],
  ["fedramp", "6 19 * * *"],
  ["epoch_ai", "39 23 * * 4"],
  ["c2pa_conforming", "49 16 * * *"],
] as const;

/**
 * The mirrored lists whose gates are open by default (the CVE records, Q7, the screening list, the
 * four AI lists with no gate and the 22 lists of 2026-11-10 are; the UN list, Q6, and the AI
 * Incident Database, Q29, are not), those of them that are copied whole, and every mirrored list,
 * in the order of the table of sources. GLEIF is read through, so it is in none of them.
 */
const ACTIVE = [
  "kev",
  "ofac",
  "uk_sanctions",
  "eu_fsf",
  "cve",
  "csl",
  "atlas",
  "nhtsa_sgo",
  "fda_ai_devices",
  "fda_device_recalls",
  ...NEW_MIRRORS,
] as const;
const WHOLE = [
  "kev",
  "ofac",
  "uk_sanctions",
  "eu_fsf",
  "csl",
  "atlas",
  "nhtsa_sgo",
  "fda_ai_devices",
  "fda_device_recalls",
  ...NEW_MIRRORS,
] as const;
const GATED = ["un_sanctions", "aiid"] as const;
const MIRRORS = [
  "kev",
  "ofac",
  "uk_sanctions",
  "eu_fsf",
  "cve",
  "un_sanctions",
  "csl",
  "aiid",
  "atlas",
  "nhtsa_sgo",
  "fda_ai_devices",
  "fda_device_recalls",
  ...NEW_MIRRORS,
] as const;

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
      "vrdb_sync_csl",
      "vrdb_sync_aiid",
      "vrdb_sync_atlas",
      "vrdb_sync_nhtsa_sgo",
      "vrdb_sync_fda_ai_devices",
      "vrdb_sync_fda_device_recalls",
      ...NEW_MIRRORS.map((id) => `vrdb_sync_${id}`),
    ]);
    // 34 lists are copied, so there are 34 schedulers to name: GLEIF, read through, has none.
    expect(MIRRORS).toHaveLength(34);
    expect(vrdbSchedulerId("canada_sema")).toBe("vrdb_sync_canada_sema");
    expect(vrdbSchedulerId("nl_algoritmeregister")).toBe("vrdb_sync_nl_algoritmeregister");
    for (const id of MIRRORS) expect(vrdbSchedulerId(id)).not.toContain(":");
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

describe("vrdbSyncsOn", () => {
  it("is the records switch and nothing else: the lists are mirrored unless the records are off", () => {
    expect(vrdbSyncsOn(config())).toBe(true);
    expect(vrdbSyncsOn({ records: true })).toBe(true);
    expect(vrdbSyncsOn(config({ records: false }))).toBe(false);
    expect(vrdbSyncsOn({ records: false })).toBe(false);
  });
});

describe("scheduleVendorRiskDatabaseSync", () => {
  it("upserts one scheduler per active mirrored source while the records are on, with no other flag", async () => {
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
    // The UN list (Q6) and the AI Incident Database (Q29) wait behind a closed gate.
    expect(queue.removeJobScheduler.mock.calls).toEqual(GATED.map((id) => [`vrdb_sync_${id}`]));
    expect(states).toHaveBeenCalledWith([...ACTIVE]);
    // A first sync of each list that is copied whole; the CVE records are copied from a baseline.
    expect(queue.add.mock.calls.map(([, , opts]) => opts.jobId)).toEqual(
      WHOLE.map((id) => `vrdb_sync_first_${id}`),
    );
  });

  it("a list read by its changes gets its scheduler but no first sync: its first copy is a baseline", async () => {
    const queue = fakeQueue();
    // The CVE records have a row that never saw a success; the other lists have no row at all.
    const states = jest.fn(async () => [state("cve", null)]);

    await scheduleVendorRiskDatabaseSync(config(), queue, states);

    // The CVE records have their scheduler (their gate, Q7, is open), and their state is read as
    // the others' are ...
    expect(queue.upsertJobScheduler.mock.calls.map(([id]) => id)).toEqual(
      ACTIVE.map((id) => `vrdb_sync_${id}`),
    );
    expect(queue.removeJobScheduler.mock.calls).toEqual(GATED.map((id) => [`vrdb_sync_${id}`]));
    expect(states).toHaveBeenCalledWith([...ACTIVE]);
    // ... but no first sync: a sync without a cursor would be refused as no_baseline, and the
    // first copy of the list is the baseline an operator loads (scripts/vrdbCveBaseline.ts).
    expect(queue.add.mock.calls.map(([, data, opts]) => [data.sourceId, opts.jobId])).toEqual(
      WHOLE.map((id) => [id, `vrdb_sync_first_${id}`]),
    );
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
    // The screening list, the open AI lists and the 22 lists of 2026-11-10 have no row either, so
    // they are queued too, after the lists above and in the order of the registry; the gated ones
    // are not.
    expect(queue.add.mock.calls).toEqual(
      (
        [
          "ofac",
          "uk_sanctions",
          "eu_fsf",
          "csl",
          "atlas",
          "nhtsa_sgo",
          "fda_ai_devices",
          "fda_device_recalls",
          ...NEW_MIRRORS,
        ] as const
      ).map((id) => [
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

    await scheduleVendorRiskDatabaseSync(config({ records: false }), queue, states);

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
    await scheduleVendorRiskDatabaseSync(config({ records: false }), fakeQueue());

    expect(mockObliterate).not.toHaveBeenCalled();
  });
});

describe("the AI-specific lists in the schedule (spec D2.14 to D2.17)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("schedules the three open lists at their own minutes, in UTC, and none for the AI Incident Database", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseSync(config(), queue);

    for (const [id, pattern] of [
      ["atlas", "17 3 * * *"],
      ["nhtsa_sgo", "5 13 * * *"],
      ["fda_ai_devices", "35 5 * * *"],
    ] as const) {
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `vrdb_sync_${id}`,
        { pattern, tz: "UTC" },
        { name: "vrdb_sync", data: { sourceId: id }, opts: VRDB_SYNC_JOB_OPTIONS },
      );
    }
    // The gate Q29 is closed: its scheduler is removed, not upserted, and no first sync is queued.
    expect(queue.upsertJobScheduler.mock.calls.map(([id]) => id)).not.toContain("vrdb_sync_aiid");
    expect(queue.removeJobScheduler).toHaveBeenCalledWith("vrdb_sync_aiid");
    expect(queue.add.mock.calls.map(([, data]) => data.sourceId)).not.toContain("aiid");
  });

  it("queues a first sync of each open list that was never copied, and of the AI Incident Database only once Q29 is open", async () => {
    const closed = fakeQueue();
    await scheduleVendorRiskDatabaseSync(config(), closed, async () => []);
    expect(closed.add.mock.calls.map(([, , opts]) => opts.jobId)).toEqual(
      expect.arrayContaining([
        "vrdb_sync_first_atlas",
        "vrdb_sync_first_nhtsa_sgo",
        "vrdb_sync_first_fda_ai_devices",
      ]),
    );
    expect(closed.add.mock.calls.map(([, , opts]) => opts.jobId)).not.toContain(
      "vrdb_sync_first_aiid",
    );

    jest.replaceProperty(VRDB_GATES, "Q29", true);
    const opened = fakeQueue();
    const states = jest.fn(async () => [] as VrdbSourceState[]);

    await scheduleVendorRiskDatabaseSync(config(), opened, states);

    // The scheduler of the AI Incident Database, at its minute, and the UN list's removal only.
    expect(opened.upsertJobScheduler).toHaveBeenCalledWith(
      "vrdb_sync_aiid",
      { pattern: "11 4 * * *", tz: "UTC" },
      { name: "vrdb_sync", data: { sourceId: "aiid" }, opts: VRDB_SYNC_JOB_OPTIONS },
    );
    expect(opened.removeJobScheduler.mock.calls).toEqual([["vrdb_sync_un_sanctions"]]);
    expect(states).toHaveBeenCalledWith([
      "kev",
      "ofac",
      "uk_sanctions",
      "eu_fsf",
      "cve",
      "csl",
      "aiid",
      "atlas",
      "nhtsa_sgo",
      "fda_ai_devices",
      "fda_device_recalls",
      ...NEW_MIRRORS,
    ]);
    expect(opened.add.mock.calls.map(([, , opts]) => opts.jobId)).toContain("vrdb_sync_first_aiid");
  });

  it("removes the scheduler of every AI list when the records are off", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseSync(config({ records: false }), queue);

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.removeJobScheduler.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining([
        "vrdb_sync_aiid",
        "vrdb_sync_atlas",
        "vrdb_sync_nhtsa_sgo",
        "vrdb_sync_fda_ai_devices",
      ]),
    );
  });
});

describe("the screening list and the device recalls in the schedule (spec D2.19, D2.20)", () => {
  // Neither waits behind a gate, so each has its scheduler and, while it was never copied, its first
  // sync, as the open AI lists have.
  const NEW_LISTS = [
    ["csl", "7 */6 * * *"],
    ["fda_device_recalls", "43 14 * * *"],
  ] as const;

  it("schedules both at their own minutes, in UTC, and removes the scheduler of neither", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseSync(config(), queue);

    for (const [id, pattern] of NEW_LISTS) {
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `vrdb_sync_${id}`,
        { pattern, tz: "UTC" },
        { name: "vrdb_sync", data: { sourceId: id }, opts: VRDB_SYNC_JOB_OPTIONS },
      );
      expect(queue.removeJobScheduler).not.toHaveBeenCalledWith(`vrdb_sync_${id}`);
    }
  });

  it("queues a first sync of each while it was never copied, one job id per list", async () => {
    const queue = fakeQueue();
    // Neither has a row: no sync of either ever ran.
    const states = jest.fn(async () => [] as VrdbSourceState[]);

    await scheduleVendorRiskDatabaseSync(config(), queue, states);

    // Both are among the lists whose states are read, and both are copied whole: unlike the CVE
    // records they have no baseline to wait for.
    expect(states).toHaveBeenCalledWith(expect.arrayContaining(["csl", "fda_device_recalls"]));
    for (const [id] of NEW_LISTS) {
      expect(queue.add).toHaveBeenCalledWith(
        "vrdb_sync",
        { sourceId: id },
        { ...VRDB_SYNC_JOB_OPTIONS, jobId: `vrdb_sync_first_${id}` },
      );
    }
  });

  it("queues a first sync of a list whose row has no success, and none of a list that was copied", async () => {
    const queue = fakeQueue();
    const states = jest.fn(async () => [
      // A row of syncs that all failed is still a list that was never copied.
      state("csl", null),
      state("fda_device_recalls", new Date("2026-11-06T14:43:00Z")),
    ]);

    await scheduleVendorRiskDatabaseSync(config(), queue, states);

    const first = queue.add.mock.calls.map(([, data]) => data.sourceId);
    expect(first).toContain("csl");
    expect(first).not.toContain("fda_device_recalls");
  });

  it("removes the scheduler of each when the records are off, and queues no first sync", async () => {
    const queue = fakeQueue();
    const states = jest.fn(async () => [] as VrdbSourceState[]);

    await scheduleVendorRiskDatabaseSync(config({ records: false }), queue, states);

    for (const [id] of NEW_LISTS) {
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`vrdb_sync_${id}`);
    }
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(states).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe("the lists added on 2026-11-10 in the schedule", () => {
  // None of the 22 that are copied waits behind a gate, so each has its scheduler and, while it was
  // never copied, its first sync, as the open AI lists have. GLEIF is read through: it is asked at
  // run time, and it has neither.

  it.each(NEW_SCHEDULES)(
    "schedules %s at %s, in UTC, and removes the scheduler of none of them",
    async (id, pattern) => {
      const queue = fakeQueue();

      await scheduleVendorRiskDatabaseSync(config(), queue);

      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `vrdb_sync_${id}`,
        { pattern, tz: "UTC" },
        { name: "vrdb_sync", data: { sourceId: id }, opts: VRDB_SYNC_JOB_OPTIONS },
      );
      expect(queue.removeJobScheduler).not.toHaveBeenCalledWith(`vrdb_sync_${id}`);
    },
  );

  it("upserts 32 schedulers in all, the 22 last and in the order of the registry, and removes the two of the gated lists", async () => {
    const queue = fakeQueue();

    await scheduleVendorRiskDatabaseSync(config(), queue);

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(32);
    expect(
      queue.upsertJobScheduler.mock.calls.slice(-22).map(([id, repeat]) => [id, repeat.pattern]),
    ).toEqual(NEW_SCHEDULES.map(([id, pattern]) => [`vrdb_sync_${id}`, pattern]));
    expect(queue.removeJobScheduler.mock.calls).toEqual([
      ["vrdb_sync_un_sanctions"],
      ["vrdb_sync_aiid"],
    ]);
  });

  it("queues a first sync of each while it was never copied, one job id per list", async () => {
    const queue = fakeQueue();
    // None has a row: no sync of any ever ran.
    const states = jest.fn(async () => [] as VrdbSourceState[]);

    await scheduleVendorRiskDatabaseSync(config(), queue, states);

    // All 22 are among the lists whose states are read, and all are copied whole: unlike the CVE
    // records they have no baseline to wait for.
    expect(states).toHaveBeenCalledWith(expect.arrayContaining([...NEW_MIRRORS]));
    for (const id of NEW_MIRRORS) {
      expect(queue.add).toHaveBeenCalledWith(
        "vrdb_sync",
        { sourceId: id },
        { ...VRDB_SYNC_JOB_OPTIONS, jobId: `vrdb_sync_first_${id}` },
      );
    }
    // Nine of the lists before them are copied whole as well, and none is queued twice.
    const jobIds = queue.add.mock.calls.map(([, , opts]) => opts.jobId);
    expect(jobIds).toHaveLength(31);
    expect(new Set(jobIds).size).toBe(31);
  });

  it("queues a first sync of a list whose row has no success, and none of a list that was copied", async () => {
    const queue = fakeQueue();
    const states = jest.fn(async () => [
      // A row of syncs that all failed is still a list that was never copied.
      state("canada_sema", null),
      state("nhtsa_recalls", new Date("2026-11-10T09:03:00Z")),
      state("uk_cma", new Date("2026-11-04T08:16:00Z")),
    ]);

    await scheduleVendorRiskDatabaseSync(config(), queue, states);

    const first = queue.add.mock.calls.map(([, data]) => data.sourceId);
    expect(first).toContain("canada_sema");
    expect(first).not.toContain("nhtsa_recalls");
    expect(first).not.toContain("uk_cma");
    expect(
      first.filter((id: string) => (NEW_MIRRORS as readonly string[]).includes(id)),
    ).toHaveLength(20);
  });

  it("removes the scheduler of each when the records are off, and queues no first sync", async () => {
    const queue = fakeQueue();
    const states = jest.fn(async () => [] as VrdbSourceState[]);

    await scheduleVendorRiskDatabaseSync(config({ records: false }), queue, states);

    for (const id of NEW_MIRRORS) {
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`vrdb_sync_${id}`);
    }
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(states).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("gives GLEIF, which is read through, no scheduler and no first sync, whether the records are on or off", async () => {
    for (const records of [true, false]) {
      const queue = fakeQueue();
      const states = jest.fn(async () => [] as VrdbSourceState[]);

      await scheduleVendorRiskDatabaseSync(config({ records }), queue, states);

      const touched = [
        ...queue.upsertJobScheduler.mock.calls.map(([id]) => id),
        ...queue.removeJobScheduler.mock.calls.map(([id]) => id),
        ...queue.add.mock.calls.map(([, data]) => data.sourceId),
        ...queue.add.mock.calls.map(([, , opts]) => opts.jobId),
      ];
      expect(touched.filter((id: string) => id.includes("gleif"))).toEqual([]);
      expect(states).not.toHaveBeenCalledWith(expect.arrayContaining(["gleif"]));
    }
  });
});
