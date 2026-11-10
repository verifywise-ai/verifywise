/**
 * The FTC consumer protection civil penalty cases as a list of the vendor risk database: the FTC's
 * data.json names the current workbook, the workbook is read after the FTC's Crawl-delay, and the
 * orders become one record for each defendant company. The workbooks are synthetic: they copy the
 * shape of the FTC's (one sheet named as Excel cut it, strings in a shared table, numbers for the
 * amounts and the dates, a leading blank in a header, polluted case numbers, a footer that states the
 * count and the sum, an internal path in the workbook part) with every name, number and text
 * invented. Every field that the connector must leave out holds a token that starts with `ZZ-` (or a
 * name that begins with `Zzperson`), so that a copy of it anywhere in a body or a record is found.
 *
 * The synthetic vectors of the person rule come first, and they are asserted against
 * the rules of kit/persons.ts that the connector calls. A lone surrogate cannot reach the connector
 * through a workbook (the zip reader decodes UTF-8, which writes U+FFFD for it), so the hostile cells
 * hold the characters that can.
 */
import type { VrdbSourceId } from "../../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError } from "../../../../webResearch/guardedFetch";
import { type WriterEntry, writeZip } from "../../__tests__/helpers/zipWriter";
import type { ParsedRecord } from "../../types";
import {
  FTC_PENALTIES_RECORD_MARK,
  type FtcPenaltyRow,
  createFtcPenaltiesConnector,
  ftcPenaltiesConnector,
  ftcPenaltiesSummaryOf,
  ftcPenaltyPartiesOf,
} from "../ftcPenalties";
import { lineOf } from "../kit/clean";
import type { Sleep } from "../kit/pause";
import {
  BodyTooLargeError,
  type Connector,
  type ConnectorFetch,
  NotTheListError,
  type ParseResult,
  type Snapshot,
} from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const SOURCE_ID: VrdbSourceId = "ftc_penalties";

const DATA_JSON_URL = "https://www.ftc.gov/data.json";
const WORKBOOK_URL =
  "https://www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SHEET_NAME = "civil_penalty_cases_fy-2000-202";
const DATASET_TITLE = "FTC Bureau of Consumer Protection Penalty Actions";
const HEADER = ["Case Number", "Case Name", "Office", " Ordered Amount", "Date of Order", "Basis"];
const RECORD_URL = "https://www.ftc.gov/data.json?dataset=civil-penalty-cases&defendant=";

const CLOSING =
  "The entry is the FTC's record of an order against a defendant of this name, which may be " +
  "another company of the same name; it is not a finding about the vendor's current practices. " +
  "Not endorsed by the FTC; adapted by VerifyWise.";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

/** A row of the sheet as a test writes it. */
interface CaseRow {
  number: string;
  name: string;
  /** A number is a numeric cell, a string a text cell (the sheet writes ` -` for no amount); null writes no cell. */
  amount: number | string | null;
  /** `YYYY-MM-DD` becomes the Excel serial; a number is the serial as it is; text is a text cell. */
  date: string | number | { text: string };
  /** Null writes no cell. */
  basis: string | null;
  office?: string;
  /** Cells (as XML) added to the row, given the number of the row. */
  extra?: (row: number) => string;
}

const xmlEscape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The Excel serial of a day, in the 1900 system. */
const serialOf = (day: string): number =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

const columnOf = (number: number): string => String.fromCharCode(64 + number);

/** The sum that the sheet's footer states: the numeric amounts, to the cent. */
function sumOf(rows: readonly CaseRow[]): number {
  let cents = 0;
  for (const row of rows) if (typeof row.amount === "number") cents += Math.round(row.amount * 100);
  return cents / 100;
}

interface WorkbookOptions {
  sheetName?: string;
  header?: readonly string[];
  /** The footer's cells; false writes none. */
  footer?: { count?: number | string; sum?: number | string } | false;
  /** The rows between the last case and the footer (the sheet has three). */
  blankRows?: number;
  /** Rows (as XML) written between the cases and the footer, and after the footer. */
  beforeFooter?: string;
  afterFooter?: string;
  properties?: string;
  /** Cells (as XML) added to the header row, for a sheet with a column more. */
  headerExtra?: string;
  /** The sheet as it is, in place of the one made of the rows. */
  sheet?: string;
}

/** A workbook as the FTC's: its parts, its shared strings, its relative targets. */
function workbookOf(rows: readonly CaseRow[], options: WorkbookOptions = {}): Buffer {
  const strings: string[] = [];
  const places = new Map<string, number>();
  const shared = (text: string): number => {
    const known = places.get(text);
    if (known !== undefined) return known;
    places.set(text, strings.length);
    strings.push(text);
    return strings.length - 1;
  };
  const text = (reference: string, value: string): string =>
    `<c r="${reference}" t="s"><v>${shared(value)}</v></c>`;
  const number = (reference: string, value: number | string, style: number): string =>
    `<c r="${reference}" s="${style}"><v>${value}</v></c>`;

  const header = options.header ?? HEADER;
  const lines: string[] = [
    `<row r="1" spans="1:6">${header.map((name, at) => text(`${columnOf(at + 1)}1`, name)).join("")}${options.headerExtra ?? ""}</row>`,
  ];
  rows.forEach((row, at) => {
    const n = at + 2;
    const amount =
      row.amount === null
        ? ""
        : typeof row.amount === "number"
          ? number(`D${n}`, row.amount, 1)
          : text(`D${n}`, row.amount);
    const date =
      typeof row.date === "string"
        ? number(`E${n}`, serialOf(row.date), 2)
        : typeof row.date === "number"
          ? number(`E${n}`, row.date, 2)
          : text(`E${n}`, row.date.text);
    lines.push(
      `<row r="${n}" spans="1:6">${text(`A${n}`, row.number)}${text(`B${n}`, row.name)}${text(`C${n}`, row.office ?? "Synthetic Office ZZ-OFFICE")}${amount}${date}${row.basis === null ? "" : text(`F${n}`, row.basis)}${row.extra?.(n) ?? ""}</row>`,
    );
  });
  if (options.beforeFooter !== undefined) lines.push(options.beforeFooter);
  if (options.footer !== false) {
    const n = rows.length + 2 + (options.blankRows ?? 3);
    const count = options.footer?.count ?? rows.length;
    const sum = options.footer?.sum ?? sumOf(rows);
    lines.push(
      `<row r="${n}" spans="1:6"><c r="B${n}"><v>${count}</v></c><c r="D${n}" s="1"><v>${sum}</v></c></row>`,
    );
  }
  if (options.afterFooter !== undefined) lines.push(options.afterFooter);

  const sheet =
    options.sheet ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}"><dimension ref="A1:F${rows.length + 5}"/><sheetData>${lines.join("")}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((value) => `<si><t>${xmlEscape(value)}</t></si>`).join("")}</sst>`;
  const entries: WriterEntry[] = [
    { name: "xl/workbook.xml", data: workbookXml(options) },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Id="rId3" Type="${RELATIONSHIPS}/styles" Target="styles.xml"/><Relationship Id="rId1" Type="${RELATIONSHIPS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId4" Type="${RELATIONSHIPS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
    { name: "xl/sharedStrings.xml", data: sharedStrings },
  ];
  return writeZip(entries);
}

/** The workbook part, with the internal path and the markup-compatibility element the FTC's has. */
function workbookXml(options: WorkbookOptions): string {
  const name = xmlEscape(options.sheetName ?? SHEET_NAME);
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}" ` +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x15">` +
    `<fileVersion appName="xl" lastEdited="7"/>${options.properties ?? '<workbookPr defaultThemeVersion="202300"/>'}` +
    `<mc:AlternateContent><mc:Choice Requires="x15"><x15ac:absPath url="K:\\SYNTHETIC\\ZZ-PATH\\" xmlns:x15ac="http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac"/></mc:Choice></mc:AlternateContent>` +
    `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
}

/** The catalogue of the FTC with the dataset of the list, and another dataset that must be left alone. */
function catalogueOf(
  options: { url?: string; title?: string; datasets?: unknown[]; distribution?: unknown[] } = {},
): string {
  const distribution = options.distribution ?? [
    {
      "@type": "dcat:Distribution",
      downloadURL: options.url ?? WORKBOOK_URL,
      mediaType: "text/csv",
      format: "CSV",
      description: "ZZ-DISTRIBUTION-TEXT",
    },
  ];
  return JSON.stringify({
    "@context": "https://project-open-data.cio.gov/v1.1/schema/catalog.jsonld",
    "@type": "dcat:Catalog",
    dataset: options.datasets ?? [
      {
        "@type": "dcat:Dataset",
        title: "ZZ-OTHER-DATASET",
        description: "ZZ-OTHER-TEXT",
        distribution: [
          {
            downloadURL: "https://www.ftc.gov/system/files/ftc_gov/data/ZZ-other.csv",
          },
        ],
      },
      {
        "@type": "dcat:Dataset",
        title: options.title ?? DATASET_TITLE,
        description: "ZZ-DATASET-TEXT",
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        distribution,
      },
    ],
  });
}

/** The day of a filler row: every year from 2000 to 2025, so that the earliest is in 2000. */
const dayOfFiller = (at: number): string =>
  `${2000 + (at % 26)}-${String(1 + (at % 12)).padStart(2, "0")}-${String(1 + (at % 28)).padStart(2, "0")}`;

/** Rows that make the sheet as long as the real one is, each a company of its own. */
const fillerRows = (count: number): CaseRow[] =>
  Array.from({ length: count }, (_, at) => ({
    number: `X${900000 + at}`,
    name: `Fillerco${String(at).padStart(4, "0")} Corp`,
    amount: at % 3 === 0 ? " -" : 1000 * (at + 1),
    date: dayOfFiller(at),
    basis: "Violations of the Filler Rule",
  }));

const FILLERS = fillerRows(310);

/** The rows of a test, with the filler rows after them: the floors of the sheet hold. */
const withFillers = (...rows: CaseRow[]): CaseRow[] => [...rows, ...FILLERS];

const caseRow = (over: Partial<CaseRow> & Pick<CaseRow, "name">): CaseRow => ({
  number: "X100001",
  amount: 1000,
  date: "2024-03-05",
  basis: "Violations of the Example Act",
  ...over,
});

/** The files of the list, as the fake fetch serves them. */
function filesOf(
  rows: readonly CaseRow[] | Buffer,
  over: { catalogue?: string; dataJson?: Partial<FakeFile>; workbook?: Partial<FakeFile> } = {},
): Record<string, FakeFile> {
  const book = Buffer.isBuffer(rows) ? rows : workbookOf(rows);
  return {
    [DATA_JSON_URL]: {
      body: over.catalogue ?? catalogueOf(),
      contentType: "application/json; charset=utf-8",
      ...over.dataJson,
    },
    [WORKBOOK_URL]: {
      body: book,
      contentType: XLSX_TYPE,
      lastModified: "Fri, 16 Oct 2026 13:37:44 GMT",
      ...over.workbook,
    },
  };
}

type SleepMock = jest.Mock<ReturnType<Sleep>, Parameters<Sleep>>;

/** The connector under test, with a sleep that does not wait and keeps its calls. */
function connectorWithSleep(): { connector: Connector; sleep: SleepMock } {
  const sleep: SleepMock = jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(async () => undefined);
  return { connector: createFtcPenaltiesConnector({ sleep }), sleep };
}

/** What the body of a snapshot holds. */
interface Body {
  v: number;
  rows: FtcPenaltyRow[];
  total: number;
  unreadable: number;
}

interface Run {
  snapshot: Snapshot;
  body: Body;
  parsed: ParseResult;
  fetch: ReturnType<typeof fakeFetch>;
  sleep: SleepMock;
}

/** Downloads and parses a list of rows, through the fake fetch. */
async function run(
  rows: readonly CaseRow[] | Buffer,
  over: Parameters<typeof filesOf>[1] = {},
): Promise<Run> {
  const { connector, sleep } = connectorWithSleep();
  const fetch = fakeFetch(filesOf(rows, over));
  const snapshot = await connector.download(fetch, {});
  if (snapshot === "unchanged") throw new Error("The fake fetch answered unchanged.");
  return {
    snapshot,
    body: JSON.parse(snapshot.bodies[0]) as Body,
    parsed: connector.parse(snapshot),
    fetch,
    sleep,
  };
}

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** The failure of a download of rows, through the fake fetch. */
async function downloadFailure(
  rows: readonly CaseRow[] | Buffer,
  over: Parameters<typeof filesOf>[1] = {},
): Promise<unknown> {
  const { connector } = connectorWithSleep();
  return failureOf(connector.download(fakeFetch(filesOf(rows, over)), {}));
}

const rowOf = (body: Body, id: string): FtcPenaltyRow => {
  const found = body.rows.find((row) => row.id === id);
  if (found === undefined) throw new Error(`No entity ${id} in the body.`);
  return found;
};

