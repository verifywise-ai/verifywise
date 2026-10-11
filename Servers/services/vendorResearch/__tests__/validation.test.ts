import {
  EvidenceSource,
  FindingSource,
  NewFinding,
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { calculateRiskLevel } from "../../../utils/validations/vendorRiskValidation.utils";
import {
  MAX_FINDING_TEXT_CHARS,
  MAX_PER_CATEGORY as SCHEMA_MAX_PER_CATEGORY,
  MAX_QUOTE_CHARS,
  RESEARCH_LIKELIHOODS,
  RESEARCH_SEVERITIES,
  ResearchOutput,
} from "../schema";
import { ResearchTarget } from "../target";
import {
  MAX_PER_CATEGORY,
  MAX_PER_RUN,
  applyCaps,
  confidenceCeiling,
  normaliseForQuote,
  sourceMentionsVendor,
  validateFindings,
} from "../validation";

type Candidate = ResearchOutput["findings"][number];

const TARGET: ResearchTarget = { name: "Acme", domain: "acme.com", provides: "Payroll software" };

function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    id: "S1",
    category: "security_incidents",
    url: "https://news.example.com/acme-breach",
    title: "Acme breach",
    content: "Acme confirmed on Monday that attackers copied customer records.",
    publishedAt: "2026-03-01",
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    category: "security_incidents",
    risk_description: "Attackers copied customer records at the vendor.",
    impact_description: "Our customer data may have been exposed.",
    likelihood: "Possible",
    risk_severity: "Major",
    action_plan: "Ask the vendor for its incident report.",
    confidence: "high",
    evidence: [{ source_id: "S1", quote: "attackers copied customer records" }],
    ...overrides,
  };
}

function validate(
  candidates: Candidate[],
  pack: EvidenceSource[] = [source()],
  target: ResearchTarget = TARGET,
  searched: ResearchCategory[] = [...RESEARCH_CATEGORIES],
) {
  return validateFindings({ findings: candidates, category_notes: [] }, pack, target, searched);
}

/** A finding source, for the tests of the confidence ceiling. */
function cited(url: string): FindingSource {
  return { url, title: "Title", quote: "quote", published_at: null };
}

// Built from char codes, so that no control character or lone surrogate sits in this file.
const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);
/** The first half of the emoji used below, which is the surrogate pair U+D83D U+DE00. */
const LONE_HIGH = String.fromCharCode(0xd83d);

/** A finding as validateFindings makes it, for the tests of applyCaps. */
function finding(
  risk_severity: NewFinding["risk_severity"],
  label: string,
  overrides: Partial<NewFinding> = {},
): NewFinding {
  return {
    category: "security_incidents",
    risk_description: label,
    impact_description: "An effect on us.",
    action_plan: "Ask the vendor.",
    likelihood: "Possible",
    risk_severity,
    risk_level: "High Risk",
    confidence: "low",
    sources: [cited("https://news.example.com/a")],
    ...overrides,
  };
}

describe("constants", () => {
  it("keeps three findings per category and eight per run", () => {
    expect(MAX_PER_CATEGORY).toBe(3);
    expect(MAX_PER_RUN).toBe(8);
  });

  it("takes the per-category cap from the schema, so that the prompt and the validation agree", () => {
    expect(MAX_PER_CATEGORY).toBe(SCHEMA_MAX_PER_CATEGORY);
  });
});

describe("normaliseForQuote", () => {
  it("lower-cases, collapses whitespace and removes curly quotes", () => {
    expect(normaliseForQuote("“Hello”  World")).toBe("hello world");
  });

  it.each([
    ["curly double quotes", "“Hello”", "hello"],
    ["curly single quotes and apostrophes", "‘Don’t’", "dont"],
    ["straight quotes and apostrophes", `He said "Don't"`, "he said dont"],
    ["low and guillemet quotes", "„Hello“ «World»", "hello world"],
    ["capitals", "ACME Corp", "acme corp"],
    ["runs of whitespace of every kind", "a \t\n  b\u00A0\u00A0c", "a b c"],
    ["whitespace at both ends", "  hello  ", "hello"],
    ["a quote mark between two spaces", "hello “ world", "hello world"],
  ])("handles %s", (_label, input, expected) => {
    expect(normaliseForQuote(input)).toBe(expected);
  });

  it.each([
    ["an empty string", ""],
    ["a lone space", " "],
    ["only whitespace", " \t\n\u00A0 "],
    ["only curly quotes", "“”"],
    ["curly quotes and spaces", " “ ” "],
    ["only straight quotes", `"'"`],
  ])("returns an empty string for %s", (_label, input) => {
    expect(normaliseForQuote(input)).toBe("");
  });

  it("gives the same result for a quote and for the page text it was copied from", () => {
    const page = "The “Acme” team   said it’s\nfixed.";
    const quote = 'the "acme" team said it\'s fixed.';
    expect(normaliseForQuote(quote)).toBe(normaliseForQuote(page));
  });
});

