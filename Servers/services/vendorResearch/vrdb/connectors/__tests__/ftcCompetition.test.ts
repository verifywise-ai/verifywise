/**
 * The FTC nonmerger enforcement actions as a list of the vendor risk database: one CSV file that the
 * FTC publishes with its open data, whose bytes are windows-1252 although its Content-Type says
 * UTF-8, and whose matter titles hold the parties (a record is made for each party read from a
 * title). The files are synthetic: they copy the shape of the FTC's (CRLF, a quoted header, the
 * fiscal year and the day unquoted, a day written month first with no padding and a time of 0:00:00,
 * a hyperlink cell in the three forms of a spreadsheet's export) with every name, number and text
 * invented. A character that the file holds in windows-1252 is written with its byte, and no
 * character is written as an escape in this file, so that none is decoded by an editor.
 */
import type { VrdbSourceId } from "../../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import {
  FTC_COMPETITION_RECORD_MARK,
  type FtcCompetitionRow,
  ftcCompetitionConnector,
  ftcCompetitionPartiesOf,
  ftcCompetitionSummaryOf,
} from "../ftcCompetition";
import {
  BodyTooLargeError,
  type Connector,
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

const SOURCE_ID: VrdbSourceId = "ftc_competition";

const FILE_URL =
  "https://www.ftc.gov/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions.csv";
const ROOT = "FTC-Nonmerger-Enforcement-Actions.csv";
const DOCUMENTATION_URL =
  "https://catalog.data.gov/dataset/ftc-nonmerger-enforcement-actions?party=";
const LAST_MODIFIED = "Wed, 04 Nov 2026 10:00:00 GMT";

const HEADER = [
  "MatterEnforcementFY",
  "MatterEnforcementDate",
  "MatterNumber",
  "MatterName",
  "MatterEnforcementType",
  "MatterIndustry",
  "Matterhyperlink",
];

const CLOSING =
  "VerifyWise read the party from the matter title, so it may be another company of the same " +
  "name or a group of firms; an enforcement action is not a finding that the vendor broke the " +
  "law. Not endorsed by the FTC; adapted by VerifyWise.";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

/** The bytes that windows-1252 gives the few characters that these tests write above 0x7f. */
const WINDOWS_1252: ReadonlyMap<number, number> = new Map([
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x2019, 0x92],
  [0xe9, 0xe9],
]);

/** The bytes of 0x80 to 0x9f that windows-1252 leaves undefined, which a decoder reads as the control of that number. */
const UNDEFINED_BYTES: readonly number[] = [0x81, 0x8d, 0x8f, 0x90, 0x9d];

/**
 * A text as the file has it: windows-1252, one byte for each character. It holds only what that
 * charset can write: a character that it cannot (a hidden or a bidirectional one) is a mistake of the
 * test, and a hostile file cannot hold one either.
 */
function encode(text: string): Buffer {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    const same = code < 0x80 || (code >= 0xa0 && code <= 0xff) || UNDEFINED_BYTES.includes(code);
    const byte = same ? code : WINDOWS_1252.get(code);
    if (byte === undefined)
      throw new Error("A character that the encoder of the test does not know.");
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

/** A row of the file as a test writes it. */
interface MatterRow {
  number: string;
  /** `YYYY-MM-DD` is written as the file writes a day; `{ text }` is written as it is. */
  date: string | { text: string };
  title: string;
  type?: string;
  industry?: string;
  /** The hyperlink cell as it is. */
  link?: string;
  /** The fiscal year as the file writes it; by default the one that the day belongs to. */
  fy?: number | string;
  /** The whole line as it is, in place of the one made of the cells. */
  line?: string;
}

const quoted = (text: string): string => `"${text.replace(/"/g, '""')}"`;

/** `2023-05-10` as `5/10/2023 0:00:00`: month first, no padding, the time the file always gives. */
function dayText(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${month}/${date}/${year} 0:00:00`;
}

/** The fiscal year of a day: the year that ends on the 30th of September, so October counts to the next. */
function fiscalYearOf(day: string): number {
  const [year, month] = day.split("-").map(Number);
  return month >= 10 ? year + 1 : year;
}

function lineOfRow(row: MatterRow): string {
  if (row.line !== undefined) return row.line;
  const day = typeof row.date === "string" ? row.date : "2000-01-01";
  return [
    String(row.fy ?? fiscalYearOf(day)),
    typeof row.date === "string" ? dayText(row.date) : row.date.text,
    quoted(row.number),
    quoted(row.title),
    quoted(row.type ?? "Consent order"),
    quoted(row.industry ?? "Synthetic industry"),
    quoted(row.link ?? ""),
  ].join(",");
}

interface CsvOptions {
  header?: readonly string[];
  lineBreak?: string;
  /** Text added after the last line as it is. */
  tail?: string;
}

/** The file of rows: a quoted header, the lines, CRLF at the end of each. */
function csvOf(rows: readonly MatterRow[], options: CsvOptions = {}): Buffer {
  const lineBreak = options.lineBreak ?? "\r\n";
  const header = (options.header ?? HEADER).map(quoted).join(",");
  const lines = [header, ...rows.map(lineOfRow)];
  return encode(`${lines.join(lineBreak)}${lineBreak}${options.tail ?? ""}`);
}

/** The day of a filler row: every year from 1996 to 2025, so that the earliest is in 1996. */
const dayOfFiller = (at: number): string =>
  `${1996 + (at % 30)}-${String(1 + (at % 12)).padStart(2, "0")}-${String(1 + (at % 28)).padStart(2, "0")}`;

/** Rows that make the file as long as the real one is, each with a party of its own. */
const fillerRows = (count: number): MatterRow[] =>
  Array.from({ length: count }, (_, at) => ({
    number: String(2000000 + at),
    date: dayOfFiller(at),
    title: `Fillerparty${String(at).padStart(4, "0")} Inc`,
    link: `#https://www.ftc.gov/filler/${at}#`,
  }));

const FILLERS = fillerRows(160);

/** The rows of a test, with the filler rows after them: the floors of the file hold. */
const withFillers = (...rows: MatterRow[]): MatterRow[] => [...rows, ...FILLERS];

const matter = (over: Partial<MatterRow> & Pick<MatterRow, "title">): MatterRow => ({
  number: "1110001",
  date: "2023-05-10",
  ...over,
});

const LINK_ONE = "https://www.ftc.gov/legal-library/browse/cases-proceedings/1110001-examplenet";
const LINK_THREE =
  "https://www.ftc.gov/legal-library/browse/cases-proceedings/1110003-example-pharma";

/** The four rows that the tests of the whole list read, which name four parties. */
const EXAMPLE_ROWS: MatterRow[] = [
  {
    number: "1110001",
    date: "2023-05-10",
    title: "Examplenet/Sample Federation of Advertisers (Exampleco)",
    type: "Consent order",
    industry: "Advertising",
    link: `#${LINK_ONE}#`,
  },
  {
    number: "1110002",
    date: "2019-11-20",
    title: "Examplenet",
    type: "Federal court",
    industry: "Technology",
    link: "",
  },
  {
    number: "1110003",
    date: "2021-03-04",
    title: "Example Pharma - Jordan Sample Appeal",
    type: "Federal court",
    industry: "Pharmaceuticals",
    link: `Example#${LINK_THREE}#`,
  },
  {
    number: "1110004",
    date: "2022-08-15",
    title: "FTC v Examplecast Inc",
    type: "Administrative",
    industry: "Media",
    link: "http://www.ftc.gov/os/2022/08/1110004.pdf",
  },
];

/** The files of the list, as the fake fetch serves them. */
function filesOf(
  rows: readonly MatterRow[] | Buffer,
  over: Partial<FakeFile> = {},
): Record<string, FakeFile> {
  return {
    [FILE_URL]: {
      body: Buffer.isBuffer(rows) ? rows : csvOf(rows),
      contentType: "text/csv; charset=UTF-8",
      lastModified: LAST_MODIFIED,
      ...over,
    },
  };
}

/** What the body of a snapshot holds. */
interface Body {
  v: number;
  rows: FtcCompetitionRow[];
  total: number;
  unreadable: number;
}

interface Run {
  snapshot: Snapshot;
  body: Body;
  parsed: ParseResult;
  fetch: ReturnType<typeof fakeFetch>;
}

/** Downloads and parses a list of rows, through the fake fetch. */
async function run(
  rows: readonly MatterRow[] | Buffer,
  over: Partial<FakeFile> = {},
): Promise<Run> {
  const fetch = fakeFetch(filesOf(rows, over));
  const snapshot = await ftcCompetitionConnector.download(fetch, {});
  if (snapshot === "unchanged") throw new Error("The fake fetch answered unchanged.");
  return {
    snapshot,
    body: JSON.parse(snapshot.bodies[0]) as Body,
    parsed: ftcCompetitionConnector.parse(snapshot),
    fetch,
  };
}

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** The failure of a download of rows, through the fake fetch. */
const downloadFailure = (
  rows: readonly MatterRow[] | Buffer,
  over: Partial<FakeFile> = {},
): Promise<unknown> =>
  failureOf(ftcCompetitionConnector.download(fakeFetch(filesOf(rows, over)), {}));

const rowOf = (body: Body, id: string): FtcCompetitionRow => {
  const found = body.rows.find((row) => row.id === id);
  if (found === undefined) throw new Error(`No party ${id} in the body.`);
  return found;
};

