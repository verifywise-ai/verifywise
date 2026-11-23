/**
 * The bundler of the vendor risk database (scripts/vrdbBundle.ts), with connectors made by the test
 * and a temporary directory: it writes a bundle and the manifest for each list it reads, refuses a
 * list that is not the list, parses with errors, is empty or shrank, tries a failed download again,
 * keeps the previous bundle of a list that failed, and rolls the CVE records forward from the
 * previous bundle. Nothing is downloaded.
 */
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { VrdbSourceId } from "../../domain.layer/interfaces/i.vendorResearch";
import {
  BUNDLE_FORMAT,
  type VrdbBundle,
  readBundle,
  readManifest,
  writeBundle,
  writeManifest,
} from "../../services/vendorResearch/vrdb/bundle";
import { CONNECTORS } from "../../services/vendorResearch/vrdb/connectors/index";
import type {
  Connector,
  IncrementalConnector,
  ParseResult,
  Snapshot,
} from "../../services/vendorResearch/vrdb/connectors/types";
import { activeMirrors, isMirror, VRDB_SOURCES } from "../../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../../services/vendorResearch/vrdb/types";
import { FetchError } from "../../services/webResearch/guardedFetch";
import {
  ATTEMPTS,
  type BundleDeps,
  type BundleOptions,
  SHRINK_LIMIT,
  bundleLists,
  main,
  parseArgs,
} from "../vrdbBundle";

const NOW = new Date("2026-11-23T09:00:00.000Z");

const record = (id: string, over: Partial<ParsedRecord> = {}): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "vulnerability",
  title: `Record ${id}`,
  summary: `The summary of ${id}.`,
  url: `https://example.com/${id}`,
  identifiers: {},
  matchKeys: [`name:vendor${id}`],
  publishedAt: "2026-10-01",
  sourceUpdatedAt: null,
  ...over,
});

const records = (n: number) => Array.from({ length: n }, (_, i) => record(`r${i}`));

const SNAPSHOT: Snapshot = { bodies: ["the list"], etag: null, lastModified: null, bytes: 8 };

const parsed = (over: Partial<ParseResult> = {}): ParseResult => ({
  records: records(3),
  errors: 0,
  sourceVersion: "2026.11.22",
  root: "list",
  ...over,
});

/** A connector of a list taken whole whose download and parse the test sets. */
function wholeConnector(id: VrdbSourceId, result: ParseResult = parsed(), version = 1) {
  return {
    id,
    version,
    download: jest.fn(async (): Promise<Snapshot | "unchanged"> => SNAPSHOT),
    parse: jest.fn((): ParseResult => result),
  } satisfies Connector;
}

/**
 * A connector of the CVE records that hands the days after the cursor it is asked from, a week at
 * most, as the real one does, and the parse of each day's snapshot.
 */
function cveConnector(days: Record<string, Partial<ParseResult>>, version = 1) {
  const order = Object.keys(days).sort();
  const asked: Array<string | null> = [];
  const connector = {
    kind: "incremental" as const,
    id: "cve" as const,
    version,
    download: jest.fn(async (_fetch: unknown, cursor: { day: string } | null, _now: Date) => {
      asked.push(cursor?.day ?? null);
      return order
        .filter((day) => cursor === null || day > cursor.day)
        .slice(0, 7)
        .map((day) => ({ day, snapshot: { ...SNAPSHOT, bodies: [day] } }));
    }),
    parse: jest.fn((snapshot: Snapshot): ParseResult => ({
      records: [],
      errors: 0,
      sourceVersion: null,
      root: "cve",
      ...days[snapshot.bodies[0]],
    })),
  } satisfies IncrementalConnector;
  return { connector, asked };
}

const options = (over: Partial<BundleOptions> = {}): BundleOptions => ({
  only: null,
  cveBaseline: null,
  allowShrink: new Set(),
  ...over,
});

let dir: string;
let log: string[];

const deps = (connectors: BundleDeps["connectors"]): BundleDeps => ({
  dir,
  fetch: jest.fn(),
  connectors,
  now: () => NOW,
  log: (text) => log.push(text),
  retryDelayMs: 0,
});

