/**
 * The NHTSA recall campaigns list (nhtsa_recalls): one static zip whose single entry,
 * FLAT_RCL_POST_2010.txt, is a TAB-delimited text of 29 fields with no header row and CRLF on every
 * line (247,176 lines and 312.8 MB inflated today; every campaign REPORTED SINCE 2010-01-01), read as
 * a stream and turned into one record per FILER. Every file here is invented: the names are made up,
 * the numbers and the texts too, and the zips are written by the test (helpers/zipFixtures.ts). The
 * real file's quirks that matter are reproduced in the fixtures: no header, CRLF, general purpose bit
 * 3 and a data descriptor, a campaign of many rows that differ only in their RECORD_ID, a POTAFF of 0,
 * the sentinels in ODATE and YEARTXT, a campaign number with a letter in its sequence, rows that name
 * no filer, a filer with a parenthesis, and a text in every excluded column. Every excluded field
 * carries a marker (SENTINEL) that no record may hold. No network.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import * as zipModule from "../../zip";
import { unreadableAllowed } from "../kit/clean";
import { type Fetched, createFileConnector } from "../kit/fileConnector";
import * as streamModule from "../kit/stream";
import {
  ENVELOPE_CONTENT_TYPE,
  FLAT_LINE_BYTES_MAX,
  NHTSA_DOCUMENTATION_URL,
  entityKeyOf,
  envelopeOf,
} from "../nhtsaFlat";
import {
  NHTSA_RECALLS_FLOORS,
  NHTSA_RECALLS_RECORD_MARK,
  type RecallEntity,
  nhtsaRecallsConnector,
  nhtsaRecallsSpec,
} from "../nhtsaRecalls";
import { BodyTooLargeError, type Connector, NotTheListError, type Snapshot } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";
import { flatZip, zipOf } from "./helpers/zipFixtures";

jest.setTimeout(30_000);

const URL = "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip";
const ENTRY = "FLAT_RCL_POST_2010.txt";
const OCTETS = "application/octet-stream";
const ETAG = '"rcl-1"';
const MODIFIED = "Wed, 04 Mar 2026 16:41:27 GMT";

const CLOSING =
  "A recall campaign is the filer's report of a safety defect or noncompliance, not a finding of fault; the list holds an entry for the filer. " +
  "Not endorsed by NHTSA; counts and component names adapted by VerifyWise from NHTSA's flat file.";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

// ---------------------------------------------------------------------------------------------
// The file: lines of 29 TAB-separated fields, no header, CRLF on every line.
// ---------------------------------------------------------------------------------------------

/** The fields that a test chooses; the others get a default, and the excluded ones a short invented text. */
interface Fields {
  camp: string;
  record?: number;
  type?: string;
  comp?: string;
  filer?: string;
  potaff?: string;
  influenced?: string;
  rcdate?: string;
  noDrive?: string;
  // The fields that are never decoded.
  make?: string;
  model?: string;
  year?: string;
  mfgCamp?: string;
  begin?: string;
  end?: string;
  odate?: string;
  mfgText?: string;
  dateA?: string;
  rpno?: string;
  fmvss?: string;
  desc?: string;
  consequence?: string;
  action?: string;
  notes?: string;
  cmpt?: string;
  mfrName?: string;
  mfrDesc?: string;
  mfrPart?: string;
  park?: string;
}

/** The first RECORD_ID of a file made here: above every number of the real file, so that none made here is one of its. */
const FIRST_RECORD = 5_000_000_001;

/** The RECORD_ID of the next row that a test does not number itself: the file is sorted by it. */
let nextRecord = FIRST_RECORD;

const line = (f: Fields): string => {
  const rcdate = f.rcdate ?? "20200101";
  return [
    String(f.record ?? nextRecord++),
    f.camp,
    f.make ?? "ACME MAKE",
    f.model ?? "MODEL Q9",
    f.year ?? "2020",
    f.mfgCamp ?? "",
    f.comp ?? "SERVICE BRAKES",
    f.filer ?? "Default Filer Inc.",
    f.begin ?? "",
    f.end ?? "",
    f.type ?? f.camp.charAt(2),
    f.potaff ?? "100",
    f.odate ?? "",
    f.influenced ?? "MFR",
    f.mfgText ?? "Acme Makers",
    rcdate,
    f.dateA ?? rcdate,
    f.rpno ?? "",
    f.fmvss ?? "",
    f.desc ?? "Invented defect text.",
    f.consequence ?? "Invented consequence.",
    f.action ?? "Invented remedy.",
    f.notes ?? "",
    f.cmpt ?? "000000000000000000000000001",
    f.mfrName ?? "",
    f.mfrDesc ?? "",
    f.mfrPart ?? "",
    f.noDrive ?? "No",
    f.park ?? "No",
  ].join("\t");
};

const pad = (n: number): string => String(n).padStart(2, "0");

const TYPES = ["V", "E", "T", "C"];
const COMPONENTS = [
  "SERVICE BRAKES",
  "STEERING",
  "ELECTRICAL SYSTEM",
  "AIR BAGS",
  "TIRES",
  "FUEL SYSTEM",
];
const PREFIXES = [
  "Alder",
  "Birch",
  "Cobalt",
  "Dune",
  "Ember",
  "Fjord",
  "Garnet",
  "Harbor",
  "Indigo",
  "Jasper",
  "Kestrel",
  "Lumen",
  "Maple",
  "Nimbus",
  "Onyx",
  "Pine",
  "Quartz",
  "Raven",
];
const SUFFIXES = [
  "Motors",
  "Autos",
  "Trucks",
  "Cycles",
  "Vans",
  "Coaches",
  "Trailers",
  "Wheels",
  "Brakes",
  "Tires",
  "Sleds",
  "Lights",
  "Mirrors",
  "Axles",
  "Engines",
  "Gears",
  "Lifts",
  "Rovers",
  "Carts",
  "Buses",
  "Racers",
  "Haulers",
  "Movers",
  "Riders",
  "Tourers",
];
const WAVES = ["", " North", " South"];
const LEGAL = ["Inc.", "LLC", "Corp."];

/** The invented name of base filer `i` (1,350 of them: 18 first words by 25 second words by 3 waves). */
const entityName = (i: number): string =>
  `${PREFIXES[i % PREFIXES.length]} ${SUFFIXES[Math.floor(i / PREFIXES.length) % SUFFIXES.length]}${WAVES[Math.floor(i / 450)]} ${LEGAL[i % LEGAL.length]}`;

/**
 * The number of campaign `n`: its year, the type letter, five characters of base 36 (unique to 60 million) and a 9. The
 * real numbers all end in 000, so no number made here is one of them.
 */
const campOf = (n: number): string =>
  `${pad(10 + (n % 16))}${TYPES[n % TYPES.length]}${n.toString(36).toUpperCase().padStart(5, "0")}9`;

/** Reported from 2010 to 2025, the first campaign on 2010-01-01, the first day of the window of the list. */
const rcdateOf = (n: number): string =>
  `${2010 + (n % 16)}${pad(1 + (n % 12))}${pad(1 + (n % 28))}`;

/**
 * A list that meets the floors: `campaigns` campaigns of one to three rows each, spread over
 * `entities` filers, reported 2010 to 2025.
 */
function baseLines(campaigns = 10_200, entities = 1_050): string[] {
  const lines: string[] = [];
  for (let n = 0; n < campaigns; n += 1) {
    const camp = campOf(n);
    const filer = entityName(n % entities);
    for (let r = 0; r < 1 + (n % 3); r += 1) {
      lines.push(
        line({
          camp,
          filer,
          comp: COMPONENTS[(n + r) % COMPONENTS.length],
          potaff: String(100 + (n % 900)),
          influenced: n % 5 === 0 ? "ODI" : n % 7 === 0 ? "OVSC" : "MFR",
          rcdate: rcdateOf(n),
          noDrive: n % 50 === 0 ? "Yes" : "No",
        }),
      );
    }
  }
  return lines;
}

const SENTINELS = [
  "Zorblatt",
  "555-0147",
  "SENTINEL-MAKE",
  "SENTINEL-MODEL",
  "SENTINEL-MFGCAMP",
  "SENTINEL-MFGTEXT",
  "SENTINEL-DESC",
  "SENTINEL-CONSEQ",
  "SENTINEL-ACTION",
  "SENTINEL-NOTES",
  "SENTINEL-CMPT",
  "SENTINEL-MFRNAME",
  "SENTINEL-MFRDESC",
  "SENTINEL-MFRPART",
  "zorblatt@example.org",
];

/** The campaigns that the tests look at, each with the filer, the dates and the texts the test expects. */
const scenarioLines = (): string[] => [
  // One campaign of three rows: the POTAFF of the first row (the lowest RECORD_ID) is the campaign's, and the first component by text.
  line({
    camp: "25V123900",
    filer: "Larkspur Rovers, Inc.",
    comp: "STEERING",
    potaff: "1234",
    rcdate: "20250312",
  }),
  line({
    camp: "25V123900",
    filer: "Larkspur Rovers, Inc.",
    comp: "SERVICE BRAKES",
    potaff: "999",
    rcdate: "20250312",
  }),
  line({
    camp: "25V123900",
    filer: "Larkspur Rovers, Inc.",
    comp: "SERVICE BRAKES",
    potaff: "999",
    rcdate: "20250312",
  }),
  // An automated driving filer: four campaigns, two influenced by NHTSA, two on driver assistance, one with a do-not-drive advisory.
  line({
    camp: "22V456900",
    filer: "Borealis Robotics, Inc.",
    comp: "FORWARD COLLISION AVOIDANCE",
    potaff: "0",
    influenced: "ODI",
    rcdate: "20220504",
  }),
  line({
    camp: "24V777900",
    filer: "Borealis Robotics, Inc.",
    comp: "LANE KEEPING ASSIST",
    potaff: "2000000",
    influenced: "OVSC",
    noDrive: "Yes",
    rcdate: "20240110",
  }),
  line({
    camp: "26V001900",
    filer: "Borealis Robotics, Inc.",
    comp: "ELECTRICAL SYSTEM",
    potaff: "17",
    influenced: "MFR",
    rcdate: "20260918",
  }),
  line({
    camp: "19E555900",
    filer: "Borealis Robotics, Inc.",
    comp: "AIR BAGS",
    potaff: "5",
    influenced: "",
    rcdate: "20190405",
  }),
  // Two spellings of one name: three campaigns under the first, two under the second.
  line({ camp: "23V200900", filer: "Cinder Vehicles LLC", comp: "TIRES", rcdate: "20230220" }),
  line({ camp: "23V200900", filer: "Cinder Vehicles LLC", comp: "WHEELS", rcdate: "20230220" }),
  line({ camp: "23V200901", filer: "CINDER VEHICLES, L.L.C.", comp: "TIRES", rcdate: "20230501" }),
  line({ camp: "23V200902", filer: "Cinder Vehicles LLC", comp: "TIRES", rcdate: "20230601" }),
  line({ camp: "23V200903", filer: "CINDER VEHICLES, L.L.C.", comp: "TIRES", rcdate: "20230701" }),
  line({ camp: "23V200904", filer: "Cinder Vehicles LLC", comp: "TIRES", rcdate: "20231201" }),
  // A name with a parenthesis; a name of three characters (no key, so no record); and a name whose legal form leaves three
  // (its full name is the key: a record `abc`, keyed `name:abcinc`).
  line({ camp: "24V300900", filer: "Acme (Acme Motor Co.)", comp: "STEERING", rcdate: "20240301" }),
  line({ camp: "24V300901", filer: "Zyx", comp: "STEERING", rcdate: "20240302" }),
  line({ camp: "24V300902", filer: "Abc, Inc.", comp: "STEERING", rcdate: "20240303" }),
  // Two spellings written once each: the display is the one that sorts first.
  line({ camp: "22V400900", filer: "Tie Motors Co", comp: "TIRES", rcdate: "20220401" }),
  line({ camp: "22V400901", filer: "TIE MOTORS, INC.", comp: "TIRES", rcdate: "20220501" }),
  // A campaign number with a letter in its sequence.
  line({ camp: "21V00A900", filer: "Lettered Motors Inc.", comp: "TIRES", rcdate: "20210615" }),
  // A text in every column that never reaches a record (a person, a phone number, an address, markup, controls).
  line({
    camp: "25V500900",
    filer: "Excludo Wheels LLC",
    comp: "TIRES",
    rcdate: "20250501",
    make: "SENTINEL-MAKE",
    model: "SENTINEL-MODEL",
    year: "9999",
    mfgCamp: "SENTINEL-MFGCAMP",
    begin: "20250101",
    end: "20250201",
    odate: "11111111",
    mfgText: "SENTINEL-MFGTEXT Redundant Makers",
    dateA: "20250502",
    rpno: "573",
    fmvss: "225",
    desc: `SENTINEL-DESC Ms. Quenby Zorblatt phoned 555-0147${cp(0x0c)}<b>bold</b> see https://example.org/letter`,
    consequence: `SENTINEL-CONSEQ call zorblatt@example.org${cp(0x92)}`,
    action: `SENTINEL-ACTION <script>alert(1)</script>`,
    notes: `SENTINEL-NOTES ${cp(0x81)}${cp(0x91)}`,
    cmpt: "SENTINEL-CMPT",
    mfrName: "SENTINEL-MFRNAME",
    mfrDesc: "SENTINEL-MFRDESC",
    mfrPart: "SENTINEL-MFRPART",
    park: "Yes",
  }),
];

