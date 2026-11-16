/**
 * The count of what the streams of a PDF inflate to, before the PDF library sees the file
 * (pdfStreams.ts). The limits here are small, so that a file that passes them is small too.
 */
import zlib from "node:zlib";
import {
  type PdfScanStats,
  type PdfStreamOptions,
  WORK_FLOOR_BYTES,
  WORK_PER_FILE_BYTE,
  WORK_PER_STREAM_BYTES,
  checkPdfStreams,
  decodeAscii85,
  decodeAsciiHex,
} from "../pdfStreams";

const KIB = 1024;
const MIB = 1024 * KIB;

const LIMITS: PdfStreamOptions = {
  maxStreamBytes: 1 * MIB,
  maxTotalBytes: 2 * MIB,
  timeoutMs: 20_000,
};

/** Deflate data with the zlib header, as a FlateDecode stream holds it. */
const deflate = (size: number, byte = 0x20) =>
  zlib.deflateSync(Buffer.alloc(size, byte), { level: 9 });

/** A PDF of the objects given, each a dictionary and the data of its stream. */
function pdfOf(objects: Array<{ dictionary: string; data?: Buffer } | string>): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.7\n", "latin1")];
  objects.forEach((object, index) => {
    if (typeof object === "string") {
      parts.push(Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "latin1"));
      return;
    }
    const data = object.data ?? Buffer.alloc(0);
    const dictionary = object.dictionary.replace("LENGTH", String(data.length));
    parts.push(
      Buffer.from(`${index + 1} 0 obj\n${dictionary}\nstream\n`, "latin1"),
      data,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    );
  });
  parts.push(Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));
  return Buffer.concat(parts);
}

/**
 * A clock that does not move. The tests that count work (the budget, the pauses) must not depend on
 * how long a slow runner takes to do it: on CI with coverage a file of several megabytes outlasted
 * the 20 seconds of LIMITS, and the count was refused for time instead of for work.
 */
const stoppedClock = () => 0;

const check = (body: Buffer, over: Partial<PdfStreamOptions> = {}) =>
  checkPdfStreams(body, { ...LIMITS, ...over });

