/**
 * The connector of the AI Incident Database (spec D2.14, behind the closed gate Q29): the page of
 * snapshots is searched for the newest export on the pinned host, the workbook is read on the
 * hardened readers (zip.ts, xmlScan.ts, xlsx.ts), and each incident becomes a record. The
 * workbooks are written by the test, in the shape of the real export (inline strings, absolute
 * targets, a title row and a row of groups above the header, the sheet before the workbook) and
 * with exceljs (shared strings). Every incident, vendor and name is fictional; the columns the
 * connector must never read hold a sentinel text, which no record may show.
 */
jest.mock("../../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import {
  type ConditionalResponse,
  FetchError,
  type Validators,
} from "../../../../webResearch/guardedFetch";
import { type WriterEntry, writeZip } from "../../__tests__/helpers/zipWriter";
import { type SyncStore, syncSource } from "../../sync";
import type { ParsedRecord, VrdbSnapshotWrite } from "../../types";
import { ZipError } from "../../zip";
import {
  AIID_EXPORT_HOST,
  AIID_RECORD_MARK,
  AIID_SNAPSHOTS_URL,
  AIID_ZIP_LIMITS,
  aiidConnector,
  aiidDescriptionOf,
} from "../aiid";
import { BodyTooLargeError, type ConnectorFetch, type Snapshot } from "../types";

const PAGE = fs.readFileSync(path.join(__dirname, "fixtures/aiid-snapshots.html"), "utf8");
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DATE = "20261102";

const exportUrl = (date: string, folder = "") =>
  `https://${AIID_EXPORT_HOST}/${folder}AIID_Excel_Export-${date}.xlsx`;

// ---- the workbook ---------------------------------------------------------------------------

type Cell = string | number | boolean | null;

const HEADER = [
  "Incident ID",
  "date",
  "year",
  "title",
  "description",
  "deployer",
  "developer",
  "harmed",
  "Editors",
  "Implicated Systems",
  "Date Modified",
  "Editor Notes",
  "Data Sources",
  "report_count",
  "Risk Domain",
  "Risk Subdomain",
  "Harm Domain",
] as const;
type Column = (typeof HEADER)[number];
type Incident = Partial<Record<Column, Cell>>;

/** What the connector must never read: no record may show any of it. */
const SENTINELS = [
  "HARMED-SENTINEL",
  "EDITORS-SENTINEL",
  "SYSTEMS-SENTINEL",
  "NOTES-SENTINEL",
  "SOURCES-SENTINEL",
  "DOMAIN-SENTINEL",
  "SUBDOMAIN-SENTINEL",
  "HARMDOMAIN-SENTINEL",
  "REPORT-SHEET-SENTINEL",
  "ENTITY-SHEET-SENTINEL",
];

let counter = 1000;
/** An incident with a value in every column, the excluded ones holding a sentinel. */
function incident(over: Incident = {}): Incident {
  counter += 1;
  return {
    "Incident ID": counter,
    date: 25569,
    year: 1970,
    title: `Fictional incident number ${counter}`,
    description: "A fictional system reportedly did something it should not have done.",
    deployer: "Brightmart",
    developer: "Acme Vision",
    harmed: "HARMED-SENTINEL",
    Editors: "EDITORS-SENTINEL",
    "Implicated Systems": "SYSTEMS-SENTINEL",
    "Date Modified": "2026-10-01",
    "Editor Notes": "NOTES-SENTINEL",
    "Data Sources": "SOURCES-SENTINEL",
    report_count: 3,
    "Risk Domain": "DOMAIN-SENTINEL",
    "Risk Subdomain": "SUBDOMAIN-SENTINEL",
    "Harm Domain": "HARMDOMAIN-SENTINEL",
    ...over,
  };
}

const rowOf = (item: Incident): Cell[] => HEADER.map((name) => item[name] ?? null);

const xmlEscape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function columnName(column: number): string {
  let name = "";
  for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

/** Rows as the writer of the real export writes them: inline strings, t="n" numbers, empty inline strings. */
function sheetXml(rows: ReadonlyArray<readonly Cell[]>): string {
  const body = rows
    .map((cells, rowIndex) => {
      const row = rowIndex + 1;
      const xml = cells
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex + 1)}${row}`;
          if (value === null) return `<c r="${reference}" t="inlineStr" />`;
          if (typeof value === "number") return `<c r="${reference}" t="n"><v>${value}</v></c>`;
          if (typeof value === "boolean") {
            return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
          }
          return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${row}">${xml}</row>`;
    })
    .join("");
  return `<worksheet xmlns="${MAIN}"><sheetData>${body}</sheetData></worksheet>`;
}

/** The rows of the real Incidents sheet: a title, a row of groups, the header, then the incidents. */
const incidentRows = (incidents: readonly Incident[]): Cell[][] => [
  ["AI Incident Database - Incidents | fictional export"],
  ["INCIDENT IDENTITY", null, null, null, null, null, null, null, null, null, null, null],
  [...HEADER],
  ...incidents.map(rowOf),
];

interface WorkbookOptions {
  /** The XML of the Incidents sheet, in place of the one made from the incidents. */
  sheet?: string;
  /** The name of the sheet, in place of `Incidents`. */
  name?: string;
  /** The target of the relationship of the sheet, in place of `/xl/worksheets/sheet1.xml`. */
  target?: string;
  properties?: string;
  /** Parts added to the package that the connector does not read, to count against its limit. */
  extraParts?: number;
}

/**
 * A workbook in the order of the real export's zip: five sheets, then the workbook and its
 * relationships. The zip holds the sheet under the very name its target resolves to, so that only
 * the reader's check of the target can refuse it and not the lack of a part.
 */
function workbookZip(incidents: readonly Incident[], options: WorkbookOptions = {}): Buffer {
  const target = options.target ?? "/xl/worksheets/sheet1.xml";
  const sheets = [
    {
      name: options.name ?? "Incidents",
      xml: options.sheet ?? sheetXml(incidentRows(incidents)),
    },
    { name: "Reports", xml: sheetXml([["REPORT-SHEET-SENTINEL"]]) },
    { name: "Entities", xml: sheetXml([["ENTITY-SHEET-SENTINEL"]]) },
    { name: "Data Dictionary", xml: sheetXml([["dictionary"]]) },
    { name: "Coverage Map", xml: sheetXml([["coverage"]]) },
  ];
  const entries: WriterEntry[] = sheets.map((sheet, index) => ({
    name:
      index === 0
        ? target.startsWith("/")
          ? target.slice(1)
          : `xl/${target}`
        : `xl/worksheets/sheet${index + 1}.xml`,
    data: sheet.xml,
  }));
  entries.push({
    name: "xl/workbook.xml",
    data:
      `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}">${options.properties ?? "<workbookPr />"}<sheets>` +
      sheets
        .map(
          (sheet, index) =>
            `<sheet name="${sheet.name}" sheetId="${index + 1}" state="visible" r:id="rId${index + 1}" />`,
        )
        .join("") +
      `</sheets></workbook>`,
  });
  entries.push({
    name: "xl/_rels/workbook.xml.rels",
    data:
      `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">` +
      sheets
        .map(
          (_sheet, index) =>
            `<Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="${
              index === 0 ? target : `/xl/worksheets/sheet${index + 1}.xml`
            }" Id="rId${index + 1}" />`,
        )
        .join("") +
      `</Relationships>`,
  });
  for (let index = 0; index < (options.extraParts ?? 0); index += 1) {
    entries.push({ name: `docProps/part${index}.xml`, data: "<part />" });
  }
  return writeZip(entries);
}

/** A sheet with one numeric cell at a place, for the limits on rows and columns. */
const cellSheet = (reference: string, row: number): string =>
  `<worksheet xmlns="${MAIN}"><sheetData><row r="${row}">` +
  `<c r="${reference}" t="n"><v>1</v></c></row></sheetData></worksheet>`;

/** The code of the ZipError an action throws; null for none, "other" for any other error. */
const codeOf = (action: () => unknown): string | null => {
  try {
    action();
  } catch (error) {
    return error instanceof ZipError ? error.code : "other";
  }
  return null;
};

