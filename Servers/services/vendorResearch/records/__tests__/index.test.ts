import { RESEARCH_CATEGORIES } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError } from "../../../webResearch/guardedFetch";
import { PageReadError, type PageReader } from "../../../webResearch/readPage";
import { buildTarget } from "../../target";
import { hibpUrl } from "../hibp";
import { activeReadThroughs, activeVrdbSources } from "../../vrdb/sources";
import { NVD_LIMITS, createRecordsLookup, sourcesBesideVrdb } from "../index";
import { KEV_URL } from "../kev";
import { nvdUrl } from "../nvd";
import {
  OFAC_ALT_MAX_BYTES,
  OFAC_ALT_URL,
  OFAC_SDN_MAX_BYTES,
  OFAC_SDN_URL,
  ofacEntryUrl,
} from "../ofac";
import { SEC_TICKERS_URL, secSubmissionsUrl } from "../sec";
import { NVD_SPACER_KEY, SPACER_SCRIPT } from "../sharedSpacer";
import { createSpacer } from "../spacer";
import { STATUS_FEED_MAX_BYTES } from "../statuspage";
import type { FetchJson, FetchText, RecordsInput } from "../types";

// No test of this file reaches the web: the feeds and the lists are given to the lookup, and one that
// is not given is not found.
jest.mock("../feedFetch", () => ({
  fetchFeed: jest.fn(async () => {
    throw new (jest.requireActual("../../../webResearch/guardedFetch").FetchError)("not_found");
  }),
}));
jest.mock("../csvFetch", () => ({
  fetchCsv: jest.fn(async () => {
    throw new (jest.requireActual("../../../webResearch/guardedFetch").FetchError)("not_found");
  }),
}));
// The turns of the NVD are taken in the application's Redis unless a test gives a spacer.
const mockRedis = { status: "ready", eval: jest.fn(async (): Promise<unknown> => 0) };
jest.mock("../../../../database/redis", () => ({ __esModule: true, default: mockRedis }));

const NOW = new Date("2026-10-28T12:00:00Z");
const target = buildTarget({
  vendor_name: "Brise Networks, Inc.",
  website: "https://www.brisenetworks.example",
  vendor_provides: "Network gear",
});
// The databases of security incidents: the status page of the vendor and the sanctions list are
// asked in their own tests.
const input = (over: Partial<RecordsInput> = {}): RecordsInput => ({
  target,
  researchable: ["security_incidents"],
  now: NOW,
  signal: new AbortController().signal,
  ...over,
});

const kevEntry = (over: Record<string, unknown> = {}) => ({
  cveID: "CVE-2026-1001",
  vendorProject: "Brise Networks",
  product: "BriseOS",
  vulnerabilityName: "BriseOS Authentication Bypass Vulnerability",
  dateAdded: "2026-10-20",
  shortDescription: "BriseOS lets a remote attacker log in.",
  requiredAction: "Apply the update.",
  dueDate: "2026-11-10",
  knownRansomwareCampaignUse: "Unknown",
  ...over,
});
const nvdCve = (id = "CVE-2026-1001") => ({
  cve: {
    id,
    published: "2026-10-18T09:00:00.000",
    descriptions: [{ lang: "en", value: "A flaw in BriseOS." }],
    metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: "CRITICAL" } }] },
  },
});
const breach = {
  Name: "Brise",
  Title: "Brise Networks",
  Domain: "brisenetworks.example",
  BreachDate: "2026-09-02",
  AddedDate: "2026-09-10T08:01:00Z",
  PwnCount: 100,
  Description: "A breach.",
  DataClasses: ["Passwords"],
  IsVerified: true,
};

const secTickers = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 1262039, ticker: "BRSE", title: "Brise Networks, Inc." },
};
const secRow = (over: Record<string, string> = {}) => ({
  accessionNumber: "0001262039-26-000003",
  filingDate: "2026-10-05",
  form: "8-K",
  items: "1.05,9.01",
  primaryDocument: "brise-20261005.htm",
  ...over,
});
const secSubmissions = (rows = [secRow()]) => ({
  cik: "0001262039",
  name: "Brise Networks, Inc.",
  filings: {
    recent: {
      accessionNumber: rows.map((row) => row.accessionNumber),
      filingDate: rows.map((row) => row.filingDate),
      form: rows.map((row) => row.form),
      items: rows.map((row) => row.items),
      primaryDocument: rows.map((row) => row.primaryDocument),
    },
  },
});

const NVD = nvdUrl("brisenetworks", NOW);
const HIBP = hibpUrl("brisenetworks.example");
const SEC = secSubmissionsUrl("0001262039");
const FILING =
  "https://www.sec.gov/Archives/edgar/data/1262039/000126203926000003/brise-20261005.htm";

/** A fetch that answers from a table: an Error in it is thrown, an address not in it is not found. */
function scripted(answers: Record<string, unknown>) {
  const asked: string[] = [];
  const fetchJson: FetchJson = async (url) => {
    asked.push(url);
    const answer = answers[url];
    if (answer instanceof Error) throw answer;
    if (!(url in answers)) throw new FetchError("not_found");
    return answer;
  };
  return { fetchJson, asked };
}
const open = async () => true;
const answers = () => ({
  [KEV_URL]: { vulnerabilities: [kevEntry()] },
  [NVD]: { vulnerabilities: [nvdCve("CVE-2026-2002")] },
  [HIBP]: [breach],
  [SEC_TICKERS_URL]: secTickers,
  [SEC]: secSubmissions(),
});

/** A row of SDN.CSV: an entity has a blank type, and the files write a field with nothing in it as `-0- `. */
const ofacRow = (id: number, name: string, programs = "CUBA") =>
  `${id},"${name}",-0- ,"${programs}",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- `;
const SDN_CSV = `${[
  ofacRow(901, "BRISE NETWORKS LLC", "RUSSIA-EO14024"),
  ofacRow(902, "OTHER HOLDINGS LTD"),
].join("\r\n")}\r\n`;
const ALT_CSV = '901,5001,"aka","BRISE NETWORKS SERVICES",-0- \r\n';

/** A fetch of the files of the sanctions list from a table, as `scripted` does for JSON. */
function lists(
  files: Record<string, string | Error> = { [OFAC_SDN_URL]: SDN_CSV, [OFAC_ALT_URL]: ALT_CSV },
) {
  const asked: Array<{ url: string; maxBytes: number }> = [];
  const fetchCsv: FetchText = async (url, { maxBytes }) => {
    asked.push({ url, maxBytes });
    const file = files[url];
    if (file instanceof Error) throw file;
    if (file === undefined) throw new FetchError("not_found");
    return file;
  };
  return { fetchCsv, asked };
}