const recordOf = (parsed: ParseResult, id: string): ParsedRecord => {
  const found = parsed.records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}.`);
  return found;
};

describe("the file", () => {
  describe("the list as a whole", () => {
    it("gives one entity for each party read from a title, sorted by its id", async () => {
      const { body } = await run(withFillers(...EXAMPLE_ROWS));
      expect(body.v).toBe(1);
      expect(body.total).toBe(164);
      expect(body.unreadable).toBe(0);
      expect(body.rows).toHaveLength(164);
      const ids = body.rows.map((row) => row.id);
      expect(ids).toEqual([...ids].sort());
      expect(ids).toEqual(
        expect.arrayContaining([
          "examplenet",
          "samplefederationofadvertisers",
          "examplepharma",
          "examplecast",
          "fillerparty0000",
        ]),
      );
    });

    it("keeps for a party its matters, years, newest matters, numbers, link and newest day", async () => {
      const { body } = await run(withFillers(...EXAMPLE_ROWS));
      expect(rowOf(body, "examplenet")).toEqual({
        id: "examplenet",
        display: "Examplenet",
        names: ["Examplenet"],
        matters: 2,
        firstYear: 2019,
        lastYear: 2023,
        newest: [
          {
            number: "1110001",
            day: "2023-05-10",
            title: "Examplenet/Sample Federation of Advertisers",
            type: "Consent order",
            industry: "Advertising",
          },
          {
            number: "1110002",
            day: "2019-11-20",
            title: "Examplenet",
            type: "Federal court",
            industry: "Technology",
          },
        ],
        numbers: ["1110001", "1110002"],
        url: LINK_ONE,
        publishedAt: "2023-05-10",
      });
    });

    it("gives the root of the list, no error and the newest day of the list as its version", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      const { parsed } = await run(rows);
      expect(parsed.root).toBe(ROOT);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      const days = rows.map((row) => (typeof row.date === "string" ? row.date : ""));
      expect(parsed.sourceVersion).toBe(days.sort().slice(-1)[0]);
    });

    it("reads a file whose lines end in a line feed only, and one that has no line end at its end", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      const { body } = await run(csvOf(rows, { lineBreak: "\n" }));
      expect(body.total).toBe(164);
      const whole = csvOf(rows).toString("latin1").replace(/\r\n$/, "");
      const { body: bare } = await run(Buffer.from(whole, "latin1"));
      expect(bare.total).toBe(164);
    });
  });

  describe("the decoding", () => {
    const dash = cp(0x2013);

    it("is windows-1252 whatever the Content-Type says: the byte 0x96 is an en dash, never U+FFFD", async () => {
      const rows = withFillers(
        matter({
          title: "Dashnet",
          industry: `Synthetic${dash}industry`,
          type: `Order${dash}final`,
        }),
      );
      const bytes = csvOf(rows);
      // The file holds the byte, not the character as UTF-8 would write it.
      expect(bytes.includes(0x96)).toBe(true);
      expect(bytes.includes(Buffer.from(dash, "utf8"))).toBe(false);
      for (const contentType of [
        "text/csv; charset=UTF-8",
        "text/csv",
        "text/csv; charset=iso-8859-1",
        "text/csv; charset=windows-1252",
      ]) {
        const { body } = await run(bytes, { contentType });
        const first = rowOf(body, "dashnet").newest[0];
        expect(first.industry).toBe(`Synthetic${dash}industry`);
        expect(first.type).toBe(`Order${dash}final`);
        expect(JSON.stringify(body)).not.toContain(cp(0xfffd));
      }
    });

    it("reads the other bytes above 0x7f of windows-1252 as its letters, in a title as in an industry", async () => {
      const accent = cp(0xe9);
      const { body } = await run(withFillers(matter({ title: `Caf${accent}net Inc` })));
      const entity = body.rows.find((row) => row.id.startsWith("caf") && row.id.endsWith("net"));
      expect(entity?.display).toBe(`Caf${accent}net Inc`);
      expect(entity?.id).toBe(`caf${accent}net`);
    });

    it("does not read the en dash of a title as the ' - ' that ends a title", async () => {
      const { body } = await run(withFillers(matter({ title: `Dashnet ${dash} Dashsub Inc` })));
      expect(body.rows.some((row) => row.display.startsWith("Dashnet"))).toBe(true);
    });
  });

  describe("the header", () => {
    it("is the seven names in order, compared in any case and after a trim", async () => {
      const rows = withFillers(...EXAMPLE_ROWS);
      for (const header of [
        HEADER,
        [
          "MatterEnforcementFY",
          "MatterEnforcementDate",
          "MatterNumber",
          "MatterName",
          "MatterEnforcementType",
          "MatterIndustry",
          "MatterHyperlink",
        ],
        HEADER.map((name) => name.toLowerCase()),
        HEADER.map((name) => name.toUpperCase()),
        HEADER.map((name) => `  ${name} `),
      ]) {
        const { body } = await run(csvOf(rows, { header }));
        expect(body.total).toBe(164);
      }
    });

    it.each([
      ["a name that is another", [...HEADER.slice(0, 3), "Defendant", ...HEADER.slice(4)]],
      ["two names that are swapped", [HEADER[1], HEADER[0], ...HEADER.slice(2)]],
      ["a name less", HEADER.slice(0, 6)],
      ["a name more", [...HEADER, "MatterExtra"]],
      ["no name", []],
      ["a name twice", [...HEADER.slice(0, 6), "MatterIndustry"]],
    ])("is no list when it has %s", async (_name, header) => {
      const failure = await downloadFailure(csvOf(withFillers(...EXAMPLE_ROWS), { header }));
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it.each([
      ["a page of HTML", "<html><body>Not found</body></html>"],
      ["a text with no rows", "just some text"],
      ["no bytes", ""],
    ])("is no list when the file is %s", async (_name, text) => {
      expect(await downloadFailure(Buffer.from(text))).toBeInstanceOf(NotTheListError);
    });

    it("is no list when the file has a header and no row", async () => {
      expect(await downloadFailure(csvOf([]))).toBeInstanceOf(NotTheListError);
    });
  });

  describe("the number of a matter", () => {
    const numberOk = async (cell: string): Promise<boolean> => {
      const { body } = await run(withFillers(matter({ title: "Numberco Inc", number: cell })));
      return body.rows.some((row) => row.id === "numberco");
    };

    it("is seven digits, and a lower case letter after them when the matter has a part", async () => {
      expect(await numberOk("1234567")).toBe(true);
      expect(await numberOk("1234567a")).toBe(true);
      expect(await numberOk("1234567z")).toBe(true);
      expect(await numberOk("0000001")).toBe(true);
    });

    it("makes the row unreadable when it is anything else", async () => {
      for (const cell of [
        "123456",
        "12345678",
        "1234567A",
        "1234567ab",
        "12345a6",
        "",
        "abcdefg",
        "1234 567",
        "-1234567",
      ]) {
        const { body } = await run(withFillers(matter({ title: "Numberco Inc", number: cell })));
        expect(body.rows.some((row) => row.id === "numberco")).toBe(false);
        expect(body.unreadable).toBe(1);
      }
    });
  });

  describe("the day of a matter", () => {
    const dayOfRow = async (date: MatterRow["date"], fy?: number | string) => {
      const { body } = await run(withFillers(matter({ title: "Zayqo Inc", date, fy })));
      return { entity: body.rows.find((row) => row.id === "zayqo"), body };
    };

    it("is month first with no padding, and a time of 0:00:00", async () => {
      expect((await dayOfRow("2020-05-10")).entity?.publishedAt).toBe("2020-05-10");
      expect((await dayOfRow("2020-01-05")).entity?.publishedAt).toBe("2020-01-05");
      expect((await dayOfRow("2019-12-31")).entity?.publishedAt).toBe("2019-12-31");
      // The file writes 5/10 for the 10th of May, and 10/5 for the 5th of October.
      expect((await dayOfRow({ text: "5/10/2020 0:00:00" }, 2020)).entity?.publishedAt).toBe(
        "2020-05-10",
      );
      expect((await dayOfRow({ text: "10/5/2020 0:00:00" }, 2021)).entity?.publishedAt).toBe(
        "2020-10-05",
      );
      expect((await dayOfRow({ text: "02/05/2020 0:00:00" }, 2020)).entity?.publishedAt).toBe(
        "2020-02-05",
      );
    });

    it("makes the row unreadable when the day does not exist", async () => {
      for (const text of [
        "13/1/2020 0:00:00",
        "0/5/2020 0:00:00",
        "2/30/2020 0:00:00",
        "2/29/2021 0:00:00",
        "4/31/2020 0:00:00",
        "1/0/2020 0:00:00",
        "1/32/2020 0:00:00",
      ]) {
        const { entity, body } = await dayOfRow({ text }, 2020);
        expect(entity).toBeUndefined();
        expect(body.unreadable).toBe(1);
      }
      expect((await dayOfRow({ text: "2/29/2020 0:00:00" }, 2020)).entity?.publishedAt).toBe(
        "2020-02-29",
      );
    });

    it("makes the row unreadable when it is written in another form", async () => {
      for (const text of [
        "2020-05-10",
        "2020-05-10 0:00:00",
        "5/10/20 0:00:00",
        "5/10/2020",
        "5/10/2020 12:00:00",
        "5/10/2020 0:00",
        "5-10-2020 0:00:00",
        "May 10, 2020",
        "",
      ]) {
        const { entity, body } = await dayOfRow({ text }, 2020);
        expect(entity).toBeUndefined();
        expect(body.unreadable).toBe(1);
      }
    });

    it("must belong to the fiscal year that the file states: the year of the 1st of October", async () => {
      // The fiscal year ends on the 30th of September.
      expect((await dayOfRow("2019-09-30", 2019)).entity?.publishedAt).toBe("2019-09-30");
      expect((await dayOfRow("2019-10-01", 2020)).entity?.publishedAt).toBe("2019-10-01");
      for (const [date, fy] of [
        ["2019-09-30", 2020],
        ["2019-10-01", 2019],
        ["2020-05-10", 2019],
        ["2020-05-10", 2021],
        ["2020-05-10", "FY2020"],
        ["2020-05-10", ""],
        ["2020-05-10", "20200"],
      ] as Array<[string, number | string]>) {
        const { entity, body } = await dayOfRow(date, fy);
        expect(entity).toBeUndefined();
        expect(body.unreadable).toBe(1);
      }
    });
  });

  describe("the width of a row", () => {
    it("is seven cells: a row of fewer or more is unreadable, and its cells are never read", async () => {
      const good = lineOfRow(matter({ title: "Widthco Inc" }));
      const short = `2023,5/10/2023 0:00:00,"1110001","ZZ-SHORT Inc","Consent order","Synthetic industry"`;
      const long = `${good},"ZZ-EIGHTH"`;
      const { body, snapshot } = await run(
        withFillers(
          { number: "1110001", date: "2023-05-10", title: "x", line: short },
          { number: "1110001", date: "2023-05-10", title: "x", line: long },
        ),
      );
      expect(body.unreadable).toBe(2);
      expect(snapshot.bodies[0]).not.toContain("ZZ-SHORT");
      expect(snapshot.bodies[0]).not.toContain("ZZ-EIGHTH");
    });

    it("is read with a comma or a line break inside a quoted cell: it is one cell", async () => {
      const { body } = await run(
        withFillers(
          matter({
            title: "Quoteco, Inc.",
            industry: 'A "quoted", industry',
            type: "Line\r\nbreak",
          }),
        ),
      );
      const first = rowOf(body, "quoteco").newest[0];
      expect(first.industry).toBe('A "quoted", industry');
      expect(first.type).toBe("Line break");
      expect(body.unreadable).toBe(0);
    });
  });

  describe("the floors and the caps", () => {
    it("is no list with fewer than 150 rows", async () => {
      expect(await downloadFailure(fillerRows(149))).toBeInstanceOf(NotTheListError);
      const { body } = await run(fillerRows(150));
      expect(body.total).toBe(150);
    });

    it("is no list when the first matter is after 1996-12-31", async () => {
      const late = fillerRows(160).map((row, at) => ({
        ...row,
        date: `${1997 + (at % 28)}-06-15`,
      }));
      expect(await downloadFailure(late)).toBeInstanceOf(NotTheListError);
      const early = late.map((row, at) => (at === 0 ? { ...row, date: "1996-12-31" } : row));
      const { body } = await run(early);
      expect(body.total).toBe(160);
    });

    it("is read whole with a header and 4,999 rows, the 5,000 that the reader allows", async () => {
      const { body } = await run(fillerRows(4999));
      expect(body.total).toBe(4999);
      expect(body.rows).toHaveLength(4999);
    });

    it("fails as too large, and gives no shorter list, with one row more", async () => {
      expect(await downloadFailure(fillerRows(5000))).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails as too large when a row has more than sixteen cells", async () => {
      const wide = { number: "1110001", date: "2023-05-10", title: "x", line: ",".repeat(16) };
      expect(await downloadFailure(withFillers(wide))).toBeInstanceOf(BodyTooLargeError);
      const sixteen = { number: "1110001", date: "2023-05-10", title: "x", line: ",".repeat(15) };
      expect(await downloadFailure(withFillers(sixteen))).toBeUndefined();
    });

    it("fails as too large when a quote is never closed: the file was cut", async () => {
      const book = csvOf(withFillers(...EXAMPLE_ROWS), {
        tail: '2023,5/10/2023 0:00:00,"1110001","Cutco',
      });
      expect(await downloadFailure(book)).toBeInstanceOf(BodyTooLargeError);
    });

    it("reads the longest file it allows in little time", async () => {
      const book = csvOf(fillerRows(4999));
      const start = Date.now();
      await ftcCompetitionConnector.download(fakeFetch(filesOf(book)), {});
      expect(Date.now() - start).toBeLessThan(10_000);
    });
  });
});

describe("ftcCompetitionPartiesOf, the party rule of the matter title", () => {
  const partiesOf = (title: string): string[] => ftcCompetitionPartiesOf(title).parties;

  describe("the vectors of the party rule", () => {
    it("gives two parties for a title with a slash, and none of what a parenthesis holds", () => {
      expect(
        ftcCompetitionPartiesOf("Examplenet/Sample Federation of Advertisers (Exampleco)"),
      ).toEqual({
        title: "Examplenet/Sample Federation of Advertisers",
        parties: ["Examplenet", "Sample Federation of Advertisers"],
      });
    });

    it("gives the part before ' - ' and nothing of what follows it", () => {
      expect(ftcCompetitionPartiesOf("Example Pharma - Jordan Sample Appeal")).toEqual({
        title: "Example Pharma",
        parties: ["Example Pharma"],
      });
    });

    it("takes the 'FTC v' off a party and keeps it in the title", () => {
      expect(ftcCompetitionPartiesOf("FTC v Examplecast Inc")).toEqual({
        title: "FTC v Examplecast Inc",
        parties: ["Examplecast Inc"],
      });
      expect(partiesOf("FTC v. Examplecast Inc")).toEqual(["Examplecast Inc"]);
      expect(partiesOf("ftc  V  Examplecast Inc")).toEqual(["Examplecast Inc"]);
    });

    it("gives no party for a name of fewer than four letters and digits", () => {
      expect(partiesOf("FTC v Abc")).toEqual([]);
      expect(partiesOf("Abc")).toEqual([]);
      expect(partiesOf("Abc/Examplecast Inc")).toEqual(["Examplecast Inc"]);
      // The legal form is not counted: Abc Inc is three letters.
      expect(partiesOf("Abc Inc")).toEqual([]);
      expect(partiesOf("Abcd")).toEqual(["Abcd"]);
    });
  });

  describe("the parentheses", () => {
    it("are removed with what they hold, as many as there are, and the blanks they leave are one", () => {
      expect(ftcCompetitionPartiesOf("Alphaco (A) Inc (B) (C)").title).toBe("Alphaco Inc");
      expect(ftcCompetitionPartiesOf("(Brand) Alphaco Inc").title).toBe("Alphaco Inc");
    });

    it("are removed when they hold other parentheses, the inner first", () => {
      expect(ftcCompetitionPartiesOf("Alphaco (Brand (Sub)) Holdings").title).toBe(
        "Alphaco Holdings",
      );
      expect(ftcCompetitionPartiesOf("Alphaco ((A) (B)) Inc").title).toBe("Alphaco Inc");
    });

    it("are removed before the title is cut at ' - ': a dash inside them is no cut", () => {
      expect(ftcCompetitionPartiesOf("Alphaco (A - B) Inc - Other").title).toBe("Alphaco Inc");
    });

    it("never leave a party: a group that is never closed is cut with what follows it", () => {
      expect(ftcCompetitionPartiesOf("Alphaco Inc (Brand").title).toBe("Alphaco Inc");
      expect(partiesOf("Alphaco Inc (Brand/Betaco Inc")).toEqual(["Alphaco Inc"]);
    });

    it("leave a closing parenthesis that nothing opened, as it is", () => {
      expect(ftcCompetitionPartiesOf("Alphaco) Inc").title).toBe("Alphaco) Inc");
    });

    it("leave no party when a title is only parentheses", () => {
      expect(ftcCompetitionPartiesOf("(Alphaco Inc)")).toEqual({ title: "", parties: [] });
      expect(ftcCompetitionPartiesOf("")).toEqual({ title: "", parties: [] });
    });
  });

  describe("the cut at ' - ' and the slashes", () => {
    it("cuts at the first ' - ' only, and a hyphen with no blanks round it is no cut", () => {
      expect(ftcCompetitionPartiesOf("Alphaco - Betaco - Gammaco").title).toBe("Alphaco");
      expect(partiesOf("Alpha-Beta Corp")).toEqual(["Alpha-Beta Corp"]);
      expect(partiesOf("Alphaco -Betaco")).toEqual(["Alphaco -Betaco"]);
    });

    it("cuts before it splits: the slash after the dash is no party", () => {
      expect(partiesOf("Alphaco Inc - Betaco/Gammaco")).toEqual(["Alphaco Inc"]);
    });

    it("splits at every slash, trims each party and leaves out the empty ones", () => {
      expect(partiesOf("Alphaco Inc/ Betaco Corp /Gammaco LLC")).toEqual([
        "Alphaco Inc",
        "Betaco Corp",
        "Gammaco LLC",
      ]);
      expect(partiesOf("Alphaco Inc//Betaco Corp/")).toEqual(["Alphaco Inc", "Betaco Corp"]);
      expect(partiesOf("/ / /")).toEqual([]);
    });

    it("applies no person rule: the name of a person outside the parentheses is a party like any other", () => {
      expect(partiesOf("Jordan Sample")).toEqual(["Jordan Sample"]);
    });

    it("keeps the words of a topic as a party, which only a vendor of that exact name matches", () => {
      expect(partiesOf("Sample Widget Non-Competes")).toEqual(["Sample Widget Non-Competes"]);
    });
  });

  describe("hostile titles", () => {
    it("are read in no time, whatever they hold, as long as the cell was cut at 200", () => {
      for (const title of [
        "(".repeat(200),
        ")".repeat(200),
        `${"(".repeat(100)}${")".repeat(100)}`,
        "()".repeat(100),
        "( ".repeat(100),
        " - ".repeat(66),
        "/".repeat(200),
        "FTC v ".repeat(33),
        " ".repeat(200),
      ]) {
        const start = Date.now();
        ftcCompetitionPartiesOf(title);
        expect(Date.now() - start).toBeLessThan(10_000);
      }
    });
  });
});

describe("the title that a record shows", () => {
  it("is the title after the cuts, with the FTC v kept, and at most 80 characters", async () => {
    const long = `Longtitleco ${"x".repeat(150)} Inc`;
    const { body } = await run(
      withFillers(
        matter({ title: "FTC v Examplecast Inc (Brand)", number: "1110010" }),
        matter({ title: long, number: "1110011", date: "2022-01-01" }),
      ),
    );
    expect(rowOf(body, "examplecast").newest[0].title).toBe("FTC v Examplecast Inc");
    const entity = body.rows.find((row) => row.id.startsWith("longtitleco"));
    expect(entity?.newest[0].title).toHaveLength(80);
    expect(entity?.newest[0].title.endsWith(" [shortened]")).toBe(true);
    // The party is read from the whole title, not from the 80 characters that are shown: its compact
    // name has 161 units, so its id is the first 83, a tilde and the digest of the whole name.
    expect(entity?.id).toBe(`longtitleco${"x".repeat(72)}~82bf07e14f1e26bd`);
  });

  it("makes the row unreadable when the title is cut at 200: it is not the title of a matter", async () => {
    const { body } = await run(
      withFillers(
        matter({ title: `Hugetitleco ${"x".repeat(100_000)} Inc`, number: "1110012" }),
        matter({ title: "Cutco Inc", number: "1110013", date: "2022-01-01" }),
      ),
    );
    expect(body.unreadable).toBe(1);
    expect(body.rows.some((row) => row.id.startsWith("hugetitleco"))).toBe(false);
    expect(body.rows.some((row) => row.id === "cutco")).toBe(true);
  });

  it("makes the row unreadable when the title is cut at a blank: no id, key or identifier holds the marker", async () => {
    // 229 units. A read of 201 units would keep 189 of them and take the blank at the 189th off, so
    // the line would have 200 units, with the marker in it: it would pass for a title of 200.
    const title = `Blankcutco${"x".repeat(178)} ${"y".repeat(40)}`;
    expect(title).toHaveLength(229);
    expect(title[188]).toBe(" ");
    const { body, parsed, snapshot } = await run(
      withFillers(
        matter({ title, number: "1110080" }),
        matter({ title: "Cutcheckco Inc", number: "1110081", date: "2022-01-01" }),
      ),
    );
    expect(body.unreadable).toBe(1);
    expect(body.total).toBe(162);
    expect(body.rows.some((row) => row.id.startsWith("blankcutco"))).toBe(false);
    expect(body.rows.some((row) => row.id === "cutcheckco")).toBe(true);
    const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`.toLowerCase();
    expect(everything).not.toContain("shortened");
    expect(everything).not.toContain("blankcutco");
    for (const record of parsed.records) {
      expect(record.sourceRecordId).not.toContain("shortened");
      expect(record.matchKeys.join(" ")).not.toContain("shortened");
      expect(JSON.stringify(record.identifiers)).not.toContain("shortened");
    }
  });

  it("makes the row unreadable when the title is cut at a blank, wherever the blank is", async () => {
    for (const at of [186, 187, 188, 189, 190]) {
      const title = `Blankco${"x".repeat(at - 7)} ${"y".repeat(229 - at - 1)}`;
      expect(title).toHaveLength(229);
      expect(title[at]).toBe(" ");
      const { body } = await run(withFillers(matter({ title, number: "1110082" })));
      expect(body.unreadable).toBe(1);
      expect(body.rows.some((row) => row.id.startsWith("blankco"))).toBe(false);
    }
  });

  it("reads a title of 200 characters and makes the row of one of 201 unreadable", async () => {
    const fits = `Edgeco${"x".repeat(194)}`;
    const over = `Edgeco${"x".repeat(195)}`;
    expect(fits).toHaveLength(200);
    expect(over).toHaveLength(201);
    const { body } = await run(
      withFillers(
        matter({ title: fits, number: "1110083" }),
        matter({ title: over, number: "1110084", date: "2022-01-01" }),
      ),
    );
    expect(body.unreadable).toBe(1);
    expect(body.rows.filter((row) => row.id.startsWith("edgeco"))).toHaveLength(1);
    expect(body.rows.find((row) => row.id.startsWith("edgeco"))?.numbers).toEqual(["1110083"]);
  });

  it("makes the row unreadable when the title is empty", async () => {
    const { body } = await run(withFillers(matter({ title: "", number: "1110014" })));
    expect(body.unreadable).toBe(1);
  });

  it("gives a row that names no party at all neither an entity nor an unreadable row", async () => {
    const { body, parsed } = await run(
      withFillers(
        matter({ title: "FTC v Abc", number: "1110015" }),
        matter({ title: "(Only a brand)", number: "1110016" }),
      ),
    );
    expect(body.unreadable).toBe(0);
    expect(body.rows).toHaveLength(160);
    expect(parsed.errors).toBe(0);
    expect(body.total).toBe(162);
  });
});

