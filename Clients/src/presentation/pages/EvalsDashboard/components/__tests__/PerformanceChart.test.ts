import { describe, expect, it } from "vitest";
import { metricLabel } from "../PerformanceChart";

describe("PerformanceChart metricLabel", () => {
  it("marks lower is better metrics, which share the 0-100% axis", () => {
    expect(metricLabel("bias")).toBe("Bias (lower is better)");
    expect(metricLabel("toxicity")).toBe("Toxicity (lower is better)");
    expect(metricLabel("hallucination")).toBe("Hallucination (lower is better)");
  });

  it("names higher is better metrics and custom scorers in sentence case", () => {
    expect(metricLabel("answerRelevancy")).toBe("Answer relevancy");
    expect(metricLabel("taskCompletion")).toBe("Task completion");
    expect(metricLabel("instructionFollowing")).toBe("Instruction following");
    expect(metricLabel("unbiased_tone")).toBe("Unbiased tone");
  });
});
