import type {
  CredibilityLabel,
  EvidenceSource,
  NewFinding,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import type { Credibility } from "../../credibility";
import { buildTarget } from "../../target";
import { createTraceRecorder } from "../../trace";
import type { CaseRun } from "../runCase";
import { type CaseScore, missedTargets, publisherKey, scoreRun } from "../scorer";
import type { EvalCase } from "../types";

const TARGET = buildTarget({
  vendor_name: "Acme",
  website: "acme.com",
  vendor_provides: "Payroll software",
});

const source = (
  partial: Partial<EvidenceSource> & Pick<EvidenceSource, "id" | "url">,
): EvidenceSource => ({
  category: "security_incidents",
  kind: "result",
  onVendorSite: false,
  title: "Acme in the news",
  content: "Acme was in the news.",
  publishedAt: null,
  ...partial,
});

const finding = (partial: Partial<NewFinding> = {}): NewFinding => ({
  category: "security_incidents",
  risk_description: "Attackers copied customer records from a vendor test system.",
  impact_description: "Customer data we send to the vendor may have been exposed.",
  action_plan: "Ask the vendor for its incident report.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  rationale: null,
  sources: [{ url: "https://news.example.com/a", title: "t", quote: "q", published_at: null }],
  ...partial,
});

function fakeRun(
  parts: {
    pack?: EvidenceSource[];
    kept?: NewFinding[];
    expected?: EvalCase["expected"];
    feeds?: Record<string, "web" | "news">;
    trace?: (recorder: ReturnType<typeof createTraceRecorder>) => void;
    searches?: number;
    reads?: number;
    /** The text of the pages the run read, by address. */
    readTexts?: Record<string, string>;
    /** The credibility of each kept finding, in their order. */
    credibility?: Credibility[];
  } = {},
): CaseRun {
  const recorder = createTraceRecorder();
  parts.trace?.(recorder);
  return {
    evalCase: { expected: parts.expected ?? { findings: [] } } as EvalCase,
    target: TARGET,
    found: { searchesUsed: parts.searches ?? 0, pagesRead: parts.reads ?? 0 } as CaseRun["found"],
    pack: parts.pack ?? [],
    analysed: null,
    kept: parts.kept ?? [],
    credibility: parts.credibility ?? [],
    trace: recorder.snapshot(),
    feedOf: (url) => parts.feeds?.[url],
    readTexts: new Map(Object.entries(parts.readTexts ?? {})),
  };
}

describe("scoreRun", () => {
  describe("precision and recall", () => {
    const expected: EvalCase["expected"] = {
      findings: [
        { category: "security_incidents", anyOf: ["customer records"] },
        { category: "legal_regulatory", anyOf: ["lawsuit"] },
      ],
    };

    it("counts a kept finding that matches an expected one by category and words", () => {
      const score = scoreRun(fakeRun({ kept: [finding()], expected }));

      expect(score).toMatchObject({ kept: 1, matched: 1, recalled: 1, expected: 2 });
      expect(score.precision).toBe(1);
      expect(score.recall).toBe(0.5);
    });

    it("does not match the right words in the wrong category", () => {
      const score = scoreRun(fakeRun({ kept: [finding({ category: "ai_specific" })], expected }));

      expect(score.matched).toBe(0);
      expect(score.precision).toBe(0);
      expect(score.recall).toBe(0);
    });

    it("matches in any case, and in the impact as well as the description", () => {
      const score = scoreRun(
        fakeRun({
          kept: [
            finding({
              risk_description: "Something else.",
              impact_description: "A LAWSUIT may follow.",
              category: "legal_regulatory",
            }),
          ],
          expected,
        }),
      );

      expect(score.recalled).toBe(1);
    });

    it("is not defined when nothing was kept, nor when nothing was expected", () => {
      const nothing = scoreRun(fakeRun({ expected: { findings: [] } }));

      expect(nothing.precision).toBeNull();
      expect(nothing.recall).toBeNull();
    });

    it("counts a second finding about an expected risk as a hit, not as another expected risk", () => {
      const score = scoreRun(fakeRun({ kept: [finding(), finding()], expected }));

      expect(score).toMatchObject({ kept: 2, matched: 2, recalled: 1 });
      expect(score.recall).toBe(0.5);
    });
  });

  describe("the sources of the pack", () => {
    it("counts the sources that do not mention the vendor", () => {
      const score = scoreRun(
        fakeRun({
          pack: [
            source({ id: "S1", url: "https://a.example.com/1" }),
            source({
              id: "S2",
              url: "https://b.example.com/2",
              title: "Cheap flights",
              content: "Fly to Rome.",
            }),
            source({
              id: "S3",
              url: "https://c.example.com/3",
              title: "Q&A",
              content: "How do I log in?",
            }),
          ],
        }),
      );

      expect(score.sources).toBe(3);
      expect(score.irrelevantSources).toBe(2);
    });

    it("does not count a page of the vendor's own site as irrelevant", () => {
      const score = scoreRun(
        fakeRun({
          pack: [
            source({
              id: "S1",
              kind: "page",
              onVendorSite: true,
              url: "https://acme.com/trust",
              title: "Trust",
              content: "We run audits.",
            }),
          ],
        }),
      );

      expect(score.irrelevantSources).toBe(0);
    });

    it("counts a source whose text is the text of an earlier one", () => {
      const score = scoreRun(
        fakeRun({
          pack: [
            source({ id: "S1", url: "https://a.example.com/1", content: "Acme  was hacked." }),
            source({ id: "S2", url: "https://b.example.com/2", content: "acme was HACKED." }),
            source({
              id: "S3",
              url: "https://c.example.com/3",
              content: "Another story about Acme.",
            }),
          ],
        }),
      );

      expect(score.duplicateSources).toBe(1);
    });

    it("counts an address that ends in an encoded quotation mark", () => {
      const score = scoreRun(
        fakeRun({
          pack: [
            source({ id: "S1", url: "https://platform.example.com/%E2%80%9D" }),
            source({ id: "S2", url: "https://platform.example.com/docs%22" }),
            source({ id: "S3", url: "https://platform.example.com/docs" }),
          ],
        }),
      );

      expect(score.badUrls).toBe(2);
    });

    it("counts a result of the web feed that carries a date, which the feed gives as its crawl date", () => {
      const score = scoreRun(
        fakeRun({
          pack: [
            source({ id: "S1", url: "https://web.example.com/dated", publishedAt: "2026-10-09" }),
            source({ id: "S2", url: "https://web.example.com/undated", publishedAt: null }),
            source({ id: "S3", url: "https://news.example.com/dated", publishedAt: "2026-09-30" }),
          ],
          feeds: {
            "https://web.example.com/dated": "web",
            "https://web.example.com/undated": "web",
            "https://news.example.com/dated": "news",
          },
        }),
      );

      expect(score.datedWebResults).toBe(1);
    });
  });

  describe("the findings", () => {
    it("counts a finding that cites snippets only, and not one that cites a page that was read", () => {
      const pack = [
        source({ id: "S1", url: "https://news.example.com/a", kind: "result" }),
        source({ id: "S2", url: "https://news.example.com/b", kind: "page" }),
      ];
      const score = scoreRun(
        fakeRun({
          pack,
          kept: [
            finding({
              sources: [
                { url: "https://news.example.com/a", title: "", quote: "q", published_at: null },
              ],
            }),
            finding({
              sources: [
                { url: "https://news.example.com/a", title: "", quote: "q", published_at: null },
                { url: "https://news.example.com/b", title: "", quote: "q", published_at: null },
              ],
            }),
          ],
        }),
      );

      expect(score.snippetOnlyFindings).toBe(1);
    });

    describe("a finding that cites snippets only, when a page was read after the analysis", () => {
      const url = "https://news.example.com/a";
      const quote = "attackers copied customer records";
      const kept = [finding({ sources: [{ url, title: "", quote, published_at: null }] })];
      const pack = [source({ id: "S1", url, kind: "result" })];

      it("is not counted when the page holds the quote", () => {
        const score = scoreRun(
          fakeRun({
            pack,
            kept,
            readTexts: { [url]: "Acme said that Attackers  copied “customer” records." },
          }),
        );

        expect(score.snippetOnlyFindings).toBe(0);
      });

      it("is counted when the page does not hold the quote", () => {
        const score = scoreRun(
          fakeRun({ pack, kept, readTexts: { [url]: "Acme is looking into an incident." } }),
        );

        expect(score.snippetOnlyFindings).toBe(1);
      });

      it("is counted when no page was read, and when only another address was", () => {
        expect(scoreRun(fakeRun({ pack, kept })).snippetOnlyFindings).toBe(1);
        expect(
          scoreRun(fakeRun({ pack, kept, readTexts: { "https://other.example.org/": quote } }))
            .snippetOnlyFindings,
        ).toBe(1);
      });

      it("is counted when its quote is empty, which every page holds", () => {
        const score = scoreRun(
          fakeRun({
            pack,
            kept: [finding({ sources: [{ url, title: "", quote: " “ ” ", published_at: null }] })],
            readTexts: { [url]: "Anything." },
          }),
        );

        expect(score.snippetOnlyFindings).toBe(1);
      });
    });

    it("counts a finding of high confidence that two addresses of one publisher support", () => {
      const cite = (url: string) => ({ url, title: "", quote: "q", published_at: null });
      const score = scoreRun(
        fakeRun({
          kept: [
            finding({
              confidence: "high",
              sources: [cite("https://www.bbc.co.uk/a"), cite("https://www.bbc.com/a")],
            }),
            finding({
              confidence: "high",
              sources: [cite("https://www.bbc.com/a"), cite("https://www.reuters.com/a")],
            }),
            finding({ confidence: "medium", sources: [cite("https://www.bbc.com/a")] }),
          ],
        }),
      );

      expect(score.overconfident).toBe(1);
    });

    it("counts the findings beyond the first about one event", () => {
      const score = scoreRun(
        fakeRun({
          expected: {
            findings: [],
            clusters: [
              { id: "breach", anyOf: ["breach", "records"] },
              { id: "fine", anyOf: ["fine"] },
            ],
          },
          kept: [
            finding({ risk_description: "A breach of the test system." }),
            finding({
              risk_description: "Customer records were copied.",
              category: "legal_regulatory",
            }),
            finding({
              risk_description: "The regulator imposed a fine.",
              impact_description: "Money.",
            }),
            finding({ risk_description: "Something unrelated.", impact_description: "Nothing." }),
          ],
        }),
      );

      expect(score.duplicateClusters).toBe(1);
    });
  });

  describe("the credibility labels", () => {
    const labelled = (label: CredibilityLabel, nameOnly = false): Credibility => ({
      label,
      basis: { rule: "unverified", registry_version: "sr-1", name_only: nameOnly, sources: [] },
    });
    const lawsuit = finding({
      category: "legal_regulatory",
      risk_description: "A lawsuit says the vendor kept data it should have deleted.",
    });

    it("counts a kept finding whose label is not the expected one", () => {
      const score = scoreRun(
        fakeRun({
          expected: {
            findings: [
              { category: "security_incidents", anyOf: ["customer records"], credibility: "high" },
              { category: "legal_regulatory", anyOf: ["lawsuit"], credibility: "low" },
            ],
          },
          kept: [finding(), lawsuit],
          credibility: [labelled("medium"), labelled("low")],
        }),
      );

      expect(score.mislabelled).toBe(1);
    });

    it("counts a finding whose name-only note is not the expected one, absent meaning none", () => {
      const score = scoreRun(
        fakeRun({
          expected: {
            findings: [
              {
                category: "security_incidents",
                anyOf: ["customer records"],
                credibility: "low",
                nameOnly: true,
              },
              { category: "legal_regulatory", anyOf: ["lawsuit"], credibility: "low" },
              { category: "ai_specific", anyOf: ["model"], credibility: "low", nameOnly: true },
            ],
          },
          kept: [
            finding(),
            lawsuit,
            finding({ category: "ai_specific", risk_description: "The vendor trains a model." }),
          ],
          credibility: [labelled("low"), labelled("low", true), labelled("low", true)],
        }),
      );

      expect(score.mislabelled).toBe(2);
    });

    it("ignores expected findings that give no label", () => {
      const score = scoreRun(
        fakeRun({
          expected: {
            findings: [
              { category: "security_incidents", anyOf: ["customer records"] },
              { category: "security_incidents", anyOf: ["test system"], credibility: "high" },
              { category: "legal_regulatory", anyOf: ["lawsuit"] },
            ],
          },
          kept: [finding(), lawsuit],
          credibility: [labelled("low"), labelled("low")],
        }),
      );

      // The first finding is held to the first expected finding that it matches and that gives a
      // label; the second matches only an expected finding that gives none.
      expect(score.mislabelled).toBe(1);
    });

    it("counts nothing when nothing is kept", () => {
      const score = scoreRun(
        fakeRun({
          expected: {
            findings: [
              { category: "security_incidents", anyOf: ["customer records"], credibility: "high" },
            ],
          },
        }),
      );

      expect(score.mislabelled).toBe(0);
    });
  });

  describe("the cost of the run", () => {
    it("takes the rejected quotes, the tokens, the searches and the reads from the run", () => {
      const score = scoreRun(
        fakeRun({
          searches: 6,
          reads: 3,
          trace: (recorder) => {
            recorder.dropped("citation.quote_not_in_source", 2);
            recorder.dropped("citation.unknown_source");
            recorder.dropped("duplicate.same_run", 4);
            recorder.rejected({ stage: "validation", reason: "no_valid_citation" });
            recorder.modelCall({
              purpose: "loop",
              ms: 10,
              totalTokens: 1200,
              inputTokens: 1000,
              outputTokens: 200,
            });
            recorder.modelCall({
              purpose: "analysis",
              ms: 10,
              totalTokens: 8000,
              inputTokens: 7500,
              outputTokens: 500,
            });
          },
        }),
      );

      expect(score).toMatchObject({
        citationsRejected: 3,
        candidatesRejected: 1,
        tokens: 9200,
        modelCalls: 2,
        searches: 6,
        reads: 3,
      });
    });
  });
});

describe("publisherKey", () => {
  it.each([
    ["https://www.bbc.co.uk/news/a", "bbc"],
    ["https://www.bbc.com/news/a", "bbc"],
    ["https://news.example.com/a", "example"],
    ["https://legal.example.org/a", "example"],
    ["https://acme.com/", "acme"],
    ["https://localhost/", "localhost"],
  ])("reads %s as %s", (url, key) => {
    expect(publisherKey(url)).toBe(key);
  });

  it("is null for an address that is not one", () => {
    expect(publisherKey("not a url")).toBeNull();
  });
});

describe("missedTargets", () => {
  const score = (partial: Partial<CaseScore>): CaseScore =>
    ({
      kept: 0,
      matched: 0,
      expected: 0,
      recalled: 0,
      precision: null,
      recall: null,
      citationsRejected: 0,
      candidatesRejected: 0,
      irrelevantSources: 0,
      duplicateSources: 0,
      badUrls: 0,
      datedWebResults: 0,
      snippetOnlyFindings: 0,
      overconfident: 0,
      mislabelled: 0,
      duplicateClusters: 0,
      sources: 0,
      searches: 0,
      reads: 0,
      modelCalls: 0,
      ms: 0,
      tokens: 0,
      ...partial,
    }) as CaseScore;

  it("lists the targets the score does not meet, in the order of the targets", () => {
    expect(
      missedTargets(score({ irrelevantSources: 3, badUrls: 0, kept: 2 }), {
        maxIrrelevantSources: 0,
        maxBadUrls: 0,
        maxKept: 1,
      }),
    ).toEqual(["maxIrrelevantSources", "maxKept"]);
  });

  it("meets a ceiling that is equal to the score", () => {
    expect(missedTargets(score({ duplicateSources: 2 }), { maxDuplicateSources: 2 })).toEqual([]);
  });

  it("meets a floor that is equal to the score, and misses one that is above it", () => {
    expect(
      missedTargets(score({ precision: 0.5, recall: 1 }), { minPrecision: 0.5, minRecall: 1 }),
    ).toEqual([]);
    expect(
      missedTargets(score({ precision: 0.4, recall: 0.9 }), { minPrecision: 0.5, minRecall: 1 }),
    ).toEqual(["minPrecision", "minRecall"]);
  });

  it("holds a floor that nothing can be measured against as met: no finding, no false one", () => {
    expect(
      missedTargets(score({ precision: null, recall: null }), { minPrecision: 1, minRecall: 1 }),
    ).toEqual([]);
  });

  it("asks nothing for a target that is absent", () => {
    expect(missedTargets(score({ irrelevantSources: 99 }), {})).toEqual([]);
  });
});
