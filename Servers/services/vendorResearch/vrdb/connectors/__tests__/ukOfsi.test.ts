/**
 * The UK OFSI enforcement notices as a mirrored list of the vendor risk database
 * (connectors/ukOfsi.ts): the GOV.UK Search API gives every document of the Office of Financial
 * Sanctions Implementation (guidance, licences, news and the notices among them), and the notices of
 * a monetary penalty or of a disclosure become one record for each party they name. The answers are
 * synthetic: they copy the shape of the API's (an envelope with `results`, `total`, `start` and the
 * empty `aggregates`; a result with `title`, `description`, `link`, `public_timestamp`,
 * `content_store_document_type`, `format`, `display_type` and the envelope fields of the index) with
 * every title, party, link and day invented. A field that the connector must leave out holds a
 * token that starts with `ZZ-`, so that a copy of it anywhere in a snapshot or a record is found.
 * Every character that is hard to type is built with `cp`. Nothing here uses the network:
 * `fakeFetch` and hand-written fetches answer, and the pause between two pages is a mock.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import { MAX_RECORDS } from "../../../records/types";
import { vrdbSourceOf } from "../../sources";
import { SHORTENED, lineOf } from "../kit/clean";
import type { Sleep } from "../kit/pause";
import {
  BodyTooLargeError,
  type ConnectorFetch,
  NotTheListError,
  type ParseResult,
  type Snapshot,
} from "../types";
import {
  UK_OFSI_RECORD_MARK,
  createUkOfsiConnector,
  londonDayOf,
  ofsiReadingOf,
  ukOfsiConnector,
} from "../ukOfsi";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

/** The connector paces its pages, so a test that runs it may be slow on a starved runner. */
jest.setTimeout(30_000);

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const MARK = UK_OFSI_RECORD_MARK;
const JSON_TYPE = "application/json";
const MIB = 1024 * 1024;
const OPEN_QUOTE = cp(0x201c);
const CLOSE_QUOTE = cp(0x201d);
const EN_DASH = cp(0x2013);
const NBSP = cp(0xa0);

/**
 * What breaks a test of the length that cuts first (`lineOf(text, max + 1)` and a compare with
 * `max`). A cut line is the units that are kept and the marker, which has 12; a cut to `max + 1`
 * keeps `max - 11` units, but a blank at the cut is trimmed and the first half of a pair of
 * surrogates is dropped, so the cut line has `max` units, and the compare takes it for a whole line
 * that ends in the marker. A text that is longer than `max` and has one of these as its unit
 * `max - 12` is such a text. The limit of the length (`lineWithin`) refuses it, as it refuses every
 * text that does not fit.
 */
const AT_THE_CUT = [" ", cp(0x20000)];

/**
 * The wall-clock limit of the tests that guard against a blow-up of the time (an exponential or a
 * quadratic pattern): at least ten times the time that the work takes (milliseconds) and never
 * below 10 s, so that a starved runner cannot fail them and only a real blow-up can.
 */
const BLOW_UP_MS = 10_000;

/** The request, page by page: the pager asks exactly this and never another. */
const SEARCH_URL =
  "https://www.gov.uk/api/search.json?filter_organisations=office-of-financial-sanctions-implementation&count=1000&order=-public_timestamp&fields[]=title&fields[]=description&fields[]=link&fields[]=public_timestamp&fields[]=content_store_document_type&fields[]=format&fields[]=display_type&fields[]=first_published_at&start=";
const urlOf = (start: number): string => `${SEARCH_URL}${start}`;

/** The page of the list in the registry: the page that a record shows when its notice names a person. */
const COLLECTION_PAGE = vrdbSourceOf("uk_ofsi").documentationUrl;

/** The fields that no record or snapshot may show: each holds a `ZZ-` token. */
const LEFT_OUT = {
  format: "ZZ-FORMAT",
  display: "ZZ-DISPLAY-TYPE",
  firstPublished: "ZZ-FIRST-PUBLISHED",
  description: "ZZ-DESCRIPTION-OF-A-NOTICE",
  tail: "ZZ-DESCRIPTION-TAIL",
  other: "ZZ-OTHER-DOCUMENT",
};

/** A document of the search, before it is written as a result of the API. */
interface Doc {
  /** The `content_store_document_type`; a notice when it is left out. */
  type?: string;
  title: string;
  description?: string;
  link: string;
  /** The `public_timestamp`. */
  at: string;
  /** Fields of the result that the API does not send, or sends in other shapes. */
  extra?: Record<string, unknown>;
}

type Result = Record<string, unknown>;

/** The result as the API writes it: the fields that were asked for and the envelope of the index. */
function resultOf(doc: Doc): Result {
  return {
    title: doc.title,
    description: doc.description ?? `${LEFT_OUT.description}\r\n\r\n`,
    link: doc.link,
    public_timestamp: doc.at,
    content_store_document_type: doc.type ?? "notice",
    format: LEFT_OUT.format,
    display_type: LEFT_OUT.display,
    first_published_at: LEFT_OUT.firstPublished,
    _id: doc.link,
    index: "govuk",
    es_score: null,
    elasticsearch_type: "edition",
    document_type: "edition",
    ...doc.extra,
  };
}

/** The text of one answer of the API: the envelope of a page. */
const pageText = (results: readonly unknown[], total: number, start: number | undefined): string =>
  JSON.stringify({
    results,
    total,
    ...(start === undefined ? {} : { start }),
    aggregates: {},
    suggested_queries: [],
    suggested_autocomplete: [],
    es_cluster: "A",
  });

/** The files `fakeFetch` serves for a search of these results: one for each page of 1,000. */
function filesOfResults(
  results: readonly Result[],
  over: Partial<FakeFile> = {},
): Record<string, FakeFile> {
  const files: Record<string, FakeFile> = {};
  for (let start = 0; start < Math.max(results.length, 1); start += 1000) {
    files[urlOf(start)] = {
      body: pageText(results.slice(start, start + 1000), results.length, start),
      contentType: JSON_TYPE,
      ...over,
    };
  }
  return files;
}

const filesOf = (docs: readonly Doc[], over: Partial<FakeFile> = {}): Record<string, FakeFile> =>
  filesOfResults(docs.map(resultOf), over);

/** The day `offset` days after the fifth of January 2025, so that every notice has a day of its own. */
const dayAt = (offset: number): string =>
  new Date(Date.UTC(2025, 0, 5 + offset)).toISOString().slice(0, 10);

const slugOf = (name: string): string => `/government/publications/${name}`;

/** A notice, with a link of its own; the title and the day are the caller's. */
const notice = (name: string, title: string, at: string, over: Partial<Doc> = {}): Doc => ({
  title,
  link: slugOf(name),
  at,
  ...over,
});

const penalty = (name: string, party: string, at: string, over: Partial<Doc> = {}): Doc =>
  notice(name, `Imposition of monetary penalty: ${party}`, at, over);

/** The compact form of a name, as the keys write it: lower case, letters and digits only. */
const compact = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Fourteen parties that no rule drops, each with the legal form that `shortName` takes off. */
const PARTIES = [
  "Alderwick Example Limited",
  "Birchfield Example PLC",
  "Cobaltgate Example LLP",
  "Dunmere Example Ltd",
  "Elmstead Example Limited",
  "Fairholt Example PLC",
  "Glenmoor Example Limited",
  "Hartwell Example AG",
  "Ironvale Example Limited",
  "Juniperton Example Ltd",
  "Kestrelby Example PLC",
  "Lindenhall Example Limited",
  "Marlowe Example Limited",
  "Northcote Example GmbH",
];

/** The id of a party of PARTIES: its legal form is off, the rest is compact. */
const idOfParty = (party: string): string =>
  `ofsi:${compact(party.replace(/\s+(?:Limited|PLC|LLP|Ltd|AG|GmbH)$/, ""))}`;

/** The notices of the first `count` parties of PARTIES, a penalty each, on days of their own. */
const plainDocs = (count = PARTIES.length): Doc[] =>
  PARTIES.slice(0, count).map((party, at) =>
    penalty(`example-penalty-${at + 1}`, party, `${dayAt(at * 10)}T10:20:30Z`),
  );

/** Documents that are no notices: guidance, a licence and a news story. */
const otherDocs = (count: number): Doc[] =>
  Array.from({ length: count }, (_, at) => ({
    type: ["guidance", "statutory_guidance", "news_story"][at % 3],
    title: `Example general licence INT/2026/${1000 + at}`,
    description: `Details for example licence ${LEFT_OUT.other}-${at}`,
    link: slugOf(`example-other-${at}`),
    at: "2026-01-02T03:04:05Z",
  }));

/** A list as the real one is: documents of all kinds around the notices. */
const GOOD: Doc[] = [...plainDocs(), ...otherDocs(30)];

/** A pause that does not wait and keeps its calls. */
const sleeping = () => jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(async () => undefined);

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** The shape of the body of a snapshot, as the factory writes it. */
interface Body {
  v: number;
  rows: Array<{
    key: string;
    displayName: string;
    spellings: string[];
    count: number;
    items: Array<{ link: string | null; title: string; kind: string; date: string }>;
    newest: string;
  }>;
  total: number;
  unreadable: number;
}

const bodyOf = (snapshot: Snapshot): Body => JSON.parse(snapshot.bodies[0]) as Body;

async function downloadOf(
  files: Record<string, FakeFile>,
  connector = ukOfsiConnector,
): Promise<Snapshot> {
  const result = await connector.download(fakeFetch(files), {});
  if (result === "unchanged") throw new Error("The fake fetch answered 304 to a first request.");
  return result;
}

async function runOf(docs: readonly Doc[], over: Partial<FakeFile> = {}) {
  const snapshot = await downloadOf(filesOf(docs, over));
  return { snapshot, parsed: ukOfsiConnector.parse(snapshot) };
}

const recordsOf = (parsed: ParseResult) => parsed.records;
const idsOf = (parsed: ParseResult): string[] =>
  parsed.records.map((record) => record.sourceRecordId);

function recordOfId(parsed: ParseResult, id: string) {
  const record = parsed.records.find((candidate) => candidate.sourceRecordId === id);
  if (record === undefined) throw new Error(`The parse has no record ${id}.`);
  return record;
}

/** The name of a party that a title and a description give, or a failure of the test. */
function partiesOf(title: string, description = ""): string[] {
  const reading = ofsiReadingOf(title, description);
  if (reading.shape !== "notice") throw new Error(`The reading is ${reading.shape}.`);
  return reading.parties;
}

/** The parts of the notices of these tests: a penalty title, a disclosure that is a date, the words of its description. */
const PENALTY_OF = "Imposition of monetary penalty: ";
const DATE_TITLE_OF = "Disclosure notice: 08 September 2025";
const BY_OF = "Disclosure notice of an offence under financial sanctions by";
const COMPANY_OF = "Examplecorp Limited";

/** A notice that names persons only: no party, and these persons. */
const nobody = (kind: "monetary penalty" | "disclosure", persons = 1) => ({
  shape: "notice",
  kind,
  parties: [],
  persons,
});

/** A notice that names this party, and the persons that were left out. */
const only = (kind: "monetary penalty" | "disclosure", party: string, persons = 1) => ({
  shape: "notice",
  kind,
  parties: [party],
  persons,
});

/** What a party list gives as the party of a penalty title, of a disclosure title and of a description. */
const readingsOf = (list: string) => ({
  penalty: ofsiReadingOf(`${PENALTY_OF}${list}`, ""),
  disclosure: ofsiReadingOf(`Disclosure notice: ${list}`, ""),
  description: ofsiReadingOf(DATE_TITLE_OF, `${BY_OF} ${list}`),
});

/** A list that holds this number of persons and no party, in a penalty title, a disclosure title and a description. */
const expectPersons = (list: string, persons: number): void => {
  const read = readingsOf(list);
  expect(read.penalty).toEqual(nobody("monetary penalty", persons));
  expect(read.disclosure).toEqual(nobody("disclosure", persons));
  expect(read.description).toEqual(nobody("disclosure", persons));
};

/** A list that holds this party (the company of these tests unless another is given) and this number of persons, in the same three places. */
const expectPartyAnd = (list: string, persons = 1, party = COMPANY_OF): void => {
  const read = readingsOf(list);
  expect(read.penalty).toEqual(only("monetary penalty", party, persons));
  expect(read.disclosure).toEqual(only("disclosure", party, persons));
  expect(read.description).toEqual(only("disclosure", party, persons));
};

const S1 = `${MARK} (gov.uk), an enforcement or case list.`;
const S2 =
  "A notice of the Office of Financial Sanctions Implementation names the party of a monetary penalty or of a published disclosure for a breach of UK financial sanctions; it is not a designation, and the party is not on a sanctions list because of it.";
const CLOSING = "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0.";