describe("checkPdfStreams", () => {
  describe("a file that fits", () => {
    it("is a file with no streams", async () => {
      expect(await check(Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\n"))).toBe("fits");
    });

    it("is a file whose streams inflate to no more than the limits, one by one and together", async () => {
      const body = pdfOf([
        { dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data: deflate(1 * MIB) },
        { dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data: deflate(1 * MIB) },
      ]);
      expect(await check(body)).toBe("fits");
    });

    it("does not inflate a stream with no filter, or with one that is not FlateDecode", async () => {
      const body = pdfOf([
        { dictionary: "<< /Length LENGTH >>", data: deflate(4 * MIB) },
        { dictionary: "<< /Length LENGTH /Filter /DCTDecode >>", data: deflate(4 * MIB) },
        { dictionary: "<< /Length LENGTH /Filter /LZWDecode >>", data: deflate(4 * MIB) },
      ]);
      expect(await check(body)).toBe("fits");
    });

    it("counts nothing for a stream whose header the library refuses too", async () => {
      // 0x78 0x9d fails the check that the two bytes make a multiple of 31.
      const data = deflate(4 * MIB);
      data[1] = 0x9d;
      const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data }]);
      expect(await check(body)).toBe("fits");
    });
  });

  describe("a file that is too big", () => {
    it("is one with a stream that inflates past the limit of a stream", async () => {
      const body = pdfOf([
        { dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data: deflate(1 * MIB + 1) },
      ]);
      expect(body.length).toBeLessThan(8 * KIB);
      expect(await check(body)).toBe("too_big");
    });

    it("is one whose streams together inflate past the limit of the file", async () => {
      const each = { dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data: deflate(MIB) };
      expect(await check(pdfOf([each, each]))).toBe("fits");
      expect(await check(pdfOf([each, each, each]))).toBe("too_big");
    });

    it.each([
      ["a filter array", "[/FlateDecode]"],
      ["the short name", "/Fl"],
      ["a name written with escapes", "/Fl#61teDecode"],
      ["a filter array with a filter after it", "[/FlateDecode /DCTDecode]"],
    ])("finds the filter written as %s", async (_label, filter) => {
      const body = pdfOf([
        { dictionary: `<< /Length LENGTH /Filter ${filter} >>`, data: deflate(2 * MIB) },
      ]);
      expect(await check(body)).toBe("too_big");
    });

    it("finds an object stream and a cross-reference stream", async () => {
      for (const type of ["/ObjStm /N 1 /First 4", "/XRef /Size 3 /W [1 2 1]"]) {
        const body = pdfOf([
          {
            dictionary: `<< /Type ${type} /Length LENGTH /Filter /FlateDecode >>`,
            data: deflate(2 * MIB),
          },
        ]);
        expect(await check(body)).toBe("too_big");
      }
    });

    it("takes the filter as the library does: the last of two entries, and `/F` before `/Filter`", async () => {
      for (const entries of [
        "/Filter /DCTDecode /Filter /FlateDecode",
        "/F /FlateDecode /Filter /DCTDecode",
      ]) {
        const body = pdfOf([
          { dictionary: `<< /Length LENGTH ${entries} >>`, data: deflate(2 * MIB) },
        ]);
        expect(await check(body)).toBe("too_big");
      }
    });

    it("reads the dictionary of the stream, not a dictionary inside it", async () => {
      const body = pdfOf([
        {
          dictionary:
            "<< /DecodeParms << /Filter /ASCIIHexDecode >> /Length LENGTH /Filter /FlateDecode >>",
          data: deflate(2 * MIB),
        },
      ]);
      expect(await check(body)).toBe("too_big");
    });

    it("inflates a FlateDecode that is undone after another FlateDecode", async () => {
      // Inflated once, the data is 2 KiB or so; inflated again, it is 2 MiB.
      const twice = zlib.deflateSync(deflate(2 * MIB));
      const body = pdfOf([
        { dictionary: "<< /Length LENGTH /Filter [/FlateDecode /FlateDecode] >>", data: twice },
      ]);
      expect(await check(body)).toBe("too_big");
    });

    it("decodes ASCIIHexDecode and ASCII85Decode in front of a FlateDecode", async () => {
      const data = deflate(2 * MIB);
      const hex = Buffer.from(`${data.toString("hex")}>`, "latin1");
      expect(
        await check(
          pdfOf([{ dictionary: "<< /Length LENGTH /Filter [/AHx /FlateDecode] >>", data: hex }]),
        ),
      ).toBe("too_big");
      const a85 = Buffer.from(`${encodeAscii85(data)}~>`, "latin1");
      expect(
        await check(
          pdfOf([{ dictionary: "<< /Length LENGTH /Filter [/ASCII85Decode /Fl] >>", data: a85 }]),
        ),
      ).toBe("too_big");
    });

    it("reads a length that is an object of its own", async () => {
      // The data holds the word `endstream`, so only the length finds its end, as the library does.
      const head = Buffer.from([0x78, 0xda]);
      const stored = Buffer.from("\x00\x09\x00\xf6\xffendstream", "latin1");
      const rest = zlib.deflateRawSync(Buffer.alloc(2 * MIB, 0x20), { level: 9 });
      const data = Buffer.concat([head, stored, rest]);
      const body = pdfOf([
        { dictionary: "<< /Length 2 0 R /Filter /FlateDecode >>", data },
        String(data.length),
      ]);
      expect(await check(body)).toBe("too_big");
    });

    it("follows a filter that is an object of its own, or a name of the array that is", async () => {
      for (const [filter, object] of [
        ["2 0 R", "/FlateDecode"],
        ["2 0 R", "[/FlateDecode]"],
        ["[2 0 R]", "/FlateDecode"],
      ]) {
        const body = pdfOf([
          { dictionary: `<< /Length LENGTH /Filter ${filter} >>`, data: deflate(2 * MIB) },
          object,
        ]);
        expect(await check(body)).toBe("too_big");
      }
    });

    it("counts deflate data that reaches before its start, which the library reads as zeros", async () => {
      const raw = zlib.deflateRawSync(Buffer.alloc(2 * MIB), {
        level: 9,
        dictionary: Buffer.alloc(32 * KIB),
      });
      const data = Buffer.concat([Buffer.from([0x78, 0xda]), raw]);
      const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data }]);
      expect(await check(body)).toBe("too_big");
    });

    it("counts a stream whose data ends early, as far as it goes", async () => {
      const full = deflate(4 * MIB);
      const body = pdfOf([
        {
          dictionary: "<< /Length LENGTH /Filter /FlateDecode >>",
          data: full.subarray(0, Math.floor(full.length * 0.9)),
        },
      ]);
      expect(await check(body)).toBe("too_big");
    });

    it("counts what comes before a fault in the data", async () => {
      // Blocks that are not the last, then a block of the type that does not exist (11), which
      // zlib refuses: what came before it still counts.
      const raw = zlib.deflateRawSync(Buffer.alloc(900 * KIB, 0x20), {
        level: 9,
        finishFlush: zlib.constants.Z_SYNC_FLUSH,
      });
      const data = Buffer.concat([Buffer.from([0x78, 0xda]), raw, Buffer.from([0x07, 0, 0, 0])]);
      const each = { dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data };
      expect(() => zlib.inflateSync(data)).toThrow();
      expect(await check(pdfOf([each, each]))).toBe("fits");
      expect(await check(pdfOf([each, each, each]))).toBe("too_big");
    });
  });

  describe("the work", () => {
    it("gives up when the caller does", async () => {
      const controller = new AbortController();
      controller.abort();
      const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter /Fl >>", data: deflate(KIB) }]);
      expect(await check(body, { signal: controller.signal })).toBe("aborted");
    });

    it("gives up when the time is up", async () => {
      let clock = 0;
      const body = pdfOf(
        Array.from({ length: 50 }, () => ({
          dictionary: "<< /Length LENGTH /Filter /Fl >>",
          data: deflate(KIB),
        })),
      );
      const now = () => (clock += 10);
      expect(await check(body, { timeoutMs: 100, now })).toBe("too_slow");
    });

    it("does not search to the end of the file for each `<` that a dictionary leaves open", async () => {
      const body = Buffer.concat([
        Buffer.from("%PDF-1.7\n", "latin1"),
        Buffer.from("1 0 obj\n<< /A < >>\nstream\n".repeat(16 * KIB), "latin1"),
      ]);
      const started = Date.now();
      expect(await check(body)).toBe("fits");
      expect(Date.now() - started).toBeLessThan(10_000);
    });

    it("does not search the same bytes again for each word `stream` that opens nothing", async () => {
      // Half a megabyte of `stream` words with no object: a search back from each one to the start
      // of the file would take minutes.
      const body = Buffer.concat([
        Buffer.from("%PDF-1.7\n1 0 obj\n", "latin1"),
        Buffer.from(" stream\n".repeat(64 * KIB), "latin1"),
      ]);
      const started = Date.now();
      expect(await check(body)).toBe("fits");
      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });
});

