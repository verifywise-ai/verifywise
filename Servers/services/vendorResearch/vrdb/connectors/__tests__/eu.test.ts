/**
 * The EU connector (spec D2.4): the enterprises of the EU consolidated list of financial sanctions,
 * whose file address is read from the operator's feed at every sync so that its token is kept
 * nowhere (Q2). The fixtures hold the placeholder `token=fixture-token`. The list's fixture is
 * written from the XSD 1.1, with fictional names and hosts, in the shape of the real file (see its
 * header comment).
 */
import fs from "fs";
import path from "path";
import type { ConditionalResponse } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import { EU_FEED_URL, EU_RECORD_MARK, euConnector } from "../eu";
import { ACME_LEI } from "../../__tests__/helpers/lei";
import type { ConnectorFetch } from "../types";

const XML = fs.readFileSync(path.join(__dirname, "fixtures/eu-fsf.xml"), "utf8");
const RSS = fs.readFileSync(path.join(__dirname, "fixtures/eu-rss.xml"), "utf8");
const FILE_URL =
  "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=fixture-token";
const DATASET =
  "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions";

const parse = (xml: string = XML) =>
  euConnector.parse({ bodies: [xml], etag: null, lastModified: null, bytes: 0 });
const recordOf = (id: string, xml: string = XML) => {
  const found = parse(xml).records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}`);
  return found;
};
const idsOf = (xml: string = XML) => parse(xml).records.map((record) => record.sourceRecordId);
const keysOf = (record: ParsedRecord, prefix: string) =>
  record.matchKeys.filter((key) => key.startsWith(prefix));

/**
 * The fixture with the first occurrence of each `from`, inside the entry with that logical id, made
 * `to`. It fails when the entry lacks a `from`, so that a change that hits nothing cannot make a
 * test pass.
 */
const editedIn = (id: string, ...changes: ReadonlyArray<readonly [string, string]>): string => {
  const opening = new RegExp(`<sanctionEntity\\b[^>]*\\blogicalId="${id}"[^>]*>`).exec(XML);
  if (opening === null) throw new Error(`The fixture has no entry ${id}`);
  const start = opening.index;
  const end = XML.indexOf("</sanctionEntity>", start) + "</sanctionEntity>".length;
  const entry = changes.reduce(
    (text, [from, to]) => {
      if (!text.includes(from)) throw new Error(`Entry ${id} does not hold ${from}`);
      return text.replace(from, () => to);
    },
    XML.slice(start, end),
  );
  return XML.slice(0, start) + entry + XML.slice(end);
};

/** The change that puts the alias of this whole name in this language. */
const inLanguage = (name: string, from: string, to: string): readonly [string, string] => [
  `wholeName="${name}" nameLanguage="${from}"`,
  `wholeName="${name}" nameLanguage="${to}"`,
];

/** A list of one enterprise with these contact details in its address, in the fixture's shape. */
const listWithContacts = (
  ...contacts: ReadonlyArray<readonly [key: string, value: string]>
): string =>
  [
    '<export generationDate="2026-10-23T15:10:13.000+02:00" globalFileId="9001">',
    '<sanctionEntity logicalId="9001" euReferenceNumber="EU.9001.01">',
    '<subjectType code="enterprise" classificationCode="E" />',
    '<nameAlias wholeName="Contoso Example" nameLanguage="EN" />',
    "<address>",
    ...contacts.map(([key, value]) => `<contactInfo key="${key}" value="${value}" />`),
    "</address>",
    "</sanctionEntity>",
    "</export>",
  ].join("");

/** Entry 1101 with an identification number that is a valid LEI after its registration number. */
const withLei = () =>
  editedIn("1101", [
    'logicalId="91031" />',
    `logicalId="91031" /><identification number="${ACME_LEI}" identificationTypeCode="other" />`,
  ]);

const answer = (
  body: string,
  contentType: string,
  etag: string | null = null,
): ConditionalResponse => ({
  notModified: false,
  url: "",
  status: 200,
  contentType,
  body: Buffer.from(body),
  truncated: false,
  etag,
  lastModified: null,
});

/** A fetch that serves the feed and the file, and records what it was asked. */
function server(feed: string = RSS) {
  const calls: Parameters<ConnectorFetch>[] = [];
  const fetch: ConnectorFetch = async (...args) => {
    calls.push(args);
    if (args[0] === EU_FEED_URL) return answer(feed, "text/xml");
    if (args[0] === FILE_URL) return answer(XML, "application/xml", '"f2"');
    throw new Error("an address the test does not serve");
  };
  return { fetch, calls };
}

describe("euConnector.parse", () => {
  it("counts a file cut between two entries as an error", () => {
    const cut = XML.slice(0, XML.indexOf("</sanctionEntity>") + "</sanctionEntity>".length);

    expect(parse(cut).errors).toBe(1);
  });

  it("keeps classification code E and drops P", () => {
    const { records, errors, root } = parse();

    expect(errors).toBe(0);
    expect(root).toBe("export");
    expect(records.map((record) => record.sourceRecordId)).toEqual([
      "1101",
      "1102",
      "1105",
      "1106",
    ]);
  });

  it("reads every alias as a name key, the title's or not", () => {
    expect(recordOf("1101").matchKeys).toEqual(
      expect.arrayContaining([
        "name:nordwindexportgesellschaft",
        "name:northwindexportcompany",
        "name:northwindexport",
      ]),
    );
    expect(recordOf("1102").matchKeys).toEqual(["name:globexholdingspartners"]);
  });

  it("skips an entry with a delistingDate in the past", () => {
    expect(idsOf()).not.toContain("1104");
    const later = editedIn("1104", ['delistingDate="2026-09-01"', 'delistingDate="2026-12-01"']);
    expect(recordOf("1104", later).sourceRecordId).toBe("1104");
  });

  it("the record's address is the dataset page with ?logicalId=", () => {
    expect(recordOf("1101").url).toBe(`${DATASET}?logicalId=1101`);
  });

  it("keeps the identifiers and writes the summary from the mark", () => {
    expect(recordOf("1101")).toMatchObject({
      recordType: "sanctions_entity",
      title: `${EU_RECORD_MARK}: Northwind Export Company`,
      publishedAt: "2025-03-12",
      identifiers: {
        euReferenceNumber: "EU.1101.01",
        unitedNationId: "EXe.013",
        identifications: [{ number: "EX-4455", type: "regnumber" }],
      },
    });
    expect(recordOf("1102").summary).toBe(
      `${EU_RECORD_MARK} (European Commission). Entry: "Globex Holdings & Partners" (enterprise). Programme: RUS. EU reference number: EU.1102.02. Date designated: 2026-02-02.`,
    );
    expect(parse().sourceVersion).toBe("2026-10-23T15:10:13.000+02:00");
  });

  it("writes the whole text of an entry in the order of the list's fields", () => {
    expect(recordOf("1101").summary).toBe(
      `${EU_RECORD_MARK} (European Commission). Entry: "Northwind Export Company" (enterprise). Also listed as: "Nordwind Exportgesellschaft". Programme: CYB. EU reference number: EU.1101.01. UN reference number: EXe.013. Date designated: 2025-03-12. Website: www.Northwind-Export.example; export@northwind-mail.example, https://northwind-export.example/en/, https://t.me/northwind_export. Identification number: EX-4455.`,
    );
  });

  it("gives the keys of the names, then of the websites, then of the numbers", () => {
    expect(recordOf("1101").matchKeys).toEqual([
      "name:nordwindexportgesellschaft",
      "name:northwindexportcompany",
      "name:northwindexport",
      "domain:northwind-export.example",
      "regno:ex4455",
    ]);
  });

  it("an identification number that is a valid LEI becomes a lei key, another a regno key", () => {
    const xml = withLei();
    expect(xml).not.toBe(XML);

    expect(recordOf("1101", xml).matchKeys).toEqual(
      expect.arrayContaining([`lei:${ACME_LEI}`, "regno:ex4455"]),
    );
    expect(recordOf("1102", xml).matchKeys.filter((key) => /^(lei|regno):/.test(key))).toEqual([]);
  });

  it("the record's text shows the identification numbers it matches by", () => {
    // A person, and the model, see why the entry matched; a quote of the number names the vendor
    // when it is the vendor's stored LEI (M2 final review, Important 2).
    const xml = withLei();

    expect(recordOf("1101", xml).summary).toContain(`Identification number: EX-4455, ${ACME_LEI}.`);
    expect(recordOf("1102").summary).not.toContain("Identification number");
  });

  it("a document whose root is not the list's fails with errors", () => {
    const other = parse("<feed><sanctionEntity logicalId='1'/></feed>");
    expect(other).toMatchObject({ records: [], root: "feed" });
    expect(other.errors).toBeGreaterThan(0);
  });
});

