/**
 * The worker of the vendor risk database (spec D4.7): it takes the sync jobs one at a time, checks
 * the records switch again (the database has no flag of its own), and throws for a failed sync so
 * that BullMQ retries it; a sync that changed a status adds the status job of its list, which
 * relabels the pending findings that cite it (Ruling 12 of the M2 plan).
 */
const mockWorkerOn = jest.fn();
// The sync of a list with the database: a test of the connector map sees which connector the job
// hands it. The other tests of the job inject their own sync.
const mockSyncSource = jest.fn();

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
jest.mock("../sync", () => ({
  syncSource: (...args: unknown[]) => mockSyncSource(...args),
}));

import { UnrecoverableError, Worker } from "bullmq";
import logger from "../../../../utils/logger/fileLogger";
import type { VendorResearchConfig } from "../../config";
import { aiidConnector } from "../connectors/aiid";
import { atlasConnector } from "../connectors/atlas";
import { c2paConformingConnector } from "../connectors/c2paConforming";
import { californiaBreachesConnector } from "../connectors/californiaBreaches";
import { canadaAiRegisterConnector } from "../connectors/canadaAiRegister";
import { canadaSemaConnector } from "../connectors/canadaSema";
import { charlotinConnector } from "../connectors/charlotin";
import { coSicPenaltiesConnector } from "../connectors/coSicPenalties";
import { cslConnector } from "../connectors/csl";
import { cveConnector } from "../connectors/cve";
import { discloseIoConnector } from "../connectors/discloseIo";
import { epochAiConnector } from "../connectors/epochAi";
import { euConnector } from "../connectors/eu";
import { euDgCompConnector } from "../connectors/euDgComp";
import { fdaConnector } from "../connectors/fda";
import { fdaRecallsConnector } from "../connectors/fdaRecalls";
import { fedrampConnector } from "../connectors/fedramp";
import { fmtiConnector } from "../connectors/fmti";
import { ftcCompetitionConnector } from "../connectors/ftcCompetition";
import { ftcPenaltiesConnector } from "../connectors/ftcPenalties";
import { kevConnector } from "../connectors/kev";
import { nhtsaConnector } from "../connectors/nhtsa";
import { nhtsaOdiConnector } from "../connectors/nhtsaOdi";
import { nhtsaRecallsConnector } from "../connectors/nhtsaRecalls";
import { nlAlgoritmeregisterConnector } from "../connectors/nlAlgoritmeregister";
import { ofacConnector } from "../connectors/ofac";
import { ombAiInventoryConnector } from "../connectors/ombAiInventory";
import { piperollConnector } from "../connectors/piperoll";
import { ukConnector } from "../connectors/uk";
import { ukAtrsConnector } from "../connectors/ukAtrs";
import { ukCmaConnector } from "../connectors/ukCma";
import { ukMhraConnector } from "../connectors/ukMhra";
import { ukOfsiConnector } from "../connectors/ukOfsi";
import { unConnector } from "../connectors/un";
import { VRDB_GATES, type VrdbGate } from "../gates";
import { VRDB_SOURCES, isMirror } from "../sources";
import type { SyncResult } from "../sync";
import {
  VrdbSyncFailed,
  VrdbSyncNotRetried,
  connectorFetch,
  createVrdbWorker,
  processVrdbJob,
} from "../worker";

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

