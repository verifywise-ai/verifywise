/**
 * The text helpers of the list kit (kit/clean.ts): one clean line out of a hostile cell, a cut that
 * says so, and the small checks every connector shares. Every character that is hard to type is
 * built with `cp`, so that this source holds none of them.
 */
import { cleanText } from "../../../../text";
import {
  LINE_INPUT_MAX,
  MARK_RUN_MAX,
  SHORTENED,
  compareText,
  dayText,
  distinct,
  flatText,
  instantText,
  isObject,
  lineOf,
  shorten,
  stringOf,
  unreadableAllowed,
  withoutAngles,
} from "../clean";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

/** How long a call takes, in milliseconds. */
const took = (run: () => unknown): number => {
  const start = process.hrtime.bigint();
  run();
  return Number(process.hrtime.bigint() - start) / 1e6;
};

const MEGABYTE = 1024 * 1024;

const ZWSP = cp(0x200b);
const NBSP = cp(0xa0);
const NEL = cp(0x85);
const DEL = cp(0x7f);
const NUL = cp(0);
const ACUTE = cp(0x301);
const BELOW = cp(0x316);
const HALF_WIDTH_VOICED_MARK = cp(0xff9e);
const EMOJI = cp(0x1f600);

describe("SHORTENED", () => {
  it("is the marker that a cut text ends with", () => {
    expect(SHORTENED).toBe(" [shortened]");
    expect(SHORTENED).toHaveLength(12);
  });
});

