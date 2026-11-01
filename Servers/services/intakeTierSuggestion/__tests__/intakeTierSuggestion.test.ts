import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { explainTier, groundedPoints, suggestTier, type TierSuggestion } from "..";
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

describe("groundedPoints", () => {
  const high = () => suggestionFor(HIGH);

  it("ties each point to the engine's own reference", () => {
    const suggestion = high();
    const points = groundedPoints(
      [{ basis: 0, text: "You said it ranks job candidates." }],
      suggestion,
    );
    expect(points).toEqual([
      { text: "You said it ranks job candidates.", article: suggestion.reasons[0].article },
    ]);
  });

  it("allows the engine's own wording, even when it names another level", () => {
    expect(
      groundedPoints(
        [{ basis: 0, text: "Your use is not high risk because it is narrow." }],
        high(),
      ),
    ).not.toBeNull();
  });

  it.each([
    "Article 99 also applies to you.",
    "Nach Artikel 99 gilt das auch.",
    "Selon l'annexe I, cela s'applique.",
    "Según el artículo 99 esto aplica.",
    "Anhang IV verlangt Unterlagen.",
    "See § 3 of the law.",
  ])("rejects a point that cites anything itself: %s", (text) => {
    expect(groundedPoints([{ basis: 0, text }], high())).toBeNull();
  });

  it("rejects a point tied to no engine reason", () => {
    expect(groundedPoints([{ basis: 99, text: "Plain words." }], high())).toBeNull();
  });
});

/** A generate that answers with fixed points, like the AI SDK's generateObject. */
const pointing = (points: Array<{ basis: number; text: string }>) =>
  jest.fn<any>().mockResolvedValue({ object: { points } });

describe("explainTier", () => {
  it("returns grounded points from one model call", async () => {
    const suggestion = suggestionFor(HIGH);
    const generate = pointing([{ basis: 0, text: "You said the system ranks job candidates." }]);
    const result = await explainTier({
      suggestion,
      answers: HIGH,
      language: "en",
      model: {},
      generate: generate as any,
    });
    expect(result).toEqual({
      ok: true,
      points: [
        {
          text: "You said the system ranks job candidates.",
          article: suggestion.reasons[0].article,
        },
      ],
    });
    expect(generate).toHaveBeenCalledTimes(1);
    const call = generate.mock.calls[0][0] as { prompt: string; system: string };
    expect(call.system).toMatch(/Never write article, annex/);
    expect(call.prompt).toMatch(/High risk/);
  });

  it("discards points that bring their own citation", async () => {
    const result = await explainTier({
      suggestion: suggestionFor(HIGH),
      answers: HIGH,
      language: "de",
      model: {},
      generate: pointing([
        { basis: 0, text: "Nach Artikel 52 müssen Sie es registrieren." },
      ]) as any,
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