/** The connector of each of the 22 lists added on 2026-11-10 that are copied, in the order of the registry. */
const NEW_CONNECTORS = [
  ["canada_sema", canadaSemaConnector],
  ["california_breaches", californiaBreachesConnector],
  ["uk_ofsi", ukOfsiConnector],
  ["charlotin", charlotinConnector],
  ["ftc_penalties", ftcPenaltiesConnector],
  ["piperoll", piperollConnector],
  ["eu_dg_comp", euDgCompConnector],
  ["disclose_io", discloseIoConnector],
  ["uk_cma", ukCmaConnector],
  ["canada_ai_register", canadaAiRegisterConnector],
  ["ftc_competition", ftcCompetitionConnector],
  ["omb_ai_inventory", ombAiInventoryConnector],
  ["co_sic_penalties", coSicPenaltiesConnector],
  ["uk_atrs", ukAtrsConnector],
  ["nhtsa_recalls", nhtsaRecallsConnector],
  ["fmti", fmtiConnector],
  ["uk_mhra", ukMhraConnector],
  ["nl_algoritmeregister", nlAlgoritmeregisterConnector],
  ["nhtsa_odi", nhtsaOdiConnector],
  ["fedramp", fedrampConnector],
  ["epoch_ai", epochAiConnector],
  ["c2pa_conforming", c2paConformingConnector],
] as const;

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

  it.each([["un_sanctions"], ["aiid"]])(
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

describe("the connector of each list", () => {
  // The job syncs a list with the connector of its map entry, through the page guard. The sync is
  // the mock above, so that no download is made and the test reads what the job handed it.
  afterEach(() => {
    jest.restoreAllMocks();
    mockSyncSource.mockReset();
  });

  const openGates = () => {
    for (const gate of Object.keys(VRDB_GATES) as VrdbGate[]) {
      jest.replaceProperty(VRDB_GATES, gate, true);
    }
  };

  it.each([
    ["csl", cslConnector],
    ["atlas", atlasConnector],
    ["nhtsa_sgo", nhtsaConnector],
    ["fda_ai_devices", fdaConnector],
    ["fda_device_recalls", fdaRecallsConnector],
  ] as const)(
    "the job of %s, a list with no gate, syncs it with its own connector",
    async (sourceId, connector) => {
      mockSyncSource.mockResolvedValue({ outcome: "ok" });

      await expect(processVrdbJob(syncJob({ sourceId }), { config: config() })).resolves.toEqual({
        outcome: "ok",
      });

      expect(mockSyncSource).toHaveBeenCalledTimes(1);
      const [id, deps] = mockSyncSource.mock.calls[0];
      expect(id).toBe(sourceId);
      expect(deps.connector).toBe(connector);
      expect(connector.id).toBe(sourceId);
      expect(deps.fetch).toBe(connectorFetch);
    },
  );

  it("the job of the AI Incident Database reaches no connector while Q29 is closed, and syncs with its own once it is open", async () => {
    mockSyncSource.mockResolvedValue({ outcome: "ok" });

    await expect(
      processVrdbJob(syncJob({ sourceId: "aiid" }), { config: config() }),
    ).resolves.toBeNull();
    expect(mockSyncSource).not.toHaveBeenCalled();

    jest.replaceProperty(VRDB_GATES, "Q29", true);

    await expect(
      processVrdbJob(syncJob({ sourceId: "aiid" }), { config: config() }),
    ).resolves.toEqual({ outcome: "ok" });
    expect(mockSyncSource).toHaveBeenCalledTimes(1);
    const [id, deps] = mockSyncSource.mock.calls[0];
    expect(id).toBe("aiid");
    expect(deps.connector).toBe(aiidConnector);
    expect(aiidConnector.id).toBe("aiid");
  });

  it("every mirrored list has a connector of its own, which names it, once its gate is open", async () => {
    openGates();
    const connectors = {
      kev: kevConnector,
      ofac: ofacConnector,
      uk_sanctions: ukConnector,
      eu_fsf: euConnector,
      cve: cveConnector,
      un_sanctions: unConnector,
      csl: cslConnector,
      aiid: aiidConnector,
      atlas: atlasConnector,
      nhtsa_sgo: nhtsaConnector,
      fda_ai_devices: fdaConnector,
      fda_device_recalls: fdaRecallsConnector,
      canada_sema: canadaSemaConnector,
      california_breaches: californiaBreachesConnector,
      uk_ofsi: ukOfsiConnector,
      charlotin: charlotinConnector,
      ftc_penalties: ftcPenaltiesConnector,
      piperoll: piperollConnector,
      eu_dg_comp: euDgCompConnector,
      disclose_io: discloseIoConnector,
      uk_cma: ukCmaConnector,
      canada_ai_register: canadaAiRegisterConnector,
      ftc_competition: ftcCompetitionConnector,
      omb_ai_inventory: ombAiInventoryConnector,
      co_sic_penalties: coSicPenaltiesConnector,
      uk_atrs: ukAtrsConnector,
      nhtsa_recalls: nhtsaRecallsConnector,
      fmti: fmtiConnector,
      uk_mhra: ukMhraConnector,
      nl_algoritmeregister: nlAlgoritmeregisterConnector,
      nhtsa_odi: nhtsaOdiConnector,
      fedramp: fedrampConnector,
      epoch_ai: epochAiConnector,
      c2pa_conforming: c2paConformingConnector,
    };
    const mirrors = VRDB_SOURCES.filter(isMirror).map(({ id }) => id);

    // The screening list and the device recalls are in the map beside the four AI lists and the six
    // that were there, and the 22 lists of 2026-11-10 after them: 34 lists are copied, and GLEIF,
    // which is read through, has no connector in the map.
    expect(mirrors).toHaveLength(34);
    expect([...mirrors].sort()).toEqual(Object.keys(connectors).sort());
    for (const [id, connector] of Object.entries(connectors)) {
      mockSyncSource.mockClear().mockResolvedValue({ outcome: "ok" });

      await processVrdbJob(syncJob({ sourceId: id }), { config: config() });

      expect(mockSyncSource).toHaveBeenCalledTimes(1);
      expect(mockSyncSource.mock.calls[0][0]).toBe(id);
      expect(mockSyncSource.mock.calls[0][1].connector).toBe(connector);
      expect(connector.id).toBe(id);
      // The version that the sync hashes with the download: a positive whole number.
      expect([id, Number.isInteger(connector.version) && connector.version > 0]).toEqual([
        id,
        true,
      ]);
    }
  });

  it.each(NEW_CONNECTORS)(
    "the job of %s, a list with no gate, syncs it with its own connector, through the page guard",
    async (sourceId, connector) => {
      mockSyncSource.mockResolvedValue({ outcome: "ok" });

      await expect(processVrdbJob(syncJob({ sourceId }), { config: config() })).resolves.toEqual({
        outcome: "ok",
      });

      expect(mockSyncSource).toHaveBeenCalledTimes(1);
      const [id, deps] = mockSyncSource.mock.calls[0];
      expect(id).toBe(sourceId);
      expect(deps.connector).toBe(connector);
      expect(connector.id).toBe(sourceId);
      expect(deps.fetch).toBe(connectorFetch);
    },
  );

  it("every connector of the 22 copies its list whole, under the id of its list, with a version that is a positive whole number", () => {
    expect(NEW_CONNECTORS).toHaveLength(22);
    for (const [id, connector] of NEW_CONNECTORS) {
      expect([id, connector.id]).toEqual([id, id]);
      expect([id, Number.isInteger(connector.version) && connector.version > 0]).toEqual([
        id,
        true,
      ]);
      // None is read by its changes, as the CVE records are.
      expect([id, connector.kind ?? "snapshot"]).toEqual([id, "snapshot"]);
    }
  });

  it.each([["nvd"], ["sec"], ["gleif"]])(
    "the sync job of %s, a database read through, does nothing and reaches no connector",
    async (sourceId) => {
      mockSyncSource.mockResolvedValue({ outcome: "ok" });

      await expect(processVrdbJob(syncJob({ sourceId }), { config: config() })).resolves.toBeNull();
      expect(mockSyncSource).not.toHaveBeenCalled();
    },
  );
});

describe("the jobs of the 22 lists added on 2026-11-10", () => {
  // None waits behind a gate, so the job of each is carried out as the job of any open list is.
  const NEW_IDS = NEW_CONNECTORS.map(([id]) => id);

  it.each(NEW_IDS)(
    "the job of %s syncs it, with no gate to open, and does nothing while the records are off",
    async (sourceId) => {
      const result: SyncResult = {
        outcome: "ok",
        counts: { seen: 120, inserted: 4, updated: 1, statusChanged: 0 },
      };
      const sync = syncOf(result);
      const whileOff = syncOf({ outcome: "ok" });

      await expect(
        processVrdbJob(syncJob({ sourceId }), { config: config(), sync }),
      ).resolves.toEqual(result);
      await expect(
        processVrdbJob(syncJob({ sourceId }), {
          config: config({ records: false }),
          sync: whileOff,
        }),
      ).resolves.toBeNull();

      expect(sync).toHaveBeenCalledWith(sourceId);
      expect(whileOff).not.toHaveBeenCalled();
    },
  );

  it("a sync of one of them that failed on the way throws so that BullMQ retries it, and one the list refused is not retried", async () => {
    for (const sourceId of NEW_IDS) {
      const onTheWay = processVrdbJob(syncJob({ sourceId }), {
        config: config(),
        sync: syncOf({ outcome: "failed", errorCode: "fetch_failed" }),
      });
      await expect(onTheWay).rejects.toThrow(`The sync of ${sourceId} failed (fetch_failed)`);
      await expect(onTheWay).rejects.not.toBeInstanceOf(UnrecoverableError);

      const refused = processVrdbJob(syncJob({ sourceId }), {
        config: config(),
        sync: syncOf({ outcome: "failed", errorCode: "wrong_root" }),
      });
      await expect(refused).rejects.toBeInstanceOf(UnrecoverableError);
      await expect(refused).rejects.toThrow(`The sync of ${sourceId} failed (wrong_root)`);
    }
  });

  it("the status job of GLEIF, a database read through, relabels as the status job of any list does", async () => {
    // A read-through answer that changes a status adds it (lookup.ts), so the worker takes it for
    // GLEIF as it takes it for the NVD.
    const relabel = jest.fn().mockResolvedValue({ relabeled: 1 });

    await expect(
      processVrdbJob(syncJob({ sourceId: "gleif" }, "vrdb_relabel"), { config: config(), relabel }),
    ).resolves.toEqual({ relabeled: 1 });
    expect(relabel).toHaveBeenCalledWith("gleif");
  });
});

describe("the jobs of the screening list and the device recalls", () => {
  // Neither list waits behind a gate, so its job is carried out as the job of any open list is: the
  // sync through its connector (above), the retry rules of a failed sync, and the status job.
  const NEW_LISTS = ["csl", "fda_device_recalls"] as const;

  it.each(NEW_LISTS)("the job of %s syncs it, with no gate to open", async (sourceId) => {
    const result: SyncResult = {
      outcome: "ok",
      counts: { seen: 5170, inserted: 12, updated: 3, statusChanged: 0 },
    };
    const sync = syncOf(result);

    await expect(
      processVrdbJob(syncJob({ sourceId }), { config: config(), sync }),
    ).resolves.toEqual(result);
    expect(sync).toHaveBeenCalledWith(sourceId);
  });

  it.each(NEW_LISTS)("the job of %s does nothing while the records are off", async (sourceId) => {
    const sync = syncOf({ outcome: "ok" });

    await expect(
      processVrdbJob(syncJob({ sourceId }), { config: config({ records: false }), sync }),
    ).resolves.toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it.each(NEW_LISTS)(
    "a sync of %s that failed on the way throws, so that BullMQ retries it",
    async (sourceId) => {
      const sync = syncOf({ outcome: "failed", errorCode: "fetch_failed" });

      const failed = processVrdbJob(syncJob({ sourceId }), { config: config(), sync });

      await expect(failed).rejects.toThrow(VrdbSyncFailed);
      await expect(failed).rejects.toThrow(`The sync of ${sourceId} failed (fetch_failed)`);
      await expect(failed).rejects.not.toBeInstanceOf(UnrecoverableError);
    },
  );

  it.each(NEW_LISTS)(
    "a sync of %s that the list refused is not retried, whatever the refusal",
    async (sourceId) => {
      // A file that is not the list, one with unreadable entries, an empty join of the recalls, a
      // copy that would lose a fifth of its records: a retry a minute later meets the same answer.
      for (const errorCode of [
        "wrong_root",
        "parse_errors",
        "empty",
        "shrank",
        "too_large",
      ] as const) {
        const sync = syncOf({ outcome: "failed", errorCode });

        const refused = processVrdbJob(syncJob({ sourceId }), { config: config(), sync });

        await expect(refused).rejects.toBeInstanceOf(UnrecoverableError);
        await expect(refused).rejects.toThrow(`The sync of ${sourceId} failed (${errorCode})`);
      }
    },
  );

  it("a sync of the recalls whose answer asked for a wait is not retried by the job, which would ask sooner", async () => {
    // openFDA's 429 carries its Retry-After through the connector to the sync's result.
    const sync = syncOf({ outcome: "failed", errorCode: "fetch_failed", retryAfterMs: 60_000 });

    const failed = processVrdbJob(syncJob({ sourceId: "fda_device_recalls" }), {
      config: config(),
      sync,
    });

    await expect(failed).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(failed).rejects.toThrow("The sync of fda_device_recalls failed (fetch_failed)");
  });

  it.each(NEW_LISTS)(
    "a sync of %s that changed statuses adds its status job, which relabels the pending findings of the list",
    async (sourceId) => {
      // A listing that left the screening list is delisted, a recall that left the join withdrawn.
      const enqueueRelabel = jest.fn().mockResolvedValue(undefined);
      const relabel = jest.fn().mockResolvedValue({ relabeled: 2 });
      const changed = syncOf({
        outcome: "ok",
        counts: { seen: 9, inserted: 0, updated: 1, statusChanged: 3 },
      });

      await processVrdbJob(syncJob({ sourceId }), {
        config: config(),
        sync: changed,
        enqueueRelabel,
      });
      await expect(
        processVrdbJob(syncJob({ sourceId }, "vrdb_relabel"), { config: config(), relabel }),
      ).resolves.toEqual({ relabeled: 2 });

      expect(enqueueRelabel).toHaveBeenCalledTimes(1);
      expect(enqueueRelabel).toHaveBeenCalledWith(sourceId);
      expect(relabel).toHaveBeenCalledWith(sourceId);
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