describe("createRecordsLookup", () => {
  it("looks the vendor up in the catalog, the NVD, Have I Been Pwned and the SEC, and answers for each", async () => {
    const { fetchJson } = scripted(answers());

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: open })(input());

    expect(outcomes.map((o) => [o.source, o.outcome, o.records.length, o.url])).toEqual([
      ["kev", "ok", 1, KEV_URL],
      ["nvd", "ok", 1, NVD],
      ["hibp", "ok", 1, HIBP],
      ["sec", "ok", 1, SEC],
    ]);
    expect(outcomes.every((o) => typeof o.ms === "number")).toBe(true);
    expect(outcomes[0].records[0].url).toBe("https://nvd.nist.gov/vuln/detail/CVE-2026-1001");
    expect(outcomes[2].records[0].url).toBe("https://haveibeenpwned.com/api/v3/breach/Brise");
    expect(outcomes[3].records[0].url).toBe(FILING);
  });

  it("asks for the window of the lookback: the cutoff is passed to every database", async () => {
    const { fetchJson, asked } = scripted({
      [KEV_URL]: { vulnerabilities: [kevEntry({ dateAdded: "2024-01-01" })] },
      [nvdUrl("brisenetworks", NOW, "2026-09-15")]: { vulnerabilities: [] },
      [HIBP]: [breach],
      [SEC_TICKERS_URL]: secTickers,
      [SEC]: secSubmissions([secRow({ filingDate: "2026-01-02" })]),
    });

    const [kev, nvd, hibp, sec] = await createRecordsLookup({ fetchJson, nvdSpacer: open })(
      input({ cutoffs: { security_incidents: "2026-09-15" } }),
    );

    expect(asked).toContain(nvdUrl("brisenetworks", NOW, "2026-09-15"));
    expect([kev.outcome, kev.omitted]).toEqual(["empty", { old: 1 }]);
    expect(nvd.outcome).toBe("empty");
    expect(hibp.records).toHaveLength(0);
    expect(hibp.omitted).toEqual({ old: 1 });
    expect([sec.outcome, sec.omitted]).toEqual(["empty", { old: 1 }]);
  });

  it("passes each database the cutoff of its own category", async () => {
    const { fetchJson, asked } = scripted(answers());

    await createRecordsLookup({ fetchJson, nvdSpacer: open })(
      input({ cutoffs: { security_incidents: "2026-09-15", availability: "2026-10-27" } }),
    );

    // The NVD asks for the window in its address: the one of security incidents, not of availability.
    expect(asked).toContain(nvdUrl("brisenetworks", NOW, "2026-09-15"));
    expect(asked).not.toContain(nvdUrl("brisenetworks", NOW, "2026-10-27"));
  });

  it("asks only the databases of the categories the run researches", async () => {
    const { fetchJson, asked } = scripted(answers());
    const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open });

    const outcomes = await lookup(input({ researchable: ["certifications", "ai_specific"] }));

    expect(outcomes).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("with the VRDB on the records lookup leaves KEV, the NVD and OFAC to it", async () => {
    const { fetchJson, asked } = scripted(answers());
    const { fetchCsv, asked: files } = lists();
    const lookup = createRecordsLookup({
      fetchJson,
      fetchCsv,
      nvdSpacer: open,
      sources: sourcesBesideVrdb(),
    });

    const outcomes = await lookup(
      input({ researchable: ["security_incidents", "legal_regulatory", "availability"] }),
    );

    expect(sourcesBesideVrdb()).toEqual(["hibp", "sec", "statuspage"]);
    expect(outcomes.map((o) => o.source)).toEqual(["hibp", "sec", "statuspage"]);
    // The run does not ask the NVD itself under the flag: the VRDB reads it through.
    expect(asked).not.toContain(KEV_URL);
    expect(asked).not.toContain(NVD);
    expect(files).toEqual([]);
  });

  describe("the SEC behind Q4 (Ruling 14 of the M2 plan)", () => {
    const CLOSED = { Q4: false, Q6: false, Q7: false };
    const ids = (sources: ReadonlyArray<{ id: string }>) => sources.map((source) => source.id);

    it("the SEC stays a per-run lookup while Q4 is closed", () => {
      expect(sourcesBesideVrdb()).toEqual(["hibp", "sec", "statuspage"]);
      expect(sourcesBesideVrdb(CLOSED)).toEqual(["hibp", "sec", "statuspage"]);
      expect(ids(activeVrdbSources())).not.toContain("sec");
      expect(ids(activeVrdbSources(CLOSED))).not.toContain("sec");
    });

    it("is a read-through when Q4 is open", () => {
      const open = { ...CLOSED, Q4: true };

      expect(sourcesBesideVrdb(open)).toEqual(["hibp", "statuspage"]);
      expect(ids(activeReadThroughs(open))).toEqual(["nvd", "sec"]);
    });
  });

  it("says empty for a database that has nothing of the vendor", async () => {
    const { fetchJson } = scripted({
      [KEV_URL]: { vulnerabilities: [kevEntry({ vendorProject: "Other" })] },
      [NVD]: { vulnerabilities: [] },
      [HIBP]: [],
      [SEC_TICKERS_URL]: { "0": { cik_str: 5, ticker: "OTH", title: "Other Corp" } },
    });

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: open })(input());

    expect(outcomes.map((o) => o.outcome)).toEqual(["empty", "empty", "empty", "empty"]);
  });

  it("does not ask the NVD for a vendor with no token, Have I Been Pwned for one with no domain, and the SEC for one with no name", async () => {
    const { fetchJson, asked } = scripted(answers());
    const nameless = { ...target, name: "A", domain: null };

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: open })(
      input({ target: nameless }),
    );

    expect(outcomes.map((o) => o.source)).toEqual([]);
    expect(asked).toEqual([]);

    const withName = { ...target, domain: null };
    const named = await createRecordsLookup({ fetchJson, nvdSpacer: open })(
      input({ target: withName }),
    );
    expect(named.map((o) => o.source)).toEqual(["kev", "nvd", "sec"]);
  });

  it("answers a database that fails with the reason, and the others are not touched", async () => {
    const { fetchJson } = scripted({
      ...answers(),
      [NVD]: new FetchError("blocked_by_site"),
      [HIBP]: new FetchError("not_allowed"),
      [SEC_TICKERS_URL]: new FetchError("not_found"),
    });

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: open })(input());

    expect(outcomes.map((o) => [o.source, o.outcome, o.reason])).toEqual([
      ["kev", "ok", undefined],
      ["nvd", "failed", "blocked_by_site"],
      ["hibp", "failed", "unreachable"],
      ["sec", "failed", "not_found"],
    ]);
    expect(outcomes[1].records).toEqual([]);
  });

  it("does not hide a bug: an error that is not a failure of the web is thrown", async () => {
    const fetchJson: FetchJson = async () => {
      throw new TypeError("a bug");
    };

    await expect(createRecordsLookup({ fetchJson, nvdSpacer: open })(input())).rejects.toThrow(
      "a bug",
    );
  });

  it("keeps the catalog for the next vendor, and the answer for the next lookup of a domain", async () => {
    const { fetchJson, asked } = scripted(answers());
    const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open });

    await lookup(input());
    await lookup(input());
    await lookup(input({ target: { ...target, name: "Other", domain: "other.example" } }));

    expect(asked.filter((url) => url === KEV_URL)).toHaveLength(1);
    expect(asked.filter((url) => url === NVD)).toHaveLength(1);
    expect(asked.filter((url) => url === HIBP)).toHaveLength(1);
    expect(asked.filter((url) => url === SEC_TICKERS_URL)).toHaveLength(1);
    expect(asked.filter((url) => url === SEC)).toHaveLength(1);
  });

  it("does not ask the NVD when its turn is too far off, and says it could not be reached", async () => {
    const { fetchJson, asked } = scripted(answers());

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: async () => false })(
      input(),
    );

    expect(asked).not.toContain(NVD);
    expect(outcomes[1]).toMatchObject({ source: "nvd", outcome: "failed", reason: "unreachable" });
  });

  it("applies the lookback itself to what the NVD gave: a CVE published before the cutoff is left out", async () => {
    const { fetchJson } = scripted({
      ...answers(),
      [nvdUrl("brisenetworks", NOW, "2026-10-19")]: { vulnerabilities: [nvdCve("CVE-2026-2002")] },
    });

    const [, nvd] = await createRecordsLookup({ fetchJson, nvdSpacer: open })(
      input({ cutoffs: { security_incidents: "2026-10-19" } }),
    );

    expect([nvd.outcome, nvd.omitted]).toEqual(["empty", { old: 1 }]);
  });

  it("gives up on the databases that have not answered within the time it has", async () => {
    const hang: FetchJson = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new FetchError("unreachable")), {
          once: true,
        });
      });

    const outcomes = await createRecordsLookup({ fetchJson: hang, nvdSpacer: open, timeoutMs: 20 })(
      input(),
    );

    expect(outcomes.map((o) => [o.source, o.outcome, o.reason])).toEqual([
      ["kev", "failed", "unreachable"],
      ["nvd", "failed", "unreachable"],
      ["hibp", "failed", "unreachable"],
      ["sec", "failed", "unreachable"],
    ]);
  });

  it("does not cut the databases off within their first moments", async () => {
    const slow: FetchJson = async (url, { signal }) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (signal.aborted) throw new FetchError("unreachable");
      return url === HIBP ? [] : { vulnerabilities: [] };
    };

    const outcomes = await createRecordsLookup({ fetchJson: slow, nvdSpacer: open })(input());

    expect(outcomes.map((o) => o.outcome)).toEqual(["empty", "empty", "empty", "empty"]);
  });

  it("asks the NVD for four vendors at once and not for a fifth, whose turn is too far off", async () => {
    const fetchJson: FetchJson = async (url) =>
      url.includes("haveibeenpwned") ? [] : { vulnerabilities: [] };
    const lookup = createRecordsLookup({ fetchJson, nvdSpacer: createSpacer(NVD_LIMITS) });
    const vendor = (name: string) =>
      buildTarget({
        vendor_name: `${name} Corp`,
        website: `https://${name.toLowerCase()}.example`,
        vendor_provides: "Software",
      });

    const results = await Promise.all(
      ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((name) =>
        lookup(input({ target: vendor(name) })),
      ),
    );

    const nvd = results.map((outcomes) => outcomes.find((o) => o.source === "nvd"));
    expect(nvd.map((o) => [o?.outcome, o?.reason])).toEqual([
      ["empty", undefined],
      ["empty", undefined],
      ["empty", undefined],
      ["empty", undefined],
      ["failed", "unreachable"],
    ]);
  });

  it("takes the NVD's turn in the window that every worker shares, in the application's Redis", async () => {
    const { fetchJson, asked } = scripted(answers());
    mockRedis.eval.mockClear();

    const [, nvd] = await createRecordsLookup({ fetchJson })(input());

    expect(nvd.outcome).toBe("ok");
    expect(asked).toContain(NVD);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      SPACER_SCRIPT,
      2,
      NVD_SPACER_KEY,
      `${NVD_SPACER_KEY}:seq`,
      4,
      30_000,
      3_000,
    );
  });

  it("does not ask the NVD when the shared window has no turn for it: the NVD is busy, not down", async () => {
    const { fetchJson, asked } = scripted(answers());
    mockRedis.eval.mockResolvedValueOnce(-1);

    const [, nvd] = await createRecordsLookup({ fetchJson })(input());

    expect([nvd.outcome, nvd.reason]).toEqual(["failed", "unreachable"]);
    expect(asked).not.toContain(NVD);
  });

  describe("a database that fails", () => {
    const COOL_DOWN_MS = 5 * 60_000;

    it("is not asked again for five minutes: the answer is a failure at once, with no request", async () => {
      let clock = 1_000_000;
      const { fetchJson, asked } = scripted({
        ...answers(),
        [HIBP]: new FetchError("unreachable"),
      });
      const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open, clock: () => clock });

      await lookup(input());
      clock += COOL_DOWN_MS - 1;
      const [, , hibp] = await lookup(input());

      expect(hibp).toMatchObject({
        source: "hibp",
        outcome: "failed",
        reason: "unreachable",
        ms: 0,
      });
      expect(asked.filter((url) => url === HIBP)).toHaveLength(1);
    });

    it("is asked again when the five minutes have passed", async () => {
      let clock = 1_000_000;
      const { fetchJson, asked } = scripted({
        ...answers(),
        [HIBP]: new FetchError("unreachable"),
      });
      const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open, clock: () => clock });

      await lookup(input());
      clock += COOL_DOWN_MS;
      await lookup(input());

      expect(asked.filter((url) => url === HIBP)).toHaveLength(2);
    });

    it("does not hold back the other databases", async () => {
      const { fetchJson, asked } = scripted({
        ...answers(),
        [HIBP]: new FetchError("unreachable"),
        [nvdUrl("other", NOW)]: { vulnerabilities: [] },
      });
      const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open });

      await lookup(input());
      const [kev, nvd] = await lookup(input({ target: { ...target, domain: "other.example" } }));

      expect([kev.outcome, nvd.outcome]).toEqual(["ok", "empty"]);
      expect(asked.filter((url) => url === KEV_URL)).toHaveLength(1);
    });

    it("is not held back when the NVD was only busy: its turn was too far off, which is no outage", async () => {
      let busy = true;
      const { fetchJson, asked } = scripted(answers());
      const lookup = createRecordsLookup({ fetchJson, nvdSpacer: async () => !busy });

      await lookup(input());
      busy = false;
      const [, nvd] = await lookup(input());

      expect(nvd.outcome).toBe("ok");
      expect(asked).toContain(NVD);
    });

    it("is not held back when the run was cancelled", async () => {
      const controller = new AbortController();
      const { fetchJson, asked } = scripted({
        ...answers(),
        [HIBP]: new FetchError("unreachable"),
      });
      const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open });
      controller.abort();

      await lookup(input({ signal: controller.signal }));
      await lookup(input());

      expect(asked.filter((url) => url === HIBP)).toHaveLength(2);
    });
  });

  it("does not take a turn of the NVD for an answer it already has", async () => {
    const { fetchJson } = scripted(answers());
    let turns = 0;
    const lookup = createRecordsLookup({
      fetchJson,
      nvdSpacer: async () => {
        turns += 1;
        return true;
      },
    });

    await lookup(input());
    await lookup(input());

    expect(turns).toBe(1);
  });

  it("makes a CVE that the catalog lists and the NVD scores one source, with the words of both", async () => {
    const { fetchJson } = scripted({
      ...answers(),
      [NVD]: { vulnerabilities: [nvdCve("CVE-2026-1001"), nvdCve("CVE-2026-2002")] },
    });

    const [kev, nvd] = await createRecordsLookup({ fetchJson, nvdSpacer: open })(input());

    expect(kev.records).toHaveLength(1);
    expect(kev.records[0].text).toContain("CISA Known Exploited Vulnerabilities Catalog");
    expect(kev.records[0].text).toContain(
      "National Vulnerability Database (nvd.nist.gov). CVE: CVE-2026-1001.",
    );
    expect(nvd.records.map((record) => record.url.slice(-13))).toEqual(["CVE-2026-2002"]);
    expect(nvd.outcome).toBe("ok");
  });

  it("says empty for the NVD when all of its CVEs are in the catalog", async () => {
    const { fetchJson } = scripted({
      ...answers(),
      [NVD]: { vulnerabilities: [nvdCve("CVE-2026-1001")] },
    });

    const [, nvd] = await createRecordsLookup({ fetchJson, nvdSpacer: open })(input());

    expect(nvd.records).toEqual([]);
    expect(nvd.outcome).toBe("empty");
  });
});

