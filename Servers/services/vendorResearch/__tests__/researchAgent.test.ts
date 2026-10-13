import { MockLanguageModelV4 } from "ai/test";
import {
  SelfCorrectingParams,
  SelfCorrectingResult,
  generateObjectWithSelfCorrection,
} from "../../../advisor/llmSelfCorrect";
import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import * as guardedFetchModule from "../../webResearch/guardedFetch";
import * as readPageModule from "../../webResearch/readPage";
import { FetchedPage } from "../../webResearch/readPage";
import { LoopStep } from "../../webResearch/researchLoop";
import * as webSearchModule from "../../webResearch/webSearch";
import { SearchKind, SearchResult } from "../../webResearch/webSearch";
import { buildLoopSystemPrompt, buildLoopTaskPrompt } from "../prompts";
import { createVendorResearcher } from "../researchAgent";
import { ResearchTarget } from "../target";

const NOW = new Date("2031-04-20T12:00:00Z");
const MODEL = { modelId: "a test model" };

const WITH_DOMAIN: ResearchTarget = { name: "Acme", domain: "acme.com", provides: "Cloud hosting" };
const WITHOUT_DOMAIN: ResearchTarget = { ...WITH_DOMAIN, domain: null };

/** 30 months before NOW: outside the 24 months of security_incidents, inside the 36 of legal_regulatory. */
const THIRTY_MONTHS_AGO = "2028-10-20T08:00:00.000Z";
/** 23 months before NOW: inside every window. */
const TWENTY_THREE_MONTHS_AGO = "2029-05-20T08:00:00.000Z";

function result(url: string, fields: Partial<SearchResult> = {}): SearchResult {
  return {
    title: `Title of ${url}`,
    url,
    snippet: `Snippet of ${url}`,
    publishedAt: null,
    source: null,
    ...fields,
  };
}

const searchStep = (
  query: string,
  category: ResearchCategory,
  kind: "web" | "news" = "news",
): LoopStep<ResearchCategory> => ({
  thought: `Search for ${query}`,
  action: "search",
  category,
  query,
  kind,
});

const readStep = (url: string, category: ResearchCategory): LoopStep<ResearchCategory> => ({
  thought: `Read ${url}`,
  action: "read",
  category,
  url,
});

const finishStep: LoopStep<ResearchCategory> = { thought: "That is enough.", action: "finish" };

type Answer = LoopStep<ResearchCategory> | { throws: unknown };

interface ModelCall {
  model: unknown;
  system: string;
  prompt: string;
}

/**
 * The model answers in the order of `answers`; with no answer left it throws. `fellBack` says, call
 * by call, whether the result reports a fall back to JSON-object mode; with none left it says no.
 */
function scriptedModel(answers: Answer[], fellBack: boolean[] = []) {
  const queue = [...answers];
  const reports = [...fellBack];
  const calls: ModelCall[] = [];
  const mock = jest.fn(
    async (params: SelfCorrectingParams<unknown>): Promise<SelfCorrectingResult<unknown>> => {
      calls.push({ model: params.model, system: params.system, prompt: params.prompt });
      const answer = queue.shift();
      if (answer === undefined) throw new Error("The script has no answer left.");
      if ("throws" in answer) throw answer.throws;
      return {
        object: answer,
        attempts: 1,
        selfCorrected: false,
        fellBackToJsonObject: reports.shift() ?? false,
      };
    },
  );
  return { generate: mock as unknown as typeof generateObjectWithSelfCorrection, calls, mock };
}

/** A fake engine that answers the searches in turn, and a fake reader that reads any page. */
function fakeWeb(searches: SearchResult[][] = []) {
  const queue = [...searches];
  const search = jest.fn<Promise<SearchResult[]>, [string, SearchKind, AbortSignal?]>(
    async () => queue.shift() ?? [],
  );
  const readPage = jest.fn<Promise<FetchedPage>, [string, AbortSignal?]>(async (url) => ({
    url,
    title: `Page at ${url}`,
    publishedAt: null,
    text: `Text of ${url}`,
    links: [],
  }));
  return { engine: { search }, readPage, search };
}