describe("sourceMentionsVendor", () => {
  const page = (overrides: Partial<EvidenceSource> = {}) =>
    source({
      url: "https://news.example.com/story",
      title: "A headline",
      content: "A paragraph.",
      ...overrides,
    });

  describe("by the host of the URL", () => {
    it.each([
      ["the domain itself", "https://acme.com/security"],
      ["a subdomain", "https://news.acme.com/story"],
      ["a deeper subdomain", "https://a.b.acme.com/story"],
      ["the www host", "https://www.acme.com/"],
      ["a host in capitals", "https://NEWS.ACME.COM/Story"],
      ["a host with a port", "https://trust.acme.com:8443/"],
    ])("accepts %s", (_label, url) => {
      expect(sourceMentionsVendor(page({ url }), TARGET)).toBe(true);
    });

    it.each([
      ["a host that ends in the domain without a dot", "https://notacme.com/story"],
      ["the domain as the start of another host", "https://acme.com.evil.test/story"],
      ["the domain in the path", "https://evil.test/acme.com"],
      ["the domain in the query", "https://evil.test/?site=acme.com"],
      ["a URL that cannot be parsed", "not a url"],
    ])("does not accept %s", (_label, url) => {
      expect(sourceMentionsVendor(page({ url }), TARGET)).toBe(false);
    });
  });

  describe("by the name of the vendor", () => {
    it.each([
      ["in the content", { content: "Acme confirmed an incident." }],
      ["in the title", { title: "Acme confirmed an incident" }],
      ["in capitals", { content: "ACME CONFIRMED AN INCIDENT." }],
      ["in lower case", { content: "the acme team confirmed it" }],
      ["with a possessive", { content: "Acme's customers were told." }],
      ["in brackets", { content: "The vendor (Acme) said so." }],
      ["before a comma", { content: "Acme, Inc. said so." }],
      ["at the end of the text", { content: "It was reported by Acme" }],
    ])("accepts the name %s", (_label, overrides) => {
      expect(sourceMentionsVendor(page(overrides), TARGET)).toBe(true);
    });

    it.each([
      ["a longer word that starts with it", "Acmeville announced a new park."],
      ["a longer word that ends with it", "The Racme team won."],
      ["a longer word with it in the middle", "The Hacmey tool."],
      ["the name followed by digits", "Acme2 is a different product."],
      ["no mention at all", "Globex announced a new product."],
    ])("does not accept %s", (_label, content) => {
      expect(sourceMentionsVendor(page({ content }), TARGET)).toBe(false);
    });

    it("matches whole words in every script, not only ASCII ones", () => {
      const target: ResearchTarget = { name: "Éclair", domain: null, provides: "" };
      expect(sourceMentionsVendor(page({ content: "Un éclair rouge." }), target)).toBe(true);
      expect(sourceMentionsVendor(page({ content: "Des éclairs rouges." }), target)).toBe(false);
      expect(sourceMentionsVendor(page({ content: "Le dÉclair." }), target)).toBe(false);

      const german: ResearchTarget = { name: "Müller", domain: null, provides: "" };
      expect(sourceMentionsVendor(page({ content: "Müller AG meldet" }), german)).toBe(true);
      expect(sourceMentionsVendor(page({ content: "Müllerei AG meldet" }), german)).toBe(false);
    });

    it("treats characters that mean something in a regular expression as plain text", () => {
      const named = (name: string): ResearchTarget => ({ name, domain: null, provides: "" });

      expect(sourceMentionsVendor(page({ content: "We write C++ daily." }), named("C++"))).toBe(
        true,
      );
      expect(sourceMentionsVendor(page({ content: "We write C daily." }), named("C++"))).toBe(
        false,
      );
      expect(sourceMentionsVendor(page({ content: "AT&T said so." }), named("AT&T"))).toBe(true);
      expect(sourceMentionsVendor(page({ content: "ATT said so." }), named("AT&T"))).toBe(false);
      expect(sourceMentionsVendor(page({ content: "Acme (EU) said." }), named("Acme (EU)"))).toBe(
        true,
      );
      expect(sourceMentionsVendor(page({ content: "A.B said so." }), named("A.B"))).toBe(true);
      expect(sourceMentionsVendor(page({ content: "AxB said so." }), named("A.B"))).toBe(false);
      expect(sourceMentionsVendor(page({ content: "Beta said so." }), named("Acme|Beta"))).toBe(
        false,
      );
      expect(sourceMentionsVendor(page({ content: "Acme|Beta said." }), named("Acme|Beta"))).toBe(
        true,
      );
    });

    it("does not throw for names that would not be a valid regular expression", () => {
      for (const name of ["(", "[", "\\", "*", "a{2", "?", "+", "^", "$", ")("]) {
        const target: ResearchTarget = { name, domain: null, provides: "" };
        expect(() => sourceMentionsVendor(page({ content: `x ${name} y` }), target)).not.toThrow();
      }
    });

    it("accepts a name written with any run of whitespace between its words", () => {
      const target: ResearchTarget = { name: "Acme Corp", domain: null, provides: "" };
      expect(sourceMentionsVendor(page({ content: "Acme   Corp said so." }), target)).toBe(true);
      expect(sourceMentionsVendor(page({ content: "Acme\nCorp said so." }), target)).toBe(true);
      expect(sourceMentionsVendor(page({ content: "AcmeCorp said so." }), target)).toBe(false);
    });

    it("never matches an empty name, or one of only whitespace", () => {
      for (const name of ["", "   ", "\t\n"]) {
        const target: ResearchTarget = { name, domain: null, provides: "" };
        expect(
          sourceMentionsVendor(page({ content: "Anything at all, even a name." }), target),
        ).toBe(false);
        expect(sourceMentionsVendor(page({ title: "", content: "" }), target)).toBe(false);
      }
    });

    it("still matches the domain when the name is empty", () => {
      const target: ResearchTarget = { name: "", domain: "acme.com", provides: "" };
      expect(sourceMentionsVendor(page({ url: "https://news.acme.com/x" }), target)).toBe(true);
      expect(sourceMentionsVendor(page({ content: "See acme.com for details." }), target)).toBe(
        true,
      );
      expect(sourceMentionsVendor(page(), target)).toBe(false);
    });
  });

  describe("by the domain of the vendor in the text", () => {
    it.each([
      ["the content", { content: "See acme.com/security for the report." }],
      ["the title", { title: "Acme.com status page" }],
      ["a link", { content: "Read https://www.acme.com/trust before you sign." }],
      ["an e-mail address", { content: "Write to security@acme.com." }],
      ["a sentence end", { content: "Visit acme.com." }],
    ])("accepts the domain in %s", (_label, overrides) => {
      const target: ResearchTarget = { name: "Zebra", domain: "acme.com", provides: "" };
      expect(sourceMentionsVendor(page(overrides), target)).toBe(true);
    });

    it.each([
      ["a longer domain that ends with it", "Visit notacme.com for deals."],
      ["a longer top-level domain", "Visit acme.company for deals."],
      ["a different top-level domain", "Visit acme.org for deals."],
    ])("does not accept %s", (_label, content) => {
      const target: ResearchTarget = { name: "Zebra", domain: "acme.com", provides: "" };
      expect(sourceMentionsVendor(page({ content }), target)).toBe(false);
    });

    it("treats the dots of the domain as plain dots", () => {
      const target: ResearchTarget = { name: "Zebra", domain: "acme.com", provides: "" };
      expect(sourceMentionsVendor(page({ content: "Visit acmexcom today." }), target)).toBe(false);
    });

    it("relies on the name alone when the vendor has no domain", () => {
      const target: ResearchTarget = { name: "Acme", domain: null, provides: "" };
      expect(sourceMentionsVendor(page({ url: "https://news.acme.com/x" }), target)).toBe(false);
      expect(sourceMentionsVendor(page({ content: "Acme said so." }), target)).toBe(true);
    });
  });
});

