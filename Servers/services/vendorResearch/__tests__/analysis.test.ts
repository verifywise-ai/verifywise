import type { TokenUsage } from "../../../advisor/llmSelfCorrect";
import type { EvidenceSource } from "../../../domain.layer/interfaces/i.vendorResearch";
import { PageReadError, type PageReader } from "../../webResearch/readPage";
import { EDGAR_FILER_TIMEOUT_MS, analyse } from "../analysis";
import { buildSystemPrompt } from "../prompts";
import { REGISTRY_VERSION } from "../sourceRegistry/entries";
import { credibilityOutputSchema, type ResearchOutput } from "../schema";
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
        schema: credibilityOutputSchema,
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

  it("always asks under the credibility rules: the schema and the prompt without the confidence, given no rules", async () => {
    const { result, generate } = run();

    await result;

    expect(generate.mock.calls[0][0].schema).toBe(credibilityOutputSchema);
    expect(generate.mock.calls[0][0].system).toBe(buildSystemPrompt(NOW));
    expect(generate.mock.calls[0][0].system).not.toMatch(/confidence/i);
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

    // Two pages of two publishers, so that a label that is lowered here is lowered by the check of
    // the snippet and not because one page is all the finding rests on.
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
      evidence: [
        { source_id: "S1", quote: QUOTE },
        { source_id: "S2", quote: QUOTE },
      ],
    };

    it("reads the page of the best source: the highest registry category first, not the vendor's own page", async () => {
      const VENDOR_AND_REGULATOR: EvidenceSource[] = [
        {
          ...PACK[0],
          onVendorSite: true,
          url: "https://acme.com/security/notice",
          content: `Acme said that ${QUOTE}.`,
        },
        { ...PACK[0], id: "S2", url: "https://ico.org.uk/action/acme", content: `ICO: ${QUOTE}.` },
      ];
      const readPage = readerOf(PAGE(`Acme said on Monday that ${QUOTE}.`));

      await run({
        pack: VENDOR_AND_REGULATOR,
        readPage,
        generate: answer([TWO_SOURCES]) as never,
      }).result;

      // An official source is the best category; the vendor's own page comes after it.
      expect(readPage.mock.calls.map(([url]) => url)).toEqual(["https://ico.org.uk/action/acme"]);
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

    it("marks the finding as snippet only, and gives it no confidence, when the page does not hold the quote", async () => {
      const readPage = readerOf(PAGE("Acme said on Monday that it is looking into an incident."));
      const { result } = run({
        readPage,
        pack: TWO_PACK,
        generate: answer([TWO_SOURCES]) as never,
      });

      const analysed = await result;

      expect(readPage).toHaveBeenCalledTimes(1);
      expect(analysed.ok && analysed.kept[0]).toMatchObject({ snippet_only: true });
      expect(analysed.ok && analysed.kept[0]).not.toHaveProperty("confidence");
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

    it("marks the finding as snippet only, and gives it no confidence, when the page cannot be read", async () => {
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
      expect(analysed.ok && analysed.kept[0]).toMatchObject({ snippet_only: true });
      expect(analysed.ok && analysed.kept[0]).not.toHaveProperty("confidence");
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

    it("hands the provenance of the pack to the verifier, so that it sees the database of a record", async () => {
      const generate = twoCalls([FINDING], [{ finding: 1, ...PASS }]);
      const { result } = run({
        generate: generate as never,
        verifier: true,
        provenance: new Map([[PACK[0].url, { record: "kev" }]]),
      });

      await result;

      const verifierCall = generate.mock.calls[1][0] as unknown as { prompt: string };
      expect(verifierCall.prompt).toContain(
        `<source url="${PACK[0].url}" date="2026-09-30" database="CISA Known Exploited Vulnerabilities Catalog">`,
      );
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

  describe("who filed an EDGAR filing under the stored CIK (Q28)", () => {
    const STORED = { ...TARGET, identifiers: { secCik: "0000320193" } };
    const folder = (n: number) => `000032019326${String(n).padStart(6, "0")}`;
    const filingUrl = (n: number, cik = "320193") =>
      `https://www.sec.gov/Archives/edgar/data/${cik}/${folder(n)}/acme-8k-${n}.htm`;
    const quoteOf = (n: number) => `report ${n} says attackers copied customer records`;
    const filing = (n: number, over: Partial<EvidenceSource> = {}): EvidenceSource => ({
      id: `S${n}`,
      category: "security_incidents",
      kind: "page",
      onVendorSite: false,
      url: filingUrl(n),
      title: `Form 8-K report ${n}`,
      content: `Item 1.05. Acme ${quoteOf(n)} from a test system.`,
      publishedAt: null,
      ...over,
    });
    const citing = (ids: number[], over: Partial<ResearchOutput["findings"][number]> = {}) => ({
      ...FINDING,
      evidence: ids.map((n) => ({ source_id: `S${n}`, quote: quoteOf(n) })),
      ...over,
    });
    const SECOND = {
      risk_description:
        "Payroll files were exposed through a storage bucket that anyone could open.",
      impact_description: "Salary data of our staff could be read by strangers.",
    };

    /**
     * Answers by address; an address that is not in the table is answered `vendor`, and one that is
     * keeps its answer, a `null` (the SEC does not know) and an error (the ask fails) included.
     */
    const answering = (table: Record<string, "vendor" | "other" | null | Error> = {}) =>
      jest.fn<Promise<"vendor" | "other" | null>, [string, string, AbortSignal]>(async (url) => {
        const answer = url in table ? table[url] : "vendor";
        if (answer instanceof Error) throw answer;
        return answer;
      });

    const credibilityOfRun = async (over: Partial<Parameters<typeof analyse>[0]>) => {
      const analysed = await run({ target: STORED, ...over }).result;
      if (!analysed.ok) throw new Error("the analysis failed");
      return analysed;
    };

    it("labels a filing the vendor filed as the vendor's statement", async () => {
      const edgarFilerOf = answering({ [filingUrl(1)]: "vendor" });

      const analysed = await credibilityOfRun({
        pack: [filing(1)],
        generate: answer([citing([1])]) as never,
        edgarFilerOf,
      });

      expect(analysed.credibility).toEqual([
        expect.objectContaining({
          label: "high",
          basis: expect.objectContaining({
            rule: "vendor_statement",
            sources: [
              expect.objectContaining({
                url: filingUrl(1),
                category: "vendor",
                entry: "sec",
                vendor_kind: "statement",
                reading: "read",
              }),
            ],
          }),
        }),
      ]);
    });

    const NOT_THE_VENDOR: Array<[string, () => Promise<"vendor" | "other" | null>]> = [
      ["somebody else filed it", async () => "other"],
      ["the SEC does not know", async () => null],
      [
        "the function fails",
        async () => {
          throw new Error("redis is down");
        },
      ],
      ["the function answers with something else", async () => "yes" as never],
    ];

    it.each(NOT_THE_VENDOR)(
      "labels a filing unverified and downgraded when %s",
      async (_label, answerOf) => {
        const analysed = await credibilityOfRun({
          pack: [filing(1)],
          generate: answer([citing([1])]) as never,
          edgarFilerOf: jest.fn(answerOf),
        });

        expect(analysed.kept).toHaveLength(1);
        expect(analysed.credibility).toEqual([
          expect.objectContaining({
            label: "low",
            basis: expect.objectContaining({
              rule: "unverified",
              sources: [
                expect.objectContaining({ category: "unverified", entry: "sec", downgraded: true }),
              ],
            }),
          }),
        ]);
      },
    );

    it("asks nothing without a function for it, and the filing is unverified", async () => {
      const analysed = await credibilityOfRun({
        pack: [filing(1)],
        generate: answer([citing([1])]) as never,
      });

      expect(analysed.credibility).toEqual([
        expect.objectContaining({
          label: "low",
          basis: expect.objectContaining({ rule: "unverified" }),
        }),
      ]);
    });

    it("asks with the address, the stored CIK as ten digits and a signal that stops after a while", async () => {
      const edgarFilerOf = answering();

      await credibilityOfRun({
        pack: [filing(1)],
        generate: answer([citing([1])]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf).toHaveBeenCalledTimes(1);
      expect(edgarFilerOf).toHaveBeenCalledWith(
        filingUrl(1),
        "0000320193",
        expect.any(AbortSignal),
      );
      expect(edgarFilerOf.mock.calls[0][2].aborted).toBe(false);
    });

    it("gives all the asks one deadline, so that a slow answer does not hold the analysis", async () => {
      // The signal of the asks is made by AbortSignal.timeout; keep what each one was made with.
      const made: Array<{ ms: number; signal: AbortSignal }> = [];
      const timeout = jest.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const signal = new AbortController().signal;
        made.push({ ms, signal });
        return signal;
      });
      try {
        const edgarFilerOf = answering();

        await credibilityOfRun({
          pack: [filing(1), filing(2)],
          generate: answer([citing([1, 2])]) as never,
          edgarFilerOf,
        });

        expect(edgarFilerOf).toHaveBeenCalledTimes(2);
        const [first, second] = edgarFilerOf.mock.calls.map(([, , signal]) => signal);
        expect(second).toBe(first);
        expect(made.find(({ signal }) => signal === first)?.ms).toBe(EDGAR_FILER_TIMEOUT_MS);
      } finally {
        timeout.mockRestore();
      }
    });

    it.each([
      ["a vendor with no stored CIK", TARGET],
      ["a stored CIK that is no CIK", { ...TARGET, identifiers: { secCik: "CIK 12" } }],
      [
        "a vendor with other identifiers only",
        { ...TARGET, identifiers: { lei: "5493001KJTIIGC8Y1R12" } },
      ],
    ])("asks nothing for %s", async (_label, target) => {
      const edgarFilerOf = answering();

      const analysed = await credibilityOfRun({
        target,
        pack: [filing(1)],
        generate: answer([citing([1])]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf).not.toHaveBeenCalled();
      expect(analysed.credibility).toEqual([
        expect.objectContaining({
          label: "low",
          basis: expect.objectContaining({ rule: "unverified" }),
        }),
      ]);
    });

    it.each([
      ["a filing under another CIK", filingUrl(1, "789019"), undefined],
      [
        "a page of the SEC that is no filing",
        "https://www.sec.gov/newsroom/press-releases/2026-1",
        undefined,
      ],
      [
        "a page on another host",
        `https://www.example.com/Archives/edgar/data/320193/${folder(1)}/a.htm`,
        undefined,
      ],
      ["a record of the SEC", filingUrl(1), { record: "sec" as const }],
    ])("asks nothing about %s", async (_label, url, origin) => {
      const edgarFilerOf = answering();

      await credibilityOfRun({
        pack: [filing(1, { url })],
        provenance: origin === undefined ? undefined : new Map([[url, origin]]),
        generate: answer([citing([1])]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf).not.toHaveBeenCalled();
    });

    it("asks about the address a page answered from, and labels the cited address by it", async () => {
      const SHORT = "https://t.co/abc";
      const edgarFilerOf = answering({ [filingUrl(1)]: "vendor" });

      const analysed = await credibilityOfRun({
        pack: [filing(1, { url: SHORT })],
        provenance: new Map([[SHORT, { answeredUrl: filingUrl(1) }]]),
        generate: answer([citing([1])]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf).toHaveBeenCalledTimes(1);
      expect(edgarFilerOf.mock.calls[0][0]).toBe(filingUrl(1));
      expect(analysed.credibility[0].basis.sources[0]).toMatchObject({
        url: SHORT,
        category: "vendor",
        entry: "sec",
      });
    });

    it("labels each source of a finding by the answer for it", async () => {
      const edgarFilerOf = answering({ [filingUrl(1)]: "vendor", [filingUrl(2)]: "other" });

      const analysed = await credibilityOfRun({
        pack: [filing(1), filing(2)],
        generate: answer([citing([1, 2])]) as never,
        edgarFilerOf,
      });

      expect(analysed.credibility[0].basis.sources).toEqual([
        expect.objectContaining({ url: filingUrl(1), category: "vendor" }),
        expect.objectContaining({ url: filingUrl(2), category: "unverified", downgraded: true }),
      ]);
      expect(analysed.credibility[0]).toMatchObject({ label: "high" });
    });

    it("asks at most five times in a run, in the order of the sources, and leaves the rest unverified", async () => {
      const edgarFilerOf = answering();

      const analysed = await credibilityOfRun({
        pack: [1, 2, 3, 4, 5, 6, 7].map((n) => filing(n)),
        generate: answer([citing([1, 2, 3, 4, 5]), citing([6, 7], SECOND)]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf.mock.calls.map(([url]) => url)).toEqual(
        [1, 2, 3, 4, 5].map((n) => filingUrl(n)),
      );
      expect(analysed.kept).toHaveLength(2);
      expect(analysed.credibility[0]).toMatchObject({ label: "high" });
      expect(analysed.credibility[1]).toMatchObject({
        label: "low",
        basis: { rule: "unverified" },
      });
      expect(analysed.credibility[1].basis.sources).toEqual([
        expect.objectContaining({ url: filingUrl(6), category: "unverified", downgraded: true }),
        expect.objectContaining({ url: filingUrl(7), category: "unverified", downgraded: true }),
      ]);
    });

    it("counts the asks, not the answers: a failed one takes a place", async () => {
      const edgarFilerOf = answering({ [filingUrl(1)]: null, [filingUrl(2)]: new Error("down") });

      await credibilityOfRun({
        pack: [1, 2, 3, 4, 5, 6].map((n) => filing(n)),
        generate: answer([citing([1, 2, 3, 4, 5]), citing([6], SECOND)]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf).toHaveBeenCalledTimes(5);
    });

    describe("what the SEC can be asked", () => {
      /** The full submission of a filing, in the folder of the CIK: it is a filing, but no header's. */
      const submissionUrl = (n: number) =>
        `https://www.sec.gov/Archives/edgar/data/320193/0000320193-26-${String(n).padStart(6, "0")}.txt`;
      /** The second document of filing `n`: the exhibit that comes with its 8-K, in its folder. */
      const exhibitUrl = (n: number) =>
        `https://www.sec.gov/Archives/edgar/data/320193/${folder(n)}/acme-ex99-${n}.htm`;

      it("asks nothing about an address the header of a filing cannot be named for, and it takes no place", async () => {
        const edgarFilerOf = answering();
        const submissions = [1, 2, 3, 4, 5].map((n) =>
          filing(n, { id: `S${n}`, url: submissionUrl(n) }),
        );

        const analysed = await credibilityOfRun({
          pack: [...submissions, filing(6)],
          generate: answer([citing([1, 2, 3, 4, 5, 6])]) as never,
          edgarFilerOf,
        });

        // The five full submissions come first in the pack and name no header; the 8-K is asked.
        expect(edgarFilerOf.mock.calls.map(([url]) => url)).toEqual([filingUrl(6)]);
        expect(
          analysed.credibility[0].basis.sources.map(({ url, category }) => [url, category]),
        ).toEqual([
          ...[1, 2, 3, 4, 5].map((n) => [submissionUrl(n), "unverified"]),
          [filingUrl(6), "vendor"],
        ]);
      });

      it("asks once for the documents of one filing, and labels each of them by the answer", async () => {
        const edgarFilerOf = answering({ [filingUrl(1)]: "other" });

        const analysed = await credibilityOfRun({
          pack: [filing(1), filing(1, { id: "S7", url: exhibitUrl(1) })],
          generate: answer([
            citing([1], {}),
            { ...citing([7], SECOND), evidence: [{ source_id: "S7", quote: quoteOf(1) }] },
          ]) as never,
          edgarFilerOf,
        });

        expect(edgarFilerOf).toHaveBeenCalledTimes(1);
        expect(edgarFilerOf.mock.calls[0][0]).toBe(filingUrl(1));
        expect(analysed.kept).toHaveLength(2);
        expect(analysed.credibility.map(({ label }) => label)).toEqual(["low", "low"]);
        expect(
          analysed.credibility.flatMap(({ basis }) => basis.sources.map(({ url }) => url)),
        ).toEqual([filingUrl(1), exhibitUrl(1)]);
      });

      it("counts a filing once whatever the number of its documents: five filings are asked, not five documents", async () => {
        const edgarFilerOf = answering();

        await credibilityOfRun({
          pack: [
            filing(1),
            filing(1, { id: "S7", url: exhibitUrl(1) }),
            filing(2),
            filing(3),
            filing(4),
            filing(5),
            filing(6),
          ],
          generate: answer([
            {
              ...citing([1, 2, 3, 4, 5, 6]),
              evidence: [1, 2, 3, 4, 5, 6].map((n) => ({ source_id: `S${n}`, quote: quoteOf(n) })),
            },
            { ...citing([7], SECOND), evidence: [{ source_id: "S7", quote: quoteOf(1) }] },
          ]) as never,
          edgarFilerOf,
        });

        expect(edgarFilerOf.mock.calls.map(([url]) => url)).toEqual(
          [1, 2, 3, 4, 5].map((n) => filingUrl(n)),
        );
      });

      it("labels a second document of a filing by the answer for the filing, also after the five places are taken", async () => {
        const edgarFilerOf = answering({ [filingUrl(1)]: "vendor" });

        const analysed = await credibilityOfRun({
          pack: [
            filing(1),
            filing(2),
            filing(3),
            filing(4),
            filing(5),
            filing(6),
            filing(1, { id: "S7", url: exhibitUrl(1) }),
          ],
          generate: answer([
            citing([1, 2, 3, 4, 5, 6]),
            { ...citing([7], SECOND), evidence: [{ source_id: "S7", quote: quoteOf(1) }] },
          ]) as never,
          edgarFilerOf,
        });

        // The sixth filing was not asked; the exhibit of the first shares its answer all the same.
        expect(edgarFilerOf).toHaveBeenCalledTimes(5);
        expect(analysed.credibility[1].basis.sources[0]).toMatchObject({
          url: exhibitUrl(1),
          category: "vendor",
        });
      });
    });

    it("asks only about the sources the findings that stay cite", async () => {
      const edgarFilerOf = answering();

      await credibilityOfRun({
        pack: [filing(1), filing(2), filing(3)],
        generate: answer([citing([2])]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf.mock.calls.map(([url]) => url)).toEqual([filingUrl(2)]);
    });

    it("asks nothing when no finding stays", async () => {
      const edgarFilerOf = answering();

      await credibilityOfRun({
        pack: [filing(1)],
        generate: answer([]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf).not.toHaveBeenCalled();
    });

    it("asks once for a source that two findings cite", async () => {
      const edgarFilerOf = answering();

      await credibilityOfRun({
        pack: [filing(1)],
        generate: answer([citing([1]), citing([1], SECOND)]) as never,
        edgarFilerOf,
      });

      expect(edgarFilerOf).toHaveBeenCalledTimes(1);
    });

    it("asks after the check of the findings, and only for the findings that stay", async () => {
      const PASS = { same_company: true, quote_supports_claim: true, source_in_window: true };
      const generate = jest.fn(
        async (params: { schema: unknown; onUsage?: (usage: TokenUsage) => void }) => {
          const usage = { inputTokens: 100, outputTokens: 10, totalTokens: 110 };
          params.onUsage?.(usage);
          const object =
            params.schema === verifierSchema
              ? {
                  verdicts: [
                    { finding: 1, ...PASS, same_company: false },
                    { finding: 2, ...PASS },
                  ],
                }
              : ({
                  findings: [citing([1]), citing([2], SECOND)],
                  category_notes: [],
                } satisfies ResearchOutput);
          return { object, attempts: 1, selfCorrected: false, usage };
        },
      );
      const edgarFilerOf = answering({ [filingUrl(2)]: "vendor" });

      const analysed = await credibilityOfRun({
        pack: [filing(1), filing(2)],
        generate: generate as never,
        verifier: true,
        edgarFilerOf,
      });

      expect(analysed.kept).toHaveLength(1);
      expect(edgarFilerOf.mock.calls.map(([url]) => url)).toEqual([filingUrl(2)]);
      expect(analysed.credibility).toEqual([
        expect.objectContaining({
          label: "high",
          basis: expect.objectContaining({
            sources: [expect.objectContaining({ url: filingUrl(2), category: "vendor" })],
          }),
        }),
      ]);
    });

    it("leaves the provenance it was given as it was, and keeps what else it says of a source", async () => {
      const url = filingUrl(1);
      const given: ReadonlyMap<string, { canonicalUrl?: string; answeredUrl?: string }> = new Map([
        [url, { canonicalUrl: "https://www.example.com/canonical" }],
      ]);

      const analysed = await credibilityOfRun({
        pack: [filing(1)],
        provenance: given,
        generate: answer([citing([1])]) as never,
        edgarFilerOf: answering(),
      });

      expect([...given]).toEqual([[url, { canonicalUrl: "https://www.example.com/canonical" }]]);
      expect(analysed.credibility[0].basis.sources[0]).toMatchObject({ category: "vendor" });
    });
  });

  describe("an abandoned run", () => {
    const abandoned = () => {
      const controller = new AbortController();
      controller.abort();
      return controller.signal;
    };
    const failedAs = async (result: ReturnType<typeof run>["result"]) => {
      const analysed = await result;
      expect(analysed.ok).toBe(false);
      if (analysed.ok) throw new Error("the analysis was not abandoned");
      expect(analysed.error).toMatchObject({ name: "AnalysisAbandoned" });
    };

    it("asks no model when the run is abandoned before the analysis", async () => {
      const { result, generate } = run({ signal: abandoned() });

      await failedAs(result);
      expect(generate).not.toHaveBeenCalled();
    });

    it("gives the model call a signal that aborts with the run", async () => {
      const controller = new AbortController();
      let received: AbortSignal | undefined;
      const generate = jest.fn(
        (params: { extra?: { abortSignal?: AbortSignal } }) =>
          new Promise<never>(() => {
            received = params.extra?.abortSignal;
          }),
      );
      run({ signal: controller.signal, generate: generate as never });

      expect(received?.aborted).toBe(false);
      controller.abort();
      expect(received?.aborted).toBe(true);
    });

    it("looks nothing up and reads no page when the run is abandoned during the analysis", async () => {
      const controller = new AbortController();
      const readPage = jest.fn();
      const generate = jest.fn(async () => {
        controller.abort();
        return {
          object: { findings: [FINDING], category_notes: [] } satisfies ResearchOutput,
          attempts: 1,
          selfCorrected: false,
        };
      });
      const loadKnown = jest.fn(NOTHING_KNOWN);

      const { result } = run({
        signal: controller.signal,
        generate: generate as never,
        loadKnown,
        readPage: readPage as never,
        verifier: true,
      });

      await failedAs(result);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(loadKnown).not.toHaveBeenCalled();
      expect(readPage).not.toHaveBeenCalled();
    });

    it("asks the verifier nothing when the run is abandoned while the look-up of the earlier findings runs", async () => {
      const controller = new AbortController();
      const generate = answer([FINDING]);
      const { result } = run({
        signal: controller.signal,
        generate: generate as never,
        verifier: true,
        loadKnown: async () => {
          controller.abort();
          return { existingRisks: [], priorFindings: [] };
        },
      });

      await failedAs(result);
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it("asks the SEC nothing when the run is abandoned while the verifier runs", async () => {
      const controller = new AbortController();
      const generate = jest.fn(async (params: { schema: unknown }) => {
        if (params.schema === verifierSchema) controller.abort();
        return {
          object:
            params.schema === verifierSchema
              ? { verdicts: [] }
              : ({ findings: [FINDING], category_notes: [] } satisfies ResearchOutput),
          attempts: 1,
          selfCorrected: false,
        };
      });
      const edgarFilerOf = jest.fn();

      const { result } = run({
        signal: controller.signal,
        generate: generate as never,
        verifier: true,
        edgarFilerOf,
      });

      await failedAs(result);
      expect(edgarFilerOf).not.toHaveBeenCalled();
    });

    it("gives the verifier a signal that aborts with the run, and asks it nothing once aborted", async () => {
      const controller = new AbortController();
      const seen: Array<AbortSignal | undefined> = [];
      const generate = jest.fn(
        async (params: { schema: unknown; extra?: { abortSignal?: AbortSignal } }) => {
          if (params.schema === verifierSchema) {
            seen.push(params.extra?.abortSignal);
            controller.abort();
            expect(params.extra?.abortSignal?.aborted).toBe(true);
          }
          return {
            object:
              params.schema === verifierSchema
                ? { verdicts: [] }
                : ({ findings: [FINDING], category_notes: [] } satisfies ResearchOutput),
            attempts: 1,
            selfCorrected: false,
          };
        },
      );

      await run({ signal: controller.signal, generate: generate as never, verifier: true }).result;

      expect(seen).toHaveLength(1);
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
