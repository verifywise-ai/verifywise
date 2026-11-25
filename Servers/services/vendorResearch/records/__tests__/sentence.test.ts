import { joinSentences, sentence } from "../sentence";

/** How long a read of a hostile value may take; a linear read of a million characters takes a few ms. */
const LIMIT_MS = 1000;

const timed = (work: () => unknown): number => {
  const start = performance.now();
  work();
  return performance.now() - start;
};

describe("sentence", () => {
  it("is the label, a colon, the value and one full stop", () => {
    expect(sentence("Remarks", "Aircraft owner")).toBe("Remarks: Aircraft owner.");
  });

  it.each([
    ["a full stop", "Aircraft owner."],
    ["several full stops", "Aircraft owner..."],
    ["spaces", "Aircraft owner   "],
    ["a line break and a tab", "Aircraft owner\n\t"],
    ["full stops and white space mixed", "Aircraft owner. . \n.\t "],
    ["a no-break space and an ideographic space", "Aircraft owner.\u00a0\u3000."],
  ])("ends with one full stop whatever the value ends with: %s", (_name, value) => {
    expect(sentence("Remarks", value)).toBe("Remarks: Aircraft owner.");
  });

  it.each([
    ["nothing", ""],
    ["a full stop", "."],
    ["full stops", "...."],
    ["white space", " \n\t "],
    ["full stops and white space", " . \n . "],
  ])("is nothing for a value of %s", (_name, value) => {
    expect(sentence("Remarks", value)).toBe("");
  });

  it("keeps the full stops and the white space inside the value, and at its start", () => {
    expect(sentence("Remarks", "  Acme Inc. (formerly Acme Ltd.) of 5.2 Main St.")).toBe(
      "Remarks:   Acme Inc. (formerly Acme Ltd.) of 5.2 Main St.",
    );
  });

  it("takes out the control characters and the lone surrogates the way the text rules do", () => {
    const lone = String.fromCharCode(0xd83d);
    expect(sentence("Remarks", `Acme\u0000 Corp${lone}.`)).toBe("Remarks: Acme Corp\ufffd.");
  });

  describe("on a value someone hostile wrote", () => {
    // A run of full stops or white space that does not reach the end of the value is not stripped,
    // and a pattern that tried it from every start would read the run once for each of them.
    const HUGE = 100_000;

    it.each([
      ["full stops", ".".repeat(HUGE)],
      ["spaces", " ".repeat(HUGE)],
      ["full stops and spaces by turns", ". ".repeat(HUGE / 2)],
      ["line breaks", "\n".repeat(HUGE)],
    ])("reads a run of %s in the middle of the value in linear time", (_name, run) => {
      const value = `a${run}b`;
      let made = "";

      const ms = timed(() => {
        made = sentence("Remarks", value);
      });

      expect(made).toBe(`Remarks: ${value}.`);
      expect(ms).toBeLessThan(LIMIT_MS);
    });

    it.each([
      ["full stops", ".".repeat(HUGE * 5)],
      ["white space", " ".repeat(HUGE * 5)],
      ["both, by turns", ". ".repeat(HUGE * 2)],
    ])(
      "reads a run of %s at the end of the value, and strips all of it, in linear time",
      (_name, run) => {
        let made = "";

        const ms = timed(() => {
          made = sentence("Remarks", `Acme${run}`);
        });

        expect(made).toBe("Remarks: Acme.");
        expect(ms).toBeLessThan(LIMIT_MS);
      },
    );

    it("reads many runs, each short of the end, in linear time", () => {
      const value = "a.".repeat(HUGE) + "b";

      const ms = timed(() => sentence("Remarks", value));

      expect(ms).toBeLessThan(LIMIT_MS);
    });
  });
});

describe("joinSentences", () => {
  it("joins the sentences that are not empty, with one space", () => {
    expect(joinSentences(["Remarks: a.", "", "Programme: b."])).toBe("Remarks: a. Programme: b.");
  });

  it("is nothing when every sentence is empty", () => {
    expect(joinSentences(["", ""])).toBe("");
  });
});