describe("lineOf", () => {
  describe("a value that is no text", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 5],
      ["a boolean", true],
      ["an object", { text: "a" }],
      ["an array", ["a"]],
      ["a bigint", BigInt(1)],
      ["a symbol", Symbol("a")],
    ])("gives an empty line for %s", (_name, value) => {
      expect(lineOf(value, 100)).toBe("");
    });
  });

  describe("one clean line", () => {
    it("collapses white space to single blanks and trims both ends", () => {
      expect(lineOf("  A\t\tB\r\nC \n\n D  ", 100)).toBe("A B C D");
      expect(lineOf("\n\t \r", 100)).toBe("");
      expect(lineOf("", 100)).toBe("");
    });

    it("leaves a text that is already clean as it is", () => {
      expect(lineOf("Acme Robotics Ltd, Cupertino (US)", 100)).toBe(
        "Acme Robotics Ltd, Cupertino (US)",
      );
    });

    it("removes the control characters without making blanks of them", () => {
      expect(lineOf(`a${NUL}b${cp(1)}c${cp(0x1f)}d`, 100)).toBe("abcd");
    });

    it("makes one blank of DEL and of a C1 control", () => {
      expect(lineOf(`a${DEL}b`, 100)).toBe("a b");
      expect(lineOf(`a${NEL}b`, 100)).toBe("a b");
      expect(lineOf(`a${cp(0x9f)}${cp(0x80)}  b`, 100)).toBe("a b");
    });

    it.each([
      ["a zero-width space", 0x200b],
      ["a zero-width non-joiner", 0x200c],
      ["a zero-width joiner", 0x200d],
      ["a left-to-right mark", 0x200e],
      ["a right-to-left mark", 0x200f],
      ["a left-to-right embedding", 0x202a],
      ["a right-to-left override", 0x202e],
      ["a left-to-right isolate", 0x2066],
      ["a pop directional isolate", 0x2069],
      ["an Arabic letter mark", 0x61c],
      ["the byte order mark", 0xfeff],
      ["a soft hyphen", 0xad],
      ["a word joiner", 0x2060],
      ["an invisible times", 0x2062],
      ["a Mongolian vowel separator", 0x180e],
      ["an interlinear annotation anchor", 0xfff9],
      ["a tag character", 0xe0041],
      ["the cancel tag", 0xe007f],
      ["variation selector 1", 0xfe00],
      ["variation selector 16", 0xfe0f],
      ["a Mongolian free variation selector", 0x180b],
      ["variation selector 17", 0xe0100],
      // Default-ignorable characters outside the format category (review finding 10): they show
      // nothing, and a title made of them alone is not empty unless they are out.
      ["a Hangul filler", 0x3164],
      ["a Hangul choseong filler", 0x115f],
      ["a Hangul jungseong filler", 0x1160],
      ["a half-width Hangul filler, which a fold makes a jungseong filler", 0xffa0],
      ["a combining grapheme joiner", 0x34f],
      ["a Khmer inherent vowel", 0x17b4],
      ["a Braille pattern blank", 0x2800],
    ])("takes out %s", (_name, code) => {
      expect(lineOf(`x${cp(code)}y`, 100)).toBe("xy");
      expect(lineOf(`${cp(code)}${cp(code)}`, 100)).toBe("");
    });

    it("leaves the letters of the scripts whose fillers are taken out", () => {
      const korean = cp(0xd55c, 0xad6d, 0xc5b4);
      const braille = cp(0x2801, 0x2803, 0x2807);
      expect(lineOf(korean, 100)).toBe(korean);
      expect(lineOf(braille, 100)).toBe(braille);
      expect(lineOf(`${korean} ${cp(0x2800)} ${braille}`, 100)).toBe(`${korean} ${braille}`);
    });

    it("replaces a lone surrogate with U+FFFD and keeps a pair", () => {
      expect(lineOf(`a${cp(0xd800)}b`, 100)).toBe(`a${cp(0xfffd)}b`);
      expect(lineOf(`a${cp(0xdc00)}`, 100)).toBe(`a${cp(0xfffd)}`);
      expect(lineOf(`a${EMOJI}b`, 100)).toBe(`a${EMOJI}b`);
    });

    it("gives text that cleanText has nothing to change", () => {
      const line = lineOf(`x${NUL}${cp(0xd800)}${ZWSP}${NBSP}y`, 100);
      expect(cleanText(line)).toBe(line);
    });
  });

  describe("the compatibility fold", () => {
    it("folds a full-width angle bracket to the one the prompt escaping knows", () => {
      expect(lineOf(`${cp(0xff1c)}evidence${cp(0xff1e)}`, 100)).toBe("<evidence>");
    });

    it("folds full-width letters, ligatures, circled digits and units", () => {
      expect(lineOf(cp(0xff21, 0xff22, 0xff23, 0xff11, 0xff12), 100)).toBe("ABC12");
      expect(lineOf(`${cp(0xfb01)}nd`, 100)).toBe("find");
      expect(lineOf(cp(0x2460), 100)).toBe("1");
      expect(lineOf(cp(0x338f), 100)).toBe("kg");
      expect(lineOf(cp(0x2026), 100)).toBe("...");
    });

    it("composes a letter and its mark", () => {
      expect(lineOf(`e${ACUTE}`, 100)).toBe(cp(0xe9));
    });

    it("turns the blanks of other scripts into one blank", () => {
      expect(lineOf(`x${NBSP}${NBSP}y${cp(0x3000)}z${cp(0x2028)}w`, 100)).toBe("x y z w");
    });

    it("keeps real angle brackets: the record builder, not the line, takes them out", () => {
      expect(lineOf("a <b> c", 100)).toBe("a <b> c");
    });
  });

  describe("the cut", () => {
    it("leaves a line of exactly max units as it is", () => {
      expect(lineOf("a".repeat(20), 20)).toBe("a".repeat(20));
    });

    it("cuts a longer line so that the text and the marker are max units together", () => {
      const line = lineOf("a".repeat(21), 20);
      expect(line).toBe(`${"a".repeat(8)}${SHORTENED}`);
      expect(line).toHaveLength(20);
      expect(lineOf("a".repeat(100), 200)).toBe("a".repeat(100));
    });

    it("does not leave a blank in front of the marker", () => {
      expect(lineOf("aaaa bbbb cccc dddd", 17)).toBe(`aaaa${SHORTENED}`);
    });

    it("never splits a surrogate pair", () => {
      // 21 - 12 = 9 units of room: the ninth unit would be the first half of the fifth emoji.
      const odd = lineOf(EMOJI.repeat(50), 21);
      expect(odd).toBe(`${EMOJI.repeat(4)}${SHORTENED}`);
      expect(cleanText(odd)).toBe(odd);
      // 22 - 12 = 10 units of room: five whole emoji.
      expect(lineOf(EMOJI.repeat(50), 22)).toBe(`${EMOJI.repeat(5)}${SHORTENED}`);
    });

    it("gives the marker alone, with no blank in front of it, when no whole character fits", () => {
      // 13 - 12 = 1 unit of room, and an emoji is two.
      expect(lineOf(EMOJI.repeat(10), 13)).toBe(SHORTENED.trim());
      expect(shorten(EMOJI.repeat(10), 13)).toBe(SHORTENED.trim());
    });

    it("counts the units of the line after it was cleaned, not of the cell", () => {
      expect(lineOf(`${"a ".repeat(10)}${ZWSP.repeat(500)}`, 19)).toBe("a a a a a a a a a a");
    });

    it("cuts the text a fold made longer", () => {
      expect(lineOf(cp(0xfdfa).repeat(10), 30)).toHaveLength(30);
    });

    it("gives no marker when there is no room for one, and never a line longer than max", () => {
      expect(lineOf("abcdefghijklmnopqrstuvwxyz", 5)).toBe("abcde");
      expect(lineOf("abcdefghijklmnopqrstuvwxyz", 12)).toBe("abcdefghijkl");
      expect(lineOf("abcdefghijklmnopqrstuvwxyz", 13)).toBe(`a${SHORTENED}`);
      expect(lineOf(EMOJI.repeat(10), 5)).toBe(EMOJI.repeat(2));
    });

    it.each([0, -1, -100, Number.NaN])("gives an empty line for the limit %p", (max) => {
      expect(lineOf("abc", max)).toBe("");
      // A cell that is read only in part too: a marker is no line to give where there is no room.
      expect(lineOf("a".repeat(LINE_INPUT_MAX + 1), max)).toBe("");
    });

    it("does not cut at an unlimited length", () => {
      expect(lineOf("a".repeat(5000), Number.POSITIVE_INFINITY)).toBe("a".repeat(5000));
    });
  });

  describe("runs of combining marks", () => {
    it("keeps the longest run that is allowed and cuts a longer one", () => {
      expect(MARK_RUN_MAX).toBe(16);
      expect(lineOf(`x${ACUTE.repeat(MARK_RUN_MAX)}`, 100)).toBe(`x${ACUTE.repeat(MARK_RUN_MAX)}`);
      expect(lineOf(`x${ACUTE.repeat(MARK_RUN_MAX + 1)}`, 100)).toBe(
        `x${ACUTE.repeat(MARK_RUN_MAX)}`,
      );
      expect(lineOf(`x${ACUTE.repeat(400)}`, 100)).toBe(`x${ACUTE.repeat(MARK_RUN_MAX)}`);
    });

    it("limits each run by itself", () => {
      expect(lineOf(`x${ACUTE.repeat(30)}y${BELOW.repeat(30)}z`, 100)).toBe(
        `x${ACUTE.repeat(MARK_RUN_MAX)}y${BELOW.repeat(MARK_RUN_MAX)}z`,
      );
    });

    it("counts marks outside the basic plane as one each", () => {
      const mark = cp(0x1d167);
      expect(lineOf(`x${mark.repeat(40)}`, 100)).toBe(`x${mark.repeat(MARK_RUN_MAX)}`);
    });

    it("counts the half-width kana marks, which a fold makes combining marks", () => {
      const folded = lineOf(`x${HALF_WIDTH_VOICED_MARK.repeat(40)}`, 100);
      expect(folded).toBe(`x${cp(0x3099).repeat(MARK_RUN_MAX)}`);
    });

    it("leaves the text of the scripts that stack marks as the fold gives it", () => {
      const texts = [
        cp(0x939, 0x93f, 0x928, 0x94d, 0x926, 0x940), // Hindi
        cp(0x5e9, 0x5b8, 0x5c1, 0x5dc, 0x5d5, 0x5b9, 0x5dd), // Hebrew with points
        cp(0x628, 0x650, 0x633, 0x652, 0x645, 0x650, 0x651, 0x64d), // Arabic with vowels
        `Vi${cp(0x1ec7)}t Nam`,
        `Zalgo${ACUTE.repeat(8)}${BELOW.repeat(8)}`,
      ];
      for (const text of texts) expect(lineOf(text, 100)).toBe(text.normalize("NFKC"));
    });
  });

  describe("hostile cells: every step is linear and a cell is read to LINE_INPUT_MAX units", () => {
    it.each([
      ["5 MB of spaces", () => " ".repeat(5 * MEGABYTE)],
      ["5 MB of dots", () => ".".repeat(5 * MEGABYTE)],
      ["a 2 MB run of one combining mark", () => `x${ACUTE.repeat(2 * MEGABYTE)}`],
      [
        "a 2 MB run of marks of two classes (the quadratic case of the fold)",
        () => (ACUTE + BELOW).repeat(MEGABYTE),
      ],
      [
        "a run of marks of two classes where one is a half-width kana mark",
        () => (ACUTE + HALF_WIDTH_VOICED_MARK).repeat(MEGABYTE),
      ],
      [
        "2 MB of the longest run of marks that is allowed, in the worst order",
        () => `x${(ACUTE + BELOW).repeat(MARK_RUN_MAX / 2)}`.repeat(120_000),
      ],
      ["5 MB of zero-width spaces", () => ZWSP.repeat(5 * MEGABYTE)],
      ["5 MB of NUL characters", () => NUL.repeat(5 * MEGABYTE)],
      ["2 MB of lone surrogates", () => cp(0xd800).repeat(2 * MEGABYTE)],
      ["5 MB of a letter and a blank", () => "a ".repeat(2.5 * MEGABYTE)],
      ["a 10 MB line of blanks and line breaks", () => " \n".repeat(5 * MEGABYTE)],
      [
        "65,536 characters that the fold expands eighteen times each",
        () => cp(0xfdfa).repeat(65_536),
      ],
    ])("reads %s in less than 500 ms", (_name, make) => {
      const cell = make();
      expect(took(() => lineOf(cell, 200))).toBeLessThan(500);
    });

    it("gives an empty line for blanks, and the front of a long run of dots, cut and marked", () => {
      expect(lineOf(" ".repeat(10 * MEGABYTE), 200)).toBe("");
      expect(lineOf(".".repeat(5 * MEGABYTE), 200)).toBe(`${".".repeat(188)}${SHORTENED}`);
    });

    it("reads no more of a cell than LINE_INPUT_MAX units, and says it cut one", () => {
      expect(LINE_INPUT_MAX).toBe(1024 * 1024);
      // Beyond the limit nothing is seen, so the tail of a cell of blanks is lost...
      expect(lineOf(`${" ".repeat(LINE_INPUT_MAX)}tail`, 100)).toBe("");
      // ...and a line that is left short by the cut does not claim to be whole.
      expect(lineOf(`abc${" ".repeat(LINE_INPUT_MAX)}`, 100)).toBe(`abc${SHORTENED}`);
      expect(lineOf(`${"a".repeat(LINE_INPUT_MAX)}b`, 100)).toBe(`${"a".repeat(88)}${SHORTENED}`);
      // A cell of exactly the limit is read whole, and one unit more is not.
      const whole = "a".repeat(LINE_INPUT_MAX);
      expect(lineOf(whole, Number.POSITIVE_INFINITY)).toBe(whole);
      expect(lineOf(`${whole}a`, Number.POSITIVE_INFINITY)).toBe(`${whole}${SHORTENED}`);
    });

    it("never splits a pair at the limit of the cell", () => {
      const line = lineOf(`${"a".repeat(LINE_INPUT_MAX - 1)}${EMOJI}`, Number.POSITIVE_INFINITY);
      expect(cleanText(line)).toBe(line);
      expect(line.endsWith(SHORTENED)).toBe(true);
    });
  });
});