describe("ofsiReadingOf, the title and the description of a notice", () => {
  describe("the title of a monetary penalty", () => {
    it("holds the party after a colon", () => {
      expect(ofsiReadingOf("Imposition of monetary penalty: Example Bank PLC", "")).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: ["Example Bank PLC"],
        persons: 0,
      });
    });

    it("holds the party after an en dash, in title case", () => {
      expect(partiesOf(`Imposition of Monetary Penalty ${EN_DASH} Example Branch London`)).toEqual([
        "Example Branch London",
      ]);
    });

    it("holds the party after a hyphen, without the alias in brackets", () => {
      expect(
        partiesOf("Imposition of Monetary Penalty - Example Vector Systems Limited (EVSL)"),
      ).toEqual(["Example Vector Systems Limited"]);
    });

    it("holds the party without a curly-quoted alias, and keeps the branch", () => {
      expect(
        partiesOf(
          `Imposition of monetary penalty ${EN_DASH} Example Bank AG London Branch (${OPEN_QUOTE}EBLB${CLOSE_QUOTE})`,
        ),
      ).toEqual(["Example Bank AG London Branch"]);
    });

    it.each<[string, string]>([
      ["a straight double quote", 'Example Bank PLC ("EBP")'],
      ["a straight single quote", "Example Bank PLC ('EBP')"],
      ["no quote", "Example Bank PLC (EBP)"],
      ["blanks before the bracket", "Example Bank PLC   (EBP)  "],
      ["an alias of eight capitals", "Example Bank PLC (ABCDEFGH)"],
    ])("strips an alias with %s at the end", (_what, party) => {
      expect(partiesOf(`Imposition of monetary penalty: ${party}`)).toEqual(["Example Bank PLC"]);
    });

    it.each<[string, string]>([
      ["lower case", "Example Bank PLC (the)"],
      ["one capital and lower case", "Example Bank PLC (Example)"],
      ["a letter", "Example Bank PLC (E)"],
      ["nine capitals", "Example Bank PLC (ABCDEFGHI)"],
      ["a digit", "Example Bank PLC (EB1)"],
      ["a bracket that is not at the end", "Example (EBP) Bank PLC"],
    ])("keeps a bracket that is no alias: %s", (_what, party) => {
      expect(partiesOf(`Imposition of monetary penalty: ${party}`)).toEqual([party]);
    });

    it("is read in any case, with or without the article, and with any white space", () => {
      for (const title of [
        "IMPOSITION OF MONETARY PENALTY: Example Bank PLC",
        "imposition of monetary penalty: Example Bank PLC",
        "Imposition of a monetary penalty: Example Bank PLC",
        "Imposition of monetary penalty:Example Bank PLC",
        "Imposition of monetary penalty  :   Example Bank PLC  ",
        `Imposition${NBSP}of${NBSP}monetary${NBSP}penalty:${NBSP}Example${NBSP}Bank PLC`,
        "Imposition of\r\nmonetary penalty: Example Bank PLC",
        "Imposition of monetary penalty \t- Example Bank PLC",
      ]) {
        expect(partiesOf(title)).toEqual(["Example Bank PLC"]);
      }
    });

    it("does not take a party from the other separators or from words in place of one", () => {
      for (const title of [
        `Imposition of monetary penalty ${cp(0x2014)} Example Bank PLC`,
        "Imposition of monetary penalty on Example Bank PLC",
        "Imposition of monetary penalty",
        "Imposition of monetary penalty:",
        "Imposition of monetary penalty: ",
        "Imposition of a monetary penalty on Example Bank PLC",
      ]) {
        expect(ofsiReadingOf(title, "")).toEqual({ shape: "unreadable" });
      }
    });

    it("keeps the part of a name that follows a second separator", () => {
      expect(partiesOf("Imposition of monetary penalty: Example Bank - London PLC")).toEqual([
        "Example Bank - London PLC",
      ]);
    });
  });

  describe("the title of a disclosure notice", () => {
    it("holds the party after the colon", () => {
      expect(ofsiReadingOf("Disclosure notice: Example Payments Limited", "")).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: ["Example Payments Limited"],
        persons: 0,
      });
    });

    it("holds the party after an en dash or a hyphen, and after any of the three with no blank around it", () => {
      for (const title of [
        `Disclosure notice ${EN_DASH} Example Payments Limited`,
        "Disclosure notice - Example Payments Limited",
        "Disclosure notice:Example Payments Limited",
        `Disclosure notice${EN_DASH}Example Payments Limited`,
        "Disclosure notice-Example Payments Limited",
      ]) {
        expect(partiesOf(title)).toEqual(["Example Payments Limited"]);
      }
    });

    it("takes a title for a date only when it is no more than the date: a date with more after it is no name", () => {
      const description =
        "Disclosure notice of an offence under financial sanctions by Example Bank Limited";
      for (const day of [
        "08 September 2025 Example Bank",
        "08 September 2025 (revised)",
        "08 September 2025 2026",
      ]) {
        expect(ofsiReadingOf(`Disclosure notice: ${day}`, description)).toEqual({
          shape: "unreadable",
        });
      }
    });

    it("never reads the description of a notice whose title names the party", () => {
      const reading = ofsiReadingOf(
        "Disclosure notice: Example Payments Limited",
        `Disclosure notice of an offence under financial sanctions by Other Party Limited ${LEFT_OUT.tail}`,
      );
      expect(reading).toMatchObject({ parties: ["Example Payments Limited"] });
    });

    it("takes a title with a date for one that has no party: the party is in the description", () => {
      for (const day of ["08 September 2025", "8 September 2025", "31 January 2024"]) {
        expect(
          partiesOf(
            `Disclosure notice: ${day}`,
            "Disclosure notice of an offence under financial sanctions by Example Bank Limited",
          ),
        ).toEqual(["Example Bank Limited"]);
      }
    });

    it("never reads a description for a penalty, whatever its party is: a party that is a date is no name", () => {
      const description =
        "Disclosure notice of an offence under financial sanctions by Example Bank Limited";
      expect(
        ofsiReadingOf("Imposition of monetary penalty: 08 September 2025", description),
      ).toEqual({
        shape: "unreadable",
      });
    });

    it("takes a month for part of a date only when it is a capital and lower case: another writing is no date, and no name", () => {
      // A date is written `8 September 2025`. In capitals the title would name a party that is a date, which no name is.
      const description =
        "Disclosure notice of an offence under financial sanctions by Example Bank Limited";
      for (const day of ["08 SEPTEMBER 2025", "08 september 2025"]) {
        expect(ofsiReadingOf(`Disclosure notice: ${day}`, description)).toEqual({
          shape: "unreadable",
        });
      }
    });

    it("is unreadable when its title has a date and its description is not of the known shape", () => {
      for (const description of [
        "",
        "A notice about something else",
        "Disclosure notice of an offence under financial sanctions",
        "Disclosure notice of an offence under financial sanctions by",
        "Disclosure notice of an offence under financial sanctions by  ",
        // The words are read at the start of the description only.
        "Note: Disclosure notice of an offence under financial sanctions by Example Bank Limited",
      ]) {
        expect(ofsiReadingOf("Disclosure notice: 08 September 2025", description)).toEqual({
          shape: "unreadable",
        });
      }
      expect(ofsiReadingOf("Disclosure notice: 08 September 2025", undefined)).toEqual({
        shape: "unreadable",
      });
    });

    it("is unreadable when it is no more than the words of its kind", () => {
      for (const title of [
        "Disclosure notice",
        "Disclosure notice:",
        "Disclosure notice of Example Bank PLC",
        "Disclosure notices: Example Bank PLC",
      ]) {
        expect(ofsiReadingOf(title, "")).toEqual({ shape: "unreadable" });
      }
    });
  });

  describe("the description of a disclosure notice whose title has a date", () => {
    const TITLE = "Disclosure notice: 08 September 2025";
    const BY = "Disclosure notice of an offence under financial sanctions by";

    it("holds the party, with the bracket that follows it and no blank before it taken off", () => {
      expect(partiesOf(TITLE, `${BY} Example Bank Limited(EBL)`)).toEqual(["Example Bank Limited"]);
      expect(partiesOf(TITLE, `${BY} Example Bank Limited (EBL)`)).toEqual([
        "Example Bank Limited",
      ]);
    });

    it("keeps a bracket that only a lower-case or short class would take for an alias", () => {
      expect(partiesOf(TITLE, `${BY} Example Bank Limited (the)`)).toEqual([
        "Example Bank Limited (the)",
      ]);
      expect(partiesOf(TITLE, `${BY} Example Bank Limited(The)`)).toEqual([
        "Example Bank Limited(The)",
      ]);
      expect(partiesOf(TITLE, `${BY} Example Bank Limited (E)`)).toEqual([
        "Example Bank Limited (E)",
      ]);
    });

    it("reads the words of the sentence that it begins with in any case", () => {
      expect(
        partiesOf(
          TITLE,
          "DISCLOSURE NOTICE OF AN OFFENCE UNDER FINANCIAL SANCTIONS BY Example Bank Limited",
        ),
      ).toEqual(["Example Bank Limited"]);
    });

    it("reads no more of the sentence than its party: a dash and what follows are cut", () => {
      for (const tail of [
        ` ${EN_DASH} failing to respond to a request ${LEFT_OUT.tail}`,
        ` - failing to respond to a request ${LEFT_OUT.tail}`,
        `(EBL) ${EN_DASH} failing to respond ${LEFT_OUT.tail}`,
      ]) {
        expect(partiesOf(TITLE, `${BY} Example Bank Limited${tail}`)).toEqual([
          "Example Bank Limited",
        ]);
      }
    });

    it("keeps a hyphen that is part of a name", () => {
      expect(partiesOf(TITLE, `${BY} Example-Bank Limited ${EN_DASH} a request`)).toEqual([
        "Example-Bank Limited",
      ]);
    });

    it("cuts at a spaced dash only: a dash with no blank after it is part of the text", () => {
      expect(partiesOf(TITLE, `${BY} Example Bank Limited ${EN_DASH}Rest`)).toEqual([
        `Example Bank Limited ${EN_DASH}Rest`,
      ]);
    });

    it("splits at the word and in lower case only", () => {
      expect(partiesOf(TITLE, `${BY} Examplebread AND Examplebutter Limited`)).toEqual([
        "Examplebread AND Examplebutter Limited",
      ]);
    });

    it("is read to 1,000 characters: one more is no description that a notice has", () => {
      const head = `${BY} Example Bank Limited ${EN_DASH} `;
      const whole = (length: number): string => `${head}${"x".repeat(length - head.length)}`;
      expect(whole(1_000)).toHaveLength(1_000);
      expect(partiesOf(TITLE, whole(1_000))).toEqual(["Example Bank Limited"]);
      expect(ofsiReadingOf(TITLE, whole(1_001))).toEqual({ shape: "unreadable" });
    });

    it("is not read when it is longer than 1,000 characters, whatever a cut of it would leave (a blank or a pair of surrogates at the cut)", () => {
      // 988 units, so that unit 988 is the one that a cut to 1,001 units takes off.
      const head = `${BY} Example Bank Limited ${EN_DASH} `;
      const filled = `${head}${"x".repeat(988 - head.length)}`;
      expect(filled).toHaveLength(988);
      for (const cutter of AT_THE_CUT) {
        const description = `${filled}${cutter}${"y".repeat(50)}`;
        // The shape is the one that passes for a description of 1,000 units that ends in the mark of a cut.
        expect(lineOf(description, 1_001)).toHaveLength(1_000);
        expect(lineOf(description, 1_001).endsWith(SHORTENED)).toBe(true);
        expect(ofsiReadingOf(TITLE, description)).toEqual({ shape: "unreadable" });
      }
    });

    it("reads the white space of the description as one blank: line breaks and no-break spaces", () => {
      const description = `${BY}${NBSP}Example${NBSP}Bank Limited(EBL)\r\n\r\n`;
      expect(partiesOf(TITLE, description)).toEqual(["Example Bank Limited"]);
    });

    it("gives three parties for charities, split at commas and at and, with the names that look like a person's kept", () => {
      const description = `${BY} charities Example Lanterns, Example Harbour Ministries and Example Orbit ${EN_DASH} failing to respond to a request ${LEFT_OUT.tail}.\r\n\r\n`;
      const reading = ofsiReadingOf(TITLE, description);
      expect(reading).toEqual({
        shape: "notice",
        kind: "disclosure",
        // "Example Lanterns" and "Example Orbit" have the shape of a person's name and are kept:
        // the word charities names them organisations.
        parties: ["Example Lanterns", `Example Harbour Ministries`, "Example Orbit"],
        persons: 0,
      });
    });

    it("drops a name of the shape of a person's when no word names it a charity", () => {
      expect(ofsiReadingOf(TITLE, `${BY} Example Orbit`)).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: [],
        persons: 1,
      });
    });

    it("takes the word charities only in lower case and only followed by a blank: it is a class of the list", () => {
      // A capital C is no such word: the party is "Charities Example Lanterns", a person's shape.
      expect(ofsiReadingOf(TITLE, `${BY} Charities Example Lanterns`)).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: [],
        persons: 1,
      });
    });

    it("splits a name that holds and: the weakness of a list read from words", () => {
      expect(partiesOf(TITLE, `${BY} Examplebread and Examplebutter Limited`)).toEqual([
        "Examplebread",
        "Examplebutter Limited",
      ]);
    });

    it("drops the person of a list of parties and keeps the companies, whatever the order", () => {
      expect(ofsiReadingOf(TITLE, `${BY} Examplecorp Limited and Casey Sample-Lee`)).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: ["Examplecorp Limited"],
        persons: 1,
      });
      expect(ofsiReadingOf(TITLE, `${BY} Casey Sample-Lee and Examplecorp Limited`)).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: ["Examplecorp Limited"],
        persons: 1,
      });
      expect(
        ofsiReadingOf(
          TITLE,
          `${BY} Examplecorp Limited, Casey Sample-Lee and Otherco PLC ${EN_DASH} failing to respond ${LEFT_OUT.tail}`,
        ),
      ).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: ["Examplecorp Limited", "Otherco PLC"],
        persons: 1,
      });
    });

    it("strips the alias of each party, with its quotes", () => {
      const description = `${BY} charities Example Lanterns (EL), Example Orbit (${OPEN_QUOTE}EO${CLOSE_QUOTE}) and Example Aid`;
      expect(partiesOf(TITLE, description)).toEqual([
        "Example Lanterns",
        "Example Orbit",
        "Example Aid",
      ]);
    });

    it("counts a party once, whatever the spelling of its legal form", () => {
      const description = `${BY} Examplebank Limited and Examplebank Ltd`;
      expect(partiesOf(TITLE, description)).toEqual(["Examplebank Limited"]);
    });

    it("is unreadable for a list of parties that is not one: an and after a comma, a legal form alone, an empty party", () => {
      for (const parties of [
        "Example Lanterns, and Example Orbit",
        "Examplebank, Ltd",
        "Examplebank, N.A.",
        "Examplebank, , Examplebank Two Limited",
        ", Examplebank Limited",
        "Examplebank Limited, ",
      ]) {
        expect(ofsiReadingOf(TITLE, `${BY} charities ${parties}`)).toEqual({
          shape: "unreadable",
        });
      }
    });

    it("is unreadable when a party ends in the mark of a cut: it was cut by another layer, and is no whole name", () => {
      for (const description of [
        `${BY} Examplecorp Limited [shortened] ${EN_DASH} failing to respond`,
        `${BY} Examplecorp Limited[shortened], Otherco PLC`,
        // The whole description ends in the mark, though its party does not.
        `${BY} Examplecorp Limited [shortened]`,
        `${BY} Examplecorp Limited ${EN_DASH} failing to respond [shortened]`,
      ]) {
        expect(ofsiReadingOf(TITLE, description)).toEqual({ shape: "unreadable" });
      }
      // The mark in the middle of a party is text like any other.
      expect(partiesOf(TITLE, `${BY} Examplecorp [shortened] Limited`)).toEqual([
        "Examplecorp [shortened] Limited",
      ]);
    });

    it("is unreadable for more parties than any real notice has", () => {
      const names = (count: number): string =>
        Array.from({ length: count }, (_, at) => `Example Aid ${"I".repeat(at + 1)} Limited`).join(
          ", ",
        );
      expect(ofsiReadingOf(TITLE, `${BY} ${names(25)}`)).toMatchObject({ shape: "notice" });
      expect(ofsiReadingOf(TITLE, `${BY} ${names(26)}`)).toEqual({ shape: "unreadable" });
    });
  });

  describe("a title that is no notice of a penalty or of a disclosure", () => {
    it("gives no party and is no failure: a joint statement and the documents around the notices", () => {
      for (const title of [
        "Example Task Force joint statement",
        "OFSI General Licence INT/2025/1234567",
        "Financial sanctions: guidance",
        "Penalty notice: Example Bank PLC",
        "",
      ]) {
        expect(ofsiReadingOf(title, "")).toEqual(
          title === "" ? { shape: "unreadable" } : { shape: "none" },
        );
      }
    });

    it("is unreadable when it is no text", () => {
      for (const title of [undefined, null, 7, {}, ["Imposition of monetary penalty: X PLC"], ""]) {
        expect(ofsiReadingOf(title, "")).toEqual({ shape: "unreadable" });
      }
    });

    it("is read to 300 characters: a longer title that opens as a notice cannot be read, one that does not is no failure", () => {
      expect(ofsiReadingOf("X".repeat(300), "")).toEqual({ shape: "none" });
      expect(ofsiReadingOf("X".repeat(5_000), "")).toEqual({ shape: "none" });
      for (const opening of ["Disclosure notice: ", "Imposition of monetary penalty: "]) {
        expect(ofsiReadingOf(`${opening}${"A".repeat(300)} Limited`, "")).toEqual({
          shape: "unreadable",
        });
        expect(ofsiReadingOf(`${opening}${"A".repeat(100_000)}`, "")).toEqual({
          shape: "unreadable",
        });
      }
    });

    it("is unreadable when it ends in the mark of a cut: it was cut by another layer, and is no whole title", () => {
      for (const title of [
        "Imposition of monetary penalty: Examplecorp Limited [shortened]",
        "Disclosure notice: Examplecorp Limited[shortened]",
      ]) {
        expect(ofsiReadingOf(title, "")).toEqual({ shape: "unreadable" });
      }
    });

    it("is not read when it is longer than 300 characters, whatever a cut of it would leave (a blank or a pair of surrogates at the cut)", () => {
      // The slot of a title with one party is longer than the longest party as well (150), and a cut
      // of it ends in the mark, which no party does: it is refused twice over, so this holds with
      // either test of the length. The limit of the title alone shows in the list title below.
      for (const opening of ["Disclosure notice: ", "Imposition of monetary penalty: "]) {
        // 288 units, so that unit 288 is the one that a cut to 301 units takes off.
        const filled = `${opening}${"A".repeat(288 - opening.length)}`;
        expect(filled).toHaveLength(288);
        for (const cutter of AT_THE_CUT) {
          const title = `${filled}${cutter}${"B".repeat(50)} Limited`;
          expect(lineOf(title, 301)).toHaveLength(300);
          expect(lineOf(title, 301).endsWith(SHORTENED)).toBe(true);
          expect(ofsiReadingOf(title, "")).toEqual({ shape: "unreadable" });
        }
      }
    });
  });

  describe("the person shape", () => {
    /** What a party that is dropped as a person's leaves: no party, and one person counted. */
    const dropped = (kind: "monetary penalty" | "disclosure", persons = 1) => ({
      shape: "notice",
      kind,
      parties: [],
      persons,
    });
    const DATE_TITLE = "Disclosure notice: 08 September 2025";
    const BY = "Disclosure notice of an offence under financial sanctions by";

    // Names that the rule takes for a person's, whatever the list that holds them: synthetic.
    const PERSONS: Array<[string, string]> = [
      ["two capitalised words", "Clear Example"],
      ["three capitalised words", "Clear Example Person"],
      ["an apostrophe inside a word", "Clear D'arcy"],
      ["an apostrophe that closes a word", `Clear Lanterns${cp(0x2019)}`],
      ["a hyphenated word", "Casey Sample-Lee"],
      ["a hyphenated word with the hyphen of Unicode", `Casey Sample${cp(0x2010)}Lee`],
      ["a hyphenated word with an en dash", `Casey Sample${EN_DASH}Lee`],
      ["words in capitals", "CASEY SAMPLE"],
      ["hyphenated words in capitals", "CASEY SAMPLE-LEE"],
      ["accented letters", `Jos${cp(0xe9)} Garc${cp(0xed)}a`],
      ["accented capitals", `${cp(0xc9)}MILE SAMPL${cp(0xc9)}`],
      [
        "letters of another script",
        `${cp(0x41a, 0x430, 0x441, 0x438)} ${cp(0x421, 0x44d, 0x43c, 0x43f, 0x43b)}`,
      ],
      ["an initial", "Casey J Sample"],
      ["an initial with a dot", "Casey J. Sample"],
      ["an accented initial", `Casey ${cp(0xc9)}. Sample`],
      ["a capital that holds a combining mark", `Casey ${cp(0x1eb8, 0x301)}ample`],
      ["a combining mark that no letter holds", `Casey Sampl${cp(0x1eb9, 0x301)}`],
      ["initials before the name", "J. K. Sample"],
      ["a name that begins with Mc", "Casey McSample"],
      ["a name that begins with Mac", "Casey MacSample"],
      ["a name that begins with O and an apostrophe", "Casey O'Sample"],
      ["a name that begins with O and a typographic apostrophe", `Casey O${cp(0x2019)}Sample`],
      ["a name that begins with O and an apostrophe, in capitals", "CASEY O'SAMPLE"],
      ["four words", "Casey Robin Lee Sample"],
      ["five words", "Casey Robin Lee Ann Sample"],
      ["the particle de", "Casey de Sample"],
      ["the particle von", "Casey von Sample"],
      ["two particles", "Casey van der Sample"],
      ["the particle bin", "Casey bin Sample"],
      ["the particle al", "Casey al Sample"],
      ["a particle that a capital leads, which is a name", "De Sample Casey"],
      ["an article that a hyphen joins", "Casey al-Sample"],
      ["an article of the other kind that a hyphen joins", "Casey el-Sample"],
    ];

    it.each(PERSONS)(
      "drops %s, with no legal form and no word of an organisation",
      (_what, party) => {
        // As the party of a penalty, of a disclosure whose title names it, and of a description.
        expect(ofsiReadingOf(`Imposition of monetary penalty: ${party}`, "")).toEqual(
          dropped("monetary penalty"),
        );
        expect(ofsiReadingOf(`Disclosure notice: ${party}`, "")).toEqual(dropped("disclosure"));
        expect(ofsiReadingOf(DATE_TITLE, `${BY} ${party}`)).toEqual(dropped("disclosure"));
      },
    );

    it("reads each particle between two names, and in no other place", () => {
      for (const particle of [
        "al",
        "bin",
        "bint",
        "da",
        "de",
        "del",
        "della",
        "den",
        "der",
        "di",
        "du",
        "el",
        "ibn",
        "ten",
        "ter",
        "van",
        "von",
      ]) {
        expect(
          ofsiReadingOf(`Imposition of monetary penalty: Casey ${particle} Sample`, ""),
        ).toEqual(dropped("monetary penalty"));
        // First, last, or with one name only: no name.
        for (const party of [
          `${particle} Casey Sample`,
          `Casey Sample ${particle}`,
          `Casey ${particle}`,
        ]) {
          expect(partiesOf(`Imposition of monetary penalty: ${party}`)).toEqual([party]);
        }
      }
    });

    it.each<[string, string]>([
      ["one word", "Examplecorp"],
      ["six words", "Casey Robin Lee Ann Sample Jones"],
      ["a lower-case word that is no particle", "Clear example"],
      ["a digit", "Clear Example2"],
      ["a capital inside a word that no rule names", "Clear ExampleCorp"],
      ["a dot that does not make an initial", "Clear Ex."],
      ["a hyphen at the end of a word", "Casey Sample-"],
      ["two hyphens in a row", "Casey Sample--Lee"],
      ["an ampersand", "Clear & Example"],
      ["a slash", "Clear Example/Corp"],
      ["a particle first", "de Casey Sample"],
      ["a particle last", "Casey Sample de"],
      [
        "words of a script that has no case",
        `${cp(0x645, 0x62b, 0x627, 0x644)} ${cp(0x634, 0x631, 0x643, 0x629)}`,
      ],
    ])("keeps a name with %s: it has no shape of a person's name", (_what, party) => {
      expect(partiesOf(`Imposition of monetary penalty: ${party}`)).toEqual([party]);
      expect(partiesOf(DATE_TITLE, `${BY} ${party}`)).toEqual([party]);
    });

    it.each<[string, string]>([
      ["a hyphenated name and a legal form", "Casey Sample-Lee Limited"],
      ["capitals and a legal form", "CASEY SAMPLE LTD"],
      ["accented letters and a legal form with dots", `Jos${cp(0xe9)} Garc${cp(0xed)}a S.A.`],
      ["a name that begins with Mc and a legal form", "Casey McSample PLC"],
      ["five words and an organisation word", "Casey Robin Lee Ann Holdings"],
      ["capitals and an organisation word", "CASEY SAMPLE TRADING"],
      ["an initial and an organisation word", "Casey J Sample Partners"],
      ["a particle and an organisation word", "Casey de Sample Bank"],
    ])("keeps a name that looks like a person's when it has %s", (_what, party) => {
      expect(ofsiReadingOf(`Imposition of monetary penalty: ${party}`, "")).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [party],
        persons: 0,
      });
      expect(partiesOf(DATE_TITLE, `${BY} ${party}`)).toEqual([party]);
    });

    it.each([
      ["Limited", "Clear Limited"],
      ["Llp", "Clear Llp"],
      ["Llc", "Clear Llc"],
      ["Ag", "Clear Ag"],
      ["Sa", "Clear Sa"],
      ["Gmbh", "Clear Gmbh"],
      ["Bv", "Clear Bv"],
      ["Ltd", "Clear Ltd"],
      ["Inc", "Clear Inc"],
      ["PLC", "Clear Example PLC"],
      ["Plc", "Clear Plc"],
      ["Bank", "Clear Bank"],
      ["Branch", "Example Branch"],
      ["Company", "Clear Example Company"],
      ["Group", "Clear Group"],
      ["Trust", "Clear Example Trust"],
      ["Charity", "Clear Charity"],
      ["Ministries", "Clear Ministries"],
      ["Association", "Clear Association"],
      ["Services", "Clear Services"],
      ["Shipping", "Clear Shipping"],
      ["Trading", "Clear Trading"],
      ["Management", "Clear Management"],
      ["Holdings", "Clear Holdings"],
      ["Payments", "Clear Payments"],
      ["International", "Clear International"],
      ["Partners", "Clear Partners"],
      ["Foundation", "Clear Foundation"],
    ])("keeps a name with the word %s", (_word, party) => {
      expect(partiesOf(`Imposition of monetary penalty: ${party}`)).toEqual([party]);
    });

    it("reads a word as a person's only when it is a capital and letters, hyphens and apostrophes inside it", () => {
      // One word of each kind that is none: the names are kept, whatever the other words are.
      for (const word of ["Sample.Lee", "Sample_Lee", "Sample@Lee", "-Lee"]) {
        expect(partiesOf(`Imposition of monetary penalty: Casey ${word}`)).toEqual([
          `Casey ${word}`,
        ]);
      }
    });

    it("does not apply to the parties of a notice that names charities", () => {
      for (const party of ["Clear Example", "Casey Sample-Lee", "CASEY SAMPLE", "Casey J Sample"]) {
        expect(partiesOf(DATE_TITLE, `${BY} charities ${party}`)).toEqual([party]);
      }
    });

    it("takes the one-letter words for a name only next to a word of two letters or more", () => {
      for (const party of ["A B C", "A. B.", "J. K."]) {
        expect(ofsiReadingOf(`Imposition of monetary penalty: ${party}`, "")).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: [],
          persons: 0,
        });
      }
    });
  });

  describe("a person written with an honorific, a suffix, a prefix or a role", () => {
    const PENALTY = PENALTY_OF;
    const DATE_TITLE = DATE_TITLE_OF;
    const BY = BY_OF;
    const COMPANY = COMPANY_OF;
    const gone = nobody;
    const kept = only;
    const readings = readingsOf;
    /** A person that is dropped alone, after a company of a title and after a company of a description. */
    const expectPerson = (person: string): void => {
      const alone = readings(person);
      expect(alone.penalty).toEqual(gone("monetary penalty"));
      expect(alone.disclosure).toEqual(gone("disclosure"));
      expect(alone.description).toEqual(gone("disclosure"));
      const after = readings(`${COMPANY} and ${person}`);
      expect(after.penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(after.disclosure).toEqual(kept("disclosure", COMPANY));
      expect(after.description).toEqual(kept("disclosure", COMPANY));
    };
    /** A name that no rule takes for a person's: one party, as a title and as a description. */
    const expectNoPerson = (party: string): void => {
      expect(partiesOf(`${PENALTY}${party}`)).toEqual([party]);
      expect(partiesOf(DATE_TITLE, `${BY} ${party}`)).toEqual([party]);
    };

    const HONORIFICS: Array<[string, string]> = [
      ["Mr and its dot", "Mr. Casey Sample"],
      ["Mr without its dot", "Mr Casey Sample"],
      ["Mrs and its dot", "Mrs. Casey Sample"],
      ["Ms and its dot", "Ms. Casey Sample"],
      ["Miss and its dot", "Miss. Casey Sample"],
      ["Mx and its dot", "Mx. Casey Sample"],
      ["Dr and its dot", "Dr. Casey Sample"],
      ["Prof and its dot", "Prof. Casey Sample"],
      ["Rev and its dot", "Rev. Casey Sample"],
      ["Hon and its dot", "Hon. Casey Sample"],
      ["Sir and its dot", "Sir. Casey Sample"],
      ["Sir without its dot", "Sir Casey Sample"],
      ["Lord", "Lord Casey Sample"],
      ["Lady", "Lady Casey Sample"],
      ["Dame", "Dame Casey Sample"],
      ["an honorific in capitals and its dot", "MRS. CASEY SAMPLE"],
      ["an honorific and one name", "Mrs. Sample"],
      ["an honorific and initials", "Dr. J. K. Sample"],
      ["an honorific and a name of five words", "Dr. Casey Robin Lee Sample"],
      ["a run of two titles with their dots", "Prof. Dr. Casey Sample"],
      ["a run of a title with its dot and a title without it", "Rev. Dr Casey Sample"],
    ];
    const SUFFIXES: Array<[string, string]> = [
      ["Jr and its dot", "Casey Sample Jr."],
      ["Jr without its dot", "Casey Sample Jr"],
      ["Sr and its dot", "Casey Sample Sr."],
      ["Sr without its dot", "Casey Sample Sr"],
      ["II", "Casey Sample II"],
      ["II and its dot", "Casey Sample II."],
      ["III", "Casey Sample III"],
      ["III and its dot", "Casey Sample III."],
      ["IV", "Casey Sample IV"],
      ["IV and its dot", "Casey Sample IV."],
      ["a suffix in capitals and its dot", "CASEY SAMPLE JR."],
      ["an honorific and a suffix", "Dr. Casey Sample Jr."],
      ["a run of two suffixes", "Casey Sample Jr. III"],
    ];
    const SAINTS: Array<[string, string]> = [
      ["St and its dot, inside", "Casey St. Sample"],
      ["St without its dot, inside", "Casey St Sample"],
      ["St and its dot, first", "St. Casey Sample"],
      ["St and its dot, last", "Casey Sample St."],
    ];

    it.each([...HONORIFICS, ...SUFFIXES, ...SAINTS])(
      "drops a person written with %s: alone, after a company of a title and of a description",
      (_what, person) => {
        expectPerson(person);
      },
    );

    it.each<[string, string]>([
      ["an honorific that is not the first word", "Casey Mr. Sample"],
      ["an honorific that is not the first word, in a name of three", "Casey Dr. Robin Sample"],
      ["a suffix that is not the last word", "Casey Jr. Sample"],
      ["a suffix first", "Jr. Casey Sample"],
      ["a dotted word that is no honorific", "Casey Ex. Sample"],
      ["the dotted abbreviation Corp", "Example Corp."],
      ["the dotted abbreviation Co", "Example Co."],
      ["the dotted abbreviation Bros", "Example Bros."],
      ["a dot in the middle of a word", "Casey Sam.ple"],
      ["a run of titles that a name opens", "Casey Dr. Prof. Sample"],
      ["a title that follows a suffix", "Casey Jr. Dr. Sample"],
    ])("keeps a name with %s: its dot makes no name word", (_what, party) => {
      expectNoPerson(party);
    });

    // A title or a suffix that no dot closes is read as its dotted form is, at the same places
    // (the closed list of HONORIFICS, SUFFIXES and `St`, in lower case), so that a person is never kept
    // for want of a dot: fail closed.
    const UNDOTTED: Array<[string, string]> = [
      ["Jr in lower case and no dot", "Casey Sample jr"],
      ["Sr in lower case and no dot", "Casey Sample sr"],
      ["II in lower case and no dot", "Casey Sample ii"],
      ["III in lower case and no dot", "Casey Sample iii"],
      ["IV in lower case and no dot", "Casey Sample iv"],
      ["a run of two suffixes in lower case", "Casey Sample jr iii"],
      ["a title and a suffix in lower case", "dr Casey Sample jr"],
      ["St in lower case and no dot, inside", "Casey st Sample"],
      ["St in lower case and no dot, last", "Casey Sample st"],
      ["St in lower case and no dot, first and one name", "st Sample"],
      ["a title in lower case and a name", "mr Casey Sample"],
      ["a title in lower case and a name of five words", "dr Casey Robin Lee Alex Sample"],
      ["a role, a title in lower case and one name", "its owner mr Sample"],
      ["two titles in lower case and one name", "dr prof Sample"],
      ["a title in lower case and one initial, as Mr. J. is read", "mr J."],
      ...[
        "mr",
        "mrs",
        "ms",
        "miss",
        "mx",
        "dr",
        "prof",
        "rev",
        "sir",
        "lord",
        "lady",
        "dame",
        "hon",
      ].map((title): [string, string] => [
        `${title} in lower case and one name`,
        `${title} Sample`,
      ]),
    ];
    it.each(UNDOTTED)(
      "drops a person written with %s: a word that no dot closes is read where its dot would make it a name word",
      (_what, person) => {
        expectPerson(person);
      },
    );

    it.each<[string, string]>([
      ["a title in lower case that is not the first word", "Casey mr Sample"],
      [
        "a title in lower case that is not the first word, in a name of three",
        "Casey dr Robin Sample",
      ],
      ["a suffix in lower case that is not the last word", "Casey jr Sample"],
      ["a title in lower case at the end", "Casey Sample mr"],
      ["a suffix in lower case that is the first word", "jr Sample"],
      ["a word in lower case that no list holds", "Casey Sample xr"],
      ["a word of a role between a title in lower case and one name", "mr owner Sample"],
    ])(
      "keeps a name with %s: a word that no dot closes is no name word at any other place",
      (_what, party) => {
        expectNoPerson(party);
      },
    );

    it("keeps a company that holds an honorific or a suffix next to a legal form or a word of an organisation", () => {
      for (const party of [
        "Dr. Casey Sample Limited",
        "Mrs. Sample Bank",
        "Casey Sample Jr. Holdings",
        "St. Example Charity",
        "St. Example Trust",
        "Lord Example Limited",
        "dr Sample Limited",
        "mrs Sample Bank",
        "Casey Sample jr Holdings",
        "st Example Charity",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${party}`, "")).toEqual(kept("monetary penalty", party, 0));
        expectNoPerson(party);
      }
    });

    const PREFIXED: Array<[string, string]> = [
      ["a name with the prefix De", "Casey DeSample"],
      ["a name with the prefix Da", "Casey DaSample"],
      ["a name with the prefix Di", "Casey DiSample"],
      ["a name with the prefix Du", "Casey DuSample"],
      ["a name with the prefix La", "Casey LaSample"],
      ["a name with the prefix Le", "Casey LeSample"],
      ["a name with the prefix Van", "Casey VanSample"],
      ["a name with the prefix Von", "Casey VonSample"],
      ["a name with the prefix Fitz", "Casey FitzSample"],
      ["a prefix and a name in capitals", "Casey DeSAMPLE"],
      ["a prefix after a hyphen", "Casey Sample-DeLee"],
      ["a prefix after an apostrophe", "Casey O'DeSample"],
      ["a prefix and a name of three parts", "Casey Van DeSample"],
      ["Mc and a name in capitals", "CASEY McSAMPLE"],
      ["Mac and a name in capitals", "Casey MacSAMPLE"],
      ["Mc, a run of capitals and a hyphenated name", "Casey McSAMPLE-Lee"],
      ["the particle la between two names", "Casey la Sample"],
      ["the particle le between two names", "Casey le Sample"],
      ["the particles de and la", "Casey de la Sample"],
      ["the particles de and las", "Casey de las Sample"],
      ["the particles de and los", "Casey de los Sample"],
      ["the particle dos", "Casey dos Sample"],
      ["the particle das", "Casey das Sample"],
      ["the particle do", "Casey do Sample"],
      ["the particle e", "Casey e Sample"],
      ["the particle y", "Casey y Sample"],
      ["the particle zu", "Casey zu Sample"],
      ["the particle op", "Casey op Sample"],
      ["the particle af", "Casey af Sample"],
      ["three particles in a row", "Casey de la y Sample"],
    ];
    it.each(PREFIXED)(
      "drops %s: alone, after a company of a title and of a description",
      (_what, person) => {
        expectPerson(person);
      },
    );

    it("reads each of these particles between two names, and in no other place", () => {
      for (const particle of [
        "la",
        "le",
        "las",
        "los",
        "do",
        "dos",
        "das",
        "e",
        "y",
        "zu",
        "op",
        "af",
      ]) {
        expect(readings(`Casey ${particle} Sample`).penalty).toEqual(gone("monetary penalty"));
        for (const party of [
          `${particle} Casey Sample`,
          `Casey Sample ${particle}`,
          `Casey ${particle}`,
        ]) {
          expectNoPerson(party);
        }
      }
    });

    it.each<[string, string]>([
      ["a lower-case letter after the prefix", "Casey DeepSample"],
      ["a capital after a word that the list of prefixes does not hold", "Casey DoSample"],
      ["a capital inside a word that no rule names", "Casey SampleCorp"],
      ["a capital after Mc that a digit ends", "Casey McSAMPLE2"],
    ])("keeps a name with %s: no prefix of the list opens it", (_what, party) => {
      expectNoPerson(party);
    });

    it("keeps the company of the same shapes when it has a legal form or a word of an organisation", () => {
      for (const party of [
        "Casey DeSample Limited",
        "CASEY McSAMPLE Holdings",
        "Casey Van DeSample Bank",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${party}`, "")).toEqual(kept("monetary penalty", party, 0));
      }
    });

    const ROLES: Array<[string, string]> = [
      ["its director", "its director Casey Sample"],
      ["the owner", "the owner Casey Sample"],
      ["former", "former Casey Sample"],
      ["its former director", "its former director Casey Sample"],
      ["a role and an honorific", "its director Mrs. Casey Sample"],
      ["a role in capitals of the name", "the owner CASEY SAMPLE"],
      ["a role and a hyphen", "its co-owner Casey Sample"],
      ["a dash and a role", "Casey Sample - director"],
      ["an en dash and a role", `Casey Sample ${EN_DASH} director`],
      ["a comma and a role", "Casey Sample, owner"],
      ["a comma and the role of two words", "Casey Sample, the owner"],
      ["a dash and a role of three words", "Casey Sample - its sole director"],
      ["a role before and a role after", "its director Casey Sample, owner"],
      ["a role of four words before the name", "its former sole director Casey Sample"],
      ["a role of four words after a dash", "Casey Sample - its former sole director"],
      ["a role after a comma and a role after a dash", "Casey Sample, owner - director"],
      // A word of a role that is also a title leads no name: the name word must follow it at once.
      ["a role that begins with a word that is also a title", "hon secretary Casey Sample"],
      ["a role that begins with the word lord", "lord mayor Casey Sample"],
      ["a role and a title in lower case", "its owner dr Casey Sample"],
    ];
    it.each(ROLES)(
      "drops a person with %s: alone, after a company of a title and of a description",
      (_what, person) => {
        // In a description the spaced dash ends the list, so a role after a dash is never read.
        expectPerson(person);
      },
    );

    it("puts the role after a comma aside in a title of one slot, even when a list would not take it for a role", () => {
      // A part with a word of an organisation, or of five words, is no fragment of a role: the slot
      // does not read as a list, it is one party, and the role at its end is put aside as a whole.
      for (const person of [
        "Casey Sample, owner of the company",
        "Casey Sample, its former sole managing director",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${person}`, "")).toEqual(gone("monetary penalty"));
      }
    });

    // A legal form is the company's, not a role. A trailing role (a comma or a spaced dash,
    // then lower-case words) that is made of legal forms ALONE (one to three words, each of the list
    // that the keys use, `isLegalFormOrArticle`, and `na`, or the letters of one written apart) is no
    // role: a company that has the shape of a person's name stays one party. A form among other words
    // is a part of a role (`co owner`) and the person goes. The capital form was never a role (a role
    // begins with a lower-case word), so both are kept.
    const COMPANY_FORMS = [
      "ltd",
      "limited",
      "inc",
      "incorporated",
      "llc",
      "llp",
      "lp",
      "plc",
      "corp",
      "corporation",
      "co",
      "gmbh",
      "ag",
      "sa",
      "bv",
      "nv",
      "pty",
      "pte",
      "na",
      "oy",
      "ab",
      "sas",
      "sarl",
      "srl",
      "spa",
      "kk",
      "pvt",
    ];
    const capitalOf = (word: string): string => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
    // The legal forms of this person rule: a part that is one of them alone is no party, and no role.
    const OWN_FORMS = new Set([
      "limited",
      "ltd",
      "plc",
      "llp",
      "llc",
      "ag",
      "sa",
      "na",
      "inc",
      "gmbh",
      "bv",
    ]);
    const FORM_ROWS = COMPANY_FORMS.flatMap((form) =>
      [", ", " - "].map((separator): [string, string] => [form, separator]),
    );

    it.each(FORM_ROWS)(
      "keeps a company that the legal form %s follows after %j as one party, as the capital form is kept",
      (form, separator) => {
        const lower = `Example Sample${separator}${form}`;
        const capital = `Example Sample${separator}${capitalOf(form)}`;
        for (const party of [lower, capital]) {
          expect(ofsiReadingOf(`${PENALTY}${party}`, "")).toEqual(
            kept("monetary penalty", party, 0),
          );
          expect(ofsiReadingOf(`Disclosure notice: ${party}`, "")).toEqual(
            kept("disclosure", party, 0),
          );
        }
        // A description is never one party here: its comma splits the list before any tail is read, and its
        // spaced dash ends the list. A form of this rule's own list is no party alone, so that notice is
        // unreadable; any other form is left out as a part that is a role, and the person before it
        // goes. The spaced dash gives the person before it, whatever the form.
        expect(readings(lower).description).toEqual(
          separator === ", " && OWN_FORMS.has(form) ? { shape: "unreadable" } : gone("disclosure"),
        );
      },
    );

    it("reads a company that a legal form follows in a description: the comma splits the list, a spaced dash ends it", () => {
      // A legal form alone is no party, so the notice that a comma divides is unreadable; the party that
      // stands before a spaced dash is read alone (what follows the dash is never read).
      for (const form of ["ltd", "Ltd"]) {
        expect(readings(`Example Sample, ${form}`).description).toEqual({ shape: "unreadable" });
        expect(readings(`Example Sample - ${form}`).description).toEqual(gone("disclosure"));
      }
    });

    it("keeps a company whose legal form is written with capitals or with its dots, as it always was", () => {
      // A capital word, and a word that a dot closes, are no word of a role: nothing is put aside.
      for (const company of [
        "Example Sample, LTD",
        "Example Sample, Ltd.",
        "Example Sample - Inc",
        "Example Sample, N.A.",
        "Example Sample, S.p.A.",
        "Example Sample, ltd.",
        "Example Sample - inc.",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${company}`, "")).toEqual(
          kept("monetary penalty", company, 0),
        );
      }
    });

    // Fail closed: the tail is the company's only when it is made of legal forms ALONE, one to
    // three words. A description never reads the company as one party (its comma splits the list and
    // its spaced dash ends it), so what is asked of it is that the name before the tail goes.
    const expectNameLeftOut = (reading: unknown): void => {
      expect(JSON.stringify(reading)).not.toMatch(/sample/i);
    };

    it("reads the shapes of a tail of legal forms alone in a title and in a description", () => {
      // A tail of one form, and of forms: one party in a title. A description splits at its comma before it
      // reads a tail, so the company is never one party there and the name goes. A form of this rule's own
      // list is no role fragment, so a tail that holds one (`pty ltd`) is a party of its own in a
      // description: no name of a person, and no role; any other tail is left out as a role.
      expect(readings("Example Sample, ltd")).toEqual({
        penalty: kept("monetary penalty", "Example Sample, ltd", 0),
        disclosure: kept("disclosure", "Example Sample, ltd", 0),
        description: { shape: "unreadable" },
      });
      const formsAlone: Array<[string, unknown]> = [
        ["pty ltd", kept("disclosure", "pty ltd")],
        ["co ltd", kept("disclosure", "co ltd")],
        ["s a", gone("disclosure")],
      ];
      for (const [tail, description] of formsAlone) {
        const party = `Example Sample, ${tail}`;
        const reading = readings(party);
        expect(reading.penalty).toEqual(kept("monetary penalty", party, 0));
        expect(reading.disclosure).toEqual(kept("disclosure", party, 0));
        expect(reading.description).toEqual(description);
      }
      // A form among the words of a role: the person with a role, put aside as a person.
      const formAmongWords: Array<[string, unknown]> = [
        ["co owner", gone("disclosure")],
        ["owner of ltd", kept("disclosure", "owner of ltd")],
        ["ltd owner", kept("disclosure", "ltd owner")],
      ];
      for (const [tail, description] of formAmongWords) {
        const reading = readings(`Casey Sample, ${tail}`);
        expect(reading.penalty).toEqual(gone("monetary penalty"));
        expect(reading.disclosure).toEqual(gone("disclosure"));
        expect(reading.description).toEqual(description);
      }
      // The same tail after a company that is no person: one party in a title, two in a description.
      expect(readings("Otherco PLC, pty ltd")).toEqual({
        penalty: kept("monetary penalty", "Otherco PLC, pty ltd", 0),
        disclosure: kept("disclosure", "Otherco PLC, pty ltd", 0),
        description: {
          shape: "notice",
          kind: "disclosure",
          parties: ["Otherco PLC", "pty ltd"],
          persons: 0,
        },
      });
    });

    it.each<[string, string]>([
      ["a form of the keys and one of the person rule's own list", "pty ltd"],
      ["the same two the other way round", "ltd pty"],
      ["two forms of the person rule's own list", "ltd inc"],
      ["two forms that the person rule's own list has not", "pty pte"],
      ["a form written in full and a short one", "corp co"],
      ["three forms", "co pty ltd"],
    ])("keeps a company whose tail is %s alone: %j", (_what, tail) => {
      for (const separator of [", ", " - "]) {
        const party = `Example Sample${separator}${tail}`;
        const { penalty, disclosure, description } = readings(party);
        expect(penalty).toEqual(kept("monetary penalty", party, 0));
        expect(disclosure).toEqual(kept("disclosure", party, 0));
        expectNameLeftOut(description);
      }
    });

    // The letters of a form that are written apart are that form (`s a` is `sa`, `l l c` is `llc`): two
    // or three single letters, and only a form of the list.
    const SPELLED = COMPANY_FORMS.filter((form) => form.length <= 3).map((form) =>
      form.split("").join(" "),
    );
    it.each(SPELLED)("keeps a company whose legal form has its letters apart: %j", (tail) => {
      for (const separator of [", ", " - "]) {
        const party = `Example Sample${separator}${tail}`;
        const { penalty, disclosure, description } = readings(party);
        expect(penalty).toEqual(kept("monetary penalty", party, 0));
        expect(disclosure).toEqual(kept("disclosure", party, 0));
        expectNameLeftOut(description);
      }
    });

    it.each<[string, string]>([
      ["co, for co-owner, and a role", "co owner"],
      ["a form at the end of a role", "owner of ltd"],
      ["a form at the start of a role", "ltd owner"],
      ["a form at the end of a role of two words", "owner ltd"],
      ["a form and the word and", "ltd and others"],
      ["a form and a word of an organisation", "trading ltd"],
      ["a form and the article", "the co"],
      ["a form and the word as", "as ltd"],
      ["a form and the word company, before it", "company ltd"],
      ["a form and the word company, after it", "ltd company"],
      ["a limited partner", "limited partner"],
      ["a role of four words", "director of example ltd"],
      ["a form, a dash and a role", "ltd - director"],
      ["a role, a dash and a form", "owner - ltd"],
      ["two forms and a dash between them", "ltd - inc"],
      ["four forms, one more than a tail may have", "co pty ltd inc"],
      ["four forms of the person rule's own list", "ltd ltd ltd ltd"],
      ["the letters of a form and a form", "s a ltd"],
      ["two letters that spell no form", "s b"],
      ["two letters that spell the word as", "a s"],
      ["one letter", "a"],
      ["four letters that spell a form", "c o r p"],
      ["a word and a letter that spell a form together", "lt d"],
      ["a letter and a word that spell a form together", "l td"],
    ])("reads a tail with %s as a role, and puts the person aside: %j", (_what, tail) => {
      for (const separator of [", ", " - "]) {
        const { penalty, disclosure, description } = readings(`Casey Sample${separator}${tail}`);
        expect(penalty).toEqual(gone("monetary penalty"));
        expect(disclosure).toEqual(gone("disclosure"));
        expectNameLeftOut(description);
      }
    });

    it("keeps a list of persons a list when a lower-case part that holds a legal form stands inside it", () => {
      // Only the tail at the end of a slot belongs to the party before it: a part in the middle is a role
      // as it was, so that no person of a list is read into a party because of a form beside it.
      for (const [list, persons] of [
        ["Casey Sample, corp and Robin Example", 2],
        ["Casey Sample, co owner, and Robin Example", 2],
        ["Casey Sample, co, Robin Example", 2],
        ["Casey Sample, sarl and Robin Example, director", 2],
      ] as const) {
        expect(ofsiReadingOf(`${PENALTY}${list}`, "")).toEqual(gone("monetary penalty", persons));
      }
      // A form that no comma joins to the name is not the tail of a role: the part is left out as it was.
      for (const list of [
        "Casey Sample and corp",
        "Casey Sample, and corp",
        "Casey Sample; corp",
        "Casey Sample & corp",
        "Casey Sample / corp",
        "Casey Sample with corp",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${list}`, "")).toEqual(gone("monetary penalty"));
      }
      // A company that a person follows keeps its place, and a form after the company is no party.
      for (const list of [
        "Examplecorp Limited, corp and Casey Sample",
        "Examplecorp Limited, sarl and Casey Sample",
        "Examplecorp Limited, co owner and Casey Sample",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${list}`, "")).toEqual(
          kept("monetary penalty", "Examplecorp Limited", 1),
        );
      }
      // The role at the end of a list that a person splits is left out of its party, and a lone form of this
      // rule's own list after a person still makes the notice unreadable, as it did.
      expect(
        ofsiReadingOf(
          `${PENALTY}Examplecorp Limited and Casey Sample and Otherco PLC, operator`,
          "",
        ),
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: ["Examplecorp Limited", "Otherco PLC"],
        persons: 1,
      });
      for (const form of ["ltd", "Ltd"]) {
        expect(
          ofsiReadingOf(`${PENALTY}Examplecorp Limited and Casey Sample, ${form}`, ""),
        ).toEqual({ shape: "unreadable" });
      }
    });

    it("keeps a tail of legal forms with the party that it closes, in a list that a person splits, and puts a role that holds a form aside", () => {
      // A tail that holds a form of this rule's own list is no role fragment: it is neither merged nor
      // left out, and a list that a person splits has it as a party of its own (as a description does),
      // whether it is forms alone or a role that holds one.
      for (const tail of ["pty ltd", "co ltd", "ltd owner", "owner of ltd"]) {
        expect(
          ofsiReadingOf(
            `${PENALTY}Examplecorp Limited and Casey Sample and Otherco PLC, ${tail}`,
            "",
          ),
        ).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: ["Examplecorp Limited", "Otherco PLC", tail],
          persons: 1,
        });
      }
      for (const tail of ["corp", "co corp", "s a"]) {
        expect(
          ofsiReadingOf(
            `${PENALTY}Examplecorp Limited and Casey Sample and Otherco PLC, ${tail}`,
            "",
          ),
        ).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: ["Examplecorp Limited", `Otherco PLC, ${tail}`],
          persons: 1,
        });
      }
      // A form among the words of a role is no tail of forms: the role is left out of the party it closes.
      for (const tail of ["co owner", "the co"]) {
        expect(
          ofsiReadingOf(
            `${PENALTY}Examplecorp Limited and Casey Sample and Otherco PLC, ${tail}`,
            "",
          ),
        ).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: ["Examplecorp Limited", "Otherco PLC"],
          persons: 1,
        });
      }
    });

    it("reads a description that holds a lower-case legal form of the keys: the part is a role and goes", () => {
      expect(readings("Casey Sample, corp and Robin Example").description).toEqual(
        gone("disclosure", 2),
      );
      expect(readings("Examplecorp Limited, sarl and Casey Sample").description).toEqual(
        kept("disclosure", "Examplecorp Limited", 1),
      );
      expect(readings("Examplecorp Limited and Casey Sample, co owner").description).toEqual(
        kept("disclosure", "Examplecorp Limited", 1),
      );
    });

    it("puts the person aside when the tail that closes a title, a list or a bracket holds a legal form among other words", () => {
      for (const slot of [
        "Casey Sample, co owner",
        "Casey Sample, limited partner",
        "Casey Sample, director of example ltd",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${slot}`, "")).toEqual(gone("monetary penalty"));
      }
      // A list that a person splits has the company left, and one person.
      for (const slot of [
        "Examplecorp Limited and Casey Sample, co owner",
        "Examplecorp Limited and Casey Sample, the co",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${slot}`, "")).toEqual(kept("monetary penalty", COMPANY));
      }
      // The inside of a bracket is read as a slot of its own, in a title and in a description: the only
      // place where a description reads a tail.
      for (const slot of [
        "Examplecorp Limited (Casey Sample, co owner)",
        "Examplecorp Limited (Casey Sample, owner of ltd)",
        "Examplecorp Limited (Casey Sample, ltd owner)",
        "Examplecorp Limited (Casey Sample, owner)",
      ]) {
        const { penalty, description } = readings(slot);
        expect(penalty).toEqual(kept("monetary penalty", COMPANY));
        expect(description).toEqual(kept("disclosure", COMPANY));
      }
    });

    it("keeps the person in the party when the tail that closes a title, a list or a bracket is made of legal forms alone: the residual that the header states", () => {
      // The tail is the company's, though `co` may be co-owner: a name before it is a company's, and a
      // list with no person left is one party.
      for (const slot of [
        "Casey Sample, co",
        "Casey Sample, corp",
        "Casey Sample, s a",
        "Casey Sample - co corp",
        "Examplecorp Limited and Casey Sample, co",
        "Examplecorp Limited and Casey Sample, corp",
        "Examplecorp Limited and Casey Sample, s a",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${slot}`, "")).toEqual(kept("monetary penalty", slot, 0));
      }
      // A bracket likewise, in a title and in a description.
      for (const slot of [
        "Examplecorp Limited (Casey Sample, co)",
        "Examplecorp Limited (Casey Sample, corp)",
        "Examplecorp Limited (Casey Sample, pty ltd)",
        "Examplecorp Limited (Casey Sample, s a)",
      ]) {
        const { penalty, description } = readings(slot);
        expect(penalty).toEqual(kept("monetary penalty", slot, 0));
        expect(description).toEqual(kept("disclosure", slot, 0));
      }
      // A person with a role and then a tail of forms is not read: the tail is the company's, and the
      // role before it stays with the name.
      expect(ofsiReadingOf(`${PENALTY}Casey Sample, owner, co`, "")).toEqual(
        kept("monetary penalty", "Casey Sample, owner, co", 0),
      );
    });

    it.each<[string, string]>([
      ["a role after a comma", "Example Sample, owner"],
      ["a role after a spaced dash", "Example Sample - director"],
      ["a role of two words", "Example Sample, the owner"],
      ["a role with the word as", "Example Sample, as director"],
      ["a role with the word as, after a spaced dash", "Example Sample - as director"],
      ["a role that holds a word of an organisation, after a comma", "Example Sample, holdings"],
      ["a role that holds a word of an organisation, after a dash", "Example Sample - holdings"],
      ["a role that holds the word company", "Casey Sample, owner of the company"],
      ["a role with a hyphen that begins as a legal form does", "Example Sample, co-owner"],
    ])("still reads a role that holds no legal form as a role: %s", (_what, person) => {
      expect(ofsiReadingOf(`${PENALTY}${person}`, "")).toEqual(gone("monetary penalty"));
    });

    it("drops every person of a list that names persons with their roles, in a title and in a description", () => {
      for (const [list, persons] of [
        ["its director Casey Sample and its owner Robin Example", 2],
        ["Casey Sample, director, and Robin Example, owner", 2],
        ["Casey Sample, director, Robin Example, owner and Alex Person", 3],
      ] as const) {
        expect(ofsiReadingOf(`${PENALTY}${list}`, "")).toEqual(gone("monetary penalty", persons));
      }
      // The Oxford comma of a description makes a part that begins with and: that notice is unreadable.
      expect(ofsiReadingOf(DATE_TITLE, `${BY} Casey Sample, director, and Robin Example`)).toEqual({
        shape: "unreadable",
      });
      expect(
        ofsiReadingOf(
          DATE_TITLE,
          `${BY} Casey Sample, director, Robin Example, owner and Alex Person`,
        ),
      ).toEqual(gone("disclosure", 3));
    });

    it("leaves out a part of a list that is made of lower-case words alone: a role, and no name", () => {
      // The list of a description is read as one, so the role between two parties goes.
      expect(
        ofsiReadingOf(DATE_TITLE, `${BY} ${COMPANY}, director, Otherco PLC and its owner`),
      ).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: [COMPANY, "Otherco PLC"],
        persons: 0,
      });
      // A title with a company and a role only is no list that holds a person: one party, as it was.
      expect(partiesOf(`${PENALTY}${COMPANY}, the operator`)).toEqual([`${COMPANY}, the operator`]);
    });

    it("leaves out a part of up to four lower-case words and keeps one of five: the limit of a role", () => {
      expect(
        ofsiReadingOf(DATE_TITLE, `${BY} ${COMPANY}, its former sole director, Otherco PLC`),
      ).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: [COMPANY, "Otherco PLC"],
        persons: 0,
      });
      expect(
        ofsiReadingOf(
          DATE_TITLE,
          `${BY} ${COMPANY}, its former sole managing director, Otherco PLC`,
        ),
      ).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: [COMPANY, "its former sole managing director", "Otherco PLC"],
        persons: 0,
      });
    });

    it("keeps a part made of particles: a particle is a word of a name, never of a role", () => {
      expect(ofsiReadingOf(DATE_TITLE, `${BY} ${COMPANY}, van al, Otherco PLC`)).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: [COMPANY, "van al", "Otherco PLC"],
        persons: 0,
      });
    });

    it("keeps a part of lower-case words that holds a legal form or a word of an organisation: a name, no role", () => {
      for (const part of ["example holdings", "example limited", "the trust"]) {
        expect(ofsiReadingOf(DATE_TITLE, `${BY} ${COMPANY}, ${part}, Otherco PLC`)).toEqual({
          shape: "notice",
          kind: "disclosure",
          parties: [COMPANY, part, "Otherco PLC"],
          persons: 0,
        });
      }
    });

    it("is unreadable when a description has nothing left but roles, and reads a title of roles as one party, as it was", () => {
      expect(ofsiReadingOf(DATE_TITLE, `${BY} director`)).toEqual({ shape: "unreadable" });
      expect(ofsiReadingOf(DATE_TITLE, `${BY} its owner, director`)).toEqual({
        shape: "unreadable",
      });
      expect(partiesOf(`${PENALTY}its director, the owner`)).toEqual(["its director, the owner"]);
    });

    it("keeps a name whose rest, once the role is taken off, holds a legal form or a word of an organisation", () => {
      for (const party of [
        "its director Examplecorp Limited",
        "the owner Example Bank",
        "its trustee Example Trust",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${party}`, "")).toEqual(kept("monetary penalty", party, 0));
        expectNoPerson(party);
      }
    });

    it("keeps a name with a role when one name only is left of it: a single word is out of the rule", () => {
      // The surname stays in the party and its key: the residual that the header states.
      for (const party of ["its director Casey", "the owner Sample"]) {
        expectNoPerson(party);
      }
      expect(partiesOf(`${PENALTY}${COMPANY} and Casey`)).toEqual([`${COMPANY} and Casey`]);
      expect(partiesOf(`${PENALTY}${COMPANY} and Sample`)).toEqual([`${COMPANY} and Sample`]);
    });

    it("keeps a name that a particle opens, whatever lower-case words come before it", () => {
      // A particle is a word of a name, never a word of a role: the leading words stop at it.
      expectNoPerson("de Casey Sample");
      expectNoPerson("its de Casey Sample");
    });

    it("does not apply to the parties of a notice that names charities", () => {
      for (const party of ["Mrs. Casey Sample", "its director Casey Sample", "Casey DeSample"]) {
        expect(partiesOf(DATE_TITLE, `${BY} charities ${party}`)).toEqual([party]);
      }
      expect(partiesOf(DATE_TITLE, `${BY} charities Example Aid, owner`)).toEqual([
        "Example Aid",
        "owner",
      ]);
    });
  });

  describe("a title that names more than one party", () => {
    const PENALTY = "Imposition of monetary penalty: ";

    it("drops the person of a title that lists a company and a person, and keeps the company", () => {
      for (const [company, person] of [
        ["Examplecorp Limited", "Casey Sample-Lee"],
        ["Examplecorp Limited", "CASEY SAMPLE"],
        ["Examplecorp Limited", `Jos${cp(0xe9)} Garc${cp(0xed)}a`],
        ["Examplecorp Limited", "Casey J Sample"],
        ["Examplecorp Limited", "Casey McSample"],
        ["Examplecorp Limited", "Casey Robin Lee Sample"],
        ["Example Bank", "Casey Sample"],
      ]) {
        for (const joint of [" and ", ", "]) {
          const slot = `${company}${joint}${person}`;
          expect(ofsiReadingOf(`${PENALTY}${slot}`, "")).toEqual({
            shape: "notice",
            kind: "monetary penalty",
            parties: [company],
            persons: 1,
          });
          expect(ofsiReadingOf(`Disclosure notice: ${slot}`, "")).toEqual({
            shape: "notice",
            kind: "disclosure",
            parties: [company],
            persons: 1,
          });
        }
      }
    });

    it("keeps each company of a list that holds persons, in the order of the text", () => {
      expect(
        ofsiReadingOf(`${PENALTY}Examplecorp Limited, Casey Sample and Otherco PLC`, ""),
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: ["Examplecorp Limited", "Otherco PLC"],
        persons: 1,
      });
      expect(
        ofsiReadingOf(`${PENALTY}Casey Sample, Examplecorp Limited and Robin Example`, ""),
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: ["Examplecorp Limited"],
        persons: 2,
      });
      expect(
        ofsiReadingOf(`${PENALTY}Examplecorp Limited, Examplebread and Casey Sample`, ""),
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: ["Examplecorp Limited", "Examplebread"],
        persons: 1,
      });
    });

    it("drops every person of a title that lists persons only", () => {
      for (const [slot, persons] of [
        ["Casey Sample-Lee and Robin Example", 2],
        ["Casey Sample, Robin Example and Alex Person", 3],
      ] as const) {
        expect(ofsiReadingOf(`${PENALTY}${slot}`, "")).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: [],
          persons,
        });
      }
    });

    it("reads a title as one party when no person-shaped part follows a company: a name may hold and, or a comma", () => {
      for (const slot of [
        "Example Bread and Butter Limited",
        "Examplebread and Examplebutter Limited",
        "Alpha and Omega plc",
        "Example Bank, Inc",
        "Example Bank and Trust Company",
        "Examplecorp Limited and Otherco Limited",
        // It opens with the person's shape and ends with a legal form: a company may be named so
        // (`Example Bread and Sons Limited`), and the shape cannot tell it from a list.
        "Example Bread and Sons Limited",
        "Casey Sample and Examplecorp Limited",
      ]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
      }
    });

    it("is unreadable when a part of a list that holds a person is no party", () => {
      for (const slot of [
        "Examplecorp Limited, , Casey Sample",
        "Examplecorp Limited, 08 September 2025, Casey Sample",
        "Examplecorp Limited, Ltd and Casey Sample",
        // A legal form on its own ends the name before it: the part after it is a person, and a list.
        "Examplecorp, Ltd and Casey Sample",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${slot}`, "")).toEqual({ shape: "unreadable" });
      }
    });

    it("is read to 300 characters like any title, a list as well: one more is unreadable", () => {
      // The parts are short, so no party limit refuses the title: the limit of the title does.
      const persons = ", Casey Sample".repeat(10);
      const whole = (length: number): string => {
        const company = `${"x".repeat(length - PENALTY.length - persons.length - " Limited".length)} Limited`;
        return `${PENALTY}${company}${persons}`;
      };
      expect(whole(300)).toHaveLength(300);
      expect(ofsiReadingOf(whole(300), "")).toMatchObject({
        shape: "notice",
        parties: [whole(300).slice(PENALTY.length, -persons.length)],
        persons: 10,
      });
      expect(ofsiReadingOf(whole(301), "")).toEqual({ shape: "unreadable" });
      expect(ofsiReadingOf(whole(400), "")).toEqual({ shape: "unreadable" });
    });

    it("is unreadable when it lists more parties than any real notice has", () => {
      const companies = Array.from(
        { length: 25 },
        (_, at) => `Example Aid ${"I".repeat(at + 1)} Limited`,
      );
      expect(ofsiReadingOf(`${PENALTY}${companies.join(", ")}, Casey Sample`, "")).toEqual({
        shape: "unreadable",
      });
    });
  });

  describe("a title that joins a person to a party by another word", () => {
    const PENALTY = PENALTY_OF;
    const DATE_TITLE = DATE_TITLE_OF;
    const BY = BY_OF;
    const COMPANY = COMPANY_OF;
    const PERSON = "Casey Sample";
    const OTHER = "Robin Example";
    const SERVICES = "Example Services";
    const gone = nobody;
    const kept = only;
    const readings = readingsOf;

    /** The joiners that a title is split at, apart from the comma and the word and that were read before. */
    const JOINERS: Array<[string, string]> = [
      ["an ampersand", " & "],
      ["a slash", " / "],
      ["a semicolon", "; "],
      ["the word with", " with "],
    ];
    const OXFORD: [string, string] = ["a comma and the word and", ", and "];

    it.each(JOINERS)(
      "drops the person that %s joins to a company: the company stays, in a title and in a description",
      (_what, joint) => {
        const slot = `${COMPANY}${joint}${PERSON}`;
        const read = readings(slot);
        expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
        expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
        expect(read.description).toEqual(kept("disclosure", COMPANY));
      },
    );

    it("drops the person after a comma and the word and: the part is read without the and", () => {
      const slot = `${COMPANY}${OXFORD[1]}${PERSON}`;
      expect(readings(slot).penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(readings(slot).disclosure).toEqual(kept("disclosure", COMPANY));
      // A list that has the comma before its last and, as the Oxford comma writes it.
      expect(readings(`${COMPANY}, Otherco PLC, and ${PERSON}`).penalty).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [COMPANY, "Otherco PLC"],
        persons: 1,
      });
      expect(readings(`${PERSON}, ${OTHER}, and Alex Person`).penalty).toEqual(
        gone("monetary penalty", 3),
      );
      // The description keeps its rule: a part that begins with and is no party, so it is unreadable.
      expect(readings(slot).description).toEqual({ shape: "unreadable" });
    });

    it.each([...JOINERS, OXFORD])(
      "drops every person of a list that %s joins, when no company is in it",
      (_what, joint) => {
        const slot = `${PERSON}${joint}${OTHER}`;
        expect(readings(slot).penalty).toEqual(gone("monetary penalty", 2));
        expect(readings(slot).disclosure).toEqual(gone("disclosure", 2));
        if (joint !== OXFORD[1]) expect(readings(slot).description).toEqual(gone("disclosure", 2));
      },
    );

    it.each([...JOINERS, OXFORD])(
      "keeps one party when the person comes first and %s follows it: the condition is the comma's and the and's",
      (_what, joint) => {
        // A person-first list cannot be told from one name that holds the joiner, as it cannot for and.
        const slot = `${PERSON}${joint}${COMPANY}`;
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
        expect(partiesOf(`Disclosure notice: ${slot}`)).toEqual([slot]);
        if (joint !== OXFORD[1]) expect(partiesOf(DATE_TITLE, `${BY} ${slot}`)).toEqual([slot]);
      },
    );

    it("reads a list with several joiners: each company stays, in the order of the text, and each person is counted", () => {
      expect(
        readings(`${COMPANY} & ${PERSON}, Otherco PLC / ${OTHER}; Thirdco Limited with Alex Person`)
          .penalty,
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [COMPANY, "Otherco PLC", "Thirdco Limited"],
        persons: 3,
      });
    });

    it.each(JOINERS)(
      "keeps one party when %s joins two companies: no person-shaped part follows a company",
      (_what, joint) => {
        for (const slot of [
          `${COMPANY}${joint}Otherco Limited`,
          `Example Bread${joint}Butter Limited`,
          `Alpha${joint}Omega plc`,
          `Example Bank${joint}Trust Company`,
        ]) {
          expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
          expect(partiesOf(DATE_TITLE, `${BY} ${slot}`)).toEqual([slot]);
        }
      },
    );

    it("reads a joiner only with blanks around it: a name that holds one without them stays one party", () => {
      for (const slot of [
        `${COMPANY}&${PERSON}`,
        `${COMPANY}/${PERSON}`,
        `${COMPANY};${PERSON}`,
        `${COMPANY} &${PERSON}`,
        `${COMPANY} with${PERSON}`,
      ]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
      }
    });

    it("reads a role phrase next to a joiner: the person is dropped with it", () => {
      expect(readings(`${COMPANY} & its director ${PERSON}`).penalty).toEqual(
        kept("monetary penalty", COMPANY),
      );
      expect(readings(`${COMPANY} with ${PERSON} - director`).penalty).toEqual(
        kept("monetary penalty", COMPANY),
      );
      // In a description the spaced dash ends the list, so the role after it is never read.
      expect(readings(`${COMPANY} & ${PERSON} - director`).description).toEqual(
        kept("disclosure", COMPANY),
      );
    });

    const MARKERS: Array<[string, string]> = [
      ["t/a", " t/a "],
      ["T/A", " T/A "],
      ["trading as", " trading as "],
      ["Trading As", " Trading As "],
      ["trading under", " trading under "],
    ];

    it.each(MARKERS)(
      "reads a sole trader that %s names: the person is dropped and the trade name stays",
      (_what, marker) => {
        const slot = `${PERSON}${marker}${SERVICES}`;
        const read = readings(slot);
        expect(read.penalty).toEqual(kept("monetary penalty", SERVICES));
        expect(read.disclosure).toEqual(kept("disclosure", SERVICES));
        expect(read.description).toEqual(kept("disclosure", SERVICES));
        // A trade name that has a legal form is a party too.
        expect(readings(`${PERSON}${marker}Example Services Limited`).penalty).toEqual(
          kept("monetary penalty", "Example Services Limited"),
        );
      },
    );

    it.each(MARKERS)(
      "reads a person that stands after %s: it is a person too, and the company stays",
      (_what, marker) => {
        expect(readings(`${COMPANY}${marker}${PERSON}`).penalty).toEqual(
          kept("monetary penalty", COMPANY),
        );
        expect(readings(`${COMPANY}${marker}${PERSON}`).description).toEqual(
          kept("disclosure", COMPANY),
        );
      },
    );

    it("keeps one party when the words before and after a marker name no person", () => {
      for (const slot of [
        `${COMPANY} t/a ${SERVICES}`,
        `${COMPANY} trading as Otherco Limited`,
        `Examplecorp Trading t/a Example Bank`,
      ]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
        expect(partiesOf(DATE_TITLE, `${BY} ${slot}`)).toEqual([slot]);
      }
    });

    it("counts a person for each side of a marker that names one, and keeps the other sides", () => {
      expect(readings(`${PERSON} t/a ${OTHER}`).penalty).toEqual(gone("monetary penalty", 2));
      expect(readings(`${PERSON} t/a ${SERVICES} t/a ${OTHER}`).penalty).toEqual(
        kept("monetary penalty", SERVICES, 2),
      );
    });

    it("reads a sole trader inside a list: the trade name stays next to the other companies", () => {
      expect(readings(`${COMPANY} and ${PERSON} t/a ${SERVICES}`).penalty).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [COMPANY, SERVICES],
        persons: 1,
      });
    });

    it("reads a sole trader that a comma and a marker name: the person goes, in a title and in a description", () => {
      const slot = `${PERSON}, trading as ${SERVICES}`;
      expect(readings(slot).penalty).toEqual(kept("monetary penalty", SERVICES));
      expect(readings(slot).disclosure).toEqual(kept("disclosure", SERVICES));
      // A description is split at the comma first: the person is a cell of its own and goes.
      const described = readings(slot).description;
      expect(described).toMatchObject({ shape: "notice", persons: 1 });
      expect(JSON.stringify(described)).not.toMatch(/Casey|Sample/);
      // A company that trades as a person: the person after the comma goes, the company stays.
      expect(readings(`${COMPANY}, trading as ${PERSON}`).penalty).toEqual(
        kept("monetary penalty", COMPANY),
      );
      expect(readings(`${COMPANY}, trading as ${PERSON}`).description).toEqual(
        kept("disclosure", COMPANY),
      );
    });

    it("needs the marker to have blanks around it", () => {
      for (const slot of [
        `${PERSON} t/a`,
        `${PERSON}t/a ${SERVICES}`,
        `${PERSON} t/a${SERVICES}`,
      ]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
      }
    });

    it("drops a person in a bracket that is no alias, and the person outside it, and keeps the party", () => {
      const read = readings(`${COMPANY} (${PERSON})`);
      expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
      expect(read.description).toEqual(kept("disclosure", COMPANY));
      const outside = readings(`${PERSON} (${COMPANY})`);
      expect(outside.penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(outside.disclosure).toEqual(kept("disclosure", COMPANY));
      expect(outside.description).toEqual(kept("disclosure", COMPANY));
    });

    it("reads a bracket with a role phrase and a bracket with two persons", () => {
      expect(readings(`${COMPANY} (its director ${PERSON})`).penalty).toEqual(
        kept("monetary penalty", COMPANY),
      );
      expect(readings(`${PERSON} (${OTHER})`).penalty).toEqual(gone("monetary penalty", 2));
    });

    it("reads a bracket as one part: a comma, the word and, a dash or a marker inside it splits no title and no description", () => {
      // The inside is read as a text of its own: a person with a role, two persons, a sole trader.
      const read = readings(`${COMPANY} (${PERSON}, director)`);
      expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
      expect(read.description).toEqual(kept("disclosure", COMPANY));
      const two = readings(`${COMPANY} (${PERSON} and ${OTHER})`);
      expect(two.penalty).toEqual(kept("monetary penalty", COMPANY, 2));
      expect(two.description).toEqual(kept("disclosure", COMPANY, 2));
      const trader = readings(`${COMPANY} (${PERSON} t/a ${SERVICES})`);
      expect(trader.penalty).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [COMPANY, SERVICES],
        persons: 1,
      });
      expect(trader.description).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties: [COMPANY, SERVICES],
        persons: 1,
      });
    });

    it("keeps one party when a bracket that holds a list names no person: the list is no part of the title", () => {
      for (const slot of [
        `${COMPANY} (formerly Otherco Limited, Thirdco PLC)`,
        `${COMPANY} (formerly Otherco Limited and Thirdco PLC)`,
      ]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
        expect(partiesOf(DATE_TITLE, `${BY} ${slot}`)).toEqual([slot]);
      }
    });

    it("reads a bracket that a cut left open, or that a dash of a description cuts: the words inside it are read to the end", () => {
      expect(readings(`${COMPANY} (${PERSON}`).penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(readings(`${COMPANY} (${PERSON}`).description).toEqual(kept("disclosure", COMPANY));
      // The spaced dash ends the list of a description inside the bracket: what is left of it is open.
      expect(readings(`${COMPANY} (${PERSON} - director)`).description).toEqual(
        kept("disclosure", COMPANY),
      );
      expect(readings(`${COMPANY} (${PERSON} - director)`).penalty).toEqual(
        kept("monetary penalty", COMPANY),
      );
    });

    it("reads a bracket inside a list: the person of the bracket goes and the other company stays", () => {
      expect(readings(`${COMPANY} & ${PERSON} (Otherco Limited)`).penalty).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [COMPANY, "Otherco Limited"],
        persons: 1,
      });
      // A person in a bracket of one part is counted, and the rest of the title is read as the title
      // of two companies is, as one party: no person-shaped part follows a company.
      expect(readings(`${COMPANY} (${PERSON}), Otherco PLC`).penalty).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [`${COMPANY}, Otherco PLC`],
        persons: 1,
      });
      expect(readings(`${COMPANY} (${PERSON}) and Otherco PLC`).penalty).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [`${COMPANY} and Otherco PLC`],
        persons: 1,
      });
    });

    it("keeps one party when a bracket holds no person, and keeps its alias out of the person rule", () => {
      for (const slot of [
        `${COMPANY} (Otherco Limited)`,
        `${COMPANY} (formerly known as Otherco Limited)`,
        `${COMPANY} (ABCDEFGHI)`,
        `${COMPANY} (director)`,
        `${COMPANY} ()`,
      ]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
      }
      // An alias of two to eight capitals, with or without its quotes, is cut from the party.
      for (const alias of ["EBL", `${OPEN_QUOTE}EBL${CLOSE_QUOTE}`, "ABCDEFGH"]) {
        expect(readings(`${COMPANY} (${alias})`).penalty).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: [COMPANY],
          persons: 0,
        });
      }
      expect(readings(`${PERSON} (CS)`).penalty).toEqual(gone("monetary penalty"));
      expect(readings(`${PERSON} (CS)`).description).toEqual(gone("disclosure"));
      // An alias long enough for a key is no side of the person: the person is counted, nothing else is made.
      expect(readings(`${PERSON} (ABCDEFGH)`).penalty).toEqual(gone("monetary penalty"));
      // Nine capitals are no alias (an alias has two to eight): the bracket is a side, and its name is a party.
      expect(readings(`${PERSON} (ABCDEFGHI)`).penalty).toEqual(
        kept("monetary penalty", "ABCDEFGHI"),
      );
    });

    it("does not read the joiners of a notice that names charities: the word charities names organisations", () => {
      for (const party of [
        `${COMPANY} & ${PERSON}`,
        `${PERSON} (${COMPANY})`,
        `${PERSON} t/a ${SERVICES}`,
        `${COMPANY}; ${PERSON}`,
      ]) {
        expect(partiesOf(DATE_TITLE, `${BY} charities ${party}`)).toEqual([party]);
      }
    });

    it("keeps the one-name leftover and the forms that the person rule leaves out: the residuals that the header states", () => {
      // A single word is out of the rule of two to five words: the surname stays in the party and its key.
      for (const slot of [`${COMPANY} and Casey`, `${COMPANY} & Sample`, `${COMPANY} (Casey)`]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
      }
      // The last name first, and a company that comes after a person and a comma.
      for (const slot of ["Sample, Casey", `${PERSON}, ${COMPANY}`]) {
        expect(partiesOf(`${PENALTY}${slot}`)).toEqual([slot]);
      }
    });
  });

  describe("a company that has a legal form of another country", () => {
    // The legal forms below make a company when they are the LAST word of a name (`Sdn Bhd`: the last
    // two), in the person rule (a name that ends in one is no person) and where a part ends a name (a person
    // after it is a person of a list). `Co`, `AS` and `SAS` are not among them: a surname can be written so.
    const PENALTY = PENALTY_OF;
    const gone = nobody;
    const kept = only;
    const readings = readingsOf;

    const ONE_WORD_FORMS = [
      "Corporation",
      "Incorporated",
      "Corp",
      "NV",
      "SARL",
      "Oy",
      "KK",
      "Kft",
      "ASA",
      "OOO",
      "JSC",
      "PJSC",
      "AB",
      "LP",
    ];
    const FORMS = [...ONE_WORD_FORMS, "Sdn Bhd"];
    const STEMS = ["Alden Brook", "ALDEN BROOK", "Alden-Brook", "Alden Brook Quentin"];

    it.each(FORMS)(
      "keeps a company of capitalised words that ends in %s, as a title and as a description",
      (form) => {
        for (const stem of STEMS) {
          const party = `${stem} ${form}`;
          const { penalty, disclosure, description } = readings(party);
          expect(penalty).toEqual(kept("monetary penalty", party, 0));
          expect(disclosure).toEqual(kept("disclosure", party, 0));
          expect(description).toEqual(kept("disclosure", party, 0));
        }
      },
    );

    it.each(FORMS)(
      "keeps a company that ends in %s in any case, and one that a role follows",
      (form) => {
        for (const written of [form.toUpperCase(), form.toLowerCase()]) {
          const party = `Alden Brook ${written}`;
          // The lower-case form is no name word, so the party was never a person: it must stay so.
          expect(readings(party).penalty).toEqual(kept("monetary penalty", party, 0));
        }
        const withRole = `Alden Brook ${form}, owner`;
        expect(ofsiReadingOf(`${PENALTY}${withRole}`, "")).toEqual(
          kept("monetary penalty", withRole, 0),
        );
      },
    );

    it.each(FORMS)(
      "ends the name before a person with %s: the company stays and the person after it is counted",
      (form) => {
        const company = `Alden Brook ${form}`;
        for (const joint of [" and ", " & ", ", ", " / ", "; ", " with "]) {
          const { penalty, disclosure, description } = readings(`${company}${joint}Casey Sample`);
          expect(penalty).toEqual(kept("monetary penalty", company));
          expect(disclosure).toEqual(kept("disclosure", company));
          expect(description).toEqual(kept("disclosure", company));
        }
        // Two persons after it: both are counted.
        expect(readings(`${company}, Casey Sample and Robin Example`).penalty).toEqual(
          kept("monetary penalty", company, 2),
        );
      },
    );

    it.each([
      "Corp.",
      "N.V.",
      "S.A.R.L.",
      "K.K.",
      "Kft.",
      "A.S.A.",
      "O.O.O.",
      "J.S.C.",
      "P.J.S.C.",
      "A.B.",
      "L.P.",
      "Sdn. Bhd.",
    ])(
      "ends the name before a person with %s, written with its dots: the dots make it no name word, and a form all the same",
      (dotted) => {
        const company = `Alden Brook ${dotted}`;
        expect(readings(company).penalty).toEqual(kept("monetary penalty", company, 0));
        expect(readings(company).description).toEqual(kept("disclosure", company, 0));
        expect(readings(`${company} and Casey Sample`).penalty).toEqual(
          kept("monetary penalty", company),
        );
        expect(readings(`${company} and Casey Sample`).description).toEqual(
          kept("disclosure", company),
        );
      },
    );

    it.each(ONE_WORD_FORMS)(
      "takes %s for a legal form only as the last word of a name: inside a name it is a name word",
      (form) => {
        for (const person of [
          `Casey ${form} Sample`,
          `${form} Casey Sample`,
          `Casey Robin ${form} Sample`,
        ]) {
          expect(ofsiReadingOf(`${PENALTY}${person}`, "")).toEqual(gone("monetary penalty"));
          expect(ofsiReadingOf(`Disclosure notice: ${person}`, "")).toEqual(gone("disclosure"));
          expect(readings(person).description).toEqual(gone("disclosure"));
        }
        // After a company the person is a person of the list, and its company stays.
        expect(readings(`Examplecorp Limited and Casey ${form} Sample`).penalty).toEqual(
          kept("monetary penalty", COMPANY_OF),
        );
      },
    );

    it("takes Sdn Bhd for a legal form only as the last two words, and Sdn or Bhd alone for none", () => {
      for (const person of [
        "Casey Sdn Bhd Sample",
        "Sdn Bhd Casey Sample",
        "Casey Sample Sdn",
        "Casey Sample Bhd",
        "Alden Brook Bhd Sdn",
        "Alden Sdn Brook Bhd",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${person}`, "")).toEqual(gone("monetary penalty"));
        expect(readings(person).description).toEqual(gone("disclosure"));
      }
    });

    it("keeps a company whose stem is the shape of a person's name and whose form is one of the list", () => {
      for (const party of [
        "Casey Sample Corporation",
        "CASEY SAMPLE Incorporated",
        "Casey Robin Lee Ann NV",
        "Casey McSample Oy",
        "Casey J Sample AB",
        "Casey de Sample SARL",
      ]) {
        expect(ofsiReadingOf(`${PENALTY}${party}`, "")).toEqual(kept("monetary penalty", party, 0));
        expect(readings(party).description).toEqual(kept("disclosure", party, 0));
      }
    });

    it("drops a company whose only form is a bare Co, AS or SAS, and a person whose surname is one of them: the residual that privacy keeps", () => {
      // A surname can be written like these, so privacy beats recall. They are no legal form of the
      // person rule (the tail rules read them as forms, and keep `Example Sample, co`).
      for (const form of ["Co", "AS", "SAS", "co", "as", "sas"]) {
        const company = `Alden Brook ${form}`;
        if (form === form.toLowerCase()) {
          // A lower-case word is no name word: the party was never a person (as before).
          expect(ofsiReadingOf(`${PENALTY}${company}`, "")).toEqual(
            kept("monetary penalty", company, 0),
          );
          continue;
        }
        expect(ofsiReadingOf(`${PENALTY}${company}`, "")).toEqual(gone("monetary penalty"));
        expect(readings(company).description).toEqual(gone("disclosure"));
        // And a person after a company with no other form is one more person of a list that is all persons.
        expect(readings(`${company} and Casey Sample`).penalty).toEqual(
          gone("monetary penalty", 2),
        );
      }
    });

    it("leaves the tail rules as they are: a tail of legal forms alone is the company's, in a title and in a list", () => {
      for (const tail of ["corp", "co", "s a", "pty ltd", "corporation", "incorporated", "nv"]) {
        const party = `Example Sample, ${tail}`;
        expect(ofsiReadingOf(`${PENALTY}${party}`, "")).toEqual(kept("monetary penalty", party, 0));
      }
      expect(
        ofsiReadingOf(`${PENALTY}Examplecorp Limited and Casey Sample and Otherco PLC, corp`, ""),
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: ["Examplecorp Limited", "Otherco PLC, corp"],
        persons: 1,
      });
    });
  });

  describe("a person tied to a company by a trade-name marker or by a joiner of the closed lists", () => {
    // The markers of a sole trader (the side that is a person goes and is counted, the other side
    // stays, in both positions, as `t/a` and `trading as` work) and the joiners of a title and of a
    // description (a person after a company that ends a name is read; a person first is not).
    const gone = nobody;
    const kept = only;
    const readings = readingsOf;
    const COMPANY = COMPANY_OF;
    const PERSON = "Casey Sample";
    const OTHER = "Robin Example";

    const MARKERS = [
      "d/b/a",
      "dba",
      "a/k/a",
      "aka",
      "f/k/a",
      "fka",
      "n/k/a",
      "nka",
      "also known as",
      "formerly known as",
      "now known as",
      "formerly",
    ];

    it.each(MARKERS)(
      "reads %s as the marker of a sole trader: the person goes and is counted, the company stays, before it and after it",
      (marker) => {
        for (const written of [marker, marker.toUpperCase()]) {
          const after = readings(`${COMPANY} ${written} ${PERSON}`);
          expect(after.penalty).toEqual(kept("monetary penalty", COMPANY));
          expect(after.disclosure).toEqual(kept("disclosure", COMPANY));
          expect(after.description).toEqual(kept("disclosure", COMPANY));
          const before = readings(`${PERSON} ${written} ${COMPANY}`);
          expect(before.penalty).toEqual(kept("monetary penalty", COMPANY));
          expect(before.disclosure).toEqual(kept("disclosure", COMPANY));
          expect(before.description).toEqual(kept("disclosure", COMPANY));
        }
      },
    );

    it.each(MARKERS)(
      "counts a person for each side of %s that names one, and a company that trades as a company is one party",
      (marker) => {
        const persons = readings(`${PERSON} ${marker} ${OTHER}`);
        expect(persons.penalty).toEqual(gone("monetary penalty", 2));
        expect(persons.disclosure).toEqual(gone("disclosure", 2));
        expect(persons.description).toEqual(gone("disclosure", 2));
        const companies = `${COMPANY} ${marker} Otherco PLC`;
        expect(partiesOf(`${PENALTY_OF}${companies}`)).toEqual([companies]);
        expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${companies}`)).toEqual([companies]);
      },
    );

    it.each(MARKERS)(
      "reads %s after a comma too: a person that follows it goes, in a title and in a description",
      (marker) => {
        const read = readings(`${COMPANY}, ${marker} ${PERSON}`);
        expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
        expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
        // A description is split at its commas first: the cell that the marker opens is read as a person
        // that a role (the marker, written in lower case) leads, and goes with its name.
        expect(read.description).toEqual(kept("disclosure", COMPANY));
      },
    );

    it("keeps one party when the words before and after a marker name no person", () => {
      for (const marker of MARKERS) {
        for (const slot of [
          `${COMPANY} ${marker} Otherco Limited`,
          `Examplecorp Trading ${marker} Example Bank`,
        ]) {
          expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
        }
      }
    });

    it("needs the marker to have blanks around it, and reads a marker that is the word of a name as a name word", () => {
      for (const slot of [
        `${PERSON}dba ${COMPANY}`,
        `${PERSON} dba${COMPANY}`,
        `${COMPANY} aka${PERSON}`,
      ]) {
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      }
      // `Aka` between two names is a name word (a surname, a given name): the person is dropped as a whole.
      expect(ofsiReadingOf(`${PENALTY_OF}Casey Aka Sample`, "")).toEqual(gone("monetary penalty"));
    });

    const JOINERS: Array<[string, string]> = [
      ["and/or", " and/or "],
      ["together with", " together with "],
      ["as well as", " as well as "],
      ["plus", " plus "],
      ["c/o", " c/o "],
      ["vs", " vs "],
      ["versus", " versus "],
    ];

    it.each(JOINERS)(
      "drops the person that %s joins to a company: the company stays, in a title and in a description",
      (_what, joint) => {
        const read = readings(`${COMPANY}${joint}${PERSON}`);
        expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
        expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
        expect(read.description).toEqual(kept("disclosure", COMPANY));
      },
    );

    it.each(JOINERS)(
      "drops every person of a list that %s joins, when no company is in it",
      (_what, joint) => {
        const read = readings(`${PERSON}${joint}${OTHER}`);
        expect(read.penalty).toEqual(gone("monetary penalty", 2));
        expect(read.disclosure).toEqual(gone("disclosure", 2));
        expect(read.description).toEqual(gone("disclosure", 2));
      },
    );

    it.each(JOINERS)(
      "keeps one party when the person comes first and %s follows it: the residual that the header states",
      (_what, joint) => {
        const slot = `${PERSON}${joint}${COMPANY}`;
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
        expect(partiesOf(`Disclosure notice: ${slot}`)).toEqual([slot]);
        expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${slot}`)).toEqual([slot]);
      },
    );

    it.each(JOINERS)(
      "keeps one party when %s joins two companies: no person-shaped part follows a company",
      (_what, joint) => {
        for (const slot of [
          `${COMPANY}${joint}Otherco Limited`,
          `Example Bread${joint}Butter Limited`,
          `Example Bank${joint}Trust Company`,
        ]) {
          expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
          expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${slot}`)).toEqual([slot]);
        }
      },
    );

    it("reads a joiner only in lower case and with blanks around it: the residual of the closed list", () => {
      for (const slot of [
        `${COMPANY} PLUS ${PERSON}`,
        `${COMPANY} Plus ${PERSON}`,
        `${COMPANY} VS ${PERSON}`,
        `${COMPANY} AND/OR ${PERSON}`,
        `${COMPANY} plus${PERSON}`,
        `${COMPANY} c/o${PERSON}`,
        `${COMPANY} vs.${PERSON}`,
        `${COMPANY} vs. ${PERSON}`,
      ]) {
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      }
    });

    it("does not read a spaced dash, a plus sign or the words or, for, via and through between a company and a person: the residuals that the header states", () => {
      for (const joint of [
        " - ",
        ` ${EN_DASH} `,
        ` ${cp(0x2014)} `,
        ` ${cp(0x2212)} `,
        " + ",
        " or ",
        " for ",
        " via ",
        " through ",
        " by ",
      ]) {
        const slot = `${COMPANY}${joint}${PERSON}`;
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      }
    });

    it("reads a slashed marker or joiner that opens a cell after a comma as the words of a role: the person goes with it", () => {
      // A description splits at its commas before it reads a marker, so the cell begins with the marker.
      // `t/a`, `c/o` and `and/or` are not words of lower-case letters: they are taken off all the same.
      for (const lead of ["t/a", "T/A", "d/b/a", "a/k/a", "f/k/a", "n/k/a", "c/o", "and/or"]) {
        const read = readings(`${COMPANY}, ${lead} ${PERSON}`);
        expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
        expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
        expect(read.description).toEqual(kept("disclosure", COMPANY));
      }
    });
  });

  describe("a person that `et al`, a possessive or a linker ties to a company", () => {
    // `et al` is a role word; a legal form (or a word of an organisation) followed by `'s` ends the
    // company there and the rest of the slot is the person side; the linker phrases are read as the
    // markers of a sole trader are, in both positions. Not read: a person's possessive before a company
    // and any other linker.
    const gone = nobody;
    const kept = only;
    const readings = readingsOf;
    const COMPANY = COMPANY_OF;
    const PERSON = "Casey Sample";
    const OTHER = "Robin Example";
    const RIGHT_QUOTE = cp(0x2019);
    const MODIFIER_APOSTROPHE = cp(0x02bc);

    const ET_AL = [
      "Belvane Phelkin et al",
      "Belvane Phelkin et al.",
      "Belvane Phelkin, et al.",
      "Belvane Phelkin, et al",
      "Belvane Phelkin ET AL.",
      "Belvane Phelkin Et Al.",
      "Mr. Belvane Phelkin et al.",
      "its director Belvane Phelkin et al",
      "Belvane Phelkin, owner, et al.",
      "Belvane Phelkin et al., owner",
      "Belvane Phelkin, et al., director",
      "Belvane Phelkin et al. - owner",
      "Belvane Phelkin et al - its director",
    ];

    it.each(ET_AL)("takes et al off the end of %j: the person stays and is counted", (person) => {
      const alone = readings(person);
      expect(alone.penalty).toEqual(gone("monetary penalty"));
      expect(alone.disclosure).toEqual(gone("disclosure"));
      expect(alone.description).toEqual(gone("disclosure"));
      const after = readings(`${COMPANY} and ${person}`);
      expect(after.penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(after.disclosure).toEqual(kept("disclosure", COMPANY));
      expect(after.description).toEqual(kept("disclosure", COMPANY));
    });

    it("counts every person of a list that names persons with et al", () => {
      const read = readings(`Belvane Phelkin et al and ${OTHER}`);
      expect(read.penalty).toEqual(gone("monetary penalty", 2));
      expect(read.disclosure).toEqual(gone("disclosure", 2));
      expect(read.description).toEqual(gone("disclosure", 2));
    });

    it("counts every person of a list that ends in et al as a part of its own", () => {
      // `et al` after a comma is a part of the list that is no person, so it must not keep the persons
      // from being read as a list of persons alone.
      const read = readings(`Belvane Phelkin and ${OTHER}, et al.`);
      expect(read.penalty).toEqual(gone("monetary penalty", 2));
      expect(read.disclosure).toEqual(gone("disclosure", 2));
      expect(read.description).toEqual(gone("disclosure", 2));
    });

    it("takes et al off a party only when it is a word of its own: the letters at the end of a word are no role", () => {
      // `Quillet al` ends in the letters `et al`, which are no word: nothing is taken off, and the particle
      // `al` that ends the party makes it no person's name.
      const slot = "Casey Quillet al";
      expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
    });

    it("takes et al off the end of a party only: in the middle of a name it is no role", () => {
      // Six words, so no person: the party is kept as it is, with its `et al` (a residual: the words of
      // a person inside a party that is not of a person's shape are not told apart).
      const slot = "Belvane Phelkin et al Zorvane Quilla";
      expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
    });

    it("leaves et al alone out of a list: it is no party and no person", () => {
      for (const aside of ["et al", "et al.", "ET AL.", "Et Al"]) {
        // In a description the part is a cell of its own, and no party is made of it.
        expect(readings(`${COMPANY}, ${aside}`).description).toEqual(
          kept("disclosure", COMPANY, 0),
        );
        expect(readings(`${COMPANY}, ${PERSON}, ${aside}`).description).toEqual(
          kept("disclosure", COMPANY),
        );
        expect(readings(`${COMPANY} and ${PERSON}, ${aside}`).penalty).toEqual(
          kept("monetary penalty", COMPANY),
        );
      }
    });

    it("keeps a company that et al follows as the party it was: only a person's name is put aside", () => {
      for (const slot of [`${COMPANY} et al`, `${COMPANY}, et al.`]) {
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      }
    });

    const POSSESSIVE_FORMS = [
      "Ltd",
      "Limited",
      "PLC",
      "LLP",
      "Inc",
      "GmbH",
      "BV",
      "Corporation",
      "Corp",
      "NV",
      "Oy",
      "Sdn Bhd",
      "Holdings",
      "Trading",
      "Bank",
      "Group",
      "Services",
    ];

    it.each(POSSESSIVE_FORMS)(
      "ends the company at %s followed by 's: the rest of the slot is the person side, whatever apostrophe is written",
      (form) => {
        const company = `Alden Brook ${form}`;
        for (const apostrophe of ["'", RIGHT_QUOTE, MODIFIER_APOSTROPHE]) {
          for (const rest of [
            "director Quilla Quarrin",
            "its former director Quilla Quarrin",
            "Quilla Quarrin",
            "owner Mrs. Quilla Quarrin Jr.",
          ]) {
            const read = readings(`${company}${apostrophe}s ${rest}`);
            expect(read.penalty).toEqual(kept("monetary penalty", company));
            expect(read.disclosure).toEqual(kept("disclosure", company));
            expect(read.description).toEqual(kept("disclosure", company));
          }
        }
      },
    );

    it.each(["Co", "Pty", "Srl", "SAS"])(
      "cuts after %s followed by 's too: a form of the keys, though the company side is still of a person's shape",
      (form) => {
        // The forms of the keys (`isLegalForm`) end the company at a possessive, but a name that ends in one
        // is still of a person's shape (`Co` and `SAS` are kept out of the closing forms): both sides are
        // counted and no party is left to hold the person. Without the cut it would be ONE party that held
        // the person, which is the leak.
        for (const apostrophe of ["'", RIGHT_QUOTE]) {
          const read = readings(`Alden Brook ${form}${apostrophe}s director Quilla Quarrin`);
          expect(read.penalty).toEqual(gone("monetary penalty", 2));
          expect(read.disclosure).toEqual(gone("disclosure", 2));
          expect(read.description).toEqual(gone("disclosure", 2));
        }
      },
    );

    it("does not cut after AS followed by 's: the residual of the closing forms, a word of a role that a surname can be", () => {
      const slot = "Alden Brook AS's director Quilla Quarrin";
      expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
    });

    it("ends the company at a form in capitals followed by 'S: the case makes no difference", () => {
      const read = readings(`ALDEN BROOK LTD${RIGHT_QUOTE}S DIRECTOR Quilla Quarrin`);
      expect(read.penalty).toEqual(kept("monetary penalty", "ALDEN BROOK LTD"));
      const lower = readings(`Alden Brook ltd's director Quilla Quarrin`);
      expect(lower.penalty).toEqual(kept("monetary penalty", "Alden Brook ltd"));
    });

    it("reads a possessive after a form inside a list, a bracket and a sole trader's side", () => {
      expect(
        readings(`${COMPANY}${RIGHT_QUOTE}s director ${PERSON} and Otherco PLC`).penalty,
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: [COMPANY, "Otherco PLC"],
        persons: 1,
      });
      expect(
        readings(`Otherco PLC (${COMPANY}${RIGHT_QUOTE}s director ${PERSON})`).penalty,
      ).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties: ["Otherco PLC", COMPANY],
        persons: 1,
      });
      expect(readings(`${PERSON} t/a ${COMPANY}${RIGHT_QUOTE}s director ${OTHER}`).penalty).toEqual(
        kept("monetary penalty", COMPANY, 2),
      );
    });

    it("leaves a possessive inside a bracket to the reading of the bracket", () => {
      // The brackets are read first: the company that stands before them and the company inside them are
      // parties, and the person inside them is counted. A cut of the text inside the bracket would leave
      // an open bracket in a party and the person in another.
      const read = readings(
        `${COMPANY} (Otherco PLC${RIGHT_QUOTE}s director ${PERSON}) and ${OTHER}`,
      );
      const parties = [COMPANY, "Otherco PLC"];
      expect(read.penalty).toEqual({
        shape: "notice",
        kind: "monetary penalty",
        parties,
        persons: 2,
      });
      expect(read.disclosure).toEqual({ shape: "notice", kind: "disclosure", parties, persons: 2 });
      expect(read.description).toEqual({
        shape: "notice",
        kind: "disclosure",
        parties,
        persons: 2,
      });
    });

    it("keeps one party when no person is on either side of a possessive after a form", () => {
      for (const slot of [
        `${COMPANY}${RIGHT_QUOTE}s Other Limited`,
        `Examplecorp Bank${RIGHT_QUOTE}s Pension Trustees Limited`,
        `${COMPANY}'s subsidiary Otherco PLC`,
      ]) {
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
        expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${slot}`)).toEqual([slot]);
      }
    });

    it("makes no cut at a possessive that ends the slot: nothing follows it, and the words stay one name", () => {
      // `Examplecorp Limited's` is two name words and so of a person's shape (an empty part after a cut
      // would split the list in two and leave the person in a party of its own).
      for (const apostrophe of ["'", RIGHT_QUOTE]) {
        const alone = readings(`${COMPANY}${apostrophe}s`);
        expect(alone.penalty).toEqual(gone("monetary penalty"));
        const listed = readings(`Quilla Quarrin and ${COMPANY}${apostrophe}s`);
        expect(listed.penalty).toEqual(gone("monetary penalty", 2));
        expect(listed.disclosure).toEqual(gone("disclosure", 2));
        expect(listed.description).toEqual(gone("disclosure", 2));
      }
    });

    it("reads a possessive that opens a part as no cut and no failure: no word stands before it", () => {
      const open = `'s director ${PERSON}`;
      expect(partiesOf(`${PENALTY_OF}${open}`)).toEqual([open]);
      const amp = `${COMPANY} & ${RIGHT_QUOTE}s director ${PERSON}`;
      expect(partiesOf(`${PENALTY_OF}${amp}`)).toEqual([amp]);
      const joined = `${COMPANY} and ${open}`;
      expect(partiesOf(`${PENALTY_OF}${joined}`)).toEqual([joined]);
      // A description is cut at the word and first: the part that opens with the possessive is a cell.
      expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${joined}`)).toEqual([COMPANY, open]);
    });

    it("does not read a person's possessive before a company, or a form that no 's follows: the residual that the header states", () => {
      // Real company names are written so (`Alden Brook's`): the person is not told from the company.
      for (const slot of [
        `${PERSON}${RIGHT_QUOTE}s ${COMPANY}`,
        `${PERSON}'s ${COMPANY}`,
        `Ostrid Vexmoor's company ${COMPANY}`,
        `${COMPANY}s director ${PERSON}`,
        `${COMPANY} s director ${PERSON}`,
        `${COMPANY}${RIGHT_QUOTE} director ${PERSON}`,
      ]) {
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      }
    });

    const LINKERS = [
      "owned by",
      "operated by",
      "managed by",
      "run by",
      "on behalf of",
      "acting for",
      "acting on behalf of",
    ];

    it.each(LINKERS)(
      "reads %s as a linker between a company and a person: the person goes and is counted, the company stays, in both positions",
      (linker) => {
        for (const written of [linker, linker.toUpperCase()]) {
          const after = readings(`${COMPANY} ${written} ${PERSON}`);
          expect(after.penalty).toEqual(kept("monetary penalty", COMPANY));
          expect(after.disclosure).toEqual(kept("disclosure", COMPANY));
          expect(after.description).toEqual(kept("disclosure", COMPANY));
          const before = readings(`${PERSON} ${written} ${COMPANY}`);
          expect(before.penalty).toEqual(kept("monetary penalty", COMPANY));
          expect(before.disclosure).toEqual(kept("disclosure", COMPANY));
          expect(before.description).toEqual(kept("disclosure", COMPANY));
        }
      },
    );

    it.each(LINKERS)(
      "counts every person that %s ties together, and keeps one party that it ties two companies in",
      (linker) => {
        const persons = readings(`${PERSON} ${linker} ${OTHER}`);
        expect(persons.penalty).toEqual(gone("monetary penalty", 2));
        expect(persons.disclosure).toEqual(gone("disclosure", 2));
        expect(persons.description).toEqual(gone("disclosure", 2));
        const companies = `${COMPANY} ${linker} Otherco PLC`;
        expect(partiesOf(`${PENALTY_OF}${companies}`)).toEqual([companies]);
        expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${companies}`)).toEqual([companies]);
      },
    );

    it.each(LINKERS)("reads %s after a comma too", (linker) => {
      const read = readings(`${COMPANY}, ${linker} ${PERSON}`);
      expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
      expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
      expect(read.description).toEqual(kept("disclosure", COMPANY));
    });

    it("leaves a lower-case word before a linker out of the parties: it is no party", () => {
      // A cell that opens with the words of a role and then a linker (`wholly owned by Casey Sample`, after
      // a comma) has the marker after its first word: that word is no side of it.
      for (const lead of ["wholly", "acting", "jointly"]) {
        const read = readings(`${COMPANY}, ${lead} owned by ${PERSON}`);
        expect(read.penalty).toEqual(kept("monetary penalty", COMPANY));
        expect(read.disclosure).toEqual(kept("disclosure", COMPANY));
        expect(read.description).toEqual(kept("disclosure", COMPANY));
      }
    });

    it("reads the longer linker whole: acting on behalf of is no on behalf of with a word before it", () => {
      const slot = `${COMPANY} acting on behalf of ${PERSON}`;
      expect(readings(slot).penalty).toEqual(kept("monetary penalty", COMPANY));
      // The company that stands before the person is never `Examplecorp Limited acting`.
      expect(JSON.stringify(readings(slot))).not.toContain("acting");
      expect(JSON.stringify(readings(`${PERSON} acting on behalf of ${COMPANY}`))).not.toContain(
        "acting",
      );
    });
  });

  describe("a person with titles, suffixes and joined initials", () => {
    // Titles that lead a name, suffixes that end one, the suffixes of a list that a comma
    // sets apart in one slot (`Casey Sample, Jr.`) and joined initials (`J.R.`, `Ph.D.`) in any position.
    const COMPANY = COMPANY_OF;
    const NAME = "Quilla Quarrin";
    const OTHER = "Robin Example";

    const expectCompanyAnd = (list: string, persons = 1): void => expectPartyAnd(list, persons);
    /** A word as written, in lower case, in capitals and without its dots. */
    const variantsOf = (word: string): string[] => [
      ...new Set([word, word.toLowerCase(), word.toUpperCase(), word.replace(/\./g, "")]),
    ];

    const LEADING_TITLES = [
      "Rt. Hon.",
      "Rt Hon",
      "The Hon.",
      "Hon.",
      "Capt.",
      "Col.",
      "Fr.",
      "Sr.",
    ];

    it.each(LEADING_TITLES)(
      "reads %s as a title that leads a name, in any case, with its dots or without",
      (title) => {
        for (const written of variantsOf(title)) {
          expectPersons(`${written} ${NAME}`, 1);
          expectPersons(`${written} Q. Quarrin`, 1);
          expectCompanyAnd(`${COMPANY} and ${written} ${NAME}`);
        }
      },
    );

    it("reads a run of titles of every kind together, and The before a title only", () => {
      expectPersons(`The Rt. Hon. ${NAME}`, 1);
      expectPersons(`Capt. Dr. ${NAME}`, 1);
      expectPersons(`Col. Sir Q. Quarrin`, 1);
      // The titles are no part of a company: a legal form or a word of an organisation still decides.
      for (const company of [`Col. ${COMPANY}`, `The Hon. ${COMPANY}`, "Fr. Example Bank"]) {
        expect(partiesOf(`${PENALTY_OF}${company}`)).toEqual([company]);
      }
    });

    it("reads a run of titles that ends in The as the name it is: no title stands after it", () => {
      expectPersons("Dr. The", 1);
    });

    it("keeps a name of six words with its titles counted: the residual that the header states", () => {
      const slot = "The Rt. Hon. Quilla Zorvane Quarrin";
      expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
    });

    const TRAILING_SUFFIXES = ["Esq.", "PhD", "Ph.D.", "Jnr.", "Snr.", "the younger"];

    it.each(TRAILING_SUFFIXES)(
      "reads %s as a suffix that ends a name, in any case, with its dots or without",
      (suffix) => {
        // Joined initials are read as they are written: capitals and dots (`Ph.D.`), not `ph.d.`.
        const written = suffix === "Ph.D." ? [suffix] : variantsOf(suffix);
        for (const one of written) {
          expectPersons(`${NAME} ${one}`, 1);
          expectCompanyAnd(`${COMPANY} and ${NAME} ${one}`);
        }
      },
    );

    it("takes the younger off a name that a role follows, whatever the role joint is", () => {
      expectPersons(`${NAME} the younger - director`, 1);
      expectPersons(`${NAME} the younger, director`, 1);
      expectPersons(`its director ${NAME} the younger`, 1);
    });

    it("takes the younger off the end of a name only, as a word of its own", () => {
      // In the middle of a name, or at the end of another word, `the younger` is no suffix: the party stays.
      for (const slot of ["Casey Quilla the younger Quarrin", "Casey Quillathe younger"]) {
        expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      }
    });

    it("reads a name of four words with the younger as it reads one without it: the words taken off are not counted", () => {
      for (const younger of ["the younger", "THE YOUNGER", "The Younger"]) {
        expectPersons(`Casey Robin Lee Sample ${younger}`, 1);
      }
    });

    const COMMA_SUFFIXES = [
      "Jr.",
      "Jr",
      "II",
      "III",
      "IV",
      "Esq.",
      "PhD",
      "MBE",
      "OBE",
      "CBE",
      "KC",
      "QC",
      "M.D.",
    ];

    it.each(COMMA_SUFFIXES)(
      "reads , %s as a part of the name before it: the person is counted and no party is made of it",
      (suffix) => {
        expectPersons(`${NAME}, ${suffix}`, 1);
        expectCompanyAnd(`${COMPANY} and ${NAME}, ${suffix}`);
        expectCompanyAnd(`${COMPANY}, ${NAME}, ${suffix}`);
        expectCompanyAnd(`${COMPANY} & ${NAME}, ${suffix}`);
        expectPersons(`${NAME}, ${suffix} and ${OTHER}, ${suffix}`, 2);
        expectPersons(`${NAME}, ${suffix}, ${OTHER}`, 2);
      },
    );

    it("reads two suffixes after one comma and a part of suffixes alone, whatever their number", () => {
      expectPersons(`${NAME}, Jr. PhD`, 1);
      expectPersons(`${NAME}, M.D. Ph.D. MBE OBE`, 1);
      expectCompanyAnd(`${COMPANY} and ${NAME}, Jr. PhD`);
    });

    it("reads a comma suffix in any case, and a run of them", () => {
      expectPersons(`${NAME}, jr.`, 1);
      expectPersons(`${NAME}, PHD`, 1);
      expectPersons(`${NAME}, mbe`, 1);
      expectPersons(`${NAME}, MBE, OBE`, 1);
      expectPersons(`${NAME}, Jr., PhD`, 1);
      expectCompanyAnd(`${COMPANY} and ${NAME}, M.D., Ph.D.`);
    });

    it("reads a comma suffix inside a bracket and after a title", () => {
      expectCompanyAnd(`${COMPANY} (${NAME}, Jr.)`);
      expectCompanyAnd(`${COMPANY} and Dr. ${NAME}, M.D.`);
      expectCompanyAnd(`${COMPANY} and Hon. ${NAME}, KC`);
    });

    it("keeps a comma suffix with the company that it follows: it is no person's", () => {
      // Only a person is put aside. The title keeps the whole slot as the party, as it was (a description
      // cuts a part of the words of a suffix alone out of its list, as it does a role).
      const slot = `${COMPANY}, Jr.`;
      expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${slot}`)).toEqual([COMPANY]);
    });

    it("leaves a comma suffix that stands alone in a list out of the parties", () => {
      for (const suffix of COMMA_SUFFIXES) {
        expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${COMPANY}, ${suffix}, Otherco PLC`)).toEqual([
          COMPANY,
          "Otherco PLC",
        ]);
      }
    });

    const JOINED = ["J.R.", "J.R.R.", "A.B.C.D.", "Ph.D.", "M.D."];

    it.each(JOINED)("reads %s as an initial in any position of a name", (joined) => {
      expectPersons(`${joined} Quarrin`, 1);
      expectPersons(`Quilla ${joined} Quarrin`, 1);
      expectPersons(`Quilla Quarrin ${joined}`, 1);
      expectPersons(`${joined} ${joined} Quarrin`, 1);
      expectCompanyAnd(`${COMPANY} and ${joined} ${NAME}`);
    });

    it("reads joined initials with a title and a suffix", () => {
      expectPersons("Dr. J.R.R. Quarrin Jr.", 1);
      expectPersons("Prof. A.B. Quarrin, Esq.", 1);
    });

    it("reads a name of initials and no name word as no person's", () => {
      // Initials are no name word (`full`): nothing in these is a name that could be put aside.
      for (const party of ["J.R. A.B.", "J.R. M.D."]) {
        expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
      }
    });

    it("reads a run of capital-dot pairs and nothing else as joined initials", () => {
      // A dot elsewhere makes no initials: these are no person's name, as before.
      for (const party of [
        "Quilla Q.r. Quarrin",
        "Quilla Qu.arrin Quarrin",
        "Quilla Q.R.x Quarrin",
        "Quilla xQ.R. Quarrin",
        "Quilla Quil.Quar. Quarrin",
        "Quilla Q. R. x. Quarrin",
      ]) {
        expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
      }
    });

    it("reads a dotted form that no list knows as joined initials: the residual that the header states", () => {
      // `S.R.L.` is a legal form that no list of the rule names (the forms of LAST_WORD_FORMS are, spelled with dots or
      // without, and so are those of this rule's own list): it is read as the initials of a name, so a company
      // that ends in one is a person's shape and is dropped, as one that ends in a bare `Co` is (privacy beats recall).
      expectPersons("Alden Brook S.R.L.", 1);
      // The forms that the rule names win over the initials they could be.
      for (const company of [
        "Alden Brook P.L.C.",
        "Alden Brook N.V.",
        "Alden Brook S.A.R.L.",
        "Alden Brook P.J.S.C.",
      ]) {
        expect(partiesOf(`${PENALTY_OF}${company}`)).toEqual([company]);
      }
    });

    it("reads a long run of initials in linear time", () => {
      const run = `${"A.".repeat(70)}1`;
      const started = Date.now();
      for (let repeat = 0; repeat < 200; repeat += 1) {
        ofsiReadingOf(`${PENALTY_OF}Quilla ${run} Quarrin`, "");
      }
      expect(Date.now() - started).toBeLessThan(BLOW_UP_MS);
    });
  });

  describe("a person with quotes around a word or a part", () => {
    // An optional opening and closing quote around a name word, and one matched pair around a whole
    // part, a side or the inside of a bracket, are taken off before the person test; a quoted nickname is a
    // name word; the quoted capitals of an alias keep their reading as an alias.
    const COMPANY = COMPANY_OF;
    const NAME = "Quilla Quarrin";
    const STRAIGHT_DOUBLE = '"';
    const STRAIGHT_SINGLE = "'";
    const LEFT_DOUBLE = cp(0x201c);
    const RIGHT_DOUBLE = cp(0x201d);
    const LEFT_SINGLE = cp(0x2018);
    const RIGHT_SINGLE = cp(0x2019);
    const LOW_DOUBLE = cp(0x201e);
    const LEFT_ANGLE = cp(0xab);
    const RIGHT_ANGLE = cp(0xbb);
    const QUOTES = [
      STRAIGHT_DOUBLE,
      STRAIGHT_SINGLE,
      LEFT_DOUBLE,
      RIGHT_DOUBLE,
      LEFT_SINGLE,
      RIGHT_SINGLE,
      LOW_DOUBLE,
      LEFT_ANGLE,
      RIGHT_ANGLE,
    ];
    const PAIRS: Array<[string, string]> = [
      [STRAIGHT_DOUBLE, STRAIGHT_DOUBLE],
      [STRAIGHT_SINGLE, STRAIGHT_SINGLE],
      [LEFT_DOUBLE, RIGHT_DOUBLE],
      [LEFT_SINGLE, RIGHT_SINGLE],
      [LOW_DOUBLE, LEFT_DOUBLE],
      [LOW_DOUBLE, RIGHT_DOUBLE],
      [LEFT_ANGLE, RIGHT_ANGLE],
      [RIGHT_ANGLE, LEFT_ANGLE],
    ];

    it.each(QUOTES.map((quote) => [quote]))(
      "reads a name word with the quote %s before it, or after it, as the word it is",
      (quote) => {
        expectPersons(`Ostrid ${quote}Orly Orlenvy`, 1);
        expectPersons(`Ostrid Orly${quote} Orlenvy`, 1);
        expectPersons(`${quote}Quilla Quarrin`, 1);
        expectPersons(`Quilla Quarrin${quote}`, 1);
        // One quote at one end of the text is no pair: nothing is taken off the other end.
        expectPersons(`${quote}Dr. Q`, 1);
        expectPersons(`Dr. Q${quote}`, 1);
      },
    );

    it.each(PAIRS)("reads a quoted nickname inside a name, %s and %s", (open, close) => {
      expectPersons(`Ostrid ${open}Orly${close} Orlenvy`, 1);
      expectPersons(`Ostrid ${open}Big Orly${close} Orlenvy`, 1);
      expectPartyAnd(`${COMPANY} and Ostrid ${open}Orly${close} Orlenvy`);
    });

    it.each(PAIRS)(
      "reads a whole part in a pair of quotes, %s and %s, as it reads the part",
      (open, close) => {
        expectPersons(`${open}${NAME}${close}`, 1);
        expectPartyAnd(`${COMPANY} and ${open}${NAME}${close}`);
        expectPartyAnd(`${COMPANY}, ${open}${NAME}${close}`);
        // The words of a role are taken off the front and the end of what is quoted.
        expectPersons(`${open}director ${NAME}${close}`, 1);
        expectPersons(`${open}${NAME} - owner${close}`, 1);
        // A side of a sole trader, and the inside of a bracket.
        expectPartyAnd(`${open}${NAME}${close} t/a ${COMPANY}`);
        expectPartyAnd(`${COMPANY} (${open}${NAME}${close})`);
        expectPartyAnd(`${COMPANY} t/a ${open}${NAME}${close}`);
      },
    );

    it("reads the persons of a list in quotes, each in its own", () => {
      expectPersons(`"${NAME}", "Robin Example"`, 2);
      expectPersons(`${LEFT_DOUBLE}${NAME} and Robin Example${RIGHT_DOUBLE}`, 2);
      expectPartyAnd(`${COMPANY}, "${NAME}", "Robin Example"`, 2);
    });

    it("reads a company in quotes as a company that closes its name, with the quotes it is written with", () => {
      // The company is the party as written; the person after it is counted.
      const quoted = `${LEFT_DOUBLE}${COMPANY}${RIGHT_DOUBLE}`;
      expectPartyAnd(`${quoted} and ${NAME}`, 1, quoted);
      expectPartyAnd(`"${COMPANY}" & ${NAME}`, 1, `"${COMPANY}"`);
      // The quote may open in the middle of the part: the word that it closes is still the last.
      const inside = `Alden ${LEFT_DOUBLE}Brook Limited${RIGHT_DOUBLE}`;
      expectPartyAnd(`${inside} and ${NAME}`, 1, inside);
      // A legal form and a word of an organisation stay what they are inside quotes.
      for (const party of [
        `${LEFT_DOUBLE}Example${RIGHT_DOUBLE} Bank`,
        `Quilla ${LEFT_DOUBLE}Ltd${RIGHT_DOUBLE}`,
        `"Quilla Quarrin Holdings"`,
        `'Alden Brook Corporation'`,
      ]) {
        expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
      }
    });

    it("reads a title, an initial and a suffix inside quotes as they are read outside", () => {
      expectPersons(`${LEFT_DOUBLE}Dr.${RIGHT_DOUBLE} ${NAME}`, 1);
      expectPersons(`Quilla ${LEFT_DOUBLE}Q.${RIGHT_DOUBLE} Quarrin`, 1);
      expectPersons(`${NAME} ${LEFT_DOUBLE}Jr.${RIGHT_DOUBLE}`, 1);
      expectPersons(`${NAME}, ${LEFT_DOUBLE}Jr.${RIGHT_DOUBLE}`, 1);
      expectPersons(`"${NAME}, Jr."`, 1);
      expectPartyAnd(`${COMPANY} and "${NAME}, MBE"`);
    });

    it("reads a name with a quote and a hyphen or an apostrophe in a word", () => {
      expectPersons(`"Quilla Quarrin-Brixhame"`, 1);
      expectPersons(`${LEFT_DOUBLE}Quilla O'Quarrin${RIGHT_DOUBLE}`, 1);
      expectPersons(`Quilla 'O'Quarrin'`, 1);
    });

    it("reads one quote before and one after a word, and no more: the residual of a name in two pairs", () => {
      // Two quotes in a row are no quote of a name: the party is kept as it is written.
      for (const party of [
        `Ostrid ${LEFT_DOUBLE}${LEFT_DOUBLE}Orly${RIGHT_DOUBLE}${RIGHT_DOUBLE} Orlenvy`,
        `Ostrid Or${LEFT_DOUBLE}ly Orlenvy`,
        `Ostrid Orly${RIGHT_DOUBLE}${RIGHT_DOUBLE} Orlenvy`,
      ]) {
        expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
      }
    });

    it("reads a quote that stands for a word of its own as no name word", () => {
      for (const party of [
        `Quilla ${LEFT_DOUBLE} Quarrin`,
        `Quilla " Quarrin`,
        `${NAME} ${RIGHT_ANGLE}${LEFT_ANGLE}`,
      ]) {
        expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
      }
    });

    it("reads a word that began with an apostrophe as a name word: 'Lee is Lee", () => {
      expectPersons("Casey 'Lee", 1);
      expectPersons("Casey 'Lee Sample", 1);
    });

    it("keeps the quoted capitals of an alias as the alias that they are: it is cut, and no side", () => {
      for (const [open, close] of [
        ['"', '"'],
        ["'", "'"],
        [LEFT_DOUBLE, RIGHT_DOUBLE],
      ]) {
        expect(partiesOf(`${PENALTY_OF}${COMPANY} (${open}EBL${close})`)).toEqual([COMPANY]);
        expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${COMPANY} (${open}EBL${close})`)).toEqual([
          COMPANY,
        ]);
        // The alias of a person is cut as well, and the person is counted.
        expectPersons(`${NAME} (${open}EBL${close})`, 1);
      }
    });

    it("reads quoted capitals of nine letters or more as the inside of a bracket, not as an alias", () => {
      const slot = `${COMPANY} (${LEFT_DOUBLE}ABCDEFGHI${RIGHT_DOUBLE})`;
      expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
    });
  });

  describe("a person with the apostrophes, the hyphens, the prefixes and the particles of a name", () => {
    // U+02BC is an apostrophe, U+2212 a hyphen, `d'` and `l'` before a capital begin a name word, and
    // `abu`, `ben`, `ap` and `bat` are particles of a name.
    const COMPANY = COMPANY_OF;
    const NAME = "Quilla Quarrin";
    const MODIFIER_APOSTROPHE = cp(0x02bc);
    const RIGHT_QUOTE = cp(0x2019);
    const MINUS = cp(0x2212);
    const APOSTROPHES = ["'", RIGHT_QUOTE, MODIFIER_APOSTROPHE];

    it("reads U+02BC as the apostrophe inside a name word, after a prefix and at the end of one", () => {
      expectPersons(`Quilla O${MODIFIER_APOSTROPHE}Quarrin`, 1);
      expectPersons(`Quilla D${MODIFIER_APOSTROPHE}arcy`, 1);
      expectPersons(`Quilla Quarrins${MODIFIER_APOSTROPHE}`, 1);
      expectPartyAnd(`${COMPANY} and Quilla O${MODIFIER_APOSTROPHE}Quarrin`);
    });

    it("reads U+2212 as a hyphen between the parts of a name word and after an article", () => {
      expectPersons(`Quilla Quarrin${MINUS}Brixhame`, 1);
      expectPersons(`Quilla al${MINUS}Quarrin`, 1);
      expectPersons(`Quilla Quarrin${MINUS}Brixhame${MINUS}Dellacott`, 1);
      expectPartyAnd(`${COMPANY} and Quilla Quarrin${MINUS}Brixhame`);
    });

    it("reads U+2212 and U+02BC in the words of a role too", () => {
      // The role is taken off the front and the end, and a part of the list that is a role alone is left out.
      expectPersons(`co${MINUS}director ${NAME}`, 1);
      expectPersons(`${NAME} ${MINUS} owner`, 1);
      expectPersons(`${NAME}, co${MINUS}owner`, 1);
      // A title keeps the slot of a company and its role as one party, a description leaves the role out.
      const slot = `${COMPANY}, co${MINUS}owner`;
      expect(partiesOf(`${PENALTY_OF}${slot}`)).toEqual([slot]);
      expect(partiesOf(DATE_TITLE_OF, `${BY_OF} ${slot}`)).toEqual([COMPANY]);
      expectPersons(`${NAME}, owner${MODIFIER_APOSTROPHE}s deputy`, 1);
    });

    it.each(["d", "l"].flatMap((prefix) => APOSTROPHES.map((apostrophe) => [prefix, apostrophe])))(
      "reads %s and the apostrophe %s before a capital as the beginning of a name word",
      (prefix, apostrophe) => {
        expectPersons(`Quilla ${prefix}${apostrophe}Quarrin`, 1);
        expectPersons(`${prefix}${apostrophe}Quarrin Quilla`, 1);
        expectPersons(`Quilla ${prefix}${apostrophe}Quarrin-Brixhame`, 1);
        expectPersons(`Quilla ${prefix}${apostrophe}QUARRIN`, 1);
        expectPartyAnd(`${COMPANY} and Quilla ${prefix}${apostrophe}Quarrin`);
      },
    );

    it("reads d' and l' only before a capital, and only in lower case at the start of a word", () => {
      // After the prefix a lower-case word is no name; before it a letter of another kind is no prefix.
      for (const party of [
        "Quilla d'quarrin",
        `Quilla l${RIGHT_QUOTE}quarrin`,
        "Quilla d'",
        "Quilla x'Quarrin",
        "Quilla dd'Quarrin",
        "Quilla d'1Quarrin",
      ]) {
        expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
      }
    });

    it.each(["abu", "ben", "ap", "bat"])(
      "reads %s as a particle of a name: it stands between two names, never first or last",
      (particle) => {
        expectPersons(`Quilla ${particle} Quarrin`, 1);
        expectPersons(`Quilla Brixhame ${particle} Quarrin`, 1);
        expectPartyAnd(`${COMPANY} and Quilla ${particle} Quarrin`);
        for (const party of [`${particle} Quilla Quarrin`, `Quilla Quarrin ${particle}`]) {
          expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
        }
      },
    );

    it("takes no word that is none of these for a name: the lower-case words stay out", () => {
      for (const party of ["Quilla bar Quarrin", "Quilla abus Quarrin", "Quilla bats Quarrin"]) {
        expect(partiesOf(`${PENALTY_OF}${party}`)).toEqual([party]);
      }
    });
  });

  describe("a party that no name key could match", () => {
    it("is left out, with no failure and no trace, when it has fewer than four letters and digits", () => {
      for (const party of ["AB", "A B C", "J. K.", "Q", "X1"]) {
        expect(ofsiReadingOf(`Imposition of monetary penalty: ${party}`, "")).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: [],
          persons: 0,
        });
      }
    });

    it("is kept when the name with its legal form is a key, though the name without it is not", () => {
      // `abc` is too short, `abcltd` is not: the record has one key, and the party one id.
      expect(partiesOf("Imposition of monetary penalty: ABC Ltd")).toEqual(["ABC Ltd"]);
      expect(partiesOf("Imposition of monetary penalty: Xy Ltd")).toEqual(["Xy Ltd"]);
      expect(partiesOf("Imposition of monetary penalty: ABCD")).toEqual(["ABCD"]);
    });
  });

  describe("a party that is no name", () => {
    it.each<[string, string]>([
      ["markup", "<script>alert(1)</script> Limited"],
      ["a tag", "Example <b>Bank</b> PLC"],
      ["a greater-than sign", "Example Bank > PLC"],
      ["no letter", "12345 67890"],
      ["a date", "08 SEPTEMBER 2025"],
      ["a date of the case a name has", "8 Sept 2025"],
      ["a date with a dotted month", "8 Sept. 2025"],
      ["a date with words after it", "08 September 2025 Example Bank"],
      ["a legal form alone", "Ltd"],
      ["a legal form alone with its dots", "N.A."],
      ["legal forms alone with commas", "Ltd, Inc"],
      ["the word and in front", "and Example Bank PLC"],
      ["the word and in front, in capitals", "AND Example Bank PLC"],
      ["a comma at its start", ", Example Bank PLC"],
      ["a comma at its end", "Example Bank PLC,"],
    ])("is not read: %s", (_what, party) => {
      expect(ofsiReadingOf(`Imposition of monetary penalty: ${party}`, "")).toEqual({
        shape: "unreadable",
      });
    });

    it("is not read when it is longer than a name can be, and is read at the limit", () => {
      // 120 letters in words that hyphens join, and the legal form: 150 units and a key of 120 characters
      // (a longer key is refused for its own reason); one word more is 151 units with the same key.
      const hyphened = (words: number): string => {
        const each = Math.floor(120 / words);
        const extra = 120 - each * words;
        return Array.from({ length: words }, (_, at) =>
          "A".repeat(each + (at < extra ? 1 : 0)),
        ).join("-");
      };
      const longest = `${hyphened(23)} Limited`;
      const oneMore = `${hyphened(24)} Limited`;
      expect(longest).toHaveLength(150);
      expect(oneMore).toHaveLength(151);
      expect(partiesOf(`Imposition of monetary penalty: ${longest}`)).toEqual([longest]);
      expect(ofsiReadingOf(`Imposition of monetary penalty: ${oneMore}`, "")).toEqual({
        shape: "unreadable",
      });
    });

    it("is kept when the word and is inside the name, or when it is a legal form with words around it", () => {
      expect(partiesOf("Imposition of monetary penalty: Example Bread and Butter Limited")).toEqual(
        ["Example Bread and Butter Limited"],
      );
      expect(partiesOf("Imposition of monetary penalty: Andover Example Limited")).toEqual([
        "Andover Example Limited",
      ]);
      expect(partiesOf("Imposition of monetary penalty: Example Bank Ltd")).toEqual([
        "Example Bank Ltd",
      ]);
    });

    it("is read with the characters nobody sees taken out, and the full-width forms folded", () => {
      expect(
        partiesOf(
          `Imposition of monetary penalty: Example${cp(0x200b)} Bank${cp(0x202e)} ${cp(0xff30, 0xff2c, 0xff23)}`,
        ),
      ).toEqual(["Example Bank PLC"]);
      expect(
        ofsiReadingOf(`Imposition of monetary penalty: Example ${cp(0xff1c)}Bank PLC`, ""),
      ).toEqual({
        shape: "unreadable",
      });
    });
  });
});

describe("londonDayOf, the day of a publication time", () => {
  it.each<[string, string]>([
    ["2024-09-26T23:00:00Z", "2024-09-27"],
    ["2026-03-30T08:47:08Z", "2026-03-30"],
    ["2025-01-15T00:00:00Z", "2025-01-15"],
    ["2025-12-31T23:59:59Z", "2025-12-31"],
    ["2026-01-01T00:00:00Z", "2026-01-01"],
  ])("is the London day of %s: %s", (timestamp, day) => {
    expect(londonDayOf(timestamp)).toBe(day);
  });

  describe("around the change to summer time, on the last Sunday of March", () => {
    it.each<[string, string]>([
      // Until 01:00 UTC on Sunday 29 March 2026 London keeps UTC; after it, UTC+1.
      ["2026-03-28T23:30:00Z", "2026-03-28"],
      ["2026-03-29T00:30:00Z", "2026-03-29"],
      ["2026-03-29T00:59:59Z", "2026-03-29"],
      ["2026-03-29T01:00:00Z", "2026-03-29"],
      ["2026-03-29T22:59:59Z", "2026-03-29"],
      ["2026-03-29T23:00:00Z", "2026-03-30"],
      ["2026-03-29T23:30:00Z", "2026-03-30"],
    ])("%s is %s", (timestamp, day) => {
      expect(londonDayOf(timestamp)).toBe(day);
    });
  });

  describe("around the change back, on the last Sunday of October", () => {
    it.each<[string, string]>([
      // Until 01:00 UTC on Sunday 25 October 2026 London is UTC+1; after it, UTC.
      ["2026-10-24T22:59:59Z", "2026-10-24"],
      ["2026-10-24T23:00:00Z", "2026-10-25"],
      ["2026-10-24T23:30:00Z", "2026-10-25"],
      ["2026-10-25T00:30:00Z", "2026-10-25"],
      ["2026-10-25T23:30:00Z", "2026-10-25"],
      ["2026-10-26T00:00:00Z", "2026-10-26"],
    ])("%s is %s", (timestamp, day) => {
      expect(londonDayOf(timestamp)).toBe(day);
    });
  });

  it("reads a time with an offset or with fractions of a second as the instant it is", () => {
    expect(londonDayOf("2026-07-01T00:30:00+01:00")).toBe("2026-07-01");
    expect(londonDayOf("2026-07-01T00:30:00+02:00")).toBe("2026-06-30");
    expect(londonDayOf("2026-07-01T00:30:00.123456Z")).toBe("2026-07-01");
    expect(londonDayOf("2026-06-30T23:30:00.5Z")).toBe("2026-07-01");
  });

  it("is none for what is no time: a day alone, a time with no zone, a day that is not one, a value that is no text", () => {
    for (const value of [
      "2026-03-30",
      "2026-03-30T08:47:08",
      "2026-03-30 08:47:08Z",
      "2026-13-01T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-03-30T24:00:00Z",
      "2026-03-30T08:47:60Z",
      "yesterday",
      "",
      " 2026-03-30T08:47:08Z",
      "2026-03-30T08:47:08Z ",
      "0001-01-01T00:00:00Z",
      "0000-01-01T00:00:00Z",
      "10000-01-01T00:00:00Z",
      undefined,
      null,
      20260330,
      {},
      ["2026-03-30T08:47:08Z"],
    ]) {
      expect(londonDayOf(value)).toBeNull();
    }
  });
});

describe("the connector of the list", () => {
  describe("what it is", () => {
    it("is the connector of uk_ofsi, and exports the mark that its records begin with", () => {
      expect(ukOfsiConnector.id).toBe("uk_ofsi");
      expect(ukOfsiConnector.version).toBe(1);
      expect(MARK).toBe("UK OFSI financial sanctions enforcement notices");
    });

    it("is made by a factory that takes the pause between two pages, and has a real one by default", () => {
      expect(createUkOfsiConnector().id).toBe("uk_ofsi");
      expect(createUkOfsiConnector({}).id).toBe("uk_ofsi");
      expect(createUkOfsiConnector({ sleep: sleeping() }).id).toBe("uk_ofsi");
    });
  });

  describe("the request", () => {
    it("asks the first page of its address, with no validator and its limits", async () => {
      const fetch = fakeFetch(filesOf(GOOD));
      const sleep = sleeping();
      const snapshot = await createUkOfsiConnector({ sleep }).download(fetch, {});
      expect(snapshot).not.toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(urlOf(0));
      expect(fetch.calls[0].validators).toEqual({});
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 4_194_304,
        allowedContentTypes: [JSON_TYPE],
        totalTimeoutMs: 60_000,
      });
      // One page: there is no pause.
      expect(sleep).not.toHaveBeenCalled();
    });

    it("asks the second page 400 ms after the first when the search has more than 1,000 documents", async () => {
      const docs = [...plainDocs(), ...otherDocs(987)];
      expect(docs).toHaveLength(1_001);
      const fetch = fakeFetch(filesOf(docs));
      const sleep = sleeping();
      const snapshot = await createUkOfsiConnector({ sleep }).download(fetch, {});
      if (snapshot === "unchanged") throw new Error("A first download is never unchanged.");
      expect(fetch.calls.map((call) => call.url)).toEqual([urlOf(0), urlOf(1000)]);
      expect(sleep.mock.calls).toEqual([[400]]);
      expect(bodyOf(snapshot).rows).toHaveLength(PARTIES.length);
    });

    it("never asks a third page: a search that needs one is not the list the connector was built for", async () => {
      const results = [...plainDocs(), ...otherDocs(1_987)].map(resultOf);
      expect(results).toHaveLength(2_001);
      const fetch = fakeFetch(filesOfResults(results));
      const sleep = sleeping();
      const error = await failureOf(createUkOfsiConnector({ sleep }).download(fetch, {}));
      expect(error).toBeInstanceOf(NotTheListError);
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("downloads in full whatever the stored validators say: the API sends none, so nothing is unchanged", async () => {
      const fetch = fakeFetch(filesOf(GOOD));
      const again = await ukOfsiConnector.download(fetch, {
        etag: `k${ukOfsiConnector.version}:abc`,
        lastModified: "Tue, 10 Nov 2026 00:33:24 GMT",
      });
      expect(again).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
    });

    it("stores the validators of a download as none: no etag of the server, the prefix of the reading alone", async () => {
      const snapshot = await downloadOf(filesOf(GOOD));
      expect(snapshot.etag).toBe(`k${ukOfsiConnector.version}:`);
      expect(snapshot.lastModified).toBeNull();
    });
  });

  describe("the records of a list", () => {
    it("are one for each party of the notices, and none for the other documents", async () => {
      const { parsed } = await runOf(GOOD);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).toBe("search.json");
      expect(idsOf(parsed).sort()).toEqual(PARTIES.map(idOfParty).sort());
    });

    it("hold what the list holds for each party, written as the record's template writes it", async () => {
      const { parsed } = await runOf(GOOD);
      const record = recordOfId(parsed, "ofsi:birchfieldexample");
      expect(record.recordType).toBe("sanctions_penalty_notice");
      expect(record.title).toBe("OFSI notice: Birchfield Example PLC");
      expect(record.url).toBe("https://www.gov.uk/government/publications/example-penalty-2");
      expect(record.publishedAt).toBe(dayAt(10));
      expect(record.sourceUpdatedAt).toBeNull();
      expect(record.summary).toBe(
        [
          S1,
          S2,
          "Party as written: Birchfield Example PLC.",
          `Notices: 1; newest: ${OPEN_QUOTE}Imposition of monetary penalty: Birchfield Example PLC${CLOSE_QUOTE} (monetary penalty, ${dayAt(10)}).`,
          CLOSING,
        ].join(" "),
      );
      expect(record.identifiers).toEqual({
        party: "Birchfield Example PLC",
        notices: 1,
        newest: dayAt(10),
      });
    });

    it("are matched by the party's name, as written and without its legal form", async () => {
      const { parsed } = await runOf(GOOD);
      expect(recordOfId(parsed, "ofsi:birchfieldexample").matchKeys).toEqual([
        "name:birchfieldexampleplc",
        "name:birchfieldexample",
      ]);
      expect(recordOfId(parsed, "ofsi:cobaltgateexample").matchKeys).toEqual([
        "name:cobaltgateexamplellp",
        "name:cobaltgateexample",
      ]);
      for (const record of recordsOf(parsed)) {
        expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
      }
    });

    it("are well formed, begin with the mark and say which list they come from", async () => {
      const { parsed } = await runOf(GOOD);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_ofsi", mark: MARK });
      for (const record of parsed.records) {
        expect(record.summary.startsWith(`${MARK} (gov.uk), an enforcement or case list. `)).toBe(
          true,
        );
        expect(record.summary).toContain("it is not a designation");
        expect(record.summary.endsWith(CLOSING)).toBe(true);
      }
    });

    it("never say that the party did something wrong, or that the list designates it", async () => {
      const { parsed } = await runOf(GOOD);
      for (const record of parsed.records) {
        expect(record.summary).not.toMatch(
          /\b(?:guilty|violat|breached|convicted|sanctioned|designated|listed on)\b/i,
        );
      }
    });

    it("are in the list's day: the London day of the publication time of the newest notice", async () => {
      const { parsed } = await runOf([
        ...plainDocs(12),
        penalty("example-penalty-a", "Winterbourne Example Limited", "2024-09-26T23:00:00Z"),
        penalty("example-penalty-b", "Yarrowby Example Limited", "2026-03-30T08:47:08Z"),
        penalty("example-penalty-c", "Zetland Example Limited", "2025-01-15T00:00:00Z"),
      ]);
      expect(recordOfId(parsed, "ofsi:winterbourneexample").publishedAt).toBe("2024-09-27");
      expect(recordOfId(parsed, "ofsi:yarrowbyexample").publishedAt).toBe("2026-03-30");
      expect(recordOfId(parsed, "ofsi:zetlandexample").publishedAt).toBe("2025-01-15");
      expect(recordOfId(parsed, "ofsi:winterbourneexample").summary).toContain(
        "(monetary penalty, 2024-09-27)",
      );
    });

    it("have the version of the list: the newest day of its notices", async () => {
      const { parsed } = await runOf(GOOD);
      expect(parsed.sourceVersion).toBe(dayAt((PARTIES.length - 1) * 10));
    });

    it("give the same records whatever day the list is read on: no read of the clock", async () => {
      jest.useFakeTimers({ now: new Date("2027-05-05T12:00:00Z") });
      try {
        const first = await runOf(GOOD);
        jest.setSystemTime(new Date("2031-11-30T23:59:59Z"));
        const second = await runOf(GOOD);
        expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
        expect(second.parsed).toEqual(first.parsed);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("the notices of the list", () => {
    const SPECIAL: Doc[] = [
      penalty("example-s-colon", "Example Bank PLC", "2026-06-17T10:44:07Z"),
      notice(
        "example-s-dash",
        `Imposition of Monetary Penalty ${EN_DASH} Example Branch London`,
        "2026-05-19T09:52:37Z",
      ),
      notice(
        "example-s-hyphen",
        "Imposition of Monetary Penalty - Example Vector Systems Limited (EVSL)",
        "2026-03-30T08:47:08Z",
      ),
      notice(
        "example-s-curly",
        `Imposition of monetary penalty ${EN_DASH} Example Bank AG London Branch (${OPEN_QUOTE}EBLB${CLOSE_QUOTE})`,
        "2026-01-26T11:04:06Z",
      ),
      notice(
        "example-s-title",
        "Disclosure notice: Example Payments Limited",
        "2025-07-31T16:18:58Z",
      ),
      notice("example-s-date", "Disclosure notice: 08 September 2025", "2025-09-08T12:10:16Z", {
        description: `Disclosure notice of an offence under financial sanctions by Example Credit Limited(ECL) ${EN_DASH} ${LEFT_OUT.tail}`,
      }),
      notice("example-s-charities", "Disclosure notice: 14 March 2025", "2025-03-14T00:00:00Z", {
        description: `Disclosure notice of an offence under financial sanctions by charities Example Lanterns, Example Harbour${NBSP}Ministries and Example Orbit ${EN_DASH} failing to respond to a request for information ${LEFT_OUT.tail}.\r\n\r\n`,
      }),
      notice("example-s-joint", "Example Task Force joint statement", "2025-04-02T10:00:00Z"),
      penalty("example-s-person", "Clear Example", "2022-06-28T23:00:00Z"),
    ];

    it("give a record for each party that a title or a description names, and none for the rest", async () => {
      const { parsed, snapshot } = await runOf([...plainDocs(8), ...SPECIAL, ...otherDocs(20)]);
      expect(idsOf(parsed).sort()).toEqual(
        [
          ...PARTIES.slice(0, 8).map(idOfParty),
          "ofsi:examplebank",
          "ofsi:examplebranchlondon",
          "ofsi:examplevectorsystems",
          "ofsi:examplebankaglondonbranch",
          "ofsi:examplepayments",
          "ofsi:examplecredit",
          "ofsi:examplelanterns",
          "ofsi:exampleharbourministries",
          "ofsi:exampleorbit",
        ].sort(),
      );
      // The joint statement is a notice that names no party: it is no failure. The person is dropped.
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it("name the party as the title writes it, without the alias, and keep the branch", async () => {
      const { parsed } = await runOf([...plainDocs(8), ...SPECIAL]);
      const summaries = (id: string) => recordOfId(parsed, id).summary;
      expect(summaries("ofsi:examplebank")).toContain("Party as written: Example Bank PLC.");
      expect(summaries("ofsi:examplebranchlondon")).toContain(
        "Party as written: Example Branch London.",
      );
      expect(summaries("ofsi:examplevectorsystems")).toContain(
        "Party as written: Example Vector Systems Limited.",
      );
      expect(summaries("ofsi:examplebankaglondonbranch")).toContain(
        "Party as written: Example Bank AG London Branch.",
      );
      expect(summaries("ofsi:examplepayments")).toContain(
        "Party as written: Example Payments Limited.",
      );
      // The notice title is shown as the list publishes it: the alias is in it.
      expect(summaries("ofsi:examplevectorsystems")).toContain(
        `${OPEN_QUOTE}Imposition of Monetary Penalty - Example Vector Systems Limited (EVSL)${CLOSE_QUOTE}`,
      );
    });

    it("name the party of a disclosure notice whose title has a date from its description", async () => {
      const { parsed } = await runOf([...plainDocs(8), ...SPECIAL]);
      const record = recordOfId(parsed, "ofsi:examplecredit");
      expect(record.summary).toContain("Party as written: Example Credit Limited.");
      expect(record.summary).toContain(
        `Notices: 1; newest: ${OPEN_QUOTE}Disclosure notice: 08 September 2025${CLOSE_QUOTE} (disclosure, 2025-09-08).`,
      );
      expect(record.publishedAt).toBe("2025-09-08");
    });

    it("give three records for three charities, kept as organisations because of the word charities", async () => {
      const { parsed } = await runOf([...plainDocs(8), ...SPECIAL]);
      for (const [id, name] of [
        ["ofsi:examplelanterns", "Example Lanterns"],
        ["ofsi:exampleharbourministries", `Example Harbour Ministries`],
        ["ofsi:exampleorbit", "Example Orbit"],
      ]) {
        const record = recordOfId(parsed, id);
        expect(record.summary).toContain(`Party as written: ${name}.`);
        expect(record.summary).toContain("(disclosure, 2025-03-14)");
        expect(record.publishedAt).toBe("2025-03-14");
      }
    });

    it("give the day of London for the migrated midnights: 23:00 UTC in September is the next day", async () => {
      const { parsed } = await runOf([
        ...plainDocs(12),
        penalty("example-midnight", "Winterbourne Example Limited", "2024-09-26T23:00:00Z"),
      ]);
      expect(recordOfId(parsed, "ofsi:winterbourneexample").publishedAt).toBe("2024-09-27");
    });

    it("take the kind of a notice from its title, whatever its link says", async () => {
      const { parsed } = await runOf([
        ...plainDocs(12),
        notice(
          "disclosure-notice-27-september-2024",
          "Imposition of monetary penalty: Winterbourne Example Limited",
          "2024-09-26T23:00:00Z",
        ),
        notice(
          "penalty-notice-08-may-2025",
          "Disclosure notice: Yarrowby Example Limited",
          "2025-05-07T23:00:00Z",
        ),
      ]);
      expect(recordOfId(parsed, "ofsi:winterbourneexample").summary).toContain(
        "(monetary penalty, 2024-09-27)",
      );
      expect(recordOfId(parsed, "ofsi:yarrowbyexample").summary).toContain(
        "(disclosure, 2025-05-08)",
      );
      // The page of the record is the notice's own, whatever kind it is.
      expect(recordOfId(parsed, "ofsi:winterbourneexample").url).toBe(
        "https://www.gov.uk/government/publications/disclosure-notice-27-september-2024",
      );
    });

    it("drop a party that has the shape of a person's name, with no trace in the body", async () => {
      const { parsed, snapshot } = await runOf([...plainDocs(12), SPECIAL[8]]);
      expect(idsOf(parsed)).not.toContain("ofsi:clearexample");
      expect(snapshot.bodies[0]).not.toContain("Clear");
      expect(JSON.stringify(parsed.records)).not.toContain("Clear");
      expect(parsed.skipped).toBe(0);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("do not drop a company because its name looks like a person's when it has a legal form", async () => {
      const { parsed } = await runOf([
        ...plainDocs(12),
        penalty("example-clear-limited", "Clear Example Limited", "2026-02-02T10:00:00Z"),
      ]);
      expect(idsOf(parsed)).toContain("ofsi:clearexample");
    });

    it("keep the company of a notice that names a company and a person, and show nothing of the person", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(12),
        penalty(
          "example-mixed-title",
          "Examplecorp Limited and Zzcasey Zzsample-Lee",
          "2026-02-02T10:00:00Z",
        ),
        notice("example-mixed-date", "Disclosure notice: 09 October 2025", "2025-10-09T12:00:00Z", {
          description: `Disclosure notice of an offence under financial sanctions by Otherco PLC and Zzrobin Zzexample-Lee ${EN_DASH} ${LEFT_OUT.tail}`,
        }),
      ]);
      expect(idsOf(parsed)).toEqual(expect.arrayContaining(["ofsi:examplecorp", "ofsi:otherco"]));
      expect(idsOf(parsed)).toHaveLength(14);
      for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
        expect(text).not.toMatch(/zzcasey|zzsample|zzrobin|zzexample/i);
      }
      // A notice that names a person shows its kind and its day, and never its title.
      expect(recordOfId(parsed, "ofsi:examplecorp").summary).toContain(
        `Notices: 1; newest: ${OPEN_QUOTE}Imposition of monetary penalty${CLOSE_QUOTE} (monetary penalty, 2026-02-02).`,
      );
      expect(recordOfId(parsed, "ofsi:otherco").summary).toContain(
        `Notices: 1; newest: ${OPEN_QUOTE}Disclosure notice${CLOSE_QUOTE} (disclosure, 2025-10-09).`,
      );
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });
  });

  describe("a notice that names a person next to a party", () => {
    // GOV.UK makes the end of the address of a page from its title, so this address holds the
    // person: the tokens of the person and of the address begin with `zz`, and no part of them may
    // reach a body or a record.
    const SLUG =
      "zzslug-imposition-of-monetary-penalty-examplecorp-limited-and-zzcasey-zzsample-zzlee";
    const PERSON = /zzslug|zzcasey|zzsample|zzlee|zzrobin|zzexample|zzmax|zzother/i;
    const WHOLE_PAGE =
      "https://www.gov.uk/government/collections/enforcement-of-financial-sanctions";
    const NAMING = penalty(
      SLUG,
      "Examplecorp Limited and Zzcasey Zzsample-Zzlee",
      "2026-02-02T10:00:00Z",
    );
    const PLAIN = penalty("example-plain-notice", "Plainco Limited", "2026-03-03T10:00:00Z");

    /** A notice of the party of NAMING, of the kind and on the day the caller gives. */
    const naming = (name: string, party: string, at: string, disclosure = false): Doc =>
      disclosure ? notice(name, `Disclosure notice: ${party}`, at) : penalty(name, party, at);

    const rowOf = (snapshot: Snapshot, key: string) =>
      bodyOf(snapshot).rows.find((candidate) => candidate.key === key);

    it("has the collection page of the list as the url of its record", async () => {
      const { parsed } = await runOf([...plainDocs(12), NAMING, PLAIN]);
      expect(recordOfId(parsed, "ofsi:examplecorp").url).toBe(COLLECTION_PAGE);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it("takes that page from the definition of the list in the registry: a page of GOV.UK, and no other", () => {
      expect(COLLECTION_PAGE).toBe(WHOLE_PAGE);
      expect(new URL(COLLECTION_PAGE).href).toBe(COLLECTION_PAGE);
    });

    it("holds no part of the person and no part of the address of the notice, in the body or in a record", async () => {
      const { parsed, snapshot } = await runOf([...plainDocs(12), NAMING, PLAIN]);
      for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
        expect(text).not.toMatch(PERSON);
        expect(text).not.toContain(slugOf(SLUG));
      }
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("leaves every other record the page of its own notice", async () => {
      const { parsed } = await runOf([...plainDocs(12), NAMING, PLAIN]);
      expect(recordOfId(parsed, "ofsi:plainco").url).toBe(
        "https://www.gov.uk/government/publications/example-plain-notice",
      );
      PARTIES.slice(0, 12).forEach((party, at) => {
        expect(recordOfId(parsed, idOfParty(party)).url).toBe(
          `https://www.gov.uk${slugOf(`example-penalty-${at + 1}`)}`,
        );
      });
    });

    it("has no link in the body, where a notice of its own page keeps its link", async () => {
      const { snapshot } = await runOf([...plainDocs(12), NAMING, PLAIN]);
      expect(rowOf(snapshot, "examplecorp")?.items).toEqual([
        {
          link: null,
          title: "Imposition of monetary penalty",
          kind: "monetary penalty",
          date: "2026-02-02",
        },
      ]);
      expect(rowOf(snapshot, "plainco")?.items).toEqual([
        {
          link: slugOf("example-plain-notice"),
          title: "Imposition of monetary penalty: Plainco Limited",
          kind: "monetary penalty",
          date: "2026-03-03",
        },
      ]);
    });

    it("is the same for a disclosure that lists its parties in the title and for one that lists them in the description", async () => {
      const titled = notice(
        "zzslug-disclosure-notice-thirdco-plc-and-zzrobin-zzexample-zzlee",
        "Disclosure notice: Thirdco PLC and Zzrobin Zzexample-Zzlee",
        "2025-11-11T10:00:00Z",
      );
      const described = notice(
        "zzslug-disclosure-notice-09-october-2025",
        "Disclosure notice: 09 October 2025",
        "2025-10-09T12:00:00Z",
        {
          description: `Disclosure notice of an offence under financial sanctions by Otherco PLC and Zzrobin Zzexample-Zzlee ${EN_DASH} ${LEFT_OUT.tail}`,
        },
      );
      const { parsed, snapshot } = await runOf([...plainDocs(12), NAMING, titled, described]);
      expect(idsOf(parsed)).toHaveLength(15);
      for (const id of ["ofsi:examplecorp", "ofsi:thirdco", "ofsi:otherco"]) {
        expect(recordOfId(parsed, id).url).toBe(COLLECTION_PAGE);
      }
      for (const key of ["thirdco", "otherco"]) {
        expect(rowOf(snapshot, key)?.items.map((item) => item.link)).toEqual([null]);
      }
      for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
        expect(text).not.toMatch(PERSON);
        expect(text).not.toContain("ZZ-");
      }
    });

    it("is the same for each party of one notice that names two parties and a person", async () => {
      const several = notice(
        "zzslug-disclosure-notice-09-october-2025",
        "Disclosure notice: 09 October 2025",
        "2025-10-09T12:00:00Z",
        {
          description: `Disclosure notice of an offence under financial sanctions by Otherco PLC, Thirdco PLC and Zzrobin Zzexample-Zzlee ${EN_DASH} ${LEFT_OUT.tail}`,
        },
      );
      const { parsed, snapshot } = await runOf([...plainDocs(12), several]);
      expect(idsOf(parsed)).toHaveLength(14);
      for (const key of ["otherco", "thirdco"]) {
        expect(recordOfId(parsed, `ofsi:${key}`).url).toBe(COLLECTION_PAGE);
        expect(rowOf(snapshot, key)?.items.map((item) => item.link)).toEqual([null]);
      }
      for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
        expect(text).not.toMatch(PERSON);
      }
    });

    it("decides the page of a record by its newest notice: a notice of its own page that is newer keeps it", async () => {
      const newer = penalty("example-newer-notice", "Examplecorp Limited", "2026-04-04T10:00:00Z");
      const { parsed, snapshot } = await runOf([...plainDocs(12), NAMING, newer]);
      expect(recordOfId(parsed, "ofsi:examplecorp").url).toBe(
        "https://www.gov.uk/government/publications/example-newer-notice",
      );
      // The older notice names a person: it has no link in the body, and no part of it is anywhere.
      expect(rowOf(snapshot, "examplecorp")?.items.map((item) => item.link)).toEqual([
        slugOf("example-newer-notice"),
        null,
      ]);
      for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
        expect(text).not.toMatch(PERSON);
      }
    });

    it("decides the page of a record by its newest notice: a notice that names a person and is newer takes the collection page", async () => {
      const older = penalty("example-older-notice", "Examplecorp Limited", "2025-04-04T10:00:00Z");
      const { parsed, snapshot } = await runOf([...plainDocs(12), NAMING, older]);
      expect(recordOfId(parsed, "ofsi:examplecorp").url).toBe(COLLECTION_PAGE);
      expect(rowOf(snapshot, "examplecorp")?.items.map((item) => item.link)).toEqual([
        null,
        slugOf("example-older-notice"),
      ]);
    });

    it("gives two such records the same page and keeps them two records, in the order of their keys", async () => {
      const second = penalty(
        "zzslug-imposition-of-monetary-penalty-secondco-plc-and-zzrobin-zzexample-zzlee",
        "Secondco PLC and Zzrobin Zzexample-Zzlee",
        "2025-12-12T10:00:00Z",
      );
      const { parsed, snapshot } = await runOf([...plainDocs(12), second, NAMING, PLAIN]);
      expect(recordOfId(parsed, "ofsi:examplecorp").url).toBe(COLLECTION_PAGE);
      expect(recordOfId(parsed, "ofsi:secondco").url).toBe(COLLECTION_PAGE);
      // Two ids, so the table's unique index (source, id) holds; the address is not unique and
      // no rule asks it to be.
      expectWellFormedRecords(parsed.records, { sourceId: "uk_ofsi", mark: MARK });
      const ids = idsOf(parsed);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(15);
      expect(ids).toEqual([...ids].sort());
      const keys = bodyOf(snapshot).rows.map((row) => row.key);
      expect(keys).toEqual([...keys].sort());
      for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
        expect(text).not.toMatch(PERSON);
      }
    });

    it("never meets another record with the same address in one run: a lookup offers one record of this list", () => {
      // The evidence pack drops an address that it holds already (the first entry wins), so two
      // records of one address in one run would lose one. The lookup gives a run one record of
      // this list at most, so the records that share the collection page never meet.
      expect(MAX_RECORDS.uk_ofsi).toBe(1);
    });

    it("gives the same body for notices of one party that name persons, in any order", async () => {
      const day = "2026-02-02T10:00:00Z";
      const docs = [
        ...plainDocs(12),
        naming("zzslug-tie-a", "Examplecorp Limited and Zzcasey Zzsample-Zzlee", day),
        naming("zzslug-tie-b", "Examplecorp Ltd and Zzrobin Zzexample-Zzlee", day),
        // The same party as the first, of the other kind: only the kind tells them apart.
        naming("zzslug-tie-c", "Examplecorp Limited and Zzcasey Zzsample-Zzlee", day, true),
        naming("zzslug-tie-d", "Examplecorp PLC and Zzmax Zzother-Zzlee", day, true),
      ];
      await expectDeterministic(ukOfsiConnector, (reversed) =>
        fakeFetch(filesOf(reversed ? [...docs].reverse() : docs)),
      );
      const { snapshot } = await runOf(docs);
      // The order of the ties: the party, then the kind.
      const row = rowOf(snapshot, "examplecorp");
      expect(row?.count).toBe(4);
      expect(row?.displayName).toBe("Examplecorp Limited");
      expect(row?.spellings).toEqual(["Examplecorp Limited", "Examplecorp Ltd", "Examplecorp PLC"]);
      expect(row?.items.map((item) => item.kind)).toEqual([
        "disclosure",
        "monetary penalty",
        "monetary penalty",
      ]);
    });

    it("puts a notice with no link before a notice of its own page on the same day, whatever the order of the results", async () => {
      const own = penalty("example-same-day", "Examplecorp Limited", "2026-02-02T11:00:00Z");
      for (const docs of [
        [NAMING, own],
        [own, NAMING],
      ]) {
        const { snapshot } = await runOf([...plainDocs(12), ...docs]);
        expect(rowOf(snapshot, "examplecorp")?.items.map((item) => item.link)).toEqual([
          null,
          slugOf("example-same-day"),
        ]);
      }
    });
  });

  describe("a notice that names a person in a form that the person rule reads", () => {
    // The person and the address of each notice begin with `zz`: no part of them may reach a body or
    // a record, whatever the shape in which the title or the description writes the person.
    const TOKEN = /zz/i;
    const AT = "2026-02-02T10:00:00Z";

    /** `[what, the party text of the notice for a base word, the end of the id that stays, in a description too]` */
    const SHAPES: Array<[string, (base: string) => string, string, boolean]> = [
      ["a dotted honorific", (c) => `${c} Limited and Mrs. Zzcasey Zzsample`, "", true],
      ["a suffix with its dot", (c) => `${c} Limited and Zzcasey Zzsample Jr.`, "", true],
      ["a dotted saint inside the name", (c) => `${c} Limited and Zzcasey St. Zzsample`, "", true],
      [
        "a suffix in lower case and no dot",
        (c) => `${c} Limited and Zzcasey Zzsample jr`,
        "",
        true,
      ],
      ["a saint in lower case and no dot", (c) => `${c} Limited and Zzcasey st Zzsample`, "", true],
      ["a title in lower case and one name", (c) => `${c} Limited and dr Zzsample`, "", true],
      ["an ampersand", (c) => `${c} Limited & Zzcasey Zzsample`, "", true],
      ["a slash", (c) => `${c} Limited / Zzcasey Zzsample`, "", true],
      ["a semicolon", (c) => `${c} Limited; Zzcasey Zzsample`, "", true],
      ["the word with", (c) => `${c} Limited with Zzcasey Zzsample`, "", true],
      ["a comma and the word and", (c) => `${c} Limited, and Zzcasey Zzsample`, "", false],
      ["a bracket after the company", (c) => `${c} Limited (Zzcasey Zzsample)`, "", true],
      ["a bracket after the person", (c) => `Zzcasey Zzsample (${c} Limited)`, "", true],
      [
        "a bracket with a role after a comma",
        (c) => `${c} Limited (Zzcasey Zzsample, director)`,
        "",
        true,
      ],
      [
        "a bracket with two persons",
        (c) => `${c} Limited (Zzcasey Zzsample and Zzrobin Zzexample)`,
        "",
        true,
      ],
      ["a bracket that is not closed", (c) => `${c} Limited (Zzcasey Zzsample`, "", true],
      ["a role before the name", (c) => `${c} Limited and its director Zzcasey Zzsample`, "", true],
      ["a role after the name", (c) => `${c} Limited and Zzcasey Zzsample, owner`, "", true],
      ["a prefix of the name", (c) => `${c} Limited and Zzcasey DeZzsample`, "", true],
      ["a particle of the name", (c) => `${c} Limited and Zzcasey de la Zzsample`, "", true],
      ["a sole trader", (c) => `Zzcasey Zzsample t/a ${c} Services`, "services", true],
      [
        "a sole trader that trading as names",
        (c) => `Mr. Zzcasey Zzsample trading as ${c} Services`,
        "services",
        true,
      ],
      ["a company that trades as a person", (c) => `${c} Limited t/a Zzcasey Zzsample`, "", true],
      // The other markers of a sole trader and the other joiners.
      ["the marker d/b/a", (c) => `${c} Limited d/b/a Zzcasey Zzsample`, "", true],
      [
        "the marker dba, person first",
        (c) => `Zzcasey Zzsample dba ${c} Services`,
        "services",
        true,
      ],
      ["the marker a/k/a", (c) => `${c} Limited a/k/a Zzcasey Zzsample`, "", true],
      [
        "the marker aka, person first",
        (c) => `Zzcasey Zzsample aka ${c} Services`,
        "services",
        true,
      ],
      ["the marker f/k/a", (c) => `${c} Limited f/k/a Zzcasey Zzsample`, "", true],
      ["the marker n/k/a", (c) => `${c} Limited n/k/a Zzcasey Zzsample`, "", true],
      ["the marker also known as", (c) => `${c} Limited also known as Zzcasey Zzsample`, "", true],
      [
        "the marker formerly known as",
        (c) => `${c} Limited formerly known as Zzcasey Zzsample`,
        "",
        true,
      ],
      ["the marker now known as", (c) => `${c} Limited now known as Zzcasey Zzsample`, "", true],
      [
        "the marker formerly, person first",
        (c) => `Zzcasey Zzsample formerly ${c} Services`,
        "services",
        true,
      ],
      ["a marker after a comma", (c) => `${c} Limited, d/b/a Zzcasey Zzsample`, "", true],
      ["the joiner and/or", (c) => `${c} Limited and/or Zzcasey Zzsample`, "", true],
      ["the joiner together with", (c) => `${c} Limited together with Zzcasey Zzsample`, "", true],
      ["the joiner as well as", (c) => `${c} Limited as well as Zzcasey Zzsample`, "", true],
      ["the joiner plus", (c) => `${c} Limited plus Zzcasey Zzsample`, "", true],
      ["the joiner c/o", (c) => `${c} Limited c/o Zzcasey Zzsample`, "", true],
      ["the joiner vs", (c) => `${c} Limited vs Zzcasey Zzsample`, "", true],
      ["the joiner versus", (c) => `${c} Limited versus Zzcasey Zzsample`, "", true],
      // `et al`, a possessive after a legal form, and the linkers.
      ["et al after the person", (c) => `${c} Limited and Zzcasey Zzsample et al`, "", true],
      [
        "a possessive after the company",
        (c) => `${c} Limited${cp(0x2019)}s director Zzcasey Zzsample`,
        "",
        true,
      ],
      [
        "a possessive written with a straight apostrophe",
        (c) => `${c} Limited's director Zzcasey Zzsample`,
        "",
        true,
      ],
      ["the linker owned by", (c) => `${c} Limited owned by Zzcasey Zzsample`, "", true],
      [
        "the linker acting on behalf of, person first",
        (c) => `Zzcasey Zzsample acting on behalf of ${c} Services`,
        "services",
        true,
      ],
    ];

    it.each(SHAPES)(
      "gives the record of the company the collection page and no trace of the person: %s, in a title",
      async (_what, party, suffix) => {
        const docs = [
          ...plainDocs(12),
          penalty("zzslug-the-address-with-the-person", party("Examplecorp"), AT),
        ];
        const { parsed, snapshot } = await runOf(docs);
        const id = `ofsi:examplecorp${suffix}`;
        expect(recordOfId(parsed, id).url).toBe(COLLECTION_PAGE);
        expect(bodyOf(snapshot).rows.find((row) => `ofsi:${row.key}` === id)?.items).toEqual([
          {
            link: null,
            title: "Imposition of monetary penalty",
            kind: "monetary penalty",
            date: "2026-02-02",
          },
        ]);
        for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
          expect(text).not.toMatch(TOKEN);
        }
        expect(idsOf(parsed)).toHaveLength(13);
        expect(bodyOf(snapshot).unreadable).toBe(0);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(0);
      },
    );

    it.each(SHAPES.filter(([, , , described]) => described))(
      "gives the record of the company the collection page and no trace of the person: %s, in a description",
      async (_what, party, suffix) => {
        const docs = [
          ...plainDocs(12),
          notice(
            "zzslug-disclosure-notice-09-october-2025",
            "Disclosure notice: 09 October 2025",
            AT,
            {
              description: `${BY_OF} ${party("Describedco")} ${EN_DASH} ${LEFT_OUT.tail}`,
            },
          ),
        ];
        const { parsed, snapshot } = await runOf(docs);
        const id = `ofsi:describedco${suffix}`;
        expect(recordOfId(parsed, id).url).toBe(COLLECTION_PAGE);
        for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
          expect(text).not.toMatch(TOKEN);
        }
        expect(idsOf(parsed)).toHaveLength(13);
        expect(bodyOf(snapshot).unreadable).toBe(0);
        expect(parsed.errors).toBe(0);
      },
    );

    it("is deterministic: the same list in any order gives the same bodies and records", async () => {
      const docs = [
        ...plainDocs(12),
        ...SHAPES.map(([, party], at) =>
          penalty(
            `zzslug-order-${at}`,
            party(`Orderco${String.fromCharCode(97 + (at % 26), 97 + Math.floor(at / 26))}`),
            AT,
          ),
        ),
      ];
      await expectDeterministic(ukOfsiConnector, (reversed) =>
        fakeFetch(filesOf(reversed ? [...docs].reverse() : docs)),
      );
    });

    it("keeps the page of a notice of a plain title whatever its address says: the address is never compared with the title", async () => {
      // GOV.UK keeps the path of a page when its document is retitled, so a notice that was first
      // published under another title keeps an address that does not repeat the title. The header
      // states it as a residual: of the real notices, a share keeps an address that is no slug of its
      // title, so a check of the slug would hide the pages of plain notices.
      const retitled = penalty("zz-the-first-title-of-the-notice", "Retitledco Limited", AT);
      const { parsed } = await runOf([...plainDocs(12), retitled]);
      expect(recordOfId(parsed, "ofsi:retitledco").url).toBe(
        "https://www.gov.uk/government/publications/zz-the-first-title-of-the-notice",
      );
    });
  });

  describe("a company that has the shape of a person's name and a legal form after a comma or a spaced dash", () => {
    // A tail of legal forms alone is the company's, not a role, so the notice names a party
    // and its record has the page of its own notice; a role that holds no legal form, or holds one among
    // other words, still hides the person.
    const AT = "2026-02-02T10:00:00Z";
    const SLUG = "example-company-notice";

    const COMPANIES: Array<[string, string, string, string]> = [
      [
        "a comma, in a penalty",
        "Imposition of monetary penalty: Examplecorp Sample, ltd",
        "examplecorpsample",
        "monetary penalty",
      ],
      [
        "a spaced dash, in a penalty",
        "Imposition of monetary penalty: Othercorp Sample - llc",
        "othercorpsample",
        "monetary penalty",
      ],
      [
        "a form outside the legal forms of the person rule, after a comma",
        "Imposition of monetary penalty: Thirdcorp Sample, corp",
        "thirdcorpsample",
        "monetary penalty",
      ],
      [
        "a comma, in a disclosure",
        "Disclosure notice: Fourthcorp Sample, inc",
        "fourthcorpsample",
        "disclosure",
      ],
      [
        "a spaced dash, in a disclosure",
        "Disclosure notice: Fifthcorp Sample - limited",
        "fifthcorpsample",
        "disclosure",
      ],
      [
        "two forms after a spaced dash, in a penalty",
        "Imposition of monetary penalty: Sixthcorp Sample - pty ltd",
        "sixthcorpsample",
        "monetary penalty",
      ],
      [
        "the letters of a form written apart, after a comma, in a disclosure",
        "Disclosure notice: Seventhcorp Sample, s a",
        "seventhcorpsamplesa",
        "disclosure",
      ],
    ];

    it.each(COMPANIES)(
      "gives the record of the company the page of its own notice, and the notice its link in the body: %s",
      async (_what, title, key, kind) => {
        const { parsed, snapshot } = await runOf([...plainDocs(12), notice(SLUG, title, AT)]);
        expect(recordOfId(parsed, `ofsi:${key}`).url).toBe(`https://www.gov.uk${slugOf(SLUG)}`);
        expect(bodyOf(snapshot).rows.find((row) => row.key === key)?.items).toEqual([
          { link: slugOf(SLUG), title, kind, date: "2026-02-02" },
        ]);
        expect(idsOf(parsed)).toHaveLength(13);
        expect(bodyOf(snapshot).unreadable).toBe(0);
        expect(parsed.errors).toBe(0);
      },
    );

    it("still hides a person whose role holds no legal form, or holds one among other words: no record, and no trace of the name", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(12),
        penalty("zzslug-the-person-and-a-role", "Zzcasey Zzsample, owner", AT),
        penalty("zzslug-the-person-and-a-long-role", "Zzrobin Zzexample - its sole director", AT),
        penalty("zzslug-the-person-and-co-owner", "Zzalex Zzperson, co owner", AT),
        penalty("zzslug-the-person-and-a-form-last", "Zzdana Zzsurname, owner of ltd", AT),
        notice(
          "zzslug-the-person-and-a-form-first",
          "Disclosure notice: Zzeli Zzperson - ltd owner",
          AT,
        ),
      ]);
      for (const text of [snapshot.bodies[0], JSON.stringify(parsed.records)]) {
        expect(text).not.toMatch(/zz/i);
      }
      expect(idsOf(parsed)).toHaveLength(12);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });
  });

  describe("a party that several notices name", () => {
    it("is one record: its notices counted, the newest three shown, newest first", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(12),
        penalty("example-bank-2023", "Example Bank plc", "2023-05-05T10:00:00Z"),
        notice("example-bank-2024", "Disclosure notice: Example Bank Ltd", "2024-01-10T10:00:00Z"),
        penalty("example-bank-2026", "Example Bank PLC", "2026-06-17T10:00:00Z"),
        penalty("example-bank-2025", "Example Bank Limited", "2025-03-01T10:00:00Z"),
        // The same spelling as the newest: a fifth notice, and no fifth spelling.
        penalty("example-bank-2022", "Example Bank PLC", "2022-01-01T10:00:00Z"),
      ]);
      const record = recordOfId(parsed, "ofsi:examplebank");
      expect(record.publishedAt).toBe("2026-06-17");
      expect(record.url).toBe("https://www.gov.uk/government/publications/example-bank-2026");
      expect(record.summary).toContain("Party as written: Example Bank PLC.");
      expect(record.summary).toContain(
        [
          "Notices: 5; newest: ",
          `${OPEN_QUOTE}Imposition of monetary penalty: Example Bank PLC${CLOSE_QUOTE} (monetary penalty, 2026-06-17); `,
          `${OPEN_QUOTE}Imposition of monetary penalty: Example Bank Limited${CLOSE_QUOTE} (monetary penalty, 2025-03-01); `,
          `${OPEN_QUOTE}Disclosure notice: Example Bank Ltd${CLOSE_QUOTE} (disclosure, 2024-01-10).`,
        ].join(""),
      );
      expect(record.summary).not.toContain("Example Bank plc");
      expect(record.identifiers).toEqual({
        party: "Example Bank PLC",
        notices: 5,
        newest: "2026-06-17",
      });
      const row = bodyOf(snapshot).rows.find((candidate) => candidate.key === "examplebank");
      expect(row?.count).toBe(5);
      expect(row?.items.map((item) => item.date)).toEqual([
        "2026-06-17",
        "2025-03-01",
        "2024-01-10",
      ]);
      expect(row?.spellings).toEqual([
        "Example Bank PLC",
        "Example Bank Limited",
        "Example Bank Ltd",
        "Example Bank plc",
      ]);
      // Every spelling is a name of the record.
      expect(record.matchKeys).toEqual(
        expect.arrayContaining([
          "name:examplebankplc",
          "name:examplebanklimited",
          "name:examplebankltd",
          "name:examplebank",
        ]),
      );
    });

    it("has at most five spellings, the newest first", async () => {
      const forms = ["PLC", "Limited", "Ltd", "Inc", "Corp", "Co", "LLC"];
      const docs = forms.map((form, at) =>
        penalty(`example-forms-${at}`, `Example Bank ${form}`, `${dayAt(100 + at)}T10:00:00Z`),
      );
      const { snapshot } = await runOf([...plainDocs(12), ...docs]);
      const row = bodyOf(snapshot).rows.find((candidate) => candidate.key === "examplebank");
      expect(row?.count).toBe(7);
      expect(row?.spellings).toEqual([
        "Example Bank LLC",
        "Example Bank Co",
        "Example Bank Corp",
        "Example Bank Inc",
        "Example Bank Ltd",
      ]);
      expect(row?.items).toHaveLength(3);
    });

    it("orders two notices of one day by the order of their links, whatever the order of the results", async () => {
      const first = penalty("example-tie-a", "Example Bank PLC", "2025-03-01T10:00:00Z");
      const second = notice(
        "example-tie-b",
        "Disclosure notice: Example Bank Ltd",
        "2025-03-01T11:00:00Z",
      );
      for (const docs of [
        [first, second],
        [second, first],
      ]) {
        const { snapshot } = await runOf([...plainDocs(12), ...docs]);
        const row = bodyOf(snapshot).rows.find((candidate) => candidate.key === "examplebank");
        expect(row?.items.map((item) => item.link)).toEqual([
          slugOf("example-tie-a"),
          slugOf("example-tie-b"),
        ]);
      }
    });

    it("keeps the title of a notice to 120 characters: a longer one is cut, with the mark of a cut", async () => {
      const head = "Imposition of monetary penalty: ";
      const room = (length: number): number => length - head.length - " Limited".length;
      const titled = (length: number): string => `${head}${"W".repeat(room(length))} Limited`;
      expect(titled(120)).toHaveLength(120);

      const whole = await runOf([
        ...plainDocs(12),
        notice("example-long-a", titled(120), "2025-03-01T10:00:00Z"),
      ]);
      const wholeRow = bodyOf(whole.snapshot).rows.find(
        (candidate) => candidate.key === "w".repeat(room(120)),
      );
      expect(wholeRow?.items[0].title).toBe(titled(120));

      const cut = await runOf([
        ...plainDocs(12),
        notice("example-long-b", titled(121), "2025-03-01T10:00:00Z"),
      ]);
      const cutRow = bodyOf(cut.snapshot).rows.find(
        (candidate) => candidate.key === "w".repeat(room(121)),
      );
      expect(cutRow?.items[0].title).toBe(`${titled(121).slice(0, 108)} [shortened]`);
      expect(cutRow?.items[0].title).toHaveLength(120);
    });

    it("is the same party whatever its alias and its legal form say", async () => {
      const { parsed } = await runOf([
        ...plainDocs(12),
        penalty("example-alias-a", "Example Bank PLC (EBP)", "2025-01-02T10:00:00Z"),
        penalty(
          "example-alias-b",
          `Example Bank Limited (${OPEN_QUOTE}EB${CLOSE_QUOTE})`,
          "2025-02-02T10:00:00Z",
        ),
      ]);
      expect(idsOf(parsed).filter((id) => id === "ofsi:examplebank")).toHaveLength(1);
      expect(recordOfId(parsed, "ofsi:examplebank").identifiers).toMatchObject({ notices: 2 });
    });

    it("is one party once in a notice that names it twice", async () => {
      const { parsed } = await runOf([
        ...plainDocs(12),
        notice("example-twice", "Disclosure notice: 08 September 2025", "2025-09-08T12:10:16Z", {
          description:
            "Disclosure notice of an offence under financial sanctions by Examplebank Limited and Examplebank Ltd",
        }),
      ]);
      expect(recordOfId(parsed, "ofsi:examplebank").identifiers).toMatchObject({ notices: 1 });
    });

    it("keeps the id that a party has, whatever the order of the notices and the notices that come with it", async () => {
      const docs = [...GOOD];
      const first = await runOf(docs);
      const second = await runOf([...docs].reverse());
      const third = await runOf([
        ...docs,
        penalty("example-more", "Another Example Limited", "2026-02-02T10:00:00Z"),
      ]);
      expect(idsOf(second.parsed)).toEqual(idsOf(first.parsed));
      for (const id of idsOf(first.parsed)) expect(idsOf(third.parsed)).toContain(id);
    });
  });

  describe("the id of a party", () => {
    it("is ofsi: and the compact name without its legal form, whole, when that is 120 characters or fewer", async () => {
      // A name of 120 compact characters is the longest that has an id, and the id is all of it.
      const name = "Zorvane".repeat(18).slice(0, 120);
      expect(name).toHaveLength(120);
      const party = `${name} Limited`;
      const { parsed } = await runOf([
        ...plainDocs(12),
        penalty("example-long-1", party, "2026-01-01T10:00:00Z"),
      ]);
      const id = `ofsi:${name.toLowerCase()}`;
      expect(id).toHaveLength("ofsi:".length + 120);
      expect(recordOfId(parsed, id).summary).toContain(`Party as written: ${party}.`);
    });

    describe("of a party whose compact name is longer than 120 characters", () => {
      // A name that is cut is no key and no id: the party is refused, as a name that is no name is, and
      // the notice is UNREADABLE and counted. Two long names that share their first 120 characters are not
      // made one party by a cut: neither is a party at all.
      const long = (tail: string): string => `${"Zorvane".repeat(18).slice(0, 119)}${tail}`;

      it("has no key and no id: the notice is refused and counted, never cut", async () => {
        const { parsed, snapshot } = await runOf([
          ...plainDocs(12),
          penalty("example-long-1", `${long("Alpha")} Limited`, "2026-01-01T10:00:00Z"),
          penalty("example-long-2", `${long("Bravo")} PLC`, "2026-02-01T10:00:00Z"),
          penalty("example-long-3", `${long("Qu")} Ltd`, "2026-03-01T10:00:00Z"),
        ]);
        expect(bodyOf(snapshot).unreadable).toBe(3);
        // No record is made of the cut of such a name, and nothing of the three is kept.
        expect(idsOf(parsed)).toHaveLength(12);
        expect(idsOf(parsed).every((id) => id.length <= "ofsi:".length + 120)).toBe(true);
        expect(JSON.stringify(parsed.records).toLowerCase()).not.toContain("zorvane");
        expect(snapshot.bodies[0].toLowerCase()).not.toContain("zorvane");
      });

      it("is refused at 121 characters and read at 120, in every place a party stands", () => {
        const name = (length: number): string => "Zorvane".repeat(18).slice(0, length);
        for (const slot of [
          (text: string) => ofsiReadingOf(`${PENALTY_OF}${text}`, ""),
          (text: string) => ofsiReadingOf(`Disclosure notice: ${text}`, ""),
          (text: string) => ofsiReadingOf(DATE_TITLE_OF, `${BY_OF} ${text}`),
          (text: string) => ofsiReadingOf(DATE_TITLE_OF, `${BY_OF} charities ${text}`),
        ]) {
          expect(slot(`${name(121)} Limited`)).toEqual({ shape: "unreadable" });
          expect(slot(`${name(120)} Limited`)).toMatchObject({ shape: "notice" });
          expect(slot(`${name(120)} Limited`)).toMatchObject({ parties: [`${name(120)} Limited`] });
        }
      });

      it("counts the length in the units of the id: a letter of two units is two", () => {
        // A letter of the Deseret alphabet: a capital that no normal form changes and that takes two units.
        const astral = cp(0x10400);
        const party = (letters: number): string =>
          `${"Zorvane".repeat(18).slice(0, letters)}${astral}`;
        // 119 letters and one of two units are 121 units; 118 and one are 120.
        expect(ofsiReadingOf(`${PENALTY_OF}${party(119)} Limited`, "")).toEqual({
          shape: "unreadable",
        });
        expect(ofsiReadingOf(`${PENALTY_OF}${party(118)} Limited`, "")).toMatchObject({
          shape: "notice",
        });
      });

      it("counts the compact name, not the party: hyphens and the legal form do not count", () => {
        const hyphened = (letters: number, parts: number): string => {
          const each = Math.floor(letters / parts);
          const extra = letters - each * parts;
          return Array.from({ length: parts }, (_, at) =>
            "Z".repeat(each + (at < extra ? 1 : 0)),
          ).join("-");
        };
        const read = `${hyphened(120, 23)} Limited`;
        const refused = `${hyphened(121, 21)} Limited`;
        expect(read).toHaveLength(150);
        expect(refused).toHaveLength(149);
        expect(ofsiReadingOf(`${PENALTY_OF}${read}`, "")).toMatchObject({ parties: [read] });
        expect(ofsiReadingOf(`${PENALTY_OF}${refused}`, "")).toEqual({ shape: "unreadable" });
      });

      it("makes the whole notice unreadable, as a refused name does, and leaves the other parties out too", () => {
        const slot = `${COMPANY_OF} and ${long("Alpha")} Limited`;
        expect(ofsiReadingOf(`${PENALTY_OF}${slot}`, "")).toEqual({ shape: "unreadable" });
        expect(ofsiReadingOf(DATE_TITLE_OF, `${BY_OF} ${slot}`)).toEqual({ shape: "unreadable" });
      });

      it("never refuses a person for it: a name of a person's shape is counted, whatever its length", () => {
        // Five name words of 29 letters are a person's shape (149 units) and 141 compact characters.
        const word = `Q${"u".repeat(28)}`;
        const person = Array.from({ length: 5 }, () => word).join(" ");
        expect(person).toHaveLength(149);
        expectPersons(person, 1);
        expectPartyAnd(`${COMPANY_OF} and ${person}`);
      });

      it("keeps a name that no key could match out without a failure, as before", () => {
        // The name keys are looked at before the length of the key: a name that is too short is left out.
        expect(ofsiReadingOf(`${PENALTY_OF}Zq`, "")).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: [],
          persons: 0,
        });
      });
    });

    it("is the same whatever the legal form, the article, the case, the punctuation and the alias say", async () => {
      const { parsed } = await runOf([
        ...plainDocs(12),
        penalty(
          "example-form-1",
          "The Winterbourne-Example Company Limited",
          "2026-01-01T10:00:00Z",
        ),
        penalty("example-form-2", "WINTERBOURNE EXAMPLE Co (WEC)", "2026-02-01T10:00:00Z"),
      ]);
      expect(idsOf(parsed).filter((id) => id.startsWith("ofsi:winterbourne"))).toEqual([
        "ofsi:winterbourneexample",
      ]);
    });
  });

  describe("the records of different parties", () => {
    it("have ids that differ and addresses that differ when their newest notices differ", async () => {
      const { parsed } = await runOf(GOOD);
      const ids = idsOf(parsed);
      expect(new Set(ids).size).toBe(ids.length);
      const urls = parsed.records.map((record) => record.url);
      expect(new Set(urls).size).toBe(urls.length);
      for (const record of parsed.records) {
        expect(record.url.startsWith("https://www.gov.uk/government/publications/")).toBe(true);
      }
    });

    it("share the page of a notice that names them together: the list's page is the notice, and a run is offered one", async () => {
      const description =
        "Disclosure notice of an offence under financial sanctions by charities Example Lanterns, Example Aid and Example Orbit";
      const { parsed } = await runOf([
        ...plainDocs(12),
        notice(
          "example-three-charities",
          "Disclosure notice: 14 March 2025",
          "2025-03-14T00:00:00Z",
          {
            description,
          },
        ),
      ]);
      const urls = ["ofsi:examplelanterns", "ofsi:exampleaid", "ofsi:exampleorbit"].map(
        (id) => recordOfId(parsed, id).url,
      );
      expect(new Set(urls).size).toBe(1);
      expect(urls[0]).toBe("https://www.gov.uk/government/publications/example-three-charities");
    });
  });

  describe("the list is not the list", () => {
    const failure = async (files: Record<string, FakeFile>) =>
      failureOf(ukOfsiConnector.download(fakeFetch(files), {}));

    it("when fewer than twelve parties are read: a parser that broke would give few, and skipping them would hide it", async () => {
      expect(await failure(filesOf([...plainDocs(11), ...otherDocs(20)]))).toBeInstanceOf(
        NotTheListError,
      );
      const twelve = await downloadOf(filesOf([...plainDocs(12), ...otherDocs(20)]));
      expect(bodyOf(twelve).rows).toHaveLength(12);
    });

    it("counts the parties that stay, not the notices: a person and a joint statement are not parties", async () => {
      const docs = [
        ...plainDocs(11),
        penalty("example-person", "Clear Example", "2026-01-01T10:00:00Z"),
        notice("example-joint", "Example Task Force joint statement", "2026-01-02T10:00:00Z"),
      ];
      expect(await failure(filesOf(docs))).toBeInstanceOf(NotTheListError);
    });

    it("reads parties from every notice of a list that holds more parties than notices", async () => {
      const description =
        "Disclosure notice of an offence under financial sanctions by charities Example Lanterns, Example Aid, Example Hope, Example Care, Example Home and Example Peace";
      const docs = [
        notice(
          "example-six-charities",
          "Disclosure notice: 14 March 2025",
          "2025-03-14T00:00:00Z",
          {
            description,
          },
        ),
        ...plainDocs(6),
      ];
      const snapshot = await downloadOf(filesOf(docs));
      const body = bodyOf(snapshot);
      expect(body.rows).toHaveLength(12);
      // The notices are seven and the parties twelve: the count of the rows is at least their number.
      expect(body.total).toBeGreaterThanOrEqual(body.rows.length + body.unreadable);
      expect(ukOfsiConnector.parse(snapshot).errors).toBe(0);
    });

    it("when it holds more parties than any real list, and is read at 2,000", async () => {
      // A letters-only token of a number, so that no two parties have the same compact name.
      const lettersOf = (n: number): string =>
        [3, 2, 1, 0]
          .map((power) => String.fromCharCode(97 + (Math.floor(n / 26 ** power) % 26)))
          .join("");
      const charities = (at: number, count: number): Doc =>
        notice(
          `example-charities-${at}`,
          "Disclosure notice: 14 March 2025",
          `${dayAt(at % 300)}T10:00:00Z`,
          {
            description: `Disclosure notice of an offence under financial sanctions by charities ${Array.from(
              { length: count },
              (_, index) => `Example ${lettersOf(at * 25 + index)} Aid`,
            ).join(", ")}`,
          },
        );
      const eighty = Array.from({ length: 80 }, (_, at) => charities(at, 25));
      const snapshot = await downloadOf(filesOf(eighty));
      expect(bodyOf(snapshot).rows).toHaveLength(2_000);
      expect(ukOfsiConnector.parse(snapshot)).toMatchObject({ errors: 0, skipped: 0 });
      expect(await failure(filesOf([...eighty, charities(80, 1)]))).toBeInstanceOf(NotTheListError);
    });

    it("counts every notice in total: the parties, the notices that name none and the ones that cannot be read", async () => {
      const { snapshot } = await runOf([
        ...plainDocs(),
        notice("example-joint", "Example Task Force joint statement", "2026-01-02T10:00:00Z"),
        penalty("example-person", "Clear Example", "2026-01-01T10:00:00Z"),
        notice(
          "example-bad",
          "Imposition of monetary penalty on Example Debit Limited",
          "2026-01-01T10:00:00Z",
        ),
        ...otherDocs(10),
      ]);
      const body = bodyOf(snapshot);
      expect(body.rows).toHaveLength(PARTIES.length);
      expect(body.unreadable).toBe(1);
      // The 14 notices of the parties, the joint statement, the person and the one that cannot be read.
      expect(body.total).toBe(PARTIES.length + 3);
    });

    it("does not count a notice that names only a person, whatever its link and its time: nothing of it is kept", async () => {
      const { snapshot } = await runOf([
        ...plainDocs(),
        penalty("example-person-a", "Clear Example", "yesterday"),
        penalty("example-person-b", "Clear Example", "2026-01-01T10:00:00Z", {
          link: "/government/news/not-a-publication",
        }),
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(snapshot.bodies[0]).not.toContain("Clear");
    });

    it("when the search states a total that its distinct links do not add up to", async () => {
      const results = [...plainDocs(), ...otherDocs(234)].map(resultOf);
      expect(results).toHaveLength(248);
      // 249 stated, and one link twice: 248 distinct links.
      results.push({ ...results[0] });
      expect(results).toHaveLength(249);
      expect(await failure(filesOfResults(results))).toBeInstanceOf(NotTheListError);

      const short = filesOfResults([...plainDocs(), ...otherDocs(234)].map(resultOf));
      short[urlOf(0)] = {
        ...short[urlOf(0)],
        body: pageText([...plainDocs(), ...otherDocs(234)].map(resultOf), 249, 0),
      };
      expect(await failure(short)).toBeInstanceOf(NotTheListError);
    });

    it.each<[string, string]>([
      ["a page of HTML", "<!DOCTYPE html><html><head><title>Just a moment</title></head></html>"],
      ["an empty answer", ""],
      ["text that is no JSON", "not json at all"],
      ["a JSON list", "[]"],
      ["null", "null"],
      ["an object with no results", '{"total": 3, "start": 0}'],
      ["results that are no list", '{"total": 1, "start": 0, "results": {"link": "/a"}}'],
      ["a total that is no count", '{"total": "3", "start": 0, "results": []}'],
      ["a negative total", '{"total": -1, "start": 0, "results": []}'],
    ])("for %s sent as JSON", async (_what, body) => {
      const files = { [urlOf(0)]: { body, contentType: JSON_TYPE } };
      expect(await failure(files)).toBeInstanceOf(NotTheListError);
    });

    it("for results that are no objects or have no link of the site", async () => {
      for (const results of [
        [...plainDocs().map(resultOf), "a string"],
        [...plainDocs().map(resultOf), null],
        [...plainDocs().map(resultOf), { title: "no link" }],
        [...plainDocs().map(resultOf), { title: "x", link: 7 }],
        [...plainDocs().map(resultOf), { title: "x", link: "no-slash" }],
      ]) {
        const files = {
          [urlOf(0)]: { body: pageText(results, results.length, 0), contentType: JSON_TYPE },
        };
        expect(await failure(files)).toBeInstanceOf(NotTheListError);
      }
    });

    it("for a page that says it begins elsewhere than at 0", async () => {
      const results = GOOD.map(resultOf);
      const files = {
        [urlOf(0)]: { body: pageText(results, results.length, 5), contentType: JSON_TYPE },
      };
      expect(await failure(files)).toBeInstanceOf(NotTheListError);
    });
  });

  describe("a download that fails", () => {
    const failure = async (files: Record<string, FakeFile>) =>
      failureOf(ukOfsiConnector.download(fakeFetch(files), {}));

    it("is too large when the page was cut at its limit, whatever it holds", async () => {
      expect(await failure(filesOf(GOOD, { truncated: true }))).toBeInstanceOf(BodyTooLargeError);
      const text = pageText(GOOD.map(resultOf), GOOD.length, 0);
      const filler = Buffer.alloc(4 * MIB + 1 - Buffer.byteLength(text), 0x20);
      const over = { body: Buffer.concat([Buffer.from(text), filler]), contentType: JSON_TYPE };
      expect(await failure({ [urlOf(0)]: over })).toBeInstanceOf(BodyTooLargeError);
    });

    it("is not allowed when the answer comes from another host, another path, or by plain http", async () => {
      const answers = [
        "https://evil.example.org/api/search.json",
        "https://gov.uk/api/search.json",
        "https://www.gov.uk.evil.example/api/search.json",
        "https://www.gov.uk/other/search.json",
        "https://www.gov.uk/apix/search.json",
        "http://www.gov.uk/api/search.json",
        "https://user:pass@www.gov.uk/api/search.json",
        "https://www.gov.uk:8443/api/search.json",
      ];
      for (const url of answers) {
        const error = await failure(filesOf(GOOD, { url }));
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).reason).toBe("not_allowed");
        expect((error as FetchError).message).not.toContain("evil");
        expect((error as FetchError).message).not.toContain("pass");
      }
    });

    it("is read from a redirect that stays under the pin", async () => {
      const snapshot = await downloadOf(
        filesOf(GOOD, { url: "https://www.gov.uk/api/search.json?other=1" }),
      );
      expect(bodyOf(snapshot).rows).toHaveLength(PARTIES.length);
    });

    it("is refused for a type that is not JSON, without a word of what it holds", async () => {
      const error = await failure(filesOf(GOOD, { contentType: "text/html" }));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unsupported_type");
    });

    it("fails as a 304 from the pin does: nothing was sent that a 304 could answer", async () => {
      const notModified: ConnectorFetch = async () => ({ notModified: true, url: urlOf(0) });
      const error = await failureOf(
        ukOfsiConnector.download(notModified, {
          etag: `k${ukOfsiConnector.version}:`,
          lastModified: null,
        }),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unreachable");
    });

    it("fails as not allowed for a 304 from another host", async () => {
      const notModified: ConnectorFetch = async () => ({
        notModified: true,
        url: "https://evil.example.org/api/search.json",
      });
      const error = await failureOf(ukOfsiConnector.download(notModified, {}));
      expect((error as FetchError).reason).toBe("not_allowed");
    });

    it("gives no list when the second page fails, however the first one was: never a shorter list", async () => {
      const docs = [...plainDocs(), ...otherDocs(987)];
      const inner = fakeFetch(filesOf(docs));
      const asked: string[] = [];
      const failing: ConnectorFetch = async (url, validators, limits) => {
        asked.push(url);
        if (url === urlOf(1000))
          throw new FetchError("blocked_by_site", undefined, { status: 429 });
        return inner(url, validators, limits);
      };
      const error = await failureOf(
        createUkOfsiConnector({ sleep: sleeping() }).download(failing, {}),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).status).toBe(429);
      expect(asked).toEqual([urlOf(0), urlOf(1000)]);
    });

    it("gives no list when the second page is missing", async () => {
      const files = filesOf([...plainDocs(), ...otherDocs(987)]);
      delete files[urlOf(1000)];
      const error = await failureOf(
        createUkOfsiConnector({ sleep: sleeping() }).download(fakeFetch(files), {}),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unreachable");
    });

    it("gives no list when the second page is not the one that was asked: a search that moved", async () => {
      const docs = [...plainDocs(), ...otherDocs(987)];
      const files = filesOf(docs);
      // The second page says it begins where the first begins.
      files[urlOf(1000)] = {
        body: pageText(docs.slice(1000).map(resultOf), docs.length, 0),
        contentType: JSON_TYPE,
      };
      const error = await failureOf(
        createUkOfsiConnector({ sleep: sleeping() }).download(fakeFetch(files), {}),
      );
      expect(error).toBeInstanceOf(NotTheListError);
    });

    it("writes nothing to the console", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        await failure(filesOf(GOOD, { url: "https://evil.example.org/api/search.json" }));
        await runOf(GOOD);
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });

  describe("a list that does not hold its own copy", () => {
    it("gives the same body whatever the order of the results, so that the hash of the sync tells that nothing changed", async () => {
      await expectDeterministic(ukOfsiConnector, (reversed) =>
        fakeFetch(filesOf(reversed ? [...GOOD].reverse() : GOOD)),
      );
    });

    it("gives the same body for notices of one party in any order", async () => {
      const docs = [
        ...plainDocs(12),
        penalty("example-bank-a", "Example Bank PLC", "2026-06-17T10:00:00Z"),
        penalty("example-bank-b", "Example Bank Limited", "2026-06-17T10:00:00Z"),
        penalty("example-bank-c", "Example Bank Ltd", "2026-06-17T09:00:00Z"),
        penalty("example-bank-d", "Example Bank Inc", "2026-06-17T08:00:00Z"),
      ];
      await expectDeterministic(ukOfsiConnector, (reversed) =>
        fakeFetch(filesOf(reversed ? [...docs].reverse() : docs)),
      );
    });

    it("gives the same body for the same list, again", async () => {
      const first = await runOf(GOOD);
      const second = await runOf(GOOD);
      expect(second.snapshot.bodies).toEqual(first.snapshot.bodies);
      expect(second.snapshot.bytes).toBe(first.snapshot.bytes);
    });

    it("counts the bytes of the pages that it downloaded", async () => {
      const files = filesOf(GOOD);
      const snapshot = await downloadOf(files);
      expect(snapshot.bytes).toBe(Buffer.byteLength(files[urlOf(0)].body as string));
    });
  });

  describe("what never reaches a snapshot or a record", () => {
    it("leaves out the description of a notice, the fields that are not asked for and every other document", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(10),
        notice("example-date", "Disclosure notice: 08 September 2025", "2025-09-08T12:10:16Z", {
          description: `Disclosure notice of an offence under financial sanctions by Example Credit Limited(ECL) ${EN_DASH} failing to respond ${LEFT_OUT.tail}\r\n\r\n`,
        }),
        notice(
          "example-with-extras",
          "Imposition of monetary penalty: Example Debit Limited",
          "2025-02-08T12:10:16Z",
          {
            extra: {
              medical_specialism: ["ZZ-SPECIALISM"],
              alert_type: ["ZZ-ALERT-TYPE"],
              organisations: [{ title: "ZZ-ORGANISATION" }],
              _id: "ZZ-ID-OF-THE-INDEX",
            },
          },
        ),
        ...otherDocs(30),
      ]);
      expect(parsed.records.length).toBeGreaterThanOrEqual(12);
      const everything = `${snapshot.bodies.join("")}${JSON.stringify(parsed)}`;
      expect(everything).not.toContain("ZZ-");
      expect(everything).toContain("Example Credit Limited");
      expect(everything).toContain("Example Debit Limited");
    });

    it("leaves out the text after the party in a description, whatever the notice's title says", async () => {
      const { snapshot } = await runOf([
        ...plainDocs(12),
        notice("example-tail", "Disclosure notice: 08 September 2025", "2025-09-08T12:10:16Z", {
          description: `Disclosure notice of an offence under financial sanctions by Example Credit Limited ${EN_DASH} ${LEFT_OUT.tail} and more words of a third party`,
        }),
      ]);
      expect(snapshot.bodies[0]).not.toContain(LEFT_OUT.tail);
      expect(snapshot.bodies[0]).not.toContain("third party");
    });

    it("writes into the body the parties only, and the notices' links, titles, kinds and days", async () => {
      const { snapshot } = await runOf(GOOD);
      const [row] = bodyOf(snapshot).rows;
      expect(Object.keys(row).sort()).toEqual(
        ["count", "displayName", "items", "key", "newest", "spellings"].sort(),
      );
      expect(Object.keys(row.items[0]).sort()).toEqual(["date", "kind", "link", "title"]);
    });
  });

  describe("a notice that cannot be read", () => {
    const BAD_TITLE = "Imposition of monetary penalty on Example Debit Limited";

    it("is counted, and the list is read without it while the count is within what a list may lose", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(),
        penalty("example-bad-time", "Winterbourne Example Limited", "yesterday"),
        notice("example-bad", BAD_TITLE, "2026-01-01T10:00:00Z"),
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(2);
      expect(parsed.skipped).toBe(2);
      expect(parsed.errors).toBe(0);
      expect(parsed.records).toHaveLength(PARTIES.length);
    });

    it("fails the sync when more are lost than a list may lose: the shape of the titles has changed", async () => {
      const bad = [1, 2, 3].map((at) =>
        notice(`example-bad-${at}`, `${BAD_TITLE} ${at}`, "2026-01-01T10:00:00Z"),
      );
      const { parsed } = await runOf([...plainDocs(), ...bad]);
      expect(parsed.errors).toBe(3);
      expect(parsed.skipped).toBe(0);
    });

    it("is not counted when the title is of no notice that names a party", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(),
        notice("example-joint-1", "Example Task Force joint statement", "2026-01-01T10:00:00Z"),
        notice("example-joint-2", "Another statement of a task force", "2026-01-02T10:00:00Z"),
        notice("example-joint-3", "A third statement", "2026-01-03T10:00:00Z"),
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
    });

    it("is not counted when it is a document of another type, whatever its title is", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(),
        {
          type: "guidance",
          title: BAD_TITLE,
          link: slugOf("example-guidance-bad"),
          at: "2026-01-01T10:00:00Z",
        },
        {
          type: "news_story",
          title: "Disclosure notice",
          link: slugOf("example-news-bad"),
          at: "2026-01-02T10:00:00Z",
        },
        {
          type: "Notice",
          title: BAD_TITLE,
          link: slugOf("example-capital-bad"),
          at: "2026-01-03T10:00:00Z",
        },
        {
          title: BAD_TITLE,
          link: slugOf("example-no-type"),
          at: "2026-01-04T10:00:00Z",
          extra: { content_store_document_type: undefined },
        },
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(parsed.errors).toBe(0);
    });

    it("is counted when its link is not a page of the publications, is too long, or its time is no time", async () => {
      const docs = (over: Partial<Doc>): Doc[] => [
        ...plainDocs(),
        penalty("example-bad-field", "Winterbourne Example Limited", "2026-01-01T10:00:00Z", over),
      ];
      for (const over of [
        { link: "/government/news/example-notice" },
        { link: "/government/publications" },
        { link: "/government/publications/" },
        { link: `/government/publications/${"a".repeat(200)}` },
        // One more than the longest link that is read.
        {
          link: `/government/publications/${"a".repeat(201 - "/government/publications/".length)}`,
        },
        { link: "/government/publications/example bad" },
        { link: `/government/publications/example${cp(0x07)}bad` },
        { link: `/government/publications/example${cp(0x200b)}bad` },
        { link: `/government/publications/example${cp(0xd800)}bad` },
        { at: "2026-01-01" },
        { at: "yesterday" },
        { at: "2026-13-01T10:00:00Z" },
      ]) {
        const { snapshot, parsed } = await runOf(docs(over));
        expect(bodyOf(snapshot).unreadable).toBe(1);
        expect(idsOf(parsed)).not.toContain("ofsi:winterbourneexample");
      }
      // A link of 200 characters is the longest that is read.
      const longest = `/government/publications/${"a".repeat(200 - "/government/publications/".length)}`;
      expect(longest).toHaveLength(200);
      const { snapshot } = await runOf(docs({ link: longest }));
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("is counted when a result of the type notice has no text for a title", async () => {
      const results = [
        ...plainDocs().map(resultOf),
        {
          ...resultOf(penalty("example-no-title", "X Ltd", "2026-01-01T10:00:00Z")),
          title: undefined,
        },
      ];
      const snapshot = await downloadOf(filesOfResults(results));
      expect(bodyOf(snapshot).unreadable).toBe(1);
    });
  });

  describe("an entry of the list that the record builder refuses", () => {
    // A quote is clean to the reader of the list and no character of an address that the builder stores.
    const bad = (count: number): Doc[] =>
      Array.from({ length: count }, (_, at) =>
        penalty(
          `example"bad-${at}`,
          `Winterbourne${"I".repeat(at + 1)} Example Limited`,
          "2026-01-01T10:00:00Z",
        ),
      );

    it("is counted as skipped while the count is within the allowance, and as an error beyond it", async () => {
      const some = await runOf([...plainDocs(), ...bad(2)]);
      expect(bodyOf(some.snapshot).unreadable).toBe(0);
      expect(bodyOf(some.snapshot).rows).toHaveLength(PARTIES.length + 2);
      expect(some.parsed.skipped).toBe(2);
      expect(some.parsed.errors).toBe(0);
      expect(some.parsed.records).toHaveLength(PARTIES.length);

      const many = await runOf([...plainDocs(), ...bad(3)]);
      expect(many.parsed.errors).toBe(3);
      expect(many.parsed.skipped).toBe(0);
    });

    it("is counted for a row of the body that holds no notice, which no download makes", () => {
      const row = (key: string) => ({
        key,
        displayName: `Example ${key}`,
        spellings: [`Example ${key}`],
        count: 1,
        items: [{ link: slugOf(key), title: "Notice", kind: "disclosure", date: "2026-01-01" }],
        newest: "2026-01-01",
      });
      const rows = Array.from({ length: 20 }, (_, at) => row(`partyofnumber${at}`));
      const body = (list: unknown[]): string =>
        JSON.stringify({ v: 1, rows: list, total: list.length, unreadable: 0 });
      const make = (list: unknown[]) =>
        ukOfsiConnector.parse({ bodies: [body(list)], etag: null, lastModified: null, bytes: 0 });

      expect(make(rows)).toMatchObject({ errors: 0, skipped: 0 });
      expect(make(rows).records).toHaveLength(20);
      const empty = make([...rows, { ...row("partywithnonotice"), items: [], count: 0 }]);
      expect(empty.records).toHaveLength(20);
      expect(empty.skipped).toBe(1);
      expect(empty.errors).toBe(0);
    });
  });

  describe("a title that is hostile", () => {
    const hostile = async (party: string, extra: Partial<Doc> = {}) =>
      runOf([...plainDocs(), penalty("example-hostile", party, "2026-01-01T10:00:00Z", extra)]);

    it("loses its control characters, the characters nobody sees and the direction marks", async () => {
      const { parsed, snapshot } = await hostile(
        `Winterbourne${cp(0x07)} Example${cp(0)} ${cp(0x202e)}Limited${cp(0x200b, 0xfeff)}`,
      );
      const record = recordOfId(parsed, "ofsi:winterbourneexample");
      expect(record.summary).toContain("Party as written: Winterbourne Example Limited.");
      expect(record.title).toBe("OFSI notice: Winterbourne Example Limited");
      expectWellFormedRecords(parsed.records, { sourceId: "uk_ofsi", mark: MARK });
      // JSON writes a control character as an escape, but a hidden character of any kind would show as it is.
      expect(snapshot.bodies[0]).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    });

    it("is not a party when it holds markup: no record names the script", async () => {
      const { parsed, snapshot } = await hostile("<script>alert(1)</script> Winterbourne Limited");
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(JSON.stringify(parsed.records)).not.toContain("script");
      expect(snapshot.bodies[0]).not.toContain("script");
      expectWellFormedRecords(parsed.records, { sourceId: "uk_ofsi", mark: MARK });
    });

    it("is not a party when its markup is written in the full-width forms that a fold makes angle brackets", async () => {
      const { snapshot } = await hostile(`${cp(0xff1c)}script${cp(0xff1e)} Winterbourne Limited`);
      expect(bodyOf(snapshot).unreadable).toBe(1);
    });

    it("is replaced where a half of a surrogate pair stands alone", async () => {
      const { parsed, snapshot } = await hostile(`Winterbourne ${cp(0xd800)} Example Limited`);
      expect(parsed.records.length).toBeGreaterThan(PARTIES.length - 1);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_ofsi", mark: MARK });
      expect(snapshot.bodies[0]).not.toMatch(/[\ud800-\udfff]/u);
    });

    it("is not read when it is 100 KB long: it is no title, and is counted", async () => {
      const { parsed, snapshot } = await hostile("W".repeat(100_000));
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(parsed.records).toHaveLength(PARTIES.length);
      expect(snapshot.bytes).toBeGreaterThan(100_000);
      expect(snapshot.bodies[0].length).toBeLessThan(20_000);
    });

    it("is not read when it is only blanks and hidden characters", async () => {
      const { snapshot } = await hostile(`${cp(0x200b)}   ${cp(0x2800)}`);
      expect(bodyOf(snapshot).unreadable).toBe(1);
    });

    it("keeps the full-width letters as the letters they fold to", async () => {
      const { parsed } = await hostile(`${cp(0xff37, 0xff49, 0xff4e)}terbourne Example Limited`);
      expect(idsOf(parsed)).toContain("ofsi:winterbourneexample");
    });

    it("cannot make a hostile description a party: it is read only for a title with a date", async () => {
      const { parsed, snapshot } = await runOf([
        ...plainDocs(),
        notice(
          "example-hostile-date",
          "Disclosure notice: 08 September 2025",
          "2026-01-01T10:00:00Z",
          {
            description: `Disclosure notice of an offence under financial sanctions by <img src=x onerror=alert(1)> ${cp(0x202e)}Limited`,
          },
        ),
      ]);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(snapshot.bodies[0]).not.toContain("onerror");
      expect(JSON.stringify(parsed.records)).not.toContain("onerror");
    });

    it("is read without a blow-up of the time, whatever its shape, as long as the cell is cut at its limit", async () => {
      const start = Date.now();
      for (const party of [
        "(".repeat(150),
        ` (${"A".repeat(8)})`.repeat(15),
        "A ".repeat(75),
        ", ".repeat(75),
        " and ".repeat(30),
        "- ".repeat(75),
      ]) {
        ofsiReadingOf(`Imposition of monetary penalty: ${party}`, "");
        ofsiReadingOf(
          "Disclosure notice: 08 September 2025",
          `Disclosure notice of an offence under financial sanctions by ${party}`,
        );
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });

    it("reads a word of one-capital parts that fails at its end in time that does not double for each part", () => {
      // `A-A-...-A1`: a pattern with two ways to match a lone capital doubles its work for each part
      // (30 parts take it about 20 s, 34 parts sixteen times as long, and the 70 that a party may hold
      // would never end): the guard takes 34, so that a runner twice as fast as the one that measured it still
      // fails the pattern that doubles, within the bound of 10 s.
      const start = Date.now();
      for (const word of [
        `${"A-".repeat(34)}A1`,
        `${"A'".repeat(34)}A1`,
        // A capital that holds a combining mark, which no composed letter replaces.
        `${`${cp(0x1eb8, 0x301)}-`.repeat(34)}A1`,
      ]) {
        expect(ofsiReadingOf(`Imposition of monetary penalty: Casey ${word}`, "")).toEqual({
          shape: "notice",
          kind: "monetary penalty",
          parties: [`Casey ${word}`],
          persons: 0,
        });
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });

    it("is read without a blow-up of the time when it is made of the joiners, the markers, the brackets and the roles of the person rule", () => {
      const TITLE_ROOM = 300 - "Imposition of monetary penalty: ".length;
      const DESCRIPTION_ROOM =
        1_000 - "Disclosure notice of an offence under financial sanctions by ".length;
      const filled = (unit: string, room: number): string =>
        unit.repeat(Math.max(1, Math.floor(room / unit.length)));
      const start = Date.now();
      for (const unit of [
        "A & ",
        "Ab / ",
        "A; ",
        "A with ",
        "A, and ",
        "A, ",
        "A and ",
        "Casey Sample t/a ",
        "A trading as ",
        "A TRADING UNDER ",
        "Casey (Sample) ",
        "(",
        ")",
        "( ",
        "Casey Sample (Ab Cd) & ",
        ", owner",
        " - a",
        ", the owner - director",
        "its ",
        "its a ",
        "Mr. ",
        "Mr. Dr. ",
        "Jr. ",
        "St. ",
        "de ",
        "la y ",
        "Mc",
        "DeD-",
      ]) {
        const title = `Examplecorp Limited and ${filled(unit, TITLE_ROOM - 40)}Casey Sample`;
        ofsiReadingOf(`Imposition of monetary penalty: ${title}`, "");
        ofsiReadingOf(`Disclosure notice: ${filled(unit, TITLE_ROOM)}`, "");
        ofsiReadingOf(
          "Disclosure notice: 08 September 2025",
          `Disclosure notice of an offence under financial sanctions by Examplecorp Limited and ${filled(unit, DESCRIPTION_ROOM - 40)}Casey Sample`,
        );
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });

    it("is read without a blow-up of the time when a megabyte is made of the title words and the suffixes that no dot closes", () => {
      const MEGABYTE = 1_000_000;
      const TITLE_ROOM = 300 - "Imposition of monetary penalty: ".length;
      const filled = (unit: string, room: number): string =>
        unit.repeat(Math.max(1, Math.floor(room / unit.length)));
      const start = Date.now();
      for (const unit of [
        "jr ",
        "st ",
        "mr ",
        "dr prof ",
        "its owner mr ",
        "iii ",
        "a ",
        "Sample jr ",
      ]) {
        // A megabyte as a title and as a description, which no reading may take in whole.
        const huge = unit.repeat(Math.ceil(MEGABYTE / unit.length));
        ofsiReadingOf(`Imposition of monetary penalty: ${huge}`, "");
        ofsiReadingOf(
          "Disclosure notice: 08 September 2025",
          `Disclosure notice of an offence under financial sanctions by ${huge}`,
        );
        // As much as a title may hold, which is read in whole, with a name before and after it.
        ofsiReadingOf(
          `Imposition of monetary penalty: ${filled(unit, TITLE_ROOM)}Casey Sample`,
          "",
        );
        ofsiReadingOf(
          `Imposition of monetary penalty: Casey Sample ${filled(unit, TITLE_ROOM - 40)}`,
          "",
        );
      }
      // A word of a megabyte of letters, as the party of a notice: a notice that is too long is
      // unreadable, and that is decided before any word is looked at.
      for (const word of [
        "a".repeat(MEGABYTE),
        `${"a".repeat(MEGABYTE)}1`,
        `${"a".repeat(MEGABYTE)}.`,
        `${"a".repeat(MEGABYTE)}..`,
        `${"j".repeat(MEGABYTE)}r.`,
      ]) {
        expect(ofsiReadingOf(`Imposition of monetary penalty: Casey ${word}`, "")).toEqual({
          shape: "unreadable",
        });
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });

    it("is read without a blow-up of the time when a megabyte is made of the legal forms and the roles that a tail may hold", () => {
      const MEGABYTE = 1_000_000;
      const TITLE_ROOM = 300 - "Imposition of monetary penalty: ".length;
      // The longest party that is read, which the person rule reads word by word.
      const PARTY_ROOM = 150 - "Casey Sample".length;
      const filled = (unit: string, room: number): string =>
        unit.repeat(Math.max(1, Math.floor(room / unit.length)));
      const start = Date.now();
      for (const unit of [
        ", ltd",
        " - ltd",
        ", co",
        " - co",
        " ltd",
        ", owner - director ltd",
        ", ltd, owner",
        ", owner, ltd",
        " - the owner - as director - co",
        ", corp and others",
        ", owner of the company",
        ", co ltd",
        " - pty ltd",
        ", s a",
        " - l l c",
        ", co pty ltd inc",
        ", ltd owner",
        ", owner of ltd",
        ", s a s a s a",
      ]) {
        // A megabyte as a title and as a description, which no reading may take in whole.
        const huge = unit.repeat(Math.ceil(MEGABYTE / unit.length));
        ofsiReadingOf(`Imposition of monetary penalty: Casey Sample${huge}`, "");
        ofsiReadingOf(
          "Disclosure notice: 08 September 2025",
          `Disclosure notice of an offence under financial sanctions by Casey Sample${huge}`,
        );
        // The longest party, and as much as a title or a description may hold, read in whole.
        ofsiReadingOf(
          `Imposition of monetary penalty: Casey Sample${filled(unit, PARTY_ROOM)}`,
          "",
        );
        ofsiReadingOf(
          `Imposition of monetary penalty: Examplecorp Limited and Casey Sample${filled(unit, TITLE_ROOM - 60)}`,
          "",
        );
        ofsiReadingOf(
          "Disclosure notice: 08 September 2025",
          `Disclosure notice of an offence under financial sanctions by Casey Sample${filled(unit, 900)}`,
        );
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });

    it("never lets the pattern of a role see more than a party of 150 units: the cap comes first", () => {
      // The pattern that takes a role off the end of a party (TRAILING_ROLE) is quadratic in the length of a
      // run of ` - a` that fails at its end: every dash starts a match that runs to the end and gives up word
      // by word. It is safe because `partyOf` caps what `withoutRole` is given at PARTY_MAX units, and a title
      // or a description that does not fit is refused before it is cut into cells. Measured: a megabyte title
      // and a megabyte description take about 30 ms together, and the longest party that is read 0.04 ms.
      const MEGABYTE = 1_000_000;
      const PARTY_MAX = 150;
      const NAME_ROOM = "Casey Sample".length;
      const fill = (unit: string, length: number): string =>
        unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
      const start = Date.now();
      for (const unit of [
        " - a",
        ", a a a",
        " - a a",
        ", a",
        " - a - a",
        " - a b - c d",
        ", a - a",
      ]) {
        // A megabyte as a title and as a description is refused before any role is looked at.
        const huge = `Casey Sample${unit.repeat(Math.ceil(MEGABYTE / unit.length))}1`;
        expect(ofsiReadingOf(`${PENALTY_OF}${huge}`, "")).toEqual({ shape: "unreadable" });
        expect(ofsiReadingOf(DATE_TITLE_OF, `${BY_OF} ${huge}`)).toEqual({ shape: "unreadable" });
        // The longest party is read in whole, which is the worst that the pattern ever sees...
        const longest = `Casey Sample${fill(unit, PARTY_MAX - NAME_ROOM - 1)}1`;
        expect(longest).toHaveLength(PARTY_MAX);
        for (let repeat = 0; repeat < 200; repeat += 1) {
          expect(ofsiReadingOf(`${PENALTY_OF}${longest}`, "").shape).toBe("notice");
        }
        ofsiReadingOf(DATE_TITLE_OF, `${BY_OF} ${longest}`);
        // ...and one unit more is refused: the cap is what stands before the pattern.
        expect(ofsiReadingOf(`${PENALTY_OF}${longest}x`, "")).toEqual({ shape: "unreadable" });
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });

    it("is read without a blow-up of the time, whatever its shape, as a description of 100 KB", () => {
      const start = Date.now();
      for (const cell of [
        ` ${EN_DASH} `.repeat(34_000),
        "(AB) ".repeat(20_000),
        "A, ".repeat(34_000),
        "x".repeat(100_000),
      ]) {
        ofsiReadingOf(
          "Disclosure notice: 08 September 2025",
          `Disclosure notice of an offence under financial sanctions by ${cell}`,
        );
      }
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    });
  });

  describe("the worst case of a record", () => {
    // A party of the longest name that is read, and four notices of both kinds with titles longer than a record shows.
    // 120 letters in 23 words that hyphens join, and the legal form: 150 units, and a key of 120 characters, the longest.
    const WORST_PARTY = `${Array.from({ length: 23 }, (_, at) => "W".repeat(at < 5 ? 6 : 5)).join("-")} Limited`;
    // The key is the compact name without its legal form, and it is never cut: this one is whole.
    const WORST_ID = `ofsi:${"w".repeat(120)}`;
    const WORST: Doc[] = [
      notice(
        "example-worst-1",
        `Imposition of monetary penalty: ${WORST_PARTY}`,
        "2026-06-17T10:00:00Z",
      ),
      notice("example-worst-2", `Disclosure notice: ${WORST_PARTY}`, "2026-05-17T10:00:00Z"),
      notice(
        "example-worst-3",
        `Imposition of monetary penalty: ${WORST_PARTY}`,
        "2026-04-17T10:00:00Z",
      ),
      notice("example-worst-4", `Disclosure notice: ${WORST_PARTY}`, "2026-03-17T10:00:00Z"),
    ];

    it("is within the worst case of 1,103 characters, whole in its party and its closing sentence", async () => {
      expect(WORST_PARTY).toHaveLength(150);
      const { parsed } = await runOf([...plainDocs(12), ...WORST]);
      expectWellFormedRecords(parsed.records, { sourceId: "uk_ofsi", mark: MARK });
      const record = recordOfId(parsed, WORST_ID);
      expect(record.summary.length).toBeLessThanOrEqual(1_103);
      expect(record.summary).toContain(`Party as written: ${WORST_PARTY}.`);
      expect(record.summary).toContain(S2);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.title).toBe(`OFSI notice: ${WORST_PARTY}`);
      // Four notices, the newest three shown, each title cut to 120 characters with the mark of a cut.
      expect(record.summary).toContain("Notices: 4; newest: ");
      expect(record.summary.match(/ \[shortened\]/g)).toHaveLength(3);
      expect(record.summary).toContain("(monetary penalty, 2026-06-17)");
      expect(record.summary).toContain("(disclosure, 2026-05-17)");
      expect(record.summary).toContain("(monetary penalty, 2026-04-17)");
      expect(record.summary).not.toContain("2026-03-17");
    });

    it("keeps every record of a list within the limits of the columns", async () => {
      const { parsed } = await runOf([...GOOD, ...WORST]);
      for (const record of parsed.records) {
        expect(record.summary.length).toBeLessThanOrEqual(1_300);
        expect(record.summary.endsWith(CLOSING)).toBe(true);
        expect(record.title.length).toBeLessThanOrEqual(200);
        expect(record.sourceRecordId.length).toBeLessThanOrEqual(200);
      }
    });

    it("writes the sentences in this order: what the list is, what a notice is, the party, the notices, the credit", async () => {
      const { parsed } = await runOf(GOOD);
      for (const record of parsed.records) {
        const at = (text: string): number => record.summary.indexOf(text);
        expect(at(S1)).toBe(0);
        expect(at(S2)).toBeGreaterThan(at(S1));
        expect(at("Party as written:")).toBeGreaterThan(at(S2));
        expect(at("Notices:")).toBeGreaterThan(at("Party as written:"));
        expect(at(CLOSING)).toBeGreaterThan(at("Notices:"));
      }
    });
  });

  describe("the size of the list", () => {
    it("is read without a blow-up of the time at the size of the real list", async () => {
      const docs = [...plainDocs(), ...otherDocs(235)];
      const start = Date.now();
      await runOf(docs);
      expect(Date.now() - start).toBeLessThan(BLOW_UP_MS);
    }, 30_000);
  });

  describe("the bodies that a snapshot may hold", () => {
    it("is no list when the body is not the one that a download made", () => {
      for (const body of ["not json", "{}", '{"v":2,"rows":[],"total":0,"unreadable":0}', "[]"]) {
        const parsed = ukOfsiConnector.parse({
          bodies: [body],
          etag: null,
          lastModified: null,
          bytes: 0,
        });
        expect(parsed.root).toBeNull();
        expect(parsed.errors).toBe(1);
      }
      expect(
        ukOfsiConnector.parse({ bodies: [], etag: null, lastModified: null, bytes: 0 }).root,
      ).toBeNull();
    });
  });
});
