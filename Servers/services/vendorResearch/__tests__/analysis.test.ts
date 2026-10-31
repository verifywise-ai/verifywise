import type { TokenUsage } from "../../../advisor/llmSelfCorrect";
import type { EvidenceSource } from "../../../domain.layer/interfaces/i.vendorResearch";
import { PageReadError, type PageReader } from "../../webResearch/readPage";
import { analyse } from "../analysis";
import { buildSystemPrompt } from "../prompts";
import { REGISTRY_VERSION } from "../sourceRegistry/entries";
import { credibilityOutputSchema, researchOutputSchema, type ResearchOutput } from "../schema";
import { verifierSchema } from "../verifier";
import { buildTarget } from "../target";
import { createTraceRecorder } from "../trace";

const NOW = new Date("2026-10-10T12:00:00Z");
const TARGET = buildTarget({
  vendor_name: "Acme",
  website: "acme.com",
  vendor_provides: "Payroll software",
});
const QUOTE = "attackers copied customer records from a test system";

const PACK: EvidenceSource[] = [
  {
    id: "S1",
    category: "security_incidents",
    kind: "result",
    onVendorSite: false,
    url: "https://news.example.com/acme-breach",
    title: "Acme confirms breach",
    content: `Acme confirmed on Monday that ${QUOTE}.`,
    publishedAt: "2026-09-30",
  },
];

const FINDING: ResearchOutput["findings"][number] = {
  category: "security_incidents",
  risk_description: "Attackers copied customer records from a vendor test system.",
  impact_description: "Customer data we send to the vendor may have been exposed.",
  likelihood: "Possible",
  risk_severity: "Major",
  action_plan: "Ask the vendor for its incident report.",
  confidence: "medium",
  rationale: "Customer records were copied, which is serious, but only a test system is named.",
  evidence: [{ source_id: "S1", quote: QUOTE }],
};

const answer = (
  findings: ResearchOutput["findings"],
  usage: TokenUsage = { inputTokens: 900, outputTokens: 60, totalTokens: 960 },
) =>
  jest.fn(async (params: { onUsage?: (usage: TokenUsage) => void }) => {
    params.onUsage?.(usage);
    return {
      object: { findings, category_notes: [] } satisfies ResearchOutput,
      attempts: 1,
      selfCorrected: false,
      usage,
    };
  });

const NOTHING_KNOWN = async () => ({ existingRisks: [], priorFindings: [] });

function run(overrides: Partial<Parameters<typeof analyse>[0]> = {}) {
  const trace = createTraceRecorder();
  const generate = answer([FINDING]);
  const input = {
    target: TARGET,
    pack: PACK,
    model: { id: "the-model" },
    jsonObjectFallback: false,
    now: NOW,
    generate: generate as never,
    loadKnown: NOTHING_KNOWN,
    trace,
    ...overrides,
  };
  return { trace, generate: input.generate as unknown as jest.Mock, result: analyse(input) };
}

