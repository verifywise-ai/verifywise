/**
 * The ratchet over the evaluation cases. Each case lists the targets the agent is meant to meet and,
 * under `gaps`, the ones it does not meet yet, with the roadmap idea that will. This test fails
 * when a target is missed that is not a declared gap (something broke), and when a declared gap is
 * met (something was fixed: delete the line, so that the gain cannot be lost).
 *
 * The cases replay recordings through the real researcher and the real analysis. Nothing here may
 * reach the network, so the guarded fetch is replaced by one that throws.
 */
const guardedFetch = jest.fn(async () => {
  throw new Error("an evaluation case must not reach the network");
});
jest.mock("../../../webResearch/guardedFetch", () => ({
  ...jest.requireActual("../../../webResearch/guardedFetch"),
  guardedFetch,
}));

import type { RecordStatus } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { EVAL_CASES } from "../cases";
import { classify, reportCase } from "../report";
import { type CaseRun, runEvalCase } from "../runCase";
import type { EvalCase } from "../types";
import { credibilityRationale } from "../../credibilityText";
import { NAME_ONLY_LOOKUP_NOTE } from "../../records/ofac";
import { nvdConnector } from "../../vrdb/connectors/nvd";

/** The ideas of the roadmap are numbered 1 to 39. */
const IDEAS = Array.from({ length: 39 }, (_, index) => index + 1);

/** The label and the rule of each finding a run kept. */
const labels = (run: CaseRun) => run.credibility.map(({ label, basis }) => [label, basis.rule]);

/** The case with each address replaced wherever the case names it. */
function moved(evalCase: EvalCase, moves: Record<string, string>): EvalCase {
  let text = JSON.stringify(evalCase);
  for (const [from, to] of Object.entries(moves)) text = text.split(from).join(to);
  return JSON.parse(text) as EvalCase;
}