describe("the link of a matter", () => {
  /** The url of the record of a party whose only matter has this cell. */
  const urlOf = async (link: string): Promise<string> => {
    const { parsed } = await run(withFillers(matter({ title: "Lonzco Inc", link })));
    return recordOf(parsed, "lonzco").url;
  };
  const FALLBACK = `${DOCUMENTATION_URL}lonzco`;

  it("is the address between the first and the second # of a cell that begins with #", async () => {
    expect(await urlOf("#http://www.ftc.gov/x#")).toBe("https://www.ftc.gov/x");
    expect(await urlOf("#https://www.ftc.gov/x#")).toBe("https://www.ftc.gov/x");
  });

  it("is the address of a cell with a text before the first #", async () => {
    expect(await urlOf("text#https://www.ftc.gov/y#")).toBe("https://www.ftc.gov/y");
    expect(await urlOf("http://www.ftc.gov/a#http://www.ftc.gov/b#")).toBe("https://www.ftc.gov/b");
  });

  it("is the text before the first #, when that is the address and nothing is between", async () => {
    expect(await urlOf("https://www.ftc.gov/z#")).toBe("https://www.ftc.gov/z");
  });

  it("is a bare address as it is, with https for http", async () => {
    expect(await urlOf("http://www.ftc.gov/os/z")).toBe("https://www.ftc.gov/os/z");
    expect(await urlOf("https://www.ftc.gov/os/z")).toBe("https://www.ftc.gov/os/z");
  });

  it("is read when the second # is missing: what follows the first is the address", async () => {
    expect(await urlOf("#https://www.ftc.gov/x")).toBe("https://www.ftc.gov/x");
  });

  it("accepts the host without www", async () => {
    expect(await urlOf("#https://ftc.gov/x#")).toBe("https://ftc.gov/x");
  });

  it("accepts a link of 500 characters, and gives none over it", async () => {
    const base = "https://www.ftc.gov/";
    expect(await urlOf(`#${base}${"a".repeat(500 - base.length)}#`)).toBe(
      `${base}${"a".repeat(500 - base.length)}`,
    );
    expect(await urlOf(`#${base}${"a".repeat(501 - base.length)}#`)).toBe(FALLBACK);
    // A cell that is huge is no link, and is not copied either.
    expect(await urlOf(`#${base}${"a".repeat(100_000)}#`)).toBe(FALLBACK);
  });

  it("reads no link from a cell of more than 600 characters, however short the address in it is", async () => {
    const address = "https://www.ftc.gov/x";
    const cellOf = (length: number): string => {
      const head = `#${address}#`;
      return `${head}${"t".repeat(length - head.length)}`;
    };
    expect(cellOf(600)).toHaveLength(600);
    expect(await urlOf(cellOf(600))).toBe(address);
    expect(cellOf(601)).toHaveLength(601);
    expect(await urlOf(cellOf(601))).toBe(FALLBACK);
  });

  it.each([
    ["an empty cell", ""],
    ["a cell of blanks", "   "],
    ["a cell of # only", "##"],
    ["another host", "#https://example.org/x#"],
    ["a host that has the FTC's inside it", "#https://www.ftc.gov.example.org/x#"],
    ["a host that ends as the FTC's does", "#https://notftc.gov/x#"],
    ["a sub domain of the FTC", "#https://files.ftc.gov/x#"],
    ["the host in upper case", "#https://WWW.FTC.GOV/x#"],
    ["no path", "#https://www.ftc.gov#"],
    ["a path of a slash only", "#https://www.ftc.gov/#"],
    ["another scheme", "#ftp://www.ftc.gov/x#"],
    ["a script", "#javascript:alert(1)#"],
    ["a user name", "#https://user@www.ftc.gov/x#"],
    ["a blank in it", "#https://www.ftc.gov/x y#"],
    ["an angle bracket", "#https://www.ftc.gov/x<y#"],
    ["a quotation mark", '#https://www.ftc.gov/x"y#'],
    ["a backslash", "#https://www.ftc.gov/x\\y#"],
    ["a brace", "#https://www.ftc.gov/x{y}#"],
    ["text only", "Just a text"],
    ["a text before a #, and no address", "Just a text#"],
  ])("gives no link for %s: the address of the documentation is used", async (_name, cell) => {
    expect(await urlOf(cell)).toBe(FALLBACK);
  });

  it("gives no link for a control or a hidden character in it", async () => {
    for (const code of [0x0, 0x1, 0x7f, 0x81, 0x9d, 0xad, 0xa0]) {
      expect(await urlOf(`#https://www.ftc.gov/x${cp(code)}y#`)).toBe(FALLBACK);
    }
  });

  it("is the link of the newest matter that has one, not of the newest matter", async () => {
    const { parsed } = await run(
      withFillers(
        matter({ title: "Lonzco Inc", number: "1110021", date: "2023-01-01", link: "" }),
        matter({
          title: "Lonzco Inc",
          number: "1110022",
          date: "2021-01-01",
          link: "#https://www.ftc.gov/b#",
        }),
        matter({
          title: "Lonzco Inc",
          number: "1110023",
          date: "2019-01-01",
          link: "#https://www.ftc.gov/a#",
        }),
      ),
    );
    expect(recordOf(parsed, "lonzco").url).toBe("https://www.ftc.gov/b");
  });

  it("gives the address of the documentation, with the party, to a party that has no link at all", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    expect(recordOf(parsed, "examplecast").url).toBe("https://www.ftc.gov/os/2022/08/1110004.pdf");
    const { parsed: bare } = await run(withFillers(matter({ title: "Nolonzco Inc", link: "" })));
    expect(recordOf(bare, "nolonzco").url).toBe(`${DOCUMENTATION_URL}nolonzco`);
  });

  it("has an address of its own for each party of different matters, so that no record is dropped as a duplicate", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    const urls = parsed.records.map((record) => record.url);
    expect(new Set(urls).size).toBe(urls.length - 1);
    // The one address that two records share is the matter that names two parties: accepted.
    expect(recordOf(parsed, "examplenet").url).toBe(LINK_ONE);
    expect(recordOf(parsed, "samplefederationofadvertisers").url).toBe(LINK_ONE);
    const withoutShared = parsed.records.filter(
      (record) => record.sourceRecordId !== "samplefederationofadvertisers",
    );
    expect(new Set(withoutShared.map((record) => record.url)).size).toBe(withoutShared.length);
  });

  it("is never in the text of a record", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    for (const record of parsed.records)
      expect(record.summary).not.toContain("https://www.ftc.gov/");
  });
});

