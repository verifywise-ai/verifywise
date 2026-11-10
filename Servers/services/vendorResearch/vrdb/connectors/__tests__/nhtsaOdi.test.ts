/**
 * The NHTSA defect investigations list (nhtsa_odi): one static zip whose single entry, FLAT_INV.txt,
 * is a TAB-delimited text of 11 fields with no header row (154,460 lines and 390.6 MB inflated
 * today), read as a stream and turned into one record per MANUFACTURER. Every file here is invented:
 * the names are made up, the numbers and the texts too, and the zips are written by the test
 * (helpers/zipFixtures.ts). The real file's quirks that matter are reproduced in the fixtures: no
 * header, no final line feed, general purpose bit 3 and a data descriptor, an investigation of many
 * rows (components, makes), one that names two manufacturers, rows with no manufacturer, the
 * placeholder names, an empty close date, a SUMMARY with controls and a person, and a name with a
 * parenthesis. Every field that must stay out carries a marker (SENTINEL) that no record may hold.
 * No network.
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
  NHTSA_ODI_FLOORS,
  NHTSA_ODI_RECORD_MARK,
  type OdiEntity,
  nhtsaOdiConnector,
  nhtsaOdiSpec,
} from "../nhtsaOdi";
import { BodyTooLargeError, type Connector, NotTheListError, type Snapshot } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";
import { flatZip, zipOf } from "./helpers/zipFixtures";

jest.setTimeout(30_000);

const URL = "https://static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip";
const ENTRY = "FLAT_INV.txt";
const OCTETS = "application/octet-stream";
const ETAG = '"odi-1"';
const MODIFIED = "Tue, 03 Mar 2026 14:20:05 GMT";
const MIB = 1_048_576;

const CLOSING =
  "An investigation is not a finding that a defect exists; the list holds an entry for the manufacturer. Not endorsed by NHTSA; adapted by VerifyWise from NHTSA's flat file.";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

// ---------------------------------------------------------------------------------------------
// The file: lines of 11 TAB-separated fields, no header, LF, no final line feed.
// ---------------------------------------------------------------------------------------------

interface Fields {
  id: string;
  make?: string;
  model?: string;
  year?: string;
  comp?: string;
  mfr?: string;
  odate?: string;
  cdate?: string;
  camp?: string;
  subject?: string;
  summary?: string;
}

/** A line of the file; a field that a test does not care about has a default, and an empty manufacturer names no entity. */
const line = (f: Fields): string =>
  [
    f.id,
    f.make ?? "ACME MAKE",
    f.model ?? "MODEL Q9",
    f.year ?? "2020",
    f.comp ?? "SERVICE BRAKES",
    f.mfr ?? "",
    f.odate ?? "",
    f.cdate ?? "",
    f.camp ?? "",
    f.subject ?? "SUBJECT TEXT",
    f.summary ?? "Invented detail text of the investigation.",
  ].join("\t");

const day = (year: number, month: number, date: number): string =>
  `${year}${String(month).padStart(2, "0")}${String(date).padStart(2, "0")}`;

/** The two letters that open the ids the generators make: letters that no id of the real file begins with, so that no generated id is a real one. */
const TYPES = ["ZA", "ZB", "ZC", "ZD", "ZE"];
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
const LEGAL = ["Inc.", "LLC", "Corp."];

/** The invented name of base entity `i` (450 of them: 18 first words by 25 second words). */
const entityName = (i: number): string =>
  `${PREFIXES[i % PREFIXES.length]} ${SUFFIXES[Math.floor(i / PREFIXES.length) % SUFFIXES.length]} ${LEGAL[i % LEGAL.length]}`;

/** The id of investigation `k`: two letters, the year, three digits; unique for 4,990,000 of them. */
function idOf(k: number): string {
  const rest = Math.floor(k / TYPES.length);
  return `${TYPES[k % TYPES.length]}${String(10 + Math.floor(rest / 999)).padStart(2, "0")}${String((rest % 999) + 1).padStart(3, "0")}`;
}

/**
 * A list that meets the floors: `investigations` investigations of one to three rows each, spread over
 * `entities` manufacturers, opened 2012 to 2023 and closed 2013 to 2024 (one in seven has no close date).
 */
function baseLines(investigations = 4_200, entities = 450): string[] {
  const lines: string[] = [];
  for (let n = 0; n < investigations; n += 1) {
    const id = idOf(n);
    const mfr = entityName(n % entities);
    const odate = day(2012 + (n % 12), 1 + (n % 12), 1 + (n % 28));
    const cdate = n % 7 === 0 ? "" : day(2013 + (n % 12), 1 + ((n + 3) % 12), 1 + ((n + 5) % 28));
    for (let r = 0; r < 1 + (n % 3); r += 1) {
      lines.push(
        line({
          id,
          comp: COMPONENTS[(n + r) % COMPONENTS.length],
          mfr,
          odate,
          cdate,
          camp: n % 4 === 0 ? `${id.slice(2, 4)}V${String(n % 1000).padStart(3, "0")}900` : "",
          subject: `BASE SUBJECT ${n}`,
        }),
      );
    }
  }
  return lines;
}

/** Old investigations that name no manufacturer (1,278 of the real file's 5,357 do), one row each. */
function noEntityLines(count: number): string[] {
  return Array.from({ length: count }, (_, k) =>
    line({
      id: `${TYPES[k % 5]}${String(70 + (Math.floor(k / 5) % 28))}${String(1 + (Math.floor(k / 140) % 999)).padStart(3, "0")}`,
      mfr: k % 10 === 0 ? "UNKNOWN MANUFACTURER" : "",
      odate: k % 3 === 0 ? "" : day(1980 + (k % 18), 1 + (k % 12), 1 + (k % 28)),
      cdate: day(1991 + (k % 7), 1 + (k % 12), 1 + (k % 28)),
    }),
  );
}

const SENTINELS = ["Zorblatt", "555-0147", "SENTINEL-MAKE", "SENTINEL-MODEL", "CAMPSENTINEL9"];

