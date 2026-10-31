import { nameKeys } from "../match";
import {
  MAX_OFAC_REMARKS_CHARS,
  OFAC_ALT_URL,
  OFAC_SDN_URL,
  ofacEntryUrl,
  ofacRecords,
  parseCsv,
  parseOfac,
} from "../ofac";
import { MAX_RECORDS } from "../types";

const NOW = new Date("2026-10-28T12:00:00Z");

/** The files as the Treasury serves them: no header row, `-0- ` for a field with nothing in it. */
const NIL = "-0- ";
const sdnRow = (id: number, name: string, type: string, program: string, remarks = NIL): string =>
  [
    id,
    `"${name.replace(/"/g, '""')}"`,
    type,
    `"${program}"`,
    NIL,
    NIL,
    NIL,
    NIL,
    NIL,
    NIL,
    NIL,
    remarks === NIL ? NIL : `"${remarks.replace(/"/g, '""')}"`,
  ].join(",");
const altRow = (id: number, altId: number, type: string, name: string): string =>
  `${id},${altId},"${type}","${name}",${NIL}`;

const SDN = [
  sdnRow(36, "AEROCARIBBEAN AIRLINES", NIL, "CUBA"),
  sdnRow(306, "BANCO NACIONAL DE CUBA", NIL, "CUBA", "a.k.a. 'BNC'."),
  sdnRow(537, "CIMEX, S.A.", NIL, "CUBA"),
  sdnRow(
    9001,
    "NORTHWIND TRADING LLC",
    NIL,
    "RUSSIA-EO14024] [UKRAINE-EO13662",
    'Website northwind-trading.example; Registration ID 1234; formerly "Old Northwind".',
  ),
  sdnRow(9002, "NORTHWIND, John", '"individual"', "SDGT", "DOB 01 Jan 1970."),
  sdnRow(9003, "NORTHWIND STAR", '"vessel"', "IRAN"),
  sdnRow(9004, "NORTHWIND AIR", '"aircraft"', "IRAN"),
].join("\n");

const ALT = [
  altRow(36, 12, "aka", "AERO-CARIBBEAN"),
  altRow(537, 481, "aka", "CIMEX IBERICA"),
  altRow(9001, 5000, "fka", "OLD NORTHWIND TRADING"),
  altRow(9002, 5001, "aka", "JOHNNY NORTHWIND"),
].join("\n");

const keysOf = (name: string, aliases: string[] = []) =>
  nameKeys({ name, domain: null, provides: "Something", aliases });

