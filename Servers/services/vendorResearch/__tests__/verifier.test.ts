import type { TokenUsage } from "../../../advisor/llmSelfCorrect";
import type { NewFinding } from "../../../domain.layer/interfaces/i.vendorResearch";
import { buildVerifierSystemPrompt, buildVerifierUserPrompt } from "../prompts";
import { buildTarget } from "../target";
import { createTraceRecorder } from "../trace";
import { VERIFIER_TIMEOUT_MS, verifierPasses, verifierSchema } from "../verifier";

const NOW = new Date("2026-10-10T12:00:00Z");
const TARGET = buildTarget({
  vendor_name: "Acme",
  website: "acme.com",
  vendor_provides: "Payroll software",
});
const MODEL = { id: "the-verifier-model" };

const finding = (overrides: Partial<NewFinding> = {}): NewFinding => ({
  category: "security_incidents",
  risk_description: "Attackers copied customer records from a vendor test system.",
  impact_description: "Customer data we send to the vendor may have been exposed.",
  action_plan: "Ask the vendor for its incident report.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  rationale: null,
  sources: [
    {
      url: "https://news.example.com/acme-breach",
      title: "Acme confirms breach",
      quote: "attackers copied customer records",
      published_at: "2026-09-30",
    },
  ],
  ...overrides,
});

const PASS = { same_company: true, quote_supports_claim: true, source_in_window: true };

type Verdict = { finding: number } & typeof PASS;

/** A `generate` that answers with the verdicts, and reports its tokens as a real call does. */
const answers = (verdicts: Verdict[], usage: TokenUsage = fixedUsage()) =>
  jest.fn(async (params: { onUsage?: (usage: TokenUsage) => void }) => {
    params.onUsage?.(usage);
    return {
      object: { verdicts },
      attempts: 1,
      selfCorrected: false,
      fellBackToJsonObject: false,
      usage,
    };
  });

function fixedUsage(): TokenUsage {
  return { inputTokens: 700, outputTokens: 40, totalTokens: 740 };
}

function run(
  generate: ReturnType<typeof answers> | jest.Mock,
  findings: NewFinding[] = [finding()],
  trace = createTraceRecorder(),
) {
  const result = verifierPasses({
    target: TARGET,
    findings,
    now: NOW,
    model: MODEL,
    modelId: "verifier-model-1",
    generate: generate as never,
    trace,
  });
  return { result, trace };
}

describe("the limits of the verifier", () => {
  it("gives up after thirty seconds", () => {
    expect(VERIFIER_TIMEOUT_MS).toBe(30_000);
  });
});

describe("verifierSchema", () => {
  const parse = (value: unknown) => verifierSchema.safeParse(value).success;

  it("takes a verdict for each finding, and an empty list", () => {
    expect(parse({ verdicts: [{ finding: 1, ...PASS }] })).toBe(true);
    expect(parse({ verdicts: [] })).toBe(true);
  });

  it.each([
    ["a number below 1", { finding: 0, ...PASS }],
    ["a number that is not whole", { finding: 1.5, ...PASS }],
    ["a missing question", { finding: 1, same_company: true, source_in_window: true }],
    ["an answer that is not true or false", { finding: 1, ...PASS, same_company: "yes" }],
  ])("refuses a verdict with %s", (_label, verdict) => {
    expect(parse({ verdicts: [verdict] })).toBe(false);
  });

  it("refuses more verdicts than a run has findings", () => {
    const nine = Array.from({ length: 9 }, (_, index) => ({ finding: index + 1, ...PASS }));

    expect(parse({ verdicts: nine })).toBe(false);
    expect(parse({ verdicts: nine.slice(0, 8) })).toBe(true);
  });
});