/** The investigations that the tests look at, each with the manufacturer, the dates and the texts the test expects. */
const SCENARIO: string[] = [
  // One investigation of three rows (two components, the more frequent is SERVICE BRAKES).
  line({
    id: "PE25340",
    comp: "SERVICE BRAKES",
    mfr: "Larkspur Rovers, Inc.",
    odate: "20250312",
    cdate: "20250911",
    subject: "BRAKE PEDAL TRAVEL",
    model: "MODEL A",
  }),
  line({
    id: "PE25340",
    comp: "SERVICE BRAKES",
    mfr: "Larkspur Rovers, Inc.",
    odate: "20250312",
    cdate: "20250911",
    subject: "BRAKE PEDAL TRAVEL",
    model: "MODEL B",
  }),
  line({
    id: "PE25340",
    comp: "STEERING",
    mfr: "Larkspur Rovers, Inc.",
    odate: "20250312",
    cdate: "20250911",
    subject: "BRAKE PEDAL TRAVEL",
    model: "MODEL C",
  }),
  // An automated driving manufacturer: four investigations, two linked to a campaign, two with no close date, two on driver assistance.
  line({
    id: "EA22330",
    comp: "ADAPTIVE CRUISE CONTROL",
    mfr: "Borealis Robotics, Inc.",
    odate: "20220301",
    camp: "22V123900",
    subject: "CRUISE CONTROL SPEED DEVIATION",
  }),
  line({
    id: "PE24390",
    comp: "FORWARD COLLISION AVOIDANCE",
    mfr: "Borealis Robotics, Inc.",
    odate: "20240110",
    cdate: "20241120",
    subject: "UNEXPECTED BRAKING",
  }),
  line({
    id: "PE26330",
    comp: "ELECTRICAL SYSTEM",
    mfr: "Borealis Robotics, Inc.",
    odate: "20260918",
    subject: "UNKNOWN",
  }),
  line({
    id: "DP19320",
    comp: "AIR BAGS",
    mfr: "Borealis Robotics, Inc.",
    odate: "20190405",
    cdate: "20200203",
    camp: "19V555900",
    subject: "AIR BAG DEPLOYMENT",
  }),
  // One investigation that names two manufacturers; and two spellings of one name, one investigation naming both.
  line({
    id: "DP23350",
    comp: "TIRES",
    mfr: "Cinder Vehicles LLC",
    odate: "20230220",
    cdate: "20230930",
    subject: "TIRE SEPARATION",
  }),
  line({
    id: "DP23350",
    comp: "TIRES",
    mfr: "Dapple Trucks, Inc.",
    odate: "20230220",
    cdate: "20230930",
    subject: "TIRE SEPARATION",
  }),
  line({
    id: "PE23360",
    comp: "TIRES",
    mfr: "CINDER VEHICLES, L.L.C.",
    odate: "20230501",
    cdate: "20231001",
    subject: "TIRE WEAR",
  }),
  line({
    id: "PE23370",
    comp: "TIRES",
    mfr: "Cinder Vehicles LLC",
    odate: "20230601",
    cdate: "20231101",
    subject: "TIRE WEAR",
  }),
  line({
    id: "PE23380",
    comp: "TIRES",
    mfr: "Cinder Vehicles LLC",
    odate: "20230701",
    cdate: "20231201",
    subject: "TIRE WEAR",
  }),
  line({
    id: "PE23380",
    comp: "WHEELS",
    mfr: "CINDER VEHICLES, L.L.C.",
    odate: "20230701",
    cdate: "20231201",
    subject: "TIRE WEAR",
  }),
  // A name with a parenthesis; a name of three characters (no key, so no record); and a name whose legal form leaves three
  // (its full name is the key: a record `abc`, keyed `name:abcinc`).
  line({
    id: "PE24400",
    comp: "STEERING",
    mfr: "Acme (Acme Motor Co.)",
    odate: "20240301",
    cdate: "20240901",
    subject: "STEERING PLAY",
  }),
  line({
    id: "PE24410",
    comp: "STEERING",
    mfr: "Zyx",
    odate: "20240302",
    cdate: "20240902",
    subject: "STEERING NOISE",
  }),
  line({
    id: "PE24420",
    comp: "STEERING",
    mfr: "Abc, Inc.",
    odate: "20240303",
    cdate: "20240903",
    subject: "STEERING SHAFT",
  }),
  // Dates: a close date before the opening, an investigation with no opening day, and one with neither date.
  line({
    id: "PE21310",
    comp: "FUEL SYSTEM",
    mfr: "Dateline Autos Inc.",
    odate: "20210601",
    cdate: "20210101",
    year: "9999",
    subject: "FUEL LEAK",
  }),
  line({
    id: "PE21320",
    comp: "NONE",
    mfr: "Dateline Autos Inc.",
    odate: "",
    cdate: "20230215",
    year: "9999",
    subject: "FUEL LINE",
  }),
  line({
    id: "PE21330",
    comp: "FUEL SYSTEM",
    mfr: "Dateline Autos Inc.",
    odate: "",
    cdate: "",
    year: "9999",
    subject: "FUEL PUMP",
  }),
  line({
    id: "PE20360",
    comp: "FUEL SYSTEM",
    mfr: "Dateless Motors Inc.",
    odate: "",
    cdate: "",
    subject: "FUEL PUMP",
  }),
  // Two spellings that are written once each: the display is the one that sorts first.
  line({
    id: "PE22490",
    comp: "TIRES",
    mfr: "Tie Motors Co",
    odate: "20220401",
    cdate: "20220901",
    subject: "TIE ONE",
  }),
  line({
    id: "PE22500",
    comp: "TIRES",
    mfr: "TIE MOTORS, INC.",
    odate: "20220501",
    cdate: "20221001",
    subject: "TIE TWO",
  }),
  // Fields that never reach a record: make, model, camp number, and the whole SUMMARY (a person, a phone number, controls).
  line({
    id: "PE25430",
    make: "SENTINEL-MAKE",
    model: "SENTINEL-MODEL",
    year: "9999",
    comp: "TIRES",
    mfr: "Excludo Wheels LLC",
    odate: "20250501",
    cdate: "20250801",
    camp: "CAMPSENTINEL9",
    subject: "WHEEL BOLTS",
    summary: `Ms. Quenby Zorblatt phoned 555-0147 about it.${cp(0x0c)}Second${cp(0x92)} part, see https://example.org/letter`,
  }),
];

/** The records that the happy path makes: 450 of the base and these of the scenario. */
const SCENARIO_ENTITIES = [
  "larkspurrovers",
  "borealisrobotics",
  "cindervehicles",
  "dappletrucks",
  "acmeacmemotorco",
  "abc",
  "datelineautos",
  "tiemotors",
  "excludowheels",
];

const LF = Buffer.from("\n");

/** The bytes of a file: its lines joined by a line feed, with none after the last one. */
function fileOf(lines: ReadonlyArray<string | Buffer>): Buffer {
  if (lines.every((entry) => typeof entry === "string")) {
    return Buffer.from((lines as readonly string[]).join("\n"), "utf8");
  }
  const parts: Buffer[] = [];
  lines.forEach((entry, at) => {
    if (at > 0) parts.push(LF);
    parts.push(typeof entry === "string" ? Buffer.from(entry, "utf8") : entry);
  });
  return Buffer.concat(parts);
}

const zipOfLines = (lines: ReadonlyArray<string | Buffer>): Buffer => flatZip(ENTRY, fileOf(lines));

const served = (zip: Buffer, over: Partial<FakeFile> = {}): Record<string, FakeFile> => ({
  [URL]: { body: zip, contentType: OCTETS, etag: ETAG, lastModified: MODIFIED, ...over },
});

const fetchOf = (lines: ReadonlyArray<string | Buffer>, over: Partial<FakeFile> = {}) =>
  fakeFetch(served(zipOfLines(lines), over));

async function snapshotOf(
  lines: ReadonlyArray<string | Buffer>,
  connector: Connector = nhtsaOdiConnector,
): Promise<Snapshot> {
  const snapshot = await connector.download(fetchOf(lines), {});
  if (snapshot === "unchanged") throw new Error("The download was answered as unchanged.");
  return snapshot;
}

const parseOf = async (
  lines: ReadonlyArray<string | Buffer>,
  connector: Connector = nhtsaOdiConnector,
) => connector.parse(await snapshotOf(lines, connector));

/** The JSON that the download hands to `read`: the meta of the file and the entity rows, as the reducer made them. */
async function envelopeOfLines(lines: ReadonlyArray<string | Buffer>) {
  const spec = nhtsaOdiSpec();
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
  rows: OdiEntity[];
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
  BASE = baseLines();
  FILE = [...BASE, ...SCENARIO, ...noEntityLines(120)];
});

