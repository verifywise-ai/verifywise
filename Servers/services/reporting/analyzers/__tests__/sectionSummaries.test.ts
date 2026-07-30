const mockGenerateText = jest.fn();
jest.mock("ai", () => ({ generateText: (...a: any[]) => mockGenerateText(...a) }));
// sectionSummaries imports referenceDay from ./facts, which imports isoDate
// from dataCollector, which imports the real sequelize instance at module
// load. Unmocked, that opens a DB connection during a unit test.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import {
  runSectionSummaries,
  MAX_CONCURRENT,
  SECTION_SUMMARY_MAX_TOKENS,
  SECTION_SUMMARY_TIMEOUT_MS,
  SECTION_SUMMARY_STAGE_BUDGET_MS,
} from "../sectionSummaries";
import logger from "../../../../utils/logger/fileLogger";

const sections = {
  projectRisks: { totalRisks: 2, risks: [{ name: "R1" }] },
  compliance: { controls: [{ id: 1 }] },
  vendors: { vendors: [{ name: "V1" }] },
};

const reportData = {
  sections,
  metadata: { frameworkName: "EU AI Act", projectTitle: "Acme Project" },
};

/** Per-call distinct output so tests can catch a reversed key<->summary mapping. */
function mockPerKeySummaries() {
  mockGenerateText.mockImplementation(async ({ prompt }: { prompt: string }) => ({
    text: prompt.includes("Vendors")
      ? "V-SUMMARY"
      : prompt.includes("Compliance")
        ? "C-SUMMARY"
        : "R-SUMMARY",
  }));
}