/** The text of the last `<result>` element of a prompt: what the latest step got. */
function lastResult(prompt: string): string {
  const part = prompt.split("<result>").slice(-1)[0];
  return part.slice(0, part.indexOf("</result>"));
}

/** The task of a prompt: everything before the history. */
const taskOf = (prompt: string) => prompt.slice(0, prompt.indexOf("<history>"));

describe("createVendorResearcher", () => {
  it("offers the loop all four categories for a vendor with a domain", async () => {
    const web = fakeWeb([[result("https://news.example/acme-breach")]]);
    const model = scriptedModel([
      searchStep("Acme data breach", "security_incidents"),
      finishStep,
      finishStep,
    ]);
    const research = createVendorResearcher({ ...web, generate: model.generate });

    const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

    expect(outcome.stoppedBecause).toBe("finished");
    const [first] = model.calls;
    expect(first.model).toBe(MODEL);
    expect(first.system).toBe(buildLoopSystemPrompt());
    expect(taskOf(first.prompt).trimEnd()).toBe(
      buildLoopTaskPrompt({ target: WITH_DOMAIN, now: NOW, researchable: RESEARCH_CATEGORIES }),
    );
    for (const category of RESEARCH_CATEGORIES) {
      expect(taskOf(first.prompt)).toContain(`- ${category}:`);
    }
    // The reminder before the first finish names what the loop was told it can research.
    expect(lastResult(model.calls[2].prompt)).toBe(
      "You have not covered: certifications, legal_regulatory, ai_specific. Continue researching, or finish again to stop.",
    );
  });

  it("offers only the two news categories to a vendor without a domain, and refuses a certifications search", async () => {
    const web = fakeWeb([[result("https://news.example/acme-breach")]]);
    const model = scriptedModel([
      searchStep("Acme SOC 2 certification", "certifications", "web"),
      searchStep("Acme data breach", "security_incidents"),
      finishStep,
      finishStep,
    ]);
    const research = createVendorResearcher({ ...web, generate: model.generate });

    const outcome = await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

    const task = taskOf(model.calls[0].prompt);
    expect(task.trimEnd()).toBe(
      buildLoopTaskPrompt({
        target: WITHOUT_DOMAIN,
        now: NOW,
        researchable: ["security_incidents", "legal_regulatory"],
      }),
    );
    expect(task).toContain("- security_incidents:");
    expect(task).toContain("- legal_regulatory:");
    expect(task).not.toContain("certifications");
    expect(task).not.toContain("ai_specific");
    expect(lastResult(model.calls[1].prompt)).toBe(
      "That category cannot be researched for this vendor.",
    );
    expect(web.search).toHaveBeenCalledTimes(1);
    expect(web.search.mock.calls[0][0]).toBe("Acme data breach");
    expect(lastResult(model.calls[3].prompt)).toBe(
      "You have not covered: legal_regulatory. Continue researching, or finish again to stop.",
    );
    expect(outcome.calls).toEqual([
      { category: "security_incidents", tool: "search", answered: true, failure: null },
    ]);
  });

  it("gives the session the lookback window of each category, counted back from now", async () => {
    const oldBreach = result("https://news.example/old-breach", {
      publishedAt: THIRTY_MONTHS_AGO,
    });
    const recentBreach = result("https://news.example/recent-breach", {
      publishedAt: TWENTY_THREE_MONTHS_AGO,
    });
    const oldLawsuit = result("https://news.example/old-lawsuit", {
      publishedAt: THIRTY_MONTHS_AGO,
    });
    const web = fakeWeb([[oldBreach, recentBreach], [oldLawsuit]]);
    const model = scriptedModel([
      searchStep("Acme data breach", "security_incidents"),
      searchStep("Acme lawsuit", "legal_regulatory"),
      finishStep,
      finishStep,
    ]);
    const research = createVendorResearcher({ ...web, generate: model.generate });

    const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

    expect(outcome.entries.map((entry) => [entry.category, entry.url])).toEqual([
      ["security_incidents", recentBreach.url],
      ["legal_regulatory", oldLawsuit.url],
    ]);
    expect(lastResult(model.calls[1].prompt)).toContain(
      "1 result older than the lookback window was left out.",
    );
  });

  it("returns the ledger, the calls, the counters and how the loop ended", async () => {
    const news = result("https://news.example/acme-breach", {
      title: "Acme data breach",
      publishedAt: TWENTY_THREE_MONTHS_AGO,
    });
    const failure = Object.assign(new Error("The provider failed."), {
      name: "AI_APICallError",
      statusCode: 500,
    });
    const web = fakeWeb([[news]]);
    const model = scriptedModel([
      searchStep("Acme data breach", "security_incidents"),
      readStep(news.url, "security_incidents"),
      { throws: failure },
    ]);
    const research = createVendorResearcher({ ...web, generate: model.generate });

    const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

    expect(outcome).toEqual({
      entries: [
        {
          category: "security_incidents",
          kind: "page",
          onVendorSite: false,
          url: news.url,
          title: "Acme data breach",
          content: `Text of ${news.url}`,
          publishedAt: TWENTY_THREE_MONTHS_AGO,
        },
      ],
      calls: [
        { category: "security_incidents", tool: "search", answered: true, failure: null },
        { category: "security_incidents", tool: "read", answered: true, failure: null },
      ],
      searchesUsed: 1,
      pagesRead: 1,
      stoppedBecause: "model_error",
      modelError: failure,
    });
    expect(outcome.modelError).toBe(failure);
  });

  it("gives every run a session of its own", async () => {
    const news = result("https://news.example/acme-breach");
    const web = fakeWeb([[news]]);
    const model = scriptedModel([
      // The first run.
      searchStep("Acme data breach", "security_incidents"),
      finishStep,
      finishStep,
      // The second run: the URL that the first run's search returned is not one of its own.
      readStep(news.url, "security_incidents"),
      finishStep,
      finishStep,
    ]);
    const research = createVendorResearcher({ ...web, generate: model.generate });

    const first = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });
    const second = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

    expect(first.entries.map((entry) => entry.url)).toEqual([news.url]);
    expect(first.searchesUsed).toBe(1);
    expect(lastResult(model.calls[4].prompt)).toBe(
      "That address was not in any search result and is not on the vendor's website. Search first.",
    );
    expect(second).toEqual({
      entries: [],
      calls: [],
      searchesUsed: 0,
      pagesRead: 0,
      stoppedBecause: "finished",
      modelError: null,
    });
    expect(web.readPage).not.toHaveBeenCalled();
  });

  describe("a model whose provider rejects json_schema", () => {
    /** A model that answers {} and records what it was asked, for the wrapped model to reach. */
    function innerModel() {
      return new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: "text", text: "{}" }],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        }),
      });
    }

    it("passes the model as it is until a result reports the fall back, then the same wrapped model for the rest of the run", async () => {
      const inner = innerModel();
      // The first result reports the fall back; the later ones succeed in JSON-object mode.
      const model = scriptedModel(
        [searchStep("Acme data breach", "security_incidents"), finishStep, finishStep],
        [true, false, false],
      );
      const research = createVendorResearcher({
        ...fakeWeb([[result("https://news.example/a")]]),
        generate: model.generate,
      });

      const outcome = await research({ target: WITH_DOMAIN, model: inner, now: NOW });

      expect(outcome.stoppedBecause).toBe("finished");
      const [first, second, third] = model.calls;
      expect(first.model).toBe(inner);
      expect(second.model).not.toBe(inner);
      // Built once, and still in use after a result that did not report the fall back again.
      expect(third.model).toBe(second.model);
    });

    it("wraps the model with the JSON-object middleware: the schema moves into a system message", async () => {
      const inner = innerModel();
      const model = scriptedModel([finishStep, finishStep], [true, false]);
      const research = createVendorResearcher({ ...fakeWeb(), generate: model.generate });

      await research({ target: WITH_DOMAIN, model: inner, now: NOW });

      const wrapped = model.calls[1].model as MockLanguageModelV4;
      const schema = { type: "object", properties: { thought: { type: "string" } } } as const;
      await wrapped.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "Your next step?" }] }],
        responseFormat: { type: "json", schema },
      });

      const [reached] = inner.doGenerateCalls;
      expect(reached.responseFormat).toEqual({ type: "json" });
      expect(reached.prompt[0]).toEqual({
        role: "system",
        content: expect.stringContaining(JSON.stringify(schema)),
      });
    });

    it("changes nothing else about the calls that follow", async () => {
      const inner = innerModel();
      const model = scriptedModel([finishStep, finishStep], [true, false]);
      const research = createVendorResearcher({ ...fakeWeb(), generate: model.generate });

      await research({ target: WITH_DOMAIN, model: inner, now: NOW });

      const [first, second] = model.mock.mock.calls.map(([params]) => params);
      expect(second).toEqual({ ...first, model: model.calls[1].model, prompt: second.prompt });
      expect(second.prompt).toContain("Budget left: 8 searches, 12 page reads, 23 steps.");
      expect(second.extra?.abortSignal).toBeInstanceOf(AbortSignal);
      expect(second.extra?.abortSignal).not.toBe(first.extra?.abortSignal);
    });

    it("keeps passing the model as it is when the first result reports no fall back", async () => {
      const inner = innerModel();
      const model = scriptedModel([finishStep, finishStep], [false, false]);
      const research = createVendorResearcher({ ...fakeWeb(), generate: model.generate });

      await research({ target: WITH_DOMAIN, model: inner, now: NOW });

      expect(model.calls.map((call) => call.model)).toEqual([inner, inner]);
    });

    it("gives every run a flag of its own", async () => {
      const inner = innerModel();
      const model = scriptedModel(
        // The first run falls back on its first call; the second run is a new run.
        [finishStep, finishStep, finishStep, finishStep],
        [true, false, false, false],
      );
      const research = createVendorResearcher({ ...fakeWeb(), generate: model.generate });

      await research({ target: WITH_DOMAIN, model: inner, now: NOW });
      await research({ target: WITH_DOMAIN, model: inner, now: NOW });

      const [firstRunFirst, firstRunSecond, secondRunFirst, secondRunSecond] = model.calls;
      expect(firstRunFirst.model).toBe(inner);
      expect(firstRunSecond.model).not.toBe(inner);
      expect(secondRunFirst.model).toBe(inner);
      expect(secondRunSecond.model).toBe(inner);
    });
  });

  describe("with no engine and no page reader given", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    /** guardedFetch is how every request leaves; here it fails the test's expectations if used. */
    function spyOnTheWeb() {
      return {
        fetch: jest
          .spyOn(guardedFetchModule, "guardedFetch")
          .mockRejectedValue(new Error("A unit test makes no request.")),
        createBingEngine: jest.spyOn(webSearchModule, "createBingEngine"),
        createPageReader: jest.spyOn(readPageModule, "createPageReader"),
      };
    }

    it("builds the Bing engine and a new page reader for every run, and makes no request", async () => {
      const spies = spyOnTheWeb();
      const model = scriptedModel([finishStep, finishStep, finishStep, finishStep]);
      const research = createVendorResearcher({ generate: model.generate });

      const first = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });
      const second = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(first.stoppedBecause).toBe("finished");
      expect(second.stoppedBecause).toBe("finished");
      // An engine and a reader per run: every run has a robots.txt cache of its own, and the engines
      // share the search queue of the process.
      expect(spies.createBingEngine).toHaveBeenCalledTimes(2);
      expect(spies.createBingEngine).toHaveBeenCalledWith();
      expect(spies.createPageReader).toHaveBeenCalledTimes(2);
      expect(spies.fetch).not.toHaveBeenCalled();
    });

    it("asks the model through the self-correcting structured call when no generate is given", async () => {
      const spies = spyOnTheWeb();
      const model = new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: "text", text: '{"thought":"Nothing to do.","action":"finish"}' }],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 20, text: 20, reasoning: undefined },
          },
          warnings: [],
        }),
      });
      const research = createVendorResearcher();

      const outcome = await research({ target: WITH_DOMAIN, model, now: NOW });

      expect(outcome).toEqual({
        entries: [],
        calls: [],
        searchesUsed: 0,
        pagesRead: 0,
        stoppedBecause: "finished",
        modelError: null,
      });
      // The first finish is answered with a reminder, the second one ends the loop.
      expect(model.doGenerateCalls).toHaveLength(2);
      expect(spies.createBingEngine).toHaveBeenCalled();
      expect(spies.createPageReader).toHaveBeenCalled();
      expect(spies.fetch).not.toHaveBeenCalled();
    });
  });
});