describe("verifierPasses", () => {
  it("asks once, with the schema, the prompts of the verifier and the usual limits", async () => {
    const generate = answers([{ finding: 1, ...PASS }]);
    const findings = [finding()];
    const timeout = jest.spyOn(AbortSignal, "timeout");
    try {
      const { result } = run(generate, findings);
      await result;

      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledWith({
        model: MODEL,
        schema: verifierSchema,
        system: buildVerifierSystemPrompt(NOW),
        prompt: buildVerifierUserPrompt(TARGET, findings),
        temperature: 0,
        innerMaxRetries: 1,
        maxSelfCorrectionAttempts: 1,
        onUsage: expect.any(Function),
        extra: { abortSignal: expect.any(AbortSignal) },
      });
      expect(timeout).toHaveBeenCalledWith(30_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("shows the database of a cited address that has a record in the provenance, and only that one", async () => {
    const KEV = "https://www.cisa.gov/known-exploited-vulnerabilities-catalog?cve=CVE-2026-1";
    const generate = answers([{ finding: 1, ...PASS }]);
    const findings = [
      finding({
        sources: [
          { url: KEV, title: "CVE-2026-1", quote: "q", published_at: "2026-09-30" },
          {
            url: "https://news.example.com/acme-breach",
            title: "Acme confirms breach",
            quote: "attackers copied customer records",
            published_at: "2026-09-30",
          },
        ],
      }),
    ];

    await verifierPasses({
      target: TARGET,
      findings,
      now: NOW,
      model: MODEL,
      generate: generate as never,
      trace: createTraceRecorder(),
      provenance: new Map([[KEV, { record: "kev" }]]),
    });

    const prompt = (generate.mock.calls[0][0] as unknown as { prompt: string }).prompt;
    expect(prompt).toContain(
      `<source url="${KEV}" date="2026-09-30" database="CISA Known Exploited Vulnerabilities Catalog">`,
    );
    expect(prompt.match(/database=/g)).toHaveLength(1);
    expect(prompt).toBe(
      buildVerifierUserPrompt(TARGET, findings, (url) => (url === KEV ? "kev" : undefined)),
    );
  });

  it("passes every finding when every verdict is true", async () => {
    const { result, trace } = run(
      answers([
        { finding: 1, ...PASS },
        { finding: 2, ...PASS },
      ]),
      [finding(), finding({ category: "legal_regulatory" })],
    );

    expect(await result).toEqual([true, true]);
    expect(trace.snapshot().dropped).toEqual({});
    expect(trace.snapshot().rejected).toEqual([]);
  });

  it.each([
    ["same_company", "other_company"],
    ["quote_supports_claim", "not_supported"],
    ["source_in_window", "out_of_window"],
  ] as const)(
    "does not pass a finding whose answer to %s is false, and traces it as %s",
    async (question, reason) => {
      const { result, trace } = run(
        answers([
          { finding: 1, ...PASS },
          { finding: 2, ...PASS, [question]: false },
        ]),
        [finding(), finding({ category: "legal_regulatory" })],
      );

      expect(await result).toEqual([true, false]);
      const snapshot = trace.snapshot();
      expect(snapshot.dropped).toEqual({ [`verifier.${reason}`]: 1 });
      expect(snapshot.rejected).toEqual([
        {
          stage: "verifier",
          reason,
          category: "legal_regulatory",
          text: "Attackers copied customer records from a vendor test system.",
        },
      ]);
    },
  );

  it("counts a finding that fails several questions once, under the first of them in the order of the questions", async () => {
    const { result, trace } = run(
      answers([
        {
          finding: 1,
          same_company: false,
          quote_supports_claim: false,
          source_in_window: false,
        },
        { finding: 2, ...PASS, quote_supports_claim: false, source_in_window: false },
      ]),
      [finding(), finding()],
    );

    expect(await result).toEqual([false, false]);
    expect(trace.snapshot().dropped).toEqual({
      "verifier.other_company": 1,
      "verifier.not_supported": 1,
    });
  });

  it("passes a finding that has no verdict, and ignores a verdict for a number that is no finding", async () => {
    const { result, trace } = run(
      answers([
        { finding: 2, ...PASS, same_company: false },
        { finding: 9, ...PASS, same_company: false },
      ]),
      [finding(), finding()],
    );

    expect(await result).toEqual([true, false]);
    expect(trace.snapshot().dropped).toEqual({ "verifier.other_company": 1 });
  });

  it("lets the strictest of two verdicts for one finding decide", async () => {
    const { result } = run(
      answers([
        { finding: 1, ...PASS },
        { finding: 1, ...PASS, source_in_window: false },
      ]),
    );

    expect(await result).toEqual([false]);
  });

  it("records the call as the verifier's, with its tokens, its attempts and the model", async () => {
    const { result, trace } = run(answers([{ finding: 1, ...PASS }]));

    await result;

    expect(trace.snapshot().modelCalls).toEqual([
      expect.objectContaining({
        purpose: "verifier",
        model: "verifier-model-1",
        attempts: 1,
        inputTokens: 700,
        outputTokens: 40,
        totalTokens: 740,
        ok: true,
      }),
    ]);
  });

  describe("when the call fails", () => {
    const failing = (usage: TokenUsage = fixedUsage()) =>
      jest.fn(async (params: { onUsage?: (usage: TokenUsage) => void }) => {
        params.onUsage?.(usage);
        throw new Error("Incorrect API key provided: sk-secret");
      });

    it("passes every finding: the verifier can only take findings away on an answer", async () => {
      const { result, trace } = run(failing(), [finding(), finding()]);

      expect(await result).toEqual([true, true]);
      expect(trace.snapshot().dropped).toEqual({});
    });

    it("records the call as failed, with the tokens it used, and nothing of the error", async () => {
      const { result, trace } = run(failing());

      await result;

      expect(trace.snapshot().modelCalls).toEqual([
        expect.objectContaining({ purpose: "verifier", ok: false, inputTokens: 700 }),
      ]);
      expect(JSON.stringify(trace.snapshot())).not.toContain("sk-secret");
    });
  });

  it("asks no model when there is no finding", async () => {
    const generate = answers([]);

    const { result, trace } = run(generate, []);

    expect(await result).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
    expect(trace.snapshot().modelCalls).toEqual([]);
  });

  it("cuts the claim it records to 120 characters, cleaned", async () => {
    const long = `${"a".repeat(130)}\u0000b`;
    const { result, trace } = run(answers([{ finding: 1, ...PASS, same_company: false }]), [
      finding({ risk_description: long }),
    ]);

    await result;

    const [rejected] = trace.snapshot().rejected;
    expect(rejected.text).toBe("a".repeat(120));
  });
});
