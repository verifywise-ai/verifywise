import { runAnswerGates } from "./answerGates";
import type { AnswerMap } from "./applicability";

const a = (m: Record<string, string | null>): AnswerMap =>
  Object.fromEntries(
    Object.entries(m).map(([k, v]) => [
      k,
      v === null ? { value: null, dontKnow: true } : { value: v, dontKnow: false },
    ]),
  );

const VETOES_OK = {
  "role.party": "vendor",
  "scope.weighting": "biggest",
  "independence.auditor": "self",
  "data.held": "none",
};

describe("veto gating", () => {
  it("blocks everything while a veto is unanswered", () => {
    const g = runAnswerGates(a({ "role.party": "vendor" }));
    expect(g.mayProduceStance).toBe(false);
    expect(g.mayComputeRatios).toBe(false);
    expect(g.mayGenerate).toBe(false);
  });

  it("permits a stance once the vetoes and the data basis are answered", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "test_attribute" }));
    expect(g.mayProduceStance).toBe(true);
  });
});

describe("data basis gates the stance without being a veto", () => {
  it("blocks the stance when unanswered, because no expiry can be stated", () => {
    const g = runAnswerGates(a(VETOES_OK));
    expect(g.mayProduceStance).toBe(false);
    expect(g.blocked.stance.join(" ")).toMatch(/data\.basis/);
    // Ratios are still computable: the basis affects expiry, not arithmetic.
    expect(g.mayComputeRatios).toBe(true);
  });
});

describe("scoring rate gate", () => {
  it("blocks only the scoring-rate output when the threshold is unanswered", () => {
    const g = runAnswerGates(
      a({
        ...VETOES_OK,
        "data.basis": "historical",
        "cutoff.applied_by": "person",
      }),
    );
    expect(g.mayComputeScoringRate).toBe(false);
    expect(g.mayProduceStance).toBe(true);
  });

  it("permits it once a cutoff is stated", () => {
    const g = runAnswerGates(
      a({
        ...VETOES_OK,
        "data.basis": "historical",
        "cutoff.applied_by": "person",
        "threshold.operational": "stated",
      }),
    );
    expect(g.mayComputeScoringRate).toBe(true);
  });

  it("permits it when there is no fixed cutoff, since 5-301(c) uses the median", () => {
    const g = runAnswerGates(
      a({
        ...VETOES_OK,
        "data.basis": "historical",
        "cutoff.applied_by": "person",
        "threshold.operational": "none",
      }),
    );
    expect(g.mayComputeScoringRate).toBe(true);
  });
});

describe("generation gate", () => {
  it("blocks generation until the input form is known", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "historical" }));
    expect(g.mayGenerate).toBe(false);
  });

  it("blocks generation for an audio input", () => {
    const g = runAnswerGates(
      a({
        ...VETOES_OK,
        "data.basis": "historical",
        "pipeline.input_form": "audio",
      }),
    );
    expect(g.mayGenerate).toBe(false);
  });

  it("permits generation for a resume input", () => {
    const g = runAnswerGates(
      a({
        ...VETOES_OK,
        "data.basis": "historical",
        "pipeline.input_form": "resume",
      }),
    );
    expect(g.mayGenerate).toBe(true);
  });
});

describe("consequences", () => {
  it("collects the vendor blank-field consequence", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "historical" }));
    const blank = g.consequences.find((c) => c.kind === "blank_field")!;
    expect(blank.payload!.field).toBe("distribution_date");
  });

  it("collects the self-administered scope note", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "data.basis": "historical" }));
    expect(
      g.consequences.some((c) => c.kind === "scope_note" && /independent auditor/i.test(c.text)),
    ).toBe(true);
  });

  it("forces the metric from the cutoff answer", () => {
    expect(runAnswerGates(a({ ...VETOES_OK, "cutoff.applied_by": "platform" })).forcedMetric).toBe(
      "selection_rate",
    );
    expect(runAnswerGates(a({ ...VETOES_OK, "cutoff.applied_by": "person" })).forcedMetric).toBe(
      "scoring_rate",
    );
  });

  it("emits a limitation for a don't-know on pre-processing", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "pipeline.preprocessing": null }));
    // A don't-know selects no option, so the limitation comes from the
    // open item rather than from an option's emits.
    expect(
      g.consequences.some(
        (c) => c.kind === "limitation" && /not established|do not know/i.test(c.text),
      ),
    ).toBe(true);
  });

  it("emits no consequence from a non-veto question that does not apply", () => {
    // Vetoes legitimately emit blank_field and scope_note; nothing else may,
    // because every other question is moot once the tool is out of scope.
    const g = runAnswerGates(
      a({
        ...VETOES_OK,
        "scope.weighting": "one_of_several",
        "cutoff.applied_by": "person",
      }),
    );
    expect(g.consequences.length).toBeGreaterThan(0);
    expect(g.consequences.every((c) => c.kind === "scope_note" || c.kind === "blank_field")).toBe(
      true,
    );
    expect(g.forcedMetric).toBeNull();
  });

  it("blocks the stance when every applicable non-veto answer is a don't-know", () => {
    const g = runAnswerGates(
      a({
        ...VETOES_OK,
        "data.basis": null,
        "pipeline.preprocessing": null,
        "cutoff.applied_by": null,
      }),
    );
    expect(g.mayProduceStance).toBe(false);
    expect(g.blocked.stance.join(" ")).toMatch(/don't know/i);
  });
});

describe("a gate is satisfied when its question does not apply", () => {
  // Out of scope, data.basis is NOT applicable rather than unanswered, so the
  // stance must still be produced. Withholding it would make the favourable
  // outcome read as a failed run, which the spec resolves against directly.
  it("permits a stance for an out-of-scope tool, with no data basis given", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "scope.weighting": "one_of_several" }));
    expect(g.mayProduceStance).toBe(true);
    expect(g.blocked.stance ?? []).toEqual([]);
  });

  it("still blocks an in-scope stance when the basis is genuinely unanswered", () => {
    const g = runAnswerGates(a({ ...VETOES_OK, "scope.weighting": "biggest" }));
    expect(g.mayProduceStance).toBe(false);
  });

  it("blocks nothing on generation for an out-of-scope tool either", () => {
    // Nothing to generate against, but the block must not read as a defect.
    const g = runAnswerGates(a({ ...VETOES_OK, "scope.weighting": "one_of_several" }));
    expect(g.blocked.generation ?? []).toEqual([]);
  });
});

describe("consequence sources", () => {
  it("records the question key that emitted each consequence", () => {
    const g = runAnswerGates({
      "role.party": { value: "vendor", dontKnow: false },
      "scope.weighting": { value: "biggest", dontKnow: false },
      "independence.auditor": { value: "self", dontKnow: false },
      "data.held": { value: "none", dontKnow: false },
    });
    const ind = g.consequences.find((c) => c.text.includes("Self-administered"));
    expect(ind?.sourceKey).toBe("independence.auditor");
    const ven = g.consequences.find((c) => c.text.includes("supplier of the tool"));
    expect(ven?.sourceKey).toBe("role.party");
  });
});