describe("euConnector.parse, the name of an entry", () => {
  it("titles an entry by its first alias in English, not by its first alias", () => {
    // Entry 1101 lists a German name first. Every alias of the real file is flagged strong, so none
    // is the main one, and 863 of its 1,779 enterprises list an alias in another language first.
    const record = recordOf("1101");

    expect(record.title).toBe(`${EU_RECORD_MARK}: Northwind Export Company`);
    expect(record.summary).toContain(
      'Entry: "Northwind Export Company" (enterprise). Also listed as: "Nordwind Exportgesellschaft".',
    );
  });

  it("reads an alias with no language as English", () => {
    // The second alias of 1101 loses its language: it is still the first alias in English or in no
    // language, so it titles the entry, and the German alias before it does not.
    const xml = editedIn("1101", inLanguage("Northwind Export Company", "EN", ""));

    expect(recordOf("1101", xml).title).toBe(`${EU_RECORD_MARK}: Northwind Export Company`);
    expect(recordOf("1101", xml).summary).toContain(
      'Entry: "Northwind Export Company" (enterprise). Also listed as: "Nordwind Exportgesellschaft".',
    );
  });

  it("reads the language without regard to case or padding", () => {
    const xml = editedIn("1101", inLanguage("Northwind Export Company", "EN", " en "));

    expect(recordOf("1101", xml).title).toBe(`${EU_RECORD_MARK}: Northwind Export Company`);
  });

  it("titles an entry by its first alias when none is in English or without a language", () => {
    const xml = editedIn("1101", inLanguage("Northwind Export Company", "EN", "FR"));

    expect(recordOf("1101", xml).title).toBe(`${EU_RECORD_MARK}: Nordwind Exportgesellschaft`);
    expect(recordOf("1101", xml).summary).toContain(
      'Entry: "Nordwind Exportgesellschaft" (enterprise). Also listed as: "Northwind Export Company".',
    );
  });

  it("shows at most six other names, and the number of the rest, the title's left out", () => {
    // Eight aliases in French come before the one with no language, which is the title.
    const others = Array.from(
      { length: 8 },
      (_, index) =>
        `<nameAlias firstName="" middleName="" lastName="" wholeName="Other Name ${index + 1}" nameLanguage="FR" strong="true" regulationLanguage="en" logicalId="${92000 + index}" />`,
    ).join("");
    const xml = editedIn("1102", ["<nameAlias ", `${others}<nameAlias `]);

    expect(recordOf("1102", xml).title).toBe(`${EU_RECORD_MARK}: Globex Holdings & Partners`);
    expect(recordOf("1102", xml).summary).toContain(
      'Entry: "Globex Holdings & Partners" (enterprise). Also listed as: "Other Name 1", "Other Name 2", "Other Name 3", "Other Name 4", "Other Name 5", "Other Name 6", and 2 more.',
    );
  });
});