describe("the evaluation cases", () => {
  it("are thirty-eight, with distinct ids and a reason each", () => {
    expect(EVAL_CASES).toHaveLength(38);
    expect(new Set(EVAL_CASES.map((evalCase) => evalCase.id)).size).toBe(38);
    for (const evalCase of EVAL_CASES) {
      expect(evalCase.reproduces.trim()).not.toBe("");
      expect(evalCase.title.trim()).not.toBe("");
    }
  });

  it("name an idea of the roadmap for every gap, and a target for it", () => {
    for (const evalCase of EVAL_CASES) {
      for (const [name, idea] of Object.entries(evalCase.gaps)) {
        expect(IDEAS).toContain(idea);
        expect(evalCase.targets).toHaveProperty(name);
      }
    }
  });

  it("declare maxMislabelled 0 in every case", () => {
    expect(
      EVAL_CASES.filter((evalCase) => evalCase.targets.maxMislabelled !== 0).map(({ id }) => id),
    ).toEqual([]);
  });

  it("give every expected finding a credibility label, so that none is left unmeasured", () => {
    expect(
      EVAL_CASES.flatMap(({ id, expected }) =>
        expected.findings
          .filter((finding) => finding.credibility === undefined)
          .map((finding) => `${id}: ${finding.category}`),
      ),
    ).toEqual([]);
  });

  it.each(EVAL_CASES.map((evalCase) => [evalCase.id, evalCase] as const))(
    "%s: misses exactly the targets it declares as gaps",
    async (_id, evalCase) => {
      const report = reportCase(await runEvalCase(evalCase));

      const { regressions, fixed } = classify(report);
      expect({ regressions, fixed }).toEqual({ regressions: [], fixed: [] });
    },
  );

  it("replay without touching the network", async () => {
    for (const evalCase of EVAL_CASES) await runEvalCase(evalCase);

    expect(guardedFetch).not.toHaveBeenCalled();
  });

  it("give the same scores every time they run", async () => {
    const scores = async () =>
      Promise.all(
        EVAL_CASES.map(async (evalCase) => {
          const { score } = reportCase(await runEvalCase(evalCase));
          return { ...score, ms: 0 };
        }),
      );

    expect(await scores()).toEqual(await scores());
  });

  it("keep both controls clean: one finding for the breach, none for the clean record", async () => {
    const byId = (id: string) => EVAL_CASES.find((evalCase) => evalCase.id === id)!;

    const breachRun = await runEvalCase(byId("breach-two-publishers"));
    const breach = reportCase(breachRun);
    const clean = reportCase(await runEvalCase(byId("clean-record")));

    expect(breach.score).toMatchObject({ kept: 1, precision: 1, recall: 1 });
    expect(breach.score).not.toHaveProperty("overconfident");
    expect(clean.score).toMatchObject({ kept: 0, irrelevantSources: 0, citationsRejected: 0 });
    expect(breach.missed).toEqual([]);
    expect(clean.missed).toEqual([]);
    // A publisher and the vendor's own notice are two independent publishers, one of them credible:
    // the sources support a high label. A finding has no confidence of its own (M3 Part B).
    expect(breachRun.credibility.map((credibility) => credibility.label)).toEqual(["high"]);
    expect(breachRun.kept[0]).not.toHaveProperty("confidence");
  });

  it("keep one finding for the event of the three-finding case: the most severe, with its trace", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "one-event-three-findings")!;

    const run = await runEvalCase(evalCase);

    // The model proposed three findings; the attack is one event, and the data that may have been
    // copied is the most severe of its sides.
    expect(run.analysed?.ok && run.analysed.output.findings).toHaveLength(3);
    expect(run.kept.map((finding) => finding.risk_severity)).toEqual(["Major"]);
    expect(run.trace.dropped["duplicate.same_event"]).toBe(2);
  });

  it("read the page of the snippet case and find the quote on it: the finding is kept as it was", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "snippet-only-quotes")!;

    const run = await runEvalCase(evalCase);

    expect(run.kept).toHaveLength(1);
    expect(run.kept[0].snippet_only).toBeUndefined();
    expect(run.kept[0]).not.toHaveProperty("confidence");
    expect(run.trace.steps.filter((step) => step.by === "verification")).toEqual([
      expect.objectContaining({
        tool: "read",
        outcome: "confirmed",
        url: "https://www.dailyfinance.example.com/kestrel-hr-fine",
      }),
    ]);
  });

  it("read the page of the case whose quote the page does not hold: the finding is kept, marked, and low", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "quote-not-on-the-page")!;

    const run = await runEvalCase(evalCase);

    // Two publishers back the finding; the page says otherwise. The model is asked for no
    // confidence, so its answer has none, the check gives the finding none, and the label is what
    // the sources support: low, because the page contradicts the quote.
    expect(run.analysed?.ok && run.analysed.output.findings[0]).not.toHaveProperty("confidence");
    expect(run.kept).toHaveLength(1);
    expect(run.kept[0]).toMatchObject({ snippet_only: true });
    expect(run.kept[0]).not.toHaveProperty("confidence");
    expect(run.credibility[0]).toMatchObject({ label: "low", basis: { rule: "contradicted" } });
    expect(run.trace.steps.filter((step) => step.by === "verification")).toEqual([
      expect.objectContaining({
        tool: "read",
        outcome: "not_on_page",
        url: "https://www.paymentsdaily.example/heron-pay-fine",
      }),
    ]);
  });

  it("let the model read the part of a long policy that holds the clause, and keep the finding that quotes it", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "long-policy-part")!;

    const run = await runEvalCase(evalCase);

    // The first view of the policy does not show the clause: the model has to ask for its part.
    const reads = run.trace.steps.filter((step) => step.tool === "read");
    expect(reads).toEqual([
      expect.objectContaining({ outcome: "ok" }),
      expect.objectContaining({ outcome: "ok", part: expect.any(Number) }),
    ]);
    expect(reads[1].part).toBeGreaterThan(1);
    // One page was fetched: the part came from the page the run held.
    expect(run.found.pagesRead).toBe(1);
    // The quote of the finding is in the part, so the validation found it in the evidence.
    expect(run.trace.dropped).toEqual({});
    expect(run.kept.map((finding) => finding.category)).toEqual(["ai_specific"]);
  });

  it("let the verifier take away the three findings of its case that the code could not tell were wrong, and keep the fourth", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "verifier-drops-findings")!;

    const run = await runEvalCase(evalCase);

    // The model proposed four findings, and every one passed the checks of the code.
    expect(run.analysed?.ok && run.analysed.output.findings).toHaveLength(4);
    expect(run.trace.rejected).toEqual([
      expect.objectContaining({ stage: "verifier", reason: "other_company" }),
      expect.objectContaining({ stage: "verifier", reason: "not_supported" }),
      expect.objectContaining({ stage: "verifier", reason: "out_of_window" }),
    ]);
    expect(run.trace.dropped).toMatchObject({
      "verifier.other_company": 1,
      "verifier.not_supported": 1,
      "verifier.out_of_window": 1,
    });
    expect(run.kept.map((finding) => finding.category)).toEqual(["legal_regulatory"]);
    // The fine is backed by a page that holds its quote, so it is not marked.
    expect(run.kept[0].snippet_only).toBeUndefined();
    expect(run.trace.modelCalls.map((call) => call.purpose).slice(-2)).toEqual([
      "analysis",
      "verifier",
    ]);
  });

  it("let the code do the routine work of the gathered case, so that the model has one loop call to make", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "gathered-sources")!;

    const run = await runEvalCase(evalCase);

    const byCode = run.trace.steps.filter((step) => step.by === "code");
    // The sitemap, the twelve news searches (ten that the code makes and two that the model's
    // memory gave), and the six pages: four of the vendor's site and the two articles that the
    // best results led to. All by the code.
    expect(byCode).toHaveLength(19);
    expect(byCode.filter((step) => step.tool === "search").map((step) => step.query)).toEqual(
      expect.arrayContaining(["Brightline Cloud exposed bucket", "Brightline Cloud GDPR fine"]),
    );
    expect(run.found.searchesUsed).toBe(12);
    expect(run.found.pagesRead).toBe(6);
    expect(run.trace.modelCalls.map((call) => call.purpose)).toEqual(["hints", "loop", "analysis"]);
    // Two publishers back the finding, neither of them known to the registry: low, not high.
    expect(run.credibility.map((credibility) => credibility.label)).toEqual(["low"]);
  });

  it("find a vendor under the name the press uses: the one its home page gives, or the one a person wrote", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "other-names")!;
    const home = "https://harborchat.com/";
    const codeSearches = (run: Awaited<ReturnType<typeof runEvalCase>>) =>
      run.trace.steps
        .filter((step) => step.by === "code" && step.tool === "search")
        .map((step) => step.query);

    const run = await runEvalCase(evalCase);

    // The home page gives its brand ("Northwind" is only a part of the recorded name and is left
    // out), and the code searched for the vendor under it as well.
    expect(run.found.siteNames).toEqual(["HarborChat"]);
    expect(codeSearches(run)).toEqual(
      expect.arrayContaining(["HarborChat data breach", "HarborChat lawsuit"]),
    );
    // The articles name the brand and never the recorded name: they stay in the evidence, and the
    // validation accepts the quotes of the finding.
    expect(reportCase(run).score).toMatchObject({
      kept: 1,
      recall: 1,
      irrelevantSources: 0,
      citationsRejected: 0,
    });
    expect(run.trace.dropped).toEqual({});

    // The same recording with a home page that gives no names: nobody searches for the brand.
    const unnamed: EvalCase = {
      ...evalCase,
      recording: {
        ...evalCase.recording,
        pages: evalCase.recording.pages.map((entry) =>
          entry.url === home && "page" in entry
            ? { url: entry.url, page: { ...entry.page, identity: undefined } }
            : entry,
        ),
      },
    };
    const lost = await runEvalCase(unnamed);
    expect(lost.found.siteNames).toEqual([]);
    expect(codeSearches(lost)).not.toContain("HarborChat data breach");
    expect(lost.kept).toEqual([]);

    // A person who writes the brand in the vendor's record gets the same result without the page.
    const written = await runEvalCase({
      ...unnamed,
      vendor: { ...evalCase.vendor, otherNames: "HarborChat" },
    });
    expect(written.target.aliases).toEqual(["HarborChat"]);
    expect(written.found.siteNames).toEqual([]);
    expect(codeSearches(written)).toContain("HarborChat data breach");
    expect(written.kept.map((finding) => finding.category)).toEqual(["security_incidents"]);
  });

  it("find the news of a French vendor in French: the searches name the authority, and the sources stay in French", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "local-language-news")!;
    const codeSearches = (run: Awaited<ReturnType<typeof runEvalCase>>) =>
      run.trace.steps
        .filter((step) => step.by === "code" && step.tool === "search")
        .map((step) => step.query);

    const run = await runEvalCase(evalCase);

    // The country domain and the legal form say the market: the code searched in French as well.
    expect(codeSearches(run)).toEqual(
      expect.arrayContaining([
        "Brume Logiciels fuite de données",
        "Brume Logiciels cyberattaque",
        "Brume Logiciels CNIL sanction",
        "Brume Logiciels plainte",
      ]),
    );
    // The news of outages is searched in English only, whatever the market.
    expect(codeSearches(run)).toContain("Brume Logiciels outage");
    expect(run.kept.map((finding) => finding.category).sort()).toEqual([
      "legal_regulatory",
      "security_incidents",
    ]);
    // The findings are written in English, and their quotes are the French of the sources.
    expect(run.kept.map((finding) => finding.sources[0].quote)).toEqual(
      expect.arrayContaining([expect.stringContaining("amende de 150 000 euros")]),
    );
    expect(run.trace.dropped).toEqual({});

    // The same vendor with a domain and a name that say no market is searched in English only,
    // and the English press has nothing about it.
    const unplaced: EvalCase = {
      ...evalCase,
      vendor: { ...evalCase.vendor, name: "Brume Logiciels", website: "brume-logiciels.com" },
    };
    const english = await runEvalCase(unplaced);
    expect(codeSearches(english)).toEqual([
      "Brume Logiciels data breach",
      "Brume Logiciels security incident",
      "Brume Logiciels lawsuit",
      "Brume Logiciels fined",
      "Brume Logiciels FTC",
      "Brume Logiciels settlement",
      "Brume Logiciels outage",
      "Brume Logiciels layoffs",
      "Brume Logiciels bankruptcy",
      "Brume Logiciels acquisition",
    ]);
    expect(english.kept).toEqual([]);
  });

  it("finds in the public databases what the news does not hold, and cites the records as sources that were read", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "known-exploited-vulnerability")!;

    const run = await runEvalCase(evalCase);

    // The records are the first sources of their category, and they were read, not searched.
    expect(run.pack.slice(0, 2).map((source) => [source.id, source.kind, source.category])).toEqual(
      [
        ["S1", "page", "security_incidents"],
        ["S2", "page", "security_incidents"],
      ],
    );
    expect(run.pack[0].url).toBe("https://nvd.nist.gov/vuln/detail/CVE-2026-31337");
    expect(run.pack[1].url).toBe("https://haveibeenpwned.com/api/v3/breach/BriseNetworks");
    // The entry of another vendor in the same catalog did not come in.
    expect(run.pack.map((source) => source.url)).not.toContain(
      "https://nvd.nist.gov/vuln/detail/CVE-2026-20000",
    );
    expect(run.kept.map((finding) => finding.category)).toEqual([
      "security_incidents",
      "security_incidents",
    ]);
    // A finding on a record is no finding on a snippet: nothing was read again to check it.
    expect(run.trace.steps.filter((step) => step.by === "verification")).toEqual([]);
    // Each lookup is a step of the code with the address asked and the number of records, no text.
    const lookups = run.trace.steps.filter(
      (step) => step.tool === "gather" && step.category === "security_incidents",
    );
    expect(lookups.map((step) => [step.outcome, step.results])).toEqual([
      ["ok", 1],
      ["empty", 0],
      ["ok", 1],
    ]);
    expect(JSON.stringify(run.trace)).not.toContain("authentication bypass");

    // Without the lookup the run has only the news, and the news has nothing.
    const without: EvalCase = {
      ...evalCase,
      recording: { ...evalCase.recording, records: undefined },
    };
    expect((await runEvalCase(without)).kept).toEqual([]);
  });

  it("finds the incident that the vendor reported to the SEC, which the news does not hold, and cites the filing as a source that was read", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "sec-cybersecurity-incident-report")!;

    const run = await runEvalCase(evalCase);

    expect(run.pack[0]).toMatchObject({
      id: "S1",
      kind: "page",
      category: "security_incidents",
      url: "https://www.sec.gov/Archives/edgar/data/1999001/000199900126000007/marlow-20260918.htm",
    });
    // The text of Item 1.05 is in the source, so that the finding can quote the vendor's own words.
    expect(run.pack[0].content).toContain(
      "SEC EDGAR (sec.gov). Company: Marlow Cloud Services, Inc.",
    );
    expect(run.pack[0].content).toContain("an unauthorized third party had obtained access");
    expect(run.kept.map((finding) => finding.category)).toEqual(["security_incidents"]);
    // A finding on a filing is no finding on a snippet: nothing was read again to check it.
    expect(run.trace.steps.filter((step) => step.by === "verification")).toEqual([]);
    const lookups = run.trace.steps.filter(
      (step) => step.tool === "gather" && step.category === "security_incidents",
    );
    expect(lookups.map((step) => [step.outcome, step.results])).toEqual([
      ["empty", 0],
      ["empty", 0],
      ["empty", 0],
      ["ok", 1],
    ]);
    expect(lookups[3].url).toBe("https://data.sec.gov/submissions/CIK0001999001.json");
    expect(JSON.stringify(run.trace)).not.toContain("unauthorized third party");

    // Without the lookup the run has only the news, and the news has nothing.
    const without: EvalCase = {
      ...evalCase,
      recording: { ...evalCase.recording, records: undefined },
    };
    expect((await runEvalCase(without)).kept).toEqual([]);
  });

  it("finds the outage that the vendor listed on its status page, which the news does not hold, and cites its records as sources that were read", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "status-page-incident-history")!;

    const run = await runEvalCase(evalCase);

    // The records are the first sources of their category, and they were read, not searched: the
    // summary, then the newest incidents. The planned maintenance and the incident from before the
    // lookback did not come in.
    expect(run.pack.map((source) => [source.id, source.kind, source.category, source.url])).toEqual(
      [
        ["S1", "page", "availability", "https://status.larchstorage.example/history"],
        [
          "S2",
          "page",
          "availability",
          "https://status.larchstorage.example/incidents/r7q2m9x4k1b8",
        ],
        [
          "S3",
          "page",
          "availability",
          "https://status.larchstorage.example/incidents/d4n6v1c8p3t5",
        ],
      ].concat(
        run.pack.slice(3).map((source) => [source.id, source.kind, source.category, source.url]),
      ),
    );
    expect(run.pack[1].content).toContain("Customers could not read or write objects");
    expect(run.pack[0].content).toContain("Scheduled maintenance: 1");
    expect(
      run.kept.map((finding, index) => [finding.category, run.credibility[index]?.label]),
    ).toEqual([["availability", "high"]]);
    // A finding on a record is no finding on a snippet: nothing was read again to check it.
    expect(run.trace.steps.filter((step) => step.by === "verification")).toEqual([]);
    // The lookup is a step of the code with the address of the feed and the number of records, no
    // text, and it belongs to the category of the status page and not to security incidents.
    const lookups = run.trace.steps.filter(
      (step) => step.tool === "gather" && step.category === "availability",
    );
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toMatchObject({
      outcome: "ok",
      results: 3,
      url: "https://status.larchstorage.example/history.atom",
      omitted: { old: 1 },
    });
    expect(
      run.trace.steps.filter(
        (step) => step.tool === "gather" && step.category === "security_incidents",
      ),
    ).toHaveLength(4);
    expect(JSON.stringify(run.trace)).not.toContain("Customers could not read");

    // Without the lookup the run has only the news, and the news has nothing.
    const without: EvalCase = {
      ...evalCase,
      recording: { ...evalCase.recording, records: undefined },
    };
    expect((await runEvalCase(without)).kept).toEqual([]);
  });

  it("finds the company of the vendor's name on the sanctions list, which the news does not hold, and cites its record as a source that was read", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "sanctions-list-name-match")!;

    const run = await runEvalCase(evalCase);

    // The record is the first source of its category, and it was read, not searched. The vessel and
    // the person with a similar name, and the entity of another name, did not come in.
    expect(run.pack.slice(0, 1).map((source) => [source.id, source.kind, source.category])).toEqual(
      [["S1", "page", "legal_regulatory"]],
    );
    expect(run.pack[0].url).toBe("https://sanctionssearch.ofac.treas.gov/Details.aspx?id=40001");
    expect(run.pack.map((source) => source.url)).not.toContain(
      "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=40002",
    );
    expect(run.pack[0].content).toContain(
      "OFAC Specially Designated Nationals and Blocked Persons List (treasury.gov).",
    );
    // The analysis is told, in the record itself, that the match is by name only.
    expect(run.pack[0].content).toContain("by name only");
    expect(
      run.kept.map((finding, index) => [
        finding.category,
        run.credibility[index]?.label,
        finding.likelihood,
      ]),
    ).toEqual([["legal_regulatory", "low", "Possible"]]);
    // A finding on a record is no finding on a snippet: nothing was read again to check it.
    expect(run.trace.steps.filter((step) => step.by === "verification")).toEqual([]);
    // The lookup is a step of the code with the address of the first file and the number of records,
    // no text, and it belongs to the category of legal and regulatory matters.
    const lookups = run.trace.steps.filter(
      (step) =>
        step.tool === "gather" && step.category === "legal_regulatory" && step.url !== undefined,
    );
    expect(lookups.filter((step) => step.url?.includes("sanctionslistservice"))).toEqual([
      expect.objectContaining({ outcome: "ok", results: 1 }),
    ]);
    expect(JSON.stringify(run.trace)).not.toContain("Registration ID");

    // Without the lookup the run has only the news, and the news has nothing.
    const without: EvalCase = {
      ...evalCase,
      recording: { ...evalCase.recording, records: undefined },
    };
    expect((await runEvalCase(without)).kept).toEqual([]);
  });

  it("finds the layoffs and the sale of the vendor with the searches about its finances, and keeps one finding of its own category", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "financial-health-layoffs-and-sale")!;

    const run = await runEvalCase(evalCase);

    // The code made the three searches about the finances, and the two articles they led to were
    // read: they are the only sources, and both are in the category of the finances.
    expect(
      run.trace.steps
        .filter(
          (step) =>
            step.by === "code" && step.tool === "search" && step.category === "financial_health",
        )
        .map((step) => step.query),
    ).toEqual([
      "Tessellate Billing layoffs",
      "Tessellate Billing bankruptcy",
      "Tessellate Billing acquisition",
    ]);
    expect(run.pack.map((source) => [source.id, source.kind, source.category])).toEqual([
      ["S1", "page", "financial_health"],
      ["S2", "page", "financial_health"],
    ]);
    // Two publishers, neither known to the registry: low. Both were read, so nothing is checked
    // again by reading.
    expect(
      run.kept.map((finding, index) => [
        finding.category,
        run.credibility[index]?.label,
        finding.likelihood,
      ]),
    ).toEqual([["financial_health", "low", "Possible"]]);
    expect(run.trace.steps.filter((step) => step.by === "verification")).toEqual([]);

    // Without the searches about the finances the run has nothing: no other search holds the news.
    const without: EvalCase = {
      ...evalCase,
      recording: {
        ...evalCase.recording,
        searches: evalCase.recording.searches.map((search) =>
          /layoffs|bankruptcy|acquisition/.test(search.query) ? { ...search, results: [] } : search,
        ),
      },
    };
    expect((await runEvalCase(without)).kept).toEqual([]);
  });

  it("let each category of the per-category case be researched by a loop of its own, after the routine work", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "one-loop-per-category")!;

    const run = await runEvalCase(evalCase);

    expect(
      run.trace.modelCalls
        .filter((call) => call.purpose === "loop")
        .map((call) => call.loop)
        .sort(),
    ).toEqual([
      "ai_specific",
      "ai_specific",
      "availability",
      "certifications",
      "certifications",
      "financial_health",
      "legal_regulatory",
      "security_incidents",
      "security_incidents",
      "security_incidents",
    ]);
    // What each loop read on its own, besides the pages that the code read.
    expect(
      run.trace.steps
        .filter((step) => step.loop !== undefined && step.tool === "read")
        .map((step) => [step.loop, step.url]),
    ).toEqual(
      expect.arrayContaining([
        ["security_incidents", "https://www.finopsdaily.example/kestrel-ledger-ransomware"],
        ["certifications", "https://kestrelledger.com/trust/soc2-report"],
        ["ai_specific", "https://kestrelledger.com/legal/ai-use"],
      ]),
    );
    // The loops for legal matters, for outages and for finances finished at their first turn: the
    // code had searched for them.
    for (const category of ["legal_regulatory", "availability", "financial_health"]) {
      expect(
        run.trace.steps.filter((step) => step.loop === category).map((step) => step.tool),
      ).toEqual(["finish"]);
    }
    expect(run.found.stoppedBecause).toBe("finished");
    expect(run.kept.map((finding) => finding.category).sort()).toEqual([
      "ai_specific",
      "certifications",
      "security_incidents",
    ]);
  });

  it("credit the copies of the syndicated case to the agency by their canonical links alone: without them the label is low", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "syndicated-copies")!;
    const withoutLinks: EvalCase = {
      ...evalCase,
      recording: {
        ...evalCase.recording,
        pages: evalCase.recording.pages.map((entry) => {
          if (!("page" in entry)) return entry;
          const { canonicalUrl: _canonicalUrl, ...page } = entry.page;
          return { ...entry, page };
        }),
      },
    };

    const [linked, unlinked] = await Promise.all([
      runEvalCase(evalCase),
      runEvalCase(withoutLinks),
    ]);

    expect(labels(linked)).toEqual([["medium", "trusted_press_one"]]);
    // Two portals and an unknown site: unverified, all three (spec D6.2, the variant of case 23).
    expect(labels(unlinked)).toEqual([["low", "unverified"]]);
  });

  it.each([
    "https://cobaltline.example/newsroom/",
    "https://cobaltline.example/press-releases/",
    "https://cobaltline.example/en/press/",
    "https://cobaltline.example/company/news/",
  ])("keep the claim of the self-claim case low with its newsroom at %s", async (newsroom) => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "vendor-self-claim")!;

    const run = await runEvalCase(
      moved(evalCase, { "https://cobaltline.example/press/": newsroom }),
    );

    expect(labels(run)).toEqual([["low", "self_claim"]]);
  });

  it("take the story of the two-publisher case for no reporting when the release pages of AP and MarketWatch carry it", async () => {
    const evalCase = EVAL_CASES.find(({ id }) => id === "two-trusted-publishers")!;

    const run = await runEvalCase(
      moved(evalCase, {
        "https://www.reuters.com/technology/fenwick-ledger-says-supplier-bank-details-stolen-2026-09-22/":
          "https://apnews.com/press-release/business-wire/fenwick-ledger-says-supplier-bank-details-stolen",
        "https://www.bbc.co.uk/news/articles/fenwick-ledger-invoice-archive":
          "https://www.marketwatch.com/press-release/fenwick-ledger-invoice-archive-breach-2026-09-23",
      }),
    );

    expect(labels(run)).toEqual([["low", "unverified"]]);
  });

  describe("the cases of the vendor risk database", () => {
    const caseOf = (id: string): EvalCase => {
      const found = EVAL_CASES.find((evalCase) => evalCase.id === id);
      if (found === undefined) throw new Error(`No case ${id}`);
      return found;
    };
    /** The case with every record of its copy of the lists in another status. */
    const withStatus = (evalCase: EvalCase, status: RecordStatus): EvalCase => ({
      ...evalCase,
      recording: {
        ...evalCase.recording,
        vrdb: {
          rows: (evalCase.recording.vrdb?.rows ?? []).map((row) => ({ ...row, status })),
          states: evalCase.recording.vrdb?.states ?? [],
        },
      },
    });
    const coverageOf = (run: CaseRun, id: string) =>
      run.found.coverage?.sources.find((source) => source.id === id);

    it("a withdrawn KEV entry is not offered: nothing in the pack cites its address, and nothing is kept", async () => {
      const evalCase = caseOf("rejected-cve");
      const [entry] = evalCase.recording.vrdb?.rows ?? [];
      expect(entry).toMatchObject({ sourceId: "kev", status: "withdrawn" });

      const run = await runEvalCase(evalCase);

      expect(run.pack.map((source) => source.url)).not.toContain(entry.url);
      expect(run.kept).toEqual([]);
      // The catalog was checked, and it holds nothing that it stands by for the vendor.
      expect(coverageOf(run, "kev")).toMatchObject({ checked: true, outcome: "none", strong: 0 });

      // The same entry while the catalog held it: offered, and the flaw is reported, High.
      const active = await runEvalCase(withStatus(evalCase, "active"));
      expect(active.pack.map((source) => source.url)).toContain(entry.url);
      expect(labels(active)).toEqual([["high", "official_record"]]);
    });

    it("a delisted sanctions entry is not offered", async () => {
      const evalCase = caseOf("delisted-sanctions-entry");
      const [entry] = evalCase.recording.vrdb?.rows ?? [];
      expect(entry).toMatchObject({ sourceId: "ofac", status: "delisted" });

      const run = await runEvalCase(evalCase);

      expect(run.pack.map((source) => source.url)).not.toContain(entry.url);
      expect(run.kept).toEqual([]);
      expect(coverageOf(run, "ofac")).toMatchObject({ checked: true, outcome: "none", weak: 0 });

      // While the list held it, the entry of the vendor's name was offered: Low, by name only.
      const active = await runEvalCase(withStatus(evalCase, "active"));
      expect(active.pack.map((source) => source.url)).toContain(entry.url);
      expect(labels(active)).toEqual([["low", "name_only"]]);
    });

    it("an entry whose website is a page on the vendor's platform is not offered, even from a copy that kept the platform's host as a key", async () => {
      const evalCase = caseOf("platform-website");
      const [entry] = evalCase.recording.vrdb?.rows ?? [];
      expect(entry).toMatchObject({ sourceId: "uk_sanctions", status: "active" });

      const run = await runEvalCase(evalCase);

      expect(run.pack.map((source) => source.url)).not.toContain(entry.url);
      expect(run.kept).toEqual([]);
      expect(coverageOf(run, "uk_sanctions")).toMatchObject({ checked: true, outcome: "none" });

      // A copy made before the connector left such hosts out: the vendor's side holds no key of
      // the platform either.
      const older = await runEvalCase({
        ...evalCase,
        recording: {
          ...evalCase.recording,
          vrdb: {
            rows: [{ ...entry, matchKeys: [...entry.matchKeys, "domain:linkedin.com"] }],
            states: evalCase.recording.vrdb?.states ?? [],
          },
        },
      });
      expect(older.pack.map((source) => source.url)).not.toContain(entry.url);
      expect(older.kept).toEqual([]);
    });

    it("a stale source keeps the label and says so", async () => {
      const evalCase = caseOf("stale-source");

      const run = await runEvalCase(evalCase);

      expect(labels(run)).toEqual([["high", "official_record"]]);
      const [{ basis }] = run.credibility;
      expect(basis.sources[0].record).toMatchObject({
        source: "kev",
        match: "strong",
        as_of: "2026-10-07",
        stale: true,
      });
      expect(credibilityRationale(basis)).toBe(
        "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-30001), as of 7 Oct 2026. The source has not been updated since 7 Oct 2026.",
      );
      const stale = (run.found.coverage?.sources ?? [])
        .filter((source) => source.stale)
        .map((source) => source.id);
      expect(stale).toEqual(evalCase.expected.coverage?.stale);
      expect(stale).toEqual(["kev", "ofac"]);
      // The OFAC list was checked all the same: no record of the vendor in a copy that is old.
      expect(coverageOf(run, "ofac")).toMatchObject({ checked: true, outcome: "none" });
    });

    it("the same name on two lists gives one finding, Low, with the note", async () => {
      const evalCase = caseOf("same-name-on-two-lists");

      const run = await runEvalCase(evalCase);

      expect(
        run.pack
          .filter((source) => source.category === "legal_regulatory")
          .map((source) => source.title),
      ).toEqual([
        "OFAC SDN list: CORVANE LOGISTICS LIMITED",
        "UK Sanctions List: Corvane Logistics Limited",
      ]);
      expect(labels(run)).toEqual([["low", "name_only"]]);
      const [{ basis }] = run.credibility;
      expect(basis.name_only).toBe(true);
      expect(basis.sources.map((source) => [source.record?.source, source.record?.match])).toEqual([
        ["ofac", "weak"],
        ["uk_sanctions", "weak"],
      ]);
      expect(credibilityRationale(basis)).toBe(
        "Low: the OFAC SDN list entry matches the vendor by name only.",
      );
    });

    it("a KEV entry whose CVE another list rejected is offered by no list: nothing is kept", async () => {
      const evalCase = caseOf("rejected-cve-mirror");
      const vrdb = evalCase.recording.vrdb!;
      expect(vrdb.rows.map((row) => [row.sourceId, row.sourceRecordId, row.status])).toEqual([
        ["kev", "CVE-2026-35001", "active"],
        ["cve", "CVE-2026-35001", "rejected"],
      ]);
      const [entry] = vrdb.rows;

      const run = await runEvalCase(evalCase);

      expect(run.pack.map((source) => source.url)).not.toContain(entry.url);
      expect(run.kept).toEqual([]);
      expect(coverageOf(run, "kev")).toMatchObject({ checked: true, outcome: "none", strong: 0 });
      // The CVE records are covered now that their gate (Q7) is open: the rejected record is
      // checked, and not offered.
      expect(coverageOf(run, "cve")).toMatchObject({ checked: true, outcome: "none", strong: 0 });

      // A rejection the NVD answered keeps the entry out too: the CVE is rejected on every list.
      const byNvd = await runEvalCase({
        ...evalCase,
        recording: {
          ...evalCase.recording,
          vrdb: {
            ...vrdb,
            rows: vrdb.rows.map((row) =>
              row.sourceId === "cve" ? { ...row, sourceId: "nvd" as const } : row,
            ),
          },
        },
      });
      expect(byNvd.pack.map((source) => source.url)).not.toContain(entry.url);
      expect(byNvd.kept).toEqual([]);

      // Without the rejection the catalog's entry is offered, and the flaw is reported, High.
      const listed = await runEvalCase({
        ...evalCase,
        recording: { ...evalCase.recording, vrdb: { ...vrdb, rows: [entry] } },
      });
      expect(listed.pack.map((source) => source.url)).toContain(entry.url);
      expect(labels(listed)).toEqual([["high", "official_record"]]);
    });

    it("an entry that holds the vendor's name and registration number is the vendor's: strong, High, no note", async () => {
      const evalCase = caseOf("identifier-match");
      expect(evalCase.vendor.identifiers).toEqual({
        country: "GB",
        registrationNumber: "09876543",
      });
      const [entry] = evalCase.recording.vrdb?.rows ?? [];
      expect(entry).toMatchObject({ sourceId: "uk_sanctions", status: "active" });
      expect(entry.matchKeys).toContain("regno:09876543");

      const run = await runEvalCase(evalCase);

      expect(labels(run)).toEqual([["high", "official_record"]]);
      const [{ basis }] = run.credibility;
      expect(basis.name_only).toBe(false);
      expect(basis.sources[0].record).toMatchObject({
        source: "uk_sanctions",
        match: "strong",
        source_record_id: "RUS3601",
        as_of: "2026-10-10",
      });
      expect(credibilityRationale(basis)).toBe(
        "High: UK Sanctions List lists it (RUS3601), as of 10 Oct 2026.",
      );
      const offered = run.pack.find((source) => source.url === entry.url);
      expect(offered?.content).not.toContain(NAME_ONLY_LOOKUP_NOTE);
      expect(coverageOf(run, "uk_sanctions")).toMatchObject({
        checked: true,
        outcome: "found",
        strong: 1,
        weak: 0,
      });

      // Without the vendor's number the same entry matches by the name only: Low, with the note.
      const byName = await runEvalCase({
        ...evalCase,
        vendor: { ...evalCase.vendor, identifiers: { country: "GB" } },
      });
      expect(labels(byName)).toEqual([["low", "name_only"]]);
      expect(byName.credibility[0].basis.name_only).toBe(true);
      expect(byName.pack.find((source) => source.url === entry.url)?.content).toContain(
        NAME_ONLY_LOOKUP_NOTE,
      );
    });

    it("an entry that carries the vendor's LEI under another name is the vendor's: strong, High, cited", async () => {
      // M2 final review, Important 2: the entry does not name the vendor, so the citation stands
      // only because the entry's text shows the LEI the vendor's record holds.
      const evalCase = caseOf("lei-match-other-name");
      const lei = evalCase.vendor.identifiers?.lei ?? "";
      expect(lei).not.toBe("");
      const [entry] = evalCase.recording.vrdb?.rows ?? [];
      expect(entry).toMatchObject({ sourceId: "eu_fsf", status: "active" });
      expect(entry.matchKeys).toContain(`lei:${lei}`);
      expect(entry.summary).toContain(`Identification number: ${lei}.`);
      expect(`${entry.title} ${entry.summary}`).not.toContain("Corvane");

      const run = await runEvalCase(evalCase);

      expect(run.trace.rejected).toEqual([]);
      expect(labels(run)).toEqual([["high", "official_record"]]);
      const [{ basis }] = run.credibility;
      expect(basis.name_only).toBe(false);
      expect(basis.sources[0].record).toMatchObject({
        source: "eu_fsf",
        match: "strong",
        source_record_id: "3801",
      });
      expect(coverageOf(run, "eu_fsf")).toMatchObject({
        checked: true,
        outcome: "found",
        strong: 1,
        weak: 0,
      });

      // Without the vendor's LEI nothing ties the entry to the vendor: it is not offered.
      const withoutLei = await runEvalCase({
        ...evalCase,
        vendor: { ...evalCase.vendor, identifiers: undefined },
      });
      expect(withoutLei.pack.map((source) => source.url)).not.toContain(entry.url);
      expect(labels(withoutLei)).toEqual([]);
    });

    it("a CVE the NVD answered through the read-through is High, as of the day of the answer", async () => {
      const evalCase = caseOf("nvd-read-through");
      const vrdb = evalCase.recording.vrdb!;
      const answer = vrdb.readThrough?.find((outcome) => outcome.id === "nvd");
      expect(answer).toMatchObject({ outcome: "fresh", weak: false });

      const run = await runEvalCase(evalCase);

      // The case's answer is the one of the key the NVD is asked by for this vendor.
      const fetchJson = jest.fn(async () => {
        throw new Error("a case asks no source");
      });
      await expect(
        nvdConnector.keyOf(run.target, { signal: new AbortController().signal, fetchJson }),
      ).resolves.toEqual({ key: answer?.key, weak: false });
      expect(labels(run)).toEqual([["high", "official_record"]]);
      const [{ basis }] = run.credibility;
      expect(basis.sources[0].record).toMatchObject({
        source: "nvd",
        match: "strong",
        source_record_id: "CVE-2026-37001",
        as_of: "2026-10-10",
      });
      expect(credibilityRationale(basis)).toBe(
        "High: the National Vulnerability Database lists it (CVE-2026-37001), as of 10 Oct 2026.",
      );
      expect(coverageOf(run, "nvd")).toMatchObject({
        mode: "read_through",
        checked: true,
        outcome: "found",
        strong: 1,
        last_success_at: "2026-10-10T08:30:00.000Z",
        stale: false,
      });

      // A run that has no answer of the NVD does not research it, and is offered nothing of it.
      const unanswered = await runEvalCase({
        ...evalCase,
        recording: { ...evalCase.recording, vrdb: { rows: vrdb.rows, states: vrdb.states } },
      });
      expect(coverageOf(unanswered, "nvd")).toMatchObject({
        checked: false,
        outcome: "not_researched",
      });
      expect(unanswered.pack.map((source) => source.url)).not.toContain(vrdb.rows[0].url);
      expect(unanswered.kept).toEqual([]);

      // A CVE the catalog withdrew is still the NVD's: only a rejection keeps it off every list.
      const [record] = vrdb.rows;
      const withdrawn = await runEvalCase({
        ...evalCase,
        recording: {
          ...evalCase.recording,
          vrdb: {
            ...vrdb,
            rows: [
              ...vrdb.rows,
              {
                ...record,
                id: record.id + 1,
                sourceId: "kev",
                status: "withdrawn",
                url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search=${record.sourceRecordId}`,
                matchKeys: ["kev:fernhollownetworks"],
              },
            ],
          },
        },
      });
      expect(labels(withdrawn)).toEqual([["high", "official_record"]]);
      expect(withdrawn.credibility[0].basis.sources[0].record?.source).toBe("nvd");
    });
  });

  it("reproduce, between them, the failures that the roadmap's ideas are meant to fix", () => {
    const ideas = new Set<number>();
    for (const evalCase of EVAL_CASES) {
      for (const idea of Object.values(evalCase.gaps)) ideas.add(idea);
    }

    // No idea is open any more: an idea that is built leaves this list with its gap lines.
    expect([...ideas].sort((a, b) => a - b)).toEqual([]);
  });
});
