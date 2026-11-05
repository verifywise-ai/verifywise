/**
 * The FDA connector (spec D2.17): the list of AI-enabled medical devices as records of the vendor
 * risk database, one record for each company. The fixture is written from the list's schema (six
 * columns, MM/DD/YYYY dates, a Panel column that is filled, CRLF line ends, quotes where a field
 * holds a comma or a line break), with fictional companies and devices.
 */
import fs from "fs";
import path from "path";
import { type ConditionalResponse, FetchError } from "../../../../webResearch/guardedFetch";
import { matchOf, vendorKeys } from "../../keys";
import { vrdbSourceOf } from "../../sources";
import { FDA_COLUMNS, FDA_RECORD_MARK, FDA_URL, fdaConnector, fdaDayOf } from "../fda";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError, dayOf } from "../types";

const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures/fda-ai-devices.csv"), "utf8");
const LAST_MODIFIED = "Fri, 04 Sep 2026 11:54:10 GMT";
const DOCUMENTATION_PAGE = vrdbSourceOf("fda_ai_devices").documentationUrl;
const CLOSING =
  "The list records FDA marketing authorizations of devices that use AI; it is not a record of incidents, recalls or adverse events.";

const snapshotOf = (body: string, lastModified: string | null = LAST_MODIFIED) => ({
  bodies: [body],
  etag: null,
  lastModified,
  bytes: body.length,
});
const parse = (body: string = FIXTURE, lastModified: string | null = LAST_MODIFIED) =>
  fdaConnector.parse(snapshotOf(body, lastModified));
const recordOf = (id: string, body: string = FIXTURE) =>
  parse(body).records.find((record) => record.sourceRecordId === id);

interface DeviceRow {
  day: string;
  submission: string;
  device: string;
  company: string;
  panel: string;
  code: string;
}

/** A row of the list, valid unless a field is overridden. */
const rowOf = (over: Partial<DeviceRow> = {}): string[] => {
  const row: DeviceRow = {
    day: "06/29/2026",
    submission: "K900001",
    device: "Test Device",
    company: "Acme Scan Labs",
    panel: "Radiology",
    code: "ZZZ",
    ...over,
  };
  return [row.day, row.submission, row.device, row.company, row.panel, row.code];
};

const quoted = (field: string): string =>
  /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;

/** A body of rows of fields, written as the list writes them: quotes where needed, CRLF. */
const csvOf = (
  rows: ReadonlyArray<readonly string[]>,
  header: readonly string[] = FDA_COLUMNS,
): string => `${[header, ...rows].map((row) => row.map(quoted).join(",")).join("\r\n")}\r\n`;

/** Rows that read: a company of its own each. */
const goodRows = (count: number): string[][] =>
  Array.from({ length: count }, (_, index) =>
    rowOf({ submission: `K${100000 + index}`, company: `Company ${index} Labs` }),
  );

/** Rows that do not: a day that is no day. */
const badRows = (count: number): string[][] =>
  Array.from({ length: count }, (_, index) =>
    rowOf({ submission: `K${900000 + index}`, day: "13/45/2026" }),
  );

const sortedById = <T extends { sourceRecordId: string }>(records: readonly T[]): T[] =>
  [...records].sort((a, b) => (a.sourceRecordId < b.sourceRecordId ? -1 : 1));

const NOT_THE_LIST = { records: [], errors: 1, sourceVersion: null, root: null };

describe("fdaDayOf", () => {
  it.each([
    ["06/29/2026", "2026-06-29"],
    ["01/02/2026", "2026-01-02"],
    ["12/31/1999", "1999-12-31"],
    ["02/29/2024", "2024-02-29"],
    ["  06/29/2026\t", "2026-06-29"],
    ["6/9/2026", "2026-06-09"],
  ])("reads %s as month, day and year: %s", (text, day) => {
    expect(fdaDayOf(text)).toBe(day);
  });

  it.each([
    ["a day that comes first", "29/06/2026"],
    ["a day the month does not have", "02/30/2026"],
    ["the 29th of February of a year that is not a leap year", "02/29/2026"],
    ["the 31st of a month of thirty days", "06/31/2026"],
    ["a thirteenth month", "13/01/2026"],
    ["a month 0", "00/10/2026"],
    ["a day 0", "06/00/2026"],
    ["an ISO date", "2026-06-29"],
    ["dashes", "06-29-2026"],
    ["a year of two digits", "06/29/26"],
    ["a time after the day", "06/29/2026 10:00"],
    ["words", "June 29, 2026"],
    ["nothing", ""],
    ["blanks", "   "],
  ])("rejects %s (%s)", (_label, text) => {
    expect(fdaDayOf(text)).toBeNull();
  });

  it("gives null for a value that is missing", () => {
    expect(fdaDayOf(null)).toBeNull();
    expect(fdaDayOf(undefined)).toBeNull();
  });

  it("is the reason for its own reader: dayOf takes the same text with the day first", () => {
    expect(dayOf("06/29/2026")).toBeNull();
    expect(dayOf("01/02/2026")).toBe("2026-02-01");
    expect(fdaDayOf("01/02/2026")).toBe("2026-01-02");
  });
});

