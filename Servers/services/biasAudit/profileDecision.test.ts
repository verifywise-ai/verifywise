import { decideProfile, runMetricOf } from "./profileDecision";
import { runAnswerGates } from "./answerGates";
import type { AnswerMap } from "./applicability";

const a = (m: Record<string, string | null>): AnswerMap =>
  Object.fromEntries(
    Object.entries(m).map(([k, v]) => [
      k,
      v === null ? { value: null, dontKnow: true } : { value: v, dontKnow: false },
    ]),
  );

const VETOES_IN_SCOPE = {
  "role.party": "vendor",
  "scope.weighting": "biggest",
  "independence.auditor": "self",
  "data.held": "none",
};

describe("decideProfile", () => {
  it("forces a selection rate when the platform applies the cutoff", () => {
    const d = decideProfile(a({ ...VETOES_IN_SCOPE, "cutoff.applied_by": "platform" }));
    expect(d.metric).toBe("selection_rate");
    expect(d.readiness.scope).toBe("in_scope");
  });

  it("forces a scoring rate when a person applies the cutoff", () => {
    const d = decideProfile(a({ ...VETOES_IN_SCOPE, "cutoff.applied_by": "person" }));
    expect(d.metric).toBe("scoring_rate");
  });

  it("forces no rate while the cutoff answer is I don't know", () => {
    const d = decideProfile(a({ ...VETOES_IN_SCOPE, "cutoff.applied_by": null }));
    expect(d.metric).toBeNull();
    expect(d.readiness.scope).toBe("in_scope");
  });

  it("forces no rate out of scope, even with a stored cutoff answer that no longer applies", () => {
    const d = decideProfile(
      a({ ...VETOES_IN_SCOPE, "scope.weighting": "one_of_several", "cutoff.applied_by": "person" }),
    );
    expect(d.metric).toBeNull();
    expect(d.readiness.scope).toBe("out_of_scope");
  });

  it("withholds generation for audio input, naming the question", () => {
    const d = decideProfile(a({ ...VETOES_IN_SCOPE, "pipeline.input_form": "audio" }));
    expect(d.mayGenerate).toBe(false);
    expect(d.generationBlocked.some((m) => m.includes("pipeline.input_form"))).toBe(true);
  });

  it("allows generation for resume input once every veto is answered", () => {
    const d = decideProfile(a({ ...VETOES_IN_SCOPE, "pipeline.input_form": "resume" }));
    expect(d.mayGenerate).toBe(true);
    expect(d.generationBlocked).toEqual([]);
  });

  it("withholds generation while a veto is open", () => {
    const d = decideProfile(a({ "role.party": "vendor", "pipeline.input_form": "resume" }));
    expect(d.mayGenerate).toBe(false);
    expect(d.generationBlocked.length).toBeGreaterThan(0);
  });

  it("leaves scope undetermined while a veto is open", () => {
    const d = decideProfile(a({ "role.party": "vendor" }));
    expect(d.readiness.scope).toBe("undetermined");
    expect(d.metric).toBeNull();
  });
});

describe("runMetricOf", () => {
  it("accepts only the rates the engine computes", () => {
    const gates = runAnswerGates(a(VETOES_IN_SCOPE));
    expect(runMetricOf({ ...gates, forcedMetric: "selection_rate" })).toBe("selection_rate");
    expect(runMetricOf({ ...gates, forcedMetric: "impact_ratio" })).toBeNull();
    expect(runMetricOf({ ...gates, forcedMetric: null })).toBeNull();
  });
});
