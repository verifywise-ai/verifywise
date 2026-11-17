import { describe, it, expect } from "vitest";
import { METRIC_LABELS, metricLabel, stripGEvalPrefix } from "../metricLabels";

describe("metricLabel", () => {
  it("returns the sentence-case name for a known metric", () => {
    expect(metricLabel("answerRelevancy")).toBe("Answer relevancy");
    expect(metricLabel("conversationSafety")).toBe("Conversation safety");
  });

  it("turns unknown camelCase or snake_case keys into sentence case", () => {
    expect(metricLabel("myCustomScorer")).toBe("My custom scorer");
    expect(metricLabel("brand_voice_check")).toBe("Brand voice check");
  });

  it("keeps every known name in sentence case", () => {
    for (const label of Object.values(METRIC_LABELS)) {
      const [first, ...rest] = label.split(" ");
      expect(first.charAt(0)).toBe(first.charAt(0).toUpperCase());
      for (const word of rest) expect(word).toBe(word.toLowerCase());
    }
  });

  it("keeps a name someone already wrote", () => {
    expect(metricLabel("LLM judge for tone")).toBe("LLM judge for tone");
  });
});

describe("stripGEvalPrefix", () => {
  it("removes the G-Eval wrapper and leaves other names alone", () => {
    expect(stripGEvalPrefix("G-Eval (Coherence)")).toBe("Coherence");
    expect(stripGEvalPrefix("Relevance")).toBe("Relevance");
  });
});
