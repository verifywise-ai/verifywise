/**
 * The read-through of the vendor risk database (M2, spec D4.8 step 3, Ruling 2 of the M2 plan): a
 * database asked at run time whose answers are kept, by key, for the hours of the source. A stored
 * answer that is still fresh is not asked again; an expired one is asked inside the run's time; a
 * failure keeps the stored records, says failed, and is not asked again for five minutes.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { FetchError } from "../../../webResearch/guardedFetch";
import type { FetchJson } from "../../records/types";
import type { ResearchTarget } from "../../target";
import type { ReadThroughConnector, ReadThroughFetched } from "../connectors/types";
import {
  READ_THROUGH_TIMEOUT_MS,
  RETRY_AFTER_FAILURE_MS,
  type ReadThroughDeps,
  type ReadThroughStore,
  readThrough,
} from "../readThrough";
import { type ReadThroughSource, vrdbSourceOf } from "../sources";
import type { ParsedRecord, ReadThroughAnswer, VrdbLookupState } from "../types";

const NOW = new Date("2026-10-31T12:00:00Z");
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const at = (ms: number) => new Date(NOW.getTime() + ms);

const NVD = vrdbSourceOf("nvd") as ReadThroughSource;
const BRISE: ResearchTarget = {
  name: "Brise Networks, Inc.",
  domain: "brisenetworks.example",
  provides: "Network gear",
};
const KEY = "cpe:brisenetworks";

const record = (id: string): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "vulnerability",
  title: `${id}: critical vulnerability (CVSS 9.8)`,
  summary: `National Vulnerability Database (nvd.nist.gov). CVE: ${id}.`,
  url: `https://nvd.nist.gov/vuln/detail/${id}`,
  identifiers: { cveID: id, cpeVendor: "brisenetworks" },
  matchKeys: [KEY],
  publishedAt: "2026-10-01",
  sourceUpdatedAt: null,
});

/** A store in memory that keeps the lookup rows as the database does (utils/vrdb.utils.ts). */
function memoryStore(rows: Record<string, VrdbLookupState> = {}) {
  const saved: ReadThroughAnswer[] = [];
  const store: ReadThroughStore = {
    lookupOf: jest.fn(async (sourceId: string, key: string) => rows[`${sourceId} ${key}`] ?? null),
    saveAnswer: jest.fn(async (input: ReadThroughAnswer) => {
      saved.push(input);
      const id = `${input.definition.id} ${input.key}`;
      rows[id] =
        input.outcome === "failed"
          ? {
              fetchedAt: rows[id]?.fetchedAt ?? null,
              expiresAt: input.expiresAt,
              outcome: "failed",
            }
          : { fetchedAt: input.at, expiresAt: input.expiresAt, outcome: input.outcome };
      return { statusChanged: 0 };
    }),
  };
  return { store, saved, rows };
}

/**
 * A connector of the NVD whose answers the test gives; it asks by the vendor's token. A list of
 * records stands for an answer that covers no window.
 */
function connectorOf(
  fetch: (
    ...args: Parameters<ReadThroughConnector["fetch"]>
  ) => Promise<ParsedRecord[] | ReadThroughFetched>,
  key: { key: string; weak: boolean } | null = { key: KEY, weak: false },
) {
  const connector: ReadThroughConnector = {
    id: "nvd",
    keyOf: jest.fn(async () => key),
    fetch: jest.fn(async (...args: Parameters<ReadThroughConnector["fetch"]>) => {
      const answer = await fetch(...args);
      return Array.isArray(answer) ? { records: answer, coversSince: null } : answer;
    }),
  };
  return connector;
}

const noFetchJson: FetchJson = async () => {
  throw new Error("the connector of the test asks itself");
};

const depsOf = (
  store: ReadThroughStore,
  connector: ReadThroughConnector,
  over: Partial<ReadThroughDeps> = {},
): ReadThroughDeps => ({
  store,
  connectors: { nvd: connector },
  fetchJson: noFetchJson,
  spacers: { nvd: async () => true },
  ...over,
});

const inputOf = (over: { now?: Date; signal?: AbortSignal } = {}) => ({
  sources: [NVD],
  target: BRISE,
  now: over.now ?? NOW,
  signal: over.signal ?? new AbortController().signal,
});