describe("the matters of a party", () => {
  it("count a fully duplicated row once", async () => {
    const row = matter({ title: "Dupeco Inc", link: "#https://www.ftc.gov/dupe#" });
    const { body } = await run(withFillers(row, row, row));
    expect(rowOf(body, "dupeco").matters).toBe(1);
    expect(rowOf(body, "dupeco").numbers).toEqual(["1110001"]);
  });

  it("count a number on two days as two matters, and list the number once", async () => {
    const { body } = await run(
      withFillers(
        matter({ title: "Twiceco Inc", number: "1110030", date: "2021-04-01" }),
        matter({ title: "Twiceco Inc", number: "1110030", date: "2022-05-02" }),
      ),
    );
    const entity = rowOf(body, "twiceco");
    expect(entity.matters).toBe(2);
    expect(entity.numbers).toEqual(["1110030"]);
    expect(entity.newest.map((m) => m.day)).toEqual(["2022-05-02", "2021-04-01"]);
  });

  it("count a matter once for each party it names, and once for a party it names twice", async () => {
    const { body } = await run(
      withFillers(
        matter({ title: "Alphaco Inc/Betaco Inc", number: "1110031" }),
        matter({ title: "Gammaco Inc/Gammaco, Inc.", number: "1110032" }),
      ),
    );
    expect(rowOf(body, "alphaco").matters).toBe(1);
    expect(rowOf(body, "betaco").matters).toBe(1);
    expect(rowOf(body, "gammaco").matters).toBe(1);
    expect(rowOf(body, "gammaco").names).toEqual(["Gammaco Inc", "Gammaco, Inc."]);
  });

  it("show the three newest, by day and then by number, newest first, and list ten numbers", async () => {
    const rows = withFillers(
      ...Array.from({ length: 12 }, (_, at) =>
        matter({
          title: "Manyco Inc",
          number: String(1110100 + at),
          date: `${2010 + (at % 12)}-02-03`,
        }),
      ),
      matter({ title: "Manyco Inc", number: "1110199", date: "2021-02-03" }),
    );
    const { body } = await run(rows);
    const entity = rowOf(body, "manyco");
    expect(entity.matters).toBe(13);
    expect(entity.newest.map((m) => [m.day, m.number])).toEqual([
      ["2021-02-03", "1110199"],
      ["2021-02-03", "1110111"],
      ["2020-02-03", "1110110"],
    ]);
    expect(entity.numbers).toHaveLength(10);
    expect(entity.numbers.slice(0, 3)).toEqual(["1110199", "1110111", "1110110"]);
    expect(entity.firstYear).toBe(2010);
    expect(entity.lastYear).toBe(2021);
  });

  it("are the same whatever the order of the rows, even for rows of one matter that differ", async () => {
    const differing = [
      matter({
        title: "Orderco Inc",
        type: "Type B",
        industry: "Industry B",
        link: "#https://www.ftc.gov/b#",
      }),
      matter({
        title: "Orderco Inc",
        type: "Type A",
        industry: "Industry C",
        link: "#https://www.ftc.gov/c#",
      }),
      matter({ title: "Orderco Inc", type: "Type A", industry: "Industry A", link: "" }),
    ];
    const forward = await run(withFillers(...differing));
    const reversed = await run(withFillers(...[...differing].reverse()));
    expect(rowOf(forward.body, "orderco")).toEqual(rowOf(reversed.body, "orderco"));
    expect(forward.snapshot.bodies).toEqual(reversed.snapshot.bodies);
  });
});