describe("the SEC filings of the vendor", () => {
  const TEXT =
    "FORM 8-K CURRENT REPORT Item 1.05 Material Cybersecurity Incidents. On October 2, 2026, Brise Networks " +
    "detected unauthorized access to a part of its network and took the affected systems offline. " +
    "Item 9.01 Exhibits.";
  const EXCERPT =
    "Material Cybersecurity Incidents. On October 2, 2026, Brise Networks detected unauthorized access " +
    "to a part of its network and took the affected systems offline.";

  /** A page reader that answers from one text, or fails with the error it is given. */
  function filings(answer: string | Error = TEXT) {
    const asked: Array<{ url: string; signal?: AbortSignal }> = [];
    const readPage: PageReader = async (url, signal) => {
      asked.push({ url, signal });
      if (answer instanceof Error) throw answer;
      return { url, title: "", publishedAt: null, text: answer, links: [] };
    };
    return { readPage, asked };
  }
  const run = (over: Partial<RecordsInput> = {}, answered: Record<string, unknown> = answers()) => {
    const { fetchJson, asked } = scripted(answered);
    const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open });
    const sec = async (more: Partial<RecordsInput> = {}) =>
      (await lookup(input({ ...over, ...more }))).find((o) => o.source === "sec")!;
    return { lookup, sec, asked };
  };

  it("writes a filing as a source: the facts of the database and the text of its Item 1.05 from the filing", async () => {
    const { readPage, asked } = filings();

    const sec = await run().sec({ readPage });

    expect(sec).toMatchObject({ source: "sec", outcome: "ok", url: SEC, omitted: {} });
    expect(sec.records).toHaveLength(1);
    expect(sec.records[0]).toMatchObject({
      url: FILING,
      publishedAt: "2026-10-05",
      title:
        "Brise Networks, Inc.: Form 8-K, Item 1.05 (material cybersecurity incident), filed 2026-10-05",
    });
    expect(sec.records[0].text).toContain("SEC EDGAR (sec.gov). Company: Brise Networks, Inc.");
    expect(sec.records[0].text).toContain(`Item 1.05: ${EXCERPT}`);
    expect(asked.map((read) => read.url)).toEqual([FILING]);
  });

  it("gives the facts of the filing alone when it is given no page reader", async () => {
    const sec = await run().sec();

    expect(sec.outcome).toBe("ok");
    expect(sec.records[0].text).toContain(
      "Items reported: 1.05 (Material Cybersecurity Incidents), 9.01.",
    );
    expect(sec.records[0].text).not.toContain("Item 1.05:");
  });

  it("gives the facts alone when the filing cannot be read, and tries to read it again the next time", async () => {
    const down = filings(new PageReadError("unreachable"));
    const { sec } = run();

    const first = await sec({ readPage: down.readPage });
    const up = filings();
    const second = await sec({ readPage: up.readPage });

    expect(first.outcome).toBe("ok");
    expect(first.records[0].text).not.toContain("Item 1.05:");
    expect(second.records[0].text).toContain(`Item 1.05: ${EXCERPT}`);
    expect(up.asked).toHaveLength(1);
  });

  it("keeps the text of a filing for the next lookup: the document is read once", async () => {
    const { readPage, asked } = filings();
    const { sec } = run();

    await sec({ readPage });
    const second = await sec({ readPage });

    expect(asked).toHaveLength(1);
    expect(second.records[0].text).toContain(`Item 1.05: ${EXCERPT}`);
  });

  it("gives the facts alone for a filing whose text holds no Item 1.05", async () => {
    const { readPage } = filings(
      "FORM 8-K CURRENT REPORT Item 8.01 Other Events. Nothing of the kind.",
    );

    const sec = await run().sec({ readPage });

    expect(sec.outcome).toBe("ok");
    expect(sec.records[0].text).not.toContain("Item 1.05:");
  });

  it("reads each filing it writes, with the signal of the lookup", async () => {
    const { readPage, asked } = filings();
    const rows = [
      secRow({ accessionNumber: "0001262039-26-000003", filingDate: "2026-10-05" }),
      secRow({
        accessionNumber: "0001262039-26-000009",
        filingDate: "2026-10-12",
        primaryDocument: "brise-20261012.htm",
      }),
    ];
    const sec = await run({}, { ...answers(), [SEC]: secSubmissions(rows) }).sec({ readPage });

    expect(sec.records.map((record) => record.publishedAt)).toEqual(["2026-10-12", "2026-10-05"]);
    expect(asked.map((read) => read.url).sort()).toEqual([
      "https://www.sec.gov/Archives/edgar/data/1262039/000126203926000003/brise-20261005.htm",
      "https://www.sec.gov/Archives/edgar/data/1262039/000126203926000009/brise-20261012.htm",
    ]);
    expect(asked.every((read) => read.signal instanceof AbortSignal)).toBe(true);
  });

  it("does not wait on a filing past the time the lookup has: the facts are given without it", async () => {
    const readPage: PageReader = (_url, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new PageReadError("unreachable")), {
          once: true,
        });
      });
    const { fetchJson } = scripted(answers());
    const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open, timeoutMs: 40 });

    const outcomes = await lookup(input({ readPage }));

    const sec = outcomes.find((o) => o.source === "sec")!;
    expect(sec.outcome).toBe("ok");
    expect(sec.records[0].text).not.toContain("Item 1.05:");
  });

  it("does not hide a bug of the page reader: an error that is not a failed read is thrown", async () => {
    const readPage: PageReader = async () => {
      throw new TypeError("a bug");
    };

    await expect(run().sec({ readPage })).rejects.toThrow("a bug");
  });

  it("a stored CIK skips the tickers file", async () => {
    // A name that no registrant has: the CIK a person stored is the registrant.
    const stored = { ...target, name: "Zed Holdings", identifiers: { secCik: "0001262039" } };
    const { sec, asked } = run({ target: stored });

    const outcome = await sec();

    expect(outcome).toMatchObject({ source: "sec", outcome: "ok", url: SEC });
    expect(outcome.records.map((record) => record.url)).toEqual([FILING]);
    expect(asked).toContain(SEC);
    expect(asked).not.toContain(SEC_TICKERS_URL);
  });

  it("a stored value that is no CIK is no registrant: the names are looked for", async () => {
    const { sec, asked } = run({ target: { ...target, identifiers: { secCik: "CIK 12" } } });

    expect(await sec()).toMatchObject({ outcome: "ok", url: SEC });
    expect(asked).toContain(SEC_TICKERS_URL);
  });

  it("takes the registrant whose name is a name of the vendor, never one that only contains it", async () => {
    const { sec, asked } = run(
      {},
      {
        ...answers(),
        [SEC_TICKERS_URL]: {
          "0": { cik_str: 77, ticker: "BNS", title: "Brise Networks Staffing Inc." },
          "1": { cik_str: 78, ticker: "BR", title: "Brise" },
        },
      },
    );

    const outcome = await sec();

    expect(outcome).toMatchObject({ outcome: "empty", url: SEC_TICKERS_URL, records: [] });
    expect(asked).not.toContain(SEC);
  });

  it("gives nothing, and asks for no filing, when two companies have the name", async () => {
    const { sec, asked } = run(
      {},
      {
        ...answers(),
        [SEC_TICKERS_URL]: {
          "0": { cik_str: 1262039, ticker: "BRSE", title: "Brise Networks, Inc." },
          "1": { cik_str: 999, ticker: "BRS", title: "Brise Networks" },
        },
      },
    );

    const outcome = await sec();

    expect(outcome).toMatchObject({ outcome: "empty", records: [] });
    expect(asked.filter((url) => url.startsWith("https://data.sec.gov/submissions"))).toEqual([]);
  });

  it("looks for the names of the vendor and not for the brand of its domain", async () => {
    const other = buildTarget({
      vendor_name: "Zed Holdings",
      website: "https://www.brisenetworks.example",
      vendor_provides: "Network gear",
    });
    const { sec, asked } = run({ target: other });

    const outcome = await sec();

    expect(outcome).toMatchObject({ outcome: "empty", url: SEC_TICKERS_URL, records: [] });
    expect(asked).not.toContain(SEC);
  });

  it("takes a registrant by another name of the vendor", async () => {
    const aliased = { ...target, name: "Zed Holdings", aliases: ["Brise Networks"] };
    const { sec } = run({ target: aliased });

    expect((await sec()).outcome).toBe("ok");
  });

  it("says empty for a registrant with no such filing, at the address of its filings", async () => {
    const { sec } = run(
      {},
      {
        ...answers(),
        [SEC]: secSubmissions([secRow({ items: "2.02,9.01" }), secRow({ form: "10-K" })]),
      },
    );

    expect(await sec()).toMatchObject({ outcome: "empty", url: SEC, records: [], omitted: {} });
  });

  it("gives the newest three of the filings and counts the others", async () => {
    const rows = [1, 2, 3, 4, 5].map((n) =>
      secRow({
        accessionNumber: `0001262039-26-00000${n}`,
        filingDate: `2026-10-0${n}`,
        primaryDocument: `brise-${n}.htm`,
      }),
    );
    const { sec } = run({}, { ...answers(), [SEC]: secSubmissions(rows) });

    const outcome = await sec();

    expect(outcome.records.map((record) => record.publishedAt)).toEqual([
      "2026-10-05",
      "2026-10-04",
      "2026-10-03",
    ]);
    expect(outcome.omitted).toEqual({ more: 2 });
  });

  it("answers a registrant whose filings cannot be read with the reason, at their address", async () => {
    const { sec } = run({}, { ...answers(), [SEC]: new FetchError("blocked_by_site") });

    expect(await sec()).toMatchObject({
      outcome: "failed",
      reason: "blocked_by_site",
      url: SEC,
      records: [],
    });
  });

  it("answers a failed list of registrants with the reason, at its address", async () => {
    const { sec } = run({}, { ...answers(), [SEC_TICKERS_URL]: new FetchError("unreachable") });

    expect(await sec()).toMatchObject({
      outcome: "failed",
      reason: "unreachable",
      url: SEC_TICKERS_URL,
    });
  });

  it("answers a document that is no list of filings as a page that cannot be read", async () => {
    const { sec } = run({}, { ...answers(), [SEC]: { cik: "0001262039" } });

    expect(await sec()).toMatchObject({ outcome: "failed", reason: "unsupported_type", url: SEC });
  });

  it("keeps the list of registrants for the next vendor, and the filings of a registrant for the next lookup", async () => {
    const { lookup, asked } = run();

    await lookup(input());
    await lookup(input());
    await lookup(input({ target: { ...target, name: "Apple Inc.", domain: "apple.example" } }));

    expect(asked.filter((url) => url === SEC_TICKERS_URL)).toHaveLength(1);
    expect(asked.filter((url) => url === SEC)).toHaveLength(1);
    expect(asked.filter((url) => url === secSubmissionsUrl("0000320193"))).toHaveLength(1);
  });

  it("is not asked again for five minutes after it timed out, which is a failure like any other", async () => {
    let asked = 0;
    const hang: FetchJson = (url, { signal }) => {
      if (url === SEC_TICKERS_URL) asked += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new FetchError("unreachable")), {
          once: true,
        });
      });
    };
    const lookup = createRecordsLookup({ fetchJson: hang, nvdSpacer: open, timeoutMs: 20 });

    await lookup(input());
    const second = (await lookup(input())).find((o) => o.source === "sec")!;

    expect(second).toMatchObject({ outcome: "failed", reason: "unreachable" });
    expect(asked).toBe(1);
  });

  it("is not asked again for five minutes after it failed", async () => {
    let clock = 1_000_000;
    const { fetchJson, asked } = scripted({
      ...answers(),
      [SEC_TICKERS_URL]: new FetchError("unreachable"),
    });
    const lookup = createRecordsLookup({ fetchJson, nvdSpacer: open, clock: () => clock });

    await lookup(input());
    clock += 5 * 60_000 - 1;
    const second = (await lookup(input())).find((o) => o.source === "sec")!;
    clock += 1;
    await lookup(input());

    expect(second).toMatchObject({ outcome: "failed", reason: "unreachable", ms: 0 });
    expect(asked.filter((url) => url === SEC_TICKERS_URL)).toHaveLength(2);
  });
});

