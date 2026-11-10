/**
 * The stream readers of the list kit (kit/stream.ts): the splitter of inflated bytes into lines, the
 * reader of a tab-separated line of bytes, and the compact day of the NHTSA flat files, which the
 * two lists of NHTSA (390 MB and 313 MB of text in a zip) are read with. Everything that is hard to
 * type is built with `cp`, so that this source holds none of it; a line that a test keeps is copied,
 * since the splitter gives a Buffer that is valid during the call only.
 */
import v8 from "v8";
import vm from "vm";
import zlib from "zlib";
import { writeZip } from "../../../__tests__/helpers/zipWriter";
import { type ZipLimits, ZipError, streamZipEntry } from "../../../zip";
import { BodyTooLargeError } from "../../types";
import { type LineLimits, LineSplitter, compactDayText, tabFieldsOf } from "../stream";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const MIB = 1_048_576;
const LF = "\n";
const CR = "\r";
const TAB = "\t";
const latin1 = (text: string): Buffer => Buffer.from(text, "latin1");

/** The lines the splitter gave, as latin1 text (one character a byte) or null for an overlong one. */
type Seen = Array<string | null>;

/** A line longer than this is recorded as its length, so that a test that feeds megabytes fails in a line, not in a diff of them. */
const SEEN_MAX = 2_000;

function splitterOf(limits: LineLimits, seen: Seen): LineSplitter {
  return new LineSplitter(limits, (line) => {
    if (line === null) seen.push(null);
    else if (line.length > SEEN_MAX) seen.push(`<${line.length} bytes>`);
    else seen.push(Buffer.from(line).toString("latin1"));
  });
}

/** Everything pushed in the pieces given, then the end. */
function splitAll(limits: LineLimits, pieces: readonly Buffer[]): { seen: Seen; lines: number } {
  const seen: Seen = [];
  const splitter = splitterOf(limits, seen);
  for (const piece of pieces) splitter.push(piece);
  splitter.end();
  return { seen, lines: splitter.lines };
}

/** The bytes cut into pieces at the positions given (ascending, within the bytes). */
function cutAt(bytes: Buffer, positions: readonly number[]): Buffer[] {
  const pieces: Buffer[] = [];
  let from = 0;
  for (const position of positions) {
    pieces.push(bytes.subarray(from, position));
    from = position;
  }
  pieces.push(bytes.subarray(from));
  return pieces;
}

const LIMITS: LineLimits = { maxLines: 1_000, maxLineBytes: 64 };

/** The lines of a text as the splitter is to give them: a CR before a LF is dropped, a cut one is null. */
function referenceLines(bytes: Buffer, maxLineBytes: number): Seen {
  const parts = bytes.toString("latin1").split(LF);
  // What follows the last LF is the last line, unless there is nothing: a CR there stays.
  const last = parts.pop() as string;
  const lines = parts.map((part) => (part.endsWith(CR) ? part.slice(0, -1) : part));
  if (last !== "") lines.push(last);
  return lines.map((line) => (line.length > maxLineBytes ? null : line));
}

/** The index of the first line that two lists of lines do not share, or -1. */
function firstDifference(a: Seen, b: Seen): number {
  const length = Math.max(a.length, b.length);
  for (let at = 0; at < length; at += 1) if (a[at] !== b[at]) return at;
  return -1;
}

/** A seeded generator (mulberry32): the same numbers in every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A function that makes V8 collect garbage, which Jest has no flag for: the one the engine gives a
 * new context once it is told to. What is alive after a collection, Buffers included, is what tells
 * a read that holds its data from one that does not.
 */
function collector(): () => void {
  v8.setFlagsFromString("--expose_gc");
  const gc: unknown = vm.runInNewContext("gc");
  if (typeof gc !== "function") throw new Error("V8 gave no way to collect garbage.");
  return gc as () => void;
}

/** The bytes that are alive, the heap and the Buffers outside it. */
const liveBytes = (): number => {
  const { heapUsed, external } = process.memoryUsage();
  return heapUsed + external;
};