describe("the list as a whole", () => {
  it("is the list nhtsa_odi, named by its mark", () => {
    expect(NHTSA_ODI_RECORD_MARK).toBe("NHTSA defect investigations");
    expect(nhtsaOdiConnector.id).toBe("nhtsa_odi");
    expect(nhtsaOdiConnector.version).toBe(1);
  });

  it("downloads one body with the validators of the zip, and makes one record per manufacturer", async () => {
    const zip = zipOfLines(FILE);
    // The real file's zip: general purpose bit 3 (no sizes in the local header), no header row, no final line feed.
    expect(zip.readUInt16LE(6) & 0x0008).toBe(0x0008);
    expect(zip.readUInt32LE(18)).toBe(0);
    expect(fileOf(FILE).toString("utf8").startsWith(idOf(0))).toBe(true);

    const snapshot = await nhtsaOdiConnector.download(fakeFetch(served(zip)), {});
    if (snapshot === "unchanged") throw new Error("unchanged");

    expect(snapshot.bodies).toHaveLength(1);
    expect(snapshot.etag).toBe(`k1:${ETAG}`);
    expect(snapshot.lastModified).toBe(MODIFIED);
    expect(snapshot.bytes).toBe(zip.length);
    const body = bodyOf(snapshot);
    expect(Object.keys(body)).toEqual(["v", "rows", "total", "allowanceBasis", "unreadable"]);
    expect(body.v).toBe(1);
    expect(body.rows).toHaveLength(450 + SCENARIO_ENTITIES.length);
    expect(body.total).toBe(FILE.length);
    // The allowance for unreadable lines is measured over the lines of the file, not over its manufacturers.
    expect(body.allowanceBasis).toBe(FILE.length);
    expect(body.unreadable).toBe(0);

    const result = nhtsaOdiConnector.parse(snapshot);
    expect(result.root).toBe("FLAT_INV.txt");
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.sourceVersion).toBe("2026-09-18");
    expect(result.records).toHaveLength(450 + SCENARIO_ENTITIES.length);
    expectWellFormedRecords(result.records, { sourceId: "nhtsa_odi", mark: NHTSA_ODI_RECORD_MARK });
    for (const record of result.records) {
      expect(record.recordType).toBe("defect_investigations");
      expect(
        record.summary.startsWith(
          "NHTSA defect investigations (nhtsa.gov), a product safety list. ",
        ),
      ).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.sourceUpdatedAt).toBeNull();
      expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
    }
    for (const id of SCENARIO_ENTITIES) expect(hasRecord(result.records, id)).toBe(true);
  });

  it("reads the last line, which has no line feed, and a file with CRLF line ends as the same list", async () => {
    const last = line({
      id: "RQ99570",
      comp: "TIRES",
      mfr: "Lastline Motors Inc.",
      odate: "20240101",
      cdate: "20240601",
    });
    const lines = [...FILE, last];

    const { records } = await parseOf(lines);

    expect(fileOf(lines).subarray(-last.length).toString("utf8")).toBe(last);
    expect(hasRecord(records, "lastlinemotors")).toBe(true);
    const crlf = zipOf([{ name: ENTRY, data: `${lines.join("\r\n")}`, descriptor: true }]);
    const snapshot = await nhtsaOdiConnector.download(fakeFetch(served(crlf)), {});
    if (snapshot === "unchanged") throw new Error("unchanged");
    expect(snapshot.bodies).toEqual((await snapshotOf(lines)).bodies);
  });

  it("takes a blank line for no row: not unreadable, no entity, and not in the total", async () => {
    const lines = [...FILE.slice(0, 100), "", ...FILE.slice(100), "", ""];

    const snapshot = await snapshotOf(lines);

    expect(bodyOf(snapshot)).toMatchObject({ unreadable: 0, total: FILE.length });
    expect(nhtsaOdiConnector.parse(snapshot)).toMatchObject({ skipped: 0, errors: 0 });
    expect(bodyOf(snapshot).rows).toEqual(bodyOf(await snapshotOf(FILE)).rows);
  });

  it("gives every manufacturer a page of its own: two records never share an address", async () => {
    const { records } = await parseOf(FILE);
    const urls = records.map((record) => record.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const record of records) {
      expect(record.url).toBe(
        `${NHTSA_DOCUMENTATION_URL}?dataset=investigations&manufacturer=${encodeURIComponent(record.sourceRecordId)}`,
      );
    }
  });

  it("does not depend on the order of the rows: forward, reversed and shuffled give one body and the same records", async () => {
    await expectDeterministic(nhtsaOdiConnector, (reversed) =>
      fetchOf(reversed ? [...FILE].reverse() : FILE),
    );
    const forward = await snapshotOf(FILE);
    for (const seed of [1, 2, 3]) {
      expect((await snapshotOf(shuffled(FILE, seed))).bodies).toEqual(forward.bodies);
    }
  });

  it("gives the same id to the same manufacturer whatever the order of the rows", async () => {
    const one = nhtsaOdiConnector
      .parse(await snapshotOf(FILE))
      .records.map((r) => r.sourceRecordId);
    const two = nhtsaOdiConnector
      .parse(await snapshotOf(shuffled(FILE, 9)))
      .records.map((r) => r.sourceRecordId);
    expect(two).toEqual(one);
  });

  it("is answered as unchanged by a 304 that comes from the pinned address, through the kit's own flow", async () => {
    const fetch = fetchOf(FILE);
    const first = await nhtsaOdiConnector.download(fetch, {});
    if (first === "unchanged") throw new Error("unchanged");

    const second = await nhtsaOdiConnector.download(fetch, {
      etag: first.etag,
      lastModified: first.lastModified,
    });

    expect(second).toBe("unchanged");
    // The stored etag has the prefix of the version; the server gets its own etag back.
    expect(fetch.calls[1].validators).toEqual({ etag: ETAG, lastModified: MODIFIED });
    // A snapshot of another version of the reading sends no validators, so that the file is read again.
    const third = await nhtsaOdiConnector.download(fetch, {
      etag: `k0:${ETAG}`,
      lastModified: MODIFIED,
    });
    expect(third).not.toBe("unchanged");
    expect(fetch.calls[2].validators).toEqual({});
  });

  it("asks once, for the zip, with the limits of the file", async () => {
    const fetch = fetchOf(FILE);
    await nhtsaOdiConnector.download(fetch, {});
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe(URL);
    expect(fetch.calls[0].limits).toEqual({
      maxBytes: 33_554_432,
      allowedContentTypes: [OCTETS, "application/zip"],
      totalTimeoutMs: 120_000,
    });
  });
});