describe("euConnector.parse, an alias without a whole name", () => {
  it("is read from its first and last names", () => {
    // The XSD makes wholeName optional. Entry 1105 gives each alias a first and a last name only.
    const record = recordOf("1105");

    expect(parse().errors).toBe(0);
    expect(record.title).toBe(`${EU_RECORD_MARK}: Fabrikam Logistics`);
    expect(record.summary).toBe(
      `${EU_RECORD_MARK} (European Commission). Entry: "Fabrikam Logistics" (enterprise). Also listed as: "Fabrikam Freight". Programme: UKR. EU reference number: EU.1105.05. Date designated: 2025-09-15.`,
    );
    expect(record.matchKeys).toEqual(["name:fabrikamlogistics", "name:fabrikamfreight"]);
  });

  it("is read from its first, middle and last names", () => {
    const xml = editedIn("1105", [
      'middleName="" lastName="Logistics"',
      'middleName="Cargo" lastName="Logistics"',
    ]);

    expect(recordOf("1105", xml).title).toBe(`${EU_RECORD_MARK}: Fabrikam Cargo Logistics`);
    expect(recordOf("1105", xml).matchKeys).toContain("name:fabrikamcargologistics");
  });

  it("is read from the parts that are there, trimmed", () => {
    const xml = editedIn("1105", [
      'firstName="Fabrikam" middleName="" lastName="Logistics"',
      'firstName="  " middleName="" lastName=" Logistics "',
    ]);

    expect(recordOf("1105", xml).title).toBe(`${EU_RECORD_MARK}: Logistics`);
  });

  it("is not read from its parts when it has a whole name", () => {
    const xml = editedIn("1102", [
      'firstName="" middleName="" lastName="" wholeName="Globex Holdings &amp; Partners"',
      'firstName="Ignored" middleName="" lastName="Parts" wholeName="Globex Holdings &amp; Partners"',
    ]);

    expect(recordOf("1102", xml).title).toBe(`${EU_RECORD_MARK}: Globex Holdings & Partners`);
    expect(recordOf("1102", xml).matchKeys).toEqual(["name:globexholdingspartners"]);
  });

  it("is no name when it has no parts either, and the entry keeps its other names", () => {
    const xml = editedIn("1101", ['wholeName="Nordwind Exportgesellschaft"', 'wholeName=""']);

    expect(parse(xml).errors).toBe(0);
    expect(recordOf("1101", xml).summary).toContain(
      'Entry: "Northwind Export Company" (enterprise). Programme',
    );
    expect(recordOf("1101", xml).matchKeys).not.toContain("name:nordwindexportgesellschaft");
  });

  it("an entry none of whose aliases is a name is one error", () => {
    const xml = editedIn("1102", ['wholeName="Globex Holdings &amp; Partners"', 'wholeName=""']);

    expect(parse(xml).errors).toBe(1);
    expect(idsOf(xml)).toEqual(["1101", "1105", "1106"]);
  });
});

