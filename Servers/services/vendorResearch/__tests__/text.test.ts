import { MAX_SNIPPET_CHARS, cleanText, cutAtCodePoint } from "../text";

describe("MAX_SNIPPET_CHARS", () => {
  it("is 1,500", () => {
    expect(MAX_SNIPPET_CHARS).toBe(1500);
  });
});

describe("cleanText", () => {
  // Built from char codes, so that no control character or lone surrogate sits in this file.
  const NUL = String.fromCharCode(0);
  const REPLACEMENT = String.fromCharCode(0xfffd);
  const loneHigh = String.fromCharCode(0xd83d);
  const loneLow = String.fromCharCode(0xde00);

  it("returns text that needs no cleaning as it is, tab, line feed and carriage return included", () => {
    const text = "Acme said:\tit is fixed.\r\nSee https://acme.com/a?b=1&c=2 (naïve café 😀)";

    expect(cleanText(text)).toBe(text);
    expect(cleanText("")).toBe("");
  });

  it("removes a NUL", () => {
    expect(cleanText(`a${NUL}b${NUL}${NUL}c`)).toBe("abc");
    expect(cleanText(NUL)).toBe("");
  });

  it("removes every other control character of the C0 block, and nothing else of it", () => {
    const kept = new Set([9, 10, 13]);
    for (let code = 0; code < 32; code += 1) {
      const character = String.fromCharCode(code);

      expect(cleanText(`x${character}y`)).toBe(kept.has(code) ? `x${character}y` : "xy");
    }
  });

  it("replaces a lone high surrogate and a lone low surrogate with U+FFFD", () => {
    expect(cleanText(`a${loneHigh}b`)).toBe(`a${REPLACEMENT}b`);
    expect(cleanText(`a${loneLow}b`)).toBe(`a${REPLACEMENT}b`);
    expect(cleanText(`${loneHigh}${loneHigh}`)).toBe(`${REPLACEMENT}${REPLACEMENT}`);
  });

  it("replaces half of a surrogate pair at the end or at the start of the text", () => {
    const smile = "😀";

    expect(cleanText(`ok ${smile.charAt(0)}`)).toBe(`ok ${REPLACEMENT}`);
    expect(cleanText(`${smile.charAt(1)} ok`)).toBe(`${REPLACEMENT} ok`);
  });

  it("keeps a complete surrogate pair", () => {
    expect(cleanText("a😀b")).toBe("a😀b");
    expect(cleanText(`${"😀".repeat(3)}${loneHigh}`)).toBe(`${"😀".repeat(3)}${REPLACEMENT}`);
  });

  it("does both in one text", () => {
    expect(cleanText(`${NUL}a${loneLow}${NUL}b`)).toBe(`a${REPLACEMENT}b`);
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