describe("fdaConnector", () => {
  it("is the connector of fda_ai_devices, at version 1, with the mark of the list", () => {
    expect(fdaConnector.id).toBe("fda_ai_devices");
    expect(fdaConnector.version).toBe(1);
    expect(FDA_RECORD_MARK).toBe("FDA list of AI-enabled medical devices");
    expect(FDA_RECORD_MARK).toBe(vrdbSourceOf("fda_ai_devices").name);
  });

  it("asks one fixed address, on www.fda.gov", () => {
    expect(FDA_URL).toBe("https://www.fda.gov/media/178541/download?attachment");
  });
});

describe("fdaConnector.parse", () => {
  it("makes one record of each company, in the order the file first names them", () => {
    const { records, errors, skipped, root } = parse();

    expect(errors).toBe(0);
    expect(skipped).toBe(0);
    expect(root).toBe("aiml-devices-csv.csv");
    expect(records.map((record) => record.sourceRecordId)).toEqual([
      "zorblatimaginginc",
      "plimsollcardiacsystemsgmbh",
      "quillfeatherhealthinc",
      "wexfordgloamdiagnosticsltd",
      "marrowbrookanalytics",
      "qco",
      "zéphyrscansystemssa",
    ]);
  });

  it("writes a company as a record: the counts, the days, the three newest devices, the closing sentence", () => {
    expect(recordOf("zorblatimaginginc")).toEqual({
      sourceRecordId: "zorblatimaginginc",
      recordType: "ai_device_authorizations",
      title: "FDA AI-enabled medical devices: Zorblat Imaging, Inc.",
      summary:
        "FDA list of AI-enabled medical devices (fda.gov). Company: Zorblat Imaging, Inc. " +
        "Devices on the list: 4, with final decisions from 2023-11-02 to 2026-06-29. " +
        "Newest: Zorblat Chest Triage (K900105, decided 2026-06-29, panel Radiology, product code ZZA); " +
        "Zorblat Lung Nodule Assist (K900106, decided 2026-03-14, panel Radiology, product code ZZB); " +
        "Zorblat Bone Age, Reader (K900104, decided 2026-03-14, panel Radiology, product code ZZA). " +
        CLOSING,
      url: `${DOCUMENTATION_PAGE}?company=zorblatimaginginc`,
      identifiers: {
        company: "Zorblat Imaging, Inc.",
        devices: 4,
        newestSubmissionNumbers: ["K900105", "K900106", "K900104"],
      },
      matchKeys: ["name:zorblatimaginginc", "name:zorblatimaging"],
      publishedAt: "2026-06-29",
      sourceUpdatedAt: null,
    });
  });

  it("lists the devices of a company that has fewer than three, and the one a supplement names", () => {
    expect(recordOf("plimsollcardiacsystemsgmbh")?.summary).toBe(
      "FDA list of AI-enabled medical devices (fda.gov). Company: Plimsoll Cardiac Systems GmbH. " +
        "Devices on the list: 2, with final decisions from 2025-12-09 to 2026-05-20. " +
        "Newest: Plimsoll Rhythm Monitor (K900301, decided 2026-05-20, panel Cardiovascular, product code ZZC); " +
        "Plimsoll Valve Sizer (K900302, decided 2025-12-09, panel Cardiovascular, product code ZZC). " +
        CLOSING,
    );
    expect(recordOf("quillfeatherhealthinc")?.summary).toBe(
      "FDA list of AI-enabled medical devices (fda.gov). Company: Quillfeather Health Inc. " +
        "Devices on the list: 1, with final decisions from 2026-04-02 to 2026-04-02. " +
        "Newest: Quillfeather Seizure Predictor (P900201/S004, decided 2026-04-02, panel Neurology, product code ZZD). " +
        CLOSING,
    );
    expect(recordOf("quillfeatherhealthinc")?.identifiers).toEqual({
      company: "Quillfeather Health Inc.",
      devices: 1,
      newestSubmissionNumbers: ["P900201/S004"],
    });
  });

  it("titles a company by its most frequent spelling, and makes one record of its spellings", () => {
    // Three rows write "Zorblat Imaging, Inc." and one writes "ZORBLAT IMAGING INC": one company.
    const record = recordOf("zorblatimaginginc");

    expect(record?.title).toBe("FDA AI-enabled medical devices: Zorblat Imaging, Inc.");
    expect(record?.identifiers.devices).toBe(4);
    expect(parse().records.filter((item) => /zorblat/.test(item.sourceRecordId))).toHaveLength(1);
  });

  it("breaks a tie of spellings by the newer decision, and then by the text", () => {
    // One row each: the spelling of the newer decision wins.
    expect(recordOf("plimsollcardiacsystemsgmbh")?.identifiers.company).toBe(
      "Plimsoll Cardiac Systems GmbH",
    );
    // The same day: the text decides, whatever the order of the rows.
    const rows = [
      rowOf({ company: "Alpha Beta Ltd", submission: "K1" }),
      rowOf({ company: "ALPHA BETA LTD", submission: "K2" }),
    ];
    for (const ordered of [rows, [...rows].reverse()]) {
      expect(recordOf("alphabetaltd", csvOf(ordered))?.identifiers.company).toBe("ALPHA BETA LTD");
    }
    // The newer decision decides even when the text of the older one comes first.
    const older = rowOf({ day: "01/05/2020", company: "ALPHA LABS INC", submission: "K1" });
    const newer = rowOf({ day: "06/29/2026", company: "Alpha Labs Inc", submission: "K2" });
    for (const ordered of [
      [older, newer],
      [newer, older],
    ]) {
      expect(recordOf("alphalabsinc", csvOf(ordered))?.identifiers.company).toBe("Alpha Labs Inc");
    }
  });

  it("keys a record by the name of every spelling the file uses for the company", () => {
    const rows = [
      rowOf({ company: "Shanghai Example Healthcare Co., Ltd.", submission: "K1" }),
      rowOf({ company: "Shanghai Example Healthcare Co.,Ltd.", submission: "K2" }),
      rowOf({ company: "Shanghai Example Healthcare Co., Ltd", submission: "K3" }),
    ];

    const record = recordOf("shanghaiexamplehealthcarecoltd", csvOf(rows));

    expect(record?.identifiers.devices).toBe(3);
    expect(record?.matchKeys).toEqual([
      "name:shanghaiexamplehealthcarecoltd",
      "name:shanghaiexamplehealthcare",
    ]);
  });

  it("keeps the name keys of a spelling that is not the one the record is titled by", () => {
    // "VertexImagingInc" cannot be split into a name and a legal form, "Vertex Imaging, Inc" can.
    const rows = [
      rowOf({ company: "VertexImagingInc", submission: "K1" }),
      rowOf({ company: "VertexImagingInc", submission: "K2" }),
      rowOf({ company: "Vertex Imaging, Inc", submission: "K3" }),
    ];

    const record = recordOf("verteximaginginc", csvOf(rows));

    expect(record?.identifiers.company).toBe("VertexImagingInc");
    expect(record?.matchKeys).toEqual(["name:verteximaginginc", "name:verteximaging"]);
  });

  it("puts the three newest devices in order of decision day, the higher submission number first on one day", () => {
    const rows = [
      rowOf({ day: "01/05/2020", submission: "K10", device: "Oldest" }),
      rowOf({ day: "03/14/2026", submission: "K20", device: "Same day, lower" }),
      rowOf({ day: "03/14/2026", submission: "K30", device: "Same day, higher" }),
      rowOf({ day: "06/29/2026", submission: "K05", device: "Newest" }),
      rowOf({ day: "02/02/2024", submission: "K40", device: "Middle" }),
    ];

    const record = recordOf("acmescanlabs", csvOf(rows));

    expect(record?.identifiers).toEqual({
      company: "Acme Scan Labs",
      devices: 5,
      newestSubmissionNumbers: ["K05", "K30", "K20"],
    });
    expect(record?.summary).toContain("with final decisions from 2020-01-05 to 2026-06-29.");
    expect(record?.summary).toMatch(
      /Newest: Newest \(K05.*; Same day, higher \(K30.*; Same day, lower \(K20/,
    );
    expect(record?.summary).not.toContain("Middle");
    expect(record?.summary).not.toContain("Oldest");
  });

  it("gives the same records whatever the order of the rows", () => {
    const rows = [
      rowOf({ day: "06/29/2026", submission: "K1", company: "Alpha Co Ltd", device: "D1" }),
      rowOf({ day: "06/29/2026", submission: "K2", company: "ALPHA CO LTD", device: "D2" }),
      rowOf({ day: "03/01/2025", submission: "K3", company: "Alpha Co, Ltd.", device: "D3" }),
      rowOf({ day: "03/01/2025", submission: "K4", company: "Beta Labs", device: "D4" }),
      rowOf({ day: "03/01/2025", submission: "K5", company: "Beta Labs", device: "D5" }),
    ];

    const forward = parse(csvOf(rows));
    const reversed = parse(csvOf([...rows].reverse()));

    expect(sortedById(reversed.records)).toEqual(sortedById(forward.records));
    expect(forward.records).toHaveLength(2);
    expect(recordOf("alphacoltd", csvOf(rows))).toMatchObject({
      identifiers: {
        company: "ALPHA CO LTD",
        devices: 3,
        newestSubmissionNumbers: ["K2", "K1", "K3"],
      },
      matchKeys: ["name:alphacoltd", "name:alpha"],
    });
  });

  it("keeps a comma that a quoted device name holds", () => {
    expect(recordOf("zorblatimaginginc")?.summary).toContain(
      "Zorblat Bone Age, Reader (K900104, decided 2026-03-14",
    );
  });

  it("trims a company that is padded with a tab and a line break, and keeps a letter with an accent", () => {
    const record = recordOf("wexfordgloamdiagnosticsltd");

    expect(record?.title).toBe("FDA AI-enabled medical devices: Wexford Gloam Diagnostics Ltd.");
    expect(record?.identifiers.company).toBe("Wexford Gloam Diagnostics Ltd.");
    expect(record?.summary).toContain(
      "Newest: Wexford Rétina Screen (DEN900402, decided 2026-01-15",
    );
    expect(record?.matchKeys).toEqual([
      "name:wexfordgloamdiagnosticsltd",
      "name:wexfordgloamdiagnostics",
    ]);
  });

  it("drops a comma that ends a company name, so that its two spellings are one", () => {
    const record = recordOf("marrowbrookanalytics");

    expect(record?.identifiers).toEqual({
      company: "Marrowbrook Analytics",
      devices: 2,
      newestSubmissionNumbers: ["K900210", "K900211"],
    });
    expect(record?.summary).toContain("Company: Marrowbrook Analytics. Devices on the list: 2");
  });

  it("keeps the letters of any script in the key and percent-encodes them in the address", () => {
    const record = recordOf("zéphyrscansystemssa");

    expect(record?.url).toBe(`${DOCUMENTATION_PAGE}?company=z%C3%A9phyrscansystemssa`);
    expect(record?.matchKeys).toEqual(["name:zéphyrscansystemssa", "name:zéphyrscansystems"]);
  });

  it("gives a company whose name is shorter than four letters no name key", () => {
    const record = recordOf("qco");

    expect(record?.matchKeys).toEqual([]);
    expect(record?.identifiers.company).toBe("Q-Co");
  });

  it("dates a record by its latest decision, and leaves the update time empty", () => {
    expect(recordOf("marrowbrookanalytics")).toMatchObject({
      publishedAt: "2022-08-30",
      sourceUpdatedAt: null,
    });
    expect(recordOf("qco")?.publishedAt).toBe("2021-07-07");
  });

  it("begins every record with the mark of the list and ends it with what the list is not", () => {
    for (const record of parse().records) {
      expect(record.summary.startsWith(`${FDA_RECORD_MARK} (fda.gov). Company: `)).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.title.startsWith("FDA AI-enabled medical devices: ")).toBe(true);
      expect(record.summary).not.toMatch(/as of|Lookup note/i);
      expect(record.summary).not.toContain("..");
    }
  });

  it("holds an address of the documentation page and never one of the file", () => {
    const text = JSON.stringify(parse().records);

    expect(text).not.toContain("178541");
    expect(text).not.toContain("download?attachment");
    for (const record of parse().records) {
      expect(record.url.startsWith(`${DOCUMENTATION_PAGE}?company=`)).toBe(true);
    }
    expect(DOCUMENTATION_PAGE.startsWith("https://www.fda.gov/")).toBe(true);
  });

  it("matches a vendor of the same name by the name alone, which is a weak match", () => {
    const keys = vendorKeys({
      name: "Zorblat Imaging",
      domain: null,
      provides: "Imaging software",
    });
    const record = recordOf("zorblatimaginginc");

    expect(matchOf(record?.matchKeys ?? [], keys)).toEqual({
      method: "name_exact",
      strength: "weak",
      matchedKey: "name:zorblatimaging",
    });
    expect(record?.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
  });

  it("cuts the key of a very long name at 160 characters, and keeps the id within 200", () => {
    const company = "Abc".repeat(66);

    const record = parse(csvOf([rowOf({ company })])).records[0];

    expect(record.sourceRecordId).toBe("abc".repeat(66).slice(0, 160));
    expect(record.sourceRecordId.length).toBeLessThanOrEqual(200);
    expect(record.url.endsWith(`?company=${record.sourceRecordId}`)).toBe(true);
  });

  it("makes one record of names that differ only after the 160th letter", () => {
    const prefix = "x".repeat(160);
    const rows = [
      rowOf({ company: `${prefix}1`, submission: "K1" }),
      rowOf({ company: `${prefix}2`, submission: "K2" }),
    ];

    const { records } = parse(csvOf(rows));

    expect(records).toHaveLength(1);
    expect(records[0].identifiers.devices).toBe(2);
  });

  it("writes a device that has no name, no panel and no product code from what the row has", () => {
    const { records } = parse(csvOf([rowOf({ device: "", panel: "", code: "" })]));

    expect(records[0].summary).toContain("Newest: Unnamed device (K900001, decided 2026-06-29).");
  });

  it("writes a device with its own white space collapsed and its control characters dropped", () => {
    const nul = String.fromCharCode(0);
    const { records } = parse(csvOf([rowOf({ device: `Foo   Bar\t\nBaz${nul}Qux` })]));

    expect(records[0].summary).toContain("Newest: Foo Bar BazQux (K900001");
  });
});

describe("fdaConnector.parse, the source version", () => {
  it("reads the day of Last-Modified", () => {
    expect(parse().sourceVersion).toBe("2026-09-04");
    expect(parse(FIXTURE, "Thu, 01 Jan 2026 00:00:00 GMT").sourceVersion).toBe("2026-01-01");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["words", "yesterday"],
    ["a day that does not exist", "Fri, 30 Feb 2026 11:54:10 GMT"],
    ["a month nobody names", "Fri, 04 Foo 2026 11:54:10 GMT"],
    ["an ISO time", "2026-09-04T11:54:10Z"],
  ])("gives no version for a Last-Modified that is %s", (_label, lastModified) => {
    const result = parse(FIXTURE, lastModified);

    expect(result.sourceVersion).toBeNull();
    expect(result.records).toHaveLength(7);
    expect(result.root).toBe("aiml-devices-csv.csv");
  });
});

describe("fdaConnector.parse, the header", () => {
  const COLUMNS = [...FDA_COLUMNS];
  const SWAPPED = [COLUMNS[1], COLUMNS[0], ...COLUMNS.slice(2)];
  const body = [rowOf()];

  it.each([
    ["an empty file", ""],
    ["a page of the site that is not the file", "<html><body>Access Denied</body></html>"],
    ["rows without a header row", FIXTURE.slice(FIXTURE.indexOf("\r\n") + 2)],
    ["a column missing", csvOf(body, COLUMNS.slice(0, 5))],
    ["a column more", csvOf(body, [...COLUMNS, "Date Added"])],
    ["the columns in another order", csvOf(body, SWAPPED)],
    ["another name for a column", csvOf(body, [...COLUMNS.slice(0, 5), "Product Code"])],
    [
      "names in another case",
      csvOf(
        body,
        COLUMNS.map((name) => name.toLowerCase()),
      ),
    ],
    ["a delimiter that is not a comma", COLUMNS.join(";")],
  ])("gives no root for %s", (_label, text) => {
    expect(parse(text)).toEqual(NOT_THE_LIST);
  });

  it("takes a header whose names have blanks around them", () => {
    const padded = COLUMNS.map((name) => `  ${name}\t`);

    const result = parse(csvOf([rowOf()], padded));

    expect(result.root).toBe("aiml-devices-csv.csv");
    expect(result.records).toHaveLength(1);
  });

  it("reads a file that begins with a byte order mark as it reads one that does not", () => {
    const bom = String.fromCharCode(0xfeff);

    expect(FIXTURE.charCodeAt(0)).not.toBe(0xfeff);
    expect(parse(`${bom}${FIXTURE}`)).toEqual(parse());
    expect(parse(`${bom}${FIXTURE}`).records).toHaveLength(7);
  });

  it("reads a file that begins with a byte order mark before a quoted header", () => {
    // The mark would keep the first cell from being read as quoted.
    const bom = String.fromCharCode(0xfeff);
    const header = FDA_COLUMNS.map((name) => `"${name}"`).join(",");

    const result = parse(`${bom}${header}\r\n${rowOf().join(",")}\r\n`);

    expect(result).toMatchObject({ errors: 0, skipped: 0, root: "aiml-devices-csv.csv" });
    expect(result.records.map((record) => record.sourceRecordId)).toEqual(["acmescanlabs"]);
  });

  it("gives a root and no record for a file of the header alone, which the sync refuses as empty", () => {
    expect(parse(csvOf([]))).toEqual({
      records: [],
      errors: 0,
      skipped: 0,
      sourceVersion: "2026-09-04",
      root: "aiml-devices-csv.csv",
    });
  });
});

describe("fdaConnector.parse, the rows it leaves out", () => {
  it.each([
    ["no company", { company: "" }],
    ["a company of punctuation only", { company: " - . , " }],
    ["no submission number", { submission: "  " }],
    ["a day that comes first", { day: "29/06/2026" }],
    ["a day that does not exist", { day: "02/30/2026" }],
    ["a date in another format", { day: "2026-06-29" }],
    ["no date", { day: "" }],
    ["a company of more than 200 characters", { company: "A".repeat(201) }],
    ["a submission number of more than 60 characters", { submission: "K".repeat(61) }],
  ])("skips and counts a row with %s, and the others stand", (_label, over) => {
    const result = parse(
      csvOf([rowOf({ submission: "K1" }), rowOf({ company: "Other Labs", ...over })]),
    );

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.root).toBe("aiml-devices-csv.csv");
    expect(result.records.map((record) => record.sourceRecordId)).toEqual(["acmescanlabs"]);
    expect(result.records[0].identifiers.devices).toBe(1);
  });

  it("skips and counts a row of five fields, and one of seven", () => {
    const short = rowOf({ submission: "K2" }).slice(0, 5);
    const long = [...rowOf({ submission: "K3" }), "extra"];

    const result = parse(csvOf([rowOf({ submission: "K1" }), short, long]));

    expect(result).toMatchObject({ errors: 0, skipped: 2 });
    expect(result.records).toHaveLength(1);
  });

  it("takes a company of exactly 200 characters and a submission number of exactly 60", () => {
    const result = parse(csvOf([rowOf({ company: "A".repeat(200), submission: "K".repeat(60) })]));

    expect(result).toMatchObject({ errors: 0, skipped: 0 });
    expect(result.records).toHaveLength(1);
  });

  it("skips ten rows of a small file, or a hundredth of a large one, and refuses more", () => {
    // 200 rows: a hundredth is 2, so the ten of the rule count.
    expect(parse(csvOf([...goodRows(190), ...badRows(10)]))).toMatchObject({
      skipped: 10,
      errors: 0,
    });
    expect(parse(csvOf([...goodRows(189), ...badRows(11)]))).toMatchObject({
      skipped: 0,
      errors: 11,
    });
    // 2,000 rows: a hundredth is 20.
    const large = parse(csvOf([...goodRows(1980), ...badRows(20)]));
    expect(large).toMatchObject({ skipped: 20, errors: 0 });
    expect(large.records).toHaveLength(1980);
    expect(parse(csvOf([...goodRows(1979), ...badRows(21)]))).toMatchObject({
      skipped: 0,
      errors: 21,
    });
  });

  it("refuses a file in which every date has changed its format", () => {
    const rows = goodRows(300).map((row) => [`2026-06-29`, ...row.slice(1)]);

    expect(parse(csvOf(rows))).toMatchObject({ records: [], errors: 300, skipped: 0 });
  });

  it("is no row to a blank line, a row of empty fields, or an end-of-file mark", () => {
    const mark = String.fromCharCode(0x1a);
    const noise = `\r\n\r\n,,,,,\r\n \t ,,,,\r\n${mark}\r\n${mark},,\r\n`;

    expect(parse(`${FIXTURE}${noise}`)).toEqual(parse());
    expect(parse(`${FIXTURE}${noise}`)).toMatchObject({ skipped: 0, errors: 0 });
  });

  it("counts the rows of the tolerance without the blank ones", () => {
    const noise = ",,,,,\r\n".repeat(5000);
    const rows = csvOf([...goodRows(100), ...badRows(10)]);

    expect(parse(`${rows}${noise}`)).toMatchObject({ skipped: 10, errors: 0 });
    expect(parse(`${csvOf([...goodRows(100), ...badRows(11)])}${noise}`)).toMatchObject({
      skipped: 0,
      errors: 11,
    });
  });

  it("counts a file that ends inside a quoted field as one error, and keeps the rows before it", () => {
    const result = parse(`${FIXTURE}06/29/2026,K1,"Cut devi`);

    expect(result.errors).toBe(1);
    expect(result.records).toEqual(parse().records);
  });

  it("counts a file of more rows than the list can hold as an error: it is not the list", () => {
    expect(parse(csvOf(goodRows(19_999))).errors).toBe(0);
    expect(parse(csvOf(goodRows(20_000))).errors).toBe(1);
  });
});

describe("fdaConnector.parse, the text of the list", () => {
  it("reads the bytes 0x80 to 0x9f that a windows-1252 file left in the text as windows-1252 reads them", () => {
    const decoder = new TextDecoder("windows-1252");
    for (let code = 0x80; code <= 0x9f; code += 1) {
      // The five bytes windows-1252 leaves undefined come back as themselves: they are dropped.
      const written = decoder.decode(Uint8Array.of(code));
      const expected = written.charCodeAt(0) === code ? "" : written;

      const { records } = parse(csvOf([rowOf({ device: `A${String.fromCharCode(code)}B` })]));

      expect(records[0].summary).toContain(`Newest: A${expected}B (K900001`);
    }
  });

  it("writes the trade mark that the real file leaves as a control character", () => {
    const trademark = String.fromCharCode(0x99);

    const { records } = parse(csvOf([rowOf({ device: `Acme Scan${trademark} Pro` })]));

    expect(records[0].summary).toContain("Newest: Acme Scan™ Pro (K900001");
  });

  it("cuts a device name of more than 500 characters and says so, and keeps one of 500", () => {
    const long = parse(csvOf([rowOf({ device: "x".repeat(600) })])).records[0];
    const whole = parse(csvOf([rowOf({ device: "x".repeat(500) })])).records[0];

    expect(long.summary).toContain(`Newest: ${"x".repeat(488)} [shortened] (K900001,`);
    expect(long.summary.length).toBeLessThan(1000);
    expect(whole.summary).toContain(`Newest: ${"x".repeat(500)} (K900001,`);
  });

  it("cuts a panel or a product code that runs on", () => {
    const { records } = parse(csvOf([rowOf({ panel: "p".repeat(300), code: "c".repeat(300) })]));

    expect(records[0].summary.length).toBeLessThan(1000);
    expect(records[0].summary).toContain("[shortened], product code ");
  });

  it("reads a file of a hostile size in linear time", () => {
    const padding = ", ".repeat(700_000);
    const bodies = [
      csvOf([rowOf({ company: `Acme${padding}x` })]),
      csvOf([rowOf({ company: `x${padding}` })]),
      csvOf([rowOf({ device: `x${padding}x` })]),
      csvOf([rowOf({ device: " ".repeat(1_500_000) })]),
    ];

    const started = Date.now();
    const results = bodies.map((text) => parse(text));

    expect(Date.now() - started).toBeLessThan(5000);
    // A name of a million characters is no name; one that is only padding after "x" is "x".
    expect(results[0].skipped).toBe(1);
    expect(results[1].records[0].identifiers.company).toBe("x");
    expect(results[2].records[0].summary.length).toBeLessThan(2000);
    expect(results[3].records[0].summary).toContain("Unnamed device");
  });
});

describe("fdaConnector.download", () => {
  const answer = (
    over: Partial<Extract<ConditionalResponse, { notModified: false }>> = {},
  ): ConditionalResponse => ({
    notModified: false,
    url: FDA_URL,
    status: 200,
    contentType: "text/csv; charset=UTF-8",
    body: Buffer.from(FIXTURE),
    truncated: false,
    etag: null,
    lastModified: LAST_MODIFIED,
    ...over,
  });

  it("asks the fixed address with the validators and the limits of the list, and answers unchanged on a 304", async () => {
    const calls: Parameters<ConnectorFetch>[] = [];
    const fetch: ConnectorFetch = async (...args) => {
      calls.push(args);
      return { notModified: true, url: args[0] };
    };
    const validators = { etag: null, lastModified: LAST_MODIFIED };

    await expect(fdaConnector.download(fetch, validators)).resolves.toBe("unchanged");
    expect(calls).toEqual([
      [
        FDA_URL,
        validators,
        {
          maxBytes: 2 * 1024 * 1024,
          allowedContentTypes: ["text/csv", "application/octet-stream"],
          totalTimeoutMs: 60_000,
        },
      ],
    ]);
  });

  it("keeps the body and the new Last-Modified of a 200, and no address", async () => {
    const snapshot = await fdaConnector.download(async () => answer(), {});

    expect(snapshot).toEqual({
      bodies: [FIXTURE],
      etag: null,
      lastModified: LAST_MODIFIED,
      bytes: Buffer.byteLength(FIXTURE),
    });
    expect(JSON.stringify(snapshot)).not.toContain("fda.gov");
  });

  it("hands on a Last-Modified that a parse reads as the version of the list", async () => {
    const snapshot = await fdaConnector.download(async () => answer(), {});

    expect(snapshot).not.toBe("unchanged");
    if (snapshot === "unchanged") return;
    const parsed = fdaConnector.parse(snapshot);
    expect(parsed.sourceVersion).toBe("2026-09-04");
    expect(parsed.records).toHaveLength(7);
  });

  it("drops the byte order mark of a body that begins with one", async () => {
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(FIXTURE)]);

    const snapshot = await fdaConnector.download(async () => answer({ body }), {});

    expect(snapshot).toMatchObject({ bodies: [FIXTURE], bytes: body.length });
  });

  it("takes an answer from another path of www.fda.gov", async () => {
    const url = "https://www.fda.gov/media/178541/download";

    await expect(fdaConnector.download(async () => answer({ url }), {})).resolves.toMatchObject({
      bodies: [FIXTURE],
    });
    await expect(fdaConnector.download(async () => ({ notModified: true, url }), {})).resolves.toBe(
      "unchanged",
    );
  });

  it("refuses a body cut at its limit", async () => {
    const fetch: ConnectorFetch = async () =>
      answer({ truncated: true, body: Buffer.from("Date") });

    await expect(fdaConnector.download(fetch, {})).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it.each([
    ["another site", "https://example.com/media/178541/download?attachment"],
    ["the bare domain", "https://fda.gov/media/178541/download?attachment"],
    ["a host that only begins with www.fda.gov", "https://www.fda.gov.example.com/download"],
    ["a subdomain of fda.gov", "https://static.fda.gov/media/178541/download?attachment"],
    ["http", "http://www.fda.gov/media/178541/download?attachment"],
    ["another port", "https://www.fda.gov:8443/media/178541/download?attachment"],
    ["an address with a user name", "https://user@www.fda.gov/media/178541/download?attachment"],
    ["no address", "not an address"],
    ["no text", ""],
  ])(
    "refuses a 200 and a 304 that %s answered, with an error that holds no address",
    async (_label, url) => {
      for (const fetch of [
        async () => answer({ url }),
        async () => ({ notModified: true as const, url }),
      ]) {
        const error = await fdaConnector.download(fetch, {}).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(NotTheListError);
        expect((error as Error).message).toBe("The file is not the list.");
      }
    },
  );

  it("lets the errors of the page guard through as they are", async () => {
    const fetch: ConnectorFetch = async () => {
      throw new FetchError("blocked_by_site");
    };

    await expect(fdaConnector.download(fetch, {})).rejects.toMatchObject({
      name: "FetchError",
      reason: "blocked_by_site",
    });
  });
});
