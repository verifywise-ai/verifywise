/**
 * The NVD as a read-through source of the vendor risk database (M2, spec D2.7, Rulings 2 and 3 of
 * the M2 plan): the vendor is asked by its CPE vendor token alone, the query is the per-run
 * lookup's without the run's cutoff, and a CVE the NVD rejected is stored rejected. The answers are
 * written from the documented format, not copied from the API.
 */
import { NVD_MAX_BYTES, nvdUrl } from "../../../records/nvd";
import type { FetchJson } from "../../../records/types";
import type { ResearchTarget } from "../../../target";
import { nvdConnector, nvdRecordsOf } from "../nvd";

const NOW = new Date("2026-10-31T12:00:00Z");
const BRISE: ResearchTarget = {
  name: "Brise Networks, Inc.",
  domain: "brisenetworks.example",
  provides: "Network gear",
};

const rawCve = (id: string, over: Record<string, unknown> = {}) => ({
  cve: {
    id,
    published: "2026-10-01T10:15:00.000",
    vulnStatus: "Analyzed",
    descriptions: [{ lang: "en", value: "A flaw in BriseOS lets an attacker run code." }],
    metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: "CRITICAL" } }] },
    ...over,
  },
});

/** A fetch that answers one body and keeps what it was asked. */
function answering(body: unknown) {
  const asked: Array<{ url: string; maxBytes: number }> = [];
  const fetchJson: FetchJson = async (url, { maxBytes }) => {
    asked.push({ url, maxBytes });
    return body;
  };
  return { fetchJson, asked };
}

const ctx = (fetchJson: FetchJson) => ({
  now: NOW,
  signal: new AbortController().signal,
  fetchJson,
});