describe("analyse", () => {
  it("returns the findings that hold up, the number of duplicates dropped, and the model's answer", async () => {
    const { result } = run();

    const analysed = await result;

    expect(analysed.ok).toBe(true);
    if (!analysed.ok) return;
    expect(analysed.kept).toHaveLength(1);
    expect(analysed.kept[0]).toMatchObject({
      category: "security_incidents",
      sources: [{ url: PACK[0].url, quote: QUOTE }],
    });
    expect(analysed.duplicatesDropped).toBe(0);
    expect(analysed.output.findings).toEqual([FINDING]);
  });

  it("asks the model with the analysis schema, the evidence prompt and the usual limits", async () => {
    const { result, generate } = run();

    await result;

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: researchOutputSchema,
        temperature: 0,
        innerMaxRetries: 2,
        maxSelfCorrectionAttempts: 2,
        model: { id: "the-model" },
        prompt: expect.stringContaining("<evidence>"),
        onUsage: expect.any(Function),
        extra: { abortSignal: expect.any(AbortSignal) },
      }),
    );
  });

  it("asks with the schema and the prompt of the credibility rules when it is given them", async () => {
    const { result, generate } = run({ rules: "credibility" });

    await result;

    expect(generate.mock.calls[0][0].schema).toBe(credibilityOutputSchema);
    expect(generate.mock.calls[0][0].system).toBe(buildSystemPrompt(NOW, "credibility"));
  });

  it("asks as before when it is given no rules", async () => {
    const { result, generate } = run();

    await result;

    expect(generate.mock.calls[0][0].schema).toBe(researchOutputSchema);
    expect(generate.mock.calls[0][0].system).toBe(buildSystemPrompt(NOW));
  });

  describe("the materiality of the vendor", () => {
    const MATERIALITY = {
      dataSensitivity: "Health data (e.g. HIPAA)",
      businessCriticality: "High (critical to core services or products)",
      regulatoryExposure: "HIPAA (US)",
    };

    it("goes to the model with the evidence, in the prompt", async () => {
      const { result, generate } = run({ materiality: MATERIALITY });

      await result;

      const prompt = generate.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("<materiality>");
      expect(prompt).toContain("<data_sensitivity>Health data (e.g. HIPAA)</data_sensitivity>");
      expect(prompt.indexOf("</materiality>")).toBeLessThan(prompt.indexOf("<evidence>"));
    });

    it.each([
      ["is absent", undefined],
      ["is null", null],
    ])("leaves the prompt without the block when it %s", async (_label, materiality) => {
      const { result, generate } = run({ materiality });

      await result;

      expect(generate.mock.calls[0][0].prompt).not.toContain("materiality");
    });

    it("changes only the prompt of the model: the findings are judged against the evidence alone", async () => {
      const without = await run().result;
      const withMateriality = await run({ materiality: MATERIALITY }).result;

      expect(withMateriality).toEqual(without);
    });
  });

  describe("the events of the evidence", () => {
    const REGULATOR_QUOTE = "informed the authority about the breach";
    // Two sources of one event: the breach, and the report of the authority being told of it.
    const EVENT_PACK: EvidenceSource[] = [
      PACK[0],
      {
        id: "S2",
        category: "legal_regulatory",
        kind: "result",
        onVendorSite: false,
        url: "https://news.example.org/acme-authority",
        title: "Acme tells the regulator about the breach",
        content: `Acme has ${REGULATOR_QUOTE} and could face questions.`,
        publishedAt: "2026-10-01",
      },
    ];
    const SECOND: ResearchOutput["findings"][number] = {
      category: "legal_regulatory",
      risk_description: "The data protection authority was told and may question the timing.",
      impact_description: "A fine or an order could follow.",
      likelihood: "Unlikely",
      risk_severity: "Minor",
      action_plan: "Follow the decision of the authority.",
      confidence: "low",
      rationale: "A fine is possible but not announced.",
      evidence: [{ source_id: "S2", quote: REGULATOR_QUOTE }],
    };

    it("shows the model the sources of an event together", async () => {
      const { result, generate } = run({ pack: EVENT_PACK, generate: answer([FINDING]) as never });

      await result;

      const prompt = generate.mock.calls[0][0].prompt as string;
      expect(prompt).toMatch(
        /<event id="E1">\s*<source id="S1"[\s\S]*<source id="S2"[\s\S]*<\/event>/,
      );
    });

    it("keeps one finding for an event, the most severe, and counts the other as a repeat in the trace", async () => {
      const { result, trace } = run({
        pack: EVENT_PACK,
        generate: answer([SECOND, FINDING]) as never,
      });

      const analysed = await result;

      expect(analysed.ok).toBe(true);
      if (!analysed.ok) return;
      expect(analysed.kept.map((finding) => finding.risk_severity)).toEqual(["Major"]);
      expect(analysed.duplicatesDropped).toBe(1);
      expect(trace.snapshot().dropped["duplicate.same_event"]).toBe(1);
    });

    it("keeps both findings when their sources do not report one event", async () => {
      const lawsuit = "was sued by a customer over unfair terms";
      const apart = [
        EVENT_PACK[0],
        {
          ...EVENT_PACK[1],
          title: "Acme is taken to court",
          content: `Acme ${lawsuit} in its contracts.`,
        },
      ];
      const lawsuitFinding = { ...SECOND, evidence: [{ source_id: "S2", quote: lawsuit }] };
      const { result, generate } = run({
        pack: apart,
        generate: answer([FINDING, lawsuitFinding]) as never,
      });

      const analysed = await result;

      expect(analysed.ok && analysed.kept).toHaveLength(2);
      expect(generate.mock.calls[0][0].prompt).not.toContain("<event");
    });
  });

  it("records the call with its tokens and the time of the analysis and validation phases", async () => {
    const { result, trace } = run();

    await result;

    const snapshot = trace.snapshot();
    expect(snapshot.modelCalls).toEqual([
      expect.objectContaining({
        purpose: "analysis",
        attempts: 1,
        inputTokens: 900,
        outputTokens: 60,
        totalTokens: 960,
        ok: true,
      }),
    ]);
    expect(snapshot.phases.map((phase) => phase.name)).toEqual(["analysis", "validation"]);
  });

  it("reports a call that failed instead of throwing, with the tokens it used, and reads nothing else", async () => {
    const failure = new Error("down");
    const loadKnown = jest.fn(NOTHING_KNOWN);
    const generate = jest.fn(async (params: { onUsage?: (usage: object) => void }) => {
      params.onUsage?.({ inputTokens: 500, outputTokens: 0, totalTokens: 500 });
      throw failure;
    });
    const { result, trace } = run({ generate: generate as never, loadKnown });

    const analysed = await result;

    expect(analysed).toEqual({ ok: false, error: failure });
    expect(loadKnown).not.toHaveBeenCalled();
    expect(trace.snapshot().modelCalls).toEqual([
      expect.objectContaining({ purpose: "analysis", ok: false, inputTokens: 500 }),
    ]);
  });

  it("looks up what the vendor already has once, after the model answered", async () => {
    const order: string[] = [];
    const loadKnown = jest.fn(async () => {
      order.push("known");
      return { existingRisks: [], priorFindings: [] };
    });
    const generate = jest.fn(async () => {
      order.push("model");
      return {
        object: { findings: [FINDING], category_notes: [] },
        attempts: 1,
        selfCorrected: false,
      };
    });
    const { result } = run({ generate: generate as never, loadKnown });

    await result;

    expect(order).toEqual(["model", "known"]);
    expect(loadKnown).toHaveBeenCalledTimes(1);
  });

  it("drops a finding that repeats an active risk, counts it, and says so in the trace", async () => {
    const { result, trace } = run({
      loadKnown: async () => ({
        existingRisks: [
          {
            risk_description: "Attackers copied customer records from a vendor test system.",
            impact_description: "Customer data we send to the vendor may have been exposed.",
          },
        ],
        priorFindings: [],
      }),
    });

    const analysed = await result;

    expect(analysed.ok && analysed.kept).toEqual([]);
    expect(analysed.ok && analysed.duplicatesDropped).toBe(1);
    expect(trace.snapshot().dropped["duplicate.active_risk"]).toBe(1);
  });

  it("applies the caps after the de-duplication and counts what they took", async () => {
    // Four candidates with nothing in common, so that none of them is a repeat of another.
    const subjects = [
      ["Ransomware locked the payroll servers", "Salary payments could be delayed"],
      ["A leaked admin token exposed the billing portal", "Invoices of customers could be read"],
      ["Employees phished by a fake vendor email", "Mailbox contents might have been copied"],
      ["An unpatched gateway let intruders into the staging network", "Test data could be altered"],
    ];
    const many = subjects.map(([risk, impact]) => ({
      ...FINDING,
      risk_description: `${risk}.`,
      impact_description: `${impact}.`,
    }));
    const { result, trace } = run({ generate: answer(many) as never });

    const analysed = await result;

    // Three per category.
    expect(analysed.ok && analysed.kept).toHaveLength(3);
    expect(trace.snapshot().dropped["cap"]).toBe(1);
  });

  it("starts the call in JSON-object mode when the loop learned that the provider needs it", async () => {
    const { result, generate } = run({ jsonObjectFallback: true });

    await result;

    const given = generate.mock.calls[0][0] as { model: unknown };
    expect(given.model).not.toEqual({ id: "the-model" });
  });

  describe("the check of a finding that rests on a snippet", () => {
    const PAGE = (text: string) => async (url: string) => ({
      url,
      title: "Page",
      publishedAt: null,
      text,
      links: [],
    });
    const readerOf = (read: PageReader) => jest.fn(read);

    // Two pages of two publishers: the most the evidence supports is `medium`, so that a confidence
    // that is lowered here is lowered by the check and not by the ceiling of one page.
    const TWO_PACK: EvidenceSource[] = [
      PACK[0],
      {
        ...PACK[0],
        id: "S2",
        url: "https://blog.example.net/acme-breach",
        title: "Acme breach, the details",
        content: `Acme told customers that ${QUOTE}.`,
      },
    ];
    const TWO_SOURCES = {
      ...FINDING,
      confidence: "high" as const,
      evidence: [
        { source_id: "S1", quote: QUOTE },
        { source_id: "S2", quote: QUOTE },
      ],
    };

    it("reads by the rules it is given: the registry category first under the credibility rules", async () => {
      const VENDOR_AND_REGULATOR: EvidenceSource[] = [
        {
          ...PACK[0],
          onVendorSite: true,
          url: "https://acme.com/security/notice",
          content: `Acme said that ${QUOTE}.`,
        },
        { ...PACK[0], id: "S2", url: "https://ico.org.uk/action/acme", content: `ICO: ${QUOTE}.` },
      ];
      const cited = { ...TWO_SOURCES, confidence: "medium" as const };
      const firstRead = async (rules?: "credibility") => {
        const readPage = readerOf(PAGE(`Acme said on Monday that ${QUOTE}.`));
        await run({
          pack: VENDOR_AND_REGULATOR,
          readPage,
          generate: answer([cited]) as never,
          ...(rules === undefined ? {} : { rules }),
        }).result;
        return readPage.mock.calls.map(([url]) => url);
      };

      // The vendor's own page is the best tier; an official source is the best category.
      expect(await firstRead()).toEqual(["https://acme.com/security/notice"]);
      expect(await firstRead("credibility")).toEqual(["https://ico.org.uk/action/acme"]);
    });

    it("reads the page of the source, and keeps the finding as it was when the page holds the quote", async () => {
      const readPage = readerOf(PAGE(`Acme said on Monday that ${QUOTE}.`));
      const { result, trace } = run({ readPage });

      const analysed = await result;

      expect(readPage).toHaveBeenCalledTimes(1);
      expect(readPage).toHaveBeenCalledWith(PACK[0].url, expect.any(AbortSignal));
      expect(analysed.ok && analysed.kept[0].snippet_only).toBeFalsy();
      expect(trace.snapshot().phases.map((phase) => phase.name)).toEqual([
        "analysis",
        "validation",
        "verification",
      ]);
      expect(trace.snapshot().steps).toEqual([
        expect.objectContaining({ by: "verification", tool: "read", outcome: "confirmed" }),
      ]);
    });

    it("marks the finding as snippet only and lowers its confidence when the page does not hold the quote", async () => {
      const readPage = readerOf(PAGE("Acme said on Monday that it is looking into an incident."));
      const { result } = run({
        readPage,
        pack: TWO_PACK,
        generate: answer([TWO_SOURCES]) as never,
      });

      const analysed = await result;

      expect(readPage).toHaveBeenCalledTimes(1);
      expect(analysed.ok && analysed.kept[0]).toMatchObject({
        snippet_only: true,
        confidence: "low",
      });
    });

    it("labels a finding whose page does not hold the quote as contradicted", async () => {
      const readPage = readerOf(PAGE("Acme said on Monday that it is looking into an incident."));
      const { result } = run({
        readPage,
        pack: TWO_PACK,
        generate: answer([TWO_SOURCES]) as never,
      });

      const analysed = await result;

      expect(analysed.ok && analysed.credibility).toEqual([
        expect.objectContaining({
          label: "low",
          basis: expect.objectContaining({ rule: "contradicted" }),
        }),
      ]);
    });

    it("marks the finding but keeps its confidence when the page cannot be read", async () => {
      const readPage = readerOf(async () => {
        throw new PageReadError("blocked_by_site");
      });
      const { result } = run({
        readPage,
        pack: TWO_PACK,
        generate: answer([TWO_SOURCES]) as never,
      });

      const analysed = await result;

      expect(readPage).toHaveBeenCalledTimes(2);
      expect(analysed.ok && analysed.kept[0]).toMatchObject({
        snippet_only: true,
        confidence: "medium",
      });
    });

    it("reads nothing when it is given no reader, and records no phase for it", async () => {
      const { result, trace } = run();

      const analysed = await result;

      expect(analysed.ok && analysed.kept[0].snippet_only).toBeUndefined();
      expect(trace.snapshot().phases.map((phase) => phase.name)).toEqual([
        "analysis",
        "validation",
      ]);
    });

    it("reads nothing for a finding that rests on a page that was read", async () => {
      const readPage = readerOf(PAGE(""));
      const pack: EvidenceSource[] = [{ ...PACK[0], kind: "page" }];
      const { result } = run({ readPage, pack });

      await result;

      expect(readPage).not.toHaveBeenCalled();
    });

    it("reads only for the findings that stay: not for one that repeats an active risk", async () => {
      const readPage = readerOf(PAGE(""));
      const loadKnown = async () => ({
        existingRisks: [
          {
            risk_description: FINDING.risk_description,
            impact_description: FINDING.impact_description,
          },
        ],
        priorFindings: [],
      });
      const { result } = run({ readPage, loadKnown });

      const analysed = await result;

      expect(analysed.ok && analysed.kept).toEqual([]);
      expect(readPage).not.toHaveBeenCalled();
    });

    it("reads only for the findings that the caps leave", async () => {
      // Four candidates with nothing in common, each from a source of its own, none of them dated
      // (a source with no date is in no event, so none of them is dropped as the same event).
      const subjects = [
        ["Ransomware locked the payroll servers", "Salary payments could be delayed"],
        ["A leaked admin token exposed the billing portal", "Invoices of customers could be read"],
        ["Employees phished by a fake vendor email", "Mailbox contents might have been copied"],
        ["An unpatched gateway let intruders into the staging network", "Test data could change"],
      ];
      const pack: EvidenceSource[] = subjects.map((_subject, index) => ({
        ...PACK[0],
        id: `S${index + 1}`,
        url: `https://news.example.com/story-${index + 1}`,
        publishedAt: null,
      }));
      const many = subjects.map(([risk, impact], index) => ({
        ...FINDING,
        risk_description: `${risk}.`,
        impact_description: `${impact}.`,
        evidence: [{ source_id: `S${index + 1}`, quote: QUOTE }],
      }));
      const readPage = readerOf(PAGE(`Acme said that ${QUOTE}.`));
      const { result, trace } = run({ pack, readPage, generate: answer(many) as never });

      const analysed = await result;

      // Three per category, so the fourth is capped and its page is not read.
      expect(analysed.ok && analysed.kept).toHaveLength(3);
      expect(trace.snapshot().dropped["cap"]).toBe(1);
      expect(readPage.mock.calls.map(([url]) => url).sort()).toEqual([
        "https://news.example.com/story-1",
        "https://news.example.com/story-2",
        "https://news.example.com/story-3",
      ]);
    });

    it("reads nothing when the model's answer is lost, because the answer failed", async () => {
      const readPage = readerOf(PAGE(""));
      const failing = jest.fn(async () => {
        throw new Error("down");
      });
      const { result } = run({ readPage, generate: failing as never });

      await result;

      expect(readPage).not.toHaveBeenCalled();
    });
  });

  describe("the verifier", () => {
    const PASS = { same_company: true, quote_supports_claim: true, source_in_window: true };

    /** Answers the analysis with the findings and the verifier with the verdicts. */
    const twoCalls = (
      findings: ResearchOutput["findings"],
      verdicts: Array<{ finding: number } & typeof PASS>,
    ) =>
      jest.fn(async (params: { schema: unknown; onUsage?: (usage: TokenUsage) => void }) => {
        const usage = { inputTokens: 100, outputTokens: 10, totalTokens: 110 };
        params.onUsage?.(usage);
        const object =
          params.schema === verifierSchema
            ? { verdicts }
            : ({ findings, category_notes: [] } satisfies ResearchOutput);
        return { object, attempts: 1, selfCorrected: false, usage };
      });

    const SECOND = {
      ...FINDING,
      category: "legal_regulatory" as const,
      risk_description: "A regulator opened an inquiry into how the vendor stores payroll data.",
      impact_description: "Our payroll records may be held in a way the regulator objects to.",
      evidence: [{ source_id: "S2", quote: "opened an inquiry into how Acme stores payroll data" }],
    };
    const TWO_FINDINGS_PACK: EvidenceSource[] = [
      PACK[0],
      {
        ...PACK[0],
        id: "S2",
        category: "legal_regulatory",
        url: "https://news.example.com/acme-inquiry",
        title: "Regulator looks at Acme",
        content: "A regulator opened an inquiry into how Acme stores payroll data.",
        publishedAt: null,
      },
    ];

    it("asks nothing more of the model unless it is switched on", async () => {
      const generate = twoCalls([FINDING], []);
      const { result } = run({ generate: generate as never });

      await result;

      expect(generate).toHaveBeenCalledTimes(1);
    });

    it("asks once more for the findings that stay, and keeps the ones it passes", async () => {
      const generate = twoCalls([FINDING], [{ finding: 1, ...PASS }]);
      const { result, trace } = run({ generate: generate as never, verifier: true });

      const analysed = await result;

      expect(generate).toHaveBeenCalledTimes(2);
      const verifierCall = generate.mock.calls[1][0] as unknown as {
        prompt: string;
        model: unknown;
      };
      expect(verifierCall.prompt).toContain('<finding n="1" category="security_incidents">');
      expect(analysed.ok && analysed.kept).toHaveLength(1);
      expect(trace.snapshot().modelCalls.map((call) => call.purpose)).toEqual([
        "analysis",
        "verifier",
      ]);
    });

    it("does not keep a finding it fails, says why in the trace, and still reports what the model proposed", async () => {
      const generate = twoCalls(
        [FINDING, SECOND],
        [
          { finding: 1, ...PASS },
          { finding: 2, ...PASS, same_company: false },
        ],
      );
      const { result, trace } = run({
        generate: generate as never,
        verifier: true,
        pack: TWO_FINDINGS_PACK,
      });

      const analysed = await result;

      expect(analysed.ok && analysed.kept.map((finding) => finding.category)).toEqual([
        "security_incidents",
      ]);
      expect(analysed.ok && analysed.output.findings).toHaveLength(2);
      expect(trace.snapshot().dropped["verifier.other_company"]).toBe(1);
    });

    it("keeps each label with its finding when the verifier drops one", async () => {
      const generate = twoCalls(
        [FINDING, SECOND],
        [
          { finding: 1, ...PASS, same_company: false },
          { finding: 2, ...PASS },
        ],
      );
      const { result } = run({
        generate: generate as never,
        verifier: true,
        pack: TWO_FINDINGS_PACK,
      });

      const analysed = await result;

      expect(analysed.ok && analysed.kept.map((finding) => finding.category)).toEqual([
        "legal_regulatory",
      ]);
      expect(
        analysed.ok && analysed.credibility.map(({ basis }) => basis.sources.map(({ url }) => url)),
      ).toEqual([["https://news.example.com/acme-inquiry"]]);
    });

    it("numbers the findings as they stay, after the de-duplication and the caps", async () => {
      // The first candidate repeats an active risk and is dropped; the verifier sees one finding.
      const loadKnown = async () => ({
        existingRisks: [
          {
            risk_description: FINDING.risk_description,
            impact_description: FINDING.impact_description,
          },
        ],
        priorFindings: [],
      });
      const generate = twoCalls([FINDING, SECOND], [{ finding: 1, ...PASS, same_company: false }]);
      const { result } = run({
        generate: generate as never,
        verifier: true,
        pack: TWO_FINDINGS_PACK,
        loadKnown,
      });

      const analysed = await result;

      const prompt = (generate.mock.calls[1][0] as unknown as { prompt: string }).prompt;
      expect(prompt.match(/<finding n=/g)).toHaveLength(1);
      expect(prompt).toContain('<finding n="1" category="legal_regulatory">');
      expect(analysed.ok && analysed.kept).toEqual([]);
    });

    it("asks about the findings that the caps leave and no others", async () => {
      // Four candidates in one category, each from a source of its own and none of them dated (a
      // source with no date is in no event): the caps leave three.
      const subjects = [
        ["Ransomware locked the payroll servers", "Salary payments could be delayed"],
        ["A leaked admin token exposed the billing portal", "Invoices of customers could be read"],
        ["Employees phished by a fake vendor email", "Mailbox contents might have been copied"],
        ["An unpatched gateway let intruders into the staging network", "Test data could change"],
      ];
      const pack: EvidenceSource[] = subjects.map((_subject, index) => ({
        ...PACK[0],
        id: `S${index + 1}`,
        url: `https://news.example.com/story-${index + 1}`,
        publishedAt: null,
      }));
      const many = subjects.map(([risk, impact], index) => ({
        ...FINDING,
        risk_description: `${risk}.`,
        impact_description: `${impact}.`,
        evidence: [{ source_id: `S${index + 1}`, quote: QUOTE }],
      }));
      const generate = twoCalls(many, []);
      const { result } = run({ generate: generate as never, verifier: true, pack });

      await result;

      const prompt = (generate.mock.calls[1][0] as unknown as { prompt: string }).prompt;
      expect(prompt.match(/<finding n=/g)).toHaveLength(3);
    });

    it("keeps every finding, and records the call as failed, when the verifier does not answer", async () => {
      const base = twoCalls([FINDING], []);
      const generate = jest.fn(async (params: { schema: unknown }) => {
        if (params.schema === verifierSchema) throw new Error("down");
        return base(params as never);
      });
      const { result, trace } = run({ generate: generate as never, verifier: true });

      const analysed = await result;

      expect(analysed.ok && analysed.kept).toHaveLength(1);
      expect(trace.snapshot().modelCalls).toEqual([
        expect.objectContaining({ purpose: "analysis", ok: true }),
        expect.objectContaining({ purpose: "verifier", ok: false }),
      ]);
    });

    it("asks no verifier when no finding stays", async () => {
      const generate = twoCalls([], []);
      const { result } = run({ generate: generate as never, verifier: true });

      await result;

      expect(generate).toHaveBeenCalledTimes(1);
    });

    it("asks with the model of the analysis, in JSON-object mode when the loop learned it", async () => {
      const generate = twoCalls([FINDING], []);
      const { result } = run({
        generate: generate as never,
        verifier: true,
        jsonObjectFallback: true,
      });

      await result;

      const [analysis, verifier] = generate.mock.calls.map(
        ([params]) => (params as unknown as { model: unknown }).model,
      );
      expect(analysis).not.toEqual({ id: "the-model" });
      expect(verifier).toBe(analysis);
    });

    it("reads the pages and asks the verifier at the same time", async () => {
      const events: string[] = [];
      const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
      const base = twoCalls([FINDING], [{ finding: 1, ...PASS }]);
      const generate = jest.fn(async (params: { schema: unknown }) => {
        if (params.schema !== verifierSchema) return base(params as never);
        events.push("verifier:start");
        await tick();
        events.push("verifier:end");
        return base(params as never);
      });
      const readPage = jest.fn(async (url: string) => {
        events.push("read:start");
        await tick();
        events.push("read:end");
        return { url, title: "Page", publishedAt: null, text: QUOTE, links: [] };
      });
      const { result } = run({ generate: generate as never, verifier: true, readPage });

      await result;

      expect(events.indexOf("verifier:start")).toBeLessThan(events.indexOf("read:end"));
      expect(events.indexOf("read:start")).toBeLessThan(events.indexOf("verifier:end"));
    });

    it("marks the finding the verifier passes when its page does not hold the quote", async () => {
      const generate = twoCalls([FINDING], [{ finding: 1, ...PASS }]);
      const readPage = jest.fn(async (url: string) => ({
        url,
        title: "Page",
        publishedAt: null,
        text: "Acme is looking into an incident.",
        links: [],
      }));
      const { result, trace } = run({ generate: generate as never, verifier: true, readPage });

      const analysed = await result;

      expect(analysed.ok && analysed.kept[0]).toMatchObject({ snippet_only: true });
      expect(trace.snapshot().phases.map((phase) => phase.name)).toEqual([
        "analysis",
        "validation",
        "verification",
      ]);
    });
  });

  describe("the credibility of the findings", () => {
    it("gives every kept finding a label, in the order of the findings", async () => {
      const { result } = run();

      const analysed = await result;

      expect(analysed.ok && analysed.credibility).toEqual([
        {
          label: "low",
          basis: {
            rule: "unverified",
            registry_version: REGISTRY_VERSION,
            name_only: false,
            sources: [
              {
                url: PACK[0].url,
                category: "unverified",
                publisher: "example",
                entry: null,
                reviewed: false,
                reading: "unconfirmed",
              },
            ],
          },
        },
      ]);
    });

    it("labels a record by the provenance it is given", async () => {
      const NVD = "https://nvd.nist.gov/vuln/detail/CVE-2026-31337";
      const { result } = run({
        pack: [{ ...PACK[0], kind: "page", url: NVD }],
        provenance: new Map([[NVD, { record: "kev" }]]),
      });

      const analysed = await result;

      expect(analysed.ok && analysed.credibility).toEqual([
        expect.objectContaining({
          label: "high",
          basis: expect.objectContaining({ rule: "official_record" }),
        }),
      ]);
    });

    it("returns no labels when no finding stays", async () => {
      const { result } = run({ generate: answer([]) as never });

      const analysed = await result;

      expect(analysed.ok && analysed.credibility).toEqual([]);
    });
  });

  it("lets a failure of the look-up through: it is not a model failure", async () => {
    const { result } = run({
      loadKnown: async () => {
        throw new Error("database is down");
      },
    });

    await expect(result).rejects.toThrow("database is down");
  });
});
