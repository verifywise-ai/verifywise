/**
 * The lookup of the databases a run asks itself (M3 Part B): Have I Been Pwned and the status page
 * of the vendor. The catalog of CISA, the NVD, the SEC and the sanctions lists belong to the vendor
 * risk database, which mirrors them or reads them through (vrdb/), so this lookup does not ask for
 * them and has no test of them.
 */
import { RESEARCH_CATEGORIES } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError } from "../../../webResearch/guardedFetch";
import { buildTarget } from "../../target";
import { hibpUrl } from "../hibp";
import { NVD_LIMITS, createRecordsLookup, mergeSameAddress, sourcesBesideVrdb } from "../index";
import { STATUS_FEED_MAX_BYTES } from "../statuspage";
import type { FetchJson, FetchText, RecordsInput, RecordsOutcome, SourceRecord } from "../types";

// No test of this file reaches the web: the feeds and the answers are given to the lookup, and one
// that is not given is not found.
jest.mock("../feedFetch", () => ({
  fetchFeed: jest.fn(async () => {
    throw new (jest.requireActual("../../../webResearch/guardedFetch").FetchError)("not_found");
  }),
}));

const NOW = new Date("2026-10-28T12:00:00Z");
const target = buildTarget({
  vendor_name: "Brise Networks, Inc.",
  website: "https://www.brisenetworks.example",
  vendor_provides: "Network gear",
});
// Security incidents: Have I Been Pwned. The status page is asked for availability.
const input = (over: Partial<RecordsInput> = {}): RecordsInput => ({
  target,
  researchable: ["security_incidents"],
  now: NOW,
  signal: new AbortController().signal,
  ...over,
});
/** The categories of the two databases together. */
const BOTH = ["security_incidents", "availability"] as const;

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

const HIBP = hibpUrl("brisenetworks.example");
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

/** A fetch of feeds that answers from a table: an Error is thrown, an address not in it is not found. */
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