describe("parseCsv", () => {
  it("reads rows of fields, a quoted field holding commas, quotes and line breaks", () => {
    const rows = parseCsv('1,"CIMEX, S.A.",plain\n2,"say ""hi""","two\nlines"\n');

    expect(rows).toEqual([
      ["1", "CIMEX, S.A.", "plain"],
      ["2", 'say "hi"', "two\nlines"],
    ]);
  });

  it("reads CRLF line ends, a last row with no line end, and skips blank lines", () => {
    expect(parseCsv('a,b\r\n\r\n"c",d')).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps an empty field and the null mark of the files as they are", () => {
    expect(parseCsv(`1,,${NIL},""\n`)).toEqual([["1", "", NIL, ""]]);
  });

  it("ends at the end of the text for a quote that is never closed", () => {
    expect(parseCsv('1,"never closed, 2\n3,4')).toEqual([["1", "never closed, 2\n3,4"]]);
  });

  it("stops at the row limit", () => {
    expect(parseCsv("a\nb\nc\nd\n", 2)).toEqual([["a"], ["b"]]);
  });

  it("reads a long file in linear time", () => {
    const text = Array.from({ length: 120_000 }, (_, i) =>
      sdnRow(i + 1, `NAME ${i}`, NIL, "X"),
    ).join("\n");
    const startedAt = Date.now();

    const rows = parseCsv(text);

    expect(rows).toHaveLength(120_000);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("reads a field made to be slow in linear time", () => {
    const startedAt = Date.now();

    parseCsv(`1,"${'""'.repeat(400_000)}`);
    parseCsv(`${",".repeat(400_000)}\n`);

    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});

describe("parseOfac", () => {
  it("keeps the entities of the list, and leaves out the individuals, the vessels and the aircraft", () => {
    const list = parseOfac(SDN, ALT);

    expect(list.entities).toBe(4);
  });

  it("is an error for text that holds no entity, since it is not the list", () => {
    expect(() => parseOfac("<html><body>Service unavailable</body></html>", "")).toThrow(
      /no entity/,
    );
    expect(() => parseOfac(sdnRow(9002, "NORTHWIND, John", '"individual"', "SDGT"), "")).toThrow(
      /no entity/,
    );
  });

  it("passes over a row with no number or no name", () => {
    const list = parseOfac(
      [
        "ent_num,SDN_Name,SDN_Type",
        sdnRow(0, "ZERO", NIL, "X"),
        `12,"",${NIL},"X"`,
        sdnRow(37, "VALID ENTITY", NIL, "X"),
      ].join("\n"),
      "",
    );

    expect(list.entities).toBe(1);
  });
});

describe("ofacRecords", () => {
  const list = parseOfac(SDN, ALT);
  const recordsFor = (keys: string[]) => ofacRecords(list, { keys, now: NOW });

  it("gives a record for the entity that has the name of the vendor, at the page of its entry", () => {
    const { records, omitted } = recordsFor(keysOf("Northwind Trading"));

    expect(omitted).toEqual({});
    expect(records).toEqual([
      {
        url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=9001",
        title: "OFAC SDN list: NORTHWIND TRADING LLC",
        text: expect.stringContaining('Entry: "NORTHWIND TRADING LLC" (entity).'),
        publishedAt: "2026-10-28",
      },
    ]);
    expect(ofacEntryUrl(9001)).toBe(records[0].url);
  });

  it("begins the text with the name of the list, and says what the match is", () => {
    const [record] = recordsFor(keysOf("Northwind Trading")).records;

    expect(
      record.text.startsWith("OFAC Specially Designated Nationals and Blocked Persons List"),
    ).toBe(true);
    expect(record.text).toContain("(treasury.gov).");
    expect(record.text).toContain("by name only");
    expect(record.text).toContain("may be another company with the same name");
    expect(record.text).toContain("On the list on 2026-10-28.");
  });

  it("tells the programs, the other names and the remarks of the entry, in the words of the list", () => {
    const [record] = recordsFor(keysOf("Northwind Trading")).records;

    expect(record.text).toContain("Programs: RUSSIA-EO14024, UKRAINE-EO13662.");
    expect(record.text).toContain('Also listed as: "OLD NORTHWIND TRADING" (fka).');
    expect(record.text).toContain(
      'Remarks: Website northwind-trading.example; Registration ID 1234; formerly "Old Northwind".',
    );
  });

  it("writes a name that ends with a full stop as the list has it", () => {
    const [record] = recordsFor(keysOf("Cimex")).records;

    expect(record.text).toContain('Entry: "CIMEX, S.A." (entity).');
  });

  it("matches the name with its legal form on either side, since the form is not part of a name", () => {
    expect(recordsFor(keysOf("Cimex Corp")).records.map((r) => r.title)).toEqual([
      "OFAC SDN list: CIMEX, S.A.",
    ]);
    expect(recordsFor(keysOf("Northwind Trading Inc.")).records).toHaveLength(1);
  });

  it("matches a name the entry is also listed under", () => {
    expect(recordsFor(keysOf("Aero-Caribbean")).records.map((r) => r.url)).toEqual([
      ofacEntryUrl(36),
    ]);
    expect(recordsFor(keysOf("Acme", ["Cimex Iberica"])).records.map((r) => r.url)).toEqual([
      ofacEntryUrl(537),
    ]);
  });

  it("does not match a name that only contains or begins with the name of an entry", () => {
    expect(recordsFor(keysOf("Cimex Iberica Trading")).records).toEqual([]);
    expect(recordsFor(keysOf("Banco Nacional")).records).toEqual([]);
    expect(recordsFor(keysOf("Northwind")).records).toEqual([]);
  });

  it("does not match a person, a vessel or an aircraft that has the name", () => {
    expect(recordsFor(keysOf("Northwind Star")).records).toEqual([]);
    expect(recordsFor(keysOf("Northwind Air")).records).toEqual([]);
    expect(recordsFor(keysOf("Johnny Northwind")).records).toEqual([]);
  });

  it("does not match a name of fewer than four letters and digits", () => {
    const short = parseOfac(sdnRow(77, "ABC", NIL, "X"), "");

    expect(ofacRecords(short, { keys: keysOf("ABC"), now: NOW }).records).toEqual([]);
    const four = parseOfac(sdnRow(78, "ABCD", NIL, "X"), "");
    expect(ofacRecords(four, { keys: keysOf("ABCD"), now: NOW }).records).toHaveLength(1);
  });

  it("matches without regard to case and punctuation", () => {
    const named = parseOfac(sdnRow(5, "SOCIÉTÉ D'EXPORT-IMPORT", NIL, "X"), "");

    expect(
      ofacRecords(named, { keys: keysOf("société d'export import"), now: NOW }).records,
    ).toHaveLength(1);
  });

  it("gives each entity once, whichever names of the vendor it matches, in the order of the numbers", () => {
    const both = parseOfac(
      [sdnRow(900, "ZEDCO CORP", NIL, "X"), sdnRow(100, "ZEDCO", NIL, "X")].join("\n"),
      "",
    );

    const { records, omitted } = ofacRecords(both, {
      keys: keysOf("Zedco Corp", ["Zedco"]),
      now: NOW,
    });

    expect(records.map((r) => r.url)).toEqual([ofacEntryUrl(100), ofacEntryUrl(900)]);
    expect(omitted).toEqual({});
  });

  it(`gives at most ${MAX_RECORDS.ofac} records and counts the others`, () => {
    const many = parseOfac(
      [1, 2, 3, 4].map((id) => sdnRow(id, "SAMENAME TRADING LLC", NIL, "X")).join("\n"),
      "",
    );

    const { records, omitted } = ofacRecords(many, {
      keys: keysOf("Samename Trading"),
      now: NOW,
    });

    expect(records).toHaveLength(MAX_RECORDS.ofac);
    expect(omitted).toEqual({ more: 4 - MAX_RECORDS.ofac });
  });

  it("gives nothing for a vendor with no name to look for", () => {
    expect(recordsFor([]).records).toEqual([]);
  });

  it("cuts the remarks and the other names", () => {
    const longRemark = "x".repeat(MAX_OFAC_REMARKS_CHARS + 500);
    const aliases = Array.from({ length: 12 }, (_, i) => altRow(40, i + 1, "aka", `ALIAS ${i}`));
    const big = parseOfac(sdnRow(40, "BIGNAME HOLDINGS", NIL, "X", longRemark), aliases.join("\n"));

    const [record] = ofacRecords(big, { keys: keysOf("Bigname Holdings"), now: NOW }).records;

    expect(record.text).toContain(`Remarks: ${"x".repeat(MAX_OFAC_REMARKS_CHARS)}.`);
    expect(record.text).not.toContain("x".repeat(MAX_OFAC_REMARKS_CHARS + 1));
    expect(record.text).toContain('"ALIAS 5" (aka)');
    expect(record.text).not.toContain('"ALIAS 6" (aka)');
  });

  it("takes the day of the record from the clock it is given", () => {
    const [record] = ofacRecords(list, {
      keys: keysOf("Cimex"),
      now: new Date("2031-01-02T23:59:59Z"),
    }).records;

    expect(record.publishedAt).toBe("2031-01-02");
    expect(record.text).toContain("On the list on 2031-01-02.");
  });
});

describe("the addresses of the files", () => {
  it("are the Sanctions List Service exports of the Treasury, over https", () => {
    expect(OFAC_SDN_URL).toBe(
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV",
    );
    expect(OFAC_ALT_URL).toBe(
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV",
    );
  });
});