describe("the spellings of a party", () => {
  it("are one entity, whatever the legal form and the case, and the most used is shown", async () => {
    const { body } = await run(
      withFillers(
        matter({ title: "Alphaco, Inc.", number: "1110041", date: "2024-01-10" }),
        matter({ title: "Alphaco, Inc.", number: "1110042", date: "2023-01-10" }),
        matter({ title: "ALPHACO CORP", number: "1110043", date: "2022-01-10" }),
        matter({ title: "The Alphaco Company", number: "1110044", date: "2021-01-10" }),
      ),
    );
    const entity = rowOf(body, "alphaco");
    expect(entity.matters).toBe(4);
    expect(entity.display).toBe("Alphaco, Inc.");
    expect(entity.names).toEqual(["Alphaco, Inc.", "ALPHACO CORP", "The Alphaco Company"]);
  });

  it("show the first of two that are used as often, by the order of the text", async () => {
    const { body } = await run(
      withFillers(
        matter({ title: "Betaco, Inc.", number: "1110051", date: "2024-01-10" }),
        matter({ title: "Betaco Inc", number: "1110052", date: "2023-01-10" }),
      ),
    );
    // A blank comes before a comma.
    expect(rowOf(body, "betaco").display).toBe("Betaco Inc");
  });

  it("are kept at most three, the most used first, the same whatever the order of the rows", async () => {
    const spellings: Array<[string, number]> = [
      ["Zetaco Inc", 3],
      ["Zetaco Corp", 2],
      ["Zetaco LLC", 2],
      ["Zetaco", 1],
      ["Zetaco Ltd", 1],
    ];
    const rows: MatterRow[] = [];
    let at = 0;
    for (const [title, count] of spellings) {
      for (let i = 0; i < count; i += 1) {
        rows.push(
          matter({
            title,
            number: String(1110200 + at),
            date: `2024-${String(1 + (at % 12)).padStart(2, "0")}-${String(1 + at).padStart(2, "0")}`,
          }),
        );
        at += 1;
      }
    }
    const forward = await run(withFillers(...rows));
    const reversed = await run(withFillers(...[...rows].reverse()));
    expect(rowOf(forward.body, "zetaco").names).toEqual([
      "Zetaco Inc",
      "Zetaco Corp",
      "Zetaco LLC",
    ]);
    expect(rowOf(reversed.body, "zetaco").names).toEqual([
      "Zetaco Inc",
      "Zetaco Corp",
      "Zetaco LLC",
    ]);
    expect(rowOf(forward.body, "zetaco").display).toBe("Zetaco Inc");
  });

  it("have no label of a host and no key of a domain: the hyperlink is the FTC's own", async () => {
    const { parsed } = await run(withFillers(matter({ title: "Hostco.com Inc" })));
    const keys = recordOf(parsed, "hostcocom").matchKeys;
    expect(keys.every((key) => key.startsWith("name:"))).toBe(true);
  });

  describe("the id of a party", () => {
    // The id is the compact name of the party without its legal form: the name itself when it has 100
    // units or fewer. A longer name is its first 83 units, a tilde and the first 16 hex digits of the
    // SHA-256 of the whole compact name, so that two long names with one start are two parties, and an
    // id is a function of the name alone. (A windows-1252 file has no letter of two UTF-16 units, so
    // a cut never falls inside a pair here; the file of ftc_penalties tests that one.)
    const STEM = `Averyverylongname${"x".repeat(150)}`;
    const ONE = `averyverylongname${"x".repeat(66)}~62e723ebdc013e80`;
    const TWO = `averyverylongname${"x".repeat(66)}~7eb538eed1aca435`;
    const idsOf = (body: Body): string[] =>
      body.rows.map((row) => row.id).filter((id) => !id.startsWith("fillerparty"));

    it("gives two long names that share their first 100 characters two parties", async () => {
      const { body, parsed } = await run(
        withFillers(
          matter({ title: `${STEM}One Inc`, number: "1110060" }),
          matter({ title: `${STEM}Two Inc`, number: "1110061", date: "2022-01-01" }),
        ),
      );
      expect(idsOf(body)).toEqual([ONE, TWO]);
      expect(rowOf(body, ONE).matters).toBe(1);
      expect(rowOf(body, TWO).matters).toBe(1);
      expect(rowOf(body, ONE).numbers).toEqual(["1110060"]);
      expect(rowOf(body, TWO).numbers).toEqual(["1110061"]);
      expect(recordOf(parsed, ONE).sourceRecordId).toBe(ONE);
      expect(recordOf(parsed, TWO).sourceRecordId).toBe(TWO);
      expect(parsed.errors).toBe(0);
    });

    it("gives the same ids and the same body whatever the order of the rows", async () => {
      const rows = [
        matter({ title: `${STEM}One Inc`, number: "1110060" }),
        matter({ title: `${STEM}Two Inc`, number: "1110061", date: "2022-01-01" }),
        matter({ title: `${STEM}One Corp`, number: "1110064", date: "2021-02-03" }),
      ];
      const forward = await run(withFillers(...rows));
      const reversed = await run(withFillers(...[...rows].reverse()));
      expect(idsOf(reversed.body)).toEqual([ONE, TWO]);
      expect(reversed.body).toEqual(forward.body);
      expect(reversed.parsed.records).toEqual(forward.parsed.records);
      expect(rowOf(forward.body, ONE).matters).toBe(2);
    });

    it("keeps a compact name of 100 characters as the id, and hashes one of 101", async () => {
      const { body } = await run(
        withFillers(
          matter({ title: `Boundary${"x".repeat(92)} Inc`, number: "1110062" }),
          matter({ title: `Boundary${"x".repeat(93)} Inc`, number: "1110063", date: "2022-01-01" }),
        ),
      );
      const ids = idsOf(body);
      expect(ids).toEqual([
        `boundary${"x".repeat(92)}`,
        `boundary${"x".repeat(75)}~9be83f127339ba85`,
      ]);
      expect(ids.map((id) => id.length)).toEqual([100, 100]);
    });

    it("has a tilde in no id of a name that was not cut, and keeps such an id as it was", async () => {
      const { body, parsed } = await run(withFillers(...EXAMPLE_ROWS));
      expect(body.rows.some((row) => row.id.includes("~"))).toBe(false);
      expect(parsed.records.some((record) => record.sourceRecordId.includes("~"))).toBe(false);
      expect(body.rows.map((row) => row.id)).toEqual(
        expect.arrayContaining(["examplenet", "samplefederationofadvertisers", "examplepharma"]),
      );
    });

    it("shows a party that is too long as its display cut, and counts it once", async () => {
      const long = `Averyverylongname${"x".repeat(150)}`;
      const { body } = await run(withFillers(matter({ title: `${long} Inc`, number: "1110065" })));
      expect(idsOf(body)).toEqual([`averyverylongname${"x".repeat(66)}~65672a02998277b8`]);
      expect(rowOf(body, idsOf(body)[0]).display).toBe(
        `${long} Inc`.slice(0, 100 - 12) + " [shortened]",
      );
    });
  });

  describe("the identifiers of a record", () => {
    // An identifier is never a cut text: it holds the first spelling of the party whole (a title is
    // read to 200 units), while the title and the summary of the record show the display, cut at 100.
    const marked = (text: string): string => `${text.slice(0, 88)} [shortened]`;

    it("hold the whole first spelling of a party of more than 100 characters, and the title and the summary keep the cut", async () => {
      const whole = `Longpartyname${"x".repeat(130)} Inc`;
      const { body, parsed } = await run(withFillers(matter({ title: whole, number: "1110070" })));
      const row = body.rows.find((candidate) => candidate.id.startsWith("longpartyname"));
      expect(row).toBeDefined();
      const record = recordOf(parsed, (row as FtcCompetitionRow).id);
      expect(whole).toHaveLength(147);
      expect(record.identifiers.party).toBe(whole);
      expect(record.identifiers.matters).toEqual(["1110070"]);
      expect(JSON.stringify(record.identifiers)).not.toContain("shortened");
      expect(record.title).toBe(`${FTC_COMPETITION_RECORD_MARK}: ${marked(whole)}`);
      expect(record.summary).toContain(`Party: ${marked(whole)}.`);
      expect((row as FtcCompetitionRow).display).toBe(marked(whole));
    });

    it("hold the whole spelling when the cut of the display ends at a blank", async () => {
      // The 88 units that the display keeps end in a blank, which the cut takes off.
      const whole = `Blank${"x".repeat(82)} ${"y".repeat(40)} Inc`;
      const { body, parsed } = await run(withFillers(matter({ title: whole, number: "1110071" })));
      const row = body.rows.find((candidate) => candidate.id.startsWith("blank"));
      const record = recordOf(parsed, (row as FtcCompetitionRow).id);
      expect(whole[87]).toBe(" ");
      expect(record.identifiers.party).toBe(whole);
      expect(record.title.endsWith(" [shortened]")).toBe(true);
      expect(record.title).not.toContain(whole);
    });

    it("hold the display as it is when the party has 100 characters, and the whole spelling at 101", async () => {
      const at100 = `Hundred${"x".repeat(89)} Inc`;
      const at101 = `Hundred${"x".repeat(90)} Inc`;
      expect(at100).toHaveLength(100);
      expect(at101).toHaveLength(101);
      const { body, parsed } = await run(
        withFillers(
          matter({ title: at100, number: "1110072" }),
          matter({ title: at101, number: "1110073", date: "2022-01-01" }),
        ),
      );
      const rows = body.rows.filter((row) => row.id.startsWith("hundred"));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        const record = recordOf(parsed, row.id);
        expect(record.identifiers.party).toBe(row.names[0]);
        expect(String(record.identifiers.party)).not.toContain("shortened");
      }
      const long = rows.find((row) => row.names[0] === at101) as FtcCompetitionRow;
      expect(long.display).toBe(marked(at101).slice(0, 88) + " [shortened]");
      expect(recordOf(parsed, long.id).identifiers.party).toBe(at101);
    });

    it("hold the first spelling, the one that most matters use, when a party is written in several", async () => {
      const stem = `Twospellingparty${"x".repeat(120)}`;
      const { body, parsed } = await run(
        withFillers(
          matter({ title: `${stem} Inc`, number: "1110074" }),
          matter({ title: `${stem} Inc`, number: "1110075", date: "2022-01-01" }),
          matter({ title: `${stem} Corp`, number: "1110076", date: "2021-01-01" }),
        ),
      );
      const row = body.rows.find((candidate) => candidate.id.startsWith("twospellingparty"));
      expect((row as FtcCompetitionRow).names).toEqual([`${stem} Inc`, `${stem} Corp`]);
      expect(recordOf(parsed, (row as FtcCompetitionRow).id).identifiers.party).toBe(`${stem} Inc`);
    });

    it("hold the whole spelling with the angle brackets that the kit takes out", async () => {
      const whole = `Anglebracket<${"x".repeat(110)}> Inc`;
      const { body, parsed } = await run(withFillers(matter({ title: whole, number: "1110077" })));
      const row = body.rows.find((candidate) => candidate.id.startsWith("anglebracket"));
      const record = recordOf(parsed, (row as FtcCompetitionRow).id);
      expect(record.identifiers.party).toBe(
        whole.replace("<", cp(0x2039)).replace(">", cp(0x203a)),
      );
      expect(JSON.stringify(record)).not.toMatch(/[<>]/);
    });
  });

  it("never gives a total below the entities and the unreadable rows, when the titles name several parties", async () => {
    const pairs = fillerRows(160).map((row, at) => ({
      ...row,
      title: `Pairone${String(at).padStart(4, "0")} Inc/Pairtwo${String(at).padStart(4, "0")} Inc`,
    }));
    const rows = [...pairs, matter({ title: "Badnumberco Inc", number: "not a number" })];
    const { body, parsed } = await run(rows);
    expect(body.rows).toHaveLength(320);
    expect(body.unreadable).toBe(1);
    expect(body.total).toBe(321);
    expect(parsed.records).toHaveLength(320);
    expect(parsed.errors).toBe(0);
  });
});

