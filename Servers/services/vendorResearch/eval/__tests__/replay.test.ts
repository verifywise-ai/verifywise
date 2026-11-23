import { z } from "zod";
import { PageReadError } from "../../../webResearch/readPage";
import { type LoopStep, createLoopStepSchema } from "../../../webResearch/researchLoop";
import type { ResearchCategory } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { SearchResult } from "../../../webResearch/webSearch";
import { hintsSchema } from "../../hints";
import { verifierSchema } from "../../verifier";
import { buildLoopTaskPrompt } from "../../prompts";
import { type CredibilityOutput, credibilityOutputSchema } from "../../schema";
import {
  approximateTokens,
  createReplayEngine,
  createReplayPageReader,
  createScriptedGenerate,
} from "../replay";
import type { Recording } from "../types";

const RESULT = (url: string): SearchResult => ({
  title: "A title",
  url,
  snippet: "A snippet",
  publishedAt: null,
  source: null,
});

describe("createReplayEngine", () => {
  const engine = createReplayEngine([
    { kind: "news", query: "Acme data breach", results: [RESULT("https://news.example.com/a")] },
    { kind: "web", query: "Acme data breach", results: [RESULT("https://web.example.com/b")] },
  ]);

  it("answers a search with what was recorded for its kind and words", async () => {
    expect(await engine.search("Acme data breach", "news")).toEqual([
      RESULT("https://news.example.com/a"),
    ]);
    expect(await engine.search("Acme data breach", "web")).toEqual([
      RESULT("https://web.example.com/b"),
    ]);
  });

  it("finds a query whatever its case and spacing", async () => {
    expect(await engine.search("  ACME   data  breach ", "news")).toHaveLength(1);
  });

  it("fails loudly for a search nobody recorded: the case and its steps disagree", async () => {
    await expect(engine.search("Acme lawsuit", "news")).rejects.toThrow(/no recorded search/i);
  });

  it("remembers which feed returned each address", async () => {
    await engine.search("Acme data breach", "news");
    await engine.search("Acme data breach", "web");

    expect(engine.feedOf("https://news.example.com/a")).toBe("news");
    expect(engine.feedOf("https://web.example.com/b")).toBe("web");
    expect(engine.feedOf("https://nowhere.example.com/")).toBeUndefined();
  });

  it("gives a copy, so that a run cannot change the recording", async () => {
    const [first] = await engine.search("Acme data breach", "news");
    first.title = "changed";

    expect((await engine.search("Acme data breach", "news"))[0].title).toBe("A title");
  });
});

describe("createReplayPageReader", () => {
  const page = {
    url: "https://acme.com/security",
    title: "Security",
    publishedAt: null,
    text: "We are SOC 2 Type II audited.",
    links: [],
  };
  const read = createReplayPageReader([
    { url: "https://acme.com/security", page },
    { url: "https://acme.com/private", failure: "blocked_by_site" },
  ]);

  it("answers a read with the page that was recorded", async () => {
    expect(await read("https://acme.com/security")).toEqual(page);
  });

  it("fails a read with the reason that was recorded", async () => {
    await expect(read("https://acme.com/private")).rejects.toMatchObject({
      name: "PageReadError",
      reason: "blocked_by_site",
    });
  });

  it("answers a page nobody recorded as not found, as the web would", async () => {
    const error = await read("https://acme.com/other").catch((caught) => caught);

    expect(error).toBeInstanceOf(PageReadError);
    expect(error.reason).toBe("not_found");
  });
});