describe("the status page of the vendor", () => {
  const HOST = "status.brisenetworks.example";
  const FEED = `https://${HOST}/history.atom`;
  const feedXml = (days: string[] = ["2026-10-20"], name = "Brise Status - Incident History") =>
    `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${name}</title>
  ${days
    .map(
      (day, index) => `<entry>
    <published>${day}T09:30:00Z</published>
    <link rel="alternate" type="text/html" href="https://${HOST}/incidents/inc${index}"/>
    <title>Incident ${index}</title>
    <content type="html">&lt;strong&gt;Resolved&lt;/strong&gt; - It is over.</content>
  </entry>`,
    )
    .join("\n")}
</feed>`;

  /** A fetch of feeds that answers from a table: an Error in it is thrown, an address not in it is not found. */
  function feeds(table: Record<string, string | Error>) {
    const asked: string[] = [];
    const fetchFeed: FetchText = async (url) => {
      asked.push(url);
      const answer = table[url];
      if (answer instanceof Error) throw answer;
      if (answer === undefined) throw new FetchError("not_found");
      return answer;
    };
    return { fetchFeed, asked };
  }
  const nothing: FetchJson = async () => {
    throw new TypeError("no database of JSON is asked");
  };
  const statusInput = (over: Partial<RecordsInput> = {}) =>
    input({
      researchable: ["availability"],
      cutoffs: { availability: "2025-10-28" },
      ...over,
    });
  const lookupOf = (fetchFeed: FetchText, more: Parameters<typeof createRecordsLookup>[0] = {}) =>
    createRecordsLookup({ fetchJson: nothing, nvdSpacer: open, fetchFeed, ...more });

  it("looks the vendor up at status.<domain> and writes its incidents as records", async () => {
    const { fetchFeed } = feeds({ [FEED]: feedXml(["2026-10-20", "2026-09-01"]) });

    const outcomes = await lookupOf(fetchFeed)(statusInput());

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      source: "statuspage",
      outcome: "ok",
      url: FEED,
      omitted: {},
    });
    expect(typeof outcomes[0].ms).toBe("number");
    expect(outcomes[0].records.map((record) => record.url)).toEqual([
      `https://${HOST}/history`,
      `https://${HOST}/incidents/inc0`,
      `https://${HOST}/incidents/inc1`,
    ]);
    expect(outcomes[0].records[0].text).toContain("Incidents since 2025-10-28: 2.");
  });

  it("asks within the size and the time it has: two megabytes, and the signal of the lookup", async () => {
    const calls: Array<{ url: string; maxBytes: number; signal: AbortSignal }> = [];
    const fetchFeed: FetchText = async (url, options) => {
      calls.push({ url, ...options });
      return feedXml();
    };
    const run = new AbortController();

    await lookupOf(fetchFeed)(statusInput({ signal: run.signal }));

    expect(calls.map((call) => call.maxBytes)).toEqual([
      STATUS_FEED_MAX_BYTES,
      STATUS_FEED_MAX_BYTES,
      STATUS_FEED_MAX_BYTES,
    ]);
    // The signal is the run's and the time of the lookup together.
    expect(calls[0].signal).not.toBe(run.signal);
    expect(calls[0].signal.aborted).toBe(false);
    run.abort();
    expect(calls[0].signal.aborted).toBe(true);
  });

  it("asks the tenant of Statuspage and the status site named for the vendor as well, and answers at the feed that was found", async () => {
    const tenant = "https://brisenetworks.statuspage.io/history.atom";
    const site = "https://brisenetworksstatus.com/history.atom";
    const { fetchFeed, asked } = feeds({
      [tenant]: feedXml(["2026-10-20"], "Brise Networks Status - Incident History")
        .split(HOST)
        .join("brisenetworks.statuspage.io"),
    });

    const [outcome] = await lookupOf(fetchFeed)(statusInput());

    expect([...asked].sort()).toEqual([FEED, site, tenant].sort());
    expect(outcome).toMatchObject({ outcome: "ok", url: tenant });
    expect(outcome.records[1].url).toBe("https://brisenetworks.statuspage.io/incidents/inc0");
  });

  it("takes the first host of the list that has a feed, and not the one that answers first", async () => {
    const tenant = "https://brisenetworks.statuspage.io/history.atom";
    const slow: FetchText = async (url) => {
      if (url === FEED) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return feedXml();
      }
      return feedXml(["2026-10-21"], "Brise Networks Status");
    };

    const [outcome] = await lookupOf(slow)(statusInput());

    expect(outcome.url).toBe(FEED);
    expect(tenant).not.toBe(outcome.url);
  });

  it("takes a feed under the domain of the vendor whatever it is called, and one elsewhere only when it names the vendor", async () => {
    const tenant = "https://brisenetworks.statuspage.io/history.atom";

    const own = await lookupOf(
      feeds({ [FEED]: feedXml(["2026-10-20"], "System status") }).fetchFeed,
    )(statusInput());
    const other = await lookupOf(
      feeds({ [tenant]: feedXml(["2026-10-20"], "Someone Else Status") }).fetchFeed,
    )(statusInput());
    const named = await lookupOf(
      feeds({ [tenant]: feedXml(["2026-10-20"], "Brise Networks Status") }).fetchFeed,
    )(statusInput());

    expect([own[0].outcome, other[0].outcome, named[0].outcome]).toEqual(["ok", "empty", "ok"]);
  });

  it("keeps a feed that does not name the vendor from another vendor of the same tenant too: the name is asked every time", async () => {
    const tenant = "https://brisenetworks.statuspage.io/history.atom";
    const { fetchFeed } = feeds({ [tenant]: feedXml(["2026-10-20"], "Someone Else Status") });
    const lookup = lookupOf(fetchFeed);
    const brise = statusInput();
    const someone = statusInput({
      target: { ...target, name: "Someone Else", domain: "brisenetworks.example" },
    });

    const first = await lookup(brise);
    const second = await lookup(someone);

    expect([first[0].outcome, second[0].outcome]).toEqual(["empty", "ok"]);
  });

  it("says empty, and not failed, when no host has a feed, at the address of the first", async () => {
    const { fetchFeed } = feeds({});

    const outcomes = await lookupOf(fetchFeed)(statusInput());

    expect(outcomes).toEqual([
      {
        source: "statuspage",
        url: FEED,
        outcome: "empty",
        records: [],
        omitted: {},
        ms: expect.any(Number),
      },
    ]);
    expect(outcomes[0]).not.toHaveProperty("reason");
  });

  it.each([
    ["cannot be reached", new FetchError("unreachable")],
    ["refuses us", new FetchError("blocked_by_site")],
    ["is kept from robots", new FetchError("blocked_by_robots")],
    ["is not a public address", new FetchError("not_allowed")],
  ])(
    "says empty when the host %s, and asks it again the next time: no rest for a guess",
    async (_name, error) => {
      const { fetchFeed, asked } = feeds({ [FEED]: error });
      const lookup = lookupOf(fetchFeed);

      const first = await lookup(statusInput());
      const second = await lookup(statusInput());

      expect([first[0].outcome, second[0].outcome]).toEqual(["empty", "empty"]);
      // The hosts that answered "not found" are not asked again, and this one is.
      expect(asked.filter((url) => url === FEED)).toEqual([FEED, FEED]);
      expect(asked).toHaveLength(4);
    },
  );

  it("keeps the answer of a host that has no feed, or whose page is no feed, for the next lookup", async () => {
    const { fetchFeed, asked } = feeds({
      [FEED]: new FetchError("not_found"),
      "https://brisenetworks.statuspage.io/history.atom": new FetchError("unsupported_type"),
      "https://brisenetworksstatus.com/history.atom": "<html>Not a feed</html>",
    });
    const lookup = lookupOf(fetchFeed);

    await lookup(statusInput());
    await lookup(statusInput());

    expect(asked).toHaveLength(3);
  });

  it("keeps the feed for the next lookup, and shares one request between lookups made at once", async () => {
    const { fetchFeed, asked } = feeds({ [FEED]: feedXml() });
    const lookup = lookupOf(fetchFeed);

    await Promise.all([lookup(statusInput()), lookup(statusInput())]);
    await lookup(statusInput());

    // One request for each host that is guessed, once.
    expect([...asked].sort()).toEqual(
      [
        FEED,
        "https://brisenetworks.statuspage.io/history.atom",
        "https://brisenetworksstatus.com/history.atom",
      ].sort(),
    );
  });

  it("reads the entries up to the day of the clock the run gives, not up to the day of the machine", async () => {
    const { fetchFeed } = feeds({ [FEED]: feedXml(["2026-10-25", "2026-10-15"]) });

    const [outcome] = await lookupOf(fetchFeed)(
      statusInput({ now: new Date("2026-10-21T12:00:00Z") }),
    );

    expect(outcome.records.map((record) => record.url)).toEqual([
      `https://${HOST}/history`,
      `https://${HOST}/incidents/inc1`,
    ]);
  });

  it("names the vendor by the brand of its domain as well as by its name", async () => {
    const cloud = buildTarget({
      vendor_name: "Brise Networks, Inc.",
      website: "https://www.brise-cloud.example",
      vendor_provides: "Network gear",
    });
    const tenant = "https://brise-cloud.statuspage.io/history.atom";
    const { fetchFeed } = feeds({
      [tenant]: feedXml(["2026-10-20"], "Brise Cloud Status - Incident History"),
    });

    const [outcome] = await lookupOf(fetchFeed)(statusInput({ target: cloud }));

    expect(outcome).toMatchObject({ outcome: "ok", url: tenant });
  });

  it("asks a host again after an hour: its answer is kept for that long", async () => {
    const clock = jest.spyOn(Date, "now");
    try {
      const { fetchFeed, asked } = feeds({ [FEED]: feedXml() });
      const lookup = lookupOf(fetchFeed);
      const start = Date.parse("2026-10-28T12:00:00Z");

      clock.mockReturnValue(start);
      await lookup(statusInput());
      clock.mockReturnValue(start + 59 * 60_000);
      await lookup(statusInput());
      expect(asked.filter((url) => url === FEED)).toHaveLength(1);

      clock.mockReturnValue(start + 61 * 60_000);
      await lookup(statusInput());
      expect(asked.filter((url) => url === FEED)).toHaveLength(2);
    } finally {
      clock.mockRestore();
    }
  });

  it("applies the window of its own category: an incident before the cutoff is left out and counted", async () => {
    const { fetchFeed } = feeds({ [FEED]: feedXml(["2026-10-20", "2026-09-01"]) });

    const [outcome] = await lookupOf(fetchFeed)(
      statusInput({ cutoffs: { availability: "2026-10-01", security_incidents: "2020-01-01" } }),
    );

    expect(outcome.records.map((record) => record.url)).toEqual([
      `https://${HOST}/history`,
      `https://${HOST}/incidents/inc0`,
    ]);
    expect(outcome.omitted).toEqual({ old: 1 });
  });

  it("says empty when every incident is before the window", async () => {
    const { fetchFeed } = feeds({ [FEED]: feedXml(["2026-01-01"]) });

    const [outcome] = await lookupOf(fetchFeed)(
      statusInput({ cutoffs: { availability: "2026-10-01" } }),
    );

    expect([outcome.outcome, outcome.records, outcome.omitted]).toEqual(["empty", [], { old: 1 }]);
  });

  it("is not asked for a vendor with no domain, or when availability is not researched", async () => {
    const { fetchFeed, asked } = feeds({ [FEED]: feedXml() });
    const lookup = lookupOf(fetchFeed);

    expect(await lookup(statusInput({ target: { ...target, domain: null } }))).toEqual([]);
    expect(await lookup(statusInput({ researchable: ["certifications"] }))).toEqual([]);

    expect(asked).toEqual([]);
  });

  it("is asked together with the other databases, before the sanctions list", async () => {
    const { fetchJson } = scripted(answers());
    const { fetchFeed } = feeds({ [FEED]: feedXml() });
    const { fetchCsv } = lists();

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: open, fetchFeed, fetchCsv })(
      input({ researchable: RESEARCH_CATEGORIES }),
    );

    expect(outcomes.map((o) => [o.source, o.outcome])).toEqual([
      ["kev", "ok"],
      ["nvd", "ok"],
      ["hibp", "ok"],
      ["sec", "ok"],
      ["statuspage", "ok"],
      ["ofac", "ok"],
    ]);
  });

  it("does not ask the status page for the other databases to fail: each answers for itself", async () => {
    const { fetchJson } = scripted({
      ...answers(),
      [KEV_URL]: new FetchError("unreachable"),
    });
    const { fetchFeed } = feeds({ [FEED]: feedXml() });
    const { fetchCsv } = lists();

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: open, fetchFeed, fetchCsv })(
      input({ researchable: RESEARCH_CATEGORIES }),
    );

    expect(outcomes.map((o) => [o.source, o.outcome])).toEqual([
      ["kev", "failed"],
      ["nvd", "ok"],
      ["hibp", "ok"],
      ["sec", "ok"],
      ["statuspage", "ok"],
      ["ofac", "ok"],
    ]);
  });

  it("does not hide a bug: an error that is not a failure of the web is thrown", async () => {
    const fetchFeed: FetchText = async () => {
      throw new TypeError("a bug of the feed");
    };

    await expect(lookupOf(fetchFeed)(statusInput())).rejects.toThrow("a bug of the feed");
  });

  it("gives up on a feed that has not answered within the time it has, and says empty", async () => {
    const hang: FetchText = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new FetchError("unreachable")), {
          once: true,
        });
      });

    const outcomes = await lookupOf(hang, { timeoutMs: 20 })(statusInput());

    expect(outcomes.map((o) => [o.source, o.outcome])).toEqual([["statuspage", "empty"]]);
  });
});