describe("confidenceCeiling", () => {
  it("is low for no source and for one source of a third party", () => {
    expect(confidenceCeiling([], TARGET)).toBe("low");
    expect(confidenceCeiling([cited("https://news.example.com/a")], TARGET)).toBe("low");
  });

  it("is medium for one source on the vendor's own domain, subdomains included", () => {
    expect(confidenceCeiling([cited("https://acme.com/trust")], TARGET)).toBe("medium");
    expect(confidenceCeiling([cited("https://trust.acme.com/soc2")], TARGET)).toBe("medium");
    expect(confidenceCeiling([cited("https://WWW.ACME.COM/")], TARGET)).toBe("medium");
  });

  it("does not count a lookalike host as the vendor's own domain", () => {
    expect(confidenceCeiling([cited("https://notacme.com/trust")], TARGET)).toBe("low");
    expect(confidenceCeiling([cited("https://acme.com.evil.test/")], TARGET)).toBe("low");
  });

  it("does not count any host as the vendor's own when the vendor has no domain", () => {
    const noDomain: ResearchTarget = { name: "Acme", domain: null, provides: "" };
    expect(confidenceCeiling([cited("https://acme.com/trust")], noDomain)).toBe("low");
  });

  it("is medium for two sources on one hostname", () => {
    expect(
      confidenceCeiling(
        [cited("https://news.example.com/a"), cited("https://news.example.com/b")],
        TARGET,
      ),
    ).toBe("medium");
  });

  it("is high for two distinct hostnames", () => {
    expect(
      confidenceCeiling(
        [cited("https://news.example.com/a"), cited("https://other.example.org/b")],
        TARGET,
      ),
    ).toBe("high");
    expect(
      confidenceCeiling(
        [cited("https://acme.com/trust"), cited("https://news.example.com/a")],
        TARGET,
      ),
    ).toBe("high");
  });

  it("does not take www.x.test and x.test for two hostnames, nor two cases of one host", () => {
    expect(
      confidenceCeiling([cited("https://www.x.test/a"), cited("https://x.test/b")], TARGET),
    ).toBe("medium");
    expect(confidenceCeiling([cited("https://X.test/a"), cited("https://x.TEST/b")], TARGET)).toBe(
      "medium",
    );
  });

  it("does not take one URL cited twice for two sources", () => {
    expect(
      confidenceCeiling(
        [cited("https://news.example.com/a"), cited("https://news.example.com/a")],
        TARGET,
      ),
    ).toBe("low");
  });

  it("does not count a URL it cannot read as a source, and does not throw", () => {
    expect(
      confidenceCeiling([cited("not a url"), cited("https://news.example.com/a")], TARGET),
    ).toBe("low");
    expect(confidenceCeiling([cited("not a url")], TARGET)).toBe("low");
  });
});

