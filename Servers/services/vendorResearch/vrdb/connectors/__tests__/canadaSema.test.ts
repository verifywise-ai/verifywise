/**
 * The Consolidated Canadian Autonomous Sanctions List (Global Affairs Canada, the SEMA list) as a
 * mirrored list of the vendor risk database: one XML file whose `record` elements are individuals,
 * ships and entities, read into one record per ENTITY. The file is synthetic: it copies the shape of
 * the list (the bilingual element names, the CRLF and the tabs, the order of the elements that
 * differs from record to record, a regulation written "Russia / Russie") with every name, number and
 * text invented. Every field of an individual or a ship holds a token that starts with `ZZ-`, so
 * that a copy of it anywhere in a body or a record is found. The floors of the reader (3,000
 * records, 1,000 entities) make the base file 3,100 records long, built by a function. Every
 * character that is hard to type is written as an escape.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import { CANADA_SEMA_RECORD_MARK, type SemaEntity, canadaSemaConnector } from "../canadaSema";
import { LINE_INPUT_MAX, unreadableAllowed } from "../kit/clean";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError, type Snapshot } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const FILE_DIRECTORY =
  "/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/";
const FILE_URL = `https://www.international.gc.ca${FILE_DIRECTORY}sema-lmes.xml`;
const DOCUMENTATION_URL =
  "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng";
const MARK = CANADA_SEMA_RECORD_MARK;
const HOST_SENTENCE = `${MARK} (international.gc.ca), a sanctions list.`;
const CLOSING =
  "Global Affairs Canada states that the list is for administrative purposes only, is not a " +
  "regulation, has no force of law and may not be up to date; an entry names an entity, which may " +
  "be another company of the same name. Contains information licensed under the Open Government " +
  "Licence - Canada; adapted by VerifyWise.";
const MIB = 1024 * 1024;

/** The names of the elements of a record, as the file writes them. */
const TAG = {
  country: "Country-Pays",
  name: "EntityOrShip-EntiteOuNavire",
  aliases: "Aliases-Alias",
  schedule: "Schedule-Annexe",
  item: "Item-NumeroDarticle",
  day: "DateOfListing-DateDinscription",
  given: "GivenName-Prenom",
  last: "LastName-NomDeFamille",
  born: "DateOfBirthOrShipBuildDate-DateDeNaissanceOuDateDeConstructionDuNavire",
  title: "TitleOrShipType-TitreOuTypeDeNavire",
  imo: "ShipIMONumber-NumeroOMIDuNavire",
};

/** The tokens of the fields that the connector leaves out: no record and no body may hold one. */
const LEFT_OUT = "ZZ-";

/** A name of letters only, of a fixed width: 0 is `aaa`, 1 is `aab`. */
function letters(n: number, width = 3): string {
  let text = "";
  let rest = n;
  for (let at = 0; at < width; at += 1) {
    text = String.fromCharCode(97 + (rest % 26)) + text;
    rest = Math.floor(rest / 26);
  }
  return text;
}

/** Cyrillic text, as the aliases of the list are mostly written. */
const cyrillic = (n: number): string => `Пример ${n}`;

/**
 * A text of `length` units with `middle` at the unit `at` (a blank, or the two units of a pair of
 * surrogates): the prefix, letters, `middle`, letters. For a cap, a check that asks `lineOf(text,
 * cap + 1)` of a text of more than `cap + 1` units gets a cut that keeps `cap - 11` units; with `at`
 * of `cap - 12` the cut loses the blank at the end of them, or backs off from the half of a pair that
 * it would split, and leaves a cut line of `cap` units that ends in the marker: a check that compares
 * its length with `cap` takes it for a text that fits.
 */
const cutShape = (prefix: string, at: number, middle: string, length: number): string => {
  const head = `${prefix}${"x".repeat(at - prefix.length)}`;
  return `${head}${middle}${"y".repeat(length - head.length - middle.length)}`;
};
const PAIR = String.fromCodePoint(0x1f600);
/** The units around the one where the cut of a text for a cap falls: `cap - 13` to `cap - 8`. */
const around = (cap: number): number[] => [-13, -12, -11, -10, -9, -8].map((delta) => cap + delta);

// ---------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------

type Cell = readonly [tag: string, value: string];

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cellXml = ([tag, value]: Cell): string => `\t\t<${tag}>${escapeXml(value)}</${tag}>\r\n`;
const recordXml = (cells: readonly Cell[]): string =>
  `\t<record>\r\n${cells.map(cellXml).join("")}\t</record>\r\n`;
/** A record as it is, with the text of its cells not escaped: for a test of the scanner. */
const rawRecordXml = (inner: string): string => `\t<record>\r\n${inner}\t</record>\r\n`;

const documentXml = (records: readonly string[], root = "data-set", doctype = ""): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\r\n${doctype}<${root} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
  `xsi:noNamespaceSchemaLocation="https://example.invalid/sema.xsd">\r\n${records.join("")}</${root}>\r\n`;

interface EntitySpec {
  name: string;
  /** The text of the element; null leaves the element out. */
  country?: string | null;
  aliases?: string | null;
  schedule?: string | null;
  item?: string | null;
  day?: string | null;
  /** Writes the elements in another order: the aliases first, the day before the item. */
  turned?: boolean;
  /** Elements that are added at the end. */
  extra?: Cell[];
}

function entityCells(spec: EntitySpec): Cell[] {
  const optional = (
    tag: string,
    value: string | null | undefined,
    fallback: string | null,
  ): Cell[] => {
    const text = value === undefined ? fallback : value;
    return text === null ? [] : [[tag, text]];
  };
  const country = optional(TAG.country, spec.country, "Russia / Russie");
  const name: Cell[] = [[TAG.name, spec.name]];
  const aliases = optional(TAG.aliases, spec.aliases, null);
  const schedule = optional(TAG.schedule, spec.schedule, "1, Part 3");
  const item = optional(TAG.item, spec.item, "12");
  const day = optional(TAG.day, spec.day, "2022-03-04");
  const cells = spec.turned
    ? [...aliases, ...day, ...item, ...schedule, ...name, ...country]
    : [...country, ...name, ...aliases, ...schedule, ...item, ...day];
  return [...cells, ...(spec.extra ?? [])];
}

const entityXml = (spec: EntitySpec): string => recordXml(entityCells(spec));

const REGULATIONS = [
  "Russia / Russie",
  "Iran",
  "Myanmar (Burma) / Myanmar (Birmanie)",
  "Belarus / Bélarus",
];

/** An entity of the base file: its name is invented, and its listing is in 2012 or later. */
const baseEntity = (n: number, first: string): string =>
  entityXml({
    name: `Zorbex${letters(n)} Holdings Ltd`,
    country: REGULATIONS[n % REGULATIONS.length],
    aliases: n % 3 === 0 ? `Zorbex${letters(n)} Alias` : null,
    schedule: n % 5 === 0 ? null : n % 2 === 0 ? "1, Part 3" : "Part 3",
    item: String(1 + (n % 999)),
    day: n === 0 ? first : `${2012 + (n % 12)}-0${1 + (n % 9)}-1${n % 9}`,
    turned: n % 4 === 0,
  });

/** An individual: given name only, family name only, or both; the fields are all left out. */
const personXml = (i: number): string =>
  recordXml([
    [TAG.country, "Russia / Russie"],
    ...(i % 3 !== 2 ? ([[TAG.given, `${LEFT_OUT}GIVEN-${i}`]] as Cell[]) : []),
    ...(i % 3 !== 1 ? ([[TAG.last, `${LEFT_OUT}LAST-${i}`]] as Cell[]) : []),
    [TAG.born, `${LEFT_OUT}BORN-${i}`],
    [TAG.title, `${LEFT_OUT}TITLE-${i}`],
    [TAG.aliases, `${LEFT_OUT}PERSON-ALIAS-${i}; ${LEFT_OUT}PERSON-ALIAS-B-${i}`],
    [TAG.schedule, "1"],
    [TAG.item, String(1 + (i % 999))],
    [TAG.day, "1999-01-01"],
  ]);

/** A ship: its name sits in the same element as an entity's. */
const shipXml = (i: number): string =>
  recordXml([
    [TAG.country, "Russia / Russie"],
    [TAG.name, `${LEFT_OUT}SHIP-${i}`],
    [TAG.born, `${LEFT_OUT}BUILT-${i}`],
    [TAG.title, `${LEFT_OUT}SHIP-TYPE-${i}`],
    [TAG.imo, `${LEFT_OUT}IMO-${i}`],
    [TAG.schedule, "1"],
    [TAG.item, String(1 + (i % 999))],
    [TAG.day, "1999-01-01"],
  ]);

interface FileSpec {
  entities?: number;
  people?: number;
  ships?: number;
  /** The day the first entity was listed (the floor wants 2010-12-31 or earlier). */
  earliest?: string;
  /** Records that are added at the end, as they are written. */
  extra?: readonly string[];
  root?: string;
  doctype?: string;
  /** Writes the records in the opposite order. */
  reversed?: boolean;
}

/** The base file: 1,100 entities, 1,900 individuals and 100 ships: 3,100 records. */
function semaXml(spec: FileSpec = {}): string {
  const { entities = 1100, people = 1900, ships = 100, earliest = "2009-05-06" } = spec;
  const records = [
    ...Array.from({ length: entities }, (_, n) => baseEntity(n, earliest)),
    ...Array.from({ length: people }, (_, i) => personXml(i)),
    ...Array.from({ length: ships }, (_, i) => shipXml(i)),
    ...(spec.extra ?? []),
  ];
  return documentXml(spec.reversed ? records.reverse() : records, spec.root, spec.doctype);
}

const filesOf = (
  xml: string = semaXml(),
  over: Partial<FakeFile> = {},
): Record<string, FakeFile> => ({
  [FILE_URL]: { body: xml, contentType: "text/xml", ...over },
});

/** The base file with entities added. */
const withEntities = (...specs: EntitySpec[]): Record<string, FakeFile> =>
  filesOf(semaXml({ extra: specs.map(entityXml) }));

async function downloadOf(files: Record<string, FakeFile>): Promise<Snapshot> {
  const snapshot = await canadaSemaConnector.download(fakeFetch(files), {});
  if (snapshot === "unchanged") throw new Error("The fake fetch said that nothing changed.");
  return snapshot;
}

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

interface Body {
  v: number;
  rows: SemaEntity[];
  total: number;
  unreadable: number;
}

const bodyOf = (snapshot: Snapshot): Body => JSON.parse(snapshot.bodies[0]) as Body;
const rowOf = (snapshot: Snapshot, id: string): SemaEntity | undefined =>
  bodyOf(snapshot).rows.find((row) => row.id === id);
const recordOfId = (records: readonly ParsedRecord[], id: string): ParsedRecord | undefined =>
  records.find((record) => record.sourceRecordId === id);