describe("the records", () => {
  const SUMMARY =
    "FTC nonmerger enforcement actions (ftc.gov), an enforcement or case list. Party: Examplenet. " +
    "The US Federal Trade Commission's list of nonmerger (antitrust) enforcement actions names it in " +
    "the title of 2 matters, dated 2019 to 2023. " +
    'Newest: 2023-05-10, matter 1110001, "Examplenet/Sample Federation of Advertisers", Consent order, Advertising; ' +
    '2019-11-20, matter 1110002, "Examplenet", Federal court, Technology. ' +
    CLOSING;

  it("is one for each party, of the type of the list, with its text word for word", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    expect(parsed.records).toHaveLength(164);
    const record = recordOf(parsed, "examplenet");
    expect(record.recordType).toBe("competition_action_summary");
    expect(record.title).toBe("FTC nonmerger enforcement actions: Examplenet");
    expect(record.summary).toBe(SUMMARY);
    expect(record.url).toBe(LINK_ONE);
    expect(record.identifiers).toEqual({ party: "Examplenet", matters: ["1110001", "1110002"] });
    expect(record.publishedAt).toBe("2023-05-10");
    expect(record.sourceUpdatedAt).toBeNull();
    expect(record.matchKeys).toEqual(["name:examplenet"]);
  });

  it("has the name of the party with and without its legal form as keys, and no other kind of key", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    expect(recordOf(parsed, "examplecast").matchKeys).toEqual([
      "name:examplecastinc",
      "name:examplecast",
    ]);
    for (const record of parsed.records) {
      expect(record.matchKeys.length).toBeGreaterThan(0);
      expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
    }
  });

  it("begins with the mark, the host and what kind of list it is, and ends with the closing sentence", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    expect(FTC_COMPETITION_RECORD_MARK).toBe("FTC nonmerger enforcement actions");
    for (const record of parsed.records) {
      expect(
        record.summary.startsWith(
          `${FTC_COMPETITION_RECORD_MARK} (ftc.gov), an enforcement or case list.`,
        ),
      ).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.summary.length).toBeLessThanOrEqual(1300);
    }
  });

  it("is well formed for the columns and the prompt, whatever the party", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    expectWellFormedRecords(parsed.records, {
      sourceId: SOURCE_ID,
      mark: FTC_COMPETITION_RECORD_MARK,
    });
  });

  it("writes one matter as one matter and one year as one year", async () => {
    const { parsed } = await run(withFillers(...EXAMPLE_ROWS));
    const single = recordOf(parsed, "examplepharma").summary;
    expect(single).toContain("names it in the title of 1 matter, dated 2021.");
    expect(single).toContain(
      'Newest: 2021-03-04, matter 1110003, "Example Pharma", Federal court, Pharmaceuticals.',
    );
    const two = recordOf(parsed, "examplenet").summary;
    expect(two).toContain("in the title of 2 matters, dated 2019 to 2023.");
    const sameYear = (
      await run(
        withFillers(
          matter({ title: "Yearco Inc", number: "1110071", date: "2022-01-10" }),
          matter({ title: "Yearco Inc", number: "1110072", date: "2022-09-10" }),
        ),
      )
    ).parsed;
    expect(recordOf(sameYear, "yearco").summary).toContain(
      "in the title of 2 matters, dated 2022.",
    );
  });

  it("leaves out an empty type or industry, and keeps the others", async () => {
    const { parsed } = await run(
      withFillers(
        matter({ title: "Gapco Inc", number: "1110081", type: "", industry: "Gap industry" }),
        matter({ title: "Holeco Inc", number: "1110082", type: "Hole type", industry: "" }),
        matter({ title: "Voidco Inc", number: "1110083", type: "", industry: "" }),
      ),
    );
    expect(recordOf(parsed, "gapco").summary).toContain(
      'matter 1110081, "Gapco Inc", Gap industry.',
    );
    expect(recordOf(parsed, "holeco").summary).toContain(
      'matter 1110082, "Holeco Inc", Hole type.',
    );
    expect(recordOf(parsed, "voidco").summary).toContain('matter 1110083, "Voidco Inc".');
  });

  it("cuts the type to 40 characters and the industry to 60", async () => {
    const { parsed, body } = await run(
      withFillers(matter({ title: "Qapzo Inc", type: "T".repeat(300), industry: "I".repeat(300) })),
    );
    const first = rowOf(body, "qapzo").newest[0];
    expect(first.type.length).toBe(40);
    expect(first.industry.length).toBe(60);
    expect(first.type.endsWith(" [shortened]")).toBe(true);
    expect(recordOf(parsed, "qapzo").summary.length).toBeLessThanOrEqual(1300);
  });
});