describe("createRecordsLookup", () => {
  it("looks the vendor up in Have I Been Pwned and at its status page, and answers for each", async () => {
    const { fetchJson } = scripted({ [HIBP]: [breach] });
    const { fetchFeed } = feeds({ [FEED]: feedXml() });

    const outcomes = await createRecordsLookup({ fetchJson, fetchFeed })(
      input({ researchable: BOTH }),
    );

    expect(outcomes.map((o) => [o.source, o.outcome, o.records.length, o.url])).toEqual([
      ["hibp", "ok", 1, HIBP],
      ["statuspage", "ok", 2, FEED],
    ]);
    expect(outcomes.every((o) => typeof o.ms === "number")).toBe(true);
    expect(outcomes[0].records[0].url).toBe("https://haveibeenpwned.com/api/v3/breach/Brise");
  });

  it("leaves the catalog, the NVD, the SEC and the sanctions lists to the vendor risk database: it asks for none of them", async () => {
    const { fetchJson, asked } = scripted({ [HIBP]: [breach] });
    const { fetchFeed } = feeds({ [FEED]: feedXml() });
    // A CIK stored on the vendor used to send the run to the SEC itself.
    const withCik = { ...target, identifiers: { secCik: "1262039" } };

    const outcomes = await createRecordsLookup({ fetchJson, fetchFeed })(
      input({ target: withCik, researchable: RESEARCH_CATEGORIES }),
    );

    expect(outcomes.map((o) => o.source)).toEqual(["hibp", "statuspage"]);
    expect(outcomes.map((o) => o.source)).toEqual(sourcesBesideVrdb());
    expect(asked).toEqual([HIBP]);
  });

  it("asks only the databases of the categories the run researches", async () => {
    const { fetchJson, asked } = scripted({ [HIBP]: [breach] });
    const { fetchFeed, asked: feedsAsked } = feeds({ [FEED]: feedXml() });
    const lookup = createRecordsLookup({ fetchJson, fetchFeed });

    const neither = await lookup(input({ researchable: ["certifications", "ai_specific"] }));
    expect(neither).toEqual([]);
    expect([asked, feedsAsked]).toEqual([[], []]);

    const security = await lookup(input({ researchable: ["security_incidents"] }));
    expect(security.map((o) => o.source)).toEqual(["hibp"]);
    expect(feedsAsked).toEqual([]);

    const availability = await lookup(input({ researchable: ["availability"] }));
    expect(availability.map((o) => o.source)).toEqual(["statuspage"]);
    expect(asked).toEqual([HIBP]);
  });

  it("asks for the window of the lookback: the cutoff is passed to the database", async () => {
    const { fetchJson } = scripted({ [HIBP]: [breach] });

    const [hibp] = await createRecordsLookup({ fetchJson })(
      input({ cutoffs: { security_incidents: "2026-09-15" } }),
    );

    expect([hibp.outcome, hibp.records, hibp.omitted]).toEqual(["empty", [], { old: 1 }]);
  });

  it("passes each database the cutoff of its own category", async () => {
    const { fetchJson } = scripted({ [HIBP]: [{ ...breach, AddedDate: "2026-10-10T08:00:00Z" }] });
    const { fetchFeed } = feeds({ [FEED]: feedXml(["2026-10-20"]) });

    const [hibp, status] = await createRecordsLookup({ fetchJson, fetchFeed })(
      input({
        researchable: BOTH,
        cutoffs: { security_incidents: "2026-09-15", availability: "2026-10-27" },
      }),
    );

    // The breach of 10 October is inside the window of security incidents, and the incident of
    // 20 October is before the one of availability: each was cut by its own.
    expect([hibp.outcome, hibp.omitted]).toEqual(["ok", {}]);
    expect([status.outcome, status.omitted]).toEqual(["empty", { old: 1 }]);
  });

  it("says empty for a database that has nothing of the vendor", async () => {
    const { fetchJson } = scripted({ [HIBP]: [] });
    const { fetchFeed } = feeds({});

    const outcomes = await createRecordsLookup({ fetchJson, fetchFeed })(
      input({ researchable: BOTH }),
    );

    expect(outcomes.map((o) => [o.source, o.outcome])).toEqual([
      ["hibp", "empty"],
      ["statuspage", "empty"],
    ]);
  });

  it("does not ask for a vendor with no domain: both databases look it up by its domain", async () => {
    const { fetchJson, asked } = scripted({ [HIBP]: [breach] });
    const { fetchFeed, asked: feedsAsked } = feeds({ [FEED]: feedXml() });

    const outcomes = await createRecordsLookup({ fetchJson, fetchFeed })(
      input({ target: { ...target, domain: null }, researchable: BOTH }),
    );

    expect(outcomes).toEqual([]);
    expect([asked, feedsAsked]).toEqual([[], []]);
  });

  it.each([
    ["refuses us", new FetchError("blocked_by_site"), "blocked_by_site"],
    ["is not a public address", new FetchError("not_allowed"), "unreachable"],
    ["is kept from robots", new FetchError("blocked_by_robots"), "unreachable"],
    ["has no such document", new FetchError("not_found"), "not_found"],
  ])(
    "answers Have I Been Pwned with the reason when it %s, and the status page is not touched",
    async (_name, error, reason) => {
      const { fetchJson } = scripted({ [HIBP]: error });
      const { fetchFeed } = feeds({ [FEED]: feedXml() });

      const outcomes = await createRecordsLookup({ fetchJson, fetchFeed })(
        input({ researchable: BOTH }),
      );

      expect(outcomes.map((o) => [o.source, o.outcome, o.reason])).toEqual([
        ["hibp", "failed", reason],
        ["statuspage", "ok", undefined],
      ]);
      expect(outcomes[0].records).toEqual([]);
    },
  );

  it("does not hide a bug: an error that is not a failure of the web is thrown", async () => {
    const fetchJson: FetchJson = async () => {
      throw new TypeError("a bug");
    };

    await expect(createRecordsLookup({ fetchJson })(input())).rejects.toThrow("a bug");
  });

  it("keeps the answer for the next lookup of a domain", async () => {
    const { fetchJson, asked } = scripted({ [HIBP]: [breach], [hibpUrl("other.example")]: [] });
    const lookup = createRecordsLookup({ fetchJson });

    await lookup(input());
    await lookup(input());
    await lookup(input({ target: { ...target, name: "Other", domain: "other.example" } }));

    expect(asked.filter((url) => url === HIBP)).toHaveLength(1);
    expect(asked).toHaveLength(2);
  });

  it("gives up on the database that has not answered within the time it has", async () => {
    const hang: FetchJson = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new FetchError("unreachable")), {
          once: true,
        });
      });

    const outcomes = await createRecordsLookup({ fetchJson: hang, timeoutMs: 20 })(input());

    expect(outcomes.map((o) => [o.source, o.outcome, o.reason])).toEqual([
      ["hibp", "failed", "unreachable"],
    ]);
  });

  it("does not cut the database off within its first moments", async () => {
    const slow: FetchJson = async (_url, { signal }) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (signal.aborted) throw new FetchError("unreachable");
      return [];
    };

    const outcomes = await createRecordsLookup({ fetchJson: slow })(input());

    expect(outcomes.map((o) => o.outcome)).toEqual(["empty"]);
  });

  describe("a database that fails", () => {
    const COOL_DOWN_MS = 5 * 60_000;

    it("is not asked again for five minutes: the answer is a failure at once, with no request", async () => {
      let clock = 1_000_000;
      const { fetchJson, asked } = scripted({ [HIBP]: new FetchError("unreachable") });
      const lookup = createRecordsLookup({ fetchJson, clock: () => clock });

      await lookup(input());
      clock += COOL_DOWN_MS - 1;
      const [hibp] = await lookup(input());

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
      const { fetchJson, asked } = scripted({ [HIBP]: new FetchError("unreachable") });
      const lookup = createRecordsLookup({ fetchJson, clock: () => clock });

      await lookup(input());
      clock += COOL_DOWN_MS;
      await lookup(input());

      expect(asked.filter((url) => url === HIBP)).toHaveLength(2);
    });

    it("does not hold back the other database", async () => {
      const { fetchJson } = scripted({ [HIBP]: new FetchError("unreachable") });
      const { fetchFeed } = feeds({ [FEED]: feedXml() });
      const lookup = createRecordsLookup({ fetchJson, fetchFeed });

      await lookup(input({ researchable: BOTH }));
      const [hibp, status] = await lookup(input({ researchable: BOTH }));

      expect([hibp.outcome, hibp.ms, status.outcome]).toEqual(["failed", 0, "ok"]);
    });

    it("is not held back when the run was cancelled", async () => {
      const controller = new AbortController();
      const { fetchJson, asked } = scripted({ [HIBP]: new FetchError("unreachable") });
      const lookup = createRecordsLookup({ fetchJson });
      controller.abort();

      await lookup(input({ signal: controller.signal }));
      await lookup(input());

      expect(asked.filter((url) => url === HIBP)).toHaveLength(2);
    });
  });
});