async function recordsOf(files: Record<string, FakeFile>): Promise<ParsedRecord[]> {
  const parsed = canadaSemaConnector.parse(await downloadOf(files));
  expect(parsed.errors).toBe(0);
  return parsed.records;
}

describe("canadaSemaConnector", () => {
  describe("the connector", () => {
    it("is the snapshot connector of the list, at version 1", () => {
      expect(canadaSemaConnector.id).toBe("canada_sema");
      expect(canadaSemaConnector.version).toBe(1);
      expect(canadaSemaConnector.kind).toBeUndefined();
    });

    it("exports the mark that the analysis prompt names the list by", () => {
      expect(CANADA_SEMA_RECORD_MARK).toBe("Consolidated Canadian Autonomous Sanctions List");
    });
  });

  describe("download of the file", () => {
    it("asks the one file, with no validators the first time, and the limits of the list", async () => {
      const fetch = fakeFetch(filesOf());

      await canadaSemaConnector.download(fetch, {});

      expect(fetch.calls).toEqual([
        {
          url: FILE_URL,
          validators: {},
          limits: {
            maxBytes: 8 * MIB,
            allowedContentTypes: ["text/xml", "application/xml"],
            totalTimeoutMs: 120_000,
          },
        },
      ]);
    });

    it("gives one snapshot: the body, the etag behind the prefix of the version, the date and the bytes", async () => {
      const xml = semaXml();
      const snapshot = await downloadOf(
        filesOf(xml, { etag: '"abc"', lastModified: "Mon, 09 Nov 2026 11:14:00 GMT" }),
      );

      expect(snapshot.bodies).toHaveLength(1);
      expect(snapshot.etag).toBe('k1:"abc"');
      expect(snapshot.lastModified).toBe("Mon, 09 Nov 2026 11:14:00 GMT");
      expect(snapshot.bytes).toBe(Buffer.byteLength(xml));
    });

    it("sends the validators that the last download stored, and says unchanged on a 304", async () => {
      const files = filesOf(semaXml(), {
        etag: '"abc"',
        lastModified: "Mon, 09 Nov 2026 11:14:00 GMT",
      });
      const fetch = fakeFetch(files);

      const answer = await canadaSemaConnector.download(fetch, {
        etag: 'k1:"abc"',
        lastModified: "Mon, 09 Nov 2026 11:14:00 GMT",
      });

      expect(answer).toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({
        etag: '"abc"',
        lastModified: "Mon, 09 Nov 2026 11:14:00 GMT",
      });
    });

    it("sends no validator when the stored etag is of another version, so that the new reading parses the file", async () => {
      const fetch = fakeFetch(filesOf(semaXml(), { etag: '"abc"' }));

      for (const etag of ['"abc"', 'k2:"abc"', "k1", null]) {
        fetch.calls.length = 0;
        const answer = await canadaSemaConnector.download(fetch, { etag, lastModified: "x" });
        expect(answer).not.toBe("unchanged");
        expect(fetch.calls[0].validators).toEqual({});
      }
    });

    it.each([
      ["text/xml", "text/xml"],
      ["application/xml", "application/xml"],
      ["text/xml with a charset", "text/xml; charset=utf-8"],
      ["application/xml in capitals", "Application/XML"],
    ])("accepts the type %s", async (_name, contentType) => {
      const snapshot = await downloadOf(filesOf(semaXml(), { contentType }));
      expect(bodyOf(snapshot).rows.length).toBeGreaterThan(1000);
    });

    it.each(["text/html", "application/json", "application/octet-stream", "text/plain"])(
      "refuses the type %s as unsupported",
      async (contentType) => {
        const failure = await failureOf(
          canadaSemaConnector.download(fakeFetch(filesOf(semaXml(), { contentType })), {}),
        );
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unsupported_type");
      },
    );

    it("reads a file that begins with a byte order mark, as the kit's text of a file does", async () => {
      const snapshot = await downloadOf(filesOf(`\u{feff}${semaXml()}`));
      expect(bodyOf(snapshot).rows.length).toBeGreaterThan(1000);
    });

    it("lets the failures of the fetch through as they are", async () => {
      const failure = await failureOf(canadaSemaConnector.download(fakeFetch({}), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("fails as too large a file that was cut at its limit, and one longer than 8 MiB", async () => {
      expect(
        await failureOf(
          canadaSemaConnector.download(fakeFetch(filesOf(semaXml(), { truncated: true })), {}),
        ),
      ).toBeInstanceOf(BodyTooLargeError);
      expect(
        await failureOf(
          canadaSemaConnector.download(
            fakeFetch(filesOf(`${semaXml()}${" ".repeat(8 * MIB)}`)),
            {},
          ),
        ),
      ).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("where the answer comes from", () => {
    const REFUSED: Array<[string, string]> = [
      ["another host", "https://evil.example.net/sema-lmes.xml"],
      [
        "a host that only starts like the operator's",
        `https://www.international.gc.ca.attacker.net${FILE_DIRECTORY}sema-lmes.xml`,
      ],
      ["plain http", `http://www.international.gc.ca${FILE_DIRECTORY}sema-lmes.xml`],
      ["another port", `https://www.international.gc.ca:8443${FILE_DIRECTORY}sema-lmes.xml`],
      ["a user name", `https://user:secret@www.international.gc.ca${FILE_DIRECTORY}sema-lmes.xml`],
      ["the host without www", `https://international.gc.ca${FILE_DIRECTORY}sema-lmes.xml`],
      ["the root of the host", "https://www.international.gc.ca/sema-lmes.xml"],
      [
        "a directory that only starts like the file's",
        `https://www.international.gc.ca${FILE_DIRECTORY.slice(0, -1)}-other/sema-lmes.xml`,
      ],
      [
        "a path that climbs out of the directory",
        `https://www.international.gc.ca${FILE_DIRECTORY}../sema-lmes.xml`,
      ],
    ];

    it.each(REFUSED)(
      "refuses the answer that came from %s, naming no address",
      async (_name, from) => {
        const failure = await failureOf(
          canadaSemaConnector.download(fakeFetch(filesOf(semaXml(), { url: from })), {}),
        );

        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        for (const part of ["evil", "attacker", "secret", "international", "https"]) {
          expect((failure as FetchError).message).not.toContain(part);
        }
      },
    );

    it("accepts an answer that came from the same directory after a redirect, with a query", async () => {
      const answer = await canadaSemaConnector.download(
        fakeFetch(
          filesOf(semaXml(), {
            url: `https://www.international.gc.ca${FILE_DIRECTORY}sema-lmes.xml?v=2`,
          }),
        ),
        {},
      );
      expect(answer).not.toBe("unchanged");
    });

    it("refuses an answer of unchanged that came from elsewhere, as not allowed", async () => {
      const fetch = fakeFetch(
        filesOf(semaXml(), { etag: '"abc"', url: "https://evil.example.net/sema-lmes.xml" }),
      );
      const failure = await failureOf(canadaSemaConnector.download(fetch, { etag: 'k1:"abc"' }));
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it("refuses an answer whose address is no address, naming none", async () => {
      const fetch: ConnectorFetch = async () => ({
        notModified: false,
        url: "not an address",
        status: 200,
        contentType: "text/xml",
        body: Buffer.from(semaXml()),
        truncated: false,
        etag: null,
        lastModified: null,
      });
      const failure = await failureOf(canadaSemaConnector.download(fetch, {}));
      expect((failure as FetchError).reason).toBe("not_allowed");
      expect((failure as FetchError).message).not.toContain("not an address");
    });
  });

  describe("a file that is not the list", () => {
    const NOT_THE_LIST: Array<[string, string]> = [
      ["an HTML page", "<html><body>Not found</body></html>"],
      ["JSON", '{"data-set":[]}'],
      ["an empty file", ""],
      ["a document of another root", semaXml({ root: "other-set" })],
      [
        "a document whose DOCTYPE has an internal subset",
        semaXml({ doctype: '<!DOCTYPE data-set [<!ENTITY lol "lol">]>\r\n' }),
      ],
      ["a document cut short: no closing root", semaXml().slice(0, semaXml().length - 20)],
      ["a document cut in the middle of a record", semaXml().slice(0, 100_000)],
      [
        "a document with a record that is closed by another tag",
        semaXml({ extra: ["\t<record>\r\n\t\t<Country-Pays>Iran</Item>\r\n\t</record>\r\n"] }),
      ],
      [
        "a document with a comment that is never closed",
        `${semaXml().slice(0, 200)}<!-- never closed`,
      ],
    ];

    it.each(NOT_THE_LIST)("fails %s", async (_name, xml) => {
      const failure = await failureOf(canadaSemaConnector.download(fakeFetch(filesOf(xml)), {}));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).toBe("The file is not the list.");
    });

    it("never expands an entity that the document declares", async () => {
      const xml = semaXml({
        doctype: '<!DOCTYPE data-set [<!ENTITY x "ZZ-EXPANDED">]>\r\n',
        extra: [entityXml({ name: "Entity &x; Ltd" })],
      });
      expect(
        await failureOf(canadaSemaConnector.download(fakeFetch(filesOf(xml)), {})),
      ).toBeInstanceOf(NotTheListError);
    });

    it("takes a DOCTYPE that has no internal subset and the declaration of a namespace as they are", async () => {
      const snapshot = await downloadOf(filesOf(semaXml({ doctype: "<!DOCTYPE data-set>\r\n" })));
      expect(bodyOf(snapshot).rows.length).toBeGreaterThan(1000);
    });
  });

  describe("the floors that make a file the list", () => {
    it("takes 3,000 records and refuses 2,999", async () => {
      expect(
        await downloadOf(filesOf(semaXml({ entities: 1000, people: 1900, ships: 100 }))),
      ).toBeDefined();
      expect(
        await failureOf(
          canadaSemaConnector.download(
            fakeFetch(filesOf(semaXml({ entities: 1000, people: 1899, ships: 100 }))),
            {},
          ),
        ),
      ).toBeInstanceOf(NotTheListError);
    });

    it("takes 1,000 entities and refuses 999, whatever the number of the other records", async () => {
      expect(await downloadOf(filesOf(semaXml({ entities: 1000, people: 3000 })))).toBeDefined();
      expect(
        await failureOf(
          canadaSemaConnector.download(
            fakeFetch(filesOf(semaXml({ entities: 999, people: 5000 }))),
            {},
          ),
        ),
      ).toBeInstanceOf(NotTheListError);
    });

    it("counts the entities that can be read only: 999 and five that cannot are not 1,000", async () => {
      const bad = Array.from({ length: 5 }, () => entityXml({ name: "Brokenco Ltd", item: "x" }));
      expect(
        await failureOf(
          canadaSemaConnector.download(
            fakeFetch(filesOf(semaXml({ entities: 999, people: 2000, extra: bad }))),
            {},
          ),
        ),
      ).toBeInstanceOf(NotTheListError);
    });

    it("counts an entity that no name makes a key for: it gets no row, and it is an entity of the file", async () => {
      // 999 entities with a key and one, "XY", with none: 1,000 entities, 999 rows.
      const snapshot = await downloadOf(
        filesOf(semaXml({ entities: 999, people: 2000, extra: [entityXml({ name: "XY" })] })),
      );

      expect(rowOf(snapshot, "xy")).toBeUndefined();
      expect(bodyOf(snapshot).rows).toHaveLength(999);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it("takes a file whose earliest entity was listed on 2010-12-31 and refuses 2011-01-01", async () => {
      expect(await downloadOf(filesOf(semaXml({ earliest: "2010-12-31" })))).toBeDefined();
      expect(
        await failureOf(
          canadaSemaConnector.download(fakeFetch(filesOf(semaXml({ earliest: "2011-01-01" }))), {}),
        ),
      ).toBeInstanceOf(NotTheListError);
    });

    it("measures the earliest listing on every entity of the file, one that no name makes a key for included", async () => {
      // The entities of the base file were listed in 2012 or later; "XY" has no key and no row.
      const withXy = (day: string): Record<string, FakeFile> =>
        filesOf(
          semaXml({ earliest: "2012-05-05", extra: [entityXml({ name: "XY", item: "13", day })] }),
        );

      expect(rowOf(await downloadOf(withXy("2010-12-31")), "xy")).toBeUndefined();
      expect(
        await failureOf(canadaSemaConnector.download(fakeFetch(withXy("2011-01-01")), {})),
      ).toBeInstanceOf(NotTheListError);
    });

    it("reads the day of no individual: an old listing of a person does not make the list old enough", async () => {
      // The individuals of the base file were listed in 1999; the entities were listed in 2012 or later.
      expect(
        await failureOf(
          canadaSemaConnector.download(fakeFetch(filesOf(semaXml({ earliest: "2012-05-05" }))), {}),
        ),
      ).toBeInstanceOf(NotTheListError);
    });
  });

  describe("the number of records", () => {
    const records = (count: number): string[] =>
      Array.from({ length: count }, () => "\t<record/>\r\n");

    it("takes 20,000 records and fails 20,001 as too large, and never gives a shorter list", async () => {
      const entities = Array.from({ length: 1100 }, (_, n) => baseEntity(n, "2009-05-06"));
      // The shortest individual there is: the records of this test are many, and the file is 8 MiB at most.
      const filler = (count: number): string[] =>
        Array.from(
          { length: count },
          () => "\t<record><GivenName-Prenom>x</GivenName-Prenom></record>\r\n",
        );

      expect(
        await downloadOf(filesOf(documentXml([...entities, ...filler(20_000 - 1100)]))),
      ).toBeDefined();
      expect(
        await failureOf(
          canadaSemaConnector.download(
            fakeFetch(filesOf(documentXml([...entities, ...filler(20_001 - 1100)]))),
            {},
          ),
        ),
      ).toBeInstanceOf(BodyTooLargeError);
      expect(
        await failureOf(
          canadaSemaConnector.download(fakeFetch(filesOf(documentXml(records(20_001)))), {}),
        ),
      ).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("individuals and ships", () => {
    it("copies nothing of an individual or a ship into the body or a record", async () => {
      const snapshot = await downloadOf(filesOf());
      const parsed = canadaSemaConnector.parse(snapshot);

      expect(snapshot.bodies[0]).not.toContain(LEFT_OUT);
      expect(JSON.stringify(parsed.records)).not.toContain(LEFT_OUT);
      expect(bodyOf(snapshot).rows).toHaveLength(1100);
    });

    it("counts every record that was seen in the total, and none of the individuals or ships as unreadable", async () => {
      const body = bodyOf(await downloadOf(filesOf()));

      expect(body.total).toBe(3100);
      expect(body.unreadable).toBe(0);
    });

    it("skips on the presence of the element: a given name, a family name, or both, even when it is empty", async () => {
      const kinds: Array<[string, Cell[]]> = [
        ["a given name only", [[TAG.given, `${LEFT_OUT}A`]]],
        ["a family name only", [[TAG.last, `${LEFT_OUT}B`]]],
        [
          "both names",
          [
            [TAG.given, `${LEFT_OUT}C`],
            [TAG.last, `${LEFT_OUT}D`],
          ],
        ],
        ["an empty given name", [[TAG.given, ""]]],
        ["an empty family name", [[TAG.last, "   "]]],
        ["an IMO number", [[TAG.imo, `${LEFT_OUT}E`]]],
        ["an empty IMO number", [[TAG.imo, ""]]],
        ["a date of birth only", [[TAG.born, `${LEFT_OUT}F`]]],
        ["a title only", [[TAG.title, `${LEFT_OUT}G`]]],
      ];
      for (const [, extra] of kinds) {
        const snapshot = await downloadOf(withEntities({ name: "Personlike Ltd", extra }));

        expect(rowOf(snapshot, "personlike")).toBeUndefined();
        expect(snapshot.bodies[0]).not.toContain("Personlike");
        expect(bodyOf(snapshot).unreadable).toBe(0);
        expect(bodyOf(snapshot).total).toBe(3101);
      }
    });

    it("skips an individual or a ship whatever its other cells hold, without counting it as unreadable", async () => {
      const snapshot = await downloadOf(
        filesOf(
          semaXml({
            extra: [
              recordXml([
                [TAG.given, "Gx"],
                [TAG.item, "not a number"],
                [TAG.day, "not a day"],
              ]),
              recordXml([[TAG.imo, "9"]]),
              recordXml([
                [TAG.last, "Lx"],
                [TAG.country, ""],
              ]),
            ],
          }),
        ),
      );
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(bodyOf(snapshot).rows).toHaveLength(1100);
    });
  });

  describe("the values of an entity", () => {
    it("reads the elements by their names, whatever the order they come in", async () => {
      const [plain, turned] = await Promise.all([
        downloadOf(
          withEntities({
            name: "Ordered Ltd",
            aliases: "Ordered Alias",
            schedule: "2, Part 4",
            item: "77",
            day: "2023-02-03",
            country: "Iran",
          }),
        ),
        downloadOf(
          withEntities({
            name: "Ordered Ltd",
            aliases: "Ordered Alias",
            schedule: "2, Part 4",
            item: "77",
            day: "2023-02-03",
            country: "Iran",
            turned: true,
          }),
        ),
      ]);

      expect(rowOf(plain, "ordered")).toEqual(rowOf(turned, "ordered"));
      expect(rowOf(plain, "ordered")?.listings).toEqual([
        { regulation: "Iran", schedule: "2, Part 4", item: "77", day: "2023-02-03" },
      ]);
    });

    it("takes the names, the aliases and the cells as clean lines: no-break spaces, tabs, line breaks, runs of blanks, a zero-width character", async () => {
      const snapshot = await downloadOf(
        withEntities({
          name: "Quillon  Trading\t\tHoldings  \r\n Ltd",
          aliases: "Quill​on  Alias One;\r\n  Quillon\tAlias Two  ",
          country: "Iran ",
          schedule: "\t1 ,  Part 3\r\n",
        }),
      );

      expect(rowOf(snapshot, "quillontradingholdings")).toEqual({
        id: "quillontradingholdings",
        name: "Quillon Trading Holdings Ltd",
        names: ["Quillon Trading Holdings Ltd", "Quillon Alias One", "Quillon Alias Two"],
        aliases: ["Quillon Alias One", "Quillon Alias Two"],
        listings: [{ regulation: "Iran", schedule: "1, Part 3", item: "12", day: "2022-03-04" }],
        publishedAt: "2022-03-04",
      });
      expect(snapshot.bodies[0]).not.toMatch(/ |​|\\t|\\r|\\n|  /);
    });

    it("takes a regulation written with a trailing space and the same one without as one", async () => {
      const snapshot = await downloadOf(
        withEntities(
          { name: "Moldovaco Ltd", country: "Moldova " },
          { name: "Moldovaco Ltd", country: "Moldova", item: "13", day: "2022-03-05" },
        ),
      );

      const row = rowOf(snapshot, "moldovaco");
      expect(row?.listings.map((listing) => listing.regulation)).toEqual(["Moldova", "Moldova"]);
    });

    it.each([
      ["1,Part 3", "1, Part 3"],
      ["1, Part 3 ", "1, Part 3"],
      ["1 , Part 3", "1, Part 3"],
      ["Part 3", "Part 3"],
      ["1,Part 1.1", "1, Part 1.1"],
      ["   ", ""],
      // Only characters that nobody sees: no schedule, and no reason to refuse the record.
      ["\u200b", ""],
      [null, ""],
    ])("writes the schedule %j as %j", async (schedule, written) => {
      const snapshot = await downloadOf(withEntities({ name: "Scheduleco Ltd", schedule }));
      expect(rowOf(snapshot, "scheduleco")?.listings[0].schedule).toBe(written);
    });

    it("shows the English part of a regulation written in two languages, and the whole of one that is not", async () => {
      const snapshot = await downloadOf(
        withEntities(
          { name: "Bilingualone Ltd", country: "Russia / Russie" },
          { name: "Bilingualtwo Ltd", country: "Myanmar (Burma) / Myanmar (Birmanie)" },
          { name: "Bilingualthree Ltd", country: "Iran" },
          { name: "Bilingualfour Ltd", country: "Russia / Russie / Rossiya" },
        ),
      );

      const regulations = ["bilingualone", "bilingualtwo", "bilingualthree", "bilingualfour"].map(
        (id) => rowOf(snapshot, id)?.listings[0].regulation,
      );
      expect(regulations).toEqual(["Russia", "Myanmar (Burma)", "Iran", "Russia"]);
    });

    it("reads an item of one to four digits and a day that exists, and counts any other as unreadable", async () => {
      const BAD: Array<[string, EntitySpec]> = [
        ["an item that is not a number", { name: "Baditem Ltd", item: "12a" }],
        ["an item of five digits", { name: "Baditem Ltd", item: "12345" }],
        ["an item with a sign", { name: "Baditem Ltd", item: "-1" }],
        ["an item that is empty", { name: "Baditem Ltd", item: "" }],
        ["no item", { name: "Baditem Ltd", item: null }],
        ["a day that does not exist", { name: "Baditem Ltd", day: "2022-13-01" }],
        ["a day in the form of another country", { name: "Baditem Ltd", day: "04/03/2022" }],
        ["a day with a time", { name: "Baditem Ltd", day: "2022-03-04T10:00:00" }],
        ["no day", { name: "Baditem Ltd", day: null }],
        ["no regulation", { name: "Baditem Ltd", country: null }],
        ["an empty regulation", { name: "Baditem Ltd", country: "  " }],
        [
          "a regulation that is only a hidden character",
          { name: "Baditem Ltd", country: "\u200b" },
        ],
        ["a name that is only a hidden character", { name: "\u200b" }],
        ["no name", { name: "   " }],
        ["a name that holds no letter and no digit", { name: "!!! ???" }],
      ];
      for (const [, spec] of BAD) {
        const snapshot = await downloadOf(withEntities(spec));

        expect(bodyOf(snapshot).unreadable).toBe(1);
        expect(rowOf(snapshot, "baditem")).toBeUndefined();
        expect(bodyOf(snapshot).total).toBe(3101);
        const parsed = canadaSemaConnector.parse(snapshot);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(1);
      }
    });

    it("reads a name of 230 characters whole, and counts one of 231 as unreadable: it is never cut", async () => {
      const nameOf = (length: number): string => `Capname ${"bbbb ".repeat(60)}`.slice(0, length);
      const fits = nameOf(230);
      const over = nameOf(231).replace("Capname", "Overnam");
      expect([fits.length, over.length]).toEqual([230, 231]);
      expect([fits.endsWith(" "), over.endsWith(" ")]).toEqual([false, false]);

      const snapshot = await downloadOf(withEntities({ name: fits }, { name: over, item: "13" }));

      const rows = bodyOf(snapshot).rows;
      expect(rows.find((entry) => entry.id.startsWith("capname"))?.name).toBe(fits);
      expect(rows.some((entry) => entry.id.startsWith("overnam"))).toBe(false);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(snapshot.bodies[0].includes("shortened")).toBe(false);
      // The record of the name that fits is made too: its id is under 200 characters.
      const record = canadaSemaConnector
        .parse(snapshot)
        .records.find((entry) => entry.sourceRecordId.startsWith("capname"));
      expect(record?.identifiers.entity).toBe(fits);
    });

    it("takes a record whose only element is its name as a record of no kind: unreadable", async () => {
      const snapshot = await downloadOf(
        filesOf(semaXml({ extra: ["\t<record/>\r\n", recordXml([["Other-Element", "x"]])] })),
      );
      expect(bodyOf(snapshot).unreadable).toBe(2);
    });

    it("takes a nested element, a CDATA section and a numeric reference as the text they are", async () => {
      const snapshot = await downloadOf(
        filesOf(
          semaXml({
            extra: [
              rawRecordXml(
                "\t\t<Country-Pays>Iran</Country-Pays>\r\n" +
                  "\t\t<EntityOrShip-EntiteOuNavire><![CDATA[Cdata & Sons Ltd]]></EntityOrShip-EntiteOuNavire>\r\n" +
                  "\t\t<Item-NumeroDarticle>&#49;&#x32;</Item-NumeroDarticle>\r\n" +
                  "\t\t<DateOfListing-DateDinscription>2022-03-04</DateOfListing-DateDinscription>\r\n" +
                  "\t\t<Unknown-Element><Nested>ZZ-NESTED</Nested></Unknown-Element>\r\n",
              ),
            ],
          }),
        ),
      );

      const row = rowOf(snapshot, "cdatasons");
      expect(row?.name).toBe("Cdata & Sons Ltd");
      expect(row?.listings[0].item).toBe("12");
      expect(snapshot.bodies[0]).not.toContain("ZZ-NESTED");
    });
  });

  describe("a name, a regulation or a schedule that does not fit", () => {
    // The name (230 characters), the regulation (100) and the schedule (20) are read whole
    // or not at all. A record whose cell is longer is unreadable (counted, and more than the allowance
    // fails the parse): no id, no key and no identifier is ever made of a cut text.
    interface CellKind {
      cell: string;
      cap: number;
      /** An entity whose cell holds `text`; `n` makes the entity its own. */
      spec: (text: string, n: number) => EntitySpec;
      /** The id of that entity. */
      idOf: (text: string, n: number) => string;
      /** What the row holds of the cell. */
      held: (row: SemaEntity) => string;
    }
    const compact = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");
    const CELLS: CellKind[] = [
      {
        cell: "name",
        cap: 230,
        spec: (text, n) => ({ name: text, item: String(20 + n) }),
        idOf: (text) => compact(text),
        held: (row) => row.name,
      },
      {
        cell: "regulation",
        cap: 100,
        spec: (text, n) => ({
          name: `Cellco ${letters(n)} Ltd`,
          country: text,
          item: String(20 + n),
        }),
        idOf: (_text, n) => `cellco${letters(n)}`,
        held: (row) => row.listings[0].regulation,
      },
      {
        cell: "schedule",
        cap: 20,
        spec: (text, n) => ({
          name: `Cellco ${letters(n)} Ltd`,
          schedule: text,
          item: String(20 + n),
        }),
        idOf: (_text, n) => `cellco${letters(n)}`,
        held: (row) => row.listings[0].schedule,
      },
    ];
    const SHAPES: Array<[string, string]> = [
      ["a blank", " "],
      ["half of a pair of surrogates", PAIR],
    ];
    const CASES = CELLS.flatMap((kind) =>
      SHAPES.map(([what, middle]) => [kind.cell, what, kind, middle] as const),
    );

    it.each(CASES)(
      "counts a record whose %s is too long as unreadable, whatever falls where a cut would be: %s there must not bring it under the limit",
      async (_cell, _what, kind, middle) => {
        const texts = around(kind.cap).map((at) => cutShape("Zl", at, middle, kind.cap + 39));
        expect(texts.every((text) => text.length === kind.cap + 39)).toBe(true);

        const snapshot = await downloadOf(
          withEntities(...texts.map((text, n) => kind.spec(text, n)), {
            name: "Keepsema Ltd",
            item: "9",
          }),
        );

        const body = bodyOf(snapshot);
        expect(texts.some((text, n) => rowOf(snapshot, kind.idOf(text, n)) !== undefined)).toBe(
          false,
        );
        expect(body.rows.some((row) => row.id.startsWith("zl"))).toBe(false);
        expect(body.unreadable).toBe(texts.length);
        expect(rowOf(snapshot, "keepsema")).toBeDefined();
        expect(snapshot.bodies[0].includes("shortened")).toBe(false);
        const parsed = canadaSemaConnector.parse(snapshot);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(texts.length);
        for (const record of parsed.records) {
          expect(record.sourceRecordId.endsWith("shortened")).toBe(false);
          expect(record.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
          expect(JSON.stringify(record.identifiers).includes("shortened")).toBe(false);
        }
      },
    );

    it.each(CASES)(
      "reads a %s of exactly the limit whole, and counts one of a character more as unreadable, whatever falls where a cut would be: %s",
      async (_cell, _what, kind, middle) => {
        const fits = around(kind.cap).map((at) => cutShape("Zf", at, middle, kind.cap));
        const over = around(kind.cap).map((at) => cutShape("Zo", at, middle, kind.cap + 1));

        const snapshot = await downloadOf(
          withEntities(...[...fits, ...over].map((text, n) => kind.spec(text, n))),
        );

        for (const [n, text] of fits.entries()) {
          const row = rowOf(snapshot, kind.idOf(text, n));
          expect(row).toBeDefined();
          expect(kind.held(row as SemaEntity)).toBe(text);
        }
        for (const [m, text] of over.entries()) {
          expect(rowOf(snapshot, kind.idOf(text, fits.length + m))).toBeUndefined();
        }
        expect(bodyOf(snapshot).unreadable).toBe(over.length);
        expect(snapshot.bodies[0].includes("shortened")).toBe(false);
      },
    );

    it("measures a schedule as the body writes it: 21 characters that are 16 once written fit, 20 that are 29 once written do not", async () => {
      const snapshot = await downloadOf(
        withEntities(
          { name: "Spacedsched Ltd", schedule: "1 , 2 , 3 , 4 , 5 , 6", item: "31" },
          { name: "Tightsched Ltd", schedule: "1,2,3,4,5,6,7,8,9,10", item: "32" },
        ),
      );

      expect(rowOf(snapshot, "spacedsched")?.listings[0].schedule).toBe("1, 2, 3, 4, 5, 6");
      expect(rowOf(snapshot, "tightsched")).toBeUndefined();
      expect(bodyOf(snapshot).unreadable).toBe(1);
    });

    it("measures the English part of a regulation and not the whole cell: a French part of any length is no reason, an English part over 100 is", async () => {
      const snapshot = await downloadOf(
        withEntities(
          { name: "Longfrench Ltd", country: `Russia / Russie ${"r".repeat(300)}`, item: "41" },
          { name: "Longenglish Ltd", country: `${"R".repeat(101)} / Russie`, item: "42" },
          { name: "Exactenglish Ltd", country: `${"R".repeat(100)} / Russie`, item: "43" },
        ),
      );

      expect(rowOf(snapshot, "longfrench")?.listings[0].regulation).toBe("Russia");
      expect(rowOf(snapshot, "longenglish")).toBeUndefined();
      expect(rowOf(snapshot, "exactenglish")?.listings[0].regulation).toBe("R".repeat(100));
      expect(bodyOf(snapshot).unreadable).toBe(1);
    });

    it.each(CELLS)(
      "lets a few records whose $cell does not fit pass, and fails the parse for more: ten, or a hundredth of the rows",
      async (kind) => {
        const text = cutShape("Zl", kind.cap - 12, " ", kind.cap + 39);
        for (const count of [1, 11, 12]) {
          const snapshot = await downloadOf(
            withEntities(...Array.from({ length: count }, (_, i) => kind.spec(text, i))),
          );
          const parsed = canadaSemaConnector.parse(snapshot);
          const refused = count > unreadableAllowed(1100 + count);

          expect(bodyOf(snapshot).unreadable).toBe(count);
          expect(parsed.errors).toBe(refused ? count : 0);
          expect(parsed.skipped).toBe(refused ? 0 : count);
          expect(parsed.records).toHaveLength(1100);
        }
      },
    );

    it("gives no id, no key and no identifier that ends in the cut marker, whatever the cells hold: one character over, far over, and longer than the kit reads", async () => {
      const huge = " ".repeat(LINE_INPUT_MAX + 10);
      const snapshot = await downloadOf(
        withEntities(
          { name: `Zzname ${"n".repeat(224)}`, item: "51" },
          { name: `Zzname two ${"word ".repeat(80)}Ltd`, item: "52" },
          { name: `Zzname three${huge} Holdings`, item: "53" },
          { name: "Zzreg one Ltd", country: `Regulation ${"r".repeat(90)}`, item: "54" },
          { name: "Zzreg two Ltd", country: `Regulation ${"r".repeat(400)}`, item: "55" },
          { name: "Zzreg three Ltd", country: `Regulation${huge} / Regulation`, item: "56" },
          { name: "Zzsched one Ltd", schedule: `1, Part ${"3".repeat(13)}`, item: "57" },
          { name: "Zzsched two Ltd", schedule: `1, Part ${"3".repeat(300)}`, item: "58" },
          { name: "Zzsched three Ltd", schedule: `1, Part${huge} 3`, item: "59" },
          { name: "Zzfit Ltd", country: "Iran", schedule: "1, Part 3", item: "60" },
        ),
      );

      const body = bodyOf(snapshot);
      expect(body.unreadable).toBe(9);
      expect(rowOf(snapshot, "zzfit")).toBeDefined();
      expect(body.rows.some((row) => row.id.startsWith("zz") && row.id !== "zzfit")).toBe(false);
      // Booleans, so that a failure never prints a body of megabytes.
      expect(JSON.stringify(body.rows).includes("shortened")).toBe(false);
      const parsed = canadaSemaConnector.parse(snapshot);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(9);
      for (const record of parsed.records) {
        expect(record.sourceRecordId.endsWith("shortened")).toBe(false);
        expect(record.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
        expect(JSON.stringify(record.identifiers).includes("shortened")).toBe(false);
      }
    });

    // The kit reads a cell to LINE_INPUT_MAX units, and a cell whose first megabyte is
    // hidden characters cleans to nothing. That is not an empty cell: it is a cell that was not read.
    const hidden = (length: number): string => String.fromCodePoint(0x200b).repeat(length);

    it("counts a schedule longer than the kit reads as unreadable, whatever its first megabyte shows, and reads one of exactly that length", async () => {
      const over = await downloadOf(
        withEntities({
          name: "Hiddensched Ltd",
          schedule: `${hidden(LINE_INPUT_MAX + 10)}1, Part 3`,
          item: "61",
        }),
      );

      expect(rowOf(over, "hiddensched")).toBeUndefined();
      expect(bodyOf(over).unreadable).toBe(1);
      const parsed = canadaSemaConnector.parse(over);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(1);

      // Exactly the limit: the kit reads it whole, and the schedule is the text that it holds.
      const exact = `${hidden(LINE_INPUT_MAX - 9)}1, Part 3`;
      expect(exact.length).toBe(LINE_INPUT_MAX);
      const fits = await downloadOf(
        withEntities({ name: "Exactsched Ltd", schedule: exact, item: "62" }),
      );
      expect(rowOf(fits, "exactsched")?.listings[0].schedule).toBe("1, Part 3");
      expect(bodyOf(fits).unreadable).toBe(0);
    });

    it("reads a schedule that is only an emoji", async () => {
      const emoji = String.fromCodePoint(0x1f600);
      const snapshot = await downloadOf(
        withEntities({ name: "Emojisched Ltd", schedule: emoji, item: "63" }),
      );

      expect(rowOf(snapshot, "emojisched")?.listings[0].schedule).toBe(emoji);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });

    it.each([
      ["the primary name", `${hidden(LINE_INPUT_MAX + 10)}Hiddenname Ltd`, undefined, "hiddenname"],
      [
        "the regulation",
        "Hiddenreg Ltd",
        `${hidden(LINE_INPUT_MAX + 10)}Russia / Russie`,
        "hiddenreg",
      ],
    ])(
      "counts a record whose %s has a first megabyte of hidden characters as unreadable, never as one with an empty cell",
      async (_cell, name, country, id) => {
        const snapshot = await downloadOf(withEntities({ name, country, item: "64" }));

        expect(rowOf(snapshot, id)).toBeUndefined();
        expect(bodyOf(snapshot).unreadable).toBe(1);
      },
    );

    it("gives no alias to a part whose first megabyte is hidden characters, and keeps the other aliases and the record", async () => {
      const snapshot = await downloadOf(
        withEntities({
          name: "Hiddenalias Ltd",
          aliases: `${hidden(LINE_INPUT_MAX + 10)}Hidden Alias; Short Alias`,
          item: "65",
        }),
      );

      const row = rowOf(snapshot, "hiddenalias");
      expect(row?.aliases).toEqual(["Short Alias"]);
      expect(JSON.stringify(row).includes("Hidden Alias")).toBe(false);
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });
  });

  describe("the English name", () => {
    it("is the name before the first slash and before '(also known as', and the id is made of it", async () => {
      const snapshot = await downloadOf(
        withEntities(
          { name: "Quillon Trading Ltd / Quillon Commerce SARL" },
          { name: "Quillon Group (also known as Quillon Gruppe Alt)", item: "13" },
          {
            name: "Quillon Union (Also Known As Quillon Vereinigung) / Quillon Syndicat",
            item: "14",
          },
          { name: "Quillon Council (also known as Quillon Rat", item: "15" },
        ),
      );

      expect(rowOf(snapshot, "quillontrading")).toMatchObject({
        name: "Quillon Trading Ltd / Quillon Commerce SARL",
        names: ["Quillon Trading Ltd / Quillon Commerce SARL", "Quillon Trading Ltd"],
      });
      expect(rowOf(snapshot, "quillongroup")).toMatchObject({
        name: "Quillon Group (also known as Quillon Gruppe Alt)",
        names: [
          "Quillon Group (also known as Quillon Gruppe Alt)",
          "Quillon Group",
          "Quillon Gruppe Alt",
        ],
      });
      expect(rowOf(snapshot, "quillonunion")?.names).toEqual([
        "Quillon Union (Also Known As Quillon Vereinigung) / Quillon Syndicat",
        "Quillon Union",
        "Quillon Vereinigung",
      ]);
      // A parenthesis that is never closed holds the rest of the name.
      expect(rowOf(snapshot, "quilloncouncil")?.names).toEqual([
        "Quillon Council (also known as Quillon Rat",
        "Quillon Council",
        "Quillon Rat",
      ]);
    });

    it("takes the text of the parenthesis up to the first closing one, and none of the text that follows", async () => {
      const snapshot = await downloadOf(
        withEntities({ name: "Quillon Bund (also known as Quillon Bund Alt) Holdings (Branch)" }),
      );

      expect(rowOf(snapshot, "quillonbund")?.names).toEqual([
        "Quillon Bund (also known as Quillon Bund Alt) Holdings (Branch)",
        "Quillon Bund",
        "Quillon Bund Alt",
      ]);
    });

    it("leaves a legal form out of the id: Ltd, Inc. and the like", async () => {
      const snapshot = await downloadOf(
        withEntities({ name: "Formco Ltd" }, { name: "The Articleco Inc.", item: "13" }),
      );
      expect(rowOf(snapshot, "formco")).toBeDefined();
      expect(rowOf(snapshot, "articleco")).toBeDefined();
    });

    it("gives an entity whose English name is short a record when an alias gives it a key, and none when nothing does", async () => {
      const snapshot = await downloadOf(
        withEntities(
          { name: "XYZ", aliases: "Examplebank Joint Stock Company" },
          { name: "XY", item: "13" },
          { name: "ABC", aliases: "AB; CD", item: "14" },
        ),
      );
      const records = canadaSemaConnector.parse(snapshot).records;

      expect(rowOf(snapshot, "xyz")?.names).toEqual(["XYZ", "Examplebank Joint Stock Company"]);
      expect(recordOfId(records, "xyz")?.matchKeys).toEqual([
        "name:examplebankjointstockcompany",
        "name:examplebankjointstock",
      ]);
      expect(rowOf(snapshot, "xy")).toBeUndefined();
      // An entity that no name makes a key for gets no row, and it is no unreadable record.
      expect(rowOf(snapshot, "abc")).toBeUndefined();
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(records.every((record) => record.matchKeys.length > 0)).toBe(true);
    });
  });

  describe("the aliases", () => {
    it("are split on a semicolon and on a line break only, and 'A or B' stays one alias", async () => {
      const snapshot = await downloadOf(
        withEntities({
          name: "Aliasco Ltd",
          aliases: "Alpha or Beta; Gamma\nDelta;;  ;\r\nEpsilon, Zeta; Alpha or Beta",
        }),
      );
      expect(rowOf(snapshot, "aliasco")?.aliases).toEqual([
        "Alpha or Beta",
        "Gamma",
        "Delta",
        "Epsilon, Zeta",
      ]);
    });

    it("keep at most eight, the ones with a Latin letter first, and a part over 120 characters is none of them", async () => {
      const aliases = [
        cyrillic(1),
        "Latin One",
        cyrillic(2),
        "Latin Two",
        "Latin Three",
        cyrillic(3),
        "Latin Four",
        "Latin Five",
        "Latin Six",
        cyrillic(4),
        `Latin ${"s".repeat(150)}`,
      ];
      const snapshot = await downloadOf(
        withEntities({ name: "Manyaliases Ltd", aliases: aliases.join("; ") }),
      );

      const row = rowOf(snapshot, "manyaliases");
      // The part of 156 characters is no alias: it takes no place among the eight, and is not cut.
      expect(row?.aliases).toEqual([
        "Latin One",
        "Latin Two",
        "Latin Three",
        "Latin Four",
        "Latin Five",
        "Latin Six",
        cyrillic(1),
        cyrillic(2),
      ]);
      // Whole name, English part (the same), and at most eight aliases.
      expect(row?.names).toHaveLength(9);
      expect(snapshot.bodies[0]).not.toContain("shortened");
    });

    it("take a part of exactly 120 characters, and none of 121: a part that is too long is no alias at all, never a cut one", async () => {
      const exact = `Exactalias${"e".repeat(110)}`;
      const over = `Overalias${"o".repeat(112)}`;
      expect([exact.length, over.length]).toEqual([120, 121]);

      const snapshot = await downloadOf(
        withEntities({
          name: "Quillon Ltd",
          aliases: [exact, over, "Quillon Other Alias"].join(";"),
        }),
      );

      // The record keeps its primary name and its other aliases; the long part is gone, not shortened.
      const row = rowOf(snapshot, "quillon");
      expect(row?.name).toBe("Quillon Ltd");
      expect(row?.aliases).toEqual([exact, "Quillon Other Alias"]);
      expect(row?.names).toEqual(["Quillon Ltd", exact, "Quillon Other Alias"]);
      expect(snapshot.bodies[0]).not.toContain("shortened");
      expect(snapshot.bodies[0]).not.toContain("Overalias");
      const record = recordOfId(canadaSemaConnector.parse(snapshot).records, "quillon");
      expect(record?.matchKeys).toContain(`name:${exact.toLowerCase()}`);
      expect(record?.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
      expect(record?.matchKeys.some((key) => key.includes("overalias"))).toBe(false);
      expect(record?.summary).toContain(`Other names: ${exact}; Quillon Other Alias. `);
      expect(record?.summary).not.toContain("Overalias");
    });

    // The shapes of a part of 139 units that a cut of the part would bring to 120 (see `cutShape`).
    const AT_THE_CUT = around(120);

    it.each([
      ["a blank", " "],
      ["half of a pair of surrogates", PAIR],
    ])(
      "drop a part of 139 characters whatever falls where a cut would be: %s there must not bring it under the limit",
      async (_what, middle) => {
        const parts = AT_THE_CUT.map((at) => cutShape("Cutalias", at, middle, 139));
        expect(parts.every((part) => part.length === 139)).toBe(true);

        const snapshot = await downloadOf(
          withEntities(
            ...parts.flatMap((part, i): EntitySpec[] => [
              // The long part as an alias, with a short one beside it.
              {
                name: `Shapeco ${letters(i)} Ltd`,
                aliases: `${part}; Shapeco ${letters(i)} Short Alias`,
                item: String(60 + i),
              },
              // The long part as the text of the parenthesis.
              { name: `Akashape ${letters(i)} Ltd (also known as ${part})`, item: String(80 + i) },
            ]),
          ),
        );

        for (const [i] of parts.entries()) {
          const row = rowOf(snapshot, `shapeco${letters(i)}`);
          expect(row?.aliases).toEqual([`Shapeco ${letters(i)} Short Alias`]);
          const akaRow = rowOf(snapshot, `akashape${letters(i)}`);
          // The primary name stays as the file writes it; the other name is gone, not shortened.
          expect(akaRow?.names).toHaveLength(2);
        }
        expect(snapshot.bodies[0]).not.toContain("shortened");
        const records = canadaSemaConnector.parse(snapshot).records;
        for (const record of records) {
          expect(record.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
        }
      },
    );

    it.each([
      ["a blank", " "],
      ["half of a pair of surrogates", PAIR],
    ])(
      "keep a part of 120 characters whatever falls where a cut would be, and drop one of 121: %s",
      async (_what, middle) => {
        const fits = AT_THE_CUT.map((at) => cutShape("Fitalias", at, middle, 120));
        const over = AT_THE_CUT.map((at) => cutShape("Overalias", at, middle, 121));

        const snapshot = await downloadOf(
          withEntities({ name: "Fitco Ltd", aliases: [...fits, ...over].join(";") }),
        );

        // Eight aliases at the most: the six that fit, the others are not there to take a place.
        expect(rowOf(snapshot, "fitco")?.aliases).toEqual(fits);
        expect(snapshot.bodies[0]).not.toContain("shortened");
        expect(snapshot.bodies[0]).not.toContain("Overalias");
      },
    );

    it("drop a part whose cell is longer than the kit reads, however little of it shows: it is no alias, and it is not shown", async () => {
      // The kit reads a cell to LINE_INPUT_MAX units and marks the line as cut, even when what is left
      // of it is short: that text is a cut one, so it is no alias.
      const huge = `Hugealias${" ".repeat(LINE_INPUT_MAX + 10)}`;
      const snapshot = await downloadOf(
        withEntities({ name: "Hugeparent Ltd", aliases: `${huge}; Hugeparent Short Alias` }),
      );

      // Booleans, so that a failure never prints a body of megabytes.
      expect(rowOf(snapshot, "hugeparent")?.aliases).toEqual(["Hugeparent Short Alias"]);
      expect(rowOf(snapshot, "hugeparent")?.names.some((text) => text.includes("Hugealias"))).toBe(
        false,
      );
      expect(snapshot.bodies[0].includes("shortened")).toBe(false);
      const records = canadaSemaConnector.parse(snapshot).records;
      const record = records.find((entry) => entry.sourceRecordId === "hugeparent");
      expect(record?.summary.includes("shortened")).toBe(false);
      expect(
        records.some((entry) => entry.matchKeys.some((key) => key.endsWith("shortened"))),
      ).toBe(false);
    });

    it("take no other name from a name that is over 230 characters: the record is unreadable, and no fragment of `(also known as ...)` is an alias", async () => {
      // A cut of the name would fall inside the parenthesis and leave a short fragment of the other
      // name that ends in the cut marker; the name is no name that fits, so there is no fragment.
      const name = `Akacut ${"p".repeat(150)} Ltd (also known as ${"w".repeat(100)})`;
      expect(name.length).toBeGreaterThan(230);
      const snapshot = await downloadOf(withEntities({ name }));

      expect(bodyOf(snapshot).rows.some((row) => row.id.startsWith("akacut"))).toBe(false);
      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(snapshot.bodies[0].includes("www")).toBe(false);
    });

    it("do not split a list of names with commas: such a part over 120 characters is no alias at all, and a short one is one alias", async () => {
      const list = Array.from({ length: 12 }, (_, i) => `Comma Name ${letters(i)}`).join(", ");
      expect(list.length).toBeGreaterThan(120);

      const snapshot = await downloadOf(
        withEntities(
          { name: "Listco Ltd", aliases: `${list}; Listco Short Alias` },
          { name: "Shortlist Ltd", aliases: "One, Two, Three", item: "13" },
        ),
      );

      expect(rowOf(snapshot, "listco")?.aliases).toEqual(["Listco Short Alias"]);
      expect(rowOf(snapshot, "shortlist")?.aliases).toEqual(["One, Two, Three"]);
      expect(snapshot.bodies[0]).not.toContain("Comma Name");
      expect(snapshot.bodies[0]).not.toContain("shortened");
    });

    it("take the text of '(also known as ...)' the same way: 120 characters are another name, 121 are none", async () => {
      const exact = `Akaname${"k".repeat(113)}`;
      const over = `Akaname${"k".repeat(114)}`;
      expect([exact.length, over.length]).toEqual([120, 121]);

      const kept = await downloadOf(withEntities({ name: `Akaco Ltd (also known as ${exact})` }));
      const dropped = await downloadOf(withEntities({ name: `Akaco Ltd (also known as ${over})` }));

      expect(rowOf(kept, "akaco")?.names).toEqual([
        `Akaco Ltd (also known as ${exact})`,
        "Akaco Ltd",
        exact,
      ]);
      // The primary name stays as the file writes it; the other name of 121 characters is gone, not shortened.
      expect(rowOf(dropped, "akaco")?.names).toEqual([
        `Akaco Ltd (also known as ${over})`,
        "Akaco Ltd",
      ]);
      expect(dropped.bodies[0]).not.toContain("shortened");
      const record = recordOfId(canadaSemaConnector.parse(dropped).records, "akaco");
      expect(record?.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
    });

    it("leave no key that ends in the cut marker in any record of a file whose aliases and other names are long", async () => {
      const lengths = [119, 120, 121, 122, 150, 300, 537, 100_000];
      const specs = lengths.flatMap((length, i): EntitySpec[] => [
        {
          name: `Wholeco ${letters(i)} Ltd`,
          // The part has a blank at 108 characters, where the cut of a read at 121 would fall.
          aliases: `${"w".repeat(Math.min(length, 108))}${length > 108 ? ` ${"w".repeat(length - 109)}` : ""}; Wholeco ${letters(i)} Short Alias`,
          item: String(20 + i),
        },
        // The other name inside the parenthesis, as long as the primary name may be.
        ...(length <= 190
          ? [
              {
                name: `Akaholder ${letters(i)} Ltd (also known as ${"a".repeat(length)})`,
                item: String(40 + i),
              },
            ]
          : []),
      ]);

      const snapshot = await downloadOf(withEntities(...specs));
      const parsed = canadaSemaConnector.parse(snapshot);

      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      // 1,100 entities of the base file and the new ones, each with its keys.
      expect(parsed.records).toHaveLength(
        1100 + lengths.length + lengths.filter((length) => length <= 190).length,
      );
      for (const record of parsed.records) {
        expect(record.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
      }
      // Nor does a name or an alias of the body carry the marker.
      expect(snapshot.bodies[0]).not.toContain("shortened");
      // What is kept of the entities with a long part: the primary name and the short alias.
      for (const [i, length] of lengths.entries()) {
        const row = rowOf(snapshot, `wholeco${letters(i)}`);
        expect(row?.aliases).toEqual(
          length <= 120
            ? [
                `${"w".repeat(Math.min(length, 108))}${length > 108 ? ` ${"w".repeat(length - 109)}` : ""}`,
                `Wholeco ${letters(i)} Short Alias`,
              ]
            : [`Wholeco ${letters(i)} Short Alias`],
        );
      }
    });

    it("are keys when they are in another script", async () => {
      const snapshot = await downloadOf(
        withEntities({ name: "Scriptco Ltd", aliases: cyrillic(7) }),
      );
      const record = recordOfId(canadaSemaConnector.parse(snapshot).records, "scriptco");
      expect(record?.matchKeys).toContain(
        `name:${cyrillic(7)
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "")}`,
      );
    });

    it("are read to 100 parts at the most, so that a record with a million of them costs no more", async () => {
      // A hundred in Cyrillic and then some that are Latin: the Latin ones are past the hundredth part.
      const parts = [
        ...Array.from({ length: 100 }, (_, i) => cyrillic(i)),
        ...Array.from({ length: 10 }, (_, i) => `Latin ${letters(i)}`),
      ];
      const snapshot = await downloadOf(
        withEntities({ name: "Partsco Ltd", aliases: parts.join(";") }),
      );

      expect(rowOf(snapshot, "partsco")?.aliases).toEqual(parts.slice(0, 8));
    });
  });

  describe("one record for each entity", () => {
    it("groups the records of one English name, the listings oldest first and three at the most", async () => {
      const spec = (item: string, day: string, country: string): EntitySpec => ({
        name: "Groupedco Ltd",
        item,
        day,
        country,
      });
      const snapshot = await downloadOf(
        withEntities(
          spec("14", "2023-05-05", "Iran"),
          spec("12", "2022-03-04", "Russia / Russie"),
          spec("13", "2022-03-04", "Belarus"),
          spec("15", "2024-06-06", "Myanmar (Burma)"),
          { name: "Groupedco Limited", item: "16", day: "2021-01-01", country: "Syria" },
        ),
      );

      const row = rowOf(snapshot, "groupedco");
      expect(row?.listings).toEqual([
        { regulation: "Syria", schedule: "1, Part 3", item: "16", day: "2021-01-01" },
        { regulation: "Belarus", schedule: "1, Part 3", item: "13", day: "2022-03-04" },
        { regulation: "Russia", schedule: "1, Part 3", item: "12", day: "2022-03-04" },
      ]);
      expect(row?.publishedAt).toBe("2021-01-01");
      expect(bodyOf(snapshot).rows.filter((entry) => entry.id === "groupedco")).toHaveLength(1);
    });

    it("keeps one listing of two records that say the same", async () => {
      const snapshot = await downloadOf(
        withEntities({ name: "Twiceco Ltd" }, { name: "Twiceco Ltd" }),
      );
      expect(rowOf(snapshot, "twiceco")?.listings).toHaveLength(1);
    });

    it("makes one record of a name and the same name with a legal form, with both listings, under one id whichever of them is listed", async () => {
      // The shape of the one pair of today's file: one regulation and schedule, two items, days years
      // apart, and a name that only has a legal form more than the other.
      const bare = { name: "Baredco", item: "12", day: "2015-03-02" };
      const formal = { name: "Baredco Ltd", item: "31", day: "2019-12-18" };

      const both = await downloadOf(withEntities(bare, formal));
      const reversed = await downloadOf(withEntities(formal, bare));
      const onlyBare = await downloadOf(withEntities(bare));
      const onlyFormal = await downloadOf(withEntities(formal));

      // Two entity records, one row: the records of the file are 3,102 and the rows 1,101.
      expect(bodyOf(both).total).toBe(3102);
      expect(bodyOf(both).unreadable).toBe(0);
      expect(bodyOf(both).rows).toHaveLength(1101);
      expect(bodyOf(both).rows.filter((entry) => entry.id === "baredco")).toHaveLength(1);
      const row = rowOf(both, "baredco");
      expect(row?.listings).toEqual([
        { regulation: "Russia", schedule: "1, Part 3", item: "12", day: "2015-03-02" },
        { regulation: "Russia", schedule: "1, Part 3", item: "31", day: "2019-12-18" },
      ]);
      expect(row?.name).toBe("Baredco");
      expect(row?.names).toEqual(["Baredco", "Baredco Ltd"]);
      expect(row?.publishedAt).toBe("2015-03-02");
      // Whatever the order of the file, and the id does not move when one of the two is delisted.
      expect(rowOf(reversed, "baredco")).toEqual(row);
      expect(rowOf(onlyBare, "baredco")?.listings).toHaveLength(1);
      expect(rowOf(onlyFormal, "baredco")?.listings).toHaveLength(1);
      // The record of the pair is well formed, and nothing is left out of the parse.
      const parsed = canadaSemaConnector.parse(both);
      expect(parsed.records).toHaveLength(1101);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(recordOfId(parsed.records, "baredco")?.summary).toContain(
        "Listed under the Russia regulations, schedule 1, Part 3, item 12, on 2015-03-02. " +
          "Listed under the Russia regulations, schedule 1, Part 3, item 31, on 2019-12-18.",
      );
    });

    it("shows the name that is first in the order of the listings, whatever the order of the file", async () => {
      const first = { name: "Orderco Ltd", item: "12", day: "2020-01-01" };
      const second = { name: "Orderco Limited", item: "13", day: "2021-01-01" };

      const forward = await downloadOf(withEntities(first, second));
      const backward = await downloadOf(withEntities(second, first));

      expect(rowOf(forward, "orderco")).toEqual(rowOf(backward, "orderco"));
      expect(rowOf(forward, "orderco")?.name).toBe("Orderco Ltd");
      expect(rowOf(forward, "orderco")?.names).toEqual(["Orderco Ltd", "Orderco Limited"]);
    });

    it("takes the spelling that is first in the order of the texts when two records list the same thing", async () => {
      const same = { item: "12", day: "2020-01-01" };

      const forward = await downloadOf(
        withEntities({ name: "Tieco Ltd", ...same }, { name: "Tieco Limited", ...same }),
      );
      const backward = await downloadOf(
        withEntities({ name: "Tieco Limited", ...same }, { name: "Tieco Ltd", ...same }),
      );

      expect(rowOf(forward, "tieco")).toEqual(rowOf(backward, "tieco"));
      expect(rowOf(forward, "tieco")?.name).toBe("Tieco Limited");
      expect(rowOf(forward, "tieco")?.names).toEqual(["Tieco Limited", "Tieco Ltd"]);
      expect(rowOf(forward, "tieco")?.listings).toHaveLength(1);
    });

    it("keeps at most twelve names and eight aliases of an entity that several records name", async () => {
      const aliases = (prefix: string): string =>
        Array.from({ length: 8 }, (_, i) => `${prefix} Alias ${letters(i)}`).join(";");

      const snapshot = await downloadOf(
        withEntities(
          { name: "Namesco Ltd", aliases: aliases("First"), item: "12", day: "2020-01-01" },
          { name: "Namesco Limited", aliases: aliases("Second"), item: "13", day: "2021-01-01" },
        ),
      );

      const row = rowOf(snapshot, "namesco");
      expect(row?.names).toHaveLength(12);
      expect(row?.names.slice(0, 3)).toEqual(["Namesco Ltd", "First Alias aaa", "First Alias aab"]);
      expect(row?.names[9]).toBe("Namesco Limited");
      expect(row?.aliases).toHaveLength(8);
      expect(row?.aliases.every((alias) => alias.startsWith("First"))).toBe(true);
    });

    it("gives an id that does not depend on the order of the file", async () => {
      const ids = async (reversed: boolean): Promise<string[]> => {
        const extra = ["Idone Ltd", "Idtwo Ltd", "Idthree Ltd"].map((name) => entityXml({ name }));
        return bodyOf(
          await downloadOf(filesOf(semaXml({ extra: reversed ? [...extra].reverse() : extra }))),
        ).rows.map((row) => row.id);
      };
      expect(await ids(false)).toEqual(await ids(true));
    });
  });

  describe("the record of an entity", () => {
    const standard: EntitySpec = {
      name: "Quillon Trading Ltd",
      country: "Russia / Russie",
      schedule: "1,Part 3",
      item: "123",
      day: "2022-03-04",
      aliases: "Quillon Alias A; Quillon Alias B",
    };

    it("is made with these exact values: type, title, summary, address, keys, identifiers and day", async () => {
      const records = await recordsOf(withEntities(standard));

      expect(recordOfId(records, "quillontrading")).toEqual({
        sourceRecordId: "quillontrading",
        recordType: "sanctions_entity",
        title: `${MARK}: Quillon Trading Ltd`,
        summary:
          `${HOST_SENTENCE} Entity: Quillon Trading Ltd. ` +
          "Listed under the Russia regulations, schedule 1, Part 3, item 123, on 2022-03-04. " +
          `Other names: Quillon Alias A; Quillon Alias B. ${CLOSING}`,
        url: `${DOCUMENTATION_URL}&entity=quillontrading`,
        identifiers: {
          entity: "Quillon Trading Ltd",
          listings: [
            { regulation: "Russia", schedule: "1, Part 3", item: "123", day: "2022-03-04" },
          ],
        },
        matchKeys: [
          "name:quillontradingltd",
          "name:quillontrading",
          "name:quillonaliasa",
          "name:quillonaliasb",
        ],
        publishedAt: "2022-03-04",
        sourceUpdatedAt: null,
      });
    });

    it("gives one record for each entity of the file, in the order of the body, and no other", async () => {
      const snapshot = await downloadOf(filesOf());
      const parsed = canadaSemaConnector.parse(snapshot);

      expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(
        bodyOf(snapshot).rows.map((row) => row.id),
      );
      expect(parsed.records).toHaveLength(1100);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).toBe("data-set");
      expect(parsed.sourceVersion).toBeNull();
    });

    it("is well formed for every entity of the file", async () => {
      expectWellFormedRecords(await recordsOf(withEntities(standard)), {
        sourceId: "canada_sema",
        mark: CANADA_SEMA_RECORD_MARK,
      });
    });

    it("begins every summary with the mark and the host, and ends it with the closing sentence", async () => {
      const records = await recordsOf(withEntities(standard));

      expect(records.length).toBeGreaterThan(1000);
      for (const record of records) {
        expect(record.summary.startsWith(HOST_SENTENCE)).toBe(true);
        expect(record.summary.endsWith(CLOSING)).toBe(true);
        expect(record.summary.length).toBeLessThanOrEqual(1300);
      }
    });

    it("gives each entity an address of its own: the page of the list and the entity", async () => {
      const records = await recordsOf(filesOf());

      expect(new Set(records.map((record) => record.url)).size).toBe(records.length);
      for (const record of records) {
        expect(record.url).toBe(
          `${DOCUMENTATION_URL}&entity=${encodeURIComponent(record.sourceRecordId)}`,
        );
      }
    });

    it("keys an entity by names only: no domain, no number and no LEI", async () => {
      const records = await recordsOf(filesOf());
      for (const record of records) {
        expect(record.matchKeys.every((key) => key.startsWith("name:"))).toBe(true);
      }
    });
  });

  describe("the summary of an entity", () => {
    const summaryOf = async (spec: EntitySpec, id: string): Promise<string> =>
      recordOfId(await recordsOf(withEntities(spec)), id)?.summary ?? "";

    it("leaves the schedule out when there is none, and writes the regulation without a second 'regulations'", async () => {
      const bare = await summaryOf({ name: "Nosched Ltd", schedule: null, item: "5" }, "nosched");
      const worded = await summaryOf(
        {
          name: "Worded Ltd",
          country: "Justice for Victims of Corrupt Foreign Officials Regulations",
        },
        "worded",
      );
      const lower = await summaryOf({ name: "Lower Ltd", country: "Syria regulations" }, "lower");

      expect(bare).toContain("Listed under the Russia regulations, item 5, on 2022-03-04. ");
      expect(bare).not.toContain("schedule");
      expect(worded).toContain(
        "Listed under the Justice for Victims of Corrupt Foreign Officials Regulations, schedule 1, Part 3, item 12, on 2022-03-04. ",
      );
      expect(worded).not.toContain("Regulations regulations");
      expect(lower).toContain("Listed under the Syria regulations, schedule ");
      expect(lower).not.toContain("regulations regulations");
    });

    it("leaves out the other names when there are none", async () => {
      const summary = await summaryOf({ name: "Noalias Ltd" }, "noalias");
      expect(summary).not.toContain("Other names");
      expect(summary).toContain(`on 2022-03-04. ${CLOSING}`);
    });

    it("writes one sentence for each listing, three at the most, the oldest first", async () => {
      const records = await recordsOf(
        withEntities(
          { name: "Listedco Ltd", item: "11", day: "2020-01-01", country: "Iran" },
          { name: "Listedco Ltd", item: "12", day: "2021-01-01", country: "Belarus" },
          { name: "Listedco Ltd", item: "13", day: "2022-01-01", country: "Syria" },
          { name: "Listedco Ltd", item: "14", day: "2023-01-01", country: "Ukraine" },
        ),
      );

      const summary = recordOfId(records, "listedco")?.summary ?? "";

      expect(summary).toContain(
        "Listed under the Iran regulations, schedule 1, Part 3, item 11, on 2020-01-01. " +
          "Listed under the Belarus regulations, schedule 1, Part 3, item 12, on 2021-01-01. " +
          "Listed under the Syria regulations, schedule 1, Part 3, item 13, on 2022-01-01. ",
      );
      expect(summary).not.toContain("Ukraine");
      expect(recordOfId(records, "listedco")?.publishedAt).toBe("2020-01-01");
    });

    it("shortens the name to 150 characters and the other names to 240, and shows a regulation of 100 whole", async () => {
      const long = `Longname${"b".repeat(190)} Ltd`;
      const aliases = Array.from({ length: 6 }, (_, i) => `Alias ${i} ${"c".repeat(60)}`).join(";");
      const records = await recordsOf(
        withEntities({ name: long, aliases, country: `Reg${"r".repeat(97)}`, item: "9" }),
      );
      const record = records.find((entry) => entry.sourceRecordId.startsWith("longname"));

      const shown = `${long.slice(0, 138).trimEnd()} [shortened]`;
      expect(shown).toHaveLength(150);
      expect(record?.title).toBe(`${MARK}: ${shown}`);
      expect(record?.summary).toContain(`Entity: ${shown}. `);
      expect(record?.summary).toContain(`Listed under the Reg${"r".repeat(97)} regulations, `);
      const others = / Other names: ([^.]*)\. /.exec(record?.summary ?? "")?.[1] ?? "";
      expect(others).toHaveLength(240);
      expect(others.endsWith(" [shortened]")).toBe(true);
    });

    it("keeps the closing sentence and fits 1,300 characters for the longest entity: it drops the youngest listings", async () => {
      const name = `Worst ${"aaaa ".repeat(40)}`.trim();
      const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const aliases = Array.from({ length: 8 }, (_, i) => `Alias ${i} ${"c".repeat(110)}`).join(
        ";",
      );
      // The longest regulation (100 characters) and the longest schedule (20) that are read.
      expect([`Regulation ${"r".repeat(89)}`.length, "1234567, Part 123456".length]).toEqual([
        100, 20,
      ]);
      const listing = (item: string, day: string): EntitySpec => ({
        name,
        aliases,
        country: `Regulation ${"r".repeat(89)}`,
        schedule: "1234567, Part 123456",
        item,
        day,
      });
      const snapshot = await downloadOf(
        withEntities(
          listing("1111", "2020-01-01"),
          listing("2222", "2021-01-01"),
          listing("3333", "2022-01-01"),
        ),
      );
      expect(rowOf(snapshot, id)?.listings).toHaveLength(3);

      const record = recordOfId(canadaSemaConnector.parse(snapshot).records, id);

      const summary = record?.summary ?? "";
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary.endsWith(CLOSING)).toBe(true);
      expect(summary.startsWith(HOST_SENTENCE)).toBe(true);
      // Three listings would be longer than the room that the closing sentence leaves: two are shown.
      expect(summary.match(/Listed under the /g)).toHaveLength(2);
      expect(summary).toContain("item 1111, on 2020-01-01. ");
      expect(summary).toContain("item 2222, on 2021-01-01. ");
      expect(summary).not.toContain("item 3333");
      expectWellFormedRecords([record as ParsedRecord], { sourceId: "canada_sema", mark: MARK });
    });
  });

  describe("hostile text in the file", () => {
    const hostileFile = (): Record<string, FakeFile> =>
      filesOf(
        semaXml({
          extra: [
            entityXml({ name: "Evil\u0000Control\u0007Chars Ltd" }),
            entityXml({ name: "Bidi‮override⁦Isolate Ltd" }),
            entityXml({ name: "<script>alert(1)</script> Markupco Ltd" }),
            entityXml({ name: `Longcell${"a".repeat(100_000)} Ltd` }),
            entityXml({ name: "Surrogate\ud800Lone Ltd" }),
            entityXml({ name: "Zero​width­soft﻿hidden Ltd" }),
            entityXml({
              name: "Tab\tand\nbreak\r\nco Ltd",
              aliases: `<b>Bold</b>; ${"x".repeat(100_000)}`,
            }),
          ],
        }),
      );

    it("writes records that are well formed whatever the cells hold", async () => {
      const parsed = canadaSemaConnector.parse(await downloadOf(hostileFile()));

      expectWellFormedRecords(parsed.records, { sourceId: "canada_sema", mark: MARK });
      // The alias of 100,000 characters is no alias: no key of any record ends in the cut marker.
      for (const record of parsed.records) {
        expect(record.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
      }
      // The name of 100,000 characters does not fit: its record is unreadable (counted, within the
      // allowance), and no other is lost.
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(1);
      expect(parsed.records).toHaveLength(1106);
      for (const record of parsed.records) expect(record.summary.endsWith(CLOSING)).toBe(true);
    });

    it("cleans every cell of the body: no control, hidden or lone surrogate character, and no cell of 100,000 characters", async () => {
      const snapshot = await downloadOf(hostileFile());

      const strings: string[] = [];
      const collect = (value: unknown): void => {
        if (typeof value === "string") strings.push(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (typeof value === "object" && value !== null) Object.values(value).forEach(collect);
      };
      collect(bodyOf(snapshot).rows);

      expect(strings.length).toBeGreaterThan(1000);
      for (const text of strings) {
        expect(text).not.toMatch(/[\p{Cc}\p{Cf}\u{D800}-\u{DFFF}]/u);
        expect(text.length).toBeLessThanOrEqual(240);
      }
      // A cell that does not fit is no record: nothing of it is in the body.
      expect(snapshot.bodies[0]).not.toContain("a".repeat(300));
      expect(bodyOf(snapshot).unreadable).toBe(1);
    });

    it("writes the angle brackets of a name as the quotation marks that no markup is made of", async () => {
      const records = await recordsOf(hostileFile());

      const record = records.find((entry) => entry.sourceRecordId.startsWith("scriptalert1script"));

      expect(record?.title).toContain("‹script›alert(1)‹/script›");
      for (const entry of records) expect(`${entry.title}${entry.summary}`).not.toMatch(/[<>]/);
    });
  });

  describe("what the files hold that the records must not", () => {
    it("keeps none of the elements of an individual or a ship, and none that it does not name", async () => {
      const snapshot = await downloadOf(
        withEntities({
          name: "Extrasco Ltd",
          extra: [
            [TAG.born, "ZZ-BORN"],
            ["Other-Element", "ZZ-OTHER"],
          ],
        }),
      );
      // The date of birth makes a record an individual's: it is skipped altogether.
      expect(snapshot.bodies[0]).not.toContain("Extrasco");

      const kept = await downloadOf(
        withEntities({ name: "Extrasco Ltd", extra: [["Other-Element", "ZZ-OTHER"]] }),
      );
      expect(rowOf(kept, "extrasco")).toBeDefined();
      expect(kept.bodies[0]).not.toContain("ZZ-OTHER");
    });

    it("has rows of these fields only", async () => {
      const snapshot = await downloadOf(filesOf());

      const keys = new Set<string>();
      for (const row of bodyOf(snapshot).rows) {
        Object.keys(row).forEach((key) => keys.add(key));
        for (const listing of row.listings)
          Object.keys(listing).forEach((key) => keys.add(`listing.${key}`));
      }

      expect([...keys].sort()).toEqual(
        [
          "aliases",
          "id",
          "listing.day",
          "listing.item",
          "listing.regulation",
          "listing.schedule",
          "listings",
          "name",
          "names",
          "publishedAt",
        ].sort(),
      );
    });
  });

  describe("determinism", () => {
    const extra = (): string[] =>
      [
        { name: "Tiebreak Corp", item: "12", day: "2020-01-01" },
        { name: "TieBreak Corp", item: "13", day: "2020-01-01", country: "Iran" },
        { name: "Alpha Group (also known as Beta Union)", aliases: "One; Two; Three" },
        { name: "XYZ", aliases: "Examplebank Joint Stock Company" },
      ].map(entityXml);

    it("gives the same bodies and the same records whatever the order of the records of the file", async () => {
      await expectDeterministic(canadaSemaConnector, (reversed) =>
        fakeFetch(filesOf(semaXml({ extra: extra(), reversed }))),
      );
    });
  });

  describe("the parse of a body", () => {
    async function bodyWithBadRows(count: number, id: (i: number) => string): Promise<Snapshot> {
      const snapshot = await downloadOf(filesOf());
      const body = bodyOf(snapshot);
      const bad = Array.from({ length: count }, (_, i) => ({ ...body.rows[0], id: id(i) }));
      return {
        ...snapshot,
        bodies: [
          JSON.stringify({ ...body, rows: [...body.rows, ...bad], total: body.total + count }),
        ],
      };
    }

    it("counts a row whose id is no id as skipped up to the allowance, and as an error beyond", async () => {
      const rows = 1100;
      for (const count of [1, 11, 12, 40]) {
        const parsed = canadaSemaConnector.parse(
          await bodyWithBadRows(count, (i) => `\u0000bad${i}`),
        );
        const refused = count > unreadableAllowed(rows + count);

        expect(parsed.records).toHaveLength(rows);
        expect(parsed.errors).toBe(refused ? count : 0);
        expect(parsed.skipped).toBe(refused ? 0 : count);
      }
    });

    it("refuses an id of more than 200 characters, and an empty one", async () => {
      const parsed = canadaSemaConnector.parse(
        await bodyWithBadRows(2, (i) => (i === 0 ? "" : "x".repeat(201))),
      );
      expect(parsed.skipped).toBe(2);
      expect(parsed.records).toHaveLength(1100);
    });

    it("is no list when the body is not the body of this connector", () => {
      const parsed = canadaSemaConnector.parse({
        bodies: ['{"v":2,"rows":[],"total":0,"unreadable":0}'],
        etag: "k1:",
        lastModified: null,
        bytes: 0,
      });
      expect(parsed).toEqual({ records: [], errors: 1, sourceVersion: null, root: null });
    });

    it("allows a few unreadable records and fails the parse for more: ten, or a hundredth of the rows", async () => {
      const bad = (i: number): string =>
        entityXml({ name: `Brokenco${letters(i)} Ltd`, item: "x" });
      for (const count of [0, 1, 11, 12, 30]) {
        const snapshot = await downloadOf(
          filesOf(semaXml({ extra: Array.from({ length: count }, (_, i) => bad(i)) })),
        );
        const parsed = canadaSemaConnector.parse(snapshot);
        const refused = count > unreadableAllowed(1100 + count);

        expect(bodyOf(snapshot).unreadable).toBe(count);
        expect(parsed.errors).toBe(refused ? count : 0);
        expect(parsed.skipped).toBe(refused ? 0 : count);
        expect(parsed.records).toHaveLength(1100);
        expect(parsed.root).toBe("data-set");
      }
    });
  });

  describe("what a run says and keeps", () => {
    it("logs nothing, whatever the file holds", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        const snapshot = await downloadOf(filesOf());
        canadaSemaConnector.parse(snapshot);
        await failureOf(canadaSemaConnector.download(fakeFetch({}), {}));
        await failureOf(canadaSemaConnector.download(fakeFetch(filesOf("<html/>")), {}));
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });

    it("fails with errors that name no address, no file and no entity", async () => {
      const failures = await Promise.all([
        failureOf(canadaSemaConnector.download(fakeFetch(filesOf("<data-set><record>")), {})),
        failureOf(
          canadaSemaConnector.download(fakeFetch(filesOf(semaXml(), { truncated: true })), {}),
        ),
      ]);

      for (const failure of failures) {
        expect(failure).toBeInstanceOf(Error);
        for (const part of ["Zorbex", "sema-lmes", "https", "international.gc.ca", "record"]) {
          expect((failure as Error).message).not.toContain(part);
        }
      }
    });
  });
});
