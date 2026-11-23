/**
 * Prompt vr-16: the analysis call must hand the provenance of the run to the user prompt, or no
 * genuine record gets its `database` attribute and the rules read every record as an ordinary page.
 */
import type { EvidenceSource } from "../../../domain.layer/interfaces/i.vendorResearch";
import { analyse } from "../analysis";
import type { SourceProvenance } from "../evidence";
import type { ResearchOutput } from "../schema";
import { buildTarget } from "../target";
import { createTraceRecorder } from "../trace";

const NOW = new Date("2026-11-11T12:00:00Z");
const TARGET = buildTarget({
  vendor_name: "Example Ltd",
  website: "example.com",
  vendor_provides: "Payroll software",
});

const PACK: EvidenceSource[] = [
  {
    id: "S1",
    category: "security_incidents",
    kind: "page",
    onVendorSite: false,
    url: "https://db.test/sec/1",
    title: "Form 8-K",
    content: "SEC EDGAR\nForm 8-K, Item 1.05: Example Ltd reports a cybersecurity incident.",
    publishedAt: "2026-11-01",
  },
  {
    id: "S2",
    category: "ai_specific",
    kind: "page",
    onVendorSite: true,
    url: "https://example.com/terms#changed-0123abcd",
    title: "Change to Terms of service",
    content: "Page change: the terms on the vendor's website changed.\nAdded:\n- A new line.",
    publishedAt: "2026-11-01",
  },
];

const PROVENANCE = new Map<string, SourceProvenance>([
  ["https://db.test/sec/1", { record: "sec" }],
  ["https://example.com/terms#changed-0123abcd", { policyChange: true }],
]);

describe("analyse hands the provenance to the user prompt (vr-16)", () => {
  it("writes database and change on the sources the provenance names", async () => {
    const generate = jest.fn(async () => ({
      object: { findings: [], category_notes: [] } satisfies ResearchOutput,
      attempts: 1,
      selfCorrected: false,
    }));

    await analyse({
      target: TARGET,
      pack: PACK,
      provenance: PROVENANCE,
      model: { id: "the-model" },
      jsonObjectFallback: false,
      now: NOW,
      generate: generate as never,
      loadKnown: async () => ({ existingRisks: [], priorFindings: [] }),
      trace: createTraceRecorder(),
    });

    const prompt = (generate.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt;
    expect(prompt).toContain(
      '<source id="S1" category="security_incidents" kind="page" database="SEC EDGAR" url="https://db.test/sec/1">',
    );
    expect(prompt).toContain(
      'site="vendor" change="terms" url="https://example.com/terms#changed-0123abcd">',
    );
  });
});
