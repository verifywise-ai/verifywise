/**
 * The OFAC connector (spec D4.1): the entities of the SDN list, with the other names of ALT.CSV, as
 * records of the vendor risk database. The fixtures are written from the Treasury's description of
 * the files (no header row, `-0- ` for an empty field), with fictional names.
 */
import fs from "fs";
import path from "path";
import { NAME_ONLY_LOOKUP_NOTE, OFAC_ALT_URL, OFAC_SDN_URL } from "../../../records/ofac";
import { ofacConnector } from "../ofac";
import type { ConnectorFetch } from "../types";

const SDN = fs.readFileSync(path.join(__dirname, "fixtures/ofac-sdn.csv"), "utf8");
const ALT = fs.readFileSync(path.join(__dirname, "fixtures/ofac-alt.csv"), "utf8");
const parse = (sdn = SDN, alt = ALT) =>
  ofacConnector.parse({ bodies: [sdn, alt], etag: null, lastModified: null, bytes: 0 });
const recordOf = (id: string, sdn = SDN, alt = ALT) =>
  parse(sdn, alt).records.find((record) => record.sourceRecordId === id);

describe("ofacConnector.parse", () => {
  it("reads the CSV without a header and -0- as empty", () => {
    const { errors, root } = parse();

    expect(errors).toBe(0);
    expect(root).toBe("SDN.CSV");
    expect(recordOf("7001")).toMatchObject({
      recordType: "sanctions_entity",
      title: "OFAC SDN list: NORTHWIND EXPORT COMPANY",
      url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=7001",
      publishedAt: null,
      sourceUpdatedAt: null,
      identifiers: { programs: ["SDGT", "IRAN"] },
    });
    expect(recordOf("7001")?.summary).toContain("Programs: SDGT, IRAN.");
    expect(recordOf("7005")?.summary).toBe(
      'OFAC Specially Designated Nationals and Blocked Persons List (treasury.gov). Entry: "ACME ANALYTICS" (entity). Programs: CYBER2.',
    );
  });

  it("keeps entities and drops individuals, vessels and aircraft", () => {
    expect(parse().records.map((record) => record.sourceRecordId)).toEqual(["7001", "7005"]);
  });

  it("adds the aliases of ALT.CSV as name keys", () => {
    expect(recordOf("7001")?.matchKeys).toEqual(
      expect.arrayContaining([
        "name:northwindexportcompany",
        "name:northwindtrading",
        "name:northwindexportslimited",
        "name:northwindexports",
      ]),
    );
    expect(recordOf("7001")?.summary).toContain(
      'Also listed as: "NORTHWIND TRADING" (aka), "NORTHWIND EXPORTS LIMITED" (fka).',
    );
    expect(recordOf("7005")?.matchKeys).toEqual(["name:acmeanalytics"]);
  });

  it("holds neither the lookup note nor a day, which the lookup adds", () => {
    const summary = recordOf("7005")?.summary ?? "";

    expect(summary).not.toMatch(/Lookup note|On the list on/);
    expect(summary).not.toContain(NAME_ONLY_LOOKUP_NOTE);
  });

  it("counts a row with a number that is no entry number as an error, and skips a blank one", () => {
    const sdn = `${SDN}x7,"BROKEN ROW",-0- ,"SDGT"\r\n\r\n\u001a\r\n`;

    expect(parse(sdn).errors).toBe(1);
  });

  it("counts an SDN file cut inside its last row as an error, in a quoted field or between fields", () => {
    const rows = SDN.trimEnd().split("\r\n");
    const last = rows[rows.length - 1];
    expect(last.startsWith("7005,")).toBe(true);
    const withoutLast = SDN.slice(0, SDN.lastIndexOf(last));

    const inQuotes = parse(`${withoutLast}7005,"ACME ANALY`);
    const betweenFields = parse(`${withoutLast}7005,"ACME ANALYTICS",-0- ,"CYBER2"`);

    expect(inQuotes.errors).toBe(1);
    expect(betweenFields.errors).toBe(1);
    expect(betweenFields.records.map((record) => record.sourceRecordId)).toEqual(["7001"]);
  });

  it("counts a row of SDN.CSV without 12 fields, and one of ALT.CSV without 5, as an error", () => {
    const short = `${SDN}7006,"SHORT ROW LLC",-0- ,"SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- \r\n`;
    const long = `${SDN}7007,"LONG ROW LLC",-0- ,"SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"extra"\r\n`;
    const shortAlias = `${ALT}7005,504,"aka"\r\n`;

    expect(parse(short).errors).toBe(1);
    expect(parse(long).errors).toBe(1);
    expect(parse(SDN, shortAlias).errors).toBe(1);
  });

  it("counts an ALT.CSV cut inside its last row, or without a row, as an error", () => {
    expect(parse(SDN, `${ALT}7005,505,"aka","ACME ANA`).errors).toBe(1);
    expect(parse(SDN, "").errors).toBe(1);
    expect(parse(SDN, "\r\n\u001a").errors).toBe(1);
  });

  it("counts a file of more rows than the list can hold as an error: it is not the list", () => {
    // End-of-file marks are rows that hold nothing, so the only error is the count.
    const marks = "\u001a\n".repeat(400_000);

    expect(parse(SDN, `${ALT}${marks}`).errors).toBe(1);
    expect(parse(SDN, `${ALT}${"\u001a\n".repeat(10)}`).errors).toBe(0);
  });

  it("gives no root for a file that holds no entry", () => {
    expect(parse("<html>Maintenance</html>", "")).toMatchObject({ records: [], root: null });
  });
});