/** A previous bundle of a list, as an earlier run of the bundler left it. */
const previous = (bundle: Partial<VrdbBundle> & Pick<VrdbBundle, "sourceId" | "records">) => {
  const entry = writeBundle(
    {
      format: BUNDLE_FORMAT,
      connectorVersion: 1,
      builtAt: "2026-10-01T00:00:00.000Z",
      sourceVersion: null,
      cursor: null,
      ...bundle,
    },
    dir,
  );
  writeManifest({ format: BUNDLE_FORMAT, lists: [...readManifest(dir).lists, entry] }, dir);
  return entry;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-bundler-"));
  log = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseArgs", () => {
  it("bundles every list, from no baseline, shrinking none, by default", () => {
    expect(parseArgs([])).toEqual({ only: null, cveBaseline: null, allowShrink: new Set() });
  });

  it("reads the lists to bundle, the lists allowed to shrink and the CVE baseline", () => {
    expect(
      parseArgs([
        "--only",
        "kev, ofac",
        "--allow-shrink",
        "uk_ofsi,ofac",
        "--cve-baseline",
        "/tmp/2026-11-20_all_CVEs_at_midnight.zip",
      ]),
    ).toEqual({
      only: ["kev", "ofac"],
      allowShrink: new Set(["uk_ofsi", "ofac"]),
      cveBaseline: "/tmp/2026-11-20_all_CVEs_at_midnight.zip",
    });
  });

  it("refuses a list id it does not know, and names it", () => {
    expect(() => parseArgs(["--only", "kev,nope"])).toThrow(
      "--only takes list ids separated by commas (unknown: nope)",
    );
    expect(() => parseArgs(["--allow-shrink", "hibp"])).toThrow(
      "--allow-shrink takes list ids separated by commas (unknown: hibp)",
    );
  });

  it("refuses a flag without its value", () => {
    expect(() => parseArgs(["--only"])).toThrow("--only takes list ids separated by commas");
    expect(() => parseArgs(["--only", ","])).toThrow("--only takes list ids separated by commas");
    expect(() => parseArgs(["--cve-baseline"])).toThrow(
      "--cve-baseline takes the path of a baseline file",
    );
  });

  it("refuses a flag it does not know", () => {
    expect(() => parseArgs(["--force"])).toThrow("Unknown option: --force");
    expect(() => parseArgs(["kev"])).toThrow("Unknown option: kev");
  });

  it("makes main exit 2 on an option it refuses, before it reads or writes a bundle", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(main(["--force"])).resolves.toBe(2);
      expect(error).toHaveBeenCalledWith("Unknown option: --force");
    } finally {
      error.mockRestore();
    }
  });
});

describe("the connectors the bundler downloads with", () => {
  it("holds a connector for every mirrored list, under its id, with a version that is a positive whole number", () => {
    const mirrors = VRDB_SOURCES.filter(isMirror).map(({ id }) => id);

    expect(Object.keys(CONNECTORS).sort()).toEqual([...mirrors].sort());
    for (const id of mirrors) {
      const connector = CONNECTORS[id];
      expect([id, connector?.id]).toEqual([id, id]);
      expect([id, Number.isInteger(connector?.version) && (connector?.version ?? 0) > 0]).toEqual([
        id,
        true,
      ]);
      // Only the CVE records are read by their changes.
      expect([id, connector?.kind ?? "snapshot"]).toEqual([
        id,
        id === "cve" ? "incremental" : "snapshot",
      ]);
    }
    // A database read through is asked at run time: it has no connector here.
    for (const id of ["nvd", "sec", "gleif"] as const) expect(CONNECTORS[id]).toBeUndefined();
  });
});