const recordOf = (parsed: ParseResult, id: string): ParsedRecord => {
  const found = parsed.records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}.`);
  return found;
};

describe("ftcPenaltyPartiesOf, the party rule of the Case Name", () => {
  const entitiesOf = (name: string): string[] => ftcPenaltyPartiesOf(name).entities;

  describe("the vectors of the party rule", () => {
    it("drops a person that leads a case with et al", () => {
      expect(entitiesOf("Jordan Q. Example et al")).toEqual([]);
    });

    it("keeps a company that leads a case with et al, without the et al", () => {
      expect(entitiesOf("Examplecorp, Inc. et al")).toEqual(["Examplecorp, Inc."]);
    });

    it("keeps the company of a company and a person that a slash separates", () => {
      expect(entitiesOf("Brightline Widgets, Inc. / Casey Sample")).toEqual([
        "Brightline Widgets, Inc.",
      ]);
    });

    it("keeps the company of a person and a company that a comma separates", () => {
      expect(entitiesOf("Casey Sample, Stem Example Institute LLC")).toEqual([
        "Stem Example Institute LLC",
      ]);
    });

    it("drops the whole group of a person and a company joined by and", () => {
      expect(entitiesOf("Robin Sample and Quickexample LLC")).toEqual([]);
      expect(entitiesOf("Quickexample Inc. and Robin Sample")).toEqual([]);
    });

    it("keeps a company that is named like a person when it has its legal form", () => {
      expect(entitiesOf("Lumen Ward, Inc.")).toEqual(["Lumen Ward, Inc."]);
    });

    it("keeps whole a company whose name holds a comma and an and", () => {
      expect(entitiesOf("Ward, Roebuck and Co.")).toEqual(["Ward, Roebuck and Co."]);
    });

    it("gives one entity and an alias for a company that trades as another name", () => {
      expect(ftcPenaltyPartiesOf("Examplecorp, Inc. d/b/a ExampleCall")).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: ["ExampleCall"],
      });
    });

    it("cuts every parenthetical group, brands and individual defendants alike", () => {
      expect(entitiesOf("Examplecorp, Inc. (Brandname) (Casey Sample)")).toEqual([
        "Examplecorp, Inc.",
      ]);
      expect(entitiesOf("(Brandname) Examplecorp, Inc.")).toEqual([]);
    });
  });

  describe("the head of the name", () => {
    it("is the text before the first parenthesis, and an unclosed parenthesis is a group too", () => {
      expect(entitiesOf("Examplecorp, Inc. (Brandname")).toEqual(["Examplecorp, Inc."]);
      expect(entitiesOf("Casey Sample (Examplecorp, Inc.")).toEqual([]);
    });

    it("has no ; and no blank at its end, and ends at the first ' - '", () => {
      expect(entitiesOf("Examplecorp, Inc.;")).toEqual(["Examplecorp, Inc."]);
      expect(entitiesOf("Examplecorp, Inc. ; ;")).toEqual(["Examplecorp, Inc."]);
      expect(entitiesOf("Examplecorp, Inc. - Casey Sample")).toEqual(["Examplecorp, Inc."]);
      expect(entitiesOf("Examplecorp, Inc.; - Casey Sample")).toEqual(["Examplecorp, Inc."]);
    });

    it("keeps a hyphen that has no blanks round it", () => {
      expect(entitiesOf("Alpha-Beta Examplecorp, Inc.")).toEqual(["Alpha-Beta Examplecorp, Inc."]);
    });

    it("gives no party for a name that is empty, blank, or only a group", () => {
      expect(ftcPenaltyPartiesOf("")).toEqual({ entities: [], aliases: [] });
      expect(ftcPenaltyPartiesOf("   ")).toEqual({ entities: [], aliases: [] });
      expect(ftcPenaltyPartiesOf("(Brandname)")).toEqual({ entities: [], aliases: [] });
      expect(ftcPenaltyPartiesOf(";")).toEqual({ entities: [], aliases: [] });
    });
  });

  describe("the parties of a segment", () => {
    it("are split at a slash or a semicolon, with no blank needed", () => {
      expect(entitiesOf("Alphacorp, Inc./Betacorp LLC")).toEqual([
        "Alphacorp, Inc.",
        "Betacorp LLC",
      ]);
      expect(entitiesOf("Alphacorp, Inc.; Betacorp LLC")).toEqual([
        "Alphacorp, Inc.",
        "Betacorp LLC",
      ]);
      expect(entitiesOf("Alphacorp, Inc. ; Betacorp LLC / Gammacorp Ltd")).toEqual([
        "Alphacorp, Inc.",
        "Betacorp LLC",
        "Gammacorp Ltd",
      ]);
    });

    it("lose an et al with a comma, a dot or the el al of a misspelling", () => {
      expect(entitiesOf("Examplecorp, Inc., et al.")).toEqual(["Examplecorp, Inc."]);
      expect(entitiesOf("Examplecorp Inc et. al")).toEqual(["Examplecorp Inc"]);
      expect(entitiesOf("Examplecorp, Inc. el al")).toEqual(["Examplecorp, Inc."]);
      expect(entitiesOf("Examplecorp, Inc. ET AL")).toEqual(["Examplecorp, Inc."]);
    });

    it("are dropped with their et al when what is left has no legal form", () => {
      expect(entitiesOf("Gammacorp et al")).toEqual([]);
      expect(entitiesOf("et al")).toEqual([]);
      expect(entitiesOf("Alphacorp, Inc. / Gammacorp et al")).toEqual(["Alphacorp, Inc."]);
    });

    it("merge a group that is only a legal form into the group before it", () => {
      expect(entitiesOf("Examplecorp, Inc.")).toEqual(["Examplecorp, Inc."]);
      expect(entitiesOf("Examplecorp, L.L.C.")).toEqual(["Examplecorp, L.L.C."]);
      expect(entitiesOf("Examplecorp, Inc., Ltd")).toEqual(["Examplecorp, Inc., Ltd"]);
      expect(entitiesOf("Examplecorp, Limited")).toEqual(["Examplecorp, Limited"]);
    });

    it("keep the groups of a comma that are no person, joined as they were", () => {
      expect(entitiesOf("Alphacorp, Betacorp Holdings, Casey Sample")).toEqual([
        "Alphacorp, Betacorp Holdings",
      ]);
    });

    it("keep a group of one word, a brand that no person's name has the shape of", () => {
      expect(entitiesOf("Spokeless")).toEqual(["Spokeless"]);
    });

    it("drop a company with a name of the shape of a person's and no legal form, the cost of the rule", () => {
      expect(entitiesOf("Zephyr Quillon")).toEqual([]);
    });

    it("keep the companies of a group that holds an and and no person", () => {
      expect(entitiesOf("Alphacorp Inc. and Betacorp LLC")).toEqual([
        "Alphacorp Inc. and Betacorp LLC",
      ]);
      expect(entitiesOf("Alphacorp Inc. & Betacorp LLC")).toEqual([
        "Alphacorp Inc. & Betacorp LLC",
      ]);
    });

    it("drop a group of an and whichever piece is the person", () => {
      expect(entitiesOf("Casey Sample & Quickexample LLC")).toEqual([]);
      expect(entitiesOf("Quickexample LLC & Casey Sample & Betacorp Inc")).toEqual([]);
    });

    it("read an and in any case as the join of a group: a name of persons in capitals is dropped too", () => {
      expect(entitiesOf("CASEY SAMPLE AND ROBIN SAMPLE")).toEqual([]);
      expect(entitiesOf("Casey Sample And Robin Sample")).toEqual([]);
      expect(entitiesOf("QUICKEXAMPLE INC. AND ROBIN SAMPLE")).toEqual([]);
      expect(entitiesOf("ALPHACORP INC. AND BETACORP LLC")).toEqual([
        "ALPHACORP INC. AND BETACORP LLC",
      ]);
    });
  });

  describe("a group of a comma that begins with and or &", () => {
    it("is judged without that word, and a person in it drops the whole party, as the same name without the comma does", () => {
      expect(entitiesOf("Quickexample Inc. and Robin Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., and Robin Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., & Robin Sample")).toEqual([]);
      expect(entitiesOf("Robin Sample, and Quickexample Inc.")).toEqual([]);
      expect(entitiesOf("Robin Sample, & Quickexample Inc.")).toEqual([]);
    });

    it("is read in any case and with any blanks after the word", () => {
      expect(entitiesOf("Quickexample Inc., AND Robin Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., And   Robin Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc.,&  Robin Sample")).toEqual([]);
    });

    it("lets one person drop a whole chain of and groups", () => {
      expect(entitiesOf("Alphacorp Inc., and Betacorp LLC, and Robin Sample")).toEqual([]);
      expect(entitiesOf("Robin Sample, and Alphacorp Inc., and Betacorp LLC")).toEqual([]);
    });

    it("drops only its own party: the other parties of the segment stay", () => {
      expect(entitiesOf("Quickexample Inc., and Robin Sample / Betacorp LLC")).toEqual([
        "Betacorp LLC",
      ]);
    });

    it("keeps the groups, as they were written, when none is a person", () => {
      expect(entitiesOf("Alphacorp, Inc., and Betacorp LLC")).toEqual([
        "Alphacorp, Inc., and Betacorp LLC",
      ]);
      expect(entitiesOf("Alphacorp, Inc., & Betacorp LLC")).toEqual([
        "Alphacorp, Inc., & Betacorp LLC",
      ]);
    });

    it("keeps one firm of two one-word names that a comma and an and join, with its legal form at the end", () => {
      expect(entitiesOf("Gardens, and Tools, Inc.")).toEqual(["Gardens, and Tools, Inc."]);
      expect(entitiesOf("Gardens, & Tools, Inc.")).toEqual(["Gardens, & Tools, Inc."]);
    });

    it("is no and when the word only begins with it", () => {
      expect(entitiesOf("Quickexample Inc., Andrew Sample")).toEqual(["Quickexample Inc."]);
      expect(entitiesOf("Quickexample Inc., Andersen Holdings")).toEqual([
        "Quickexample Inc., Andersen Holdings",
      ]);
    });

    it("is nothing when it is only the word: the word is left out of the party", () => {
      expect(entitiesOf("Quickexample Inc., and")).toEqual(["Quickexample Inc."]);
      expect(entitiesOf("Quickexample Inc., &")).toEqual(["Quickexample Inc."]);
    });

    it("is judged without the word when it begins the name", () => {
      expect(entitiesOf(", and Robin Sample")).toEqual([]);
    });
  });

  describe("the Last, First shape", () => {
    it.each([
      "Sample, Casey",
      "SAMPLE, CASEY J",
      "Sample, Casey, Quickexample Inc.",
      "Quickexample Inc., Sample, Casey",
      "Sample, Casey Jordan",
      "Sample, Casey J.",
    ])("drops the whole party of %s", (name) => {
      expect(entitiesOf(name)).toEqual([]);
    });

    it("drops a company that is named as two one-word brands in a row, by design", () => {
      expect(entitiesOf("Alpha, Beta")).toEqual([]);
      expect(entitiesOf("Alpha, and Beta")).toEqual([]);
      expect(entitiesOf("Alpha, Beta, Gamma")).toEqual([]);
    });

    it("drops a one-word brand that stands before a person: the surname that the person rule would leave behind", () => {
      expect(entitiesOf("Brandword, Robin Sample")).toEqual([]);
    });

    it("drops only its own party: the other parties of the segment stay", () => {
      expect(entitiesOf("Sample, Casey / Betacorp LLC")).toEqual(["Betacorp LLC"]);
      expect(entitiesOf("Betacorp LLC; Sample, Casey")).toEqual(["Betacorp LLC"]);
    });

    it("judges the groups after the legal forms are merged: a one-word name with its form is no bare word", () => {
      expect(entitiesOf("Amazing.example, Inc.")).toEqual(["Amazing.example, Inc."]);
      expect(entitiesOf("Gardens, and Tools, Inc.")).toEqual(["Gardens, and Tools, Inc."]);
      expect(entitiesOf("Alpha, Inc., Beta")).toEqual(["Alpha, Inc., Beta"]);
    });

    it("judges a group without its leading and: the bare word after an and still counts", () => {
      expect(entitiesOf("Quickexample Inc., and Alpha, Beta")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., & Alpha, Beta")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., + Alpha, Beta")).toEqual([]);
    });

    it("leaves a group that is a legal form of the kit alone, whatever it is", () => {
      expect(entitiesOf("Alphacorp, Group")).toEqual(["Alphacorp, Group"]);
      expect(entitiesOf("Alphacorp, Holdings")).toEqual(["Alphacorp, Holdings"]);
    });

    it("leaves a company that has a legal form before a person alone: the company stays", () => {
      expect(entitiesOf("Quickexample Inc., Robin Sample")).toEqual(["Quickexample Inc."]);
    });

    it("leaves a company of more than one word and no legal form alone: it is no bare word", () => {
      expect(entitiesOf("Alpha 2 Beta, Robin Sample")).toEqual(["Alpha 2 Beta"]);
      expect(entitiesOf("Gamma, Alpha 2 Beta")).toEqual(["Gamma, Alpha 2 Beta"]);
    });

    it("counts a legal form of the rule as no bare word, even when the kit does not know it", () => {
      jest.isolateModules(() => {
        jest.doMock("../kit/persons", () => ({
          ...jest.requireActual("../kit/persons"),
          hasLegalForm: () => false,
        }));
        const isolated = require("../ftcPenalties") as typeof import("../ftcPenalties");
        expect(isolated.ftcPenaltyPartiesOf("Inc., Beta").entities).toEqual(["Inc., Beta"]);
      });
    });
  });

  describe("the Last, First shape of a surname that is no bare word", () => {
    // A surname of two to four words, with a suffix, or with a particle that the rule does not take
    // out is a person's group, and no bare word. The group that follows it and begins with a bare word
    // is the same person's given name, and the rest of the party goes with it: the company that stands
    // before the person stays, and nothing that follows the given name is kept, never cut (see below).
    it.each([
      "Sample Lee, Casey",
      "SAMPLE LEE, CASEY",
      "Van Sample, Casey",
      "Von Sample, Casey",
      "Da Sample, Casey",
      "Di Sample, Casey",
      "Le Sample, Casey",
      "Al Sample, Casey",
      "St. Sample, Casey",
      "Sample Jr., Casey",
      "Sample III, Casey",
      "de la Sample Lee, Casey",
      "Sample y Lee, Casey",
      "Garcia Lopez Sample, Casey",
      "Garcia Lopez Sample Lee, Casey",
    ])("drops the person and the given name of %s", (name) => {
      expect(ftcPenaltyPartiesOf(name)).toEqual({ entities: [], aliases: [] });
    });

    it("keeps the company that stands before the person, without the given name in its entity", () => {
      expect(entitiesOf("Examplecorp Inc., Sample Lee, Casey")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., Van Sample, Casey")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., Sample Jr., Casey")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., de la Sample Lee, Casey")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., Sample Lee, Casey, Betacorp LLC")).toEqual([
        "Examplecorp Inc.",
      ]);
    });

    it("drops only its own party: the other parties of the segment stay, as for a bare surname", () => {
      expect(entitiesOf("Examplecorp Inc. / Sample Lee, Casey")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Sample Lee, Casey / Betacorp LLC")).toEqual(["Betacorp LLC"]);
      expect(entitiesOf("Betacorp LLC; Sample Lee, Casey")).toEqual(["Betacorp LLC"]);
    });

    it("drops a company that an and, an & or a + joins to the given name, with the given name", () => {
      for (const join of ["and", "&", "+", "AND"]) {
        expect(entitiesOf(`Sample Lee, Casey ${join} Examplecorp Inc.`)).toEqual([]);
        expect(entitiesOf(`Sample Lee, Casey, ${join} Examplecorp Inc.`)).toEqual([]);
      }
    });

    it("drops what follows a given name whole, whatever follows the join", () => {
      expect(entitiesOf("Sample Lee, Casey and Robin")).toEqual([]);
      expect(entitiesOf("Sample Lee, Casey, and Robin")).toEqual([]);
      expect(entitiesOf("Sample Lee, Casey and Robin and Examplecorp Inc.")).toEqual([]);
      expect(entitiesOf("Sample Lee, Casey, and Robin, and Examplecorp Inc.")).toEqual([]);
      expect(entitiesOf("Sample Lee, Casey and Robin Sample")).toEqual([]);
    });

    it("never stores a company with its front cut off: a firm that follows a person is lost, not cut", () => {
      // The name of a firm can be one bare word, a comma, and the rest of its name; cutting the bare
      // word as a given name would store `Tools, Inc.` for `Gardens, and Tools, Inc.`, a key that
      // can match another vendor.
      for (const name of [
        "Casey Sample, Gardens, and Tools, Inc.",
        "Casey Sample, Zorbex and Quillon, Inc.",
        "Casey Sample, Zorbex, and Quillon, Inc.",
        "Casey Sample, Brightzorb and Examplecorp, Inc.",
        "Casey Sample, Zorbex & Quillon LLC",
        "Casey Sample, Zorbex + Quillon LLC",
        "Sample Lee, Zorbex and Quillon, Inc.",
        "Sample Jr., Zorbex and Quillon, Inc.",
        "Estate of Casey Sample, Zorbex and Quillon, Inc.",
        "Casey Sample, Zorbex and Quillon, Inc., et al",
        "Casey Sample, Brightzorb, Quillon and Co.",
        "Casey Sample, Brightzorb, Quillon, Zorbex and Co.",
        "Casey Sample, Brightzorb, Quillon Zorbex and Co.",
        "Sample Lee, Casey, Examplecorp Inc.",
        "Sample Lee, Casey, Examplecorp, Inc.",
        "Sample Lee, Casey, Zorbex and Quillon, Inc.",
        "Sample Lee, Casey, Examplecorp Inc. and Betacorp LLC",
        "Sample Lee, Casey, Examplecorp Inc., Betacorp LLC",
      ]) {
        expect(ftcPenaltyPartiesOf(name)).toEqual({ entities: [], aliases: [] });
      }
    });

    it("keeps what stands before the person, and nothing that follows the given name", () => {
      expect(entitiesOf("Gardens, and Tools, Inc., Casey Sample, Zorbex")).toEqual([
        "Gardens, and Tools, Inc.",
      ]);
      expect(entitiesOf("Gardens, and Tools, Inc., Casey Sample, Zorbex, Betacorp LLC")).toEqual([
        "Gardens, and Tools, Inc.",
      ]);
      expect(entitiesOf("Examplecorp Inc., Betacorp LLC, Sample Lee, Casey, Zetacorp LLC")).toEqual(
        ["Examplecorp Inc., Betacorp LLC"],
      );
    });

    it("counts a word of legal wording that follows a person as a given name: the rest goes with it", () => {
      expect(entitiesOf("Casey Sample, individually, Examplecorp Inc.")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., Casey Sample, individually, Betacorp LLC")).toEqual([
        "Examplecorp Inc.",
      ]);
    });

    it("cuts a group only when it begins with a bare word: a group of two words next to a person stays", () => {
      expect(entitiesOf("Casey Sample, Quillon Zorbex Inc.")).toEqual(["Quillon Zorbex Inc."]);
      expect(entitiesOf("Sample Lee, Examplecorp Inc. and Betacorp LLC")).toEqual([
        "Examplecorp Inc. and Betacorp LLC",
      ]);
    });

    it("takes the word that follows a person out only from the group that stands next to the person", () => {
      expect(entitiesOf("Examplecorp Inc., Casey and Betacorp LLC")).toEqual([
        "Examplecorp Inc., Casey and Betacorp LLC",
      ]);
      expect(entitiesOf("Casey Sample, Stem Example Institute LLC")).toEqual([
        "Stem Example Institute LLC",
      ]);
    });

    it("drops the one-word brand that follows a name of two words, as it drops the second of Alpha, Beta", () => {
      expect(entitiesOf("Zorbex Quillon, Gamma")).toEqual([]);
      expect(entitiesOf("Casey Sample, Zorbex")).toEqual([]);
    });

    it("lets the wording go and the company before the person stay", () => {
      expect(entitiesOf("Sample Lee, Casey, individually")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., Casey Sample, individually")).toEqual([
        "Examplecorp Inc.",
      ]);
    });

    it("drops a company that an and joins to the person's group with it, as before", () => {
      expect(entitiesOf("Examplecorp Inc. and Sample Lee, Casey")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., and Sample Lee, Casey")).toEqual([]);
    });

    it("leaves a given name that an and joins to the person's group to the unit rule, and what follows the unit stays", () => {
      expect(entitiesOf("Examplecorp Inc., Sample Lee, and Casey, Betacorp LLC")).toEqual([
        "Examplecorp Inc., Betacorp LLC",
      ]);
      expect(entitiesOf("Examplecorp Inc., Sample Lee & Casey, Betacorp LLC")).toEqual([
        "Examplecorp Inc., Betacorp LLC",
      ]);
    });

    it("leaves the shape of a bare surname as it was: the whole party goes, the company too", () => {
      expect(entitiesOf("Quickexample Inc., Sample, Casey")).toEqual([]);
      expect(entitiesOf("Sample, Casey, Quickexample Inc.")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., Sample Lee, Casey, Jr.")).toEqual([]);
    });

    it("leaves a group that is a person of its own, or a company, as it was", () => {
      expect(entitiesOf("Sample Lee, Casey J.")).toEqual([]);
      expect(entitiesOf("Sample Lee, Casey Jordan, Examplecorp Inc.")).toEqual([
        "Examplecorp Inc.",
      ]);
    });
  });

  describe("the particles of a name", () => {
    // The kit counts de, del, la, las, los, el and en as organisation words and y as a legal form,
    // so a name that holds one is never read as a person's. The person rule judges a group without
    // them, and a legal form that the group still holds wins.
    it.each(["de", "del", "la", "las", "los", "el", "en", "y"])(
      "reads a name with %s between its words as a person's: the party is dropped",
      (particle) => {
        expect(entitiesOf(`Casey ${particle} Sample`)).toEqual([]);
        expect(entitiesOf(`CASEY ${particle.toUpperCase()} SAMPLE`)).toEqual([]);
      },
    );

    it("drops these names: two particles, a given name, a y between two persons", () => {
      expect(entitiesOf("Casey de la Sample")).toEqual([]);
      expect(entitiesOf("Maria del Carmen Sample")).toEqual([]);
      expect(entitiesOf("Casey Sample y Robin Sample")).toEqual([]);
    });

    it("reads a particle with a dot or a quotation mark round it as the particle", () => {
      for (const name of [
        "Casey Y. Sample",
        "Casey de. Sample",
        'Casey "de" Sample',
        `Casey ${cp(0x201c)}de${cp(0x201d)} Sample`,
      ]) {
        expect(entitiesOf(name)).toEqual([]);
      }
    });

    it("takes the particles out before it counts the words of a name", () => {
      expect(entitiesOf("Maria de la Concepcion de los Sample")).toEqual([]);
    });

    it("judges the order Last, First on the groups without their particles", () => {
      expect(entitiesOf("de la Sample, Casey")).toEqual([]);
      expect(entitiesOf("Sample, Casey de la")).toEqual([]);
    });

    it("drops the person of a comma and of an and as it does when the name has no particle", () => {
      expect(entitiesOf("Quickexample Inc. and Casey de la Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., and Casey de la Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., Casey de la Sample")).toEqual(["Quickexample Inc."]);
    });

    it("keeps a name with a particle and a legal form: a legal form still wins", () => {
      expect(entitiesOf("Casey de la Sample Inc.")).toEqual(["Casey de la Sample Inc."]);
      expect(entitiesOf("Casey de la Sample, Inc.")).toEqual(["Casey de la Sample, Inc."]);
      expect(entitiesOf("Maria del Carmen Sample LLC")).toEqual(["Maria del Carmen Sample LLC"]);
      expect(entitiesOf("Casey Sample y Robin Sample, Inc.")).toEqual([
        "Casey Sample y Robin Sample, Inc.",
      ]);
    });

    it("keeps a name that the kit reads as a person's but that ends in a dotted legal form: the legal form still wins", () => {
      expect(entitiesOf("Casey Sample L.P.")).toEqual(["Casey Sample L.P."]);
      expect(entitiesOf("Casey de la Sample L.P.")).toEqual(["Casey de la Sample L.P."]);
    });

    it("keeps a name with a particle and an organisation word", () => {
      expect(entitiesOf("Banco de la Sample")).toEqual(["Banco de la Sample"]);
      expect(entitiesOf("Universidad del Sample")).toEqual(["Universidad del Sample"]);
    });

    it("keeps a name whose legal form follows a leading particle: it is the first word no longer, and still wins", () => {
      expect(entitiesOf("La Group Sample")).toEqual(["La Group Sample"]);
      expect(entitiesOf("El Holdings Sample")).toEqual(["El Holdings Sample"]);
    });

    it("keeps a name that is one word once its particles are out", () => {
      expect(entitiesOf("La Sample")).toEqual(["La Sample"]);
      expect(entitiesOf("El Spokeless")).toEqual(["El Spokeless"]);
    });

    it("takes out a particle that is a word of its own, never a part of a word", () => {
      expect(entitiesOf("Development Sample")).toEqual(["Development Sample"]);
      expect(entitiesOf("Casey Hotel Sample")).toEqual(["Casey Hotel Sample"]);
      expect(entitiesOf("Casey Development Sample")).toEqual(["Casey Development Sample"]);
    });

    it("counts a group of particles alone as a bare word of the Last, First shape", () => {
      expect(entitiesOf("Sample, la")).toEqual([]);
      expect(entitiesOf("Sample, de la")).toEqual([]);
    });

    it("drops a firm with no legal form that holds a particle and capitalised words, the cost of the rule", () => {
      expect(entitiesOf("Casa de Sample")).toEqual([]);
    });
  });

  describe("a plus", () => {
    it("joins the pieces of a group as an and does: a person among them drops the group", () => {
      expect(entitiesOf("Casey Sample + Robin Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc. + Robin Sample")).toEqual([]);
      expect(entitiesOf("Robin Sample + Quickexample Inc.")).toEqual([]);
    });

    it("begins a group of a comma as an and does", () => {
      expect(entitiesOf("Quickexample Inc., + Robin Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc.,+ Robin Sample")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., +")).toEqual(["Quickexample Inc."]);
    });

    it("keeps the group, as it was written, when none of its pieces is a person", () => {
      expect(entitiesOf("Alphacorp Inc. + Betacorp LLC")).toEqual([
        "Alphacorp Inc. + Betacorp LLC",
      ]);
    });

    it("is no join without blanks round it: it is part of a name", () => {
      expect(entitiesOf("A+ Widgets Inc.")).toEqual(["A+ Widgets Inc."]);
      expect(entitiesOf("Alpha+Beta Pizza")).toEqual(["Alpha+Beta Pizza"]);
    });
  });

  describe("a group of a comma that is only legal wording", () => {
    // The words that a case name uses to say how a person is named: `individually`, `jointly and
    // severally`. A group of them is no party, and a group that holds any other word is.
    const WORDING = [
      "individually",
      "also",
      "jointly",
      "severally",
      "personally",
      "formerly",
      "collectively",
      "successors",
      "assigns",
      "et",
      "al",
      "and",
      "or",
      "its",
      "their",
      "the",
      "as",
      "an",
      "a",
      "individual",
      "successor",
      "assign",
    ];

    // A word between two of itself and an and: a group that no person rule drops and that is long
    // enough to be an entity, whichever word it is.
    it.each(WORDING)("is no party when it is made of the word %s", (word) => {
      expect(entitiesOf(`Casey Sample, ${word} and ${word}`)).toEqual([]);
    });

    // After a person the word is the given name of the shape Last, First, whatever it is, so the list
    // of the words is told by the company that stands before the group: the group is left out, and
    // the company stays; a word that is no wording would stay in the party with the company.
    it.each(WORDING)("is left out after a company when it is made of the word %s", (word) => {
      expect(entitiesOf(`Quickexample Inc., ${word} and ${word}`)).toEqual(["Quickexample Inc."]);
      expect(entitiesOf(`Quickexample Inc., ${word.toUpperCase()}`)).toEqual(["Quickexample Inc."]);
      if (word !== "and") {
        expect(entitiesOf(`Quickexample Inc., ${word}`)).toEqual(["Quickexample Inc."]);
        expect(entitiesOf(`Quickexample Inc., ${word}.`)).toEqual(["Quickexample Inc."]);
        expect(entitiesOf(`Quickexample Inc., "${word}"`)).toEqual(["Quickexample Inc."]);
        expect(entitiesOf(`Quickexample Inc., ${cp(0x201c)}${word}${cp(0x201d)}`)).toEqual([
          "Quickexample Inc.",
        ]);
      }
    });

    it("leaves no entity for a person who is named individually, or known by another name", () => {
      expect(entitiesOf("Casey Sample, individually")).toEqual([]);
      expect(ftcPenaltyPartiesOf("Casey Sample, also d/b/a Examplecorp")).toEqual({
        entities: ["Examplecorp"],
        aliases: [],
      });
    });

    it("is read in any case, with a dot or a quotation mark round a word, and as a phrase", () => {
      expect(entitiesOf("Casey Sample, INDIVIDUALLY")).toEqual([]);
      expect(entitiesOf("Casey Sample, Jointly And Severally")).toEqual([]);
      expect(entitiesOf("Casey Sample, individually.")).toEqual([]);
      expect(entitiesOf('Casey Sample, "individually"')).toEqual([]);
      expect(entitiesOf(`Casey Sample, ${cp(0x201c)}individually${cp(0x201d)}`)).toEqual([]);
      expect(entitiesOf("Casey Sample, individually and personally")).toEqual([]);
    });

    it("is left out of the party that it ends: the company before it stays", () => {
      expect(entitiesOf("Quickexample Inc., individually")).toEqual(["Quickexample Inc."]);
      expect(entitiesOf("Quickexample Inc., & individually")).toEqual(["Quickexample Inc."]);
      expect(entitiesOf("Quickexample Inc., Casey Sample, individually")).toEqual([
        "Quickexample Inc.",
      ]);
    });

    it("is left out after a legal form too: a trailing article goes", () => {
      expect(entitiesOf("Examplecorp Co., The")).toEqual(["Examplecorp Co."]);
    });

    it("is a party when it holds a word that is not legal wording", () => {
      expect(entitiesOf("Alphacorp Inc., Also Betacorp Co")).toEqual([
        "Alphacorp Inc., Also Betacorp Co",
      ]);
    });

    it("is left out of the party after a plain comma, whatever its length, and the company stays", () => {
      expect(entitiesOf("Quickexample Inc., jointly and severally")).toEqual(["Quickexample Inc."]);
      expect(entitiesOf("Quickexample Inc., its successors and assigns")).toEqual([
        "Quickexample Inc.",
      ]);
    });

    it("is judged with its unit when an and goes on with it: its words can have a person's shape, and the unit drops (a recall note)", () => {
      expect(entitiesOf("Quickexample Inc., and its successors and assigns")).toEqual([]);
      expect(entitiesOf("Quickexample Inc., and their successors")).toEqual([]);
      expect(entitiesOf("Casey Sample, and its successors")).toEqual([]);
    });

    it("counts as a bare word of the Last, First shape, whatever its length: a name of one word before it drops the party", () => {
      expect(entitiesOf("Sample, individually")).toEqual([]);
      expect(entitiesOf("Sample, jointly and severally")).toEqual([]);
      expect(entitiesOf("Sample, individually and personally")).toEqual([]);
    });

    it("is not a group with no word in it: a group of punctuation is left as it is", () => {
      expect(entitiesOf("Alphacorp Inc., .")).toEqual(["Alphacorp Inc., ."]);
    });
  });

  describe("a person's name with a quoted nickname, a typographic dash or a backtick", () => {
    // The kit reads a name of letters, dots, apostrophes and hyphens: any other character made the
    // whole name no person's, and the name was kept with both its given names. The rule reads the
    // quotation marks off every word, and the dashes and the backtick as the hyphen and the apostrophe.
    it("reads a quoted word inside a name of two to four words as a nickname: the person goes", () => {
      for (const name of [
        'Casey "Robin" Sample',
        `Casey ${cp(0x201c)}Robin${cp(0x201d)} Sample`,
        'Casey "Robin" Quillon Sample',
        'CASEY "ROBIN" SAMPLE',
        'Casey "Robin" Sample Jr.',
        '"Robin" Casey Sample',
        `${cp(0x201c)}Robin${cp(0x201d)} Casey Sample`,
        'Casey "Robin"',
      ]) {
        expect(entitiesOf(name)).toEqual([]);
      }
    });

    it("reads U+2010, U+2011 and U+2013 as a hyphen: a name that holds one is a person's", () => {
      for (const code of [0x2010, 0x2011, 0x2013]) {
        expect(entitiesOf(`Casey Sample${cp(code)}Lee`)).toEqual([]);
        expect(entitiesOf(`Casey${cp(code)}Robin Sample`)).toEqual([]);
      }
    });

    it("reads the backtick as an apostrophe", () => {
      expect(entitiesOf(`Casey O${cp(0x60)}Sample`)).toEqual([]);
      expect(entitiesOf(`Casey Sample${cp(0x60)}s`)).toEqual([]);
    });

    it("keeps the hyphen and the apostrophe that the kit reads", () => {
      expect(entitiesOf("Casey Sample-Lee")).toEqual([]);
      expect(entitiesOf("Casey O'Sample")).toEqual([]);
    });

    it("keeps a name that holds a digit: a digit still makes a piece no person's, the rule of the kit", () => {
      expect(entitiesOf("Casey Sample 2")).toEqual(["Casey Sample 2"]);
      expect(entitiesOf('Casey "Robin" Sample 2')).toEqual(['Casey "Robin" Sample 2']);
    });

    it("keeps a name with a quoted word that has a legal form or an organisation word", () => {
      expect(entitiesOf('Casey "Robin" Sample Inc.')).toEqual(['Casey "Robin" Sample Inc.']);
      expect(entitiesOf('Zorbex "Quillon" Hotel')).toEqual(['Zorbex "Quillon" Hotel']);
      expect(entitiesOf(`Zorbex ${cp(0x201c)}Quillon${cp(0x201d)} Hotel`)).toEqual([
        `Zorbex ${cp(0x201c)}Quillon${cp(0x201d)} Hotel`,
      ]);
    });

    it("reads the quotation marks off a name for the person rule only: a quoted legal form is still a bare word of its own", () => {
      expect(entitiesOf('Sample, "Inc."')).toEqual([]);
    });
  });

  describe("an estate", () => {
    it.each([
      "Estate of Casey Sample",
      "The Estate of Casey Sample",
      "ESTATE OF CASEY SAMPLE",
      "the estate of Casey Sample",
      "Estate  of   Casey Sample",
      "Estate of Casey",
      "Estate of Zorbex Inc.",
    ])("reads %s as a person's group: it is dropped", (name) => {
      expect(entitiesOf(name)).toEqual([]);
    });

    it("drops the estate of a person after a company, and the company stays", () => {
      expect(entitiesOf("Examplecorp Inc., Estate of Casey Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc. / The Estate of Casey Sample")).toEqual([
        "Examplecorp Inc.",
      ]);
    });

    it("drops the company that an and joins to an estate, as it drops one that is joined to a person", () => {
      expect(entitiesOf("Examplecorp Inc. and the Estate of Casey Sample")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc. & Estate of Casey Sample")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., and Estate of Casey Sample")).toEqual([]);
    });

    it("drops the word that follows an estate: it is the person's", () => {
      expect(entitiesOf("Estate of Sample, Deceased")).toEqual([]);
    });

    it("reads Estate of only as two words: a word that only begins with it is no estate", () => {
      expect(entitiesOf("Estateofcorp Inc.")).toEqual(["Estateofcorp Inc."]);
      expect(entitiesOf("Estate Offices Inc.")).toEqual(["Estate Offices Inc."]);
      expect(entitiesOf("Estates of Zorbex Inc.")).toEqual(["Estates of Zorbex Inc."]);
      expect(entitiesOf("Estateof Zorbex Inc.")).toEqual(["Estateof Zorbex Inc."]);
    });
  });

  const hex = (code: number): string => code.toString(16).toUpperCase().padStart(4, "0");
  const DASHES = [
    0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212, 0x58a, 0x5be, 0x2e3a, 0x301c, 0x3030,
    0x30a0, 0xfe58,
  ];

  describe("the marks of every script in a person's name", () => {
    // The kit reads a name of letters, dots, apostrophes and hyphens: any other character made the
    // whole name no person's, and the name was kept with both its given names. The rule reads every
    // dash as a hyphen and every quotation mark as no character, for the person shape only: the
    // text that is stored is never changed.
    const QUOTATION_MARKS = [
      0x22, 0xab, 0xbb, 0x2018, 0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f, 0x2039,
      0x203a, 0x2032, 0x2033, 0x2034, 0x2035, 0x2036, 0x2037, 0x2e02, 0x2e03, 0x301d, 0x301e,
      0x301f,
    ];

    it.each(QUOTATION_MARKS.map((code): [string, number] => [hex(code), code]))(
      "reads U+%s as no character: a name that holds it is a person's, alone or after a company",
      (_hex, code) => {
        const mark = cp(code);
        for (const name of [
          `Casey ${mark}Robin${mark} Sample`,
          `Casey ${mark}Robin Sample`,
          `Casey Robin${mark} Sample`,
          `${mark}Casey Sample${mark}`,
        ]) {
          expect(entitiesOf(name)).toEqual([]);
          expect(entitiesOf(`Examplecorp Inc., ${name}`)).toEqual(["Examplecorp Inc."]);
        }
      },
    );

    it.each(DASHES.map((code): [string, number] => [hex(code), code]))(
      "reads U+%s as a hyphen inside a name: the person goes, alone or after a company",
      (_hex, code) => {
        const dash = cp(code);
        for (const name of [`Casey Sample${dash}Lee`, `Casey${dash}Robin Sample`]) {
          expect(entitiesOf(name)).toEqual([]);
          expect(entitiesOf(`Examplecorp Inc., ${name}`)).toEqual(["Examplecorp Inc."]);
        }
      },
    );

    it("reads these marks: a nickname in single or double marks, and an apostrophe", () => {
      for (const name of [
        `Casey ${cp(0x2018)}Robin${cp(0x2019)} Sample`,
        `Casey O${cp(0x2018)}Sample`,
        `Casey O${cp(0x2019)}Sample`,
        `Casey O${cp(0xb4)}Sample`,
        `Casey ${cp(0xab)}Robin${cp(0xbb)} Sample`,
        `Casey ${cp(0x201e)}Robin${cp(0x201c)} Sample`,
        `Casey ${cp(0x2033)}Robin${cp(0x2033)} Sample`,
        `Casey Sample${cp(0x2012)}Lee`,
        `Casey Sample${cp(0x2014)}Lee`,
        `Casey Sample${cp(0x2212)}Lee`,
      ]) {
        expect(entitiesOf(name)).toEqual([]);
        expect(entitiesOf(`Examplecorp Inc., ${name}`)).toEqual(["Examplecorp Inc."]);
        expect(entitiesOf(`Examplecorp Inc. and ${name}`)).toEqual([]);
      }
    });

    it("reads a U+2018 or U+2019 between two letters as an apostrophe, and at the edge of a word as a quotation mark", () => {
      // An apostrophe stays a letter's neighbour (the legal form SA is no form when it is S'A) ...
      for (const code of [0x2018, 0x2019]) {
        expect(entitiesOf(`Zorbex S${cp(code)}A`)).toEqual([]);
      }
      // ... and a quotation mark round a word is no character: the form shows.
      expect(entitiesOf("Zorbex SA")).toEqual(["Zorbex SA"]);
      expect(entitiesOf(`Zorbex ${cp(0x2018)}SA${cp(0x2019)}`)).toEqual([
        `Zorbex ${cp(0x2018)}SA${cp(0x2019)}`,
      ]);
      expect(entitiesOf(`Zorbex ${cp(0x2019)}SA`)).toEqual([`Zorbex ${cp(0x2019)}SA`]);
      expect(entitiesOf(`Zorbex SA${cp(0x2018)}`)).toEqual([`Zorbex SA${cp(0x2018)}`]);
      // A mark that stands next to another has no letter before it: both are quotation marks, the form shows.
      expect(entitiesOf(`Zorbex ${cp(0x2018)}${cp(0x2018)}SA${cp(0x2019)}${cp(0x2019)}`)).toEqual([
        `Zorbex ${cp(0x2018)}${cp(0x2018)}SA${cp(0x2019)}${cp(0x2019)}`,
      ]);
    });

    it("keeps a name with a quoted word that has a legal form, a digit or an organisation word, as with the straight marks", () => {
      expect(entitiesOf(`Casey ${cp(0xab)}Robin${cp(0xbb)} Sample Inc.`)).toEqual([
        `Casey ${cp(0xab)}Robin${cp(0xbb)} Sample Inc.`,
      ]);
      expect(entitiesOf(`Casey ${cp(0xab)}Robin${cp(0xbb)} Sample 2`)).toEqual([
        `Casey ${cp(0xab)}Robin${cp(0xbb)} Sample 2`,
      ]);
      expect(entitiesOf(`Zorbex ${cp(0x2018)}Quillon${cp(0x2019)} Hotel`)).toEqual([
        `Zorbex ${cp(0x2018)}Quillon${cp(0x2019)} Hotel`,
      ]);
    });

    it("takes the marks off a particle and off a word of legal wording too", () => {
      for (const [open, close] of [
        [0xab, 0xbb],
        [0x2018, 0x2019],
        [0x201e, 0x201c],
        [0x2039, 0x203a],
      ]) {
        expect(entitiesOf(`Casey ${cp(open)}de${cp(close)} Sample`)).toEqual([]);
        expect(entitiesOf(`Examplecorp Inc., ${cp(open)}individually${cp(close)}`)).toEqual([
          "Examplecorp Inc.",
        ]);
      }
    });

    it("folds the acute accent, which NFKC would split into a blank and a combining mark, to an apostrophe", () => {
      const acute = cp(0xb4);
      // The party rule is given the cleaned cell: the blank and the mark are what it sees.
      for (const read of [(name: string) => name, (name: string) => lineOf(name, 300)]) {
        expect(entitiesOf(read(`Casey O${acute}Sample`))).toEqual([]);
        expect(entitiesOf(read(`Sample, O${acute}Casey`))).toEqual([]);
        expect(entitiesOf(read(`Examplecorp Inc., Casey O${acute}Sample`))).toEqual([
          "Examplecorp Inc.",
        ]);
        // A company stores the apostrophe and no blank with a mark.
        expect(entitiesOf(read(`Zorbex${acute}s Inc.`))).toEqual(["Zorbex's Inc."]);
        expect(entitiesOf(read(`Zorbex${acute}s Quillon${acute}s Inc.`))).toEqual([
          "Zorbex's Quillon's Inc.",
        ]);
      }
      expect(entitiesOf(`Casey O ${cp(0x301)}Sample`)).toEqual([]);
    });

    it("leaves the full-width and the small forms to NFKC: they are the ASCII marks when the cell is cleaned", () => {
      for (const code of [0xff0d, 0xfe63]) {
        expect(entitiesOf(lineOf(`Casey Sample${cp(code)}Lee`, 300))).toEqual([]);
      }
      expect(entitiesOf(lineOf(`Casey ${cp(0xff02)}Robin${cp(0xff02)} Sample`, 300))).toEqual([]);
      // U+2033 and U+2036 become two primes, two reversed primes for NFKC.
      for (const code of [0x2033, 0x2036]) {
        expect(entitiesOf(lineOf(`Casey ${cp(code)}Robin${cp(code)} Sample`, 300))).toEqual([]);
      }
    });

    it("never changes the text that it stores: a company keeps its marks as they were written", () => {
      expect(entitiesOf(`Zorbex${cp(0x2019)}s Examplecorp, Inc.`)).toEqual([
        `Zorbex${cp(0x2019)}s Examplecorp, Inc.`,
      ]);
      expect(entitiesOf(`Zorbex ${cp(0xab)}Quillon${cp(0xbb)} Group`)).toEqual([
        `Zorbex ${cp(0xab)}Quillon${cp(0xbb)} Group`,
      ]);
      expect(entitiesOf(`Alpha${cp(0x2013)}Beta Examplecorp, Inc.`)).toEqual([
        `Alpha${cp(0x2013)}Beta Examplecorp, Inc.`,
      ]);
    });
  });

  describe("a dash of any script that separates the head from what follows", () => {
    it.each(DASHES.map((code): [string, number] => [hex(code), code]))(
      "cuts the head at a blank, U+%s and a blank, as it cuts at ' - '",
      (_hex, code) => {
        const dash = cp(code);
        for (const mark of [dash, `${dash}${dash}`, `-${dash}`, `${dash}-`]) {
          expect(entitiesOf(`Examplecorp Inc. ${mark} Casey Sample`)).toEqual(["Examplecorp Inc."]);
          expect(entitiesOf(`Casey Sample ${mark} Examplecorp Inc.`)).toEqual([]);
          expect(entitiesOf(`Examplecorp Inc. ${mark} Casey Sample - Quickexample Inc.`)).toEqual([
            "Examplecorp Inc.",
          ]);
        }
      },
    );

    it("cuts at the dash, ' -- ', ' - ' and ' en dash ', and stores the company before it", () => {
      expect(entitiesOf("Examplecorp Inc. -- Casey Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc. - Casey Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf(`Examplecorp Inc. ${cp(0x2013)} Casey Sample`)).toEqual([
        "Examplecorp Inc.",
      ]);
      expect(entitiesOf(`Examplecorp Inc. ${cp(0x2014)} Casey Sample`)).toEqual([
        "Examplecorp Inc.",
      ]);
      expect(entitiesOf(`Casey Sample ${cp(0x2014)} Examplecorp Inc.`)).toEqual([]);
      expect(entitiesOf(`Casey Sample -- Examplecorp Inc.`)).toEqual([]);
      expect(entitiesOf(`Zzperson Sample ${cp(0x2014)} Zzperson Other`)).toEqual([]);
    });

    it("cuts at the first dash, and the alias marks that stand after it are cut with the rest", () => {
      expect(
        ftcPenaltyPartiesOf(`Examplecorp Inc. ${cp(0x2013)} Casey Sample d/b/a Examplestore`),
      ).toEqual({
        entities: ["Examplecorp Inc."],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf(`Casey Sample ${cp(0x2013)} d/b/a Examplestore`)).toEqual({
        entities: [],
        aliases: [],
      });
    });

    it("is a run of one or two dashes with a blank on each side, and nothing else", () => {
      // A hyphen without blanks, a dash that touches a word, and a run of three are no separator.
      expect(entitiesOf(`Alpha${cp(0x2013)}Beta Examplecorp, Inc.`)).toEqual([
        `Alpha${cp(0x2013)}Beta Examplecorp, Inc.`,
      ]);
      expect(entitiesOf(`Examplecorp Inc. ${cp(0x2013)}Casey Sample`)).toEqual([
        `Examplecorp Inc. ${cp(0x2013)}Casey Sample`,
      ]);
      // The dash that touches the word before it hides the form `Inc.`: the four words are a person's.
      expect(entitiesOf(`Examplecorp Inc.${cp(0x2013)} Casey Sample`)).toEqual([]);
      expect(entitiesOf("Examplecorp Inc. --- Casey Sample")).toEqual([
        "Examplecorp Inc. --- Casey Sample",
      ]);
      // Three dashes read as one word of hyphens, which no person has: the name is kept, as it was.
      expect(entitiesOf("Casey --- Sample")).toEqual(["Casey --- Sample"]);
      // The sign that is no dash (a plus, a slash) is no separator either.
      expect(entitiesOf("Examplecorp Inc. = Casey Sample")).toEqual([
        "Examplecorp Inc. = Casey Sample",
      ]);
    });

    it("reads any white space round the dash, as a blank", () => {
      expect(entitiesOf(`Examplecorp Inc.\t${cp(0x2014)}\tCasey Sample`)).toEqual([
        "Examplecorp Inc.",
      ]);
    });
  });

  describe("a nickname in parentheses, brackets or braces", () => {
    // `Casey (Robin) Sample` was cut at the parenthesis and its head, a bare word, was kept as a
    // brand, with the surname and a company or a d/b/a after the group lost. A group that is a
    // nickname (one or two capitalised words or initials) with a word after it is read as if it
    // were not there for the person test, and the name is judged twice: as it was always read (cut at
    // the parenthesis) and as it is named, and a group stays only if both readings keep it.
    it.each([
      "Casey (Robin) Sample",
      "Casey (Robin Lee) Sample",
      "Casey (R.) Sample",
      "Casey (R) Sample",
      "Casey (ROBIN) Sample",
      "Casey (O'Rob) Sample",
      "Casey (Robin-Lee) Sample",
      `Casey (Robin${cp(0x2013)}Lee) Sample`,
      `Casey (Robin${cp(0x2212)}Lee) Sample`,
      `Casey (Robin${cp(0x2019)}s) Sample`,
      "Casey ( Robin ) Sample",
      "Casey (Robin  Lee) Sample",
      "Casey(Robin)Sample",
      "Casey (Robin) de la Sample",
      "Casey (Robin) Sample Jr.",
      "Casey (Robin) Sample et al",
      "Casey [Robin] Sample",
      "Casey {Robin} Sample",
      "Casey [Robin Lee] Sample",
      "Casey Sample [Robin]",
      "[Robin] Casey Sample",
      "Casey Sample {Robin}",
      "{Robin} Casey Sample",
      "Casey [ Robin ] Sample",
      "Casey (Robin) Sample (Rob) Lee",
      "Casey (Robin) (Rob) Sample",
      "Casey (Robin) [Rob] Sample",
      "Casey (Robin) Sample (the owner)",
      "Casey (Robin) Sample - Examplecorp Inc.",
      "Casey (Robin) Sample (Robin",
    ])("judges %s as the person without the nickname: it is dropped", (name) => {
      expect(entitiesOf(name)).toEqual([]);
    });

    it("drops the nickname's person and keeps the company that stands before it", () => {
      expect(entitiesOf("Examplecorp Inc., Casey (Robin) Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc. / Casey (Robin) Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc.; Casey (Robin) Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Casey (Robin) Sample / Examplecorp Inc.")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc. - Casey (Robin) Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., Casey [Robin] Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., Casey {Robin} Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., Casey (Robin) Sample, individually")).toEqual([
        "Examplecorp Inc.",
      ]);
    });

    it("drops the company that an and joins to the person, as it does without the nickname", () => {
      expect(entitiesOf("Examplecorp Inc. and Casey (Robin) Sample")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., and Casey (Robin) Sample")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc. & Casey (Robin) Sample")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc. + Casey (Robin) Sample")).toEqual([]);
      expect(entitiesOf("Casey (Robin) Sample and Examplecorp Inc.")).toEqual([]);
    });

    it("follows the alias marks as it does without the nickname", () => {
      // A name that goes on under another name is the person's: it is dropped.
      expect(ftcPenaltyPartiesOf("Examplecorp Inc. a/k/a Casey (Robin) Sample")).toEqual({
        entities: ["Examplecorp Inc."],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Examplecorp Inc. f/k/a Casey (Robin) Sample")).toEqual({
        entities: ["Examplecorp Inc."],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Examplecorp Inc. d/b/a Casey (Robin) Sample")).toEqual({
        entities: ["Examplecorp Inc."],
        aliases: [],
      });
      // The business that a person does business as is promoted.
      expect(ftcPenaltyPartiesOf("Casey (Robin) Sample d/b/a Examplestore")).toEqual({
        entities: ["Examplestore"],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Casey (Robin) Sample dba Examplestore")).toEqual({
        entities: ["Examplestore"],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Casey (Robin) Sample trading as Examplestore")).toEqual({
        entities: ["Examplestore"],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Casey [Robin] Sample d/b/a Examplestore")).toEqual({
        entities: ["Examplestore"],
        aliases: [],
      });
      // The name that the person goes by is the person's.
      expect(ftcPenaltyPartiesOf("Casey (Robin) Sample a/k/a Examplestore")).toEqual({
        entities: [],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Casey (Robin) Sample f/k/a Examplestore")).toEqual({
        entities: [],
        aliases: [],
      });
    });

    it("stores a company that follows the person after a comma, as it does without the nickname", () => {
      expect(entitiesOf("Casey (Robin) Sample, Examplecorp Inc.")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Casey (Robin) Sample, individually, Examplecorp Inc.")).toEqual([]);
    });

    it("reads a parenthesis that is no nickname as it always was: cut, and the head judged alone", () => {
      for (const name of [
        "Casey (the owner) Sample",
        "Casey (Robin the owner) Sample",
        "Casey (Robin Lee Roe) Sample",
        "Casey (Robin 2) Sample",
        "Casey (2) Sample",
        "Casey (Robin, Rob) Sample",
        "Casey (Robin/Rob) Sample",
        "Casey (Robin; Rob) Sample",
        `Casey (${cp(0x201c)}Robin${cp(0x201d)}) Sample`,
        "Casey (robin) Sample",
        "Casey (rOBIN) Sample",
        "Casey () Sample",
        "Casey ( ) Sample",
        "Casey (Robin Sample",
        "Casey ((Robin)) Sample",
        "Casey (Robin (Rob)) Sample",
        "Casey (Robin & Rob) Sample",
      ]) {
        expect(entitiesOf(name)).toEqual(["Casey"]);
      }
    });

    it("reads a nickname after a text of one character, and any white space round it as a blank", () => {
      expect(entitiesOf("C (Robin) Sample")).toEqual([]);
      for (const name of [
        "Casey (Robin)\tSample",
        "Casey\t(Robin) Sample",
        "Casey\t(Robin)\t\tSample",
        "Casey (Robin) \t (Rob)\tSample",
      ]) {
        expect(entitiesOf(name)).toEqual([]);
      }
    });

    it("cuts a parenthesis that begins the name, with all that follows it, as it was always cut", () => {
      expect(entitiesOf("(Robin) Casey, Examplecorp Inc.")).toEqual([]);
      expect(entitiesOf("(Robin) Casey Sample, Examplecorp Inc.")).toEqual([]);
      expect(entitiesOf("\t(Robin) Casey, Examplecorp Inc.")).toEqual([]);
    });

    it("cuts a nickname that no word follows, and reads nothing that stands after it", () => {
      for (const name of [
        "Casey (Robin), Examplecorp Inc.",
        "Casey (Robin) / Examplecorp Inc.",
        "Casey (Robin); Examplecorp Inc.",
        "Casey (Robin) 2, Examplecorp Inc.",
        "Casey (Robin) &, Examplecorp Inc.",
        "Casey (Robin) -, Examplecorp Inc.",
        "Casey (Robin) (the owner), Examplecorp Inc.",
        "Casey (Robin) Inc., Examplecorp Inc.",
        "Casey (Robin) Holdings, Examplecorp Inc.",
        "Casey (Robin) Holdings/Examplecorp Inc.",
        "Casey (Robin) Holdings(Rob) Sample, Examplecorp Inc.",
        "Casey (Robin) dba",
        "Casey (Robin) aka",
        "Casey (Robin) d/b/a",
        "Casey (Robin) a/k/a",
        "Casey (Robin) t/a",
        "Casey (Robin) D/B/A",
      ]) {
        expect(entitiesOf(name)).toEqual(["Casey"]);
      }
    });

    it("never stores the legal form that follows the group of a nickname: it belongs to what the parenthesis cut off", () => {
      expect(entitiesOf("Casey (Robin) Sample, LLC")).toEqual(["Casey"]);
      expect(entitiesOf("Casey (Robin) Sample, Inc.")).toEqual(["Casey"]);
    });

    it("never reads a group more loosely for a bracket that holds a nickname: the shape as it was written still drops", () => {
      expect(entitiesOf("Sample, [Robin]")).toEqual([]);
      expect(entitiesOf("Sample, {Robin}")).toEqual([]);
    });

    it("stores a group as the name writes it, with the join that begins it", () => {
      expect(entitiesOf("Examplecorp Inc., and Zorbex (Robin) Brightzorb Holdings")).toEqual([
        "Examplecorp Inc., and Zorbex",
      ]);
    });

    it("judges every group that a parenthesis cuts as it is written: a second nickname never lets a person through", () => {
      // The text of every such group is stored cut at its parenthesis, so it is judged cut: `Mary Ann`
      // is a person, and the five words that follow it have no shape.
      expect(entitiesOf("Casey (Robin) Sample, Mary Ann (Rob) Casey Lee Sample")).toEqual([]);
      expect(
        entitiesOf("Casey (Robin) Sample, Examplecorp Inc., Mary Ann (Rob) Casey Lee Sample"),
      ).toEqual(["Examplecorp Inc."]);
      // Every cut group is a bare word as it is stored, and two bare words in a row are the shape Last,
      // First: the company of a later cut group is lost with the person, the cost of the rule.
      expect(entitiesOf("Casey (Robin) Sample, Zorbex (Robin) Brightzorb Holdings")).toEqual([]);
      expect(
        entitiesOf("Casey (Robin) Sample, Zorbex (Robin) Brightzorb Holdings, Examplecorp Inc."),
      ).toEqual(["Examplecorp Inc."]);
    });

    it("judges a group that follows the last cut as it is stored too: a bracket after a join never lets a person through", () => {
      // The bracket is left out of the name, which leaves the join at the end of the group (`Mary Ann
      // and`); what is stored is the group as it is written, with the bracket, and is judged so.
      for (const name of [
        "Casey (Robin) Sample, Mary Ann and [Robin]",
        "Casey (Robin) Sample, Mary Ann & [Robin]",
        "Casey (Robin) Sample, Mary Ann + [Robin]",
        "Casey (Robin) Sample, Mary Ann and {Robin}",
      ]) {
        expect(entitiesOf(name)).toEqual([]);
      }
      expect(entitiesOf("Casey (Robin) Sample, Examplecorp Inc., Mary Ann and [Robin]")).toEqual([
        "Examplecorp Inc.",
      ]);
      expect(entitiesOf("Casey (Robin) Sample, Examplecorp Inc. and [Robin]")).toEqual([
        "Examplecorp Inc. and [Robin]",
      ]);
    });

    it("keeps the real shape of the list: a one-word head, a parenthesis with lower-case words, two words", () => {
      expect(entitiesOf("QuiZorTallowcorpx (an example of words) Casey Sample")).toEqual([
        "QuiZorTallowcorpx",
      ]);
      expect(entitiesOf("QuiZorTallowcorpx (an Example of Words) Casey Sample")).toEqual([
        "QuiZorTallowcorpx",
      ]);
    });

    it("leaves a nickname alone when no word follows it: the head is the name, as it was", () => {
      for (const name of [
        "Casey (Robin)",
        "Casey (Robin) ",
        "Casey (Robin), Sample",
        "Casey (Robin) , Sample",
        "Casey (Robin) / Sample",
        "Casey (Robin); Sample",
        "Casey (Robin) - Sample",
        "Casey (Robin) 2",
        "Casey (Robin) 2 Sample",
        "Casey (Robin) (the owner) Sample",
        "Casey (Robin) (Rob)",
        "Casey (Robin) &",
        "Casey (Robin) +",
        "Casey (Robin) (",
      ]) {
        expect(entitiesOf(name)).toEqual(["Casey"]);
      }
    });

    it("leaves a nickname alone when an alias mark or a legal form is the word that follows it", () => {
      for (const name of [
        "Casey (Robin) d/b/a Examplestore",
        "Casey (Robin) dba Examplestore",
        "Casey (Robin) a/k/a Sample",
        "Casey (Robin) aka Sample",
        "Casey (Robin) f/k/a Sample",
        "Casey (Robin) n/k/a Sample",
        "Casey (Robin) t/a Sample",
        "Casey (Robin) doing business as Sample",
        "Casey (Robin) trading as Sample",
        "Casey (Robin) Inc. Sample",
        "Casey (Robin) LLC Sample",
        "Casey (Robin) Holdings Sample",
        "Casey (Robin) Group Sample",
        "Casey (Robin) D/B/A Examplestore",
        "Casey (Robin) DBA Examplestore",
        "Casey (Robin) A/K/A Sample",
        "Casey (Robin) Doing Business As Sample",
        "Casey (Robin) TRADING AS Sample",
      ]) {
        expect(ftcPenaltyPartiesOf(name)).toEqual({ entities: ["Casey"], aliases: [] });
      }
      expect(entitiesOf("Zorbex (USA) Inc.")).toEqual(["Zorbex"]);
      expect(entitiesOf("Zorbex (USA) Holdings")).toEqual(["Zorbex"]);
      expect(entitiesOf("Zorbex (USA), Inc.")).toEqual(["Zorbex"]);
    });

    it("reads a word that only begins as an alias mark or a legal form as a word", () => {
      expect(entitiesOf("Casey (Robin) Dbaworks")).toEqual([]);
      expect(entitiesOf("Casey (Robin) Incorporation")).toEqual([]);
      expect(entitiesOf("Casey (Robin) Akasample")).toEqual([]);
    });

    it("needs a word before the parenthesis: a group that begins the name or a part is cut, as it was", () => {
      expect(entitiesOf("(Brandname) Examplecorp, Inc.")).toEqual([]);
      expect(entitiesOf("(Robin) Casey Sample")).toEqual([]);
      expect(entitiesOf("  (Robin) Casey Sample")).toEqual([]);
      expect(entitiesOf("; (Robin) Casey Sample")).toEqual([]);
      // After a comma, a slash or a semicolon the group is cut with what follows it in its part.
      expect(entitiesOf("Examplecorp Inc., (Robin) Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc. / (Robin) Sample")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc.; (Robin) Sample")).toEqual(["Examplecorp Inc."]);
    });

    it("never reads a firm that is one word, a nickname and a word as a company: the shape is a person's, the cost of the rule", () => {
      expect(entitiesOf("Zorbex (Robin) Brightzorb")).toEqual([]);
      expect(entitiesOf("Zorbex (USA) Brightzorb")).toEqual([]);
      expect(entitiesOf("Zorbex [USA] Brightzorb")).toEqual([]);
    });

    it("keeps what it kept for a company, whatever its words are, when the name as it is named is no person", () => {
      // The legal form wins when the two readings are one name, and the text that is stored is the
      // head: nothing of what follows the parenthesis is ever stored.
      expect(entitiesOf("Zorbex (Robin) Brightzorb Holdings")).toEqual(["Zorbex"]);
      expect(entitiesOf("Zorbex (Robin) Brightzorb, Inc.")).toEqual(["Zorbex"]);
      expect(entitiesOf("Zorbex (Robin) Brightzorb Examplecorp Inc.")).toEqual(["Zorbex"]);
      expect(entitiesOf("Zorbex (Robin) Brightzorb Hotel")).toEqual(["Zorbex"]);
      expect(entitiesOf("Zorbex (Robin) Alpha Beta Gamma Delta")).toEqual(["Zorbex"]);
      expect(entitiesOf("Examplecorp Inc., Zorbex (Robin) Brightzorb Holdings")).toEqual([
        "Examplecorp Inc., Zorbex",
      ]);
      expect(entitiesOf("Examplecorp Inc. and Zorbex (Robin) Brightzorb Holdings")).toEqual([
        "Examplecorp Inc. and Zorbex",
      ]);
      // Brackets are never cut: a firm with a bracketed brand and its legal form is stored whole.
      expect(entitiesOf("Examplecorp [Brandname] Inc.")).toEqual(["Examplecorp [Brandname] Inc."]);
      expect(entitiesOf("Examplecorp {Brandname} Inc.")).toEqual(["Examplecorp {Brandname} Inc."]);
      expect(entitiesOf("Examplecorp [the brand] Inc.")).toEqual(["Examplecorp [the brand] Inc."]);
    });

    it("drops what a reading as it was written drops, even when the name as it is named is no person", () => {
      // The head `Mary Ann` is a person's, and the five words that follow the nickname have no
      // shape: the party was dropped and stays dropped.
      expect(entitiesOf("Mary Ann (Robin) Casey Lee Sample")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., Mary Ann (Robin) Casey Lee Sample")).toEqual([
        "Examplecorp Inc.",
      ]);
      // The head `Alpha, Beta` is the Last, First shape of two brands: dropped whole, by design.
      expect(entitiesOf("Alpha, Beta (Robin) Gamma Delta Epsilon Zeta")).toEqual([]);
      // The head `Sample Lee, Casey` is a surname and a given name.
      expect(entitiesOf("Sample Lee, Casey (Robin) Roe Foo Bar Baz")).toEqual([]);
    });

    it("judges a nickname inside the surname, the given name and the legal wording", () => {
      expect(entitiesOf("Sample (Robin) Lee, Casey")).toEqual([]);
      expect(entitiesOf("Sample Lee (Robin) Roe, Casey")).toEqual([]);
      expect(entitiesOf("Sample, Casey (Robin) Lee")).toEqual([]);
      expect(entitiesOf("Estate of Casey (Robin) Sample")).toEqual([]);
      expect(entitiesOf("Casey (Robin) Sample, individually")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., Casey (Robin) Sample, individually")).toEqual([
        "Examplecorp Inc.",
      ]);
    });

    it("never splits a nickname at an alias mark: the words in it stay in it", () => {
      for (const name of [
        "Casey ( Aka Dba ) Sample",
        "Casey (Aka Dba) Sample",
        "Casey ( Aka ) Sample",
        "Casey ( Dba ) Sample",
        "Casey [ Aka Dba ] Sample",
        "Casey { Aka Dba } Sample",
      ]) {
        expect(ftcPenaltyPartiesOf(name)).toEqual({ entities: [], aliases: [] });
      }
    });

    it("reads brackets and braces as nicknames, and stores them as they were written", () => {
      expect(entitiesOf("Zorbex [Robin] Inc.")).toEqual(["Zorbex [Robin] Inc."]);
      // Only the blanks next to the marks go: an alias mark in a nickname can never split it.
      expect(entitiesOf("Zorbex [ Robin ] Inc.")).toEqual(["Zorbex [Robin] Inc."]);
      // A bracket is never cut, whatever it holds: only a nickname in it is left out of the judging.
      expect(entitiesOf("Casey [the owner] Sample")).toEqual(["Casey [the owner] Sample"]);
    });
  });

  describe("an estate in any position", () => {
    it.each([
      "Executor of the Estate of Casey Sample",
      "as Executrix of the Estate of Casey Sample",
      "Personal Representative of the Estate of Casey Sample",
      "In re Estate of Casey Sample",
      "In re: Estate of Casey Sample",
      "Casey Sample, Executor of the Estate of Robin Sample",
      "Robin Sample Executor of the ESTATE OF Casey Sample",
      "Executor of the Estate   of Casey Sample",
      "Executor of the Estate of",
      "The Casey Sample Estate",
      "Casey Sample Estate",
      "The Sample Family Estate",
      "The Casey Sample Estate.",
      `The Casey Sample ${cp(0xab)}Estate${cp(0xbb)}`,
      "the casey sample estate",
      "THE SAMPLE ESTATE",
      "Group Estate",
    ])("reads %s as an estate, a person's: it is dropped", (name) => {
      expect(entitiesOf(name)).toEqual([]);
    });

    it("keeps the company that stands before the estate", () => {
      expect(
        entitiesOf("Examplecorp Inc., Personal Representative of the Estate of Robin Sample"),
      ).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc. / In re Estate of Casey Sample")).toEqual([
        "Examplecorp Inc.",
      ]);
      expect(entitiesOf("Examplecorp Inc., The Casey Sample Estate")).toEqual(["Examplecorp Inc."]);
    });

    it("drops the company that an and joins to the estate, as it drops one that is joined to a person", () => {
      expect(entitiesOf("Examplecorp Inc. and Executor of the Estate of Casey Sample")).toEqual([]);
      expect(entitiesOf("Examplecorp Inc., and The Casey Sample Estate")).toEqual([]);
    });

    it("reads an Estate of in the middle of a name as an estate, whatever the name holds, the cost of the rule", () => {
      expect(entitiesOf("Zorbex Estate of Example Inc.")).toEqual([]);
      expect(entitiesOf("Zorbex Real Estate of Examplestate LLC")).toEqual([]);
    });

    it("reads an estate only as two words, or as the last word of a name of more than one", () => {
      expect(entitiesOf("Estate")).toEqual(["Estate"]);
      expect(entitiesOf("Estates")).toEqual(["Estates"]);
      expect(entitiesOf("Estateofcorp Inc.")).toEqual(["Estateofcorp Inc."]);
      expect(entitiesOf("Real Estate Inc.")).toEqual(["Real Estate Inc."]);
      expect(entitiesOf("Zorbex Estate Offices Inc.")).toEqual(["Zorbex Estate Offices Inc."]);
      expect(entitiesOf("Zorbex Estates of Example Inc.")).toEqual([
        "Zorbex Estates of Example Inc.",
      ]);
      expect(entitiesOf("Zorbex Estateof Example Inc.")).toEqual(["Zorbex Estateof Example Inc."]);
      expect(entitiesOf("Zorbex Real-Estate of Example Inc.")).toEqual([
        "Zorbex Real-Estate of Example Inc.",
      ]);
    });

    it("leaves a named trust to the company words that it holds: a residual, with the trustee form", () => {
      expect(entitiesOf("Robin Sample Revocable Trust")).toEqual(["Robin Sample Revocable Trust"]);
      expect(entitiesOf("The Robin Sample Family Trust")).toEqual([
        "The Robin Sample Family Trust",
      ]);
      expect(entitiesOf("Casey Sample, as Trustee of the Sample Family Trust")).toEqual([
        "as Trustee of the Sample Family Trust",
      ]);
    });
  });

  describe("a given name that carries a legal form", () => {
    // `Sample Lee, Casey, LLC` is the shape `Last, First` with a legal form after the given name: the
    // legal form is merged into the group of the given name, which made the group of two words and
    // no bare word, so that the cut of the given name and of what follows it never happened.
    it.each([
      "Sample Lee, Casey, LLC",
      "Van Sample, Casey, LLC",
      "Sample Jr., Casey, Inc.",
      "Estate of Sample Lee, Casey, LLC",
      "Casey Sample, Robin, LLC",
      "Sample Lee, Casey, Inc., Examplecorp Inc.",
      "Zorbex Lee, Quillon, Inc.",
      "Sample Lee, Casey, L.L.C.",
      "Sample Lee, Casey, Ltd.",
      "Sample Lee, Casey, Corp.",
      "Sample Lee, Casey, Co.",
      "Sample Lee, Casey, Incorporated",
      "de la Sample Lee, Casey, Inc.",
      "Sample Lee, Casey, Inc., and Examplecorp Inc.",
      "Sample Lee, Casey, Inc., individually",
      "Sample Lee, Casey and Examplecorp, Inc.",
      "Casey Sample, Examplecorp, Inc.",
    ])("drops %s whole: the given name, its legal form and what follows go", (name) => {
      expect(entitiesOf(name)).toEqual([]);
    });

    it("keeps the company that stands before the person", () => {
      expect(entitiesOf("Examplecorp Inc., Sample Lee, Casey, LLC")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Examplecorp Inc., Sample Lee, Casey, Inc., Quickexample Inc.")).toEqual([
        "Examplecorp Inc.",
      ]);
    });

    it("drops only its own party: the other parties of the segment stay", () => {
      expect(entitiesOf("Sample Lee, Casey, LLC / Examplecorp Inc.")).toEqual(["Examplecorp Inc."]);
      expect(entitiesOf("Sample Lee, Casey, LLC; Examplecorp Inc.")).toEqual(["Examplecorp Inc."]);
    });

    it("stores nothing of a firm named as a list: the front cut of its name is refused, as it is without the legal form", () => {
      // `Quillon, Inc.` would be a name with its front cut off, a key that can match another vendor.
      const { entities, aliases } = ftcPenaltyPartiesOf("Zorbex Lee, Quillon, Inc.");
      expect(entities).toEqual([]);
      expect(aliases).toEqual([]);
    });

    it("leaves the shape of a bare surname as it was: the whole text stays, with no front cut", () => {
      expect(entitiesOf("Sample, Casey, LLC")).toEqual(["Sample, Casey, LLC"]);
      expect(entitiesOf("Sample, Casey, Inc.")).toEqual(["Sample, Casey, Inc."]);
    });

    it("leaves a group of two words or more after a person alone: a company with its legal form stays", () => {
      expect(entitiesOf("Sample Lee, Casey Examplecorp, LLC")).toEqual(["Casey Examplecorp, LLC"]);
      expect(entitiesOf("Casey Sample, Examplecorp Inc.")).toEqual(["Examplecorp Inc."]);
    });
  });

  describe("the principal and the alias parties", () => {
    it("split the head at d/b/a, f/k/a, a/k/a, dba and aka, in any case", () => {
      expect(
        ftcPenaltyPartiesOf("Examplecorp, Inc. f/k/a Oldname Inc. a/k/a ExampleAlias"),
      ).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: ["Oldname Inc.", "ExampleAlias"],
      });
      expect(ftcPenaltyPartiesOf("Examplecorp, Inc. DBA ExampleOne")).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: ["ExampleOne"],
      });
      expect(ftcPenaltyPartiesOf("Examplecorp, Inc. aka ExampleTwo")).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: ["ExampleTwo"],
      });
      expect(ftcPenaltyPartiesOf("Examplecorp, Inc. D/B/A ExampleThree")).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: ["ExampleThree"],
      });
    });

    it("read a d/b/a only when blanks stand round it", () => {
      expect(ftcPenaltyPartiesOf("Alphadbacorp, Inc.")).toEqual({
        entities: ["Alphadbacorp, Inc."],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Examplecorp, Inc./ExampleOne")).toEqual({
        entities: ["Examplecorp, Inc.", "ExampleOne"],
        aliases: [],
      });
    });

    it("split the head at doing business as, trading as and t/a as at d/b/a, in any case", () => {
      for (const mark of [
        "doing business as",
        "trading as",
        "t/a",
        "Doing Business As",
        "TRADING AS",
        "T/A",
        "doing  business   as",
        "trading   as",
      ]) {
        expect(ftcPenaltyPartiesOf(`Examplecorp, Inc. ${mark} ExampleOne`)).toEqual({
          entities: ["Examplecorp, Inc."],
          aliases: ["ExampleOne"],
        });
      }
    });

    it("promote the business of a person who does business as, trades as or t/a it, as for d/b/a", () => {
      for (const mark of [
        "d/b/a",
        "doing business as",
        "trading as",
        "t/a",
        "doing  business   as",
        "trading   as",
        "Doing Business As",
        "TRADING AS",
      ]) {
        const promoted = { entities: ["Examplecorp"], aliases: [] };
        expect(ftcPenaltyPartiesOf(`Casey Sample ${mark} Examplecorp`)).toEqual(promoted);
        expect(ftcPenaltyPartiesOf(`Casey Sample, ${mark} Examplecorp`)).toEqual(promoted);
      }
    });

    it("drop the persons among the aliases of these marks, as among those of d/b/a", () => {
      expect(ftcPenaltyPartiesOf("Examplecorp, Inc. doing business as Casey Sample")).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Casey Sample t/a Robin Sample")).toEqual({
        entities: [],
        aliases: [],
      });
    });

    it("read these marks only with blanks round the words, never inside a word", () => {
      expect(ftcPenaltyPartiesOf("Examplecorp Trading Assets Inc.")).toEqual({
        entities: ["Examplecorp Trading Assets Inc."],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Examplecorp Doing Business Assets Inc.")).toEqual({
        entities: ["Examplecorp Doing Business Assets Inc."],
        aliases: [],
      });
      expect(ftcPenaltyPartiesOf("Tradingas Inc.")).toEqual({
        entities: ["Tradingas Inc."],
        aliases: [],
      });
    });

    it("promote the first alias party when the principal parties are all dropped", () => {
      expect(ftcPenaltyPartiesOf("Casey Sample d/b/a Examplestore.com a/k/a ExampleShop")).toEqual({
        entities: ["Examplestore.com"],
        aliases: ["ExampleShop"],
      });
    });

    it("drop the persons among the alias parties, as among the principal ones", () => {
      expect(ftcPenaltyPartiesOf("Examplecorp, Inc. d/b/a Casey Sample")).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: [],
      });
    });

    it("count every kept principal party as an entity, and the aliases belong to the first", () => {
      expect(ftcPenaltyPartiesOf("Alphacorp, Inc. / Betacorp LLC d/b/a ExampleCall")).toEqual({
        entities: ["Alphacorp, Inc.", "Betacorp LLC"],
        aliases: ["ExampleCall"],
      });
    });

    it.each(["a/k/a", "aka", "f/k/a", "n/k/a", "A/K/A", "AKA", "F/K/A", "N/K/A"])(
      "drop the names of a person that goes by %s, whatever they are: they name the same person",
      (mark) => {
        for (const alias of ["Robin", "Sampleton", "Robin Quillon", "Zorbex Inc."]) {
          expect(ftcPenaltyPartiesOf(`Casey Sample ${mark} ${alias}`)).toEqual({
            entities: [],
            aliases: [],
          });
        }
      },
    );

    it("promote the business of a dropped person from a d/b/a, a dba, a t/a, a doing business as and a trading as only", () => {
      for (const mark of ["d/b/a", "dba", "DBA", "t/a", "doing business as", "trading as"]) {
        expect(ftcPenaltyPartiesOf(`Casey Sample ${mark} Examplecorp`)).toEqual({
          entities: ["Examplecorp"],
          aliases: [],
        });
      }
    });

    it("drop the other name of a person and promote the business that follows it", () => {
      for (const text of [
        "Casey Sample aka Robin d/b/a Examplecorp",
        "Casey Sample f/k/a Sampleton t/a Examplecorp",
        "Casey Sample a/k/a Robin Quillon doing business as Examplecorp",
        "Casey Sample n/k/a Sampleton trading as Examplecorp",
      ]) {
        expect(ftcPenaltyPartiesOf(text)).toEqual({ entities: ["Examplecorp"], aliases: [] });
      }
    });

    it("keep the name that follows a business that is promoted: it is the business's, as before", () => {
      expect(ftcPenaltyPartiesOf("Casey Sample d/b/a Examplestore.com f/k/a OldShop")).toEqual({
        entities: ["Examplestore.com"],
        aliases: ["OldShop"],
      });
      expect(
        ftcPenaltyPartiesOf("Casey Sample d/b/a Examplecorp aka Zorbex d/b/a Otherbiz"),
      ).toEqual({ entities: ["Examplecorp"], aliases: ["Zorbex", "Otherbiz"] });
    });

    it("drop the name that follows a business that is dropped, as it follows a person", () => {
      expect(ftcPenaltyPartiesOf("Casey Sample d/b/a Robin Sample aka Zorbex")).toEqual({
        entities: [],
        aliases: [],
      });
    });

    it("drop the name that follows a business that is dropped, even when a business that stays comes first", () => {
      expect(
        ftcPenaltyPartiesOf("Casey Sample d/b/a Examplecorp d/b/a Robin Sample aka Zorbex"),
      ).toEqual({ entities: ["Examplecorp"], aliases: [] });
      expect(
        ftcPenaltyPartiesOf("Casey Sample d/b/a Examplecorp d/b/a Robin Sample d/b/a Otherbiz"),
      ).toEqual({ entities: ["Examplecorp"], aliases: ["Otherbiz"] });
    });

    it("read n/k/a as a mark, as a/k/a is: a business that stays keeps the name it is now known by as an alias", () => {
      for (const text of [
        "Examplecorp, Inc. n/k/a Newname Inc.",
        "Examplecorp, Inc. N/K/A Newname Inc.",
      ]) {
        expect(ftcPenaltyPartiesOf(text)).toEqual({
          entities: ["Examplecorp, Inc."],
          aliases: ["Newname Inc."],
        });
      }
    });

    it("keep the aliases of a business that stays beside a person, whatever the mark", () => {
      expect(ftcPenaltyPartiesOf("Casey Sample / Examplecorp Inc. aka Robin")).toEqual({
        entities: ["Examplecorp Inc."],
        aliases: ["Robin"],
      });
      expect(
        ftcPenaltyPartiesOf("Examplecorp, Inc. f/k/a Oldname Inc. a/k/a ExampleAlias"),
      ).toEqual({
        entities: ["Examplecorp, Inc."],
        aliases: ["Oldname Inc.", "ExampleAlias"],
      });
    });
  });

  describe("hostile names", () => {
    const timed = (name: string): number => {
      const start = Date.now();
      ftcPenaltyPartiesOf(name);
      return Date.now() - start;
    };

    it("are read in no time, whatever they hold, as long as the cell was cut at 300", () => {
      for (const name of [
        ";".repeat(300),
        " ".repeat(300),
        "/".repeat(300),
        ", ".repeat(150),
        "a ".repeat(150),
        "et al ".repeat(50),
        " - ".repeat(100),
        "d/b/a ".repeat(50),
        "( ".repeat(150),
        "and ".repeat(75),
        "AND ".repeat(75),
        "+ ".repeat(150),
        "y ".repeat(150),
        "de la ".repeat(50),
        "t/a ".repeat(75),
        "doing business as ".repeat(17),
        "trading as ".repeat(27),
        "estate of ".repeat(30),
        "aka ".repeat(75),
        "n/k/a ".repeat(50),
        "Sample Lee, Casey, ".repeat(15),
        "Casey and ".repeat(30),
        "Estate of Casey, ".repeat(17),
        "`".repeat(300),
        cp(0x2010).repeat(300),
        cp(0x201c).repeat(300),
        `Casey ${cp(0x201c)}Robin${cp(0x201d)} Sample `.repeat(12),
        "individually, ".repeat(21),
        "individually ".repeat(23),
        ".".repeat(300),
        '"'.repeat(300),
      ]) {
        expect(timed(name)).toBeLessThan(10_000);
      }
    });

    // The rules that read a nickname, a dash, a mark, an estate and a given name with a legal form are
    // linear: the cell is cut at 300 units, and a name of a megabyte that is given to the rule as it
    // is takes the time of a pass over it. The bound is the floor of the lists, not a measure.
    it("are read in time whatever the nickname, dash, mark, estate and given-name rules read, at the cap and at a megabyte", () => {
      const MEGABYTE = 1_000_000;
      const repeated = (unit: string, size: number): string =>
        unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
      const shapes: Array<(size: number) => string> = [
        (size) => "(".repeat(size),
        (size) => ")".repeat(size),
        (size) => repeated("(A)", size),
        (size) => repeated("(A) ", size),
        (size) => repeated("x (A) y ", size),
        (size) => repeated("x (A) , ", size),
        (size) => repeated("Casey (Robin) Sample, ", size),
        (size) => repeated("Casey (Robin) Sample et al / ", size),
        (size) => `x (${"A".repeat(size)}) y`,
        (size) => `x (${"A".repeat(size)}`,
        (size) => `x (A${" ".repeat(size)}) y`,
        (size) => `x (${repeated("A ", size)}`,
        (size) => repeated("x (A ", size),
        (size) => repeated("[A] ", size),
        (size) => repeated("{A} B ", size),
        (size) => repeated("(A)[B]{C} ", size),
        (size) => repeated("x (A) d/b/a y ", size),
        (size) => repeated("x ( Aka Dba ) y ", size),
        (size) => repeated(" - ", size),
        (size) => repeated(` ${cp(0x2013)} `, size),
        (size) => repeated(" -- ", size),
        (size) => "-".repeat(size),
        (size) => `x ${cp(0x2014).repeat(size)} y`,
        (size) => cp(0x2018).repeat(size),
        (size) => repeated(`a${cp(0x2018)}`, size),
        (size) => repeated(`${cp(0xab)}${cp(0xbb)}`, size),
        (size) => cp(0x2033).repeat(size),
        (size) => cp(0xb4).repeat(size),
        (size) => repeated(` ${cp(0x301)}`, size),
        (size) => repeated("estate of ", size),
        (size) => repeated("estate ", size),
        (size) => `${repeated("Casey ", size)} Estate`,
        (size) => repeated("Sample Lee, Casey, LLC, ", size),
        (size) => repeated("Casey, LLC, ", size),
        (size) => repeated("Casey (Robin) Sample, Mary Ann (Rob) Casey Lee Sample, ", size),
        (size) => repeated("Casey (Robin) Sample, Mary Ann and [Robin], ", size),
        (size) => repeated("Zorbex (Robin) Brightzorb Holdings, ", size),
        (size) => repeated("Zorbex [Robin] Inc., ", size),
        (size) => `Casey (Robin) Sample${repeated(", Roe (Rob) Foo", size)}`,
      ];
      for (const shape of shapes) {
        for (const size of [300, MEGABYTE]) {
          const name = shape(size);
          const start = Date.now();
          ftcPenaltyPartiesOf(name);
          expect(Date.now() - start).toBeLessThan(10_000);
        }
      }
    }, 120_000);
  });
});