describe("ofacConnector.parse, the remarks of a long entry", () => {
  // The list writes the identifiers, websites and dates of an entry as items between ';'. In the
  // real file checked on 2026-10-31, 120 of the 9,772 entities with remarks have more than 600
  // characters (the longest 1,000) and no item is longer than 335, so each has a ';' to cut at.
  const MARKER = " [shortened]";
  const LIMIT = 600;
  /** What stays of a long remark: the marker is part of its 600 characters. */
  const ROOM = LIMIT - MARKER.length;
  const EMOJI = String.fromCodePoint(0x1f600);

  /** An item as the list writes the identifiers of an entry: 98 characters, with blanks in it. */
  const item = (n: number): string =>
    `Registration ID ${String(n).padStart(4, "0")} (Example)`.padEnd(98, "x");

  /**
   * The remarks of a lone entity as its record shows them: after "Remarks: ", without the full
   * stop. The remarks go into a quoted field as they are, so they hold no double quote.
   */
  function shown(remarks: string): string {
    const sdn = `7010,"LONG REMARKS LLC",-0- ,"SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"${remarks}"\r\n`;
    const summary = recordOf("7010", sdn, "")?.summary ?? "";
    const lead = "Remarks: ";
    expect(summary).toContain(lead);
    expect(summary.endsWith(".")).toBe(true);
    return summary.slice(summary.indexOf(lead) + lead.length, -1);
  }

  it("cuts a remark of more than 600 characters at the last ';' that leaves room for the marker", () => {
    const items = Array.from({ length: 8 }, (_, n) => item(n));
    const remarks = items.join("; ");
    // The separators are at 98, 198, ... 698. The last one within the room of 588 is the fifth, at
    // 498, and the blanks of the sixth item come after it: a cut at a blank would keep more.
    expect(remarks).toHaveLength(798);
    expect(remarks.lastIndexOf(";", ROOM)).toBe(498);
    expect(remarks.lastIndexOf(" ", ROOM)).toBeGreaterThan(498);

    expect(shown(remarks)).toBe(`${items.slice(0, 5).join("; ")}${MARKER}`);
  });

  it("takes a ';' right behind the room as the end of the text, but not one past it", () => {
    const words = "word ".repeat(117);
    const whole = `${words}wor`;
    const justPast = `${words}wora`;
    expect([whole.length, justPast.length]).toEqual([ROOM, ROOM + 1]);

    // The ';' at 588 ends an item that fits, and is itself left out.
    expect(shown(`${whole}; ${"tail ".repeat(40)}`)).toBe(`${whole}${MARKER}`);
    // The ';' at 589 would take the remark and its marker to 601 characters: the last blank is the cut.
    expect(shown(`${justPast}; ${"tail ".repeat(40)}`)).toBe(`${"word ".repeat(116)}word${MARKER}`);
  });

  it("cuts at the last blank when no ';' leaves room, and not inside a word", () => {
    const remarks = `${"abcdefghi ".repeat(70)}more; text`;
    // The blanks are at 9, 19, ... and the last one within the room is at 579; the only ';' is far past it.
    expect(remarks.lastIndexOf(" ", ROOM)).toBe(579);
    expect(remarks.lastIndexOf(";", ROOM)).toBe(-1);

    expect(shown(remarks)).toBe(`${"abcdefghi ".repeat(57)}abcdefghi${MARKER}`);
  });

  it("takes a tab or a line break for a blank", () => {
    // The line breaks are at 9, 19, ... as the blanks of the test before.
    expect(shown("abcdefghi\n".repeat(70))).toBe(`${"abcdefghi\n".repeat(57)}abcdefghi${MARKER}`);
    expect(shown("abcdefghi\t".repeat(70))).toBe(`${"abcdefghi\t".repeat(57)}abcdefghi${MARKER}`);
  });

  it("leaves no blank in front of the marker, however the text was spaced", () => {
    // A ';' set off by a blank (the last at 586), and two blanks in a row at the cut (at 581 and 582).
    expect(shown("abcdefghi ; ".repeat(60))).toBe(`${"abcdefghi ; ".repeat(48)}abcdefghi${MARKER}`);
    expect(shown("abcdefghi  ".repeat(60))).toBe(`${"abcdefghi  ".repeat(52)}abcdefghi${MARKER}`);
  });

  it("does not leave an empty remark when the only ';' within the room is the first character", () => {
    const remarks = `;${"abcdefghi ".repeat(70)}`;
    expect(remarks.lastIndexOf(";", ROOM)).toBe(0);

    expect(shown(remarks)).toBe(`;${"abcdefghi ".repeat(57)}abcdefghi${MARKER}`);
  });

  it("cuts hard when there is neither a ';' nor a blank to cut at", () => {
    expect(shown("x".repeat(1100))).toBe(`${"x".repeat(ROOM)}${MARKER}`);
    expect(shown(`${"R".repeat(600)}TAIL`)).toBe(`${"R".repeat(ROOM)}${MARKER}`);
  });

  it("never splits a surrogate pair in a hard cut", () => {
    // The pair is at 587 and 588: the room of 588 would end between its two halves.
    const split = `${"x".repeat(ROOM - 1)}${EMOJI}${"x".repeat(500)}`;
    // The pair is at 586 and 587: it fits whole.
    const fits = `${"x".repeat(ROOM - 2)}${EMOJI}${"x".repeat(500)}`;
    expect(split.charCodeAt(ROOM - 1)).toBeGreaterThanOrEqual(0xd800);
    expect(split.charCodeAt(ROOM - 1)).toBeLessThanOrEqual(0xdbff);

    expect(shown(split)).toBe(`${"x".repeat(ROOM - 1)}${MARKER}`);
    expect(shown(fits)).toBe(`${"x".repeat(ROOM - 2)}${EMOJI}${MARKER}`);
  });

  const lengths = [601, 602, 650, 1000, 5000];
  const shapes: Array<[string, (length: number) => string]> = [
    ["items", (length) => `${"Registration ID 1234; ".repeat(Math.ceil(length / 22))}z`],
    ["words", (length) => `${"word ".repeat(Math.ceil(length / 5))}z`],
    ["one run", (length) => "x".repeat(length)],
    ["pairs one unit off", (length) => `x${EMOJI.repeat(Math.ceil(length / 2))}`],
  ];
  const sweep = shapes.flatMap(([shape, make]) =>
    lengths.map((length) => ({ shape, length, remarks: make(length) })),
  );

  it.each(sweep)(
    "keeps a $shape remark of about $length characters within 600, the marker included",
    ({ remarks }) => {
      expect(remarks.length).toBeGreaterThan(LIMIT);

      const kept = shown(remarks);

      expect(kept.length).toBeLessThanOrEqual(LIMIT);
      expect(kept.endsWith(MARKER)).toBe(true);
      // What is kept is the front of the remark, and something of it is kept.
      expect(kept.length).toBeGreaterThan(MARKER.length);
      expect(remarks.startsWith(kept.slice(0, -MARKER.length))).toBe(true);
    },
  );

  it.each([1, 599, 600])("keeps a remark of %i characters as it is", (length) => {
    const remarks = `${"word; ".repeat(length).slice(0, length - 1)}z`;
    expect(remarks).toHaveLength(length);

    expect(shown(remarks)).toBe(remarks);
  });

  it("shortens a remark of 601 characters, the first that is too long", () => {
    expect(shown("x".repeat(601))).toBe(`${"x".repeat(ROOM)}${MARKER}`);
  });
});

