/**
 * The EU list in the lookup of the vendor risk database (spec D4.4, D4.8): an enterprise whose
 * contact details name a website is matched, by the host of that site, to a vendor whose own
 * website the website check verified, and the match is a strong one, with no name needed. The rows
 * are the entries of the connector's fixture, run through the connector that reads them
 * (connectors/eu.ts), and `offerRecords` decides what a run is offered, as lookup.test.ts does for
 * its rows.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../../utils/vrdb.utils", () => ({}));

import fs from "fs";
import path from "path";
import { NAME_ONLY_LOOKUP_NOTE } from "../../records/ofac";
import type { ResearchTarget } from "../../target";
import { euConnector } from "../connectors/eu";
import { offerRecords } from "../lookup";
import type { VrdbRow, VrdbSourceState } from "../types";

const XML = fs.readFileSync(
  path.join(__dirname, "../connectors/__tests__/fixtures/eu-fsf.xml"),
  "utf8",
);
const NOW = new Date("2026-10-30T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

/** The entries of the fixture as the copy of the list holds them. */
const ROWS: VrdbRow[] = euConnector
  .parse({ bodies: [XML], etag: null, lastModified: null, bytes: 0 })
  .records.map((record, index): VrdbRow => ({
    id: index + 1,
    sourceId: "eu_fsf",
    sourceRecordId: record.sourceRecordId,
    recordType: record.recordType,
    status: "active",
    title: record.title,
    summary: record.summary,
    url: record.url,
    matchKeys: record.matchKeys,
    publishedAt: record.publishedAt,
  }));
const EU_SYNCED: VrdbSourceState = {
  id: "eu_fsf",
  lastSuccessAt: new Date(NOW.getTime() - 4 * HOUR_MS),
  lastOutcome: "ok",
  sourceVersion: null,
  etag: null,
  lastModified: null,
  activeRecords: ROWS.length,
};

/** A vendor that no entry of the fixture is named like: only its website can tie it to one. */
const vendor = (domain: string): ResearchTarget => ({
  name: "Acme Analytics",
  domain,
  provides: "Analytics software",
});

const offer = (target: ResearchTarget, verifiedDomains: readonly string[]) =>
  offerRecords({
    rows: ROWS,
    states: [EU_SYNCED],
    target,
    researchable: ["legal_regulatory"],
    now: NOW,
    enabled: true,
    verifiedDomains,
    readThrough: new Map(),
  });

const recordsOf = (result: ReturnType<typeof offer>) =>
  result.outcome.records.find((entry) => entry.source === "eu_fsf")?.records ?? [];
const coverageOf = (result: ReturnType<typeof offer>) =>
  result.outcome.coverage.find((entry) => entry.id === "eu_fsf");

describe("the EU list in the lookup, by a website", () => {
  it("gives a strong match to a vendor whose verified domain is the host of an entry's website", () => {
    // Entry 1101 lists www.Northwind-Export.example, in mixed case and with no scheme, and the
    // vendor's verified domain is the bare host: neither the www nor the case matters. The vendor
    // is named like no entry, so the website alone ties it to the entry.
    const result = offer(vendor("northwind-export.example"), ["northwind-export.example"]);

    expect(
      recordsOf(result).map((record) => [
        record.vrdb.sourceRecordId,
        record.vrdb.strength,
        record.vrdb.method,
        record.vrdb.matchedKey,
      ]),
    ).toEqual([["1101", "strong", "domain", "domain:northwind-export.example"]]);
    expect(recordsOf(result)[0].text).not.toContain(NAME_ONLY_LOOKUP_NOTE);
    expect(coverageOf(result)).toMatchObject({
      checked: true,
      outcome: "found",
      strong: 1,
      weak: 0,
    });
    expect(result.matches).toEqual([
      {
        recordId: 1,
        method: "domain",
        strength: "strong",
        matchedKey: "domain:northwind-export.example",
      },
    ]);
  });

  it("offers nothing to a vendor with the same website when the website check did not verify it", () => {
    const result = offer(vendor("northwind-export.example"), []);

    expect(recordsOf(result)).toEqual([]);
    expect(coverageOf(result)).toMatchObject({ checked: true, outcome: "none" });
  });

  it("matches no entry by the host of an e-mail address typed into the website field", () => {
    // The WEB field of 1101 also holds export@northwind-mail.example: a mailbox, not a site.
    const result = offer(vendor("northwind-mail.example"), ["northwind-mail.example"]);

    expect(recordsOf(result)).toEqual([]);
    expect(coverageOf(result)).toMatchObject({ checked: true, outcome: "none" });
  });

  it("matches no entry by a page on a platform where many have pages", () => {
    // The only website of 1106 is a page on vk.com. The record gives no key for it, and the
    // vendor's own verified domain on that platform gives none either.
    const tailspin = ROWS.find((row) => row.sourceRecordId === "1106");
    const result = offer(vendor("vk.com"), ["vk.com"]);

    expect(tailspin?.matchKeys.filter((key) => key.startsWith("domain:"))).toEqual([]);
    expect(recordsOf(result)).toEqual([]);
    expect(coverageOf(result)).toMatchObject({ checked: true, outcome: "none" });
  });
});