/** The records that the happy path makes: 1,050 of the base and these of the scenario. */
const SCENARIO_ENTITIES = [
  "larkspurrovers",
  "borealisrobotics",
  "cindervehicles",
  "acmeacmemotorco",
  "abc",
  "tiemotors",
  "letteredmotors",
  "excludowheels",
];
/** The campaigns of the scenario, and its filers with and without a record. */
const SCENARIO_CAMPAIGNS = 1 + 4 + 5 + 3 + 2 + 1 + 1;
const SCENARIO_FILERS = SCENARIO_ENTITIES.length + 1;

const CRLF = Buffer.from("\r\n");

/** The bytes of a file: its lines, each followed by CRLF, the last one as well (the real file's last line has it). */
function fileOf(lines: ReadonlyArray<string | Buffer>, finalEnd = true): Buffer {
  const parts: Buffer[] = [];
  lines.forEach((entry, at) => {
    if (at > 0) parts.push(CRLF);
    parts.push(typeof entry === "string" ? Buffer.from(entry, "utf8") : entry);
  });
  if (finalEnd && lines.length > 0) parts.push(CRLF);
  return Buffer.concat(parts);
}

const zipOfLines = (lines: ReadonlyArray<string | Buffer>, finalEnd = true): Buffer =>
  flatZip(ENTRY, fileOf(lines, finalEnd));

const served = (zip: Buffer, over: Partial<FakeFile> = {}): Record<string, FakeFile> => ({
  [URL]: { body: zip, contentType: OCTETS, etag: ETAG, lastModified: MODIFIED, ...over },
});

const fetchOf = (lines: ReadonlyArray<string | Buffer>, over: Partial<FakeFile> = {}) =>
  fakeFetch(served(zipOfLines(lines), over));

async function snapshotOf(
  lines: ReadonlyArray<string | Buffer>,
  connector: Connector = nhtsaRecallsConnector,
): Promise<Snapshot> {
  const snapshot = await connector.download(fetchOf(lines), {});
  if (snapshot === "unchanged") throw new Error("The download was answered as unchanged.");
  return snapshot;
}

const parseOf = async (
  lines: ReadonlyArray<string | Buffer>,
  connector: Connector = nhtsaRecallsConnector,
) => connector.parse(await snapshotOf(lines, connector));

/** The JSON that the download hands to `read`: the meta of the file and the entity rows, as the reducer made them. */
async function envelopeOfLines(lines: ReadonlyArray<string | Buffer>) {
  const spec = nhtsaRecallsSpec();
  if (spec.fetchFiles === undefined) throw new Error("The spec has no fetch of its own.");
  const fetched = await spec.fetchFiles(fetchOf(lines), {});
  if (fetched === "unchanged") throw new Error("The download was answered as unchanged.");
  return JSON.parse(fetched.buffers[0].toString("utf8")) as {
    meta: Record<string, unknown>;
    entities: Array<Record<string, unknown>>;
  };
}

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("The call did not fail.");
    },
    (error: unknown) => error,
  );

interface Body {
  v: number;
  rows: RecallEntity[];
  total: number;
  allowanceBasis?: number;
  unreadable: number;
}