/** Collections with a turn of the event loop between them: the backing store of a dead Buffer is freed late. */
async function settle(gc: () => void): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("LineSplitter", () => {
  describe("the lines", () => {
    it("gives each line without its LF, and counts them", () => {
      const { seen, lines } = splitAll(LIMITS, [latin1("one\ntwo\nthree\n")]);

      expect(seen).toEqual(["one", "two", "three"]);
      expect(lines).toBe(3);
    });

    it("takes the last line that has no LF as a line, and an empty one as none", () => {
      expect(splitAll(LIMITS, [latin1("one\ntwo")]).seen).toEqual(["one", "two"]);
      expect(splitAll(LIMITS, [latin1("one\n")]).seen).toEqual(["one"]);
      expect(splitAll(LIMITS, [latin1("only")]).seen).toEqual(["only"]);
      expect(splitAll(LIMITS, []).seen).toEqual([]);
      expect(splitAll(LIMITS, [Buffer.alloc(0), Buffer.alloc(0)]).seen).toEqual([]);
    });

    it("gives a blank line as an empty Buffer, and counts it", () => {
      const kinds: Array<number | null> = [];
      const splitter = new LineSplitter(LIMITS, (line) => {
        kinds.push(line === null ? null : Buffer.isBuffer(line) ? line.length : -1);
      });

      splitter.push(latin1("\n\nabc\n\n"));
      splitter.end();

      expect(kinds).toEqual([0, 0, 3, 0]);
      expect(splitter.lines).toBe(4);
    });

    it("drops one CR before the LF, and no other", () => {
      const { seen } = splitAll(LIMITS, [latin1("a\r\nb\r\r\nc\rd\n\r\n\ne\r\n")]);

      expect(seen).toEqual(["a", "b\r", "c\rd", "", "", "e"]);
    });

    it("keeps a CR at the end of the last line, which has no LF for it to precede", () => {
      expect(splitAll(LIMITS, [latin1("a\r")]).seen).toEqual(["a\r"]);
      expect(splitAll(LIMITS, [latin1("a\n\r")]).seen).toEqual(["a", "\r"]);
      expect(splitAll(LIMITS, [latin1("a\r\r")]).seen).toEqual(["a\r\r"]);
    });

    it("gives every byte as it is: a line may hold any byte but the LF", () => {
      const all = Buffer.alloc(255);
      all.forEach((_, index) => {
        all[index] = index < 10 ? index : index + 1;
      });

      const { seen } = splitAll({ maxLines: 10, maxLineBytes: 1_000 }, [all, latin1(LF)]);

      expect(seen).toEqual([all.toString("latin1")]);
    });

    it("counts, while a line is given, the line that is being given", () => {
      const counts: number[] = [];
      const splitter: LineSplitter = new LineSplitter(LIMITS, () => {
        counts.push(splitter.lines);
      });

      splitter.push(latin1("a\nb\nc\n"));

      expect(counts).toEqual([1, 2, 3]);
    });
  });

  describe("a line split across pieces comes out as it does whole", () => {
    const SAMPLE = latin1(
      `first${LF}${LF}sec${CR}${LF}th${CR}ird${CR}${CR}${LF}${CR}${LF}fifth${CR}${LF}last`,
    );
    const WHOLE = referenceLines(SAMPLE, 64);

    it("at every split position", () => {
      expect(splitAll(LIMITS, [SAMPLE]).seen).toEqual(WHOLE);
      for (let at = 0; at <= SAMPLE.length; at += 1) {
        const { seen, lines } = splitAll(LIMITS, cutAt(SAMPLE, [at]));
        expect({ at, seen }).toEqual({ at, seen: WHOLE });
        expect(lines).toBe(WHOLE.length);
      }
    });

    it("at every pair of split positions, and in pieces of one byte", () => {
      for (let first = 0; first <= SAMPLE.length; first += 1) {
        for (let second = first; second <= SAMPLE.length; second += 1) {
          const { seen } = splitAll(LIMITS, cutAt(SAMPLE, [first, second]));
          expect({ first, second, seen }).toEqual({ first, second, seen: WHOLE });
        }
      }
      const bytes = Array.from({ length: SAMPLE.length - 1 }, (_, index) => index + 1);
      expect(splitAll(LIMITS, cutAt(SAMPLE, bytes)).seen).toEqual(WHOLE);
    });

    it("in a seeded random cutting of 5 MB: the bytes of the lines are those of split(LF)", () => {
      const random = seeded(20_261_110);
      const parts: Buffer[] = [];
      let total = 0;
      while (total < 5 * MIB) {
        // Some lines are far longer than the limit of this test, and a CR may end a line before its CRLF.
        const length =
          random() < 0.02 ? 1_100 + Math.floor(random() * 300) : Math.floor(random() * 150);
        const body = Buffer.alloc(length);
        for (let index = 0; index < length; index += 1) {
          const byte = Math.floor(random() * 256);
          body[index] = byte === 10 ? 11 : byte;
        }
        const ending = random() < 0.3 ? latin1(`${CR}${LF}`) : latin1(LF);
        parts.push(body, ending);
        total += length + ending.length;
      }
      parts.push(latin1("a last line that has no LF"));
      const input = Buffer.concat(parts);
      const limits = { maxLines: Number.MAX_SAFE_INTEGER, maxLineBytes: 1_000 };
      const pieces: Buffer[] = [];
      for (let at = 0; at < input.length;) {
        const size = 1 + Math.floor(random() * random() * 70_000);
        pieces.push(input.subarray(at, at + size));
        at += size;
      }

      const { seen } = splitAll(limits, pieces);
      const expected = referenceLines(input, 1_000);

      expect(expected.filter((line) => line === null).length).toBeGreaterThan(100);
      expect(seen.length).toBe(expected.length);
      expect(firstDifference(seen, expected)).toBe(-1);
    }, 60_000);
  });

  describe("a line that is longer than the limit", () => {
    const LIMIT: LineLimits = { maxLines: 100, maxLineBytes: 4 };

    it("is one null, and the lines after it are given", () => {
      const { seen, lines } = splitAll(LIMIT, [latin1("abcd\nabcde\nxy\n")]);

      expect(seen).toEqual(["abcd", null, "xy"]);
      expect(lines).toBe(3);
    });

    it("is measured without its LF, nor the CR before it", () => {
      const text = ["abcd", "abcde", "abcd\r", "abc\r", "abcd\r\r", "", "xx"].join("\r\n");

      // A line of exactly the limit is given, with or without the CR of its CRLF; one byte more is not.
      expect(splitAll(LIMIT, [latin1(`${text}\r\n`)]).seen).toEqual([
        "abcd",
        null,
        null,
        "abc\r",
        null,
        "",
        "xx",
      ]);
    });

    it("is one null at every split position, for a line of the limit, one more, and the limit before a CRLF", () => {
      const input = latin1(
        [
          `abcd${LF}`,
          `abcde${LF}`,
          `abcd${CR}${LF}`,
          `abcde${CR}${LF}`,
          `abc${CR}${CR}${LF}`,
          `abcd${CR}${CR}${LF}`,
          `ok${LF}`,
        ].join(""),
      );
      const expected: Seen = ["abcd", null, "abcd", null, "abc\r", null, "ok"];

      expect(splitAll(LIMIT, [input]).seen).toEqual(expected);
      for (let at = 0; at <= input.length; at += 1) {
        const { seen } = splitAll(LIMIT, cutAt(input, [at]));
        expect({ at, seen }).toEqual({ at, seen: expected });
      }
      const bytes = Array.from({ length: input.length - 1 }, (_, index) => index + 1);
      expect(splitAll(LIMIT, cutAt(input, bytes)).seen).toEqual(expected);
    });

    it("is one null across many pieces, and one when it is the last line and has no LF", () => {
      const long = latin1("z".repeat(10_000));
      const many = Array.from({ length: 200 }, () => long);

      expect(splitAll(LIMIT, [...many, latin1("\nok\n")]).seen).toEqual([null, "ok"]);
      expect(splitAll(LIMIT, [latin1("a\n"), ...many]).seen).toEqual(["a", null]);
      expect(splitAll(LIMIT, [latin1("abcde")]).seen).toEqual([null]);
      expect(splitAll(LIMIT, [latin1("abcd")]).seen).toEqual(["abcd"]);
      // The last line has no LF: its CR is a byte of it, and one too many.
      expect(splitAll(LIMIT, [latin1("abcd\r")]).seen).toEqual([null]);
      expect(splitAll(LIMIT, [latin1("abc\r")]).seen).toEqual(["abc\r"]);
    });

    it("a limit of nothing lets blank lines through only", () => {
      const { seen } = splitAll({ maxLines: 10, maxLineBytes: 0 }, [
        latin1(`${LF}a${LF}${CR}${LF}`),
      ]);

      expect(seen).toEqual(["", null, ""]);
    });

    it("is dropped as it comes: a line of 20 MB is never held", async () => {
      const gc = collector();
      const piece = Buffer.alloc(64 * 1_024, "x");
      const seen: Seen = [];
      const splitter = splitterOf({ maxLines: 10, maxLineBytes: 1_000 }, seen);
      await settle(gc);
      const start = liveBytes();
      let growth = 0;

      for (let count = 0; count < 320; count += 1) {
        splitter.push(piece);
        if (count % 40 === 39) {
          gc();
          growth = Math.max(growth, liveBytes() - start);
        }
      }
      splitter.push(latin1("\nnext\n"));
      splitter.end();

      expect(seen).toEqual([null, "next"]);
      expect(growth).toBeLessThan(8 * MIB);
    }, 60_000);
  });

  describe("the limit of lines", () => {
    it("throws BodyTooLargeError at the line past it, and gives no line after", () => {
      const seen: Seen = [];
      const splitter = splitterOf({ maxLines: 3, maxLineBytes: 64 }, seen);

      expect(() => splitter.push(latin1("a\nb\nc\nd\ne\n"))).toThrow(BodyTooLargeError);

      expect(seen).toEqual(["a", "b", "c"]);
      expect(splitter.lines).toBe(3);
      // The splitter is spent: it gives nothing more and throws nothing more.
      expect(() => splitter.push(latin1("f\ng\n"))).not.toThrow();
      expect(() => splitter.end()).not.toThrow();
      expect(seen).toEqual(["a", "b", "c"]);
      expect(splitter.lines).toBe(3);
    });

    it("counts the blank lines and the overlong ones", () => {
      const seen: Seen = [];
      const splitter = splitterOf({ maxLines: 3, maxLineBytes: 2 }, seen);

      expect(() => splitter.push(latin1(`${LF}abcdef${LF}${LF}x${LF}`))).toThrow(BodyTooLargeError);

      expect(seen).toEqual(["", null, ""]);
    });

    it("throws from end() for a last line without LF that is one too many, and not for the last that fits", () => {
      const over = splitterOf({ maxLines: 3, maxLineBytes: 64 }, []);
      over.push(latin1("a\nb\nc\nd"));
      expect(() => over.end()).toThrow(BodyTooLargeError);

      expect(splitAll({ maxLines: 3, maxLineBytes: 64 }, [latin1("a\nb\nc")]).seen).toEqual([
        "a",
        "b",
        "c",
      ]);
      expect(splitAll({ maxLines: 3, maxLineBytes: 64 }, [latin1("a\nb\nc\n")]).seen).toEqual([
        "a",
        "b",
        "c",
      ]);
      expect(splitAll({ maxLines: 0, maxLineBytes: 64 }, []).seen).toEqual([]);
      expect(() => splitAll({ maxLines: 0, maxLineBytes: 64 }, [latin1("a")])).toThrow(
        BodyTooLargeError,
      );
    });

    it("throws the same at every split position", () => {
      const input = latin1("a\nb\r\n\nlast");
      for (let at = 0; at <= input.length; at += 1) {
        const seen: Seen = [];
        const splitter = splitterOf({ maxLines: 3, maxLineBytes: 64 }, seen);
        const pieces = cutAt(input, [at]);

        expect(() => {
          for (const piece of pieces) splitter.push(piece);
          splitter.end();
        }).toThrow(BodyTooLargeError);
        expect({ at, seen }).toEqual({ at, seen: ["a", "b", ""] });
      }
    });
  });

  describe("a splitter that is spent", () => {
    it("takes end() twice, and a push after the end, as nothing", () => {
      const seen: Seen = [];
      const splitter = splitterOf(LIMITS, seen);
      splitter.push(latin1("a\nb"));

      splitter.end();
      expect(() => splitter.end()).not.toThrow();
      expect(() => splitter.push(latin1("c\nd\n"))).not.toThrow();
      expect(() => splitter.end()).not.toThrow();

      expect(seen).toEqual(["a", "b"]);
      expect(splitter.lines).toBe(2);
    });

    it("gives nothing after the callback threw, and the error is the callback's own", () => {
      const boom = new Error("stop");
      const seen: string[] = [];
      const splitter = new LineSplitter(LIMITS, (line) => {
        const text = Buffer.from(line ?? Buffer.alloc(0)).toString("latin1");
        if (text === "b") throw boom;
        seen.push(text);
      });
      let caught: unknown;

      try {
        splitter.push(latin1("a\nb\nc\n"));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBe(boom);
      expect(seen).toEqual(["a"]);
      splitter.push(latin1("d\n"));
      splitter.end();
      expect(seen).toEqual(["a"]);
    });
  });

  describe("the Buffer of a line is valid during the call only (review F3)", () => {
    // The splitter copies nothing. A line that lies whole in one chunk is a view of that chunk; a
    // line that two chunks carried, and the last line that no LF ends, is a view of the splitter's
    // own buffer, which the next such line is written over from its first byte. So a connector that
    // keeps the Buffers it is given keeps views, and what they show later can be another line.
    const asText = (line: Buffer | null): string | null =>
      line === null ? null : line.toString("latin1");
    /** Four lines of five bytes, each cut by the end of a chunk: every one is carried (the last has no LF). */
    const CARRIED = ["alp", "ha\nbra", "vo\ndel", "ta\ngam", "ma"].map(latin1);
    const LINES = ["alpha", "bravo", "delta", "gamma"];

    it("is a view of the splitter's own buffer for a line that chunks carried: a Buffer that is kept shows the last such line after end()", () => {
      const kept: Array<Buffer | null> = [];
      const decoded: Array<string | null> = [];
      // The carry is one buffer of maxLineBytes (64), allocated once: no line here makes it grow.
      const splitter = new LineSplitter(LIMITS, (line) => {
        // What a connector that keeps what it is given does, and what one that decodes it does.
        kept.push(line);
        decoded.push(asText(line));
      });

      for (const piece of CARRIED) splitter.push(piece);
      splitter.end();

      // Decoded during the call, the lines are what the file holds.
      expect(decoded).toEqual(LINES);
      // Kept as they were given, they are four views of one buffer, written over by each later line:
      // all of them show the last line now, and not one shows its own.
      expect(kept.map(asText)).toEqual(["gamma", "gamma", "gamma", "gamma"]);
    });

    it("is a view of the chunk for a line that lies whole in it: a Buffer that is kept follows the chunk when the caller writes over it", () => {
      const chunk = latin1("first\nsecond\n");
      const kept: Buffer[] = [];
      const splitter = new LineSplitter(LIMITS, (line) => {
        if (line !== null) kept.push(line);
      });

      splitter.push(chunk);
      splitter.end();

      // Nothing of the splitter writes over a chunk: the lines are intact while the caller leaves it alone.
      expect(kept.map(asText)).toEqual(["first", "second"]);
      // A caller that reads its next block into the same memory changes what was kept.
      chunk.fill("z");
      expect(kept.map(asText)).toEqual(["zzzzz", "zzzzzz"]);
    });

    it("is kept by decoding it or by copying it during the call: the lines are right after end(), whatever the chunks and the splitter do next", () => {
      const copies: Buffer[] = [];
      const texts: string[] = [];
      const splitter = new LineSplitter(LIMITS, (line) => {
        if (line === null) return;
        copies.push(Buffer.from(line));
        texts.push(line.toString("latin1"));
      });
      // The last piece holds a line whole, so that both kinds of view are among the lines.
      const pieces = [...CARRIED, latin1("\nwhole\n")];

      for (const piece of pieces) splitter.push(piece);
      splitter.end();
      for (const piece of pieces) piece.fill("z");

      expect(texts).toEqual([...LINES, "whole"]);
      expect(copies.map(asText)).toEqual([...LINES, "whole"]);
    });
  });

  describe("limits that are not numbers a limit can be", () => {
    it.each([
      [{ maxLines: -1, maxLineBytes: 10 }],
      [{ maxLines: Number.NaN, maxLineBytes: 10 }],
      [{ maxLines: 1.5, maxLineBytes: 10 }],
      [{ maxLines: 10, maxLineBytes: -1 }],
      [{ maxLines: 10, maxLineBytes: Number.NaN }],
      [{ maxLines: 10, maxLineBytes: Number.POSITIVE_INFINITY }],
    ])("%j is a RangeError", (limits) => {
      expect(() => new LineSplitter(limits, () => undefined)).toThrow(RangeError);
    });
  });
});

describe("tabFieldsOf", () => {
  const line = (text: string): Buffer => Buffer.from(text, "utf8");
  const wide = (...fields: string[]): Buffer => line(fields.join(TAB));

  describe("a line of the width", () => {
    it("gives the text of the fields asked for, in their order", () => {
      expect(tabFieldsOf(wide("a", "b", "c"), 3, [1, 3])).toEqual(["a", "c"]);
      expect(tabFieldsOf(wide("a", "b", "c"), 3, [1, 2, 3])).toEqual(["a", "b", "c"]);
      expect(tabFieldsOf(wide("a", "b", "c"), 3, [2])).toEqual(["b"]);
      expect(tabFieldsOf(wide("a", "b", "c"), 3, [])).toEqual([]);
      expect(tabFieldsOf(line("only"), 1, [1])).toEqual(["only"]);
    });

    it("gives empty fields as empty text, and an empty line of one field as one", () => {
      expect(tabFieldsOf(line(`${TAB}${TAB}`), 3, [1, 2, 3])).toEqual(["", "", ""]);
      expect(tabFieldsOf(line(`x${TAB}${TAB}${TAB}y`), 4, [2, 3])).toEqual(["", ""]);
      expect(tabFieldsOf(Buffer.alloc(0), 1, [1])).toEqual([""]);
    });

    it("decodes UTF-8, a four-byte character included, and keeps a byte order mark", () => {
      const bom = cp(0xfeff);
      const text = `${cp(0xe9)}t${cp(0xe9)}${TAB}${cp(0x1f600)}${TAB}${bom}x`;

      expect(tabFieldsOf(line(text), 3, [1, 2, 3])).toEqual([
        `${cp(0xe9)}t${cp(0xe9)}`,
        cp(0x1f600),
        `${bom}x`,
      ]);
    });

    it("has fields that hold any byte but a TAB, which is why a CR is left to the splitter", () => {
      expect(tabFieldsOf(line(`a${CR}${TAB}b${CR}`), 2, [1, 2])).toEqual([`a${CR}`, `b${CR}`]);
    });
  });

  describe("a line that is not of the width", () => {
    it("is null when it has fewer fields, or more", () => {
      expect(tabFieldsOf(wide("a", "b"), 3, [1])).toBeNull();
      expect(tabFieldsOf(wide("a", "b", "c", "d"), 3, [1])).toBeNull();
      expect(tabFieldsOf(Buffer.alloc(0), 2, [1])).toBeNull();
      expect(tabFieldsOf(line("no tab"), 2, [1])).toBeNull();
      expect(tabFieldsOf(line(`a${TAB}`), 1, [1])).toBeNull();
      expect(tabFieldsOf(line(`a${TAB}b${TAB}`), 2, [1])).toBeNull();
    });

    it("is null for a line of ten million TABs, at the cost of a glance", () => {
      const tabs = Buffer.alloc(10_000_000, 9);
      const start = process.hrtime.bigint();

      const found = [
        tabFieldsOf(tabs, 11, [1, 5, 11]),
        tabFieldsOf(tabs, 2, [1]),
        tabFieldsOf(tabs, 1, [1]),
      ];

      const took = Number(process.hrtime.bigint() - start) / 1e6;
      // Whether each is null: a result that is not would be a text of ten million characters.
      expect(found.map((result) => result === null)).toEqual([true, true, true]);
      expect(took).toBeLessThan(100);
    });

    it("is read in one pass whatever the field holds: a line of 20 MB of one field", () => {
      const big = Buffer.alloc(20_000_000, "q");
      const start = process.hrtime.bigint();

      const found = tabFieldsOf(big, 1, [1]);

      expect(found?.[0].length).toBe(20_000_000);
      expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(2_000);
    });
  });

  describe("what is decoded", () => {
    const BAD = [
      ["a lone continuation byte", [0x80]],
      ["a sequence that is cut", [0xc3]],
      ["an overlong form", [0xc0, 0x80]],
      ["a surrogate", [0xed, 0xa0, 0x80]],
      ["a byte that is never UTF-8", [0xff]],
      ["a code point above the last", [0xf4, 0x90, 0x80, 0x80]],
    ] as const;

    it.each(BAD)("%s in a field asked for is null", (_label, bytes) => {
      const bad = Buffer.concat([line(`ok${TAB}`), Buffer.from(bytes), line(`${TAB}ok`)]);

      expect(tabFieldsOf(bad, 3, [2])).toBeNull();
      expect(tabFieldsOf(bad, 3, [1, 2, 3])).toBeNull();
    });

    it.each(BAD)(
      "%s in a field that is not asked for is no matter, and is never decoded",
      (_label, bytes) => {
        const bad = Buffer.concat([line(`ok${TAB}`), Buffer.from(bytes), line(`${TAB}fine`)]);

        expect(tabFieldsOf(bad, 3, [1, 3])).toEqual(["ok", "fine"]);
        expect(tabFieldsOf(bad, 3, [])).toEqual([]);
      },
    );

    it("is null when a field is not UTF-8 even if every other is, wherever it lies in the line", () => {
      for (let bad = 1; bad <= 4; bad += 1) {
        const fields = [1, 2, 3, 4].map((number) =>
          number === bad ? Buffer.from([0xff]) : line(`f${number}`),
        );
        const joined = Buffer.concat(
          fields.flatMap((field, index) => (index === 0 ? [field] : [line(TAB), field])),
        );

        expect(tabFieldsOf(joined, 4, [1, 2, 3, 4])).toBeNull();
        expect(
          tabFieldsOf(
            joined,
            4,
            [1, 2, 3, 4].filter((number) => number !== bad),
          ),
        ).not.toBeNull();
      }
    });
  });

  describe("what the caller asks for that cannot be", () => {
    it.each([
      ["fields not in ascending order", [2, 1]],
      ["a field twice", [1, 1]],
      ["field 0", [0, 1]],
      ["a field past the width", [1, 4]],
      ["a field that is not a whole number", [1.5]],
    ])("%s is a RangeError, whatever the line", (_label, wanted) => {
      expect(() => tabFieldsOf(wide("a", "b", "c"), 3, wanted)).toThrow(RangeError);
      expect(() => tabFieldsOf(Buffer.alloc(0), 3, wanted)).toThrow(RangeError);
    });

    it.each([0, -1, 1.5, Number.NaN])("a width of %s is a RangeError", (width) => {
      expect(() => tabFieldsOf(line("a"), width, [])).toThrow(RangeError);
    });
  });
});

describe("compactDayText", () => {
  it.each([
    ["20240131", "2024-01-31"],
    ["20240229", "2024-02-29"],
    ["19991231", "1999-12-31"],
    ["20000101", "2000-01-01"],
    ["99991231", "9999-12-31"],
    // The year 0001 is a day that dayText takes, and years below 1000 follow its rule: none is added here.
    ["00010101", "0001-01-01"],
    ["09990615", "0999-06-15"],
  ])("%s is the day %s", (text, day) => {
    expect(compactDayText(text)).toBe(day);
  });

  it.each([
    ["a day that does not exist", "19800231"],
    ["a month 13", "20241301"],
    ["a month 00", "20240001"],
    ["a day 00", "20240100"],
    ["a day 32", "20240132"],
    ["a 29 February of a year that is not a leap one", "20230229"],
    ["the year 0000", "00000000"],
    ["a year 0000 that has a month and a day", "00000101"],
    ["seven digits", "2024013"],
    ["nine digits", "202401311"],
    ["a long run of digits", "1".repeat(1_000_000)],
    ["a blank before", " 20240131"],
    ["a blank after", "20240131 "],
    ["a blank inside", "2024 0131"],
    ["a line feed after", "20240131\n"],
    ["the day with dashes", "2024-01-31"],
    ["the day with slashes", "31/01/2024"],
    ["a letter", "2024013a"],
    ["a sign", "+2024013"],
    ["an empty text", ""],
    ["a text of blanks", "        "],
    [
      "digits that are not ASCII (Arabic-Indic)",
      [0x662, 0x660, 0x662, 0x664, 0x660, 0x661, 0x663, 0x661].map((code) => cp(code)).join(""),
    ],
    [
      "full-width digits, which a fold would turn into a day",
      [0xff12, 0xff10, 0xff12, 0xff14, 0xff10, 0xff11, 0xff13, 0xff11]
        .map((code) => cp(code))
        .join(""),
    ],
  ])("%s is null", (_label, text) => {
    expect(compactDayText(text)).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 20240131],
    ["a boolean", true],
    ["an object", { day: "20240131" }],
    ["an array", ["20240131"]],
    ["a Buffer", Buffer.from("20240131")],
  ])("%s is null", (_label, value) => {
    expect(compactDayText(value)).toBeNull();
  });
});

