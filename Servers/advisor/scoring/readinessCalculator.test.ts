import {
  READINESS_WEIGHTS,
  FRAMEWORK_WEIGHTS,
  calculateReadinessScore,
  blendFrameworkScore,
  classifyReadinessLevel,
} from "./readinessCalculator";

describe("READINESS_WEIGHTS", () => {
  it("sums to 1", () => {
    const sum = Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("gives requirements half the control score", () => {
    expect(READINESS_WEIGHTS.requirements).toBe(0.5);
  });
});

describe("calculateReadinessScore", () => {
  const noEvidence = { evidence_quality: 0, evidence_count: 0, evidence_recency: 0 };

  it("scores a fully documented, fully implemented control at 100", () => {
    const result = calculateReadinessScore({
      requirements: 100,
      evidence_quality: 100,
      evidence_count: 100,
      evidence_recency: 100,
    });

    expect(result.overall_score).toBe(100);
    expect(result.readiness_level).toBe("ready");
  });

  it("scores completed requirements with no evidence at 50", () => {
    const result = calculateReadinessScore({ requirements: 100, ...noEvidence });

    expect(result.overall_score).toBe(50);
    expect(result.requirements_score).toBe(100);
    expect(result.readiness_level).toBe("at_risk");
  });

  it("scores an untouched control at 0", () => {
    const result = calculateReadinessScore({ requirements: 0, ...noEvidence });

    expect(result.overall_score).toBe(0);
    expect(result.readiness_level).toBe("not_started");
  });

  it("clamps out-of-range inputs", () => {
    const result = calculateReadinessScore({
      requirements: 150,
      evidence_quality: -20,
      evidence_count: 0,
      evidence_recency: 0,
    });

    expect(result.requirements_score).toBe(100);
    expect(result.evidence_quality_score).toBe(0);
    expect(result.overall_score).toBe(50);
  });
});

describe("blendFrameworkScore", () => {
  it("weights the control average against assessment completion", () => {
    expect(FRAMEWORK_WEIGHTS.controls).toBe(0.7);
    expect(FRAMEWORK_WEIGHTS.assessments).toBe(0.3);
    // 60 * 0.7 + 40 * 0.3
    expect(blendFrameworkScore(60, 40)).toBe(54);
  });

  it("renormalizes to the control average when there are no assessments", () => {
    // Not 42 — a framework without assessments must still be able to reach 100.
    expect(blendFrameworkScore(60, null)).toBe(60);
    expect(blendFrameworkScore(100, null)).toBe(100);
  });

  it("treats unanswered questions as a real zero", () => {
    expect(blendFrameworkScore(100, 0)).toBe(70);
  });

  it("clamps and rounds", () => {
    expect(blendFrameworkScore(120, 110)).toBe(100);
    expect(blendFrameworkScore(-5, null)).toBe(0);
    expect(blendFrameworkScore(55, 44)).toBe(52); // 38.5 + 13.2 = 51.7
  });
});

describe("classifyReadinessLevel", () => {
  it("maps scores onto the unchanged thresholds", () => {
    expect(classifyReadinessLevel(80)).toBe("ready");
    expect(classifyReadinessLevel(60)).toBe("needs_work");
    expect(classifyReadinessLevel(30)).toBe("at_risk");
    expect(classifyReadinessLevel(29)).toBe("not_started");
  });
});