const bodyOf = (snapshot: Snapshot): Body => JSON.parse(snapshot.bodies[0]) as Body;
const recordOf = (records: readonly ParsedRecord[], id: string): ParsedRecord => {
  const found = records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}.`);
  return found;
};
const hasRecord = (records: readonly ParsedRecord[], id: string): boolean =>
  records.some((record) => record.sourceRecordId === id);

/** A seeded generator (mulberry32): the same numbers in every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = seeded(seed);
  const copy = [...items];
  for (let at = copy.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [copy[at], copy[other]] = [copy[other], copy[at]];
  }
  return copy;
}

let BASE: string[];
let FILE: string[];

beforeAll(() => {
  nextRecord = FIRST_RECORD;
  BASE = baseLines();
  FILE = [...BASE, ...scenarioLines()];
});

describe("the list as a whole", () => {
  it("is the list nhtsa_recalls, named by its mark", () => {
    expect(NHTSA_RECALLS_RECORD_MARK).toBe("NHTSA vehicle and equipment recalls");
    expect(nhtsaRecallsConnector.id).toBe("nhtsa_recalls");
    expect(nhtsaRecallsConnector.version).toBe(1);
  });

  it("downloads one body with the validators of the zip, and makes one record per filer", async () => {
    const zip = zipOfLines(FILE);
    // The real file's zip: general purpose bit 3 (no sizes in the local header), CRLF on every line, no header row.
    expect(zip.readUInt16LE(6) & 0x0008).toBe(0x0008);
    expect(zip.readUInt32LE(18)).toBe(0);
    expect(
      fileOf(FILE)
        .toString("utf8")
        .startsWith(`${FIRST_RECORD}\t${campOf(0)}\t`),
    ).toBe(true);
    expect(fileOf(FILE).subarray(-2).toString("latin1")).toBe("\r\n");

    const snapshot = await nhtsaRecallsConnector.download(fakeFetch(served(zip)), {});
    if (snapshot === "unchanged") throw new Error("unchanged");

    expect(snapshot.bodies).toHaveLength(1);
    expect(snapshot.etag).toBe(`k1:${ETAG}`);
    expect(snapshot.lastModified).toBe(MODIFIED);
    expect(snapshot.bytes).toBe(zip.length);
    const body = bodyOf(snapshot);
    expect(Object.keys(body)).toEqual(["v", "rows", "total", "allowanceBasis", "unreadable"]);
    expect(body.v).toBe(1);
    expect(body.rows).toHaveLength(1_050 + SCENARIO_ENTITIES.length);
    expect(body.total).toBe(FILE.length);
    // The allowance for unreadable lines is measured over the lines of the file, not over its filers.
    expect(body.allowanceBasis).toBe(FILE.length);
    expect(body.unreadable).toBe(0);

    const result = nhtsaRecallsConnector.parse(snapshot);
    expect(result.root).toBe("FLAT_RCL_POST_2010.txt");
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.sourceVersion).toBe("2026-09-18");
    expect(result.records).toHaveLength(1_050 + SCENARIO_ENTITIES.length);
    expectWellFormedRecords(result.records, {
      sourceId: "nhtsa_recalls",
      mark: NHTSA_RECALLS_RECORD_MARK,
    });
    for (const record of result.records) {
      expect(record.recordType).toBe("vehicle_recall_summary");
      expect(
        record.summary.startsWith(
          "NHTSA vehicle and equipment recalls (nhtsa.gov), a product safety list. ",
        ),
      ).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.sourceUpdatedAt).toBeNull();
      expect(record.publishedAt).not.toBeNull();
      expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
    }
    for (const id of SCENARIO_ENTITIES) expect(hasRecord(result.records, id)).toBe(true);
  });

  it("reads the last line whether or not it ends with CRLF, and a file with plain LF line ends, as the same list", async () => {
    const last = line({
      camp: "25V999900",
      filer: "Lastline Motors Inc.",
      comp: "TIRES",
      rcdate: "20250101",
    });
    const lines = [...FILE, last];
    const expected = (await snapshotOf(lines)).bodies;

    const bare = flatZip(ENTRY, fileOf(lines, false));
    const withoutEnd = await nhtsaRecallsConnector.download(fakeFetch(served(bare)), {});
    const plain = zipOf([{ name: ENTRY, data: `${lines.join("\n")}\n`, descriptor: true }]);
    const withLf = await nhtsaRecallsConnector.download(fakeFetch(served(plain)), {});

    expect(hasRecord((await parseOf(lines)).records, "lastlinemotors")).toBe(true);
    if (withoutEnd === "unchanged" || withLf === "unchanged") throw new Error("unchanged");
    expect(withoutEnd.bodies).toEqual(expected);
    expect(withLf.bodies).toEqual(expected);
  });

  it("gives every filer a page of its own: two records never share an address", async () => {
    const { records } = await parseOf(FILE);
    const urls = records.map((record) => record.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const record of records) {
      expect(record.url).toBe(
        `${NHTSA_DOCUMENTATION_URL}?dataset=recalls&filer=${encodeURIComponent(record.sourceRecordId)}`,
      );
    }
  });

  it("does not depend on the order of the rows: forward, reversed and shuffled give one body and the same records", async () => {
    await expectDeterministic(nhtsaRecallsConnector, (reversed) =>
      fetchOf(reversed ? [...FILE].reverse() : FILE),
    );
    const forward = await snapshotOf(FILE);
    for (const seed of [1, 2, 3]) {
      expect((await snapshotOf(shuffled(FILE, seed))).bodies).toEqual(forward.bodies);
    }
  });

  it("gives the same id to the same filer whatever the order of the rows", async () => {
    const one = nhtsaRecallsConnector
      .parse(await snapshotOf(FILE))
      .records.map((r) => r.sourceRecordId);
    const two = nhtsaRecallsConnector
      .parse(await snapshotOf(shuffled(FILE, 9)))
      .records.map((r) => r.sourceRecordId);
    expect(two).toEqual(one);
  });

  it("is answered as unchanged by a 304 that comes from the pinned address, through the kit's own flow", async () => {
    const fetch = fetchOf(FILE);
    const first = await nhtsaRecallsConnector.download(fetch, {});
    if (first === "unchanged") throw new Error("unchanged");

    const second = await nhtsaRecallsConnector.download(fetch, {
      etag: first.etag,
      lastModified: first.lastModified,
    });

    expect(second).toBe("unchanged");
    // The stored etag has the prefix of the version; the server gets its own etag back.
    expect(fetch.calls[1].validators).toEqual({ etag: ETAG, lastModified: MODIFIED });
    // A snapshot of another version of the reading sends no validators, so that the file is read again.
    const third = await nhtsaRecallsConnector.download(fetch, {
      etag: `k0:${ETAG}`,
      lastModified: MODIFIED,
    });
    expect(third).not.toBe("unchanged");
    expect(fetch.calls[2].validators).toEqual({});
  });

  it("asks once, for the zip, with the limits of the file", async () => {
    const fetch = fetchOf(FILE);
    await nhtsaRecallsConnector.download(fetch, {});
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe(URL);
    expect(fetch.calls[0].limits).toEqual({
      maxBytes: 67_108_864,
      allowedContentTypes: [OCTETS, "application/zip"],
      totalTimeoutMs: 120_000,
    });
  });
});

describe("what a filer's record holds", () => {
  let records: ParsedRecord[];
  let rows: RecallEntity[];

  beforeAll(async () => {
    const snapshot = await snapshotOf(FILE);
    records = nhtsaRecallsConnector.parse(snapshot).records;
    rows = bodyOf(snapshot).rows;
  });

  it("collapses the rows of one campaign into one, and says it as the template does: the typical filer", () => {
    const record = recordOf(records, "larkspurrovers");
    const row = rows.find((candidate) => candidate.id === "larkspurrovers");

    expect(row).toEqual({
      id: "larkspurrovers",
      display: "Larkspur Rovers, Inc.",
      names: ["Larkspur Rovers, Inc."],
      campaigns: 1,
      firstYear: 2025,
      lastYear: 2025,
      byYear: { "2025": 1 },
      nhtsaInfluenced: 0,
      adas: 0,
      doNotDrive: 0,
      newest: [
        {
          campno: "25V123900",
          rcdate: "2025-03-12",
          type: "V",
          component: "SERVICE BRAKES",
          potaff: 1234,
          doNotDrive: false,
        },
      ],
      publishedAt: "2025-03-12",
      anchorYear: 2026,
      fileNewestDay: "2026-09-18",
    });
    expect(record.title).toBe("NHTSA recalls: Larkspur Rovers, Inc.");
    expect(record.summary).toBe(
      "NHTSA vehicle and equipment recalls (nhtsa.gov), a product safety list. " +
        "Filer: Larkspur Rovers, Inc. " +
        "NHTSA's recalls file, which holds the campaigns reported since 2010, holds 1 campaign that it filed, reported from 2025 to 2025. " +
        "By report year: 2025 1. " +
        "Newest: 25V123900 reported 2025-03-12 (vehicle), SERVICE BRAKES, 1,234 units potentially affected. " +
        CLOSING,
    );
    // The typical record is about 560 characters.
    expect(record.summary.length).toBeGreaterThan(480);
    expect(record.summary.length).toBeLessThan(660);
    expect(record.publishedAt).toBe("2025-03-12");
    expect(record.identifiers).toEqual({
      filer: "Larkspur Rovers, Inc.",
      campaigns: 1,
      newest: ["25V123900"],
    });
    expect(record.matchKeys).toEqual(["name:larkspurroversinc", "name:larkspurrovers"]);
  });

  it("counts an automated driving filer: years, influence of NHTSA, driver assistance, do-not-drive, the newest three", () => {
    const record = recordOf(records, "borealisrobotics");
    const row = rows.find((candidate) => candidate.id === "borealisrobotics");

    expect(row).toMatchObject({
      campaigns: 4,
      firstYear: 2019,
      lastYear: 2026,
      // The four calendar years that end at the file's newest year (2026): 2022 and 2019 are not among them.
      byYear: { "2024": 1, "2026": 1 },
      nhtsaInfluenced: 2,
      adas: 2,
      doNotDrive: 1,
      publishedAt: "2026-09-18",
    });
    expect(row?.newest.map((item) => item.campno)).toEqual(["26V001900", "24V777900", "22V456900"]);
    expect(row?.newest.map((item) => item.potaff)).toEqual([17, 2_000_000, null]);
    expect(record.summary).toBe(
      "NHTSA vehicle and equipment recalls (nhtsa.gov), a product safety list. " +
        "Filer: Borealis Robotics, Inc. " +
        "NHTSA's recalls file, which holds the campaigns reported since 2010, holds 4 campaigns that it filed, reported from 2019 to 2026; " +
        "2 were influenced by NHTSA (its defects or its compliance office); " +
        "2 name a driver assistance or automated driving component; " +
        "1 carries a do-not-drive advisory. " +
        "By report year: 2026 1, 2024 1. " +
        "Newest: 26V001900 reported 2026-09-18 (vehicle), ELECTRICAL SYSTEM, 17 units potentially affected; " +
        "24V777900 reported 2024-01-10 (vehicle), LANE KEEPING ASSIST, 2,000,000 units potentially affected, do-not-drive advisory; " +
        "22V456900 reported 2022-05-04 (vehicle), FORWARD COLLISION AVOIDANCE. " +
        CLOSING,
    );
    expect(record.publishedAt).toBe("2026-09-18");
    expect(record.identifiers).toEqual({
      filer: "Borealis Robotics, Inc.",
      campaigns: 4,
      newest: ["26V001900", "24V777900", "22V456900"],
    });
  });

  it("shows no unit count for a POTAFF of 0, and names the type of an equipment campaign", async () => {
    const lines = [
      ...FILE,
      line({
        camp: "24E610900",
        filer: "Zero Units Inc.",
        comp: "CHILD SEAT",
        potaff: "0",
        rcdate: "20240601",
      }),
      line({
        camp: "24T610901",
        filer: "Zero Units Inc.",
        comp: "TIRES",
        potaff: "1",
        rcdate: "20240602",
      }),
      line({
        camp: "24C610902",
        filer: "Zero Units Inc.",
        comp: "SEAT BELT",
        potaff: "12x",
        rcdate: "20240603",
      }),
    ];

    const { records: made } = await parseOf(lines);
    const summary = recordOf(made, "zerounits").summary;

    expect(summary).toContain(
      "Newest: 24C610902 reported 2024-06-03 (child restraint), SEAT BELT; " +
        "24T610901 reported 2024-06-02 (tire), TIRES, 1 unit potentially affected; " +
        "24E610900 reported 2024-06-01 (equipment), CHILD SEAT. ",
    );
    expect(summary).not.toContain("0 units");
  });

  it("counts a campaign once for each filer that it names once, and the spelling written most often is the display", () => {
    const cinder = rows.find((candidate) => candidate.id === "cindervehicles");

    // Five campaigns: three under one spelling and two under the other; the two rows of one campaign count once.
    expect(cinder).toMatchObject({
      campaigns: 5,
      display: "Cinder Vehicles LLC",
      byYear: { "2023": 5 },
    });
    expect(cinder?.names).toEqual(["Cinder Vehicles LLC", "CINDER VEHICLES, L.L.C."]);
    expect(cinder?.newest.map((item) => item.campno)).toEqual([
      "23V200904",
      "23V200903",
      "23V200902",
    ]);
    expect(recordOf(records, "cindervehicles").matchKeys).toEqual([
      "name:cindervehiclesllc",
      "name:cindervehicles",
    ]);
  });

  it("takes the spelling that sorts first as the display when two are written as often", () => {
    const tie = rows.find((row) => row.id === "tiemotors");
    expect(tie?.display).toBe("TIE MOTORS, INC.");
    expect(tie?.names).toEqual(["TIE MOTORS, INC.", "Tie Motors Co"]);
    expect(recordOf(records, "tiemotors").title).toBe("NHTSA recalls: TIE MOTORS, INC.");
  });

  it("matches a name with a parenthesis by the whole, the text before it and the text inside it", () => {
    const keys = recordOf(records, "acmeacmemotorco").matchKeys;
    expect(keys).toEqual([
      "name:acmeacmemotorco",
      "name:acme",
      "name:acmemotorco",
      "name:acmemotor",
    ]);
    expect(recordOf(records, "acmeacmemotorco").title).toBe("NHTSA recalls: Acme (Acme Motor Co.)");
  });

  it("matches the filer by its name alone, never by a make or the maker's text", () => {
    for (const record of records) {
      expect(
        record.matchKeys.some((key) => key.includes("acmemake") || key.includes("acmemakers")),
      ).toBe(false);
    }
  });

  it("gives no record to a bare name of fewer than four compact characters", () => {
    expect(hasRecord(records, "zyx")).toBe(false);
    for (const record of records) expect(record.matchKeys.length).toBeGreaterThan(0);
  });

  it("gives a record to a name whose legal form leaves fewer than four characters when its full name has four or more: the id is the short key, the match key the full name", () => {
    expect(hasRecord(records, "abc")).toBe(true);
    expect(recordOf(records, "abc").matchKeys).toEqual(["name:abcinc"]);
    expect(recordOf(records, "abc").title).toBe("NHTSA recalls: Abc, Inc.");
    expect(rows.find((row) => row.id === "abc")).toMatchObject({
      display: "Abc, Inc.",
      names: ["Abc, Inc."],
      campaigns: 1,
    });
    // The bare name of three characters beside it has none, as before.
    expect(hasRecord(records, "zyx")).toBe(false);
  });

  it("decides on the keys that a record would have, not on the id: a bare spelling beside one that has a key is a record, keyed by that one", async () => {
    const lines = [
      ...FILE,
      line({ camp: "24V310900", filer: "Qux, Inc.", rcdate: "20240303" }),
      line({ camp: "24V310901", filer: "QUX", rcdate: "20240304" }),
      line({ camp: "24V310902", filer: "Wob (Wob Holdings)", rcdate: "20240305" }),
      line({ camp: "24V310903", filer: "Wib", rcdate: "20240306" }),
      line({ camp: "24V310904", filer: "WIB", rcdate: "20240307" }),
    ];

    const { records: made } = await parseOf(lines);

    expect(recordOf(made, "qux").matchKeys).toEqual(["name:quxinc"]);
    expect(recordOf(made, "wobwobholdings").matchKeys).toEqual([
      "name:wobwobholdings",
      "name:wobholdings",
    ]);
    // Two bare spellings of three characters: no key at all, so no record.
    expect(hasRecord(made, "wib")).toBe(false);
    for (const record of made) expect(record.matchKeys.length).toBeGreaterThan(0);
  });

  it("reads a campaign number with a letter in its sequence", () => {
    expect(rows.find((row) => row.id === "letteredmotors")?.newest[0]).toMatchObject({
      campno: "21V00A900",
      rcdate: "2021-06-15",
    });
  });

  it("never says that the filer did something wrong, and always says that a campaign is not a finding", () => {
    for (const record of records) {
      expect(record.summary).not.toMatch(/\b(violat|guilty|fault of|negligen|liable)\w*/i);
      expect(record.summary).toContain("not a finding of fault");
    }
  });

  it("writes the counts in the singular for one", async () => {
    const lines = [
      ...FILE,
      line({
        camp: "25V620900",
        filer: "Solo Sensors LLC",
        comp: "ADAS CAMERA",
        influenced: "ODI",
        noDrive: "Yes",
        rcdate: "20250401",
      }),
    ];

    const { records: made } = await parseOf(lines);

    expect(recordOf(made, "solosensors").summary).toContain(
      "holds 1 campaign that it filed, reported from 2025 to 2025; 1 was influenced by NHTSA (its defects or its compliance office); " +
        "1 names a driver assistance or automated driving component; 1 carries a do-not-drive advisory. ",
    );
  });

  it("has no clause whose count is zero and no sentence of years when none is in the window", async () => {
    const lines = [
      ...FILE,
      line({ camp: "10V630900", filer: "Olden Tires LLC", comp: "TIRES", rcdate: "20100401" }),
    ];

    const summary = recordOf((await parseOf(lines)).records, "oldentires").summary;

    expect(summary).toContain(
      "holds 1 campaign that it filed, reported from 2010 to 2010. Newest: 10V630900 reported 2010-04-01 (vehicle), TIRES, 100 units potentially affected. ",
    );
    expect(summary).not.toContain("By report year");
    expect(summary).not.toContain("influenced");
  });

  it("ranks campaigns of one day by number, the greater first, whatever the order of the file", async () => {
    const same = ["24V640901", "24V640902", "24V640903", "24V640904"].map((camp) =>
      line({ camp, filer: "Tied Newest Inc.", comp: "TIRES", rcdate: "20240301" }),
    );

    for (const lines of [
      [...FILE, ...same],
      [...FILE, ...[...same].reverse()],
    ]) {
      const { records: made } = await parseOf(lines);
      expect(recordOf(made, "tiednewest").identifiers).toEqual({
        filer: "Tied Newest Inc.",
        campaigns: 4,
        newest: ["24V640904", "24V640903", "24V640902"],
      });
    }
  });

  it("merges the rows of one campaign by rules that do not depend on their order", async () => {
    const rowsOfOne = [
      line({
        record: 8_000_001,
        camp: "25V650900",
        filer: "Merged Rows Inc.",
        comp: "STEERING",
        potaff: "500",
        influenced: "MFR",
        rcdate: "20250305",
        noDrive: "No",
      }),
      line({
        record: 8_000_002,
        camp: "25V650900",
        filer: "MERGED ROWS, INC.",
        comp: "AIR BAGS",
        potaff: "900",
        influenced: "ODI",
        rcdate: "20250301",
        noDrive: "Yes",
      }),
    ];

    for (const lines of [
      [...FILE, ...rowsOfOne],
      [...FILE, ...[...rowsOfOne].reverse()],
    ]) {
      const { records: made } = await parseOf(lines);
      const record = recordOf(made, "mergedrows");
      // The earliest report day, the POTAFF of the lowest RECORD_ID, the first component and the first spelling by text,
      // the influence and the advisory of any row.
      expect(record.title).toBe("NHTSA recalls: MERGED ROWS, INC.");
      expect(record.summary).toContain(
        "holds 1 campaign that it filed, reported from 2025 to 2025; 1 was influenced by NHTSA (its defects or its compliance office); 1 carries a do-not-drive advisory. " +
          "By report year: 2025 1. " +
          "Newest: 25V650900 reported 2025-03-01 (vehicle), AIR BAGS, 500 units potentially affected, do-not-drive advisory. ",
      );
      expect(record.publishedAt).toBe("2025-03-01");
    }
  });

  it("takes the smaller figure when two rows of a campaign share one RECORD_ID, no figure counting as the smallest, whichever comes first", async () => {
    const pair = (record: number, camp: string, filer: string, first: string, second: string) => [
      line({ record, camp, filer, comp: "TIRES", potaff: first, rcdate: "20250310" }),
      line({ record, camp, filer, comp: "TIRES", potaff: second, rcdate: "20250310" }),
    ];
    const none = pair(8_000_021, "25V652900", "Shared None Inc.", "0", "800");
    const figures = pair(8_000_022, "25V652901", "Shared Figure Inc.", "800", "300");

    for (const lines of [
      [...FILE, ...none, ...figures],
      [...FILE, ...[...none].reverse(), ...[...figures].reverse()],
    ]) {
      const { records: made } = await parseOf(lines);
      const noUnits = recordOf(made, "sharednone").summary;
      expect(noUnits).toContain("Newest: 25V652900 reported 2025-03-10 (vehicle), TIRES. ");
      expect(noUnits).not.toContain("potentially affected");
      expect(recordOf(made, "sharedfigure").summary).toContain(
        "Newest: 25V652901 reported 2025-03-10 (vehicle), TIRES, 300 units potentially affected. ",
      );
    }
  });

  it("writes a campaign that names no component without one", async () => {
    const lines = [
      ...FILE,
      line({
        camp: "25V653900",
        filer: "Bare Component Inc.",
        comp: "",
        potaff: "100",
        rcdate: "20250310",
      }),
    ];

    const { records: made } = await parseOf(lines);

    expect(recordOf(made, "barecomponent").summary).toContain(
      "Newest: 25V653900 reported 2025-03-10 (vehicle), 100 units potentially affected. ",
    );
  });

  it("says that a campaign names a driver assistance component when any of its rows does, whichever row comes first and whichever component is kept", async () => {
    const rowsOfOne = [
      line({
        record: 8_000_011,
        camp: "25V651900",
        filer: "Mixed Assist Inc.",
        comp: "AIR BAGS",
        rcdate: "20250310",
      }),
      line({
        record: 8_000_012,
        camp: "25V651900",
        filer: "Mixed Assist Inc.",
        comp: "LANE KEEPING ASSIST",
        rcdate: "20250310",
      }),
    ];

    for (const lines of [
      [...FILE, ...rowsOfOne],
      [...FILE, ...[...rowsOfOne].reverse()],
    ]) {
      const { records: made } = await parseOf(lines);
      const summary = recordOf(made, "mixedassist").summary;
      // The component that is shown is the first by text; the row of the driver assistance does not have to be that one.
      expect(summary).toContain(
        "holds 1 campaign that it filed, reported from 2025 to 2025; 1 names a driver assistance or automated driving component. ",
      );
      expect(summary).toContain("Newest: 25V651900 reported 2025-03-10 (vehicle), AIR BAGS, ");
    }
  });

  it("counts the four years that end at the newest year of the file, to the day", async () => {
    // The newest day of the file is in 2026: the window of four years is 2023 to 2026.
    const edges: Array<[string, string]> = [
      ["22V660900", "20221231"], // one day before the four years
      ["23V660901", "20230101"], // the first day of them
      ["26V660902", "20260918"], // the newest day of the file
    ];
    const lines = [
      ...FILE,
      ...edges.map(([camp, rcdate]) =>
        line({ camp, filer: "Edge Years Inc.", comp: "TIRES", rcdate }),
      ),
    ];

    const { records: made } = await parseOf(lines);

    expect(recordOf(made, "edgeyears").summary).toContain(
      "holds 3 campaigns that it filed, reported from 2022 to 2026. By report year: 2026 1, 2023 1. ",
    );
  });
});

describe("the fields that never reach a record", () => {
  it("never holds the text of the Part 573 columns, the manufacturer-supplied columns or the make, the model and the numbers of other lists", async () => {
    const snapshot = await snapshotOf(FILE);
    const { records } = nhtsaRecallsConnector.parse(snapshot);

    for (const sentinel of SENTINELS) {
      expect(snapshot.bodies[0]).not.toContain(sentinel);
      expect(JSON.stringify(records)).not.toContain(sentinel);
    }
    for (const text of [
      "example.org",
      "<b>",
      "Redundant",
      cp(0x0c),
      cp(0x92),
      cp(0x81),
      cp(0x91),
    ]) {
      expect(snapshot.bodies[0]).not.toContain(text);
    }
    // The campaign is there, and nothing of its other columns.
    expect(bodyOf(snapshot).rows.find((row) => row.id === "excludowheels")).toMatchObject({
      campaigns: 1,
    });
  });

  it("does not decode the columns it does not read: bytes that are no UTF-8 in them do not make a row unreadable", async () => {
    const garbage = (bytes: number[]): Buffer => Buffer.from(bytes);
    const rawRows: Buffer[] = [
      3, 4, 5, 6, 9, 10, 13, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29,
    ].map((field, at) => {
      const cells = line({
        camp: `25V${String(at).padStart(5, "0")}9`,
        filer: `Raw Field ${String.fromCharCode(65 + at)} Motors`,
        comp: "TIRES",
        rcdate: "20250601",
      }).split("\t");
      const parts: Buffer[] = [];
      cells.forEach((cell, index) => {
        if (index > 0) parts.push(Buffer.from("\t"));
        parts.push(index === field - 1 ? garbage([0xff, 0xfe, 0xc3, 0x28]) : Buffer.from(cell));
      });
      return Buffer.concat(parts);
    });

    const snapshot = await snapshotOf([...FILE, ...rawRows]);

    expect(bodyOf(snapshot).unreadable).toBe(0);
    expect(bodyOf(snapshot).rows).toHaveLength(1_050 + SCENARIO_ENTITIES.length + rawRows.length);
  });

  it("does not read the sentinels of ODATE and YEARTXT: they are never a date and never a year", async () => {
    const snapshot = await snapshotOf(FILE);
    const body = snapshot.bodies[0];
    // ODATE 11111111 and YEARTXT 9999 are on the campaign of the sentinel row.
    expect(body).not.toContain("11111111");
    expect(body).not.toContain("1111-11-11");
    expect(body).not.toContain("9999");
  });
});

describe("rows that name no filer", () => {
  it("are no entity, not unreadable rows, and their campaigns count for the floor", async () => {
    const placeholders = [
      "",
      "UNKNOWN MANUFACTURER",
      "Generic Manufacturer",
      "VARIOUS MANUFACTURERS",
      "Acme Parts redundant - Inactive",
    ];
    const extra = placeholders.map((filer, at) =>
      line({
        camp: `15V${String(at).padStart(5, "0")}9`,
        filer,
        comp: "TIRES",
        rcdate: "20150601",
      }),
    );

    const snapshot = await snapshotOf([...FILE, ...extra]);
    const { records, skipped, errors } = nhtsaRecallsConnector.parse(snapshot);

    expect(bodyOf(snapshot)).toMatchObject({ unreadable: 0, total: FILE.length + extra.length });
    expect(skipped).toBe(0);
    expect(errors).toBe(0);
    for (const id of ["unknownmanufacturer", "genericmanufacturer", "variousmanufacturers"]) {
      expect(hasRecord(records, id)).toBe(false);
    }
    expect(records.some((record) => record.sourceRecordId.includes("redundant"))).toBe(false);
    expect(records).toHaveLength(1_050 + SCENARIO_ENTITIES.length);
  });

  it("do not stop a file in which more than one row in five names no filer from reading with none skipped", async () => {
    const none = Array.from({ length: 6_000 }, (_, k) =>
      line({
        camp: `14V${String(k).padStart(5, "0")}9`,
        filer: k % 2 === 0 ? "" : "UNKNOWN MANUFACTURER",
        rcdate: "20140601",
      }),
    );
    const lines = [...FILE, ...none];
    expect(none.length / lines.length).toBeGreaterThan(0.2);

    const snapshot = await snapshotOf(lines);

    expect(bodyOf(snapshot)).toMatchObject({ unreadable: 0 });
    expect(nhtsaRecallsConnector.parse(snapshot)).toMatchObject({ skipped: 0, errors: 0 });
  });

  it("are no entity either when the name has no letter or digit, or is a legal form after punctuation: the row is read, its campaign counts, and nobody is named", async () => {
    const extra = ["---", "( ) / .", "- Inc.", "( ) LLC", "... Corp."].map((filer, at) =>
      line({ camp: `16VQQ00${at}9`, filer, comp: "TIRES", rcdate: "20160601" }),
    );

    const snapshot = await snapshotOf([...FILE, ...extra]);
    const { records, skipped, errors } = nhtsaRecallsConnector.parse(snapshot);

    expect(bodyOf(snapshot)).toMatchObject({ unreadable: 0, total: FILE.length + extra.length });
    expect(skipped).toBe(0);
    expect(errors).toBe(0);
    expect(records).toHaveLength(1_050 + SCENARIO_ENTITIES.length);
  });
});

describe("rows that cannot be read", () => {
  const good = (k: number, over: Partial<Fields> = {}): string =>
    line({
      camp: `20V${String(k).padStart(5, "0")}9`,
      filer: "Extra Wheels LLC",
      comp: "TIRES",
      rcdate: "20200601",
      ...over,
    });
  const cells = (k: number): string[] => good(k).split("\t");
  const withCell = (k: number, field: number, value: string): string =>
    cells(k)
      .map((cell, index) => (index === field - 1 ? value : cell))
      .join("\t");

  /** The kinds of row that the shape check refuses, each as a line or as bytes. */
  const kinds: Array<[string, (k: number) => string | Buffer]> = [
    ["a row of thirty fields", (k) => `${good(k)}\ta thirtieth field`],
    ["a row of twenty-eight fields", (k) => cells(k).slice(0, 28).join("\t")],
    ["a RECORD_ID that is no number", (k) => withCell(k, 1, "12a")],
    ["an empty RECORD_ID", (k) => withCell(k, 1, "")],
    ["a campaign number in lower case", (k) => withCell(k, 2, `20v${String(k).padStart(5, "0")}9`)],
    [
      "a campaign number that is too long",
      (k) => withCell(k, 2, `20V${String(k).padStart(5, "0")}91`),
    ],
    [
      "a campaign number with a type letter that is none",
      (k) => withCell(k, 2, `20X${String(k).padStart(5, "0")}9`),
    ],
    ["a type that is not the type letter of the campaign number", (k) => withCell(k, 11, "E")],
    ["a type that is none", (k) => withCell(k, 11, "X")],
    ["an RCDATE that is empty", (k) => withCell(k, 16, "")],
    ["an RCDATE with dashes", (k) => withCell(k, 16, "2020-06-01")],
    ["an RCDATE of a day that does not exist", (k) => withCell(k, 16, "20200231")],
    ["an RCDATE of the year 9999", (k) => withCell(k, 16, "99991231")],
    ["a filer name of 100 characters", (k) => good(k, { filer: "x".repeat(100) })],
    [
      "a filer name whose cut would fall right after a blank",
      (k) => good(k, { filer: `${"a".repeat(68)} ${"b".repeat(40)}` }),
    ],
    [
      "bytes that are no UTF-8 in the filer",
      (k) =>
        Buffer.concat(
          cells(k).flatMap((cell, index) => [
            Buffer.from(index === 0 ? "" : "\t"),
            index === 7 ? Buffer.from([0xff, 0xfe]) : Buffer.from(cell),
          ]),
        ),
    ],
    [
      "bytes of a lone surrogate (CESU-8) in the component",
      (k) =>
        Buffer.concat(
          cells(k).flatMap((cell, index) => [
            Buffer.from(index === 0 ? "" : "\t"),
            index === 6 ? Buffer.from([0xed, 0xa0, 0x80]) : Buffer.from(cell),
          ]),
        ),
    ],
  ];

  it.each(kinds)(
    "%s is skipped and counted, and the rest of the file is read",
    async (_label, make) => {
      const snapshot = await snapshotOf([...FILE, make(1)]);
      const result = nhtsaRecallsConnector.parse(snapshot);

      expect(bodyOf(snapshot)).toMatchObject({ unreadable: 1, total: FILE.length + 1 });
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.records).toHaveLength(1_050 + SCENARIO_ENTITIES.length);
    },
  );

  it("is a line past the limit of bytes as well, and a line of exactly the limit is read", async () => {
    const long = `${good(1)}\t${"z".repeat(FLAT_LINE_BYTES_MAX)}`;
    const edgeBase = withCell(2, 20, "");
    const edge = withCell(2, 20, "z".repeat(FLAT_LINE_BYTES_MAX - Buffer.byteLength(edgeBase)));
    expect(Buffer.byteLength(edge)).toBe(FLAT_LINE_BYTES_MAX);

    const snapshot = await snapshotOf([...FILE, long, edge]);

    // The long line is one unreadable row; the line of exactly the limit has the shape, and it is the DESC_DEFECT that is long.
    expect(bodyOf(snapshot).unreadable).toBe(1);
  });

  const overlong: Array<[string, string]> = [
    ["a name of 81 characters", "x".repeat(81)],
    ["a name of 100 characters", "Qz".repeat(50)],
    ["a name whose cut would fall right after a blank", `${"a".repeat(68)} ${"b".repeat(40)}`],
    [
      "a name with a pair of surrogates at the cut",
      `${"a".repeat(68)}${cp(0x1f600)}${"b".repeat(40)}`,
    ],
    // The cut never splits a pair, so a cut at one unit finds nothing in this name: it must not pass for a cell with no text.
    ["a name that begins with a pair of surrogates", `${cp(0x1f600)} ${"b".repeat(100)}`],
  ];

  it.each(overlong)(
    "reads %s as a line that cannot be read, and never as an entity, an id or a key, cut or whole",
    async (_label, filer) => {
      // The report day is later than every day of the file: a line that was read would move the day of the file.
      const bad = line({ camp: "27V000009", filer, rcdate: "20270101" });
      const before = await envelopeOfLines(FILE);
      const after = await envelopeOfLines([...FILE, bad]);

      expect(after.meta).toEqual({
        ...before.meta,
        lines: FILE.length + 1,
        rows: FILE.length + 1,
        unreadable: 1,
      });
      expect(after.entities).toEqual(before.entities);
      expect(JSON.stringify(after)).not.toContain("shortened");

      const snapshot = await snapshotOf([...FILE, bad]);
      expect(bodyOf(snapshot)).toMatchObject({ unreadable: 1, total: FILE.length + 1 });
      expect(bodyOf(snapshot).rows).toHaveLength(1_050 + SCENARIO_ENTITIES.length);
      expect(nhtsaRecallsConnector.parse(snapshot)).toMatchObject({ skipped: 1, errors: 0 });
    },
  );

  it("reads a name of exactly the cap, and a long cell that cleans to a name that fits", async () => {
    const edge = `${"Q".repeat(77)} Co`;
    const spaced = `Spaced${" ".repeat(300)}Motors${cp(0x200b).repeat(300)} Inc.`;
    expect(edge).toHaveLength(80);
    const lines = [
      ...FILE,
      line({ camp: "25V000019", filer: edge, rcdate: "20250101" }),
      line({ camp: "25V000029", filer: spaced, rcdate: "20250101" }),
    ];

    const snapshot = await snapshotOf(lines);
    const { records } = nhtsaRecallsConnector.parse(snapshot);

    expect(bodyOf(snapshot).unreadable).toBe(0);
    expect(hasRecord(records, "q".repeat(77))).toBe(true);
    expect(recordOf(records, "q".repeat(77)).title).toBe(`NHTSA recalls: ${edge}`);
    expect(recordOf(records, "spacedmotors").title).toBe("NHTSA recalls: Spaced Motors Inc.");
  });

  it("tolerates a hundredth of the lines of the file, and at least ten, and fails the sync with more: the allowance is over lines, not over filers", async () => {
    const some = (count: number): Array<string | Buffer> =>
      Array.from({ length: count }, (_, k) => kinds[k % kinds.length][1](k));
    // The most bad lines that the allowance of all the lines (the good ones and these) takes: b <= 1 percent of FILE.length + b.
    let edge = 0;
    while (edge + 1 <= unreadableAllowed(FILE.length + edge + 1)) edge += 1;
    expect(edge).toBe(Math.floor(FILE.length / 99));
    // Far more than the ten that the filers of the file alone would allow, and not a tenth of the lines.
    expect(edge).toBeGreaterThan(100);
    expect(edge).toBeLessThan(FILE.length / 20);

    for (const count of [11, edge]) {
      const snapshot = await snapshotOf([...FILE, ...some(count)]);
      expect(bodyOf(snapshot)).toMatchObject({ unreadable: count });
      expect(nhtsaRecallsConnector.parse(snapshot)).toMatchObject({ skipped: count, errors: 0 });
    }
    const over = nhtsaRecallsConnector.parse(await snapshotOf([...FILE, ...some(edge + 1)]));
    expect(over).toMatchObject({ skipped: 0, errors: edge + 1 });
  });

  it("measures the filers that the record builder refuses over the filers, never over the lines of the file", async () => {
    const snapshot = await snapshotOf(FILE);
    const body = bodyOf(snapshot);
    const allowed = unreadableAllowed(body.rows.length);
    // The lines would allow far more than the filers do: a filer that is refused is no line that cannot be read.
    expect(unreadableAllowed(FILE.length)).toBeGreaterThan(allowed + 1);
    // A body in which the first `count` filers have an id that no record can have (it holds a control character).
    const refusing = (count: number): Snapshot => ({
      ...snapshot,
      bodies: [
        JSON.stringify({
          ...body,
          rows: body.rows.map((row, at) =>
            at < count ? { ...row, id: `${row.id}${cp(1)}` } : row,
          ),
        }),
      ],
    });

    expect(nhtsaRecallsConnector.parse(refusing(allowed))).toMatchObject({
      skipped: allowed,
      errors: 0,
    });
    const over = nhtsaRecallsConnector.parse(refusing(allowed + 1));
    expect(over).toMatchObject({ skipped: 0, errors: allowed + 1 });
    expect(over.records).toHaveLength(body.rows.length - allowed - 1);
    // All of them: an error, never a list with no record that is skipped.
    expect(nhtsaRecallsConnector.parse(refusing(body.rows.length))).toMatchObject({
      skipped: 0,
      errors: body.rows.length,
      records: [],
    });
  });

  it("is not the list when more than one row in twenty has the wrong shape, and is the list when exactly one in twenty has", async () => {
    // Rows of thirty fields have the wrong shape. With L good rows, B bad ones are one in twenty at B = L / 19:
    // L is made a multiple of 19 (the file and a few good rows more), so that the edge is exact.
    const bad = (count: number) => Array.from({ length: count }, (_, k) => `${good(k)}\textra`);
    const padding = (19 - (FILE.length % 19)) % 19;
    const base = [...FILE, ...Array.from({ length: padding }, (_, k) => good(9_000 + k))];
    const edge = base.length / 19;
    expect(Number.isInteger(edge)).toBe(true);

    const at = await snapshotOf([...base, ...bad(edge)]);
    expect(bodyOf(at).unreadable).toBe(edge);
    // The file is still the list, and the allowance of a hundredth of the lines refuses it: the rows are errors.
    // Between that hundredth and one in twenty the sync fails in `parse`; above one in twenty the file is no list at all.
    expect(nhtsaRecallsConnector.parse(at)).toMatchObject({ skipped: 0, errors: edge });

    const over = await failureOf(
      nhtsaRecallsConnector.download(fetchOf([...base, ...bad(edge + 1)]), {}),
    );
    expect(over).toBeInstanceOf(NotTheListError);
  });

  it("is not the list when it is a file of another shape: a CSV with a header, text, a file of other widths, nothing", async () => {
    const csv = ["Report ID,Reporting Entity,Date", "1,Alpha Robotics LLC,2026-01-01"];
    const wide = Array.from({ length: 5_000 }, (_, k) => `${good(k)}\tx`);
    for (const lines of [csv, ["just some text"], wide, []]) {
      expect(await failureOf(nhtsaRecallsConnector.download(fetchOf(lines), {}))).toBeInstanceOf(
        NotTheListError,
      );
    }
  });

  it("takes a blank line for no row: not unreadable, no entity, and not in the total", async () => {
    const lines = [...FILE.slice(0, 100), "", ...FILE.slice(100)];

    const snapshot = await snapshotOf(lines);

    expect(bodyOf(snapshot)).toMatchObject({ unreadable: 0, total: FILE.length });
    expect(bodyOf(snapshot).rows).toEqual(bodyOf(await snapshotOf(FILE)).rows);
  });
});

describe("the window: only campaigns reported since 2010-01-01", () => {
  it("is not the list when a row is reported before 2010, or when the earliest report is not in 2010: a moved partition never withdraws records", async () => {
    const before = line({
      camp: "09V710900",
      filer: "Before Motors Inc.",
      comp: "TIRES",
      rcdate: "20091231",
    });
    expect(
      await failureOf(nhtsaRecallsConnector.download(fetchOf([...FILE, before]), {})),
    ).toBeInstanceOf(NotTheListError);

    // The same file without the campaigns of 2010: the earliest report is in 2011.
    const later = FILE.filter((entry) => !entry.split("\t")[15].startsWith("2010"));
    expect(later.length).toBeLessThan(FILE.length);
    expect(await failureOf(nhtsaRecallsConnector.download(fetchOf(later), {}))).toBeInstanceOf(
      NotTheListError,
    );
  });

  it("takes the first and the last day of 2010 as the earliest report, and no other year", async () => {
    // Every campaign of the base but the first is in or after 2011 if the 2010 ones are moved to the other end of the year.
    const moved = (day: string) =>
      FILE.map((entry) => {
        const cellsOf = entry.split("\t");
        if (cellsOf[15].startsWith("2010")) cellsOf[15] = day;
        return cellsOf.join("\t");
      });

    for (const day of ["20100101", "20101231"]) {
      expect(bodyOf(await snapshotOf(moved(day))).rows).toHaveLength(
        1_050 + SCENARIO_ENTITIES.length,
      );
    }
    for (const day of ["20091231", "20110101"]) {
      expect(
        await failureOf(nhtsaRecallsConnector.download(fetchOf(moved(day)), {})),
      ).toBeInstanceOf(NotTheListError);
    }
  });
});

describe("the floors: a file that is too small is not the list", () => {
  it("needs 10,000 campaigns (those that name a filer or not) and 1,000 filers that have a record", async () => {
    expect(NHTSA_RECALLS_FLOORS).toEqual({ campaigns: 10_000, entities: 1_000 });

    // Exactly the floors read; one campaign fewer, or one filer fewer, is not the list.
    const exact = await snapshotOf(baseLines(10_000, 1_000));
    expect(bodyOf(exact).rows).toHaveLength(1_000);

    for (const lines of [
      baseLines(9_999, 1_000),
      baseLines(10_000, 999),
      baseLines(10_200, 999),
      baseLines(999, 999),
    ]) {
      expect(await failureOf(nhtsaRecallsConnector.download(fetchOf(lines), {}))).toBeInstanceOf(
        NotTheListError,
      );
    }
  });

  it("counts every campaign of the file for the floor, those that name no filer too", async () => {
    const none = (count: number) =>
      Array.from({ length: count }, (_, k) =>
        line({
          camp: `13V${String(k).padStart(5, "0")}9`,
          filer: "",
          comp: "TIRES",
          rcdate: "20130601",
        }),
      );

    // 9,400 campaigns with a filer and 600 without: 10,000 campaigns, 1,050 filers.
    const snapshot = await snapshotOf([...baseLines(9_400, 1_050), ...none(600)]);
    expect(bodyOf(snapshot).rows).toHaveLength(1_050);

    expect(
      await failureOf(
        nhtsaRecallsConnector.download(fetchOf([...baseLines(9_400, 1_050), ...none(599)]), {}),
      ),
    ).toBeInstanceOf(NotTheListError);
  });

  it("counts a filer that has no key no more than it is: no record", async () => {
    // 1,000 filers with a record, and 5 that are none: the five do not count.
    const extra = Array.from({ length: 5 }, (_, k) =>
      line({
        camp: `12V${String(k).padStart(5, "0")}9`,
        filer: `Z${k}`,
        comp: "TIRES",
        rcdate: "20120601",
      }),
    );
    const kept = await snapshotOf([...baseLines(10_200, 1_000), ...extra]);
    expect(bodyOf(kept).rows).toHaveLength(1_000);

    expect(
      await failureOf(
        nhtsaRecallsConnector.download(fetchOf([...baseLines(10_200, 999), ...extra]), {}),
      ),
    ).toBeInstanceOf(NotTheListError);
  });
});

describe("the caps, through the spec's factory", () => {
  const withLimits = (limits: Parameters<typeof nhtsaRecallsSpec>[0]) =>
    createFileConnector(nhtsaRecallsSpec(limits));

  it("fails an entry that inflates to one byte over the cap as too large, never as a shorter list, and takes one of exactly the cap", async () => {
    const size = fileOf(FILE).length;

    expect((await snapshotOf(FILE, withLimits({ maxInflatedBytes: size }))).bodies).toHaveLength(1);
    const error = await failureOf(
      withLimits({ maxInflatedBytes: size - 1 }).download(fetchOf(FILE), {}),
    );
    expect(error).toBeInstanceOf(BodyTooLargeError);
  });

  it("fails a file one line over the cap of lines as too large, with a CRLF at its end or without", async () => {
    const lines = FILE.length;

    expect((await snapshotOf(FILE, withLimits({ maxLines: lines }))).bodies).toHaveLength(1);
    const over = await failureOf(withLimits({ maxLines: lines - 1 }).download(fetchOf(FILE), {}));
    expect(over).toBeInstanceOf(BodyTooLargeError);
    // A final line end is no line; a blank line after it is one.
    const bare = flatZip(ENTRY, fileOf(FILE, false));
    expect(
      (await withLimits({ maxLines: lines }).download(fakeFetch(served(bare)), {})) === "unchanged",
    ).toBe(false);
    const blank = zipOf([
      { name: ENTRY, data: `${fileOf(FILE).toString("utf8")}\r\n`, descriptor: true },
    ]);
    expect(
      await failureOf(withLimits({ maxLines: lines }).download(fakeFetch(served(blank)), {})),
    ).toBeInstanceOf(BodyTooLargeError);
  });

  it("fails a zip one byte over its limit as too large, and takes one of exactly the limit", async () => {
    const zip = zipOfLines(FILE);

    expect(
      (await withLimits({ maxZipBytes: zip.length }).download(fakeFetch(served(zip)), {})) !==
        "unchanged",
    ).toBe(true);
    const error = await failureOf(
      withLimits({ maxZipBytes: zip.length - 1 }).download(fakeFetch(served(zip)), {}),
    );
    expect(error).toBeInstanceOf(BodyTooLargeError);
  });

  it("does not let a directory that lies about the size bypass the count", async () => {
    const data = fileOf(FILE);
    const lying = zipOf([{ name: ENTRY, data, size: 1_000, descriptor: true }]);

    const error = await failureOf(nhtsaRecallsConnector.download(fakeFetch(served(lying)), {}));

    expect(error).toBeInstanceOf(NotTheListError);
  });

  it("fails more filers than the list can hold as too large, and takes the most that it can hold", async () => {
    const filers = (count: number) =>
      Array.from({ length: count }, (_, k) =>
        line({ camp: campOf(k), filer: `Mass ${k} Motors`, comp: "TIRES", rcdate: rcdateOf(k) }),
      );

    // 8,000 filers fit: the file is too small to be the list, which is another failure than too large.
    const fits = await failureOf(nhtsaRecallsConnector.download(fetchOf(filers(8_000)), {}));
    expect(fits).toBeInstanceOf(NotTheListError);

    const over = await failureOf(nhtsaRecallsConnector.download(fetchOf(filers(8_001)), {}));
    expect(over).toBeInstanceOf(BodyTooLargeError);
  });

  it("fails a state that grows without end as too large: more campaigns than the list can hold", async () => {
    const many = Array.from({ length: 120_001 }, (_, k) =>
      line({ camp: campOf(k), filer: entityName(k % 1_050), comp: "TIRES", rcdate: rcdateOf(k) }),
    );

    const error = await failureOf(nhtsaRecallsConnector.download(fetchOf(many), {}));

    expect(error).toBeInstanceOf(BodyTooLargeError);
  }, 90_000);
});

describe("where the file may come from", () => {
  const zip = () => zipOfLines(FILE);
  const places: Array<[string, string]> = [
    ["another host", "https://evil.example.org/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip"],
    [
      "the directory of the other NHTSA list",
      "https://static.nhtsa.gov/odi/ffdd/inv/FLAT_RCL_POST_2010.zip",
    ],
    [
      "a directory that only begins like it",
      "https://static.nhtsa.gov/odi/ffdd/rcl-other/FLAT_RCL_POST_2010.zip",
    ],
  ];

  it.each(places)("is not allowed from %s, a 200 answer or a 304", async (_label, url) => {
    const body = zip();
    const error = await failureOf(
      nhtsaRecallsConnector.download(fakeFetch(served(body, { url })), {}),
    );
    expect(error).toBeInstanceOf(FetchError);
    expect(error).toMatchObject({ reason: "not_allowed" });
    expect(String((error as Error).message)).not.toContain("evil");

    const stored = await failureOf(
      nhtsaRecallsConnector.download(fakeFetch(served(body, { url })), { etag: `k1:${ETAG}` }),
    );
    expect(stored).toMatchObject({ name: "FetchError", reason: "not_allowed" });
  });

  it("fails a zip that the page guard says it cut as too large", async () => {
    const error = await failureOf(
      nhtsaRecallsConnector.download(fakeFetch(served(zip(), { truncated: true })), {}),
    );
    expect(error).toBeInstanceOf(BodyTooLargeError);
  });

  it("is not the list when the zip is not the one deflated entry of that name", async () => {
    const data = fileOf(FILE);
    const refused: Array<[string, Buffer]> = [
      [
        "two entries",
        zipOf([
          { name: ENTRY, data },
          { name: "OTHER.txt", data: "x" },
        ]),
      ],
      ["an encrypted entry", zipOf([{ name: ENTRY, data, flags: 0x0801 }])],
      ["a Zip64 marker", zipOf([{ name: ENTRY, data, zip64Sizes: true }])],
      ["a stored entry", zipOf([{ name: ENTRY, data, method: 0 }])],
      ["another name", zipOf([{ name: "FLAT_INV.txt", data }])],
      ["a CRC that does not hold", zipOf([{ name: ENTRY, data, crc: 7 }])],
      ["a page of HTML", Buffer.from("<html>not found</html>")],
    ];
    for (const [, body] of refused) {
      expect(
        await failureOf(nhtsaRecallsConnector.download(fakeFetch(served(body)), {})),
      ).toBeInstanceOf(NotTheListError);
    }
  });
});

describe("the text of a record", () => {
  it("anchors the years on the newest report of the file, never on the clock: the same file read on two days gives the same body and records", async () => {
    const everything = [
      "Date",
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ] as const;
    const doNotFake = everything.filter((name) => name !== "Date");
    const reads: Array<{ bodies: string[]; records: ParsedRecord[] }> = [];
    try {
      for (const now of ["2026-11-10T12:00:00Z", "2031-02-03T04:05:06Z"]) {
        jest.useFakeTimers({ now: new Date(now), doNotFake: [...doNotFake] });
        const snapshot = await snapshotOf(FILE);
        reads.push({
          bodies: snapshot.bodies,
          records: nhtsaRecallsConnector.parse(snapshot).records,
        });
      }
    } finally {
      jest.useRealTimers();
    }

    expect(reads[1].bodies).toEqual(reads[0].bodies);
    expect(reads[1].records).toEqual(reads[0].records);
    // The count back from 2026, the year of the newest report in the file, and not from 2031.
    expect(
      reads[1].records.find((record) => record.sourceRecordId === "borealisrobotics")?.summary,
    ).toContain("By report year: 2026 1, 2024 1.");
  });

  it("is at most 1,300 characters in the worst case, and still ends with the closing sentence", () => {
    const spec = nhtsaRecallsSpec();
    const longName = `${"Vantage ".repeat(9)}Vantage.`;
    expect(longName).toHaveLength(80);
    const item = (n: number) => ({
      campno: `26C${String(100900 + n)}`,
      rcdate: "2026-09-18",
      type: "C" as const,
      component: "ELECTRICAL SYSTEM: ".repeat(6).slice(0, 112).trim(),
      potaff: 999_999_999,
      doNotDrive: true,
    });
    const worst: RecallEntity = {
      id: "vantage",
      display: longName,
      names: [longName],
      campaigns: 809,
      firstYear: 2010,
      lastYear: 2026,
      byYear: { "2023": 123, "2024": 124, "2025": 125, "2026": 126 },
      nhtsaInfluenced: 123,
      adas: 45,
      doNotDrive: 88,
      newest: [item(1), item(2), item(3)],
      publishedAt: "2026-09-18",
      anchorYear: 2026,
      fileNewestDay: "2026-09-18",
    };

    const [record] = spec.toRecords([worst]);

    expect(record.summary.length).toBeLessThanOrEqual(1_300);
    expect(record.summary.length).toBeGreaterThan(1_100);
    expect(record.summary.endsWith(CLOSING)).toBe(true);
    // Every clause is there, the name keeps its one full stop, and the cut cells say they were cut.
    expect(record.summary).toContain(`Filer: ${longName} NHTSA's recalls file`);
    expect(record.summary).toContain(
      "; 123 were influenced by NHTSA (its defects or its compliance office); 45 name a driver assistance or automated driving component; 88 carry a do-not-drive advisory.",
    );
    expect(record.summary).toContain("By report year: 2026 126, 2025 125, 2024 124, 2023 123.");
    expect(record.summary).toContain("(child restraint)");
    expect(record.summary).toContain(
      "999,999,999 units potentially affected, do-not-drive advisory",
    );
    expect(record.summary).toContain(" [shortened]");
  });

  it("cuts the sentences before the closing one, never the closing one, when a text is too long", () => {
    const spec = nhtsaRecallsSpec();
    const row: RecallEntity = {
      id: "huge",
      // A row's display has 80 characters at most; this one is far past it and still fits the identifiers' 2,000.
      display: "H".repeat(1_500),
      names: ["Huge Motors"],
      campaigns: 1,
      firstYear: 2020,
      lastYear: 2020,
      byYear: { "2020": 1 },
      nhtsaInfluenced: 0,
      adas: 0,
      doNotDrive: 0,
      newest: [
        {
          campno: "20V000901",
          rcdate: "2020-01-01",
          type: "V",
          component: "TIRES",
          potaff: null,
          doNotDrive: false,
        },
      ],
      publishedAt: "2020-01-01",
      anchorYear: 2020,
      fileNewestDay: "2020-01-01",
    };

    const [record] = spec.toRecords([row]);

    expect(record.summary).toHaveLength(1_300);
    expect(record.summary.endsWith(CLOSING)).toBe(true);
    expect(
      record.summary.startsWith(
        "NHTSA vehicle and equipment recalls (nhtsa.gov), a product safety list. ",
      ),
    ).toBe(true);
    expect(record.summary).toContain("[shortened]");
  });
});