describe("shorten", () => {
  it("gives a text of at most max units as it is, whatever it holds", () => {
    expect(shorten("abc", 10)).toBe("abc");
    expect(shorten("", 5)).toBe("");
    expect(shorten(`a${NUL}  b`, 10)).toBe(`a${NUL}  b`);
    expect(shorten("a".repeat(20), 20)).toBe("a".repeat(20));
  });

  it("cuts a longer text so that it and the marker are max units together", () => {
    expect(shorten("a".repeat(30), 20)).toBe(`${"a".repeat(8)}${SHORTENED}`);
    expect(shorten("a".repeat(30), 20)).toHaveLength(20);
  });

  it("trims the blank before the marker and never splits a pair", () => {
    expect(shorten("aaaa bbbb cccc dddd", 17)).toBe(`aaaa${SHORTENED}`);
    expect(shorten(EMOJI.repeat(20), 21)).toBe(`${EMOJI.repeat(4)}${SHORTENED}`);
  });

  it("cuts without a marker when there is no room for one", () => {
    expect(shorten("abcdefghijklmnop", 12)).toBe("abcdefghijkl");
    expect(shorten("abcdefghijklmnop", 3)).toBe("abc");
    expect(shorten("abcdefghijklmnop", 13)).toBe(`a${SHORTENED}`);
  });

  it.each([0, -3, Number.NaN])("gives nothing for the limit %p", (max) => {
    expect(shorten("abc", max)).toBe("");
  });
});