const EXAMPLE_ROWS: CaseRow[] = [
  caseRow({
    number: "X100001",
    name: "Examplecorp, Inc.",
    amount: 1_000_000,
    date: "2024-03-05",
    basis: "Violations of the Examplerule Act",
  }),
  caseRow({
    number: "X100001",
    name: "Examplecorp, Inc.",
    amount: 2_500_000,
    date: "2024-03-05",
    basis: "Violations of the Examplerule Act",
  }),
  caseRow({
    number: "X100002",
    name: "Examplecorp, Inc.",
    amount: " -",
    date: "2019-11-20",
    basis: "Violations of an Example Order",
  }),
];

/** The newest day of the rows of a test. */
const newestDayOf = (rows: readonly CaseRow[]): string =>
  rows
    .map((row) => row.date)
    .filter((date): date is string => typeof date === "string")
    .sort()
    .slice(-1)[0];

describe("the workbook", () => {
  describe("the list as a whole", () => {
    it("gives one entity for each defendant company, sorted by its id, with the count of the rows", async () => {
      const { body } = await run(withFillers(...EXAMPLE_ROWS));
      expect(body.v).toBe(1);
      expect(body.total).toBe(313);
      expect(body.unreadable).toBe(0);
      expect(body.rows).toHaveLength(311);
      const ids = body.rows.map((row) => row.id);
      expect(ids).toEqual([...ids].sort());
      expect(ids).toContain("examplecorp");
      expect(ids).toContain("fillerco0000");
    });

    it("keeps for an entity its orders, years, total, newest orders, case numbers and newest day", async () => {
      const { body } = await run(withFillers(...EXAMPLE_ROWS));
      expect(rowOf(body, "examplecorp")).toEqual({
        id: "examplecorp",
        display: "Examplecorp, Inc.",
        names: ["Examplecorp, Inc."],
        orders: 2,
        firstYear: 2019,
        lastYear: 2024,
        total: 2_500_000,
        noAmount: 1,
        newest: [
          {
            caseNumber: "X100001",
            day: "2024-03-05",
            amount: 2_500_000,
            basis: "Violations of the Examplerule Act",
          },
          {
            caseNumber: "X100002",
            day: "2019-11-20",
            amount: null,
            basis: "Violations of an Example Order",
          },
        ],
        cases: ["X100001", "X100002"],
        publishedAt: "2024-03-05",
      });
    });

    it("gives the root of the list, no error and the newest day of the list as its version", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      const { parsed } = await run(rows);
      expect(parsed.root).toBe(SHEET_NAME);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.sourceVersion).toBe(newestDayOf(rows));
    });

    it("never gives a total below the entities and the unreadable rows, when the rows name several companies", async () => {
      // 311 rows of the sheet make 620 entities and one row that cannot be read: the kit refuses a
      // body whose total is below what it holds, so the total is what the body holds, at least.
      const pairs = fillerRows(310).map((row, at) => ({
        ...row,
        name: `Pairone${String(at).padStart(4, "0")} Corp / Pairtwo${String(at).padStart(4, "0")} Corp`,
      }));
      const rows = [...pairs, caseRow({ name: "Badnumberco, Inc.", number: "not a number" })];
      const { body, parsed } = await run(rows);
      expect(body.rows).toHaveLength(620);
      expect(body.unreadable).toBe(1);
      expect(body.total).toBe(621);
      expect(parsed.records).toHaveLength(620);
      expect(parsed.errors).toBe(0);
      // Where the rows are fewer than what they hold, the total is the rows of the sheet.
      const { body: plain } = await run(withFillers(...EXAMPLE_ROWS));
      expect(plain.total).toBe(313);
    });

    it("does not read the footer as a record", async () => {
      const { body, parsed } = await run(withFillers(...EXAMPLE_ROWS));
      for (const row of body.rows) {
        expect(row.display).not.toBe("313");
        expect(row.names).not.toContain("313");
      }
      expect(parsed.records.some((record) => record.title.includes("313"))).toBe(false);
    });
  });

  describe("the footer", () => {
    it("must state the count of the rows that were read", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      for (const count of [312, 314, 0, "many", "313.5"]) {
        const failure = await downloadFailure(workbookOf(rows, { footer: { count } }));
        expect(failure).toBeInstanceOf(NotTheListError);
      }
    });

    it("must state the sum of the amounts, to the cent", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      const sum = sumOf(rows);
      for (const wrong of [sum + 0.01, sum - 0.01, sum + 1, 0, "lots"]) {
        const failure = await downloadFailure(workbookOf(rows, { footer: { sum: wrong } }));
        expect(failure).toBeInstanceOf(NotTheListError);
      }
    });

    it("is read in cents: the noise of a spreadsheet's float does not fail a sheet that adds up", async () => {
      const rows = withFillers(
        ...EXAMPLE_ROWS,
        caseRow({ name: "Centsco, Inc.", amount: 1234.56 }),
      );
      const noisy = `${sumOf(rows).toFixed(2)}00004`;
      const { body } = await run(workbookOf(rows, { footer: { sum: noisy } }));
      expect(rowOf(body, "centsco").total).toBe(1235);
    });

    it("sums only the cells that are numbers, as a spreadsheet does: a text amount adds nothing", async () => {
      const { body } = await run(
        withFillers(caseRow({ name: "Textco, Inc.", amount: "to be set" })),
      );
      expect(body.unreadable).toBe(1);
    });

    it("is missing: a sheet whose last row is a case is no list", async () => {
      const failure = await downloadFailure(
        workbookOf(withFillers(...EXAMPLE_ROWS), { footer: false }),
      );
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("may follow the last case at once, or after any number of blank rows", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      for (const blankRows of [0, 1, 3, 40]) {
        const { body } = await run(workbookOf(rows, { blankRows }));
        expect(body.total).toBe(313);
      }
    });

    it("must be the last row: a row of anything between the cases and it, or after it, is no list", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      const stray = (row: number) =>
        `<row r="${row}"><c r="B${row}" t="inlineStr"><is><t>ZZ-STRAY</t></is></c></row>`;
      for (const options of [
        { beforeFooter: stray(rows.length + 3) },
        { afterFooter: stray(rows.length + 9) },
      ]) {
        const failure = await downloadFailure(workbookOf(rows, options));
        expect(failure).toBeInstanceOf(NotTheListError);
      }
    });

    it("is no footer when it holds more than the count and the sum", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      const n = rows.length + 5;
      const footer = `<row r="${n}"><c r="B${n}"><v>313</v></c><c r="C${n}" t="inlineStr"><is><t>ZZ-NOTE</t></is></c><c r="D${n}"><v>${sumOf(rows)}</v></c></row>`;
      const failure = await downloadFailure(
        workbookOf(rows, { footer: false, afterFooter: footer }),
      );
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("comes after the last case that has its number: a blank case number in the middle ends the cases", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      rows[5] = { ...rows[5], number: "" };
      expect(await downloadFailure(workbookOf(rows))).toBeInstanceOf(NotTheListError);
    });

    it("is checked on every row of the sheet, the unreadable and the party-less ones too", async () => {
      const rows = withFillers(
        caseRow({ name: "Casey Sample et al", amount: 5000, number: "X100031" }),
        caseRow({ name: "Badnumberco, Inc.", amount: 250, number: "bad" }),
      );
      const { body } = await run(rows);
      expect(body.total).toBe(312);
      expect(body.unreadable).toBe(1);
      const failure = await downloadFailure(workbookOf(rows, { footer: { count: 310 } }));
      expect(failure).toBeInstanceOf(NotTheListError);
      const wrongSum = await downloadFailure(
        workbookOf(rows, { footer: { sum: sumOf(rows) - 5000 } }),
      );
      expect(wrongSum).toBeInstanceOf(NotTheListError);
    });
  });

  describe("the header", () => {
    it("is the six names in order, the amount's with the blank in front of it that the sheet has", async () => {
      expect(HEADER[3]).toBe(" Ordered Amount");
      const { body } = await run(withFillers(...EXAMPLE_ROWS));
      expect(body.rows.length).toBeGreaterThan(0);
    });

    it("is read after a trim: the blanks round a name are no part of it", async () => {
      const header = [
        "Case Number ",
        " Case Name",
        "Office",
        "Ordered Amount ",
        " Date of Order",
        "Basis",
      ];
      const { body } = await run(workbookOf(withFillers(...EXAMPLE_ROWS), { header }));
      expect(body.rows.length).toBeGreaterThan(0);
    });

    it.each([
      [
        "a name that is another",
        ["Case Number", "Defendant", "Office", " Ordered Amount", "Date of Order", "Basis"],
      ],
      [
        "the names in another order",
        ["Case Name", "Case Number", "Office", " Ordered Amount", "Date of Order", "Basis"],
      ],
      [
        "a name in another case",
        ["case number", "Case Name", "Office", " Ordered Amount", "Date of Order", "Basis"],
      ],
      ["a name less", ["Case Number", "Case Name", "Office", " Ordered Amount", "Date of Order"]],
      ["no name at all", []],
    ])("is no list when it has %s", async (_name, header) => {
      const failure = await downloadFailure(workbookOf(withFillers(...EXAMPLE_ROWS), { header }));
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("is no list when a seventh column has a name", async () => {
      const extra = `<c r="G1" t="inlineStr"><is><t>ZZ-SEVENTH</t></is></c>`;
      const failure = await downloadFailure(
        workbookOf(withFillers(...EXAMPLE_ROWS), { headerExtra: extra }),
      );
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("may have a seventh cell that is empty", async () => {
      const { body } = await run(
        workbookOf(withFillers(...EXAMPLE_ROWS), { headerExtra: `<c r="G1" s="3"/>` }),
      );
      expect(body.total).toBe(313);
    });
  });

  describe("the sheet", () => {
    it("is the one with the name Excel cut to 31 characters, exactly", async () => {
      expect(SHEET_NAME).toHaveLength(31);
      for (const sheetName of [
        "civil_penalty_cases_fy-2000-2026",
        "civil_penalty_cases_fy2000-2026",
        "Civil_penalty_cases_fy-2000-202",
        "Sheet1",
        "",
      ]) {
        const failure = await downloadFailure(
          workbookOf(withFillers(...EXAMPLE_ROWS), { sheetName }),
        );
        expect(failure).toBeInstanceOf(NotTheListError);
      }
    });

    it("is no list when the workbook counts its dates from 1904: its serials would be other days", async () => {
      const book = workbookOf(withFillers(...EXAMPLE_ROWS), {
        properties: '<workbookPr date1904="1"/>',
      });
      expect(await downloadFailure(book)).toBeInstanceOf(NotTheListError);
    });

    it.each([
      ["something that is no zip", Buffer.from("not a workbook at all")],
      ["no bytes", Buffer.alloc(0)],
      ["an HTML page", Buffer.from("<html><body>Not found</body></html>")],
      ["a zip that is no workbook", writeZip([{ name: "list.csv", data: "a,b\n1,2\n" }])],
    ])("is no list when the file is %s", async (_name, book) => {
      expect(await downloadFailure(book)).toBeInstanceOf(NotTheListError);
    });

    it("is no list when the workbook was cut short", async () => {
      const book = workbookOf(withFillers(...EXAMPLE_ROWS));
      expect(await downloadFailure(book.subarray(0, book.length - 12))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("is no list when a cell has no place or the sheet is no worksheet", async () => {
      const sheets = [
        `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c t="inlineStr"><is><t>lost</t></is></c></row></sheetData></worksheet>`,
        "<notasheet/>",
        "not xml at all",
      ];
      for (const sheet of sheets) {
        expect(await downloadFailure(workbookOf([], { sheet }))).toBeInstanceOf(NotTheListError);
      }
    });

    it("is read whatever else the workbook part holds: the internal path and the markup-compatibility element", async () => {
      const { snapshot } = await run(withFillers(...EXAMPLE_ROWS));
      expect(snapshot.bodies[0]).not.toContain("ZZ-PATH");
      expect(snapshot.bodies[0]).not.toContain("SYNTHETIC");
    });

    it("has floors: fewer than 300 cases is no list", async () => {
      expect(await downloadFailure(fillerRows(299))).toBeInstanceOf(NotTheListError);
      const { body } = await run(fillerRows(300));
      expect(body.total).toBe(300);
    });

    it("has floors: a first order after 2000-12-31 is no list", async () => {
      const late = fillerRows(320).map((row, at) => ({
        ...row,
        date: `${2001 + (at % 25)}-06-15`,
      }));
      expect(await downloadFailure(late)).toBeInstanceOf(NotTheListError);
      const early = late.map((row, at) => (at === 0 ? { ...row, date: "2000-12-31" } : row));
      const { body } = await run(early);
      expect(body.total).toBe(320);
    });
  });

  describe("the limits of the sheet", () => {
    it("is read whole when the footer is on row 5000, the last row that is allowed", async () => {
      const { body } = await run(fillerRows(4995));
      expect(body.total).toBe(4995);
      expect(body.rows).toHaveLength(4995);
    });

    it("fails as too large, and gives no shorter list, with one row more", async () => {
      expect(await downloadFailure(fillerRows(4996))).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails as too large with a column more than the sixteen it allows", async () => {
      const cell = `<c r="Q1" t="inlineStr"><is><t>x</t></is></c>`;
      const book = workbookOf(withFillers(...EXAMPLE_ROWS), { headerExtra: cell });
      expect(await downloadFailure(book)).toBeInstanceOf(BodyTooLargeError);
      const { body } = await run(
        workbookOf(withFillers(...EXAMPLE_ROWS), { headerExtra: `<c r="P1" s="3"/>` }),
      );
      expect(body.total).toBe(313);
    });

    it("fails as too large when the sheet inflates past what an entry of the workbook may", async () => {
      const filler = "x".repeat(5 * 1024 * 1024);
      const sheet = `<worksheet xmlns="${MAIN}"><sheetData><!--${filler}--></sheetData></worksheet>`;
      const book = workbookOf([], { sheet });
      expect(book.length).toBeLessThan(100 * 1024);
      expect(await downloadFailure(book)).toBeInstanceOf(BodyTooLargeError);
    });

    it("reads the longest sheet it allows in little time", async () => {
      const rows = fillerRows(4995);
      const book = workbookOf(rows);
      const { connector } = connectorWithSleep();
      const start = Date.now();
      await connector.download(fakeFetch(filesOf(book)), {});
      expect(Date.now() - start).toBeLessThan(10_000);
    });
  });

  describe("the case number", () => {
    const numberOf = async (cell: string): Promise<string | undefined> => {
      const { body } = await run(withFillers(caseRow({ name: "Numberco, Inc.", number: cell })));
      return body.rows.find((row) => row.id === "numberco")?.cases[0];
    };

    it("is the letter and the 4 to 7 digits at the start of the cell", async () => {
      expect(await numberOf("X123456")).toBe("X123456");
      expect(await numberOf("C3765")).toBe("C3765");
      expect(await numberOf("X1234")).toBe("X1234");
      expect(await numberOf("X1234567")).toBe("X1234567");
    });

    it("is read out of a cell with padding, and of one with the defendant's name after it", async () => {
      expect(await numberOf("X123456   ")).toBe("X123456");
      expect(await numberOf("  X123456")).toBe("X123456");
      expect(await numberOf("X123456     Examplecorp Holdings")).toBe("X123456");
      expect(await numberOf("X123456Examplecorp")).toBe("X123456");
    });

    it("makes the row unreadable when the cell has none of that form", async () => {
      for (const cell of ["x123456", "X123", "X12345678", "123456", "XX12345", "none", "-"]) {
        const { body } = await run(withFillers(caseRow({ name: "Numberco, Inc.", number: cell })));
        expect(body.rows.some((row) => row.id === "numberco")).toBe(false);
        expect(body.unreadable).toBe(1);
      }
    });
  });

  describe("the amount", () => {
    const amountOf = async (amount: number | string) => {
      const { body } = await run(withFillers(caseRow({ name: "Amountco, Inc.", amount })));
      return { entity: body.rows.find((row) => row.id === "amountco"), body };
    };

    it("is a number of dollars, or no amount for the text ' -' and '-'", async () => {
      expect((await amountOf(4_050_000)).entity?.newest[0].amount).toBe(4_050_000);
      expect((await amountOf(1234.56)).entity?.newest[0].amount).toBe(1234.56);
      expect((await amountOf(0)).entity?.newest[0].amount).toBe(0);
      for (const text of [" -", "-", "  -  "]) {
        const { entity } = await amountOf(text);
        expect(entity?.newest[0].amount).toBeNull();
        expect(entity?.noAmount).toBe(1);
        expect(entity?.total).toBe(0);
      }
    });

    it("makes the row unreadable for any other text and for an empty or a missing cell", async () => {
      for (const amount of ["unknown", "$1,000", "n/a", "1e3", "-5", "12.5.1", "", "  "]) {
        const { entity, body } = await amountOf(amount);
        expect(entity).toBeUndefined();
        expect(body.unreadable).toBe(1);
      }
      const missing = caseRow({ name: "Amountco, Inc.", amount: null });
      const { body } = await run(withFillers(missing));
      expect(body.unreadable).toBe(1);
    });

    it("makes the row unreadable for a number that is no amount of dollars, out of range", async () => {
      const rows = withFillers(caseRow({ name: "Amountco, Inc.", amount: 1e14 }));
      const { body } = await run(workbookOf(rows, { footer: { sum: sumOf(FILLERS) } }));
      expect(body.unreadable).toBe(1);
      expect(body.rows.some((row) => row.id === "amountco")).toBe(false);
    });

    it("is no list when the footer's sum holds an amount that is out of range: it cannot add up", async () => {
      const rows = withFillers(caseRow({ name: "Amountco, Inc.", amount: 1e14 }));
      expect(await downloadFailure(workbookOf(rows))).toBeInstanceOf(NotTheListError);
    });

    it("takes the largest amount of the rows of one order, and never their sum", async () => {
      const { body } = await run(withFillers(...EXAMPLE_ROWS));
      expect(rowOf(body, "examplecorp").newest[0].amount).toBe(2_500_000);
      expect(rowOf(body, "examplecorp").total).toBe(2_500_000);
    });

    it("is no amount for an order whose rows all have none, and a number for one that has a row with it", async () => {
      const rows = withFillers(
        caseRow({ name: "Mixedco, Inc.", amount: " -" }),
        caseRow({ name: "Mixedco, Inc.", amount: 700 }),
        caseRow({ name: "Mixedco, Inc.", amount: "-", number: "X100009", date: "2020-01-01" }),
      );
      const { body } = await run(rows);
      const entity = rowOf(body, "mixedco");
      expect(entity.orders).toBe(2);
      expect(entity.total).toBe(700);
      expect(entity.noAmount).toBe(1);
    });

    it("rounds the total of an entity to whole dollars, after the orders were summed", async () => {
      const rows = withFillers(
        caseRow({ name: "Roundco, Inc.", amount: 100.4, number: "X100011" }),
        caseRow({ name: "Roundco, Inc.", amount: 100.4, number: "X100012" }),
        caseRow({ name: "Roundco, Inc.", amount: 0.3, number: "X100013" }),
      );
      const { body } = await run(rows);
      expect(rowOf(body, "roundco").total).toBe(201);
    });
  });

  describe("the day of the order", () => {
    const dayOfRow = async (date: CaseRow["date"]) => {
      const { body } = await run(withFillers(caseRow({ name: "Zayqo, Inc.", date })));
      return { entity: body.rows.find((row) => row.id === "zayqo"), body };
    };

    it("is an Excel serial of the 1900 system, read as a day", async () => {
      expect((await dayOfRow(36437)).entity?.publishedAt).toBe("1999-10-04");
      expect((await dayOfRow(46247)).entity?.publishedAt).toBe("2026-08-13");
      expect((await dayOfRow("2026-08-13")).entity?.publishedAt).toBe("2026-08-13");
    });

    it("is read from the number of the cell, with no style and no time of the day", async () => {
      expect((await dayOfRow(46247.75)).entity?.publishedAt).toBe("2026-08-13");
    });

    it("makes the row unreadable when it is a text, a serial before 1900-03-01, or past 9999", async () => {
      const dates: CaseRow["date"][] = [
        { text: "2026-08-13" },
        { text: "08/13/2026" },
        { text: "" },
        10,
        60,
        3_000_000,
      ];
      for (const date of dates) {
        const { entity, body } = await dayOfRow(date);
        expect(entity).toBeUndefined();
        expect(body.unreadable).toBe(1);
      }
    });
  });

  describe("the width of a row", () => {
    const cellG = (text: string) => (row: number) =>
      `<c r="G${row}" t="inlineStr"><is><t>${text}</t></is></c>`;

    it("makes the row unreadable when a cell after the sixth holds anything", async () => {
      const { body } = await run(
        withFillers(caseRow({ name: "Wideco, Inc.", extra: cellG("ZZ-WIDE") })),
      );
      expect(body.unreadable).toBe(1);
      expect(body.rows.some((row) => row.id === "wideco")).toBe(false);
      expect(JSON.stringify(body)).not.toContain("ZZ-WIDE");
    });

    it("reads the row when the cells after the sixth are empty", async () => {
      const empty = (row: number) => `<c r="G${row}" s="3"/><c r="H${row}" s="3"/>`;
      const { body } = await run(withFillers(caseRow({ name: "Wideco, Inc.", extra: empty })));
      expect(body.unreadable).toBe(0);
      expect(body.rows.some((row) => row.id === "wideco")).toBe(true);
    });

    it("reads a row that lacks its last cell as one with no basis", async () => {
      const { body, parsed } = await run(
        withFillers(caseRow({ name: "Shortco, Inc.", basis: null })),
      );
      expect(body.unreadable).toBe(0);
      expect(rowOf(body, "shortco").newest[0].basis).toBe("");
      const summary = recordOf(parsed, "shortco").summary;
      expect(summary).toContain("Newest: 2024-03-05, case X100001, ordered US$1,000.");
    });
  });
});

describe("the entities", () => {
  describe("the id and the spellings", () => {
    it("is the compact name of the party without its legal form, so that the spellings of a company are one entity", async () => {
      const rows = withFillers(
        caseRow({ name: "Alphaco, Inc.", number: "X100021", date: "2024-01-10" }),
        caseRow({ name: "Alphaco Inc", number: "X100022", date: "2023-01-10" }),
        caseRow({ name: "ALPHACO CORP.", number: "X100023", date: "2022-01-10" }),
        caseRow({ name: "The Alphaco Company", number: "X100024", date: "2021-01-10" }),
      );
      const { body } = await run(rows);
      const entity = rowOf(body, "alphaco");
      expect(entity.orders).toBe(4);
      expect(entity.names).toEqual([
        "ALPHACO CORP.",
        "Alphaco Inc",
        "Alphaco, Inc.",
        "The Alphaco Company",
      ]);
    });

    it("shows the spelling that most orders use, and the first of two by the order of the text on a tie", async () => {
      const rows = withFillers(
        caseRow({ name: "Betaco, Inc.", number: "X100031", date: "2024-01-10" }),
        caseRow({ name: "Betaco, Inc.", number: "X100032", date: "2023-01-10" }),
        caseRow({ name: "Betaco Inc", number: "X100033", date: "2022-01-10" }),
        caseRow({ name: "Gammaco, Inc.", number: "X100034", date: "2024-01-10" }),
        caseRow({ name: "Gammaco Inc", number: "X100035", date: "2023-01-10" }),
      );
      const { body } = await run(rows);
      expect(rowOf(body, "betaco").display).toBe("Betaco, Inc.");
      // A blank comes before a comma.
      expect(rowOf(body, "gammaco").display).toBe("Gammaco Inc");
    });

    it("counts the rows of one order as one for a spelling, so that a duplicate row decides nothing", async () => {
      const rows = withFillers(
        caseRow({ name: "Deltaco Inc", number: "X100041", date: "2024-01-10" }),
        caseRow({ name: "Deltaco Inc", number: "X100041", date: "2024-01-10" }),
        caseRow({ name: "Deltaco Inc", number: "X100041", date: "2024-01-10" }),
        caseRow({ name: "Deltaco, Inc.", number: "X100042", date: "2023-01-10" }),
        caseRow({ name: "Deltaco, Inc.", number: "X100043", date: "2022-01-10" }),
      );
      const { body } = await run(rows);
      expect(rowOf(body, "deltaco").display).toBe("Deltaco, Inc.");
    });

    it("keeps at most five spellings, the most used first, in the same order whatever the order of the rows", async () => {
      const spellings: Array<[string, number]> = [
        ["Zetaco Inc", 3],
        ["Zetaco, Inc.", 2],
        ["Zetaco Corp", 2],
        ["Zetaco", 1],
        ["Zetaco Co", 1],
        ["Zetaco Incorporated", 1],
        ["Zetaco LLC", 1],
        ["Zetaco Ltd", 1],
      ];
      const rows: CaseRow[] = [];
      let at = 0;
      for (const [name, count] of spellings) {
        for (let i = 0; i < count; i += 1) {
          rows.push(
            caseRow({
              name,
              number: `X2${String(at).padStart(5, "0")}`,
              date: `2024-${String(1 + (at % 12)).padStart(2, "0")}-${String(1 + at).padStart(2, "0")}`,
            }),
          );
          at += 1;
        }
      }
      const expected = ["Zetaco Inc", "Zetaco Corp", "Zetaco, Inc.", "Zetaco", "Zetaco Co"];
      const forward = await run(withFillers(...rows));
      expect(rowOf(forward.body, "zetaco").names).toEqual(expected);
      expect(rowOf(forward.body, "zetaco").display).toBe("Zetaco Inc");
      const reversed = await run(withFillers(...[...rows].reverse()));
      expect(rowOf(reversed.body, "zetaco").names).toEqual(expected);
      // 12 orders: the case numbers are the 10 newest, newest first.
      expect(rowOf(forward.body, "zetaco").orders).toBe(12);
      expect(rowOf(forward.body, "zetaco").cases).toHaveLength(10);
      expect(rowOf(forward.body, "zetaco").newest).toHaveLength(3);
      expect(rowOf(forward.body, "zetaco").cases).toEqual(rowOf(reversed.body, "zetaco").cases);
    });

    it("gives the same id for an entity whatever the other rows and the order of the rows are", async () => {
      const alone = await run(withFillers(...EXAMPLE_ROWS));
      const shuffled = await run(
        workbookOf([
          ...fillerRows(305).reverse(),
          ...EXAMPLE_ROWS.slice().reverse(),
          ...fillerRows(5),
        ]),
      );
      expect(alone.body.rows.map((row) => row.id)).toContain("examplecorp");
      expect(shuffled.body.rows.map((row) => row.id)).toContain("examplecorp");
      expect(rowOf(alone.body, "examplecorp")).toEqual(rowOf(shuffled.body, "examplecorp"));
    });

    it("folds the forms of Unicode before the name is read: the same name composed or decomposed is one entity", async () => {
      const composed = "Caf\u00e9co, Inc.";
      const decomposed = "Cafe\u0301co Inc";
      const { body } = await run(
        withFillers(
          caseRow({ name: composed, number: "X100051" }),
          caseRow({ name: decomposed, number: "X100052", date: "2023-03-05" }),
        ),
      );
      const entity = body.rows.filter((row) => row.id.startsWith("caf"));
      expect(entity).toHaveLength(1);
      expect(entity[0].orders).toBe(2);
    });

    describe("the id of a party that is too long", () => {
      // The id is the compact name of the party without its legal form: the name itself when it has
      // 100 units or fewer. A longer name is its first 83 units (never the half of a pair of
      // surrogates), a tilde and the first 16 hex digits of the SHA-256 of the whole compact name, so
      // that two long names with one start are two entities, and an id is a function of the name alone.
      const STEM = `Averyverylongname${"x".repeat(150)}`;
      const ONE = `averyverylongname${"x".repeat(66)}~62e723ebdc013e80`;
      const TWO = `averyverylongname${"x".repeat(66)}~7eb538eed1aca435`;
      const idsOf = (body: Body): string[] =>
        body.rows.map((row) => row.id).filter((id) => !id.startsWith("fillerco"));

      it("gives two long names that share their first 100 characters two entities and two records", async () => {
        const { body, parsed } = await run(
          withFillers(
            caseRow({ name: `${STEM}One Inc`, number: "X100061" }),
            caseRow({ name: `${STEM}Two Inc`, number: "X100062", date: "2023-03-05" }),
          ),
        );
        expect(idsOf(body)).toEqual([ONE, TWO]);
        expect(rowOf(body, ONE).orders).toBe(1);
        expect(rowOf(body, TWO).orders).toBe(1);
        expect(rowOf(body, ONE).cases).toEqual(["X100061"]);
        expect(rowOf(body, TWO).cases).toEqual(["X100062"]);
        expect(recordOf(parsed, ONE).sourceRecordId).toBe(ONE);
        expect(recordOf(parsed, TWO).sourceRecordId).toBe(TWO);
        expect(parsed.errors).toBe(0);
      });

      it("gives the same ids and the same body whatever the order of the rows", async () => {
        const rows = [
          caseRow({ name: `${STEM}One Inc`, number: "X100061" }),
          caseRow({ name: `${STEM}Two Inc`, number: "X100062", date: "2023-03-05" }),
          caseRow({ name: `${STEM}One Corp`, number: "X100063", date: "2022-02-03" }),
        ];
        const forward = await run(withFillers(...rows));
        const reversed = await run(withFillers(...[...rows].reverse()));
        expect(idsOf(reversed.body)).toEqual([ONE, TWO]);
        expect(reversed.body).toEqual(forward.body);
        expect(reversed.parsed.records).toEqual(forward.parsed.records);
        expect(rowOf(forward.body, ONE).orders).toBe(2);
      });

      it("keeps a compact name of 100 characters as the id, and hashes one of 101", async () => {
        const { body } = await run(
          withFillers(
            caseRow({ name: `Boundary${"x".repeat(92)} Inc`, number: "X100064" }),
            caseRow({
              name: `Boundary${"x".repeat(93)} Inc`,
              number: "X100065",
              date: "2023-03-05",
            }),
          ),
        );
        const ids = idsOf(body);
        expect(ids).toEqual([
          `boundary${"x".repeat(92)}`,
          `boundary${"x".repeat(75)}~9be83f127339ba85`,
        ]);
        expect(ids.map((id) => id.length)).toEqual([100, 100]);
      });

      it("never cuts in the middle of a character: the cut is before the pair, and the hash is of the whole name", async () => {
        // Four letters and then letters of two units each: the 83rd unit is the first half of a pair.
        const astral = (tail: string): string => `abcd${cp(0x10400).repeat(60)}${tail} Corp`;
        const { body } = await run(
          withFillers(
            caseRow({ name: `abcd${cp(0x10400).repeat(120)} Corp`, number: "X100066" }),
            caseRow({ name: astral("One"), number: "X100067", date: "2023-03-05" }),
            caseRow({ name: astral("Two"), number: "X100068", date: "2022-02-03" }),
          ),
        );
        const kept = `abcd${cp(0x10428).repeat(39)}`;
        const ids = idsOf(body);
        expect(ids).toEqual([
          `${kept}~2c6919d309792cc8`,
          `${kept}~857aa4571aba0f87`,
          `${kept}~8708d28107afdcdc`,
        ]);
        for (const id of ids) {
          expect(id.length).toBe(99);
          expect(id).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
        }
      });

      it("has a tilde in no id of a name that was not cut, and keeps such an id as it was", async () => {
        const { body, parsed } = await run(withFillers(...EXAMPLE_ROWS));
        expect(body.rows.some((row) => row.id.includes("~"))).toBe(false);
        expect(parsed.records.some((record) => record.sourceRecordId.includes("~"))).toBe(false);
        expect(body.rows.map((row) => row.id)).toEqual(expect.arrayContaining(["examplecorp"]));
      });

      it("shows a party that is too long as its display cut, and counts it once", async () => {
        const { body } = await run(
          withFillers(caseRow({ name: `${STEM} Inc`, number: "X100069" })),
        );
        expect(idsOf(body)).toEqual([`averyverylongname${"x".repeat(66)}~65672a02998277b8`]);
        expect(rowOf(body, idsOf(body)[0]).display).toBe(
          `${STEM} Inc`.slice(0, 100 - 12) + " [shortened]",
        );
      });
    });

    describe("the identifiers of a record", () => {
      // An identifier is never a cut text: it holds the first spelling of the party whole (a name is
      // read to 300 units), while the title and the summary of the record show the display, cut at 100.
      const marked = (text: string): string => `${text.slice(0, 88)} [shortened]`;
      const rowStartingWith = (body: Body, start: string): FtcPenaltyRow =>
        body.rows.find((row) => row.id.startsWith(start)) as FtcPenaltyRow;

      it("hold the whole first spelling of a party of more than 100 characters, and the title and the summary keep the cut", async () => {
        const whole = `Longpartyname${"x".repeat(130)} Inc`;
        const { body, parsed } = await run(
          withFillers(caseRow({ name: whole, number: "X100070" })),
        );
        const row = rowStartingWith(body, "longpartyname");
        const record = recordOf(parsed, row.id);
        expect(whole).toHaveLength(147);
        expect(record.identifiers.defendant).toBe(whole);
        expect(record.identifiers.cases).toEqual(["X100070"]);
        expect(JSON.stringify(record.identifiers)).not.toContain("shortened");
        expect(record.title).toBe(`${FTC_PENALTIES_RECORD_MARK}: ${marked(whole)}`);
        expect(record.summary).toContain(`Defendant: ${marked(whole)}.`);
        expect(row.display).toBe(marked(whole));
      });

      it("hold the whole spelling when the cut of the display ends at a blank", async () => {
        // The 88 units that the display keeps end in a blank, which the cut takes off.
        const whole = `Blank${"x".repeat(82)} ${"y".repeat(40)} Inc`;
        const { body, parsed } = await run(
          withFillers(caseRow({ name: whole, number: "X100071" })),
        );
        const record = recordOf(parsed, rowStartingWith(body, "blank").id);
        expect(whole[87]).toBe(" ");
        expect(record.identifiers.defendant).toBe(whole);
        expect(record.title.endsWith(" [shortened]")).toBe(true);
        expect(record.title).not.toContain(whole);
      });

      it("hold the whole spelling when the cut of the display is before a pair of surrogates", async () => {
        // The 88th unit is the first half of a pair, so the cut keeps 87 units and the marker.
        const whole = `Pairs${cp(0x10400).repeat(60)}${"z".repeat(30)} Inc`;
        const { body, parsed } = await run(
          withFillers(caseRow({ name: whole, number: "X100072" })),
        );
        const row = rowStartingWith(body, "pairs");
        const record = recordOf(parsed, row.id);
        expect(whole.charCodeAt(87)).toBe(0xd801);
        expect(record.identifiers.defendant).toBe(whole);
        expect(row.display).toHaveLength(99);
        expect(row.display.endsWith(" [shortened]")).toBe(true);
        expect(row.display).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      });

      it("hold the display as it is when the party has 100 characters, and the whole spelling at 101", async () => {
        const at100 = `Hundred${"x".repeat(89)} Inc`;
        const at101 = `Hundred${"x".repeat(90)} Inc`;
        expect(at100).toHaveLength(100);
        expect(at101).toHaveLength(101);
        const { body, parsed } = await run(
          withFillers(
            caseRow({ name: at100, number: "X100073" }),
            caseRow({ name: at101, number: "X100074", date: "2023-03-05" }),
          ),
        );
        const rows = body.rows.filter((row) => row.id.startsWith("hundred"));
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          const record = recordOf(parsed, row.id);
          expect(record.identifiers.defendant).toBe(row.names[0]);
          expect(String(record.identifiers.defendant)).not.toContain("shortened");
        }
        const long = rows.find((row) => row.names[0] === at101) as FtcPenaltyRow;
        expect(long.display).toBe(marked(at101));
        expect(recordOf(parsed, long.id).identifiers.defendant).toBe(at101);
        const exact = rows.find((row) => row.names[0] === at100) as FtcPenaltyRow;
        expect(exact.display).toBe(at100);
      });

      it("hold the first spelling, the one that most orders use, when a party is written in several", async () => {
        const stem = `Twospellingparty${"x".repeat(120)}`;
        const { body, parsed } = await run(
          withFillers(
            caseRow({ name: `${stem} Inc`, number: "X100075" }),
            caseRow({ name: `${stem} Inc`, number: "X100076", date: "2023-03-05" }),
            caseRow({ name: `${stem} Corp`, number: "X100077", date: "2022-02-03" }),
          ),
        );
        const row = rowStartingWith(body, "twospellingparty");
        expect(row.names.slice(0, 2)).toEqual([`${stem} Inc`, `${stem} Corp`]);
        expect(recordOf(parsed, row.id).identifiers.defendant).toBe(`${stem} Inc`);
      });

      it("hold the whole spelling with the angle brackets that the kit takes out", async () => {
        const whole = `Anglebracket<${"x".repeat(110)}> Inc`;
        const { body, parsed } = await run(
          withFillers(caseRow({ name: whole, number: "X100078" })),
        );
        const record = recordOf(parsed, rowStartingWith(body, "anglebracket").id);
        expect(record.identifiers.defendant).toBe(
          whole.replace("<", cp(0x2039)).replace(">", cp(0x203a)),
        );
        expect(JSON.stringify(record)).not.toMatch(/[<>]/);
      });

      it("hold a party of 280 characters whole, and the record is made", async () => {
        const whole = `Fullwidthparty${"x".repeat(260)} Inc`;
        const { body, parsed } = await run(
          withFillers(caseRow({ name: whole, number: "X100079" })),
        );
        expect(whole).toHaveLength(278);
        const record = recordOf(parsed, rowStartingWith(body, "fullwidthparty").id);
        expect(record.identifiers.defendant).toBe(whole);
        expect(parsed.errors).toBe(0);
      });
    });

    it("gives no entity for a party of fewer than four letters and digits once its legal form is taken off", async () => {
      const { body } = await run(
        withFillers(
          caseRow({ name: "Abc", number: "X100071" }),
          caseRow({ name: "Abc Inc", number: "X100072" }),
          caseRow({ name: "Q&A", number: "X100073" }),
          caseRow({ name: "Abcd", number: "X100074" }),
        ),
      );
      // The legal form is not counted: Abc Inc is three letters, as Abc is. Abcd is four.
      expect(body.rows.some((row) => row.id === "abc")).toBe(false);
      expect(body.rows.some((row) => row.names.includes("Abc Inc"))).toBe(false);
      expect(body.rows.some((row) => row.names.includes("Q&A"))).toBe(false);
      expect(rowOf(body, "abcd").names).toEqual(["Abcd"]);
      // A row that names no company with a name that can be a key is neither an entity nor unreadable.
      expect(body.unreadable).toBe(0);
      expect(body.total).toBe(314);
    });
  });

  describe("the parties of a row", () => {
    it("count the order for each defendant company of the row, once", async () => {
      const { body } = await run(
        withFillers(
          caseRow({ name: "Alphapair, Inc. / Betapair LLC", number: "X100081" }),
          caseRow({ name: "Twinco, Inc. / Twinco Inc", number: "X100082" }),
        ),
      );
      expect(rowOf(body, "alphapair").orders).toBe(1);
      expect(rowOf(body, "betapair").orders).toBe(1);
      expect(rowOf(body, "twinco").orders).toBe(1);
      expect(rowOf(body, "twinco").names).toEqual(["Twinco Inc", "Twinco, Inc."]);
    });

    it("give the aliases of a row to its first entity, the most used first and at most three", async () => {
      const aliases: Array<[string, number]> = [
        ["ExampleOne", 3],
        ["ExampleTwo", 2],
        ["ExampleThree", 2],
        ["ExampleFour", 1],
        ["ExampleFive", 1],
      ];
      const rows: CaseRow[] = [];
      let at = 0;
      for (const [alias, count] of aliases) {
        for (let i = 0; i < count; i += 1) {
          rows.push(
            caseRow({
              name: `Aliasco, Inc. d/b/a ${alias}`,
              number: `X3${String(at).padStart(5, "0")}`,
              date: `2022-${String(1 + (at % 12)).padStart(2, "0")}-10`,
            }),
          );
          at += 1;
        }
      }
      const { body } = await run(withFillers(...rows));
      expect(rowOf(body, "aliasco").names).toEqual([
        "Aliasco, Inc.",
        "ExampleOne",
        "ExampleThree",
        "ExampleTwo",
      ]);
      expect(body.rows.some((row) => row.id === "exampleone")).toBe(false);
    });

    it("promote the alias of a person's d/b/a to an entity of its own", async () => {
      const { body } = await run(
        withFillers(caseRow({ name: "Zzperson Sample d/b/a Examplestore.com", number: "X100091" })),
      );
      const entity = rowOf(body, "examplestorecom");
      expect(entity.display).toBe("Examplestore.com");
      expect(JSON.stringify(body)).not.toContain("Zzperson");
    });
  });

  describe("the names of a host", () => {
    it("add the label before the suffix, for a spelling whose short name is a host, and no host key", async () => {
      const { body, parsed } = await run(
        withFillers(caseRow({ name: "Examplestore.com, Inc.", number: "X100101" })),
      );
      const entity = rowOf(body, "examplestorecom");
      expect(entity.names).toEqual(["Examplestore.com, Inc.", "Examplestore"]);
      const keys = recordOf(parsed, "examplestorecom").matchKeys;
      expect(keys).toEqual([
        "name:examplestorecominc",
        "name:examplestorecom",
        "name:examplestore",
      ]);
      expect(keys.some((key) => key.startsWith("domain:"))).toBe(false);
    });

    it("read the suffixes com, net, org, info, biz and us in any case, and no other", async () => {
      const { body } = await run(
        withFillers(
          caseRow({ name: "Hostone.NET LLC", number: "X100111" }),
          caseRow({ name: "Hosttwo.org", number: "X100112" }),
          caseRow({ name: "Hostthree.info, Inc.", number: "X100113" }),
          caseRow({ name: "Hostfour.biz Corp", number: "X100114" }),
          caseRow({ name: "Hostfive.us", number: "X100115" }),
          caseRow({ name: "Hostsix.io, Inc.", number: "X100116" }),
          caseRow({ name: "Host-seven.com", number: "X100117" }),
        ),
      );
      expect(rowOf(body, "hostonenet").names).toEqual(["Hostone.NET LLC", "Hostone"]);
      expect(rowOf(body, "hosttwoorg").names).toEqual(["Hosttwo.org", "Hosttwo"]);
      expect(rowOf(body, "hostthreeinfo").names).toEqual(["Hostthree.info, Inc.", "Hostthree"]);
      expect(rowOf(body, "hostfourbiz").names).toEqual(["Hostfour.biz Corp", "Hostfour"]);
      expect(rowOf(body, "hostfiveus").names).toEqual(["Hostfive.us", "Hostfive"]);
      expect(rowOf(body, "hostsixio").names).toEqual(["Hostsix.io, Inc."]);
      expect(rowOf(body, "hostsevencom").names).toEqual(["Host-seven.com", "Host-seven"]);
    });

    it("add no label for an alias that is a host: the label is of a spelling of the party", async () => {
      const { body } = await run(
        withFillers(caseRow({ name: "Hostaliasco, Inc. d/b/a Hostalias.com", number: "X100131" })),
      );
      expect(rowOf(body, "hostaliasco").names).toEqual(["Hostaliasco, Inc.", "Hostalias.com"]);
    });

    it("add no label shorter than four letters and digits", async () => {
      const { body } = await run(
        withFillers(caseRow({ name: "Abc.com, Inc.", number: "X100121" })),
      );
      expect(rowOf(body, "abccom").names).toEqual(["Abc.com, Inc."]);
    });
  });
});

describe("the natural persons", () => {
  it("never reach a body or a record: a row of persons only gives no entity and no error", async () => {
    const rows = withFillers(
      caseRow({ name: "Zzperson Sample et al", number: "X100131" }),
      caseRow({ name: "Jordan Q. Zzperson", number: "X100132" }),
      caseRow({ name: "Zzperson Sample, Zzperson Other and Zzperson Third", number: "X100133" }),
    );
    const { body, parsed, snapshot } = await run(rows);
    expect(body.total).toBe(313);
    expect(body.unreadable).toBe(0);
    expect(body.rows).toHaveLength(310);
    expect(parsed.errors).toBe(0);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`.toLowerCase();
    expect(everything).not.toContain("zzperson");
  });

  it("are dropped from a row that names a company beside them, and the company stays", async () => {
    const rows = withFillers(
      caseRow({ name: "Brightline Widgets, Inc. / Zzperson Sample", number: "X100141" }),
      caseRow({ name: "Zzperson Sample, Stem Example Institute LLC", number: "X100142" }),
      caseRow({ name: "Robin Zzperson and Quickexample LLC", number: "X100143" }),
      caseRow({ name: "Lumen Ward, Inc.", number: "X100144" }),
      caseRow({ name: "Ward, Roebuck and Co.", number: "X100145" }),
    );
    const { body, snapshot, parsed } = await run(rows);
    expect(body.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        "brightlinewidgets",
        "stemexampleinstitute",
        "lumenward",
        "wardroebuckand",
      ]),
    );
    expect(body.rows.some((row) => row.id.includes("quickexample"))).toBe(false);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`.toLowerCase();
    expect(everything).not.toContain("zzperson");
  });

  it("never reach a body or a record through a comma and an and, or in the order Last, First", async () => {
    const rows = withFillers(
      caseRow({ name: "Quickexample Inc., and Zzperson Sample", number: "X100161" }),
      caseRow({ name: "Quickexample Inc., & Zzperson Sample", number: "X100162" }),
      caseRow({ name: "Zzperson, Zzgiven", number: "X100163" }),
      caseRow({ name: "ZZPERSON, ZZGIVEN J", number: "X100164" }),
      caseRow({ name: "Zzperson, Zzgiven, Quickexample Inc.", number: "X100165" }),
      caseRow({ name: "Zzperson, Zzgiven Q.", number: "X100166" }),
    );
    const { body, parsed, snapshot } = await run(rows);
    expect(body.total).toBe(316);
    expect(body.unreadable).toBe(0);
    expect(body.rows).toHaveLength(310);
    expect(parsed.errors).toBe(0);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`.toLowerCase();
    expect(everything).not.toContain("zzperson");
    expect(everything).not.toContain("zzgiven");
    expect(everything).not.toContain("quickexample");
  });

  it("never reach a body or a record through a particle, a plus, an alias mark or legal wording", async () => {
    const rows = withFillers(
      caseRow({ name: "Zzperson de la Zzgiven", number: "X100181" }),
      caseRow({ name: "Zzperson del Zzgiven Zzthird", number: "X100182" }),
      caseRow({ name: "Zzperson Zzgiven y Zzperson Zzother", number: "X100183" }),
      caseRow({ name: "Zzperson Zzgiven + Zzperson Zzother", number: "X100184" }),
      caseRow({ name: "ZZPERSON ZZGIVEN AND ZZPERSON ZZOTHER", number: "X100185" }),
      caseRow({ name: "Zzperson Zzgiven, individually", number: "X100186" }),
      caseRow({ name: "Zzperson Zzgiven doing business as Doingbiz LLC", number: "X100187" }),
      caseRow({ name: "Zzperson Zzgiven trading as Tradingbiz LLC", number: "X100188" }),
      caseRow({ name: "Zzperson Zzgiven t/a Tabiz LLC", number: "X100189" }),
      caseRow({ name: "Zzperson Zzgiven, also d/b/a Alsobiz LLC", number: "X100190" }),
    );
    const { body, parsed, snapshot } = await run(rows);
    expect(body.total).toBe(320);
    expect(body.unreadable).toBe(0);
    expect(body.rows).toHaveLength(314);
    expect(body.rows.map((row) => row.id).filter((id) => !id.startsWith("fillerco"))).toEqual([
      "alsobiz",
      "doingbiz",
      "tabiz",
      "tradingbiz",
    ]);
    expect(parsed.errors).toBe(0);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`.toLowerCase();
    for (const word of ["zzperson", "zzgiven", "zzthird", "zzother", "individually"]) {
      expect(everything).not.toContain(word);
    }
  });

  it("keep a name with a particle and a legal form, and its entity", async () => {
    const rows = withFillers(caseRow({ name: "Zzco de la Zzname Inc.", number: "X100191" }));
    const { body } = await run(rows);
    expect(rowOf(body, "zzcodelazzname").display).toBe("Zzco de la Zzname Inc.");
  });

  it("never reach a body or a record through a surname of several words, a nickname, an alias or an estate", async () => {
    const rows = withFillers(
      caseRow({ name: "Zzsurname Zzother, Zzgiven", number: "X100201" }),
      caseRow({ name: "Brightzorb Inc., Zzsurname Zzother, Zzgiven", number: "X100202" }),
      caseRow({ name: "Zzsurname Zzother, Zzgiven and Quickzorb Inc.", number: "X100203" }),
      caseRow({ name: 'Zzperson "Zznick" Zzsurname', number: "X100204" }),
      caseRow({ name: `Zzperson ${cp(0x201c)}Zznick${cp(0x201d)} Zzsurname`, number: "X100205" }),
      caseRow({ name: `Zzperson Zzsurname${cp(0x2010)}Zzother`, number: "X100206" }),
      caseRow({ name: "Zzperson Zzsurname aka Zzalias", number: "X100207" }),
      caseRow({ name: "Zzperson Zzsurname f/k/a Zzformer", number: "X100208" }),
      caseRow({ name: "Estate of Zzperson Zzsurname", number: "X100209" }),
      caseRow({ name: "Zzperson Zzsurname aka Zzalias d/b/a Realbiz LLC", number: "X100210" }),
    );
    const { body, parsed, snapshot } = await run(rows);
    expect(body.total).toBe(320);
    expect(body.unreadable).toBe(0);
    expect(body.rows).toHaveLength(312);
    expect(body.rows.map((row) => row.id).filter((id) => !id.startsWith("fillerco"))).toEqual([
      "brightzorb",
      "realbiz",
    ]);
    expect(rowOf(body, "brightzorb").display).toBe("Brightzorb Inc.");
    expect(parsed.errors).toBe(0);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`.toLowerCase();
    // The company that an and joins to a given name is lost with it, not stored cut.
    expect(everything).not.toContain("quickzorb");
    for (const word of [
      "zzsurname",
      "zzother",
      "zzgiven",
      "zznick",
      "zzperson",
      "zzalias",
      "zzformer",
    ]) {
      expect(everything).not.toContain(word);
    }
  });

  it("never reach a body or a record through a mark of any script, a nickname in parentheses, an estate in any position or a given name with a legal form", async () => {
    const rows = withFillers(
      caseRow({ name: `Zzgiven ${cp(0x2018)}Zznick${cp(0x2019)} Zzperson`, number: "X100301" }),
      caseRow({ name: `Zzgiven ${cp(0xab)}Zznick${cp(0xbb)} Zzperson`, number: "X100302" }),
      caseRow({ name: `Zzgiven ${cp(0x201e)}Zznick${cp(0x201c)} Zzperson`, number: "X100303" }),
      caseRow({ name: `Zzgiven O${cp(0x2018)}Zzperson`, number: "X100304" }),
      caseRow({ name: `Zzgiven O${cp(0xb4)}Zzperson`, number: "X100305" }),
      caseRow({ name: `Zzgiven Zzperson${cp(0x2014)}Zzother`, number: "X100306" }),
      caseRow({ name: `Zzgiven Zzperson${cp(0x2212)}Zzother`, number: "X100307" }),
      caseRow({ name: `Brightzorb Inc. ${cp(0x2013)} Zzgiven Zzperson`, number: "X100308" }),
      caseRow({ name: "Examplezorb Inc. -- Zzgiven Zzperson", number: "X100309" }),
      caseRow({ name: "Zzgiven (Zznick) Zzperson", number: "X100310" }),
      caseRow({ name: "Zzgiven [Zznick] Zzperson", number: "X100311" }),
      caseRow({ name: "Quickzorb Inc., Zzgiven (Zznick) Zzperson", number: "X100312" }),
      caseRow({ name: "Zzgiven (Zznick) Zzperson d/b/a Realbiz Two LLC", number: "X100313" }),
      caseRow({ name: "Zzgiven ( Aka Dba ) Zzperson", number: "X100314" }),
      caseRow({ name: "Executor of the Estate of Zzperson Zzsurname", number: "X100315" }),
      caseRow({ name: "Zzperson Zzsurname Estate", number: "X100316" }),
      caseRow({ name: "Examplezorb Inc., In re Estate of Zzperson Zzsurname", number: "X100317" }),
      caseRow({ name: "Zzsurname Zzother, Zzgiven, LLC", number: "X100318" }),
      caseRow({
        name: "Examplezorb Inc., Zzsurname Zzother, Zzgiven, Inc., Lastzorb Inc.",
        number: "X100319",
      }),
    );
    const { body, parsed, snapshot } = await run(rows);
    expect(body.total).toBe(329);
    expect(body.unreadable).toBe(0);
    expect(body.rows).toHaveLength(314);
    expect(body.rows.map((row) => row.id).filter((id) => !id.startsWith("fillerco"))).toEqual([
      "brightzorb",
      "examplezorb",
      "quickzorb",
      "realbiztwo",
    ]);
    // The company before a dash, a person or an estate stays, one order for each row that names it.
    expect(rowOf(body, "examplezorb").orders).toBe(3);
    expect(rowOf(body, "examplezorb").display).toBe("Examplezorb Inc.");
    expect(rowOf(body, "realbiztwo").display).toBe("Realbiz Two LLC");
    expect(parsed.errors).toBe(0);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`.toLowerCase();
    for (const word of ["zzgiven", "zznick", "zzperson", "zzsurname", "zzother"]) {
      expect(everything).not.toContain(word);
    }
    // The company that follows a given name with its legal form is lost with it, not stored cut.
    expect(everything).not.toContain("lastzorb");
  });

  it("keep a firm that a comma and an and join, and a one-word name with its legal form", async () => {
    const rows = withFillers(
      caseRow({ name: "Gardens, and Tools, Inc.", number: "X100171" }),
      caseRow({ name: "Amazing.example, Inc.", number: "X100172" }),
    );
    const { body } = await run(rows);
    expect(rowOf(body, "gardensandtools").names).toEqual(["Gardens, and Tools, Inc."]);
    expect(rowOf(body, "gardensandtools").display).toBe("Gardens, and Tools, Inc.");
    expect(rowOf(body, "amazingexample").display).toBe("Amazing.example, Inc.");
  });

  it("are cut with every parenthetical group, whatever the group holds", async () => {
    const rows = withFillers(
      caseRow({
        name: "Parqnco, Inc. (Brandname ZZ-BRAND) (Zzperson Sample) (the other ZZ-GROUP)",
        number: "X100151",
      }),
    );
    const { body, snapshot, parsed } = await run(rows);
    expect(rowOf(body, "parqnco").names).toEqual(["Parqnco, Inc."]);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`;
    expect(everything).not.toContain("ZZ-BRAND");
    expect(everything).not.toContain("ZZ-GROUP");
    expect(everything.toLowerCase()).not.toContain("zzperson");
  });
});

describe("what the connector leaves out", () => {
  it("is never in a body or a record: the office, the other datasets of the catalogue, the footer's cells", async () => {
    const rows = withFillers(...EXAMPLE_ROWS);
    const { snapshot, parsed } = await run(rows);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`;
    for (const token of [
      "ZZ-OFFICE",
      "ZZ-OTHER",
      "ZZ-DATASET",
      "ZZ-DISTRIBUTION",
      "ZZ-PATH",
      "ZZ-other",
    ]) {
      expect(everything).not.toContain(token);
    }
    expect(snapshot.bodies[0]).not.toContain(String(sumOf(rows)));
  });
});

describe("the records", () => {
  const FULL_SUMMARY =
    "FTC civil penalty cases (ftc.gov), an enforcement or case list. Defendant: Examplecorp, Inc. " +
    "The US Federal Trade Commission's list of consumer protection civil penalty cases holds 2 orders " +
    "naming it, dated 2019 to 2024, ordered amounts totalling US$2,500,000. " +
    "Newest: 2024-03-05, case X100001, Violations of the Examplerule Act, ordered US$2,500,000; " +
    "2019-11-20, case X100002, Violations of an Example Order, no amount stated. " +
    CLOSING;

  it("is one for each entity, of the type of the list, with its text word for word", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    expect(parsed.records).toHaveLength(311);
    const record = recordOf(parsed, "examplecorp");
    expect(record.recordType).toBe("civil_penalty_summary");
    expect(record.title).toBe("FTC civil penalty cases: Examplecorp, Inc.");
    expect(record.summary).toBe(FULL_SUMMARY);
    expect(record.url).toBe(`${RECORD_URL}examplecorp`);
    expect(record.identifiers).toEqual({
      defendant: "Examplecorp, Inc.",
      cases: ["X100001", "X100002"],
    });
    expect(record.publishedAt).toBe("2024-03-05");
    expect(record.sourceUpdatedAt).toBeNull();
    expect(record.matchKeys).toEqual(["name:examplecorpinc", "name:examplecorp"]);
  });

  it("begins with the mark, the host and what kind of list it is, and ends with the closing sentence", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    for (const record of parsed.records) {
      expect(
        record.summary.startsWith(
          `${FTC_PENALTIES_RECORD_MARK} (ftc.gov), an enforcement or case list.`,
        ),
      ).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
    }
    expect(FTC_PENALTIES_RECORD_MARK).toBe("FTC civil penalty cases");
  });

  it("is well formed for the columns and the prompt, whatever the entity", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    expectWellFormedRecords(parsed.records, {
      sourceId: SOURCE_ID,
      mark: FTC_PENALTIES_RECORD_MARK,
    });
  });

  it("has an address of its own for each entity, so that no record is dropped as the duplicate of another", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    const urls = parsed.records.map((record) => record.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const record of parsed.records) {
      expect(record.url).toBe(`${RECORD_URL}${encodeURIComponent(record.sourceRecordId)}`);
    }
  });

  it("has name keys only, and no key of a domain, a number or an LEI", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    for (const record of parsed.records) {
      expect(record.matchKeys.length).toBeGreaterThan(0);
      expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
    }
  });

  it("writes one order as one order and one year as one year, and says nothing of a total of nothing", async () => {
    const { parsed } = await run(
      withFillers(
        caseRow({ name: "Singleco, Inc.", amount: " -", basis: "Violations of the Single Act" }),
        caseRow({ name: "Cents Singleco, Inc.", amount: 1234.5, number: "X100161" }),
      ),
    );
    const single = recordOf(parsed, "singleco").summary;
    expect(single).toContain("holds 1 order naming it, dated 2024.");
    expect(single).not.toContain("totalling");
    expect(single).toContain(
      "Newest: 2024-03-05, case X100001, Violations of the Single Act, no amount stated.",
    );
    const cents = recordOf(parsed, "centssingleco").summary;
    expect(cents).toContain(
      "holds 1 order naming it, dated 2024, ordered amounts totalling US$1,235.",
    );
    expect(cents).toContain("ordered US$1,234.50.");
  });

  it("writes an amount of a billion with its separators, and a total of many orders", async () => {
    const { parsed } = await run(
      withFillers(
        caseRow({
          name: "Bigco, Inc.",
          amount: 5_000_000_000,
          number: "X100171",
          date: "2022-01-01",
        }),
        caseRow({
          name: "Bigco, Inc.",
          amount: 123_456_789.12,
          number: "X100172",
          date: "2023-01-01",
        }),
      ),
    );
    const summary = recordOf(parsed, "bigco").summary;
    expect(summary).toContain("ordered amounts totalling US$5,123,456,789.");
    expect(summary).toContain("ordered US$5,000,000,000");
    expect(summary).toContain("ordered US$123,456,789.12");
  });

  it("shows the three newest orders, by day and then by case number, newest first", async () => {
    const rows = withFillers(
      ...["2020-01-01", "2021-01-01", "2022-01-01", "2023-01-01", "2023-01-01"].map((date, at) =>
        caseRow({ name: "Newestco, Inc.", date, number: `X4${String(at).padStart(5, "0")}` }),
      ),
    );
    const { body } = await run(rows);
    const entity = rowOf(body, "newestco");
    expect(entity.orders).toBe(5);
    expect(entity.newest.map((order) => [order.day, order.caseNumber])).toEqual([
      ["2023-01-01", "X400004"],
      ["2023-01-01", "X400003"],
      ["2022-01-01", "X400002"],
    ]);
    expect(entity.cases).toEqual(["X400004", "X400003", "X400002", "X400001", "X400000"]);
  });

  it("counts one case number on two days as two orders, and lists the case once", async () => {
    const { body } = await run(
      withFillers(
        caseRow({ name: "Twiceco, Inc.", number: "X100500", date: "2021-04-01" }),
        caseRow({ name: "Twiceco, Inc.", number: "X100500", date: "2022-05-02" }),
      ),
    );
    const entity = rowOf(body, "twiceco");
    expect(entity.orders).toBe(2);
    expect(entity.cases).toEqual(["X100500"]);
    expect(entity.newest.map((order) => order.day)).toEqual(["2022-05-02", "2021-04-01"]);
  });

  it("gives the same newest orders whatever the order of the rows, even for the rows of one order that differ", async () => {
    const differing = [
      caseRow({ name: "Orderco, Inc.", amount: 500, basis: "Basis B" }),
      caseRow({ name: "Orderco, Inc.", amount: 900, basis: "Basis C" }),
      caseRow({ name: "Orderco, Inc.", amount: 900, basis: "Basis A" }),
      caseRow({ name: "Orderco, Inc.", amount: " -", basis: "Basis D" }),
    ];
    const forward = await run(withFillers(...differing));
    const reversed = await run(withFillers(...[...differing].reverse()));
    expect(rowOf(forward.body, "orderco")).toEqual(rowOf(reversed.body, "orderco"));
    // The basis of the largest amount, and the first by the order of the text when two have it.
    expect(rowOf(forward.body, "orderco").newest[0]).toEqual({
      caseNumber: "X100001",
      day: "2024-03-05",
      amount: 900,
      basis: "Basis A",
    });
  });
});