describe("mergeSameAddress", () => {
  const record = (cve: string, text: string): SourceRecord => ({
    url: `https://nvd.nist.gov/vuln/detail/${cve}`,
    title: cve,
    text,
    publishedAt: "2026-10-20",
  });
  const outcomeOf = (
    source: RecordsOutcome["source"],
    records: SourceRecord[],
    over: Partial<RecordsOutcome> = {},
  ): RecordsOutcome => ({
    source,
    url: `https://${source}.example/list`,
    outcome: records.length === 0 ? "empty" : "ok",
    records,
    omitted: {},
    ms: 3,
    ...over,
  });

  it("makes a CVE that the catalog lists and the NVD scores one source, with the words of both", () => {
    const kev = outcomeOf("kev", [record("CVE-2026-1001", "Catalog words.")]);
    const nvd = outcomeOf("nvd", [
      record("CVE-2026-1001", "Score words."),
      record("CVE-2026-2002", "Other words."),
    ]);

    const [mergedKev, mergedNvd] = mergeSameAddress([kev, nvd]);

    expect(mergedKev.records).toEqual([{ ...kev.records[0], text: "Catalog words. Score words." }]);
    expect(mergedNvd.records.map((r) => r.url.slice(-13))).toEqual(["CVE-2026-2002"]);
    expect(mergedNvd.outcome).toBe("ok");
  });

  it("says empty for the NVD when all of its CVEs are in the catalog", () => {
    const kev = outcomeOf("kev", [record("CVE-2026-1001", "Catalog words.")]);
    const nvd = outcomeOf("nvd", [record("CVE-2026-1001", "Score words.")]);

    const [, mergedNvd] = mergeSameAddress([kev, nvd]);

    expect([mergedNvd.records, mergedNvd.outcome]).toEqual([[], "empty"]);
  });

  it("leaves a failed NVD failed", () => {
    const kev = outcomeOf("kev", [record("CVE-2026-1001", "Catalog words.")]);
    const nvd = outcomeOf("nvd", [], { outcome: "failed", reason: "unreachable" });

    const [, mergedNvd] = mergeSameAddress([kev, nvd]);

    expect(mergedNvd).toEqual(nvd);
  });

  it("leaves the outcomes as they are when the catalog or the NVD was not asked", () => {
    const hibp = outcomeOf("hibp", [record("CVE-2026-1001", "A breach.")]);
    const nvd = outcomeOf("nvd", [record("CVE-2026-1001", "Score words.")]);

    const alone = [hibp];
    expect(mergeSameAddress(alone)).toBe(alone);
    const noCatalog = [hibp, nvd];
    expect(mergeSameAddress(noCatalog)).toBe(noCatalog);
  });

  it("leaves the other databases as they are", () => {
    const kev = outcomeOf("kev", [record("CVE-2026-1001", "Catalog words.")]);
    const nvd = outcomeOf("nvd", [record("CVE-2026-1001", "Score words.")]);
    const hibp = outcomeOf("hibp", [record("CVE-2026-1001", "A breach.")]);

    const merged = mergeSameAddress([kev, hibp, nvd]);

    expect(merged[1]).toBe(hibp);
  });
});

describe("the databases beside the vendor risk database", () => {
  it("are Have I Been Pwned and the status page, in the order the lookup asks them", () => {
    expect(sourcesBesideVrdb()).toEqual(["hibp", "statuspage"]);
  });

  it("keep the limit of the NVD for the read-through at four requests in 30 seconds", () => {
    // The NVD allows five in 30 seconds without a key; the read-through of the database takes the
    // turns of this window (vrdb/lookup.ts).
    expect(NVD_LIMITS).toEqual({ limit: 4, windowMs: 30_000, maxWaitMs: 3_000 });
  });
});

describe("the status page of the vendor", () => {
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
    createRecordsLookup({ fetchJson: nothing, fetchFeed, ...more });

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