describe("what a manufacturer's record holds", () => {
  let records: ParsedRecord[];
  let rows: OdiEntity[];

  beforeAll(async () => {
    const snapshot = await snapshotOf(FILE);
    records = nhtsaOdiConnector.parse(snapshot).records;
    rows = bodyOf(snapshot).rows;
  });

  it("collapses the rows of one investigation into one, and says it as the template does: the typical manufacturer", () => {
    const record = recordOf(records, "larkspurrovers");
    const row = rows.find((candidate) => candidate.id === "larkspurrovers");

    expect(row).toEqual({
      id: "larkspurrovers",
      display: "Larkspur Rovers, Inc.",
      names: ["Larkspur Rovers, Inc."],
      investigations: 1,
      firstYear: 2025,
      lastYear: 2025,
      byYear: { "2025": 1 },
      linked: 0,
      noClose: 0,
      adas: 0,
      newest: [
        {
          id: "PE25340",
          odate: "2025-03-12",
          cdate: "2025-09-11",
          component: "SERVICE BRAKES",
          subject: "BRAKE PEDAL TRAVEL",
        },
      ],
      publishedAt: "2025-09-11",
      anchorYear: 2026,
      fileNewestDay: "2026-09-18",
    });
    expect(record.title).toBe("NHTSA defect investigations: Larkspur Rovers, Inc.");
    expect(record.summary).toBe(
      "NHTSA defect investigations (nhtsa.gov), a product safety list. " +
        "Manufacturer: Larkspur Rovers, Inc. " +
        "The investigations file of NHTSA's Office of Defects Investigation names it in 1 investigation opened from 2025 to 2025. " +
        "By year opened: 2025 1. " +
        "Newest: PE25340 opened 2025-03-12, closed 2025-09-11, SERVICE BRAKES: BRAKE PEDAL TRAVEL. " +
        CLOSING,
    );
    // The typical record is about 490 characters.
    expect(record.summary.length).toBeGreaterThan(430);
    expect(record.summary.length).toBeLessThan(560);
    expect(record.publishedAt).toBe("2025-09-11");
    expect(record.identifiers).toEqual({
      manufacturer: "Larkspur Rovers, Inc.",
      investigations: 1,
      newest: ["PE25340"],
    });
    expect(record.matchKeys).toEqual(["name:larkspurroversinc", "name:larkspurrovers"]);
  });

  it("counts an automated driving manufacturer: years, campaigns, no close date, driver assistance, the newest three", () => {
    const record = recordOf(records, "borealisrobotics");
    const row = rows.find((candidate) => candidate.id === "borealisrobotics");

    expect(row).toMatchObject({
      investigations: 4,
      firstYear: 2019,
      lastYear: 2026,
      // The four calendar years that end at the file's newest year (2026): 2022 and 2019 are not among them.
      byYear: { "2024": 1, "2026": 1 },
      linked: 2,
      noClose: 2,
      adas: 2,
      publishedAt: "2026-09-18",
    });
    expect(row?.newest.map((item) => item.id)).toEqual(["PE26330", "PE24390", "EA22330"]);
    expect(record.summary).toBe(
      "NHTSA defect investigations (nhtsa.gov), a product safety list. " +
        "Manufacturer: Borealis Robotics, Inc. " +
        "The investigations file of NHTSA's Office of Defects Investigation names it in 4 investigations opened from 2019 to 2026; " +
        "2 are linked to a recall campaign; " +
        "2 opened since 2020 have no close date recorded in the file; " +
        "2 name a driver assistance or automated driving component. " +
        "By year opened: 2026 1, 2024 1. " +
        "Newest: PE26330 opened 2026-09-18, no close date recorded, ELECTRICAL SYSTEM; " +
        "PE24390 opened 2024-01-10, closed 2024-11-20, FORWARD COLLISION AVOIDANCE: UNEXPECTED BRAKING; " +
        "EA22330 opened 2022-03-01, no close date recorded, ADAPTIVE CRUISE CONTROL: CRUISE CONTROL SPEED DEVIATION. " +
        CLOSING,
    );
    expect(record.publishedAt).toBe("2026-09-18");
    expect(record.identifiers).toEqual({
      manufacturer: "Borealis Robotics, Inc.",
      investigations: 4,
      newest: ["PE26330", "PE24390", "EA22330"],
    });
  });

  it("counts an investigation that names two manufacturers for each of them, and an investigation that writes one name two ways once", () => {
    const cinder = rows.find((candidate) => candidate.id === "cindervehicles");
    const dapple = rows.find((candidate) => candidate.id === "dappletrucks");

    // DP23350, PE23360, PE23370 and PE23380 (which names both spellings of Cinder) are four, not five.
    expect(cinder).toMatchObject({ investigations: 4, display: "Cinder Vehicles LLC" });
    expect(cinder?.names).toEqual(["Cinder Vehicles LLC", "CINDER VEHICLES, L.L.C."]);
    expect(dapple).toMatchObject({
      investigations: 1,
      display: "Dapple Trucks, Inc.",
      firstYear: 2023,
      lastYear: 2023,
    });
    expect(dapple?.newest.map((item) => item.id)).toEqual(["DP23350"]);
    // The shared investigation is in the newest of both.
    expect(cinder?.newest.map((item) => item.id)).toEqual(["PE23380", "PE23370", "PE23360"]);
  });

  it("takes the spelling that is written most as the display, and the one that sorts first when two are written as often", () => {
    expect(rows.find((row) => row.id === "cindervehicles")?.display).toBe("Cinder Vehicles LLC");
    const tie = rows.find((row) => row.id === "tiemotors");
    expect(tie?.display).toBe("TIE MOTORS, INC.");
    expect(tie?.names).toEqual(["TIE MOTORS, INC.", "Tie Motors Co"]);
    expect(recordOf(records, "tiemotors").title).toBe(
      "NHTSA defect investigations: TIE MOTORS, INC.",
    );
  });

  it("matches a name with a parenthesis by the whole, the text before it and the text inside it", () => {
    const keys = recordOf(records, "acmeacmemotorco").matchKeys;
    expect(keys).toEqual([
      "name:acmeacmemotorco",
      "name:acme",
      "name:acmemotorco",
      "name:acmemotor",
    ]);
    expect(recordOf(records, "acmeacmemotorco").title).toBe(
      "NHTSA defect investigations: Acme (Acme Motor Co.)",
    );
  });

  it("matches a name of the manufacturer as written and without its legal form, never a make", () => {
    expect(recordOf(records, "borealisrobotics").matchKeys).toEqual([
      "name:borealisroboticsinc",
      "name:borealisrobotics",
    ]);
    expect(recordOf(records, "cindervehicles").matchKeys).toEqual([
      "name:cindervehiclesllc",
      "name:cindervehicles",
    ]);
    for (const record of records) {
      expect(record.matchKeys.some((key) => key.includes("acmemake"))).toBe(false);
    }
  });

  it("gives no record to a bare name of fewer than four compact characters, and none to an entity that has no date", () => {
    expect(hasRecord(records, "zyx")).toBe(false);
    expect(hasRecord(records, "datelessmotors")).toBe(false);
    for (const record of records) expect(record.matchKeys.length).toBeGreaterThan(0);
  });

  it("gives a record to a name whose legal form leaves fewer than four characters when its full name has four or more: the id is the short key, the match key the full name", () => {
    expect(hasRecord(records, "abc")).toBe(true);
    expect(recordOf(records, "abc").matchKeys).toEqual(["name:abcinc"]);
    expect(recordOf(records, "abc").title).toBe("NHTSA defect investigations: Abc, Inc.");
    expect(rows.find((row) => row.id === "abc")).toMatchObject({
      display: "Abc, Inc.",
      names: ["Abc, Inc."],
      investigations: 1,
    });
    // The bare name of three characters beside it has none, as before.
    expect(hasRecord(records, "zyx")).toBe(false);
  });

  it("decides on the keys that a record would have, not on the id: a bare spelling beside one that has a key is a record, keyed by that one", async () => {
    const lines = [
      ...FILE,
      line({ id: "RQ99830", mfr: "Qux, Inc.", odate: "20240303", cdate: "20240903" }),
      line({ id: "RQ99831", mfr: "QUX", odate: "20240304", cdate: "20240904" }),
      line({ id: "RQ99832", mfr: "Wob (Wob Holdings)", odate: "20240305", cdate: "20240905" }),
      line({ id: "RQ99833", mfr: "Wib", odate: "20240306", cdate: "20240906" }),
      line({ id: "RQ99834", mfr: "WIB", odate: "20240307", cdate: "20240907" }),
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

  it("keeps the dates as written: a close date before the opening, no opening day, and no date at all", () => {
    const dateline = rows.find((row) => row.id === "datelineautos");
    const record = recordOf(records, "datelineautos");

    // PE21330 has neither date: counted, never among the newest, and not an investigation with no close date.
    expect(dateline).toMatchObject({
      investigations: 3,
      firstYear: 2021,
      lastYear: 2021,
      byYear: {},
      noClose: 0,
      adas: 0,
      publishedAt: "2023-02-15",
    });
    expect(dateline?.newest).toEqual([
      { id: "PE21320", odate: null, cdate: "2023-02-15", component: "", subject: "FUEL LINE" },
      {
        id: "PE21310",
        odate: "2021-06-01",
        cdate: "2021-01-01",
        component: "FUEL SYSTEM",
        subject: "FUEL LEAK",
      },
    ]);
    // The row with YEAR 9999 and the component NONE read as any other row.
    expect(record.summary).toContain(
      "names it in 3 investigations opened from 2021 to 2021. Newest: " +
        "PE21320 opened on an unrecorded day, closed 2023-02-15: FUEL LINE; " +
        "PE21310 opened 2021-06-01, closed 2021-01-01, FUEL SYSTEM: FUEL LEAK. ",
    );
    // No opening year in the four years that end in 2026: no sentence of years.
    expect(record.summary).not.toContain("By year opened");
    expect(record.publishedAt).toBe("2023-02-15");
  });

  it("ranks investigations of one day by id, the greater first, whatever the order of the file", async () => {
    const same = ["PE24520", "PE24530", "PE24540", "PE24550"].map((id) =>
      line({
        id,
        comp: "TIRES",
        mfr: "Tied Newest Inc.",
        odate: "20240301",
        cdate: "20240401",
        subject: `TIE ${id}`,
      }),
    );

    for (const lines of [
      [...FILE, ...same],
      [...FILE, ...[...same].reverse()],
    ]) {
      const { records } = await parseOf(lines);
      expect(recordOf(records, "tiednewest").identifiers).toEqual({
        manufacturer: "Tied Newest Inc.",
        investigations: 4,
        newest: ["PE24550", "PE24540", "PE24530"],
      });
    }
  });

  it("merges the rows of one investigation by rules that do not depend on their order: the earliest opening, the latest closing, the smallest subject, the first component by text among the most frequent", async () => {
    const rows = [
      line({
        id: "PE24560",
        comp: "STEERING",
        mfr: "Merged Rows Inc.",
        odate: "20240305",
        cdate: "20240401",
        subject: "ZZ SUBJECT",
      }),
      line({
        id: "PE24560",
        comp: "AIR BAGS",
        mfr: "Merged Rows Inc.",
        odate: "20240301",
        cdate: "20240501",
        subject: "UNKNOWN",
      }),
      line({
        id: "PE24560",
        comp: "NONE",
        mfr: "Merged Rows Inc.",
        odate: "",
        cdate: "",
        subject: "Z SUBJECT",
      }),
    ];

    for (const lines of [
      [...FILE, ...rows],
      [...FILE, ...[...rows].reverse()],
    ]) {
      const { records } = await parseOf(lines);
      const record = recordOf(records, "mergedrows");
      expect(record.summary).toContain(
        "names it in 1 investigation opened from 2024 to 2024. By year opened: 2024 1. " +
          "Newest: PE24560 opened 2024-03-01, closed 2024-05-01, AIR BAGS: Z SUBJECT. ",
      );
      expect(record.publishedAt).toBe("2024-05-01");
    }
  });

  it("counts the four years that end at the newest year of the file, and the no-close investigations of the last seven, to the day", async () => {
    // The newest day of the file is in 2026: the window of four years is 2023 to 2026, and "since 2020" is seven calendar years.
    const edges: Array<[string, string]> = [
      ["PE19580", "20191231"], // one day before the seven years
      ["PE20580", "20200101"], // the first day of them
      ["PE22580", "20221231"], // one day before the four years
      ["PE23580", "20230101"], // the first day of them
      ["PE26580", "20260918"], // the newest day of the file
    ];
    const lines = [
      ...FILE,
      ...edges.map(([id, odate]) => line({ id, comp: "TIRES", mfr: "Edge Years Inc.", odate })),
    ];

    const { records } = await parseOf(lines);

    expect(recordOf(records, "edgeyears").summary).toContain(
      "names it in 5 investigations opened from 2019 to 2026; 4 opened since 2020 have no close date recorded in the file. " +
        "By year opened: 2026 1, 2023 1. ",
    );
  });

  it("has no sentence of years for a manufacturer none of whose investigations has an opening day", async () => {
    const lines = [
      ...FILE,
      line({
        id: "PE22510",
        comp: "TIRES",
        mfr: "Closeonly Autos Inc.",
        odate: "",
        cdate: "20230215",
        subject: "TIRE PLY",
      }),
    ];

    const { records } = await parseOf(lines);
    const record = recordOf(records, "closeonlyautos");

    expect(record.summary).toContain(
      "names it in 1 investigation. Newest: PE22510 opened on an unrecorded day, closed 2023-02-15, TIRES: TIRE PLY. ",
    );
    expect(record.summary).not.toContain("opened from");
    expect(record.summary).not.toContain("By year");
    expect(record.publishedAt).toBe("2023-02-15");
  });

  it("says nothing of a subject that the file spells UNKNOWN, and of a component that it spells NONE", () => {
    const borealis = recordOf(records, "borealisrobotics").summary;
    expect(borealis).toContain(
      "PE26330 opened 2026-09-18, no close date recorded, ELECTRICAL SYSTEM; ",
    );
    expect(borealis).not.toContain("UNKNOWN");
    const row = rows.find((candidate) => candidate.id === "datelineautos");
    expect(row?.newest[0].component).toBe("");
  });

  it("never says that an investigation is open or ongoing, and never that a manufacturer did something wrong", () => {
    for (const record of records) {
      expect(record.summary).not.toMatch(
        /\b(open|ongoing|still open|violat|guilty|fault|recalled)\b/i,
      );
      expect(record.summary).toContain("not a finding");
    }
  });
});

describe("the fields that never reach a record", () => {
  it("never holds the text of the SUMMARY (a person, a phone number, controls), the make, the model, or the number of a campaign", async () => {
    const snapshot = await snapshotOf(FILE);
    const { records } = nhtsaOdiConnector.parse(snapshot);

    for (const sentinel of SENTINELS) {
      expect(snapshot.bodies[0]).not.toContain(sentinel);
      expect(JSON.stringify(records)).not.toContain(sentinel);
    }
    expect(snapshot.bodies[0]).not.toContain("example.org");
    expect(snapshot.bodies[0]).not.toContain(cp(0x0c));
    expect(snapshot.bodies[0]).not.toContain(cp(0x92));
    // The investigation is there, and the number of its campaign is only the fact that it has one.
    const row = bodyOf(snapshot).rows.find((candidate) => candidate.id === "excludowheels");
    expect(row).toMatchObject({ investigations: 1, linked: 1 });
    expect(recordOf(records, "excludowheels").summary).toContain(
      "1 is linked to a recall campaign",
    );
  });

  it("does not decode the SUMMARY: bytes that are no UTF-8 in it do not make the row unreadable", async () => {
    const lines: Array<string | Buffer> = [...FILE];
    const prefix = line({
      id: "PE25440",
      comp: "TIRES",
      mfr: "Bytes Wheels LLC",
      odate: "20250501",
      cdate: "20250801",
    });
    lines.push(
      Buffer.concat([
        Buffer.from(`${prefix.split("\t").slice(0, 10).join("\t")}\t`),
        Buffer.from([0xff, 0xfe, 0xc3]),
      ]),
    );

    const snapshot = await snapshotOf(lines);

    expect(bodyOf(snapshot).unreadable).toBe(0);
    expect(
      nhtsaOdiConnector
        .parse(snapshot)
        .records.some((record) => record.sourceRecordId === "byteswheels"),
    ).toBe(true);
  });

  it("does not decode the make, the model and the year either", async () => {
    const lines: Array<string | Buffer> = [...FILE];
    const fields = line({
      id: "PE25450",
      comp: "TIRES",
      mfr: "Raw Wheels LLC",
      odate: "20250501",
      cdate: "20250801",
    }).split("\t");
    const raw = Buffer.concat([
      Buffer.from(`${fields[0]}\t`),
      Buffer.from([0xff, 0xfe]),
      Buffer.from(`\t`),
      Buffer.from([0xc3, 0x28]),
      Buffer.from(`\t9999\t${fields.slice(4).join("\t")}`),
    ]);
    lines.push(raw);

    const snapshot = await snapshotOf(lines);

    expect(bodyOf(snapshot).unreadable).toBe(0);
    expect(hasRecord(nhtsaOdiConnector.parse(snapshot).records, "rawwheels")).toBe(true);
  });
});

describe("rows that name no manufacturer", () => {
  it("are no entity, not unreadable rows: a file of which more than one row in five has none still reads with none skipped", async () => {
    const lines = [...BASE, ...SCENARIO, ...noEntityLines(2_600)];
    const names = lines.filter((entry) => entry.split("\t")[5] === "").length;
    expect(names / lines.length).toBeGreaterThan(0.2);

    const snapshot = await snapshotOf(lines);
    const result = nhtsaOdiConnector.parse(snapshot);

    expect(bodyOf(snapshot)).toMatchObject({ unreadable: 0, total: lines.length });
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.records).toHaveLength(450 + SCENARIO_ENTITIES.length);
  });

  it("are the same whether the cell is empty or one of the placeholder names, and no record is made of a placeholder", async () => {
    const placeholders = [
      "UNKNOWN MANUFACTURER",
      "Generic Manufacturer",
      "VARIOUS MANUFACTURERS",
      "Acme Parts redundant - Inactive",
    ];
    const extra = placeholders.map((mfr, at) =>
      line({ id: `RQ99${String(900 + at)}`, mfr, odate: "19950101", cdate: "19960101" }),
    );

    const snapshot = await snapshotOf([...FILE, ...extra]);
    const { records, skipped, errors } = nhtsaOdiConnector.parse(snapshot);

    expect(bodyOf(snapshot).unreadable).toBe(0);
    expect(skipped).toBe(0);
    expect(errors).toBe(0);
    for (const id of ["unknownmanufacturer", "genericmanufacturer", "variousmanufacturers"]) {
      expect(hasRecord(records, id)).toBe(false);
    }
    expect(records.some((record) => record.sourceRecordId.includes("redundant"))).toBe(false);
    expect(records).toHaveLength(450 + SCENARIO_ENTITIES.length);
  });

  it("are no entity either when the name has no letter or digit, or is a legal form after punctuation: the row is read, its investigation counts, and nobody is named", async () => {
    const extra = ["---", "( ) / .", "- Inc.", "( ) LLC", "... Corp."].map((mfr, at) =>
      line({ id: `RQ99${String(920 + at)}`, mfr, odate: "19950101", cdate: "19960101" }),
    );

    const snapshot = await snapshotOf([...FILE, ...extra]);
    const { records, skipped, errors } = nhtsaOdiConnector.parse(snapshot);

    expect(bodyOf(snapshot)).toMatchObject({ unreadable: 0, total: FILE.length + extra.length });
    expect(skipped).toBe(0);
    expect(errors).toBe(0);
    expect(records).toHaveLength(450 + SCENARIO_ENTITIES.length);
  });
});

describe("rows that cannot be read", () => {
  const good = (k: number) =>
    line({
      id: `RQ98${String(100 + k)}`,
      mfr: "Extra Wheels LLC",
      odate: "20200101",
      cdate: "20200601",
    });

  /** The kinds of row that the shape check refuses, each as a line or as bytes. */
  const kinds: Array<[string, (k: number) => string | Buffer]> = [
    ["a row of twelve fields", (k) => `${good(k)}\ta twelfth field`],
    ["a row of ten fields", (k) => good(k).split("\t").slice(0, 10).join("\t")],
    [
      "an id that fails the pattern (lower case)",
      (k) => good(k).replace(`RQ98${100 + k}`, `rq98${100 + k}`),
    ],
    ["an id that is too long", (k) => good(k).replace(`RQ98${100 + k}`, `RQ98${100 + k}12345`)],
    ["an empty id", (k) => good(k).replace(`RQ98${100 + k}`, "")],
    ["an ODATE that is no date (with dashes)", (k) => good(k).replace("20200101", "2020-01-01")],
    ["an ODATE of a day that does not exist", (k) => good(k).replace("20200101", "20200231")],
    ["a CDATE of the year 9999", (k) => good(k).replace("20200601", "99991231")],
    ["a CDATE of seven digits", (k) => good(k).replace("20200601", "2020061")],
    [
      "a manufacturer name of 100 characters",
      (k) => good(k).replace("Extra Wheels LLC", "x".repeat(100)),
    ],
    [
      "a manufacturer name whose cut would fall right after a blank",
      (k) => good(k).replace("Extra Wheels LLC", `${"a".repeat(68)} ${"b".repeat(40)}`),
    ],
    [
      "bytes that are no UTF-8 in the subject",
      (k) => {
        const fields = good(k).split("\t");
        return Buffer.concat([
          Buffer.from(`${fields.slice(0, 9).join("\t")}\t`),
          Buffer.from([0xff, 0xfe]),
          Buffer.from(`\t${fields[10]}`),
        ]);
      },
    ],
    [
      "bytes of a lone surrogate (CESU-8) in the manufacturer",
      (k) => {
        const fields = good(k).split("\t");
        return Buffer.concat([
          Buffer.from(`${fields.slice(0, 5).join("\t")}\tName `),
          Buffer.from([0xed, 0xa0, 0x80]),
          Buffer.from(`\t${fields.slice(6).join("\t")}`),
        ]);
      },
    ],
  ];

  it.each(kinds)(
    "%s is skipped and counted, and the rest of the file is read",
    async (_label, make) => {
      const snapshot = await snapshotOf([...FILE, make(1)]);
      const result = nhtsaOdiConnector.parse(snapshot);

      expect(bodyOf(snapshot)).toMatchObject({ unreadable: 1, total: FILE.length + 1 });
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.records).toHaveLength(450 + SCENARIO_ENTITIES.length);
    },
  );

  it("is a line past the limit of bytes as well, and a line of exactly the limit is read", async () => {
    const long = `${good(1)}\t${"z".repeat(FLAT_LINE_BYTES_MAX)}`;
    const edge = good(2) + "z".repeat(FLAT_LINE_BYTES_MAX - Buffer.byteLength(good(2)));
    expect(Buffer.byteLength(edge)).toBe(FLAT_LINE_BYTES_MAX);
    const snapshot = await snapshotOf([...FILE, long, edge]);

    // The long line is one unreadable row; the line of exactly the limit has an id and ten fields, but twelve are not read: it is the SUMMARY that is long.
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
    async (_label, mfr) => {
      // The dates are later than every day of the file: a line that was read would move the day of the file.
      const bad = line({ id: "RQ99810", mfr, odate: "20270101", cdate: "20270201" });
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
      expect(bodyOf(snapshot).rows).toHaveLength(450 + SCENARIO_ENTITIES.length);
      expect(nhtsaOdiConnector.parse(snapshot)).toMatchObject({ skipped: 1, errors: 0 });
    },
  );

  it("reads a name of exactly the cap, and a long cell that cleans to a name that fits", async () => {
    const edge = `${"Q".repeat(77)} Co`;
    const spaced = `Spaced${" ".repeat(300)}Motors${cp(0x200b).repeat(300)} Inc.`;
    expect(edge).toHaveLength(80);
    const lines = [
      ...FILE,
      line({ id: "RQ99811", mfr: edge, odate: "20250101", cdate: "20250201" }),
      line({ id: "RQ99812", mfr: spaced, odate: "20250101", cdate: "20250201" }),
    ];

    const snapshot = await snapshotOf(lines);
    const { records } = nhtsaOdiConnector.parse(snapshot);

    expect(bodyOf(snapshot).unreadable).toBe(0);
    expect(hasRecord(records, "q".repeat(77))).toBe(true);
    expect(recordOf(records, "q".repeat(77)).title).toBe(`${NHTSA_ODI_RECORD_MARK}: ${edge}`);
    expect(recordOf(records, "spacedmotors").title).toBe(
      `${NHTSA_ODI_RECORD_MARK}: Spaced Motors Inc.`,
    );
  });

  it("tolerates a hundredth of the lines of the file, and at least ten, and fails the sync with more: the allowance is over lines, not over manufacturers", async () => {
    const some = (count: number): Array<string | Buffer> =>
      Array.from({ length: count }, (_, k) => kinds[k % kinds.length][1](k));
    // The most bad lines that the allowance of all the lines (the good ones and these) takes: b <= 1 percent of FILE.length + b.
    let edge = 0;
    while (edge + 1 <= unreadableAllowed(FILE.length + edge + 1)) edge += 1;
    expect(edge).toBe(Math.floor(FILE.length / 99));
    // Far more than the ten that the manufacturers of the file alone would allow, and not a tenth of the lines.
    expect(edge).toBeGreaterThan(50);
    expect(edge).toBeLessThan(FILE.length / 20);

    for (const count of [11, edge]) {
      const snapshot = await snapshotOf([...FILE, ...some(count)]);
      expect(bodyOf(snapshot)).toMatchObject({ unreadable: count });
      expect(nhtsaOdiConnector.parse(snapshot)).toMatchObject({ skipped: count, errors: 0 });
    }
    const over = nhtsaOdiConnector.parse(await snapshotOf([...FILE, ...some(edge + 1)]));
    expect(over).toMatchObject({ skipped: 0, errors: edge + 1 });
  });

  it("measures the manufacturers that the record builder refuses over the manufacturers, never over the lines of the file", async () => {
    const snapshot = await snapshotOf(FILE);
    const body = bodyOf(snapshot);
    const allowed = unreadableAllowed(body.rows.length);
    // The lines would allow far more than the manufacturers do: a manufacturer that is refused is no line that cannot be read.
    expect(unreadableAllowed(FILE.length)).toBeGreaterThan(allowed + 1);
    // A body in which the first `count` manufacturers have an id that no record can have (it holds a control character).
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

    expect(nhtsaOdiConnector.parse(refusing(allowed))).toMatchObject({
      skipped: allowed,
      errors: 0,
    });
    const over = nhtsaOdiConnector.parse(refusing(allowed + 1));
    expect(over).toMatchObject({ skipped: 0, errors: allowed + 1 });
    expect(over.records).toHaveLength(body.rows.length - allowed - 1);
    // All of them: an error, never a list with no record that is skipped.
    expect(nhtsaOdiConnector.parse(refusing(body.rows.length))).toMatchObject({
      skipped: 0,
      errors: body.rows.length,
      records: [],
    });
  });

  it("is not the list when more than one row in twenty has the wrong shape, and is the list when exactly one in twenty has", async () => {
    // Rows of twelve fields have the wrong shape. With L readable rows, B bad ones are one in twenty at B = L / 19: L is made a multiple of 19.
    const readable = [
      ...FILE,
      ...Array.from({ length: (19 - (FILE.length % 19)) % 19 }, (_, k) =>
        line({ id: `AQ96${900 + k}`, mfr: "", odate: "19950101", cdate: "19960101" }),
      ),
    ];
    expect(readable.length % 19).toBe(0);
    const bad = (count: number) => Array.from({ length: count }, (_, k) => `${good(k)}\textra`);
    const edge = readable.length / 19;

    const at = await snapshotOf([...readable, ...bad(edge)]);
    expect(bodyOf(at).unreadable).toBe(edge);
    // The file is still the list, and the allowance of a hundredth of the lines refuses it: the rows are errors.
    // Between that hundredth and one in twenty the sync fails in `parse`; above one in twenty the file is no list at all.
    expect(nhtsaOdiConnector.parse(at)).toMatchObject({ skipped: 0, errors: edge });

    const over = await failureOf(
      nhtsaOdiConnector.download(fetchOf([...readable, ...bad(edge + 1)]), {}),
    );
    expect(over).toBeInstanceOf(NotTheListError);
  });

  it("is not the list when it is a file of another shape: a CSV with a header, text, a file of other widths", async () => {
    const csv = ["Report ID,Reporting Entity,Date", "1,Alpha Robotics LLC,2026-01-01"];
    const wide = Array.from({ length: 5_000 }, (_, k) => `${good(k)}\tx`);
    for (const lines of [csv, ["just some text"], wide, []]) {
      expect(await failureOf(nhtsaOdiConnector.download(fetchOf(lines), {}))).toBeInstanceOf(
        NotTheListError,
      );
    }
  });
});

describe("the floors: a file that is too small is not the list", () => {
  it("needs 4,000 investigations (named or not) and 400 entities that have a record", async () => {
    expect(NHTSA_ODI_FLOORS).toEqual({ investigations: 4_000, entities: 400 });

    // Exactly the floors read; one investigation fewer, or one entity fewer, is not the list.
    const exact = await snapshotOf(baseLines(4_000, 400));
    expect(bodyOf(exact).rows).toHaveLength(400);

    for (const lines of [
      baseLines(3_999, 400),
      baseLines(4_000, 399),
      baseLines(4_200, 399),
      baseLines(399, 399),
    ]) {
      expect(await failureOf(nhtsaOdiConnector.download(fetchOf(lines), {}))).toBeInstanceOf(
        NotTheListError,
      );
    }
  });

  it("counts every investigation of the file for the floor, those that name no manufacturer too", async () => {
    // 3,500 named and 600 without a manufacturer: 4,100 investigations, 450 entities.
    const lines = [...baseLines(3_500, 450), ...noEntityLines(600)];
    const snapshot = await snapshotOf(lines);
    expect(bodyOf(snapshot).rows).toHaveLength(450);

    const fewer = [...baseLines(3_500, 450), ...noEntityLines(499)];
    expect(await failureOf(nhtsaOdiConnector.download(fetchOf(fewer), {}))).toBeInstanceOf(
      NotTheListError,
    );
  });

  it("counts an entity that has no key or no date no more than it is: no record", async () => {
    // 400 entities with a record, and 5 that are none: 400 is the floor, so the five do not count.
    const extra = Array.from({ length: 5 }, (_, k) =>
      line({ id: `RQ97${900 + k}`, mfr: `Z${k}`, odate: "20200101", cdate: "20200301" }),
    );
    const kept = await snapshotOf([...baseLines(4_200, 400), ...extra]);
    expect(bodyOf(kept).rows).toHaveLength(400);

    const short = [...baseLines(4_200, 399), ...extra];
    expect(await failureOf(nhtsaOdiConnector.download(fetchOf(short), {}))).toBeInstanceOf(
      NotTheListError,
    );
  });
});

describe("the caps, through the spec's factory", () => {
  const withLimits = (limits: Parameters<typeof nhtsaOdiSpec>[0]) =>
    createFileConnector(nhtsaOdiSpec(limits));

  it("fails an entry that inflates to one byte over the cap as too large, never as a shorter list, and takes one of exactly the cap", async () => {
    const size = fileOf(FILE).length;

    expect((await snapshotOf(FILE, withLimits({ maxInflatedBytes: size }))).bodies).toHaveLength(1);
    const error = await failureOf(
      withLimits({ maxInflatedBytes: size - 1 }).download(fetchOf(FILE), {}),
    );
    expect(error).toBeInstanceOf(BodyTooLargeError);
  });

  it("fails a file one line over the cap of lines as too large, with a line feed at its end or without", async () => {
    const lines = FILE.length;

    expect((await snapshotOf(FILE, withLimits({ maxLines: lines }))).bodies).toHaveLength(1);
    for (const over of [lines - 1]) {
      const error = await failureOf(withLimits({ maxLines: over }).download(fetchOf(FILE), {}));
      expect(error).toBeInstanceOf(BodyTooLargeError);
    }
    // A final line feed is no line; a blank line after it is one.
    const withFeed = zipOf([
      { name: ENTRY, data: `${fileOf(FILE).toString("utf8")}\n`, descriptor: true },
    ]);
    expect(
      (await withLimits({ maxLines: lines }).download(fakeFetch(served(withFeed)), {})) ===
        "unchanged",
    ).toBe(false);
    const withBlank = zipOf([
      { name: ENTRY, data: `${fileOf(FILE).toString("utf8")}\n\n`, descriptor: true },
    ]);
    expect(
      await failureOf(withLimits({ maxLines: lines }).download(fakeFetch(served(withBlank)), {})),
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

    const error = await failureOf(nhtsaOdiConnector.download(fakeFetch(served(lying)), {}));

    expect(error).toBeInstanceOf(NotTheListError);
  });

  it("fails more manufacturers than the list can hold as too large", async () => {
    const many = Array.from({ length: 2_001 }, (_, k) =>
      line({ id: idOf(k), mfr: `Mass ${k} Motors`, odate: "20200101" }),
    );

    const error = await failureOf(nhtsaOdiConnector.download(fetchOf(many), {}));

    expect(error).toBeInstanceOf(BodyTooLargeError);
  });

  it("fails more components and manufacturers of investigations than the list can hold as too large", async () => {
    // One investigation of 200,001 rows, each naming a component of its own: the pairs that the reducer keeps are capped.
    const rows = Array.from({ length: 200_001 }, (_, k) =>
      line({ id: "PE30310", comp: `COMPONENT ${k}`, mfr: "Pairs Inc.", odate: "20200101" }),
    );

    const error = await failureOf(nhtsaOdiConnector.download(fetchOf(rows), {}));

    expect(error).toBeInstanceOf(BodyTooLargeError);
  }, 90_000);

  it("fails a state that grows without end as too large: more investigations than the list can hold", async () => {
    const connector = createFileConnector(nhtsaOdiSpec({ maxInflatedBytes: 64 * MIB }));
    // 100,001 investigations of one short row each is far past the 5,357 of today, and fits in a few MB.
    // The rows name no component and no manufacturer, so that no other cap than this one is reached.
    const many = Array.from({ length: 100_001 }, (_, k) =>
      line({ id: idOf(k), comp: "", mfr: "", odate: "20200101" }),
    );

    const error = await failureOf(connector.download(fetchOf(many), {}));

    expect(error).toBeInstanceOf(BodyTooLargeError);
  }, 60_000);
});

describe("where the file may come from", () => {
  const zip = () => zipOfLines(FILE);
  const places: Array<[string, string]> = [
    ["another host", "https://evil.example.org/odi/ffdd/inv/FLAT_INV.zip"],
    ["another directory of the same host", "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_INV.zip"],
    [
      "a directory that only begins like it",
      "https://static.nhtsa.gov/odi/ffdd/inv-other/FLAT_INV.zip",
    ],
  ];

  it.each(places)("is not allowed from %s, a 200 answer or a 304", async (_label, url) => {
    const body = zip();
    const error = await failureOf(nhtsaOdiConnector.download(fakeFetch(served(body, { url })), {}));
    expect(error).toBeInstanceOf(FetchError);
    expect(error).toMatchObject({ reason: "not_allowed" });
    expect(String((error as Error).message)).not.toContain("evil");

    const stored = await failureOf(
      nhtsaOdiConnector.download(fakeFetch(served(body, { url })), { etag: `k1:${ETAG}` }),
    );
    expect(stored).toMatchObject({ name: "FetchError", reason: "not_allowed" });
  });

  it("fails a zip that the page guard says it cut as too large", async () => {
    const error = await failureOf(
      nhtsaOdiConnector.download(fakeFetch(served(zip(), { truncated: true })), {}),
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
      ["another name", zipOf([{ name: "FLAT_RCL_POST_2010.txt", data }])],
      ["a CRC that does not hold", zipOf([{ name: ENTRY, data, crc: 7 }])],
      ["a page of HTML", Buffer.from("<html>not found</html>")],
    ];
    for (const [, body] of refused) {
      expect(
        await failureOf(nhtsaOdiConnector.download(fakeFetch(served(body)), {})),
      ).toBeInstanceOf(NotTheListError);
    }
  });
});

describe("the text of a record", () => {
  it("anchors the years on the newest date of the file, never on the clock: the same file read on two days gives the same body and records", async () => {
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
        reads.push({ bodies: snapshot.bodies, records: nhtsaOdiConnector.parse(snapshot).records });
      }
    } finally {
      jest.useRealTimers();
    }

    expect(reads[1].bodies).toEqual(reads[0].bodies);
    expect(reads[1].records).toEqual(reads[0].records);
    // The count back from 2026, the year of the newest date in the file, and not from 2031.
    expect(
      reads[1].records.find((record) => record.sourceRecordId === "borealisrobotics")?.summary,
    ).toContain("By year opened: 2026 1, 2024 1.");
  });

  it("writes the counts in the singular for one", async () => {
    const records = (await parseOf(FILE)).records;
    const one = recordOf(records, "excludowheels").summary;
    expect(one).toContain(
      "names it in 1 investigation opened from 2025 to 2025; 1 is linked to a recall campaign.",
    );
    const lines = [
      ...FILE,
      line({ id: "EA24420", comp: "ADAS CAMERA", mfr: "Solo Sensors LLC", odate: "20240401" }),
    ];
    const solo = recordOf((await parseOf(lines)).records, "solosensors").summary;
    expect(solo).toContain(
      "names it in 1 investigation opened from 2024 to 2024; 1 opened since 2020 has no close date recorded in the file; 1 names a driver assistance or automated driving component.",
    );
  });

  it("leaves out a clause whose count is zero and the sentence of years when no year is in the window", async () => {
    const lines = [
      ...FILE,
      line({
        id: "EA09420",
        comp: "TIRES",
        mfr: "Olden Tires LLC",
        odate: "20100401",
        cdate: "20100901",
      }),
    ];
    const summary = recordOf((await parseOf(lines)).records, "oldentires").summary;
    expect(summary).toContain(
      "names it in 1 investigation opened from 2010 to 2010. Newest: EA09420 opened 2010-04-01, closed 2010-09-01, TIRES: SUBJECT TEXT. ",
    );
    expect(summary).not.toContain("By year");
    expect(summary).not.toContain("linked");
  });

  it("is at most 1,300 characters in the worst case, and still ends with the closing sentence", () => {
    const spec = nhtsaOdiSpec();
    const longName = `${"Vantage ".repeat(9)}Vantage.`;
    expect(longName).toHaveLength(80);
    const item = (n: number) => ({
      id: `PE26${String(100 + n)}`,
      odate: "2026-09-18",
      cdate: "2026-09-18",
      component: "ELECTRICAL SYSTEM: ".repeat(6).slice(0, 112).trim(),
      subject: `A subject of the longest kind ${n}: `.repeat(6).slice(0, 135).trim(),
    });
    const worst: OdiEntity = {
      id: "vantage",
      display: longName,
      names: [longName],
      investigations: 708,
      firstYear: 1972,
      lastYear: 2026,
      byYear: { "2023": 123, "2024": 124, "2025": 125, "2026": 126 },
      linked: 123,
      noClose: 45,
      adas: 88,
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
    expect(record.summary).toContain(`Manufacturer: ${longName} The investigations file`);
    expect(record.summary).toContain(
      "; 123 are linked to a recall campaign; 45 opened since 2020 have no close date recorded in the file; 88 name a driver assistance",
    );
    expect(record.summary).toContain("By year opened: 2026 126, 2025 125, 2024 124, 2023 123.");
    expect(record.summary).toContain(" [shortened]");
  });

  it("cuts the sentences before the closing one, never the closing one, when a text is too long", () => {
    const spec = nhtsaOdiSpec();
    const row: OdiEntity = {
      id: "huge",
      display: "H".repeat(1_500),
      names: ["Huge Motors"],
      investigations: 1,
      firstYear: 2020,
      lastYear: 2020,
      byYear: { "2020": 1 },
      linked: 0,
      noClose: 0,
      adas: 0,
      newest: [
        { id: "PE20310", odate: "2020-01-01", cdate: null, component: "TIRES", subject: "TIRE" },
      ],
      publishedAt: "2020-01-01",
      anchorYear: 2020,
      fileNewestDay: "2020-01-01",
    };

    const [record] = spec.toRecords([row]);

    expect(record.summary).toHaveLength(1_300);
    expect(record.summary.endsWith(CLOSING)).toBe(true);
    expect(
      record.summary.startsWith("NHTSA defect investigations (nhtsa.gov), a product safety list. "),
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
        id: "PE25460",
        comp: `TI${cp(0x0b)}RES${cp(0)}`,
        mfr: hostileName,
        odate: "20250601",
        cdate: "20250901",
        subject: big,
      }),
      line({
        id: "PE25470",
        comp: "TIRES",
        mfr: hostileName,
        odate: "20250602",
        cdate: "20250902",
        subject: `Subject <b>bold</b>${cp(0x202e)} text`,
      }),
    ];

    const snapshot = await snapshotOf(lines);
    const result = nhtsaOdiConnector.parse(snapshot);
    const hostile = result.records.find((record) =>
      record.title.startsWith("NHTSA defect investigations: Hostile"),
    );

    expect(hostile).toBeDefined();
    expect(bodyOf(snapshot).unreadable).toBe(0);
    expectWellFormedRecords(result.records, { sourceId: "nhtsa_odi", mark: NHTSA_ODI_RECORD_MARK });
    const display = `Hostile Motors ${cp(0x2039)}script${cp(0x203a)}alert(1)${cp(0x2039)}/script${cp(0x203a)} Inc.`;
    expect(hostile?.title).toBe(`NHTSA defect investigations: ${display}`);
    expect(hostile?.summary).not.toMatch(/[<>]/);
    expect(hostile?.summary).not.toMatch(/\p{Cc}/u);
    expect(hostile?.summary).not.toContain(cp(0x202e));
    expect(hostile?.summary).toContain("[shortened]");
    // Nothing of the 100 KB cell is stored beyond its cap.
    expect(snapshot.bodies[0].length).toBeLessThan(2_000_000);
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
        id: "PE25600",
        comp: "TIRES",
        mfr: `Zeta${cp(0x00ad, 0x0308)} Motors Inc.`,
        odate: "20250601",
        cdate: "20250901",
      }),
    ];

    const snapshot = await snapshotOf(lines);
    const { records } = nhtsaOdiConnector.parse(snapshot);

    expect(bodyOf(snapshot).rows.find((row) => row.id === "zetamotors")?.display).toBe(
      `Zeta${cp(0x0308)} Motors Inc.`,
    );
    expect(hasRecord(records, "zetamotors")).toBe(true);
  });

  it("do not make a name a person: a name that has the shape of one is a business here", async () => {
    // No person occurs among the 595 manufacturers of the real file, and name-shape rules had no precision: no filter is applied.
    const lines = [
      ...FILE,
      line({
        id: "PE25480",
        comp: "TIRES",
        mfr: "Jane Q Sample",
        odate: "20250601",
        cdate: "20250901",
      }),
    ];
    const { records } = await parseOf(lines);
    expect(hasRecord(records, "janeqsample")).toBe(true);
  });
});