describe("the summary", () => {
  const entity = (over: Partial<FtcPenaltyRow> = {}): FtcPenaltyRow => ({
    id: "worstco",
    display: "Worstco, Inc.",
    names: ["Worstco, Inc."],
    orders: 6,
    firstYear: 2001,
    lastYear: 2026,
    total: 7_654_321_098,
    noAmount: 0,
    newest: [3, 2, 1].map((at) => ({
      caseNumber: `X99999${at}`,
      day: `202${at}-12-31`,
      amount: 1_234_567_890.12,
      basis: `${"Violations of a very long statute named at length ".repeat(4)}${at}`.slice(0, 120),
    })),
    cases: ["X999993", "X999992", "X999991"],
    publishedAt: "2023-12-31",
    ...over,
  });

  it("stays under 1,300 characters for the worst row, with its closing sentence", () => {
    const longest = entity({ display: "W".repeat(100) });
    const summary = ftcPenaltiesSummaryOf(longest);
    expect(summary.length).toBeLessThanOrEqual(1300);
    expect(summary.endsWith(CLOSING)).toBe(true);
    expect(summary.startsWith("FTC civil penalty cases (ftc.gov)")).toBe(true);
    // The basis is cut to 90 characters.
    expect(summary).not.toContain(
      "a very long statute named at length Violations of a very long statute named at length Violations of a very long statute named at length Violations of a very long",
    );
  });

  it("drops the third newest order first, then the second, then cuts the name: the closing sentence is never cut", () => {
    const row = entity({ display: "W".repeat(100) });
    const full = ftcPenaltiesSummaryOf(row);
    const entries = (text: string): number => (text.match(/, case X99999/g) ?? []).length;
    expect(entries(full)).toBe(3);
    const seen: number[] = [];
    for (let max = full.length; max >= CLOSING.length + 80; max -= 1) {
      const summary = ftcPenaltiesSummaryOf(row, max);
      expect(summary.length).toBeLessThanOrEqual(max);
      expect(summary.endsWith(CLOSING)).toBe(true);
      expect(
        summary.startsWith("FTC civil penalty cases (ftc.gov), an enforcement or case list."),
      ).toBe(true);
      const count = entries(summary);
      if (seen[seen.length - 1] !== count) seen.push(count);
    }
    // 3, then 2, then 1 entry: no entry is cut in two, and the newest is the last to go.
    expect(seen.slice(0, 3)).toEqual([3, 2, 1]);
    const two = ftcPenaltiesSummaryOf(row, full.length - 1);
    expect(two).toContain("2023-12-31");
    expect(two).toContain("2022-12-31");
    expect(two).not.toContain("2021-12-31");
  });

  it("is the whole text when it fits, and never longer than the limit that is asked", () => {
    const row = entity();
    const full = ftcPenaltiesSummaryOf(row, 1300);
    expect(ftcPenaltiesSummaryOf(row, full.length)).toBe(full);
    expect(ftcPenaltiesSummaryOf(row, full.length + 500)).toBe(full);
  });
});