describe("validateFindings", () => {
  describe("a candidate that is fine", () => {
    it("becomes a finding with the level, the sources and a confidence the evidence supports", () => {
      const findings = validate([candidate()]);

      expect(findings).toEqual([
        {
          category: "security_incidents",
          risk_description: "Attackers copied customer records at the vendor.",
          impact_description: "Our customer data may have been exposed.",
          action_plan: "Ask the vendor for its incident report.",
          likelihood: "Possible",
          risk_severity: "Major",
          risk_level: "High Risk",
          confidence: "low",
          sources: [
            {
              url: "https://news.example.com/acme-breach",
              title: "Acme breach",
              quote: "attackers copied customer records",
              published_at: "2026-03-01",
            },
          ],
        },
      ]);
    });

    it("returns nothing for an answer without findings", () => {
      expect(validate([])).toEqual([]);
    });

    it("stores the text without the whitespace around it", () => {
      const [finding] = validate([
        candidate({
          risk_description: "  Risk text.\n",
          impact_description: "\tImpact text. ",
          action_plan: " Plan text.  ",
          evidence: [{ source_id: "S1", quote: "  attackers copied customer records \n" }],
        }),
      ]);

      expect(finding.risk_description).toBe("Risk text.");
      expect(finding.impact_description).toBe("Impact text.");
      expect(finding.action_plan).toBe("Plan text.");
      expect(finding.sources[0].quote).toBe("attackers copied customer records");
    });

    it("does not change the answer or the pack it is given", () => {
      const output: ResearchOutput = {
        findings: [candidate(), candidate({ category: "legal_regulatory" })],
        category_notes: [{ category: "security_incidents", note: "A note." }],
      };
      const pack = [source()];
      const outputBefore = JSON.parse(JSON.stringify(output));
      const packBefore = JSON.parse(JSON.stringify(pack));

      validateFindings(output, pack, TARGET, [...RESEARCH_CATEGORIES]);

      expect(output).toEqual(outputBefore);
      expect(pack).toEqual(packBefore);
    });
  });

  describe("the evidence items", () => {
    it("removes an item whose source id is not in the pack, and drops a candidate left with none", () => {
      expect(
        validate([candidate({ evidence: [{ source_id: "S9", quote: "attackers copied" }] })]),
      ).toEqual([]);
    });

    it("removes an item whose quote is not in its source, and drops a candidate left with none", () => {
      expect(
        validate([
          candidate({ evidence: [{ source_id: "S1", quote: "the vendor lost all data" }] }),
        ]),
      ).toEqual([]);
    });

    it("keeps a candidate with one valid and one invalid item, with only the valid source", () => {
      const pack = [source(), source({ id: "S2", url: "https://other.example.org/b" })];

      const [finding] = validate(
        [
          candidate({
            evidence: [
              { source_id: "S1", quote: "attackers copied customer records" },
              { source_id: "S2", quote: "this sentence is not on the page" },
            ],
          }),
        ],
        pack,
      );

      expect(finding.sources).toEqual([
        {
          url: "https://news.example.com/acme-breach",
          title: "Acme breach",
          quote: "attackers copied customer records",
          published_at: "2026-03-01",
        },
      ]);
    });

    it("keeps the sources of all valid items, in the order the model cited them", () => {
      const pack = [
        source(),
        source({
          id: "S2",
          url: "https://other.example.org/b",
          title: "Second",
          content: "Acme said the incident began in May.",
          publishedAt: null,
        }),
      ];

      const [finding] = validate(
        [
          candidate({
            evidence: [
              { source_id: "S2", quote: "the incident began in May" },
              { source_id: "S1", quote: "confirmed on Monday" },
            ],
          }),
        ],
        pack,
      );

      expect(finding.sources.map((entry) => [entry.url, entry.published_at])).toEqual([
        ["https://other.example.org/b", null],
        ["https://news.example.com/acme-breach", "2026-03-01"],
      ]);
    });

    it("checks a quote against the content of its source, not against its title", () => {
      expect(
        validate(
          [candidate({ evidence: [{ source_id: "S1", quote: "Acme breach" }] })],
          [source({ title: "Acme breach", content: "Attackers copied customer records at Acme." })],
        ),
      ).toEqual([]);
    });

    it("checks a quote against its own source, not against another one in the pack", () => {
      const pack = [
        source(),
        source({ id: "S2", url: "https://other.example.org/b", content: "Acme fixed the bug." }),
      ];

      expect(
        validate(
          [
            candidate({
              evidence: [{ source_id: "S2", quote: "attackers copied customer records" }],
            }),
          ],
          pack,
        ),
      ).toEqual([]);
    });

    it("accepts a quote that differs from the page only in case, whitespace and quote marks", () => {
      const page = source({
        content: "The “Acme” team   said it’s\nfixed the flaw.",
      });

      const findings = validate(
        [candidate({ evidence: [{ source_id: "S1", quote: `"ACME" team said it's fixed` }] })],
        [page],
      );

      expect(findings).toHaveLength(1);
    });

    it("accepts a quote taken from anywhere in the content", () => {
      const page = source({ content: "First part. Acme confirmed it. Last part." });
      for (const quote of ["First part.", "Acme confirmed it.", "Last part.", page.content]) {
        expect(
          validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [page]),
        ).toHaveLength(1);
      }
    });

    it("removes a quote that is not a contiguous part of the content", () => {
      const page = source({ content: "First part. Acme confirmed it. Last part." });
      expect(
        validate(
          [candidate({ evidence: [{ source_id: "S1", quote: "First part. Last part." }] })],
          [page],
        ),
      ).toEqual([]);
    });

    it("cites a source once, even when the model cites it twice", () => {
      const [finding] = validate([
        candidate({
          evidence: [
            { source_id: "S1", quote: "attackers copied customer records" },
            { source_id: "S1", quote: "Acme confirmed on Monday" },
          ],
        }),
      ]);

      expect(finding.sources).toHaveLength(1);
      expect(finding.sources[0].quote).toBe("attackers copied customer records");
    });

    it("lets a repeated citation of one source add nothing to the confidence", () => {
      const [finding] = validate([
        candidate({
          confidence: "high",
          evidence: [
            { source_id: "S1", quote: "attackers copied customer records" },
            { source_id: "S1", quote: "Acme confirmed on Monday" },
          ],
        }),
      ]);

      expect(finding.confidence).toBe("low");
    });

    it("removes an item whose quote is longer than the schema allows", () => {
      // Words that are no part of the vendor's name, which a quote has to hold. The title of the
      // default source names the vendor, so the source still mentions it.
      const long = "word ".repeat(80);
      expect(long.length).toBeGreaterThan(MAX_QUOTE_CHARS);
      const page = source({ content: long });

      expect(
        validate([candidate({ evidence: [{ source_id: "S1", quote: long }] })], [page]),
      ).toEqual([]);
      expect(
        validate(
          [candidate({ evidence: [{ source_id: "S1", quote: long.slice(0, MAX_QUOTE_CHARS) }] })],
          [page],
        ),
      ).toHaveLength(1);
    });

    describe("the prompt escaping", () => {
      const CODE = source({
        url: "https://acme.com/changelog",
        title: "Changelog",
        content: "if x < 3 & y",
        publishedAt: null,
      });

      it.each([
        ["as it is written on the page", "if x < 3 & y"],
        ["as the model saw it, with the escaping of the prompt", "if x &lt; 3 &amp; y"],
      ])("accepts the quote %s, and stores it as the page writes it", (_label, quote) => {
        const findings = validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [CODE]);

        expect(findings).toHaveLength(1);
        expect(findings[0].sources).toEqual([
          {
            url: "https://acme.com/changelog",
            title: "Changelog",
            quote: "if x < 3 & y",
            published_at: null,
          },
        ]);
      });

      it("accepts the greater-than sign in either form", () => {
        const page = source({ ...CODE, content: "a > b" });
        for (const quote of ["a > b", "a &gt; b"]) {
          expect(
            validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [page]),
          ).toHaveLength(1);
        }
      });

      it("decodes the escaping once: a page that really contains an entity is quoted as the model saw it", () => {
        const page = source({ ...CODE, content: "Acme writes &lt; for a smaller-than sign." });

        const quoteAsSeen = "Acme writes &amp;lt; for a smaller-than sign.";
        expect(
          validate([candidate({ evidence: [{ source_id: "S1", quote: quoteAsSeen }] })], [page]),
        ).toHaveLength(1);
      });

      it("does not accept a quote that is escaped differently from the page", () => {
        expect(
          validate(
            [candidate({ evidence: [{ source_id: "S1", quote: "if x &amp;lt; 3" }] })],
            [CODE],
          ),
        ).toEqual([]);
      });
    });

    describe("an empty quote", () => {
      // An empty string is a substring of every text, so it has to be refused on its own.
      it.each([
        ["an empty string", ""],
        ["a lone space", " "],
        ["whitespace", " \t\n "],
        ["only curly quotes", "“”"],
        ["only straight quotes", '""'],
        ["quotes and spaces", ' “ " ” '],
      ])("removes an item with %s", (_label, quote) => {
        expect(validate([candidate({ evidence: [{ source_id: "S1", quote }] })])).toEqual([]);
      });

      it("keeps the other items of the candidate", () => {
        const [finding] = validate([
          candidate({
            evidence: [
              { source_id: "S1", quote: " " },
              { source_id: "S1", quote: "attackers copied customer records" },
            ],
          }),
        ]);

        expect(finding.sources.map((entry) => entry.quote)).toEqual([
          "attackers copied customer records",
        ]);
      });
    });

    describe("a quote with characters that a database refuses", () => {
      it("drops a NUL from the quote before it looks for it, and stores the quote without it", () => {
        const quote = `attackers${NUL} copied customer records`;

        const [found] = validate([candidate({ evidence: [{ source_id: "S1", quote }] })]);

        expect(found.sources[0].quote).toBe("attackers copied customer records");
      });

      it("rejects a quote that ends in half of a surrogate pair, though the page has the whole pair", () => {
        const page = source({
          content: "Acme said the \u{1F600} icon was shown to every customer.",
        });
        const quote = `Acme said the ${LONE_HIGH}`;
        // As UTF-16 units the quote is the start of the page: only the cleaning tells them apart.
        expect(page.content.startsWith(quote)).toBe(true);

        expect(validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [page])).toEqual(
          [],
        );
      });

      it("does not count a NUL against the length limit of a quote", () => {
        // Words that are no part of the vendor's name: a quote of the name alone does not count.
        // The title of the default source names the vendor, so the source still mentions it.
        const content = "word ".repeat(MAX_QUOTE_CHARS / 5);
        expect(content).toHaveLength(MAX_QUOTE_CHARS);
        const quote = `${content}${NUL.repeat(5)}`;

        expect(
          validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [source({ content })]),
        ).toHaveLength(1);
      });
    });
  });

  describe("the same-name guard", () => {
    // sourceMentionsVendor has its own tests above. These two show that validateFindings applies
    // it to each citation.
    it("removes a source that never mentions the vendor, and drops the candidate", () => {
      const other = source({
        url: "https://news.example.com/globex",
        title: "Globex breach",
        content: "Globex confirmed that attackers copied customer records.",
      });

      expect(validate([candidate()], [other])).toEqual([]);
    });

    it("checks each cited source on its own: a source about another company is removed, the rest stays", () => {
      const pack = [
        source(),
        source({
          id: "S2",
          url: "https://news.example.com/globex",
          title: "Globex",
          content: "Globex said the incident began in May.",
        }),
      ];

      const [found] = validate(
        [
          candidate({
            evidence: [
              { source_id: "S1", quote: "attackers copied customer records" },
              { source_id: "S2", quote: "the incident began in May" },
            ],
          }),
        ],
        pack,
      );

      expect(found.sources.map((entry) => entry.url)).toEqual([
        "https://news.example.com/acme-breach",
      ]);
    });
  });

  // The vendor's own name is in every source that mentions the vendor, so a quote of nothing but
  // that name always passes the substring test and the same-name guard. It says nothing about a
  // risk, and with two hostnames it would lift a claim to `high`. This is not a minimum length
  // (R16): "ISO 27001" is short and real. A quote counts when it holds a word that is no part of
  // the vendor's name or domain.
  describe("a quote that only repeats the vendor's name", () => {
    const ANALYTICS: ResearchTarget = {
      name: "Acme Analytics",
      domain: "acme-analytics.com",
      provides: "Dashboards",
    };
    const PAGE = source({
      url: "https://news.example.com/acme-analytics",
      title: "Acme Analytics in the news",
      content:
        "Acme Analytics (acme-analytics.com). Acme confirmed the incident on Monday. " +
        "Its SOC 2 Type II report and ISO 27001 certificate are current. " +
        "The logo reads Analytics Acme. " +
        // How a page writes the domain and the name: with www. and a scheme, as a possessive, and
        // with a company suffix.
        "Visit www.acme-analytics.com, https://acme-analytics.com or http://www.acme-analytics.com. " +
        "Acme's customers were told, and Acme Analytics's status page was updated. " +
        "Acme Analytics Inc filed the report. The https certificate expired last week.",
    });
    const quoting = (quote: string, target: ResearchTarget = ANALYTICS) =>
      validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [PAGE], target);

    it.each([
      ["the first word of the name", "Acme"],
      ["the whole name", "Acme Analytics"],
      ["the name in other case and spacing", "  ACME   analytics "],
      ["the name between quotation marks", "“Acme Analytics”"],
      ["the domain", "acme-analytics.com"],
      ["the name and the domain", "Acme Analytics (acme-analytics.com)"],
      ["words of the name, in another order", "Analytics Acme"],
      // The ways a page writes the domain: the vendor record keeps it without www. and a scheme.
      ["the domain written with www.", "www.acme-analytics.com"],
      ["the domain written as a link", "https://acme-analytics.com"],
      ["the domain written as a link with www.", "http://www.acme-analytics.com"],
      ["a scheme and nothing else", "https"],
      ["www and nothing else", "www"],
      // The apostrophe is stripped before the words are compared, so "Acme's" is "acmes".
      ["the possessive of the first word of the name", "Acme's"],
      ["the possessive of the whole name", "Acme Analytics's"],
      ["the possessive of the name, with a typographic apostrophe", "Acme Analytics’s"],
    ])("removes the citation of %s, and drops a candidate left with none", (_label, quote) => {
      // Positive control: the quote is in the page and the page mentions the vendor, so nothing
      // but the rule about the vendor's own name can refuse it.
      expect(normaliseForQuote(PAGE.content)).toContain(normaliseForQuote(quote));
      expect(sourceMentionsVendor(PAGE, ANALYTICS)).toBe(true);

      expect(quoting(quote)).toEqual([]);
    });

    it.each([
      ["the name and what happened", "Acme confirmed the incident"],
      ["no name at all", "SOC 2 Type II"],
      ["a short quote of one word and one number, which is real", "ISO 27001"],
      ["a single word that is no part of the name", "certificate"],
      ["a number", "27001"],
      // Positive controls for the scheme and www: a real word next to them is enough.
      ["a scheme and a real word", "https certificate"],
      ["a scheme and more real words", "https certificate expired"],
      // A known limit, not a wish: a company suffix is a word of its own, and there is no list of
      // suffixes. The rule stops the name and the domain as the vendor record has them.
      ["the name and a company suffix (a known limit)", "Acme Analytics Inc"],
    ])("keeps the citation of %s", (_label, quote) => {
      const [found] = quoting(quote);

      expect(found.sources.map((entry) => entry.quote)).toEqual([quote]);
    });

    it("refuses a quote with no word in it, such as punctuation", () => {
      expect(quoting(").")).toEqual([]);
    });

    it("keeps the other citations of a finding, and a later quote of a source whose first quote was refused", () => {
      const other = source({
        id: "S2",
        url: "https://other.example.org/b",
        content: "Acme Analytics renewed its SOC 2 Type II report.",
      });

      const [found] = validate(
        [
          candidate({
            evidence: [
              { source_id: "S1", quote: "Acme" },
              { source_id: "S2", quote: "Acme Analytics" },
              { source_id: "S1", quote: "SOC 2 Type II" },
              { source_id: "S2", quote: "SOC 2 Type II" },
            ],
          }),
        ],
        [PAGE, other],
        ANALYTICS,
      );

      expect(found.sources).toEqual([
        {
          url: PAGE.url,
          title: PAGE.title,
          quote: "SOC 2 Type II",
          published_at: "2026-03-01",
        },
        {
          url: other.url,
          title: other.title,
          quote: "SOC 2 Type II",
          published_at: "2026-03-01",
        },
      ]);
    });

    it("compares words of every script, not only ASCII ones", () => {
      const target: ResearchTarget = { name: "Müller Söhne", domain: null, provides: "" };
      const page = source({
        title: "Müller Söhne",
        content: "Müller Söhne bestätigte den Vorfall am Montag.",
      });
      const quote = (text: string) =>
        validate([candidate({ evidence: [{ source_id: "S1", quote: text }] })], [page], target);

      expect(quote("MÜLLER")).toEqual([]);
      expect(quote("Müller Söhne")).toEqual([]);
      expect(quote("Müller Söhne bestätigte den Vorfall")).toHaveLength(1);
    });

    it("works with a vendor that has no domain, and with one whose name is empty", () => {
      const noDomain: ResearchTarget = { name: "Acme Analytics", domain: null, provides: "" };
      expect(quoting("Acme Analytics", noDomain)).toEqual([]);
      expect(quoting("Acme confirmed the incident", noDomain)).toHaveLength(1);
      // A known limit: without a domain on record, the word "com" is a word of its own, and there
      // is no list of top-level domains. With the domain on record the same quote is refused.
      expect(quoting("acme-analytics.com", noDomain)).toHaveLength(1);
      expect(quoting("acme-analytics.com")).toEqual([]);

      const noName: ResearchTarget = { name: "", domain: "acme-analytics.com", provides: "" };
      expect(quoting("acme-analytics.com", noName)).toEqual([]);
      expect(quoting("Acme confirmed the incident", noName)).toHaveLength(1);
    });

    describe("the confidence", () => {
      const NEWS = source({ id: "S1", url: "https://news.example.com/a" });
      // The same second source for both halves: it names Acme, and it has the real sentence too.
      const ROUNDUP = source({
        id: "S2",
        url: "https://other.example.org/b",
        title: "Industry roundup",
        content:
          "A roundup of the week mentions Acme. Acme told customers that attackers copied customer records.",
      });
      const OWN_SITE = source({
        id: "S1",
        url: "https://trust.acme.com/incident",
        content: "We found that attackers copied customer records.",
      });
      const claimed = (secondQuote: string) =>
        candidate({
          confidence: "high",
          evidence: [
            { source_id: "S1", quote: "attackers copied customer records" },
            { source_id: "S2", quote: secondQuote },
          ],
        });

      it("is not lifted to high by a second hostname whose only quote is the vendor's name", () => {
        const [found] = validate([claimed("Acme")], [NEWS, ROUNDUP]);

        expect(found.sources.map((entry) => entry.url)).toEqual(["https://news.example.com/a"]);
        // One page of a third party is `low`.
        expect(found.confidence).toBe("low");
      });

      it("stays high when the second quote is real (the same sources)", () => {
        const [found] = validate([claimed("attackers copied customer records")], [NEWS, ROUNDUP]);

        expect(found.sources.map((entry) => entry.url)).toEqual([
          "https://news.example.com/a",
          "https://other.example.org/b",
        ]);
        expect(found.confidence).toBe("high");
      });

      it("is at most medium when the one real source is the vendor's own site and the other quote is only its name", () => {
        const [refused] = validate([claimed("Acme")], [OWN_SITE, ROUNDUP]);
        const [real] = validate(
          [claimed("attackers copied customer records")],
          [OWN_SITE, ROUNDUP],
        );

        expect(refused.sources).toHaveLength(1);
        expect(refused.confidence).toBe("medium");
        expect(real.sources).toHaveLength(2);
        expect(real.confidence).toBe("high");
      });

      it("is not lifted to high by a second hostname whose only quote is the domain written with www.", () => {
        const news = source({
          id: "S1",
          url: "https://news.example.com/a",
          title: "Acme Analytics breach",
          content: "Acme Analytics said that attackers copied customer records.",
        });
        const roundup = source({
          id: "S2",
          url: "https://other.example.org/b",
          title: "Industry roundup",
          content:
            "A roundup of the week: Acme Analytics (www.acme-analytics.com) told customers that " +
            "attackers copied customer records.",
        });
        const claimedOf = (secondQuote: string) =>
          candidate({
            confidence: "high",
            evidence: [
              { source_id: "S1", quote: "attackers copied customer records" },
              { source_id: "S2", quote: secondQuote },
            ],
          });
        // Positive control: the quote is in the page and the page mentions the vendor, so only the
        // rule about the vendor's own words can refuse it.
        expect(normaliseForQuote(roundup.content)).toContain("www.acme-analytics.com");
        expect(sourceMentionsVendor(roundup, ANALYTICS)).toBe(true);

        const [refused] = validate(
          [claimedOf("www.acme-analytics.com")],
          [news, roundup],
          ANALYTICS,
        );
        const [real] = validate(
          [claimedOf("attackers copied customer records")],
          [news, roundup],
          ANALYTICS,
        );

        expect(refused.sources.map((entry) => entry.url)).toEqual(["https://news.example.com/a"]);
        // One page of a third party is `low`.
        expect(refused.confidence).toBe("low");
        // The same sources with a real second quote stay `high`.
        expect(real.sources).toHaveLength(2);
        expect(real.confidence).toBe("high");
      });
    });
  });

  describe("the categories", () => {
    it("drops a candidate whose category was not searched", () => {
      expect(
        validate([candidate({ category: "legal_regulatory" })], [source()], TARGET, [
          "security_incidents",
          "certifications",
        ]),
      ).toEqual([]);
    });

    it("keeps a candidate whose category was searched", () => {
      expect(
        validate([candidate({ category: "certifications" })], [source()], TARGET, [
          "certifications",
        ]),
      ).toHaveLength(1);
    });

    it("drops every candidate when no category was searched", () => {
      expect(validate([candidate()], [source()], TARGET, [])).toEqual([]);
    });

    it("does not require a source to come from the search of the category it supports", () => {
      const fromNews = source({ category: "security_incidents" });

      expect(
        validate([candidate({ category: "legal_regulatory" })], [fromNews], TARGET, [
          "legal_regulatory",
        ]),
      ).toHaveLength(1);
    });
  });

  describe("the risk level", () => {
    it("is the level of the severity and the likelihood, with the word Risk after it", () => {
      for (const risk_severity of RESEARCH_SEVERITIES) {
        for (const likelihood of RESEARCH_LIKELIHOODS) {
          const [finding] = validate([candidate({ risk_severity, likelihood })]);

          expect(finding.risk_level).toBe(`${calculateRiskLevel(risk_severity, likelihood)} Risk`);
          expect(finding.risk_severity).toBe(risk_severity);
          expect(finding.likelihood).toBe(likelihood);
        }
      }
    });

    it.each([
      ["Negligible", "Rare", "Very Low Risk"],
      ["Moderate", "Unlikely", "Medium Risk"],
      ["Major", "Likely", "High Risk"],
      ["Catastrophic", "Almost certain", "Very High Risk"],
    ] as const)("is %s and %s -> %s", (risk_severity, likelihood, expected) => {
      const [finding] = validate([candidate({ risk_severity, likelihood })]);

      expect(finding.risk_level).toBe(expected);
    });

    it.each([
      ["an unknown likelihood", { likelihood: "Sometimes" }],
      ["an unknown severity", { risk_severity: "Huge" }],
      ["a likelihood in the wrong case", { likelihood: "possible" }],
      ["a severity that is the impact scale's", { risk_severity: "Critical" }],
      ["an unknown confidence", { confidence: "certain" }],
      // The matrix of risk levels is a plain object, which has a "constructor" with a "name".
      [
        "a severity and a likelihood that are names of properties of every object",
        { risk_severity: "constructor", likelihood: "name" },
      ],
    ])("drops a candidate with %s", (_label, overrides) => {
      expect(validate([candidate(overrides as unknown as Partial<Candidate>)])).toEqual([]);
    });
  });

  describe("the texts", () => {
    it.each([
      ["risk_description", ""],
      ["risk_description", "   "],
      ["risk_description", "\n\t "],
      ["impact_description", ""],
      ["impact_description", "  "],
      ["action_plan", ""],
      ["action_plan", " \n "],
    ])("drops a candidate whose %s is %j", (field, value) => {
      expect(validate([candidate({ [field]: value })])).toEqual([]);
    });

    it("drops a candidate with a text longer than the schema allows and keeps one of exactly that length", () => {
      const limit = MAX_FINDING_TEXT_CHARS;
      for (const field of ["risk_description", "impact_description", "action_plan"]) {
        expect(validate([candidate({ [field]: "x".repeat(limit + 1) })])).toEqual([]);
        expect(validate([candidate({ [field]: "x".repeat(limit) })])).toHaveLength(1);
      }
    });

    describe("characters that a database refuses", () => {
      const FIELDS = ["risk_description", "impact_description", "action_plan"] as const;

      it.each(FIELDS)("removes a NUL from the %s", (field) => {
        const [found] = validate([candidate({ [field]: `Some${NUL} text${NUL}.` })]);

        expect(found[field]).toBe("Some text.");
      });

      it.each(FIELDS)("drops a candidate whose %s is only NULs and whitespace", (field) => {
        expect(validate([candidate({ [field]: `${NUL} ${NUL}\n${NUL}` })])).toEqual([]);
      });

      it("replaces a lone surrogate with U+FFFD", () => {
        const [found] = validate([candidate({ risk_description: `Half an emoji: ${LONE_HIGH}` })]);

        expect(found.risk_description).toBe(`Half an emoji: ${REPLACEMENT}`);
      });

      it("cleans a text before it counts its length", () => {
        const limit = MAX_FINDING_TEXT_CHARS;

        const [found] = validate([
          candidate({ risk_description: `${"x".repeat(limit)}${NUL.repeat(10)}` }),
        ]);

        expect(found.risk_description).toBe("x".repeat(limit));
        expect(
          validate([candidate({ risk_description: `${"x".repeat(limit + 1)}${NUL}` })]),
        ).toEqual([]);
      });
    });
  });

  describe("the confidence", () => {
    const THIRD_PARTY_A = source({ id: "S1", url: "https://news.example.com/a" });
    const THIRD_PARTY_B = source({
      id: "S2",
      url: "https://other.example.org/b",
      content: "Acme told customers that attackers copied customer records.",
    });
    const SAME_HOST_B = source({
      id: "S2",
      url: "https://news.example.com/b",
      content: "Acme told customers that attackers copied customer records.",
    });
    const OWN_SITE = source({
      id: "S1",
      url: "https://trust.acme.com/incident",
      content: "We found that attackers copied customer records.",
    });
    const both = [
      { source_id: "S1", quote: "attackers copied customer records" },
      { source_id: "S2", quote: "attackers copied customer records" },
    ];

    it("is lowered to low when a single third-party source backs a high claim", () => {
      const [finding] = validate([candidate({ confidence: "high" })], [THIRD_PARTY_A]);
      expect(finding.confidence).toBe("low");
    });

    it("stays high when two distinct hostnames back a high claim", () => {
      const [finding] = validate(
        [candidate({ confidence: "high", evidence: both })],
        [THIRD_PARTY_A, THIRD_PARTY_B],
      );
      expect(finding.confidence).toBe("high");
    });

    it("is lowered to medium when a single source on the vendor's own domain backs a high claim", () => {
      const [finding] = validate([candidate({ confidence: "high" })], [OWN_SITE]);
      expect(finding.confidence).toBe("medium");
    });

    it("is lowered to medium when two sources on one hostname back a high claim", () => {
      const [finding] = validate(
        [candidate({ confidence: "high", evidence: both })],
        [THIRD_PARTY_A, SAME_HOST_B],
      );
      expect(finding.confidence).toBe("medium");
    });

    it("is never raised: a low claim stays low whatever the evidence", () => {
      const [finding] = validate(
        [candidate({ confidence: "low", evidence: both })],
        [THIRD_PARTY_A, THIRD_PARTY_B],
      );
      expect(finding.confidence).toBe("low");
    });

    it("is never raised: a medium claim stays medium with the strongest evidence, and falls to low with the weakest", () => {
      const strong = validate(
        [candidate({ confidence: "medium", evidence: both })],
        [THIRD_PARTY_A, THIRD_PARTY_B],
      );
      const weak = validate([candidate({ confidence: "medium" })], [THIRD_PARTY_A]);

      expect(strong[0].confidence).toBe("medium");
      expect(weak[0].confidence).toBe("low");
    });

    it("is worked out from the evidence that remains, not from what the model cited", () => {
      const [finding] = validate(
        [
          candidate({
            confidence: "high",
            evidence: [
              { source_id: "S1", quote: "attackers copied customer records" },
              { source_id: "S2", quote: "this sentence is not on the page" },
            ],
          }),
        ],
        [THIRD_PARTY_A, THIRD_PARTY_B],
      );

      expect(finding.sources).toHaveLength(1);
      expect(finding.confidence).toBe("low");
    });
  });

  describe("the order of the findings", () => {
    const withSeverity = (risk_severity: Candidate["risk_severity"], label: string, extra = {}) =>
      candidate({ risk_severity, risk_description: label, ...extra });

    it("puts the most severe first", () => {
      const findings = validate([
        withSeverity("Minor", "minor"),
        withSeverity("Catastrophic", "catastrophic"),
        withSeverity("Negligible", "negligible"),
        withSeverity("Major", "major"),
        withSeverity("Moderate", "moderate"),
      ]);

      expect(findings.map((found) => found.risk_description)).toEqual([
        "catastrophic",
        "major",
        "moderate",
        "minor",
        "negligible",
      ]);
    });

    it("does not cap them: applyCaps does that, after the de-duplication", () => {
      const candidates = RESEARCH_CATEGORIES.flatMap((category) =>
        (["Major", "Moderate", "Minor", "Negligible"] as const).map((risk_severity) =>
          withSeverity(risk_severity, `${category}-${risk_severity}`, { category }),
        ),
      );
      expect(candidates).toHaveLength(16);

      const findings = validate(candidates);

      expect(findings).toHaveLength(16);
      expect(findings.map((found) => found.risk_severity)).toEqual([
        ...Array(4).fill("Major"),
        ...Array(4).fill("Moderate"),
        ...Array(4).fill("Minor"),
        ...Array(4).fill("Negligible"),
      ]);
    });

    it("keeps candidates of equal severity in the order the model gave them", () => {
      const findings = validate([
        withSeverity("Major", "first"),
        withSeverity("Major", "second"),
        withSeverity("Major", "third"),
        withSeverity("Major", "fourth"),
      ]);

      expect(findings.map((found) => found.risk_description)).toEqual([
        "first",
        "second",
        "third",
        "fourth",
      ]);
    });

    it("leaves a candidate that failed a check out, whatever its severity", () => {
      const findings = validate([
        withSeverity("Catastrophic", "bad quote", {
          evidence: [{ source_id: "S1", quote: "this sentence is not on the page" }],
        }),
        withSeverity("Minor", "three"),
        withSeverity("Major", "one"),
        withSeverity("Moderate", "two"),
      ]);

      expect(findings.map((found) => found.risk_description)).toEqual(["one", "two", "three"]);
    });

    it("leaves out the candidates of a category that was not searched, whatever their severity", () => {
      const findings = validate(
        [
          ...Array.from({ length: 4 }, (_, index) =>
            withSeverity("Catastrophic", `legal-${index}`, { category: "legal_regulatory" }),
          ),
          withSeverity("Minor", "kept", { category: "security_incidents" }),
        ],
        [source()],
        TARGET,
        ["security_incidents"],
      );

      expect(findings.map((found) => found.risk_description)).toEqual(["kept"]);
    });
  });
});

