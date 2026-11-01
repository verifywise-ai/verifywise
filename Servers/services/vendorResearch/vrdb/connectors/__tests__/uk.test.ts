/**
 * The UK connector (spec D2.3): the entities of the UK Sanctions List as records of the vendor risk
 * database. The fixture is written from the list's XSD 4.33.3 and format guide, with fictional
 * names, in the shape of the real file (see its header comment).
 */
import fs from "fs";
import path from "path";
import type { ConnectorFetch } from "../types";
import { UK_LIST_URL, UK_RECORD_MARK, ukConnector } from "../uk";

const XML = fs.readFileSync(path.join(__dirname, "fixtures/uk-sanctions.xml"), "utf8");
const parse = (xml: string = XML) =>
  ukConnector.parse({ bodies: [xml], etag: null, lastModified: null, bytes: 0 });
const recordOf = (id: string, xml: string = XML) => {
  const found = parse(xml).records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}`);
  return found;
};
const idsOf = (xml: string = XML) => parse(xml).records.map((record) => record.sourceRecordId);
/**
 * The fixture with the first occurrence of each `from` made `to`. It fails when the fixture lacks a
 * `from`, so that a change that hits nothing cannot make a test pass.
 */
const edited = (...changes: ReadonlyArray<readonly [string, string]>): string =>
  changes.reduce((xml, [from, to]) => {
    if (!xml.includes(from)) throw new Error(`The fixture does not hold ${from}`);
    return xml.replace(from, () => to);
  }, XML);

/** The kind of the fixture's first entity, CYB0042, and its UN reference number. */
const ENTITY = "<IndividualEntityShip>Entity</IndividualEntityShip>";
const UN_NUMBER = "<UNReferenceNumber>EXe.001</UNReferenceNumber>";

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
        "name:globexholdingpartners",
      ]),
    );
  });

  it("takes the primary name by its type, wherever it stands and however it is written", () => {
    // RUS1234 lists a variation first and writes its types "Primary name" and "Primary name
    // variation", as the real file does for 470 and 180 names of entities.
    const record = recordOf("RUS1234");

    expect(record.title).toBe("UK Sanctions List: Globex Holdings & Partners LLC");
    expect(record.summary).toContain(
      'Entry: "Globex Holdings & Partners LLC" (entity). Also listed as: "Globeks Holdings" (variation), "Globex Holding & Partners" (variation).',
    );
    // "ALias" is the real file's one odd spelling of an alias.
    const odd = edited(["<NameType>Alias</NameType>", "<NameType>ALias</NameType>"]);
    expect(recordOf("CYB0042", odd).summary).toContain('"Northwind Trading" (alias)');
  });

  it("reads the website's host as a domain key", () => {
    expect(recordOf("CYB0042").matchKeys).toContain("domain:northwind-export.example");
    expect(recordOf("RUS1234").matchKeys.filter((key) => key.startsWith("domain:"))).toEqual([]);
  });

  it("gives no domain key for an e-mail address in the website field, nor for a page on a platform", () => {
    // CYB0042 lists its site, an e-mail address on another host, and a page on vk.com.
    const record = recordOf("CYB0042");

    expect(record.matchKeys.filter((key) => key.startsWith("domain:"))).toEqual([
      "domain:northwind-export.example",
    ]);
    // The text still gives the field as the list wrote it.
    expect(record.summary).toContain(
      "Website: www.Northwind-Export.example, export@northwind-mail.example, https://vk.com/northwind_export.",
    );
  });

  it("keeps the host of a website with a scheme whose address holds an @", () => {
    const xml = edited([
      "<Website>https://vk.com/northwind_export</Website>",
      "<Website>https://northwind-blog.example/@northwind</Website>",
    ]);

    expect(recordOf("CYB0042", xml).matchKeys.filter((key) => key.startsWith("domain:"))).toEqual([
      "domain:northwind-export.example",
      "domain:northwind-blog.example",
    ]);
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
      businessRegistrationNumbers: [
        "1027700000000 (Example)",
        "Tax number: 7700000001\nRegistration number: 1027700000001",
      ],
    });
    expect(recordOf("RUS1234").matchKeys).toEqual(
      expect.arrayContaining(["regno:1027700000000example", "regno:1027700000000"]),
    );
    expect(recordOf("CYB0042").matchKeys.filter((key) => key.startsWith("regno:"))).toEqual([]);
  });

  it("a registration number of two lines gives a key for each number in it", () => {
    // 120 registration numbers of the real file hold two lines.
    expect(recordOf("RUS1234").matchKeys).toEqual(
      expect.arrayContaining(["regno:7700000001", "regno:1027700000001"]),
    );
  });

  it("the record's text shows the registration numbers it matches by", () => {
    // A person, and the model, see why the entry matched; a quote of the number names the vendor
    // when it is the vendor's stored LEI (M2 final review, Important 2).
    expect(recordOf("RUS1234").summary).toContain(
      "Business registration number: 1027700000000 (Example), Tax number: 7700000001\nRegistration number: 1027700000001.",
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

  it("reads DateGenerated as the source version, and the dates as dd/mm/yyyy", () => {
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

  it("reads a date written as an ISO 8601 day too, since the XSD gives no format", () => {
    const xml = edited(
      ["<DateGenerated>29/10/2026</DateGenerated>", "<DateGenerated>2026-10-29</DateGenerated>"],
      [
        "<DateDesignated>12/03/2025</DateDesignated>",
        "<DateDesignated>2025-03-12</DateDesignated>",
      ],
      ["<LastUpdated>15/09/2026</LastUpdated>", "<LastUpdated>2026-09-15T10:30:00Z</LastUpdated>"],
    );

    expect(parse(xml).sourceVersion).toBe("2026-10-29");
    expect(recordOf("CYB0042", xml)).toMatchObject({
      publishedAt: "2025-03-12",
      sourceUpdatedAt: "2026-09-15",
    });
  });

  it("writes the summary from the mark, the names, the regime, the UN reference number, the type, the date and the website", () => {
    expect(recordOf("CYB0042")).toMatchObject({
      recordType: "sanctions_entity",
      title: "UK Sanctions List: Northwind Export Company",
    });
    expect(recordOf("CYB0042").summary).toBe(
      `${UK_RECORD_MARK} (gov.uk). Entry: "Northwind Export Company" (entity). Also listed as: "Northwind Trading" (alias). Regime: The Cyber (Sanctions) (EU Exit) Regulations 2020. UN reference number: EXe.001. Type of entity: Limited company. Date designated: 2025-03-12. Website: www.Northwind-Export.example, export@northwind-mail.example, https://vk.com/northwind_export.`,
    );
    expect(recordOf("RUS1234").summary).toBe(
      `${UK_RECORD_MARK} (gov.uk). Entry: "Globex Holdings & Partners LLC" (entity). Also listed as: "Globeks Holdings" (variation), "Globex Holding & Partners" (variation). Regime: The Russia (Sanctions) (EU Exit) Regulations 2019. Date designated: 2026-02-02. Business registration number: 1027700000000 (Example), Tax number: 7700000001\nRegistration number: 1027700000001.`,
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

describe("ukConnector.parse, the kind of a designation", () => {
  it.each(["Aircraft", "Organisation", "Entity Ship"])(
    "counts a designation of the kind %p as one error, and reads the other entity",
    (kind) => {
      // The list's kinds are Individual, Entity and Ship; a designation of any other would have been
      // skipped unseen, and the next sync would have taken its entity off the copy.
      const xml = edited([ENTITY, `<IndividualEntityShip>${kind}</IndividualEntityShip>`]);

      expect(parse(xml).errors).toBe(1);
      expect(idsOf(xml)).toEqual(["RUS1234"]);
    },
  );

  it.each([
    ["absent", ""],
    ["empty", "<IndividualEntityShip></IndividualEntityShip>"],
    ["blank", "<IndividualEntityShip>  </IndividualEntityShip>"],
  ])("counts a designation whose kind is %s as one error", (_how, element) => {
    const xml = edited([ENTITY, element]);

    expect(parse(xml).errors).toBe(1);
    expect(idsOf(xml)).toEqual(["RUS1234"]);
  });

  it("reads the kind without regard to case: ENTITY is read, INDIVIDUAL and sHIP are skipped", () => {
    const xml = edited(
      [ENTITY, "<IndividualEntityShip>ENTITY</IndividualEntityShip>"],
      [
        "<IndividualEntityShip>Individual</IndividualEntityShip>",
        "<IndividualEntityShip>INDIVIDUAL</IndividualEntityShip>",
      ],
      [
        "<IndividualEntityShip>Ship</IndividualEntityShip>",
        "<IndividualEntityShip>sHIP</IndividualEntityShip>",
      ],
    );

    expect(parse(xml).errors).toBe(0);
    expect(idsOf(xml)).toEqual(["CYB0042", "RUS1234"]);
  });

  it("counts a kind it cannot read and an entity it cannot read once each", () => {
    const xml = edited(
      [ENTITY, "<IndividualEntityShip>Aircraft</IndividualEntityShip>"],
      ["<UniqueID>RUS1234</UniqueID>", ""],
    );

    expect(parse(xml)).toMatchObject({ errors: 2, records: [] });
  });
});

describe("ukConnector.parse, the UN reference number", () => {
  it("is in the text right after the regime, and in the identifiers", () => {
    const record = recordOf("CYB0042");

    expect(record.summary).toContain(
      "Regime: The Cyber (Sanctions) (EU Exit) Regulations 2020. UN reference number: EXe.001.",
    );
    expect(record.identifiers).toEqual({
      regime: "The Cyber (Sanctions) (EU Exit) Regulations 2020",
      unReferenceNumber: "EXe.001",
    });
  });

  it("comes after the regime and before the registration numbers among the identifiers", () => {
    const xml = edited([
      "<UniqueID>RUS1234</UniqueID>",
      "<UniqueID>RUS1234</UniqueID><UNReferenceNumber>EXe.002</UNReferenceNumber>",
    ]);

    expect(Object.keys(recordOf("RUS1234", xml).identifiers)).toEqual([
      "regime",
      "unReferenceNumber",
      "businessRegistrationNumbers",
    ]);
  });

  it("is never a match key: it names the UN's entry, not the vendor", () => {
    const keys = recordOf("CYB0042").matchKeys;

    expect(keys.filter((key) => key.toLowerCase().includes("exe001"))).toEqual([]);
    // The entry has the keys it would have without the number.
    expect(keys).toEqual(recordOf("CYB0042", edited([UN_NUMBER, ""])).matchKeys);
  });

  it("is left out of an entry that carries none, in the text and in the identifiers", () => {
    const record = recordOf("RUS1234");

    expect(record.summary).not.toContain("UN reference number");
    expect(record.identifiers).not.toHaveProperty("unReferenceNumber");
  });

  it("is left out when the element is empty", () => {
    const record = recordOf(
      "CYB0042",
      edited([UN_NUMBER, "<UNReferenceNumber></UNReferenceNumber>"]),
    );

    expect(record.summary).not.toContain("UN reference number");
    expect(record.identifiers).toEqual({
      regime: "The Cyber (Sanctions) (EU Exit) Regulations 2020",
    });
  });

  it("is kept as the list writes it, in the upper case of two real ones as well", () => {
    // 267 of the 269 UN reference numbers of the real file's entities read like EXe.001; the other
    // two are written with a capital E, like EXE.002.
    const record = recordOf(
      "CYB0042",
      edited([UN_NUMBER, "<UNReferenceNumber>EXE.002</UNReferenceNumber>"]),
    );

    expect(record.identifiers).toMatchObject({ unReferenceNumber: "EXE.002" });
    expect(record.summary).toContain("UN reference number: EXE.002. Type of entity");
  });
});

describe("ukConnector.version", () => {
  it("is 4: an e-mail address is no site, a designation of no known kind is an error, and the UN reference number is read", () => {
    // Each changes what `parse` gives from the same file, so the sync has to parse it again.
    expect(ukConnector.version).toBe(4);
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