describe("ofacConnector.parse, the other names of an entry", () => {
  /** The rows of ALT.CSV that give the entry 7005 this many other names, each of its own key. */
  const aliasRows = (count: number): string =>
    Array.from({ length: count }, (_, n) => `7005,${700 + n},"aka","ACME ALIAS ${n}",-0- `).join(
      "\r\n",
    );

  it("keeps all 180 other names of an entry, more than the 100 it once stopped at (the most today is 95)", () => {
    const record = recordOf("7005", SDN, aliasRows(180));

    // The name of the entry and its 180 other names, once each.
    expect(record?.matchKeys).toHaveLength(181);
    expect(record?.matchKeys).toContain("name:acmealias179");
    // Six are written out, and the text counts the rest.
    expect(record?.summary).toContain(', "ACME ALIAS 5" (aka), and 174 more.');
  });

  it("reads at most 250 other names of an entry", () => {
    const record = recordOf("7005", SDN, aliasRows(300));

    expect(record?.matchKeys).toHaveLength(251);
    expect(record?.matchKeys).toContain("name:acmealias249");
    expect(record?.matchKeys).not.toContain("name:acmealias250");
    expect(record?.summary).toContain(", and 244 more.");
  });
});

describe("ofacConnector.version", () => {
  it("is 2: a long remark is cut between its items and marked, and an entry keeps 250 other names", () => {
    // Both change what `parse` gives from the same files, so the sync has to parse them again.
    expect(ofacConnector.version).toBe(2);
  });
});

describe("ofacConnector.download", () => {
  it("download asks SDN.CSV and ALT.CSV, once each", async () => {
    const calls: Parameters<ConnectorFetch>[] = [];
    const fetch: ConnectorFetch = async (...args) => {
      calls.push(args);
      return {
        notModified: false,
        url: args[0],
        status: 200,
        contentType: "text/csv",
        body: Buffer.from(args[0] === OFAC_SDN_URL ? SDN : ALT),
        truncated: false,
        etag: '"e"',
        lastModified: null,
      };
    };

    const snapshot = await ofacConnector.download(fetch, { etag: '"old"' });

    const limits = (maxBytes: number) => ({
      maxBytes,
      allowedContentTypes: ["text/csv", "text/plain", "application/octet-stream"],
      totalTimeoutMs: 120_000,
    });
    expect(calls).toEqual([
      [OFAC_SDN_URL, {}, limits(16 * 1024 * 1024)],
      [OFAC_ALT_URL, {}, limits(8 * 1024 * 1024)],
    ]);
    expect(snapshot).toEqual({
      bodies: [SDN, ALT],
      etag: null,
      lastModified: null,
      bytes: Buffer.byteLength(SDN) + Buffer.byteLength(ALT),
    });
  });
});