describe("applyCaps", () => {
  const labels = (findings: NewFinding[]) => findings.map((found) => found.risk_description);

  it("keeps three of five findings in one category, the most severe first", () => {
    const capped = applyCaps([
      finding("Minor", "minor"),
      finding("Catastrophic", "catastrophic"),
      finding("Negligible", "negligible"),
      finding("Major", "major"),
      finding("Moderate", "moderate"),
    ]);

    expect(labels(capped)).toEqual(["catastrophic", "major", "moderate"]);
  });

  it("keeps eight of twelve findings over four categories, the most severe first", () => {
    const severities: Record<ResearchCategory, Array<NewFinding["risk_severity"]>> = {
      security_incidents: ["Catastrophic", "Major", "Negligible"],
      certifications: ["Catastrophic", "Moderate", "Negligible"],
      legal_regulatory: ["Major", "Moderate", "Minor"],
      ai_specific: ["Major", "Moderate", "Minor"],
    };
    const findings = RESEARCH_CATEGORIES.flatMap((category) =>
      severities[category].map((risk_severity, index) =>
        finding(risk_severity, `${category}-${index}`, { category }),
      ),
    );
    expect(findings).toHaveLength(12);

    const capped = applyCaps(findings);

    expect(capped).toHaveLength(MAX_PER_RUN);
    expect(capped.map((found) => found.risk_severity)).toEqual([
      "Catastrophic",
      "Catastrophic",
      "Major",
      "Major",
      "Major",
      "Moderate",
      "Moderate",
      "Moderate",
    ]);
    // The four least severe findings are the ones that were cut, and findings of one severity
    // keep the order they were given in.
    expect(labels(capped)).toEqual([
      "security_incidents-0",
      "certifications-0",
      "security_incidents-1",
      "legal_regulatory-0",
      "ai_specific-0",
      "certifications-1",
      "legal_regulatory-1",
      "ai_specific-1",
    ]);
  });

  it("applies the cap of a category before the cap of the run", () => {
    const findings = [
      ...Array.from({ length: 5 }, (_, index) =>
        finding("Catastrophic", `security-${index}`, { category: "security_incidents" }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        finding("Minor", `certifications-${index}`, { category: "certifications" }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        finding("Minor", `legal-${index}`, { category: "legal_regulatory" }),
      ),
    ];

    expect(labels(applyCaps(findings))).toEqual([
      "security-0",
      "security-1",
      "security-2",
      "certifications-0",
      "certifications-1",
      "certifications-2",
      "legal-0",
      "legal-1",
    ]);
  });

  it("keeps findings of equal severity in the order they were given", () => {
    const capped = applyCaps([
      finding("Major", "first"),
      finding("Major", "second"),
      finding("Major", "third"),
      finding("Major", "fourth"),
    ]);

    expect(labels(capped)).toEqual(["first", "second", "third"]);
  });

  it("returns everything, the most severe first, when nothing is over a cap", () => {
    const capped = applyCaps([
      finding("Minor", "minor", { category: "ai_specific" }),
      finding("Major", "major", { category: "certifications" }),
    ]);

    expect(labels(capped)).toEqual(["major", "minor"]);
  });

  it("returns nothing for no findings", () => {
    expect(applyCaps([])).toEqual([]);
  });

  it("does not change the list it is given", () => {
    const findings = [finding("Minor", "minor"), finding("Major", "major")];

    const capped = applyCaps(findings);

    expect(labels(findings)).toEqual(["minor", "major"]);
    expect(capped).not.toBe(findings);
  });
});