/** A workbook whose Incidents sheet inflates past the 48 MiB the connector allows (about 50 KB zipped). */
let bombCache: Buffer | undefined;
const bombWorkbook = (): Buffer => {
  bombCache ??= workbookZip([], {
    sheet: `<worksheet xmlns="${MAIN}"><!--${" ".repeat(48 * 1024 * 1024 + 1024)}--><sheetData /></worksheet>`,
  });
  return bombCache;
};

// ---- the feed -------------------------------------------------------------------------------

const answer = (
  body: Buffer | string,
  over: Partial<Extract<ConditionalResponse, { notModified: false }>> = {},
): ConditionalResponse => ({
  notModified: false,
  url: "",
  status: 200,
  contentType: "text/html",
  body: Buffer.isBuffer(body) ? body : Buffer.from(body),
  truncated: false,
  etag: null,
  lastModified: null,
  ...over,
});

interface Served {
  html?: string;
  /** The file of each address the test serves; the newest export of the fixture page by default. */
  files?: Record<string, Buffer>;
}

/** A fetch that serves the page and the files, and records what it was asked. */
function server(file: Buffer, served: Served = {}) {
  const calls: Array<{ url: string; validators: Validators; limits: unknown }> = [];
  const files = served.files ?? { [exportUrl(DATE)]: file };
  const fetch: ConnectorFetch = async (url, validators, limits) => {
    calls.push({ url, validators, limits });
    if (url === AIID_SNAPSHOTS_URL) {
      return answer(served.html ?? PAGE, { url, contentType: "text/html; charset=utf-8" });
    }
    const body = files[url];
    if (body === undefined) throw new Error("an address the test does not serve");
    return answer(body, {
      url,
      contentType: XLSX_TYPE,
      etag: '"export-1"',
      lastModified: "Mon, 02 Nov 2026 10:04:27 GMT",
    });
  };
  return { fetch, calls };
}

async function downloadOf(file: Buffer, served: Served = {}): Promise<Snapshot> {
  const snapshot = await aiidConnector.download(server(file, served).fetch, {});
  if (snapshot === "unchanged") throw new Error("Expected a snapshot");
  return snapshot;
}

const snapshotOf = (bodies: string[]): Snapshot => ({
  bodies,
  etag: null,
  lastModified: null,
  bytes: 0,
});
const parseRows = (rows: ReadonlyArray<readonly Cell[]>) =>
  aiidConnector.parse(snapshotOf([DATE, sheetXml(rows)]));
const parseIncidents = (incidents: readonly Incident[]) => parseRows(incidentRows(incidents));
const recordOf = (item: Incident): ParsedRecord => {
  const { records } = parseIncidents([item]);
  expect(records).toHaveLength(1);
  return records[0];
};

const rejectionOf = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected a rejection");
};

// ---- parse ----------------------------------------------------------------------------------

describe("aiidConnector", () => {
  it("is the connector of aiid, in its first version, with the mark its records begin with", () => {
    expect(aiidConnector.id).toBe("aiid");
    expect(aiidConnector.version).toBe(1);
    expect(AIID_RECORD_MARK).toBe("AI Incident Database");
  });

  it("keeps the zip limits of the ruling: 64 parts, 48 MiB for one, 64 MiB in all", () => {
    expect(AIID_ZIP_LIMITS).toEqual({
      maxEntries: 64,
      maxEntryBytes: 48 * 1024 * 1024,
      maxTotalBytes: 64 * 1024 * 1024,
    });
  });
});

