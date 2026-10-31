import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import {
  HINTS_TIMEOUT_MS,
  HINT_CATEGORIES,
  MAX_HINTS_PER_CATEGORY,
  hintSearchesOf,
  hintsSchema,
  requestHints,
} from "../hints";
import { suggestedQueries } from "../queries";
import { buildTarget } from "../target";

const target = buildTarget({
  vendor_name: "Acme Analytics, Inc.",
  website: "acme.com",
  vendor_provides: "Cloud hosting",
});
const ALL = RESEARCH_CATEGORIES;
const NEWS_ONLY = ["security_incidents", "legal_regulatory"] as const;

describe("hintsSchema", () => {
  it("covers exactly the categories that search the news", () => {
    expect([...HINT_CATEGORIES].sort()).toEqual(Object.keys(suggestedQueries(target, ALL)).sort());
  });

  it("takes a list of queries, each for a category of the news", () => {
    expect(
      hintsSchema.safeParse({
        queries: [{ category: "security_incidents", query: "Acme ransomware" }],
      }).success,
    ).toBe(true);
    expect(hintsSchema.safeParse({ queries: [] }).success).toBe(true);
  });

  it.each([
    ["a category that reads the vendor's site", { category: "certifications", query: "Acme" }],
    ["an empty query", { category: "security_incidents", query: "" }],
    ["a query of 121 characters", { category: "security_incidents", query: "x".repeat(121) }],
  ])("refuses %s", (_label, hint) => {
    expect(hintsSchema.safeParse({ queries: [hint] }).success).toBe(false);
  });

  it("allows six queries and no more, so that a model that writes seven costs a retry, not a search", () => {
    const hint = { category: "legal_regulatory", query: "Acme lawsuit" };

    expect(hintsSchema.safeParse({ queries: Array(6).fill(hint) }).success).toBe(true);
    expect(hintsSchema.safeParse({ queries: Array(7).fill(hint) }).success).toBe(false);
  });
});

describe("hintSearchesOf", () => {
  const hint = (category: (typeof HINT_CATEGORIES)[number], query: string) => ({ category, query });
  const searches = (
    queries: Array<ReturnType<typeof hint>>,
    researchable: readonly ResearchCategory[] = ALL,
  ) => hintSearchesOf(queries, target, researchable);

  it("makes a search of the vendor's name and the topic words of the hint, for its category", () => {
    expect(searches([hint("security_incidents", "Acme Analytics ransomware attack")])).toEqual([
      { category: "security_incidents", query: "Acme Analytics ransomware attack" },
    ]);
  });

  it("makes the query the shape the feed answers best, like a query of the model", () => {
    expect(
      searches([hint("legal_regulatory", 'site:acme.com "GDPR" OR fine https://x.example/y')]),
    ).toEqual([{ category: "legal_regulatory", query: "Acme Analytics GDPR fine" }]);
  });

  it("keeps one hint for each category: the first that is any use", () => {
    expect(MAX_HINTS_PER_CATEGORY).toBe(1);
    expect(
      searches([
        hint("security_incidents", "Acme ransomware"),
        hint("security_incidents", "Acme phishing campaign"),
        hint("legal_regulatory", "Acme class action"),
      ]),
    ).toEqual([
      { category: "security_incidents", query: "Acme Analytics ransomware" },
      { category: "legal_regulatory", query: "Acme Analytics class action" },
    ]);
  });

  it("drops a hint with no topic word, since the name alone is no search of the news", () => {
    expect(
      searches([hint("security_incidents", "Acme Analytics"), hint("security_incidents", "the")]),
    ).toEqual([]);
  });

  it("drops a hint that repeats a query the code makes anyway, and takes the next one", () => {
    expect(
      searches([
        hint("security_incidents", "Acme Analytics data breaches"),
        hint("security_incidents", "Acme zero day exploit"),
      ]),
    ).toEqual([{ category: "security_incidents", query: "Acme Analytics zero day exploit" }]);
  });

  it("drops a hint that repeats a query the code makes to name the authority of the jurisdiction", () => {
    expect(
      searches([
        hint("legal_regulatory", "Acme Analytics FTC"),
        hint("legal_regulatory", "Acme Analytics class action"),
      ]),
    ).toEqual([{ category: "legal_regulatory", query: "Acme Analytics class action" }]);
  });

  it("makes a search of an outage that the model remembers, for the category of availability", () => {
    expect(searches([hint("availability", "Acme Analytics 2024 outage")])).toEqual([
      { category: "availability", query: "Acme Analytics 2024 outage" },
    ]);
  });

  it("makes a search of a financial matter that the model remembers, for the category of financial health", () => {
    expect(searches([hint("financial_health", "Acme Analytics insolvency")])).toEqual([
      { category: "financial_health", query: "Acme Analytics insolvency" },
    ]);
  });

  it("drops a hint for a category that is not researched", () => {
    expect(
      searches(
        [hint("security_incidents", "Acme ransomware"), hint("legal_regulatory", "Acme lawsuit")],
        ["security_incidents", "certifications"],
      ),
    ).toEqual([{ category: "security_incidents", query: "Acme Analytics ransomware" }]);
  });

  it("makes no search from no hint", () => {
    expect(searches([])).toEqual([]);
    expect(hintSearchesOf([], target, NEWS_ONLY)).toEqual([]);
  });

  describe("for a vendor with other names", () => {
    const known = { ...target, aliases: ["AcmeAI Ltd"] };
    const searchesOfKnown = (queries: Array<ReturnType<typeof hint>>) =>
      hintSearchesOf(queries, known, ALL);

    it("keeps the other name that leads a hint, as the press writes it", () => {
      expect(searchesOfKnown([hint("security_incidents", "AcmeAI Ltd ransomware")])).toEqual([
        { category: "security_incidents", query: "AcmeAI ransomware" },
      ]);
    });

    it("drops a hint that is only another name of the vendor, as it drops one that is only the name", () => {
      expect(
        searchesOfKnown([
          hint("security_incidents", "AcmeAI"),
          hint("legal_regulatory", "AcmeAI Ltd"),
        ]),
      ).toEqual([]);
    });

    it("drops a hint that repeats a query the code makes in the language of the vendor's market", () => {
      const german = buildTarget({
        vendor_name: "Brise GmbH",
        website: "brise.de",
        vendor_provides: "Cloud hosting",
      });

      expect(
        hintSearchesOf(
          [
            hint("security_incidents", "Brise Datenlecks"),
            hint("security_incidents", "Brise Ransomware"),
          ],
          german,
          ALL,
        ),
      ).toEqual([{ category: "security_incidents", query: "Brise Ransomware" }]);
    });

    it("drops a hint that repeats the query the code makes for the other name", () => {
      expect(
        searchesOfKnown([
          hint("security_incidents", "AcmeAI data breaches"),
          hint("security_incidents", "AcmeAI zero day exploit"),
        ]),
      ).toEqual([{ category: "security_incidents", query: "AcmeAI zero day exploit" }]);
    });
  });
});

