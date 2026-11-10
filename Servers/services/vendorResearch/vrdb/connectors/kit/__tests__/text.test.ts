/**
 * The text of a downloaded file (kit/text.ts): the bytes of one file of a download, decoded as the
 * page reader decodes a page, with a byte order mark taken off, and a file that is not there is
 * not the list.
 */
import { decodeBody } from "../../../../../webResearch/readPage";
import { NotTheListError } from "../../types";
import type { Fetched } from "../fileConnector";
import { textOf } from "../text";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const fetchedOf = (
  files: ReadonlyArray<[Buffer | string, string]>,
  over: Partial<Fetched> = {},
): Fetched => ({
  buffers: files.map(([body]) => (Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8"))),
  contentTypes: files.map(([, contentType]) => contentType),
  etag: null,
  lastModified: null,
  bytes: files.reduce((sum, [body]) => sum + Buffer.byteLength(body), 0),
  ...over,
});

const failureOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("textOf", () => {
  describe("the charset", () => {
    it("is UTF-8 when nothing says another", () => {
      const fetched = fetchedOf([[`a${cp(0xe9)}${cp(0x1f600)}`, "text/csv"]]);
      expect(textOf(fetched, 0)).toBe(`a${cp(0xe9)}${cp(0x1f600)}`);
    });

    it("is UTF-8 for a file that has no Content-Type", () => {
      expect(textOf(fetchedOf([["abc", ""]]), 0)).toBe("abc");
    });

    it("is the one that the Content-Type names, whatever its case and its place among the parameters", () => {
      const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
      for (const contentType of [
        "text/csv; charset=windows-1252",
        "text/csv; charset=ISO-8859-1",
        'text/csv; format=x; charset="windows-1252"',
        "TEXT/CSV;CHARSET=Windows-1252",
      ]) {
        expect(textOf(fetchedOf([[latin1, contentType]]), 0)).toBe(`caf${cp(0xe9)}`);
      }
    });

    it("is the one that a meta tag of an HTML file names, when the header names none", () => {
      const html = Buffer.concat([
        Buffer.from('<html><head><meta charset="windows-1252"></head><body>caf'),
        Buffer.from([0xe9]),
        Buffer.from("</body></html>"),
      ]);
      expect(textOf(fetchedOf([[html, "text/html"]]), 0)).toContain(`caf${cp(0xe9)}`);
    });

    it("passes over a charset that is not known, and reads UTF-8", () => {
      expect(textOf(fetchedOf([["abc", "text/csv; charset=no-such-charset"]]), 0)).toBe("abc");
    });

    it("reads UTF-16 when the Content-Type says so", () => {
      const body = Buffer.from(`id,name${cp(0xe9)}`, "utf16le");
      expect(textOf(fetchedOf([[body, "text/csv; charset=utf-16le"]]), 0)).toBe(
        `id,name${cp(0xe9)}`,
      );
    });

    it("turns a byte that is not valid into U+FFFD, and does not throw", () => {
      const body = Buffer.from([0x61, 0xff, 0xfe, 0x62, 0xc3]);
      const text = textOf(fetchedOf([[body, "text/csv"]]), 0);
      expect(text.startsWith("a")).toBe(true);
      expect(text).toContain(cp(0xfffd));
      expect(text).toContain("b");
    });

    it("is what the page reader makes of the same bytes: one decoder for the downloads and the pages", () => {
      const samples: Array<[Buffer, string]> = [
        [Buffer.from(`x${cp(0xe9)}`), "text/csv"],
        [Buffer.from([0x78, 0xe9]), "text/csv; charset=windows-1252"],
        [Buffer.from([0xef, 0xbb, 0xbf, 0x78]), "text/csv"],
        [Buffer.from([0x78, 0xff, 0x79]), "application/json"],
      ];
      for (const [body, contentType] of samples) {
        expect(textOf(fetchedOf([[body, contentType]]), 0)).toBe(
          decodeBody(body, contentType).replace(/^\u{FEFF}+/u, ""),
        );
      }
    });
  });

  describe("the byte order mark", () => {
    it("is taken off when it is there", () => {
      const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("id,name\n")]);
      expect(textOf(fetchedOf([[body, "text/csv"]]), 0)).toBe("id,name\n");
    });

    it("is taken off when the decoder leaves it, as a second one after the first", () => {
      const mark = Buffer.from([0xef, 0xbb, 0xbf]);
      const body = Buffer.concat([mark, mark, Buffer.from("id\n")]);
      const text = textOf(fetchedOf([[body, "text/csv"]]), 0);
      expect(text).toBe("id\n");
      expect(text.charCodeAt(0)).not.toBe(0xfeff);
    });

    it("is taken off a UTF-16 file that begins with it", () => {
      const body = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("id\n", "utf16le")]);
      expect(textOf(fetchedOf([[body, "text/csv; charset=utf-16le"]]), 0)).toBe("id\n");
    });

    it("is left where it is not the first character: it is a character there", () => {
      const body = Buffer.from(`id${cp(0xfeff)}x`);
      expect(textOf(fetchedOf([[body, "text/csv"]]), 0)).toBe(`id${cp(0xfeff)}x`);
    });

    it("takes off nothing else: a blank, a quote or a zero-width space at the start stays", () => {
      for (const start of [" ", '"', cp(0x200b), "\n"]) {
        expect(textOf(fetchedOf([[`${start}id`, "text/csv"]]), 0)).toBe(`${start}id`);
      }
    });
  });

  describe("the file that is asked for", () => {
    const fetched = fetchedOf([
      ["first", "text/csv"],
      [Buffer.from([0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0xe9]), "text/csv; charset=windows-1252"],
    ]);

    it("is the one at the index, with the Content-Type of that file", () => {
      expect(textOf(fetched, 0)).toBe("first");
      expect(textOf(fetched, 1)).toBe(`second${cp(0xe9)}`);
    });

    it("is empty text for an empty file", () => {
      expect(textOf(fetchedOf([["", "text/csv"]]), 0)).toBe("");
    });

    it("is read as UTF-8 when the file has no Content-Type of its own in the list", () => {
      const short: Fetched = { ...fetched, contentTypes: ["text/csv"] };
      expect(textOf(short, 1)).toContain(cp(0xfffd));
    });

    it.each([
      ["below the first", -1],
      ["one past the last", 2],
      ["far past the last", 1_000_000],
      ["a fraction", 0.5],
      ["not a number", Number.NaN],
      ["infinite", Number.POSITIVE_INFINITY],
      ["minus infinity", Number.NEGATIVE_INFINITY],
    ])("is not the list when the index is %s", (_name, index) => {
      const failure = failureOf(() => textOf(fetched, index));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).toBe("The file is not the list.");
    });

    it("is not the list when the download has no file at all", () => {
      const none = fetchedOf([]);
      expect(failureOf(() => textOf(none, 0))).toBeInstanceOf(NotTheListError);
    });

    it("is not found by a name that an array has: the index must be a number", () => {
      const failure = failureOf(() => textOf(fetched, "length" as unknown as number));
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("leaves the bytes as they were", () => {
      const body = Buffer.from("abc");
      const before = Buffer.from(body);
      textOf(fetchedOf([[body, "text/csv"]]), 0);
      expect(body.equals(before)).toBe(true);
    });
  });

  it("reads a file of several megabytes in little time", () => {
    const body = Buffer.alloc(8 * 1024 * 1024, 0x61);
    const start = Date.now();
    const text = textOf(fetchedOf([[body, "text/csv"]]), 0);
    expect(text).toHaveLength(8 * 1024 * 1024);
    expect(Date.now() - start).toBeLessThan(10_000);
  });
});
