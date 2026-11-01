import { MockLanguageModelV4 } from "ai/test";
import {
  SelfCorrectingParams,
  SelfCorrectingResult,
  generateObjectWithSelfCorrection,
} from "../../../advisor/llmSelfCorrect";
import {
  type CoverageOutcome,
  type CoverageSource,
  RESEARCH_CATEGORIES,
  ResearchCategory,
  type VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import * as gdeltSearchModule from "../../webResearch/gdeltSearch";
import * as guardedFetchModule from "../../webResearch/guardedFetch";
import * as providerSearchModule from "../../webResearch/providerSearch";
import { SearchUnavailableError } from "../../webResearch/providerSearch";
import * as readPageModule from "../../webResearch/readPage";
import { FetchedPage, PageReadError } from "../../webResearch/readPage";
import { LoopAction, LoopStep } from "../../webResearch/researchLoop";
import {
  SearchEngineError,
  type SearchEngine,
  SearchKind,
  SearchResult,
} from "../../webResearch/webSearch";
import type { WebCache } from "../../webResearch/webCache";
import { memoryCache, settle } from "../../webResearch/__tests__/helpers/memoryCache";
import type { Hints } from "../hints";
import { regulatorTopicsOf } from "../market";
import {
  buildHintsSystemPrompt,
  buildLoopSystemPrompt,
  buildLoopTaskPrompt,
  loopScopeOf,
} from "../prompts";
import type { ResearchMetrics } from "../metrics";
import { NEWS_TOPIC_WORDS } from "../queries";
import { type RecordsOutcome, sourcesBesideVrdb } from "../records";
import { EVAL_CASES } from "../eval/cases";
import { runEvalCase } from "../eval/runCase";
import { createVendorResearcher } from "../researchAgent";
import type { SearchSpec } from "../searchEngineOf";
import { ResearchTarget } from "../target";
import { createTraceRecorder } from "../trace";
import { vrdbSourceOf } from "../vrdb/sources";
import type { VrdbOutcome } from "../vrdb/types";

const NOW = new Date("2031-04-20T12:00:00Z");
const MODEL = { modelId: "a test model" };

const WITH_DOMAIN: ResearchTarget = { name: "Acme", domain: "acme.com", provides: "Cloud hosting" };
const WITHOUT_DOMAIN: ResearchTarget = { ...WITH_DOMAIN, domain: null };

/** 30 months before NOW: outside the 24 months of security_incidents, inside the 36 of legal_regulatory. */
const THIRTY_MONTHS_AGO = "2028-10-20T08:00:00.000Z";
/** 23 months before NOW: inside every window. */
const TWENTY_THREE_MONTHS_AGO = "2029-05-20T08:00:00.000Z";

/** A result that names the vendor in its title: one that does not is left out of the evidence. */
function result(url: string, fields: Partial<SearchResult> = {}): SearchResult {
  return {
    title: `Acme: title of ${url}`,
    url,
    snippet: `Snippet of ${url}`,
    publishedAt: null,
    source: null,
    ...fields,
  };
}

/** A step of the given actions, in one model turn. */
const stepOf = (
  thought: string,
  ...actions: LoopAction<ResearchCategory>[]
): LoopStep<ResearchCategory> => ({
  thought,
  actions,
});

const searchStep = (
  query: string,
  category: ResearchCategory,
  kind: "web" | "news" = "news",
): LoopStep<ResearchCategory> =>
  stepOf(`Search for ${query}`, { action: "search", category, query, kind });

const readStep = (url: string, category: ResearchCategory): LoopStep<ResearchCategory> =>
  stepOf(`Read ${url}`, { action: "read", category, url });

const finishStep: LoopStep<ResearchCategory> = stepOf("That is enough.", { action: "finish" });

/** The answer of the call for hints when the model remembers nothing about the vendor. */
const NO_HINTS: Hints = { queries: [] };

/** An error like the one the SDK throws for an answer that holds no object of the schema. */
const unparseable = () =>
  Object.assign(new Error("No object generated."), { name: "AI_NoObjectGeneratedError" });

/**
 * A step to answer, an error to throw, or a call that falls back to JSON-object mode (it calls the
 * hook of the call, as the self-correcting call does) and then throws.
 */
type Answer =
  LoopStep<ResearchCategory> | Hints | { throws: unknown } | { fallsBackThenThrows: unknown };

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
      if ("fallsBackThenThrows" in answer) {
        params.onJsonObjectFallback?.();
        throw answer.fallsBackThenThrows;
      }
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

/** What every engine declares about itself: the fakes of these tests answer both kinds, with no window for the news. */
const ENGINE_FIELDS = { id: "replay", kinds: ["web", "news"], newsWindowMonths: null } as const;

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
  return { engine: { ...ENGINE_FIELDS, search }, readPage, search };
}

/** The text of the last `<result>` element of a prompt: what the latest step got. */
function lastResult(prompt: string): string {
  const part = prompt.split("<result>").slice(-1)[0];
  return part.slice(0, part.indexOf("</result>"));
}

/** The task of a prompt: everything before the briefing and the history. */
const taskOf = (prompt: string) =>
  prompt.slice(0, prompt.indexOf(prompt.includes("<briefing>") ? "<briefing>" : "<history>"));

/** The briefing of a prompt, from its opening tag. */
const briefingOf = (prompt: string) =>
  prompt.slice(prompt.indexOf("<briefing>"), prompt.indexOf("</briefing>"));

/** A web whose pages name the vendor, so that the site is read. */
function namedWeb(searches: SearchResult[][] = []) {
  const web = fakeWeb(searches);
  web.readPage.mockImplementation(async (url) => ({
    url,
    title: `Acme page at ${url}`,
    publishedAt: null,
    text: `Acme text of ${url}`,
    links: [],
  }));
  return web;
}

/**
 * A model for loops that run at once, which cannot answer in a fixed order: each call is answered
 * from the steps of the category its task names (see loopScopeOf), the call for hints with `hints`,
 * and a category with no step left finishes. It takes a little time to answer, so that the calls of
 * loops that run at the same time overlap, and counts how many were under way together.
 */