describe("requestHints", () => {
  const answer = (queries: Array<{ category: string; query: string }>) =>
    jest.fn(async () => ({
      object: { queries },
      attempts: 1,
      selfCorrected: false,
      fellBackToJsonObject: false,
    })) as unknown as jest.MockedFunction<typeof generateObjectWithSelfCorrection>;

  const ask = (
    generate: typeof generateObjectWithSelfCorrection,
    input: Partial<Parameters<typeof requestHints>[0]> = {},
  ) => requestHints({ target, researchable: ALL, model: { id: "m" }, ...input }, { generate });

  it("asks the model once, cheaply, and returns the searches its hints make", async () => {
    const generate = answer([
      { category: "security_incidents", query: "Acme ransomware" },
      { category: "legal_regulatory", query: "Acme class action" },
    ]);

    const searches = await ask(generate);

    expect(searches).toEqual([
      { category: "security_incidents", query: "Acme Analytics ransomware" },
      { category: "legal_regulatory", query: "Acme Analytics class action" },
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    const params = generate.mock.calls[0][0];
    expect(params).toMatchObject({
      model: { id: "m" },
      schema: hintsSchema,
      temperature: 0,
      maxSelfCorrectionAttempts: 0,
    });
    expect(params.prompt).toContain("<name>Acme Analytics, Inc.</name>");
    expect(params.system).toMatch(/never evidence/i);
  });

  it("gives the call a time limit of its own, and the caller's signal too", async () => {
    const generate = answer([]);
    const caller = new AbortController();

    await ask(generate, { signal: caller.signal });

    const signal = (generate.mock.calls[0][0].extra as { abortSignal: AbortSignal }).abortSignal;
    expect(HINTS_TIMEOUT_MS).toBe(15_000);
    expect(signal.aborted).toBe(false);
    caller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("asks nothing when no category of the run searches the news", async () => {
    const generate = answer([]);

    const searches = await ask(generate, { researchable: ["certifications", "ai_specific"] });

    expect(searches).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("is no search and no failure when the model fails: the run goes on without hints", async () => {
    const generate = jest.fn(async () => {
      throw new Error("the model is down");
    }) as unknown as typeof generateObjectWithSelfCorrection;

    await expect(ask(generate)).resolves.toEqual([]);
  });

  it("is no search when the answer does not fit the schema", async () => {
    const generate = answer([{ category: "security_incidents", query: "" }]);
    // The real call validates the answer; this one stands for a model that answered a list the
    // validation of the call let through.
    await expect(ask(generate)).resolves.toEqual([]);
  });
});
