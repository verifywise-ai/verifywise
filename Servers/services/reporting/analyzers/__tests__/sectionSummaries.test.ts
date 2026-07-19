const mockGenerateText = jest.fn();
jest.mock("ai", () => ({ generateText: (...a: any[]) => mockGenerateText(...a) }));

import { runSectionSummaries, MAX_CONCURRENT } from "../sectionSummaries";

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
    text: prompt.includes("Vendors") ? "V-SUMMARY" : prompt.includes("Compliance") ? "C-SUMMARY" : "R-SUMMARY",
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

  it("prompt names the section label, framework, project, grounding sentence and word count", async () => {
    await runSectionSummaries("model" as any, reportData as any);
    const firstPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(firstPrompt).toContain("Use Case Risks"); // SECTION_LABELS lookup, not the raw key
    expect(firstPrompt).not.toContain("projectRisks");
    expect(firstPrompt).toContain("EU AI Act");
    expect(firstPrompt).toContain("Acme Project");
    expect(firstPrompt).toContain("Use only the data provided — never introduce a fact that does not appear in it.");
    expect(firstPrompt).toContain("150-250 words");
  });

  it("skips sections with no data instead of calling the model", async () => {
    const out = await runSectionSummaries("model" as any, { sections: { projectRisks: null, compliance: undefined } } as any);
    expect(out).toEqual({});
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("skips a dataCollector-shaped empty section (zero counts, empty arrays)", async () => {
    const out = await runSectionSummaries("model" as any, {
      sections: { vendorRisks: { totalRisks: 0, risksByLevel: [], risks: [] } },
    } as any);
    expect(out).toEqual({});
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("one section failing does not lose the others", async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ text: "ok" });
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
    const out = await runSectionSummaries("model" as any, { sections: { projectRisks: huge } } as any);
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
});