describe("the download", () => {
  const rows = withFillers(...EXAMPLE_ROWS);

  /** The calls of a download in the order they were made, the fetches and the pauses. */
  async function eventsOf(files: Record<string, FakeFile>): Promise<{
    events: string[];
    snapshot: Snapshot | "unchanged";
    calls: ReturnType<typeof fakeFetch>["calls"];
  }> {
    const events: string[] = [];
    const base = fakeFetch(files);
    const fetch: ConnectorFetch = async (url, validators, limits) => {
      events.push(`get ${url}`);
      return base(url, validators, limits);
    };
    const sleep: Sleep = async (ms) => {
      events.push(`sleep ${ms}`);
    };
    const snapshot = await createFtcPenaltiesConnector({ sleep }).download(fetch, {});
    return { events, snapshot, calls: base.calls };
  }

  it("asks the catalogue, waits the 5 seconds of the FTC, and asks the workbook that the catalogue names", async () => {
    const { events, calls } = await eventsOf(filesOf(rows));
    expect(events).toEqual([`get ${DATA_JSON_URL}`, "sleep 5000", `get ${WORKBOOK_URL}`]);
    // A copy that is current is told by the hash of the body, not by a conditional request.
    expect(calls.map((call) => call.validators)).toEqual([{}, {}]);
    expect(calls[0].limits).toEqual({
      maxBytes: 1_048_576,
      allowedContentTypes: ["application/json"],
      totalTimeoutMs: 60_000,
    });
    expect(calls[1].limits).toEqual({
      maxBytes: 4_194_304,
      allowedContentTypes: [XLSX_TYPE, "application/octet-stream"],
      totalTimeoutMs: 120_000,
    });
  });

  it("pauses once, for the milliseconds that kit/pause.ts holds for the FTC", async () => {
    const { sleep } = await run(rows);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("gives a snapshot of one body, with the prefix of the version alone as its etag and no date", async () => {
    const { snapshot } = await run(rows);
    expect(snapshot.bodies).toHaveLength(1);
    expect(snapshot.etag).toBe("k1:");
    expect(snapshot.lastModified).toBeNull();
    const catalogue = Buffer.byteLength(catalogueOf());
    const workbook = workbookOf(rows).length;
    expect(snapshot.bytes).toBe(catalogue + workbook);
  });

  it("asks the same two requests, with no validators, each time: a copy is never told unchanged by the server", async () => {
    const connector = createFtcPenaltiesConnector({ sleep: async () => undefined });
    const fetch = fakeFetch(filesOf(rows));
    const first = await connector.download(fetch, {});
    if (first === "unchanged") throw new Error("unchanged");
    const second = await connector.download(fetch, {
      etag: first.etag,
      lastModified: first.lastModified,
    });
    expect(second).not.toBe("unchanged");
    expect(fetch.calls.map((call) => call.url)).toEqual([
      DATA_JSON_URL,
      WORKBOOK_URL,
      DATA_JSON_URL,
      WORKBOOK_URL,
    ]);
    expect(fetch.calls.every((call) => Object.keys(call.validators).length === 0)).toBe(true);
    expect((second as Snapshot).bodies).toEqual(first.bodies);
  });

  it("follows the address of the fiscal year that the catalogue gives, and never asks the fixed one", async () => {
    const next =
      "https://www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2027.xlsx";
    const files = filesOf(rows, { catalogue: catalogueOf({ url: next }) });
    files[next] = files[WORKBOOK_URL];
    delete files[WORKBOOK_URL];
    const { events } = await eventsOf(files);
    expect(events).toEqual([`get ${DATA_JSON_URL}`, "sleep 5000", `get ${next}`]);
  });

  it("takes the address from the one distribution that is a workbook of the FTC, among others", async () => {
    const distribution = [
      { downloadURL: "https://www.ftc.gov/system/files/ftc_gov/data/ZZ-penalties.csv" },
      { downloadURL: 42 },
      "not an object",
      { downloadURL: WORKBOOK_URL },
    ];
    const { body } = await run(rows, { catalogue: catalogueOf({ distribution }) });
    expect(body.total).toBe(313);
  });

  it("reads a catalogue whose keys are named like the properties of an object", async () => {
    const text = catalogueOf().replace("{", '{"__proto__":{"polluted":true},"constructor":1,');
    const { body } = await run(rows, { catalogue: text });
    expect(body.total).toBe(313);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  describe("fails as not the list when the catalogue", () => {
    const notTheList = async (catalogue: string): Promise<void> => {
      const { connector, sleep } = connectorWithSleep();
      const fetch = fakeFetch(filesOf(rows, { catalogue }));
      expect(await failureOf(connector.download(fetch, {}))).toBeInstanceOf(NotTheListError);
      // The workbook is never asked, and nothing is waited for.
      expect(fetch.calls.map((call) => call.url)).toEqual([DATA_JSON_URL]);
      expect(sleep).not.toHaveBeenCalled();
    };
    const dataset = (title: string, distribution: unknown) => ({ title, distribution });

    it.each([
      ["is no JSON", "<html><body>Maintenance</body></html>"],
      ["is empty", ""],
      ["is null", "null"],
      ["is an array", "[]"],
      ["is a number", "7"],
      ["has no datasets", "{}"],
      ["has datasets that are no list", '{"dataset":{"title":"x"}}'],
      ["has no dataset of the title", catalogueOf({ title: "Another dataset" })],
      ["has a title in another case", catalogueOf({ title: DATASET_TITLE.toLowerCase() })],
      [
        "has two datasets of the title",
        catalogueOf({
          datasets: [
            dataset(DATASET_TITLE, [{ downloadURL: WORKBOOK_URL }]),
            dataset(DATASET_TITLE, [{ downloadURL: WORKBOOK_URL }]),
          ],
        }),
      ],
      [
        "has a dataset with no distribution",
        catalogueOf({ datasets: [dataset(DATASET_TITLE, undefined)] }),
      ],
      [
        "has a dataset whose distribution is no list",
        catalogueOf({ datasets: [dataset(DATASET_TITLE, {})] }),
      ],
      [
        "has a distribution with no workbook",
        catalogueOf({ distribution: [{ mediaType: "text/csv" }] }),
      ],
      [
        "has two distributions that are the workbook",
        catalogueOf({
          distribution: [
            { downloadURL: WORKBOOK_URL },
            { downloadURL: WORKBOOK_URL.replace("2026", "2027") },
          ],
        }),
      ],
    ])("%s", async (_name, catalogue) => {
      await notTheList(catalogue);
    });

    it.each([
      [
        "another host",
        "https://files.example.org/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "a host that begins with the FTC's",
        "https://www.ftc.gov.example.org/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "the host without www",
        "https://ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "a host in upper case",
        "https://WWW.FTC.GOV/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "another directory",
        "https://www.ftc.gov/system/files/ftc_gov/data/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "a path that climbs",
        "https://www.ftc.gov/system/files/ftc_gov/documents/../data/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "another file name",
        "https://www.ftc.gov/system/files/ftc_gov/documents/other_cases_fy2000-2026.xlsx",
      ],
      [
        "no https",
        "http://www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "a query",
        "https://www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx?x=1",
      ],
      [
        "a fragment",
        "https://www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx#x",
      ],
      [
        "a user name",
        "https://user@www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "a port",
        "https://www.ftc.gov:8443/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      ["a line break after it", `${WORKBOOK_URL}\n`],
      ["an extension that is not xlsx", WORKBOOK_URL.replace(".xlsx", ".csv")],
      ["the year 2025, a fiscal year below 26", WORKBOOK_URL.replace("2026", "2025")],
      ["the year 2000, a fiscal year below 26", WORKBOOK_URL.replace("2026", "2000")],
      ["a year of three digits", WORKBOOK_URL.replace("2026", "202")],
      ["a year past the century", WORKBOOK_URL.replace("2026", "2126")],
    ])("names a download on %s", async (_name, url) => {
      await notTheList(catalogueOf({ url }));
    });

    it.each(["2026", "2027", "2030", "2099"])("accepts the fiscal year %s", async (year) => {
      const url = WORKBOOK_URL.replace("2026", year);
      const files = filesOf(rows, { catalogue: catalogueOf({ url }) });
      files[url] = files[WORKBOOK_URL];
      const connector = createFtcPenaltiesConnector({ sleep: async () => undefined });
      expect(await connector.download(fakeFetch(files), {})).not.toBe("unchanged");
    });
  });

  describe("fails, and never gives a shorter list, when", () => {
    it("the catalogue cannot be asked: nothing is waited for and the workbook is not asked", async () => {
      const { connector, sleep } = connectorWithSleep();
      const files = filesOf(rows);
      delete files[DATA_JSON_URL];
      const fetch = fakeFetch(files);
      const failure = await failureOf(connector.download(fetch, {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("the workbook cannot be asked, after the pause", async () => {
      const { connector, sleep } = connectorWithSleep();
      const files = filesOf(rows);
      delete files[WORKBOOK_URL];
      const failure = await failureOf(connector.download(fakeFetch(files), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["the catalogue", DATA_JSON_URL, "text/html"],
      ["the workbook", WORKBOOK_URL, "text/html"],
      ["the workbook", WORKBOOK_URL, "application/json"],
      ["the catalogue", DATA_JSON_URL, "application/octet-stream"],
    ])("%s has a type that is not allowed for it (%s as %s)", async (_name, url, type) => {
      const files = filesOf(rows);
      files[url] = { ...files[url], contentType: type };
      const failure = await downloadFailureOf(files);
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unsupported_type");
    });

    it("the workbook has the type of an unknown file, which the FTC may send, and is read", async () => {
      const files = filesOf(rows);
      files[WORKBOOK_URL] = { ...files[WORKBOOK_URL], contentType: "application/octet-stream" };
      expect(await downloadFailureOf(files)).toBeUndefined();
    });

    it("the catalogue is cut at its limit of 1 MiB", async () => {
      const big = catalogueOf().replace("ZZ-DATASET-TEXT", "x".repeat(1_048_576));
      expect(await downloadFailureOf(filesOf(rows, { catalogue: big }))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("the catalogue is cut, whatever its size says", async () => {
      const files = filesOf(rows, { dataJson: { truncated: true } });
      expect(await downloadFailureOf(files)).toBeInstanceOf(BodyTooLargeError);
    });

    it("the workbook is cut at its limit of 4 MiB", async () => {
      const big = writeZip([{ name: "xl/big.bin", data: Buffer.alloc(4_300_000, 7), method: 0 }]);
      expect(big.length).toBeGreaterThan(4_194_304);
      expect(await downloadFailureOf(filesOf(big))).toBeInstanceOf(BodyTooLargeError);
    });

    it("the workbook is cut, whatever its size says", async () => {
      const files = filesOf(rows, { workbook: { truncated: true } });
      expect(await downloadFailureOf(files)).toBeInstanceOf(BodyTooLargeError);
    });

    it.each([
      ["the catalogue", DATA_JSON_URL],
      ["the workbook", WORKBOOK_URL],
    ])(
      "%s answers with a 304, to a request that sent nothing to be compared",
      async (_name, url) => {
        const { connector } = connectorWithSleep();
        const base = fakeFetch(filesOf(rows));
        const fetch: ConnectorFetch = async (asked, validators, limits) =>
          asked === url ? { notModified: true, url } : base(asked, validators, limits);
        const failure = await failureOf(connector.download(fetch, {}));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unreachable");
      },
    );
  });

  describe("fails as not allowed, naming no address, when an answer comes from", () => {
    const notAllowed = async (files: Record<string, FakeFile>): Promise<void> => {
      const failure = await downloadFailureOf(files);
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
      expect(String((failure as Error).message)).not.toMatch(/ftc|example|http/i);
    };

    it.each([
      ["another host", "https://files.example.org/data.json"],
      ["a host that has the FTC's inside it", "https://www.ftc.gov.example.org/data.json"],
      ["another path of the FTC", "https://www.ftc.gov/other.json"],
      ["a path that only begins as the catalogue's does", "https://www.ftc.gov/data.json.bak"],
      ["the host without www", "https://ftc.gov/data.json"],
      ["a port", "https://www.ftc.gov:8443/data.json"],
      ["no https", "http://www.ftc.gov/data.json"],
    ])("the catalogue, at %s", async (_name, url) => {
      const files = filesOf(rows);
      files[DATA_JSON_URL] = { ...files[DATA_JSON_URL], url };
      await notAllowed(files);
    });

    it.each([
      [
        "another host",
        "https://files.example.org/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "another directory of the FTC",
        "https://www.ftc.gov/system/files/ftc_gov/data/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "a directory that only begins as the FTC's does",
        "https://www.ftc.gov/system/files/ftc_gov/documents-other/civil_penalty_cases_fy2000-2026.xlsx",
      ],
      [
        "no https",
        "http://www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026.xlsx",
      ],
    ])("the workbook, at %s", async (_name, url) => {
      const files = filesOf(rows);
      files[WORKBOOK_URL] = { ...files[WORKBOOK_URL], url };
      await notAllowed(files);
    });

    it("accepts a redirect to another file of the directory of the FTC's files", async () => {
      const files = filesOf(rows);
      files[WORKBOOK_URL] = {
        ...files[WORKBOOK_URL],
        url: "https://www.ftc.gov/system/files/ftc_gov/documents/civil_penalty_cases_fy2000-2026_v2.xlsx",
      };
      expect(await downloadFailureOf(files)).toBeUndefined();
    });
  });

  describe("with the real sleep", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("waits the 5 seconds before it asks the workbook, and not a millisecond less", async () => {
      const fetch = fakeFetch(filesOf(rows));
      const download = ftcPenaltiesConnector.download(fetch, {});
      await jest.advanceTimersByTimeAsync(0);
      expect(fetch.calls.map((call) => call.url)).toEqual([DATA_JSON_URL]);
      await jest.advanceTimersByTimeAsync(4_999);
      expect(fetch.calls.map((call) => call.url)).toEqual([DATA_JSON_URL]);
      await jest.advanceTimersByTimeAsync(1);
      const snapshot = await download;
      expect(snapshot).not.toBe("unchanged");
      expect(fetch.calls.map((call) => call.url)).toEqual([DATA_JSON_URL, WORKBOOK_URL]);
    });
  });

  /** The failure of a download from files, undefined when it went through. */
  async function downloadFailureOf(files: Record<string, FakeFile>): Promise<unknown> {
    const { connector } = connectorWithSleep();
    return failureOf(connector.download(fakeFetch(files), {}));
  }
});

describe("the connector", () => {
  it("is a snapshot connector of the list, at the version of its reading", () => {
    expect(ftcPenaltiesConnector.id).toBe(SOURCE_ID);
    expect(ftcPenaltiesConnector.version).toBe(1);
    expect(ftcPenaltiesConnector.kind).toBeUndefined();
  });

  it("is made by a factory that takes the sleep, and the real one when it is given none", () => {
    expect(createFtcPenaltiesConnector().id).toBe(SOURCE_ID);
    expect(createFtcPenaltiesConnector({}).version).toBe(1);
  });

  it("is deterministic: the order of the rows of the sheet never changes the bodies or the records", async () => {
    const rows = withFillers(
      ...EXAMPLE_ROWS,
      caseRow({ name: "Brightline Widgets, Inc. / Betapair LLC", number: "X100201" }),
    );
    const { connector } = connectorWithSleep();
    await expectDeterministic(connector, (reversed) =>
      fakeFetch(filesOf(reversed ? [...rows].reverse() : rows)),
    );
  });

  it("finds no list in a body that is not the one the download makes", () => {
    const { connector } = connectorWithSleep();
    for (const text of [
      "not json",
      "{}",
      '{"v":2,"rows":[],"total":0,"unreadable":0}',
      "[]",
      "null",
    ]) {
      const parsed = connector.parse({ bodies: [text], etag: null, lastModified: null, bytes: 0 });
      expect(parsed.root).toBeNull();
      expect(parsed.errors).toBe(1);
      expect(parsed.records).toEqual([]);
    }
    const twice = connector.parse({
      bodies: ["{}", "{}"],
      etag: null,
      lastModified: null,
      bytes: 0,
    });
    expect(twice.root).toBeNull();
  });
});

describe("the rows that do not parse", () => {
  const withBadRows = (count: number): CaseRow[] =>
    withFillers(
      ...Array.from({ length: count }, (_, at) =>
        caseRow({ name: `Badrowco${at}, Inc.`, number: "not a number" }),
      ),
    );

  it("are counted, and left out up to ten", async () => {
    const { body, parsed } = await run(withBadRows(10));
    expect(body.unreadable).toBe(10);
    expect(parsed.skipped).toBe(10);
    expect(parsed.errors).toBe(0);
    expect(parsed.records).toHaveLength(310);
    expect(parsed.root).toBe(SHEET_NAME);
  });

  it("are errors when there are more than that, and the sync fails", async () => {
    const { parsed } = await run(withBadRows(11));
    expect(parsed.errors).toBe(11);
    expect(parsed.skipped).toBe(0);
  });

  it("are counted too when the record builder refuses a row of the body, as unreadable entries", async () => {
    const { connector } = connectorWithSleep();
    const { snapshot, body } = await run(withFillers(...EXAMPLE_ROWS));
    const rows = body.rows.map((row, at) => (at < 10 ? { ...row, id: "" } : row));
    const make = (broken: number) =>
      connector.parse({
        ...snapshot,
        bodies: [
          JSON.stringify({
            ...body,
            rows: body.rows.map((row, at) => (at < broken ? { ...row, id: "" } : row)),
          }),
        ],
      });
    expect(rows).toHaveLength(body.rows.length);
    expect(make(10)).toMatchObject({ errors: 0, skipped: 10 });
    expect(make(11)).toMatchObject({ errors: 11, skipped: 0 });
  });
});

describe("hostile cells", () => {
  it("are cleaned: no control character, no hidden one, no angle bracket, in any record", async () => {
    const hostile = [
      `Evil${cp(0x202e)}corp${cp(0x200b)}, In${cp(0x1)}c.${cp(0x7)} <script>alert(1)</script> ${cp(0xff1c)}b${cp(0xff1e)}`,
      `Replaced${cp(0xfffd)}co Corp`,
      `Cafe${cp(0x301)}ine Corp ${cp(0x2028)}Ltd`,
    ];
    const rows = withFillers(
      ...hostile.map((name, at) =>
        caseRow({
          name,
          number: `X5${String(at).padStart(5, "0")}`,
          basis: `Basis ${cp(0x202e)}with <b>markup</b> and ${cp(0x0)} controls`,
        }),
      ),
    );
    const { parsed } = await run(rows);
    expect(parsed.errors).toBe(0);
    expectWellFormedRecords(parsed.records, {
      sourceId: SOURCE_ID,
      mark: FTC_PENALTIES_RECORD_MARK,
    });
    const everything = JSON.stringify(parsed.records);
    expect(everything).not.toContain("<");
    expect(everything).not.toContain(">");
    expect(everything).not.toMatch(/[\u0000-\u001f\u007f\u202e\u200b]/u);
  });

  it("are cut: a cell of 100 KB in the basis gives a record that is under the limit, with the closing sentence", async () => {
    const rows = withFillers(caseRow({ name: "Hugebasisco, Inc.", basis: "B".repeat(100_000) }));
    const { parsed, body } = await run(rows);
    const summary = recordOf(parsed, "hugebasisco").summary;
    expect(summary.length).toBeLessThanOrEqual(1300);
    expect(summary.endsWith(CLOSING)).toBe(true);
    expect(summary).toContain("[shortened]");
    expect(JSON.stringify(rowOf(body, "hugebasisco")).length).toBeLessThan(1000);
  });

  it("make the row unreadable when the cell of a name or a number was cut", async () => {
    const rows = withFillers(
      caseRow({ name: `Hugenameco ${"x".repeat(100_000)}, Inc.`, number: "X100301" }),
      caseRow({
        name: "Hugenumberco, Inc.",
        number: `X100302${" ".repeat(10)}${"y".repeat(100_000)}`,
      }),
      caseRow({ name: "Cutco, Inc.", number: "X100303" }),
    );
    const { body, parsed } = await run(rows);
    expect(body.unreadable).toBe(1);
    expect(body.rows.some((row) => row.id.startsWith("hugename"))).toBe(false);
    expect(parsed.records.some((record) => record.sourceRecordId === "cutco")).toBe(true);
    // The number is read out of the start of its cell, whatever follows.
    expect(rowOf(body, "hugenumberco").cases).toEqual(["X100302"]);
  });

  it("do not make an id of anything but letters and digits: a name of marks and symbols gives no entity", async () => {
    const rows = withFillers(
      caseRow({ name: "!!!!, Inc.", number: "X100311" }),
      caseRow({ name: "----", number: "X100312" }),
    );
    const { body, parsed } = await run(rows);
    expect(body.rows.some((row) => /^[^\p{L}\p{N}]*$/u.test(row.id))).toBe(false);
    expectWellFormedRecords(parsed.records, {
      sourceId: SOURCE_ID,
      mark: FTC_PENALTIES_RECORD_MARK,
    });
  });
});

describe("what a failure and a log hold", () => {
  it("is never an address, a message of the file or a row: the errors are fixed words", async () => {
    const rows = withFillers(...EXAMPLE_ROWS);
    const failures = [
      await downloadFailure(workbookOf(rows, { footer: { count: 1 } })),
      await downloadFailure(rows, { catalogue: "{}" }),
      await downloadFailure(Buffer.from("not a workbook")),
      await downloadFailure(fillerRows(4996)),
    ];
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(Error);
      const message = String((failure as Error).message);
      expect(message).not.toMatch(/ftc|http|examplecorp|ZZ-|X100001/i);
    }
  });

  it("writes nothing to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      await run(withFillers(...EXAMPLE_ROWS));
      await downloadFailure(Buffer.from("not a workbook"));
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