describe("euConnector.parse, the websites", () => {
  it("reads the host of each website in the contact details as one domain key", () => {
    // 1101 gives www.Northwind-Export.example, written without a scheme and in mixed case, and
    // https://northwind-export.example/en/: one host, so one key, without the www.
    expect(keysOf(recordOf("1101"), "domain:")).toEqual(["domain:northwind-export.example"]);
  });

  it("gives no domain key for an e-mail address typed into the field", () => {
    // The first WEB value of 1101 holds a site and, after a semicolon, an e-mail address.
    const record = recordOf("1101");

    expect(record.matchKeys.filter((key) => key.includes("northwind-mail"))).toEqual([]);
    // The text still gives the field as the list wrote it.
    expect(record.summary).toContain("export@northwind-mail.example");
  });

  it("gives no domain key for a page on a platform where many have pages", () => {
    // 1101 also lists a page on t.me, and 1106 only a page on vk.com.
    expect(recordOf("1101").matchKeys.filter((key) => key.includes("t.me"))).toEqual([]);
    expect(keysOf(recordOf("1106"), "domain:")).toEqual([]);
    expect(recordOf("1106").summary).toBe(
      `${EU_RECORD_MARK} (European Commission). Entry: "Tailspin Imports" (enterprise). Programme: BLR. EU reference number: EU.1106.06. Date designated: 2024-11-20. Website: https://vk.com/tailspin_imports.`,
    );
  });

  it("reads only the contact details with the key WEB", () => {
    // 1101 also lists an e-mail address and a telephone number of its own, and 1105 only an e-mail
    // address: none of them is a website.
    const record = recordOf("1101");

    expect(record.matchKeys.filter((key) => key.includes("northwind-contact"))).toEqual([]);
    expect(record.summary).not.toContain("northwind-contact");
    expect(record.summary).not.toContain("+00 000 0000");
    expect(keysOf(recordOf("1105"), "domain:")).toEqual([]);
    expect(recordOf("1105").summary).not.toContain("Website");
  });

  it("never reads the websites of a person", () => {
    const keys = parse().records.flatMap((record) => record.matchKeys);

    expect(keys.filter((key) => key.includes("jane-doe"))).toEqual([]);
  });

  it("leaves the sentence out of an entry without a website", () => {
    expect(recordOf("1102").summary).not.toContain("Website");
  });

  it("reads the key WEB without regard to case or padding", () => {
    const xml = listWithContacts(
      ["web", "a.example"],
      [" Web ", "https://b.example/x"],
      ["Email", "mailbox@c.example"],
    );

    expect(keysOf(parse(xml).records[0], "domain:")).toEqual([
      "domain:a.example",
      "domain:b.example",
    ]);
  });

  it("lists a website named twice once, and a host named twice as one key", () => {
    const xml = listWithContacts(
      ["WEB", "a.example"],
      ["WEB", "a.example"],
      ["WEB", "https://www.A.example/"],
    );
    const [record] = parse(xml).records;

    expect(record.summary).toContain("Website: a.example, https://www.A.example/.");
    expect(keysOf(record, "domain:")).toEqual(["domain:a.example"]);
  });

  it("gives the text of a field that holds only an e-mail address, and no key", () => {
    const [record] = parse(listWithContacts(["WEB", "export@northwind-mail.example"])).records;

    expect(keysOf(record, "domain:")).toEqual([]);
    expect(record.summary).toContain("Website: export@northwind-mail.example.");
  });
});