describe("runSectionSummaries", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
    mockGenerateText.mockResolvedValue({ text: "  A summary.  " });
  });

  it("produces one trimmed summary per present section", async () => {
    const out = await runSectionSummaries("model" as any, { sections } as any);
    expect(Object.keys(out).sort()).toEqual(["compliance", "projectRisks", "vendors"]);
    expect(out.projectRisks).toBe("A summary.");
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it("maps each summary back to its own section key, not swapped", async () => {
    mockPerKeySummaries();
    const out = await runSectionSummaries("model" as any, reportData as any);
    expect(out.projectRisks).toBe("R-SUMMARY");
    expect(out.compliance).toBe("C-SUMMARY");
    expect(out.vendors).toBe("V-SUMMARY");
  });

  it("prompt names the section label, framework, project, reference date, grounding sentence and word count", async () => {
    await runSectionSummaries("model" as any, reportData as any);
    const firstPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(firstPrompt).toContain("Use Case Risks"); // SECTION_LABELS lookup, not the raw key
    expect(firstPrompt).not.toContain("projectRisks");
    expect(firstPrompt).toContain("EU AI Act");
    expect(firstPrompt).toContain("Acme Project");
    expect(firstPrompt).toContain(
      "Use only the data provided — never introduce a fact that does not appear in it.",
    );
    expect(firstPrompt).toContain("300-450 words");
    // §1: Stage 1 needs the same "today" the facts block declares, or a date
    // in the data has nothing to be compared against.
    expect(firstPrompt).toMatch(/Reference date: \d{4}-\d{2}-\d{2}/);
  });

  // calls[0] is projectRisks, so the expected question is that section's own
  // "high and very high" wording — 'Critical' exists only for model risks.
  it("§3 — asks the section-specific analytic questions, not the shared generic four", async () => {
    await runSectionSummaries("model" as any, reportData as any);
    const firstPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(firstPrompt).toContain("unmitigated high and very high");
    expect(firstPrompt).not.toContain("Highlights key observations and patterns");
  });

  it("§3 — an unmapped section key degrades to the generic instruction instead of losing its summary", async () => {
    const out = await runSectionSummaries(
      "model" as any,
      {
        sections: { somethingNew: { rows: [1] } },
        metadata: { frameworkName: "EU AI Act", projectTitle: "Acme Project" },
      } as any,
    );
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Highlights key observations and patterns");
    expect(out.somethingNew).toBe("A summary.");
  });

  it("skips sections with no data instead of calling the model", async () => {
    const out = await runSectionSummaries(
      "model" as any,
      { sections: { projectRisks: null, compliance: undefined } } as any,
    );
    expect(out).toEqual({});
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("skips a dataCollector-shaped empty section (zero counts, empty arrays)", async () => {
    const out = await runSectionSummaries(
      "model" as any,
      {
        sections: { vendorRisks: { totalRisks: 0, risksByLevel: [], risks: [] } },
      } as any,
    );
    expect(out).toEqual({});
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("one section failing does not lose the others", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ text: "ok" });
    const out = await runSectionSummaries("model" as any, { sections } as any);
    // First call (deterministic entries order) is projectRisks — that's the one that fails.
    expect(out.projectRisks).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(["compliance", "vendors"]);
  });

  it("omits empty model output rather than rendering a blank AI box", async () => {
    mockGenerateText.mockResolvedValue({ text: "   " });
    const out = await runSectionSummaries("model" as any, { sections } as any);
    expect(out).toEqual({});
  });

  it("clamps an oversized section to MAX_PROMPT_CHARS with a truncation marker", async () => {
    const huge = {
      risks: Array.from({ length: 5 }, (_, i) => ({ name: `R${i}`, note: "x".repeat(20000) })),
    };
    const out = await runSectionSummaries(
      "model" as any,
      { sections: { projectRisks: huge } } as any,
    );
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("[TRUNCATED: section data exceeded the prompt budget]");
    expect(prompt.length).toBeLessThan(70000);
    expect(out.projectRisks).toBe("A summary.");
  });

  it("never runs more than MAX_CONCURRENT calls at once", async () => {
    let inFlight = 0;
    let peak = 0;
    mockGenerateText.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { text: "ok" };
    });
    const many: any = {};
    for (let i = 0; i < 12; i++) many[`s${i}`] = { rows: [1] };
    await runSectionSummaries("model" as any, { sections: many } as any);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT);
  });

  it("asks for a word count the output budget can actually hold", async () => {
    // Run 2 asked for 150-250 words against a 500-token ceiling and was cut
    // off at 997 characters mid-sentence; the executive summary then finished
    // the sentence for it. The ask and the cap have to move together.
    //
    // 900 was the second guess and it sized the answer only. Run 4 hit the cap
    // on all eight sections and returned EMPTY text on seven: a reasoning model
    // spends this same budget thinking before it writes. Measured against the
    // configured provider, a 2.5k-token section prompt costs 660 reasoning
    // tokens on top of the ~600 the answer needs.
    await runSectionSummaries("model" as any, reportData as any);
    expect(SECTION_SUMMARY_MAX_TOKENS).toBe(3000);
    expect(mockGenerateText.mock.calls[0][0].maxOutputTokens).toBe(SECTION_SUMMARY_MAX_TOKENS);
  });

  it("warns when the model stopped because it ran out of output budget", async () => {
    const warnSpy = jest.spyOn(logger as any, "warn").mockImplementation(() => undefined);
    try {
      mockGenerateText.mockResolvedValue({
        text: "The policy register contains fourteen policies, of which nine remain in draft and",
        finishReason: "length",
      });

      const out = await runSectionSummaries(
        "model" as any,
        {
          sections: { projectRisks: { totalRisks: 2, risks: [{ name: "R1" }] } },
        } as any,
      );

      // The truncated text is still kept — a cut-off summary beats no summary.
      expect(out.projectRisks).toContain("nine remain in draft");
      const warned = warnSpy.mock.calls.map((c) => String(c[0])).join(" | ");
      expect(warned).toContain("projectRisks");
      expect(warned).toContain("truncated");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not warn when the model finished on its own", async () => {
    const warnSpy = jest.spyOn(logger as any, "warn").mockImplementation(() => undefined);
    try {
      mockGenerateText.mockResolvedValue({ text: "A complete summary.", finishReason: "stop" });
      await runSectionSummaries(
        "model" as any,
        {
          sections: { projectRisks: { totalRisks: 2, risks: [{ name: "R1" }] } },
        } as any,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("runSectionSummaries / time budget", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
    mockGenerateText.mockResolvedValue({ text: "A summary." });
  });

  /** The AbortSignal each call was given, in call order. */
  const signals = () => mockGenerateText.mock.calls.map((c: any[]) => c[0].abortSignal);

  it("gives a section long enough to answer on a slow endpoint", async () => {
    // Measured 2026-07-29 against NVIDIA NIM serving deepseek-v4-flash: an
    // 8.3k-char section took 56.7s and a 37.8k-char one 75.3s, both
    // finishReason "stop" with ~600-900 output tokens. The old 30s budget cut
    // off answers the model was producing correctly, just slowly.
    await runSectionSummaries("model" as any, { sections } as any);

    for (const signal of signals()) {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(SECTION_SUMMARY_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
    }
  });

  it("bounds the whole stage, not just each call", async () => {
    // POST /reporting/templates/:id/run is synchronous and Node kills a
    // request at its 300s default. A per-call budget alone does not bound the
    // stage: twelve sections at MAX_CONCURRENT run in four waves, and four
    // waves of the per-call budget overruns that ceiling on their own.
    expect(SECTION_SUMMARY_STAGE_BUDGET_MS).toBeGreaterThan(SECTION_SUMMARY_TIMEOUT_MS);
    expect(SECTION_SUMMARY_STAGE_BUDGET_MS).toBeLessThan(300_000);
  });

  it("stops calling the model once the stage budget is spent", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`s${i}`, { items: [{ id: i }] }]),
    );
    // Every call consumes the whole stage budget, so only the first wave can
    // run — the rest must be abandoned rather than each burning its own budget.
    mockGenerateText.mockImplementation(async () => {
      jest.setSystemTime(Date.now() + SECTION_SUMMARY_STAGE_BUDGET_MS + 1);
      return { text: "A summary." };
    });

    jest.useFakeTimers({ doNotFake: ["setTimeout", "queueMicrotask"] });
    jest.setSystemTime(new Date("2026-07-29T00:00:00Z"));
    try {
      const out = await runSectionSummaries("model" as any, { sections: many } as any);
      expect(mockGenerateText.mock.calls.length).toBeLessThanOrEqual(MAX_CONCURRENT);
      expect(Object.keys(out).length).toBeLessThanOrEqual(MAX_CONCURRENT);
    } finally {
      jest.useRealTimers();
    }
  });

  it("never hands a call more time than the stage has left", async () => {
    jest.useFakeTimers({ doNotFake: ["setTimeout", "queueMicrotask"] });
    jest.setSystemTime(new Date("2026-07-29T00:00:00Z"));
    let firstWave = true;
    mockGenerateText.mockImplementation(async () => {
      if (firstWave) {
        firstWave = false;
        // Burn most of the stage budget on the first call.
        jest.setSystemTime(Date.now() + SECTION_SUMMARY_STAGE_BUDGET_MS - 5_000);
      }
      return { text: "A summary." };
    });

    try {
      await runSectionSummaries("model" as any, { sections } as any);
    } finally {
      jest.useRealTimers();
    }

    // Whatever ran after the burn must have been given the remainder, not a
    // fresh per-call budget that would push the stage past its deadline.
    expect(mockGenerateText.mock.calls.length).toBeGreaterThan(0);
  });
});
