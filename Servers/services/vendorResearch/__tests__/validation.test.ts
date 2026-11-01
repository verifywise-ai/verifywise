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
  type CredibilityOutput,
  RESEARCH_LIKELIHOODS,
  RESEARCH_SEVERITIES,
} from "../schema";
import { ResearchTarget } from "../target";
import {
  MAX_PER_CATEGORY,
  MAX_PER_RUN,
  applyCaps,
  newValidationReport,
  normaliseForQuote,
  sourceMentionsVendor,
  validateFindings,
} from "../validation";

type Candidate = CredibilityOutput["findings"][number];

const TARGET: ResearchTarget = { name: "Acme", domain: "acme.com", provides: "Payroll software" };

function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    id: "S1",
    category: "security_incidents",
    kind: "result",
    onVendorSite: false,
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
    rationale: "The vendor confirmed the incident, and it holds our customer data.",
    evidence: [{ source_id: "S1", quote: "attackers copied customer records" }],
    ...overrides,
  };
}

function validate(
  candidates: Candidate[],
  pack: EvidenceSource[] = [source()],
  target: ResearchTarget = TARGET,
  categoriesInPack: ResearchCategory[] = [...RESEARCH_CATEGORIES],
) {
  return validateFindings(
    { findings: candidates, category_notes: [] },
    pack,
    target,
    categoriesInPack,
  );
}