describe("hostile cells", () => {
  const hostileName = `Hostile${cp(0x07)} Motors${cp(0x202e)} <script>alert(1)</script> Inc.`;

  it("are cleaned: controls and bidirectional characters out, angle brackets written as quotation marks, a cell of 100 KB cut", async () => {
    const big = "S".repeat(100_000);
    const lines = [
      ...FILE,
      line({
        camp: "25V810900",
        filer: hostileName,
        comp: `TI${cp(0x0b)}RES${big}`,
        rcdate: "20250601",
      }),
      line({
        camp: "25V810901",
        filer: hostileName,
        comp: `Part <b>bold</b>${cp(0x202e)} text`,
        rcdate: "20250602",
      }),
    ];

    const snapshot = await snapshotOf(lines);
    const result = nhtsaRecallsConnector.parse(snapshot);
    const hostile = result.records.find((record) =>
      record.title.startsWith("NHTSA recalls: Hostile"),
    );

    expect(hostile).toBeDefined();
    expect(bodyOf(snapshot).unreadable).toBe(0);
    expectWellFormedRecords(result.records, {
      sourceId: "nhtsa_recalls",
      mark: NHTSA_RECALLS_RECORD_MARK,
    });
    const display = `Hostile Motors ${cp(0x2039)}script${cp(0x203a)}alert(1)${cp(0x2039)}/script${cp(0x203a)} Inc.`;
    expect(hostile?.title).toBe(`NHTSA recalls: ${display}`);
    expect(hostile?.summary).not.toMatch(/[<>]/);
    expect(hostile?.summary).not.toMatch(/\p{Cc}/u);
    expect(hostile?.summary).not.toContain(cp(0x202e));
    expect(hostile?.summary).toContain("[shortened]");
    // Nothing of the 100 KB cell is stored beyond its cap.
    expect(snapshot.bodies[0].length).toBeLessThan(5_000_000);
    expect(snapshot.bodies[0]).not.toContain("S".repeat(200));
    // The name is a business: its key has the letters and digits of the cleaned name and no markup.
    expect(hostile?.matchKeys.every((key) => /^name:[\p{L}\p{N}]+$/u.test(key))).toBe(true);
  });

  it("keep a name that a second cleaning would change: the list is not refused for it", async () => {
    // A soft hyphen between a letter and a combining mark is dropped by the cleaning, which leaves the mark loose;
    // cleaning the line again would compose them. The download cleans a name once, and the reader of it takes the line as written.
    const lines = [
      ...FILE,
      line({
        camp: "25V670900",
        filer: `Zeta${cp(0x00ad, 0x0308)} Motors Inc.`,
        comp: "TIRES",
        rcdate: "20250601",
      }),
    ];

    const snapshot = await snapshotOf(lines);
    const { records } = nhtsaRecallsConnector.parse(snapshot);

    expect(bodyOf(snapshot).rows.find((row) => row.id === "zetamotors")?.display).toBe(
      `Zeta${cp(0x0308)} Motors Inc.`,
    );
    expect(hasRecord(records, "zetamotors")).toBe(true);
  });

  it("do not make a name a person: a name that has the shape of one is a business here", async () => {
    // No person occurs among the 1,947 filers of the real file, and name-shape rules had no precision: no filter is applied.
    const lines = [
      ...FILE,
      line({ camp: "25V820900", filer: "Jane Q Sample", comp: "TIRES", rcdate: "20250601" }),
    ];
    const { records } = await parseOf(lines);
    expect(hasRecord(records, "janeqsample")).toBe(true);
  });
});

