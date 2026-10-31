import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { explainTier, explanationIsGrounded, suggestTier, type TierSuggestion } from "..";
import { prepareIntakeRiskStep } from "../../euAiActClassification";

// Limited risk (transparency): from the intake step tests.
const LIMITED = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["interacts"],
};

// High risk: ranks job candidates (Annex III, employment).
const HIGH = {
  ...LIMITED,
  annex_iii_areas: ["employment"],
  employment_use: ["recruitment"],
  profiling: "no",
  derogation: "none",
};

const suggestionFor = (answers: object): TierSuggestion => {
  const outcome = suggestTier(answers);
  if (!outcome.ok) throw new Error(`invalid fixture: ${outcome.errors.join(", ")}`);
  return outcome.suggestion;
};

/** A generate that answers with a fixed explanation, like the AI SDK's generateObject. */
const generating = (explanation: string) =>
  jest.fn<any>().mockResolvedValue({ object: { explanation } });

describe("suggestTier", () => {
  it("returns exactly what a submission with these answers is scored as", () => {
    const suggestion = suggestionFor(HIGH);
    const outcome = prepareIntakeRiskStep(true, HIGH);
    const result = outcome.ok ? outcome.prepared!.result : null;
    expect(suggestion.level).toBe("High risk");
    expect(suggestion.level).toBe(result?.level);
    expect(suggestion.reasons).toEqual(result?.reasons);
    expect(suggestion.obligations).toEqual(result?.obligations);
    // The citation names the employment area of Annex III.
    expect(suggestion.reasons.some((r) => /Annex III/.test(r.article))).toBe(true);
  });

  it("refuses missing or tampered answers, so a page cannot pick its own level", () => {
    expect(suggestTier(undefined).ok).toBe(false);
    expect(suggestTier({ ...LIMITED, level: "Minimal risk" }).ok).toBe(false);
  });
});

describe("explanationIsGrounded", () => {
  const high = () => suggestionFor(HIGH);

  it("accepts plain words and the engine's own references", () => {
    const article = high().reasons[0].article;
    expect(
      explanationIsGrounded(`You said it ranks job candidates, which ${article} covers.`, high()),
    ).toBe(true);
    expect(explanationIsGrounded("Your answers describe hiring decisions.", high())).toBe(true);
  });

  it("rejects an article the engine did not cite", () => {
    expect(explanationIsGrounded("Article 99 also applies to you.", high())).toBe(false);
  });

  it("rejects naming any level other than the suggested one", () => {
    expect(explanationIsGrounded("This is probably Minimal risk.", high())).toBe(false);
    expect(explanationIsGrounded("This is High risk because you rank people.", high())).toBe(true);
  });
});

describe("explainTier", () => {
  it("returns a grounded explanation from one model call", async () => {
    const generate = generating("You said the system ranks job candidates, so it is high risk.");
    const result = await explainTier({
      suggestion: suggestionFor(HIGH),
      answers: HIGH,
      language: "en",
      model: {},
      generate: generate as any,
    });
    expect(result).toEqual({
      ok: true,
      explanation: "You said the system ranks job candidates, so it is high risk.",
    });
    expect(generate).toHaveBeenCalledTimes(1);
    // The answers reach the model as option labels inside the delimited data block.
    const call = generate.mock.calls[0][0] as { prompt: string; system: string };
    expect(call.system).toMatch(/Never suggest a different level/);
    expect(call.prompt).toMatch(/High risk/);
  });

  it("discards an explanation that brings its own citation", async () => {
    const result = await explainTier({
      suggestion: suggestionFor(HIGH),
      answers: HIGH,
      language: "en",
      model: {},
      generate: generating("Under Article 52 you must also register it.") as any,
    });
    expect(result.ok).toBe(false);
  });

  it("reports a failed model call without throwing", async () => {
    const result = await explainTier({
      suggestion: suggestionFor(LIMITED),
      answers: LIMITED,
      language: "de",
      model: {},
      generate: jest.fn<any>().mockRejectedValue(new Error("provider down")) as any,
    });
    expect(result).toEqual({ ok: false, error: "provider down" });
  });
});
