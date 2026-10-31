import { researchOutputSchema } from "../../schema";
import { verifierSchema } from "../../verifier";
import { createScriptedGenerate } from "../replay";
import { runEvalCase } from "../runCase";
import type { EvalCase } from "../types";

const QUOTE = "attackers copied customer records from a test system";

const BASE: EvalCase = {
  id: "inline",
  title: "An inline case",
  reproduces: "Nothing: it checks the runner.",
  vendor: { name: "Acme", website: "acme.com", provides: "Payroll software" },
  now: "2026-10-10T12:00:00Z",
  recording: {
    steps: [
      {
        thought: "Search the news",
        actions: [
          {
            action: "search",
            category: "security_incidents",
            query: "Acme data breach",
            kind: "news",
          },
        ],
      },
      { thought: "Done", actions: [{ action: "finish" }] },
    ],
    searches: [
      {
        kind: "news",
        query: "Acme data breach",
        results: [
          {
            title: "Acme confirms breach",
            url: "https://news.example.com/acme-breach",
            snippet: `Acme confirmed on Monday that ${QUOTE}.`,
            publishedAt: "2026-09-30",
            source: "Example News",
          },
        ],
      },
    ],
    pages: [],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description: "Attackers copied customer records from a vendor test system.",
          impact_description: "Customer data we send to the vendor may have been exposed.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan: "Ask the vendor for its incident report.",
          confidence: "medium",
          rationale: "Customer records were copied, so the effect is serious.",
          evidence: [{ source_id: "S1", quote: QUOTE }],
        },
      ],
      category_notes: [],
    },
  },
  expected: { findings: [{ category: "security_incidents", anyOf: ["customer records"] }] },
  targets: {},
  gaps: {},
};