describe("the reader of the download's JSON", () => {
  const spec = nhtsaRecallsSpec();
  let meta: Record<string, unknown>;
  let entities: Array<Record<string, unknown>>;

  const fetchedOf = (buffer: Buffer): Fetched => ({
    buffers: [buffer],
    contentTypes: [ENVELOPE_CONTENT_TYPE],
    etag: null,
    lastModified: null,
    bytes: buffer.length,
  });

  /** The JSON that the download of the happy path hands to `read`, taken from a real run. */
  beforeAll(async () => {
    const own = spec.fetchFiles;
    if (own === undefined) throw new Error("The spec has no fetch of its own.");
    const fetched = await own.call(spec, fetchOf(FILE), {});
    if (fetched === "unchanged") throw new Error("unchanged");
    const parsed = JSON.parse(fetched.buffers[0].toString("utf8")) as {
      meta: Record<string, unknown>;
      entities: Array<Record<string, unknown>>;
    };
    meta = parsed.meta;
    entities = parsed.entities;
  });

  const readOf = (m: Record<string, unknown>, e: unknown[]) =>
    spec.read(fetchedOf(envelopeOf(m, e as object[])));

  it("is the list for what a download makes, and counts as the download did", () => {
    expect(meta).toMatchObject({
      anchorYear: 2026,
      fileNewestDay: "2026-09-18",
      earliestRcdate: "2010-01-01",
      lines: FILE.length,
      blankLines: 0,
      rows: FILE.length,
      unreadable: 0,
    });
    expect(Number(meta.campaigns)).toBe(10_200 + SCENARIO_CAMPAIGNS);
    // The meta counts all the filers, those that get no record included: the short name.
    expect(meta.entities).toBe(entities.length);
    expect(entities.length).toBe(1_050 + SCENARIO_FILERS);

    const result = readOf(meta, entities);

    expect(result).not.toBeNull();
    expect(result?.complete).toBe(true);
    expect(result?.rows).toHaveLength(1_050 + SCENARIO_ENTITIES.length);
    expect(result?.total).toBe(FILE.length);
    expect(result?.allowanceBasis).toBe(FILE.length);
    expect(result?.unreadable).toBe(0);
    // The file's year and day are on every row, since a record is made of one row.
    expect(
      result?.rows.every((row) => row.anchorYear === 2026 && row.fileNewestDay === "2026-09-18"),
    ).toBe(true);
  });

  it("is incomplete, and so is too large for the kit, when what it counted is not what it holds", () => {
    const incomplete = (m: Record<string, unknown>, e: unknown[]) => {
      const result = readOf(m, e);
      expect(result).not.toBeNull();
      expect(result?.complete).toBe(false);
    };
    incomplete({ ...meta, entities: entities.length + 1 }, entities);
    incomplete({ ...meta, entities: entities.length - 1 }, entities);
    // A line that was given and not counted: the reducer lost one.
    incomplete({ ...meta, lines: Number(meta.lines) + 1 }, entities);
    incomplete({ ...meta, blankLines: 3 }, entities);
    // More filers than the list can hold: the backstop of the reducer's own throw, which only an envelope that a download never writes can reach.
    const many = Array.from({ length: 8_001 }, () => entities[0]);
    incomplete({ ...meta, entities: 8_001 }, many);
  });

  it("is not the list when the floors, the shape or the window are not met", () => {
    expect(readOf({ ...meta, campaigns: 9_999 }, entities)).toBeNull();
    expect(readOf(meta, entities.slice(0, 999))).toBeNull();
    expect(readOf({ ...meta, entities: 999 }, entities.slice(0, 999))).toBeNull();
    expect(readOf({ ...meta, rows: 1_000, lines: 1_000, unreadable: 51 }, entities)).toBeNull();
    for (const earliestRcdate of ["2009-12-31", "2011-01-01", null, "2010-02-30", 5]) {
      expect(readOf({ ...meta, earliestRcdate }, entities)).toBeNull();
    }
    expect(readOf({ ...meta, earliestRcdate: "2010-12-31" }, entities)).not.toBeNull();
  });

  const newestItem = (row: Record<string, unknown>): Record<string, unknown> =>
    (row.newest as Array<Record<string, unknown>>)[0];
  const damaged: Array<[string, (row: Record<string, unknown>) => Record<string, unknown>]> = [
    ["an id that is no compact name", (row) => ({ ...row, id: "Not Compact" })],
    ["an id that is no text", (row) => ({ ...row, id: 5 })],
    ["a display that is empty", (row) => ({ ...row, display: "" })],
    ["a display with an angle bracket", (row) => ({ ...row, display: "A <b> Inc." })],
    ["a display of 81 characters", (row) => ({ ...row, display: "d".repeat(81) })],
    ["names that are not a list", (row) => ({ ...row, names: "Acme" })],
    ["no names", (row) => ({ ...row, names: [] })],
    ["six names", (row) => ({ ...row, names: ["a1", "b2", "c3", "d4", "e5", "f6"] })],
    ["a name that is not of this filer", (row) => ({ ...row, names: ["Other Name Inc."] })],
    [
      "a spelling of the filer that is not the display first",
      (row) => {
        // The only damage is the order: the spelling is one of this filer, and it is not the display.
        const spelling = String(row.display).toUpperCase();
        expect(spelling).not.toBe(row.display);
        expect(entityKeyOf(spelling)).toBe(row.id);
        return { ...row, names: [spelling] };
      },
    ],
    ["no campaigns", (row) => ({ ...row, campaigns: 0 })],
    ["a count with a fraction", (row) => ({ ...row, adas: 1.5 })],
    [
      "more influenced than campaigns",
      (row) => ({ ...row, nhtsaInfluenced: Number(row.campaigns) + 1 }),
    ],
    [
      "more advisories than campaigns",
      (row) => ({ ...row, doNotDrive: Number(row.campaigns) + 1 }),
    ],
    ["a first year after the last", (row) => ({ ...row, firstYear: 2025, lastYear: 2020 })],
    ["a first year without a last", (row) => ({ ...row, firstYear: 2020, lastYear: null })],
    ["no years at all", (row) => ({ ...row, firstYear: null, lastYear: null })],
    ["a year out of the years of a list", (row) => ({ ...row, firstYear: 1800 })],
    ["a year outside the four of the window", (row) => ({ ...row, byYear: { "2000": 1 } })],
    ["a count by year that is zero", (row) => ({ ...row, byYear: { "2025": 0 } })],
    ["counts by year that are no object", (row) => ({ ...row, byYear: [] })],
    [
      "four newest campaigns",
      (row) => ({ ...row, newest: Array.from({ length: 4 }, () => newestItem(row)) }),
    ],
    ["no newest campaign", (row) => ({ ...row, newest: [] })],
    ["a newest item that is null", (row) => ({ ...row, newest: [null] })],
    ["a newest item that is a list", (row) => ({ ...row, newest: [[]] })],
    [
      "a newest item with a number that fails the pattern",
      (row) => ({ ...row, newest: [{ ...newestItem(row), campno: "bad" }] }),
    ],
    [
      "a newest item with a type that is not the letter of its number",
      (row) => ({ ...row, newest: [{ ...newestItem(row), type: "X" }] }),
    ],
    [
      "a newest item with a day that does not exist",
      (row) => ({ ...row, newest: [{ ...newestItem(row), rcdate: "2025-02-30" }] }),
    ],
    [
      "a newest item with no day",
      (row) => ({ ...row, newest: [{ ...newestItem(row), rcdate: null }] }),
    ],
    [
      "a newest item with a component of 113 characters",
      (row) => ({ ...row, newest: [{ ...newestItem(row), component: "c".repeat(113) }] }),
    ],
    [
      "a newest item with a component that is no text",
      (row) => ({ ...row, newest: [{ ...newestItem(row), component: 5 }] }),
    ],
    [
      "a newest item with a unit count of zero",
      (row) => ({ ...row, newest: [{ ...newestItem(row), potaff: 0 }] }),
    ],
    [
      "a newest item with a unit count past a billion",
      (row) => ({ ...row, newest: [{ ...newestItem(row), potaff: 1_000_000_000 }] }),
    ],
    [
      "a newest item with an advisory that is no boolean",
      (row) => ({ ...row, newest: [{ ...newestItem(row), doNotDrive: "Yes" }] }),
    ],
    ["a day of publication that does not exist", (row) => ({ ...row, publishedAt: "2026-13-01" })],
    ["no day of publication", (row) => ({ ...row, publishedAt: null })],
    ["a row with no field at all", () => ({}) as Record<string, unknown>],
    ["a row that is null", () => null as unknown as Record<string, unknown>],
    ["a row that is a list", () => [] as unknown as Record<string, unknown>],
    ["a row that is a number", () => 5 as unknown as Record<string, unknown>],
  ];

  it.each(damaged)("is not the list for %s", (_label, damage) => {
    const row = damage(entities[0]);
    expect(readOf(meta, [row, ...entities.slice(1)])).toBeNull();
  });

  it("has no version for a list with no row", () => {
    expect(spec.sourceVersion?.([])).toBeNull();
    expect(spec.sourceVersion?.(readOf(meta, entities)?.rows ?? [])).toBe("2026-09-18");
  });

  it("is not the list for a file that is no JSON of a download", () => {
    expect(spec.read(fetchedOf(Buffer.from("<html>")))).toBeNull();
    expect(spec.read(fetchedOf(Buffer.from('{"v":1,"meta":{},"entities":[]}')))).toBeNull();
    expect(spec.read({ ...fetchedOf(Buffer.from("{}")), buffers: [] })).toBeNull();
  });
});

