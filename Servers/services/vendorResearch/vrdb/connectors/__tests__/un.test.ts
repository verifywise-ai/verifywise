/**
 * The UN connector (spec D2.5, M2 Task 9): the entities of the UN Security Council Consolidated
 * List as records of the vendor risk database, behind Q6. The fixture is written with fictional
 * names, and its element names were checked against the real file on 2026-10-31 (see its header
 * comment).
 */
import fs from "fs";
import path from "path";
import { BodyTooLargeError, type ConnectorFetch } from "../types";
import { UN_LIST_URL, UN_MAX_BYTES, UN_RECORD_MARK, unConnector } from "../un";

const XML = fs.readFileSync(path.join(__dirname, "fixtures/un-consolidated.xml"), "utf8");
const parse = (xml: string = XML) =>
  unConnector.parse({ bodies: [xml], etag: null, lastModified: null, bytes: 0 });
const recordOf = (id: string) => {
  const found = parse().records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}`);
  return found;
};

describe("unConnector.parse", () => {
  it("reads an entity with its aliases and reference number", () => {
    const { records, errors, root, sourceVersion } = parse();

    expect(errors).toBe(0);
    expect(root).toBe("CONSOLIDATED_LIST");
    expect(sourceVersion).toBe("2026-10-30T00:00:01.123-04:00");
    expect(records.map((record) => record.sourceRecordId)).toEqual(["EXe.012", "EXe.013"]);
    expect(recordOf("EXe.012")).toEqual({
      sourceRecordId: "EXe.012",
      recordType: "sanctions_entity",
      title: `${UN_RECORD_MARK}: Contoso Shipping Agency`,
      summary: `${UN_RECORD_MARK} (un.org). Entry: "Contoso Shipping Agency" (entity). Also listed as: "Contoso Shipping Co. Ltd.", "CSA & Partners". Reference number: EXe.012. Sanctions regime: Example Regime. Listed on: 2025-06-17. Address: Exampleland, Otherland. Other information: Operates vessels that carried prohibited goods (fictional).`,
      url: "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list?referenceNumber=EXe.012",
      identifiers: { referenceNumber: "EXe.012", dataId: "110416", unListType: "Example Regime" },
      matchKeys: [
        "name:contososhippingagency",
        "name:contososhippingcoltd",
        "name:contososhipping",
        "name:csapartners",
      ],
      publishedAt: "2025-06-17",
      sourceUpdatedAt: null,
    });
    expect(recordOf("EXe.013").summary).toBe(
      `${UN_RECORD_MARK} (un.org). Entry: "Fabrikam Trading Front" (entity). Reference number: EXe.013. Sanctions regime: Example Regime. Listed on: 2026-01-09.`,
    );
  });

  it("never reads an individual", () => {
    const keys = parse().records.flatMap((record) => record.matchKeys);
    expect(keys.filter((key) => key.includes("northwind"))).toEqual([]);
    expect(parse().records.map((record) => record.sourceRecordId)).not.toContain("EXi.001");

    // Only ENTITIES/ENTITY is read: an element of that name anywhere else is not an entity.
    const nested = XML.replace(
      "<INDIVIDUAL_ALIAS>",
      "<ENTITY><FIRST_NAME>Hidden Entity</FIRST_NAME><REFERENCE_NUMBER>EXe.999</REFERENCE_NUMBER></ENTITY><INDIVIDUAL_ALIAS>",
    );
    expect(parse(nested).records.map((record) => record.sourceRecordId)).toEqual([
      "EXe.012",
      "EXe.013",
    ]);
  });

  it("an entity without a reference number is an error", () => {
    const xml = XML.replace("<REFERENCE_NUMBER>EXe.013</REFERENCE_NUMBER>", "").replace(
      "</ENTITIES>",
      "<ENTITY><DATAID>110418</DATAID><REFERENCE_NUMBER>EXe.014</REFERENCE_NUMBER><FIRST_NAME> </FIRST_NAME></ENTITY></ENTITIES>",
    );

    const { records, errors } = parse(xml);

    expect(records.map((record) => record.sourceRecordId)).toEqual(["EXe.012"]);
    expect(errors).toBe(2);
  });

  it("another root is not the list", () => {
    const html = parse(
      "<!DOCTYPE html><html><head><title>Request blocked</title></head><body><p>Access denied.</p></body></html>",
    );
    expect(html).toMatchObject({ records: [], root: "html", sourceVersion: null });
    expect(html.errors).toBeGreaterThan(0);

    const other = parse(
      "<OTHER_LIST><ENTITIES><ENTITY><FIRST_NAME>X</FIRST_NAME><REFERENCE_NUMBER>EXe.1</REFERENCE_NUMBER></ENTITY></ENTITIES></OTHER_LIST>",
    );
    expect(other).toMatchObject({ records: [], root: "OTHER_LIST" });
    expect(other.errors).toBeGreaterThan(0);

    // A body with no element at all names no root: the sync fails it as wrong_root.
    expect(parse("Service unavailable")).toMatchObject({ records: [], root: null });
  });

  it("counts a file cut between two entities as an error", () => {
    const cut = XML.slice(0, XML.indexOf("</ENTITY>") + "</ENTITY>".length);

    const { errors } = parse(cut);

    expect(errors).toBeGreaterThan(0);
  });

  it("shows at most six other names, and the number of the rest", () => {
    const aliases = Array.from(
      { length: 8 },
      (_, index) =>
        `<ENTITY_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Other Name ${index + 1}</ALIAS_NAME></ENTITY_ALIAS>`,
    ).join("");
    const xml = XML.replace(
      "<FIRST_NAME>Fabrikam Trading Front</FIRST_NAME>",
      `<FIRST_NAME>Fabrikam Trading Front</FIRST_NAME>${aliases}`,
    );
    const summary = parse(xml).records.find(
      (record) => record.sourceRecordId === "EXe.013",
    )?.summary;

    expect(summary).toContain(
      'Also listed as: "Other Name 1", "Other Name 2", "Other Name 3", "Other Name 4", "Other Name 5", "Other Name 6", and 2 more.',
    );
  });
  it("cuts the other information at 1,200 characters", () => {
    const xml = XML.replace(
      "<COMMENTS1>Operates vessels that carried prohibited goods (fictional).</COMMENTS1>",
      `<COMMENTS1>${"y".repeat(1300)}</COMMENTS1>`,
    );
    const summary = parse(xml).records.find(
      (record) => record.sourceRecordId === "EXe.012",
    )?.summary;

    expect(summary?.endsWith(`Other information: ${"y".repeat(1200)}.`)).toBe(true);
  });

  it("an alias that is nothing once cleaned is no name", () => {
    const bell = String.fromCharCode(7);
    const xml = XML.replace("<ALIAS_NAME></ALIAS_NAME>", `<ALIAS_NAME>${bell}</ALIAS_NAME>`);
    const summary = parse(xml).records.find(
      (record) => record.sourceRecordId === "EXe.012",
    )?.summary;

    expect(summary).toContain(
      'Also listed as: "Contoso Shipping Co. Ltd.", "CSA & Partners". Reference',
    );
  });
});

describe("unConnector.download", () => {
  it("asks for the XML file within its limits, with the validators, and answers unchanged on 304", async () => {
    const calls: Parameters<ConnectorFetch>[] = [];
    const fetch: ConnectorFetch = async (...args) => {
      calls.push(args);
      return { notModified: true, url: args[0] };
    };
    const validators = { etag: '"n1"', lastModified: null };

    await expect(unConnector.download(fetch, validators)).resolves.toBe("unchanged");
    expect(UN_MAX_BYTES).toBe(20_971_520);
    expect(calls).toEqual([
      [
        "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
        validators,
        {
          maxBytes: UN_MAX_BYTES,
          allowedContentTypes: ["application/xml", "text/xml"],
          totalTimeoutMs: 300_000,
        },
      ],
    ]);
    expect(UN_LIST_URL).toBe("https://scsanctions.un.org/resources/xml/en/consolidated.xml");
  });

  it("a cut file is too_large", async () => {
    const fetch: ConnectorFetch = async (url) => ({
      notModified: false,
      url,
      status: 200,
      contentType: "application/xml",
      body: Buffer.from(XML.slice(0, 200)),
      truncated: true,
      etag: '"n2"',
      lastModified: null,
    });

    await expect(unConnector.download(fetch, {})).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("hands the sync the file and its validators", async () => {
    const fetch: ConnectorFetch = async (url) => ({
      notModified: false,
      url,
      status: 200,
      contentType: "text/xml; charset=utf-8",
      body: Buffer.from(XML),
      truncated: false,
      etag: '"n3"',
      lastModified: "Thu, 30 Oct 2026 04:00:00 GMT",
    });

    await expect(unConnector.download(fetch, {})).resolves.toEqual({
      bodies: [XML],
      etag: '"n3"',
      lastModified: "Thu, 30 Oct 2026 04:00:00 GMT",
      bytes: Buffer.byteLength(XML),
    });
  });
});