describe("bundleLists, a list taken whole", () => {
  it("writes the bundle of each list it reads, dated now, and the manifest in the order of the ids", async () => {
    const kev = wholeConnector("kev", parsed({ records: [record("b"), record("a")] }), 3);
    const ofac = wholeConnector("ofac", parsed({ sourceVersion: null }));

    const outcomes = await bundleLists(options({ only: ["ofac", "kev"] }), deps({ kev, ofac }));

    expect(outcomes.map((outcome) => [outcome.sourceId, outcome.outcome])).toEqual([
      ["kev", "ok"],
      ["ofac", "ok"],
    ]);
    const { bundle, sha256 } = readBundle("kev", dir);
    expect(bundle).toEqual({
      format: BUNDLE_FORMAT,
      sourceId: "kev",
      connectorVersion: 3,
      builtAt: NOW.toISOString(),
      sourceVersion: "2026.11.22",
      cursor: null,
      records: [record("a"), record("b")],
    });
    expect(readManifest(dir).lists).toEqual([
      {
        sourceId: "kev",
        file: "kev.json.gz",
        builtAt: NOW.toISOString(),
        records: 2,
        connectorVersion: 3,
        sourceVersion: "2026.11.22",
        sha256,
      },
      expect.objectContaining({ sourceId: "ofac", records: 3, sourceVersion: null }),
    ]);
    expect(outcomes[0]).toEqual({
      sourceId: "kev",
      outcome: "ok",
      entry: readManifest(dir).lists[0],
    });
    expect(log).toEqual([
      "kev: downloading",
      "kev: 2 records",
      "ofac: downloading",
      "ofac: 3 records",
    ]);
  });

  it("downloads with no validators, through the fetch it is given", async () => {
    const kev = wholeConnector("kev");
    const given = deps({ kev });

    await bundleLists(options({ only: ["kev"] }), given);

    expect(kev.download).toHaveBeenCalledWith(given.fetch, { etag: null, lastModified: null });
    expect(kev.parse).toHaveBeenCalledWith(SNAPSHOT);
  });

  it("bundles only the active lists, and fails a list it has no connector for", async () => {
    const outcomes = await bundleLists(options({ only: ["kev", "aiid", "ofac"] }), deps({}));

    // The AI Incident Database waits behind its gate (Q29): it is not bundled at all.
    expect(outcomes).toEqual([
      { sourceId: "kev", outcome: "failed", reason: "no connector" },
      { sourceId: "ofac", outcome: "failed", reason: "no connector" },
    ]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("goes through every active list when no list is named", async () => {
    const outcomes = await bundleLists(options(), deps({}));

    expect(outcomes.map((outcome) => outcome.sourceId)).toEqual(
      activeMirrors().map(({ id }) => id),
    );
  });

  it.each([
    ["an empty list", parsed({ records: [] }), "empty"],
    ["a list that parses with errors", parsed({ errors: 2 }), "parse_errors (2)"],
    ["a document that is not the list", parsed({ root: null }), "wrong_root"],
  ])("refuses %s, and writes nothing", async (_label, result, reason) => {
    const outcomes = await bundleLists(
      options({ only: ["kev"] }),
      deps({ kev: wholeConnector("kev", result) }),
    );

    expect(outcomes).toEqual([{ sourceId: "kev", outcome: "failed", reason }]);
    expect(fs.existsSync(path.join(dir, "kev.json.gz"))).toBe(false);
    expect(readManifest(dir).lists).toEqual([]);
    expect(log).toContain(`kev: FAILED (${reason}); the previous bundle stays`);
  });

  it("refuses an answer of unchanged, which no validator asked for", async () => {
    const kev = wholeConnector("kev");
    kev.download.mockResolvedValue("unchanged");

    const [outcome] = await bundleLists(options({ only: ["kev"] }), deps({ kev }));

    expect(outcome).toEqual({
      sourceId: "kev",
      outcome: "failed",
      reason: "the server answered unchanged to no validators",
    });
  });

  it("logs the entries a list left out, and bundles the rest", async () => {
    const [outcome] = await bundleLists(
      options({ only: ["kev"] }),
      deps({ kev: wholeConnector("kev", parsed({ skipped: 4 })) }),
    );

    expect(outcome.outcome).toBe("ok");
    expect(log).toContain("  kev: 4 entries do not parse and were left out");
  });

  describe("the shrink guard", () => {
    it("refuses a list that lost more than a fifth of its previous bundle's records, and keeps that bundle", async () => {
      const before = previous({ sourceId: "kev", records: records(10) });

      const outcomes = await bundleLists(
        options({ only: ["kev"] }),
        deps({ kev: wholeConnector("kev", parsed({ records: records(7) })) }),
      );

      expect(SHRINK_LIMIT).toBe(0.2);
      expect(outcomes).toEqual([
        {
          sourceId: "kev",
          outcome: "failed",
          reason: "shrank from 10 to 7 records (--allow-shrink kev to accept)",
        },
      ]);
      expect(readBundle("kev", dir).sha256).toBe(before.sha256);
      expect(readManifest(dir).lists).toEqual([before]);
    });

    it("counts each id of the previous bundle once, as it counts the new download", async () => {
      // A connector that gives an id twice: the previous bundle holds 10 rows of 6 ids.
      const six = records(6);
      previous({ sourceId: "kev", records: [...six, ...six.slice(0, 4)] });

      const [outcome] = await bundleLists(
        options({ only: ["kev"] }),
        deps({ kev: wholeConnector("kev", parsed({ records: records(6) })) }),
      );

      expect(outcome.outcome).toBe("ok");
    });

    it("lets a list lose a fifth exactly", async () => {
      previous({ sourceId: "kev", records: records(10) });

      const [outcome] = await bundleLists(
        options({ only: ["kev"] }),
        deps({ kev: wholeConnector("kev", parsed({ records: records(8) })) }),
      );

      expect(outcome.outcome).toBe("ok");
      expect(readBundle("kev", dir).bundle.records).toHaveLength(8);
    });

    it("lets a list shrink when --allow-shrink names it, and only that list", async () => {
      previous({ sourceId: "kev", records: records(10) });
      previous({ sourceId: "ofac", records: records(10) });

      const outcomes = await bundleLists(
        options({ only: ["kev", "ofac"], allowShrink: new Set(["kev"]) }),
        deps({
          kev: wholeConnector("kev", parsed({ records: records(2) })),
          ofac: wholeConnector("ofac", parsed({ records: records(2) })),
        }),
      );

      expect(outcomes.map((outcome) => [outcome.sourceId, outcome.outcome])).toEqual([
        ["kev", "ok"],
        ["ofac", "failed"],
      ]);
      expect(readBundle("kev", dir).bundle.records).toHaveLength(2);
      expect(readBundle("ofac", dir).bundle.records).toHaveLength(10);
    });

    it("lets a new version of the connector read the list into fewer records", async () => {
      previous({ sourceId: "kev", records: records(10), connectorVersion: 1 });

      const [outcome] = await bundleLists(
        options({ only: ["kev"] }),
        deps({ kev: wholeConnector("kev", parsed({ records: records(3) }), 2) }),
      );

      expect(outcome.outcome).toBe("ok");
      expect(readBundle("kev", dir).bundle).toMatchObject({ connectorVersion: 2 });
      expect(readBundle("kev", dir).bundle.records).toHaveLength(3);
    });
  });

  describe("retries", () => {
    it("tries a download that failed to fetch again, and bundles the list when a later attempt succeeds", async () => {
      const kev = wholeConnector("kev");
      kev.download
        .mockRejectedValueOnce(new FetchError("unreachable"))
        .mockRejectedValueOnce(new FetchError("blocked_by_site", undefined, { status: 503 }));

      const [outcome] = await bundleLists(options({ only: ["kev"] }), deps({ kev }));

      expect(outcome.outcome).toBe("ok");
      expect(kev.download).toHaveBeenCalledTimes(3);
      expect(log).toEqual([
        "kev: downloading",
        "  kev: attempt 1 failed (FetchError unreachable), trying again",
        "  kev: attempt 2 failed (FetchError blocked_by_site 503), trying again",
        "kev: 3 records",
      ]);
    });

    it("gives up after its attempts, and keeps the previous bundle", async () => {
      const before = previous({ sourceId: "kev", records: records(4) });
      const kev = wholeConnector("kev");
      kev.download.mockRejectedValue(new FetchError("unreachable"));

      const [outcome] = await bundleLists(options({ only: ["kev"] }), deps({ kev }));

      expect(ATTEMPTS).toBe(3);
      expect(kev.download).toHaveBeenCalledTimes(ATTEMPTS);
      expect(outcome).toEqual({
        sourceId: "kev",
        outcome: "failed",
        reason: "FetchError unreachable",
      });
      expect(readBundle("kev", dir).sha256).toBe(before.sha256);
      expect(readManifest(dir).lists).toEqual([before]);
    });

    it("does not try again a list it refused, nor an error that is not a fetch's", async () => {
      const refused = wholeConnector("kev", parsed({ records: [] }));
      const thrown = wholeConnector("ofac");
      thrown.parse.mockImplementation(() => {
        throw new TypeError("cannot read the list");
      });

      const outcomes = await bundleLists(
        options({ only: ["kev", "ofac"] }),
        deps({ kev: refused, ofac: thrown }),
      );

      expect(refused.download).toHaveBeenCalledTimes(1);
      expect(thrown.download).toHaveBeenCalledTimes(1);
      // An error that is not the bundler's own is named by its name, never by its message.
      expect(outcomes.map((outcome) => outcome.outcome === "failed" && outcome.reason)).toEqual([
        "empty",
        "TypeError",
      ]);
    });
  });

  it("writes the other lists when one fails, and keeps the failed list's previous bundle in the manifest", async () => {
    const before = previous({ sourceId: "ofac", records: records(5) });
    const ofac = wholeConnector("ofac");
    ofac.download.mockRejectedValue(new FetchError("not_found"));

    const outcomes = await bundleLists(
      options({ only: ["kev", "ofac", "csl"] }),
      deps({ kev: wholeConnector("kev"), ofac, csl: wholeConnector("csl") }),
    );

    expect(outcomes.map((outcome) => [outcome.sourceId, outcome.outcome])).toEqual([
      ["kev", "ok"],
      ["ofac", "failed"],
      ["csl", "ok"],
    ]);
    expect(readManifest(dir).lists.map((entry) => entry.sourceId)).toEqual(["kev", "ofac", "csl"]);
    expect(readManifest(dir).lists[1]).toEqual(before);
  });

  it("fails a list whose previous bundle cannot be read, and leaves that file alone", async () => {
    fs.writeFileSync(path.join(dir, "kev.json.gz"), "not gzip");
    const kev = wholeConnector("kev");

    const [outcome] = await bundleLists(options({ only: ["kev"] }), deps({ kev }));

    expect(outcome).toEqual({ sourceId: "kev", outcome: "failed", reason: "BundleError" });
    expect(kev.download).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dir, "kev.json.gz"), "utf8")).toBe("not gzip");
  });
});

