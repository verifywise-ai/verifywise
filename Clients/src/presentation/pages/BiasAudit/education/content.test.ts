import { EDUCATION, type EducationBlock } from "./content";
import { VALID_CITATIONS } from "./citations";

const PAGES = [
  "profile.party",
  "profile.scope",
  "profile.data_held",
  "profile.independence",
  "run.cutoff",
  "run.knockout",
  "run.preprocessing",
  "run.job_description",
  "run.criteria_comparison",
  "run.upload",
  "results.figures",
  "results.data_quality",
  "stance",
  "expiry",
];

const blocks = Object.entries(EDUCATION) as [string, EducationBlock][];
const allText = () => JSON.stringify(EDUCATION).toLowerCase();

describe("coverage", () => {
  it("has a block for every customer-facing page", () => {
    for (const page of PAGES) {
      expect(EDUCATION[page]).toBeDefined();
    }
  });

  it("has no block outside the page list", () => {
    expect(Object.keys(EDUCATION).sort()).toEqual([...PAGES].sort());
  });

  it("gives every block all three elements", () => {
    for (const [key, block] of blocks) {
      expect(block.decides.length).toBeGreaterThan(20);
      expect(block.law.text.length).toBeGreaterThan(20);
      expect(block.goesWrong.length).toBeGreaterThan(40);
      expect(block.pageKey).toBe(key);
    }
  });
});

describe("warnings make no claim about a past engagement", () => {
  // Education text is general guidance. It may say what goes wrong, never that
  // it happened to a named or unnamed client, audit or report.
  const HISTORY =
    /\b(one|another|a prior|a previous) (client|engagement|audit|report|corpus|platform|tool supplier|team)\b|\bthe client's counsel later\b|\bonce\b|\bhad to be (reissued|withdrawn|remapped|deleted)\b|\bwas once\b|\bcame back\b|\bwere reconstructed\b|\bthree signed documents\b/i;

  it("describes what goes wrong in general terms only", () => {
    for (const [key, block] of blocks) {
      expect({ key, hit: block.goesWrong.match(HISTORY)?.[0] ?? null }).toEqual({
        key,
        hit: null,
      });
    }
  });
});

describe("citations resolve", () => {
  it("uses only references from the citation table", () => {
    for (const block of Object.values(EDUCATION)) {
      for (const ref of block.law.refs) {
        expect(VALID_CITATIONS).toContain(ref);
      }
    }
  });

  it("cites 5-301(a) only in the expiry block", () => {
    // The rule's only re-audit trigger is the one-year expiry; citing 5-301(a)
    // for any other trigger would misstate it.
    for (const [key, block] of blocks) {
      if (block.law.refs.includes("5-301(a)")) {
        expect(key).toBe("expiry");
      }
    }
  });

  it("cites nothing deeper than the rule text supports", () => {
    const all = allText();
    expect(all).not.toMatch(/5-301\(c\)\(/);
    expect(all).not.toContain("example 3");
    expect(all).not.toContain("example to 5-302");
  });

  it("states that 0.80 is a convention wherever it appears", () => {
    const withFigure = Object.values(EDUCATION).filter((b) =>
      `${b.decides} ${b.law.text} ${b.goesWrong}`.includes("0.80"),
    );
    expect(withFigure.length).toBeGreaterThan(0);
    for (const b of withFigure) {
      expect(`${b.law.text} ${b.goesWrong}`.toLowerCase()).toMatch(
        /convention|does not adopt|four-fifths/,
      );
    }
  });
});

describe("scope wording", () => {
  it("names all three limbs of the 5-300 definition", () => {
    const text = EDUCATION["profile.scope"].law.text.toLowerCase();
    expect(text).toContain("only thing");
    expect(text).toContain("biggest single factor");
    expect(text).toContain("overrule");
  });

  it("does not make the determination itself", () => {
    expect(allText()).not.toMatch(/meets the (first|second|third) limb|is satisfied directly/);
  });
});

describe("anonymity", () => {
  it("names no client", () => {
    const all = allText();
    for (const name of [
      "puck",
      "spotted zebra",
      "curately",
      "manish",
      "tali",
      "brad",
      "ollie",
      "oliver",
      "josh",
      "tina",
      "dan adeline",
    ]) {
      expect(all).not.toContain(name);
    }
  });
});

describe("vocabulary", () => {
  it("never uses forbidden words", () => {
    const all = allText();
    for (const word of ["compliant", "certified", "passed", "bias-free", "audited"]) {
      expect(all).not.toContain(word);
    }
  });

  it("does not instruct the customer on their own obligations", () => {
    // 5-303 duties belong to the deploying employer. Advice about them in a
    // supplier's document was called out on a real engagement as unhelpful
    // and incorrect, and the client was right.
    expect(allText()).not.toMatch(/you must publish|post this on your (careers|website)/);
  });
});