describe("runEvalCase", () => {
  it("gives the analysis the scorecard of the case's vendor, and the loop nothing of it", async () => {
    const scripted = createScriptedGenerate(BASE.recording);
    const asked: Array<{ analysis: boolean; text: string }> = [];
    const generate = (async (params: { schema: unknown; system: string; prompt: string }) => {
      asked.push({
        analysis: params.schema === researchOutputSchema,
        text: `${params.system}\n${params.prompt}`,
      });
      return scripted(params as never);
    }) as typeof scripted;
    const evalCase: EvalCase = {
      ...BASE,
      vendor: {
        ...BASE.vendor,
        scorecard: {
          data_sensitivity: "Financial data",
          business_criticality: "High (critical to core services or products)",
        },
      },
    };

    await runEvalCase(evalCase, { generate });

    const analysis = asked.filter((call) => call.analysis);
    expect(analysis).toHaveLength(1);
    expect(analysis[0].text).toContain("<data_sensitivity>Financial data</data_sensitivity>");
    expect(analysis[0].text).toContain("High (critical to core services or products)");
    const loop = asked.filter((call) => !call.analysis);
    expect(loop.length).toBeGreaterThan(0);
    for (const call of loop) expect(call.text).not.toMatch(/Financial data|critical to core/);
  });

  it("asks the analysis for no materiality when the vendor of the case has no scorecard", async () => {
    const scripted = createScriptedGenerate(BASE.recording);
    const prompts: string[] = [];
    const generate = (async (params: { schema: unknown; prompt: string }) => {
      if (params.schema === researchOutputSchema) prompts.push(params.prompt);
      return scripted(params as never);
    }) as typeof scripted;

    await runEvalCase(BASE, { generate });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toContain("materiality");
  });

  describe("the verifier", () => {
    const askedFor = async (evalCase: EvalCase) => {
      const scripted = createScriptedGenerate(evalCase.recording);
      const schemas: unknown[] = [];
      const generate = (async (params: { schema: unknown }) => {
        schemas.push(params.schema);
        return scripted(params as never);
      }) as typeof scripted;
      const run = await runEvalCase(evalCase, { generate });
      return { run, verifierCalls: schemas.filter((schema) => schema === verifierSchema).length };
    };

    it("is not asked for a case that does not ask for it", async () => {
      const { verifierCalls } = await askedFor(BASE);

      expect(verifierCalls).toBe(0);
    });

    it("is asked once for a case that asks for it, and the finding it fails is not kept", async () => {
      const failing = {
        ...BASE,
        verifier: true,
        recording: {
          ...BASE.recording,
          verifier: {
            verdicts: [
              {
                finding: 1,
                same_company: true,
                quote_supports_claim: false,
                source_in_window: true,
              },
            ],
          },
        },
      };

      const { run, verifierCalls } = await askedFor(failing);

      expect(verifierCalls).toBe(1);
      expect(run.kept).toEqual([]);
      expect(run.trace.dropped["verifier.not_supported"]).toBe(1);
    });
  });

  it("runs the real researcher and analysis over the recording, with no network and no model", async () => {
    const run = await runEvalCase(BASE);

    expect(run.found.searchesUsed).toBe(1);
    expect(run.found.stoppedBecause).toBe("finished");
    expect(run.pack.map((source) => source.id)).toEqual(["S1"]);
    expect(run.kept).toHaveLength(1);
    expect(run.kept[0]).toMatchObject({
      category: "security_incidents",
      sources: [{ url: "https://news.example.com/acme-breach", quote: QUOTE }],
    });
  });

  it("returns a label for every finding it keeps", async () => {
    const run = await runEvalCase(BASE);

    expect(run.kept).toHaveLength(1);
    expect(run.credibility).toHaveLength(run.kept.length);
    // One snippet of an unknown site, whose page the recording does not hold.
    expect(run.credibility[0]).toMatchObject({ label: "low", basis: { rule: "unverified" } });
  });

  it("records the trace of the run, with the tokens of the calls estimated from the text", async () => {
    const run = await runEvalCase(BASE);

    // The check of the home page comes first: the recording holds no page for it, which the replay
    // answers as the web would, with a page that does not exist. The first finish is met with the
    // reminder that three categories are not covered; the second one, which the script gives when
    // its steps run out, ends the run. The finding rests on a snippet, so the page of its source
    // is read after the analysis, and the recording holds no page for that either.
    expect(run.trace.steps.map((step) => [step.tool, step.outcome])).toEqual([
      ["preflight", "failed"],
      ["search", "ok"],
      ["finish", "refused"],
      ["finish", "ok"],
      ["read", "failed"],
    ]);
    expect(run.trace.modelCalls.map((call) => call.purpose)).toEqual([
      "loop",
      "loop",
      "loop",
      "analysis",
    ]);
    expect(run.trace.totals.totalTokens).toBeGreaterThan(0);
  });

  it("remembers which feed returned each address", async () => {
    const run = await runEvalCase(BASE);

    expect(run.feedOf("https://news.example.com/acme-breach")).toBe("news");
  });

  it("asks no model to analyse a run that found no source", async () => {
    const run = await runEvalCase({
      ...BASE,
      recording: { ...BASE.recording, searches: [{ ...BASE.recording.searches[0], results: [] }] },
    });

    expect(run.pack).toEqual([]);
    expect(run.analysed).toBeNull();
    expect(run.kept).toEqual([]);
    // A finish with no source is met with a reminder, so the script's second finish ends the run.
    expect(run.trace.modelCalls.map((call) => call.purpose)).toEqual(["loop", "loop", "loop"]);
  });

  it("starts from the register and the findings the case says the vendor has", async () => {
    const run = await runEvalCase({
      ...BASE,
      known: {
        existingRisks: [
          {
            risk_description: "Attackers copied customer records from a vendor test system.",
            impact_description: "Customer data we send to the vendor may have been exposed.",
          },
        ],
        priorFindings: [],
      },
    });

    expect(run.kept).toEqual([]);
    expect(run.analysed?.ok && run.analysed.duplicatesDropped).toBe(1);
  });

  it("reads the vendor's own site without a search, as the real run does", async () => {
    const run = await runEvalCase({
      ...BASE,
      recording: {
        ...BASE.recording,
        steps: [
          {
            thought: "Read the trust page",
            actions: [
              { action: "read", category: "certifications", url: "https://acme.com/trust" },
            ],
          },
          { thought: "Done", actions: [{ action: "finish" }] },
        ],
        searches: [],
        pages: [
          {
            url: "https://acme.com/trust",
            page: {
              url: "https://acme.com/trust",
              title: "Trust",
              publishedAt: null,
              text: "Our SOC 2 Type II audit is still in progress.",
              links: [],
            },
          },
        ],
        analysis: { findings: [], category_notes: [] },
      },
    });

    expect(run.found.pagesRead).toBe(1);
    expect(run.pack[0]).toMatchObject({ kind: "page", onVendorSite: true });
  });

  describe("the routine work before the loop", () => {
    /** The searches the code makes for a vendor named Acme, and the pages of its site that it reads. */
    const GATHERED: EvalCase = {
      ...BASE,
      gather: true,
      recording: {
        ...BASE.recording,
        steps: [{ thought: "Done", actions: [{ action: "finish" }] }],
        searches: [
          ...BASE.recording.searches,
          { kind: "news", query: "Acme security incident", results: [] },
          { kind: "news", query: "Acme lawsuit", results: [] },
          { kind: "news", query: "Acme fined", results: [] },
          { kind: "news", query: "Acme FTC", results: [] },
          { kind: "news", query: "Acme settlement", results: [] },
          { kind: "news", query: "Acme outage", results: [] },
          { kind: "news", query: "Acme layoffs", results: [] },
          { kind: "news", query: "Acme bankruptcy", results: [] },
          { kind: "news", query: "Acme acquisition", results: [] },
        ],
        pages: [
          {
            url: "https://acme.com/",
            page: {
              url: "https://acme.com/",
              title: "Acme",
              publishedAt: null,
              text: "Acme builds payroll software.",
              links: [{ text: "Trust centre", url: "https://acme.com/trust" }],
            },
          },
          {
            url: "https://acme.com/trust",
            page: {
              url: "https://acme.com/trust",
              title: "Trust",
              publishedAt: null,
              text: "Acme holds a SOC 2 Type II report.",
              links: [],
            },
          },
        ],
      },
    };

    it("is done for a case that asks for it: the searches and the pages come before any turn of the model", async () => {
      const run = await runEvalCase(GATHERED);

      const steps = run.trace.steps;
      expect(steps.filter((step) => step.by === "code" && step.tool === "search")).toHaveLength(10);
      expect(steps.filter((step) => step.by === "code" && step.tool === "read")).toEqual(
        expect.arrayContaining([expect.objectContaining({ url: "https://acme.com/trust" })]),
      );
      expect(steps.findIndex((step) => step.tool === "finish")).toBeGreaterThan(
        steps.reduce((last, step, index) => (step.by === "code" ? index : last), -1),
      );
      expect(run.found.searchesUsed).toBe(10);
      expect(run.pack.map((source) => source.url)).toEqual(
        expect.arrayContaining(["https://news.example.com/acme-breach", "https://acme.com/trust"]),
      );
      // The model was asked for hints, made one call of the loop (to finish), and was asked to analyse.
      expect(run.trace.modelCalls.map((call) => call.purpose)).toEqual([
        "hints",
        "loop",
        "analysis",
      ]);
    });

    it("is not done for a case that does not ask for it", async () => {
      const run = await runEvalCase(BASE);

      expect(run.trace.steps.some((step) => step.by === "code")).toBe(false);
    });

    describe("one loop for each category", () => {
      const DPA = "https://acme.com/dpa";
      const PER_CATEGORY: EvalCase = {
        ...GATHERED,
        perCategory: true,
        recording: {
          ...GATHERED.recording,
          steps: [],
          loops: {
            ai_specific: [
              {
                thought: "Read the data processing agreement",
                actions: [{ action: "read", category: "ai_specific", url: DPA }],
              },
              { thought: "Done", actions: [{ action: "finish" }] },
            ],
          },
          pages: [
            ...GATHERED.recording.pages,
            {
              url: DPA,
              page: {
                url: DPA,
                title: "Data processing agreement",
                publishedAt: null,
                text: "Acme does not use customer data to train models.",
                links: [],
              },
            },
          ],
        },
      };

      it("is run for a case that asks for it, each loop with the steps recorded for its category", async () => {
        const run = await runEvalCase(PER_CATEGORY);

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
          "financial_health",
          "legal_regulatory",
          "security_incidents",
        ]);
        expect(run.trace.steps.filter((step) => step.loop === "ai_specific")).toEqual([
          expect.objectContaining({ tool: "read", url: DPA, outcome: "ok", turn: 1 }),
          expect.objectContaining({ tool: "finish", turn: 2 }),
        ]);
        expect(run.pack.map((source) => source.url)).toContain(DPA);
        expect(run.found.stoppedBecause).toBe("finished");
      });

      it("is not run for a case that does not ask for it", async () => {
        const run = await runEvalCase({ ...PER_CATEGORY, perCategory: false });

        expect(run.trace.steps.some((step) => step.loop !== undefined)).toBe(false);
        expect(run.trace.modelCalls.some((call) => call.loop !== undefined)).toBe(false);
      });
    });
  });
});