/** A stats object to be filled by the count. */
const statsOf = (): PdfScanStats => ({
  work: 0,
  budget: 0,
  pauses: 0,
  longestSlice: 0,
  streams: 0,
});

/** Raw deflate data (no zlib header) that inflates to `size` spaces. */
const rawDeflate = (size: number) => zlib.deflateRawSync(Buffer.alloc(size, 0x20), { level: 9 });

/** A stored block that is not the last, with a length of 0 and a check of 0 (not 0xffff). */
const EMPTY_STORED_BLOCK = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

describe("checkPdfStreams: what the library reads that a quick look would miss", () => {
  describe("deflate data that zlib refuses", () => {
    it("counts the data after an empty stored block at the start at the most deflate gives, since the library reads it", async () => {
      const data = Buffer.concat([
        Buffer.from([0x78, 0x9c]),
        EMPTY_STORED_BLOCK,
        rawDeflate(4 * MIB),
      ]);
      expect(() => zlib.inflateSync(data)).toThrow();
      const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data }]);
      expect(await check(body)).toBe("too_big");
    });

    it("counts the data after an empty stored block that follows a valid block", async () => {
      const valid = zlib.deflateRawSync(Buffer.from("Example Ltd"), {
        finishFlush: zlib.constants.Z_SYNC_FLUSH,
      });
      const data = Buffer.concat([
        Buffer.from([0x78, 0x9c]),
        valid,
        EMPTY_STORED_BLOCK,
        rawDeflate(4 * MIB),
      ]);
      const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data }]);
      expect(await check(body)).toBe("too_big");
    });

    it("costs a refusal of a few bytes no more than those bytes could give", async () => {
      const data = Buffer.concat([
        Buffer.from([0x78, 0x9c]),
        EMPTY_STORED_BLOCK,
        Buffer.from("abc"),
      ]);
      const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data }]);
      expect(await check(body)).toBe("fits");
    });
  });

  describe("a dictionary of any length", () => {
    it.each([
      ["a string", `/Pad (${"x".repeat(70 * KIB)})`],
      ["many names", `/Pad [${"/a ".repeat(100 * KIB)}]`],
      ["a long comment", `%${"x".repeat(70 * KIB)}\n`],
    ])("is read when it holds %s past 64 KiB", async (_label, padding) => {
      const body = pdfOf([
        {
          dictionary: `<< /Length LENGTH /Filter /FlateDecode ${padding} >>`,
          data: deflate(2 * MIB),
        },
      ]);
      expect(await check(body)).toBe("too_big");
    });

    it("reads a number of any length as the library does, and a long word as no number", async () => {
      // A run of digits that ends in a letter took a time that grew with the square of its length.
      const body = pdfOf([
        {
          dictionary: `<< /Length ${"0".repeat(100 * KIB)}LENGTH /Filter /FlateDecode /X ${"1".repeat(MIB)}x >>`,
          data: deflate(2 * MIB),
        },
      ]);
      expect(await check(body)).toBe("too_big");
    });

    it("does not take the word `stream` in a string or a comment for a stream, nor lose the stream after it", async () => {
      const objects = (data: Buffer) =>
        pdfOf([
          "<< /Title (the stream of data) /Subject (a stream\n) >>\n% a comment on a stream \n",
          { dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data },
        ]);
      expect(await check(objects(deflate(MIB)))).toBe("fits");
      expect(await check(objects(deflate(MIB + 1)))).toBe("too_big");
    });
  });

  it("finds an object whose number is written with any number of leading zeros, as the library reads it", async () => {
    const data = deflate(2 * MIB);
    const body = Buffer.concat([
      Buffer.from(`%PDF-1.7\n${"0".repeat(300)}1 0 obj\n`, "latin1"),
      Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
      data,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    ]);
    expect(await check(body)).toBe("too_big");
  });

  it("does not count what zlib refuses at the worst in a file that names /Encrypt, whose data is not deflate data before it is decrypted", async () => {
    // Random bytes that pass the check of the two header bytes, as a stream of an encrypted file
    // does about once in a thousand: zlib refuses them at once.
    const data = Buffer.concat([
      Buffer.from([0x78, 0x9c]),
      EMPTY_STORED_BLOCK,
      Buffer.alloc(64 * KIB, 0xa5),
    ]);
    const stream = { dictionary: "<< /Length LENGTH /Filter /FlateDecode >>", data };
    expect(await check(pdfOf([stream]))).toBe("too_big");
    expect(
      await check(pdfOf([stream, "<< /Encrypt 3 0 R >>", "<< /Filter /Standard /V 1 /R 2 >>"])),
    ).toBe("fits");
  });

  describe("a predictor", () => {
    const tiny = zlib.deflateSync(Buffer.from([0, 1, 2, 3, 4, 5]));
    const withParams = (entries: string, ...objects: string[]) =>
      pdfOf([{ dictionary: `<< /Length LENGTH ${entries} >>`, data: tiny }, ...objects]);

    it.each([
      ["a PNG predictor", "/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 1048576 >>"],
      [
        "a TIFF predictor with colors",
        "/Filter /Fl /DP << /Predictor 2 /Columns 262144 /Colors 3 >>",
      ],
      [
        "16 bits a component",
        "/Filter /Fl /DecodeParms << /Predictor 15 /Columns 524288 /BPC 16 >>",
      ],
      [
        "a predictor that is not a number",
        "/Filter /Fl /DecodeParms << /Predictor /Up /Columns 1048576 >>",
      ],
    ])("adds the rows the library writes: %s", async (_label, entries) => {
      expect(await check(withParams(entries))).toBe("too_big");
    });

    it("reads the parameters of a filter array by position, and through a reference", async () => {
      expect(
        await check(
          withParams(
            "/Filter [/AHx /Fl] /DecodeParms [null 2 0 R]",
            "<< /Predictor 10 /Columns 1048576 >>",
          ),
        ),
      ).toBe("too_big");
    });

    it.each([
      [
        "the row of an ordinary image",
        "/Filter /Fl /DecodeParms << /Predictor 15 /Colors 3 /Columns 1000 >>",
      ],
      ["no predictor", "/Filter /Fl /DecodeParms << /Predictor 1 /Columns 1048576 >>"],
      [
        "a predictor the library refuses",
        "/Filter /Fl /DecodeParms << /Predictor 7 /Columns 1048576 >>",
      ],
      [
        "a width the library wraps to below zero",
        "/Filter /Fl /DecodeParms << /Predictor 12 /Columns 3145728000 >>",
      ],
      [
        "parameters that are not an array for a filter array",
        "/Filter [/Fl] /DecodeParms << /Predictor 12 /Columns 1048576 >>",
      ],
    ])("adds nothing, as the library does, for %s", async (_label, entries) => {
      expect(await check(withParams(entries))).toBe("fits");
    });
  });

  it("refuses ASCII85 data that decodes to more than a stream may, before it is inflated", async () => {
    const data = Buffer.from(`${"z".repeat(400 * KIB)}~>`, "latin1");
    const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter [/A85 /Fl] >>", data }]);
    expect(await check(body)).toBe("too_big");
  });
});