describe("the sanctions list", () => {
  const COOL_DOWN_MS = 5 * 60_000;
  const { fetchJson: nothing } = scripted({});
  const ofacInput = (over: Partial<RecordsInput> = {}) =>
    input({ researchable: ["legal_regulatory"], ...over });
  const lookupOf = (fetchCsv: FetchText, more: Parameters<typeof createRecordsLookup>[0] = {}) =>
    createRecordsLookup({ fetchJson: nothing, nvdSpacer: open, fetchCsv, ...more });

  it("is looked up for a run that researches legal and regulatory matters, and answers with the address of the list", async () => {
    const { fetchCsv, asked } = lists();

    const outcomes = await lookupOf(fetchCsv)(ofacInput());

    expect(outcomes.map((o) => [o.source, o.outcome, o.records.length, o.url])).toEqual([
      ["ofac", "ok", 1, OFAC_SDN_URL],
    ]);
    expect(outcomes[0].records[0]).toMatchObject({
      url: ofacEntryUrl(901),
      title: "OFAC SDN list: BRISE NETWORKS LLC",
      publishedAt: "2026-10-28",
    });
    expect(outcomes[0].records[0].text).toContain(
      'Also listed as: "BRISE NETWORKS SERVICES" (aka).',
    );
    expect(asked).toHaveLength(2);
    expect(asked).toEqual(
      expect.arrayContaining([
        { url: OFAC_SDN_URL, maxBytes: OFAC_SDN_MAX_BYTES },
        { url: OFAC_ALT_URL, maxBytes: OFAC_ALT_MAX_BYTES },
      ]),
    );
  });

  it("says empty for a list that has no entity of the vendor", async () => {
    const { fetchCsv } = lists();

    const outcomes = await lookupOf(fetchCsv)(
      ofacInput({ target: { ...target, name: "Zenith Software", domain: null } }),
    );

    expect(outcomes.map((o) => [o.source, o.outcome, o.records])).toEqual([["ofac", "empty", []]]);
  });

  it("finds the vendor by its names and not by the brand of its domain", async () => {
    const { fetchCsv } = lists();

    // The domain of the vendor is `brisenetworks.example`, and an entity of the list has that brand
    // for a name; a company of that name could be another one.
    const outcomes = await lookupOf(fetchCsv)(
      ofacInput({ target: { ...target, name: "Zenith Software" } }),
    );

    expect(outcomes[0].outcome).toBe("empty");
  });

  it("finds the vendor by a name it is also known by", async () => {
    const { fetchCsv } = lists();

    const outcomes = await lookupOf(fetchCsv)(
      ofacInput({
        target: { ...target, name: "Zenith Software", domain: null, aliases: ["Other Holdings"] },
      }),
    );

    expect(outcomes[0].records.map((record) => record.url)).toEqual([ofacEntryUrl(902)]);
  });

  it("is not asked when the run does not research legal and regulatory matters", async () => {
    const { fetchCsv, asked } = lists();

    const outcomes = await lookupOf(fetchCsv)(
      ofacInput({ researchable: ["security_incidents", "certifications", "ai_specific"] }),
    );

    expect(outcomes.map((o) => o.source)).not.toContain("ofac");
    expect(asked).toEqual([]);
  });

  it("is not asked for a vendor with no name to look for", async () => {
    const { fetchCsv, asked } = lists();

    const outcomes = await lookupOf(fetchCsv)(
      ofacInput({ target: { ...target, name: "A", domain: null } }),
    );

    expect(outcomes).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("keeps the list for the next lookup, whichever vendor it is for", async () => {
    const { fetchCsv, asked } = lists();
    const lookup = lookupOf(fetchCsv);

    await lookup(ofacInput());
    await lookup(ofacInput());
    const other = await lookup(
      ofacInput({ target: { ...target, name: "Other Holdings", domain: "other.example" } }),
    );

    expect(asked).toHaveLength(2);
    expect(other[0].records.map((record) => record.url)).toEqual([ofacEntryUrl(902)]);
  });

  it("is downloaded once for the runs that ask while it is being downloaded", async () => {
    const { fetchCsv, asked } = lists();
    const lookup = lookupOf(fetchCsv);

    const results = await Promise.all([
      lookup(ofacInput()),
      lookup(ofacInput()),
      lookup(ofacInput()),
    ]);

    expect(results.map(([outcome]) => outcome.outcome)).toEqual(["ok", "ok", "ok"]);
    expect(asked).toHaveLength(2);
  });

  it("answers a file that cannot be read with the reason, and the other databases are not touched", async () => {
    const { fetchJson } = scripted(answers());
    const { fetchCsv } = lists({
      [OFAC_SDN_URL]: new FetchError("blocked_by_site"),
      [OFAC_ALT_URL]: ALT_CSV,
    });

    const outcomes = await createRecordsLookup({ fetchJson, nvdSpacer: open, fetchCsv })(
      input({ researchable: ["security_incidents", "legal_regulatory"] }),
    );

    expect(outcomes.map((o) => [o.source, o.outcome, o.reason])).toEqual([
      ["kev", "ok", undefined],
      ["nvd", "ok", undefined],
      ["hibp", "ok", undefined],
      ["sec", "ok", undefined],
      ["ofac", "failed", "blocked_by_site"],
    ]);
    expect(outcomes[4].records).toEqual([]);
  });

  it("fails when the file of the other names is missing, since the list would lack names", async () => {
    const { fetchCsv } = lists({ [OFAC_SDN_URL]: SDN_CSV });

    const outcomes = await lookupOf(fetchCsv)(ofacInput());

    expect(outcomes[0]).toMatchObject({ outcome: "failed", reason: "not_found" });
  });

  it("answers a file that is not the list as one in a format that cannot be read", async () => {
    const { fetchCsv } = lists({
      [OFAC_SDN_URL]: "<html><body>Service unavailable</body></html>",
      [OFAC_ALT_URL]: "",
    });

    const outcomes = await lookupOf(fetchCsv)(ofacInput());

    expect(outcomes[0]).toMatchObject({
      outcome: "failed",
      reason: "unsupported_type",
      records: [],
    });
  });

  it("does not hide a bug: an error that is not a failure of the web is thrown", async () => {
    const fetchCsv: FetchText = async () => {
      throw new TypeError("a bug of the list");
    };

    await expect(lookupOf(fetchCsv)(ofacInput())).rejects.toThrow("a bug of the list");
  });

  describe("a list that fails", () => {
    it("is not downloaded again for five minutes: the answer is a failure at once, with no request", async () => {
      let clock = 1_000_000;
      const { fetchCsv, asked } = lists({ [OFAC_SDN_URL]: new FetchError("unreachable") });
      const lookup = lookupOf(fetchCsv, { clock: () => clock });

      await lookup(ofacInput());
      const askedOnce = asked.length;
      clock += COOL_DOWN_MS - 1;
      const [ofac] = await lookup(ofacInput());

      expect(ofac).toMatchObject({
        source: "ofac",
        outcome: "failed",
        reason: "unreachable",
        ms: 0,
      });
      expect(asked).toHaveLength(askedOnce);
    });

    it("is downloaded again when the five minutes have passed", async () => {
      let clock = 1_000_000;
      const { fetchCsv, asked } = lists({ [OFAC_SDN_URL]: new FetchError("unreachable") });
      const lookup = lookupOf(fetchCsv, { clock: () => clock });

      await lookup(ofacInput());
      const askedOnce = asked.length;
      clock += COOL_DOWN_MS;
      await lookup(ofacInput());

      expect(asked.length).toBeGreaterThan(askedOnce);
    });
  });

  describe("a download that takes long", () => {
    it("is not waited for past the time of the run, which is no outage; the next run has the list", async () => {
      let release = () => {};
      const arrived = new Promise<void>((resolve) => {
        release = resolve;
      });
      const asked: string[] = [];
      const fetchCsv: FetchText = async (url) => {
        asked.push(url);
        await arrived;
        return url === OFAC_SDN_URL ? SDN_CSV : ALT_CSV;
      };
      const lookup = lookupOf(fetchCsv, { timeoutMs: 20 });

      const [slow] = await lookup(ofacInput());
      release();
      const [later] = await lookup(ofacInput());

      expect(slow).toMatchObject({ source: "ofac", outcome: "failed", reason: "unreachable" });
      // No rest after the first run, and no second download: the next run used the one under way.
      expect(later.outcome).toBe("ok");
      expect(asked).toHaveLength(2);
    });

    it("is cut off at the time of its own, and the next run tries again", async () => {
      let clock = 1_000_000;
      const signals: AbortSignal[] = [];
      const hang: FetchText = (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signals.push(signal);
          signal.addEventListener("abort", () => reject(new FetchError("unreachable")), {
            once: true,
          });
        });
      const lookup = lookupOf(hang, { timeoutMs: 2_000, loadTimeoutMs: 20, clock: () => clock });

      const [first] = await lookup(ofacInput());
      clock += COOL_DOWN_MS;
      await lookup(ofacInput());

      expect(first).toMatchObject({ outcome: "failed", reason: "unreachable" });
      expect(first.ms).toBeLessThan(1_000);
      // Two files a download, and the failed download was not kept.
      expect(signals).toHaveLength(4);
    });

    it("is not held back for a run that was cancelled while it waited", async () => {
      const controller = new AbortController();
      let release = () => {};
      const arrived = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fetchCsv: FetchText = async (url) => {
        await arrived;
        return url === OFAC_SDN_URL ? SDN_CSV : ALT_CSV;
      };
      const lookup = lookupOf(fetchCsv);

      const cancelled = lookup(ofacInput({ signal: controller.signal }));
      controller.abort();
      const [outcome] = await cancelled;
      release();
      const [later] = await lookup(ofacInput());

      expect(outcome).toMatchObject({ outcome: "failed", reason: "unreachable" });
      expect(later.outcome).toBe("ok");
    });
  });
});
