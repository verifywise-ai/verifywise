import { ofacSourceOf } from "../../vrdb/connectors/ofac";
import {
  MAX_OFAC_REMARKS_CHARS,
  NAME_ONLY_LOOKUP_NOTE,
  OFAC_ALT_URL,
  OFAC_SDN_URL,
  type OfacList,
  ofacEntryUrl,
  parseCsv,
  parseOfac,
} from "../ofac";

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

describe("ofacSourceOf", () => {
  // The text of a record is what the model reads and quotes, word for word the list's. The
  // connector of the vendor risk database builds it; the run no longer matches the list itself.
  const sourceOf = (list: OfacList, id: number) => {
    const entry = list.byId.get(id);
    if (entry === undefined) throw new Error(`no entry ${id} in the list`);
    return ofacSourceOf(entry);
  };
  const list = parseOfac(SDN, ALT);

  it("gives the entity as a source: the words of the list, at the page of its entry", () => {
    const record = sourceOf(list, 9001);

    expect(record).toEqual({
      url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=9001",
      title: "OFAC SDN list: NORTHWIND TRADING LLC",
      text: expect.stringContaining('Entry: "NORTHWIND TRADING LLC" (entity).'),
    });
    expect(ofacEntryUrl(9001)).toBe(record.url);
  });

  it("begins the text with the name of the list", () => {
    const { text } = sourceOf(list, 9001);

    expect(text.startsWith("OFAC Specially Designated Nationals and Blocked Persons List")).toBe(
      true,
    );
    expect(text).toContain("(treasury.gov).");
  });

  it("says nothing of a match or of a day: the lookup adds the note and the day", () => {
    const { text } = sourceOf(list, 9001);

    expect(text).not.toMatch(/Lookup note|by name only|On the list on/);
  });

  it("tells the programs, the other names and the remarks of the entry, in the words of the list", () => {
    const { text } = sourceOf(list, 9001);

    expect(text).toContain("Programs: RUSSIA-EO14024, UKRAINE-EO13662.");
    expect(text).toContain('Also listed as: "OLD NORTHWIND TRADING" (fka).');
    expect(text).toContain(
      'Remarks: Website northwind-trading.example; Registration ID 1234; formerly "Old Northwind".',
    );
  });

  it("writes a name that ends with a full stop as the list has it", () => {
    expect(sourceOf(list, 537).text).toContain('Entry: "CIMEX, S.A." (entity).');
  });

  it("cuts the remarks and the other names", () => {
    const longRemark = "x".repeat(MAX_OFAC_REMARKS_CHARS + 500);
    const aliases = Array.from({ length: 12 }, (_, i) => altRow(40, i + 1, "aka", `ALIAS ${i}`));
    const big = parseOfac(sdnRow(40, "BIGNAME HOLDINGS", NIL, "X", longRemark), aliases.join("\n"));

    const { text } = sourceOf(big, 40);

    // A remark with no ';' and no blank is cut hard, short of the marker, so that the remark and
    // the marker that says it was shortened are 600 characters together.
    const marker = " [shortened]";
    const kept = "x".repeat(MAX_OFAC_REMARKS_CHARS - marker.length);
    expect(text).toContain(`Remarks: ${kept}${marker}.`);
    expect(text).not.toContain("x".repeat(kept.length + 1));
    expect(text).toContain('"ALIAS 5" (aka)');
    expect(text).not.toContain('"ALIAS 6" (aka)');
  });
});

describe("NAME_ONLY_LOOKUP_NOTE", () => {
  it("says that the vendor was matched by name only and may be another company with the same name", () => {
    expect(NAME_ONLY_LOOKUP_NOTE).toContain("by name only");
    expect(NAME_ONLY_LOOKUP_NOTE).toContain("may be another company with the same name");
    expect(NAME_ONLY_LOOKUP_NOTE.startsWith("Lookup note:")).toBe(true);
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
