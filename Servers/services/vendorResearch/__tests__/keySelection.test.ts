import { selectKeys } from "../keySelection";

// The keys come newest first, as the organization's key list is ordered.
const NEWEST = { id: 30, name: "OpenAI" };
const MIDDLE = { id: 20, name: "Anthropic" };
const OLDEST = { id: 10, name: "OpenRouter" };
const KEYS = [NEWEST, MIDDLE, OLDEST];

const NONE = { researchKeyId: null, analysisKeyId: null };

describe("selectKeys", () => {
  it("has nothing to choose from when the organization has no key", () => {
    expect(selectKeys([], NONE)).toBeNull();
    expect(selectKeys([], { researchKeyId: 10, analysisKeyId: 20 })).toBeNull();
  });

  it("takes the newest key for the research when nothing is chosen, and the same key for the analysis", () => {
    expect(selectKeys(KEYS, NONE)).toEqual({ research: NEWEST, analysis: null });
  });

  it("takes the key that is chosen for the research", () => {
    expect(selectKeys(KEYS, { researchKeyId: 20, analysisKeyId: null })).toEqual({
      research: MIDDLE,
      analysis: null,
    });
  });

  it("takes the key that is chosen for the analysis, next to the research key", () => {
    expect(selectKeys(KEYS, { researchKeyId: 10, analysisKeyId: 30 })).toEqual({
      research: OLDEST,
      analysis: NEWEST,
    });
  });

  it("follows the newest key for the research while only the analysis key is chosen", () => {
    expect(selectKeys(KEYS, { researchKeyId: null, analysisKeyId: 10 })).toEqual({
      research: NEWEST,
      analysis: OLDEST,
    });
  });

  it("has no separate analysis key when it is the key of the research: one model does both", () => {
    expect(selectKeys(KEYS, { researchKeyId: 20, analysisKeyId: 20 })).toEqual({
      research: MIDDLE,
      analysis: null,
    });
    expect(selectKeys(KEYS, { researchKeyId: null, analysisKeyId: 30 })).toEqual({
      research: NEWEST,
      analysis: null,
    });
  });

  it("falls back to the newest key when the chosen one no longer exists", () => {
    expect(selectKeys(KEYS, { researchKeyId: 99, analysisKeyId: null })).toEqual({
      research: NEWEST,
      analysis: null,
    });
  });

  it("falls back to the key of the research when the chosen analysis key no longer exists", () => {
    expect(selectKeys(KEYS, { researchKeyId: 20, analysisKeyId: 99 })).toEqual({
      research: MIDDLE,
      analysis: null,
    });
  });

  it("works with one key whatever is chosen", () => {
    expect(selectKeys([OLDEST], { researchKeyId: 10, analysisKeyId: 10 })).toEqual({
      research: OLDEST,
      analysis: null,
    });
    expect(selectKeys([OLDEST], { researchKeyId: 5, analysisKeyId: 6 })).toEqual({
      research: OLDEST,
      analysis: null,
    });
  });

  it("returns the very rows it was given, so that nothing about a key is copied or dropped", () => {
    const selected = selectKeys(KEYS, { researchKeyId: 20, analysisKeyId: 10 });

    expect(selected?.research).toBe(MIDDLE);
    expect(selected?.analysis).toBe(OLDEST);
  });
});
