/**
 * The OFAC connector (spec D4.1): the entities of the SDN list, with the other names of ALT.CSV, as
 * records of the vendor risk database. The fixtures are written from the Treasury's description of
 * the files (no header row, `-0- ` for an empty field), with fictional names.
 */
import fs from "fs";
import path from "path";
import { OFAC_ALT_URL, OFAC_SDN_URL, ofacRecords, parseOfac } from "../../../records/ofac";
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

  it("caps remarks at 600 characters", () => {
    const remarks = `${"R".repeat(600)}TAIL`;
    const sdn = `7010,"LONG REMARKS LLC",-0- ,"SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"${remarks}"\r\n`;

    const summary = recordOf("7010", sdn, "")?.summary ?? "";

    expect(summary).toContain(`Remarks: ${"R".repeat(600)}.`);
    expect(summary).not.toContain("TAIL");
  });

  it("holds neither the lookup note nor a day, which the lookup adds", () => {
    const summary = recordOf("7005")?.summary ?? "";
    const today = ofacRecords(parseOfac(SDN, ALT), {
      keys: ["acmeanalytics"],
      now: new Date("2026-10-30T12:00:00Z"),
    });

    expect(summary).not.toMatch(/Lookup note|On the list on/);
    expect(today.records[0].text.startsWith(summary)).toBe(true);
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
