/**
 * The EU connector (spec D2.4): the enterprises of the EU consolidated list of financial sanctions,
 * whose file address is read from the operator's feed at every sync so that its token is kept
 * nowhere (Q2). The fixtures hold the placeholder `token=fixture-token`.
 */
import fs from "fs";
import path from "path";
import type { ConditionalResponse } from "../../../../webResearch/guardedFetch";
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
    expect(records.map((record) => record.sourceRecordId)).toEqual(["1101", "1102"]);
  });

  it("reads every wholeName as a name key", () => {
    expect(recordOf("1101").matchKeys).toEqual(
      expect.arrayContaining([
        "name:northwindexportcompany",
        "name:northwindexport",
        "name:northwindtrading",
      ]),
    );
    expect(recordOf("1102").matchKeys).toEqual(["name:globexholdingspartners"]);
  });

  it("skips an entry with a delistingDate in the past", () => {
    expect(parse().records.map((record) => record.sourceRecordId)).not.toContain("1104");
    const later = XML.replace('delistingDate="2026-09-01"', 'delistingDate="2026-12-01"');
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
        identifications: [{ number: "EX-4455", type: "regnumber" }],
      },
    });
    expect(recordOf("1102").summary).toBe(
      `${EU_RECORD_MARK} (European Commission). Entry: "Globex Holdings & Partners" (enterprise). Programme: RUS. EU reference number: EU.1102.02. Date designated: 2026-02-02.`,
    );
    expect(parse().sourceVersion).toBe("2026-10-23T15:10:13.000+02:00");
  });

  it("an identification number that is a valid LEI becomes a lei key, another a regno key", () => {
    const xml = XML.replace(
      '<identification number="EX-4455" identificationTypeCode="regnumber" />',
      `<identification number="EX-4455" identificationTypeCode="regnumber" /><identification number="${ACME_LEI}" identificationTypeCode="other" />`,
    );
    expect(xml).not.toBe(XML);

    expect(recordOf("1101", xml).matchKeys).toEqual(
      expect.arrayContaining([`lei:${ACME_LEI}`, "regno:ex4455"]),
    );
    expect(recordOf("1102", xml).matchKeys.filter((key) => /^(lei|regno):/.test(key))).toEqual([]);
  });

  it("the record's text shows the identification numbers it matches by", () => {
    // A person, and the model, see why the entry matched; a quote of the number names the vendor
    // when it is the vendor's stored LEI (M2 final review, Important 2).
    const xml = XML.replace(
      '<identification number="EX-4455" identificationTypeCode="regnumber" />',
      `<identification number="EX-4455" identificationTypeCode="regnumber" /><identification number="${ACME_LEI}" identificationTypeCode="other" />`,
    );

    expect(recordOf("1101", xml).summary).toContain(`Identification number: EX-4455, ${ACME_LEI}.`);
    expect(recordOf("1102").summary).not.toContain("Identification number");
  });

  it("a document whose root is not the list's fails with errors", () => {
    const other = parse("<feed><sanctionEntity logicalId='1'/></feed>");
    expect(other).toMatchObject({ records: [], root: "feed" });
    expect(other.errors).toBeGreaterThan(0);
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