describe("a read that streams: a file of 40 MB inflated is never held", () => {
  const TARGET_BYTES = 40_000_000;
  let zip: Buffer;
  let inflatedBytes = 0;
  let lineCount = 0;

  beforeAll(() => {
    const parts: Buffer[] = [];
    const text = "Invented long defect text for the memory test of the reader. ".repeat(10);
    for (let n = 0; inflatedBytes < TARGET_BYTES || n < 20_400; n += 1) {
      const campaign = Math.floor(n / 2);
      const part = Buffer.from(
        `${line({
          camp: campOf(campaign),
          filer: entityName(campaign % 1_050),
          comp: COMPONENTS[n % COMPONENTS.length],
          rcdate: rcdateOf(campaign),
          desc: text,
          consequence: text,
          action: text,
        })}\r\n`,
      );
      parts.push(part);
      inflatedBytes += part.length;
      lineCount += 1;
    }
    zip = flatZip(ENTRY, Buffer.concat(parts));
  }, 120_000);

  it("is a zip of 40 MB inflated that is far smaller, of more than 10,000 campaigns", () => {
    expect(inflatedBytes).toBeGreaterThan(40_000_000);
    expect(zip.length).toBeLessThan(inflatedBytes / 10);
    expect(lineCount).toBeGreaterThan(20_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** What the log of `observed` holds for a line that reached the reducer; a piece of the entry is its (positive) size. */
  const LINE = -1;

  const largest = (sizes: readonly number[]): number =>
    sizes.reduce((most, size) => Math.max(most, size), 0);

  /** The most inflated bytes that `streamZipEntry` hands out at a time: the size of the inflater's own buffer. */
  const PIECE_BYTES = 65_536;

  /**
   * Watches the buffers that are allocated or joined from now on (`Buffer.alloc`, `Buffer.allocUnsafe`,
   * `Buffer.allocUnsafeSlow` and `Buffer.concat`, which is what a reader that holds the entry calls),
   * and gives their sizes when asked. The spies call through; `jest.restoreAllMocks` takes them off.
   */
  function watchBuffers(): () => number[] {
    const joined = jest.spyOn(Buffer, "concat");
    const alloc = jest.spyOn(Buffer, "alloc");
    const allocUnsafe = jest.spyOn(Buffer, "allocUnsafe");
    const allocUnsafeSlow = jest.spyOn(Buffer, "allocUnsafeSlow");
    return () => [
      ...joined.mock.results.map((result) => (result.type === "return" ? result.value.length : 0)),
      ...alloc.mock.calls.map(([size]) => size),
      ...allocUnsafe.mock.calls.map(([size]) => size),
      ...allocUnsafeSlow.mock.calls.map(([size]) => size),
    ];
  }

  /**
   * Downloads the zip with spies that write down the ORDER of the work, with no clock and no heap in
   * it: each piece of the entry that `streamZipEntry` hands out goes in the log as its size, and each
   * line that the reducer takes up as LINE (`tabFieldsOf` is the first thing that it does with a
   * line, so a reader that gathers the lines and reduces them afterwards is seen), in the order they
   * happen. The sizes of the buffers that are made, and the calls of the readers of a zip that hold a
   * whole entry, are counted. Every spy calls through.
   */
  async function observed() {
    const log: number[] = [];
    const streamZipEntry = zipModule.streamZipEntry;
    const tabFieldsOf = streamModule.tabFieldsOf;
    jest
      .spyOn(zipModule, "streamZipEntry")
      .mockImplementation((buffer, accept, limits, onChunk, options) =>
        streamZipEntry(
          buffer,
          accept,
          limits,
          (chunk) => {
            log.push(chunk.length);
            onChunk(chunk);
          },
          options,
        ),
      );
    jest.spyOn(streamModule, "tabFieldsOf").mockImplementation((...args) => {
      log.push(LINE);
      return tabFieldsOf(...args);
    });
    const holders = [
      jest.spyOn(zipModule, "forEachZipEntry"),
      jest.spyOn(zipModule, "readZip"),
      jest.spyOn(zipModule, "readZipFile"),
    ];
    const sizes = watchBuffers();

    const snapshot = await nhtsaRecallsConnector.download(fakeFetch(served(zip)), {});
    if (snapshot === "unchanged") throw new Error("unchanged");
    return {
      snapshot,
      log,
      sizes: sizes(),
      holderCalls: holders.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    };
  }

  it("hands the lines to the reducer while the entry is still being inflated: the first before a quarter of it exists, and half of them by the time half of it does", async () => {
    const { snapshot, log } = await observed();

    const pieces = log.filter((entry) => entry > 0);
    expect(pieces.reduce((sum, size) => sum + size, 0)).toBe(inflatedBytes);
    // Many pieces, none above what the inflater is given at a time.
    expect(pieces.length).toBeGreaterThan(4);
    expect(largest(pieces)).toBeLessThanOrEqual(PIECE_BYTES);

    let produced = 0;
    let lines = 0;
    let producedAtFirstLine = -1;
    let linesAtHalf = -1;
    for (const entry of log) {
      if (entry === LINE) {
        lines += 1;
        if (producedAtFirstLine < 0) producedAtFirstLine = produced;
      } else {
        produced += entry;
        if (linesAtHalf < 0 && produced >= inflatedBytes / 2) linesAtHalf = lines;
      }
    }
    expect(lines).toBe(lineCount);
    expect(producedAtFirstLine).toBeGreaterThan(0);
    expect(producedAtFirstLine).toBeLessThanOrEqual(inflatedBytes / 4);
    expect(linesAtHalf).toBeGreaterThanOrEqual(lineCount * 0.45);
    // And what came out of it is the whole list, read as it came.
    expect(bodyOf(snapshot).rows).toHaveLength(1_050);
    expect(bodyOf(snapshot).total).toBe(lineCount);
  }, 120_000);

  it("never allocates or joins a buffer of the size of the entry, and never calls a reader that holds a whole entry", async () => {
    const { sizes, holderCalls } = await observed();

    // The pieces of the inflater and the small buffers of the JSON: far below the 40 MB of the entry, and below the zip.
    expect(largest(sizes)).toBeLessThan(inflatedBytes / 10);
    expect(holderCalls).toBe(0);
  }, 120_000);

  it("sees a buffer of the size of the entry when one is made, and a reader of a whole zip when one is called: the spies are live", async () => {
    const sizes = watchBuffers();
    Buffer.concat([Buffer.alloc(3_000_000), Buffer.alloc(2_000_000)]);
    Buffer.allocUnsafe(1_000_000);
    Buffer.allocUnsafeSlow(500_000);
    expect(sizes()).toEqual(
      expect.arrayContaining([3_000_000, 2_000_000, 5_000_000, 1_000_000, 500_000]),
    );

    const reader = jest.spyOn(zipModule, "readZip");
    expect(() =>
      zipModule.readZip(Buffer.alloc(8), () => true, {
        maxEntries: 1,
        maxEntryBytes: 1,
        maxTotalBytes: 1,
      }),
    ).toThrow();
    expect(reader).toHaveBeenCalledTimes(1);
  });
});