describe("flatText", () => {
  it("collapses white space, trims, and takes out the controls and the characters nobody sees", () => {
    expect(flatText("  A\n\nB\t\tC  ")).toBe("A B C");
    expect(flatText(`a${NUL}b${ZWSP}c${DEL}d${NBSP}e${NEL}f`)).toBe("abc d e f");
    expect(flatText(`x${cp(0xd800)}y`)).toBe(`x${cp(0xfffd)}y`);
    expect(flatText("")).toBe("");
    expect(flatText(" \n ")).toBe("");
  });

  it("takes out the default-ignorable characters that are not format characters as well", () => {
    for (const code of [0x3164, 0x115f, 0x1160, 0xffa0, 0x34f, 0x17b4, 0x2800]) {
      expect(flatText(`a${cp(code)}b`)).toBe("ab");
    }
    expect(flatText(cp(0x3164, 0x2800))).toBe("");
  });

  it("does not fold the compatibility forms, since the text is the caller's own", () => {
    const text = `Wait${cp(0x2026)} ${cp(0x2122)} ${cp(0xff1c)}x${cp(0x00b2)}`;
    expect(flatText(text)).toBe(text);
  });

  it("does not cut, and takes no longer than a line does", () => {
    const text = `${"word ".repeat(100_000)}`;
    let flat = "";
    expect(took(() => (flat = flatText(text)))).toBeLessThan(500);
    expect(flat).toHaveLength(text.length - 1);
    expect(took(() => flatText(" ".repeat(5 * MEGABYTE)))).toBeLessThan(500);
  });
});