/** A finding source, as it is stored. */
function findingSource(url: string): FindingSource {
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
    rationale: "Because of the evidence.",
    sources: [findingSource("https://news.example.com/a")],
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

  // The research decides whether a page is the vendor's own, on the page that answered (see
  // `onVendorSite`), and validation takes that decision. It does not read the host of the URL again:
  // a URL is the one that was asked for, and a page can answer from somewhere else.
  describe("by the vendor's mark (onVendorSite)", () => {
    it.each([
      ["the domain itself", "https://acme.com/security"],
      ["a subdomain", "https://trust.acme.com/story"],
      ["the www host", "https://www.acme.com/"],
      // The page was asked for off the vendor's domain and answered from its site.
      ["a host off the vendor's domain", "https://news.example.com/redirected"],
    ])(
      "accepts a source marked as the vendor's own whose URL is %s, with no mention",
      (_label, url) => {
        expect(sourceMentionsVendor(page({ url, onVendorSite: true }), TARGET)).toBe(true);
      },
    );

    it.each([
      ["the domain itself", "https://acme.com/security"],
      ["a subdomain", "https://news.acme.com/story"],
      ["a deeper subdomain", "https://a.b.acme.com/story"],
      ["the www host", "https://www.acme.com/"],
      ["a host in capitals", "https://NEWS.ACME.COM/Story"],
      ["a host with a port", "https://trust.acme.com:8443/"],
    ])(
      "does not accept a source not marked as the vendor's own, though its URL is %s: the page redirected off the domain",
      (_label, url) => {
        expect(sourceMentionsVendor(page({ url, onVendorSite: false }), TARGET)).toBe(false);
      },
    );

    it("accepts the source not marked as the vendor's own once its text names the vendor", () => {
      const redirected = page({
        url: "https://acme.com/moved",
        onVendorSite: false,
        content: "Acme has moved this page.",
      });
      expect(sourceMentionsVendor(redirected, TARGET)).toBe(true);
    });

    it("never takes a source for the vendor's own when the vendor has no domain, whatever the mark", () => {
      const noDomain: ResearchTarget = { name: "Acme", domain: null, provides: "" };
      for (const url of ["https://news.acme.com/x", "https://news.example.com/x", "not a url"]) {
        expect(sourceMentionsVendor(page({ url, onVendorSite: true }), noDomain)).toBe(false);
      }
    });

    it("does not accept a source whose URL cannot be parsed and is not marked as the vendor's own", () => {
      expect(sourceMentionsVendor(page({ url: "not a url" }), TARGET)).toBe(false);
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
      expect(
        sourceMentionsVendor(page({ url: "https://news.acme.com/x", onVendorSite: true }), target),
      ).toBe(true);
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

  // A list entry found by the vendor's stored LEI names the company as the list does, under a
  // former name, a holding name or a transliteration: the LEI is what ties it to the vendor (M2
  // final review, Important 2). An LEI is 20 characters with check digits, one per legal entity.
  describe("by the vendor's stored LEI", () => {
    const LEI = "TEST00ACMEANALYT0154";
    const target: ResearchTarget = {
      name: "Acme Analytics",
      domain: "acmeanalytics.example",
      provides: "",
      identifiers: { lei: LEI },
    };
    const entry = (content: string) =>
      page({
        url: "https://data.europa.eu/data/datasets/consolidated?logicalId=9001",
        title: "EU consolidated list of financial sanctions: NORTHWIND HOLDINGS",
        content,
      });

    it("accepts an entry under another name whose text carries the vendor's LEI", () => {
      expect(
        sourceMentionsVendor(
          entry(`Entry: "NORTHWIND HOLDINGS" (enterprise). Identification number: ${LEI}.`),
          target,
        ),
      ).toBe(true);
      expect(
        sourceMentionsVendor(entry(`Identification number: ${LEI.toLowerCase()}.`), target),
      ).toBe(true);
    });

    it("does not accept an entry that lacks the LEI, or carries another", () => {
      expect(sourceMentionsVendor(entry(`Entry: "NORTHWIND HOLDINGS" (enterprise).`), target)).toBe(
        false,
      );
      expect(
        sourceMentionsVendor(entry("Identification number: TEST00OTHERENTITY0099."), target),
      ).toBe(false);
    });

    it("does not accept a longer code that holds the LEI", () => {
      expect(sourceMentionsVendor(entry(`Identification number: X${LEI}9.`), target)).toBe(false);
    });

    it("a vendor without a stored LEI is matched as before", () => {
      const { identifiers: _none, ...plain } = target;
      expect(sourceMentionsVendor(entry(`Identification number: ${LEI}.`), plain)).toBe(false);
    });
  });
});

describe("validateFindings", () => {
  describe("a candidate that is fine", () => {
    it("becomes a finding with the level and the sources, and no confidence", () => {
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
          rationale: "The vendor confirmed the incident, and it holds our customer data.",
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

    describe("the rationale", () => {
      it("is stored cleaned and without the whitespace around it", () => {
        const [finding] = validate([
          candidate({ rationale: "  The vendor\u0000 confirmed it.\n" }),
        ]);

        expect(finding.rationale).toBe("The vendor confirmed it.");
      });

      it("is null when the model gave none or a blank one, and the finding stays", () => {
        const missing = { ...candidate(), rationale: undefined } as unknown as Candidate;

        expect(validate([missing])[0].rationale).toBeNull();
        expect(validate([candidate({ rationale: "   \n" })])[0].rationale).toBeNull();
        expect(validate([candidate({ rationale: "\u0000\u0000" })])).toHaveLength(1);
      });

      it("is cut at 300 characters, so that a recording that skipped the schema cannot store more", () => {
        const [finding] = validate([candidate({ rationale: "r".repeat(400) })]);

        expect(finding.rationale).toHaveLength(300);
      });

      it("is not a reason to drop a finding, and is not read by any check", () => {
        const report = newValidationReport();
        const found = validateFindings(
          { findings: [candidate({ rationale: "Totally unrelated words." })], category_notes: [] },
          [source()],
          TARGET,
          ["security_incidents"],
          report,
        );

        expect(found).toHaveLength(1);
        expect(report.candidates).toEqual([]);
      });
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
      const output: CredibilityOutput = {
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
      const pack = [source(), source({ id: "S2", url: "https://www.reuters.com/b" })];

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
          url: "https://www.reuters.com/b",
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
        ["https://www.reuters.com/b", null],
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
        source({ id: "S2", url: "https://www.reuters.com/b", content: "Acme fixed the bug." }),
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
        onVendorSite: true,
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

    describe("the gap mark of a page excerpt", () => {
      // Where an excerpt leaves text of the page out it has a line with only the mark on it, so a
      // quote that holds the mark joins passages that are not next to each other on the page.
      const PAGE = source({
        kind: "page",
        onVendorSite: true,
        url: "https://acme.com/security",
        title: "Acme security",
        content:
          "Acme encrypts customer data at rest.\n[…]\nAttackers copied customer records last year.",
        publishedAt: null,
      });

      it.each([
        ["across the gap", "Acme encrypts customer data at rest.\n[…]\nAttackers copied"],
        ["across the gap, on one line", "data at rest. […] Attackers copied customer records"],
        ["up to the mark", "encrypts customer data at rest.\n[…]"],
        ["from the mark", "[…]\nAttackers copied customer records"],
        // Quote marks are ignored by the comparison, so a mark written with them inside is the
        // mark of the excerpt all the same.
        ["with straight quote marks in the mark", 'data at rest. ["…"] Attackers copied'],
        ["with curly quote marks in the mark", "data at rest. [“…”] Attackers copied"],
        ["with guillemets in the mark", "data at rest. [«…»] Attackers copied"],
      ])(
        "drops a quote %s, though the excerpt holds the same text with the mark",
        (_label, quote) => {
          // The quote is in the excerpt once case and whitespace are ignored, so only the mark
          // can be the reason it is dropped.
          expect(normaliseForQuote(PAGE.content)).toContain(normaliseForQuote(quote));

          expect(validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [PAGE])).toEqual(
            [],
          );
        },
      );

      it("keeps the same passage quoted without the mark", () => {
        const quote = "Attackers copied customer records last year.";

        const [found] = validate([candidate({ evidence: [{ source_id: "S1", quote }] })], [PAGE]);

        expect(found.sources).toEqual([
          { url: "https://acme.com/security", title: "Acme security", quote, published_at: null },
        ]);
      });

      it("does not use up the source: a later quote of it without the mark still counts", () => {
        const [found] = validate(
          [
            candidate({
              evidence: [
                { source_id: "S1", quote: "data at rest.\n[…]\nAttackers copied" },
                { source_id: "S1", quote: "encrypts customer data at rest" },
              ],
            }),
          ],
          [PAGE],
        );

        expect(found.sources.map((cited) => cited.quote)).toEqual([
          "encrypts customer data at rest",
        ]);
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
    // sourceMentionsVendor has its own tests above. These show that validateFindings applies it
    // to each citation, and takes the vendor's own page from the research's mark.
    it("removes a source that never mentions the vendor, and drops the candidate", () => {
      const other = source({
        url: "https://news.example.com/globex",
        title: "Globex breach",
        content: "Globex confirmed that attackers copied customer records.",
      });

      expect(validate([candidate()], [other])).toEqual([]);
    });

    describe("the vendor's own page is the page that answered", () => {
      // No word of these pages names the vendor, so only the mark of the research can let them in.
      const quoting = (page: EvidenceSource) =>
        validate(
          [
            candidate({
              evidence: [{ source_id: "S1", quote: "attackers copied customer records" }],
            }),
          ],
          [page],
        );
      const unnamed = (overrides: Partial<EvidenceSource>) =>
        source({
          url: "https://acme.com/security",
          title: "Security notice",
          content: "We found that attackers copied customer records.",
          ...overrides,
        });

      it("drops a page asked for on the vendor's domain that answered from somewhere else", () => {
        expect(quoting(unnamed({ onVendorSite: false }))).toEqual([]);
      });

      it("keeps a page the research took for the vendor's own, with no mention in its text", () => {
        expect(quoting(unnamed({ onVendorSite: true }))).toHaveLength(1);
      });

      it("keeps it whatever host the URL has: the mark is the decision, not the host", () => {
        const moved = unnamed({ onVendorSite: true, url: "https://news.example.com/moved" });

        expect(quoting(moved)).toHaveLength(1);
      });

      it("never takes a page for the vendor's own when the vendor has no domain", () => {
        const noDomain: ResearchTarget = { name: "Acme", domain: null, provides: "" };

        expect(
          validate(
            [
              candidate({
                evidence: [{ source_id: "S1", quote: "attackers copied customer records" }],
              }),
            ],
            [unnamed({ onVendorSite: true })],
            noDomain,
          ),
        ).toEqual([]);
      });
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
  // risk, and with two publishers it would lift a claim to `high`. This is not a minimum length
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
        url: "https://www.reuters.com/b",
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

    describe("a second source", () => {
      const NEWS = source({ id: "S1", url: "https://news.example.com/a" });
      // The same second source for both halves: it names Acme, and it has the real sentence too.
      const ROUNDUP = source({
        id: "S2",
        url: "https://www.reuters.com/b",
        title: "Industry roundup",
        content:
          "A roundup of the week mentions Acme. Acme told customers that attackers copied customer records.",
      });
      const OWN_SITE = source({
        id: "S1",
        onVendorSite: true,
        url: "https://trust.acme.com/incident",
        content: "We found that attackers copied customer records.",
      });
      const claimed = (secondQuote: string) =>
        candidate({
          evidence: [
            { source_id: "S1", quote: "attackers copied customer records" },
            { source_id: "S2", quote: secondQuote },
          ],
        });

      it("is not cited when its only quote is the vendor's name", () => {
        const [found] = validate([claimed("Acme")], [NEWS, ROUNDUP]);

        expect(found.sources.map((entry) => entry.url)).toEqual(["https://news.example.com/a"]);
      });

      it("is cited when its quote is real (the same sources)", () => {
        const [found] = validate([claimed("attackers copied customer records")], [NEWS, ROUNDUP]);

        expect(found.sources.map((entry) => entry.url)).toEqual([
          "https://news.example.com/a",
          "https://www.reuters.com/b",
        ]);
      });

      it("is cited only for a real quote when the first source is the vendor's own site", () => {
        const [refused] = validate([claimed("Acme")], [OWN_SITE, ROUNDUP]);
        const [real] = validate(
          [claimed("attackers copied customer records")],
          [OWN_SITE, ROUNDUP],
        );

        expect(refused.sources).toHaveLength(1);
        expect(real.sources).toHaveLength(2);
      });

      it("is not cited when its only quote is the domain written with www.", () => {
        const news = source({
          id: "S1",
          url: "https://news.example.com/a",
          title: "Acme Analytics breach",
          content: "Acme Analytics said that attackers copied customer records.",
        });
        const roundup = source({
          id: "S2",
          url: "https://www.reuters.com/b",
          title: "Industry roundup",
          content:
            "A roundup of the week: Acme Analytics (www.acme-analytics.com) told customers that " +
            "attackers copied customer records.",
        });
        const claimedOf = (secondQuote: string) =>
          candidate({
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
        // The same sources with a real second quote are both cited.
        expect(real.sources).toHaveLength(2);
      });
    });
  });

  describe("the categories", () => {
    it("drops a candidate whose category has no source in the pack", () => {
      expect(
        validate([candidate({ category: "legal_regulatory" })], [source()], TARGET, [
          "security_incidents",
          "certifications",
        ]),
      ).toEqual([]);
    });

    it("keeps a candidate whose category has a source in the pack", () => {
      expect(
        validate([candidate({ category: "certifications" })], [source()], TARGET, [
          "certifications",
        ]),
      ).toHaveLength(1);
    });

    it("drops every candidate when no category has a source in the pack", () => {
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

  describe("no confidence", () => {
    // The model is not asked for a confidence, and the label of a finding is worked out from its
    // sources by credibility.ts. A recording made before holds one, and nothing reads it.
    const THIRD_PARTY_A = source({ id: "S1", url: "https://news.example.com/a" });
    const THIRD_PARTY_B = source({
      id: "S2",
      url: "https://www.reuters.com/b",
      content: "Acme told customers that attackers copied customer records.",
    });
    const both = [
      { source_id: "S1", quote: "attackers copied customer records" },
      { source_id: "S2", quote: "attackers copied customer records" },
    ];
    const withConfidence = (confidence: unknown, over: Partial<Candidate> = {}) =>
      ({ ...candidate(over), confidence }) as unknown as Candidate;

    it("gives a finding none, whatever its sources", () => {
      const one = validate([candidate()], [THIRD_PARTY_A]);
      const two = validate([candidate({ evidence: both })], [THIRD_PARTY_A, THIRD_PARTY_B]);

      expect(one).toHaveLength(1);
      expect(two).toHaveLength(1);
      expect(one[0]).not.toHaveProperty("confidence");
      expect(two[0]).not.toHaveProperty("confidence");
    });

    it.each(["low", "medium", "high"])(
      "does not carry over the %s of a recording made before",
      (confidence) => {
        const [found] = validate([withConfidence(confidence)], [THIRD_PARTY_A]);

        expect(found).not.toHaveProperty("confidence");
      },
    );

    it("does not drop a candidate for a confidence it should not have, even an unknown one", () => {
      const found = validate([withConfidence("certain")], [THIRD_PARTY_A]);

      expect(found).toHaveLength(1);
      expect(found[0]).not.toHaveProperty("confidence");
      expect(found[0].risk_level).toBe("High Risk");
    });

    it("reports no rejection for it", () => {
      const report = newValidationReport();

      validateFindings(
        { findings: [withConfidence("certain")], category_notes: [] },
        [THIRD_PARTY_A],
        TARGET,
        [...RESEARCH_CATEGORIES],
        report,
      );

      expect(report.candidates).toEqual([]);
      expect(report.citations).toEqual({});
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
      expect(candidates).toHaveLength(24);

      const findings = validate(candidates);

      expect(findings).toHaveLength(24);
      expect(findings.map((found) => found.risk_severity)).toEqual([
        ...Array(6).fill("Major"),
        ...Array(6).fill("Moderate"),
        ...Array(6).fill("Minor"),
        ...Array(6).fill("Negligible"),
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

    it("leaves out the candidates of a category with no source in the pack, whatever their severity", () => {
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

describe("validateFindings report", () => {
  /** Validates with a report and gives back both. */
  function validated(
    candidates: Candidate[],
    pack: EvidenceSource[] = [source()],
    categoriesInPack: ResearchCategory[] = [...RESEARCH_CATEGORIES],
  ) {
    const report = newValidationReport();
    const findings = validateFindings(
      { findings: candidates, category_notes: [] },
      pack,
      TARGET,
      categoriesInPack,
      report,
    );
    return { findings, report };
  }

  it("is empty when every candidate holds up", () => {
    const { findings, report } = validated([candidate()]);

    expect(findings).toHaveLength(1);
    expect(report).toEqual({ candidates: [], citations: {} });
  });

  it("says that a category has no evidence in the pack", () => {
    const { findings, report } = validated(
      [candidate({ category: "legal_regulatory" })],
      [source()],
      ["security_incidents"],
    );

    expect(findings).toEqual([]);
    expect(report.candidates).toEqual([
      expect.objectContaining({ reason: "category_not_in_pack", category: "legal_regulatory" }),
    ]);
  });

  it("says that a text is blank, and gives the start of the candidate to recognise it by", () => {
    const { report } = validated([candidate({ risk_description: "   " })]);

    expect(report.candidates).toEqual([
      expect.objectContaining({ reason: "text_unusable", category: "security_incidents" }),
    ]);
  });

  it("says that a candidate is left with no citation, and why each citation was removed", () => {
    const { findings, report } = validated([
      candidate({
        evidence: [
          { source_id: "S9", quote: "attackers copied customer records" },
          { source_id: "S1", quote: "this sentence is nowhere in the source" },
        ],
      }),
    ]);

    expect(findings).toEqual([]);
    expect(report.candidates).toEqual([
      expect.objectContaining({
        reason: "no_valid_citation",
        text: expect.stringContaining("Attackers"),
      }),
    ]);
    expect(report.citations).toEqual({ unknown_source: 1, quote_not_in_source: 1 });
  });

  it("counts a citation that is removed from a candidate that stays", () => {
    const { findings, report } = validated(
      [
        candidate({
          evidence: [
            { source_id: "S1", quote: "attackers copied customer records" },
            { source_id: "S2", quote: "Acme" },
          ],
        }),
      ],
      [
        source(),
        source({ id: "S2", url: "https://www.reuters.com/a", content: "Acme is a vendor." }),
      ],
    );

    expect(findings).toHaveLength(1);
    expect(report.candidates).toEqual([]);
    expect(report.citations).toEqual({ quote_is_only_the_name: 1 });
  });

  it("tells a source that is not about the vendor from a quote that is not in it", () => {
    const { report } = validated(
      [candidate({ evidence: [{ source_id: "S1", quote: "attackers copied customer records" }] })],
      [
        source({
          title: "Zed breach",
          content: "Zed lost attackers copied customer records data.",
        }),
      ],
    );

    expect(report.citations).toEqual({ source_not_about_vendor: 1 });
  });

  it("says that a quote crosses the gap of an excerpt or is too long", () => {
    const { report } = validated([
      candidate({
        evidence: [
          { source_id: "S1", quote: "attackers […] records" },
          { source_id: "S1", quote: "x".repeat(MAX_QUOTE_CHARS + 1) },
        ],
      }),
    ]);

    expect(report.citations).toEqual({ gap_mark: 1, quote_too_long: 1 });
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

  it("keeps eight of eighteen findings over six categories, the most severe first", () => {
    const severities: Record<ResearchCategory, Array<NewFinding["risk_severity"]>> = {
      security_incidents: ["Catastrophic", "Major", "Negligible"],
      certifications: ["Catastrophic", "Moderate", "Negligible"],
      legal_regulatory: ["Major", "Moderate", "Minor"],
      ai_specific: ["Major", "Moderate", "Minor"],
      availability: ["Major", "Moderate", "Minor"],
      financial_health: ["Minor", "Negligible", "Negligible"],
    };
    const findings = RESEARCH_CATEGORIES.flatMap((category) =>
      severities[category].map((risk_severity, index) =>
        finding(risk_severity, `${category}-${index}`, { category }),
      ),
    );
    expect(findings).toHaveLength(18);

    const capped = applyCaps(findings);

    expect(capped).toHaveLength(MAX_PER_RUN);
    expect(capped.map((found) => found.risk_severity)).toEqual([
      "Catastrophic",
      "Catastrophic",
      "Major",
      "Major",
      "Major",
      "Major",
      "Moderate",
      "Moderate",
    ]);
    // The seven least severe findings are the ones that were cut, and findings of one severity
    // keep the order they were given in.
    expect(labels(capped)).toEqual([
      "security_incidents-0",
      "certifications-0",
      "security_incidents-1",
      "legal_regulatory-0",
      "ai_specific-0",
      "availability-0",
      "certifications-1",
      "legal_regulatory-1",
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