describe("the two NHTSA lists, end to end: a zip of text read as lines and fields", () => {
  const ROWS = 100_000;
  const OVERLONG_BYTES = 200_000;
  const LINE_LIMIT = 65_536;
  const FIELDS = 11;
  const WANTED = [1, 5, 6, 7, 8, 9, 10] as const;
  /** The rows that are not ordinary ones, by number. */
  const TWELVE_FIELDS = 25_000;
  const BAD_FIELD_11 = 50_000;
  const BAD_FIELD_8 = 60_000;
  const OVERLONG = 75_000;
  const crlf = (n: number): boolean => n % 20_000 === 7;
  const MAKES = ["ACME MOTORS", "BOLT AUTO", "CEDAR TRUCKS", "DELTA CYCLES", "EMBER VANS"];
  const year = (n: number): number => 1_990 + (n % 36);
  const day = (n: number): string =>
    `${2_000 + (n % 25)}${String(1 + (n % 12)).padStart(2, "0")}${String(1 + (n % 28)).padStart(2, "0")}`;
  const summary = (n: number): string =>
    `Invented summary of row ${n}: ${"lorem ipsum dolor sit amet ".repeat(12)}`;
  const fieldsOf = (n: number): string[] => [
    `INV${n}`,
    `P${(n % 7) + 1}`,
    `X${n % 13}`,
    `Y${n % 17}`,
    MAKES[n % MAKES.length],
    `MODEL ${n % 29}`,
    String(year(n)),
    `COMPONENT ${n % 31}`,
    day(n),
    day(n + 5),
    summary(n),
  ];
  const ZIP_LIMITS: ZipLimits = {
    maxEntries: 10,
    maxEntryBytes: 128 * MIB,
    maxTotalBytes: 128 * MIB,
  };

  /** The bytes of row `n`, with the line end that suits it, and what is wrong with it if anything. */
  function lineOfRow(n: number): Buffer {
    const fields = fieldsOf(n);
    const end = crlf(n) ? `${CR}${LF}` : LF;
    if (n === TWELVE_FIELDS)
      return Buffer.from(`${[...fields, "a twelfth field"].join(TAB)}${end}`);
    if (n === BAD_FIELD_11) {
      return Buffer.concat([
        Buffer.from(`${fields.slice(0, 10).join(TAB)}${TAB}`),
        Buffer.from([0xff, 0xfe, 0xc3]),
        Buffer.from(` its tail${end}`),
      ]);
    }
    if (n === BAD_FIELD_8) {
      return Buffer.concat([
        Buffer.from(`${fields.slice(0, 7).join(TAB)}${TAB}`),
        Buffer.from([0xff, 0xfe, 0xc3]),
        Buffer.from(`${TAB}${fields.slice(8).join(TAB)}${end}`),
      ]);
    }
    if (n === OVERLONG) {
      return Buffer.from(`${[...fields.slice(0, 10), "z".repeat(OVERLONG_BYTES)].join(TAB)}${end}`);
    }
    return Buffer.from(`${fields.join(TAB)}${end}`);
  }

  let zip: Buffer;
  let inflatedBytes = 0;
  let expectedYearSum = 0;

  beforeAll(() => {
    const parts: Buffer[] = [];
    for (let n = 0; n < ROWS; n += 1) {
      parts.push(lineOfRow(n));
      if (n !== TWELVE_FIELDS && n !== BAD_FIELD_8 && n !== OVERLONG) expectedYearSum += year(n);
    }
    // The last line has no LF.
    const last = parts.pop() as Buffer;
    parts.push(last.subarray(0, last.length - 1));
    const data = Buffer.concat(parts);
    inflatedBytes = data.length;
    zip = writeZip([{ name: "FLAT.txt", data }]);
  }, 120_000);

  it("is about 40 MB inflated, in a zip of a deflated entry", () => {
    expect(inflatedBytes).toBeGreaterThan(38_000_000);
    expect(inflatedBytes).toBeLessThan(60_000_000);
    expect(zip.length).toBeLessThan(inflatedBytes / 2);
  });

  it("streams it through the splitter and the fields: the counts, no field 11 decoded, a memory that does not grow with it, within 20 seconds", async () => {
    const gc = collector();
    await settle(gc);
    const startHeap = process.memoryUsage().heapUsed;
    const startLive = liveBytes();
    let heapGrowth = 0;
    let liveGrowth = 0;
    let chunks = 0;
    let overlong = 0;
    let readable = 0;
    let endsInCr = 0;
    let yearSum = 0;
    let lastId = -1;
    let outOfOrder = 0;
    const unreadable: string[] = [];
    const makes = new Map<string, number>();
    const splitter = new LineSplitter(
      { maxLines: 1_000_000, maxLineBytes: LINE_LIMIT },
      (bytes) => {
        if (bytes === null) {
          overlong += 1;
          return;
        }
        if (bytes[bytes.length - 1] === 13) endsInCr += 1;
        const fields = tabFieldsOf(bytes, FIELDS, WANTED);
        if (fields === null) {
          // The first field is read from the bytes, as a line that cannot be read still has an id.
          unreadable.push(Buffer.from(bytes.subarray(0, bytes.indexOf(9))).toString("utf8"));
          return;
        }
        readable += 1;
        const id = Number(fields[0].slice(3));
        if (id <= lastId) outOfOrder += 1;
        lastId = id;
        yearSum += Number(fields[3]);
        makes.set(fields[1], (makes.get(fields[1]) ?? 0) + 1);
      },
    );
    const began = Date.now();

    const result = await streamZipEntry(
      zip,
      () => true,
      ZIP_LIMITS,
      (chunk) => {
        chunks += 1;
        heapGrowth = Math.max(heapGrowth, process.memoryUsage().heapUsed - startHeap);
        if (chunks % 64 === 0) {
          gc();
          liveGrowth = Math.max(liveGrowth, liveBytes() - startLive);
        }
        splitter.push(chunk);
      },
    );
    splitter.end();
    const took = Date.now() - began;

    expect(result).toEqual({ name: "FLAT.txt", bytes: inflatedBytes });
    expect(splitter.lines).toBe(ROWS);
    expect(overlong).toBe(1);
    // The row with a twelfth field, and the row with bytes that are no UTF-8 in field 8, cannot be read.
    expect(unreadable).toEqual([`INV${TWELVE_FIELDS}`, `INV${BAD_FIELD_8}`]);
    // The row with such bytes in field 11 is read: field 11 is never decoded.
    expect(readable).toBe(ROWS - 3);
    expect(lastId).toBe(ROWS - 1);
    expect(outOfOrder).toBe(0);
    expect(endsInCr).toBe(0);
    expect(yearSum).toBe(expectedYearSum);
    expect([...makes.values()].reduce((a, b) => a + b, 0)).toBe(ROWS - 3);
    expect([...makes.keys()].sort()).toEqual([...MAKES].sort());
    expect(took).toBeLessThan(20_000);
    expect(heapGrowth).toBeLessThan(60 * MIB);
    expect(liveGrowth).toBeLessThan(24 * MIB);
  }, 120_000);

  it("stops at the limit of lines: the zip read fails with the very error the splitter threw", async () => {
    const splitter = new LineSplitter(
      { maxLines: 1_000, maxLineBytes: LINE_LIMIT },
      () => undefined,
    );
    let thrown: unknown;
    let chunks = 0;
    const began = Date.now();

    const rejection = await streamZipEntry(
      zip,
      () => true,
      ZIP_LIMITS,
      (chunk) => {
        chunks += 1;
        try {
          splitter.push(chunk);
        } catch (error) {
          thrown = error;
          throw error;
        }
      },
    ).then(
      () => {
        throw new Error("The read did not fail");
      },
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(BodyTooLargeError);
    expect(rejection).toBe(thrown);
    expect(rejection).not.toBeInstanceOf(ZipError);
    expect(splitter.lines).toBe(1_000);
    // Most of the 40 MB was never inflated.
    expect(chunks).toBeLessThan(50);
    expect(Date.now() - began).toBeLessThan(5_000);
  }, 60_000);

  it("a zip whose data is cut fails as corrupt after the lines before the cut were given", async () => {
    const data = Buffer.from(
      `${Array.from({ length: 5_000 }, (_, n) => fieldsOf(n).join(TAB)).join(LF)}${LF}`,
    );
    const deflated = zlib.deflateRawSync(data);
    const flawed = Buffer.from(writeZip([{ name: "FLAT.txt", data }]));
    // The compressed size of the directory is made smaller: the stream is cut.
    const central = flawed.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    flawed.writeUInt32LE(deflated.length - 40, central + 20);
    let lines = 0;
    const splitter = new LineSplitter({ maxLines: 10_000, maxLineBytes: LINE_LIMIT }, () => {
      lines += 1;
    });

    await expect(
      streamZipEntry(
        flawed,
        () => true,
        ZIP_LIMITS,
        (chunk) => splitter.push(chunk),
      ),
    ).rejects.toMatchObject({ code: "corrupt" });

    expect(lines).toBeGreaterThan(0);
    expect(lines).toBeLessThan(5_000);
  });
});
