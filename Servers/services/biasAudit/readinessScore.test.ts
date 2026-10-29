import { computeReadiness } from "./readinessScore";
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

describe("vetoes gate rather than score", () => {
  it("returns no score when a veto is unanswered", () => {
    const r = computeReadiness(a({ "role.party": "vendor" }));
    expect(r.score).toBeNull();
    expect(r.scope).toBe("undetermined");
    expect([...r.missingVetoes].sort()).toEqual([
      "data.held",
      "independence.auditor",
      "scope.weighting",
    ]);
    expect(r.blockedReason).toMatch(/scope is not established/i);
  });

  it("returns no score when a veto is don't know", () => {
    const r = computeReadiness(a({ ...VETOES_OK, "data.held": null }));
    expect(r.score).toBeNull();
    expect(r.missingVetoes).toEqual(["data.held"]);
  });

  it("produces a score once all four vetoes carry a value", () => {
    const r = computeReadiness(a(VETOES_OK));
    expect(r.score).not.toBeNull();
    expect(r.scope).toBe("in_scope");
    expect(r.blockedReason).toBeNull();
  });
});

describe("out of scope short-circuits", () => {
  it("reports out_of_scope and no score", () => {
    const r = computeReadiness(a({ ...VETOES_OK, "scope.weighting": "one_of_several" }));
    expect(r.scope).toBe("out_of_scope");
    expect(r.score).toBeNull();
    expect(r.blockedReason).toBeNull();
    expect(r.openItems).toEqual([]);
  });
});

describe("weights", () => {
  it("counts a high-weight answer double a standard one", () => {
    const base = computeReadiness(a(VETOES_OK));
    const withHigh = computeReadiness(a({ ...VETOES_OK, "pipeline.input_form": "resume" }));
    const withStandard = computeReadiness(a({ ...VETOES_OK, "data.categories": "sex_only" }));
    expect(withHigh.earned - base.earned).toBe(2);
    expect(withStandard.earned - base.earned).toBe(1);
  });

  it("scores 100 when every applicable question is answered", () => {
    const r = computeReadiness(
      a({
        ...VETOES_OK,
        "cutoff.applied_by": "platform",
        "pipeline.input_form": "resume",
        "pipeline.preprocessing": "no",
        "knockout.exists": "no",
        "history.prior_audit": "never",
        "data.basis": "test_attribute",
        "data.categories": "sex_race_both",
      }),
    );
    expect(r.score).toBe(100);
    expect(r.openItems).toEqual([]);
  });

  it("excludes not-applicable questions from the denominator", () => {
    // cutoff.planned and threshold.operational do not apply to a platform cutoff.
    const platform = computeReadiness(a({ ...VETOES_OK, "cutoff.applied_by": "platform" }));
    const person = computeReadiness(a({ ...VETOES_OK, "cutoff.applied_by": "person" }));
    expect(platform.possible).toBeLessThan(person.possible);
  });
});

describe("don't know and unanswered", () => {
  it("earns nothing and names itself as an open item", () => {
    const r = computeReadiness(a({ ...VETOES_OK, "pipeline.preprocessing": null }));
    expect(r.openItems.map((i) => i.key)).toContain("pipeline.preprocessing");
    expect(r.openItems[0].prompt).toBeTruthy();
    const base = computeReadiness(a(VETOES_OK));
    expect(r.earned).toBe(base.earned);
  });

  // Amendment T6
  it("lists a never-answered gating question as an open item too", () => {
    const r = computeReadiness(a(VETOES_OK));
    expect(r.openItems.map((i) => i.key)).toContain("data.basis");
    expect(r.earned).toBe(0);
    expect(r.score).toBe(0);
  });

  // Review Focus 3
  it("scores 0 when every non-veto answer is don't know, and still blocks the stance", () => {
    const r = computeReadiness(
      a({
        ...VETOES_OK,
        "cutoff.applied_by": null,
        "pipeline.input_form": null,
        "pipeline.preprocessing": null,
        "knockout.exists": null,
        "history.prior_audit": null,
        "data.categories": null,
      }),
    );
    expect(r.score).toBe(0);
    expect(r.openItems.length).toBeGreaterThanOrEqual(6);
    // data.basis gates the stance and is unanswered, so a 0 is never presentable.
    expect(r.openItems.map((i) => i.key)).toContain("data.basis");
  });
});

describe("measured results never affect the score", () => {
  it("has no parameter for impact ratios", () => {
    // Readiness measures what the customer established, not what the numbers
    // said. A flagged ratio is a finding, not a demerit.
    expect(computeReadiness.length).toBe(1);
  });
});