describe("createScriptedGenerate", () => {
  const recording: Recording = {
    steps: [
      {
        thought: "Search",
        actions: [
          { action: "search", category: "security_incidents", query: "Acme breach", kind: "news" },
        ],
      },
      { thought: "Done", actions: [{ action: "finish" }] },
    ],
    searches: [],
    pages: [],
    analysis: { findings: [], category_notes: [] },
  };
  const loopSchema = createLoopStepSchema(["security_incidents", "certifications"] as const);

  it("answers the loop with the recorded steps in order, then finishes", async () => {
    const generate = createScriptedGenerate(recording);
    const ask = () =>
      generate({ model: {}, schema: loopSchema, system: "s", prompt: "p" } as never);

    expect((await ask()).object).toMatchObject({
      actions: [{ action: "search", query: "Acme breach" }],
    });
    expect((await ask()).object).toMatchObject({ actions: [{ action: "finish" }] });
    expect((await ask()).object).toMatchObject({ actions: [{ action: "finish" }] });
  });

  it("answers the analysis with the recorded answer, whatever came before", async () => {
    const generate = createScriptedGenerate({
      ...recording,
      analysis: {
        findings: [],
        category_notes: [{ category: "security_incidents", note: "Nothing." }],
      },
    });

    const answer = await generate({
      model: {},
      schema: credibilityOutputSchema,
      system: "s",
      prompt: "p",
    } as never);

    expect((answer.object as CredibilityOutput).category_notes).toEqual([
      { category: "security_incidents", note: "Nothing." },
    ]);
  });

  it("answers the credibility schema with the recorded analysis, without its confidence", async () => {
    const recorded = {
      category: "security_incidents" as const,
      risk_description: "Attackers copied customer records.",
      impact_description: "Our data may be exposed.",
      likelihood: "Possible" as const,
      risk_severity: "Major" as const,
      action_plan: "Ask for the incident report.",
      confidence: "high" as const,
      rationale: "The vendor confirmed it.",
      evidence: [{ source_id: "S1", quote: "attackers copied customer records" }],
    };
    const generate = createScriptedGenerate({
      ...recording,
      analysis: { findings: [recorded], category_notes: [] },
    });

    const answer = await generate({
      model: {},
      schema: credibilityOutputSchema,
      system: "s",
      prompt: "p",
    } as never);

    const { confidence: _confidence, ...withoutConfidence } = recorded;
    expect((answer.object as CredibilityOutput).findings).toEqual([withoutConfidence]);
  });

  it("answers the call for hints with the recorded hints, and with none when there are none, without using up a step", async () => {
    const withHints = createScriptedGenerate({
      ...recording,
      hints: { queries: [{ category: "security_incidents", query: "Acme ransomware" }] },
    });
    const without = createScriptedGenerate(recording);
    const askHints = (generate: typeof withHints) =>
      generate({ model: {}, schema: hintsSchema, system: "s", prompt: "p" } as never);
    const askStep = (generate: typeof withHints) =>
      generate({ model: {}, schema: loopSchema, system: "s", prompt: "p" } as never);

    expect((await askHints(withHints)).object).toEqual({
      queries: [{ category: "security_incidents", query: "Acme ransomware" }],
    });
    expect((await askHints(without)).object).toEqual({ queries: [] });
    // The first step of the loop is still the first recorded step.
    expect((await askStep(withHints)).object).toMatchObject({
      actions: [{ action: "search", query: "Acme breach" }],
    });
  });

  it("answers the call of the verifier with the recorded verdicts, and with none when there are none, without using up a step", async () => {
    const verdicts = [
      { finding: 1, same_company: false, quote_supports_claim: true, source_in_window: true },
    ];
    const withVerdicts = createScriptedGenerate({ ...recording, verifier: { verdicts } });
    const without = createScriptedGenerate(recording);
    const askVerifier = (generate: typeof withVerdicts) =>
      generate({ model: {}, schema: verifierSchema, system: "s", prompt: "p" } as never);
    const askStep = (generate: typeof withVerdicts) =>
      generate({ model: {}, schema: loopSchema, system: "s", prompt: "p" } as never);

    expect((await askVerifier(withVerdicts)).object).toEqual({ verdicts });
    // Nobody fails: a finding without a verdict is passed.
    expect((await askVerifier(without)).object).toEqual({ verdicts: [] });
    expect((await askStep(withVerdicts)).object).toMatchObject({
      actions: [{ action: "search", query: "Acme breach" }],
    });
  });

  it("holds a recorded step to the schema of the loop, as the real call does", async () => {
    const generate = createScriptedGenerate({
      ...recording,
      steps: [{ thought: "x", actions: [{ action: "search", category: "ai_specific" }] } as never],
    });
    const strict = z.object({ action: z.enum(["finish"]) });

    await expect(
      generate({ model: {}, schema: strict, system: "s", prompt: "p" } as never),
    ).rejects.toThrow();
  });

  describe("for a run with one loop for each category", () => {
    const NOW = new Date("2031-04-20T12:00:00Z");
    const target = { name: "Acme", domain: "acme.com", provides: "Cloud hosting" };
    const promptOf = (category: ResearchCategory) =>
      buildLoopTaskPrompt({ target, now: NOW, researchable: [category], scope: category });
    const readOf = (category: ResearchCategory, url: string): LoopStep<ResearchCategory> => ({
      thought: `Read ${url}`,
      actions: [{ action: "read", category, url }],
    });
    const finish: LoopStep<ResearchCategory> = { thought: "Done", actions: [{ action: "finish" }] };
    const allLoops = createLoopStepSchema([
      "security_incidents",
      "certifications",
      "legal_regulatory",
      "ai_specific",
    ] as const);
    const scoped: Recording = {
      steps: [{ thought: "All the categories", actions: [{ action: "finish" }] }],
      loops: {
        security_incidents: [readOf("security_incidents", "https://news.example/a"), finish],
        certifications: [readOf("certifications", "https://acme.com/trust")],
      },
      searches: [],
      pages: [],
      analysis: { findings: [], category_notes: [] },
    };
    const ask = (
      generate: ReturnType<typeof createScriptedGenerate>,
      category: ResearchCategory | null,
    ) =>
      generate({
        model: {},
        schema: allLoops,
        system: "s",
        prompt: category === null ? "p" : promptOf(category),
      } as never);

    it("answers each loop with the steps recorded for its category, in order, and then finishes", async () => {
      const generate = createScriptedGenerate(scoped);

      expect((await ask(generate, "security_incidents")).object).toMatchObject({
        actions: [{ action: "read", url: "https://news.example/a" }],
      });
      expect((await ask(generate, "security_incidents")).object).toMatchObject({
        actions: [{ action: "finish" }],
      });
      expect((await ask(generate, "security_incidents")).object).toMatchObject({
        actions: [{ action: "finish" }],
      });
    });

    it("keeps the steps of one loop apart from those of another, whatever the order of the calls", async () => {
      const generate = createScriptedGenerate(scoped);

      expect((await ask(generate, "certifications")).object).toMatchObject({
        actions: [{ action: "read", url: "https://acme.com/trust" }],
      });
      expect((await ask(generate, "security_incidents")).object).toMatchObject({
        actions: [{ action: "read", url: "https://news.example/a" }],
      });
      expect((await ask(generate, "certifications")).object).toMatchObject({
        actions: [{ action: "finish" }],
      });
    });

    it("finishes a loop whose category has no steps recorded", async () => {
      const generate = createScriptedGenerate(scoped);

      expect((await ask(generate, "legal_regulatory")).object).toMatchObject({
        actions: [{ action: "finish" }],
      });
    });

    it("never gives a loop of one category the steps of the loop of all of them", async () => {
      const generate = createScriptedGenerate({
        ...scoped,
        steps: [readOf("ai_specific", "https://acme.com/dpa")],
        loops: {},
      });

      expect((await ask(generate, "ai_specific")).object).toMatchObject({
        actions: [{ action: "finish" }],
      });
      expect((await ask(generate, null)).object).toMatchObject({
        actions: [{ action: "read", url: "https://acme.com/dpa" }],
      });
    });

    it("answers a loop of all the categories from the steps, whatever the loops hold", async () => {
      const generate = createScriptedGenerate(scoped);

      expect((await ask(generate, null)).object).toMatchObject({ actions: [{ action: "finish" }] });
    });
  });

  it("reports the tokens of every call to onUsage, estimated from the text", async () => {
    const generate = createScriptedGenerate(recording);
    const onUsage = jest.fn();

    const answer = await generate({
      model: {},
      schema: loopSchema,
      system: "x".repeat(400),
      prompt: "y".repeat(400),
      onUsage,
    } as never);

    const expected = {
      inputTokens: 200,
      outputTokens: expect.any(Number),
      totalTokens: expect.any(Number),
    };
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(answer.usage).toEqual(onUsage.mock.calls[0][0]);
    expect(answer.usage?.totalTokens).toBe(
      (answer.usage?.inputTokens ?? 0) + (answer.usage?.outputTokens ?? 0),
    );
  });
});

describe("approximateTokens", () => {
  it("counts a token for every four characters, rounded up", () => {
    expect(approximateTokens("")).toBe(0);
    expect(approximateTokens("abcd")).toBe(1);
    expect(approximateTokens("abcde")).toBe(2);
  });
});