describe("nvdConnector", () => {
  it("asks for the vendor by its CPE vendor token, a strong key; a vendor without one is not asked", async () => {
    const { fetchJson } = answering({});
    const signal = new AbortController().signal;

    expect(await nvdConnector.keyOf(BRISE, { signal, fetchJson })).toEqual({
      key: "cpe:brisenetworks",
      weak: false,
    });
    expect(
      await nvdConnector.keyOf({ name: "X", domain: null, provides: "" }, { signal, fetchJson }),
    ).toBeNull();
  });

  it("asks the 119 days before today, critical only, whatever the cutoff", async () => {
    const { fetchJson, asked } = answering({ vulnerabilities: [] });

    await nvdConnector.fetch("cpe:brisenetworks", ctx(fetchJson));

    expect(asked).toEqual([{ url: nvdUrl("brisenetworks", NOW), maxBytes: NVD_MAX_BYTES }]);
    const query = new URL(asked[0].url).searchParams;
    expect(query.get("virtualMatchString")).toBe("cpe:2.3:a:brisenetworks");
    expect(query.get("cvssV3Severity")).toBe("CRITICAL");
    expect(query.get("pubStartDate")).toBe("2026-07-04T00:00:00.000");
    expect(query.get("pubEndDate")).toBe("2026-10-31T23:59:59.999");
  });

  it("stores a CVE with the per-run lookup's text, under its id and the token's key", async () => {
    const { fetchJson } = answering({ vulnerabilities: [rawCve("CVE-2026-5001")] });

    const { records } = await nvdConnector.fetch("cpe:brisenetworks", ctx(fetchJson));

    expect(records).toEqual([
      {
        sourceRecordId: "CVE-2026-5001",
        recordType: "vulnerability",
        title: "CVE-2026-5001: critical vulnerability (CVSS 9.8)",
        summary:
          "National Vulnerability Database (nvd.nist.gov). CVE: CVE-2026-5001. " +
          "Published: 2026-10-01. CVSS base score: 9.8 (CRITICAL). " +
          "Description: A flaw in BriseOS lets an attacker run code.",
        url: "https://nvd.nist.gov/vuln/detail/CVE-2026-5001",
        identifiers: { cveID: "CVE-2026-5001", cpeVendor: "brisenetworks" },
        matchKeys: ["cpe:brisenetworks"],
        publishedAt: "2026-10-01",
        sourceUpdatedAt: null,
      },
    ]);
  });

  it("a Rejected CVE is stored rejected", async () => {
    const { fetchJson } = answering({
      vulnerabilities: [
        rawCve("CVE-2026-5001", { vulnStatus: "Rejected" }),
        rawCve("CVE-2026-5002", { vulnStatus: "Modified" }),
      ],
    });

    const { records } = await nvdConnector.fetch("cpe:brisenetworks", ctx(fetchJson));

    expect(records.map((record) => [record.sourceRecordId, record.status])).toEqual([
      ["CVE-2026-5001", "rejected"],
      ["CVE-2026-5002", undefined],
    ]);
  });

  it("gives the records of an answer as fetch stores them, with no request", async () => {
    const body = {
      vulnerabilities: [
        rawCve("CVE-2026-5001"),
        rawCve("CVE-2026-5002", { vulnStatus: "Rejected" }),
      ],
    };
    const { fetchJson } = answering(body);

    const records = nvdRecordsOf(body, "brisenetworks");

    expect(records).toEqual(
      (await nvdConnector.fetch("cpe:brisenetworks", ctx(fetchJson))).records,
    );
    expect(
      records.map((record) => [record.sourceRecordId, record.matchKeys, record.status]),
    ).toEqual([
      ["CVE-2026-5001", ["cpe:brisenetworks"], undefined],
      ["CVE-2026-5002", ["cpe:brisenetworks"], "rejected"],
    ]);
  });

  it("an answer that holds no list is no records, and covers nothing", async () => {
    const { fetchJson } = answering({ message: "Not the API" });

    expect(await nvdConnector.fetch("cpe:brisenetworks", ctx(fetchJson))).toEqual({
      records: [],
      coversSince: null,
    });
  });

  it("an answer whose total fits its page covers the window from the first day it asked for", async () => {
    // A stored CVE of the key published since then that the answer lacks is no longer the key's
    // (M2 final review, Important 1).
    const { fetchJson } = answering({
      resultsPerPage: 1,
      startIndex: 0,
      totalResults: 1,
      vulnerabilities: [rawCve("CVE-2026-5001")],
    });

    const answer = await nvdConnector.fetch("cpe:brisenetworks", ctx(fetchJson));

    expect(answer.coversSince).toBe("2026-07-04");
    expect(answer.records.map((record) => record.sourceRecordId)).toEqual(["CVE-2026-5001"]);
  });

  it("an empty answer with a total of none covers the window too", async () => {
    const { fetchJson } = answering({ totalResults: 0, vulnerabilities: [] });

    expect(await nvdConnector.fetch("cpe:brisenetworks", ctx(fetchJson))).toEqual({
      records: [],
      coversSince: "2026-07-04",
    });
  });

  it("an answer with more results than its page, or without a total, covers nothing", async () => {
    const more = answering({ totalResults: 51, vulnerabilities: [rawCve("CVE-2026-5001")] });
    const untold = answering({ vulnerabilities: [rawCve("CVE-2026-5001")] });

    expect((await nvdConnector.fetch("cpe:brisenetworks", ctx(more.fetchJson))).coversSince).toBe(
      null,
    );
    expect((await nvdConnector.fetch("cpe:brisenetworks", ctx(untold.fetchJson))).coversSince).toBe(
      null,
    );
  });

  it("asks nothing for a key that is not a CPE vendor token", async () => {
    const { fetchJson, asked } = answering({ vulnerabilities: [] });

    await expect(nvdConnector.fetch("cik:0000320193", ctx(fetchJson))).rejects.toThrow(
      "The NVD is asked by a CPE vendor token",
    );
    expect(asked).toEqual([]);
  });
});