describe("bundleLists, the CVE records", () => {
  // The window is 24 months back from the day of the run: 2024-11-23 for NOW.
  const inWindow = "2026-11-01";
  const beforeWindow = "2024-11-01";

  it("rolls the previous bundle forward a day at a time: the records of each day, the retired ids, and the cursor of the last day", async () => {
    previous({
      sourceId: "cve",
      cursor: { day: "2026-11-18" },
      records: [
        record("CVE-A", { publishedAt: inWindow }),
        record("CVE-B", { publishedAt: inWindow }),
        record("CVE-OLD", { publishedAt: beforeWindow }),
        record("CVE-REJ", { publishedAt: beforeWindow, status: "rejected" }),
        record("CVE-NODATE", { publishedAt: null }),
      ],
    });
    const { connector, asked } = cveConnector(
      {
        // A day before the cursor is never asked for again.
        "2026-11-18": { records: [record("CVE-STALE")] },
        "2026-11-19": {
          records: [record("CVE-A", { title: "A again", publishedAt: inWindow }), record("CVE-C")],
          retired: ["CVE-B"],
        },
        "2026-11-20": { records: [record("CVE-D")] },
      },
      4,
    );

    const [outcome] = await bundleLists(options({ only: ["cve"] }), deps({ cve: connector }));

    expect(outcome.outcome).toBe("ok");
    // Asked from the previous cursor, then from the last day it handed, until no day is left.
    expect(asked).toEqual(["2026-11-18", "2026-11-20"]);
    expect(connector.download.mock.calls[0][2]).toEqual(NOW);
    const { bundle } = readBundle("cve", dir);
    expect(bundle).toMatchObject({
      sourceId: "cve",
      connectorVersion: 4,
      builtAt: NOW.toISOString(),
      sourceVersion: null,
      cursor: { day: "2026-11-20" },
    });
    // B was retired, the record published before the window left, a rejection stays whatever its
    // day, and a record with no day stays.
    expect(bundle.records.map((r) => r.sourceRecordId)).toEqual([
      "CVE-A",
      "CVE-C",
      "CVE-D",
      "CVE-NODATE",
      "CVE-REJ",
    ]);
    expect(bundle.records[0].title).toBe("A again");
  });

  it("keeps the previous bundle as it is when no day is new", async () => {
    previous({ sourceId: "cve", cursor: { day: "2026-11-22" }, records: [record("CVE-A")] });
    const { connector } = cveConnector({});

    const [outcome] = await bundleLists(options({ only: ["cve"] }), deps({ cve: connector }));

    expect(outcome.outcome).toBe("ok");
    expect(readBundle("cve", dir).bundle).toMatchObject({
      cursor: { day: "2026-11-22" },
      builtAt: NOW.toISOString(),
    });
    expect(readBundle("cve", dir).bundle.records).toHaveLength(1);
  });

  it("stops at an answer of unchanged", async () => {
    previous({ sourceId: "cve", cursor: { day: "2026-11-22" }, records: [record("CVE-A")] });
    const { connector } = cveConnector({});
    connector.download.mockResolvedValueOnce("unchanged" as never);

    const [outcome] = await bundleLists(options({ only: ["cve"] }), deps({ cve: connector }));

    expect(outcome.outcome).toBe("ok");
    expect(connector.download).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["parses with errors", { errors: 1 }, "parse_errors on 2026-11-19"],
    ["is not the list", { root: null }, "wrong_root on 2026-11-19"],
  ])("fails when a day %s, and keeps the previous bundle", async (_label, day, reason) => {
    const before = previous({
      sourceId: "cve",
      cursor: { day: "2026-11-18" },
      records: [record("CVE-A")],
    });
    const { connector } = cveConnector({ "2026-11-19": day });

    const [outcome] = await bundleLists(options({ only: ["cve"] }), deps({ cve: connector }));

    expect(outcome).toEqual({ sourceId: "cve", outcome: "failed", reason });
    expect(readBundle("cve", dir).sha256).toBe(before.sha256);
  });

  it("fails with no previous bundle and no baseline, and asks for one", async () => {
    const { connector } = cveConnector({ "2026-11-19": { records: [record("CVE-A")] } });

    const [outcome] = await bundleLists(options({ only: ["cve"] }), deps({ cve: connector }));

    expect(outcome).toEqual({
      sourceId: "cve",
      outcome: "failed",
      reason: "no previous bundle to roll forward; give --cve-baseline <file>",
    });
    expect(connector.download).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, "cve.json.gz"))).toBe(false);
  });

  it("fails as well when the previous bundle holds no cursor to roll forward from", async () => {
    previous({ sourceId: "cve", cursor: null, records: [record("CVE-A")] });
    const { connector } = cveConnector({});

    const [outcome] = await bundleLists(options({ only: ["cve"] }), deps({ cve: connector }));

    expect(outcome).toMatchObject({
      outcome: "failed",
      reason: "no previous bundle to roll forward; give --cve-baseline <file>",
    });
  });

  it("refuses a baseline file whose name does not give its day, before it reads it", async () => {
    const { connector } = cveConnector({});

    const [outcome] = await bundleLists(
      options({ only: ["cve"], cveBaseline: path.join(dir, "cves.zip") }),
      deps({ cve: connector }),
    );

    expect(outcome).toEqual({
      sourceId: "cve",
      outcome: "failed",
      reason: "the baseline must be named <day>_all_CVEs_at_midnight.zip",
    });
    expect(connector.download).not.toHaveBeenCalled();
  });

  it("fails as empty when every record left the window", async () => {
    previous({
      sourceId: "cve",
      cursor: { day: "2026-11-22" },
      records: [record("CVE-OLD", { publishedAt: beforeWindow })],
    });
    const { connector } = cveConnector({});

    const [outcome] = await bundleLists(options({ only: ["cve"] }), deps({ cve: connector }));

    expect(outcome).toEqual({ sourceId: "cve", outcome: "failed", reason: "empty" });
  });
});