function categoryModel(
  steps: Partial<
    Record<ResearchCategory, Array<LoopStep<ResearchCategory> | { throws: unknown }>>
  > = {},
  hints: Hints = NO_HINTS,
) {
  const queues = new Map(Object.entries(steps).map(([category, list]) => [category, [...list]]));
  const calls: Array<ModelCall & { scope: ResearchCategory | null }> = [];
  const state = { inFlight: 0, mostInFlight: 0 };
  const mock = jest.fn(
    async (params: SelfCorrectingParams<unknown>): Promise<SelfCorrectingResult<unknown>> => {
      const scope = loopScopeOf(params.prompt);
      calls.push({ model: params.model, system: params.system, prompt: params.prompt, scope });
      state.inFlight += 1;
      state.mostInFlight = Math.max(state.mostInFlight, state.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      state.inFlight -= 1;
      const answer =
        params.system === buildHintsSystemPrompt()
          ? hints
          : ((scope === null ? undefined : queues.get(scope)?.shift()) ?? finishStep);
      if ("throws" in answer) throw answer.throws;
      return { object: answer, attempts: 1, selfCorrected: false, fellBackToJsonObject: false };
    },
  );
  return {
    generate: mock as unknown as typeof generateObjectWithSelfCorrection,
    calls,
    mock,
    state,
    /** The calls of the loops, not the call for hints. */
    loopCalls: () => calls.filter((call) => call.scope !== null),
    /** The calls of the loop of one category. */
    callsOf: (category: ResearchCategory) => calls.filter((call) => call.scope === category),
  };
}

describe("createVendorResearcher", () => {
  it("offers the loop all six categories for a vendor with a domain", async () => {
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
      "You have not covered: certifications, legal_regulatory, ai_specific, availability, financial_health. Continue researching, or finish again to stop.",
    );
  });

  it("offers only the four news categories to a vendor without a domain, and refuses a certifications search", async () => {
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
        researchable: [
          "security_incidents",
          "legal_regulatory",
          "availability",
          "financial_health",
        ],
      }),
    );
    expect(task).toContain("- security_incidents:");
    expect(task).toContain("- legal_regulatory:");
    expect(task).toContain("- availability:");
    expect(task).toContain("- financial_health:");
    expect(task).not.toContain("certifications");
    expect(task).not.toContain("ai_specific");
    expect(lastResult(model.calls[1].prompt)).toBe(
      "That category cannot be researched for this vendor.",
    );
    expect(web.search).toHaveBeenCalledTimes(1);
    expect(web.search.mock.calls[0][0]).toBe("Acme data breach");
    expect(lastResult(model.calls[3].prompt)).toBe(
      "You have not covered: legal_regulatory, availability, financial_health. Continue researching, or finish again to stop.",
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
      siteNames: [],
      policyPages: [],
      stoppedBecause: "model_error",
      modelError: failure,
      jsonObjectFallback: false,
      readPage: web.readPage,
      // The engine the run was given answered its search.
      searchEngine: "replay",
    });
    expect(outcome.modelError).toBe(failure);
  });

  it("hands on the page reader it researched with, so that the analysis reads pages the same way", async () => {
    const web = fakeWeb();
    const model = scriptedModel([finishStep, finishStep]);
    const research = createVendorResearcher({ ...web, generate: model.generate });

    const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

    expect(outcome.readPage).toBe(web.readPage);
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
      siteNames: [],
      policyPages: [],
      stoppedBecause: "finished",
      modelError: null,
      jsonObjectFallback: false,
      readPage: web.readPage,
      // This run searched nothing, however many searches the first one made.
      searchEngine: null,
    });
    // The only reads are the check of each run, which is outside the session.
    expect(web.readPage.mock.calls.map(([url]) => url)).toEqual([
      "https://acme.com/",
      "https://acme.com/",
    ]);
  });

  describe("the check of the vendor's website before the loop", () => {
    const HOME = "https://acme.com/";

    /** A reader that answers `answers` by address (a page, or the reason to fail with) and reads any other page. */
    function webWith(answers: Record<string, Partial<FetchedPage> | PageReadError["reason"]>) {
      const web = fakeWeb();
      web.readPage.mockImplementation(async (url) => {
        const answer = answers[url];
        if (typeof answer === "string") throw new PageReadError(answer);
        return {
          url,
          title: `Acme page at ${url}`,
          publishedAt: null,
          text: `Acme text of ${url}`,
          links: [],
          ...answer,
        };
      });
      return web;
    }

    const briefingOf = (prompt: string) =>
      prompt.slice(prompt.indexOf("<briefing>"), prompt.indexOf("</briefing>"));

    it("reads the home page once before the first model turn, with a signal of its own", async () => {
      const order: string[] = [];
      const web = webWith({});
      web.readPage.mockImplementation(async (url) => {
        order.push(`read ${url}`);
        return { url, title: "Acme", publishedAt: null, text: "Acme", links: [] };
      });
      const model = scriptedModel([finishStep, finishStep]);
      const generate = jest.fn(async (params: SelfCorrectingParams<unknown>) => {
        order.push("model");
        return model.generate(params as never) as never;
      }) as unknown as typeof generateObjectWithSelfCorrection;
      const research = createVendorResearcher({ ...web, generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(order[0]).toBe(`read ${HOME}`);
      expect(order.indexOf("model")).toBe(1);
      expect(web.readPage).toHaveBeenCalledWith(HOME, expect.any(AbortSignal));
      expect(web.readPage).toHaveBeenCalledTimes(1);
    });

    it("tells the model what it found, in a briefing with the links of the home page", async () => {
      const web = webWith({
        [HOME]: {
          title: "Acme Cloud",
          text: "Acme Cloud hosting for teams.",
          links: [
            { text: "Security", url: "https://acme.com/security" },
            { text: "Pricing", url: "https://acme.com/pricing" },
          ],
        },
      });
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      const briefing = briefingOf(model.calls[0].prompt);
      expect(briefing).toContain("home page");
      expect(briefing).toMatch(/names the vendor/);
      expect(briefing).toContain("- Security - https://acme.com/security");
      expect(briefing).not.toContain("Pricing");
      expect(model.calls[0].system).toContain("<briefing>");
    });

    it("uses none of the budget and leaves nothing in the ledger or the calls", async () => {
      const web = webWith({});
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(model.calls[0].prompt).toContain("Budget left: 8 searches, 12 page reads, 24 steps.");
      expect(outcome.entries).toEqual([]);
      expect(outcome.calls).toEqual([]);
      expect(outcome.pagesRead).toBe(0);
    });

    it("checks nothing for a vendor without a domain, and gives the model no briefing", async () => {
      const web = fakeWeb();
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(web.readPage).not.toHaveBeenCalled();
      expect(model.calls[0].prompt).not.toContain("<briefing>");
    });

    describe("a site that does not answer", () => {
      const down = { [HOME]: "unreachable", "https://www.acme.com/": "unreachable" } as const;

      it("tells the model that the site is closed, and refuses its pages without calling the reader", async () => {
        const web = webWith(down);
        const model = scriptedModel([
          readStep("https://acme.com/security", "certifications"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(briefingOf(model.calls[0].prompt)).toMatch(/closed for this run/);
        expect(lastResult(model.calls[1].prompt)).toMatch(
          /could not be read when the research started/,
        );
        expect(web.readPage.mock.calls.map(([url]) => url)).toEqual([
          HOME,
          "https://www.acme.com/",
        ]);
        expect(outcome.pagesRead).toBe(0);
        expect(outcome.entries).toEqual([]);
      });

      it("records the two categories of the website as pages that could not be read, so the summary says so", async () => {
        const web = webWith(down);
        const model = scriptedModel([finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(outcome.calls).toEqual([
          { category: "certifications", tool: "read", answered: false, failure: "unreachable" },
          { category: "ai_specific", tool: "read", answered: false, failure: "unreachable" },
        ]);
      });

      it("leaves a category the model worked on as the model left it", async () => {
        const web = webWith(down);
        web.search.mockResolvedValueOnce([result("https://news.example/acme-soc2")]);
        const model = scriptedModel([
          searchStep("Acme SOC 2", "certifications", "web"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(outcome.calls).toEqual([
          { category: "certifications", tool: "search", answered: true, failure: null },
          { category: "ai_specific", tool: "read", answered: false, failure: "unreachable" },
        ]);
      });

      it("records a site that the address policy refuses as unreachable", async () => {
        const web = webWith({ [HOME]: "not_allowed" });
        const model = scriptedModel([finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(outcome.calls.map((call) => call.failure)).toEqual(["unreachable", "unreachable"]);
      });

      it("does not close the subdomains of the site", async () => {
        const web = webWith(down);
        const model = scriptedModel([
          readStep("https://trust.acme.com/", "certifications"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(web.readPage).toHaveBeenCalledWith("https://trust.acme.com/", expect.anything());
        expect(outcome.pagesRead).toBe(1);
        expect(outcome.calls).toEqual([
          { category: "certifications", tool: "read", answered: true, failure: null },
          { category: "ai_specific", tool: "read", answered: false, failure: "unreachable" },
        ]);
      });
    });

    describe("a site that answers but whose home page is no use", () => {
      it("does not close it: its other pages can be read, and no category is marked unread", async () => {
        const web = webWith({ [HOME]: "not_found" });
        const model = scriptedModel([
          readStep("https://acme.com/security", "certifications"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(briefingOf(model.calls[0].prompt)).toMatch(/was not found/);
        expect(outcome.pagesRead).toBe(1);
        expect(outcome.calls).toEqual([
          { category: "certifications", tool: "read", answered: true, failure: null },
        ]);
      });
    });

    describe("a site that moved to another domain", () => {
      const MOVED = { [HOME]: { url: "https://www.acme-cloud.com/", title: "Acme Cloud" } };

      it("takes the new domain for the vendor's website: its pages are read without a search and are the vendor's own", async () => {
        const web = webWith(MOVED);
        const model = scriptedModel([
          readStep("https://acme-cloud.com/security", "certifications"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(briefingOf(model.calls[0].prompt)).toMatch(
          /acme-cloud\.com counts as the vendor's website too/,
        );
        expect(web.readPage).toHaveBeenCalledWith(
          "https://acme-cloud.com/security",
          expect.anything(),
        );
        expect(outcome.entries).toMatchObject([
          { url: "https://acme-cloud.com/security", kind: "page", onVendorSite: true },
        ]);
      });

      it("takes it for the vendor's own when a search returns its page too, without asking whether it is about the vendor", async () => {
        const web = webWith(MOVED);
        web.search.mockResolvedValueOnce([
          result("https://acme-cloud.com/about", {
            title: "About us",
            snippet: "We build things.",
          }),
        ]);
        const model = scriptedModel([
          searchStep("Acme certifications", "certifications", "web"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(outcome.entries).toMatchObject([
          { url: "https://acme-cloud.com/about", kind: "result", onVendorSite: true },
        ]);
      });

      it("does not for a domain of another brand: its pages are still only read when a search returned them", async () => {
        const web = webWith({ [HOME]: { url: "https://www.facebook.com/acme", title: "Acme" } });
        const model = scriptedModel([
          readStep("https://www.facebook.com/acme/about", "certifications"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(lastResult(model.calls[1].prompt)).toMatch(/not in any search result/);
        expect(outcome.entries).toEqual([]);
        expect(web.readPage.mock.calls.map(([url]) => url)).toEqual([HOME]);
      });

      it("says so in the trace", async () => {
        const web = webWith(MOVED);
        const model = scriptedModel([finishStep, finishStep]);
        const trace = createTraceRecorder();
        const research = createVendorResearcher({ ...web, generate: model.generate });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

        expect(trace.snapshot().steps[0]).toMatchObject({
          tool: "preflight",
          url: "https://www.acme-cloud.com/",
          outcome: "ok",
          reason: "redirected_to_alias",
        });
      });
    });

    describe("the other names of the vendor", () => {
      const identity = { names: ["AcmeAI"], products: ["Acme Vault"] };
      const GIVES_NAMES = { [HOME]: { identity } };
      const taskOfCall = (prompt: string) => taskOf(prompt);
      /** A result that names the vendor only by the name its home page gave. */
      const underOtherName = result("https://news.example/acmeai-breach", {
        title: "AcmeAI hit by breach",
        snippet: "AcmeAI confirmed an attack on its systems.",
      });

      it("takes the names the home page gives the vendor for names of it: a result that uses only one of them is kept", async () => {
        const web = webWith(GIVES_NAMES);
        web.search.mockResolvedValueOnce([underOtherName]);
        const model = scriptedModel([
          searchStep("AcmeAI breach", "security_incidents"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(outcome.entries.map((entry) => entry.url)).toEqual([underOtherName.url]);
      });

      it("keeps out the same result when the home page gave no such name", async () => {
        const web = webWith({});
        web.search.mockResolvedValueOnce([underOtherName]);
        const model = scriptedModel([
          searchStep("AcmeAI breach", "security_incidents"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(outcome.entries).toEqual([]);
      });

      it("keeps the names a person gave, from the start and before the ones of the site", async () => {
        const web = webWith(GIVES_NAMES);
        const model = scriptedModel([finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        await research({
          target: { ...WITH_DOMAIN, aliases: ["Initech"] },
          model: MODEL,
          now: NOW,
        });

        expect(taskOfCall(model.calls[0].prompt)).toContain(
          "<also_known_as>Initech, AcmeAI</also_known_as>",
        );
      });

      it("keeps a result that uses only a name a person gave, whatever the home page says", async () => {
        const web = webWith({});
        web.search.mockResolvedValueOnce([
          result("https://news.example/initech", {
            title: "Initech hit by breach",
            snippet: "Initech confirmed an attack.",
          }),
        ]);
        const model = scriptedModel([
          searchStep("Initech breach", "security_incidents"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({
          target: { ...WITH_DOMAIN, aliases: ["Initech"] },
          model: MODEL,
          now: NOW,
        });

        expect(outcome.entries.map((entry) => entry.url)).toEqual(["https://news.example/initech"]);
      });

      it("tells the model the names and the products in the task and in the briefing", async () => {
        const web = webWith(GIVES_NAMES);
        const model = scriptedModel([finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(taskOfCall(model.calls[0].prompt)).toContain(
          "<also_known_as>AcmeAI</also_known_as>",
        );
        const briefing = briefingOf(model.calls[0].prompt);
        expect(briefing).toContain("The site gives these names for itself: AcmeAI.");
        expect(briefing).toContain("It lists these products: Acme Vault.");
      });

      it("searches under the name a query of the model leads with", async () => {
        const web = webWith(GIVES_NAMES);
        const model = scriptedModel([
          searchStep("breach AcmeAI", "security_incidents"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(web.search.mock.calls.map(([query]) => query)).toEqual(["AcmeAI breach"]);
      });

      it("gives the names on the result, so that the analysis names the vendor as the research did", async () => {
        const named = createVendorResearcher({
          ...webWith(GIVES_NAMES),
          generate: scriptedModel([finishStep, finishStep]).generate,
        });
        const plain = createVendorResearcher({
          ...webWith({}),
          generate: scriptedModel([finishStep, finishStep]).generate,
        });

        const withNames = await named({ target: WITH_DOMAIN, model: MODEL, now: NOW });
        const without = await plain({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(withNames.siteNames).toEqual(["AcmeAI"]);
        expect(without.siteNames).toEqual([]);
      });

      it("takes no name from a home page that redirects to a site that is not the vendor's", async () => {
        const web = webWith({
          [HOME]: { url: "https://www.facebook.com/acme", title: "Acme", identity },
        });
        const model = scriptedModel([finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(outcome.siteNames).toEqual([]);
        expect(model.calls[0].prompt).not.toContain("also_known_as");
      });

      it("makes one more news search for each category when the code gathers: under the first other name", async () => {
        const web = webWith(GIVES_NAMES);
        const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(web.search.mock.calls.map(([query]) => query)).toEqual([
          "Acme data breach",
          "Acme security incident",
          "AcmeAI data breach",
          "Acme lawsuit",
          "Acme fined",
          "Acme FTC",
          "Acme settlement",
          "AcmeAI lawsuit",
          "Acme outage",
          "AcmeAI outage",
          "Acme layoffs",
          "Acme bankruptcy",
          "Acme acquisition",
          "AcmeAI layoffs",
        ]);
      });
    });

    it("warns the model when the home page does not name the vendor", async () => {
      const web = webWith({
        [HOME]: { title: "Anvils", text: "Anvils and other heavy goods for sale." },
      });
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(briefingOf(model.calls[0].prompt)).toMatch(/does not mention the vendor/);
    });

    it("goes on without a briefing when the check itself breaks", async () => {
      const web = webWith({});
      web.readPage.mockImplementationOnce(async () => {
        throw new TypeError("something else");
      });
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.stoppedBecause).toBe("finished");
      expect(model.calls[0].prompt).not.toContain("<briefing>");
      expect(outcome.calls).toEqual([]);
    });

    describe("in the trace", () => {
      const stepOf = async (
        answers: Record<string, Partial<FetchedPage> | PageReadError["reason"]>,
      ) => {
        const web = webWith(answers);
        const model = scriptedModel([finishStep, finishStep]);
        const trace = createTraceRecorder();
        const research = createVendorResearcher({ ...web, generate: model.generate });
        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });
        return trace.snapshot().steps[0];
      };

      it("is the first step, with the address, the time and the number of links offered", async () => {
        const step = await stepOf({
          [HOME]: {
            text: "Acme Cloud",
            links: [{ text: "Security", url: "https://acme.com/security" }],
          },
        });

        expect(step).toMatchObject({
          n: 1,
          tool: "preflight",
          url: HOME,
          outcome: "ok",
          results: 1,
        });
        expect(step.reason).toBeUndefined();
        expect(typeof step.ms).toBe("number");
      });

      it("says when the page does not name the vendor, and when it redirected off the site", async () => {
        expect(await stepOf({ [HOME]: { title: "Anvils", text: "Anvils." } })).toMatchObject({
          outcome: "ok",
          reason: "does_not_name_vendor",
        });
        expect(
          await stepOf({ [HOME]: { url: "https://other-company.example/", text: "Acme" } }),
        ).toMatchObject({ outcome: "ok", reason: "redirected_off_site" });
      });

      it("fails with the reason when the home page cannot be read", async () => {
        expect(await stepOf({ [HOME]: "blocked_by_robots" })).toMatchObject({
          tool: "preflight",
          outcome: "failed",
          reason: "blocked_by_robots",
        });
        expect(await stepOf({ [HOME]: "needs_javascript" })).toMatchObject({
          outcome: "failed",
          reason: "needs_javascript",
        });
      });

      it("fails as check_failed when the check itself broke", async () => {
        const web = webWith({});
        web.readPage.mockImplementationOnce(async () => {
          throw new TypeError("something else");
        });
        const model = scriptedModel([finishStep, finishStep]);
        const trace = createTraceRecorder();
        const research = createVendorResearcher({ ...web, generate: model.generate });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

        expect(trace.snapshot().steps[0]).toMatchObject({
          tool: "preflight",
          outcome: "failed",
          reason: "check_failed",
        });
      });

      it("has no step for a vendor without a domain", async () => {
        const web = fakeWeb();
        const model = scriptedModel([finishStep, finishStep]);
        const trace = createTraceRecorder();
        const research = createVendorResearcher({ ...web, generate: model.generate });

        await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW, trace });

        expect(trace.snapshot().steps.map((step) => step.tool)).toEqual(["finish", "finish"]);
      });
    });
  });

  describe("the search counters", () => {
    function fakeMetrics() {
      const searches: Array<{ kind: string; outcome: string }> = [];
      const retries: Array<{ kind: string }> = [];
      const metrics: ResearchMetrics = {
        findingDecided: jest.fn(),
        searchFinished: (search) => searches.push(search),
        searchRetried: (search) => retries.push(search),
        cacheLookup: jest.fn(),
      };
      return { metrics, searches, retries };
    }

    it("counts each search step by the feed and what came of it", async () => {
      const counted = fakeMetrics();
      const web = fakeWeb();
      web.search.mockImplementation(async (query) => {
        if (query.includes("outage")) throw new SearchEngineError();
        return query.includes("lawsuit") ? [] : [result("https://news.example/acme-breach")];
      });
      const model = scriptedModel([
        searchStep("Acme data breach", "security_incidents", "news"),
        searchStep("Acme lawsuit", "legal_regulatory", "news"),
        searchStep("Acme outage", "security_incidents", "web"),
        // The same words as the first: the session refuses it before the feed.
        searchStep("breach data Acme", "security_incidents", "news"),
        finishStep,
        finishStep,
      ]);
      const research = createVendorResearcher({
        ...web,
        generate: model.generate,
        metrics: counted.metrics,
      });

      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(counted.searches).toEqual([
        { kind: "news", outcome: "results" },
        { kind: "news", outcome: "empty" },
        { kind: "web", outcome: "failed" },
        { kind: "news", outcome: "refused" },
      ]);
    });

    it("does not count a step that is not a search, or one the rules refused as invalid", async () => {
      const counted = fakeMetrics();
      const web = fakeWeb();
      const model = scriptedModel([
        stepOf("Search.", { action: "search" }),
        readStep("https://elsewhere.example/page", "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const research = createVendorResearcher({
        ...web,
        generate: model.generate,
        metrics: counted.metrics,
      });

      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(counted.searches).toEqual([]);
    });

    it("counts without a trace, and with one", async () => {
      for (const trace of [undefined, createTraceRecorder()]) {
        const counted = fakeMetrics();
        const web = fakeWeb([[result("https://news.example/acme-breach")]]);
        const model = scriptedModel([
          searchStep("Acme data breach", "security_incidents"),
          finishStep,
          finishStep,
        ]);
        const research = createVendorResearcher({
          ...web,
          generate: model.generate,
          metrics: counted.metrics,
        });

        await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW, trace });

        expect(counted.searches).toEqual([{ kind: "news", outcome: "results" }]);
      }
    });

    it("never lets a counter that throws change the run", async () => {
      const web = fakeWeb([[result("https://news.example/acme-breach")]]);
      const model = scriptedModel([
        searchStep("Acme data breach", "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const research = createVendorResearcher({
        ...web,
        generate: model.generate,
        metrics: {
          findingDecided: jest.fn(),
          searchFinished: () => {
            throw new Error("a counter broke");
          },
          searchRetried: jest.fn(),
          cacheLookup: jest.fn(),
        },
      });

      const outcome = await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.stoppedBecause).toBe("finished");
      expect(outcome.searchesUsed).toBe(1);
    });
  });

  describe("the progress", () => {
    const NEWS = result("https://news.example/acme-breach", { title: "Acme data breach" });

    it("is told after every turn of the loop, with the counts of the session so far", async () => {
      const web = fakeWeb([[NEWS]]);
      const model = scriptedModel([
        searchStep("Acme data breach", "security_incidents"),
        readStep(NEWS.url, "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const progress = jest.fn();
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, progress });

      const reported = progress.mock.calls.map(([report]) => report);
      expect(reported).toEqual([
        {
          steps: 1,
          action: "search",
          category: "security_incidents",
          searchesUsed: 1,
          pagesRead: 0,
          categories: ["security_incidents"],
        },
        {
          steps: 2,
          action: "read",
          category: "security_incidents",
          searchesUsed: 1,
          pagesRead: 1,
          categories: ["security_incidents"],
        },
        // The first finish is turned away with a reminder of what is not covered, the second ends the loop.
        {
          steps: 3,
          action: null,
          category: null,
          searchesUsed: 1,
          pagesRead: 1,
          categories: ["security_incidents"],
        },
        {
          steps: 4,
          action: null,
          category: null,
          searchesUsed: 1,
          pagesRead: 1,
          categories: ["security_incidents"],
        },
      ]);
    });

    it("lists the categories in the order of the categories, not in the order they were worked on", async () => {
      const web = fakeWeb([[NEWS], [result("https://acme.com/trust", { title: "Acme trust" })]]);
      const model = scriptedModel([
        searchStep("Acme SOC 2", "certifications", "web"),
        searchStep("Acme data breach", "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const progress = jest.fn();
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, progress });

      expect(progress.mock.calls[progress.mock.calls.length - 1][0].categories).toEqual([
        "security_incidents",
        "certifications",
      ]);
    });

    it("says nothing a web page or the model wrote: no query, address, title or thought", async () => {
      const web = fakeWeb([[NEWS]]);
      const model = scriptedModel([
        searchStep("Acme data breach", "security_incidents"),
        readStep(NEWS.url, "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const progress = jest.fn();
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, progress });

      expect(progress).toHaveBeenCalledTimes(4);
      const text = JSON.stringify(progress.mock.calls);
      expect(text).not.toContain("Acme data breach");
      expect(text).not.toContain("news.example");
      expect(text).not.toContain("Search for");
      for (const [report] of progress.mock.calls) {
        expect(Object.keys(report).sort()).toEqual([
          "action",
          "categories",
          "category",
          "pagesRead",
          "searchesUsed",
          "steps",
        ]);
      }
    });

    it("cannot hurt the research: a sink that throws changes nothing", async () => {
      const web = fakeWeb([[NEWS]]);
      const model = scriptedModel([
        searchStep("Acme data breach", "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      const outcome = await research({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
        progress: () => {
          throw new Error("the database is down");
        },
      });

      expect(outcome.stoppedBecause).toBe("finished");
      expect(outcome.searchesUsed).toBe(1);
    });

    it("is reported with a trace and without one", async () => {
      for (const trace of [undefined, createTraceRecorder()]) {
        const web = fakeWeb([[NEWS]]);
        const model = scriptedModel([
          searchStep("Acme data breach", "security_incidents"),
          finishStep,
          finishStep,
        ]);
        const progress = jest.fn();
        const research = createVendorResearcher({ ...web, generate: model.generate });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace, progress });

        expect(progress).toHaveBeenCalledTimes(3);
      }
    });
  });

  describe("gathering before the loop", () => {
    it("does nothing the model did not ask for unless it is asked to", async () => {
      const web = fakeWeb();
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(web.search).not.toHaveBeenCalled();
      // No call for hints either: the first call of the model is the first step of the loop.
      expect(model.calls[0].system).toBe(buildLoopSystemPrompt());
    });

    it("makes the news searches and reads the site before the model's first step, and tells the model what it collected", async () => {
      const news = result("https://news.example/acme-breach", { title: "Acme data breach" });
      const web = namedWeb([[news]]);
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

      const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(web.search.mock.calls.map(([query]) => query)).toEqual([
        "Acme data breach",
        "Acme security incident",
        "Acme lawsuit",
        "Acme fined",
        "Acme FTC",
        "Acme settlement",
        "Acme outage",
        "Acme layoffs",
        "Acme bankruptcy",
        "Acme acquisition",
      ]);
      expect(web.readPage.mock.calls.map(([url]) => url)).toEqual(
        expect.arrayContaining([
          "https://acme.com/sitemap.xml",
          "https://acme.com/security",
          "https://acme.com/privacy",
        ]),
      );
      const briefing = briefingOf(model.calls[1].prompt);
      expect(briefing).toContain("Acme data breach - 1 result");
      expect(briefing).toContain(news.url);
      expect(briefing).toContain("https://acme.com/security");
      // The best result of the news is read in full, too.
      expect(web.readPage.mock.calls.map(([url]) => url)).toContain(news.url);
      expect(outcome.entries.find((entry) => entry.url === news.url)).toMatchObject({
        kind: "page",
      });
      expect(briefing).toContain("Articles from the search results: 1 of 1 were read");
      // The search results and the pages are in the ledger, and the searches are counted.
      expect(outcome.entries.map((entry) => entry.url)).toEqual(
        expect.arrayContaining([news.url, "https://acme.com/security"]),
      );
      expect(outcome.searchesUsed).toBe(10);
      // Every category was worked on, so the first finish is final: no reminder.
      expect(model.mock).toHaveBeenCalledTimes(2);
      expect(outcome.stoppedBecause).toBe("finished");
    });

    it("reads the news by the registry category: a regulator and a trusted publisher before the vendor's own post", async () => {
      // The first search is the first of security incidents; the vendor's own post, a regulator
      // and a major publisher all name it. No setting of the researcher changes the order.
      const results = [
        result("https://acme.com/blog/incident"),
        result("https://www.reuters.com/technology/acme"),
        result("https://ico.org.uk/action/acme"),
      ];
      const web = namedWeb([results]);
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      const read = web.readPage.mock.calls.map(([url]) => url);
      expect(results.map((it) => it.url).filter((url) => read.includes(url))).toEqual([
        "https://www.reuters.com/technology/acme",
        "https://ico.org.uk/action/acme",
      ]);
    });

    it("leaves the model's budget as it was", async () => {
      const web = namedWeb();
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(model.calls[1].prompt).toContain("Budget left: 8 searches, 12 page reads, 24 steps.");
    });

    describe("the records of public databases", () => {
      const record = {
        url: "https://nvd.example/CVE-2031-0001",
        title: "CVE-2031-0001: Acme flaw",
        text: "CISA entry",
        publishedAt: "2031-04-01",
      };
      const found = (): RecordsOutcome => ({
        source: "kev",
        url: "https://db.example/kev.json",
        outcome: "ok",
        records: [record],
        omitted: {},
        ms: 40,
      });

      it("looks the vendor up before the model's first step, keeps the records among the entries and tells the model", async () => {
        const web = namedWeb();
        const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
        const records = jest.fn(async () => [found()]);
        const research = createVendorResearcher({
          ...web,
          generate: model.generate,
          gather: true,
          records,
        });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(records).toHaveBeenCalledTimes(1);
        expect(records).toHaveBeenCalledWith(
          expect.objectContaining({
            target: expect.objectContaining({ name: "Acme", domain: "acme.com" }),
            now: NOW,
            researchable: [
              "security_incidents",
              "certifications",
              "legal_regulatory",
              "ai_specific",
              "availability",
              "financial_health",
            ],
            cutoffs: expect.objectContaining({
              security_incidents: expect.stringMatching(/^2029-04-/),
              availability: expect.stringMatching(/^2030-04-/),
              financial_health: expect.stringMatching(/^2030-04-/),
            }),
          }),
        );
        expect(outcome.entries.find((entry) => entry.url === record.url)).toMatchObject({
          kind: "page",
          category: "security_incidents",
          content: "CISA entry",
        });
        const briefing = briefingOf(model.calls[1].prompt);
        expect(briefing).toContain("- CISA Known Exploited Vulnerabilities catalog: 1 record");
        expect(briefing).toContain(`${record.title} - ${record.url} - 2031-04-01 (record)`);
        // They cost no search: the ten of the news are the only ones.
        expect(outcome.searchesUsed).toBe(10);
        expect(model.calls[1].prompt).toContain(
          "Budget left: 8 searches, 12 page reads, 24 steps.",
        );
      });

      it("records each lookup in the trace as a step of the code: the address, the number of records and no text", async () => {
        const web = namedWeb();
        const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
        const trace = createTraceRecorder();
        const research = createVendorResearcher({
          ...web,
          generate: model.generate,
          gather: true,
          records: async () => [found()],
        });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

        const step = trace
          .snapshot()
          .steps.find((it) => it.tool === "gather" && it.category === "security_incidents");
        expect(step).toMatchObject({
          by: "code",
          url: "https://db.example/kev.json",
          outcome: "ok",
          results: 1,
          ms: 40,
        });
        expect(JSON.stringify(trace.snapshot())).not.toContain("CISA entry");
      });

      it("makes no lookup unless the routine work is on", async () => {
        const web = fakeWeb();
        const model = scriptedModel([finishStep, finishStep]);
        const records = jest.fn(async () => [found()]);
        const research = createVendorResearcher({ ...web, generate: model.generate, records });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(records).not.toHaveBeenCalled();
      });

      describe("with the vendor risk database", () => {
        const listOf = (id: VrdbSourceId, outcome: CoverageOutcome): CoverageSource => ({
          id,
          name: vrdbSourceOf(id).name,
          attribution: vrdbSourceOf(id).attribution,
          mode: "mirror",
          checked: outcome === "found" || outcome === "none",
          outcome,
          strong: 0,
          weak: 0,
          last_success_at: "2031-04-19T06:41:00.000Z",
          stale: false,
        });
        const VRDB: VrdbOutcome = {
          records: [
            { source: "kev", records: [], omitted: {} },
            { source: "ofac", records: [], omitted: {} },
          ],
          coverage: [
            listOf("kev", "none"),
            listOf("ofac", "none"),
            listOf("uk_sanctions", "failed"),
            listOf("eu_fsf", "off"),
          ],
        };
        const statusPage = (): RecordsOutcome => ({
          source: "statuspage",
          url: "https://status.acme.com/history.atom",
          outcome: "failed",
          reason: "unreachable",
          records: [],
          omitted: {},
          ms: 8000,
        });

        it("gives the coverage of its lists and of the databases asked beside it", async () => {
          const web = namedWeb();
          const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
          const vrdb = jest.fn(async () => VRDB);
          const research = createVendorResearcher({
            ...web,
            generate: model.generate,
            gather: true,
            records: async () => [statusPage()],
            vrdb,
          });

          const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

          expect(vrdb).toHaveBeenCalledTimes(1);
          // Which databases are asked beside the VRDB depends on the gates (the SEC is one until
          // Q4 opens), so the ids come from the code. The status page must be among them: the
          // stubbed lookup answers for it alone, with a failure, which the coverage has to carry.
          expect(sourcesBesideVrdb()).toContain("statuspage");
          expect(outcome.coverage).toEqual({
            sources: VRDB.coverage,
            // The NVD is read through by the VRDB: its coverage is among the lists'.
            lookups: sourcesBesideVrdb().map((id) => ({
              id,
              outcome: id === "statuspage" ? "failed" : "not_researched",
            })),
          });
        });

        it("says the databases beside it are off when the lookup of records is", async () => {
          const web = namedWeb();
          const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
          const research = createVendorResearcher({
            ...web,
            generate: model.generate,
            gather: true,
            vrdb: async () => VRDB,
          });

          const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

          // One "off" for each database asked beside the VRDB, however many the gates leave.
          expect(outcome.coverage?.lookups.map((lookup) => lookup.outcome)).toEqual(
            sourcesBesideVrdb().map(() => "off"),
          );
        });

        it("gives no coverage without it, and asks it nothing unless the routine work is on", async () => {
          const model = scriptedModel([NO_HINTS, finishStep, finishStep, finishStep, finishStep]);
          const without = createVendorResearcher({
            ...namedWeb(),
            generate: model.generate,
            gather: true,
            records: async () => [statusPage()],
          });
          const vrdb = jest.fn(async () => VRDB);
          const notGathering = createVendorResearcher({
            ...namedWeb(),
            generate: model.generate,
            vrdb,
          });

          expect((await without({ target: WITH_DOMAIN, model: MODEL, now: NOW })).coverage).toBe(
            undefined,
          );
          expect(
            (await notGathering({ target: WITH_DOMAIN, model: MODEL, now: NOW })).coverage,
          ).toBe(undefined);
          expect(vrdb).not.toHaveBeenCalled();
        });
      });

      it("tells the loop of security incidents and no other, when there is one loop for each category", async () => {
        const web = namedWeb();
        const model = categoryModel();
        const research = createVendorResearcher({
          ...web,
          generate: model.generate,
          gather: true,
          perCategory: true,
          records: async () => [found()],
        });

        await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        const told = model
          .loopCalls()
          .map((call) => [call.scope, call.prompt.includes("Records of public databases")]);
        expect(told).toEqual([
          ["security_incidents", true],
          ["certifications", false],
          ["legal_regulatory", false],
          ["ai_specific", false],
          ["availability", false],
          ["financial_health", false],
        ]);
      });
    });

    it("records what the code did in the trace: by the code, with no model turn, and the sitemap as a step of its own", async () => {
      const web = namedWeb([[result("https://news.example/acme-breach")]]);
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
      const trace = createTraceRecorder();
      const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

      const steps = trace.snapshot().steps;
      expect(steps.slice(0, 3).map((step) => [step.tool, step.by])).toEqual([
        ["preflight", undefined],
        ["gather", "code"],
        ["search", "code"],
      ]);
      expect(steps[1]).toMatchObject({
        url: "https://acme.com/sitemap.xml",
        outcome: "empty",
        results: 0,
      });
      const byCode = steps.filter((step) => step.by === "code");
      expect(byCode.filter((step) => step.tool === "search")).toHaveLength(10);
      expect(byCode.filter((step) => step.tool === "read").length).toBeGreaterThan(0);
      expect(byCode.every((step) => step.turn === undefined)).toBe(true);
      // The turn of the model comes after, with its number.
      expect(steps.filter((step) => step.by === undefined && step.tool === "finish")).toEqual([
        expect.objectContaining({ turn: 1, outcome: "ok" }),
      ]);
    });

    it("counts the searches of the code like the others, and reports its work once before the first turn", async () => {
      const metrics = {
        findingDecided: jest.fn(),
        searchFinished: jest.fn(),
        searchRetried: jest.fn(),
        cacheLookup: jest.fn(),
      } as unknown as ResearchMetrics;
      const reports: Array<{ steps: number; searchesUsed: number }> = [];
      const web = namedWeb([[result("https://news.example/acme-breach")]]);
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
      const research = createVendorResearcher({
        ...web,
        generate: model.generate,
        metrics,
        gather: true,
      });

      await research({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
        progress: (report) =>
          reports.push({ steps: report.steps, searchesUsed: report.searchesUsed }),
      });

      expect(metrics.searchFinished).toHaveBeenCalledTimes(10);
      expect(metrics.searchFinished).toHaveBeenCalledWith({ kind: "news", outcome: "results" });
      expect(reports).toEqual([
        { steps: 0, searchesUsed: 10 },
        { steps: 1, searchesUsed: 10 },
      ]);
    });

    it("searches only when the website is closed, and says nothing of pages it did not read", async () => {
      const web = fakeWeb();
      web.readPage.mockRejectedValue(new PageReadError("unreachable"));
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(web.search).toHaveBeenCalledTimes(10);
      // The check of the website tried the home page and its www form, and nothing else was read.
      expect(web.readPage).toHaveBeenCalledTimes(2);
    });

    it("searches only, for a vendor without a domain", async () => {
      const web = fakeWeb();
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(web.search).toHaveBeenCalledTimes(10);
      expect(web.readPage).not.toHaveBeenCalled();
    });
    describe("hints from the model's memory", () => {
      const RANSOMWARE: Hints = {
        queries: [{ category: "security_incidents", query: "Acme ransomware" }],
      };

      it("asks the model for them and searches for them with the others, as the code", async () => {
        const web = namedWeb();
        const model = scriptedModel([RANSOMWARE, finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(model.calls[0].system).toBe(buildHintsSystemPrompt());
        expect(web.search.mock.calls.map(([query]) => query)).toEqual([
          "Acme data breach",
          "Acme security incident",
          "Acme lawsuit",
          "Acme fined",
          "Acme FTC",
          "Acme settlement",
          "Acme outage",
          "Acme layoffs",
          "Acme bankruptcy",
          "Acme acquisition",
          "Acme ransomware",
        ]);
        expect(outcome.searchesUsed).toBe(11);
        // The loop sees what was searched, in the briefing, and not the queries to try.
        const loopCall = model.calls[1];
        expect(loopCall.system).toBe(buildLoopSystemPrompt());
        expect(briefingOf(loopCall.prompt)).toContain("- security_incidents: Acme ransomware");
        expect(loopCall.prompt).not.toMatch(/Queries that work/);
        expect(loopCall.prompt).toContain(
          buildLoopTaskPrompt({
            target: WITH_DOMAIN,
            now: NOW,
            researchable: [...RESEARCH_CATEGORIES],
            searched: true,
          }),
        );
      });

      it("records the call in the trace as a call for hints, before the calls of the loop", async () => {
        const web = namedWeb();
        const model = scriptedModel([RANSOMWARE, finishStep, finishStep]);
        const trace = createTraceRecorder();
        const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

        await research({
          target: WITH_DOMAIN,
          model: MODEL,
          modelId: "the-model",
          now: NOW,
          trace,
        });

        expect(
          trace.snapshot().modelCalls.map((call) => [call.purpose, call.model, call.ok]),
        ).toEqual([
          ["hints", "the-model", true],
          ["loop", "the-model", true],
        ]);
      });

      it("starts the call while the website is checked, so that the check and the call overlap", async () => {
        const web = namedWeb();
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const reader = web.readPage.getMockImplementation()!;
        web.readPage.mockImplementation(async (url, signal) => {
          if (url === "https://acme.com/") await held;
          return reader(url, signal);
        });
        const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

        const running = research({ target: WITH_DOMAIN, model: MODEL, now: NOW });
        await new Promise((resolve) => setImmediate(resolve));

        // The home page has not answered, and the model has been asked for hints already.
        expect(model.mock).toHaveBeenCalledTimes(1);
        expect(model.calls[0].system).toBe(buildHintsSystemPrompt());
        release();
        await running;
      });

      it("goes on with the baseline searches when the call fails, and says so in the trace", async () => {
        const web = namedWeb();
        const model = scriptedModel([{ throws: new Error("down") }, finishStep, finishStep]);
        const trace = createTraceRecorder();
        const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

        expect(web.search).toHaveBeenCalledTimes(10);
        expect(outcome.stoppedBecause).toBe("finished");
        expect(trace.snapshot().modelCalls[0]).toMatchObject({ purpose: "hints", ok: false });
      });

      it("learns from the call that the provider rejects json_schema, so that the loop starts in JSON-object mode", async () => {
        const web = namedWeb();
        const model = scriptedModel([NO_HINTS, finishStep, finishStep], [true]);
        const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

        const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        expect(model.calls[0].model).toBe(MODEL);
        expect(model.calls[1].model).not.toBe(MODEL);
        expect(outcome.jsonObjectFallback).toBe(true);
      });

      it("asks for hints for a vendor without a domain too: the news is all it has", async () => {
        const web = namedWeb();
        const model = scriptedModel([RANSOMWARE, finishStep, finishStep]);
        const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

        await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

        expect(web.search.mock.calls.map(([query]) => query)).toContain("Acme ransomware");
      });
    });
  });

  describe("one loop for each category", () => {
    const EVERY_CATEGORY = [...RESEARCH_CATEGORIES];
    const budgetLine = (prompt: string) => prompt.match(/Budget left: [^\n]*/)?.[0];

    function researcher(
      web: ReturnType<typeof fakeWeb>,
      model: ReturnType<typeof categoryModel>,
      options: { gather?: boolean } = {},
    ) {
      return createVendorResearcher({
        ...web,
        generate: model.generate,
        gather: options.gather ?? true,
        perCategory: true,
      });
    }

    it("runs one loop for each category, each told which one it researches and nothing else", async () => {
      const web = namedWeb();
      const model = categoryModel();

      await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(model.loopCalls().map((call) => call.scope)).toEqual(EVERY_CATEGORY);
      for (const call of model.loopCalls()) {
        const scope = call.scope as ResearchCategory;
        expect(call.system).toBe(buildLoopSystemPrompt());
        expect(call.prompt).toContain(
          buildLoopTaskPrompt({
            target: WITH_DOMAIN,
            now: NOW,
            researchable: [scope],
            searched: true,
            scope,
          }),
        );
      }
    });

    it("runs the loops at the same time", async () => {
      const web = namedWeb();
      const model = categoryModel();

      await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(model.state.mostInFlight).toBe(6);
    });

    it("splits the budget of one loop between them: two searches for each of the first two categories of the news and one for each of the others and for each category of the website, the page reads shared out, four steps", async () => {
      const web = namedWeb();
      const model = categoryModel();

      await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(model.loopCalls().map((call) => [call.scope, budgetLine(call.prompt)])).toEqual([
        ["security_incidents", "Budget left: 2 searches, 2 page reads, 4 steps."],
        ["certifications", "Budget left: 1 search, 2 page reads, 4 steps."],
        ["legal_regulatory", "Budget left: 2 searches, 2 page reads, 4 steps."],
        ["ai_specific", "Budget left: 1 search, 2 page reads, 4 steps."],
        ["availability", "Budget left: 1 search, 2 page reads, 4 steps."],
        ["financial_health", "Budget left: 1 search, 2 page reads, 4 steps."],
      ]);
    });

    it("gives the four categories of the news the whole budget when the vendor has no domain", async () => {
      const web = namedWeb();
      const model = categoryModel();

      await researcher(web, model)({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(model.loopCalls().map((call) => [call.scope, budgetLine(call.prompt)])).toEqual([
        ["security_incidents", "Budget left: 2 searches, 3 page reads, 4 steps."],
        ["legal_regulatory", "Budget left: 2 searches, 3 page reads, 4 steps."],
        ["availability", "Budget left: 2 searches, 3 page reads, 4 steps."],
        ["financial_health", "Budget left: 2 searches, 3 page reads, 4 steps."],
      ]);
    });

    it("gives each loop a budget of its own: one that spends its searches leaves the others theirs", async () => {
      const web = namedWeb();
      const spender = stepOf(
        "Search a lot",
        ...["alpha", "beta", "gamma", "delta"].map((word): LoopAction<ResearchCategory> => ({
          action: "search",
          category: "security_incidents",
          kind: "news",
          query: `Acme ${word}`,
        })),
      );
      const model = categoryModel({
        security_incidents: [spender],
        legal_regulatory: [searchStep("Acme verdict", "legal_regulatory")],
      });

      await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      const searched = web.search.mock.calls.map(([query]) => query);
      // Two of the four, since its own budget holds two, and the search of the other loop.
      expect(searched).toEqual(expect.arrayContaining(["Acme alpha", "Acme beta"]));
      expect(searched).not.toContain("Acme gamma");
      expect(searched).not.toContain("Acme delta");
      expect(searched).toContain("Acme verdict");
      expect(searched).toHaveLength(10 + 2 + 1);
    });

    it("ends a loop that has not finished after four model turns", async () => {
      const web = namedWeb();
      const noAction = stepOf("I am thinking");
      const model = categoryModel({ certifications: Array(10).fill(noAction) });

      const outcome = await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(model.callsOf("certifications")).toHaveLength(4);
      // The loops that finished at their first turn did not need more.
      expect(model.callsOf("security_incidents")).toHaveLength(1);
      expect(outcome.stoppedBecause).toBe("steps");
    });

    it("tells each loop what was collected for its category, and the site loops what was found out about the website", async () => {
      const news = result("https://news.example/acme-breach", { title: "Acme data breach" });
      const web = namedWeb([[news]]);
      const model = categoryModel();

      await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      const briefing = (category: ResearchCategory) =>
        briefingOf(model.callsOf(category)[0].prompt);
      expect(briefing("security_incidents")).toContain("Acme data breach - 1 result");
      expect(briefing("security_incidents")).toContain(news.url);
      expect(briefing("security_incidents")).not.toContain("https://acme.com/security");
      expect(briefing("security_incidents")).not.toContain("was checked before your first step");
      expect(briefing("legal_regulatory")).toContain("Acme lawsuit - no results");
      expect(briefing("legal_regulatory")).not.toContain("Acme data breach");
      expect(briefing("certifications")).toContain("was checked before your first step");
      expect(briefing("certifications")).toContain("https://acme.com/security");
      expect(briefing("certifications")).not.toContain(news.url);
      expect(briefing("ai_specific")).toContain("was checked before your first step");
      expect(briefing("ai_specific")).toContain("https://acme.com/privacy");
      expect(briefing("ai_specific")).not.toContain("https://acme.com/security");
    });

    it("refuses what a loop asks for in another category, and says why", async () => {
      const web = namedWeb();
      const model = categoryModel({
        security_incidents: [searchStep("Acme trust", "certifications"), finishStep],
      });
      const trace = createTraceRecorder();

      await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

      expect(web.search.mock.calls.map(([query]) => query)).not.toContain("Acme trust");
      expect(
        trace
          .snapshot()
          .steps.filter((step) => step.loop === "security_incidents" && step.tool === "invalid"),
      ).toEqual([expect.objectContaining({ reason: "not_researchable", turn: 1 })]);
    });

    describe("a finish", () => {
      it("is final at the first turn when the code searched for the category and found nothing: the briefing said so", async () => {
        const web = namedWeb();
        const model = categoryModel();

        const outcome = await researcher(
          web,
          model,
        )({
          target: WITH_DOMAIN,
          model: MODEL,
          now: NOW,
        });

        // The six loops took one turn each, and the call for hints makes seven.
        expect(model.mock).toHaveBeenCalledTimes(7);
        expect(outcome.stoppedBecause).toBe("finished");
      });

      it("is answered with a reminder for a category the code did nothing for, once", async () => {
        const web = fakeWeb();
        web.readPage.mockRejectedValue(new PageReadError("unreachable"));
        const model = categoryModel();

        await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW });

        // The website is closed, so nothing was read for its two categories.
        expect(model.callsOf("certifications")).toHaveLength(2);
        expect(model.callsOf("certifications")[1].prompt).toContain("You have no sources yet");
        expect(model.callsOf("ai_specific")).toHaveLength(2);
        expect(model.callsOf("security_incidents")).toHaveLength(1);
      });
    });

    describe("when the routine work is not done", () => {
      it("starts each loop with the queries to try, and needs a search or a read before it may finish", async () => {
        const web = fakeWeb();
        const model = categoryModel();

        await researcher(web, model, { gather: false })({
          target: WITH_DOMAIN,
          model: MODEL,
          now: NOW,
        });

        // No call for hints, and each loop was reminded once: two turns each.
        expect(model.calls.every((call) => call.scope !== null)).toBe(true);
        expect(model.loopCalls()).toHaveLength(12);
        const news = model.callsOf("security_incidents")[0].prompt;
        expect(news).toContain(
          '- security_incidents: "Acme data breach", "Acme security incident"',
        );
        expect(news).not.toContain("<briefing>");
        expect(model.callsOf("security_incidents")[1].prompt).toContain("You have no sources yet");
      });
    });

    describe("the progress", () => {
      it("counts the model turns of all the loops together, never going back", async () => {
        const web = namedWeb();
        const model = categoryModel({
          security_incidents: [searchStep("Acme ransomware", "security_incidents"), finishStep],
          legal_regulatory: [searchStep("Acme settlement", "legal_regulatory"), finishStep],
        });
        const steps: number[] = [];

        await researcher(
          web,
          model,
        )({
          target: WITH_DOMAIN,
          model: MODEL,
          now: NOW,
          progress: (report) => steps.push(report.steps),
        });

        // The routine work reports step 0; two loops took two turns and four took one.
        expect(steps[0]).toBe(0);
        expect(steps.slice(1)).toEqual([...steps.slice(1)].sort((a, b) => a - b));
        expect(Math.max(...steps)).toBe(8);
        expect(steps[steps.length - 1]).toBe(8);
      });
    });

    describe("the trace", () => {
      it("names the loop of every step and model call it records, and none for the code, the check or the hints", async () => {
        const web = namedWeb();
        const model = categoryModel({
          security_incidents: [searchStep("Acme ransomware", "security_incidents"), finishStep],
        });
        const trace = createTraceRecorder();

        await researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

        const { steps, modelCalls } = trace.snapshot();
        const ofLoop = steps.filter((step) => step.loop !== undefined);
        expect(ofLoop.length).toBeGreaterThan(0);
        expect(steps.filter((step) => step.by === "code").every((step) => !step.loop)).toBe(true);
        expect(steps.find((step) => step.tool === "preflight")?.loop).toBeUndefined();
        // The turns of each loop are numbered from 1.
        expect(
          ofLoop
            .filter((step) => step.loop === "security_incidents")
            .map((step) => [step.tool, step.turn]),
        ).toEqual([
          ["search", 1],
          ["finish", 2],
        ]);
        expect(modelCalls.filter((call) => call.purpose === "hints")).toEqual([
          expect.not.objectContaining({ loop: expect.anything() }),
        ]);
        expect(
          modelCalls
            .filter((call) => call.purpose === "loop")
            .map((call) => call.loop)
            .sort(),
        ).toEqual(
          [...EVERY_CATEGORY]
            .sort()
            .flatMap((category) =>
              category === "security_incidents" ? [category, category] : [category],
            ),
        );
      });
    });

    describe("the ending of the run", () => {
      it("is a model error, with the first error, when every loop failed", async () => {
        const web = namedWeb();
        const down = new Error("the model is down");
        const model = categoryModel(
          Object.fromEntries(EVERY_CATEGORY.map((category) => [category, [{ throws: down }]])),
        );

        const outcome = await researcher(
          web,
          model,
        )({
          target: WITH_DOMAIN,
          model: MODEL,
          now: NOW,
        });

        expect(outcome.stoppedBecause).toBe("model_error");
        expect(outcome.modelError).toBe(down);
        // What the routine work found is kept.
        expect(outcome.entries.length).toBeGreaterThan(0);
      });

      it("is not one when only some of the loops failed: the others went on", async () => {
        const web = namedWeb();
        const model = categoryModel({
          certifications: [{ throws: new Error("the model is down") }],
        });

        const outcome = await researcher(
          web,
          model,
        )({
          target: WITH_DOMAIN,
          model: MODEL,
          now: NOW,
        });

        expect(outcome.stoppedBecause).toBe("finished");
        expect(outcome.modelError).toBeNull();
      });

      it("rejects, after every loop has ended, when the session breaks in one", async () => {
        const web = namedWeb();
        const bug = new TypeError("a bug of the session");
        let broken = false;
        web.search.mockImplementation(async (query) => {
          // Only after the routine work: the searches of the model's loops.
          if (query === "Acme ransomware") {
            broken = true;
            throw bug;
          }
          return [];
        });
        const model = categoryModel({
          security_incidents: [searchStep("Acme ransomware", "security_incidents")],
          legal_regulatory: [searchStep("Acme settlement", "legal_regulatory"), finishStep],
        });

        await expect(
          researcher(web, model)({ target: WITH_DOMAIN, model: MODEL, now: NOW }),
        ).rejects.toBe(bug);

        expect(broken).toBe(true);
        // The loop that went on has ended too, so nothing is left running behind the rejection.
        expect(model.state.inFlight).toBe(0);
        expect(model.callsOf("legal_regulatory")).toHaveLength(2);
      });
    });
  });

  describe("the trace", () => {
    it("records every turn of the loop, and the tokens and time of every model call", async () => {
      const news = result("https://news.example/acme-breach", { title: "Acme data breach" });
      const web = fakeWeb([[news]]);
      const script = [
        searchStep("Acme data breach", "security_incidents"),
        readStep(news.url, "security_incidents"),
        finishStep,
        finishStep,
      ];
      let call = 0;
      const generate = jest.fn(
        async (params: SelfCorrectingParams<unknown>): Promise<SelfCorrectingResult<unknown>> => {
          const usage = {
            inputTokens: 1000 * (call + 1),
            outputTokens: 10 * (call + 1),
            totalTokens: 1010 * (call + 1),
          };
          params.onUsage?.(usage);
          return {
            object: script[call++],
            attempts: call === 2 ? 2 : 1,
            selfCorrected: false,
            fellBackToJsonObject: false,
            usage,
          };
        },
      ) as unknown as typeof generateObjectWithSelfCorrection;
      const trace = createTraceRecorder();
      const research = createVendorResearcher({ ...web, generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

      const snapshot = trace.snapshot();
      expect(snapshot.steps.map((step) => [step.tool, step.outcome])).toEqual([
        ["preflight", "ok"],
        ["search", "ok"],
        ["read", "ok"],
        ["finish", "refused"],
        ["finish", "ok"],
      ]);
      expect(snapshot.steps[1]).toMatchObject({
        category: "security_incidents",
        kind: "news",
        query: "Acme data breach",
        results: 1,
      });
      expect(snapshot.modelCalls).toHaveLength(4);
      expect(snapshot.modelCalls.every((entry) => entry.purpose === "loop")).toBe(true);
      expect(snapshot.modelCalls[0]).toMatchObject({ inputTokens: 1000, ok: true });
      expect(snapshot.modelCalls[1]).toMatchObject({ attempts: 2, inputTokens: 2000 });
      expect(snapshot.totals).toMatchObject({ modelCalls: 4, inputTokens: 10_000 });
    });

    it("gives the actions of one step the number of its model turn", async () => {
      const news = result("https://news.example/acme-breach", { title: "Acme data breach" });
      const web = fakeWeb([[news]]);
      const model = scriptedModel([
        stepOf(
          "Search and read.",
          {
            action: "search",
            category: "security_incidents",
            query: "Acme data breach",
            kind: "news",
          },
          { action: "read", category: "security_incidents", url: news.url },
        ),
        // The first finish is answered with the reminder that other categories are not covered.
        finishStep,
        finishStep,
      ]);
      const trace = createTraceRecorder();
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

      expect(trace.snapshot().steps.map((step) => [step.tool, step.turn])).toEqual([
        ["preflight", undefined],
        ["search", 1],
        ["read", 1],
        ["finish", 2],
        ["finish", 3],
      ]);
    });

    it("records a model call that threw, with the tokens it used before it failed", async () => {
      const web = fakeWeb();
      const generate = jest.fn(async (params: SelfCorrectingParams<unknown>) => {
        params.onUsage?.({ inputTokens: 50, outputTokens: 5, totalTokens: 55 });
        throw new Error("The provider failed.");
      }) as unknown as typeof generateObjectWithSelfCorrection;
      const trace = createTraceRecorder();
      const research = createVendorResearcher({ ...web, generate });

      const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

      expect(outcome.stoppedBecause).toBe("model_error");
      expect(trace.snapshot().modelCalls).toEqual([
        expect.objectContaining({ purpose: "loop", ok: false, inputTokens: 50, totalTokens: 55 }),
      ]);
    });

    it("counts what was left out of the evidence by reason, on the step and in the totals", async () => {
      const about = result("https://news.example/acme-breach", { title: "Acme data breach" });
      const elsewhere = result("https://news.example/cake", {
        title: "Lemon cake",
        snippet: "Flour and sugar.",
      });
      const broken = result("https://acme.com/%E2%80%9D");
      const old = result("https://news.example/old-acme", {
        title: "Acme old story",
        publishedAt: THIRTY_MONTHS_AGO,
      });
      const web = fakeWeb([[about, elsewhere, broken, old]]);
      const model = scriptedModel([
        searchStep("Acme data breach", "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const trace = createTraceRecorder();
      const research = createVendorResearcher({ ...web, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

      const snapshot = trace.snapshot();
      expect(snapshot.steps[1]).toMatchObject({
        tool: "search",
        results: 1,
        omitted: { off_topic: 1, bad_address: 1, old: 1 },
      });
      expect(snapshot.dropped).toMatchObject({
        "source.off_topic": 1,
        "source.bad_address": 1,
        "source.old": 1,
      });
    });

    it("never lets a result that does not name the vendor into the evidence", async () => {
      const about = result("https://news.example/acme-breach", { title: "Acme data breach" });
      const elsewhere = result("https://news.example/cake", {
        title: "Lemon cake",
        snippet: "Flour and sugar.",
      });
      const web = fakeWeb([[elsewhere, about]]);
      const model = scriptedModel([
        searchStep("Acme data breach", "security_incidents"),
        finishStep,
        finishStep,
      ]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.entries.map((entry) => entry.url)).toEqual([about.url]);
    });

    it("leaves the result as it is when no trace is given", async () => {
      const web = fakeWeb();
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...web, generate: model.generate });

      const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.stoppedBecause).toBe("finished");
    });
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
      // Every call counts its own tokens, so `onUsage` is the one thing that differs.
      expect({ ...second, onUsage: undefined }).toEqual({
        ...first,
        onUsage: undefined,
        model: model.calls[1].model,
        prompt: second.prompt,
      });
      expect(second.onUsage).toEqual(expect.any(Function));
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

    it("uses the wrapped model after a call that fell back and then threw", async () => {
      const inner = innerModel();
      // The first call falls back and then gives up on the answer, which the loop takes for an
      // answer that holds no step: no result reports the fall back.
      const model = scriptedModel([{ fallsBackThenThrows: unparseable() }, finishStep, finishStep]);
      const research = createVendorResearcher({ ...fakeWeb(), generate: model.generate });

      const outcome = await research({ target: WITH_DOMAIN, model: inner, now: NOW });

      const [first, second, third] = model.calls;
      expect(first.model).toBe(inner);
      expect(second.model).not.toBe(inner);
      expect(third.model).toBe(second.model);
      expect(outcome.jsonObjectFallback).toBe(true);
    });

    it("says on the result whether the run learned the fall back", async () => {
      const inner = innerModel();
      const fellBack = scriptedModel([finishStep, finishStep], [true, false]);
      const notFellBack = scriptedModel([finishStep, finishStep], [false, false]);

      const learned = await createVendorResearcher({
        ...fakeWeb(),
        generate: fellBack.generate,
      })({ target: WITH_DOMAIN, model: inner, now: NOW });
      const notLearned = await createVendorResearcher({
        ...fakeWeb(),
        generate: notFellBack.generate,
      })({ target: WITH_DOMAIN, model: inner, now: NOW });

      expect(learned.jsonObjectFallback).toBe(true);
      expect(notLearned.jsonObjectFallback).toBe(false);
    });

    it("does not carry a fall back learned from the hook into the next run", async () => {
      const inner = innerModel();
      const model = scriptedModel([
        // The first run.
        { fallsBackThenThrows: unparseable() },
        finishStep,
        finishStep,
        // The second run.
        finishStep,
        finishStep,
      ]);
      const research = createVendorResearcher({ ...fakeWeb(), generate: model.generate });

      const first = await research({ target: WITH_DOMAIN, model: inner, now: NOW });
      const second = await research({ target: WITH_DOMAIN, model: inner, now: NOW });

      expect(model.calls[1].model).not.toBe(inner);
      expect(model.calls[3].model).toBe(inner);
      expect(model.calls[4].model).toBe(inner);
      expect(first.jsonObjectFallback).toBe(true);
      expect(second.jsonObjectFallback).toBe(false);
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
        createGdeltEngine: jest.spyOn(gdeltSearchModule, "createGdeltEngine"),
        createProviderSearchEngine: jest.spyOn(providerSearchModule, "createProviderSearchEngine"),
        createPageReader: jest.spyOn(readPageModule, "createPageReader"),
      };
    }

    it("builds the GDELT engine and a new page reader for every run, and makes no request but those of the check", async () => {
      const spies = spyOnTheWeb();
      const model = scriptedModel([finishStep, finishStep, finishStep, finishStep]);
      const research = createVendorResearcher({ generate: model.generate });

      const first = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });
      const second = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(first.stoppedBecause).toBe("finished");
      expect(second.stoppedBecause).toBe("finished");
      // An engine and a reader per run: every run has a robots.txt cache of its own, and the engines
      // share the search queue of the process. A run that says nothing of its key searches the
      // news, and builds no search of a provider.
      expect(spies.createGdeltEngine).toHaveBeenCalledTimes(2);
      expect(spies.createProviderSearchEngine).not.toHaveBeenCalled();
      expect(spies.createPageReader).toHaveBeenCalledTimes(2);
      // The requests of a run are the two attempts of the check of the home page (the bare domain,
      // then its www form), through the guarded fetch; they fail here, which closes the site.
      expect(spies.fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://acme.com/",
        "https://www.acme.com/",
        "https://acme.com/",
        "https://www.acme.com/",
      ]);
    });

    it("hands on the reader it built for the run", async () => {
      const spies = spyOnTheWeb();
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ generate: model.generate });

      const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.readPage).toBe(spies.createPageReader.mock.results[0].value);
    });

    it("builds the engine and the reader of each run on the cache it was given, and on none by default", async () => {
      const spies = spyOnTheWeb();
      const { cache } = memoryCache();
      const model = scriptedModel([finishStep, finishStep, finishStep, finishStep]);

      await createVendorResearcher({ generate: model.generate, cache })({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
      });
      await createVendorResearcher({ generate: model.generate })({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
      });

      // The engine keeps its index of the news and the robots.txt of its host in the cache.
      expect(spies.createGdeltEngine).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ cache }),
      );
      expect(spies.createPageReader).toHaveBeenNthCalledWith(1, { cache });
      expect(spies.createGdeltEngine.mock.calls[1][0]).not.toHaveProperty(
        "cache",
        expect.anything(),
      );
      expect(spies.createPageReader.mock.calls[1][0]).not.toHaveProperty(
        "cache",
        expect.anything(),
      );
    });

    it("builds the reader of each run with the browser it was given, and with none by default", async () => {
      const spies = spyOnTheWeb();
      const { cache } = memoryCache();
      const render = jest.fn();
      const model = scriptedModel([finishStep, finishStep, finishStep, finishStep]);

      await createVendorResearcher({ generate: model.generate, cache, render })({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
      });
      await createVendorResearcher({ generate: model.generate, cache })({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
      });

      // The one browser of the process goes to the reader of the run, next to the cache.
      expect(spies.createPageReader.mock.calls[0][0]).toEqual({ cache, render });
      expect(spies.createPageReader.mock.calls[0][0]?.render).toBe(render);
      // Without one, the reader is built as it was before: a page that needs a script is reported as such.
      expect(spies.createPageReader).toHaveBeenNthCalledWith(2, { cache });
      expect(spies.createPageReader.mock.calls[1][0]).not.toHaveProperty("render");
    });

    it("reads the home page of a vendor from the cache when an earlier run kept it: no request at all", async () => {
      const spies = spyOnTheWeb();
      const { cache, seed } = memoryCache();
      seed(
        "page",
        "https://acme.com/",
        JSON.stringify({
          url: "https://acme.com/",
          title: "Acme | Cloud hosting",
          publishedAt: null,
          text: "Acme is a cloud hosting company. ".repeat(30),
          links: [{ text: "Trust center", url: "https://trust.acme.com/" }],
          canonicalUrl: null,
        }),
      );
      const model = scriptedModel([finishStep, finishStep]);
      const trace = createTraceRecorder({ now: () => 0 });

      const outcome = await createVendorResearcher({ generate: model.generate, cache })({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
        trace,
      });

      expect(spies.fetch).not.toHaveBeenCalled();
      // The site answered, so no category counts as pages that could not be read.
      expect(outcome.calls).toEqual([]);
      expect(trace.snapshot().steps[0]).toEqual(
        expect.objectContaining({ tool: "preflight", outcome: "ok" }),
      );
      expect(model.calls[0].prompt).toContain("Trust center");
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
        // The home page of the site could not be fetched, so the site is closed: the two categories
        // that need it count as pages that could not be read.
        calls: [
          { category: "certifications", tool: "read", answered: false, failure: "unreachable" },
          { category: "ai_specific", tool: "read", answered: false, failure: "unreachable" },
        ],
        searchesUsed: 0,
        pagesRead: 0,
        siteNames: [],
        policyPages: [],
        stoppedBecause: "finished",
        modelError: null,
        jsonObjectFallback: false,
        readPage: expect.any(Function),
        // Nothing was searched, so no engine was used.
        searchEngine: null,
      });
      // The first finish is answered with a reminder, the second one ends the loop.
      expect(model.doGenerateCalls).toHaveLength(2);
      expect(spies.createGdeltEngine).toHaveBeenCalled();
      expect(spies.createPageReader).toHaveBeenCalled();
      expect(spies.fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://acme.com/",
        "https://www.acme.com/",
      ]);
    });
  });
});

describe("createVendorResearcher: the search engine of each run", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const CLAUDE: SearchSpec = { engine: "anthropic" };
  const GDELT: SearchSpec = { engine: "gdelt" };

  /** A result that names the vendor, so that the session keeps it. */
  const HIT = result("https://news.example/acme-breach");

  /** An engine of the kind a researcher builds for a key, with its searches written down. */
  function engineOf(
    id: "anthropic" | "gdelt",
    answer: (query: string) => SearchResult[] = () => [HIT],
  ) {
    const search = jest.fn<Promise<SearchResult[]>, [string, SearchKind, AbortSignal?]>(
      async (query) => answer(query),
    );
    const engine: SearchEngine =
      id === "gdelt"
        ? { id, kinds: ["news"], newsWindowMonths: 3, search }
        : { id, kinds: ["web", "news"], newsWindowMonths: null, search };
    return { engine, search };
  }

  /** An engine of Claude that is refused: the key is not allowed to search. */
  const refusedClaude = () =>
    engineOf("anthropic", () => {
      throw new SearchUnavailableError();
    });

  /**
   * Puts stand-ins in the place of the two builders: each call hands out the engine of `claude` or
   * of `gdelt`, and the calls are kept. The real builders have tests of their own.
   */
  function builders(claude = engineOf("anthropic"), gdelt = engineOf("gdelt")) {
    return {
      claude,
      gdelt,
      createGdeltEngine: jest
        .spyOn(gdeltSearchModule, "createGdeltEngine")
        .mockImplementation(() => gdelt.engine),
      createProviderSearchEngine: jest
        .spyOn(providerSearchModule, "createProviderSearchEngine")
        .mockImplementation(() => claude.engine),
    };
  }

  /** A researcher that builds its engine and reads pages from a fake reader. */
  const researcherOf = (
    model: ReturnType<typeof scriptedModel>,
    deps: Parameters<typeof createVendorResearcher>[0] = {},
  ) => createVendorResearcher({ readPage: fakeWeb().readPage, generate: model.generate, ...deps });

  /** A model that makes one search of the news, and then finishes. */
  const searchOnce = () =>
    scriptedModel([searchStep("Acme data breach", "security_incidents"), finishStep, finishStep]);
  /** A model that makes two searches of the news, and then finishes. */
  const searchTwice = () =>
    scriptedModel([
      searchStep("Acme data breach", "security_incidents"),
      searchStep("Acme lawsuit", "legal_regulatory"),
      finishStep,
      finishStep,
    ]);
  const searchedQueries = (engine: { search: jest.Mock }) =>
    engine.search.mock.calls.map(([query]) => query);

  describe("an engine that is given", () => {
    it("is the engine of the run, as it is: no engine is built, whatever the key says", async () => {
      const spies = builders();
      const web = fakeWeb([[HIT]]);
      const research = createVendorResearcher({ ...web, generate: searchOnce().generate });

      const outcome = await research({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(spies.createGdeltEngine).not.toHaveBeenCalled();
      expect(spies.createProviderSearchEngine).not.toHaveBeenCalled();
      expect(web.search).toHaveBeenCalledTimes(1);
      expect(outcome.entries.map((entry) => entry.url)).toEqual([HIT.url]);
    });

    it("is the engine that the result reports once the run has searched", async () => {
      const research = createVendorResearcher({
        ...fakeWeb([[HIT]]),
        generate: searchOnce().generate,
      });

      const outcome = await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.searchEngine).toBe("replay");
    });

    it("is not reported by a run that searched nothing", async () => {
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ ...fakeWeb(), generate: model.generate });

      const outcome = await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.searchEngine).toBeNull();
    });

    it("is read as it is when the run searches: an engine that changes its id is reported as it ends", async () => {
      let live = "anthropic" as SearchEngine["id"];
      const web = fakeWeb([[HIT]]);
      const engine: SearchEngine = {
        get id() {
          return live;
        },
        kinds: ["web", "news"],
        newsWindowMonths: null,
        search: async (query, kind, signal) => {
          live = "gdelt";
          return web.search(query, kind, signal);
        },
      };
      const research = createVendorResearcher({
        readPage: web.readPage,
        engine,
        generate: searchOnce().generate,
      });

      const outcome = await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(outcome.searchEngine).toBe("gdelt");
    });
  });

  describe("with no engine given and no word of the key", () => {
    it.each([
      ["says nothing of its search", undefined],
      ["says gdelt", GDELT],
    ])("searches the news with the GDELT engine, as a run that %s does", async (_name, search) => {
      const spies = builders();
      const model = searchOnce();

      const outcome = await researcherOf(model)({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        ...(search === undefined ? {} : { search }),
      });

      expect(spies.createProviderSearchEngine).not.toHaveBeenCalled();
      expect(spies.createGdeltEngine).toHaveBeenCalledTimes(1);
      expect(searchedQueries(spies.gdelt)).toEqual(["Acme data breach"]);
      expect(spies.gdelt.search.mock.calls[0][1]).toBe("news");
      expect(outcome.entries.map((entry) => entry.url)).toEqual([HIT.url]);
      expect(outcome.searchEngine).toBe("gdelt");
    });

    it("reports no engine for a run that searched nothing", async () => {
      builders();
      const model = scriptedModel([finishStep, finishStep]);

      const outcome = await researcherOf(model)({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: GDELT,
      });

      expect(outcome.searchEngine).toBeNull();
    });

    it("builds the engine of every run for itself", async () => {
      const spies = builders();
      const model = scriptedModel([finishStep, finishStep, finishStep, finishStep]);
      const research = researcherOf(model);

      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });
      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(spies.createGdeltEngine).toHaveBeenCalledTimes(2);
    });
  });

  describe("the GDELT engine", () => {
    const depsOf = (spies: ReturnType<typeof builders>) => spies.createGdeltEngine.mock.calls[0][0];

    it("is told the names of the vendor and the words of the news it looks for", async () => {
      const spies = builders();

      await researcherOf(scriptedModel([finishStep, finishStep]))({
        target: { ...WITHOUT_DOMAIN, aliases: ["Initech"] },
        model: MODEL,
        now: NOW,
      });

      expect(depsOf(spies).names).toEqual(["Acme", "Initech"]);
      expect(depsOf(spies).topics).toEqual([...NEWS_TOPIC_WORDS, "FTC", "settlement"]);
      expect(depsOf(spies).topics).toEqual(expect.arrayContaining(["breach", "lawsuit", "outage"]));
    });

    it("is told the names the home page gave the vendor too, after the ones a person wrote", async () => {
      const spies = builders();
      const web = fakeWeb();
      web.readPage.mockImplementation(async (url) => ({
        url,
        title: "Acme Cloud",
        publishedAt: null,
        text: "Acme Cloud hosting for teams.",
        links: [],
        identity: { names: ["AcmeAI"], products: ["Acme Vault"] },
      }));

      await createVendorResearcher({
        readPage: web.readPage,
        generate: scriptedModel([finishStep, finishStep]).generate,
      })({
        target: { ...WITH_DOMAIN, aliases: ["Initech"] },
        model: MODEL,
        now: NOW,
      });

      expect(depsOf(spies).names).toEqual(["Acme", "Initech", "AcmeAI"]);
    });

    it.each([
      ["a vendor with no country on record", WITHOUT_DOMAIN, ["FTC", "settlement"]],
      [
        "a vendor in the United Kingdom",
        { ...WITHOUT_DOMAIN, identifiers: { country: "GB" } },
        ["ICO fine", "settlement"],
      ],
      [
        "a vendor in a market of another language, whose authority is asked for in its language",
        { ...WITHOUT_DOMAIN, identifiers: { country: "DE" } },
        [],
      ],
    ])("is told the authorities of the jurisdiction of %s", async (_name, target, regulators) => {
      const spies = builders();

      await researcherOf(scriptedModel([finishStep, finishStep]))({
        target,
        model: MODEL,
        now: NOW,
      });

      expect(regulatorTopicsOf(target)).toEqual(regulators);
      expect(depsOf(spies).topics).toEqual([...NEWS_TOPIC_WORDS, ...regulators]);
    });

    it("is the engine of a key of Claude too, behind the search of Claude", async () => {
      const spies = builders();

      await researcherOf(scriptedModel([finishStep, finishStep]))({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(spies.createGdeltEngine).toHaveBeenCalledTimes(1);
      expect(depsOf(spies).names).toEqual(["Acme"]);
    });

    describe("the retries it makes", () => {
      function countingMetrics() {
        const retries: Array<{ kind: string }> = [];
        const metrics: ResearchMetrics = {
          findingDecided: jest.fn(),
          searchFinished: jest.fn(),
          searchRetried: (search) => retries.push(search),
          cacheLookup: jest.fn(),
        };
        return { metrics, retries };
      }

      it.each([
        ["a key with no search of its own", undefined],
        ["a key of Claude, whose fallback it is", CLAUDE],
      ])("are counted as retried searches of the news for %s", async (_name, search) => {
        const spies = builders();
        const counted = countingMetrics();

        await researcherOf(scriptedModel([finishStep, finishStep]), { metrics: counted.metrics })({
          target: WITHOUT_DOMAIN,
          model: MODEL,
          now: NOW,
          search,
        });
        // Nothing was asked a second time during the run: the counter has not moved.
        expect(counted.retries).toEqual([]);
        // The engine tells the hook each time it asks again; the hook counts it.
        expect(depsOf(spies).onRetry).toBeInstanceOf(Function);
        depsOf(spies).onRetry?.();
        depsOf(spies).onRetry?.();

        expect(counted.retries).toEqual([{ kind: "news" }, { kind: "news" }]);
      });

      it("go to the counters of the researcher that was given, not to those of another", async () => {
        const spies = builders();
        const first = countingMetrics();
        const second = countingMetrics();

        await researcherOf(scriptedModel([finishStep, finishStep]), { metrics: first.metrics })({
          target: WITHOUT_DOMAIN,
          model: MODEL,
          now: NOW,
        });
        await researcherOf(scriptedModel([finishStep, finishStep]), { metrics: second.metrics })({
          target: WITHOUT_DOMAIN,
          model: MODEL,
          now: NOW,
        });
        spies.createGdeltEngine.mock.calls[1][0].onRetry?.();

        expect(first.retries).toEqual([]);
        expect(second.retries).toEqual([{ kind: "news" }]);
      });
    });
  });

  describe("for a key of Claude", () => {
    it("searches with Claude on the model of the run, and reports it", async () => {
      const spies = builders();

      const outcome = await researcherOf(searchOnce())({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        modelId: "claude-x",
        now: NOW,
        search: CLAUDE,
      });

      expect(spies.createProviderSearchEngine).toHaveBeenCalledTimes(1);
      expect(spies.createProviderSearchEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "anthropic",
          model: MODEL,
          onCall: expect.any(Function),
        }),
      );
      expect(searchedQueries(spies.claude)).toEqual(["Acme data breach"]);
      expect(spies.claude.search.mock.calls[0][1]).toBe("news");
      expect(spies.gdelt.search).not.toHaveBeenCalled();
      expect(outcome.entries.map((entry) => entry.url)).toEqual([HIT.url]);
      expect(outcome.searchEngine).toBe("anthropic");
    });

    it("moves the run to GDELT when the key is not allowed to search: that search and the later ones", async () => {
      const spies = builders(refusedClaude());

      const outcome = await researcherOf(searchTwice())({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(spies.claude.search).toHaveBeenCalledTimes(1);
      expect(searchedQueries(spies.gdelt)).toEqual(["Acme data breach", "Acme lawsuit"]);
      expect(outcome.entries.map((entry) => entry.url)).toEqual([HIT.url]);
    });

    it("reports gdelt for a run that fell back, and counts the search that made it fall back", async () => {
      builders(refusedClaude());

      const outcome = await researcherOf(searchTwice())({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(outcome.searchEngine).toBe("gdelt");
      // Both searches were answered, the first by the engine that took over.
      expect(outcome.searchesUsed).toBe(2);
      expect(outcome.calls).toEqual([
        { category: "security_incidents", tool: "search", answered: true, failure: null },
        { category: "legal_regulatory", tool: "search", answered: true, failure: null },
      ]);
    });

    it("does not move the run for a search that merely failed: the next search asks Claude again", async () => {
      const claude = engineOf("anthropic");
      claude.search.mockRejectedValueOnce(new SearchEngineError());
      const spies = builders(claude);

      const outcome = await researcherOf(searchTwice())({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(searchedQueries(spies.claude)).toEqual(["Acme data breach", "Acme lawsuit"]);
      expect(spies.gdelt.search).not.toHaveBeenCalled();
      expect(outcome.searchEngine).toBe("anthropic");
      expect(outcome.calls.map((call) => call.answered)).toEqual([false, true]);
    });

    it("builds the engine of every run for itself: a key that was refused once is asked again by the next run", async () => {
      const refused = refusedClaude();
      const healthy = engineOf("anthropic");
      const gdelt = engineOf("gdelt");
      jest.spyOn(gdeltSearchModule, "createGdeltEngine").mockImplementation(() => gdelt.engine);
      const createClaude = jest
        .spyOn(providerSearchModule, "createProviderSearchEngine")
        .mockImplementationOnce(() => refused.engine)
        .mockImplementationOnce(() => healthy.engine);
      const research = researcherOf(
        scriptedModel([
          searchStep("Acme data breach", "security_incidents"),
          finishStep,
          finishStep,
          searchStep("Acme data breach", "security_incidents"),
          finishStep,
          finishStep,
        ]),
      );

      const first = await research({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });
      const second = await research({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(createClaude).toHaveBeenCalledTimes(2);
      expect(first.searchEngine).toBe("gdelt");
      expect(second.searchEngine).toBe("anthropic");
      expect(healthy.search).toHaveBeenCalledTimes(1);
    });

    it("reports no engine for a run that searched nothing", async () => {
      builders();

      const outcome = await researcherOf(scriptedModel([finishStep, finishStep]))({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(outcome.searchEngine).toBeNull();
    });

    it("searches the news with GDELT, and builds no search of Claude, when the model is not an object it could call", async () => {
      const spies = builders();

      const outcome = await researcherOf(searchOnce())({
        target: WITHOUT_DOMAIN,
        model: "claude-x",
        now: NOW,
        search: CLAUDE,
      });

      expect(spies.createProviderSearchEngine).not.toHaveBeenCalled();
      expect(searchedQueries(spies.gdelt)).toEqual(["Acme data breach"]);
      expect(outcome.searchEngine).toBe("gdelt");
    });

    describe("in the trace", () => {
      const call = { inputTokens: 900, outputTokens: 12, totalTokens: 912, ms: 340, ok: true };

      it("writes each call that the search made as a model call for the search, with its tokens", async () => {
        const spies = builders();
        const trace = createTraceRecorder({ now: () => 0 });
        await researcherOf(scriptedModel([finishStep, finishStep]))({
          target: WITHOUT_DOMAIN,
          model: MODEL,
          modelId: "claude-x",
          now: NOW,
          search: CLAUDE,
          trace,
        });
        const { onCall } = spies.createProviderSearchEngine.mock.calls[0][0];

        onCall?.(call);
        onCall?.({ inputTokens: 0, outputTokens: 0, totalTokens: 0, ms: 15, ok: false });

        const searches = trace.snapshot().modelCalls.filter(({ purpose }) => purpose === "search");
        expect(searches).toEqual([
          {
            purpose: "search",
            model: "claude-x",
            ms: 340,
            inputTokens: 900,
            outputTokens: 12,
            totalTokens: 912,
            ok: true,
          },
          {
            purpose: "search",
            model: "claude-x",
            ms: 15,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            ok: false,
          },
        ]);
      });

      it("counts the tokens of the searches among the tokens of the run", async () => {
        const spies = builders();
        const trace = createTraceRecorder({ now: () => 0 });
        await researcherOf(scriptedModel([finishStep, finishStep]))({
          target: WITHOUT_DOMAIN,
          model: MODEL,
          now: NOW,
          search: CLAUDE,
          trace,
        });
        const before = trace.snapshot().totals;

        spies.createProviderSearchEngine.mock.calls[0][0].onCall?.(call);

        const after = trace.snapshot().totals;
        expect(after.modelCalls).toBe(before.modelCalls + 1);
        expect(after.totalTokens).toBe(before.totalTokens + 912);
      });

      it("has no model call for a run that searched with GDELT: the news costs no tokens", async () => {
        builders();
        const trace = createTraceRecorder({ now: () => 0 });

        await researcherOf(searchOnce())({
          target: WITHOUT_DOMAIN,
          model: MODEL,
          now: NOW,
          trace,
        });

        expect(trace.snapshot().modelCalls.filter(({ purpose }) => purpose === "search")).toEqual(
          [],
        );
      });

      it("is not needed: a run without a trace takes the calls of the search without a word", async () => {
        const spies = builders();
        await researcherOf(scriptedModel([finishStep, finishStep]))({
          target: WITHOUT_DOMAIN,
          model: MODEL,
          now: NOW,
          search: CLAUDE,
        });
        const { onCall } = spies.createProviderSearchEngine.mock.calls[0][0];

        expect(() => onCall?.(call)).not.toThrow();
      });
    });
  });

  describe("with the cache that runs share", () => {
    /** A run of the vendor for an organization (or for none) that makes one search. */
    async function searchedFor(organizationId: number | undefined, cache: WebCache) {
      const outcome = await researcherOf(searchOnce(), { cache })({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
        ...(organizationId === undefined ? {} : { organizationId }),
      });
      await settle();
      return outcome;
    }

    it("serves a search that an earlier run of the same organization paid for, and asks Claude again for another organization", async () => {
      const { cache } = memoryCache();
      const spies = builders();

      await searchedFor(7, cache);
      const again = await searchedFor(7, cache);
      expect(spies.claude.search).toHaveBeenCalledTimes(1);
      // What came from the cache is the same answer, and the run still searched with Claude.
      expect(again.entries.map((entry) => entry.url)).toEqual([HIT.url]);
      expect(again.searchEngine).toBe("anthropic");

      await searchedFor(8, cache);
      expect(spies.claude.search).toHaveBeenCalledTimes(2);
    });

    it("keeps nothing of Claude's answers for a run that is not told its organization: the answers would have no owner", async () => {
      const { cache, writes } = memoryCache();
      const spies = builders();

      await searchedFor(undefined, cache);
      await searchedFor(undefined, cache);

      expect(spies.claude.search).toHaveBeenCalledTimes(2);
      expect(writes.filter(({ kind }) => kind === "search")).toEqual([]);
    });

    it("keeps Claude's answers in the cache of searches, under the organization", async () => {
      const { cache, writes } = memoryCache();
      builders();

      await searchedFor(7, cache);

      const kept = writes.filter(({ kind }) => kind === "search");
      expect(kept).toHaveLength(1);
      expect(kept[0].key).toContain("org:7");
      expect(kept[0].key).toContain("anthropic");
    });

    it("gives the cache to GDELT for its index and keeps GDELT out of the cache of searches", async () => {
      const { cache, writes, reads } = memoryCache();
      const spies = builders();

      const outcome = await researcherOf(searchOnce(), { cache })({
        target: WITHOUT_DOMAIN,
        model: MODEL,
        now: NOW,
        organizationId: 7,
      });
      await settle();

      expect(spies.createGdeltEngine).toHaveBeenCalledWith(expect.objectContaining({ cache }));
      expect(outcome.searchEngine).toBe("gdelt");
      expect([...reads, ...writes].filter(({ kind }) => kind === "search")).toEqual([]);
    });

    it("keeps nothing in the cache of searches for the search that fell back: GDELT's answer is not Claude's", async () => {
      const { cache, writes } = memoryCache();
      builders(refusedClaude());

      const outcome = await searchedFor(7, cache);

      expect(outcome.searchEngine).toBe("gdelt");
      expect(writes.filter(({ kind }) => kind === "search")).toEqual([]);
    });
  });

  describe("the prompt of the loop", () => {
    const NEWS_ONLY_PROMPT = buildLoopSystemPrompt({ kinds: ["news"], newsWindowMonths: 3 });

    it("describes what the engine of the run answers: the news only, and how far back it reaches", async () => {
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({
        engine: engineOf("gdelt").engine,
        readPage: fakeWeb().readPage,
        generate: model.generate,
      });

      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(model.calls[0].system).toBe(NEWS_ONLY_PROMPT);
      expect(model.calls[0].system).toContain("The news covers the last 3 months only");
      expect(model.calls[0].system).not.toContain('(kind "web")');
    });

    it("is the prompt it always was for an engine that answers both kinds with no limit on its news", async () => {
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({
        engine: engineOf("anthropic").engine,
        readPage: fakeWeb().readPage,
        generate: model.generate,
      });

      await research({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW });

      expect(model.calls[0].system).toBe(buildLoopSystemPrompt());
      expect(model.calls[0].system).toContain(
        'Search the whole web (kind "web") when the news has nothing.',
      );
      expect(model.calls[0].system).not.toContain("covers the last");
    });

    it("is the prompt of the news for a key with no search of its own: the engine built for it is GDELT's", async () => {
      builders();
      const model = scriptedModel([finishStep, finishStep]);

      await researcherOf(model)({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW, search: GDELT });

      expect(model.calls[0].system).toBe(NEWS_ONLY_PROMPT);
    });

    it("is the prompt of both kinds for a key of Claude, whose search answers both", async () => {
      builders();
      const model = scriptedModel([finishStep, finishStep]);

      await researcherOf(model)({ target: WITHOUT_DOMAIN, model: MODEL, now: NOW, search: CLAUDE });

      expect(model.calls[0].system).toBe(buildLoopSystemPrompt());
    });

    it("is the same for every loop of a run with one loop for each category", async () => {
      builders();
      const model = categoryModel();
      const research = createVendorResearcher({
        readPage: namedWeb().readPage,
        generate: model.generate,
        perCategory: true,
        gather: true,
      });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, search: GDELT });

      expect(model.loopCalls().length).toBeGreaterThan(1);
      for (const call of model.loopCalls()) expect(call.system).toBe(NEWS_ONLY_PROMPT);
    });

    it("is built when the loop starts, from what the engine answers by then", async () => {
      // The engine loses the web while the site is checked, which is before the loop: the way a
      // key that is refused moves the run to the news, once the routine work has searched.
      const state = { kinds: ["web", "news"] as SearchKind[], months: null as number | null };
      const engine: SearchEngine = {
        id: "anthropic",
        get kinds() {
          return state.kinds;
        },
        get newsWindowMonths() {
          return state.months;
        },
        search: async () => [],
      };
      const readPage = jest.fn(async (url: string) => {
        state.kinds = ["news"];
        state.months = 3;
        return { url, title: "Acme", publishedAt: null, text: "Acme", links: [] };
      });
      const model = scriptedModel([finishStep, finishStep]);
      const research = createVendorResearcher({ engine, readPage, generate: model.generate });

      await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

      expect(readPage).toHaveBeenCalled();
      expect(model.calls[0].system).toBe(NEWS_ONLY_PROMPT);
    });

    it("tells the loop of a key of Claude that was refused during the routine work that it can search the news only", async () => {
      const spies = builders(refusedClaude());
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);

      const outcome = await researcherOf(model, { gather: true })({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      // The first call of the model is the call for hints; the first step of the loop is the second.
      expect(spies.gdelt.search).toHaveBeenCalled();
      expect(outcome.searchEngine).toBe("gdelt");
      expect(model.calls[0].system).toBe(buildHintsSystemPrompt());
      expect(model.calls[1].system).toBe(NEWS_ONLY_PROMPT);
    });

    it("tells the loop of a key of Claude that was not refused that it can search the web too", async () => {
      builders();
      const model = scriptedModel([NO_HINTS, finishStep, finishStep]);

      await researcherOf(model, { gather: true })({
        target: WITH_DOMAIN,
        model: MODEL,
        now: NOW,
        search: CLAUDE,
      });

      expect(model.calls[1].system).toBe(buildLoopSystemPrompt());
    });
  });
});

describe("runEvalCase: the trace of a run", () => {
  it("is the trace that the caller gives, so that what its engine wrote there before the run is kept", async () => {
    // A live run builds the engine of the key of the organization, whose search writes its calls
    // into the trace of the run, and so it must make the trace before the run does.
    const trace = createTraceRecorder({ now: () => 0 });
    trace.modelCall({ purpose: "search", model: "claude-x", ms: 7, totalTokens: 100, ok: true });

    const run = await runEvalCase(EVAL_CASES[0], { trace });

    expect(run.trace.modelCalls[0]).toEqual({
      purpose: "search",
      model: "claude-x",
      ms: 7,
      totalTokens: 100,
      ok: true,
    });
    // The run wrote its own steps into the same trace.
    expect(run.trace.steps.length).toBeGreaterThan(0);
    expect(run.trace.phases.map((phase) => phase.name)).toContain("research");
  });

  it("is a new one for each run when the caller gives none", async () => {
    const first = await runEvalCase(EVAL_CASES[0]);
    const second = await runEvalCase(EVAL_CASES[0]);

    expect(second.trace.modelCalls).toHaveLength(first.trace.modelCalls.length);
    expect(second.trace.steps).toHaveLength(first.trace.steps.length);
  });
});

describe("createVendorResearcher: the parts of a long page", () => {
  const POLICY = "https://acme.com/policy";
  const LONG = "word ".repeat(5000);

  /** The vendor's own policy page is long; every other page is short. */
  function webWithLongPolicy() {
    const web = fakeWeb();
    web.readPage.mockImplementation(async (url) => ({
      url,
      title: `Page at ${url}`,
      publishedAt: null,
      text: url === POLICY ? LONG : `Text of ${url}`,
      links: [],
    }));
    return web;
  }

  const partStep = (part: number): LoopStep<ResearchCategory> =>
    stepOf(`Part ${part}`, { action: "read", category: "certifications", url: POLICY, part });

  it("keeps the part a read asked for in the trace, and nothing for a read that asked for none", async () => {
    const web = webWithLongPolicy();
    const model = scriptedModel([
      readStep(POLICY, "certifications"),
      partStep(2),
      finishStep,
      finishStep,
    ]);
    const trace = createTraceRecorder();
    const research = createVendorResearcher({ ...web, generate: model.generate });

    await research({ target: WITH_DOMAIN, model: MODEL, now: NOW, trace });

    const reads = trace
      .snapshot()
      .steps.filter((step) => step.tool === "read" && step.url === POLICY);
    expect(reads).toHaveLength(2);
    expect(reads[0]).toMatchObject({ outcome: "ok" });
    expect("part" in reads[0]).toBe(false);
    expect(reads[1]).toMatchObject({ outcome: "ok", part: 2, results: 1 });
  });

  it("puts the page and the part the model asked for in the evidence, side by side", async () => {
    const web = webWithLongPolicy();
    const model = scriptedModel([
      readStep(POLICY, "certifications"),
      partStep(2),
      finishStep,
      finishStep,
    ]);
    const research = createVendorResearcher({ ...web, generate: model.generate });

    const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

    const policy = outcome.entries.find((entry) => entry.url === POLICY);
    expect(policy?.kind).toBe("page");
    // The first excerpt, the gap marker, then the part.
    expect(policy?.content.split("\n[…]\n")).toHaveLength(2);
    expect(web.readPage.mock.calls.filter(([url]) => url === POLICY)).toHaveLength(1);
  });
});

describe("the pages where the vendor states its terms", () => {
  const HOME = "https://acme.com/";

  const pageAt = (url: string, fields: Partial<FetchedPage> = {}): FetchedPage => ({
    url,
    title: `Acme: ${url}`,
    publishedAt: null,
    text: `Acme text of ${url}`,
    links: [],
    ...fields,
  });

  /**
   * A web that answers the home page and the pages given, by the address asked, and cannot reach
   * any other. `searches` are the answers of the engine, in turn.
   */
  function webOf(pages: Record<string, Partial<FetchedPage>>, searches: SearchResult[][] = []) {
    const answers: Record<string, Partial<FetchedPage>> = { [HOME]: {}, ...pages };
    const web = fakeWeb(searches);
    web.readPage.mockImplementation(async (url) => {
      const page = answers[url];
      if (page === undefined) throw new PageReadError("unreachable");
      return pageAt(url, page);
    });
    return web;
  }

  /** Researches with a model that takes the given steps, one after the other, and finishes. */
  async function researchSteps(
    web: ReturnType<typeof fakeWeb>,
    steps: LoopStep<ResearchCategory>[],
    target: ResearchTarget = WITH_DOMAIN,
  ) {
    const model = scriptedModel([...steps, finishStep, finishStep]);
    const research = createVendorResearcher({ ...web, generate: model.generate });
    return research({ target, model: MODEL, now: NOW });
  }

  /** Researches with a model that reads the given pages. */
  const researchReading = (
    web: ReturnType<typeof fakeWeb>,
    reads: Array<[string, ResearchCategory]>,
    target?: ResearchTarget,
  ) =>
    researchSteps(
      web,
      reads.map(([url, category]) => readStep(url, category)),
      target,
    );

  it("gives the page of the vendor's own site that states its terms, with the whole text and not the excerpt", async () => {
    const text = `Acme ${"clause ".repeat(5000)}`;
    const web = webOf({
      "https://acme.com/legal/dpa": { title: "Data Processing Addendum", text },
    });

    const outcome = await researchReading(web, [["https://acme.com/legal/dpa", "ai_specific"]]);

    expect(outcome.policyPages).toEqual([
      {
        url: "https://acme.com/legal/dpa",
        key: "acme.com/legal/dpa",
        kind: "dpa",
        title: "Data Processing Addendum",
        text,
      },
    ]);
    // The excerpt that the ledger keeps is the short one.
    const entry = outcome.entries.find((each) => each.url === "https://acme.com/legal/dpa");
    expect(entry?.kind).toBe("page");
    expect(entry?.content.length).toBeLessThan(text.length);
  });

  it("leaves out a page that is no policy page, a page of another site and a page that could not be read", async () => {
    const web = webOf(
      {
        "https://acme.com/blog/privacy-update": {},
        "https://acme.com/pricing": {},
        "https://other.example/privacy": {},
        "https://acme.com/privacy": {},
      },
      [[result("https://other.example/privacy")]],
    );

    const outcome = await researchSteps(web, [
      searchStep("Acme privacy", "ai_specific", "web"),
      readStep("https://acme.com/blog/privacy-update", "ai_specific"),
      readStep("https://acme.com/pricing", "ai_specific"),
      readStep("https://other.example/privacy", "ai_specific"),
      readStep("https://acme.com/terms", "ai_specific"),
      readStep("https://acme.com/privacy", "ai_specific"),
    ]);

    // Every page was asked for, so that it is the choice of pages and not the session that
    // leaves them out.
    expect(web.readPage.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        "https://acme.com/blog/privacy-update",
        "https://acme.com/pricing",
        "https://other.example/privacy",
        "https://acme.com/terms",
        "https://acme.com/privacy",
      ]),
    );
    expect(outcome.policyPages?.map((page) => page.url)).toEqual(["https://acme.com/privacy"]);
  });

  it("takes a page on a subdomain of the vendor's site", async () => {
    const web = webOf({ "https://trust.acme.com/trust": {} });

    const outcome = await researchReading(web, [
      ["https://trust.acme.com/trust", "certifications"],
    ]);

    expect(outcome.policyPages).toEqual([
      expect.objectContaining({ url: "https://trust.acme.com/trust", kind: "security" }),
    ]);
  });

  it("takes a page of the other domain that the home page moved to, which the session counts as the vendor's", async () => {
    const web = webOf({
      [HOME]: { url: "https://www.acme-cloud.com/", title: "Acme Cloud" },
      "https://acme-cloud.com/privacy": {},
    });

    const outcome = await researchReading(web, [["https://acme-cloud.com/privacy", "ai_specific"]]);

    expect(outcome.policyPages).toEqual([
      expect.objectContaining({ url: "https://acme-cloud.com/privacy", kind: "privacy" }),
    ]);
  });

  it("gives the page under the address that answered", async () => {
    const web = webOf({
      "https://acme.com/policy": { url: "https://acme.com/legal/privacy-policy" },
    });

    const outcome = await researchReading(web, [["https://acme.com/policy", "ai_specific"]]);

    expect(outcome.policyPages).toEqual([
      expect.objectContaining({
        url: "https://acme.com/legal/privacy-policy",
        key: "acme.com/legal/privacy-policy",
        kind: "privacy",
      }),
    ]);
  });

  it("gives a page that redirected off the vendor's site as no page of its own", async () => {
    const web = webOf({
      "https://acme.com/privacy": { url: "https://policies.example/acme/privacy" },
    });

    const outcome = await researchReading(web, [["https://acme.com/privacy", "ai_specific"]]);

    expect(web.readPage).toHaveBeenCalledWith("https://acme.com/privacy", expect.anything());
    expect(outcome.policyPages).toEqual([]);
  });

  it("keeps the first eight pages of a run", async () => {
    const urls = Array.from(
      { length: 10 },
      (_, index) => `https://acme.com/legal/privacy-${index}`,
    );
    const web = webOf(Object.fromEntries(urls.map((url) => [url, {}])));

    const outcome = await researchReading(
      web,
      urls.map((url) => [url, "ai_specific"] as [string, ResearchCategory]),
    );

    expect(outcome.pagesRead).toBe(10);
    expect(outcome.policyPages?.map((page) => page.url)).toEqual(urls.slice(0, 8));
  });

  it("gives none for a vendor with no domain, since no page is its own", async () => {
    const web = webOf({ "https://acme.com/privacy": {} }, [[result("https://acme.com/privacy")]]);

    const outcome = await researchSteps(
      web,
      [
        searchStep("Acme privacy", "legal_regulatory", "web"),
        readStep("https://acme.com/privacy", "legal_regulatory"),
      ],
      WITHOUT_DOMAIN,
    );

    expect(web.readPage).toHaveBeenCalledWith("https://acme.com/privacy", expect.anything());
    expect(outcome.policyPages).toEqual([]);
  });

  it("gives none when no such page was read", async () => {
    const outcome = await researchReading(fakeWeb(), []);

    expect(outcome.policyPages).toEqual([]);
  });

  it("gives the pages that the routine work read before the first step of the model", async () => {
    const web = namedWeb();
    const model = scriptedModel([NO_HINTS, finishStep, finishStep]);
    const research = createVendorResearcher({ ...web, generate: model.generate, gather: true });

    const outcome = await research({ target: WITH_DOMAIN, model: MODEL, now: NOW });

    const byKind = new Map(outcome.policyPages?.map((page) => [page.url, page.kind]));
    expect(byKind.get("https://acme.com/security")).toBe("security");
    expect(byKind.get("https://acme.com/privacy")).toBe("privacy");
    // The home page that the check of the website read is not one of them.
    expect([...byKind.keys()]).not.toContain(HOME);
  });

  it("does not change what the research found", async () => {
    const web = webOf({ "https://acme.com/privacy": {} });

    const outcome = await researchReading(web, [["https://acme.com/privacy", "ai_specific"]]);

    expect(outcome.entries.map((entry) => entry.url)).toEqual(["https://acme.com/privacy"]);
    expect(outcome.pagesRead).toBe(1);
    expect(outcome.stoppedBecause).toBe("finished");
  });
});
