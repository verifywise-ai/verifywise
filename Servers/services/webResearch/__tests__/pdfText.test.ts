import { MAX_EXCERPT_CHARS, MAX_PAGE_PARTS } from "../pageText";
import {
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MIN_PDF_TEXT_CHARS,
  PDF_CONCURRENCY,
  PDF_TIMEOUT_MS,
  PDF_WORKER_HEAP_MB,
  PdfError,
  PdfRunner,
  RawPdf,
  WORKER_SOURCE,
  createWorkerRunner,
  looksLikePdf,
  pdfDateToIso,
  readPdf,
  reflowPdfPage,
} from "../pdfText";
import { getEventListeners } from "node:events";
import { appendFileSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePdf } from "./helpers/makePdf";

const asBody = (text: string) => Buffer.from(`%PDF-1.7\n${text}`, "latin1");

/** A text that is long enough to be a document, and has no lines of its own. */
const SENTENCE =
  "Acme processes personal data only on the documented instructions of the customer.";

const raw = (overrides: Partial<RawPdf> = {}): RawPdf => ({
  pages: [SENTENCE],
  total: 1,
  title: null,
  created: null,
  modified: null,
  ...overrides,
});

/** A runner that answers with `result` (or fails with it) and remembers what it was asked. */
function runnerOf(result: RawPdf | Error) {
  const run = jest.fn<ReturnType<PdfRunner>, Parameters<PdfRunner>>(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return run;
}

/** Breaks a paragraph into lines the way a typesetter does: as many words as fit in `width`. */
function wrap(paragraph: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of paragraph.split(" ")) {
    if (line !== "" && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

describe("looksLikePdf", () => {
  it("knows a file by its signature", () => {
    expect(looksLikePdf(Buffer.from("%PDF-1.4\n1 0 obj"))).toBe(true);
  });

  // The format allows junk before the header, within the first 1,024 bytes.
  it("finds the signature a little way in", () => {
    expect(looksLikePdf(Buffer.concat([Buffer.alloc(1000, " "), Buffer.from("%PDF-1.4")]))).toBe(
      true,
    );
  });

  it("does not look past the first 1,024 bytes", () => {
    expect(looksLikePdf(Buffer.concat([Buffer.alloc(1100, " "), Buffer.from("%PDF-1.4")]))).toBe(
      false,
    );
  });

  it.each([
    ["a page of HTML", "<!doctype html><title>PDF</title>"],
    ["an empty body", ""],
    ["a signature in lower case", "%pdf-1.4"],
    ["a signature that is cut short", "%PDF"],
  ])("refuses %s", (_name, body) => {
    expect(looksLikePdf(Buffer.from(body))).toBe(false);
  });
});

describe("pdfDateToIso", () => {
  it.each([
    ["a date and time in UTC", "D:20240115120000Z", "2024-01-15T12:00:00.000Z"],
    ["an offset with minutes", "D:20240301101500+01'00'", "2024-03-01T09:15:00.000Z"],
    ["a negative offset", "D:20240115120000-05'00'", "2024-01-15T17:00:00.000Z"],
    ["an offset without marks", "D:20240115120000+0100", "2024-01-15T11:00:00.000Z"],
    ["an offset of hours only", "D:20240115120000+02", "2024-01-15T10:00:00.000Z"],
    ["a time with no offset, taken as UTC", "D:20240115120000", "2024-01-15T12:00:00.000Z"],
    ["a date alone", "D:20240115", "2024-01-15T00:00:00.000Z"],
    ["a date without the prefix", "20240115120000Z", "2024-01-15T12:00:00.000Z"],
    ["a time without seconds", "D:202401151230Z", "2024-01-15T12:30:00.000Z"],
  ])("reads %s", (_name, value, expected) => {
    expect(pdfDateToIso(value)).toBe(expected);
  });

  it.each([
    ["a year alone", "D:2024"],
    ["a month alone", "D:202401"],
    ["a day that does not exist", "D:20240230120000Z"],
    ["a month that does not exist", "D:20241301"],
    ["text", "last Tuesday"],
    ["nothing", ""],
  ])("does not read %s", (_name, value) => {
    expect(pdfDateToIso(value)).toBeNull();
  });
});

describe("reflowPdfPage", () => {
  const FIRST =
    "This agreement is made between Acme Limited and the customer, and it governs the processing of personal data that Acme carries out on behalf of the customer in connection with the services.";
  const SECOND =
    "Acme will not use the customer content to train or improve its own machine learning models, and it will not disclose that content to any other party without a written instruction from the customer first.";

  it("joins the lines that the print wrapped into the paragraph they belong to", () => {
    const lines = [...wrap(FIRST, 72), ...wrap(SECOND, 72)];

    expect(reflowPdfPage(lines.join("\n"))).toBe(`${FIRST}\n\n${SECOND}`);
  });

  it("keeps a blank line of the page as the end of a paragraph", () => {
    const lines = [...wrap(FIRST, 72), "", ...wrap(SECOND, 72)];

    expect(reflowPdfPage(lines.join("\n"))).toBe(`${FIRST}\n\n${SECOND}`);
  });

  it("ends a paragraph at a blank line even when the line before it reaches the margin", () => {
    // Nothing but the blank line says that the second line ends a paragraph: it is full.
    const lines = [
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo",
      "foxtrot golf hotel india juliet kilo lima mike november oscar papa",
      "",
      "juliet kilo lima mike november oscar papa quebec romeo sierra tango",
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo",
    ];

    expect(reflowPdfPage(lines.join("\n"))).toBe(
      `${lines[0]} ${lines[1]}\n\n${lines[3]} ${lines[4]}`,
    );
  });

  describe("a line that stops short of the margin", () => {
    const FULL = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo";
    const SHORT = "delta echo foxtrot golf hotel india juliet kilo lima mike";

    it("ends its paragraph when the first word of the next line would have fitted", () => {
      const lines = [FULL, SHORT, "It is listed in the annex and changes from time to time"];

      expect(reflowPdfPage(lines.join("\n"))).toBe(`${FULL} ${SHORT}\n\n${lines[2]}`);
    });

    it("goes on when that word is too long to have fitted", () => {
      const lines = [
        FULL,
        SHORT,
        "Subprocessors are listed in the annex and change from time to time",
      ];

      expect(reflowPdfPage(lines.join("\n"))).toBe(`${FULL} ${SHORT} ${lines[2]}`);
    });
  });

  it("makes a short line of its own, a heading, a paragraph", () => {
    const lines = ["1. Use of customer content", ...wrap(FIRST, 72)];

    expect(reflowPdfPage(lines.join("\n"))).toBe(`1. Use of customer content\n\n${FIRST}`);
  });

  it.each([
    ["a bullet", "• Encryption at rest"],
    ["a dash", "- Encryption at rest"],
    ["a number", "2. Encryption at rest"],
    ["a section number", "2.1 Encryption at rest"],
    ["a letter in brackets", "(b) Encryption at rest"],
    ["a roman numeral", "(iv) Encryption at rest"],
  ])("starts a new paragraph at %s even when the line before it is full", (_name, item) => {
    const [first, second] = wrap(FIRST, 72);
    // The line before the item reaches the right margin, so only the marker can tell.
    const lines = [first, second, item];

    expect(reflowPdfPage(lines.join("\n"))).toBe(`${first} ${second}\n\n${item}`);
  });

  it("joins a word that the print broke at a hyphen without a space", () => {
    const lines = [
      "The list of approved sub-",
      "processors is kept on the website of Acme and changes to it are announced",
    ];

    expect(reflowPdfPage(lines.join("\n"))).toBe(
      "The list of approved sub-processors is kept on the website of Acme and changes to it are announced",
    );
  });

  it.each([
    [
      "a capital letter",
      "Baden-",
      "Württemberg and Bavaria and the other states fill the line",
      "Baden-Württemberg",
    ],
    [
      "a digit",
      "The disease that is known as COVID-",
      "19 spread across the world in the course of the year 2020",
      "COVID-19",
    ],
  ])("joins a word that was broken at a hyphen before %s as well", (_name, first, second, word) => {
    const joined = reflowPdfPage(`${first}\n${second}`);

    expect(joined).toContain(word);
  });

  it("puts a space after a hyphen that does not end a word", () => {
    // A dash with a space before it, and a hyphen after a digit, are not the break of a word.
    const lines = [
      "The standard is ISO 27001 as it was first published in the year 2013 -",
      "2022 was the year of its latest revision, which is known as version 2-",
      "3 of the standard and it changed the name of the whole standard again",
    ];

    expect(reflowPdfPage(lines.join("\n"))).toBe(
      "The standard is ISO 27001 as it was first published in the year 2013 - 2022 was the year of its latest revision, which is known as version 2- 3 of the standard and it changed the name of the whole standard again",
    );
  });

  it("does not join an item of a list to a line that ends in a hyphen", () => {
    const lines = [
      "The measures that the vendor takes include the following, all of them non-",
      "2. Encryption of the data at rest",
    ];

    expect(reflowPdfPage(lines.join("\n"))).toBe(
      "The measures that the vendor takes include the following, all of them non-\n\n2. Encryption of the data at rest",
    );
  });

  it("leaves a single line as it is", () => {
    expect(reflowPdfPage("Data Processing Agreement")).toBe("Data Processing Agreement");
  });

  it.each(["", "   ", "\n\n \n"])("gives nothing for a page with no text (%j)", (page) => {
    expect(reflowPdfPage(page)).toBe("");
  });

  it("keeps the cells of a table on their line", () => {
    const row = "Subprocessor\tPurpose\tLocation";

    expect(reflowPdfPage(row)).toBe("Subprocessor\tPurpose\tLocation");
  });
});

describe("readPdf", () => {
  describe("the text", () => {
    it("is the pages, one after another, each as paragraphs", async () => {
      const run = runnerOf(
        raw({
          pages: [
            `Data Processing Agreement\n${SENTENCE}`,
            `Annex 1\nThe sub-processors are listed in this annex and they change from time to time.`,
          ],
          total: 2,
        }),
      );

      const pdf = await readPdf(asBody("x"), { run });

      expect(pdf.text).toBe(
        `Data Processing Agreement\n\n${SENTENCE}\n\nAnnex 1\n\nThe sub-processors are listed in this annex and they change from time to time.`,
      );
      expect(pdf.pages).toBe(2);
    });

    it("counts the pages of the document, not the pages that were read", async () => {
      const run = runnerOf(raw({ pages: [SENTENCE], total: 240 }));

      expect((await readPdf(asBody("x"), { run })).pages).toBe(240);
    });

    // Print programs set "fi" as one glyph, which no search for "certification" would find.
    it("writes a ligature as the letters it stands for", async () => {
      const run = runnerOf(
        raw({ pages: ["The certiﬁcation and the ﬁne print of the oﬃce are in force."] }),
      );

      const pdf = await readPdf(asBody("x"), { run });

      expect(pdf.text).toBe("The certification and the fine print of the office are in force.");
    });

    it("is cleaned like any text a third party wrote", async () => {
      // A control character, a no-break space, a zero-width space, and an escape.
      const dirty = "Acme\u0000 keeps\u00a0logs\u200b for a year, then deletes them.\u001b";
      const run = runnerOf(raw({ pages: [dirty] }));

      const pdf = await readPdf(asBody("x"), { run });

      expect(pdf.text).toBe("Acme keeps logs\u200b for a year, then deletes them.");
    });

    it("keeps a trademark sign, so that the name of a vendor is still a word of its own", async () => {
      const run = runnerOf(
        raw({ pages: ["Acme\u2122 Platform is certified under ISO 27001 each year."] }),
      );

      expect((await readPdf(asBody("x"), { run })).text).toBe(
        "Acme\u2122 Platform is certified under ISO 27001 each year.",
      );
    });

    it("drops a soft hyphen, which the eye does not see and a search would trip on", async () => {
      const run = runnerOf(
        raw({ pages: ["The list of sub\u00adprocessors is kept up to date by Acme."] }),
      );

      expect((await readPdf(asBody("x"), { run })).text).toBe(
        "The list of subprocessors is kept up to date by Acme.",
      );
    });

    it("is cut at the most that a page can be shown in", async () => {
      const long = "word ".repeat(100_000);
      const run = runnerOf(raw({ pages: [long, long] }));

      const pdf = await readPdf(asBody("x"), { run });

      expect(pdf.text.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS * MAX_PAGE_PARTS);
      expect(pdf.text.length).toBeGreaterThan(MAX_EXCERPT_CHARS * (MAX_PAGE_PARTS - 1));
    });

    it("must hold some text: a scan with no text layer is not a page", async () => {
      const run = runnerOf(raw({ pages: ["", "  \n ", "12"], total: 3 }));

      await expect(readPdf(asBody("x"), { run })).rejects.toMatchObject({ reason: "no_text" });
      expect(MIN_PDF_TEXT_CHARS).toBeGreaterThan(2);
    });

    it("is enough at the shortest length that counts", async () => {
      const run = runnerOf(raw({ pages: ["a".repeat(MIN_PDF_TEXT_CHARS)] }));

      await expect(readPdf(asBody("x"), { run })).resolves.toMatchObject({
        text: "a".repeat(MIN_PDF_TEXT_CHARS),
      });
    });
  });

  describe("the title", () => {
    it("is the title the document gives itself", async () => {
      const run = runnerOf(raw({ title: "Acme Data Processing Addendum" }));

      expect((await readPdf(asBody("x"), { run })).title).toBe("Acme Data Processing Addendum");
    });

    it("is cleaned", async () => {
      const run = runnerOf(raw({ title: "  Acme\u0000   DPA \n" }));

      expect((await readPdf(asBody("x"), { run })).title).toBe("Acme DPA");
    });

    it.each([
      ["a file name", "dpa_final_v3.docx"],
      ["the name of the program", "Microsoft Word - dpa final.docx"],
      ["untitled", "Untitled"],
      ["a numbered untitled", "untitled-2"],
      ["document and a number", "Document1"],
      ["a presentation", "PowerPoint Presentation"],
      ["nothing", ""],
      ["a blank", "   "],
    ])("falls back to the name of the file when the document gives %s", async (_name, title) => {
      const run = runnerOf(raw({ title }));

      const pdf = await readPdf(asBody("x"), {
        run,
        url: "https://acme.com/legal/Acme_DPA-v3.pdf?download=1",
      });

      expect(pdf.title).toBe("Acme DPA v3");
    });

    it("reads a name of the file that is written with escapes", async () => {
      const run = runnerOf(raw());

      const pdf = await readPdf(asBody("x"), {
        run,
        url: "https://acme.com/files/Data%20Processing%20Addendum.PDF",
      });

      expect(pdf.title).toBe("Data Processing Addendum");
    });

    it("is empty when neither the document nor the address names it", async () => {
      const run = runnerOf(raw());

      expect((await readPdf(asBody("x"), { run, url: "https://acme.com/" })).title).toBe("");
      expect((await readPdf(asBody("x"), { run })).title).toBe("");
    });

    it("is cut to the length of any title", async () => {
      const run = runnerOf(raw({ title: "T".repeat(1000) }));

      expect((await readPdf(asBody("x"), { run })).title.length).toBeLessThanOrEqual(300);
    });
  });

  describe("the date", () => {
    const NOW = Date.parse("2026-10-28T12:00:00Z");

    it("is the later of the day it was made and the day it was last changed", async () => {
      const run = runnerOf(
        raw({ created: "D:20240115120000Z", modified: "D:20240301101500+01'00'" }),
      );

      const pdf = await readPdf(asBody("x"), { run, now: () => NOW });

      expect(pdf.publishedAt).toBe("2024-03-01T09:15:00.000Z");
    });

    it("is the day it was made when it was not changed", async () => {
      const run = runnerOf(raw({ created: "D:20240115120000Z" }));

      expect((await readPdf(asBody("x"), { run, now: () => NOW })).publishedAt).toBe(
        "2024-01-15T12:00:00.000Z",
      );
    });

    it("is the day it was changed when the day it was made is not readable", async () => {
      const run = runnerOf(raw({ created: "yesterday", modified: "D:20240301" }));

      expect((await readPdf(asBody("x"), { run, now: () => NOW })).publishedAt).toBe(
        "2024-03-01T00:00:00.000Z",
      );
    });

    it("is unknown when the document gives none", async () => {
      expect((await readPdf(asBody("x"), { run: runnerOf(raw()) })).publishedAt).toBeNull();
    });

    // A date in the future is the clock of whoever made the file; it must not make an old file new.
    it("is unknown when the date is in the future", async () => {
      const run = runnerOf(raw({ created: "D:20300101000000Z", modified: "D:20300601000000Z" }));

      expect((await readPdf(asBody("x"), { run, now: () => NOW })).publishedAt).toBeNull();
    });

    it("keeps the earlier date when the later one is in the future", async () => {
      const run = runnerOf(raw({ created: "D:20240115120000Z", modified: "D:20300601000000Z" }));

      expect((await readPdf(asBody("x"), { run, now: () => NOW })).publishedAt).toBe(
        "2024-01-15T12:00:00.000Z",
      );
    });

    it("allows a day ahead, for the time zones", async () => {
      const run = runnerOf(raw({ created: "D:20261029030000Z" }));

      expect((await readPdf(asBody("x"), { run, now: () => NOW })).publishedAt).toBe(
        "2026-10-29T03:00:00.000Z",
      );
    });

    it("is unknown when the date is from before the format existed", async () => {
      const run = runnerOf(raw({ created: "D:19700101000000Z" }));

      expect((await readPdf(asBody("x"), { run, now: () => NOW })).publishedAt).toBeNull();
    });
  });

  describe("what it asks of the runner", () => {
    it("is the body, the limits of the reader and no signal by default", async () => {
      const run = runnerOf(raw());
      const body = asBody("x");

      await readPdf(body, { run });

      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        body,
        {
          maxPages: 100,
          maxChars: MAX_EXCERPT_CHARS * MAX_PAGE_PARTS,
          timeoutMs: 20_000,
          heapMb: 256,
        },
        undefined,
      );
      expect([MAX_PDF_BYTES, MAX_PDF_PAGES, PDF_TIMEOUT_MS, PDF_WORKER_HEAP_MB]).toEqual([
        10_485_760, 100, 20_000, 256,
      ]);
    });

    it("hands on the signal", async () => {
      const run = runnerOf(raw());
      const { signal } = new AbortController();

      await readPdf(asBody("x"), { run, signal });

      expect(run.mock.calls[0][2]).toBe(signal);
    });

    it("does not run a body that is not a PDF", async () => {
      const run = runnerOf(raw());

      await expect(readPdf(Buffer.from("<html>"), { run })).rejects.toMatchObject({
        reason: "not_a_pdf",
      });
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe("what goes wrong", () => {
    it("is a PdfError with the reason the runner gave", async () => {
      const run = runnerOf(new PdfError("too_slow"));

      await expect(readPdf(asBody("x"), { run })).rejects.toMatchObject({
        name: "PdfError",
        reason: "too_slow",
      });
    });

    it("is a PdfError that is unreadable when the runner fails any other way", async () => {
      const run = runnerOf(new Error("the file at /srv/uploads/secret.pdf is damaged"));

      const error = await readPdf(asBody("x"), { run }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PdfError);
      expect(error).toMatchObject({ reason: "unreadable" });
      // The message is fixed: the text of a failure can hold a path or a piece of the file.
      expect((error as Error).message).not.toContain("secret");
    });

    it("is aborted when the signal was aborted already, and runs nothing", async () => {
      const run = runnerOf(raw());
      const controller = new AbortController();
      controller.abort();

      await expect(readPdf(asBody("x"), { run, signal: controller.signal })).rejects.toMatchObject({
        reason: "aborted",
      });
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe("how many it reads at the same time", () => {
    /** A runner whose calls stay open until the test lets them finish. */
    function gatedRunner() {
      const open: Array<() => void> = [];
      let running = 0;
      let most = 0;
      const run: PdfRunner = async () => {
        running += 1;
        most = Math.max(most, running);
        await new Promise<void>((resolve) => open.push(resolve));
        running -= 1;
        return raw();
      };
      return {
        run,
        open,
        most: () => most,
        running: () => running,
        /** Lets the oldest open call finish and waits for the others to move on. */
        async finishOne() {
          open.shift()?.();
          await new Promise((resolve) => setImmediate(resolve));
        },
      };
    }

    it("is at most two, and the others wait their turn", async () => {
      const gate = gatedRunner();
      const reads = Array.from({ length: 5 }, () => readPdf(asBody("x"), { run: gate.run }));
      await new Promise((resolve) => setImmediate(resolve));

      expect(PDF_CONCURRENCY).toBe(2);
      expect(gate.running()).toBe(2);
      for (let finished = 0; finished < 5; finished += 1) await gate.finishOne();
      await Promise.all(reads);

      expect(gate.most()).toBe(2);
      expect(gate.running()).toBe(0);
    });

    it("does not start a read that was aborted while it waited, and leaves the place to the next", async () => {
      const gate = gatedRunner();
      const first = readPdf(asBody("x"), { run: gate.run });
      const second = readPdf(asBody("x"), { run: gate.run });
      const controller = new AbortController();
      const waiting = readPdf(asBody("x"), { run: gate.run, signal: controller.signal });
      const last = readPdf(asBody("x"), { run: gate.run });
      await new Promise((resolve) => setImmediate(resolve));

      controller.abort();
      await expect(waiting).rejects.toMatchObject({ reason: "aborted" });
      await gate.finishOne();
      await new Promise((resolve) => setImmediate(resolve));
      // The place of the first went to the last, not to the read that gave up.
      expect(gate.running()).toBe(2);
      await gate.finishOne();
      await gate.finishOne();
      await Promise.all([first, second, last]);

      expect(gate.most()).toBe(2);
    });

    it("gives the place back when a read fails", async () => {
      const failing = runnerOf(new PdfError("too_slow"));
      const gate = gatedRunner();

      await readPdf(asBody("x"), { run: failing }).catch(() => undefined);
      await readPdf(asBody("x"), { run: failing }).catch(() => undefined);
      const reads = [
        readPdf(asBody("x"), { run: gate.run }),
        readPdf(asBody("x"), { run: gate.run }),
      ];
      await new Promise((resolve) => setImmediate(resolve));

      expect(gate.running()).toBe(2);
      await gate.finishOne();
      await gate.finishOne();
      await Promise.all(reads);
    });
  });
});

// These run the real library in a real thread. It is the one place where that is checked: the
// tests above hand `readPdf` a runner, and a runner cannot tell whether the library loads there.
describe("the worker that reads a PDF", () => {
  const LIMITS = { maxPages: 100, maxChars: 320_000, timeoutMs: 20_000, heapMb: 256 };

  const DPA = makePdf(
    [
      [
        "Data Processing Agreement",
        "This agreement is between Acme and the customer.",
        "1. Use of data",
        "We never use customer content to train models.",
      ],
      ["Annex 1", "Sub-processors are listed in Annex 3."],
    ],
    { Title: "Acme DPA", CreationDate: "D:20240115120000Z", ModDate: "D:20240301101500+01'00'" },
  );

  it("reads the text, the title and the dates of a document", async () => {
    const pdf = await readPdf(DPA, { now: () => Date.parse("2026-10-28T12:00:00Z") });

    expect(pdf.title).toBe("Acme DPA");
    expect(pdf.publishedAt).toBe("2024-03-01T09:15:00.000Z");
    expect(pdf.pages).toBe(2);
    expect(pdf.text).toContain("We never use customer content to train models.");
    expect(pdf.text).toContain("Sub-processors are listed in Annex 3.");
    expect(pdf.text.indexOf("Annex 1")).toBeGreaterThan(pdf.text.indexOf("train models"));
  });

  it("reads only the pages that it is allowed to, and says how many there are", async () => {
    const run = createWorkerRunner();

    const result = await run(DPA, { ...LIMITS, maxPages: 1 });

    expect(result.pages).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.pages[0]).toContain("train models");
  });

  it("stops adding pages once it has the text that can be shown", async () => {
    const run = createWorkerRunner();

    const result = await run(DPA, { ...LIMITS, maxChars: 10 });

    expect(result.pages).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  // What the library does with a file cannot be seen from outside, so the settings that wall it in
  // are pinned: a change to any of them is a decision, not an edit.
  it("reads a file with the library's evaluation of font programs off, and no system fonts", () => {
    expect(WORKER_SOURCE).toContain("isEvalSupported: false");
    expect(WORKER_SOURCE).toContain("useSystemFonts: false");
  });

  it("reads the pages it is told to and no more", () => {
    expect(WORKER_SOURCE).toContain("first: workerData.maxPages");
  });

  it("fails on a file that begins like a PDF and is not one", async () => {
    await expect(readPdf(asBody("this is not a document"))).rejects.toMatchObject({
      name: "PdfError",
      reason: "unreadable",
    });
  });

  describe("when the work goes wrong", () => {
    // Stand-ins for the script of the worker: what matters here is how the parent ends the work.
    const SPIN = "while (true) {}";
    const HOG = "const held = []; while (true) held.push(new Array(100000).fill('x'));";
    const EXIT = "process.exit(3);";
    const NOTHING = "";

    it("ends it at the time limit and says it was too slow", async () => {
      const run = createWorkerRunner(SPIN);

      await expect(run(DPA, { ...LIMITS, timeoutMs: 150 })).rejects.toMatchObject({
        reason: "too_slow",
      });
    });

    it("ends it when the memory limit is passed and says it was too big", async () => {
      const run = createWorkerRunner(HOG);

      await expect(run(DPA, { ...LIMITS, heapMb: 16 })).rejects.toMatchObject({
        reason: "too_big",
      });
    });

    // A thread that is not ended goes on burning a core, and nothing in the result shows it. This
    // one writes a mark every few milliseconds, so the mark stops when the thread does.
    describe("the thread", () => {
      /** The script of a thread that writes a mark to `file` every few milliseconds, for ever. */
      const beat = (file: string) => `
        const fs = require("node:fs");
        while (true) {
          fs.appendFileSync(${JSON.stringify(file)}, ".");
          const until = Date.now() + 5;
          while (Date.now() < until) {}
        }
      `;
      let folder: string;
      let marks: string;
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      /** Whether the thread has written anything in the last 150 ms. */
      const stillWriting = async () => {
        const before = statSync(marks).size;
        await pause(150);
        return statSync(marks).size > before;
      };

      beforeEach(() => {
        folder = mkdtempSync(join(tmpdir(), "pdf-marks-"));
        marks = join(folder, "marks");
        appendFileSync(marks, "");
      });

      afterEach(() => {
        rmSync(folder, { recursive: true, force: true });
      });

      it("is ended when the time is up", async () => {
        const run = createWorkerRunner(beat(marks));

        await expect(run(DPA, { ...LIMITS, timeoutMs: 300 })).rejects.toMatchObject({
          reason: "too_slow",
        });

        expect(statSync(marks).size).toBeGreaterThan(0);
        await pause(100);
        expect(await stillWriting()).toBe(false);
      });

      it("is ended when the caller gives up", async () => {
        const run = createWorkerRunner(beat(marks));
        const controller = new AbortController();
        const result = run(DPA, LIMITS, controller.signal);
        setTimeout(() => controller.abort(), 300);

        await expect(result).rejects.toMatchObject({ reason: "aborted" });

        await pause(100);
        expect(await stillWriting()).toBe(false);
      });
    });

    it("leaves no listener on the signal of the caller, whether the read ends or is cancelled", async () => {
      const controller = new AbortController();
      const { signal } = controller;

      await createWorkerRunner(EXIT)(DPA, LIMITS, signal).catch(() => undefined);
      expect(getEventListeners(signal, "abort")).toHaveLength(0);

      await createWorkerRunner(SPIN)(DPA, { ...LIMITS, timeoutMs: 100 }, signal).catch(
        () => undefined,
      );
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
    });

    it("ends it when the caller gives up", async () => {
      const run = createWorkerRunner(SPIN);
      const controller = new AbortController();
      const result = run(DPA, LIMITS, controller.signal);

      setTimeout(() => controller.abort(), 100);

      await expect(result).rejects.toMatchObject({ reason: "aborted" });
    });

    it("does not start when the caller has given up", async () => {
      const run = createWorkerRunner(SPIN);
      const controller = new AbortController();
      controller.abort();

      await expect(run(DPA, LIMITS, controller.signal)).rejects.toMatchObject({
        reason: "aborted",
      });
    });

    it("fails when the worker leaves without an answer", async () => {
      await expect(createWorkerRunner(EXIT)(DPA, LIMITS)).rejects.toMatchObject({
        reason: "unreadable",
      });
      await expect(createWorkerRunner(NOTHING)(DPA, LIMITS)).rejects.toMatchObject({
        reason: "unreadable",
      });
    });
  });
});