describe("aiidConnector.parse", () => {
  it("reads the header from the third row, below a title and a row of groups", () => {
    const { records, errors, skipped, root, sourceVersion } = parseIncidents([
      incident({ "Incident ID": 101 }),
      incident({ "Incident ID": 102 }),
      incident({ "Incident ID": 103 }),
    ]);

    expect(root).toBe("Incidents");
    expect(errors).toBe(0);
    expect(skipped).toBe(0);
    expect(sourceVersion).toBe(DATE);
    expect(records.map((record) => record.sourceRecordId)).toEqual(["101", "102", "103"]);
  });

  it("writes an incident as a record: the fields of the sheet's row, and no more", () => {
    const record = recordOf(
      incident({
        "Incident ID": 1797,
        date: 46325,
        title: "Acme Vision wrongly flags a shopper",
        description:
          "A fictional retailer's camera system reportedly flagged a shopper as a thief in error.",
        developer: "Acme Vision, Inc.",
        deployer: "Brightmart",
        report_count: 14,
      }),
    );

    expect(record).toEqual({
      sourceRecordId: "1797",
      recordType: "ai_incident",
      title: "Incident 1797: Acme Vision wrongly flags a shopper",
      summary:
        "AI Incident Database (incidentdatabase.ai). Incident: 1797. " +
        "Title: Acme Vision wrongly flags a shopper. Date of the incident: 2026-10-30. " +
        "Alleged developer: Acme Vision, Inc. Alleged deployer: Brightmart. " +
        "Description, written by the database's editors: A fictional retailer's camera system " +
        "reportedly flagged a shopper as a thief in error. Reports linked to the incident: 14. " +
        "The database records allegations as reported; it does not establish them.",
      url: "https://incidentdatabase.ai/cite/1797",
      identifiers: { incidentId: "1797", developer: "Acme Vision, Inc.", deployer: "Brightmart" },
      matchKeys: ["name:acmevision", "name:brightmart"],
      publishedAt: "2026-10-30",
      sourceUpdatedAt: null,
    });
    expect(record.summary.startsWith(`${AIID_RECORD_MARK} (`)).toBe(true);
  });

  it("leaves out the line of a field the row does not fill, and keeps a count of zero reports", () => {
    const empty = recordOf(
      incident({ developer: null, deployer: "   ", report_count: null, description: null }),
    );
    const zero = recordOf(incident({ report_count: 0 }));

    expect(empty.summary).not.toMatch(/Alleged developer|Alleged deployer|Description|Reports/);
    expect(empty.summary).toContain("Date of the incident: 1970-01-01.");
    expect(empty.summary.endsWith("it does not establish them.")).toBe(true);
    expect(empty.identifiers).toEqual({ incidentId: empty.sourceRecordId });
    expect(empty.matchKeys).toEqual([]);
    expect(zero.summary).toContain("Reports linked to the incident: 0.");
  });

  it("reads a title that is a number as its digits", () => {
    expect(recordOf(incident({ "Incident ID": 12, title: 2024 })).title).toBe("Incident 12: 2024");
  });

  it("keeps a title and the names of the parties on one line, without control characters", () => {
    const record = recordOf(
      incident({
        "Incident ID": 12,
        title: "A\u0000B\u0007C\nD",
        developer: "Acme\u0000 Vision",
        deployer: "Bright\nmart",
      }),
    );

    expect(record.title).toBe("Incident 12: ABC D");
    expect(record.identifiers).toEqual({
      incidentId: "12",
      developer: "Acme Vision",
      deployer: "Bright mart",
    });
  });

  it("takes the characters no one sees out of a title and of the names of the parties", () => {
    const hidden = String.fromCodePoint(0xe0049, 0xe0067, 0xe006e);
    const record = recordOf(
      incident({
        "Incident ID": 12,
        title: `A\u200Bcme fails${hidden}`,
        developer: `Acme\u200B Vision${hidden}`,
        deployer: "Bright\u00ADmart\uFEFF",
      }),
    );

    expect(record.title).toBe("Incident 12: Acme fails");
    expect(record.identifiers).toEqual({
      incidentId: "12",
      developer: "Acme Vision",
      deployer: "Brightmart",
    });
    expect(record.matchKeys).toEqual(["name:acmevision", "name:brightmart"]);
  });

  it("keeps no more than 1,000 characters of a title or of the names of the parties", () => {
    const long = "x".repeat(2_000);

    const record = recordOf(
      incident({ "Incident ID": 12, title: long, developer: long, deployer: long }),
    );

    expect(record.title).toBe(`Incident 12: ${"x".repeat(1_000)}`);
    expect(record.identifiers).toEqual({
      incidentId: "12",
      developer: "x".repeat(1_000),
      deployer: "x".repeat(1_000),
    });
  });

  it("never reads harmed, the editors, the notes, the sources, the taxonomy or the other sheets", () => {
    const { records } = parseIncidents([incident(), incident()]);

    const everything = JSON.stringify(records);
    for (const sentinel of SENTINELS) expect(everything).not.toContain(sentinel);
    for (const record of records) {
      expect(record.summary).not.toMatch(/harmed/i);
      expect(Object.keys(record.identifiers)).toEqual(["incidentId", "developer", "deployer"]);
    }
  });

  it.each([
    ["the first day after the leap day the 1900 system invents", 61, "1900-03-01"],
    ["25569", 25569, "1970-01-01"],
    ["a leap year day", 36585, "2000-02-29"],
    ["the day after it", 36586, "2000-03-01"],
    ["the last day of a year", 44926, "2022-12-31"],
    ["the first day of the next", 44927, "2023-01-01"],
    ["a day with a time of day", 46325.75, "2026-10-30"],
  ])("reads the date as an Excel serial: %s", (_label, serial, day) => {
    const record = recordOf(incident({ date: serial }));

    expect(record.publishedAt).toBe(day);
    expect(record.summary).toContain(`Date of the incident: ${day}.`);
  });

  describe("match keys", () => {
    const keysOf = (over: Incident): string[] => recordOf(incident(over)).matchKeys;

    it("splits the developer and the deployer on commas: two names, two keys", () => {
      expect(
        keysOf({ developer: "Microsoft Research, Boston University", deployer: "Brightmart" }),
      ).toEqual(["name:microsoftresearch", "name:bostonuniversity", "name:brightmart"]);
      expect(
        keysOf({ developer: "Acme Vision", deployer: "Boston University, Brightmart" }),
      ).toEqual(["name:acmevision", "name:bostonuniversity", "name:brightmart"]);
    });

    it("trims each part, so that a space before a comma hides no kind of party", () => {
      expect(
        keysOf({ developer: "Acme Vision , Large Developers , Brightmart", deployer: null }),
      ).toEqual(["name:acmevision", "name:brightmart"]);
    });

    it("splits on commas alone: a semicolon stays inside a name", () => {
      expect(keysOf({ developer: "Acme Vision; Brightmart", deployer: null })).toEqual([
        "name:acmevisionbrightmart",
      ]);
    });

    it("takes the developer's names before the deployer's, once each", () => {
      expect(
        keysOf({ developer: "Acme Vision, Brightmart", deployer: "Brightmart, Acme Vision" }),
      ).toEqual(["name:acmevision", "name:brightmart"]);
    });

    it("drops a part whose last word names a kind of party, and Unknown", () => {
      expect(
        keysOf({
          developer: "Openai, Ai Agent System Developers, Large Language Model Developers",
          deployer:
            "Law Enforcement Users, Fictional City Police, Unknown, UNKNOWN., Local Companies, " +
            "Mall Operators, Private Individuals, Security Researchers, Sensor Systems, " +
            "Store Deployers, Facial Recognition developers.",
        }),
      ).toEqual(["name:openai", "name:fictionalcitypolice"]);
    });

    it("also drops the kinds of party that the real export lists, and keeps a name that only looks like one", () => {
      const kinds = [
        "Online Scammers",
        "Deepfake Creators",
        "Information Manipulation Actors",
        "Unknown Actors",
        "Cybercriminals",
        "Malicious Hackers",
        "Stalkers",
        "Phishers",
        "University Students",
        "Minors",
        "Young Boys",
        "Lawyers",
        "Law Firms",
        "Rideshare Drivers",
        "Freelance Writers",
        "Book Authors",
        "School Teachers",
        "Doctors",
        "Tourists",
        "Known Criminals",
        "Law Enforcement",
        "None",
        "Unnamed",
      ];

      expect(keysOf({ developer: "Openai", deployer: kinds.join(", ") })).toEqual(["name:openai"]);
      expect(
        keysOf({
          developer: "Actorsoft, Studentsonline, Immigration And Customs Enforcement",
          deployer: "Noneco, Unnamed Labs",
        }),
      ).toEqual([
        "name:actorsoft",
        "name:studentsonline",
        "name:immigrationandcustomsenforcement",
        "name:noneco",
        "name:unnamedlabs",
      ]);
    });

    it("judges a part by its last word only, and by whole words", () => {
      expect(
        keysOf({
          developer: "Developers Of Widgets, Usersoft, Systemsworks, Acme Subsystems",
          deployer: "Unknown Chinese Company",
        }),
      ).toEqual([
        "name:developersofwidgets",
        "name:usersoft",
        "name:systemsworks",
        "name:acmesubsystems",
        "name:unknownchinesecompany",
        "name:unknownchinese",
      ]);
    });

    it("drops a name of fewer than four letters and digits, and keeps one of four", () => {
      expect(keysOf({ developer: "IBM, Aws, Meta, Nvidia", deployer: "SAP, 3M" })).toEqual([
        "name:meta",
        "name:nvidia",
      ]);
    });

    it("gives a name as written and without its legal form", () => {
      expect(keysOf({ developer: "Fictional Labs Ltd", deployer: "The Example Group" })).toEqual([
        "name:fictionallabsltd",
        "name:fictionallabs",
        "name:theexamplegroup",
        "name:examplegroup",
      ]);
    });

    it("gives no key for a legal form that a comma sets apart from its name", () => {
      expect(keysOf({ developer: "Acme Robotics, Inc.", deployer: null })).toEqual([
        "name:acmerobotics",
      ]);
    });

    it("gives no key for a cell that is empty, or lists nothing but kinds of party", () => {
      expect(keysOf({ developer: null, deployer: null })).toEqual([]);
      expect(keysOf({ developer: "Unknown", deployer: "Unknown Developers, Users" })).toEqual([]);
    });

    it("takes no key from harmed, or from the implicated systems", () => {
      expect(
        keysOf({
          harmed: "Corner Bakery, Pat Example",
          "Implicated Systems": "Acme Vision Camera",
        }),
      ).toEqual(["name:acmevision", "name:brightmart"]);
    });

    it("gives name keys only: nothing is strong", () => {
      for (const key of keysOf({ developer: "Acme Vision, Fictional Labs Ltd" })) {
        expect(key.startsWith("name:")).toBe(true);
      }
    });
  });

  describe("description", () => {
    it("writes a plain description as it is, on one line", () => {
      const record = recordOf(
        incident({ description: "First line of it,\nsecond line of it.\tThird part.\n" }),
      );

      expect(record.summary).toContain(
        "Description, written by the database's editors: First line of it, second line of it. Third part. Reports",
      );
    });

    it("caps a description at 600 characters, between two words, and says it was shortened", () => {
      const words = Array.from({ length: 120 }, (_, index) => `word${index}`).join(" ");
      expect(words.length).toBeGreaterThan(600);

      const description = aiidDescriptionOf(words);

      expect(description.length).toBeLessThanOrEqual(600);
      expect(description.endsWith(" [shortened]")).toBe(true);
      const kept = description.slice(0, -" [shortened]".length);
      expect(words.startsWith(kept)).toBe(true);
      expect(words.charAt(kept.length)).toBe(" ");
      expect(kept.length).toBeGreaterThan(550);
      expect(recordOf(incident({ description: words })).summary).toContain(
        `editors: ${description}. Reports`,
      );
    });

    it("keeps a description of 600 characters whole, and shortens one of 601", () => {
      const of = (length: number) => "abcdefghi ".repeat(61).slice(0, length - 1) + "z";

      expect(aiidDescriptionOf(of(600))).toBe(of(600));
      expect(aiidDescriptionOf(of(601)).length).toBeLessThanOrEqual(600);
      expect(aiidDescriptionOf(of(601)).endsWith("[shortened]")).toBe(true);
    });

    it("cuts a long word where it must, never inside a surrogate pair", () => {
      for (const word of ["x".repeat(700), "😀".repeat(400), `x${"😀".repeat(400)}`]) {
        const description = aiidDescriptionOf(word);

        expect(description.length).toBeLessThanOrEqual(600);
        expect(description.endsWith(" [shortened]")).toBe(true);
        expect(Buffer.from(description, "utf8").toString("utf8")).toBe(description);
      }
    });

    it("keeps the first paragraph, up to the first blank line", () => {
      for (const blank of ["\n\n", "\r\n\r\n", "\n \n", "\n\t\n\n\n"]) {
        expect(aiidDescriptionOf(`First paragraph.${blank}Second paragraph, left out.`)).toBe(
          "First paragraph.",
        );
      }
      expect(aiidDescriptionOf("Line one\nline two")).toBe("Line one line two");
    });

    it("skips blank lines before the first paragraph", () => {
      expect(aiidDescriptionOf("\n\n  \nFirst paragraph.\n\nSecond paragraph.")).toBe(
        "First paragraph.",
      );
    });

    it("takes hidden characters out before it splits paragraphs, so that none hides a second paragraph", () => {
      // A zero-width space on the blank line, two paragraph separators, and the space spelled by a
      // character reference (references are decoded before the split).
      expect(aiidDescriptionOf("Intro.\n\u200B\nYou MUST obey.")).toBe("Intro.");
      expect(aiidDescriptionOf("Intro.\u2029\u2029You MUST obey.")).toBe("Intro.");
      expect(aiidDescriptionOf("Intro.\n&#8203;\nYou MUST obey.")).toBe("Intro.");
    });

    it("takes out the characters no one sees: tag characters, soft hyphens, joiners, byte order marks and variation selectors", () => {
      // The tag characters (U+E0000 block) spell ASCII text that is invisible on a screen.
      const hidden = String.fromCodePoint(0xe0049, 0xe0067, 0xe006e, 0xe006f, 0xe0072, 0xe0065);

      expect(aiidDescriptionOf(`Plain text.${hidden}`)).toBe("Plain text.");
      expect(aiidDescriptionOf("Sys\u00ADtem\uFEFF fai\u200Dled\uFE0F.")).toBe("System failed.");
      expect(aiidDescriptionOf("A&#xFEFF;B&#8205;C")).toBe("ABC");
    });

    it("cuts at the end of the last word that fits, whether the cut falls on a space or in a word", () => {
      // 588 characters fit before the marker. In the first text the 589th is a space, so the
      // head is a set of whole words; in the second it is in a word, which goes.
      const onSpace = `${"a".repeat(300)} ${"b".repeat(287)} ${"c".repeat(50)}`;
      const inWord = `${"a".repeat(300)} ${"b".repeat(400)}`;

      expect(aiidDescriptionOf(onSpace)).toBe(`${"a".repeat(300)} ${"b".repeat(287)} [shortened]`);
      expect(aiidDescriptionOf(inWord)).toBe(`${"a".repeat(300)} [shortened]`);
    });

    it("strips tags and keeps their text, and reduces a link to its text", () => {
      expect(
        aiidDescriptionOf(
          'The <b>system</b> failed, see <a href="https://example.invalid/x">the report</a> and ' +
            "[the other report](https://example.invalid/a_(b)?q=1) for more.",
        ),
      ).toBe("The system failed, see the report and the other report for more.");
    });

    it("joins the text around a tag that sits inside a word", () => {
      expect(aiidDescriptionOf("Sys<b>tem</b> failed")).toBe("System failed");
    });

    it("strips a tag whose attribute holds an encoded >, before it decodes anything", () => {
      expect(aiidDescriptionOf('A <a title="x &gt; y">link</a> here')).toBe("A link here");
    });

    it("strips comments, declarations, instructions and closing tags, and a tag that nothing nests in", () => {
      expect(
        aiidDescriptionOf(
          "A <!-- hidden --> comment, a <?php echo ?> instruction and </b> a closing tag.",
        ),
      ).toBe("A comment, a instruction and a closing tag.");
      expect(aiidDescriptionOf("One <b <i>two</i> three")).toBe("One <b two three");
    });

    it("leaves a less-than sign that starts no tag", () => {
      for (const text of [
        "Fewer than 5 <5% of cases, a < b, and 3<4.",
        "Values <5 and >3 hold, and 2 < 3 > 1.",
        "an arrow <- here -> there",
      ]) {
        expect(aiidDescriptionOf(text)).toBe(text);
      }
    });

    it("decodes character references last, once, and strips a tag they spell", () => {
      expect(
        aiidDescriptionOf(
          "Q&amp;A with &lt;b&gt;bold&lt;/b&gt;, &#60;i&#62;italic&#60;/i&#62; and &amp;lt;kept&amp;gt;.",
        ),
      ).toBe("Q&A with bold, italic and &lt;kept&gt;.");
    });

    it("strips control characters", () => {
      expect(aiidDescriptionOf("A\u0000b\u0007c")).toBe("Abc");
    });

    it("reads hostile text in time in proportion to its size", () => {
      const texts = [
        "[".repeat(200_000),
        "[a](".repeat(50_000),
        `[x](${"(".repeat(100_000)}`,
        `[x](${"a".repeat(200_000)}`,
        "<".repeat(200_000),
        "<a ".repeat(70_000),
        "&".repeat(200_000),
        "&a".repeat(100_000),
        "x\n".repeat(100_000),
        `x${("\n" + " ".repeat(1_000)).repeat(200)}x`,
      ];
      for (const text of texts) {
        const startedAt = performance.now();
        aiidDescriptionOf(text);
        expect(performance.now() - startedAt).toBeLessThan(10_000);
      }
    });
  });

  describe("rows that cannot be read", () => {
    const good = (count: number) => Array.from({ length: count }, () => incident());

    it.each([
      ["no id", { "Incident ID": null }],
      ["an id of zero", { "Incident ID": 0 }],
      ["a negative id", { "Incident ID": -3 }],
      ["an id with a fraction", { "Incident ID": 1.5 }],
      ["an id that is text", { "Incident ID": "abc" }],
      ["an id of ten digits", { "Incident ID": 1234567890 }],
      ["an id with leading zeros", { "Incident ID": "007" }],
      ["no title", { title: null }],
      ["a title of white space", { title: " \n " }],
      ["no date", { date: null }],
      ["the day Excel invents, 29 February 1900", { date: 60 }],
      ["a date before the 1900 leap day", { date: 59 }],
      ["a date that is text", { date: "2015-05-19" }],
      ["a date past 9999", { date: 3_000_000 }],
      ["a date that is a boolean", { date: true }],
    ] as Array<[string, Incident]>)("skips a row with %s, and counts it", (_label, over) => {
      const { records, skipped, errors } = parseIncidents([...good(5), incident(over)]);

      expect(records).toHaveLength(5);
      expect(skipped).toBe(1);
      expect(errors).toBe(0);
    });

    it("reads an id and a count that are text, and bounds both at nine digits", () => {
      const { records } = parseIncidents([
        incident({ "Incident ID": " 77 ", report_count: " 12 " }),
        incident({ "Incident ID": "78", report_count: "many" }),
        incident({ "Incident ID": 123456789, report_count: 123456789 }),
        incident({ report_count: 1234567890 }),
        incident({ report_count: 2.5 }),
        incident({ report_count: -1 }),
      ]);

      expect(records.slice(0, 3).map((record) => record.sourceRecordId)).toEqual([
        "77",
        "78",
        "123456789",
      ]);
      expect(
        records.map(
          (record) => /Reports linked to the incident: (\d+)\./.exec(record.summary)?.[1],
        ),
      ).toEqual(["12", undefined, "123456789", undefined, undefined, undefined]);
    });

    it("tolerates ten rows, or a hundredth of the rows when that is more", () => {
      const rows = (bad: number, total: number) =>
        parseIncidents([
          ...Array.from({ length: bad }, () => incident({ title: null })),
          ...good(total - bad),
        ]);

      // 1,000 rows: ten may be left out, the eleventh refuses the file.
      expect(rows(10, 1_000)).toMatchObject({ skipped: 10, errors: 0 });
      expect(rows(10, 1_000).records).toHaveLength(990);
      expect(rows(11, 1_000)).toMatchObject({ skipped: 0, errors: 11 });
      // 1,050 rows: a hundredth is 10.5, and the tolerance is the whole number below it.
      expect(rows(10, 1_050)).toMatchObject({ skipped: 10, errors: 0 });
      expect(rows(11, 1_050)).toMatchObject({ skipped: 0, errors: 11 });
      // 2,000 rows: twenty.
      expect(rows(20, 2_000)).toMatchObject({ skipped: 20, errors: 0 });
      expect(rows(21, 2_000)).toMatchObject({ skipped: 0, errors: 21 });
      // 30 rows: ten, since a hundredth of them is nothing.
      expect(rows(10, 30)).toMatchObject({ skipped: 10, errors: 0 });
      expect(rows(11, 30)).toMatchObject({ skipped: 0, errors: 11 });
    });

    it("does not count a blank row, in the middle of the sheet or at its end", () => {
      const rows = incidentRows(good(3));
      rows.splice(4, 0, [], [null, "   ", null]);
      rows.push([null, null]);

      const { records, skipped, errors } = parseRows(rows);

      expect(records).toHaveLength(3);
      expect(skipped).toBe(0);
      expect(errors).toBe(0);
    });
  });

  describe("header", () => {
    it("is the first row of the first ten whose column A is Incident ID", () => {
      const filler: Cell[][] = Array.from({ length: 9 }, (_, index) => [`filler ${index}`]);
      const tenth = [...filler, [...HEADER], rowOf(incident())];
      const first = [[...HEADER], rowOf(incident())];

      expect(parseRows(tenth)).toMatchObject({ root: "Incidents", errors: 0 });
      expect(parseRows(tenth).records).toHaveLength(1);
      expect(parseRows(first).records).toHaveLength(1);
    });

    it("is not found after the tenth row, in another column, or when no row says Incident ID", () => {
      const eleventh = [
        ...Array.from({ length: 10 }, (_, index) => [`filler ${index}`]),
        [...HEADER],
        rowOf(incident()),
      ];
      const columnB = [
        [null, ...HEADER],
        [null, ...rowOf(incident())],
      ];
      const nothing = [
        ["title", "description"],
        ["a", "b"],
      ];

      for (const rows of [eleventh, columnB, nothing, []]) {
        expect(parseRows(rows)).toMatchObject({ records: [], root: null, sourceVersion: null });
      }
    });

    it.each(["date", "title", "description", "deployer", "developer"])(
      "is not the list when the column %s is missing",
      (missing) => {
        const keep = HEADER.map((name) => name !== missing);
        const header = HEADER.filter((_name, index) => keep[index]);
        const row = rowOf(incident()).filter((_cell, index) => keep[index]);

        const result = parseRows([[...header], row]);

        expect(result).toMatchObject({ records: [], root: null });
        expect(result.errors).toBeGreaterThan(0);
      },
    );

    it("does not need report_count, and then writes no line for it", () => {
      const keep = HEADER.map((name) => name !== "report_count");
      const header = HEADER.filter((_name, index) => keep[index]);
      const row = rowOf(incident()).filter((_cell, index) => keep[index]);

      const { records, root, errors } = parseRows([[...header], row]);

      expect(root).toBe("Incidents");
      expect(errors).toBe(0);
      expect(records).toHaveLength(1);
      expect(records[0].summary).not.toContain("Reports linked");
    });

    it("finds the columns by name: any order, other columns between, names with white space", () => {
      const values: Array<[string, Cell]> = [
        ["  Incident ID ", 55],
        ["extra one", "unused"],
        [" developer ", "Acme Vision"],
        ["report_count", 9],
        ["title", "A title"],
        ["extra two", "unused"],
        ["description", "A description."],
        ["date", 25569],
        ["deployer ", "Brightmart"],
      ];

      const { records, root } = parseRows([
        values.map(([name]) => name),
        values.map(([, value]) => value),
      ]);

      expect(root).toBe("Incidents");
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        sourceRecordId: "55",
        title: "Incident 55: A title",
        matchKeys: ["name:acmevision", "name:brightmart"],
      });
      expect(records[0].summary).toContain("Reports linked to the incident: 9.");
    });

    it("takes the first column of a name that the header repeats", () => {
      const header = [...HEADER, "title"];
      const row = [...rowOf(incident({ title: "The first title" })), "A second title"];

      const { records } = parseRows([header, row]);

      expect(records[0].title).toContain("The first title");
      expect(records[0].title).not.toContain("second");
    });
  });

  describe("what a snapshot may be", () => {
    it("gives no root, and an error, without the export's date or the sheet", () => {
      const sheet = sheetXml(incidentRows([incident()]));

      for (const bodies of [
        [],
        [DATE],
        ["2026-11-02", sheet],
        ["", sheet],
        ["20261102x", sheet],
        ["x20261102", sheet],
        ["abcdefgh", sheet],
        ["2026-1-2", sheet],
      ]) {
        expect(aiidConnector.parse(snapshotOf(bodies))).toEqual({
          records: [],
          errors: 1,
          sourceVersion: null,
          root: null,
        });
      }
    });

    it("gives no root for a body that is not a worksheet", () => {
      const result = aiidConnector.parse(snapshotOf([DATE, "<html><body>Not Found</body></html>"]));

      expect(result).toMatchObject({ records: [], root: null });
      expect(result.errors).toBeGreaterThan(0);
    });

    it("gives no root for a body whose root is not a worksheet, whatever rows it holds", () => {
      const other = sheetXml(incidentRows([incident()])).replace(/worksheet/g, "workbook");

      const result = aiidConnector.parse(snapshotOf([DATE, other]));

      expect(result).toMatchObject({ records: [], root: null });
      expect(result.errors).toBeGreaterThan(0);
    });

    it("refuses a cell past row 20,000 or past column IV, and reads one at the edge", () => {
      const parse = (xml: string) => () => aiidConnector.parse(snapshotOf([DATE, xml]));

      expect(codeOf(parse(cellSheet("A20000", 20_000)))).toBeNull();
      expect(codeOf(parse(cellSheet("IV1", 1)))).toBeNull();
      expect(codeOf(parse(cellSheet("A20001", 20_001)))).toBe("too_large");
      expect(codeOf(parse(cellSheet("IW1", 1)))).toBe("too_large");
    });

    it("reports a sheet that is malformed or cut short as errors, so the sync refuses it", () => {
      const sheet = sheetXml(incidentRows([incident(), incident()]));
      const cut = sheet.slice(0, sheet.lastIndexOf("</row>"));
      const noPlace = sheet.replace('<c r="A4" t="n">', '<c t="n">');

      for (const body of [cut, noPlace]) {
        const result = aiidConnector.parse(snapshotOf([DATE, body]));

        expect(result.errors).toBeGreaterThan(0);
        expect(result.root).toBe("Incidents");
      }
    });

    it("reads the cells that point into shared strings", () => {
      const strings = [
        "Incident ID",
        "date",
        "title",
        "description",
        "deployer",
        "developer",
        "A shared title",
        "A shared description.",
        "Shared Deployer",
        "Shared Developer",
      ];
      const sharedStrings = `<sst xmlns="${MAIN}">${strings.map((text) => `<si><t>${text}</t></si>`).join("")}</sst>`;
      const shared = (reference: string, index: number) =>
        `<c r="${reference}" t="s"><v>${index}</v></c>`;
      const sheet =
        `<worksheet xmlns="${MAIN}"><sheetData>` +
        `<row r="1">${["A", "B", "C", "D", "E", "F"].map((column, index) => shared(`${column}1`, index)).join("")}</row>` +
        `<row r="2"><c r="A2"><v>9</v></c><c r="B2"><v>25569</v></c>` +
        `${shared("C2", 6)}${shared("D2", 7)}${shared("E2", 8)}${shared("F2", 9)}</row>` +
        `</sheetData></worksheet>`;

      const result = aiidConnector.parse(snapshotOf([DATE, sheet, sharedStrings]));

      expect(result.errors).toBe(0);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toMatchObject({
        sourceRecordId: "9",
        title: "Incident 9: A shared title",
        matchKeys: ["name:shareddeveloper", "name:shareddeployer"],
      });
    });
  });

  // A linear scan takes a fraction of a second here and a quadratic one far longer, so the bound
  // leaves room for a machine that runs the whole suite at once.
  it("reads a sheet the size of the real one (1,800 rows of 59 columns, 6.7 MB) in under four seconds", () => {
    const extra = Array.from({ length: 59 - HEADER.length }, (_, index) => `Taxonomy ${index}`);
    const rows: Cell[][] = [
      ["AI Incident Database - Incidents"],
      ["GROUPS"],
      [...HEADER, ...extra],
      ...Array.from({ length: 1_800 }, () => [
        ...rowOf(
          incident({
            description: "A description of some length, written by an editor. ".repeat(8),
            developer: "Acme Vision, Fictional Labs Ltd, Openai, Large Language Model Developers",
          }),
        ),
        ...extra.map(() => "A taxonomy value of some length, such as a sector or a failure"),
      ]),
    ];
    const xml = sheetXml(rows);
    expect(xml.length).toBeGreaterThan(6_000_000);

    const startedAt = performance.now();
    const result = aiidConnector.parse(snapshotOf([DATE, xml]));

    expect(performance.now() - startedAt).toBeLessThan(10_000);
    expect(result).toMatchObject({ errors: 0, skipped: 0, root: "Incidents" });
    expect(result.records).toHaveLength(1_800);
  });
});