describe("checkPdfStreams: the work on the event loop", () => {
  // These tests make the check read megabytes of dictionary on purpose. Alone they take well under
  // jest's 5 seconds, but in a full parallel run on a loaded machine (a CI runner, a developer's
  // laptop) two of them timed out although the code was right. The assertions are unchanged.
  jest.setTimeout(30_000);

  it("allows each file WORK_PER_FILE_BYTE times its length, plus WORK_FLOOR_BYTES", async () => {
    const body = pdfOf([{ dictionary: "<< /Length LENGTH /Filter /Fl >>", data: deflate(KIB) }]);
    const stats = statsOf();
    expect(await check(body, { stats, now: stoppedClock })).toBe("fits");
    expect(stats.budget).toBe(WORK_PER_FILE_BYTE * body.length + WORK_FLOOR_BYTES);
    expect([WORK_PER_FILE_BYTE, WORK_FLOOR_BYTES, WORK_PER_STREAM_BYTES]).toEqual([
      4,
      4 * MIB,
      MIB,
    ]);
  });

  it("keeps a file of many streams, each with its length in an object of its own, far below the budget", async () => {
    const objects: Array<{ dictionary: string; data: Buffer } | string> = [];
    for (let index = 0; index < 2000; index += 1) {
      const data = deflate(KIB, 0x41 + (index % 26));
      objects.push({
        dictionary: `<< /Length ${objects.length + 2} 0 R /Filter /FlateDecode >>`,
        data,
      });
      objects.push(String(data.length));
    }
    const body = pdfOf(objects);
    const stats = statsOf();
    expect(await check(body, { stats, now: stoppedClock })).toBe("fits");
    expect(stats.streams).toBe(2000);
    expect(stats.work).toBeLessThan(3 * body.length);
  });

  it("refuses a stream whose objects take more than WORK_PER_STREAM_BYTES to read", async () => {
    const body = pdfOf([
      { dictionary: "<< /Length 2 0 R /Filter /FlateDecode >>", data: deflate(KIB) },
      `[${"/a ".repeat(400 * KIB)}]`,
    ]);
    expect(await check(body)).toBe("too_slow");
  });

  it("refuses a file whose objects make it read more than its budget, and lets the process run meanwhile", async () => {
    // Each object holds the header of the next inside its array, so that reading one reads the
    // next 32 too; each stream names a different one as its length.
    const levels = 200;
    let chain = "";
    for (let level = 1; level <= levels; level += 1) {
      chain += `${level} 0 obj [ ${"/a ".repeat(1300)} `;
    }
    const parts = [`%PDF-1.7\n${chain}${"]".repeat(levels)}\nendobj\n`];
    for (let level = 1; level <= levels; level += 1) {
      parts.push(
        `${levels + level} 0 obj\n<< /Length ${level} 0 R >>\nstream\nabcd\nendstream\nendobj\n`,
      );
    }
    const body = Buffer.from(parts.join(""), "latin1");
    const stats = statsOf();
    expect(await check(body, { stats, now: stoppedClock })).toBe("too_slow");
    expect(stats.work).toBeGreaterThan(stats.budget);
    expect(stats.pauses).toBeGreaterThan(0);
  });

  it("charges the white space after the lengths of many streams that point into one long run of it", async () => {
    // Each length points past its own `endstream` into the same megabyte of spaces, which is not
    // followed by `endstream`: each stream reads the run again.
    const parts: string[] = ["%PDF-1.7\n"];
    const streams = 400;
    const each = `1 0 obj\n<< /Length LENGTH >>\nstream\nabcd\nendstream\nendobj\n`;
    const size = Buffer.byteLength(each.replace("LENGTH", "0000000"), "latin1");
    for (let index = 0; index < streams; index += 1) {
      // The run begins after the last stream; this one's data begins `start` bytes before it.
      const start = (streams - index) * size - each.indexOf("stream\n") - 7;
      parts.push(each.replace("LENGTH", String(start + 10).padStart(7, "0")));
    }
    parts.push(" ".repeat(MIB), "x");
    const body = Buffer.from(parts.join(""), "latin1");
    const stats = statsOf();
    expect(await check(body, { stats, now: stoppedClock })).toBe("too_slow");
    expect(stats.work).toBeGreaterThan(stats.budget);
  });

  describe("in a dictionary of several megabytes", () => {
    const body = pdfOf([
      {
        dictionary: `<< /Length LENGTH /Filter /FlateDecode /Pad [${"/a ".repeat(MIB)}] >>`,
        data: deflate(KIB),
      },
    ]);

    it("lets the rest of the process run every SLICE_WORK_BYTES at least", async () => {
      let ran = false;
      setImmediate(() => {
        ran = true;
      });
      const stats = statsOf();
      expect(await check(body, { stats, now: stoppedClock })).toBe("fits");
      expect(ran).toBe(true);
      expect(stats.pauses).toBeGreaterThanOrEqual(2);
    });

    it("gives up when the caller does, in the middle of the dictionary", async () => {
      const controller = new AbortController();
      setImmediate(() => controller.abort());
      expect(await check(body, { signal: controller.signal })).toBe("aborted");
    });

    it("gives up when the time is up, in the middle of the dictionary", async () => {
      let clock = 0;
      const now = () => (clock += 1);
      expect(await check(body, { timeoutMs: 1_000, now })).toBe("too_slow");
    });
  });
});

