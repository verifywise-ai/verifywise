import { hierarchyOutputSchema } from "../direction/schema";
import { buildDirectionSystemPrompt, buildDirectionUserPrompt } from "../direction/prompts";
import { RiskPromptRow } from "../../../utils/riskLink.utils";

const group = (overrides: Record<string, unknown> = {}) => ({
  parent_risk_id: 1,
  child_risk_ids: [2, 3],
  reason: "Both are instances of the same drift problem.",
  ...overrides,
});

describe("hierarchyOutputSchema", () => {
  it("accepts an empty groups array — a flat cluster is a valid answer", () => {
    expect(hierarchyOutputSchema.safeParse({ groups: [] }).success).toBe(true);
  });

  it("accepts a well-formed group", () => {
    expect(hierarchyOutputSchema.safeParse({ groups: [group()] }).success).toBe(true);
  });

  // Strictness is what makes the self-correction loop earn its keep: an extra
  // key is a hallucinated field, and silently dropping it hides the drift.
  it("rejects an unknown key on a group", () => {
    const result = hierarchyOutputSchema.safeParse({
      groups: [{ ...group(), confidence: 0.9 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key at the top level", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [], notes: "hello" }).success,
    ).toBe(false);
  });

  it("rejects a group with no children", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ child_risk_ids: [] })] }).success,
    ).toBe(false);
  });

  it("rejects a non-integer risk id", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ parent_risk_id: 1.5 })] }).success,
    ).toBe(false);
  });

  it("rejects a reason too short to explain anything", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ reason: "same" })] }).success,
    ).toBe(false);
  });

  it("rejects a reason too long to sit in a chip", () => {
    expect(
      hierarchyOutputSchema.safeParse({ groups: [group({ reason: "x".repeat(121) })] }).success,
    ).toBe(false);
  });
});

describe("buildDirectionUserPrompt", () => {
  const risks: RiskPromptRow[] = [
    {
      id: 11,
      risk_name: "Model drift",
      risk_description: "Production accuracy falls away from the training set.",
      risk_category: ["Strategic risk"],
      ai_lifecycle_phase: "Monitoring & maintenance",
    },
    {
      id: 12,
      risk_name: "Stale features",
      risk_description: null,
      risk_category: null,
      ai_lifecycle_phase: null,
    },
  ];

  it("names every risk it was given, by id", () => {
    const prompt = buildDirectionUserPrompt(risks, []);
    expect(prompt).toContain("11");
    expect(prompt).toContain("Model drift");
    expect(prompt).toContain("Production accuracy falls away from the training set.");
    expect(prompt).toContain("12");
    expect(prompt).toContain("Stale features");
  });

  // A missing column must not become the string "null" in the model's input.
  it("leaves out the fields a risk does not have", () => {
    expect(buildDirectionUserPrompt([risks[1]], [])).not.toContain("null");
  });

  it("states the confirmed hierarchy as decisions already made", () => {
    const prompt = buildDirectionUserPrompt(risks, [{ childRiskId: 12, parentRiskId: 11 }]);
    expect(prompt).toContain("12");
    expect(prompt).toContain("11");
    expect(prompt.toLowerCase()).toContain("already");
  });

  it("says so plainly when there is no existing hierarchy", () => {
    expect(buildDirectionUserPrompt(risks, []).toLowerCase()).toContain("none");
  });
});

describe("buildDirectionSystemPrompt", () => {
  // The two-level rule is the whole product constraint. If the system prompt
  // stops carrying it, every call starts fighting the filter instead of
  // cooperating with it, and the filter silently throws the work away.
  it("states the two-level rule", () => {
    const prompt = buildDirectionSystemPrompt().toLowerCase();
    expect(prompt).toContain("exactly one parent");
    expect(prompt).toContain("cannot be both");
  });
});