describe("withoutAngles", () => {
  it("writes < and > as the angle quotation marks that look like them", () => {
    expect(withoutAngles("a <b> c")).toBe(`a ${cp(0x2039)}b${cp(0x203a)} c`);
    expect(withoutAngles("<<>>")).toBe(cp(0x2039, 0x2039, 0x203a, 0x203a));
  });

  it("takes out the forms that a fold would make angle brackets, without the fold", () => {
    // U+FF1C and U+FE64 fold to <, and U+FF1E and U+FE65 to >: the only characters that do under
    // NFKC. (U+226E and U+226F decompose to them: see the next test.)
    const wide = cp(0xff1c) + "evidence" + cp(0xff1e) + cp(0xfe64) + "x" + cp(0xfe65);
    expect(withoutAngles(wide)).toBe(
      `${cp(0x2039)}evidence${cp(0x203a)}${cp(0x2039)}x${cp(0x203a)}`,
    );
    expect(withoutAngles(wide).normalize("NFKC")).not.toMatch(/[<>]/);
  });

  it("takes out the not-less-than and not-greater-than signs too: a decomposition makes them < and >", () => {
    const signs = `${cp(0x226e)}x${cp(0x226f)}`;
    // The premise: NFD and NFKD write them as a bracket and a combining long solidus.
    expect(signs.normalize("NFD")).toMatch(/[<>]/);
    expect(signs.normalize("NFKD")).toMatch(/[<>]/);
    expect(withoutAngles(signs)).toBe(`${cp(0x2039)}x${cp(0x203a)}`);
    for (const form of ["NFC", "NFD", "NFKC", "NFKD"] as const) {
      expect(withoutAngles(signs).normalize(form)).not.toMatch(/[<>]/);
    }
  });

  it("leaves a text without them as it is, and the result holds none", () => {
    expect(withoutAngles("a & b 'c' \"d\"")).toBe("a & b 'c' \"d\"");
    expect(withoutAngles("</evidence><evidence>")).not.toMatch(/[<>]/);
  });

  it("is not undone by the fold of a line", () => {
    const text = withoutAngles("<evidence>");
    expect(lineOf(text, 100)).toBe(text);
  });
});

