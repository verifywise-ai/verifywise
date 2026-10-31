import type {
  EvidenceSource,
  FindingConfidence,
  NewFinding,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { type FetchedPage, PageReadError, type PageReader } from "../../webResearch/readPage";
import type { ResearchRules } from "../schema";
import { buildTarget } from "../target";
import { createTraceRecorder } from "../trace";
import {
  VERIFY_READS_PER_FINDING,
  VERIFY_TIMEOUT_MS,
  checkSnippetFindings,
  quoteIsOnPage,
  verifySnippetFindings,
} from "../verifySnippets";

const TARGET = buildTarget({
  vendor_name: "Acme Analytics",
  website: "acme-analytics.com",
  vendor_provides: "Analytics",
});

const QUOTE = "attackers copied customer records from a test system";

// One address for each tier, the most credible first.
const OWN = "https://acme-analytics.com/security/incident";
const REGULATOR = "https://ico.org.uk/action/acme-analytics";
const PUBLISHER = "https://www.reuters.com/acme-analytics-breach";
const AGGREGATOR = "https://news.google.com/acme-analytics-breach";
const OTHER = "https://blog.example.net/acme-analytics-breach";

let counter = 0;

function source(url: string, overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  counter += 1;
  return {
    id: `S${counter}`,
    category: "security_incidents",
    kind: "result",
    onVendorSite: false,
    url,
    title: "Acme Analytics confirms a breach",
    content: `Acme Analytics said that ${QUOTE}.`,
    publishedAt: "2026-09-10",
    ...overrides,
  };
}

function finding(urls: string[], overrides: Partial<NewFinding> = {}): NewFinding {
  return {
    category: "security_incidents",
    risk_description: "Attackers copied customer records from a vendor test system.",
    impact_description: "Customer data we send to the vendor may be exposed.",
    action_plan: "Ask the vendor for its incident report.",
    likelihood: "Possible",
    risk_severity: "Major",
    risk_level: "High Risk",
    confidence: "medium",
    rationale: null,
    sources: urls.map((url) => ({
      url,
      title: "Acme Analytics confirms a breach",
      quote: QUOTE,
      published_at: "2026-09-10",
    })),
    ...overrides,
  };
}

function pageOf(url: string, text: string): FetchedPage {
  return { url, title: "Page", publishedAt: null, text, links: [] };
}

/** A reader that answers from `answers`: a text is a page, an error is thrown, no entry is not_found. */
function readerOf(answers: Record<string, string | Error>) {
  return jest.fn<ReturnType<PageReader>, Parameters<PageReader>>(async (url) => {
    const answer = answers[url];
    if (answer === undefined) throw new PageReadError("not_found");
    if (answer instanceof Error) throw answer;
    return pageOf(url, answer);
  });
}

const HOLDING = `Acme Analytics said on Monday that ${QUOTE}. It is investigating.`;
const NOT_HOLDING = "Acme Analytics said on Monday that it is investigating an incident.";

const verify = (
  findings: NewFinding[],
  pack: EvidenceSource[],
  readPage: PageReader,
  extra: {
    signal?: AbortSignal;
    trace?: ReturnType<typeof createTraceRecorder>;
    rules?: ResearchRules;
  } = {},
) => verifySnippetFindings({ findings, pack, target: TARGET, readPage, ...extra });

describe("the limits of the check", () => {
  it("reads two pages at most for a finding, within twenty seconds", () => {
    expect(VERIFY_READS_PER_FINDING).toBe(2);
    expect(VERIFY_TIMEOUT_MS).toBe(20_000);
  });
});

describe("quoteIsOnPage", () => {
  it("finds a quote that the page holds word for word", () => {
    expect(quoteIsOnPage(QUOTE, HOLDING)).toBe(true);
  });

  it("ignores case, spacing and quotation marks", () => {
    const quote = "ACME’s  servers\nwere “encrypted”";

    expect(quoteIsOnPage(quote, "Acme's servers were encrypted on Monday.")).toBe(true);
  });

  it("does not find a quote that the page does not hold", () => {
    expect(quoteIsOnPage(QUOTE, NOT_HOLDING)).toBe(false);
  });

  it.each(["…", "...", "[…]"])(
    "holds a quote with the gap mark %s when every part of it is on the page",
    (mark) => {
      const quote = `attackers copied customer records ${mark} from a test system`;

      expect(
        quoteIsOnPage(quote, "Attackers copied customer records. A note says: from a test system."),
      ).toBe(true);
      expect(quoteIsOnPage(quote, "Attackers copied customer records last week.")).toBe(false);
    },
  );

  it("does not hold a quote with a gap mark when a part of it is missing", () => {
    expect(quoteIsOnPage("attackers copied customer records … and sold them", HOLDING)).toBe(false);
  });

  it("ignores a gap mark at the start or at the end of the quote", () => {
    expect(quoteIsOnPage(`… ${QUOTE} …`, HOLDING)).toBe(true);
    expect(quoteIsOnPage(`...${QUOTE}...`, HOLDING)).toBe(true);
  });

  it.each(["", "   ", "…", "[…] ... …"])("is not on any page when the quote is %j", (quote) => {
    expect(quoteIsOnPage(quote, HOLDING)).toBe(false);
  });
});

describe("verifySnippetFindings", () => {
  it("leaves a finding alone when a source it cites is a page that was read, and reads nothing", async () => {
    const readPage = readerOf({});
    const pack = [source(OTHER, { kind: "result" }), source(PUBLISHER, { kind: "page" })];
    const kept = [finding([OTHER, PUBLISHER])];

    const result = await verify(kept, pack, readPage);

    expect(result).toEqual(kept);
    expect(readPage).not.toHaveBeenCalled();
  });

  it("keeps a finding as it is when the page of its best source holds the quote", async () => {
    const readPage = readerOf({ [OTHER]: HOLDING });
    const kept = [finding([OTHER], { confidence: "high" })];

    const [result] = await verify(kept, [source(OTHER)], readPage);

    expect(result).toEqual(kept[0]);
    expect(result.snippet_only).toBeUndefined();
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it.each<[FindingConfidence, FindingConfidence]>([
    ["high", "low"],
    ["medium", "low"],
    ["low", "low"],
  ])(
    "marks a finding as snippet only and lowers a %s confidence to %s when the page does not hold the quote",
    async (given, lowered) => {
      const readPage = readerOf({ [OTHER]: NOT_HOLDING });

      const [result] = await verify(
        [finding([OTHER], { confidence: given })],
        [source(OTHER)],
        readPage,
      );

      expect(result.snippet_only).toBe(true);
      expect(result.confidence).toBe(lowered);
    },
  );

  it("changes nothing else of a finding that it marks", async () => {
    const readPage = readerOf({ [OTHER]: NOT_HOLDING });
    const given = finding([OTHER], { confidence: "high", rationale: "Because." });

    const [result] = await verify([given], [source(OTHER)], readPage);

    expect(result).toEqual({ ...given, confidence: "low", snippet_only: true });
  });

  it("reads the most credible source first, and in the order of the citations among equals", async () => {
    const pack = [OTHER, AGGREGATOR, PUBLISHER, REGULATOR, OWN].map((url) =>
      source(url, { onVendorSite: url === OWN }),
    );
    const readPage = readerOf({ [OWN]: HOLDING });

    await verify([finding([OTHER, AGGREGATOR, PUBLISHER, REGULATOR, OWN])], pack, readPage);
    expect(readPage.mock.calls.map(([url]) => url)).toEqual([OWN]);

    const second = readerOf({ [REGULATOR]: HOLDING });
    await verify([finding([OTHER, AGGREGATOR, PUBLISHER, REGULATOR])], pack.slice(0, 4), second);
    expect(second.mock.calls.map(([url]) => url)).toEqual([REGULATOR]);

    const third = readerOf({ [PUBLISHER]: HOLDING });
    await verify([finding([OTHER, AGGREGATOR, PUBLISHER])], pack.slice(0, 3), third);
    expect(third.mock.calls.map(([url]) => url)).toEqual([PUBLISHER]);

    const fourth = readerOf({ [AGGREGATOR]: HOLDING });
    await verify([finding([OTHER, AGGREGATOR])], pack.slice(0, 2), fourth);
    expect(fourth.mock.calls.map(([url]) => url)).toEqual([AGGREGATOR]);

    const other = "https://elsewhere.example.org/story";
    const fifth = readerOf({ [OTHER]: HOLDING, [other]: HOLDING });
    await verify([finding([OTHER, other])], [source(OTHER), source(other)], fifth);
    expect(fifth.mock.calls.map(([url]) => url)).toEqual([OTHER]);
  });

  it("under the credibility rules the best source is the highest registry category", async () => {
    const pack = [OTHER, AGGREGATOR, OWN, PUBLISHER, REGULATOR].map((url) =>
      source(url, { onVendorSite: url === OWN }),
    );
    const firstRead = async (urls: string[], holding: string) => {
      const readPage = readerOf({ [holding]: HOLDING });
      await verify([finding(urls)], pack, readPage, { rules: "credibility" });
      return readPage.mock.calls.map(([url]) => url);
    };

    // Official, then trusted press, then the vendor (first under the tiers), then the unverified,
    // which are equals (an aggregator came before another site under the tiers).
    expect(await firstRead([OTHER, AGGREGATOR, OWN, PUBLISHER, REGULATOR], REGULATOR)).toEqual([
      REGULATOR,
    ]);
    expect(await firstRead([OTHER, AGGREGATOR, OWN, PUBLISHER], PUBLISHER)).toEqual([PUBLISHER]);
    expect(await firstRead([OTHER, AGGREGATOR, OWN], OWN)).toEqual([OWN]);
    expect(await firstRead([OTHER, AGGREGATOR], OTHER)).toEqual([OTHER]);
  });

  it("goes by the verdict of the first source that can be read", async () => {
    const readPage = readerOf({
      [PUBLISHER]: new PageReadError("blocked_by_site"),
      [OTHER]: HOLDING,
    });

    const [result] = await verify(
      [finding([OTHER, PUBLISHER], { confidence: "high" })],
      [source(OTHER), source(PUBLISHER)],
      readPage,
    );

    expect(readPage.mock.calls.map(([url]) => url)).toEqual([PUBLISHER, OTHER]);
    expect(result.snippet_only).toBeUndefined();
    expect(result.confidence).toBe("high");
  });

  it("does not read a second page once the first has given its verdict", async () => {
    const readPage = readerOf({ [PUBLISHER]: NOT_HOLDING, [OTHER]: HOLDING });

    const [result] = await verify(
      [finding([OTHER, PUBLISHER])],
      [source(OTHER), source(PUBLISHER)],
      readPage,
    );

    expect(readPage).toHaveBeenCalledTimes(1);
    expect(result.snippet_only).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("marks a finding as snippet only but keeps its confidence when no page can be read", async () => {
    const readPage = readerOf({
      [PUBLISHER]: new PageReadError("blocked_by_site"),
      [OTHER]: new PageReadError("unreachable"),
    });

    const [result] = await verify(
      [finding([OTHER, PUBLISHER], { confidence: "high" })],
      [source(OTHER), source(PUBLISHER)],
      readPage,
    );

    expect(result.snippet_only).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("reads two pages at most for a finding", async () => {
    const urls = [OTHER, AGGREGATOR, PUBLISHER];
    const readPage = readerOf(
      Object.fromEntries(urls.map((url) => [url, new PageReadError("not_found")])),
    );

    const [result] = await verify(
      [finding(urls)],
      urls.map((url) => source(url)),
      readPage,
    );

    expect(readPage).toHaveBeenCalledTimes(VERIFY_READS_PER_FINDING);
    expect(result.snippet_only).toBe(true);
  });

  it("reads a page once, however many findings cite it", async () => {
    const readPage = readerOf({ [OTHER]: HOLDING });
    const kept = [finding([OTHER]), finding([OTHER], { category: "legal_regulatory" })];

    const result = await verify(kept, [source(OTHER)], readPage);

    expect(readPage).toHaveBeenCalledTimes(1);
    expect(result).toEqual(kept);
  });

  it("holds a reader that throws anything but a page error for a page that cannot be read", async () => {
    const readPage = readerOf({ [OTHER]: new TypeError("boom") });

    const [result] = await verify(
      [finding([OTHER], { confidence: "medium" })],
      [source(OTHER)],
      readPage,
    );

    expect(result.snippet_only).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("gives the reader the signal it was given", async () => {
    const readPage = readerOf({ [OTHER]: HOLDING });
    const signal = new AbortController().signal;

    await verify([finding([OTHER])], [source(OTHER)], readPage, { signal });

    expect(readPage).toHaveBeenCalledWith(OTHER, signal);
  });

  it("reads nothing once its signal is aborted, and marks the finding without lowering it", async () => {
    const readPage = readerOf({ [OTHER]: HOLDING });
    const controller = new AbortController();
    controller.abort();

    const [result] = await verify(
      [finding([OTHER], { confidence: "high" })],
      [source(OTHER)],
      readPage,
      { signal: controller.signal },
    );

    expect(readPage).not.toHaveBeenCalled();
    expect(result.snippet_only).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("treats every finding on its own and keeps their order", async () => {
    const readPage = readerOf({ [OTHER]: HOLDING, [AGGREGATOR]: NOT_HOLDING });
    const kept = [
      finding([AGGREGATOR], { risk_description: "First." }),
      finding([PUBLISHER], { risk_description: "Second." }),
      finding([OTHER], { risk_description: "Third." }),
    ];
    const pack = [source(AGGREGATOR), source(PUBLISHER, { kind: "page" }), source(OTHER)];

    const result = await verify(kept, pack, readPage);

    expect(result.map((one) => one.risk_description)).toEqual(["First.", "Second.", "Third."]);
    expect(result.map((one) => one.snippet_only)).toEqual([true, undefined, undefined]);
  });

  it("does not change the findings it is given", async () => {
    const readPage = readerOf({ [OTHER]: NOT_HOLDING });
    const kept = [finding([OTHER], { confidence: "high" })];
    const before = JSON.stringify(kept);

    await verify(kept, [source(OTHER)], readPage);

    expect(JSON.stringify(kept)).toBe(before);
  });

  it("returns no findings for none, and reads nothing", async () => {
    const readPage = readerOf({});

    expect(await verify([], [source(OTHER)], readPage)).toEqual([]);
    expect(readPage).not.toHaveBeenCalled();
  });

  describe("the trace", () => {
    it("records a read by the code for every page, with what came of it", async () => {
      const trace = createTraceRecorder();
      const readPage = readerOf({
        [PUBLISHER]: new PageReadError("blocked_by_site"),
        [OTHER]: NOT_HOLDING,
        [AGGREGATOR]: HOLDING,
      });
      const pack = [OTHER, PUBLISHER, AGGREGATOR].map((url) => source(url));

      await verify(
        [finding([PUBLISHER, OTHER]), finding([AGGREGATOR], { category: "legal_regulatory" })],
        pack,
        readPage,
        { trace },
      );

      // The findings are checked at the same time, so the order of their steps is not fixed.
      const steps = trace.snapshot().steps;
      expect(steps).toHaveLength(3);
      expect(steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            by: "verification",
            tool: "read",
            category: "security_incidents",
            url: PUBLISHER,
            outcome: "failed",
            reason: "blocked_by_site",
          }),
          expect.objectContaining({
            by: "verification",
            tool: "read",
            category: "security_incidents",
            url: OTHER,
            outcome: "not_on_page",
          }),
          expect.objectContaining({
            by: "verification",
            tool: "read",
            category: "legal_regulatory",
            url: AGGREGATOR,
            outcome: "confirmed",
          }),
        ]),
      );
      expect(steps.find((step) => step.url === OTHER)?.reason).toBeUndefined();
    });

    it("gives a reader that throws anything else the reason unreachable", async () => {
      const trace = createTraceRecorder();
      const readPage = readerOf({ [OTHER]: new TypeError("boom") });

      await verify([finding([OTHER])], [source(OTHER)], readPage, { trace });

      expect(trace.snapshot().steps).toEqual([
        expect.objectContaining({ outcome: "failed", reason: "unreachable" }),
      ]);
    });

    it("holds neither the quote nor the text of a page", async () => {
      const trace = createTraceRecorder();
      const readPage = readerOf({ [OTHER]: NOT_HOLDING });

      await verify([finding([OTHER])], [source(OTHER)], readPage, { trace });

      const stored = JSON.stringify(trace.snapshot());
      expect(stored).not.toContain(QUOTE);
      expect(stored).not.toContain("investigating an incident");
    });

    it("records nothing when no finding rests on snippets", async () => {
      const trace = createTraceRecorder();

      await verify([finding([PUBLISHER])], [source(PUBLISHER, { kind: "page" })], readerOf({}), {
        trace,
      });

      expect(trace.snapshot().steps).toEqual([]);
    });
  });
});

describe("checkSnippetFindings", () => {
  const check = (
    findings: NewFinding[],
    pack: EvidenceSource[],
    readPage: PageReader,
    extra: { signal?: AbortSignal } = {},
  ) => checkSnippetFindings({ findings, pack, target: TARGET, readPage, ...extra });

  it("gives no verdict for a finding that cites a page that was read", async () => {
    const kept = [finding([OTHER, PUBLISHER])];

    const [result] = await check(
      kept,
      [source(OTHER), source(PUBLISHER, { kind: "page" })],
      readerOf({}),
    );

    expect(result).toEqual({ finding: kept[0], verdict: null });
  });

  it("confirms with the address of the page that holds the quote", async () => {
    const kept = [finding([OTHER])];

    const [result] = await check(kept, [source(OTHER)], readerOf({ [OTHER]: HOLDING }));

    expect(result).toEqual({ finding: kept[0], verdict: { outcome: "confirmed", url: OTHER } });
  });

  it("says not_on_page with the address of the page that was read", async () => {
    // The most credible source cannot be read, so the next one gives the verdict.
    const given = finding([OTHER, PUBLISHER], { confidence: "high" });

    const [result] = await check(
      [given],
      [source(OTHER), source(PUBLISHER)],
      readerOf({ [PUBLISHER]: new PageReadError("blocked_by_site"), [OTHER]: NOT_HOLDING }),
    );

    expect(result).toEqual({
      finding: { ...given, confidence: "low", snippet_only: true },
      verdict: { outcome: "not_on_page", url: OTHER },
    });
  });

  it("says unread when no page can be read", async () => {
    const given = finding([OTHER, PUBLISHER], { confidence: "high" });

    const [result] = await check(
      [given],
      [source(OTHER), source(PUBLISHER)],
      readerOf({
        [PUBLISHER]: new PageReadError("blocked_by_site"),
        [OTHER]: new PageReadError("unreachable"),
      }),
    );

    expect(result).toEqual({
      finding: { ...given, snippet_only: true },
      verdict: { outcome: "unread" },
    });
  });

  it("says unread once its signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const [result] = await check(
      [finding([OTHER])],
      [source(OTHER)],
      readerOf({ [OTHER]: HOLDING }),
      {
        signal: controller.signal,
      },
    );

    expect(result.verdict).toEqual({ outcome: "unread" });
  });

  it("returns one check for each finding, in their order", async () => {
    const kept = [
      finding([AGGREGATOR], { risk_description: "First." }),
      finding([PUBLISHER], { risk_description: "Second." }),
      finding([OTHER], { risk_description: "Third." }),
    ];
    const pack = [source(AGGREGATOR), source(PUBLISHER, { kind: "page" }), source(OTHER)];

    const result = await check(
      kept,
      pack,
      readerOf({ [OTHER]: HOLDING, [AGGREGATOR]: NOT_HOLDING }),
    );

    expect(result.map(({ finding: one, verdict }) => [one.risk_description, verdict])).toEqual([
      ["First.", { outcome: "not_on_page", url: AGGREGATOR }],
      ["Second.", null],
      ["Third.", { outcome: "confirmed", url: OTHER }],
    ]);
  });
});