describe("the summary", () => {
  const entity = (over: Partial<FtcCompetitionRow> = {}): FtcCompetitionRow => ({
    id: "worstco",
    display: "W".repeat(100),
    names: ["Worstco Inc"],
    matters: 6,
    firstYear: 1997,
    lastYear: 2026,
    newest: [3, 2, 1].map((at) => ({
      number: `111999${at}`,
      day: `202${at}-12-31`,
      title: `${"A very long title of a matter ".repeat(4)}${at}`.slice(0, 80),
      type: "T".repeat(40),
      industry: "I".repeat(60),
    })),
    numbers: ["1119993", "1119992", "1119991"],
    url: null,
    publishedAt: "2023-12-31",
    ...over,
  });

  it("stays under 1,300 characters for the worst row, with its closing sentence", () => {
    const summary = ftcCompetitionSummaryOf(entity());
    expect(summary.length).toBeLessThanOrEqual(1300);
    expect(summary.endsWith(CLOSING)).toBe(true);
    expect(summary.startsWith("FTC nonmerger enforcement actions (ftc.gov)")).toBe(true);
  });

  it("drops the third newest matter first, then the second, then cuts the name: the closing sentence is never cut", () => {
    const row = entity();
    const full = ftcCompetitionSummaryOf(row);
    const entries = (text: string): number => (text.match(/, matter 111999/g) ?? []).length;
    expect(entries(full)).toBe(3);
    const seen: number[] = [];
    for (let max = full.length; max >= CLOSING.length + 120; max -= 1) {
      const summary = ftcCompetitionSummaryOf(row, max);
      expect(summary.length).toBeLessThanOrEqual(max);
      expect(summary.endsWith(CLOSING)).toBe(true);
      expect(
        summary.startsWith(
          "FTC nonmerger enforcement actions (ftc.gov), an enforcement or case list.",
        ),
      ).toBe(true);
      const count = entries(summary);
      if (seen[seen.length - 1] !== count) seen.push(count);
    }
    expect(seen.slice(0, 3)).toEqual([3, 2, 1]);
    const two = ftcCompetitionSummaryOf(row, full.length - 1);
    expect(two).toContain("2023-12-31");
    expect(two).toContain("2022-12-31");
    expect(two).not.toContain("2021-12-31");
  });

  it("is the whole text when it fits, and never longer than the limit that is asked", () => {
    const row = entity({ display: "Fitco Inc" });
    const full = ftcCompetitionSummaryOf(row, 1300);
    expect(ftcCompetitionSummaryOf(row, full.length)).toBe(full);
    expect(ftcCompetitionSummaryOf(row, full.length + 500)).toBe(full);
  });
});

