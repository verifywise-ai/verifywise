import { NewFinding } from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  RESEARCH_CONFIDENCES,
  RESEARCH_LIKELIHOODS,
  RESEARCH_SEVERITIES,
  ResearchOutput,
  researchOutputSchema,
} from "../schema";

const finding = (overrides: Record<string, unknown> = {}) => ({
  category: "security_incidents",
  risk_description: "The vendor disclosed a ransomware attack in 2025.",
  impact_description: "Customer data held by the vendor may have been exposed.",
  likelihood: "Possible",
  risk_severity: "Major",
  action_plan: "Ask the vendor for its incident report and the scope of the exposed data.",
  confidence: "medium",
  evidence: [{ source_id: "S1", quote: "confirmed a ransomware attack" }],
  ...overrides,
});

const sample = (overrides: Record<string, unknown> = {}) => ({
  findings: [finding()],
  category_notes: [{ category: "security_incidents", note: "One incident, disclosed in 2025." }],
  ...overrides,
});

const accepts = (value: unknown) => researchOutputSchema.safeParse(value).success;

describe("researchOutputSchema", () => {
  it("accepts a valid answer and returns it unchanged", () => {
    const parsed: ResearchOutput = researchOutputSchema.parse(sample());
    // Checked by the compiler: the enum fields of a parsed finding fit the columns of a stored one.
    const columns: Pick<NewFinding, "category" | "likelihood" | "risk_severity" | "confidence"> =
      parsed.findings[0];

    expect(parsed).toEqual(sample());
    expect(columns.confidence).toBe("medium");
  });

  it("accepts an answer with no findings and no notes: nothing qualified", () => {
    expect(accepts({ findings: [], category_notes: [] })).toBe(true);
  });

  it("requires both lists", () => {
    expect(accepts({ findings: [] })).toBe(false);
    expect(accepts({ category_notes: [] })).toBe(false);
    expect(accepts({})).toBe(false);
  });

  describe("category", () => {
    it.each(["security_incidents", "certifications", "legal_regulatory", "ai_specific"])(
      "accepts %s on a finding and on a note",
      (category) => {
        expect(
          accepts(
            sample({
              findings: [finding({ category })],
              category_notes: [{ category, note: "ok" }],
            }),
          ),
        ).toBe(true);
      },
    );

    it("rejects an unknown category on a finding", () => {
      expect(accepts(sample({ findings: [finding({ category: "pricing" })] }))).toBe(false);
    });

    it("rejects an unknown category on a note", () => {
      expect(accepts(sample({ category_notes: [{ category: "pricing", note: "ok" }] }))).toBe(
        false,
      );
    });
  });

  describe("likelihood, severity and confidence", () => {
    it("uses exactly the values the vendor risk register accepts", () => {
      expect([...RESEARCH_LIKELIHOODS]).toEqual([
        "Rare",
        "Unlikely",
        "Possible",
        "Likely",
        "Almost certain",
      ]);
      expect([...RESEARCH_SEVERITIES]).toEqual([
        "Negligible",
        "Minor",
        "Moderate",
        "Major",
        "Catastrophic",
      ]);
      expect([...RESEARCH_CONFIDENCES]).toEqual(["low", "medium", "high"]);
    });

    it("accepts every likelihood, severity and confidence value", () => {
      for (const likelihood of RESEARCH_LIKELIHOODS) {
        expect(accepts(sample({ findings: [finding({ likelihood })] }))).toBe(true);
      }
      for (const risk_severity of RESEARCH_SEVERITIES) {
        expect(accepts(sample({ findings: [finding({ risk_severity })] }))).toBe(true);
      }
      for (const confidence of RESEARCH_CONFIDENCES) {
        expect(accepts(sample({ findings: [finding({ confidence })] }))).toBe(true);
      }
    });

    it('rejects the severity "Critical", which belongs to the old impact scale', () => {
      expect(accepts(sample({ findings: [finding({ risk_severity: "Critical" })] }))).toBe(false);
    });

    it.each([
      ["likelihood", "Certain"],
      ["likelihood", "almost certain"],
      ["risk_severity", "major"],
      ["risk_severity", "Severe"],
      ["confidence", "certain"],
      ["confidence", "High"],
    ])("rejects %s %p", (field, value) => {
      expect(accepts(sample({ findings: [finding({ [field]: value })] }))).toBe(false);
    });
  });

  describe("text lengths", () => {
    it.each(["risk_description", "impact_description", "action_plan"])(
      "accepts 300 characters in %s and rejects 301",
      (field) => {
        expect(accepts(sample({ findings: [finding({ [field]: "x".repeat(300) })] }))).toBe(true);
        expect(accepts(sample({ findings: [finding({ [field]: "x".repeat(301) })] }))).toBe(false);
      },
    );

    it("accepts a quote of 300 characters and rejects one of 301", () => {
      const withQuote = (quote: string) =>
        sample({ findings: [finding({ evidence: [{ source_id: "S1", quote }] })] });

      expect(accepts(withQuote("q".repeat(300)))).toBe(true);
      expect(accepts(withQuote("q".repeat(301)))).toBe(false);
    });

    it("accepts a note of 200 characters and rejects one of 201", () => {
      const withNote = (note: string) =>
        sample({ category_notes: [{ category: "certifications", note }] });

      expect(accepts(withNote("n".repeat(200)))).toBe(true);
      expect(accepts(withNote("n".repeat(201)))).toBe(false);
    });
  });

  describe("evidence", () => {
    const quoteFor = (id: string) => ({ source_id: id, quote: `quote ${id}` });

    it("rejects a finding with no evidence", () => {
      expect(accepts(sample({ findings: [finding({ evidence: [] })] }))).toBe(false);
    });

    it("accepts between one and five evidence items", () => {
      for (const count of [1, 2, 5]) {
        const evidence = Array.from({ length: count }, (_, index) => quoteFor(`S${index + 1}`));
        expect(accepts(sample({ findings: [finding({ evidence })] }))).toBe(true);
      }
    });

    it("rejects six evidence items", () => {
      const evidence = Array.from({ length: 6 }, (_, index) => quoteFor(`S${index + 1}`));

      expect(accepts(sample({ findings: [finding({ evidence })] }))).toBe(false);
    });

    it("rejects an evidence item without a source id or without a quote", () => {
      expect(accepts(sample({ findings: [finding({ evidence: [{ quote: "q" }] })] }))).toBe(false);
      expect(accepts(sample({ findings: [finding({ evidence: [{ source_id: "S1" }] })] }))).toBe(
        false,
      );
      expect(
        accepts(sample({ findings: [finding({ evidence: [{ source_id: 1, quote: "q" }] })] })),
      ).toBe(false);
    });
  });

  describe("list sizes", () => {
    it("accepts 20 findings and rejects 21", () => {
      expect(accepts(sample({ findings: Array.from({ length: 20 }, () => finding()) }))).toBe(true);
      expect(accepts(sample({ findings: Array.from({ length: 21 }, () => finding()) }))).toBe(
        false,
      );
    });

    it("accepts four notes and rejects five", () => {
      const notes = (count: number) =>
        Array.from({ length: count }, () => ({ category: "ai_specific", note: "ok" }));

      expect(accepts(sample({ category_notes: notes(4) }))).toBe(true);
      expect(accepts(sample({ category_notes: notes(5) }))).toBe(false);
    });
  });

  describe("required fields", () => {
    it.each([
      "category",
      "risk_description",
      "impact_description",
      "likelihood",
      "risk_severity",
      "action_plan",
      "confidence",
      "evidence",
    ])("rejects a finding without %s", (field) => {
      const incomplete: Record<string, unknown> = { ...finding() };
      delete incomplete[field];

      expect(accepts(sample({ findings: [incomplete] }))).toBe(false);
    });

    it("rejects a note without its text", () => {
      expect(accepts(sample({ category_notes: [{ category: "ai_specific" }] }))).toBe(false);
    });
  });

  // An unexpected key means the model made up a field. The self-correction loop feeds that back
  // as an issue instead of the drift being hidden, as in the risk direction schema.
  describe("unexpected keys", () => {
    it("rejects an extra key at the top, on a finding, on an evidence item and on a note", () => {
      expect(accepts({ ...sample(), summary: "x" })).toBe(false);
      expect(accepts(sample({ findings: [finding({ title: "x" })] }))).toBe(false);
      expect(
        accepts(
          sample({
            findings: [finding({ evidence: [{ source_id: "S1", quote: "q", url: "u" }] })],
          }),
        ),
      ).toBe(false);
      expect(
        accepts(sample({ category_notes: [{ category: "ai_specific", note: "ok", extra: 1 }] })),
      ).toBe(false);
    });
  });
});