describe("readThrough", () => {
  it("keeps an answer six hours, and gives the run eight seconds", () => {
    expect(NVD).toMatchObject({ mode: "read_through", ttlHours: 6 });
    expect(READ_THROUGH_TIMEOUT_MS).toBe(8_000);
    expect(RETRY_AFTER_FAILURE_MS).toBe(300_000);
  });

  it("a fresh answer is not fetched again", async () => {
    const { store, saved } = memoryStore({
      [`nvd ${KEY}`]: { fetchedAt: at(-HOUR_MS), expiresAt: at(5 * HOUR_MS), outcome: "ok" },
    });
    const connector = connectorOf(async () => [record("CVE-2026-5001")]);

    const answers = await readThrough(inputOf(), depsOf(store, connector));

    expect(answers.get("nvd")).toEqual({
      key: KEY,
      weak: false,
      outcome: "fresh",
      fetchedAt: at(-HOUR_MS),
    });
    expect(connector.fetch).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("an expired answer is fetched and saved", async () => {
    const { store, saved } = memoryStore({
      [`nvd ${KEY}`]: { fetchedAt: at(-7 * HOUR_MS), expiresAt: at(-HOUR_MS), outcome: "ok" },
    });
    const connector = connectorOf(async () => [record("CVE-2026-5001")]);

    const answers = await readThrough(inputOf(), depsOf(store, connector));

    expect(answers.get("nvd")).toEqual({
      key: KEY,
      weak: false,
      outcome: "fetched",
      fetchedAt: NOW,
    });
    expect(connector.fetch).toHaveBeenCalledWith(KEY, {
      now: NOW,
      signal: expect.any(AbortSignal),
      fetchJson: noFetchJson,
    });
    expect(saved).toEqual([
      {
        definition: NVD,
        key: KEY,
        records: [record("CVE-2026-5001")],
        outcome: "ok",
        at: NOW,
        expiresAt: at(6 * HOUR_MS),
        coversSince: null,
      },
    ]);
  });

  it("the window an answer holds in full goes to the store with its records", async () => {
    // The copy then takes the key off a stored record of the window the answer lacks (M2 final
    // review, Important 1).
    const { store, saved } = memoryStore();
    const connector = connectorOf(async () => ({
      records: [record("CVE-2026-5001")],
      coversSince: "2026-07-04",
    }));

    await readThrough(inputOf(), depsOf(store, connector));

    expect(saved.map((answer) => [answer.outcome, answer.coversSince])).toEqual([
      ["ok", "2026-07-04"],
    ]);
  });

  it("a key never asked is fetched, and an answer with no records is saved empty", async () => {
    const { store, saved } = memoryStore();
    const connector = connectorOf(async () => []);

    const answers = await readThrough(inputOf(), depsOf(store, connector));

    expect(answers.get("nvd")?.outcome).toBe("fetched");
    expect(saved.map((answer) => [answer.outcome, answer.records])).toEqual([["empty", []]]);
  });

  it("a failed fetch keeps the stored records, says failed and waits five minutes", async () => {
    const { store, saved } = memoryStore({
      [`nvd ${KEY}`]: { fetchedAt: at(-7 * HOUR_MS), expiresAt: at(-HOUR_MS), outcome: "ok" },
    });
    let down = true;
    const connector = connectorOf(async () => {
      if (down) throw new FetchError("unreachable");
      return [record("CVE-2026-5001")];
    });
    const deps = depsOf(store, connector);

    const failed = await readThrough(inputOf(), deps);
    down = false;
    const waiting = await readThrough(inputOf({ now: at(4 * MINUTE_MS) }), deps);
    const again = await readThrough(inputOf({ now: at(6 * MINUTE_MS) }), deps);

    const stored = { key: KEY, weak: false, fetchedAt: at(-7 * HOUR_MS) };
    expect(failed.get("nvd")).toEqual({ ...stored, outcome: "failed" });
    expect(saved[0]).toEqual({
      definition: NVD,
      key: KEY,
      records: [],
      outcome: "failed",
      at: NOW,
      expiresAt: at(RETRY_AFTER_FAILURE_MS),
    });
    expect(waiting.get("nvd")).toEqual({ ...stored, outcome: "failed" });
    expect(again.get("nvd")).toEqual({
      key: KEY,
      weak: false,
      outcome: "fetched",
      fetchedAt: at(6 * MINUTE_MS),
    });
    expect(connector.fetch).toHaveBeenCalledTimes(2);
  });

  it("a vendor without a CPE token is not asked", async () => {
    const { store, saved } = memoryStore();
    const connector = connectorOf(async () => [], null);

    const answers = await readThrough(inputOf(), depsOf(store, connector));

    expect(answers.get("nvd")).toEqual({
      key: null,
      weak: false,
      outcome: "no_key",
      fetchedAt: null,
    });
    expect(store.lookupOf).not.toHaveBeenCalled();
    expect(connector.fetch).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("a refused turn is a failure, and the database is busy, not down: nothing waits", async () => {
    const { store, saved } = memoryStore();
    const connector = connectorOf(async () => [record("CVE-2026-5001")]);

    const answers = await readThrough(
      inputOf(),
      depsOf(store, connector, { spacers: { nvd: async () => false } }),
    );

    expect(answers.get("nvd")).toEqual({
      key: KEY,
      weak: false,
      outcome: "failed",
      fetchedAt: null,
    });
    expect(connector.fetch).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("a fetch past the time is a failure, and waits five minutes", async () => {
    const { store, saved } = memoryStore();
    // A connector that never answers and does not listen to the signal.
    const connector = connectorOf(() => new Promise<ParsedRecord[]>(() => undefined));
    const startedAt = Date.now();

    const answers = await readThrough(inputOf(), depsOf(store, connector, { timeoutMs: 30 }));

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(answers.get("nvd")).toEqual({
      key: KEY,
      weak: false,
      outcome: "failed",
      fetchedAt: null,
    });
    expect(saved.map((answer) => [answer.outcome, answer.expiresAt])).toEqual([
      ["failed", at(RETRY_AFTER_FAILURE_MS)],
    ]);
  });

  it("a run that was stopped fails, and leaves the database unblamed", async () => {
    const { store, saved } = memoryStore();
    const controller = new AbortController();
    const connector = connectorOf(async () => {
      controller.abort();
      throw new FetchError("unreachable");
    });

    const answers = await readThrough(
      inputOf({ signal: controller.signal }),
      depsOf(store, connector),
    );

    expect(answers.get("nvd")?.outcome).toBe("failed");
    expect(saved).toEqual([]);
  });

  it("a store that cannot be read or written is a failure, never an error", async () => {
    const unreadable = memoryStore();
    (unreadable.store.lookupOf as jest.Mock).mockRejectedValue(new Error("connection reset"));
    const connector = connectorOf(async () => [record("CVE-2026-5001")]);

    const read = await readThrough(inputOf(), depsOf(unreadable.store, connector));

    expect(read.get("nvd")).toEqual({ key: KEY, weak: false, outcome: "failed", fetchedAt: null });
    expect(connector.fetch).not.toHaveBeenCalled();

    const unwritable = memoryStore();
    (unwritable.store.saveAnswer as jest.Mock).mockRejectedValue(new Error("deadlock"));

    const written = await readThrough(inputOf(), depsOf(unwritable.store, connector));

    // The answer was not kept, so the run cannot find its records.
    expect(written.get("nvd")).toEqual({
      key: KEY,
      weak: false,
      outcome: "failed",
      fetchedAt: null,
    });
  });

  it("carries a key found by the name alone as weak", async () => {
    const { store } = memoryStore();
    const connector = connectorOf(async () => [], { key: "cik:0001262039", weak: true });

    const answers = await readThrough(inputOf(), depsOf(store, connector));

    expect(answers.get("nvd")).toMatchObject({ key: "cik:0001262039", weak: true });
  });

  it("asks nothing of a source that has no connector", async () => {
    const { store } = memoryStore();

    const answers = await readThrough(inputOf(), {
      ...depsOf(
        store,
        connectorOf(async () => []),
      ),
      connectors: {},
    });

    expect(answers.get("nvd")).toEqual({
      key: null,
      weak: false,
      outcome: "no_key",
      fetchedAt: null,
    });
  });
});