describe("euConnector.parse, the UN reference number", () => {
  it("is in the text right after the EU reference number, and in the identifiers", () => {
    const record = recordOf("1101");

    expect(record.summary).toContain(
      "EU reference number: EU.1101.01. UN reference number: EXe.013. Date designated: 2025-03-12.",
    );
    expect(record.identifiers).toMatchObject({ unitedNationId: "EXe.013" });
  });

  it("is never a match key: it names the UN's entry, not the vendor", () => {
    const keys = recordOf("1101").matchKeys;
    const without = editedIn("1101", ['unitedNationId="EXe.013"', 'unitedNationId=""']);
    // Whatever its spelling in a key: exe013, exe.013, un:EXe.013.
    const compact = keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]+/g, ""));

    expect(compact.filter((key) => key.includes("exe013"))).toEqual([]);
    // The entry has the keys it would have without the number.
    expect(keys).toEqual(recordOf("1101", without).matchKeys);
  });

  it("is left out of an entry whose attribute is empty, blank or absent", () => {
    // The list has the attribute on every entry and fills it on few: 1102 has it empty.
    const blank = editedIn("1102", ['unitedNationId=""', 'unitedNationId="  "']);
    const absent = editedIn("1102", [' unitedNationId=""', ""]);

    for (const xml of [XML, blank, absent]) {
      const record = recordOf("1102", xml);
      expect(record.summary).not.toContain("UN reference number");
      expect(record.identifiers).not.toHaveProperty("unitedNationId");
    }
  });

  it("is read trimmed", () => {
    const xml = editedIn("1101", ['unitedNationId="EXe.013"', 'unitedNationId="  EXe.013 "']);

    expect(recordOf("1101", xml).identifiers).toMatchObject({ unitedNationId: "EXe.013" });
    expect(recordOf("1101", xml).summary).toContain(
      "UN reference number: EXe.013. Date designated",
    );
  });
});

describe("euConnector.version", () => {
  it("is 4: the websites are domain keys, the title is the first English alias, an alias is read from its parts, and the UN reference number is in the text", () => {
    // Each changes what `parse` gives from the same file, so the sync has to parse it again.
    expect(euConnector.version).toBe(4);
  });
});

describe("euConnector.download", () => {
  it("download reads the file's address from the feed", async () => {
    const { fetch, calls } = server();

    const snapshot = await euConnector.download(fetch, { etag: '"f1"' });

    expect(calls).toEqual([
      [
        EU_FEED_URL,
        {},
        {
          maxBytes: 1024 * 1024,
          allowedContentTypes: ["application/rss+xml", "application/xml", "text/xml"],
          totalTimeoutMs: 30_000,
        },
      ],
      [
        FILE_URL,
        { etag: '"f1"' },
        {
          maxBytes: 64 * 1024 * 1024,
          allowedContentTypes: ["application/xml", "text/xml", "application/octet-stream"],
          totalTimeoutMs: 300_000,
        },
      ],
    ]);
    expect(snapshot).toEqual({
      bodies: [XML],
      etag: '"f2"',
      lastModified: null,
      bytes: Buffer.byteLength(XML),
    });
  });

  it("an address on another host is not followed", async () => {
    const feed = RSS.split(
      "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/",
    ).join(
      "https://webgate.ec.europa.eu.evil.example/fsd/fsf/public/files/xmlFullSanctionsList_1_1/",
    );
    const { fetch, calls } = server(feed);

    await expect(euConnector.download(fetch, {})).rejects.toMatchObject({
      name: "FeedWithoutFileError",
    });
    expect(calls).toHaveLength(1);
  });

  it("a feed without the XML 1.1 file fails as feed_without_file", async () => {
    const feed = RSS.split("xmlFullSanctionsList_1_1").join("xmlFullSanctionsList_9_9");
    const { fetch, calls } = server(feed);

    await expect(euConnector.download(fetch, {})).rejects.toMatchObject({
      name: "FeedWithoutFileError",
    });
    expect(calls).toHaveLength(1);
  });

  it("the snapshot keeps no address", async () => {
    const { fetch } = server();

    const snapshot = await euConnector.download(fetch, {});

    expect(JSON.stringify(snapshot)).not.toMatch(/fixture-token|webgate/);
  });

  it("answers unchanged on a 304 of the file", async () => {
    const fetch: ConnectorFetch = async (url) =>
      url === EU_FEED_URL ? answer(RSS, "text/xml") : { notModified: true, url };

    await expect(euConnector.download(fetch, { etag: '"f1"' })).resolves.toBe("unchanged");
  });

  it("never names the file's address in an error", async () => {
    const fetch: ConnectorFetch = async (url) => {
      if (url === EU_FEED_URL) return answer(RSS, "text/xml");
      throw new Error(`failed at ${url}`);
    };

    const error = await euConnector.download(fetch, {}).catch((caught: Error) => caught);

    expect(String((error as Error).message)).not.toMatch(/fixture-token/);
  });
});
