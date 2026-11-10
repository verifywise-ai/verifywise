/**
 * The summary composer of the list kit (kit/summary.ts): the sentences of a record in order, then
 * its closing sentence, which says what the record is not and so is never cut. It is the rule of the
 * FDA recalls (`summaryOf`, connectors/fdaRecalls.ts) as a function of the kit. Every character that
 * is hard to type is built with `cp`, so that this source holds none of them.
 */
import { joinSentences } from "../../../../records/sentence";
import { SHORTENED, shorten } from "../clean";
import { summaryWithClosing } from "../summary";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const CLOSING = "The list holds an entry; it is no finding about the vendor.";

/** Whether a text holds a surrogate that is alone, which a database refuses. */
function hasLoneSurrogate(text: string): boolean {
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(at + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      at += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe("summaryWithClosing", () => {
  describe("when the whole fits", () => {
    it("is the sentences in order and then the closing sentence, one blank between them", () => {
      expect(summaryWithClosing(["Alpha.", "Beta."], "Closing sentence.", 100)).toBe(
        "Alpha. Beta. Closing sentence.",
      );
    });

    it("is the closing sentence alone when there are no sentences", () => {
      expect(summaryWithClosing([], "Closing sentence.", 100)).toBe("Closing sentence.");
      expect(summaryWithClosing(["", ""], "Closing sentence.", 100)).toBe("Closing sentence.");
    });

    it("is the whole at exactly the length, and not at one less", () => {
      const whole = "Alpha. Closing sentence.";

      expect(whole).toHaveLength(24);
      expect(summaryWithClosing(["Alpha."], "Closing sentence.", 24)).toBe(whole);
      expect(summaryWithClosing(["Alpha."], "Closing sentence.", 23)).toBe(
        "Alpha Closing sentence.",
      );
    });

    it("takes a maximum that is not a whole number as the whole number below it", () => {
      expect(summaryWithClosing(["Alpha."], "Closing sentence.", 24.9)).toBe(
        "Alpha. Closing sentence.",
      );
      expect(summaryWithClosing(["Alpha."], "Closing sentence.", 23.9)).toBe(
        "Alpha Closing sentence.",
      );
    });

    it("takes no limit at all", () => {
      const sentences = ["x".repeat(50_000)];

      expect(summaryWithClosing(sentences, CLOSING, Number.POSITIVE_INFINITY)).toBe(
        `${sentences[0]} ${CLOSING}`,
      );
    });
  });

  describe("sentences that are empty or end in a period", () => {
    it("leaves the empty sentences out", () => {
      expect(summaryWithClosing(["", "Alpha.", "", "Beta.", ""], "Closing.", 100)).toBe(
        "Alpha. Beta. Closing.",
      );
    });

    it("gives a sentence that ends in a period no second one, and adds none to a sentence that has none", () => {
      const whole = summaryWithClosing(["Alpha.", "Beta"], "Closing.", 100);

      expect(whole).toBe("Alpha. Beta Closing.");
      expect(summaryWithClosing(["Alpha.", "Beta."], "Closing.", 100)).not.toContain("..");
      expect(summaryWithClosing(["Alpha.", "Beta."], "Closing.", 100)).toBe(
        "Alpha. Beta. Closing.",
      );
    });
  });

  describe("when the whole does not fit", () => {
    const LONG = `Alpha ${"b".repeat(100)}.`;

    it("shortens the sentences before the closing sentence and keeps it whole and last", () => {
      const text = summaryWithClosing([LONG, "Second sentence."], "Closing sentence.", 60);

      expect(text).toBe(`Alpha ${"b".repeat(24)}${SHORTENED} Closing sentence.`);
      expect(text).toHaveLength(60);
    });

    it("says that it cut: the part before the closing sentence ends in the marker", () => {
      const text = summaryWithClosing([LONG], CLOSING, 100);

      expect(CLOSING).toHaveLength(59);
      expect(text.endsWith(`${SHORTENED} ${CLOSING}`)).toBe(true);
      expect(text).toHaveLength(100);
      expect(text.startsWith("Alpha bbb")).toBe(true);
    });

    it("gives what the FDA recalls give: the sentences cut by `shorten` to what the closing sentence leaves", () => {
      const sentences = Array.from(
        { length: 30 },
        (_, number) => `Sentence ${number}: ${"lorem ipsum dolor sit amet ".repeat(5).trim()}.`,
      );
      const max = 1_000;

      const text = summaryWithClosing(sentences, CLOSING, max);

      expect(text).toBe(
        `${shorten(joinSentences(sentences), max - CLOSING.length - 1)} ${CLOSING}`,
      );
      expect(text.length).toBeLessThanOrEqual(max);
    });

    it("is never more than the length, at any length", () => {
      const sentences = [
        "First sentence of the record.",
        "Second sentence of the record, which is longer.",
      ];

      for (let max = CLOSING.length; max < 200; max += 1) {
        const text = summaryWithClosing(sentences, CLOSING, max);

        expect(text.length).toBeLessThanOrEqual(max);
        expect(text.endsWith(CLOSING)).toBe(true);
      }
    });

    it("is the closing sentence alone when it fills the length, or leaves no room for a cut", () => {
      expect(summaryWithClosing(["Alpha beta gamma."], "Closing sentence.", 17)).toBe(
        "Closing sentence.",
      );
      expect(summaryWithClosing(["Alpha beta gamma."], "Closing sentence.", 18)).toBe(
        "Closing sentence.",
      );
      // One more than that, and a character of the sentences is kept.
      expect(summaryWithClosing(["Alpha beta gamma."], "Closing sentence.", 20)).toBe(
        "Al Closing sentence.",
      );
    });

    it("sweeps the lengths around the closing sentence: never too long, never a blank first, the closing last", () => {
      const sentences = ["Sentence one is long enough to need a cut.", "Sentence two follows it."];

      for (let max = CLOSING.length; max <= CLOSING.length + 30; max += 1) {
        const text = summaryWithClosing(sentences, CLOSING, max);
        const room = max - CLOSING.length - 1;

        expect(text.length).toBeLessThanOrEqual(max);
        expect(text.endsWith(CLOSING)).toBe(true);
        expect(text.startsWith(" ")).toBe(false);
        expect(text).not.toContain("  ");
        // A room of twelve or less has no place for the marker, and the cut says nothing.
        if (room > SHORTENED.length) expect(text.endsWith(`${SHORTENED} ${CLOSING}`)).toBe(true);
        if (room <= 0) expect(text).toBe(CLOSING);
      }
    });

    it("takes the blank off the end of a cut that has no marker, so that there is one blank before the closing", () => {
      // The cut falls after "Alpha ": its blank is not kept, and the one the composer adds is the only one.
      expect(summaryWithClosing(["Alpha beta gamma."], "Closing sentence.", 24)).toBe(
        "Alpha Closing sentence.",
      );
    });

    it("is one hundred kilobytes of one sentence cut to what the length leaves, quickly", () => {
      const huge = `${"word ".repeat(20_000).trim()}.`;
      const start = process.hrtime.bigint();

      const text = summaryWithClosing([huge, "Another sentence."], CLOSING, 4_000);

      expect(huge.length).toBeGreaterThanOrEqual(100_000);
      expect(text.length).toBeLessThanOrEqual(4_000);
      expect(text.endsWith(`${SHORTENED} ${CLOSING}`)).toBe(true);
      expect(text.startsWith("word word word")).toBe(true);
      expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(500);
    });

    it("is many sentences cut as one", () => {
      const sentences = Array.from(
        { length: 10_000 },
        (_, number) => `Sentence number ${number} of the record.`,
      );

      const text = summaryWithClosing(sentences, CLOSING, 4_000);

      expect(text.length).toBeLessThanOrEqual(4_000);
      expect(text.startsWith("Sentence number 0 of the record. Sentence number 1")).toBe(true);
      expect(text.endsWith(`${SHORTENED} ${CLOSING}`)).toBe(true);
    });
  });

  describe("a cut that falls inside a character", () => {
    const EMOJI = cp(0x1f600);
    const ACUTE = cp(0x301);

    it("never leaves half of a surrogate pair, wherever it falls", () => {
      const sentences = [EMOJI.repeat(60), `${EMOJI}${EMOJI}`];

      for (let max = CLOSING.length; max <= CLOSING.length + 80; max += 1) {
        const text = summaryWithClosing(sentences, CLOSING, max);

        expect(hasLoneSurrogate(text)).toBe(false);
        expect(text.length).toBeLessThanOrEqual(max);
        expect(text.endsWith(CLOSING)).toBe(true);
        expect(text.startsWith(" ")).toBe(false);
      }
    });

    it("never leaves half of a pair at a cut that has no marker either, even when only the pair would fit", () => {
      // A room of one cannot hold a pair: the cut keeps nothing, and the closing sentence stands alone.
      expect(summaryWithClosing([EMOJI.repeat(10)], "End.", 6)).toBe("End.");
      expect(summaryWithClosing([EMOJI.repeat(10)], "End.", 7)).toBe(`${EMOJI} End.`);
    });

    it("keeps a text made of combining marks whole at every cut: no surrogate is alone, and the closing is last", () => {
      const sentences = [`e${ACUTE}`.repeat(60), `${ACUTE}${ACUTE}${ACUTE}`];

      for (let max = CLOSING.length; max <= CLOSING.length + 80; max += 1) {
        const text = summaryWithClosing(sentences, CLOSING, max);

        expect(hasLoneSurrogate(text)).toBe(false);
        expect(text.length).toBeLessThanOrEqual(max);
        expect(text.endsWith(CLOSING)).toBe(true);
      }
    });

    it("keeps a closing sentence that holds pairs and marks as it is", () => {
      const closing = `${EMOJI} The record ends here ${ACUTE}${EMOJI}.`;

      const text = summaryWithClosing(["x".repeat(500)], closing, closing.length + 30);

      expect(text.endsWith(` ${closing}`)).toBe(true);
      expect(hasLoneSurrogate(text)).toBe(false);
      expect(text).toHaveLength(closing.length + 30);
    });
  });

  describe("an empty closing sentence", () => {
    it("is left out as an empty sentence is: the text is the sentences, cut alone when it must be", () => {
      expect(summaryWithClosing(["Alpha."], "", 100)).toBe("Alpha.");
      expect(summaryWithClosing([], "", 100)).toBe("");
      const cut = summaryWithClosing(["x".repeat(100)], "", 40);

      expect(cut).toBe(`${"x".repeat(28)}${SHORTENED}`);
      expect(cut).toHaveLength(40);
    });
  });

  describe("what is a mistake of the caller, never of the data", () => {
    it("a closing sentence longer than the length is a RangeError, with the sentences or without", () => {
      expect(() => summaryWithClosing(["Alpha."], CLOSING, CLOSING.length - 1)).toThrow(RangeError);
      expect(() => summaryWithClosing([], CLOSING, CLOSING.length - 1)).toThrow(RangeError);
      expect(() => summaryWithClosing(["Alpha."], "x".repeat(101), 100)).toThrow(RangeError);
    });

    it("a closing sentence that is exactly the length is not one", () => {
      expect(summaryWithClosing(["Alpha."], CLOSING, CLOSING.length)).toBe(CLOSING);
      expect(summaryWithClosing([], CLOSING, CLOSING.length)).toBe(CLOSING);
    });

    it.each([0, -1, -100, Number.NaN, 0.5])(
      "a length of %s is a RangeError, whatever the text",
      (max) => {
        expect(() => summaryWithClosing(["Alpha."], "x", max)).toThrow(RangeError);
        expect(() => summaryWithClosing([], "", max)).toThrow(RangeError);
      },
    );
  });
});