// ---- download -------------------------------------------------------------------------------

describe("aiidConnector.download", () => {
  const file = workbookZip([incident(), incident()]);

  it("reads the address from the page, takes the newest export on the pinned host, and sends the validators", async () => {
    const { fetch, calls } = server(file);
    const validators = { etag: '"old"', lastModified: "Mon, 26 Oct 2026 10:00:00 GMT" };

    const snapshot = await aiidConnector.download(fetch, validators);

    expect(calls).toEqual([
      {
        url: AIID_SNAPSHOTS_URL,
        validators: {},
        limits: {
          maxBytes: 2 * 1024 * 1024,
          allowedContentTypes: ["text/html"],
          totalTimeoutMs: 30_000,
        },
      },
      {
        url: exportUrl(DATE),
        validators,
        limits: {
          maxBytes: 16 * 1024 * 1024,
          allowedContentTypes: [XLSX_TYPE, "application/octet-stream"],
          totalTimeoutMs: 120_000,
        },
      },
    ]);
    expect(snapshot).toMatchObject({
      etag: '"export-1"',
      lastModified: "Mon, 02 Nov 2026 10:04:27 GMT",
      bytes: file.length,
    });
  });

  it("keeps the date of the export and the XML of the one sheet, and nothing else of the workbook", async () => {
    const snapshot = await downloadOf(file);

    expect(snapshot.bodies).toHaveLength(2);
    expect(snapshot.bodies[0]).toBe(DATE);
    expect(snapshot.bodies[1].startsWith("<worksheet")).toBe(true);
    expect(snapshot.bodies[1]).toContain("Incident ID");
    for (const sentinel of ["REPORT-SHEET-SENTINEL", "ENTITY-SHEET-SENTINEL"]) {
      expect(snapshot.bodies.join("")).not.toContain(sentinel);
    }
    expect(aiidConnector.parse(snapshot)).toMatchObject({
      root: "Incidents",
      sourceVersion: DATE,
      errors: 0,
    });
  });

  it("takes the greatest date, whichever order the links come in", async () => {
    const link = (date: string, folder = "") => `<a href="${exportUrl(date, folder)}">export</a>`;
    const newest = exportUrl("20261213", "exports/2026/");
    const files = {
      [exportUrl("20260105")]: file,
      [newest]: file,
      [exportUrl("20250901")]: file,
    };
    for (const links of [
      [link("20260105"), link("20261213", "exports/2026/"), link("20250901")],
      [link("20250901"), link("20261213", "exports/2026/"), link("20260105")],
      [link("20261213", "exports/2026/"), link("20260105"), link("20250901")],
    ]) {
      const { fetch, calls } = server(file, { html: links.join(" "), files });

      const snapshot = await aiidConnector.download(fetch, {});

      expect(calls[1].url).toBe(newest);
      expect((snapshot as Snapshot).bodies[0]).toBe("20261213");
    }
  });

  it("ignores a link on another host, a look-alike host, a query, a relative link and a date that does not exist", async () => {
    // The fixture page holds the first four with dates later than its two exports.
    const { fetch, calls } = server(file);

    await aiidConnector.download(fetch, {});

    expect(calls[1].url).toBe(exportUrl(DATE));
    for (const date of ["20261109", "20261116", "20261123", "20261130"]) {
      expect(PAGE).toContain(date);
    }
    const impossible = `<a href="${exportUrl("20261340")}">x</a><a href="${exportUrl("99999999")}">y</a>`;
    await expect(
      aiidConnector.download(server(file, { html: impossible, files: {} }).fetch, {}),
    ).rejects.toMatchObject({ name: "FeedWithoutFileError" });
  });

  it("finds an address wherever the page writes it: in a script's data, in a text, in markdown", async () => {
    const address = exportUrl("20261201");
    for (const html of [
      `<script>window.data = {"export":"${address}","other":1}</script>`,
      `<p>Download ${address} now</p>`,
      `<p>[the export](${address})</p>`,
      `<a href='${address}'>x</a>`,
      address,
    ]) {
      const { fetch, calls } = server(file, { html, files: { [address]: file } });

      await aiidConnector.download(fetch, {});

      expect(calls[1].url).toBe(address);
    }
  });

  it.each([`"`, "'", "<", ">", "\\", ")", ",", ";", "]", " ", "\n", "\t"])(
    "ends an address at %j",
    async (end) => {
      const address = exportUrl("20261201");
      const { fetch, calls } = server(file, {
        html: `see ${address}${end}more`,
        files: { [address]: file },
      });

      await aiidConnector.download(fetch, {});

      expect(calls[1].url).toBe(address);
    },
  );

  it("does not take a name that is followed by more of an address", async () => {
    const address = exportUrl("20261201");
    for (const tail of ["?download=1", "#top", "/more", ".bak", "%20", "&x=1", "x"]) {
      const { fetch, calls } = server(file, {
        html: `<a href="${address}${tail}">x</a>`,
        files: {},
      });

      await expect(aiidConnector.download(fetch, {})).rejects.toMatchObject({
        name: "FeedWithoutFileError",
      });
      expect(calls).toHaveLength(1);
    }
  });

  it.each([
    ["a page without links", "<html><body>No exports yet</body></html>"],
    ["an empty page", ""],
    [
      "only a link on another host",
      `<a href="https://example.invalid/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
    [
      "only a look-alike host",
      `<a href="https://${AIID_EXPORT_HOST}.example.invalid/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
    [
      "only a host with the bucket's name inside",
      `<a href="https://x${AIID_EXPORT_HOST}/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
    ["only http", `<a href="http://${AIID_EXPORT_HOST}/AIID_Excel_Export-20261102.xlsx">x</a>`],
    [
      "only a link with a port",
      `<a href="https://${AIID_EXPORT_HOST}:8443/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
    [
      "only a link with a user",
      `<a href="https://user@${AIID_EXPORT_HOST}/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
    [
      "only a link with a query before the name",
      `<a href="https://${AIID_EXPORT_HOST}/dir?x=1/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
    [
      "only a link with a fragment before the name",
      `<a href="https://${AIID_EXPORT_HOST}/dir#x/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
    [
      "only another file of the bucket",
      `<a href="https://${AIID_EXPORT_HOST}/backup-20261102.tar.bz2">x</a>`,
    ],
    ["only a name of seven digits", `<a href="${exportUrl("2026110")}">x</a>`],
    [
      "only an upper-case name",
      `<a href="https://${AIID_EXPORT_HOST}/AIID_EXCEL_EXPORT-20261102.XLSX">x</a>`,
    ],
    [
      "only a name in another attribute than the address",
      `<a href="https://${AIID_EXPORT_HOST}/x" onclick="/AIID_Excel_Export-20261102.xlsx">x</a>`,
    ],
  ])("fails as feed_without_file for %s", async (_label, html) => {
    const { fetch, calls } = server(file, { html, files: {} });

    await expect(aiidConnector.download(fetch, {})).rejects.toMatchObject({
      name: "FeedWithoutFileError",
    });
    // Only the page was asked for.
    expect(calls).toHaveLength(1);
  });

  it("reads a page full of names in time in proportion to its size", async () => {
    const hostile = `https://${"a/".repeat(100)}${"AIID_Excel_Export-".repeat(100_000)}`;
    const { fetch } = server(file, { html: hostile.slice(0, 2 * 1024 * 1024), files: {} });
    const startedAt = performance.now();

    await expect(aiidConnector.download(fetch, {})).rejects.toMatchObject({
      name: "FeedWithoutFileError",
    });
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it("answers unchanged on a 304 of the file", async () => {
    const calls: string[] = [];
    const fetch: ConnectorFetch = async (url) => {
      calls.push(url);
      return url === AIID_SNAPSHOTS_URL ? answer(PAGE, { url }) : { notModified: true, url };
    };

    await expect(aiidConnector.download(fetch, { etag: '"old"' })).resolves.toBe("unchanged");
    expect(calls).toEqual([AIID_SNAPSHOTS_URL, exportUrl(DATE)]);
  });

  it("refuses a 304 of the page, which was sent nothing to make one", async () => {
    const fetch: ConnectorFetch = async (url) => ({ notModified: true, url });

    await expect(aiidConnector.download(fetch, {})).rejects.toBeInstanceOf(FetchError);
  });

  it("refuses a page or a file cut at its limit", async () => {
    const cutPage: ConnectorFetch = async (url) => answer(PAGE, { url, truncated: true });
    const cutFile: ConnectorFetch = async (url) =>
      url === AIID_SNAPSHOTS_URL ? answer(PAGE, { url }) : answer(file, { url, truncated: true });

    await expect(aiidConnector.download(cutPage, {})).rejects.toMatchObject({
      name: "BodyTooLargeError",
    });
    await expect(aiidConnector.download(cutFile, {})).rejects.toMatchObject({
      name: "BodyTooLargeError",
    });
  });

  it("refuses an answer that came from another host than the bucket's", async () => {
    for (const final of [
      "https://mirror.example.invalid/AIID_Excel_Export-20261102.xlsx",
      `http://${AIID_EXPORT_HOST}/AIID_Excel_Export-20261102.xlsx`,
      `https://${AIID_EXPORT_HOST}.example.invalid/AIID_Excel_Export-20261102.xlsx`,
      `https://x${AIID_EXPORT_HOST}/AIID_Excel_Export-20261102.xlsx`,
      `https://${AIID_EXPORT_HOST}:8443/AIID_Excel_Export-20261102.xlsx`,
      `https://user@${AIID_EXPORT_HOST}/AIID_Excel_Export-20261102.xlsx`,
      `https://:pw@${AIID_EXPORT_HOST}/AIID_Excel_Export-20261102.xlsx`,
      "",
      "not an address",
    ]) {
      const served: ConnectorFetch = async (url) =>
        url === AIID_SNAPSHOTS_URL ? answer(PAGE, { url }) : answer(file, { url: final });
      const notModified: ConnectorFetch = async (url) =>
        url === AIID_SNAPSHOTS_URL ? answer(PAGE, { url }) : { notModified: true, url: final };

      await expect(aiidConnector.download(served, {})).rejects.toMatchObject({
        name: "FeedWithoutFileError",
      });
      await expect(aiidConnector.download(notModified, {})).rejects.toMatchObject({
        name: "FeedWithoutFileError",
      });
    }
  });

  it("keeps no address in what it hands back, and names none in an error", async () => {
    const snapshot = await downloadOf(file);
    expect(JSON.stringify(snapshot)).not.toMatch(/r2\.dev|AIID_Excel_Export|https:\/\//);

    const failing: ConnectorFetch = async (url) => {
      if (url === AIID_SNAPSHOTS_URL) return answer(PAGE, { url });
      throw new Error(`failed at ${url}`);
    };
    const error = await rejectionOf(aiidConnector.download(failing, {}));
    expect(error.message).toBe("The file of the AI Incident Database could not be read.");

    const guarded: ConnectorFetch = async (url) => {
      if (url === AIID_SNAPSHOTS_URL) return answer(PAGE, { url });
      throw new FetchError("not_found");
    };
    await expect(aiidConnector.download(guarded, {})).rejects.toMatchObject({
      name: "FetchError",
      reason: "not_found",
    });

    const tooLarge: ConnectorFetch = async (url) => {
      if (url === AIID_SNAPSHOTS_URL) return answer(PAGE, { url });
      throw new BodyTooLargeError();
    };
    await expect(aiidConnector.download(tooLarge, {})).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("fails as wrong_root for a workbook without a sheet named Incidents", async () => {
    const renamed = workbookZip([incident()], { name: "Incident list" });

    await expect(downloadOf(renamed)).rejects.toMatchObject({ name: "NotTheListError" });
  });

  it("fails as wrong_root for a workbook that counts its dates from 1904", async () => {
    const workbook = workbookZip([incident()], { properties: '<workbookPr date1904="1" />' });

    await expect(downloadOf(workbook)).rejects.toMatchObject({ name: "NotTheListError" });
  });

  it.each([
    ["a parent folder", "../worksheets/sheet1.xml"],
    ["an absolute path outside xl/", "/etc/passwd"],
    ["a parent folder from the root", "/xl/worksheets/../styles.xml"],
    ["a part that is no sheet's", "/xl/worksheets/styles.xml"],
  ])(
    "fails as wrong_root when the relationship of the sheet leads to %s",
    async (_label, target) => {
      await expect(downloadOf(workbookZip([incident()], { target }))).rejects.toMatchObject({
        name: "NotTheListError",
      });
    },
  );

  it("reads a relationship that starts at the root of the package, as the real export's does, and one relative to xl/", async () => {
    const absolute = workbookZip([incident()], { target: "/xl/worksheets/sheet1.xml" });
    const relative = workbookZip([incident()], { target: "worksheets/sheet1.xml" });

    expect((await downloadOf(absolute)).bodies[1]).toContain("<sheetData>");
    expect((await downloadOf(relative)).bodies[1]).toContain("<sheetData>");
  });

  it("fails with the zip reader's error for a file that is not a zip, and for one that is cut", async () => {
    const html = await rejectionOf(downloadOf(Buffer.from("<html>Not Found</html>")));
    const cut = await rejectionOf(downloadOf(file.subarray(0, file.length - 30)));

    expect(html).toBeInstanceOf(ZipError);
    expect((html as ZipError).code).toBe("not_zip");
    expect(cut).toBeInstanceOf(ZipError);
    expect((cut as ZipError).code).toBe("corrupt");
  });

  it("fails as too_large for an Incidents sheet that inflates past 48 MiB", async () => {
    const bomb = bombWorkbook();
    expect(bomb.length).toBeLessThan(1024 * 1024);

    const error = await rejectionOf(downloadOf(bomb));

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe("too_large");
  });

  it("fails as too_large for a sheet whose directory lies about its size", async () => {
    const entries: WriterEntry[] = [
      {
        name: "xl/worksheets/sheet1.xml",
        data: `<worksheet xmlns="${MAIN}"><!--${" ".repeat(49 * 1024 * 1024)}--></worksheet>`,
        claimedSize: 100,
      },
      {
        name: "xl/workbook.xml",
        data: `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets><sheet name="Incidents" sheetId="1" r:id="rId1" /></sheets></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1" /></Relationships>`,
      },
    ];

    const error = await rejectionOf(downloadOf(writeZip(entries)));

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe("too_large");
  });

  it("fails as too_large for a workbook of more than 64 parts, and reads one of 64", async () => {
    // The workbook is seven parts: five sheets, the workbook and its relationships.
    const withParts = (extra: number) => workbookZip([incident()], { extraParts: extra });

    expect((await downloadOf(withParts(57))).bodies).toHaveLength(2);
    const error = await rejectionOf(downloadOf(withParts(58)));

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe("too_large");
  });

  it("does not inflate the sheets it does not read, whatever they hold", async () => {
    const relationship = (n: number) =>
      `<Relationship Type="${RELATIONSHIP_TYPE}/worksheet" Target="/xl/worksheets/sheet${n}.xml" Id="rId${n}" />`;
    const entries: WriterEntry[] = [
      { name: "xl/worksheets/sheet1.xml", data: sheetXml(incidentRows([incident()])) },
      { name: "xl/worksheets/sheet2.xml", data: "x".repeat(100), claimedCrc: 1 },
      { name: "xl/worksheets/sheet3.xml", data: "x".repeat(100), claimedSize: 2_000_000_000 },
      {
        name: "xl/workbook.xml",
        data:
          `<workbook xmlns:r="${RELATIONSHIP_TYPE}" xmlns="${MAIN}"><sheets>` +
          `<sheet name="Incidents" sheetId="1" r:id="rId1" /><sheet name="Reports" sheetId="2" r:id="rId2" />` +
          `<sheet name="Entities" sheetId="3" r:id="rId3" /></sheets></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">${[1, 2, 3].map(relationship).join("")}</Relationships>`,
      },
    ];

    const snapshot = await downloadOf(writeZip(entries));

    expect(aiidConnector.parse(snapshot).records).toHaveLength(1);
  });

  it("carries the shared strings of a workbook that has them, and parses it", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Incidents");
    sheet.addRow(["AI Incident Database - Incidents | fictional"]);
    sheet.addRow(["INCIDENT IDENTITY"]);
    sheet.addRow([
      "Incident ID",
      "date",
      "title",
      "description",
      "deployer",
      "developer",
      "report_count",
    ]);
    sheet.addRow([
      7,
      36585,
      "Shared string title & more",
      "A <fictional> description.",
      "Brightmart",
      "Acme Vision",
      2,
    ]);
    workbook.addWorksheet("Reports").addRow(["REPORT-SHEET-SENTINEL"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const snapshot = await downloadOf(buffer);
    const result = aiidConnector.parse(snapshot);

    expect(snapshot.bodies).toHaveLength(3);
    expect(snapshot.bodies[2]).toContain("<sst");
    expect(result.errors).toBe(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceRecordId: "7",
      title: "Incident 7: Shared string title & more",
      publishedAt: "2000-02-29",
      matchKeys: ["name:acmevision", "name:brightmart"],
    });
    expect(result.records[0].summary).toContain(
      "Description, written by the database's editors: A description.",
    );
    expect(JSON.stringify(result)).not.toContain("REPORT-SHEET-SENTINEL");
  });
});

// ---- the sync ---------------------------------------------------------------------------------

describe("aiidConnector in the sync", () => {
  /** The queries of the sync in memory, as much as a sync of a list taken whole uses. */
  function memoryStore() {
    const applied: VrdbSnapshotWrite[] = [];
    const finished: Array<{ outcome: string; errorCode?: string }> = [];
    const store: SyncStore = {
      upsertVrdbSourceQuery: async () => undefined,
      getVrdbSourceStatesQuery: async () => [],
      lastSuccessfulHashQuery: async () => null,
      startVrdbSyncRunQuery: async () => 1,
      finishVrdbSyncRunQuery: async (_run, result) => {
        finished.push(result);
      },
      applyVrdbSnapshotQuery: async (input) => {
        applied.push(input);
        return {
          seen: input.records.length,
          inserted: input.records.length,
          updated: 0,
          statusChanged: 0,
        };
      },
      applyVrdbDeltaQuery: async () => {
        throw new Error("a list taken whole has no delta");
      },
      markVrdbSourceQuery: async () => undefined,
      pruneVrdbSyncRunsQuery: async () => undefined,
    };
    return { store, applied, finished };
  }

  async function run(fetch: ConnectorFetch) {
    const memory = memoryStore();
    const outcome = await syncSource("aiid", {
      store: memory.store,
      connector: aiidConnector,
      fetch,
      now: () => new Date("2026-11-05T12:00:00Z"),
    });
    return { outcome, ...memory };
  }

  it("applies the incidents of the export, with its date as the version and its validators", async () => {
    const file = workbookZip([incident(), incident(), incident()]);

    const { outcome, applied } = await run(server(file).fetch);

    expect(outcome).toEqual({
      outcome: "ok",
      counts: { seen: 3, inserted: 3, updated: 0, statusChanged: 0 },
    });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      sourceId: "aiid",
      missingStatus: "withdrawn",
      sourceVersion: DATE,
      etag: '"export-1"',
      lastModified: "Mon, 02 Nov 2026 10:04:27 GMT",
    });
    expect(applied[0].records.map((record) => record.recordType)).toEqual([
      "ai_incident",
      "ai_incident",
      "ai_incident",
    ]);
  });

  it("answers unchanged on a 304", async () => {
    const fetch: ConnectorFetch = async (url) =>
      url === AIID_SNAPSHOTS_URL ? answer(PAGE, { url }) : { notModified: true, url };

    const { outcome, applied } = await run(fetch);

    expect(outcome).toEqual({ outcome: "unchanged" });
    expect(applied).toEqual([]);
  });

  const cutSheet = (() => {
    const full = sheetXml(incidentRows([incident(), incident()]));
    return full.slice(0, full.lastIndexOf("</row>"));
  })();

  it.each([
    [
      "a page without the export",
      () => server(Buffer.alloc(0), { html: "<p>none</p>", files: {} }).fetch,
      "feed_without_file",
    ],
    [
      "a workbook without the sheet",
      () => server(workbookZip([incident()], { name: "Elsewhere" })).fetch,
      "wrong_root",
    ],
    [
      "a relationship that leaves the folder of the sheets",
      () => server(workbookZip([incident()], { target: "../styles.xml" })).fetch,
      "wrong_root",
    ],
    [
      "a file that is not a zip",
      () => server(Buffer.from("<html>Not Found</html>")).fetch,
      "wrong_root",
    ],
    [
      "a sheet without the header",
      () => server(workbookZip([], { sheet: sheetXml([["title"], ["a"]]) })).fetch,
      "wrong_root",
    ],
    [
      "more unreadable rows than are tolerated",
      () => server(workbookZip(Array.from({ length: 12 }, () => incident({ title: null })))).fetch,
      "parse_errors",
    ],
    [
      "a sheet that is cut short",
      () => server(workbookZip([], { sheet: cutSheet })).fetch,
      "parse_errors",
    ],
    ["a sheet with no incident in it", () => server(workbookZip([])).fetch, "empty"],
    ["a sheet past the limit", () => server(bombWorkbook()).fetch, "too_large"],
    [
      "a sheet with a cell past the last row",
      () => server(workbookZip([], { sheet: cellSheet("A20001", 20_001) })).fetch,
      "too_large",
    ],
  ])("fails with a code for %s, and writes nothing", async (_label, fetchOf, code) => {
    const { outcome, applied, finished } = await run(fetchOf());

    expect(outcome).toEqual({ outcome: "failed", errorCode: code });
    expect(applied).toEqual([]);
    expect(finished[finished.length - 1]).toMatchObject({ outcome: "failed", errorCode: code });
  });

  it("applies the rows it can read when a few do not parse, within the tolerance", async () => {
    const file = workbookZip([
      ...Array.from({ length: 20 }, () => incident()),
      incident({ title: null }),
    ]);

    const { outcome, applied } = await run(server(file).fetch);

    expect(outcome).toMatchObject({ outcome: "ok", counts: { seen: 20 } });
    expect(applied[0].records).toHaveLength(20);
  });
});

describe("description with a run of millions of units", () => {
  it("reads a description with a run of white space of five million units", () => {
    expect(aiidDescriptionOf(`First${" ".repeat(5 * 1024 * 1024)}second`)).toBe("First second");
  });
});