describe("the reader of the download's JSON", () => {
  const spec = nhtsaOdiSpec();
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
      lines: FILE.length,
      blankLines: 0,
      rows: FILE.length,
      unreadable: 0,
    });
    expect(Number(meta.investigations)).toBeGreaterThanOrEqual(4_000);
    // The meta counts all the entities, those that get no record included: the short name and the one without a date.
    expect(meta.entities).toBe(entities.length);
    expect(entities.length).toBe(450 + SCENARIO_ENTITIES.length + 2);

    const result = readOf(meta, entities);

    expect(result).not.toBeNull();
    expect(result?.complete).toBe(true);
    expect(result?.rows).toHaveLength(450 + SCENARIO_ENTITIES.length);
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
    // More entities than the list can hold: the backstop of the reducer's own throw, which only an envelope that a download never writes can reach.
    const many = Array.from({ length: 2_001 }, () => entities[0]);
    incomplete({ ...meta, entities: 2_001 }, many);
  });

  it("is not the list when the floors are not met", () => {
    expect(readOf({ ...meta, investigations: 3_999 }, entities)).toBeNull();
    expect(readOf(meta, entities.slice(0, 399))).toBeNull();
    expect(readOf({ ...meta, entities: 399 }, entities.slice(0, 399))).toBeNull();
    expect(readOf({ ...meta, rows: 1_000, lines: 1_000, unreadable: 51 }, entities)).toBeNull();
  });

  const damaged: Array<[string, (row: Record<string, unknown>) => Record<string, unknown>]> = [
    ["an id that is no compact name", (row) => ({ ...row, id: "Not Compact" })],
    ["an id that is no text", (row) => ({ ...row, id: 5 })],
    ["a display that is empty", (row) => ({ ...row, display: "" })],
    ["a display with an angle bracket", (row) => ({ ...row, display: "A <b> Inc." })],
    ["a display of 81 characters", (row) => ({ ...row, display: "d".repeat(81) })],
    ["names that are not a list", (row) => ({ ...row, names: "Acme" })],
    ["no names", (row) => ({ ...row, names: [] })],
    ["six names", (row) => ({ ...row, names: ["a1", "b2", "c3", "d4", "e5", "f6"] })],
    ["a name that is not of this manufacturer", (row) => ({ ...row, names: ["Other Name Inc."] })],
    [
      "a spelling of the manufacturer that is not the display first",
      (row) => {
        // The only damage is the order: the spelling is one of this manufacturer, and it is not the display.
        const spelling = String(row.display).toUpperCase();
        expect(spelling).not.toBe(row.display);
        expect(entityKeyOf(spelling)).toBe(row.id);
        return { ...row, names: [spelling] };
      },
    ],
    ["no investigations", (row) => ({ ...row, investigations: 0 })],
    ["a count with a fraction", (row) => ({ ...row, linked: 1.5 })],
    [
      "more campaigns than investigations",
      (row) => ({ ...row, linked: Number(row.investigations) + 1 }),
    ],
    ["a first year after the last", (row) => ({ ...row, firstYear: 2025, lastYear: 2020 })],
    ["a first year without a last", (row) => ({ ...row, firstYear: 2020, lastYear: null })],
    ["a year out of the years of a list", (row) => ({ ...row, firstYear: 1800 })],
    ["a year outside the four of the window", (row) => ({ ...row, byYear: { "2000": 1 } })],
    ["a count by year that is zero", (row) => ({ ...row, byYear: { "2025": 0 } })],
    ["counts by year that are no object", (row) => ({ ...row, byYear: [] })],
    [
      "four newest investigations",
      (row) => ({ ...row, newest: Array.from({ length: 4 }, () => (row.newest as unknown[])[0]) }),
    ],
    [
      "a newest item with an id that fails the pattern",
      (row) => ({
        ...row,
        newest: [{ ...(row.newest as Array<Record<string, unknown>>)[0], id: "bad" }],
      }),
    ],
    [
      "a newest item with a day that does not exist",
      (row) => ({
        ...row,
        newest: [{ ...(row.newest as Array<Record<string, unknown>>)[0], odate: "2025-02-30" }],
      }),
    ],
    [
      "a newest item with a subject of 136 characters",
      (row) => ({
        ...row,
        newest: [
          { ...(row.newest as Array<Record<string, unknown>>)[0], subject: "s".repeat(136) },
        ],
      }),
    ],
    [
      "a newest item with a component that is no text",
      (row) => ({
        ...row,
        newest: [{ ...(row.newest as Array<Record<string, unknown>>)[0], component: 5 }],
      }),
    ],
    ["a day of publication that does not exist", (row) => ({ ...row, publishedAt: "2026-13-01" })],
    ["a newest item that is null", (row) => ({ ...row, newest: [null] })],
    ["a newest item that is a list", (row) => ({ ...row, newest: [[]] })],
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
    const summary = "Invented long detail text for the memory test of the reader. ".repeat(40);
    for (let n = 0; inflatedBytes < TARGET_BYTES; n += 1) {
      const investigation = Math.floor(n / 3);
      const part = Buffer.from(
        `${line({
          id: idOf(investigation),
          comp: COMPONENTS[n % COMPONENTS.length],
          mfr: entityName(investigation % 450),
          odate: day(
            2012 + (investigation % 12),
            1 + (investigation % 12),
            1 + (investigation % 28),
          ),
          cdate:
            investigation % 7 === 0
              ? ""
              : day(
                  2013 + (investigation % 12),
                  1 + ((investigation + 3) % 12),
                  1 + ((investigation + 5) % 28),
                ),
          subject: `BIG SUBJECT ${investigation}`,
          summary,
        })}\n`,
      );
      parts.push(part);
      inflatedBytes += part.length;
      lineCount += 1;
    }
    zip = flatZip(ENTRY, Buffer.concat(parts));
  }, 120_000);

  it("is a zip of 40 MB inflated, with more than 4,000 investigations", () => {
    expect(inflatedBytes).toBeGreaterThan(40_000_000);
    expect(zip.length).toBeLessThan(inflatedBytes / 10);
    expect(lineCount).toBeGreaterThan(15_000);
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

    const snapshot = await nhtsaOdiConnector.download(fakeFetch(served(zip)), {});
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
    expect(bodyOf(snapshot).rows).toHaveLength(450);
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