describe("the download", () => {
  it("asks the one file of the list, with no validators the first time and the limits of the list", async () => {
    const { fetch } = await run(withFillers(...EXAMPLE_ROWS));
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe(FILE_URL);
    expect(fetch.calls[0].validators).toEqual({});
    expect(fetch.calls[0].limits).toEqual({
      maxBytes: 1_048_576,
      allowedContentTypes: ["text/csv"],
      totalTimeoutMs: 60_000,
    });
  });

  it("gives a snapshot of one body, with the date of the file and the prefix of the version as its etag", async () => {
    const { snapshot } = await run(withFillers(...EXAMPLE_ROWS));
    expect(snapshot.bodies).toHaveLength(1);
    expect(snapshot.etag).toBe("k1:");
    expect(snapshot.lastModified).toBe(LAST_MODIFIED);
    expect(snapshot.bytes).toBe(csvOf(withFillers(...EXAMPLE_ROWS)).length);
  });

  it("is told unchanged by the server when the validators of the last download are sent back", async () => {
    const fetch = fakeFetch(filesOf(withFillers(...EXAMPLE_ROWS)));
    const first = await ftcCompetitionConnector.download(fetch, {});
    if (first === "unchanged") throw new Error("unchanged");
    const second = await ftcCompetitionConnector.download(fetch, {
      etag: first.etag,
      lastModified: first.lastModified,
    });
    expect(second).toBe("unchanged");
    expect(fetch.calls[1].validators).toEqual({ etag: null, lastModified: LAST_MODIFIED });
  });

  it("sends no validators after a change of the version of the reading, and gets the file again", async () => {
    const fetch = fakeFetch(filesOf(withFillers(...EXAMPLE_ROWS)));
    const second = await ftcCompetitionConnector.download(fetch, {
      etag: "k0:",
      lastModified: LAST_MODIFIED,
    });
    expect(second).not.toBe("unchanged");
    expect(fetch.calls[0].validators).toEqual({});
  });

  it("is told unchanged only by an answer that came from the pinned host", async () => {
    const fetch = fakeFetch(
      filesOf(withFillers(...EXAMPLE_ROWS), { url: "https://files.example.org/x.csv" }),
    );
    const failure = await failureOf(
      ftcCompetitionConnector.download(fetch, { etag: "k1:", lastModified: LAST_MODIFIED }),
    );
    expect(failure).toBeInstanceOf(FetchError);
    expect((failure as FetchError).reason).toBe("not_allowed");
  });

  it("fails, and never gives a shorter list, when the file cannot be asked", async () => {
    const failure = await failureOf(ftcCompetitionConnector.download(fakeFetch({}), {}));
    expect(failure).toBeInstanceOf(FetchError);
    expect((failure as FetchError).reason).toBe("unreachable");
  });

  it.each([
    ["text/html"],
    ["application/json"],
    ["application/octet-stream"],
    ["application/vnd.ms-excel"],
  ])("fails as an unsupported type when the file is %s", async (contentType) => {
    const failure = await downloadFailure(withFillers(...EXAMPLE_ROWS), { contentType });
    expect(failure).toBeInstanceOf(FetchError);
    expect((failure as FetchError).reason).toBe("unsupported_type");
  });

  it("fails as too large when the file is cut at its limit of 1 MiB, or says that it was cut", async () => {
    const big = csvOf(withFillers(matter({ title: "Bigco Inc", industry: "x".repeat(1_100_000) })));
    expect(big.length).toBeGreaterThan(1_048_576);
    expect(await downloadFailure(big)).toBeInstanceOf(BodyTooLargeError);
    expect(await downloadFailure(withFillers(...EXAMPLE_ROWS), { truncated: true })).toBeInstanceOf(
      BodyTooLargeError,
    );
  });

  describe("fails as not allowed, naming no address, when the answer comes from", () => {
    const notAllowed = async (url: string): Promise<void> => {
      const failure = await downloadFailure(withFillers(...EXAMPLE_ROWS), { url });
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
      expect(String((failure as Error).message)).not.toMatch(/ftc|example|http/i);
    };

    it.each([
      [
        "another host",
        "https://files.example.org/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions.csv",
      ],
      [
        "a host that has the FTC's inside it",
        "https://www.ftc.gov.example.org/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions.csv",
      ],
      [
        "the host without www",
        "https://ftc.gov/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions.csv",
      ],
      [
        "another directory of the FTC",
        "https://www.ftc.gov/system/files/ftc_gov/documents/FTC-Nonmerger-Enforcement-Actions.csv",
      ],
      [
        "a directory that only begins as the FTC's does",
        "https://www.ftc.gov/system/files/ftc_gov/data-other/FTC-Nonmerger-Enforcement-Actions.csv",
      ],
      [
        "no https",
        "http://www.ftc.gov/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions.csv",
      ],
      [
        "a port",
        "https://www.ftc.gov:8443/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions.csv",
      ],
    ])("%s", async (_name, url) => {
      await notAllowed(url);
    });

    it("accepts a redirect to another file of the directory of the FTC's data", async () => {
      const failure = await downloadFailure(withFillers(...EXAMPLE_ROWS), {
        url: "https://www.ftc.gov/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions_v2.csv",
      });
      expect(failure).toBeUndefined();
    });
  });
});

describe("the connector", () => {
  it("is a snapshot connector of the list, at the version of its reading", () => {
    expect(ftcCompetitionConnector.id).toBe(SOURCE_ID);
    expect(ftcCompetitionConnector.version).toBe(1);
    expect(ftcCompetitionConnector.kind).toBeUndefined();
  });

  it("is deterministic: the order of the rows of the file never changes the bodies or the records", async () => {
    const rows = withFillers(
      ...EXAMPLE_ROWS,
      matter({ title: "Alphaco Inc/Betaco Inc", number: "1110090" }),
    );
    const connector: Connector = ftcCompetitionConnector;
    await expectDeterministic(connector, (reversed) =>
      fakeFetch(filesOf(reversed ? [...rows].reverse() : rows)),
    );
  });

  it("finds no list in a body that is not the one the download makes", () => {
    for (const text of [
      "not json",
      "{}",
      '{"v":2,"rows":[],"total":0,"unreadable":0}',
      "[]",
      "null",
    ]) {
      const parsed = ftcCompetitionConnector.parse({
        bodies: [text],
        etag: null,
        lastModified: null,
        bytes: 0,
      });
      expect(parsed.root).toBeNull();
      expect(parsed.errors).toBe(1);
      expect(parsed.records).toEqual([]);
    }
  });
});

describe("the rows that do not parse", () => {
  const withBadRows = (count: number): MatterRow[] =>
    withFillers(
      ...Array.from({ length: count }, (_, at) =>
        matter({ title: `Badrowco${at} Inc`, number: "not a number" }),
      ),
    );

  it("are counted, and left out up to ten", async () => {
    const { body, parsed } = await run(withBadRows(10));
    expect(body.unreadable).toBe(10);
    expect(parsed.skipped).toBe(10);
    expect(parsed.errors).toBe(0);
    expect(parsed.records).toHaveLength(160);
    expect(parsed.root).toBe(ROOT);
  });

  it("are errors when there are more than that, and the sync fails", async () => {
    const { parsed } = await run(withBadRows(11));
    expect(parsed.errors).toBe(11);
    expect(parsed.skipped).toBe(0);
  });
});

describe("hostile cells", () => {
  // What a windows-1252 file can hold of the characters that nobody sees or that must not reach a
  // prompt: the controls (C0, DEL and the C1 that the charset leaves undefined), the soft hyphen, the
  // no-break space, and the angle brackets.
  const HIDDEN = [0x1, 0x7, 0x7f, 0x81, 0x9d, 0xad];

  it("are cleaned: no control character, no hidden one, no angle bracket, in any record", async () => {
    const hostile = [
      `Evil${cp(0x1)}corp${cp(0xad)} Inc${cp(0x7)} <script>alert(1)`,
      `Nbsp${cp(0xa0)}Hold${cp(0x81)}ings Corp ${cp(0x7f)}${cp(0x9d)}`,
      `Marked <b>up</b${cp(0x1)}> Corp`,
    ];
    const rows = withFillers(
      ...hostile.map((title, at) =>
        matter({
          title,
          number: String(1110300 + at),
          type: `Type ${cp(0xad)}with <b>markup</b> and ${cp(0x1)} controls`,
          industry: `Industry ${cp(0x81)}<i>x</i>`,
        }),
      ),
    );
    const { parsed } = await run(rows);
    expect(parsed.errors).toBe(0);
    expectWellFormedRecords(parsed.records, {
      sourceId: SOURCE_ID,
      mark: FTC_COMPETITION_RECORD_MARK,
    });
    const everything = JSON.stringify(parsed.records);
    expect(everything).not.toContain("<");
    expect(everything).not.toContain(">");
    for (const code of [...HIDDEN, 0xa0]) expect(everything).not.toContain(cp(code));
    // The cleaned names still make the records they should.
    expect(parsed.records.some((record) => record.sourceRecordId.startsWith("evilcorp"))).toBe(
      true,
    );
    expect(parsed.records.some((record) => record.sourceRecordId === "nbspholdings")).toBe(true);
  });

  it("are cut: a cell of 100 KB in the industry gives a record that is under the limit, with the closing sentence", async () => {
    const { parsed, body } = await run(
      withFillers(matter({ title: "Hugecell Inc", industry: "B".repeat(100_000) })),
    );
    const summary = recordOf(parsed, "hugecell").summary;
    expect(summary.length).toBeLessThanOrEqual(1300);
    expect(summary.endsWith(CLOSING)).toBe(true);
    expect(JSON.stringify(rowOf(body, "hugecell")).length).toBeLessThan(1000);
  });

  it("do not make an id of anything but letters and digits: a title of marks and symbols gives no entity", async () => {
    const { body, parsed } = await run(
      withFillers(
        matter({ title: "!!!! Inc", number: "1110311" }),
        matter({ title: "----", number: "1110312" }),
      ),
    );
    expect(body.rows.some((row) => !/[\p{L}\p{N}]/u.test(row.id))).toBe(false);
    expectWellFormedRecords(parsed.records, {
      sourceId: SOURCE_ID,
      mark: FTC_COMPETITION_RECORD_MARK,
    });
  });
});

describe("what a failure and a log hold", () => {
  it("is never an address, a message of the file or a row: the errors are fixed words", async () => {
    const rows = withFillers(...EXAMPLE_ROWS);
    const failures = [
      await downloadFailure(csvOf(rows, { header: HEADER.slice(0, 5) })),
      await downloadFailure(Buffer.from("not a csv at all")),
      await downloadFailure(fillerRows(5000)),
      await downloadFailure(rows, { url: "https://files.example.org/x.csv" }),
    ];
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(Error);
      const message = String((failure as Error).message);
      expect(message).not.toMatch(/ftc|http|examplenet|ZZ-|1110001/i);
    }
  });

  it("writes nothing to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      await run(withFillers(...EXAMPLE_ROWS));
      await downloadFailure(Buffer.from("not a csv at all"));
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
