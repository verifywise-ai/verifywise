import { MAX_SNIPPET_CHARS, cutAtCodePoint } from "../text";

describe("MAX_SNIPPET_CHARS", () => {
  it("is 1,500", () => {
    expect(MAX_SNIPPET_CHARS).toBe(1500);
  });
});

describe("cutAtCodePoint", () => {
  it("cuts text that is longer than the limit to exactly the limit", () => {
    expect(cutAtCodePoint("a".repeat(2000), MAX_SNIPPET_CHARS)).toBe("a".repeat(MAX_SNIPPET_CHARS));
    expect(cutAtCodePoint("abcdef", 3)).toBe("abc");
  });

  it("returns text that is not longer than the limit as it is", () => {
    expect(cutAtCodePoint("a".repeat(1500), 1500)).toBe("a".repeat(1500));
    expect(cutAtCodePoint("short", 1500)).toBe("short");
    expect(cutAtCodePoint("", 5)).toBe("");
    // Nothing is cut, so nothing is looked at: even an unpaired high surrogate at the end stays.
    expect(cutAtCodePoint("ab\uD800", 3)).toBe("ab\uD800");
  });

  it("steps back over the first half of a surrogate pair at the boundary", () => {
    // The emoji takes two UTF-16 units, at indexes 4 and 5: a cut after five units falls inside it.
    expect(cutAtCodePoint(`${"a".repeat(4)}😀tail`, 5)).toBe("aaaa");
  });

  it("keeps a surrogate pair that ends exactly at the boundary", () => {
    expect(cutAtCodePoint(`${"a".repeat(4)}😀tail`, 6)).toBe(`${"a".repeat(4)}😀`);
  });

  it("treats the first and the last surrogate pair like any other", () => {
    // U+10000 is \uD800\uDC00 and U+10FFFF is \uDBFF\uDFFF: the ends of the two ranges.
    for (const pair of ["\uD800\uDC00", "\uDBFF\uDFFF"]) {
      expect(cutAtCodePoint(`a${pair}bc`, 2)).toBe("a");
      expect(cutAtCodePoint(`a${pair}bc`, 3)).toBe(`a${pair}`);
    }
  });

  it("counts UTF-16 units, as String.length does, and never returns more than the limit", () => {
    const text = "😀".repeat(10);

    expect(cutAtCodePoint(text, 5)).toBe("😀😀");
    expect(cutAtCodePoint(text, 6)).toBe("😀😀😀");
    for (let limit = 0; limit <= text.length; limit += 1) {
      expect(cutAtCodePoint(text, limit).length).toBeLessThanOrEqual(limit);
    }
  });

  it("gives an empty string when not even the first character fits", () => {
    expect(cutAtCodePoint("😀", 1)).toBe("");
    expect(cutAtCodePoint("abc", 0)).toBe("");
  });

  it("drops an unpaired high surrogate that would end the cut text, too", () => {
    expect(cutAtCodePoint("ab\uD800cd", 3)).toBe("ab");
  });

  it("does not look inside the text: a surrogate before the boundary stays as it is", () => {
    expect(cutAtCodePoint("a\uD800bcd", 3)).toBe("a\uD800b");
  });
});
