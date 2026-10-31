/**
 * The UK connector (spec D2.3): the entities of the UK Sanctions List as records of the vendor risk
 * database. The fixture is written from the list's XSD 4.33.3 and format guide, with fictional names.
 */
import fs from "fs";
import path from "path";
import type { ConnectorFetch } from "../types";
import { UK_LIST_URL, UK_RECORD_MARK, ukConnector } from "../uk";

const XML = fs.readFileSync(path.join(__dirname, "fixtures/uk-sanctions.xml"), "utf8");
const parse = (xml: string = XML) =>
  ukConnector.parse({ bodies: [xml], etag: null, lastModified: null, bytes: 0 });
const recordOf = (id: string) => {
  const found = parse().records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}`);
  return found;
};

describe("ukConnector.parse", () => {
  it("keeps entities and drops individuals and ships", () => {
    const { records, errors, root } = parse();

    expect(errors).toBe(0);
    expect(root).toBe("Designations");
    expect(records.map((record) => record.sourceRecordId)).toEqual(["CYB0042", "RUS1234"]);
  });

  it("counts a file cut between two designations as an error", () => {
    const cut = XML.slice(0, XML.indexOf("</Designation>") + "</Designation>".length);

    const { records, errors } = parse(cut);

    expect(records.map((record) => record.sourceRecordId)).toEqual(["CYB0042"]);
    expect(errors).toBe(1);
  });

  it("reads every name as a name key", () => {
    expect(recordOf("CYB0042").matchKeys).toEqual(
      expect.arrayContaining([
        "name:northwindexportcompany",
        "name:northwindexport",
        "name:northwindtrading",
      ]),
    );
    expect(recordOf("RUS1234").matchKeys).toEqual(
      expect.arrayContaining([
        "name:globexholdingspartnersllc",
        "name:globexholdingspartners",
        "name:globeksholdings",
      ]),
    );
  });

  it("reads the website's host as a domain key", () => {
    expect(recordOf("CYB0042").matchKeys).toContain("domain:northwind-export.example");
    expect(recordOf("RUS1234").matchKeys.filter((key) => key.startsWith("domain:"))).toEqual([]);
  });

  it("gives no domain key for a website on a host where many have pages", () => {
    const xml = XML.replace(
      "<Website>www.Northwind-Export.example</Website>",
      "<Website>https://t.me/northwind_export www.facebook.com/northwind northwind.github.io www.Northwind-Export.example</Website>",
    );
    expect(xml).not.toBe(XML);

    const [record] = parse(xml).records;
    expect(record.matchKeys.filter((key) => key.startsWith("domain:"))).toEqual([
      "domain:northwind-export.example",
    ]);
  });

  it("business registration numbers become regno keys, and stay identifiers", () => {
    expect(recordOf("RUS1234").identifiers).toMatchObject({
      businessRegistrationNumbers: ["1027700000000 (Example)"],
    });
    expect(recordOf("RUS1234").matchKeys).toEqual(
      expect.arrayContaining(["regno:1027700000000example", "regno:1027700000000"]),
    );
    expect(recordOf("CYB0042").matchKeys.filter((key) => key.startsWith("regno:"))).toEqual([]);
  });

  it("the record's text shows the registration numbers it matches by", () => {
    // A person, and the model, see why the entry matched; a quote of the number names the vendor
    // when it is the vendor's stored LEI (M2 final review, Important 2).
    expect(recordOf("RUS1234").summary).toContain(
      "Business registration number: 1027700000000 (Example).",
    );
    expect(recordOf("CYB0042").summary).not.toContain("Business registration number");
  });

  it("the record's address is the list page with ?uid=", () => {
    expect(recordOf("CYB0042").url).toBe(
      "https://www.gov.uk/government/publications/the-uk-sanctions-list?uid=CYB0042",
    );
  });

  it("a document whose root is not the list's fails with errors", () => {
    const html =
      "<!DOCTYPE html><html><head><meta charset=utf-8><title>Error</title></head><body><p>Service unavailable</body></html>";
    const page = parse(html);
    expect(page.records).toEqual([]);
    expect(page.errors).toBeGreaterThan(0);

    const other = parse("<Other><Designation><UniqueID>X1</UniqueID></Designation></Other>");
    expect(other).toMatchObject({ records: [], root: "Other" });
    expect(other.errors).toBeGreaterThan(0);
  });

  it("reads DateGenerated as the source version, and a date written either way", () => {
    expect(parse().sourceVersion).toBe("2026-10-29");
    expect(recordOf("CYB0042")).toMatchObject({
      publishedAt: "2025-03-12",
      sourceUpdatedAt: "2026-09-15",
    });
    expect(recordOf("RUS1234")).toMatchObject({
      publishedAt: "2026-02-02",
      sourceUpdatedAt: "2026-10-01",
    });
  });

  it("writes the summary from the mark, the names, the regime, the type, the date and the website", () => {
    expect(recordOf("CYB0042")).toMatchObject({
      recordType: "sanctions_entity",
      title: "UK Sanctions List: Northwind Export Company",
    });
    expect(recordOf("CYB0042").summary).toBe(
      `${UK_RECORD_MARK} (gov.uk). Entry: "Northwind Export Company" (entity). Also listed as: "Northwind Trading" (alias). Regime: Cyber. Type of entity: Limited company. Date designated: 2025-03-12. Website: www.Northwind-Export.example.`,
    );
  });

  it("counts a designation without a unique id or a name as an error", () => {
    const xml = XML.replace("<UniqueID>RUS1234</UniqueID>", "").replace(
      "</Designations>",
      "<Designation><UniqueID>CYB0099</UniqueID><IndividualEntityShip>entity</IndividualEntityShip></Designation></Designations>",
    );

    expect(parse(xml).errors).toBe(2);
  });
});

describe("ukConnector.download", () => {
  it("download sends the validators and answers unchanged on 304", async () => {
    const calls: Parameters<ConnectorFetch>[] = [];
    const fetch: ConnectorFetch = async (...args) => {
      calls.push(args);
      return { notModified: true, url: args[0] };
    };
    const validators = { etag: '"u1"', lastModified: "Wed, 29 Oct 2026 10:00:00 GMT" };

    await expect(ukConnector.download(fetch, validators)).resolves.toBe("unchanged");
    expect(calls).toEqual([
      [
        UK_LIST_URL,
        validators,
        {
          maxBytes: 64 * 1024 * 1024,
          allowedContentTypes: ["application/xml", "text/xml", "application/octet-stream"],
          totalTimeoutMs: 300_000,
        },
      ],
    ]);
  });
});
