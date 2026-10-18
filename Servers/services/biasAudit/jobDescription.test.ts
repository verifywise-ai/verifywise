import { JOB_DESCRIPTION_MAX, normaliseJobDescription, sameJobDescription } from "./jobDescription";

describe("normaliseJobDescription", () => {
  it("keeps the title as typed, apart from surrounding and repeated whitespace", () => {
    expect(normaliseJobDescription("  Sr. Engineer   (L5) ")).toEqual({
      ok: true,
      value: "Sr. Engineer (L5)",
    });
  });

  it("keeps titles that differ only in punctuation apart", () => {
    const values = ["C++ developer", "C# developer", "C developer"].map(
      (t) => (normaliseJobDescription(t) as { value: string }).value,
    );
    expect(new Set(values).size).toBe(3);
  });

  it("stores one form of a title whether it was typed composed or decomposed", () => {
    const composed = normaliseJobDescription("Café manager");
    const decomposed = normaliseJobDescription("Café manager");
    expect(decomposed).toEqual(composed);
  });

  it("keeps combining marks, so non-Latin titles stay whole", () => {
    expect(normaliseJobDescription("इंजीनियर")).toEqual({ ok: true, value: "इंजीनियर" });
  });

  it("stores null for a blank title", () => {
    expect(normaliseJobDescription("   ")).toEqual({ ok: true, value: null });
  });

  it("refuses a title longer than the column rather than cutting it", () => {
    expect(normaliseJobDescription("a".repeat(JOB_DESCRIPTION_MAX))).toMatchObject({ ok: true });
    expect(normaliseJobDescription("a".repeat(JOB_DESCRIPTION_MAX + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("refuses a title with no letter or digit", () => {
    expect(normaliseJobDescription(" — !? ")).toEqual({
      ok: false,
      reason: "no_letter_or_digit",
    });
  });
});

describe("sameJobDescription", () => {
  it("ignores case, and matches null only with null", () => {
    expect(sameJobDescription("Account executive", "account Executive")).toBe(true);
    expect(sameJobDescription("C++ developer", "C# developer")).toBe(false);
    expect(sameJobDescription(null, null)).toBe(true);
    expect(sameJobDescription(null, "Account executive")).toBe(false);
  });
});