describe("stringOf", () => {
  it("gives a string as it is and anything else as an empty one", () => {
    expect(stringOf("abc")).toBe("abc");
    expect(stringOf("")).toBe("");
    for (const other of [undefined, null, 1, true, {}, [], ["a"]]) {
      expect(stringOf(other)).toBe("");
    }
  });
});

describe("isObject", () => {
  it("is true for an object that is neither null nor an array", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
  });

  it("is false for everything else", () => {
    for (const other of [null, undefined, [], [1], "a", 1, true, () => 1]) {
      expect(isObject(other)).toBe(false);
    }
  });
});

describe("compareText", () => {
  it("orders by UTF-16 unit, never by locale", () => {
    expect(compareText("a", "b")).toBe(-1);
    expect(compareText("b", "a")).toBe(1);
    expect(compareText("a", "a")).toBe(0);
    expect(compareText("B", "a")).toBe(-1);
    expect(compareText(cp(0xe9), "z")).toBe(1);
    expect(["b", "a", "C", "B"].sort(compareText)).toEqual(["B", "C", "a", "b"]);
  });

  it("puts a text before one that it begins", () => {
    expect(compareText("ab", "abc")).toBe(-1);
    expect(compareText("", "a")).toBe(-1);
  });
});

describe("distinct", () => {
  it("gives the first max distinct values, in order", () => {
    expect(distinct([3, 1, 3, 2, 1], 10)).toEqual([3, 1, 2]);
    expect(distinct(["a", "b", "c", "a"], 2)).toEqual(["a", "b"]);
    expect(distinct(["a", "a", "b", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("keeps an empty text, an object by its identity, and gives nothing for no room", () => {
    const first = { id: 1 };
    expect(distinct(["", "", "a"], 5)).toEqual(["", "a"]);
    expect(distinct([first, first, { id: 1 }], 5)).toEqual([first, { id: 1 }]);
    expect(distinct(["a"], 0)).toEqual([]);
    expect(distinct(["a"], -1)).toEqual([]);
    expect(distinct([], 5)).toEqual([]);
  });

  it("does not change what it is given", () => {
    const values = ["a", "a", "b"];
    distinct(values, 5);
    expect(values).toEqual(["a", "a", "b"]);
  });
});

describe("unreadableAllowed", () => {
  it.each([
    // A short list may not leave out most of itself: a tenth of the rows, rounded up, at most.
    [0, 0],
    [1, 1],
    [5, 1],
    [12, 2],
    [50, 5],
    [99, 10],
    [100, 10],
    // Ten, or a hundredth of the rows when that is more.
    [999, 10],
    [1000, 10],
    [1099, 10],
    [1100, 11],
    [2000, 20],
    [5000, 50],
    [1500.7, 15],
    [123_456, 1234],
  ])("allows, of %p rows, %p that do not parse", (rows, allowed) => {
    expect(unreadableAllowed(rows)).toBe(allowed);
  });

  it("is never more than a tenth of the rows, rounded up, nor more than the rows", () => {
    for (const rows of [0, 1, 2, 3, 9, 10, 11, 12, 99, 100, 101, 999, 1000, 100_000]) {
      const allowed = unreadableAllowed(rows);
      expect(allowed).toBeLessThanOrEqual(Math.ceil(rows / 10));
      expect(allowed).toBeLessThanOrEqual(rows);
    }
  });
});

describe("dayText", () => {
  it("gives a day of the form YYYY-MM-DD that exists", () => {
    expect(dayText("2026-01-05")).toBe("2026-01-05");
    expect(dayText("2026-12-31")).toBe("2026-12-31");
    expect(dayText("2024-02-29")).toBe("2024-02-29");
    expect(dayText("1999-12-31")).toBe("1999-12-31");
  });

  it.each([
    "2026-02-30",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "2026-01-32",
    "2100-02-29",
    "0000-01-01",
  ])("gives null for the day %s, which does not exist", (day) => {
    expect(dayText(day)).toBeNull();
  });

  it("knows a leap year from one that is not", () => {
    expect(dayText("2000-02-29")).toBe("2000-02-29");
    expect(dayText("1900-02-29")).toBeNull();
    expect(dayText("2023-02-29")).toBeNull();
  });

  it.each([
    "2026-1-5",
    "26-01-05",
    "2026/01/05",
    "05/01/2026",
    "01/05/2026",
    "2026-01-05T00:00:00Z",
    "2026-01-05 10:30",
    "2026-01-05x",
    "Jan 5, 2026",
    "20260105",
    "",
    "   ",
  ])("gives null for %p, which is not of the form", (text) => {
    expect(dayText(text)).toBeNull();
  });

  it("gives null for a value that is no text", () => {
    for (const value of [undefined, null, 20260105, true, {}, ["2026-01-05"]]) {
      expect(dayText(value)).toBeNull();
    }
  });

  it("tolerates the blanks and hidden characters around a day, and gives the day alone", () => {
    expect(dayText(" 2026-01-05 ")).toBe("2026-01-05");
    expect(dayText(`2026-01-05${ZWSP}`)).toBe("2026-01-05");
    expect(dayText(`\t2026-01-05\r\n`)).toBe("2026-01-05");
  });

  it("does not take a long cell for a day, nor take long to read it", () => {
    const cell = `2026-01-05${" ".repeat(5 * MEGABYTE)}x`;
    let day: string | null = "";
    expect(took(() => (day = dayText(cell)))).toBeLessThan(500);
    expect(day).toBeNull();
  });
});

describe("instantText", () => {
  it.each([
    "2026-10-31",
    "2026-10-31T12:34:56Z",
    "2026-10-31T12:34:56.7Z",
    "2026-10-31T12:34:56.789Z",
    "2026-10-31T12:34:56.123456789Z",
    "2026-10-31T00:00:00+00:00",
    "2026-10-31T23:59:59+23:59",
    "2026-10-31T12:34:56-05:30",
  ])("gives %s, which is ISO 8601 with a zone", (text) => {
    expect(instantText(text)).toBe(text);
  });

  it.each([
    "2026-10-31 12:34:56Z",
    "2026-10-31T12:34:56",
    "2026-10-31T12:34Z",
    "2026-10-31T24:00:00Z",
    "2026-10-31T12:60:00Z",
    "2026-10-31T12:34:60Z",
    "2026-10-31T12:34:56+24:00",
    "2026-10-31T12:34:56+00:60",
    "2026-10-31T12:34:56+0100",
    "2026-02-30T00:00:00Z",
    "0000-01-01T00:00:00Z",
    "2026-10-31T12:34:56.Z",
    "2026-10-31T12:34:56.1234567890Z",
    " 2026-10-31",
    "2026-10-31 ",
    "10/31/2026",
    "Oct 31 2026",
    "",
  ])("gives null for %p", (text) => {
    expect(instantText(text)).toBeNull();
  });

  it("gives null for a value that is no text", () => {
    for (const value of [undefined, null, 1788000000, new Date(0), {}]) {
      expect(instantText(value)).toBeNull();
    }
  });

  describe("the years that a store holds (1 to 9999), once the zone is applied", () => {
    it.each([
      // The instant is 0000-12-31T23:00:00Z: year 0 is no year of a store.
      "0001-01-01T00:00:00+01:00",
      "0001-01-01T00:59:59+01:00",
      "0001-01-01T00:00:00+23:59",
      // The instant is 10000-01-01T00:00:00Z or later.
      "9999-12-31T23:59:59-23:59",
      "9999-12-31T23:59:59-00:01",
      "9999-12-31T23:00:00-01:00",
    ])("gives null for %s, whose instant falls outside them", (text) => {
      expect(instantText(text)).toBeNull();
    });

    it.each([
      "0001-01-01T00:00:00Z",
      "0001-01-01T00:00:00.000Z",
      "0001-01-01T01:00:00+01:00",
      "0001-01-01T00:00:00-23:59",
      "9999-12-31T23:59:59Z",
      "9999-12-31T23:59:59.999Z",
      "9999-12-31T23:59:59.999999999Z",
      "9999-12-31T22:59:59-01:00",
      "9999-12-31T23:59:59+23:59",
      "0001-01-01",
      "9999-12-31",
    ])("gives %s, which is at the edge of them and inside", (text) => {
      expect(instantText(text)).toBe(text);
    });
  });
});