describe("decodeAsciiHex", () => {
  it("passes over white space, ends at `>` and pads a lone last digit with 0", () => {
    expect(decodeAsciiHex(Buffer.from("48 65\n6c6C 6f>ff"))).toEqual(Buffer.from("Hello"));
    expect(decodeAsciiHex(Buffer.from("4"))).toEqual(Buffer.from([0x40]));
  });
});

describe("decodeAscii85", () => {
  it("reads groups of five, `z` as four zeros, and a short last group", () => {
    const bytes = Buffer.from([0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(decodeAscii85(Buffer.from(`${encodeAscii85(bytes)}~>`, "latin1"))).toEqual(bytes);
  });
});

/** ASCII85 of `data`, with `z` for a group of four zeros. */
function encodeAscii85(data: Buffer): string {
  let out = "";
  for (let index = 0; index < data.length; index += 4) {
    const group = data.subarray(index, index + 4);
    const padded = Buffer.concat([group, Buffer.alloc(4 - group.length)]);
    let value = padded.readUInt32BE(0);
    if (group.length === 4 && value === 0) {
      out += "z";
      continue;
    }
    const digits: string[] = [];
    for (let position = 0; position < 5; position += 1) {
      digits.unshift(String.fromCharCode((value % 85) + 33));
      value = Math.floor(value / 85);
    }
    out += digits.slice(0, group.length + 1).join("");
  }
  return out;
}
