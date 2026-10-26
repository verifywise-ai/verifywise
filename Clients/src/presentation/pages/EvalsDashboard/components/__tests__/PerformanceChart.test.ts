import { describe, expect, it } from "vitest";
import { metricLabel } from "../PerformanceChart";

describe("PerformanceChart metricLabel", () => {
  it("marks lower is better metrics, which share the 0-100% axis", () => {
    expect(metricLabel("bias")).toBe("Bias (lower is better)");
    expect(metricLabel("toxicity")).toBe("Toxicity (lower is better)");
    expect(metricLabel("hallucination")).toBe("Hallucination (lower is better)");
  });

  it("leaves higher is better metrics and custom scorers as they are", () => {
    expect(metricLabel("answerRelevancy")).toBe("Answer Relevancy");
    expect(metricLabel("taskCompletion")).toBe("Task Completion");
    expect(metricLabel("instructionFollowing")).toBe("Instruction Following");
    expect(metricLabel("unbiased_tone")).toBe("Unbiased Tone");
  });
});
